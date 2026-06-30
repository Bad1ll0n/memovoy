// MemoVoy/Features/Wizard/WizardView.swift
// Wizard de 6 etapas para geração de roteiro com IA.
// Cada etapa valida os seus inputs antes de avançar.
// Estado acumulado em WizardState — imutável entre etapas.

import SwiftUI

// MARK: - WizardState (inputs acumulados)

struct WizardState {
    // Etapa 1: Destino
    var destinationName: String = ""
    var countryCode:     String = "PT"
    var destinationLat:  Double? = nil
    var destinationLng:  Double? = nil

    // Etapa 2: Datas
    var startDate: Date = Date().addingTimeInterval(7 * 86400)
    var endDate:   Date = Date().addingTimeInterval(14 * 86400)

    // Etapa 3: Grupo e transporte
    var groupType:      String   = "solo"
    var groupSize:      Int      = 1
    var transportModes: [String] = ["public"]

    // Etapa 4: Preferências
    var pacePreference:     String  = "moderate"
    var accommodationType:  String? = nil
    var budgetPerDay:        Int?   = nil   // EUR cents

    // Etapa 5: Personalização
    var travelStyles:        [String] = []
    var mustSeeAttractions:  [String] = []
    var avoidCategories:     [String] = []
    var dietaryRestrictions: [String] = []

    // Etapa 6: Visibilidade
    var visibility: String = "public"
    var language:   String = "pt-PT"

    // Validação
    var isStep1Valid: Bool { !destinationName.trimmingCharacters(in: .whitespaces).isEmpty && countryCode.count == 2 }
    var isStep2Valid: Bool { endDate >= startDate }
    var isStep3Valid: Bool { !transportModes.isEmpty }

    // Serializar para o body da API
    var apiBody: [String: Any] {
        let fmt = ISO8601DateFormatter()
        fmt.formatOptions = [.withFullDate]
        var body: [String: Any] = [
            "destination": [
                "name":        destinationName,
                "countryCode": countryCode,
                "lat":         destinationLat as Any,
                "lng":         destinationLng as Any,
            ],
            "startDate":      fmt.string(from: startDate),
            "endDate":        fmt.string(from: endDate),
            "groupType":      groupType,
            "groupSize":      groupSize,
            "transportModes": transportModes,
            "pacePreference": pacePreference,
            "travelStyles":   travelStyles,
            "mustSeeAttractions":  mustSeeAttractions,
            "avoidCategories":     avoidCategories,
            "dietaryRestrictions": dietaryRestrictions,
            "visibility":    visibility,
            "language":      language,
        ]
        if let acc = accommodationType { body["accommodationType"] = acc }
        if let bdg = budgetPerDay      { body["budgetPerDay"]      = bdg }
        return body
    }
}

// MARK: - WizardViewModel

@MainActor
final class WizardViewModel: ObservableObject {
    @Published var state       = WizardState()
    @Published var currentStep = 1
    @Published var isGenerating = false
    @Published var error: String? = nil
    @Published var generatedItinerary: Itinerary? = nil
    @Published var usedFallback = false

    let totalSteps = 6
    private let api = APIClient.shared

    var canGoNext: Bool {
        switch currentStep {
        case 1: return state.isStep1Valid
        case 2: return state.isStep2Valid
        case 3: return state.isStep3Valid
        default: return true
        }
    }

    func next() {
        guard canGoNext, currentStep < totalSteps else { return }
        withAnimation(.easeInOut(duration: 0.25)) { currentStep += 1 }
    }

    func back() {
        guard currentStep > 1 else { return }
        withAnimation(.easeInOut(duration: 0.25)) { currentStep -= 1 }
    }

    func generate() async {
        isGenerating = true; error = nil
        defer { isGenerating = false }
        do {
            struct Resp: Decodable {
                let itinerary: Itinerary
                let meta: Meta
                struct Meta: Decodable { let usedFallback: Bool; let showFallbackWarning: Bool }
            }
            let r: Resp = try await api.request(.init(
                path: "/ai/generate", method: .POST, body: state.apiBody
            ))
            generatedItinerary = r.itinerary
            usedFallback       = r.meta.usedFallback
        } catch let e as APIError { error = e.errorDescription }
          catch { self.error = "Erro na geração. Tenta novamente." }
    }
}

