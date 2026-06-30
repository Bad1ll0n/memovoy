// MemoVoy/Features/Notifications/NotificationsView.swift
// MemoVoy/Features/Feed/DiscoveryView.swift
// MemoVoy/Features/Itineraries/ExpensesView.swift
// MemoVoy/Features/Itineraries/CreateItinerarySheet.swift
// Agrupados num único ficheiro para economizar espaço.

import SwiftUI

// MARK: ─────────────────────────────────────────────
// MARK: NotificationsView
// ─────────────────────────────────────────────────

@MainActor
final class NotificationsViewModel: ObservableObject {
    @Published var notifications: [AppNotification] = []
    @Published var isLoading = false
    @Published var hasMore   = true
    private var cursor: String? = nil
    private let api = APIClient.shared

    func load() async {
        isLoading = true; defer { isLoading = false }
        do {
            struct Resp: Decodable {
                let items: [AppNotification]; let hasMore: Bool; let nextCursor: String?
            }
            let r: Resp = try await api.request(.init(
                path: "/notifications", method: .GET, queryParams: ["limit": 30]
            ))
            notifications = r.items; hasMore = r.hasMore; cursor = r.nextCursor
        } catch {}
    }

    func markRead(_ id: String) async {
        try? await api.requestVoid(.init(path: "/notifications/\(id)/read", method: .PATCH))
        if let idx = notifications.firstIndex(where: { $0.id == id }) {
            // Reconstruir struct com readAt preenchido
            let n = notifications[idx]
            notifications[idx] = AppNotification(
                id: n.id, type: n.type, title: n.title, body: n.body,
                channel: n.channel, status: "read", readAt: Date(), createdAt: n.createdAt
            )
        }
    }

    func markAllRead() async {
        try? await api.requestVoid(.init(path: "/notifications/read-all", method: .PATCH))
        await load()
    }
}

struct NotificationsView: View {
    @StateObject private var vm = NotificationsViewModel()
    @EnvironmentObject private var hub: NotificationHub

    var body: some View {
        NavigationStack {
            Group {
                if vm.isLoading && vm.notifications.isEmpty {
                    ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if vm.notifications.isEmpty {
                    EmptyStateView(
                        icon: "bell.slash",
                        title: "Sem notificações",
                        message: "Quando alguém interagir com o teu conteúdo, verás aqui.",
                        action: nil
                    )
                } else {
                    List {
                        ForEach(vm.notifications) { notification in
                            NotificationRow(notification: notification)
                                .listRowBackground(
                                    notification.isRead ? Color.clear : Color.memovoyBlue.opacity(0.05)
                                )
                                .swipeActions(edge: .leading) {
                                    if !notification.isRead {
                                        Button {
                                            Task { await vm.markRead(notification.id) }
                                        } label: {
                                            Label("Lida", systemImage: "checkmark")
                                        }
                                        .tint(.memovoyBlue)
                                    }
                                }
                        }
                    }
                    .listStyle(.plain)
                    .refreshable { await vm.load() }
                }
            }
            .navigationTitle("Notificações")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button("Marcar todas") {
                        Task {
                            await vm.markAllRead()
                            await hub.refresh()
                        }
                    }
                    .font(.subheadline)
                }
            }
        }
        .task {
            await vm.load()
            await hub.refresh()
        }
    }
}

struct NotificationRow: View {
    let notification: AppNotification

    var body: some View {
        HStack(spacing: 12) {
            // Ícone por tipo
            Image(systemName: typeIcon)
                .font(.title3)
                .frame(width: 42, height: 42)
                .background(typeColor.opacity(0.12))
                .foregroundStyle(typeColor)
                .clipShape(Circle())

            VStack(alignment: .leading, spacing: 3) {
                Text(notification.title)
                    .font(.subheadline)
                    .fontWeight(notification.isRead ? .regular : .semibold)
                if let body = notification.body {
                    Text(body).font(.caption).foregroundStyle(.secondary).lineLimit(2)
                }
                Text(notification.createdAt.relativeFormatted)
                    .font(.caption2).foregroundStyle(.secondary)
            }

            if !notification.isRead {
                Circle().fill(Color.memovoyBlue).frame(width: 8, height: 8)
            }
        }
        .padding(.vertical, 4)
    }

