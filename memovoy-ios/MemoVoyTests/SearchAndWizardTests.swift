// MemoVoyTests/SearchAndWizardTests.swift
// Testes do SearchViewModel (debounce, tabs) e WizardState (validação).

import XCTest
@testable import MemoVoy

// MARK: - WizardState Tests

final class WizardStateTests: XCTestCase {

    // MARK: isStep1Valid

    func testStep1ValidWithDestinationAndCountry() {
        var state = WizardState()
        state.destinationName = "Tokyo"
        state.countryCode     = "JP"
        XCTAssertTrue(state.isStep1Valid, "destino + país válidos → step 1 válido")
    }

    func testStep1InvalidWithEmptyDestination() {
        var state = WizardState()
        state.destinationName = ""
        state.countryCode     = "JP"
        XCTAssertFalse(state.isStep1Valid, "destino vazio → step 1 inválido")
    }

    func testStep1InvalidWithWhitespaceDestination() {
        var state = WizardState()
        state.destinationName = "   "
        state.countryCode     = "PT"
        XCTAssertFalse(state.isStep1Valid, "destino só com espaços → step 1 inválido")
    }

    func testStep1InvalidWithShortCountryCode() {
        var state = WizardState()
        state.destinationName = "Lisboa"
        state.countryCode     = "P"  // código inválido (precisa de 2 chars)
        XCTAssertFalse(state.isStep1Valid, "código de país com 1 char → step 1 inválido")
    }

    // MARK: isStep2Valid

    func testStep2ValidWhenEndAfterStart() {
        var state = WizardState()
        state.startDate = Date()
        state.endDate   = Date().addingTimeInterval(7 * 86400)
        XCTAssertTrue(state.isStep2Valid, "endDate após startDate → step 2 válido")
    }

    func testStep2ValidWhenStartEqualsEnd() {
        var state = WizardState()
        let today = Date()
        state.startDate = today
        state.endDate   = today
        XCTAssertTrue(state.isStep2Valid, "datas iguais → step 2 válido (1 dia)")
    }

    func testStep2InvalidWhenEndBeforeStart() {
        var state = WizardState()
        state.startDate = Date()
        state.endDate   = Date().addingTimeInterval(-86400)
        XCTAssertFalse(state.isStep2Valid, "endDate antes de startDate → step 2 inválido")
    }

    // MARK: isStep3Valid

    func testStep3ValidWithAtLeastOneTransport() {
        var state = WizardState()
        state.transportModes = ["public"]
        XCTAssertTrue(state.isStep3Valid)
    }

    func testStep3InvalidWithNoTransport() {
        var state = WizardState()
        state.transportModes = []
        XCTAssertFalse(state.isStep3Valid, "sem transportes → step 3 inválido")
    }

    func testStep3ValidWithMultipleTransports() {
        var state = WizardState()
        state.transportModes = ["walking", "public", "taxi"]
        XCTAssertTrue(state.isStep3Valid)
    }

    // MARK: durationDays

    func testDurationDaysCalculation() {
        var state = WizardState()
        let cal   = Calendar.current
        state.startDate = cal.date(from: DateComponents(year: 2026, month: 8, day: 1))!
        state.endDate   = cal.date(from: DateComponents(year: 2026, month: 8, day: 7))!
        XCTAssertEqual(state.durationDays, 7, "1 a 7 de Agosto = 7 dias")
    }

    func testDurationDaysSameDate() {
        var state = WizardState()
        let today = Date()
        state.startDate = today
        state.endDate   = today
        XCTAssertEqual(state.durationDays, 1, "mesmo dia = 1 dia")
    }

    // MARK: apiBody

    func testApiBodyContainsRequiredFields() {
        var state = WizardState()
        state.destinationName = "Bali"
        state.countryCode     = "ID"
        state.groupType       = "couple"
        state.groupSize       = 2

        let body = state.apiBody

        XCTAssertNotNil(body["destination"])
        XCTAssertNotNil(body["startDate"])
        XCTAssertNotNil(body["endDate"])
        XCTAssertNotNil(body["groupType"])
        XCTAssertNotNil(body["visibility"])
    }

