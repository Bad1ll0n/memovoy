'use client'

import Link from 'next/link'
import { useInfiniteQuery, useMutation, useQueryClient, type InfiniteData } from '@tanstack/react-query'
import { Bell, Heart, UserPlus, Trophy, MessageCircle, BellOff, BellRing } from 'lucide-react'
import { api } from '@/lib/api'
import { useRequireAuth } from '@/hooks/useRequireAuth'
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll'
import { usePushNotifications } from '@/hooks/usePushNotifications'
import { Avatar } from '@/components/ui/Avatar'
import { Spinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { NotificationsSkeleton } from '@/components/ui/Skeleton'
import { PedidosDeSeguimento, usePedidosDeSeguimento } from '@/components/notifications/PedidosDeSeguimento'
import { useCallback } from 'react'

type NotifType = 'like' | 'follow' | 'follow_request' | 'follow_accepted' | 'comment' | 'badge' | 'mention'

interface Notification {
  id: string
  type: NotifType
  read: boolean
  targetUrl: string | null
  message: string
  createdAt: string
  actor: {
    id: string
    username: string
    avatarUrl: string | null
  } | null
}

interface NotifPage {
  notifications: Notification[]
  nextCursor: string | null
}

/** Tintas derivadas do acento. Estavam aqui laranjas fixos da paleta antiga,
 *  que não acompanhavam a mudança de tema nem a da marca. */
const ACENTO_15 = 'color-mix(in srgb, var(--accent) 15%, transparent)'
const ACENTO_10 = 'color-mix(in srgb, var(--accent) 10%, transparent)'

function notifMeta(type: NotifType) {
  switch (type) {
    case 'like':    return { Icon: Heart,       bg: 'rgba(248,113,113,0.15)',  color: 'var(--danger)' }
    case 'follow':  return { Icon: UserPlus,    bg: 'var(--violet-subtle)',    color: 'var(--violet)' }
    // O aviso de pedido continua a aparecer na lista com o histórico todo, mas
    // a resposta dá-se na secção do topo — esta linha é o registo, não a acção.
    case 'follow_request':  return { Icon: UserPlus, bg: 'var(--violet-subtle)', color: 'var(--violet)' }
    case 'follow_accepted': return { Icon: UserPlus, bg: 'rgba(34,197,94,0.15)', color: 'var(--success)' }
    case 'comment': return { Icon: MessageCircle, bg: ACENTO_15, color: 'var(--accent)' }
    case 'badge':   return { Icon: Trophy,      bg: 'rgba(34,197,94,0.15)',    color: 'var(--success)' }
    default:        return { Icon: Bell,        bg: ACENTO_10, color: 'var(--accent)' }
  }
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'agora'
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}d`
}

export default function NotificationsPage() {
  const { isReady } = useRequireAuth()
  const qc = useQueryClient()
  const push = usePushNotifications()
  // Real-time is handled by the SocketProvider singleton in (app)/layout.tsx

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteQuery<NotifPage>({
      queryKey: ['notifications'],
      queryFn: ({ pageParam }) =>
        api.get(`/notifications${pageParam ? `?cursor=${pageParam}` : ''}`),
      initialPageParam: null as string | null,
      getNextPageParam: (last) => last.nextCursor,
      enabled: isReady,
    })

  const markAllMutation = useMutation({
    mutationFn: () => api.put('/notifications/read-all'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  })

  function markOneRead(notifId: string) {
    qc.setQueryData<InfiniteData<NotifPage>>(['notifications'], (old) => {
      if (!old) return old
      return {
        ...old,
        pages: old.pages.map((page) => ({
          ...page,
          notifications: page.notifications.map((n) =>
            n.id === notifId ? { ...n, read: true } : n,
          ),
        })),
      }
    })
    qc.invalidateQueries({ queryKey: ['unread-notif-count'] })
    api.put(`/notifications/${notifId}/read`).catch(() => {})
  }

  const handleLoadMore = useCallback(() => fetchNextPage(), [fetchNextPage])
  const sentinelRef = useInfiniteScroll({ hasMore: !!hasNextPage, onLoadMore: handleLoadMore })

  const { data: pedidosData } = usePedidosDeSeguimento(isReady)
  const pedidosPendentes = pedidosData?.requests.length ?? 0

  const notifications = data?.pages.flatMap((p) => p.notifications) ?? []
  const unreadCount = notifications.filter((n) => !n.read).length

  if (!isReady || isLoading) {
    return <NotificationsSkeleton />
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
          Notificações
        </h1>
        <div className="flex items-center gap-3">
          {push.state !== 'unsupported' && push.state !== 'denied' && (
            <button
              onClick={push.state === 'subscribed' ? push.unsubscribe : push.subscribe}
              disabled={push.loading}
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
              style={{
                background:   push.state === 'subscribed' ? ACENTO_15 : 'var(--surface2)',
                color:        push.state === 'subscribed' ? 'var(--accent)' : 'var(--text-secondary)',
                border:       push.state === 'subscribed' ? '1px solid color-mix(in srgb, var(--accent) 30%, transparent)' : '1px solid var(--border)',
              }}
              title={push.state === 'subscribed' ? 'Desativar notificações push' : 'Ativar notificações push'}
            >
              {push.loading ? (
                <Spinner size="sm" />
              ) : push.state === 'subscribed' ? (
                <><BellRing className="w-3.5 h-3.5" /> Ativas</>
              ) : (
                <><BellOff className="w-3.5 h-3.5" /> Push</>
              )}
            </button>
          )}
          {unreadCount > 0 && (
            <button
              onClick={() => markAllMutation.mutate()}
              className="text-sm font-medium hover:underline"
              style={{ color: 'var(--accent)' }}
              disabled={markAllMutation.isPending}
            >
              Marcar todas como lidas
            </button>
          )}
        </div>
      </div>

      <PedidosDeSeguimento activo={isReady} />

      {notifications.length === 0 && pedidosPendentes === 0 ? (
        <EmptyState
          illustration="notifications"
          title="Sem notificações"
          description="Quando alguém interagir contigo, aparece aqui."
        />
      ) : (
        <div className="flex flex-col gap-1">
          {notifications.map((n) => {
            const { Icon, bg, color } = notifMeta(n.type)
            const Row = (
              <div
                className={`flex items-start gap-3 p-3 rounded-xl transition-colors ${!n.read ? 'border-l-2' : ''}`}
                style={{
                  background: n.read ? 'transparent' : 'color-mix(in srgb, var(--accent) 6%, transparent)',
                  borderLeftColor: n.read ? 'transparent' : 'var(--accent)',
                }}
              >
                {/* Icon */}
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                  style={{ background: bg }}
                >
                  <Icon className="w-4 h-4" style={{ color }} />
                </div>
                {/* Actor avatar */}
                {n.actor && (
                  <Avatar src={n.actor.avatarUrl} name={n.actor.username} size="sm" className="shrink-0 mt-0.5" />
                )}
                {/* Text */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm" style={{ color: 'var(--text-primary)' }}>
                    {n.message}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                    {timeAgo(n.createdAt)}
                  </p>
                </div>
                {!n.read && (
                  <div className="w-2 h-2 rounded-full shrink-0 mt-1.5" style={{ background: 'var(--accent)' }} />
                )}
              </div>
            )

            return n.targetUrl ? (
              <Link
                key={n.id}
                href={n.targetUrl}
                className="hover:opacity-90 transition-opacity"
                onClick={() => { if (!n.read) markOneRead(n.id) }}
              >
                {Row}
              </Link>
            ) : (
              <div key={n.id} onClick={() => { if (!n.read) markOneRead(n.id) }}>{Row}</div>
            )
          })}
        </div>
      )}

      <div ref={sentinelRef} className="h-4 mt-4" />
      {isFetchingNextPage && <div className="flex justify-center py-4"><Spinner /></div>}
      {!hasNextPage && notifications.length > 0 && (
        <p className="end-of-list">Estás actualizado</p>
      )}
    </div>
  )
}