// MARK: - WizardView

struct WizardView: View {
    let onDismiss: () -> Void
    @StateObject private var vm = WizardViewModel()

    var body: some View {
        Group {
            if let itinerary = vm.generatedItinerary {
                // Geração concluída — mostrar o roteiro
                GenerationSuccessView(
                    itinerary:   itinerary,
                    usedFallback: vm.usedFallback,
                    onDismiss:   onDismiss
                )
            } else {
                WizardStepsView(vm: vm, onDismiss: onDismiss)
            }
        }
    }
}

// MARK: - Steps container

struct WizardStepsView: View {
    @ObservedObject var vm: WizardViewModel
    let onDismiss: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            // Progress bar
            WizardProgressBar(current: vm.currentStep, total: vm.totalSteps)
                .padding(.horizontal, 24)
                .padding(.top, 16)

            // Etapa actual
            Group {
                switch vm.currentStep {
                case 1: WizardStep1(state: $vm.state)
                case 2: WizardStep2(state: $vm.state)
                case 3: WizardStep3(state: $vm.state)
                case 4: WizardStep4(state: $vm.state)
                case 5: WizardStep5(state: $vm.state)
                case 6: WizardStep6(state: $vm.state)
                default: EmptyView()
                }
            }
            .transition(.asymmetric(
                insertion:  .move(edge: .trailing).combined(with: .opacity),
                removal:    .move(edge: .leading).combined(with: .opacity)
            ))

            Spacer(minLength: 0)

            // Navegação
            WizardNavigation(vm: vm, onDismiss: onDismiss)
        }
        .navigationTitle("Etapa \(vm.currentStep) de \(vm.totalSteps)")
        .navigationBarTitleDisplayMode(.inline)
    }
}

struct WizardProgressBar: View {
    let current: Int; let total: Int
    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                RoundedRectangle(cornerRadius: 4).fill(Color.secondary.opacity(0.15))
                RoundedRectangle(cornerRadius: 4).fill(Color.memovoyBlue)
                    .frame(width: geo.size.width * CGFloat(current) / CGFloat(total))
                    .animation(.spring(response: 0.4), value: current)
            }
        }
        .frame(height: 6)
    }
}

struct WizardNavigation: View {
    @ObservedObject var vm: WizardViewModel
    let onDismiss: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            if vm.currentStep > 1 {
                Button("Anterior") { vm.back() }
                    .buttonStyle(.bordered)
                    .tint(.secondary)
            } else {
                Button("Cancelar") { onDismiss() }
                    .buttonStyle(.bordered)
                    .tint(.secondary)
            }

            Spacer()

            if vm.currentStep == vm.totalSteps {
                Button {
                    Task { await vm.generate() }
                } label: {
                    if vm.isGenerating {
                        HStack { ProgressView().tint(.white); Text("A gerar…") }
                    } else {
                        Label("Gerar com IA", systemImage: "sparkles")
                    }
                }
                .buttonStyle(.borderedProminent)
                .tint(.memovoyBlue)
                .disabled(vm.isGenerating)
            } else {
                Button("Próximo") { vm.next() }
                    .buttonStyle(.borderedProminent)
                    .tint(.memovoyBlue)
                    .disabled(!vm.canGoNext)
            }
        }
        .padding(.horizontal, 24)
        .padding(.vertical, 20)
        .background(Color(.systemBackground).shadow(.drop(color: .black.opacity(0.06), radius: 8, y: -2)))
    }
}

// MARK: - Etapa 1: Destino

struct WizardStep1: View {
    @Binding var state: WizardState

