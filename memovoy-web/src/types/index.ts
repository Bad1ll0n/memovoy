// src/types/index.ts
// Tipos que espelham a API. keyDecodingStrategy = convertFromSnakeCase
// não existe em TypeScript — campos chegam em camelCase (o API usa camelCase).

export type GroupType  = 'solo' | 'couple' | 'friends' | 'family'
export type Visibility = 'public' | 'followers' | 'private'
export type IStatus    = 'draft' | 'published' | 'archived'

export interface Itinerary {
  id:              string
  userId:          string
  title:           string
  destinationName: string
  countryCode:     string
  startDate:       string
  endDate:         string
  durationDays:    number
  groupType:       GroupType
  visibility:      Visibility
  status:          IStatus
  aiGenerated:     boolean
  coverImageUrl:   string | null
  savesCount:      number
  viewsCount:      number
  publishedAt:     string | null
  createdAt:       string
  // detalhe
  days?:           ItineraryDay[]
  authorName?:     string
  authorAvatar?:   string | null
  totalKgCo2?:     number | null
  carbonVsAvgPct?: number | null
  daysCount?:      number
  activitiesCount?:number
}

export interface ItineraryDay {
  id:             string
  dayNumber:      number
  date:           string
  theme:          string | null
  notes:          string | null
  activities:     Activity[]
  totalDistanceM: number | null
}

export type ActivityCategory =
  'attraction' | 'restaurant' | 'transport' | 'hotel' | 'activity' | 'break'

export interface Activity {
  id:              string
  dayId:           string | null
  position:        number
  name:            string
  category:        ActivityCategory | null
  lat:             number | null
  lng:             number | null
  address:         string | null
  startTime:       string | null
  durationMinutes: number | null
  notes:           string | null
  bookingUrl:      string | null
  priceEstimate:   number | null
  aiSuggested:     boolean
  aiWarning:       string | null
}

export interface Post {
  id:            string
  userId:        string
  itineraryId:   string | null
  caption:       string | null
  locationName:  string | null
  countryCode:   string | null
  likesCount:    number
  commentsCount: number
  savesCount:    number
  createdAt:     string
  username:      string
  displayName:   string
  avatarUrl:     string | null
  level:         string | null
  coverMedia:    PostMedia | null
  mediaCount:    number | null
  viewerLiked:   boolean
  viewerSaved:   boolean
  media?:        PostMedia[]
  comments?:     Comment[]
}

export interface PostMedia {
  url:          string
  thumbnailUrl: string | null
  mediaType:    'image' | 'video'
  width:        number | null
  height:       number | null
}

export interface Comment {
  id:              string
  userId:          string
  content:         string
  likesCount:      number
  createdAt:       string
  username:        string
  displayName:     string
  avatarUrl:       string | null
  viewerLiked:     boolean
  replyCount:      number | null
  parentCommentId: string | null
}

export interface UserProfile {
  id:            string
  username:      string
  isVerified:    boolean
  isPrivate:     boolean
  followerCount: number
  createdAt:     string
  profile: {
    displayName:    string
    bio:            string | null
    avatarUrl:      string | null
    totalTrips:     number | null
    totalCountries: number | null
    followingCount: number | null
    level:          string
  }
  viewer?: {
    isFollowing:     boolean
    isFollowPending: boolean
    isOwnProfile:    boolean
    canSeeContent:   boolean
  }
}

export interface AppNotification {
  id:        string
  type:      string
  title:     string
  body:      string | null
  channel:   string
  status:    string
  readAt:    string | null
  createdAt: string
  isRead:    boolean
}

export interface Expense {
  id:             string
  amountCents:    number
  currency:       string
  amountEurCents: number | null
  category:       string
  description:    string | null
  dayId:          string | null
  receiptUrl:     string | null
  spentAt:        string
  registeredBy:   string | null
  dayNumber:      number | null
}

export interface GamificationProfile {
  streak: { currentStreak: number; longestStreak: number }
  badges: Badge[]
  activeChallenges: ChallengeProgress[]
  stats: { badgeCount: number; completedChallenges: number }
}

export interface Badge {
  id:          string
  name:        string
  description: string | null
  iconUrl:     string
  category:    string
  earnedAt:    string | null
}

export interface ChallengeProgress {
  id:              string
  title:           string
  description:     string | null
  type:            string
  targetValue:     number
  locationName:    string | null
  endsAt:          string | null
  currentValue:    number | null
  status:          string
  progressPct:     number
  rewardBadgeName: string | null
  rewardBadgeIcon: string | null
}

export interface PaginatedResponse<T> {
  items:      T[]
  hasMore:    boolean
  nextCursor: string | null
}

export interface AuthUser {
  id:         string
  username:   string
  role:       string
  isVerified: boolean
}
