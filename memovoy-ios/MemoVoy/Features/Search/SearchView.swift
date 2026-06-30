// MemoVoy/Features/Search/SearchView.swift
// Pesquisa full-text de roteiros, utilizadores e posts.
// Autocomplete a partir de 2 chars, resultados completos a partir de 3.

import SwiftUI

// MARK: - Models de resposta

struct AutocompleteResponse: Decodable {
    struct Destination: Decodable, Identifiable {
        var id: String { destinationName }
        let destinationName: String
        let countryCode:     String
        let tripCount:       Int
    }
    struct AutoUser: Decodable, Identifiable {
        let id:           String
        let username:     String
        let displayName:  String
        let avatarUrl:    String?
        let level:        String
        let isVerified:   Bool
        let followerCount: Int
    }
    let destinations: [Destination]
    let users:        [AutoUser]
}

struct SearchResponse: Decodable {
    let itineraries: [Itinerary]
    let users:       [UserProfile]
    let posts:       [Post]
}

// MARK: - ViewModel

enum SearchTab: String, CaseIterable {
    case all, itineraries, users, posts
    var label: String {
        switch self {
        case .all:          return "Todos"
        case .itineraries:  return "Roteiros"
        case .users:        return "Viajantes"
        case .posts:        return "Posts"
        }
    }
}

@MainActor
final class SearchViewModel: ObservableObject {
    @Published var query        = ""
    @Published var tab          = SearchTab.all
    @Published var autocomplete: AutocompleteResponse? = nil
    @Published var results:      SearchResponse?       = nil
    @Published var isLoading     = false
    @Published var error: String? = nil

    private let api = APIClient.shared
    private var searchTask: Task<Void, Never>? = nil

    // Debounce: aguardar 300ms após a última tecla antes de pesquisar
    func onQueryChange(_ newQuery: String) {
        query = newQuery
        searchTask?.cancel()
        searchTask = Task {
            try? await Task.sleep(nanoseconds: 300_000_000)
            guard !Task.isCancelled else { return }
            await performSearch()
        }
    }

    func onTabChange(_ newTab: SearchTab) {
        tab = newTab
        Task { await performSearch() }
    }

    private func performSearch() async {
        guard !query.trimmingCharacters(in: .whitespaces).isEmpty else {
            autocomplete = nil; results = nil; return
        }
        let q = query.trimmingCharacters(in: .whitespaces)

        if q.count == 2 {
            // Autocomplete
            do {
                autocomplete = try await api.request(.init(
                    path:        "/search/autocomplete",
                    method:      .GET,
                    queryParams: ["q": q]
                ))
            } catch {}
        } else if q.count >= 3 {
            // Pesquisa completa
            isLoading = true; error = nil
            defer { isLoading = false }
            do {
                results = try await api.request(.init(
                    path:        "/search",
                    method:      .GET,
                    queryParams: ["q": q, "type": tab.rawValue, "limit": "20"]
                ))
                autocomplete = nil
            } catch let e as APIError {
                error = e.errorDescription
            } catch {}
        }
    }
}

// MARK: - SearchView

struct SearchView: View {
    @StateObject private var vm = SearchViewModel()
    @FocusState  private var isFocused: Bool

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                // Campo de pesquisa
                HStack(spacing: 10) {
                    Image(systemName: "magnifyingglass")
                        .foregroundStyle(.secondary)
                    TextField("Roteiros, destinos, viajantes…", text: $vm.query)
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)
                        .focused($isFocused)
                        .onChange(of: vm.query) { vm.onQueryChange($0) }
                        .submitLabel(.search)
                        .onSubmit { isFocused = false }
                    if !vm.query.isEmpty {
                        Button { vm.query = "" } label: {
                            Image(systemName: "xmark.circle.fill")
                                .foregroundStyle(.secondary)
                        }
                    }
                }
                .padding(12)
                .background(Color.secondary.opacity(0.08))
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .padding(.horizontal, 16)
                .padding(.vertical, 8)

                // Tabs (só quando há resultados)
                if vm.results != nil {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 6) {
                            ForEach(SearchTab.allCases, id: \.self) { tab in
                                Button(tab.label) { vm.onTabChange(tab) }
                                    .font(.subheadline)
                                    .fontWeight(vm.tab == tab ? .semibold : .regular)
                                    .padding(.horizontal, 14).padding(.vertical, 7)
                                    .background(vm.tab == tab ? Color.memovoyBlue : Color.secondary.opacity(0.1))
                                    .foregroundStyle(vm.tab == tab ? .white : .primary)
                                    .clipShape(Capsule())
                                    .animation(.easeInOut(duration: 0.15), value: vm.tab)
                            }
                        }
                        .padding(.horizontal, 16)
                    }
                    .padding(.bottom, 8)
                }

                Divider()

                // Conteúdo
                Group {
                    if vm.query.isEmpty {
                        SearchEmptyPrompt()
                    } else if vm.query.count == 2, let auto = vm.autocomplete {
                        AutocompleteView(data: auto, onSelect: { vm.query = $0 })
                    } else if vm.isLoading {
                        ProgressView()
                            .frame(maxWidth: .infinity, maxHeight: .infinity)
                    } else if let results = vm.results {
                        SearchResultsView(results: results, tab: vm.tab, query: vm.query)
                    } else if vm.query.count >= 3 {
                        VStack(spacing: 12) {
                            Spacer()
                            Image(systemName: "text.magnifyingglass")
                                .font(.system(size: 48))
                                .foregroundStyle(.secondary.opacity(0.4))
                            Text("Sem resultados para "\(vm.query)"")
                                .font(.headline)
                            Text("Tenta termos diferentes.")
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                            Spacer()
                        }
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
            .navigationTitle("Pesquisar")
            .navigationBarTitleDisplayMode(.inline)
            .onAppear { isFocused = true }
        }
    }
}

