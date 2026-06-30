// MemoVoy/Features/Itineraries/ItinerariesView.swift
// Lista de roteiros do utilizador + detalhe com dias, actividades e carbono.

import SwiftUI
import MapKit

// MARK: - ViewModel: lista

@MainActor
final class ItinerariesViewModel: ObservableObject {
    @Published var itineraries: [Itinerary] = []
    @Published var isLoading    = false
    @Published var error: String? = nil
    @Published var filter: Itinerary.Status? = nil  // nil = todos

    private let api = APIClient.shared

    func load() async {
        guard !isLoading else { return }
        isLoading = true
        error     = nil
        defer { isLoading = false }

        do {
            struct Response: Decodable { let itineraries: [Itinerary] }
            var params: [String: Any] = ["limit": 50]
            if let f = filter { params["status"] = f.rawValue }

            let resp: Response = try await api.request(.init(
                path: "/itineraries/mine", method: .GET, queryParams: params
            ))
            itineraries = resp.itineraries
        } catch let e as APIError { error = e.errorDescription }
          catch { self.error = "Não foi possível carregar os roteiros." }
    }

    func delete(_ itinerary: Itinerary) async {
        do {
            try await api.requestVoid(.init(path: "/itineraries/\(itinerary.id)", method: .DELETE))
            itineraries.removeAll { $0.id == itinerary.id }
        } catch { /* erro silencioso — tentar de novo */ }
    }
}

// MARK: - Lista de roteiros

struct ItinerariesView: View {
    @StateObject private var vm = ItinerariesViewModel()
    @State private var showCreate = false

    private let filters: [(String, Itinerary.Status?)] = [
        ("Todos", nil), ("Publicados", .published), ("Rascunhos", .draft)
    ]

    var body: some View {
        NavigationStack {
            Group {
                if vm.isLoading && vm.itineraries.isEmpty {
                    ProgressView("A carregar roteiros…")
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if vm.itineraries.isEmpty {
                    EmptyStateView(
                        icon:    "map",
                        title:   "Sem roteiros",
                        message: "Cria o teu primeiro roteiro manualmente ou com a IA.",
                        action:  ("Criar roteiro", { showCreate = true })
                    )
                } else {
                    ScrollView {
                        // Filtros de estado
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 8) {
                                ForEach(filters, id: \.0) { label, status in
                                    FilterChip(
                                        label:      label,
                                        isSelected: vm.filter == status,
                                        action:     {
                                            vm.filter = status
                                            Task { await vm.load() }
                                        }
                                    )
                                }
                            }
                            .padding(.horizontal, 16)
                        }
                        .padding(.vertical, 8)

                        LazyVStack(spacing: 12) {
                            ForEach(vm.itineraries) { itinerary in
                                NavigationLink(value: itinerary) {
                                    ItineraryCardView(itinerary: itinerary)
                                        .padding(.horizontal, 16)
                                }
                                .buttonStyle(.plain)
                                .swipeActions(edge: .trailing) {
                                    Button(role: .destructive) {
                                        Task { await vm.delete(itinerary) }
                                    } label: {
                                        Label("Apagar", systemImage: "trash")
                                    }
                                }
                            }
                        }
                        .padding(.vertical, 8)
                    }
                    .refreshable { await vm.load() }
                }
            }
            .navigationTitle("Os meus roteiros")
            .navigationDestination(for: Itinerary.self) { itinerary in
                ItineraryDetailView(itineraryId: itinerary.id)
            }
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button { showCreate = true } label: {
                        Image(systemName: "plus")
                    }
                }
            }
            .sheet(isPresented: $showCreate) {
                CreateItinerarySheet()
            }
        }
        .task { await vm.load() }
    }
}

// MARK: - Card de roteiro

struct ItineraryCardView: View {
    let itinerary: Itinerary

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Cover image ou placeholder gradiente
            Group {
                if let url = itinerary.coverImageUrl.flatMap(URL.init) {
                    AsyncImage(url: url) { img in
                        img.resizable().scaledToFill()
                    } placeholder: {
                        ItineraryCoverPlaceholder(name: itinerary.destinationName)
                    }
                } else {
                    ItineraryCoverPlaceholder(name: itinerary.destinationName)
                }
            }
            .frame(height: 140)
            .clipped()
            .overlay(alignment: .topLeading) {
                StatusBadge(status: itinerary.status)
                    .padding(10)
            }
            .overlay(alignment: .topTrailing) {
                if itinerary.aiGenerated {
                    Label("IA", systemImage: "sparkles")
                        .font(.caption2).fontWeight(.semibold)
                        .padding(.horizontal, 8).padding(.vertical, 4)
                        .background(.black.opacity(0.6))
                        .foregroundStyle(.white)
                        .clipShape(Capsule())
                        .padding(10)
                }
            }

