// src/app/profile/[userId]/page.tsx
'use client'

import Image             from 'next/image'
import Link              from 'next/link'
import { useParams }     from 'next/navigation'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { useState }      from 'react'
import { useAuthStore }  from '@/store/auth'
import { api }           from '@/lib/api-client'
import { NavBar }        from '@/components/layout/NavBar'
import { cn, formatRelative, levelLabel } from '@/lib/utils'
import type { UserProfile, GamificationProfile, Post, Badge, ChallengeProgress } from '@/types'

type Tab = 'posts' | 'badges' | 'challenges'

export default function ProfilePage() {
  const { userId }  = useParams<{ userId: string }>()
  const { user: me } = useAuthStore()
  const qc          = useQueryClient()
  const [tab, setTab] = useState<Tab>('posts')

  const isOwn = me?.id === userId

  // Perfil
  const { data: profileData, isLoading: profileLoading } = useQuery({
    queryKey: ['profile', userId],
    queryFn:  () => api.get<{ user: UserProfile }>(`/users/${userId}`),
  })

  // Gamificação
  const { data: gamData } = useQuery({
    queryKey: ['gamification', userId],
    queryFn:  () => api.get<GamificationProfile>(`/gamification/profile/${userId}`),
  })

  // Posts do perfil
  const { data: postsData } = useQuery({
    queryKey: ['profile-posts', userId],
    queryFn:  () => api.get<{ items: Post[]; hasMore: boolean }>(`/feed/users/${userId}`, {
      params: { limit: 18 },
    }),
  })

  // Follow mutation
  const followMutation = useMutation({
    mutationFn: async (action: 'follow' | 'unfollow'): Promise<void> => {
      if (action === 'follow') {
        await api.post<{ status: string }>(`/users/${userId}/follow`)
      } else {
        await api.delete(`/users/${userId}/follow`)
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['profile', userId] })
    },
  })

  const profile     = profileData?.user
  const gamification = gamData
  const posts       = postsData?.items ?? []

  if (profileLoading) {
    return (
      <div className="min-h-screen bg-surface-subtle">
        <NavBar />
        <div className="max-w-3xl mx-auto px-4 py-8">
          <ProfileSkeleton />
        </div>
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-surface-subtle">
        <NavBar />
        <div className="max-w-3xl mx-auto px-4 py-16 text-center">
          <p className="text-4xl mb-4">👤</p>
          <h1 className="font-display text-xl font-bold text-ink mb-2">Perfil não encontrado</h1>
          <p className="text-ink-secondary text-sm">Este utilizador pode não existir.</p>
        </div>
      </div>
    )
  }

  const { label: lvLabel, color: lvColor } = levelLabel(profile.profile.level)
  const isFollowing    = profile.viewer?.isFollowing
  const isFollowPending = profile.viewer?.isFollowPending
  const canSeeContent  = profile.viewer?.canSeeContent !== false

  return (
    <div className="min-h-screen bg-surface-subtle">
      <NavBar />

      <main className="max-w-3xl mx-auto px-4 py-8 pb-24 md:pb-8 space-y-6">

        {/* Header do perfil */}
        <div className="card p-6">
          <div className="flex flex-col sm:flex-row gap-6 items-start sm:items-center">
            {/* Avatar */}
            <div className="shrink-0">
              {profile.profile.avatarUrl ? (
                <Image
                  src={profile.profile.avatarUrl}
                  alt={profile.profile.displayName}
                  width={88} height={88}
                  className="rounded-full object-cover"
                />
              ) : (
                <div className="w-[88px] h-[88px] rounded-full bg-blue/10 flex items-center justify-center text-blue text-3xl font-bold">
                  {profile.profile.displayName[0].toUpperCase()}
                </div>
              )}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <h1 className="font-display text-2xl font-bold text-ink">
                  {profile.profile.displayName}
                </h1>
                {profile.isVerified && <span title="Verificado">✅</span>}
                <span
                  className="level-badge text-white text-xs"
                  style={{ '--lv': lvColor } as React.CSSProperties}
                >
                  {lvLabel}
                </span>
              </div>

              <p className="text-ink-secondary text-sm mb-2">@{profile.username}</p>

              {profile.profile.bio && (
                <p className="text-ink text-sm leading-relaxed mb-3">
                  {profile.profile.bio}
                </p>
              )}

              {/* Botão de seguir */}
              {!isOwn && (
                <button
                  onClick={() => followMutation.mutate(
                    (isFollowing || isFollowPending) ? 'unfollow' : 'follow'
                  )}
                  disabled={followMutation.isPending}
                  className={cn(
                    'inline-flex items-center justify-center px-5 py-2 rounded-lg text-sm font-semibold transition-colors disabled:cursor-not-allowed',
                    isFollowing
                      ? 'bg-surface-muted text-ink hover:bg-red-50 hover:text-red-600 border border-surface-muted'
                      : isFollowPending
                      ? 'bg-surface-muted text-ink-secondary border border-surface-muted cursor-default'
                      : 'bg-blue text-white hover:bg-blue-700 active:bg-blue-800'
                  )}
                >
                  {followMutation.isPending ? '…' :
                   isFollowing    ? 'A seguir' :
                   isFollowPending ? 'Pedido enviado' :
                   'Seguir'}
                </button>
              )}

              {isOwn && (
                <Link href="/settings" className="btn-secondary text-sm px-4 py-2">
                  Editar perfil
                </Link>
              )}
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-4 gap-4 mt-6 pt-5 border-t border-surface-muted text-center">
            {[
              { val: profile.followerCount,             label: 'Seguidores'  },
              { val: profile.profile.followingCount ?? 0, label: 'A seguir'  },
              { val: profile.profile.totalTrips ?? 0,   label: 'Viagens'    },
              { val: profile.profile.totalCountries ?? 0, label: 'Países'   },
            ].map(({ val, label }) => (
              <div key={label}>
                <p className="font-display text-xl font-bold text-ink">{val}</p>
                <p className="text-ink-tertiary text-xs mt-0.5">{label}</p>
              </div>
            ))}
          </div>

          {/* Streak */}
          {gamification?.streak && gamification.streak.currentStreak > 0 && (
            <div className="mt-4 pt-4 border-t border-surface-muted flex items-center gap-2">
              <span className="text-xl">🔥</span>
              <span className="text-sm font-medium text-ink">
                {gamification.streak.currentStreak} meses consecutivos
              </span>
              <span className="text-xs text-ink-tertiary ml-auto">
                Recorde: {gamification.streak.longestStreak}
              </span>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex border-b border-surface-muted bg-surface rounded-t-xl overflow-hidden">
          {([
            { id: 'posts',      label: `Publicações${posts.length > 0 ? ` (${posts.length})` : ''}` },
            { id: 'badges',     label: `Badges${gamification ? ` (${gamification.stats.badgeCount})` : ''}` },
            { id: 'challenges', label: 'Desafios' },
          ] as { id: Tab; label: string }[]).map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={cn(
                'flex-1 py-3 text-sm font-medium transition-colors border-b-2',
                tab === id
                  ? 'text-blue border-blue'
                  : 'text-ink-secondary border-transparent hover:text-ink'
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Conteúdo da tab */}
        {tab === 'posts' && (
          <PostsGrid posts={posts} canSee={canSeeContent} />
        )}
        {tab === 'badges' && (
          <BadgesGrid badges={gamification?.badges ?? []} />
        )}
        {tab === 'challenges' && (
          <ChallengesGrid challenges={gamification?.activeChallenges ?? []} />
        )}
      </main>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Posts grid
// ---------------------------------------------------------------------------

function PostsGrid({ posts, canSee }: { posts: Post[]; canSee: boolean }) {
  if (!canSee) {
    return (
      <div className="card p-12 text-center space-y-3">
        <p className="text-3xl">🔒</p>
        <p className="font-display font-bold text-ink">Conta privada</p>
        <p className="text-ink-secondary text-sm">
          Segue este utilizador para ver as suas publicações.
        </p>
      </div>
    )
  }

  if (posts.length === 0) {
    return (
      <div className="card p-12 text-center space-y-3">
        <p className="text-3xl">📷</p>
        <p className="text-ink-secondary text-sm">Sem publicações ainda.</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-3 gap-1">
      {posts.map((post) => (
        <Link
          key={post.id}
          href={`/posts/${post.id}`}
          className="relative aspect-square overflow-hidden rounded-sm bg-surface-muted group"
        >
          {post.coverMedia ? (
            <Image
              src={post.coverMedia.thumbnailUrl ?? post.coverMedia.url}
              alt={post.caption ?? ''}
              fill
              className="object-cover group-hover:scale-105 transition-transform duration-500"
              sizes="(max-width: 768px) 33vw, 240px"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-ink-disabled text-2xl">
              📷
            </div>
          )}
          {/* Hover overlay */}
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4">
            <span className="text-white text-sm font-medium">❤️ {post.likesCount}</span>
            <span className="text-white text-sm font-medium">💬 {post.commentsCount}</span>
          </div>
        </Link>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Badges grid
// ---------------------------------------------------------------------------

function BadgesGrid({ badges }: { badges: Badge[] }) {
  if (badges.length === 0) {
    return (
      <div className="card p-12 text-center space-y-3">
        <p className="text-3xl">⭐</p>
        <p className="text-ink-secondary text-sm">Sem badges ainda. Completa desafios para ganhar.</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
      {badges.map((badge) => (
        <div
          key={badge.id}
          title={badge.description ?? badge.name}
          className="card p-4 flex flex-col items-center gap-2 text-center hover:shadow-card-md transition-shadow"
        >
          <Image
            src={badge.iconUrl}
            alt={badge.name}
            width={48} height={48}
            className="object-contain"
          />
          <p className="text-xs font-semibold text-ink line-clamp-2 leading-snug">{badge.name}</p>
          {badge.earnedAt && (
            <p className="text-2xs text-ink-tertiary">{formatRelative(badge.earnedAt)}</p>
          )}
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Challenges list
// ---------------------------------------------------------------------------

function ChallengesGrid({ challenges }: { challenges: ChallengeProgress[] }) {
  if (challenges.length === 0) {
    return (
      <div className="card p-12 text-center space-y-3">
        <p className="text-3xl">🏁</p>
        <p className="text-ink-secondary text-sm">Sem desafios activos.</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {challenges.map((ch) => (
        <div key={ch.id} className="card p-4 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-semibold text-ink text-sm">{ch.title}</p>
              {ch.locationName && (
                <p className="text-xs text-ink-secondary mt-0.5">📍 {ch.locationName}</p>
              )}
            </div>
            {ch.rewardBadgeIcon && (
              <span className="text-2xl shrink-0">{ch.rewardBadgeIcon}</span>
            )}
          </div>

          {/* Barra de progresso */}
          <div className="space-y-1.5">
            <div className="h-2 bg-surface-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-blue rounded-full transition-all duration-500"
                style={{ width: `${ch.progressPct}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-ink-secondary">
              <span>{ch.currentValue ?? 0} / {ch.targetValue}</span>
              <span className="font-semibold text-blue">{ch.progressPct}%</span>
            </div>
          </div>

          {ch.endsAt && (
            <p className="text-xs text-ink-tertiary">
              Termina {formatRelative(ch.endsAt)}
            </p>
          )}
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Skeleton de carregamento
// ---------------------------------------------------------------------------

function ProfileSkeleton() {
  return (
    <div className="space-y-6">
      <div className="card p-6">
        <div className="flex gap-6 items-center">
          <div className="skeleton w-[88px] h-[88px] rounded-full shrink-0" />
          <div className="flex-1 space-y-3">
            <div className="skeleton h-6 w-40 rounded" />
            <div className="skeleton h-4 w-28 rounded" />
            <div className="skeleton h-4 w-56 rounded" />
          </div>
        </div>
        <div className="grid grid-cols-4 gap-4 mt-6 pt-5 border-t border-surface-muted">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-1.5 flex flex-col items-center">
              <div className="skeleton h-6 w-10 rounded" />
              <div className="skeleton h-3 w-14 rounded" />
            </div>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-1">
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="skeleton aspect-square rounded-sm" />
        ))}
      </div>
    </div>
  )
}