    private var typeIcon: String {
        switch notification.type {
        case "like":               return "heart.fill"
        case "comment":            return "bubble.right.fill"
        case "follow":             return "person.fill.badge.plus"
        case "follow_request":     return "person.badge.clock"
        case "challenge_complete": return "flag.fill"
        case "badge_earned":       return "star.fill"
        case "geo_alert":          return "location.fill"
        case "session_suspicious": return "exclamationmark.shield.fill"
        case "carbon_milestone":   return "leaf.fill"
        default:                   return "bell.fill"
        }
    }

    private var typeColor: Color {
        switch notification.type {
        case "like":               return .red
        case "comment":            return .memovoyBlue
        case "follow",
             "follow_request":     return .purple
        case "challenge_complete",
             "badge_earned":       return .memovoyAmber
        case "session_suspicious": return .red
        case "carbon_milestone":   return .green
        default:                   return .secondary
        }
    }
}

// MARK: ─────────────────────────────────────────────
// MARK: DiscoveryView (feed de exploração)
// ─────────────────────────────────────────────────

@MainActor
final class DiscoveryViewModel: ObservableObject {
    @Published var posts: [Post] = []
    @Published var isLoading = false
    @Published var hasMore   = true
    @Published var countryFilter: String? = nil
    private var cursor: String? = nil
    private let api = APIClient.shared

    func load(reset: Bool = false) async {
        if reset { cursor = nil; posts = [] }
        guard !isLoading && (hasMore || reset) else { return }
        isLoading = true; defer { isLoading = false }
        do {
            struct Resp: Decodable { let items: [Post]; let hasMore: Bool; let nextCursor: String? }
            var params: [String: Any] = ["limit": 24]
            if let c = cursor        { params["cursor"]  = c }
            if let cc = countryFilter { params["country"] = cc }

            let r: Resp = try await api.request(.init(
                path: "/feed/discovery", method: .GET, queryParams: params
            ))
            if reset { posts = r.items } else {
                let ids = Set(posts.map(\.id))
                posts.append(contentsOf: r.items.filter { !ids.contains($0.id) })
            }
            hasMore = r.hasMore; cursor = r.nextCursor
        } catch {}
    }
}

struct DiscoveryView: View {
    @StateObject private var vm = DiscoveryViewModel()
    @State private var searchText = ""

    private let gridColumns = [GridItem(.flexible()), GridItem(.flexible()), GridItem(.flexible())]

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVGrid(columns: gridColumns, spacing: 2) {
                    ForEach(vm.posts) { post in
                        NavigationLink(destination: PostDetailView(postId: post.id)) {
                            PostThumbnailView(post: post)
                                .onAppear {
                                    if post.id == vm.posts.last?.id {
                                        Task { await vm.load() }
                                    }
                                }
                        }
                    }
                }

                if vm.isLoading {
                    ProgressView().padding()
                }
            }
            .navigationTitle("Explorar")
            .navigationBarTitleDisplayMode(.large)
            .searchable(text: $searchText, prompt: "Pesquisar destinos…")
            .refreshable { await vm.load(reset: true) }
        }
        .task { await vm.load(reset: true) }
    }
}

struct PostThumbnailView: View {
    let post: Post
    var body: some View {
        AsyncImage(url: URL(string: post.coverMedia?.thumbnailUrl ?? post.coverMedia?.url ?? "")) { img in
            img.resizable().scaledToFill()
        } placeholder: {
            Rectangle().fill(Color.secondary.opacity(0.12))
                .overlay(
                    Text(post.locationName ?? post.countryCode ?? "")
                        .font(.caption2).foregroundStyle(.secondary)
                )
        }
        .frame(height: 130)
        .clipped()
    }
}

// MARK: ─────────────────────────────────────────────
// MARK: ExpensesView
// ─────────────────────────────────────────────────