            // Informação
            VStack(alignment: .leading, spacing: 6) {
                Text(itinerary.title)
                    .font(.headline)
                    .lineLimit(2)

                HStack(spacing: 12) {
                    Label(itinerary.destinationName, systemImage: "mappin")
                    Label("\(itinerary.durationDays) dias", systemImage: "calendar")
                    Label(itinerary.groupType.label, systemImage: "person.2")
                }
                .font(.caption).foregroundStyle(.secondary)

                // Carbono (se calculado)
                if let co2 = itinerary.totalKgCo2 {
                    HStack(spacing: 4) {
                        Image(systemName: "leaf")
                            .foregroundStyle(.green)
                        Text(String(format: "%.0f kg CO₂", co2))
                            .font(.caption).foregroundStyle(.secondary)
                        if let vs = itinerary.carbonVsAvgPct {
                            Text(vs < 0 ? "\(Int(abs(vs)))% abaixo da média" : "\(Int(vs))% acima")
                                .font(.caption)
                                .foregroundStyle(vs < 0 ? .green : .orange)
                        }
                    }
                }

                HStack {
                    Label("\(itinerary.savesCount)", systemImage: "bookmark")
                    Label("\(itinerary.viewsCount)", systemImage: "eye")
                    Spacer()
                    if let published = itinerary.publishedAt {
                        Text(published.relativeFormatted)
                            .font(.caption2).foregroundStyle(.secondary)
                    }
                }
                .font(.caption).foregroundStyle(.secondary)
            }
            .padding(14)
        }
        .background(Color(.systemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 14))
        .shadow(color: .black.opacity(0.07), radius: 8, y: 2)
    }
}

struct ItineraryCoverPlaceholder: View {
    let name: String
    var body: some View {
        LinearGradient(
            colors: [Color.memovoyBlue.opacity(0.7), Color.memovoyBlue],
            startPoint: .topLeading, endPoint: .bottomTrailing
        )
        .overlay(
            VStack(spacing: 4) {
                Image(systemName: "globe.europe.africa")
                    .font(.largeTitle).foregroundStyle(.white.opacity(0.6))
                Text(name)
                    .font(.headline).foregroundStyle(.white)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 16)
            }
        )
    }
}

struct StatusBadge: View {
    let status: Itinerary.Status
    var body: some View {
        let (label, color): (String, Color) = switch status {
        case .published: ("Publicado", .green)
        case .draft:     ("Rascunho", .orange)
        case .archived:  ("Arquivado", .secondary)
        }
        Text(label)
            .font(.caption2).fontWeight(.bold)
            .padding(.horizontal, 8).padding(.vertical, 4)
            .background(color.opacity(0.9))
            .foregroundStyle(.white)
            .clipShape(Capsule())
    }
}

struct FilterChip: View {
    let label: String
    let isSelected: Bool
    let action: () -> Void
    var body: some View {
        Button(action: action) {
            Text(label)
                .font(.subheadline).fontWeight(isSelected ? .semibold : .regular)
                .padding(.horizontal, 14).padding(.vertical, 7)
                .background(isSelected ? Color.memovoyBlue : Color.secondary.opacity(0.1))
                .foregroundStyle(isSelected ? .white : .primary)
                .clipShape(Capsule())
        }
        .buttonStyle(.plain)
        .animation(.easeInOut(duration: 0.15), value: isSelected)
    }
}

// MARK: - ViewModel: detalhe

@MainActor
final class ItineraryDetailViewModel: ObservableObject {
    @Published var itinerary: Itinerary?
    @Published var isLoading   = false
    @Published var error: String? = nil
    @Published var isPublishing = false

    let itineraryId: String
    private let api = APIClient.shared

    init(itineraryId: String) { self.itineraryId = itineraryId }

    func load() async {
        isLoading = true; error = nil
        defer { isLoading = false }
        do {
            struct Resp: Decodable { let itinerary: Itinerary }
            let r: Resp = try await api.request(.init(path: "/itineraries/\(itineraryId)", method: .GET))
            itinerary = r.itinerary
        } catch let e as APIError { error = e.errorDescription }
          catch { self.error = "Não foi possível carregar o roteiro." }
    }

