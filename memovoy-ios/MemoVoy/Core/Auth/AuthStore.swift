// MemoVoy/Core/Auth/AuthStore.swift
// Observable store de autenticação — partilhado via @EnvironmentObject.
// @MainActor garante que mutações de estado ocorrem na main thread
// para que SwiftUI actualize a UI sem erros de concorrência.

import SwiftUI

@MainActor
final class AuthStore: ObservableObject {

    @Published var currentUser:     UserSession?  = nil
    @Published var isAuthenticated: Bool          = false
    @Published var isLoading:       Bool          = false
    @Published var error:           String?       = nil

    private let api = APIClient.shared

    init() {
        // Restaurar sessão se houver token no Keychain
        Task { await restoreSession() }
    }

    // MARK: - Register

    func register(
        email:       String,
        password:    String,
        username:    String,
        countryCode: String,
        language:    String
    ) async {
        isLoading = true
        error     = nil
        defer { isLoading = false }

        do {
            let response: AuthResponse = try await api.request(.init(
                path:   "/auth/register",
                method: .POST,
                body:   [
                    "email":       email,
                    "password":    password,
                    "username":    username,
                    "countryCode": countryCode,
                    "language":    language,
                ]
            ))
            await applyAuthResponse(response)
        } catch let apiError as APIError {
            error = apiError.errorDescription
        } catch {
            self.error = "Erro inesperado. Tenta novamente."
        }
    }

    // MARK: - Login

    func login(email: String, password: String) async {
        isLoading = true
        error     = nil
        defer { isLoading = false }

        do {
            let response: AuthResponse = try await api.request(.init(
                path:   "/auth/login",
                method: .POST,
                body:   ["email": email, "password": password]
            ))
            await applyAuthResponse(response)

            // Pedir permissão para push após login bem-sucedido
            await requestPushPermission()
        } catch let apiError as APIError {
            error = apiError.errorDescription
        } catch {
            self.error = "Erro inesperado. Tenta novamente."
        }
    }

    // MARK: - Logout

    func logout() async {
        isLoading = true
        defer { isLoading = false }

        // Best-effort: revogar sessão na API (falha silenciosa — Keychain limpo de qualquer forma)
        try? await api.requestVoid(.init(path: "/auth/logout", method: .POST))

        await TokenStore.shared.clear()
        currentUser     = nil
        isAuthenticated = false
    }

    // MARK: - Push token

    func registerPushToken(_ token: String) async throws {
        guard isAuthenticated else { return }
        try await api.requestVoid(.init(
            path:   "/notifications/devices",
            method: .POST,
            body:   [
                "deviceId":   await DeviceInfo.id,
                "platform":   "ios",
                "pushToken":  token,
                "deviceName": await DeviceInfo.name,
            ]
        ))
    }

    // MARK: - Private helpers

    private func restoreSession() async {
        let tokenStore = TokenStore.shared
        guard await tokenStore.isLoggedIn else { return }

        // Tentar buscar o perfil actual com o token existente
        do {
            let response: MeResponse = try await api.request(.init(
                path:   "/users/me",
                method: .GET
            ))
            currentUser     = UserSession(from: response.user)
            isAuthenticated = true
        } catch APIError.unauthorized {
            // Token expirado e refresh falhou — limpar
            await TokenStore.shared.clear()
        } catch {
            // Erro de rede — manter estado offline (não deslogar)
            if await tokenStore.userId != nil {
                isAuthenticated = true
            }
        }
    }

    private func applyAuthResponse(_ response: AuthResponse) async {
        await TokenStore.shared.setAccessToken(response.accessToken)
        await TokenStore.shared.setUserId(response.user.id)
        currentUser     = UserSession(from: response.user)
        isAuthenticated = true
    }

    private func requestPushPermission() async {
        let center = UNUserNotificationCenter.current()
        let settings = await center.notificationSettings()
        guard settings.authorizationStatus == .notDetermined else { return }

        let granted = (try? await center.requestAuthorization(options: [.alert, .badge, .sound])) ?? false
        if granted {
            await UIApplication.shared.registerForRemoteNotifications()
        }
    }
}

// MARK: - Response models

struct AuthResponse: Decodable {
    let user:        AuthUser
    let accessToken: String

    struct AuthUser: Decodable {
        let id:          String
        let username:    String
        let role:        String
        let isVerified:  Bool
    }
}

struct MeResponse: Decodable {
    let user: MeUser

    struct MeUser: Decodable {
        let id:          String
        let username:    String
        let role:        String
        let isVerified:  Bool
        let profile:     Profile?

        struct Profile: Decodable {
            let displayName: String
            let avatarUrl:   String?
            let level:       String
            let totalTrips:  Int
        }
    }
}

struct UserSession {
    let id:          String
    let username:    String
    let role:        String
    let isVerified:  Bool
    let displayName: String
    let avatarUrl:   String?
    let level:       String
    let totalTrips:  Int

    init(from user: AuthResponse.AuthUser) {
        self.id          = user.id
        self.username    = user.username
        self.role        = user.role
        self.isVerified  = user.isVerified
        self.displayName = user.username
        self.avatarUrl   = nil
        self.level       = "explorer"
        self.totalTrips  = 0
    }

    init(from user: MeResponse.MeUser) {
        self.id          = user.id
        self.username    = user.username
        self.role        = user.role
        self.isVerified  = user.isVerified
        self.displayName = user.profile?.displayName ?? user.username
        self.avatarUrl   = user.profile?.avatarUrl
        self.level       = user.profile?.level ?? "explorer"
        self.totalTrips  = user.profile?.totalTrips ?? 0
    }
}