@MainActor
final class ExpensesViewModel: ObservableObject {
    @Published var expenses: [Expense]      = []
    @Published var summary: ExpenseSummary? = nil
    @Published var isLoading                = false
    @Published var showAddSheet             = false
    @Published var error: String?           = nil

    let itineraryId: String
    private let api = APIClient.shared

    init(itineraryId: String) { self.itineraryId = itineraryId }

    func load() async {
        isLoading = true; defer { isLoading = false }
        do {
            struct Resp: Decodable { let items: [Expense]; let summary: ExpenseSummary }
            let r: Resp = try await api.request(.init(
                path: "/itineraries/\(itineraryId)/expenses", method: .GET
            ))
            expenses = r.items; summary = r.summary
        } catch let e as APIError { error = e.errorDescription }
    }

    func delete(_ expense: Expense) async {
        try? await api.requestVoid(.init(
            path: "/itineraries/\(itineraryId)/expenses/\(expense.id)", method: .DELETE
        ))
        expenses.removeAll { $0.id == expense.id }
        await load() // Recarregar para totais actualizados
    }
}

struct ExpensesView: View {
    let itineraryId: String
    @StateObject private var vm: ExpensesViewModel
    @Environment(\.dismiss) private var dismiss

    init(itineraryId: String) {
        self.itineraryId = itineraryId
        _vm = StateObject(wrappedValue: ExpensesViewModel(itineraryId: itineraryId))
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    // Resumo
                    if let summary = vm.summary {
                        ExpenseSummaryCard(summary: summary)
                            .padding(.horizontal, 16)
                    }

                    // Lista de gastos
                    if vm.expenses.isEmpty && !vm.isLoading {
                        EmptyStateView(
                            icon: "creditcard",
                            title: "Sem gastos registados",
                            message: "Toca em + para registar o primeiro gasto da viagem.",
                            action: ("Adicionar gasto", { vm.showAddSheet = true })
                        )
                        .padding(.top, 20)
                    } else {
                        LazyVStack(spacing: 8) {
                            ForEach(vm.expenses) { expense in
                                ExpenseRow(expense: expense)
                                    .padding(.horizontal, 16)
                                    .swipeActions(edge: .trailing) {
                                        Button(role: .destructive) {
                                            Task { await vm.delete(expense) }
                                        } label: { Label("Apagar", systemImage: "trash") }
                                    }
                            }
                        }
                    }
                }
                .padding(.vertical, 12)
            }
            .navigationTitle("Gastos da viagem")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Fechar") { dismiss() } }
                ToolbarItem(placement: .primaryAction) {
                    Button { vm.showAddSheet = true } label: { Image(systemName: "plus") }
                }
            }
            .sheet(isPresented: $vm.showAddSheet, onDismiss: { Task { await vm.load() } }) {
                AddExpenseView(itineraryId: itineraryId)
            }
        }
        .task { await vm.load() }
    }
}

struct ExpenseSummaryCard: View {
    let summary: ExpenseSummary

