// com/memovoy/core/models/Models.kt
package com.memovoy.core.models

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

// ---------------------------------------------------------------------------
// Itinerary
// ---------------------------------------------------------------------------

@Serializable
data class Itinerary(
    val id:              String,
    val userId:          String,
    val title:           String,
    val destinationName: String,
    val countryCode:     String,
    val startDate:       String,
    val endDate:         String,
    val durationDays:    Int,
    val groupType:       GroupType,
    val visibility:      Visibility,
    val status:          Status,
    val aiGenerated:     Boolean,
    val coverImageUrl:   String?       = null,
    val savesCount:      Int           = 0,
    val viewsCount:      Int           = 0,
    val publishedAt:     String?       = null,
    val createdAt:       String,
    // Campos do detalhe
    val days:            List<ItineraryDay>? = null,
    val authorName:      String?       = null,
    val authorAvatar:    String?       = null,
    val totalKgCo2:      Double?       = null,
    val carbonVsAvgPct:  Double?       = null,
    val daysCount:       Int?          = null,
    val activitiesCount: Int?          = null,
) {
    enum class GroupType { solo, couple, friends, family;
        val label get() = when (this) {
            solo    -> "Solo"
            couple  -> "Casal"
            friends -> "Amigos"
            family  -> "Família"
        }
    }
    enum class Visibility { `public`, followers, `private` }
    enum class Status     { draft, published, archived }
}

@Serializable
data class ItineraryDay(
    val id:             String,
    val dayNumber:      Int,
    val date:           String,
    val theme:          String?        = null,
    val notes:          String?        = null,
    val activities:     List<Activity> = emptyList(),
    val totalDistanceM: Int?           = null,
)

@Serializable
data class Activity(
    val id:              String,
    val dayId:           String?  = null,
    val position:        Int,
    val name:            String,
    val category:        Category? = null,
    val lat:             Double?   = null,
    val lng:             Double?   = null,
    val address:         String?   = null,
    val startTime:       String?   = null,
    val durationMinutes: Int?      = null,
    val notes:           String?   = null,
    val bookingUrl:      String?   = null,
    val priceEstimate:   Int?      = null,
    val aiSuggested:     Boolean   = false,
    val aiWarning:       String?   = null,
    val externalId:      String?   = null,
    val externalSource:  String?   = null,
) {
    enum class Category { attraction, restaurant, transport, hotel, activity, `break`;
        val icon get() = when (this) {
            attraction  -> "🏛"
            restaurant  -> "🍽"
            transport   -> "🚆"
            hotel       -> "🏨"
            activity    -> "🎯"
            `break`     -> "☕"
        }
    }
}

// ---------------------------------------------------------------------------
// Post
// ---------------------------------------------------------------------------

@Serializable
data class Post(
    val id:            String,
    val userId:        String,
    val itineraryId:   String?    = null,
    val caption:       String?    = null,
    val locationName:  String?    = null,
    val countryCode:   String?    = null,
    val likesCount:    Int        = 0,
    val commentsCount: Int        = 0,
    val savesCount:    Int        = 0,
    val createdAt:     String,
    val username:      String,
    val displayName:   String,
    val avatarUrl:     String?    = null,
    val level:         String?    = null,
    val coverMedia:    PostMedia? = null,
    val mediaCount:    Int?       = null,
    val viewerLiked:   Boolean    = false,
    val viewerSaved:   Boolean    = false,
    val media:         List<PostMedia>? = null,
    val comments:      List<Comment>?   = null,
)

@Serializable
data class PostMedia(
    val url:          String,
    val thumbnailUrl: String?   = null,
    val mediaType:    String,
    val width:        Int?      = null,
    val height:       Int?      = null,
)

@Serializable
data class Comment(
    val id:              String,
    val userId:          String,
    val content:         String,
    val likesCount:      Int      = 0,
    val createdAt:       String,
    val username:        String,
    val displayName:     String,
    val avatarUrl:       String?  = null,
    val viewerLiked:     Boolean  = false,
    val replyCount:      Int?     = null,
    val parentCommentId: String?  = null,
)

