// MemoVoy/Features/Auth/AuthFlowView.swift
// Fluxo de autenticação: landing → login ou registo.

import SwiftUI

// MARK: - AuthFlowView (coordenador)

struct AuthFlowView: View {
    @State private var path = NavigationPath()

    enum Destination: Hashable {
        case login
        case register
    }

    var body: some View {
        NavigationStack(path: $path) {
            LandingView(onLogin: { path.append(Destination.login) },
                        onRegister: { path.append(Destination.register) })
                .navigationDestination(for: Destination.self) { dest in
                    switch dest {
                    case .login:    LoginView()
                    case .register: RegisterView()
                    }
                }
        }
    }
}

// MARK: - LandingView

struct LandingView: View {
    let onLogin:    () -> Void
    let onRegister: () -> Void

    var body: some View {
        ZStack {
            // Fundo gradiente
            LinearGradient(
                colors: [Color.memovoyBlue.opacity(0.8), Color.memovoyBlue],
                startPoint: .top, endPoint: .bottom
            )
            .ignoresSafeArea()

            VStack(spacing: 0) {
                Spacer()

                // Logo e tagline
                VStack(spacing: 16) {
                    Image(systemName: "globe.europe.africa.fill")
                        .font(.system(size: 72))
                        .foregroundStyle(.white)

                    Text("MemoVoy")
                        .font(.system(size: 42, weight: .bold, design: .rounded))
                        .foregroundStyle(.white)

                    Text("A tua rede social de viagens")
                        .font(.title3)
                        .foregroundStyle(.white.opacity(0.85))
                }

                Spacer()

                // CTAs
                VStack(spacing: 12) {
                    Button(action: onRegister) {
                        Text("Começar — é grátis")
                            .font(.headline)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 16)
                            .background(.white)
                            .foregroundStyle(.memovoyBlue)
                            .clipShape(RoundedRectangle(cornerRadius: 14))
                    }

                    Button(action: onLogin) {
                        Text("Já tenho conta")
                            .font(.headline)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 16)
                            .background(.white.opacity(0.15))
                            .foregroundStyle(.white)
                            .clipShape(RoundedRectangle(cornerRadius: 14))
                            .overlay(
                                RoundedRectangle(cornerRadius: 14)
                                    .stroke(.white.opacity(0.4), lineWidth: 1)
                            )
                    }
                }
                .padding(.horizontal, 24)
                .padding(.bottom, 48)
            }
        }
        .navigationBarHidden(true)
    }
}

// MARK: - LoginView

struct LoginView: View {
    @EnvironmentObject private var authStore: AuthStore

    @State private var email    = ""
    @State private var password = ""
    @State private var showPassword = false
    @FocusState private var focusedField: Field?

    enum Field { case email, password }

    var body: some View {
        ScrollView {
            VStack(spacing: 32) {
                // Header
                VStack(spacing: 8) {
                    Text("Bem-vindo de volta")
                        .font(.largeTitle).fontWeight(.bold)
                    Text("Inicia sessão para continuares a tua aventura")
                        .font(.subheadline).foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                }
                .padding(.top, 40)

                // Campos
                VStack(spacing: 16) {
                    MemoVoyTextField(
                        label:       "Email",
                        placeholder: "o.teu@email.com",
                        text:        $email,
                        keyboardType: .emailAddress,
                        autocapitalization: .never
                    )
                    .focused($focusedField, equals: .email)
                    .submitLabel(.next)
                    .onSubmit { focusedField = .password }

                    PasswordField(text: $password, showPassword: $showPassword)
                        .focused($focusedField, equals: .password)
                        .submitLabel(.done)
                        .onSubmit { Task { await login() } }
                }

                // Erro
                if let error = authStore.error {
                    HStack {
                        Image(systemName: "exclamationmark.circle")
                        Text(error)
                            .font(.subheadline)
                    }
                    .foregroundStyle(.red)
                    .padding(12)
                    .background(Color.red.opacity(0.1))
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                }

                // CTA
                PrimaryButton(
                    title:     "Entrar",
                    isLoading: authStore.isLoading,
                    isEnabled: !email.isEmpty && password.count >= 8
                ) {
                    Task { await login() }
                }
            }
            .padding(.horizontal, 24)
            .padding(.bottom, 40)
        }
        .navigationTitle("Entrar")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func login() async {
        focusedField = nil
        await authStore.login(email: email.lowercased().trimmingCharacters(in: .whitespaces),
                               password: password)
    }
}

// MARK: - RegisterView

struct RegisterView: View {
    @EnvironmentObject private var authStore: AuthStore

    @State private var email       = ""
    @State private var username    = ""
    @State private var password    = ""
    @State private var countryCode = Locale.current.region?.identifier ?? "PT"
    @State private var showPassword = false
    @State private var acceptedTerms = false
    @FocusState private var focusedField: Field?

    enum Field { case email, username, password }