    var body: some View {
        VStack(spacing: 12) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Total gasto")
                        .font(.caption).foregroundStyle(.secondary)
                    Text("€\(summary.totalEurCents / 100)")
                        .font(.title).fontWeight(.bold)
                }
                Spacer()
                if let remaining = summary.budgetRemainingEurCents {
                    VStack(alignment: .trailing, spacing: 2) {
                        Text(remaining >= 0 ? "Abaixo do orçamento" : "Acima do orçamento")
                            .font(.caption).foregroundStyle(.secondary)
                        Text("€\(abs(remaining) / 100)")
                            .font(.title3).fontWeight(.semibold)
                            .foregroundStyle(remaining >= 0 ? .green : .red)
                    }
                }
            }

            // Barra de progresso vs orçamento
            if let estimated = summary.estimatedTotalEurCents, estimated > 0 {
                let ratio = min(Double(summary.totalEurCents) / Double(estimated), 1.0)
                VStack(alignment: .leading, spacing: 4) {
                    GeometryReader { geo in
                        ZStack(alignment: .leading) {
                            RoundedRectangle(cornerRadius: 4).fill(Color.secondary.opacity(0.15))
                            RoundedRectangle(cornerRadius: 4)
                                .fill(ratio > 0.9 ? Color.red : Color.memovoyBlue)
                                .frame(width: geo.size.width * ratio)
                        }
                    }
                    .frame(height: 8)
                    HStack {
                        Text("€\(summary.totalEurCents / 100) gastos")
                        Spacer()
                        Text("Orçamento: €\(estimated / 100)")
                    }
                    .font(.caption).foregroundStyle(.secondary)
                }
            }

            // Por categoria
            if !summary.byCategory.isEmpty {
                Divider()
                ForEach(summary.byCategory.prefix(4)) { cat in
                    HStack {
                        Text(categoryIcon(cat.category))
                        Text(cat.category.capitalized)
                            .font(.subheadline)
                        Spacer()
                        Text("€\(cat.totalEurCents / 100)")
                            .font(.subheadline).fontWeight(.semibold)
                        Text("(\(cat.count))")
                            .font(.caption).foregroundStyle(.secondary)
                    }
                }
            }
        }
        .padding(16)
        .background(Color(.systemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 14))
        .shadow(color: .black.opacity(0.06), radius: 6, y: 2)
    }

    private func categoryIcon(_ cat: String) -> String {
        switch cat {
        case "food":          return "🍜"
        case "transport":     return "🚆"
        case "accommodation": return "🏨"
        case "activities":    return "🎯"
        case "shopping":      return "🛍"
        case "health":        return "💊"
        default:              return "💳"
        }
    }
}

struct ExpenseRow: View {
    let expense: Expense
    var body: some View {
        HStack(spacing: 12) {
            Text(categoryIcon(expense.category))
                .font(.title2)
                .frame(width: 40, height: 40)
                .background(Color.secondary.opacity(0.08))
                .clipShape(Circle())

            VStack(alignment: .leading, spacing: 2) {
                Text(expense.description ?? expense.category.capitalized)
                    .font(.subheadline)
                if let dayNum = expense.dayNumber {
                    Text("Dia \(dayNum)")
                        .font(.caption).foregroundStyle(.secondary)
                }
                Text(expense.spentAt.relativeFormatted)
                    .font(.caption2).foregroundStyle(.secondary)
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 1) {
                Text("\(expense.amountCents / 100) \(expense.currency)")
                    .font(.subheadline).fontWeight(.semibold)
                if let eur = expense.amountEurCents, expense.currency != "EUR" {
                    Text("≈ €\(eur / 100)")
                        .font(.caption2).foregroundStyle(.secondary)
                }
            }
        }
        .padding(12)
        .background(Color(.systemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .shadow(color: .black.opacity(0.04), radius: 3, y: 1)
    }

    private func categoryIcon(_ cat: String) -> String {
        switch cat {
        case "food": return "🍜"; case "transport": return "🚆"
        case "accommodation": return "🏨"; case "activities": return "🎯"
        case "shopping": return "🛍"; case "health": return "💊"
        default: return "💳"
        }
    }
}

struct AddExpenseView: View {
    let itineraryId: String
    @Environment(\.dismiss) private var dismiss
    @State private var amountStr  = ""
    @State private var currency   = "EUR"
    @State private var category   = "food"
    @State private var description = ""
    @State private var isLoading  = false
    @State private var error: String? = nil
    private let api = APIClient.shared

    let categories = ["food","transport","accommodation","activities","shopping","health","other"]
    let currencies = ["EUR","USD","GBP","BRL","JPY","CHF","CAD"]

    var body: some View {
        NavigationStack {
            Form {
                Section("Valor") {
                    HStack {
                        TextField("0", text: $amountStr).keyboardType(.decimalPad)
                        Picker("", selection: $currency) {
                            ForEach(currencies, id: \.self) { Text($0).tag($0) }
                        }.pickerStyle(.menu)
                    }
                }
                Section("Categoria") {
                    Picker("Categoria", selection: $category) {
                        ForEach(categories, id: \.self) { Text($0.capitalized).tag($0) }
                    }
                }
                Section("Descrição (opcional)") {
                    TextField("Ex: Ramen Ichiran", text: $description)
                }
                if let e = error {
                    Section { Text(e).foregroundStyle(.red) }
                }
            }
            .navigationTitle("Registar gasto")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancelar") { dismiss() } }
                ToolbarItem(placement: .primaryAction) {
                    Button("Guardar") { Task { await save() } }
                        .disabled(amountStr.isEmpty || isLoading)
                }
            }
        }
    }

    private func save() async {
        guard let amount = Double(amountStr.replacingOccurrences(of: ",", with: ".")) else {
            error = "Valor inválido"; return
        }
        let amountCents = Int(amount * 100)
        isLoading = true; defer { isLoading = false }
        do {
            try await api.requestVoid(.init(
                path: "/itineraries/\(itineraryId)/expenses",
                method: .POST,
                body: [
                    "amountCents": amountCents, "currency": currency,
                    "category": category,
                    "description": description.isEmpty ? nil : description as Any,
                ]
            ))
            dismiss()
        } catch let e as APIError { error = e.errorDescription }
    }
}

// MARK: ─────────────────────────────────────────────
// MARK: CreateItinerarySheet
// ─────────────────────────────────────────────────

struct CreateItinerarySheet: View {
    @Environment(\.dismiss) private var dismiss
    @State private var mode: Mode = .choose