    let popularCountries = [
        ("🇵🇹", "Portugal",  "PT"), ("🇧🇷", "Brasil",    "BR"),
        ("🇯🇵", "Japão",     "JP"), ("🇮🇹", "Itália",    "IT"),
        ("🇫🇷", "França",    "FR"), ("🇪🇸", "Espanha",   "ES"),
        ("🇹🇭", "Tailândia", "TH"), ("🇺🇸", "EUA",       "US"),
        ("🇬🇷", "Grécia",    "GR"), ("🇲🇽", "México",    "MX"),
    ]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                WizardStepHeader(
                    icon:     "mappin.circle.fill",
                    title:    "Para onde vais?",
                    subtitle: "Escolhe o teu destino de viagem."
                )

                MemoVoyTextField(
                    label:       "Cidade ou região",
                    placeholder: "Ex: Tokyo, Bali, Lisboa…",
                    text:        $state.destinationName
                )

                Text("Destinos populares")
                    .font(.subheadline).fontWeight(.semibold)

                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
                    ForEach(popularCountries, id: \.2) { flag, name, code in
                        Button {
                            state.countryCode = code
                            if state.destinationName.isEmpty { state.destinationName = name }
                        } label: {
                            HStack {
                                Text(flag).font(.title3)
                                Text(name).font(.subheadline)
                                Spacer()
                                if state.countryCode == code {
                                    Image(systemName: "checkmark").foregroundStyle(.memovoyBlue)
                                }
                            }
                            .padding(12)
                            .background(state.countryCode == code
                                        ? Color.memovoyBlue.opacity(0.08)
                                        : Color.secondary.opacity(0.06))
                            .clipShape(RoundedRectangle(cornerRadius: 10))
                            .overlay(
                                RoundedRectangle(cornerRadius: 10)
                                    .stroke(state.countryCode == code ? Color.memovoyBlue : Color.clear, lineWidth: 1.5)
                            )
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            .padding(24)
        }
    }
}

// MARK: - Etapa 2: Datas

struct WizardStep2: View {
    @Binding var state: WizardState

    private var duration: Int {
        Calendar.current.dateComponents([.day], from: state.startDate, to: state.endDate).day.map { $0 + 1 } ?? 1
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                WizardStepHeader(
                    icon:     "calendar",
                    title:    "Quando viajas?",
                    subtitle: "Selecciona as datas de partida e regresso."
                )

                VStack(spacing: 16) {
                    DatePicker("Partida", selection: $state.startDate,
                               in: Date()..., displayedComponents: .date)
                        .datePickerStyle(.compact)
                        .padding(14)
                        .background(Color.secondary.opacity(0.06))
                        .clipShape(RoundedRectangle(cornerRadius: 12))

                    DatePicker("Regresso", selection: $state.endDate,
                               in: state.startDate..., displayedComponents: .date)
                        .datePickerStyle(.compact)
                        .padding(14)
                        .background(Color.secondary.opacity(0.06))
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                }

                // Duração calculada
                HStack {
                    Image(systemName: "moon.stars")
                        .foregroundStyle(.memovoyBlue)
                    Text("\(duration) \(duration == 1 ? "dia" : "dias") de viagem")
                        .font(.headline)
                }
                .padding(14)
                .background(Color.memovoyBlue.opacity(0.06))
                .clipShape(RoundedRectangle(cornerRadius: 12))

                if duration > 21 {
                    Label("Máximo 21 dias por roteiro com IA.", systemImage: "exclamationmark.triangle")
                        .font(.caption).foregroundStyle(.orange)
                }
            }
            .padding(24)
        }
    }
}

// MARK: - Etapa 3: Grupo e transporte

struct WizardStep3: View {
    @Binding var state: WizardState

    let groupTypes = [
        ("Solo", "person", "solo"),
        ("Casal", "person.2", "couple"),
        ("Amigos", "person.3", "friends"),
        ("Família", "figure.2.and.child.holdinghands", "family"),
    ]
    let transports = [
        ("🚶", "A pé", "walking"),
        ("🚌", "Transportes públicos", "public"),
        ("🚗", "Carro", "car"),
        ("🚲", "Bicicleta", "bicycle"),
        ("🚕", "Táxi / Ride-share", "taxi"),
        ("🗺", "Tour organizado", "tour"),
    ]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                WizardStepHeader(
                    icon:     "person.2.fill",
                    title:    "Com quem viajas?",
                    subtitle: "Escolhe o tipo de grupo e os meios de transporte."
                )

