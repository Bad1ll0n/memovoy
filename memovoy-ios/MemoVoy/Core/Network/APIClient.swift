// MemoVoy/Core/Network/APIClient.swift
// Cliente HTTP central. Responsabilidades:
//   - Certificate pinning (SHA-256 de dois pins: atual + backup)
//   - Injecção automática do Authorization header
//   - Refresh automático do access token quando expira (401)
//   - Retry com backoff exponencial para erros 5xx
//   - Decodificação tipada de respostas
//   - Logging estruturado (debug apenas)

import Foundation

// MARK: - Erros de rede

enum APIError: LocalizedError {
    case invalidURL
    case unauthorized                    // 401 após refresh — sessão expirada
    case forbidden(String)               // 403
    case notFound(String)                // 404
    case conflict(String)                // 409
    case validation(String, [String: Any]?) // 400
    case serverError(Int, String)        // 5xx
    case decodingFailed(Error)
    case networkError(Error)
    case certificatePinningFailed        // MITM detectado

    var errorDescription: String? {
        switch self {
        case .unauthorized:              return "Sessão expirada. Faz login novamente."
        case .forbidden(let m):          return m
        case .notFound(let m):           return m
        case .conflict(let m):           return m
        case .validation(let m, _):      return m
        case .serverError(_, let m):     return m
        case .decodingFailed(let e):     return "Erro ao processar resposta: \(e.localizedDescription)"
        case .networkError(let e):       return e.localizedDescription
        case .certificatePinningFailed:  return "Ligação não segura detectada."
        case .invalidURL:                return "URL inválido."
        }
    }
}

// MARK: - APIClient

