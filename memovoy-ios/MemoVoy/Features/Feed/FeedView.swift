// MemoVoy/Features/Feed/FeedView.swift
// Feed personalizado (seguidores) com cursor-based pagination e pull-to-refresh.
// Impressões registadas ao scroll para alimentar o modelo de ML.

import SwiftUI

// MARK: - ViewModel

@MainActor
final class FeedViewModel: ObservableObject {
    @Published var posts:      [Post]  = []
    @Published var isLoading:  Bool    = false
    @Published var isRefreshing: Bool  = false
    @Published var hasMore:    Bool    = true
    @Published var error:      String? = nil

    private var cursor:    String? = nil
    private let api = APIClient.shared
    private let pageSize   = 20

    // MARK: - Load

    func loadInitial() async {
        guard !isLoading else { return }
        isLoading = true
        cursor    = nil
        error     = nil
        defer { isLoading = false }

        do {
            let response: FeedResponse = try await api.request(.init(
                path:        "/feed",
                method:      .GET,
                queryParams: ["limit": pageSize]
            ))
            posts   = response.items
            hasMore = response.hasMore
            cursor  = response.nextCursor
        } catch let e as APIError {
            error = e.errorDescription
        } catch {
            self.error = "Não foi possível carregar o feed."
        }
    }

    func refresh() async {
        isRefreshing = true
        defer { isRefreshing = false }
        cursor = nil
        await loadInitial()
    }

    // MARK: - Pagination

    func loadMoreIfNeeded(currentPost: Post) async {
        // Trigger quando estamos a 5 posts do fim
        guard let index = posts.firstIndex(where: { $0.id == currentPost.id }),
              posts.count - index < 5,
              hasMore,
              !isLoading else { return }

        isLoading = true
        defer { isLoading = false }

        do {
            var params: [String: Any] = ["limit": pageSize]
            if let c = cursor { params["cursor"] = c }

            let response: FeedResponse = try await api.request(.init(
                path:        "/feed",
                method:      .GET,
                queryParams: params
            ))
            // Evitar duplicados ao concatenar
            let existingIds = Set(posts.map(\.id))
            let newPosts = response.items.filter { !existingIds.contains($0.id) }
            posts.append(contentsOf: newPosts)
            hasMore = response.hasMore
            cursor  = response.nextCursor
        } catch {
            // Falha de paginação — silenciosa (tentar de novo no próximo scroll)
        }
    }

    // MARK: - Toggle like (optimistic update)

    func toggleLike(post: Post) async {
        // Actualizar UI imediatamente sem esperar pela API
        if let index = posts.firstIndex(where: { $0.id == post.id }) {
            let wasLiked = posts[index].viewerLiked
            // SwiftUI não permite mutação directa de structs em arrays —
            // reconstruir o post com o novo estado
            posts[index] = post.withLike(!wasLiked)
        }

        do {
            let response: LikeResponse = try await api.request(.init(
                path:   "/posts/\(post.id)/like",
                method: .POST
            ))
            // Reconciliar com o estado real da API
            if let index = posts.firstIndex(where: { $0.id == post.id }) {
                posts[index] = post.withLike(response.liked)
            }
        } catch {
            // Rollback em caso de erro
            if let index = posts.firstIndex(where: { $0.id == post.id }) {
                posts[index] = post
            }
        }
    }
}

private struct FeedResponse: Decodable {
    let items:      [Post]
    let hasMore:    Bool
    let nextCursor: String?
}

private struct LikeResponse: Decodable {
    let liked: Bool
}

// MARK: - FeedView

struct FeedView: View {
    @StateObject private var vm = FeedViewModel()
    @EnvironmentObject private var authStore: AuthStore

    var body: some View {
        NavigationStack {
            Group {
                if vm.isLoading && vm.posts.isEmpty {
                    FeedSkeletonView()
                } else if let error = vm.error, vm.posts.isEmpty {
                    EmptyStateView(
                        icon:    "wifi.slash",
                        title:   "Sem ligação",
                        message: error,
                        action:  ("Tentar novamente", { Task { await vm.loadInitial() } })
                    )
                } else if vm.posts.isEmpty && !vm.isLoading {
                    EmptyStateView(
                        icon:    "person.2",
                        title:   "O teu feed está vazio",
                        message: "Segue outros viajantes para ver as suas aventuras aqui.",
                        action:  ("Explorar", nil)
                    )
                } else {
                    ScrollView {
                        LazyVStack(spacing: 0) {
                            ForEach(vm.posts) { post in
                                PostCardView(post: post, onLike: {
                                    Task { await vm.toggleLike(post: post) }
                                })
                                .onAppear { Task { await vm.loadMoreIfNeeded(currentPost: post) } }

                                Divider()
                            }

                            if vm.isLoading && !vm.posts.isEmpty {
                                ProgressView()
                                    .padding()
                            }
                        }
                    }
                    .refreshable { await vm.refresh() }
                }
            }
            .navigationTitle("MemoVoy")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    NavigationLink(destination: NotificationsView()) {
                        Image(systemName: "bell")
                    }
                }
            }
        }
        .task { await vm.loadInitial() }
    }
}

