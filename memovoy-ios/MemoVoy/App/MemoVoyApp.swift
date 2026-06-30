// MemoVoy/App/MemoVoyApp.swift
// Entry point da aplicação iOS.
// Responsável por: injecção de dependências, deep links, push notifications.

import SwiftUI
import UserNotifications

@main
struct MemoVoyApp: App {

    // StateObject no nível raiz — persiste durante todo o ciclo de vida da app
    @StateObject private var authStore       = AuthStore()
    @StateObject private var notificationHub = NotificationHub()

    // AppDelegate para registar push notifications
    @UIApplicationDelegateAdaptor(AppDelegate.self) var appDelegate

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(authStore)
                .environmentObject(notificationHub)
                // Passar authStore ao AppDelegate para processar tokens push
                .onAppear { appDelegate.authStore = authStore }
                // Deep links (universal links e URL schemes)
                .onOpenURL { url in handleDeepLink(url) }
        }
    }

    private func handleDeepLink(_ url: URL) {
        // Formato: memovoy://itineraries/{id}
        //          memovoy://profiles/{username}
        //          https://memovoy.com/i/{id}
        DeepLinkHandler.handle(url, authStore: authStore)
    }
}

// MARK: - AppDelegate
// Necessário para registar APNs e processar tokens push

final class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {

    // Injectado pelo onAppear da RootView
    var authStore: AuthStore?

    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
    ) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        return true
    }

    func application(
        _ application: UIApplication,
        didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
    ) {
        let tokenString = deviceToken.map { String(format: "%02.2hhx", $0) }.joined()
        // Registar token na API em background — não bloquear arranque
        Task {
            try? await authStore?.registerPushToken(tokenString)
        }
    }

    func application(
        _ application: UIApplication,
        didFailToRegisterForRemoteNotificationsWithError error: Error
    ) {
        // Log mas não crashar — push notifications são opcionais
        print("[Push] Falha ao registar APNs: \(error.localizedDescription)")
    }

    // Notificação recebida com app em foreground
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        completionHandler([.banner, .badge, .sound])
    }

    // Utilizador tocou numa notificação
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        let userInfo = response.notification.request.content.userInfo
        if let data = userInfo["data"] as? [String: Any] {
            DeepLinkHandler.handleNotification(data, authStore: authStore)
        }
        completionHandler()
    }
}