// ---------------------------------------------------------------------------
// User
// ---------------------------------------------------------------------------

@Serializable
data class UserProfile(
    val id:            String,
    val username:      String,
    val isVerified:    Boolean,
    val isPrivate:     Boolean,
    val followerCount: Int,
    val createdAt:     String,
    val profile:       Profile,
    val viewer:        ViewerState? = null,
) {
    @Serializable
    data class Profile(
        val displayName:    String,
        val bio:            String? = null,
        val avatarUrl:      String? = null,
        val totalTrips:     Int?    = null,
        val totalCountries: Int?    = null,
        val followingCount: Int?    = null,
        val level:          String,
    )
    @Serializable
    data class ViewerState(
        val isFollowing:     Boolean,
        val isFollowPending: Boolean,
        val isOwnProfile:    Boolean,
        val canSeeContent:   Boolean,
    )
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

@Serializable
data class AuthResponse(
    val user:        AuthUser,
    val accessToken: String,
) {
    @Serializable
    data class AuthUser(
        val id:         String,
        val username:   String,
        val role:       String,
        val isVerified: Boolean,
    )
}

@Serializable
data class RefreshResponse(val accessToken: String)

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

@Serializable
data class AppNotification(
    val id:        String,
    val type:      String,
    val title:     String,
    val body:      String?  = null,
    val channel:   String,
    val status:    String,
    val readAt:    String?  = null,
    val createdAt: String,
) {
    val isRead get() = readAt != null
}

// ---------------------------------------------------------------------------
// Expenses
// ---------------------------------------------------------------------------

@Serializable
data class Expense(
    val id:             String,
    val amountCents:    Int,
    val currency:       String,
    val amountEurCents: Int?    = null,
    val category:       String,
    val description:    String? = null,
    val dayId:          String? = null,
    val receiptUrl:     String? = null,
    val spentAt:        String,
    val registeredBy:   String? = null,
    val dayNumber:      Int?    = null,
)

@Serializable
data class ExpenseSummary(
    val totalEurCents:           Int,
    val count:                   Int,
    val currenciesUsed:          List<String>    = emptyList(),
    val byCategory:              List<CategoryTotal>,
    val estimatedTotalEurCents:  Int?            = null,
    val daysElapsed:             Int?            = null,
    val dailyAvgEurCents:        Int?            = null,
    val budgetPerDayEurCents:    Int?            = null,
    val budgetRemainingEurCents: Int?            = null,
) {
    @Serializable
    data class CategoryTotal(
        val category:      String,
        val totalEurCents: Int,
        val count:         Int,
    )
}

// ---------------------------------------------------------------------------
// Gamification
// ---------------------------------------------------------------------------

@Serializable
data class GamificationProfile(
    val streak:           StreakInfo,
    val badges:           List<Badge>,
    val activeChallenges: List<ChallengeProgress>,
    val stats:            Stats,
) {
    @Serializable data class StreakInfo(val currentStreak: Int, val longestStreak: Int)
    @Serializable data class Stats(val badgeCount: Int, val completedChallenges: Int)
}

@Serializable
data class Badge(
    val id:          String,
    val name:        String,
    val description: String? = null,
    val iconUrl:     String,
    val category:    String,
    val earnedAt:    String? = null,
)

@Serializable
data class ChallengeProgress(
    val id:              String,
    val title:           String,
    val description:     String? = null,
    val type:            String,
    val targetValue:     Int,
    val locationName:    String? = null,
    val endsAt:          String? = null,
    val currentValue:    Int?    = null,
    val status:          String,
    val progressPct:     Int,
    val rewardBadgeName: String? = null,
    val rewardBadgeIcon: String? = null,
)

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

@Serializable
data class PaginatedResponse<T>(
    val items:      List<T>,
    val hasMore:    Boolean,
    val nextCursor: String? = null,
)
