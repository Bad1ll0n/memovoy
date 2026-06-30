// MemoVoy/Features/Profile/ProfileView.swift
// Ecrã de perfil — funciona para o próprio utilizador e para perfis públicos.

import SwiftUI

// MARK: - ViewModel

@MainActor
final class ProfileViewModel: ObservableObject {
    @Published var profile:         UserProfile?           = nil
    @Published var gamification:    GamificationProfile?   = nil
    @Published var posts:           [Post]                 = []
    @Published var isLoading        = false
    @Published var isFollowLoading  = false
    @Published var error: String?   = nil

    let userId: String
    private let api = APIClient.shared

    init(userId: String) { self.userId = userId }

    func load() async {
        isLoading = true; error = nil
        defer { isLoading = false }

        await withTaskGroup(of: Void.self) { group in
            group.addTask { await self.loadProfile() }
            group.addTask { await self.loadGamification() }
            group.addTask { await self.loadPosts() }
        }
    }

    private func loadProfile() async {
        do {
            struct Resp: Decodable { let user: UserProfile }
            let r: Resp = try await api.request(.init(path: "/users/\(userId)", method: .GET))
            profile = r.user
        } catch let e as APIError { error = e.errorDescription }
    }

    private func loadGamification() async {
        do {
            let r: GamificationProfile = try await api.request(
                .init(path: "/gamification/profile/\(userId)", method: .GET)
            )
            gamification = r
        } catch { /* gamification é secundária — falha silenciosa */ }
    }

    private func loadPosts() async {
        do {
            struct Resp: Decodable { let items: [Post]; let hasMore: Bool }
            let r: Resp = try await api.request(.init(
                path: "/feed/users/\(userId)", method: .GET, queryParams: ["limit": 20]
            ))
            posts = r.items
        } catch { /* posts falham silenciosamente se perfil privado */ }
    }

    func toggleFollow() async {
        guard let p = profile else { return }
        isFollowLoading = true
        defer { isFollowLoading = false }

        do {
            if p.viewer?.isFollowing == true || p.viewer?.isFollowPending == true {
                try await api.requestVoid(.init(path: "/users/\(userId)/follow", method: .DELETE))
                // Actualizar estado local
                profile = profile.map { prof in
                    var updated = prof
                    return updated
                }
            } else {
                struct Resp: Decodable { let status: String }
                let r: Resp = try await api.request(.init(path: "/users/\(userId)/follow", method: .POST))
                _ = r.status
            }
            // Recarregar perfil para estado actualizado
            await loadProfile()
        } catch let e as APIError { error = e.errorDescription }
    }
}

// MARK: - ProfileView

struct ProfileView: View {
    let userId: String
    @StateObject private var vm: ProfileViewModel
    @EnvironmentObject private var authStore: AuthStore
    @State private var selectedTab = 0
    @State private var showSettings = false
    @State private var showSessions = false

    init(userId: String) {
        self.userId = userId
        _vm = StateObject(wrappedValue: ProfileViewModel(userId: userId))
    }

    private var isOwnProfile: Bool {
        authStore.currentUser?.id == userId
    }

    var body: some View {
        NavigationStack {
            Group {
                if vm.isLoading && vm.profile == nil {
                    ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if let profile = vm.profile {
                    ProfileContent(
                        profile:       profile,
                        gamification:  vm.gamification,
                        posts:         vm.posts,
                        isOwnProfile:  isOwnProfile,
                        selectedTab:   $selectedTab,
                        onFollow:      { Task { await vm.toggleFollow() } },
                        isFollowLoading: vm.isFollowLoading
                    )
                } else {
                    EmptyStateView(
                        icon: "person.slash", title: "Perfil não encontrado",
                        message: "Este utilizador pode não existir.",
                        action: nil
                    )
                }
            }
            .navigationTitle(isOwnProfile ? "O meu perfil" : (vm.profile?.username ?? "Perfil"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                if isOwnProfile {
                    ToolbarItem(placement: .primaryAction) {
                        Menu {
                            Button { showSettings = true  } label: { Label("Definições",  systemImage: "gear") }
                            Button { showSessions = true  } label: { Label("Sessões",     systemImage: "lock.shield") }
                            Divider()
                            Button(role: .destructive) {
                                Task { await authStore.logout() }
                            } label: {
                                Label("Terminar sessão", systemImage: "rectangle.portrait.and.arrow.right")
                            }
                        } label: {
                            Image(systemName: "ellipsis.circle")
                        }
                    }
                }
            }
            .sheet(isPresented: $showSessions) { SessionsView() }
        }
        .task { await vm.load() }
    }
}

// MARK: - Conteúdo do perfil

struct ProfileContent: View {
    let profile:        UserProfile
    let gamification:   GamificationProfile?
    let posts:          [Post]
    let isOwnProfile:   Bool
    @Binding var selectedTab: Int
    let onFollow:       () -> Void
    let isFollowLoading: Bool

    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                // Header
                ProfileHeaderView(
                    profile:         profile,
                    isOwnProfile:    isOwnProfile,
                    onFollow:        onFollow,
                    isFollowLoading: isFollowLoading
                )

                // Stats
                ProfileStatsView(profile: profile, gamification: gamification)

                // Tabs: Posts / Badges / Desafios
                Picker("", selection: $selectedTab) {
                    Text("Publicações").tag(0)
                    Text("Badges").tag(1)
                    Text("Desafios").tag(2)
                }
                .pickerStyle(.segmented)
                .padding(16)

                switch selectedTab {
                case 0: PostsGridView(posts: posts, canSee: profile.viewer?.canSeeContent ?? true)
                case 1: BadgesGridView(badges: gamification?.badges ?? [])
                case 2: ChallengesListView(challenges: gamification?.activeChallenges ?? [])
                default: EmptyView()
                }
            }
        }
    }
}

