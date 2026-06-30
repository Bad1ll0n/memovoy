// MemoVoy/App/RootView.swift
// Ecrã raiz — decide entre AuthFlow e MainTabView baseado em isAuthenticated.
// Transição animada suave entre os dois estados.

import SwiftUI

struct RootView: View {
    @EnvironmentObject private var authStore: AuthStore

    var body: some View {
        Group {
            if authStore.isAuthenticated {
                MainTabView()
                    .transition(.opacity.animation(.easeInOut(duration: 0.3)))
            } else {
                AuthFlowView()
                    .transition(.opacity.animation(.easeInOut(duration: 0.3)))
            }
        }
        .animation(.easeInOut(duration: 0.3), value: authStore.isAuthenticated)
    }
}

// MARK: - MainTabView

struct MainTabView: View {
    @EnvironmentObject private var authStore:       AuthStore
    @EnvironmentObject private var notificationHub: NotificationHub
    @State private var selectedTab: Tab = .feed

    enum Tab: Int, CaseIterable {
        case feed, explore, search, create, notifications, profile

        var icon:          String { ["house", "magnifyingglass", "magnifyingglass.circle", "plus.circle.fill", "bell", "person"][rawValue] }
        var selectedIcon:  String { ["house.fill", "magnifyingglass", "magnifyingglass.circle.fill", "plus.circle.fill", "bell.fill", "person.fill"][rawValue] }
        var label:         String { ["Feed", "Explorar", "Pesquisar", "", "Notificações", "Perfil"][rawValue] }
    }

    var body: some View {
        TabView(selection: $selectedTab) {
            FeedView()
                .tabItem { Label(Tab.feed.label,          systemImage: icon(for: .feed)) }
                .tag(Tab.feed)

            DiscoveryView()
                .tabItem { Label(Tab.explore.label,       systemImage: icon(for: .explore)) }
                .tag(Tab.explore)

            SearchView()
                .tabItem { Label(Tab.search.label,        systemImage: icon(for: .search)) }
                .tag(Tab.search)

            // Tab de criar — abre sheet em vez de navegar
            Color.clear
                .tabItem { Label("", systemImage: icon(for: .create)) }
                .tag(Tab.create)

            NotificationsView()
                .tabItem { Label(Tab.notifications.label, systemImage: icon(for: .notifications)) }
                .badge(notificationHub.unreadCount > 0 ? notificationHub.unreadCount : nil)
                .tag(Tab.notifications)

            ProfileView(userId: authStore.currentUser?.id ?? "")
                .tabItem { Label(Tab.profile.label,       systemImage: icon(for: .profile)) }
                .tag(Tab.profile)
        }
        .sheet(isPresented: Binding(
            get:  { selectedTab == .create },
            set:  { if !$0 { selectedTab = .feed } }
        )) {
            CreateItinerarySheet()
        }
        .onChange(of: selectedTab) { tab in
            // Interceptar tab de criar antes de navegar
            if tab == .create { } // sheet abre pelo binding acima
        }
        .tint(.memovoyBlue)
    }

    private func icon(for tab: Tab) -> String {
        selectedTab == tab ? tab.selectedIcon : tab.icon
    }
}
