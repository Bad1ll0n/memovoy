'use client'

import { useState } from 'react'
import Link from 'next/link'
import { TrendingUp, TrendingDown, UserPlus, UserCheck } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import { Avatar } from '@/components/ui/Avatar'
import { Spinner } from '@/components/ui/Spinner'

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

export function RightPanel() {
  const { isHydrated } = useAuthStore()

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
      // Mesmo enquadramento da barra da esquerda, e pela mesma razão.
      //
      // Esta tinha a largura maior das duas (280 contra 240) e mesmo assim
      // parecia mais pequena: sem borda e sem fundo, os cartões ficavam a
      // flutuar no vazio em vez de formarem uma coluna. A folga até é simétrica
      // — 315px de cada lado do conteúdo — mas à esquerda o espaço acaba num
      // limite visível e à direita não acabava em nada.
      //
      // O overflow vai no conteúdo e não no <aside>, com min-h-0, para que num
      // ecrã baixo deslizem só os cartões. É a mesma correcção que a barra da
      // esquerda levou.
      className="hidden xl:flex flex-col h-screen sticky top-0 overflow-hidden"
      style={{
        width: 'var(--right-width)',
        borderLeft: '1px solid var(--border)',
        background: 'var(--bg-body)',
      }}
    >
      <div className="flex flex-col gap-4 py-5 px-3 flex-1 min-h-0 overflow-y-auto">
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
      </div>
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