// MARK: - Subviews

struct SearchEmptyPrompt: View {
    let suggestions = ["Tokyo","Lisboa","Bali","Paris","Brasil","Islândia","Nova York","Marrocos"]
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text("Destinos populares")
                    .font(.subheadline)
                    .fontWeight(.semibold)
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 20)
                LazyVGrid(columns: [.init(.flexible()), .init(.flexible())], spacing: 10) {
                    ForEach(suggestions, id: \.self) { s in
                        Text(s)
                            .font(.subheadline)
                            .padding(.vertical, 10)
                            .frame(maxWidth: .infinity)
                            .background(Color.secondary.opacity(0.08))
                            .clipShape(RoundedRectangle(cornerRadius: 10))
                    }
                }
                .padding(.horizontal, 16)
            }
            .padding(.top, 20)
        }
    }
}

struct AutocompleteView: View {
    let data:     AutocompleteResponse
    let onSelect: (String) -> Void
    var body: some View {
        List {
            if !data.destinations.isEmpty {
                Section("Destinos") {
                    ForEach(data.destinations) { dest in
                        Button {
                            onSelect(dest.destinationName)
                        } label: {
                            HStack(spacing: 12) {
                                Text(countryFlag(dest.countryCode))
                                    .font(.title3)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(dest.destinationName).foregroundStyle(.primary)
                                    Text("\(dest.tripCount) roteiros")
                                        .font(.caption).foregroundStyle(.secondary)
                                }
                            }
                        }
                    }
                }
            }
            if !data.users.isEmpty {
                Section("Viajantes") {
                    ForEach(data.users) { u in
                        NavigationLink(destination: ProfileView(userId: u.id)) {
                            HStack(spacing: 12) {
                                AvatarView(url: u.avatarUrl, size: 32)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(u.displayName).font(.subheadline).fontWeight(.semibold)
                                    Text("@\(u.username)").font(.caption).foregroundStyle(.secondary)
                                }
                            }
                        }
                    }
                }
            }
        }
        .listStyle(.plain)
    }
}

struct SearchResultsView: View {
    let results: SearchResponse
    let tab:     SearchTab
    let query:   String

    var body: some View {
        List {
            // Roteiros
            if (tab == .all || tab == .itineraries) && !results.itineraries.isEmpty {
                Section(tab == .all ? "Roteiros" : "") {
                    ForEach(results.itineraries) { it in
                        NavigationLink(destination: ItineraryDetailView(itineraryId: it.id)) {
                            ItinerarySearchRow(itinerary: it, query: query)
                        }
                    }
                }
            }
            // Utilizadores
            if (tab == .all || tab == .users) && !results.users.isEmpty {
                Section(tab == .all ? "Viajantes" : "") {
                    ForEach(results.users) { u in
                        NavigationLink(destination: ProfileView(userId: u.id)) {
                            UserSearchRow(user: u)
                        }
                    }
                }
            }
        }
        .listStyle(.plain)
    }
}

struct ItinerarySearchRow: View {
    let itinerary: Itinerary
    let query: String
    var body: some View {
        HStack(spacing: 12) {
            // Cover thumbnail
            RoundedRectangle(cornerRadius: 8)
                .fill(Color.memovoyBlue.opacity(0.1))
                .frame(width: 60, height: 60)
                .overlay(
                    itinerary.coverImageUrl != nil
                    ? AnyView(AsyncImage(url: URL(string: itinerary.coverImageUrl!)) { img in
                        img.resizable().scaledToFill()
                    } placeholder: { Color.clear })
                    : AnyView(Text("✈️").font(.title3))
                )
                .clipShape(RoundedRectangle(cornerRadius: 8))

            VStack(alignment: .leading, spacing: 3) {
                Text(itinerary.title)
                    .font(.subheadline).fontWeight(.semibold)
                    .lineLimit(2)
                Text("\(itinerary.destinationName) · \(itinerary.durationDays) dias")
                    .font(.caption).foregroundStyle(.secondary)
                HStack(spacing: 8) {
                    Label("\(itinerary.savesCount)", systemImage: "bookmark")
                    Label("\(itinerary.viewsCount)", systemImage: "eye")
                    if itinerary.aiGenerated {
                        Label("IA", systemImage: "sparkles").foregroundStyle(.memovoyBlue)
                    }
                }
                .font(.caption2).foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 4)
    }
}

struct UserSearchRow: View {
    let user: UserProfile
    var body: some View {
        HStack(spacing: 12) {
            AvatarView(url: user.profile.avatarUrl, size: 40)
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    Text(user.profile.displayName)
                        .font(.subheadline).fontWeight(.semibold)
                    if user.isVerified {
                        Image(systemName: "checkmark.seal.fill")
                            .font(.caption).foregroundStyle(.memovoyBlue)
                    }
                }
                Text("@\(user.username) · \(user.followerCount) seguidores")
                    .font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
            LevelBadgeView(level: user.profile.level)
        }
        .padding(.vertical, 2)
    }
}

// Flag emoji de código ISO
func countryFlag(_ code: String) -> String {
    code.uppercased().unicodeScalars.compactMap {
        Unicode.Scalar(127397 + $0.value)
    }.map(String.init).joined()
}