    func testApiBodyGroupTypeMatchesState() {
        var state = WizardState()
        state.groupType = "family"

        let body = state.apiBody
        XCTAssertEqual(body["groupType"] as? String, "family")
    }
}

// MARK: - PasswordStrength Tests (Wizard)

final class PasswordStrengthWizardTests: XCTestCase {

    func testEmptyPasswordIsScore0() {
        let strength = PasswordStrength.evaluate("")
        XCTAssertEqual(strength.score, 0)
        XCTAssertFalse(strength.isAcceptable)
    }

    func testShortPasswordIsNotAcceptable() {
        let strength = PasswordStrength.evaluate("abc")
        XCTAssertFalse(strength.isAcceptable, "menos de 8 chars → não aceitável")
    }

    func testLongPasswordWithUpperAndDigitIsStrong() {
        let strength = PasswordStrength.evaluate("MyPassw0rd123")
        XCTAssertGreaterThanOrEqual(strength.score, 3)
        XCTAssertTrue(strength.isAcceptable)
    }

    func testEightCharPasswordNoUpperNoDigitIsScore1() {
        let strength = PasswordStrength.evaluate("password")
        XCTAssertEqual(strength.score, 1)
        XCTAssertFalse(strength.isAcceptable, "score 1 não é aceitável (mínimo 2)")
    }

    func testPasswordWithUppercaseIncreasesScore() {
        let withoutUpper = PasswordStrength.evaluate("password1")
        let withUpper    = PasswordStrength.evaluate("Password1")
        XCTAssertGreaterThan(withUpper.score, withoutUpper.score)
    }
}

// MARK: - Models Decodable Tests (adicionais)

final class ModelsAdditionalTests: XCTestCase {

    private let decoder: JSONDecoder = {
        let d = JSONDecoder()
        d.keyDecodingStrategy  = .convertFromSnakeCase
        d.dateDecodingStrategy = .iso8601
        return d
    }()

    func testPostDecodesWithOptionalFields() throws {
        let json = """
        {
            "id": "p1",
            "userId": "u1",
            "likesCount": 5,
            "commentsCount": 2,
            "savesCount": 0,
            "createdAt": "2026-07-01T10:00:00Z",
            "username": "traveler",
            "displayName": "The Traveler",
            "viewerLiked": false,
            "viewerSaved": false
        }
        """.data(using: .utf8)!

        let post = try decoder.decode(Post.self, from: json)
        XCTAssertEqual(post.id, "p1")
        XCTAssertNil(post.caption,      "caption deve ser nil se ausente")
        XCTAssertNil(post.locationName, "locationName deve ser nil se ausente")
        XCTAssertNil(post.coverMedia,   "coverMedia deve ser nil se ausente")
    }

    func testChallengeProgressDecodesCorrectly() throws {
        let json = """
        {
            "id": "c1",
            "title": "5 roteiros",
            "type": "post_count",
            "targetValue": 5,
            "status": "in_progress",
            "progressPct": 60,
            "currentValue": 3
        }
        """.data(using: .utf8)!

        let challenge = try decoder.decode(ChallengeProgress.self, from: json)
        XCTAssertEqual(challenge.progressPct,  60)
        XCTAssertEqual(challenge.currentValue, 3)
        XCTAssertEqual(challenge.targetValue,  5)
    }

    func testGamificationProfileDecodesWithEmptyArrays() throws {
        let json = """
        {
            "streak": { "currentStreak": 0, "longestStreak": 0 },
            "badges": [],
            "activeChallenges": [],
            "stats": { "badgeCount": 0, "completedChallenges": 0 }
        }
        """.data(using: .utf8)!

        let profile = try decoder.decode(GamificationProfile.self, from: json)
        XCTAssertEqual(profile.streak.currentStreak, 0)
        XCTAssertTrue(profile.badges.isEmpty)
        XCTAssertTrue(profile.activeChallenges.isEmpty)
    }
}
