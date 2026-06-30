// MemoVoy/Core/Auth/TokenStore.swift
// Armazena tokens JWT no Keychain (nunca em UserDefaults ou memória).
// Actor garante acesso thread-safe sem locks manuais.

import Foundation
import Security

actor TokenStore {

    static let shared = TokenStore()

    private let accessTokenKey  = "com.memovoy.accessToken"
    private let userIdKey       = "com.memovoy.userId"

    private var _accessToken: String?
    private var _userId:      String?

    private init() {
        // Carregar tokens do Keychain ao inicializar
        _accessToken = readKeychain(key: accessTokenKey)
        _userId      = readKeychain(key: userIdKey)
    }

    // MARK: - Accessors

    var accessToken: String? { _accessToken }
    var userId:      String? { _userId }
    var isLoggedIn:  Bool    { _accessToken != nil }

    // MARK: - Mutators

    func setAccessToken(_ token: String) {
        _accessToken = token
        writeKeychain(key: accessTokenKey, value: token)
    }

    func setUserId(_ id: String) {
        _userId = id
        writeKeychain(key: userIdKey, value: id)
    }

    func clear() {
        _accessToken = nil
        _userId      = nil
        deleteKeychain(key: accessTokenKey)
        deleteKeychain(key: userIdKey)
    }

    // MARK: - Keychain helpers

    private func readKeychain(key: String) -> String? {
        let query: [CFString: Any] = [
            kSecClass:           kSecClassGenericPassword,
            kSecAttrAccount:     key,
            kSecReturnData:      true,
            kSecMatchLimit:      kSecMatchLimitOne,
            kSecAttrAccessible:  kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
        ]
        var result: AnyObject?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
              let data = result as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    private func writeKeychain(key: String, value: String) {
        guard let data = value.data(using: .utf8) else { return }
        // Tentar actualizar primeiro
        let updateQuery: [CFString: Any] = [
            kSecClass:       kSecClassGenericPassword,
            kSecAttrAccount: key,
        ]
        let updateAttrs: [CFString: Any] = [
            kSecValueData:       data,
            kSecAttrAccessible:  kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
        ]
        let status = SecItemUpdate(updateQuery as CFDictionary, updateAttrs as CFDictionary)

        if status == errSecItemNotFound {
            // Item não existe — criar
            let addQuery: [CFString: Any] = [
                kSecClass:           kSecClassGenericPassword,
                kSecAttrAccount:     key,
                kSecValueData:       data,
                kSecAttrAccessible:  kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
            ]
            SecItemAdd(addQuery as CFDictionary, nil)
        }
    }

    private func deleteKeychain(key: String) {
        let query: [CFString: Any] = [
            kSecClass:       kSecClassGenericPassword,
            kSecAttrAccount: key,
        ]
        SecItemDelete(query as CFDictionary)
    }
}
