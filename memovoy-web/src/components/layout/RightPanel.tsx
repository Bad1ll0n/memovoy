'use client'

import { useState } from 'react'
import Link from 'next/link'
import { TrendingUp, TrendingDown, Trophy, UserPlus, UserCheck } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import { Avatar } from '@/components/ui/Avatar'
import { Spinner } from '@/components/ui/Spinner'

interface TopTraveller {
  id: string
  username: string
  avatarUrl: string | null
  score: number
  rank: number
}

interface TrendingDest {
  destination: string
  count: number
  deltaPct: number
  trend: 'up' | 'down'
}

interface SuggestedUser {
  id: string
  username: string
  displayName: string
  avatarUrl: string | null
  followersCount: number
}

const rankColors: Record<number, string> = {
  1: 'var(--gold)',
  2: 'var(--silver)',
  3: 'var(--bronze)',
}

export function RightPanel() {
  const { isHydrated } = useAuthStore()

  const { data: topTravellers, isLoading: loadingTop } = useQuery<TopTraveller[]>({
    queryKey: ['right-panel', 'top-travellers'],
    queryFn: () => api.get('/rankings/travellers?limit=5'),
  })

  const { data: trending } = useQuery<TrendingDest[]>({
    queryKey: ['right-panel', 'trending'],
    queryFn: () => api.get('/rankings/trending?limit=5'),
  })

  const { data: suggested } = useQuery<SuggestedUser[]>({
    queryKey: ['right-panel', 'suggested'],
    queryFn: () => api.get('/users/suggested?limit=4'),
    enabled: isHydrated,
  })

  return (
    <aside
      className="hidden xl:flex flex-col gap-4 py-5 px-3 h-screen sticky top-0 overflow-y-auto"
      style={{ width: 'var(--right-width)' }}
    >
      {/* Top Travellers */}
      <div className="card p-4">
        <div className="flex items-center gap-2 mb-3">
          <Trophy className="w-4 h-4" style={{ color: 'var(--gold)' }} />
          <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
            Top Viajantes
          </h3>
        </div>

        {loadingTop ? (
          <div className="flex justify-center py-4"><Spinner /></div>
        ) : (
          <ul className="flex flex-col gap-2">
            {(topTravellers ?? []).map((u) => (
              <li key={u.id} className="flex items-center gap-2.5">
                <span
                  className="text-sm font-bold w-5 text-center"
                  style={{ color: rankColors[u.rank] ?? 'var(--text-muted)' }}
                >
                  {u.rank}
                </span>
                <Avatar src={u.avatarUrl} name={u.username} size="sm" />
                <Link
                  href={`/profile/${u.id}`}
                  className="flex-1 min-w-0 text-sm font-medium truncate hover:underline"
                  style={{ color: 'var(--text-primary)' }}
                >
                  @{u.username}
                </Link>
                <span className="text-xs font-semibold" style={{ color: 'var(--accent)' }}>
                  {u.score}
                </span>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3 text-center">
          <Link
            href="/rankings"
            className="text-xs font-medium hover:underline"
            style={{ color: 'var(--accent)' }}
          >
            Ver ranking completo
          </Link>
        </div>
      </div>

      {/* Trending Destinations */}
      {trending && trending.length > 0 && (
        <div className="card p-4">
          <h3 className="text-sm font-bold mb-3" style={{ color: 'var(--text-primary)' }}>
            Destinos em Alta
          </h3>
          <ul className="flex flex-col gap-2">
            {trending.map((d, i) => (
              <li key={i} className="flex items-center gap-2">
                <span className="text-xs font-bold w-4" style={{ color: 'var(--text-muted)' }}>
                  {i + 1}
                </span>
                <span className="flex-1 text-sm truncate" style={{ color: 'var(--text-primary)' }}>
                  {d.destination}
                </span>
                <span
                  className="flex items-center gap-0.5 text-[11px] font-semibold shrink-0"
                  style={{ color: d.trend === 'up' ? 'var(--success)' : 'var(--danger)' }}
                >
                  {d.trend === 'up' ? (
                    <TrendingUp className="w-3 h-3" />
                  ) : (
                    <TrendingDown className="w-3 h-3" />
                  )}
                  {Math.abs(d.deltaPct ?? 0)}%
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Suggested Users */}
      {suggested && suggested.length > 0 && (
        <div className="card p-4">
          <h3 className="text-sm font-bold mb-3" style={{ color: 'var(--text-primary)' }}>
            Quem Seguir
          </h3>
          <ul className="flex flex-col gap-3">
            {suggested.map((u) => (
              <SuggestedUserRow key={u.id} user={u} />
            ))}
          </ul>
          <div className="mt-3 text-center">
            <Link
              href="/users"
              className="text-xs font-medium hover:underline"
              style={{ color: 'var(--accent)' }}
            >
              Ver mais
            </Link>
          </div>
        </div>
      )}

      <p className="text-xs text-center pb-4" style={{ color: 'var(--text-muted)' }}>
        © 2026 Memovoy · PT/EN
      </p>
    </aside>
  )
}

function SuggestedUserRow({ user }: { user: SuggestedUser }) {
  const { user: me } = useAuthStore()
  const qc = useQueryClient()
  const [followed, setFollowed] = useState(false)

  const followMutation = useMutation({
    mutationFn: () => api.post(`/users/${user.id}/follow`),
    onSuccess: () => {
      setFollowed(true)
      qc.invalidateQueries({ queryKey: ['right-panel', 'suggested'] })
    },
  })

  if (me?.id === user.id) return null

  return (
    <li className="flex items-center gap-2.5">
      <Avatar src={user.avatarUrl} name={user.displayName || user.username} size="sm" />
      <div className="flex-1 min-w-0">
        <Link
          href={`/profile/${user.id}`}
          className="text-sm font-medium truncate block hover:underline"
          style={{ color: 'var(--text-primary)' }}
        >
          @{user.username}
        </Link>
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {user.followersCount} seguidores
        </p>
      </div>
      <button
        onClick={() => !followed && followMutation.mutate()}
        disabled={followed || followMutation.isPending}
        className={`btn text-xs px-2.5 py-1 gap-1 shrink-0 ${followed ? 'btn-secondary' : 'btn-primary'}`}
      >
        {followMutation.isPending ? (
          <Spinner size="sm" />
        ) : followed ? (
          <>
            <UserCheck className="w-3 h-3" />
            A seguir
          </>
        ) : (
          <>
            <UserPlus className="w-3 h-3" />
            Seguir
          </>
        )}
      </button>
    </li>
  )
}