    func publish() async {
        isPublishing = true; defer { isPublishing = false }
        do {
            struct Resp: Decodable { let itinerary: Itinerary }
            let r: Resp = try await api.request(.init(path: "/itineraries/\(itineraryId)/publish", method: .POST))
            itinerary = r.itinerary
        } catch let e as APIError { error = e.errorDescription }
    }
}

// MARK: - Ecrã de detalhe do roteiro

struct ItineraryDetailView: View {
    let itineraryId: String
    @StateObject private var vm: ItineraryDetailViewModel

    init(itineraryId: String) {
        self.itineraryId = itineraryId
        _vm = StateObject(wrappedValue: ItineraryDetailViewModel(itineraryId: itineraryId))
    }

    var body: some View {
        Group {
            if vm.isLoading {
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let itinerary = vm.itinerary {
                ItineraryDetailContent(itinerary: itinerary, vm: vm)
            } else if let error = vm.error {
                EmptyStateView(icon: "exclamationmark.triangle", title: "Erro",
                               message: error, action: ("Tentar novamente", { Task { await vm.load() } }))
            }
        }
        .task { await vm.load() }
    }
}

struct ItineraryDetailContent: View {
    let itinerary: Itinerary
    @ObservedObject var vm: ItineraryDetailViewModel
    @State private var expandedDayId: String? = nil
    @State private var showMap = false
    @State private var showExpenses = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                // Hero / cover
                Group {
                    if let url = itinerary.coverImageUrl.flatMap(URL.init) {
                        AsyncImage(url: url) { img in
                            img.resizable().scaledToFill()
                        } placeholder: { ItineraryCoverPlaceholder(name: itinerary.destinationName) }
                    } else {
                        ItineraryCoverPlaceholder(name: itinerary.destinationName)
                    }
                }
                .frame(height: 220)
                .clipped()

                VStack(alignment: .leading, spacing: 20) {
                    // Título e meta
                    VStack(alignment: .leading, spacing: 8) {
                        Text(itinerary.title)
                            .font(.title2).fontWeight(.bold)

                        HStack(spacing: 14) {
                            Label(itinerary.destinationName, systemImage: "mappin.circle.fill")
                                .foregroundStyle(.memovoyBlue)
                            Label("\(itinerary.durationDays) dias", systemImage: "calendar")
                            Label(itinerary.groupType.label, systemImage: "person.2")
                        }
                        .font(.subheadline).foregroundStyle(.secondary)
                    }

                    // Carbono
                    if let co2 = itinerary.totalKgCo2 {
                        CarbonSummaryView(
                            totalKg: co2,
                            transportKg: 0,
                            accomKg: 0,
                            vsAvgPct: itinerary.carbonVsAvgPct
                        )
                    }

                    // Acções
                    HStack(spacing: 10) {
                        if itinerary.status == .draft {
                            Button {
                                Task { await vm.publish() }
                            } label: {
                                Label(vm.isPublishing ? "A publicar…" : "Publicar",
                                      systemImage: "paperplane")
                                    .frame(maxWidth: .infinity)
                            }
                            .buttonStyle(.borderedProminent)
                            .tint(.memovoyBlue)
                            .disabled(vm.isPublishing)
                        }

                        Button { showMap = true } label: {
                            Label("Mapa", systemImage: "map")
                        }
                        .buttonStyle(.bordered)

                        Button { showExpenses = true } label: {
                            Label("Gastos", systemImage: "creditcard")
                        }
                        .buttonStyle(.bordered)
                    }

                    Divider()

                    // Dias e actividades
                    if let days = itinerary.days, !days.isEmpty {
                        Text("Programa")
                            .font(.title3).fontWeight(.bold)

                        ForEach(days) { day in
                            DayAccordionView(
                                day: day,
                                isExpanded: expandedDayId == day.id,
                                onToggle: {
                                    withAnimation(.spring(response: 0.35)) {
                                        expandedDayId = expandedDayId == day.id ? nil : day.id
                                    }
                                }
                            )
                        }
                    }
                }
                .padding(20)
            }
        }
        .navigationBarTitleDisplayMode(.inline)
        .sheet(isPresented: $showMap) {
            ItineraryMapView(itinerary: itinerary)
        }
        .sheet(isPresented: $showExpenses) {
            ExpensesView(itineraryId: itinerary.id)
        }
    }
}