// MARK: - Header

struct ProfileHeaderView: View {
    let profile:        UserProfile
    let isOwnProfile:   Bool
    let onFollow:       () -> Void
    let isFollowLoading: Bool

    var body: some View {
        VStack(spacing: 14) {
            AvatarView(url: profile.profile.avatarUrl, size: 80)

            VStack(spacing: 4) {
                HStack(spacing: 6) {
                    Text(profile.profile.displayName)
                        .font(.title2).fontWeight(.bold)
                    if profile.isVerified {
                        Image(systemName: "checkmark.seal.fill")
                            .foregroundStyle(.memovoyBlue)
                    }
                }
                Text("@\(profile.username)")
                    .font(.subheadline).foregroundStyle(.secondary)

                if let bio = profile.profile.bio, !bio.isEmpty {
                    Text(bio)
                        .font(.subheadline)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 32)
                        .padding(.top, 4)
                }

                LevelBadgeView(level: profile.profile.level)
                    .padding(.top, 4)
            }

            // Botão de seguir (só para perfis alheios)
            if !isOwnProfile {
                FollowButton(
                    state:          followState,
                    isLoading:      isFollowLoading,
                    action:         onFollow
                )
            }
        }
        .padding(.vertical, 24)
        .padding(.horizontal, 20)
    }

    private var followState: FollowButton.State {
        if profile.viewer?.isFollowing    == true { return .following }
        if profile.viewer?.isFollowPending == true { return .pending }
        return .notFollowing
    }
}

struct FollowButton: View {
    enum State { case notFollowing, pending, following }
    let state:     State
    let isLoading: Bool
    let action:    () -> Void

    var body: some View {
        Button(action: action) {
            ZStack {
                if isLoading {
                    ProgressView().tint(state == .notFollowing ? .white : .memovoyBlue)
                } else {
                    switch state {
                    case .notFollowing: Text("Seguir")
                    case .pending:      Text("Pedido enviado")
                    case .following:    Text("A seguir")
                    }
                }
            }
            .font(.subheadline).fontWeight(.semibold)
            .frame(width: 140, height: 36)
            .background(state == .notFollowing ? Color.memovoyBlue : Color.secondary.opacity(0.12))
            .foregroundStyle(state == .notFollowing ? .white : .primary)
            .clipShape(RoundedRectangle(cornerRadius: 10))
        }
        .disabled(isLoading)
        .animation(.easeInOut(duration: 0.2), value: state)
    }
}

// MARK: - Stats

struct ProfileStatsView: View {
    let profile:      UserProfile
    let gamification: GamificationProfile?

    var body: some View {
        HStack {
            StatCell(value: "\(profile.followerCount)",              label: "Seguidores")
            Divider().frame(height: 32)
            StatCell(value: "\(profile.profile.followingCount ?? 0)", label: "A seguir")
            Divider().frame(height: 32)
            StatCell(value: "\(profile.profile.totalTrips ?? 0)",    label: "Viagens")
            Divider().frame(height: 32)
            StatCell(value: "\(profile.profile.totalCountries ?? 0)", label: "Países")
        }
        .padding(.vertical, 16)
        .background(Color.secondary.opacity(0.04))

        // Streak
        if let streak = gamification?.streak, streak.currentStreak > 0 {
            HStack(spacing: 8) {
                Text("🔥")
                Text("\(streak.currentStreak) meses consecutivos")
                    .font(.subheadline).fontWeight(.semibold)
                Text("· Recorde: \(streak.longestStreak)")
                    .font(.caption).foregroundStyle(.secondary)
            }
            .padding(.vertical, 10)
            .padding(.horizontal, 20)
        }
    }
}

