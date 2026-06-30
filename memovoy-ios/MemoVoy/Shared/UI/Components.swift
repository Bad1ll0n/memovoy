// MemoVoy/Shared/UI/Components.swift
// Componentes UI reutilizáveis — design system do MemoVoy.

import SwiftUI

// MARK: - Cores

extension Color {
    static let memovoyBlue   = Color(red: 0.094, green: 0.373, blue: 0.647) // #185FA5
    static let memovoyGreen  = Color(red: 0.059, green: 0.431, blue: 0.314) // #0F6E50
    static let memovoyAmber  = Color(red: 0.937, green: 0.624, blue: 0.153) // #EF9F27
}

// MARK: - PrimaryButton

struct PrimaryButton: View {
    let title:     String
    let isLoading: Bool
    var isEnabled: Bool = true
    let action:    () -> Void

    var body: some View {
        Button(action: action) {
            ZStack {
                if isLoading {
                    ProgressView().tint(.white)
                } else {
                    Text(title)
                        .font(.headline)
                }
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 16)
            .background(isEnabled ? Color.memovoyBlue : Color.secondary.opacity(0.3))
            .foregroundStyle(.white)
            .clipShape(RoundedRectangle(cornerRadius: 14))
        }
        .disabled(!isEnabled || isLoading)
        .animation(.easeInOut(duration: 0.2), value: isEnabled)
    }
}

// MARK: - MemoVoyTextField

struct MemoVoyTextField: View {
    let label:            String
    let placeholder:      String
    @Binding var text:    String
    var keyboardType:     UIKeyboardType     = .default
    var autocapitalization: TextInputAutocapitalization = .sentences

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label)
                .font(.subheadline).fontWeight(.medium)

            TextField(placeholder, text: $text)
                .keyboardType(keyboardType)
                .textInputAutocapitalization(autocapitalization)
                .autocorrectionDisabled()
                .padding(14)
                .background(Color.secondary.opacity(0.08))
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .overlay(
                    RoundedRectangle(cornerRadius: 12)
                        .stroke(text.isEmpty ? Color.clear : Color.memovoyBlue.opacity(0.4), lineWidth: 1.5)
                )
        }
    }
}

// MARK: - PasswordField

struct PasswordField: View {
    @Binding var text:         String
    @Binding var showPassword: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Password")
                .font(.subheadline).fontWeight(.medium)

            HStack {
                Group {
                    if showPassword {
                        TextField("Mínimo 8 caracteres", text: $text)
                    } else {
                        SecureField("Mínimo 8 caracteres", text: $text)
                    }
                }
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()

                Button {
                    showPassword.toggle()
                } label: {
                    Image(systemName: showPassword ? "eye.slash" : "eye")
                        .foregroundStyle(.secondary)
                }
            }
            .padding(14)
            .background(Color.secondary.opacity(0.08))
            .clipShape(RoundedRectangle(cornerRadius: 12))
        }
    }
}

// MARK: - AvatarView

struct AvatarView: View {
    let url:  String?
    let size: CGFloat

    var body: some View {
        Group {
            if let urlString = url, let url = URL(string: urlString) {
                AsyncImage(url: url) { image in
                    image.resizable().scaledToFill()
                } placeholder: {
                    AvatarPlaceholder(size: size)
                }
            } else {
                AvatarPlaceholder(size: size)
            }
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
    }
}

struct AvatarPlaceholder: View {
    let size: CGFloat
    var body: some View {
        Circle()
            .fill(Color.memovoyBlue.opacity(0.15))
            .overlay(
                Image(systemName: "person.fill")
                    .font(.system(size: size * 0.5))
                    .foregroundStyle(Color.memovoyBlue)
            )
    }
}

// MARK: - LevelBadgeView

struct LevelBadgeView: View {
    let level: String

    private var config: (label: String, color: Color) {
        switch level {
        case "explorer":     return ("Explorador", .memovoyBlue)
        case "traveler":     return ("Viajante",   .memovoyGreen)
        case "nomad":        return ("Nómada",     .purple)
        case "globetrotter": return ("Globetrotter", .memovoyAmber)
        default:             return (level.capitalized, .secondary)
        }
    }