                // Grupo
                Text("Tipo de grupo").font(.subheadline).fontWeight(.semibold)
                HStack(spacing: 10) {
                    ForEach(groupTypes, id: \.2) { label, icon, type in
                        Button {
                            state.groupType = type
                            if type == "solo" { state.groupSize = 1 }
                        } label: {
                            VStack(spacing: 6) {
                                Image(systemName: icon).font(.title2)
                                Text(label).font(.caption)
                            }
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 14)
                            .background(state.groupType == type
                                        ? Color.memovoyBlue.opacity(0.1)
                                        : Color.secondary.opacity(0.06))
                            .foregroundStyle(state.groupType == type ? .memovoyBlue : .primary)
                            .clipShape(RoundedRectangle(cornerRadius: 12))
                            .overlay(RoundedRectangle(cornerRadius: 12)
                                .stroke(state.groupType == type ? Color.memovoyBlue : Color.clear, lineWidth: 1.5))
                        }
                        .buttonStyle(.plain)
                    }
                }

                // Tamanho do grupo (excluindo solo)
                if state.groupType != "solo" {
                    Stepper("Tamanho: \(state.groupSize) pessoas",
                            value: $state.groupSize, in: 2...20)
                        .padding(14)
                        .background(Color.secondary.opacity(0.06))
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                }

                // Transporte
                Text("Meios de transporte").font(.subheadline).fontWeight(.semibold)
                Text("Selecciona todos os que vais usar").font(.caption).foregroundStyle(.secondary)

                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
                    ForEach(transports, id: \.2) { icon, label, mode in
                        let isSelected = state.transportModes.contains(mode)
                        Button {
                            if isSelected {
                                state.transportModes.removeAll { $0 == mode }
                            } else {
                                state.transportModes.append(mode)
                            }
                        } label: {
                            HStack {
                                Text(icon)
                                Text(label).font(.subheadline)
                                Spacer()
                                if isSelected {
                                    Image(systemName: "checkmark.circle.fill")
                                        .foregroundStyle(.memovoyBlue)
                                }
                            }
                            .padding(12)
                            .background(isSelected ? Color.memovoyBlue.opacity(0.08) : Color.secondary.opacity(0.06))
                            .clipShape(RoundedRectangle(cornerRadius: 10))
                            .overlay(RoundedRectangle(cornerRadius: 10)
                                .stroke(isSelected ? Color.memovoyBlue : Color.clear, lineWidth: 1.5))
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            .padding(24)
        }
    }
}

// MARK: - Etapas 4, 5, 6 (condensadas)

struct WizardStep4: View {
    @Binding var state: WizardState
    let paces = [("Relaxado", "tortoise", "relaxed"), ("Moderado", "figure.walk", "moderate"), ("Intensivo", "hare", "intensive")]
    let accomTypes = [("Hotel", "hotel"), ("Airbnb", "airbnb"), ("Hostel", "hostel"), ("Boutique", "boutique")]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                WizardStepHeader(icon: "slider.horizontal.3", title: "Ritmo e alojamento", subtitle: "Como preferes organizar o teu dia?")

                Text("Ritmo da viagem").font(.subheadline).fontWeight(.semibold)
                HStack(spacing: 10) {
                    ForEach(paces, id: \.2) { label, icon, pace in
                        Button { state.pacePreference = pace } label: {
                            VStack(spacing: 6) {
                                Image(systemName: icon).font(.title2)
                                Text(label).font(.caption)
                            }
                            .frame(maxWidth: .infinity).padding(.vertical, 14)
                            .background(state.pacePreference == pace ? Color.memovoyBlue.opacity(0.1) : Color.secondary.opacity(0.06))
                            .foregroundStyle(state.pacePreference == pace ? .memovoyBlue : .primary)
                            .clipShape(RoundedRectangle(cornerRadius: 12))
                            .overlay(RoundedRectangle(cornerRadius: 12).stroke(state.pacePreference == pace ? Color.memovoyBlue : Color.clear, lineWidth: 1.5))
                        }.buttonStyle(.plain)
                    }
                }

