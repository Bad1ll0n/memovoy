// src/app/notifications/page.tsx
'use client'

import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef }  from 'react'
import { useRouter }          from 'next/navigation'
import { useAuthStore }       from '@/store/auth'
import { api }                from '@/lib/api-client'
import { NavBar }             from '@/components/layout/NavBar'
import { cn, formatRelative } from '@/lib/utils'
import type { AppNotification, PaginatedResponse } from '@/types'

// Ícone e cor por tipo de notificação
function notifMeta(type: string): { icon: string; color: string } {
  const map: Record<string, { icon: string; color: string }> = {
    like:               { icon: '❤️',  color: 'text-red-500'          },
    comment:            { icon: '💬',  color: 'text-blue'             },
    follow:             { icon: '👤',  color: 'text-purple-500'       },
    follow_request:     { icon: '🔔',  color: 'text-purple-500'       },
    challenge_complete: { icon: '🏆',  color: 'text-amber'            },
    badge_earned:       { icon: '⭐',  color: 'text-amber'            },
    geo_alert:          { icon: '📍',  color: 'text-green'            },
    session_suspicious: { icon: '🔒',  color: 'text-red-600'          },
    carbon_milestone:   { icon: '🌱',  color: 'text-green'            },
    itinerary_ready:    { icon: '✅',  color: 'text-green'            },
    day_summary:        { icon: '☀️',  color: 'text-amber'            },
  }
  return map[type] ?? { icon: '🔔', color: 'text-blue' }
}

export default function NotificationsPage() {
  const { isAuthenticated, isHydrated } = useAuthStore()
  const router      = useRouter()
  const qc          = useQueryClient()
  const sentinelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isHydrated && !isAuthenticated) router.replace('/auth/login')
  }, [isHydrated, isAuthenticated, router])

  const {
    data, fetchNextPage, hasNextPage,
    isFetchingNextPage, isLoading,
  } = useInfiniteQuery({
    queryKey: ['notifications'],
    queryFn:  ({ pageParam }) =>
      api.get<PaginatedResponse<AppNotification>>('/notifications', {
        params: { limit: 30, ...(pageParam ? { cursor: pageParam } : {}) },
      }),
    initialPageParam:  undefined as string | undefined,
    getNextPageParam:  (last) => last.nextCursor ?? undefined,
    enabled:           isAuthenticated,
  })

  // IntersectionObserver para paginação
  useEffect(() => {
    if (!sentinelRef.current) return
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting && hasNextPage) fetchNextPage() },
      { threshold: 0.1 }
    )
    obs.observe(sentinelRef.current)
    return () => obs.disconnect()
  }, [hasNextPage, fetchNextPage])

  // Mutation: marcar uma notificação como lida
  const markReadMutation = useMutation({
    mutationFn: (id: string) => api.patch<void>(`/notifications/${id}/read`),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: ['notifications'] })
      const prev = qc.getQueryData(['notifications'])
      // Optimistic: marcar como lida em todas as páginas
      qc.setQueryData(['notifications'], (old: typeof data) => ({
        ...old!,
        pages: old!.pages.map((page) => ({
          ...page,
          items: page.items.map((n) =>
            n.id === id
              ? { ...n, isRead: true, readAt: new Date().toISOString(), status: 'read' }
              : n
          ),
        })),
      }))
      return { prev }
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(['notifications'], ctx.prev)
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] })
      qc.invalidateQueries({ queryKey: ['notifications', 'count'] })
    },
  })

  // Mutation: marcar todas como lidas
  const markAllReadMutation = useMutation({
    mutationFn: () => api.patch<void>('/notifications/read-all'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] })
      qc.invalidateQueries({ queryKey: ['notifications', 'count'] })
    },
  })

  const notifications = data?.pages.flatMap((p) => p.items) ?? []
  const unreadCount = notifications.filter((n) => !n.isRead).length

  if (!isHydrated || !isAuthenticated) return null

  return (
    <div className="min-h-screen bg-surface-subtle">
      <NavBar />

      <main className="max-w-2xl mx-auto px-4 py-8 pb-24 md:pb-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="font-display text-2xl font-bold text-ink flex items-center gap-3">
              Notificações
              {unreadCount > 0 && (
                <span className="text-sm font-semibold px-2 py-0.5 rounded-full bg-blue text-white">
                  {unreadCount}
                </span>
              )}
            </h1>
          </div>
          {unreadCount > 0 && (
            <button
              onClick={() => markAllReadMutation.mutate()}
              disabled={markAllReadMutation.isPending}
              className="btn-ghost text-sm text-blue"
            >
              {markAllReadMutation.isPending ? 'A marcar…' : 'Marcar todas como lidas'}
            </button>
          )}
        </div>

        {/* Lista */}
        {isLoading ? (
          <div className="card divide-y divide-surface-muted">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex gap-3 p-4">
                <div className="skeleton w-10 h-10 rounded-full shrink-0" />
                <div className="flex-1 space-y-2 py-1">
                  <div className="skeleton h-3 w-3/4 rounded" />
                  <div className="skeleton h-3 w-1/2 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : notifications.length === 0 ? (
          <div className="card p-16 text-center space-y-3">
            <p className="text-4xl">🔔</p>
            <p className="font-display text-lg font-bold text-ink">Sem notificações</p>
            <p className="text-ink-secondary text-sm">
              Quando alguém interagir com o teu conteúdo, verás aqui.
            </p>
          </div>
        ) : (
          <div className="card divide-y divide-surface-muted overflow-hidden">
            {notifications.map((n) => {
              const meta = notifMeta(n.type)
              return (
                <div
                  key={n.id}
                  className={cn(
                    'flex gap-3 p-4 transition-colors',
                    n.isRead
                      ? 'bg-surface'
                      : 'bg-blue/3 hover:bg-blue/5'
                  )}
                >
                  {/* Ícone */}
                  <div className={cn(
                    'w-10 h-10 rounded-full flex items-center justify-center text-lg shrink-0',
                    'bg-surface-subtle'
                  )}>
                    {meta.icon}
                  </div>

                  {/* Conteúdo */}
                  <div className="flex-1 min-w-0">
                    <p className={cn(
                      'text-sm leading-snug',
                      n.isRead ? 'text-ink-secondary font-normal' : 'text-ink font-medium'
                    )}>
                      {n.title}
                    </p>
                    {n.body && (
                      <p className="text-xs text-ink-tertiary mt-0.5 line-clamp-2">
                        {n.body}
                      </p>
                    )}
                    <p className="text-xs text-ink-tertiary mt-1">
                      {formatRelative(n.createdAt)}
                    </p>
                  </div>

                  {/* Indicador + botão */}
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    {!n.isRead && (
                      <>
                        <div className="w-2 h-2 rounded-full bg-blue mt-1" />
                        <button
                          onClick={() => markReadMutation.mutate(n.id)}
                          className="text-xs text-blue hover:underline"
                        >
                          Lida
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Sentinel */}
        <div ref={sentinelRef} className="py-4 flex justify-center">
          {isFetchingNextPage && (
            <div className="w-4 h-4 rounded-full border-2 border-blue border-t-transparent animate-spin" />
          )}
        </div>
      </main>
    </div>
  )
}
