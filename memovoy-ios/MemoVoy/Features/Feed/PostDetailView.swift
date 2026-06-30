// MemoVoy/Features/Feed/PostDetailView.swift
// Detalhe de post com carousel de media, comentários e reply inline.

import SwiftUI

// MARK: - ViewModel

@MainActor
final class PostDetailViewModel: ObservableObject {
    @Published var post:        Post?    = nil
    @Published var isLoading            = false
    @Published var error: String?       = nil
    @Published var commentText          = ""
    @Published var replyTo: (id: String, username: String)? = nil
    @Published var isSubmitting         = false
    @Published var currentMediaIndex    = 0

    let postId: String
    private let api = APIClient.shared

    init(postId: String) { self.postId = postId }

    func load() async {
        isLoading = true; error = nil
        defer { isLoading = false }
        do {
            struct Resp: Decodable { let post: Post }
            let r: Resp = try await api.request(.init(path: "/posts/\(postId)", method: .GET))
            post = r.post
        } catch let e as APIError { error = e.errorDescription }
    }

    func toggleLike() async {
        guard let p = post else { return }
        // Optimistic
        post = Post(
            id: p.id, userId: p.userId, itineraryId: p.itineraryId,
            caption: p.caption, locationName: p.locationName,
            countryCode: p.countryCode,
            likesCount: p.likesCount + (p.viewerLiked ? -1 : 1),
            commentsCount: p.commentsCount, savesCount: p.savesCount,
            createdAt: p.createdAt, username: p.username,
            displayName: p.displayName, avatarUrl: p.avatarUrl,
            level: p.level, coverMedia: p.coverMedia,
            mediaCount: p.mediaCount,
            viewerLiked: !p.viewerLiked, viewerSaved: p.viewerSaved,
            media: p.media, comments: p.comments
        )
        do {
            struct Resp: Decodable { let liked: Bool }
            let r: Resp = try await api.request(.init(path: "/posts/\(postId)/like", method: .POST))
            // Reconciliar
            if var updated = post {
                post = Post(
                    id: updated.id, userId: updated.userId, itineraryId: updated.itineraryId,
                    caption: updated.caption, locationName: updated.locationName,
                    countryCode: updated.countryCode,
                    likesCount: updated.likesCount, commentsCount: updated.commentsCount,
                    savesCount: updated.savesCount, createdAt: updated.createdAt,
                    username: updated.username, displayName: updated.displayName,
                    avatarUrl: updated.avatarUrl, level: updated.level,
                    coverMedia: updated.coverMedia, mediaCount: updated.mediaCount,
                    viewerLiked: r.liked, viewerSaved: updated.viewerSaved,
                    media: updated.media, comments: updated.comments
                )
            }
        } catch { post = p } // rollback
    }

    func submitComment() async {
        guard !commentText.trimmingCharacters(in: .whitespaces).isEmpty else { return }
        isSubmitting = true
        defer { isSubmitting = false }
        do {
            struct Resp: Decodable { let comment: Comment }
            var body: [String: Any] = ["content": commentText.trimmingCharacters(in: .whitespaces)]
            if let r = replyTo { body["parentCommentId"] = r.id }
            let _: Resp = try await api.request(.init(path: "/posts/\(postId)/comments", method: .POST, body: body))
            commentText = ""
            replyTo     = nil
            await load() // Recarregar para mostrar o novo comentário
        } catch let e as APIError { error = e.errorDescription }
    }
}

// MARK: - PostDetailView (real — substitui o stub em ProfileView)

struct PostDetailView: View {
    let postId: String
    @StateObject private var vm: PostDetailViewModel

    init(postId: String) {
        self.postId = postId
        _vm = StateObject(wrappedValue: PostDetailViewModel(postId: postId))
    }