                Text("Tipo de alojamento (opcional)").font(.subheadline).fontWeight(.semibold)
                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
                    ForEach(accomTypes, id: \.1) { label, type in
                        Button { state.accommodationType = state.accommodationType == type ? nil : type } label: {
                            Text(label).font(.subheadline).frame(maxWidth: .infinity).padding(12)
                                .background(state.accommodationType == type ? Color.memovoyBlue.opacity(0.1) : Color.secondary.opacity(0.06))
                                .foregroundStyle(state.accommodationType == type ? .memovoyBlue : .primary)
                                .clipShape(RoundedRectangle(cornerRadius: 10))
                        }.buttonStyle(.plain)
                    }
                }

                // Orçamento
                VStack(alignment: .leading, spacing: 8) {
                    Text("Orçamento por dia (€)").font(.subheadline).fontWeight(.semibold)
                    TextField("Ex: 100", value: $state.budgetPerDay,
                              format: .number)
                        .keyboardType(.numberPad)
                        .padding(14).background(Color.secondary.opacity(0.06))
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                }
            }.padding(24)
        }
    }
}

struct WizardStep5: View {
    @Binding var state: WizardState
    @State private var newAttraction = ""
    let styles = ["Cultura", "Gastronomia", "Aventura", "Natureza", "Praias", "Museus", "Compras", "Nightlife"]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                WizardStepHeader(icon: "heart.fill", title: "O que adoras?", subtitle: "Personaliza o teu roteiro.")

                Text("Estilo de viagem").font(.subheadline).fontWeight(.semibold)
                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 8) {
                    ForEach(styles, id: \.self) { style in
                        let s = style.lowercased()
                        let sel = state.travelStyles.contains(s)
                        Button { if sel { state.travelStyles.removeAll { $0 == s } } else { state.travelStyles.append(s) } } label: {
                            Text(style).font(.subheadline).frame(maxWidth: .infinity).padding(10)
                                .background(sel ? Color.memovoyBlue.opacity(0.1) : Color.secondary.opacity(0.06))
                                .foregroundStyle(sel ? .memovoyBlue : .primary)
                                .clipShape(RoundedRectangle(cornerRadius: 10))
                        }.buttonStyle(.plain)
                    }
                }

                VStack(alignment: .leading, spacing: 8) {
                    Text("Obrigatório visitar (máx. 5)").font(.subheadline).fontWeight(.semibold)
                    HStack {
                        TextField("Ex: Torre Eiffel", text: $newAttraction)
                            .textInputAutocapitalization(.sentences)
                        Button("Adicionar") {
                            let a = newAttraction.trimmingCharacters(in: .whitespaces)
                            if !a.isEmpty && state.mustSeeAttractions.count < 5 {
                                state.mustSeeAttractions.append(a); newAttraction = ""
                            }
                        }.disabled(newAttraction.isEmpty)
                    }
                    .padding(12).background(Color.secondary.opacity(0.06)).clipShape(RoundedRectangle(cornerRadius: 12))

                    ForEach(state.mustSeeAttractions, id: \.self) { attr in
                        HStack {
                            Text(attr).font(.subheadline)
                            Spacer()
                            Button { state.mustSeeAttractions.removeAll { $0 == attr } } label: {
                                Image(systemName: "xmark.circle.fill").foregroundStyle(.secondary)
                            }
                        }
                        .padding(.horizontal, 12).padding(.vertical, 6)
                        .background(Color.memovoyBlue.opacity(0.06)).clipShape(RoundedRectangle(cornerRadius: 8))
                    }
                }
            }.padding(24)
        }
    }
}

struct WizardStep6: View {
    @Binding var state: WizardState

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                WizardStepHeader(icon: "checkmark.circle.fill", title: "Resumo final", subtitle: "Revê e escolhe a visibilidade do roteiro.")