struct StatCell: View {
    let value: String; let label: String
    var body: some View {
        VStack(spacing: 2) {
            Text(value).font(.title3).fontWeight(.bold)
            Text(label).font(.caption).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
    }
}

// MARK: - Posts grid

struct PostsGridView: View {
    let posts: [Post]; let canSee: Bool

    private let columns = [GridItem(.flexible()), GridItem(.flexible()), GridItem(.flexible())]

    var body: some View {
        if !canSee {
            VStack(spacing: 12) {
                Image(systemName: "lock")
                    .font(.largeTitle).foregroundStyle(.secondary)
                Text("Conta privada")
                    .font(.headline)
                Text("Segue este utilizador para ver as suas publicações.")
                    .font(.subheadline).foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 32)
            }
            .padding(.top, 40)
        } else if posts.isEmpty {
            EmptyStateView(icon: "photo.on.rectangle", title: "Sem publicações", message: "Ainda sem conteúdo partilhado.", action: nil)
                .padding(.top, 20)
        } else {
            LazyVGrid(columns: columns, spacing: 2) {
                ForEach(posts) { post in
                    NavigationLink(destination: PostDetailView(postId: post.id)) {
                        AsyncImage(url: URL(string: post.coverMedia?.thumbnailUrl ?? post.coverMedia?.url ?? "")) { img in
                            img.resizable().scaledToFill()
                        } placeholder: {
                            Rectangle().fill(Color.secondary.opacity(0.15))
                        }
                        .frame(height: 130)
                        .clipped()
                    }
                }
            }
        }
    }
}

// MARK: - Badges grid

struct BadgesGridView: View {
    let badges: [Badge]
    private let columns = [GridItem(.flexible()), GridItem(.flexible()), GridItem(.flexible())]

    var body: some View {
        if badges.isEmpty {
            EmptyStateView(icon: "star", title: "Sem badges ainda", message: "Completa desafios para ganhar badges.", action: nil)
                .padding(.top, 20)
        } else {
            LazyVGrid(columns: columns, spacing: 16) {
                ForEach(badges) { badge in
                    VStack(spacing: 6) {
                        AsyncImage(url: URL(string: badge.iconUrl)) { img in
                            img.resizable().scaledToFit().frame(width: 48, height: 48)
                        } placeholder: {
                            Image(systemName: "star.fill")
                                .font(.title).foregroundStyle(.memovoyAmber)
                        }
                        Text(badge.name)
                            .font(.caption).fontWeight(.medium)
                            .multilineTextAlignment(.center)
                        if let earned = badge.earnedAt {
                            Text(earned.relativeFormatted)
                                .font(.caption2).foregroundStyle(.secondary)
                        }
                    }
                    .padding(10)
                    .background(Color.secondary.opacity(0.06))
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                }
            }
            .padding(16)
        }
    }
}

// MARK: - Challenges list

struct ChallengesListView: View {
    let challenges: [ChallengeProgress]

    var body: some View {
        if challenges.isEmpty {
            EmptyStateView(icon: "flag", title: "Sem desafios activos", message: "Entra num desafio para acompanhar o progresso.", action: nil)
                .padding(.top, 20)
        } else {
            VStack(spacing: 10) {
                ForEach(challenges) { challenge in
                    ChallengeProgressCard(challenge: challenge)
                }
            }
            .padding(16)
        }
    }
}