    // Validação inline
    private var usernameError: String? {
        guard !username.isEmpty else { return nil }
        if username.count < 3 { return "Mínimo 3 caracteres" }
        if username.count > 30 { return "Máximo 30 caracteres" }
        let valid = CharacterSet(charactersIn: "abcdefghijklmnopqrstuvwxyz0123456789_")
        if username.unicodeScalars.contains(where: { !valid.contains($0) }) {
            return "Apenas letras minúsculas, números e _"
        }
        return nil
    }

    private var passwordStrength: PasswordStrength {
        PasswordStrength.evaluate(password)
    }

    private var canSubmit: Bool {
        !email.isEmpty &&
        username.count >= 3 &&
        usernameError == nil &&
        passwordStrength.isAcceptable &&
        acceptedTerms
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 28) {
                VStack(spacing: 8) {
                    Text("Cria a tua conta")
                        .font(.largeTitle).fontWeight(.bold)
                    Text("Junta-te à comunidade de viajantes")
                        .font(.subheadline).foregroundStyle(.secondary)
                }
                .padding(.top, 40)

                VStack(spacing: 16) {
                    MemoVoyTextField(
                        label:       "Email",
                        placeholder: "o.teu@email.com",
                        text:        $email,
                        keyboardType: .emailAddress,
                        autocapitalization: .never
                    )
                    .focused($focusedField, equals: .email)
                    .submitLabel(.next)
                    .onSubmit { focusedField = .username }

                    VStack(alignment: .leading, spacing: 4) {
                        MemoVoyTextField(
                            label:       "Username",
                            placeholder: "o_teu_username",
                            text:        Binding(
                                get:  { username },
                                set:  { username = $0.lowercased() }
                            ),
                            autocapitalization: .never
                        )
                        .focused($focusedField, equals: .username)
                        .submitLabel(.next)
                        .onSubmit { focusedField = .password }

                        if let err = usernameError {
                            Text(err)
                                .font(.caption).foregroundStyle(.red)
                        }
                    }

                    VStack(alignment: .leading, spacing: 6) {
                        PasswordField(text: $password, showPassword: $showPassword)
                            .focused($focusedField, equals: .password)

                        PasswordStrengthIndicator(strength: passwordStrength)
                    }

                    // País
                    Picker("País", selection: $countryCode) {
                        Text("🇵🇹 Portugal").tag("PT")
                        Text("🇧🇷 Brasil").tag("BR")
                        Text("🇪🇸 Espanha").tag("ES")
                        Text("🇫🇷 França").tag("FR")
                        Text("🇩🇪 Alemanha").tag("DE")
                        Text("🇬🇧 Reino Unido").tag("GB")
                        Text("🇺🇸 EUA").tag("US")
                        Text("Outro").tag("XX")
                    }
                    .pickerStyle(.menu)
                    .padding(12)
                    .background(Color.secondary.opacity(0.08))
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                }

                // Termos
                Toggle(isOn: $acceptedTerms) {
                    Text("Aceito os [Termos de Serviço](https://memovoy.com/terms) e a [Política de Privacidade](https://memovoy.com/privacy)")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                .tint(.memovoyBlue)

                if let error = authStore.error {
                    HStack {
                        Image(systemName: "exclamationmark.circle")
                        Text(error).font(.subheadline)
                    }
                    .foregroundStyle(.red)
                    .padding(12)
                    .background(Color.red.opacity(0.1))
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                }

                PrimaryButton(
                    title:     "Criar conta",
                    isLoading: authStore.isLoading,
                    isEnabled: canSubmit
                ) {
                    Task { await register() }
                }
            }
            .padding(.horizontal, 24)
            .padding(.bottom, 40)
        }
        .navigationTitle("Criar conta")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func register() async {
        focusedField = nil
        await authStore.register(
            email:       email.lowercased().trimmingCharacters(in: .whitespaces),
            password:    password,
            username:    username,
            countryCode: countryCode,
            language:    Locale.current.language.languageCode?.identifier ?? "pt"
        )
    }
}

// MARK: - Password strength

struct PasswordStrength {
    let score:    Int  // 0-4
    let label:    String
    let color:    Color

    var isAcceptable: Bool { score >= 2 }

    static func evaluate(_ password: String) -> PasswordStrength {
        var score = 0
        if password.count >= 8             { score += 1 }
        if password.count >= 12            { score += 1 }
        if password.rangeOfCharacter(from: .uppercaseLetters) != nil { score += 1 }
        if password.rangeOfCharacter(from: .decimalDigits) != nil    { score += 1 }

        let labels = ["Muito fraca", "Fraca", "Razoável", "Boa", "Excelente"]
        let colors: [Color] = [.red, .orange, .yellow, .green, .green]
        return PasswordStrength(score: score, label: labels[score], color: colors[score])
    }
}

struct PasswordStrengthIndicator: View {
    let strength: PasswordStrength

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 4) {
                ForEach(0..<4, id: \.self) { i in
                    RoundedRectangle(cornerRadius: 2)
                        .fill(i < strength.score ? strength.color : Color.secondary.opacity(0.2))
                        .frame(height: 4)
                }
            }
            Text(strength.label)
                .font(.caption).foregroundStyle(strength.color)
        }
    }
}