// MARK: - Accordion de dia

struct DayAccordionView: View {
    let day: ItineraryDay
    let isExpanded: Bool
    let onToggle: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Header do dia
            Button(action: onToggle) {
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Dia \(day.dayNumber)")
                            .font(.subheadline).fontWeight(.bold)
                            .foregroundStyle(.memovoyBlue)
                        if let theme = day.theme {
                            Text(theme)
                                .font(.headline)
                                .foregroundStyle(.primary)
                        }
                        Text(day.date)
                            .font(.caption).foregroundStyle(.secondary)
                    }
                    Spacer()
                    Image(systemName: isExpanded ? "chevron.up" : "chevron.down")
                        .foregroundStyle(.secondary)
                        .fontWeight(.semibold)
                }
                .padding(14)
                .background(Color(.systemBackground))
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .shadow(color: .black.opacity(0.05), radius: 4, y: 1)
            }
            .buttonStyle(.plain)

            // Actividades (colapsável)
            if isExpanded {
                VStack(spacing: 8) {
                    ForEach(day.activities) { activity in
                        ActivityRowView(activity: activity)
                    }

                    if let notes = day.notes, !notes.isEmpty {
                        HStack(alignment: .top, spacing: 10) {
                            Image(systemName: "note.text")
                                .foregroundStyle(.secondary)
                            Text(notes)
                                .font(.subheadline).foregroundStyle(.secondary)
                        }
                        .padding(12)
                        .background(Color.secondary.opacity(0.06))
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                    }
                }
                .padding(.top, 8)
                .transition(.opacity.combined(with: .move(edge: .top)))
            }
        }
        .padding(.bottom, 8)
    }
}

// MARK: - Linha de actividade

struct ActivityRowView: View {
    let activity: Activity

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            // Ícone da categoria
            Text(activity.category?.icon ?? "📍")
                .font(.title3)
                .frame(width: 36, height: 36)
                .background(Color.memovoyBlue.opacity(0.08))
                .clipShape(Circle())

            VStack(alignment: .leading, spacing: 3) {
                HStack {
                    Text(activity.name)
                        .font(.subheadline).fontWeight(.semibold)
                    Spacer()
                    if let time = activity.startTime {
                        Text(time)
                            .font(.caption).foregroundStyle(.secondary)
                    }
                }

                if let address = activity.address {
                    Text(address)
                        .font(.caption).foregroundStyle(.secondary)
                        .lineLimit(1)
                }

                HStack(spacing: 10) {
                    if let duration = activity.durationMinutes {
                        Label("\(duration)min", systemImage: "clock")
                            .font(.caption2).foregroundStyle(.secondary)
                    }
                    if let price = activity.priceEstimate {
                        Label(price == 0 ? "Grátis" : "~€\(price / 100)", systemImage: "eurosign")
                            .font(.caption2).foregroundStyle(.secondary)
                    }
                    if activity.aiSuggested == true {
                        Image(systemName: "sparkles")
                            .font(.caption2).foregroundStyle(.memovoyBlue)
                    }
                }

                // Aviso da IA
                if let warning = activity.aiWarning, !warning.isEmpty {
                    Label(warning, systemImage: "exclamationmark.triangle")
                        .font(.caption).foregroundStyle(.orange)
                        .padding(8)
                        .background(Color.orange.opacity(0.08))
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                }

                // Link de reserva
                if let urlStr = activity.bookingUrl, let url = URL(string: urlStr) {
                    Link(destination: url) {
                        Label("Reservar", systemImage: "arrow.up.right.square")
                            .font(.caption).foregroundStyle(.memovoyBlue)
                    }
                }
            }
        }
        .padding(12)
        .background(Color(.systemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .shadow(color: .black.opacity(0.04), radius: 3, y: 1)
    }
}

// MARK: - Carbon summary