struct ChallengeProgressCard: View {
    let challenge: ChallengeProgress

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(challenge.title).font(.subheadline).fontWeight(.semibold)
                    if let loc = challenge.locationName {
                        Text(loc).font(.caption).foregroundStyle(.secondary)
                    }
                }
                Spacer()
                if let icon = challenge.rewardBadgeIcon {
                    Text(icon).font(.title2)
                }
            }

            // Barra de progresso
            VStack(alignment: .leading, spacing: 4) {
                GeometryReader { geo in
                    ZStack(alignment: .leading) {
                        RoundedRectangle(cornerRadius: 4).fill(Color.secondary.opacity(0.15))
                        RoundedRectangle(cornerRadius: 4)
                            .fill(Color.memovoyBlue)
                            .frame(width: geo.size.width * CGFloat(challenge.progressPct) / 100)
                    }
                }
                .frame(height: 8)

                HStack {
                    Text("\(challenge.currentValue ?? 0) / \(challenge.targetValue)")
                        .font(.caption).foregroundStyle(.secondary)
                    Spacer()
                    Text("\(challenge.progressPct)%")
                        .font(.caption).fontWeight(.semibold).foregroundStyle(.memovoyBlue)
                }
            }

            if let ends = challenge.endsAt {
                Text("Termina \(ends.relativeFormatted)")
                    .font(.caption2).foregroundStyle(.secondary)
            }
        }
        .padding(14)
        .background(Color(.systemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .shadow(color: .black.opacity(0.05), radius: 4, y: 1)
    }
}

// MARK: - Sessions view (gestão de sessões)

struct SessionsView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var sessions: [SessionInfo] = []
    @State private var isLoading = true
    @State private var error: String? = nil
    private let api = APIClient.shared

    struct SessionInfo: Decodable, Identifiable {
        let id:          String
        let createdAt:   Date
        let expiresAt:   Date
        let isSuspicious: Bool
        let ipCountry:   String?
        let deviceName:  String?
        let platform:    String?
        let lastSeenAt:  Date?
    }

    var body: some View {
        NavigationStack {
            Group {
                if isLoading {
                    ProgressView()
                } else if sessions.isEmpty {
                    EmptyStateView(icon: "lock.shield", title: "Sem sessões", message: "", action: nil)
                } else {
                    List {
                        ForEach(sessions) { session in
                            SessionRow(session: session, onRevoke: {
                                Task { await revoke(sessionId: session.id) }
                            })
                        }
                        Section {
                            Button(role: .destructive) {
                                Task { await revokeAll() }
                            } label: {
                                Label("Revogar todas as outras sessões", systemImage: "xmark.shield")
                            }
                        }
                    }
                }
            }
            .navigationTitle("Sessões activas")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Fechar") { dismiss() } }
            }
        }
        .task { await loadSessions() }
    }

    private func loadSessions() async {
        isLoading = true
        defer { isLoading = false }
        do {
            struct Resp: Decodable { let sessions: [SessionInfo] }
            let r: Resp = try await api.request(.init(path: "/auth/sessions", method: .GET))
            sessions = r.sessions
        } catch { self.error = "Não foi possível carregar as sessões." }
    }

    private func revoke(sessionId: String) async {
        try? await api.requestVoid(.init(path: "/auth/sessions/\(sessionId)", method: .DELETE))
        sessions.removeAll { $0.id == sessionId }
    }

    private func revokeAll() async {
        try? await api.requestVoid(.init(path: "/auth/sessions", method: .DELETE))
        await loadSessions()
    }
}

struct SessionRow: View {
    let session: SessionsView.SessionInfo
    let onRevoke: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: platformIcon)
                .font(.title2)
                .frame(width: 40, height: 40)
                .background(session.isSuspicious ? Color.red.opacity(0.1) : Color.secondary.opacity(0.08))
                .clipShape(RoundedRectangle(cornerRadius: 8))
                .foregroundStyle(session.isSuspicious ? .red : .primary)

            VStack(alignment: .leading, spacing: 3) {
                HStack {
                    Text(session.deviceName ?? platformLabel)
                        .font(.subheadline).fontWeight(.semibold)
                    if session.isSuspicious {
                        Image(systemName: "exclamationmark.triangle.fill")
                            .foregroundStyle(.red).font(.caption)
                    }
                }
                if let country = session.ipCountry {
                    Text(country).font(.caption).foregroundStyle(.secondary)
                }
                Text(session.createdAt.relativeFormatted)
                    .font(.caption2).foregroundStyle(.secondary)
            }

            Spacer()

            Button("Revogar", role: .destructive, action: onRevoke)
                .font(.caption).buttonStyle(.bordered).tint(.red)
        }
    }

    private var platformIcon: String {
        switch session.platform {
        case "ios":     return "iphone"
        case "android": return "phone"
        case "web":     return "laptopcomputer"
        default:        return "questionmark.circle"
        }
    }

    private var platformLabel: String {
        switch session.platform {
        case "ios":     return "iPhone/iPad"
        case "android": return "Android"
        case "web":     return "Browser"
        default:        return "Dispositivo desconhecido"
        }
    }
}

// PostDetailView implementada em Features/Feed/PostDetailView.swift
