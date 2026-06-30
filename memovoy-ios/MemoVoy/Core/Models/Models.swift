// MemoVoy/Core/Models/Models.swift
// Modelos de domínio que mapeiam as respostas da API.
// Todos Decodable com keyDecodingStrategy = .convertFromSnakeCase
// (configurado no APIClient — sem CodingKeys manuais).

import Foundation

// MARK: - Itinerary

struct Itinerary: Decodable, Identifiable, Equatable {
    let id:              String
    let userId:          String
    let title:           String
    let destinationName: String
    let countryCode:     String
    let startDate:       String
    let endDate:         String
    let durationDays:    Int
    let groupType:       GroupType
    let visibility:      Visibility
    let status:          Status
    let aiGenerated:     Bool
    let coverImageUrl:   String?
    let savesCount:      Int
    let viewsCount:      Int
    let publishedAt:     Date?
    let createdAt:       Date

    // Campos opcionais (presentes no detalhe mas não na listagem)
    let days:          [ItineraryDay]?
    let authorName:    String?
    let authorAvatar:  String?
    let totalKgCo2:    Double?
    let carbonVsAvgPct: Double?
    let daysCount:     Int?
    let activitiesCount: Int?

    enum GroupType: String, Decodable, CaseIterable {
        case solo, couple, friends, family

        var label: String {
            switch self {
            case .solo:    return "Solo"
            case .couple:  return "Casal"
            case .friends: return "Amigos"
            case .family:  return "Família"
            }
        }
    }

    enum Visibility: String, Decodable {
        case `public`, followers, `private`
    }

    enum Status: String, Decodable {
        case draft, published, archived
    }
}

// MARK: - ItineraryDay

struct ItineraryDay: Decodable, Identifiable, Equatable {
    let id:           String
    let dayNumber:    Int
    let date:         String
    let theme:        String?
    let notes:        String?
    let activities:   [Activity]
    let totalDistanceM: Int?
}

// MARK: - Activity

struct Activity: Decodable, Identifiable, Equatable {
    let id:              String
    let dayId:           String?
    let position:        Int
    let name:            String
    let category:        Category?
    let lat:             Double?
    let lng:             Double?
    let address:         String?
    let startTime:       String?
    let durationMinutes: Int?
    let notes:           String?
    let bookingUrl:      String?
    let priceEstimate:   Int?
    let aiSuggested:     Bool?
    let aiWarning:       String?
    let externalId:      String?
    let externalSource:  String?

    enum Category: String, Decodable {
        case attraction, restaurant, transport, hotel, activity, `break`

        var icon: String {
            switch self {
            case .attraction: return "🏛"
            case .restaurant: return "🍽"
            case .transport:  return "🚆"
            case .hotel:      return "🏨"
            case .activity:   return "🎯"
            case .break:      return "☕"
            }
        }
    }
}

// MARK: - Post

struct Post: Decodable, Identifiable, Equatable {
    let id:            String
    let userId:        String
    let itineraryId:   String?
    let caption:       String?
    let locationName:  String?
    let countryCode:   String?
    let likesCount:    Int
    let commentsCount: Int
    let savesCount:    Int
    let createdAt:     Date

    let username:       String
    let displayName:    String
    let avatarUrl:      String?
    let level:          String?
    let coverMedia:     PostMedia?
    let mediaCount:     Int?
    let viewerLiked:    Bool
    let viewerSaved:    Bool

    // Campos do detalhe
    let media:    [PostMedia]?
    let comments: [Comment]?
}

struct PostMedia: Decodable, Equatable {
    let url:          String
    let thumbnailUrl: String?
    let mediaType:    String
    let width:        Int?
    let height:       Int?
}

// MARK: - Comment

struct Comment: Decodable, Identifiable, Equatable {
    let id:              String
    let userId:          String
    let content:         String
    let likesCount:      Int
    let createdAt:       Date
    let username:        String
    let displayName:     String
    let avatarUrl:       String?
    let viewerLiked:     Bool
    let replyCount:      Int?
    let parentCommentId: String?
}

// MARK: - User Profile

struct UserProfile: Decodable, Identifiable, Equatable {
    let id:            String
    let username:      String
    let isVerified:    Bool
    let isPrivate:     Bool
    let followerCount: Int
    let createdAt:     Date
    let profile:       Profile

    struct Profile: Decodable, Equatable {
        let displayName:    String
        let bio:            String?
        let avatarUrl:      String?
        let totalTrips:     Int?
        let totalCountries: Int?
        let followingCount: Int?
        let level:          String
    }

    let viewer: ViewerState?
    struct ViewerState: Decodable, Equatable {
        let isFollowing:    Bool
        let isFollowPending: Bool
        let isOwnProfile:   Bool
        let canSeeContent:  Bool
    }
}

// MARK: - Notification

struct AppNotification: Decodable, Identifiable, Equatable {
    let id:        String
    let type:      String
    let title:     String
    let body:      String?
    let channel:   String
    let status:    String
    let readAt:    Date?
    let createdAt: Date

    var isRead: Bool { readAt != nil }
}

// MARK: - Expense

struct Expense: Decodable, Identifiable, Equatable {
    let id:              String
    let amountCents:     Int
    let currency:        String
    let amountEurCents:  Int?
    let category:        String
    let description:     String?
    let dayId:           String?
    let receiptUrl:      String?
    let spentAt:         Date
    let registeredBy:    String?
    let dayNumber:       Int?
}

struct ExpenseSummary: Decodable {
    let totalEurCents:          Int
    let count:                  Int
    let currenciesUsed:         [String]
    let byCategory:             [CategoryTotal]
    let estimatedTotalEurCents: Int?
    let daysElapsed:            Int?
    let dailyAvgEurCents:       Int?
    let budgetPerDayEurCents:   Int?
    let budgetRemainingEurCents: Int?

    struct CategoryTotal: Decodable, Identifiable {
        var id: String { category }
        let category:       String
        let totalEurCents:  Int
        let count:          Int
    }
}

// MARK: - Pagination

struct PaginatedResponse<T: Decodable>: Decodable {
    let items:      [T]
    let hasMore:    Bool
    let nextCursor: String?
}

// MARK: - Gamification

struct GamificationProfile: Decodable {
    let streak:           StreakInfo
    let badges:           [Badge]
    let activeChallenges: [ChallengeProgress]
    let stats:            Stats

    struct StreakInfo: Decodable {
        let currentStreak: Int
        let longestStreak: Int
    }

    struct Stats: Decodable {
        let badgeCount:          Int
        let completedChallenges: Int
    }
}

struct Badge: Decodable, Identifiable, Equatable {
    let id:          String
    let name:        String
    let description: String?
    let iconUrl:     String
    let category:    String
    let earnedAt:    Date?
}

struct ChallengeProgress: Decodable, Identifiable {
    let id:               String
    let title:            String
    let description:      String?
    let type:             String
    let targetValue:      Int
    let locationName:     String?
    let endsAt:           Date?
    let currentValue:     Int?
    let status:           String
    let progressPct:      Int
    let rewardBadgeName:  String?
    let rewardBadgeIcon:  String?
}