    var body: some View {
        Group {
            if vm.isLoading && vm.post == nil {
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let post = vm.post {
                PostDetailContent(post: post, vm: vm)
            } else if let error = vm.error {
                VStack(spacing: 16) {
                    Image(systemName: "exclamationmark.triangle")
                        .font(.largeTitle).foregroundStyle(.secondary)
                    Text(error).font(.subheadline).foregroundStyle(.secondary)
                    Button("Tentar novamente") { Task { await vm.load() } }
                        .buttonStyle(.bordered)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .navigationBarTitleDisplayMode(.inline)
        .task { await vm.load() }
    }
}

// MARK: - Conteúdo

struct PostDetailContent: View {
    let post: Post
    @ObservedObject var vm: PostDetailViewModel
    @FocusState private var commentFocused: Bool

    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                // Header: autor
                HStack(spacing: 10) {
                    NavigationLink(destination: ProfileView(userId: post.userId)) {
                        AvatarView(url: post.avatarUrl, size: 36)
                    }
                    VStack(alignment: .leading, spacing: 2) {
                        HStack(spacing: 6) {
                            Text(post.displayName).font(.subheadline).fontWeight(.semibold)
                            if let level = post.level { LevelBadgeView(level: level) }
                        }
                        if let loc = post.locationName {
                            Label(loc, systemImage: "mappin").font(.caption).foregroundStyle(.secondary)
                        }
                    }
                    Spacer()
                    Text(post.createdAt).font(.caption2).foregroundStyle(.secondary)
                }
                .padding(.horizontal, 16).padding(.vertical, 12)

                // Media carousel
                if let media = post.media, !media.isEmpty {
                    TabView(selection: $vm.currentMediaIndex) {
                        ForEach(Array(media.enumerated()), id: \.offset) { i, m in
                            AsyncImage(url: URL(string: m.url)) { img in
                                img.resizable().scaledToFit()
                            } placeholder: {
                                Rectangle().fill(Color.secondary.opacity(0.1))
                                    .overlay(ProgressView())
                            }
                            .tag(i)
                        }
                    }
                    .tabViewStyle(.page(indexDisplayMode: .automatic))
                    .frame(maxWidth: .infinity)
                    .aspectRatio(1, contentMode: .fit)
                }

                // Acções
                HStack(spacing: 4) {
                    Button { Task { await vm.toggleLike() } } label: {
                        HStack(spacing: 5) {
                            Image(systemName: post.viewerLiked ? "heart.fill" : "heart")
                                .foregroundStyle(post.viewerLiked ? .red : .primary)
                                .scaleEffect(post.viewerLiked ? 1.1 : 1.0)
                                .animation(.spring(response: 0.3), value: post.viewerLiked)
                            Text("\(post.likesCount)").font(.subheadline)
                        }
                    }
                    .buttonStyle(.plain)

                    Button { commentFocused = true } label: {
                        HStack(spacing: 5) {
                            Image(systemName: "bubble.right")
                            Text("\(post.commentsCount)").font(.subheadline)
                        }
                    }
                    .buttonStyle(.plain).foregroundStyle(.primary)

                    Spacer()

                    if let itinId = post.itineraryId {
                        NavigationLink(destination: ItineraryDetailView(itineraryId: itinId)) {
                            Label("Ver roteiro", systemImage: "map")
                                .font(.caption).foregroundStyle(.memovoyBlue)
                        }
                    }
                }
                .padding(.horizontal, 16).padding(.vertical, 10)

                // Caption
                if let caption = post.caption {
                    HStack(alignment: .top, spacing: 6) {
                        NavigationLink(destination: ProfileView(userId: post.userId)) {
                            Text(post.username).fontWeight(.semibold)
                                .font(.subheadline)
                        }
                        .buttonStyle(.plain)
                        Text(caption).font(.subheadline)
                        Spacer()
                    }
                    .padding(.horizontal, 16).padding(.bottom, 10)
                }

                Divider()

                // Comentários
                if let comments = post.comments {
                    if comments.isEmpty {
                        Text("Sem comentários ainda.")
                            .font(.subheadline).foregroundStyle(.secondary)
                            .padding(.vertical, 24)
                    } else {
                        ForEach(comments) { comment in
                            CommentRowView(comment: comment) {
                                vm.replyTo = (id: comment.id, username: comment.username)
                                commentFocused = true
                            }
                            Divider().padding(.leading, 58)
                        }
                    }
                }
            }
        }
        .safeAreaInset(edge: .bottom) {
            // Input de comentário fixo no fundo
            VStack(spacing: 0) {
                Divider()
                if let r = vm.replyTo {
                    HStack {
                        Image(systemName: "arrow.turn.down.right").foregroundStyle(.secondary)
                        Text("A responder a @\(r.username)").font(.caption).foregroundStyle(.secondary)
                        Spacer()
                        Button { vm.replyTo = nil } label: {
                            Image(systemName: "xmark").foregroundStyle(.secondary)
                        }
                    }
                    .padding(.horizontal, 16).padding(.vertical, 8)
                    .background(Color.secondary.opacity(0.05))
                }
                HStack(spacing: 10) {
                    TextField(
                        vm.replyTo != nil ? "Responder a @\(vm.replyTo!.username)…" : "Adicionar comentário…",
                        text: $vm.commentText
                    )
                    .focused($commentFocused)
                    .textInputAutocapitalization(.sentences)
                    .padding(.horizontal, 12).padding(.vertical, 8)
                    .background(Color.secondary.opacity(0.08))
                    .clipShape(Capsule())

                    Button {
                        Task { await vm.submitComment() }
                    } label: {
                        Image(systemName: vm.isSubmitting ? "hourglass" : "paperplane.fill")
                            .foregroundStyle(.memovoyBlue)
                    }
                    .disabled(vm.commentText.trimmingCharacters(in: .whitespaces).isEmpty || vm.isSubmitting)
                }
                .padding(.horizontal, 16).padding(.vertical, 10)
                .background(Color(.systemBackground))
            }
        }
    }
}

// MARK: - CommentRowView

struct CommentRowView: View {
    let comment: Comment
    let onReply: () -> Void

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            NavigationLink(destination: ProfileView(userId: comment.userId)) {
                AvatarView(url: comment.avatarUrl, size: 32)
            }
            VStack(alignment: .leading, spacing: 4) {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(comment.username).fontWeight(.semibold).font(.subheadline)
                        Text(comment.content).font(.subheadline).fixedSize(horizontal: false, vertical: true)
                    }
                    Spacer()
                    if comment.viewerLiked || comment.likesCount > 0 {
                        VStack(spacing: 2) {
                            Image(systemName: comment.viewerLiked ? "heart.fill" : "heart")
                                .font(.caption).foregroundStyle(comment.viewerLiked ? .red : .secondary)
                            if comment.likesCount > 0 {
                                Text("\(comment.likesCount)").font(.caption2).foregroundStyle(.secondary)
                            }
                        }
                    }
                }
                HStack(spacing: 12) {
                    Text(comment.createdAt).font(.caption2).foregroundStyle(.secondary)
                    if comment.likesCount > 0 {
                        Text("\(comment.likesCount) gostos").font(.caption2).foregroundStyle(.secondary)
                    }
                    Button("Responder") { onReply() }
                        .font(.caption2).fontWeight(.semibold).foregroundStyle(.secondary)
                    if let rc = comment.replyCount, rc > 0 {
                        Text("Ver \(rc) \(rc == 1 ? "resposta" : "respostas")")
                            .font(.caption2).foregroundStyle(.memovoyBlue)
                    }
                }
            }
        }
        .padding(.horizontal, 16).padding(.vertical, 10)
    }
}