    enum Mode { case choose, manual, wizard }

    var body: some View {
        NavigationStack {
            switch mode {
            case .choose:
                CreateChoiceView(
                    onManual: { mode = .manual },
                    onWizard: { mode = .wizard }
                )
            case .manual:
                ManualItineraryForm(onDismiss: { dismiss() })
            case .wizard:
                WizardView(onDismiss: { dismiss() })
            }
        }
    }
}

struct CreateChoiceView: View {
    let onManual: () -> Void
    let onWizard: () -> Void

    var body: some View {
        VStack(spacing: 24) {
            Spacer()
            Text("Como queres criar o roteiro?")
                .font(.title2).fontWeight(.bold)
                .multilineTextAlignment(.center)

            VStack(spacing: 14) {
                ChoiceCard(
                    icon: "sparkles", iconColor: .memovoyBlue,
                    title: "Com Inteligência Artificial",
                    subtitle: "Responde a 6 perguntas e a IA cria um roteiro personalizado em segundos.",
                    action: onWizard
                )
                ChoiceCard(
                    icon: "pencil.and.list.clipboard", iconColor: .memovoyGreen,
                    title: "Manualmente",
                    subtitle: "Cria e organiza os teus próprios dias e actividades.",
                    action: onManual
                )
            }
            .padding(.horizontal, 24)
            Spacer()
        }
        .navigationTitle("Novo roteiro")
        .navigationBarTitleDisplayMode(.inline)
    }
}

struct ChoiceCard: View {
    let icon: String; let iconColor: Color
    let title: String; let subtitle: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 16) {
                Image(systemName: icon)
                    .font(.title2)
                    .frame(width: 52, height: 52)
                    .background(iconColor.opacity(0.12))
                    .foregroundStyle(iconColor)
                    .clipShape(RoundedRectangle(cornerRadius: 12))

                VStack(alignment: .leading, spacing: 4) {
                    Text(title).font(.headline)
                    Text(subtitle).font(.caption).foregroundStyle(.secondary)
                        .multilineTextAlignment(.leading)
                }
                Spacer()
                Image(systemName: "chevron.right").foregroundStyle(.secondary)
            }
            .padding(16)
            .background(Color(.systemBackground))
            .clipShape(RoundedRectangle(cornerRadius: 14))
            .shadow(color: .black.opacity(0.06), radius: 6, y: 2)
        }
        .buttonStyle(.plain)
    }
}

// Stub para ManualItineraryForm e WizardView
struct ManualItineraryForm: View {
    let onDismiss: () -> Void
    var body: some View {
        Text("Formulário manual — implementado no WizardView.swift")
            .navigationTitle("Criar manualmente")
    }
}