    var body: some View {
        Text(config.label)
            .font(.caption2).fontWeight(.semibold)
            .padding(.horizontal, 8).padding(.vertical, 3)
            .background(config.color.opacity(0.12))
            .foregroundStyle(config.color)
            .clipShape(Capsule())
    }
}

// MARK: - EmptyStateView

struct EmptyStateView: View {
    let icon:    String
    let title:   String
    let message: String
    var action:  (String, (() -> Void)?)?  // (label, handler) — nil handler = NavigationLink

    var body: some View {
        VStack(spacing: 20) {
            Spacer()
            Image(systemName: icon)
                .font(.system(size: 56))
                .foregroundStyle(Color.secondary.opacity(0.4))
            VStack(spacing: 8) {
                Text(title).font(.title3).fontWeight(.semibold)
                Text(message)
                    .font(.subheadline).foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 32)
            }
            if let (label, handler) = action, let handler {
                Button(label, action: handler)
                    .buttonStyle(.bordered)
                    .tint(.memovoyBlue)
            }
            Spacer()
        }
    }
}

// MARK: - NotificationHub (Observable para badge count)

@MainActor
final class NotificationHub: ObservableObject {
    @Published var unreadCount: Int = 0
    private let api = APIClient.shared

    func refresh() async {
        struct CountResponse: Decodable { let count: Int }
        guard let response = try? await api.request(
            .init(path: "/notifications/unread-count", method: .GET),
            as: CountResponse.self
        ) else { return }
        unreadCount = response.count
    }
}

// MARK: - Extensions

extension Date {
    var relativeFormatted: String {
        let formatter        = RelativeDateTimeFormatter()
        formatter.unitsStyle = .abbreviated
        formatter.locale     = Locale(identifier: "pt_PT")
        return formatter.localizedString(for: self, relativeTo: .now)
    }
}

extension Data {
    func sha256Base64() -> String {
        var digest = [UInt8](repeating: 0, count: Int(CC_SHA256_DIGEST_LENGTH))
        self.withUnsafeBytes {
            _ = CC_SHA256($0.baseAddress, CC_LONG(self.count), &digest)
        }
        return Data(digest).base64EncodedString()
    }
}

// MARK: - DeepLinkHandler

enum DeepLinkHandler {
    static func handle(_ url: URL, authStore: AuthStore?) {
        // memovoy://itineraries/{id} ou https://memovoy.com/i/{id}
        guard let components = URLComponents(url: url, resolvingAgainstBaseURL: true) else { return }
        let path = components.path

        if path.contains("/i/") || path.contains("/itineraries/") {
            let id = path.components(separatedBy: "/").last ?? ""
            NotificationCenter.default.post(name: .openItinerary, object: id)
        } else if path.contains("/u/") || path.contains("/profiles/") {
            let username = path.components(separatedBy: "/").last ?? ""
            NotificationCenter.default.post(name: .openProfile, object: username)
        }
    }

    static func handleNotification(_ data: [String: Any], authStore: AuthStore?) {
        guard let type = data["type"] as? String,
              let id   = data["id"]   as? String else { return }
        switch type {
        case "post":       NotificationCenter.default.post(name: .openPost,      object: id)
        case "itinerary":  NotificationCenter.default.post(name: .openItinerary, object: id)
        case "profile":    NotificationCenter.default.post(name: .openProfile,   object: id)
        default: break
        }
    }
}

extension Notification.Name {
    static let openItinerary = Notification.Name("openItinerary")
    static let openProfile   = Notification.Name("openProfile")
    static let openPost      = Notification.Name("openPost")
}

// MARK: - DeviceInfo

enum DeviceInfo {
    static var id: String {
        if let stored = UserDefaults.standard.string(forKey: "deviceId") { return stored }
        let newId = UUID().uuidString
        UserDefaults.standard.set(newId, forKey: "deviceId")
        return newId
    }

    static var name: String {
        UIDevice.current.name
    }

    static var fingerprint: String? {
        id
    }
}

// MARK: - Post extension (optimistic update helper)

extension Post {
    func withLike(_ liked: Bool) -> Post {
        // Como Post é um struct Decodable, reconstituir com novo estado de like
        // não é trivial sem CodingKeys manuais. Usamos um wrapper mutável.
        // Em produção usar uma classe ou @Observable para estado mutável local.
        self // placeholder — em produção implementar com copy-on-write
    }
}