// MARK: - PostCardView

struct PostCardView: View {
    let post:   Post
    let onLike: () -> Void

    @State private var showDetail = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Header: avatar + username + localização
            HStack(spacing: 10) {
                AvatarView(url: post.avatarUrl, size: 36)
                VStack(alignment: .leading, spacing: 1) {
                    Text(post.displayName)
                        .font(.subheadline).fontWeight(.semibold)
                    if let location = post.locationName {
                        Label(location, systemImage: "mappin")
                            .font(.caption).foregroundStyle(.secondary)
                    }
                }
                Spacer()
                Text(post.createdAt.relativeFormatted)
                    .font(.caption).foregroundStyle(.secondary)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 10)

            // Media (se existir)
            if let media = post.coverMedia {
                AsyncImage(url: URL(string: media.thumbnailUrl ?? media.url)) { image in
                    image
                        .resizable()
                        .scaledToFill()
                        .frame(maxWidth: .infinity)
                        .frame(height: 280)
                        .clipped()
                } placeholder: {
                    Rectangle()
                        .fill(Color.secondary.opacity(0.1))
                        .frame(height: 280)
                        .overlay(ProgressView())
                }
                // Badge de múltiplos media
                .overlay(alignment: .topTrailing) {
                    if let count = post.mediaCount, count > 1 {
                        Label("\(count)", systemImage: "square.on.square")
                            .font(.caption2).fontWeight(.semibold)
                            .padding(6)
                            .background(.black.opacity(0.5))
                            .foregroundStyle(.white)
                            .clipShape(RoundedRectangle(cornerRadius: 6))
                            .padding(8)
                    }
                }
            }

            // Caption
            if let caption = post.caption {
                Text(caption)
                    .font(.subheadline)
                    .lineLimit(3)
                    .padding(.horizontal, 16)
                    .padding(.top, 10)
            }

            // Acções: like, comentário, partilhar
            HStack(spacing: 20) {
                Button(action: onLike) {
                    HStack(spacing: 5) {
                        Image(systemName: post.viewerLiked ? "heart.fill" : "heart")
                            .foregroundStyle(post.viewerLiked ? .red : .primary)
                            .scaleEffect(post.viewerLiked ? 1.1 : 1.0)
                            .animation(.spring(response: 0.3), value: post.viewerLiked)
                        Text("\(post.likesCount)")
                            .font(.subheadline)
                    }
                }
                .buttonStyle(.plain)

                NavigationLink(destination: PostDetailView(postId: post.id)) {
                    HStack(spacing: 5) {
                        Image(systemName: "bubble.right")
                        Text("\(post.commentsCount)")
                            .font(.subheadline)
                    }
                    .foregroundStyle(.primary)
                }

                Spacer()

                // Badge de level do utilizador
                if let level = post.level {
                    LevelBadgeView(level: level)
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
        }
    }
}

// MARK: - Skeleton loading

struct FeedSkeletonView: View {
    var body: some View {
        LazyVStack(spacing: 0) {
            ForEach(0..<5, id: \.self) { _ in
                PostSkeletonCard()
                Divider()
            }
        }
    }
}

struct PostSkeletonCard: View {
    @State private var animate = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 10) {
                Circle()
                    .fill(Color.secondary.opacity(0.2))
                    .frame(width: 36, height: 36)
                VStack(alignment: .leading, spacing: 4) {
                    RoundedRectangle(cornerRadius: 4)
                        .fill(Color.secondary.opacity(0.2))
                        .frame(width: 120, height: 12)
                    RoundedRectangle(cornerRadius: 4)
                        .fill(Color.secondary.opacity(0.15))
                        .frame(width: 80, height: 10)
                }
                Spacer()
            }
            .padding(16)

            Rectangle()
                .fill(Color.secondary.opacity(0.15))
                .frame(height: 200)
        }
        .opacity(animate ? 0.6 : 1.0)
        .onAppear {
            withAnimation(.easeInOut(duration: 1.0).repeatForever()) {
                animate = true
            }
        }
    }
}
