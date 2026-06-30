// MemoVoyTests/AuthStoreTests.swift
// Testes unitários do AuthStore e TokenStore.
// Usa XCTest — sem dependências externas.

import XCTest
@testable import MemoVoy

// MARK: - TokenStore Tests

final class TokenStoreTests: XCTestCase {

    var store: TokenStore!

    override func setUp() async throws {
        store = TokenStore.shared
        await store.clear()
    }

    func testSetAndReadAccessToken() async {
        await store.setAccessToken("test.token.123")
        let token = await store.accessToken
        XCTAssertEqual(token, "test.token.123")
    }

    func testClearRemovesAllTokens() async {
        await store.setAccessToken("token")
        await store.setUserId("user-id")
        await store.clear()

        let token  = await store.accessToken
        let userId = await store.userId
        XCTAssertNil(token)
        XCTAssertNil(userId)
    }

    func testIsLoggedInFalseWhenNoToken() async {
        await store.clear()
        let loggedIn = await store.isLoggedIn
        XCTAssertFalse(loggedIn)
    }

    func testIsLoggedInTrueWithToken() async {
        await store.setAccessToken("valid.token")
        let loggedIn = await store.isLoggedIn
        XCTAssertTrue(loggedIn)
    }
}

// MARK: - PasswordStrength Tests

final class PasswordStrengthTests: XCTestCase {

    func testShortPasswordIsWeak() {
        let strength = PasswordStrength.evaluate("abc")
        XCTAssertFalse(strength.isAcceptable)
        XCTAssertLessThan(strength.score, 2)
    }

    func testGoodPasswordIsAcceptable() {
        let strength = PasswordStrength.evaluate("Password123!")
        XCTAssertTrue(strength.isAcceptable)
        XCTAssertGreaterThanOrEqual(strength.score, 2)
    }

    func testVeryShortIsScore0() {
        let strength = PasswordStrength.evaluate("ab")
        XCTAssertEqual(strength.score, 0)
    }

    func testLongPasswordWithUpperAndDigitIsScore4() {
        let strength = PasswordStrength.evaluate("ThisIsLong123Secure")
        XCTAssertEqual(strength.score, 4)
    }
}

// MARK: - DeepLinkHandler Tests

final class DeepLinkHandlerTests: XCTestCase {

    func testItineraryURLTriggersNotification() {
        var receivedId: String?
        let expectation = XCTestExpectation(description: "itinerary notification")

        let observer = NotificationCenter.default.addObserver(
            forName: .openItinerary, object: nil, queue: .main
        ) { note in
            receivedId = note.object as? String
            expectation.fulfill()
        }

        let url = URL(string: "memovoy://itineraries/abc-123")!
        DeepLinkHandler.handle(url, authStore: nil)

        wait(for: [expectation], timeout: 1.0)
        XCTAssertEqual(receivedId, "abc-123")

        NotificationCenter.default.removeObserver(observer)
    }

    func testNotificationPayloadWithPostType() {
        var receivedId: String?
        let expectation = XCTestExpectation(description: "post notification")

        let observer = NotificationCenter.default.addObserver(
            forName: .openPost, object: nil, queue: .main
        ) { note in
            receivedId = note.object as? String
            expectation.fulfill()
        }

        DeepLinkHandler.handleNotification(["type": "post", "id": "post-xyz"], authStore: nil)

        wait(for: [expectation], timeout: 1.0)
        XCTAssertEqual(receivedId, "post-xyz")

        NotificationCenter.default.removeObserver(observer)
    }
}

// MARK: - Models Decodable Tests

final class ModelsTests: XCTestCase {

    func testItineraryDecodesCorrectly() throws {
        let json = """
        {
            "id": "uuid-1",
            "userId": "user-1",
            "title": "Tóquio 7 dias",
            "destinationName": "Tokyo",
            "countryCode": "JP",
            "startDate": "2026-08-01",
            "endDate": "2026-08-07",
            "durationDays": 7,
            "groupType": "solo",
            "visibility": "public",
            "status": "published",
            "aiGenerated": true,
            "coverImageUrl": null,
            "savesCount": 5,
            "viewsCount": 120,
            "publishedAt": "2026-07-01T10:00:00Z",
            "createdAt": "2026-07-01T09:00:00Z"
        }
        """.data(using: .utf8)!

        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy  = .convertFromSnakeCase
        decoder.dateDecodingStrategy = .iso8601

        let itinerary = try decoder.decode(Itinerary.self, from: json)
        XCTAssertEqual(itinerary.id,              "uuid-1")
        XCTAssertEqual(itinerary.title,           "Tóquio 7 dias")
        XCTAssertEqual(itinerary.groupType,       .solo)
        XCTAssertEqual(itinerary.durationDays,    7)
        XCTAssertTrue(itinerary.aiGenerated)
    }

    func testActivityCategoryIconsAreNonEmpty() {
        let categories: [Activity.Category] = [
            .attraction, .restaurant, .transport, .hotel, .activity, .break
        ]
        for category in categories {
            XCTAssertFalse(category.icon.isEmpty, "\(category) deve ter ícone")
        }
    }

    func testDateRelativeFormatIsNotEmpty() {
        let date = Date().addingTimeInterval(-3600) // 1 hora atrás
        XCTAssertFalse(date.relativeFormatted.isEmpty)
    }
}