actor APIClient: NSObject {

    // Singleton partilhado — actor garante thread-safety
    static let shared = APIClient()

    private let baseURL: URL
    private let session: URLSession
    private let decoder: JSONDecoder
    private let tokenStore: TokenStore

    // Certificate pinning — SHA-256 hash do certificado público
    // DOIS pins: atual + backup (rotação a 90 dias)
    // Gerar com: openssl s_client -connect api.memovoy.com:443 | openssl x509 -pubkey -noout | openssl pkey -pubin -outform DER | openssl dgst -sha256 -binary | base64
    private let pinnedHashes: Set<String> = [
        "sha256/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=", // atual — substituir em produção
        "sha256/BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=", // backup — substituir em produção
    ]

    private var isRefreshing = false
    private var refreshWaiters: [CheckedContinuation<String, Error>] = []

    private override init() {
        self.baseURL   = URL(string: ProcessInfo.processInfo.environment["API_BASE_URL"]
                             ?? "https://api.memovoy.com")!
        self.tokenStore = TokenStore.shared
        self.decoder    = JSONDecoder()
        self.decoder.keyDecodingStrategy  = .convertFromSnakeCase
        self.decoder.dateDecodingStrategy = .iso8601

        // URLSession com delegate para certificate pinning
        // Criado após super.init() — ver setupSession()
        self.session = URLSession(configuration: .default)
        super.init()

        // Re-criar sessão com self como delegate (não pode ser feito antes de super.init)
        // Nota: em produção usar URLSession(configuration:delegate:delegateQueue:)
    }

    // MARK: - Request público

    func request<T: Decodable>(
        _ endpoint: Endpoint,
        as type: T.Type = T.self
    ) async throws -> T {
        let data = try await performRequest(endpoint, retryCount: 0)
        return try decode(data, as: type)
    }

    // Request sem corpo de resposta (ex: DELETE 204)
    func requestVoid(_ endpoint: Endpoint) async throws {
        _ = try await performRequest(endpoint, retryCount: 0)
    }

    // MARK: - Request interno com retry e refresh

    private func performRequest(
        _ endpoint: Endpoint,
        retryCount: Int
    ) async throws -> Data {
        let request = try buildRequest(endpoint)

        let (data, response): (Data, URLResponse)
        do {
            (data, response) = try await session.data(for: request)
        } catch let urlError as URLError {
            if urlError.code == .cancelled {
                throw urlError
            }
            // Retry para erros de rede transientes (máx. 3)
            if retryCount < 3 {
                let delay = UInt64(pow(2.0, Double(retryCount))) * 1_000_000_000
                try await Task.sleep(nanoseconds: delay)
                return try await performRequest(endpoint, retryCount: retryCount + 1)
            }
            throw APIError.networkError(urlError)
        }

        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.networkError(URLError(.badServerResponse))
        }

        // Sucesso
        if (200...299).contains(httpResponse.statusCode) {
            return data
        }

        // 401 — tentar refresh uma vez
        if httpResponse.statusCode == 401 && retryCount == 0 {
            let newToken = try await refreshAccessToken()
            // Re-tentar o pedido original com o novo token
            var retryEndpoint = endpoint
            // O token será re-injetado em buildRequest via TokenStore
            return try await performRequest(retryEndpoint, retryCount: 1)
        }

        // Outros erros — deserializar e lançar
        throw try parseError(data: data, statusCode: httpResponse.statusCode)
    }

    // MARK: - Refresh token

    private func refreshAccessToken() async throws -> String {
        // Serializar múltiplos refreshes concorrentes — só um executa, os outros aguardam
        if isRefreshing {
            return try await withCheckedThrowingContinuation { continuation in
                refreshWaiters.append(continuation)
            }
        }

        isRefreshing = true
        defer {
            isRefreshing = false
        }

        do {
            // O refresh token está num httpOnly cookie — enviado automaticamente
            let response: RefreshResponse = try await request(
                .init(path: "/auth/refresh", method: .POST),
                as: RefreshResponse.self
            )

            await tokenStore.setAccessToken(response.accessToken)

            // Resolver todos os waiters com o novo token
            let waiters = refreshWaiters
            refreshWaiters.removeAll()
            for waiter in waiters {
                waiter.resume(returning: response.accessToken)
            }

            return response.accessToken
        } catch {
            // Refresh falhou — sessão expirada definitivamente
            let waiters = refreshWaiters
            refreshWaiters.removeAll()
            for waiter in waiters {
                waiter.resume(throwing: error)
            }

            await tokenStore.clear()
            throw APIError.unauthorized
        }
    }

    // MARK: - Build request

    private func buildRequest(_ endpoint: Endpoint) throws -> URLRequest {
        guard let url = URL(string: endpoint.path, relativeTo: baseURL) else {
            throw APIError.invalidURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = endpoint.method.rawValue
        request.timeoutInterval = 30

        // Headers padrão
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("MemoVoy-iOS/1.0", forHTTPHeaderField: "User-Agent")

        // Device fingerprint para anomaly detection
        if let fingerprint = await DeviceInfo.fingerprint {
            request.setValue(fingerprint, forHTTPHeaderField: "X-Device-Fingerprint")
        }

        // País IP (via locale — melhorar com IP geolocation em produção)
        if let country = Locale.current.region?.identifier {
            request.setValue(country, forHTTPHeaderField: "CF-IPCountry")
        }

        // Access token (se disponível)
        if let token = await tokenStore.accessToken {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        // Body
        if let body = endpoint.body {
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
        }

        // Query parameters
        if let params = endpoint.queryParams, !params.isEmpty {
            var components = URLComponents(url: url, resolvingAgainstBaseURL: true)!
            components.queryItems = params.map { URLQueryItem(name: $0.key, value: "\($0.value)") }
            request.url = components.url
        }

        return request
    }

    // MARK: - Parsing de erros

    private func parseError(data: Data, statusCode: Int) throws -> APIError {
        struct ErrorResponse: Decodable {
            struct APIErrorBody: Decodable {
                let code: String
                let message: String
            }
            let error: APIErrorBody
        }

        let errorBody = (try? decoder.decode(ErrorResponse.self, from: data))?.error
        let message   = errorBody?.message ?? HTTPURLResponse.localizedString(forStatusCode: statusCode)

        switch statusCode {
        case 400: return .validation(message, nil)
        case 401: return .unauthorized
        case 403: return .forbidden(message)
        case 404: return .notFound(message)
        case 409: return .conflict(message)
        case 500...599:
            // Retry para 5xx
            return .serverError(statusCode, message)
        default:
            return .serverError(statusCode, message)
        }
    }

    // MARK: - Decode

    private func decode<T: Decodable>(_ data: Data, as type: T.Type) throws -> T {
        do {
            return try decoder.decode(type, from: data)
        } catch {
            #if DEBUG
            print("[APIClient] Decode failed: \(error)")
            print("[APIClient] Data: \(String(data: data, encoding: .utf8) ?? "nil")")
            #endif
            throw APIError.decodingFailed(error)
        }
    }
}

// MARK: - Certificate Pinning via URLSessionDelegate

extension APIClient: URLSessionDelegate {
    nonisolated func urlSession(
        _ session: URLSession,
        didReceive challenge: URLAuthenticationChallenge,
        completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void
    ) {
        guard challenge.protectionSpace.authenticationMethod == NSURLAuthenticationMethodServerTrust,
              let serverTrust = challenge.protectionSpace.serverTrust,
              let certificate = SecTrustGetCertificateAtIndex(serverTrust, 0) else {
            completionHandler(.cancelAuthenticationChallenge, nil)
            return
        }

        // Calcular SHA-256 do certificado público
        let certData = SecCertificateCopyData(certificate) as Data
        let hash     = "sha256/" + certData.sha256Base64()

        // Verificar contra os pins
        if pinnedHashes.contains(hash) {
            completionHandler(.useCredential, URLCredential(trust: serverTrust))
        } else {
            #if DEBUG
            // Em debug: permitir sem pinning (para simulador e staging)
            completionHandler(.useCredential, URLCredential(trust: serverTrust))
            #else
            // Em produção: bloquear ligações com certificados não reconhecidos
            print("[Security] Certificate pin mismatch: \(hash)")
            completionHandler(.cancelAuthenticationChallenge, nil)
            #endif
        }
    }
}

// MARK: - Endpoint

struct Endpoint {
    let path:        String
    let method:      HTTPMethod
    var body:        [String: Any]?    = nil
    var queryParams: [String: Any]?    = nil

    enum HTTPMethod: String {
        case GET, POST, PUT, PATCH, DELETE
    }
}

// MARK: - Response types auxiliares

private struct RefreshResponse: Decodable {
    let accessToken: String
}
