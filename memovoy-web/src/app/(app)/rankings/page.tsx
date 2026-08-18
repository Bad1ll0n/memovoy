'use client'

import Link from 'next/link'
import { Trophy, TrendingUp, TrendingDown } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useRequireAuth } from '@/hooks/useRequireAuth'
import { Avatar } from '@/components/ui/Avatar'
import { Skeleton } from '@/components/ui/Skeleton'

interface TopTraveller {
  id: string
  username: string
  displayName: string
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

const MEDALS = ['🥇', '🥈', '🥉']

export default function RankingsPage() {
  const { isReady } = useRequireAuth()

  const { data: travellers, isLoading: loadingT } = useQuery<TopTraveller[]>({
    queryKey: ['rankings', 'travellers'],
    queryFn: () => api.get('/rankings/travellers?limit=10'),
    enabled: isReady,
  })

  const { data: trending, isLoading: loadingD } = useQuery<TrendingDest[]>({
    queryKey: ['rankings', 'trending'],
    queryFn: () => api.get('/rankings/trending?limit=10'),
    enabled: isReady,
  })

  return (
    <div>
      <div className="flex items-center gap-2.5 mb-6">
        <Trophy className="w-5 h-5" style={{ color: 'var(--gold)' }} />
        <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
          Rankings
        </h1>
      </div>

      {/* Top Viajantes */}
      <section className="card p-4 mb-4">
        <h2 className="text-sm font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
          Top 10 Viajantes
        </h2>
        {loadingT ? (
          <div className="flex flex-col gap-1">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 py-2.5">
                <Skeleton className="w-7 h-4 rounded" />
                <Skeleton className="w-8 h-8 rounded-full shrink-0" />
                <Skeleton className="h-4 flex-1 rounded" />
                <Skeleton className="h-4 w-12 rounded" />
              </div>
            ))}
          </div>
        ) : (
          <ul className="flex flex-col divide-y" style={{ borderColor: 'var(--border)' }}>
            {(travellers ?? []).map((u) => (
              <li key={u.id} className="flex items-center gap-3 py-3">
                <span className="text-base w-7 text-center shrink-0">
                  {u.rank <= 3 ? MEDALS[u.rank - 1] : (
                    <span className="text-sm font-bold" style={{ color: 'var(--text-muted)' }}>{u.rank}</span>
                  )}
                </span>
                <Avatar src={u.avatarUrl} name={u.displayName || u.username} size="md" />
                <Link href={`/profile/${u.id}`} className="flex-1 min-w-0 hover:underline">
                  <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                    {u.displayName || u.username}
                  </p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>@{u.username}</p>
                </Link>
                <div className="text-right shrink-0">
                  <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--accent)' }}>
                    {u.score.toLocaleString()}
                  </span>
                  <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>pts</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Destinos em Alta */}
      <section className="card p-4">
        <h2 className="text-sm font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
          Top 10 Destinos em Alta
        </h2>
        {loadingD ? (
          <div className="flex flex-col gap-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="w-5 h-3.5 rounded" />
                <Skeleton className="h-3.5 flex-1 rounded" />
                <Skeleton className="h-3.5 w-16 rounded" />
                <Skeleton className="h-3.5 w-10 rounded" />
              </div>
            ))}
          </div>
        ) : (trending ?? []).length === 0 ? (
          <p className="text-sm text-center py-4" style={{ color: 'var(--text-muted)' }}>
            Sem dados esta semana.
          </p>
        ) : (
          <ul className="flex flex-col divide-y" style={{ borderColor: 'var(--border)' }}>
            {(trending ?? []).map((d, i) => (
              <li key={i} className="flex items-center gap-3 py-2.5">
                <span className="text-xs font-bold w-5 text-center shrink-0 tabular-nums" style={{ color: 'var(--text-muted)' }}>
                  {i + 1}
                </span>
                <span className="flex-1 text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                  {d.destination}
                </span>
                <span className="text-xs shrink-0" style={{ color: 'var(--text-muted)' }}>
                  {d.count} rot.
                </span>
                <span
                  className="flex items-center gap-0.5 text-xs font-semibold shrink-0 tabular-nums"
                  style={{ color: d.trend === 'up' ? 'var(--success)' : 'var(--danger)' }}
                >
                  {d.trend === 'up' ? (
                    <TrendingUp className="w-3.5 h-3.5" />
                  ) : (
                    <TrendingDown className="w-3.5 h-3.5" />
                  )}
                  {Math.abs(d.deltaPct)}%
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
