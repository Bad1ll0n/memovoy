'use client'

import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useRequireAuth } from '@/hooks/useRequireAuth'
import { Avatar } from '@/components/ui/Avatar'
import { Spinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'

interface Conversation {
  id: string
  otherUser: {
    id: string
    username: string
    avatarUrl: string | null
    isOnline: boolean
  }
  lastMessage: string | null
  lastMessageAt: string | null
  unreadCount: number
}

function timeAgo(iso: string | null) {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'agora'
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}d`
}

export default function MessagesPage() {
  const { isReady } = useRequireAuth()

  const { data: conversations, isLoading } = useQuery<Conversation[]>({
    queryKey: ['conversations'],
    queryFn: () => api.get('/conversations'),
    enabled: isReady,
    // Real-time updates via conversations:updated socket event (SocketProvider)
  })

  if (!isReady || isLoading) {
    return <div className="flex justify-center py-12"><Spinner size="lg" /></div>
  }

  return (
    <div>
      <h1 className="text-xl font-bold mb-5" style={{ color: 'var(--text-primary)' }}>
        Mensagens
      </h1>

      {(!conversations || conversations.length === 0) ? (
        <EmptyState
          illustration="messages"
          title="Nenhuma conversa"
          description="Vai a um perfil e inicia uma conversa."
        />
      ) : (
        <div className="flex flex-col gap-1">
          {conversations.map((conv) => (
            <Link
              key={conv.id}
              href={`/messages/${conv.id}`}
              className="flex items-center gap-3 p-3 rounded-xl transition-colors hover:opacity-90"
              style={{
                background: conv.unreadCount > 0 ? 'var(--accent-faint)' : 'var(--bg-card)',
                borderLeft: conv.unreadCount > 0 ? '3px solid var(--accent)' : '3px solid transparent',
              }}
            >
              <div className="relative shrink-0">
                <Avatar
                  src={conv.otherUser.avatarUrl}
                  name={conv.otherUser.username}
                  size="md"
                />
                {conv.otherUser.isOnline && <div className="online-dot" />}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p
                    className={`text-sm ${conv.unreadCount > 0 ? 'font-bold' : 'font-medium'} truncate`}
                    style={{ color: 'var(--text-primary)' }}
                  >
                    @{conv.otherUser.username}
                  </p>
                  <span className="text-xs shrink-0" style={{ color: 'var(--text-muted)' }}>
                    {timeAgo(conv.lastMessageAt)}
                  </span>
                </div>
                <p
                  className="text-xs truncate"
                  style={{ color: conv.unreadCount > 0 ? 'var(--text-primary)' : 'var(--text-muted)' }}
                >
                  {conv.lastMessage ?? 'Sem mensagens'}
                </p>
              </div>

              {conv.unreadCount > 0 && (
                <span className="badge shrink-0">{conv.unreadCount}</span>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