struct CarbonSummaryView: View {
    let totalKg: Double
    let transportKg: Double
    let accomKg: Double
    let vsAvgPct: Double?

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Label("Pegada de Carbono", systemImage: "leaf.fill")
                    .font(.subheadline).fontWeight(.semibold)
                    .foregroundStyle(.green)
                Spacer()
                Text(String(format: "%.0f kg CO₂", totalKg))
                    .font(.title3).fontWeight(.bold)
            }

            // Barra de transportes
            if transportKg > 0 || accomKg > 0 {
                VStack(spacing: 6) {
                    CarbonBarRow(label: "Transportes", kg: transportKg, total: totalKg, color: .red)
                    CarbonBarRow(label: "Alojamento",  kg: accomKg,    total: totalKg, color: .orange)
                }
            }

            if let pct = vsAvgPct {
                HStack(spacing: 4) {
                    Image(systemName: pct < 0 ? "arrow.down.circle.fill" : "arrow.up.circle.fill")
                    Text(pct < 0
                         ? "\(Int(abs(pct)))% abaixo da média para este destino"
                         : "\(Int(pct))% acima da média para este destino")
                        .font(.caption)
                }
                .foregroundStyle(pct < 0 ? .green : .orange)
            }
        }
        .padding(14)
        .background(Color.green.opacity(0.06))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}

struct CarbonBarRow: View {
    let label: String; let kg: Double; let total: Double; let color: Color
    var body: some View {
        HStack(spacing: 8) {
            Text(label).font(.caption).foregroundStyle(.secondary).frame(width: 90, alignment: .leading)
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 3).fill(Color.secondary.opacity(0.15))
                    RoundedRectangle(cornerRadius: 3).fill(color)
                        .frame(width: total > 0 ? geo.size.width * CGFloat(kg / total) : 0)
                }
            }
            .frame(height: 6)
            Text(String(format: "%.0f kg", kg)).font(.caption2).foregroundStyle(.secondary).frame(width: 44)
        }
    }
}

// MARK: - Mapa do roteiro

struct ItineraryMapView: View {
    let itinerary: Itinerary
    @Environment(\.dismiss) private var dismiss

    // Todas as coordenadas das actividades
    private var coordinates: [CLLocationCoordinate2D] {
        itinerary.days?
            .flatMap(\.activities)
            .compactMap { act in
                guard let lat = act.lat, let lng = act.lng else { return nil }
                return CLLocationCoordinate2D(latitude: lat, longitude: lng)
            } ?? []
    }

    @State private var region = MKCoordinateRegion(
        center: CLLocationCoordinate2D(latitude: 0, longitude: 0),
        span: MKCoordinateSpan(latitudeDelta: 0.1, longitudeDelta: 0.1)
    )

    var body: some View {
        NavigationStack {
            Map(coordinateRegion: $region, annotationItems: mapAnnotations) { item in
                MapAnnotation(coordinate: item.coordinate) {
                    VStack(spacing: 2) {
                        Text(item.icon)
                            .font(.title3)
                            .padding(6)
                            .background(Color.memovoyBlue)
                            .clipShape(Circle())
                            .shadow(radius: 3)
                        Text(item.name)
                            .font(.caption2)
                            .padding(.horizontal, 6).padding(.vertical, 2)
                            .background(.white.opacity(0.9))
                            .clipShape(RoundedRectangle(cornerRadius: 4))
                            .shadow(radius: 1)
                    }
                }
            }
            .navigationTitle("Mapa — \(itinerary.destinationName)")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Fechar") { dismiss() }
                }
            }
            .onAppear { fitMapToCoordinates() }
        }
    }

    private var mapAnnotations: [MapAnnotationItem] {
        itinerary.days?
            .flatMap(\.activities)
            .compactMap { act in
                guard let lat = act.lat, let lng = act.lng else { return nil }
                return MapAnnotationItem(
                    id:         act.id,
                    name:       act.name,
                    icon:       act.category?.icon ?? "📍",
                    coordinate: CLLocationCoordinate2D(latitude: lat, longitude: lng)
                )
            } ?? []
    }

    private func fitMapToCoordinates() {
        guard !coordinates.isEmpty else { return }
        let lats = coordinates.map(\.latitude)
        let lngs = coordinates.map(\.longitude)
        let center = CLLocationCoordinate2D(
            latitude:  (lats.min()! + lats.max()!) / 2,
            longitude: (lngs.min()! + lngs.max()!) / 2
        )
        let span = MKCoordinateSpan(
            latitudeDelta:  (lats.max()! - lats.min()!) * 1.4 + 0.02,
            longitudeDelta: (lngs.max()! - lngs.min()!) * 1.4 + 0.02
        )
        region = MKCoordinateRegion(center: center, span: span)
    }
}

struct MapAnnotationItem: Identifiable {
    let id: String; let name: String; let icon: String; let coordinate: CLLocationCoordinate2D
}