                // Resumo
                VStack(alignment: .leading, spacing: 12) {
                    SummaryRow(icon: "mappin", label: "Destino", value: "\(state.destinationName) (\(state.countryCode))")
                    SummaryRow(icon: "calendar", label: "Datas", value: "\(formatDate(state.startDate)) → \(formatDate(state.endDate))")
                    SummaryRow(icon: "person.2", label: "Grupo", value: "\(state.groupType.capitalized) · \(state.groupSize) pessoa(s)")
                    SummaryRow(icon: "figure.walk", label: "Ritmo", value: state.pacePreference.capitalized)
                    if !state.travelStyles.isEmpty {
                        SummaryRow(icon: "heart", label: "Estilos", value: state.travelStyles.joined(separator: ", "))
                    }
                }
                .padding(16).background(Color.secondary.opacity(0.06)).clipShape(RoundedRectangle(cornerRadius: 14))

                // Visibilidade
                Text("Visibilidade").font(.subheadline).fontWeight(.semibold)
                Picker("", selection: $state.visibility) {
                    Text("Público").tag("public")
                    Text("Seguidores").tag("followers")
                    Text("Privado").tag("private")
                }
                .pickerStyle(.segmented)

                Text("Pronto! A IA vai criar um roteiro personalizado baseado nas tuas preferências.")
                    .font(.subheadline).foregroundStyle(.secondary)
                    .padding(14).background(Color.memovoyBlue.opacity(0.06)).clipShape(RoundedRectangle(cornerRadius: 12))
            }.padding(24)
        }
    }

    private func formatDate(_ d: Date) -> String {
        let f = DateFormatter(); f.dateStyle = .short; f.locale = Locale(identifier: "pt_PT")
        return f.string(from: d)
    }
}

struct SummaryRow: View {
    let icon: String; let label: String; let value: String
    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: icon).foregroundStyle(.memovoyBlue).frame(width: 20)
            Text(label).font(.subheadline).foregroundStyle(.secondary).frame(width: 80, alignment: .leading)
            Text(value).font(.subheadline).fontWeight(.medium)
        }
    }
}

// MARK: - Geração concluída

struct GenerationSuccessView: View {
    let itinerary: Itinerary
    let usedFallback: Bool
    let onDismiss: () -> Void

    var body: some View {
        VStack(spacing: 24) {
            Spacer()
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 72))
                .foregroundStyle(.memovoyBlue)

            VStack(spacing: 8) {
                Text("Roteiro criado!").font(.title).fontWeight(.bold)
                Text(itinerary.title).font(.headline).foregroundStyle(.secondary)

                if usedFallback {
                    Label("Gerado a partir de uma viagem semelhante. Verifica as datas.",
                          systemImage: "exclamationmark.triangle")
                        .font(.caption).foregroundStyle(.orange)
                        .padding(10)
                        .background(Color.orange.opacity(0.08))
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                }
            }
            Spacer()

            VStack(spacing: 12) {
                NavigationLink(destination: ItineraryDetailView(itineraryId: itinerary.id)) {
                    Text("Ver roteiro").frame(maxWidth: .infinity).padding(.vertical, 16)
                        .background(Color.memovoyBlue).foregroundStyle(.white)
                        .clipShape(RoundedRectangle(cornerRadius: 14))
                }
                Button("Fechar", action: onDismiss)
                    .foregroundStyle(.secondary)
            }
            .padding(.horizontal, 24).padding(.bottom, 40)
        }
        .navigationTitle("Roteiro gerado")
        .navigationBarTitleDisplayMode(.inline)
    }
}

// MARK: - Wizard step header

struct WizardStepHeader: View {
    let icon: String; let title: String; let subtitle: String
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Image(systemName: icon).font(.system(size: 36)).foregroundStyle(.memovoyBlue)
            Text(title).font(.title2).fontWeight(.bold)
            Text(subtitle).font(.subheadline).foregroundStyle(.secondary)
        }
    }
}
