'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, Send } from 'lucide-react'
import { io, type Socket } from 'socket.io-client'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import { useRequireAuth } from '@/hooks/useRequireAuth'
import { Avatar } from '@/components/ui/Avatar'
import { Spinner } from '@/components/ui/Spinner'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'

interface Message {
  id: string
  senderId: string
  content: string
  createdAt: string
  readAt: string | null
}

interface ConvDetail {
  id: string
  otherUser: {
    id: string
    username: string
    avatarUrl: string | null
    isOnline: boolean
  }
  messages: Message[]
  hasMore: boolean
  oldestCursor: string | null
}

function timeStr(iso: string) {
  return new Date(iso).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })
}

export default function ConversationPage() {
  const { convId } = useParams<{ convId: string }>()
  const { user, accessToken } = useAuthStore()
  const { isReady } = useRequireAuth()
  const qc = useQueryClient()
  const socketRef      = useRef<Socket | null>(null)
  const bottomRef      = useRef<HTMLDivElement | null>(null)
  const [content, setContent]           = useState('')
  const [loadingOlder, setLoadingOlder] = useState(false)

  const { data, isLoading } = useQuery<ConvDetail>({
    queryKey: ['conversation', convId],
    queryFn: () => api.get(`/conversations/${convId}`),
    enabled: isReady,
  })

  async function handleLoadOlder() {
    if (!data?.oldestCursor || loadingOlder) return
    setLoadingOlder(true)
    try {
      const older = await api.get<ConvDetail>(`/conversations/${convId}?before=${data.oldestCursor}`)
      qc.setQueryData<ConvDetail>(['conversation', convId], (old) => {
        if (!old) return old
        const existingIds = new Set(old.messages.map((m) => m.id))
        const newMessages = older.messages.filter((m) => !existingIds.has(m.id))
        return {
          ...old,
          messages:     [...newMessages, ...old.messages],
          hasMore:      older.hasMore,
          oldestCursor: older.oldestCursor,
        }
      })
    } finally {
      setLoadingOlder(false)
    }
  }

  // Socket.IO setup
  useEffect(() => {
    if (!isReady || !accessToken) return

    const socket = io(API_URL, {
      auth: { token: accessToken },
      transports: ['websocket'],
    })

    socket.emit('join_conversation', convId)
    socket.emit('mark_read', convId)

    socket.on('new_message', (msg: Message) => {
      // skip own messages — already shown via optimistic update
      if (msg.senderId === user?.id) return
      qc.setQueryData(['conversation', convId], (old: ConvDetail | undefined) => {
        if (!old) return old
        return { ...old, messages: [...old.messages, msg] }
      })
      socket.emit('mark_read', convId)
    })

    socketRef.current = socket
    return () => { socket.disconnect() }
  }, [isReady, accessToken, convId, qc, user?.id])

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [data?.messages.length])

  const sendMutation = useMutation({
    mutationFn: (text: string) =>
      api.post<Message>('/messages', { conversationId: convId, content: text }),
    onMutate: (text) => {
      const optimisticId = `opt-${Date.now()}`
      const optimistic: Message = {
        id: optimisticId,
        senderId: user!.id,
        content: text,
        createdAt: new Date().toISOString(),
        readAt: null,
      }
      qc.setQueryData(['conversation', convId], (old: ConvDetail | undefined) => {
        if (!old) return old
        return { ...old, messages: [...old.messages, optimistic] }
      })
      return { optimisticId }
    },
    onSuccess: (realMsg, _text, context) => {
      qc.setQueryData(['conversation', convId], (old: ConvDetail | undefined) => {
        if (!old) return old
        return {
          ...old,
          messages: old.messages.map((m) => m.id === context?.optimisticId ? realMsg : m),
        }
      })
    },
    onError: (_err, _text, context) => {
      qc.setQueryData(['conversation', convId], (old: ConvDetail | undefined) => {
        if (!old) return old
        return { ...old, messages: old.messages.filter((m) => m.id !== context?.optimisticId) }
      })
    },
  })

  const handleSend = useCallback(() => {
    const text = content.trim()
    if (!text) return
    setContent('')
    sendMutation.mutate(text)
  }, [content, sendMutation])

  if (!isReady || isLoading) {
    return <div className="flex justify-center py-12"><Spinner size="lg" /></div>
  }

  if (!data) return null

  const other = data.otherUser

  return (
    <div className="flex flex-col" style={{ height: 'calc(100dvh - 5rem)' }}>
      {/* Header */}
      <div
        className="flex items-center gap-3 p-3 shrink-0"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <Link href="/messages" className="btn-ghost p-1.5 rounded-lg" aria-label="Voltar">
          <ChevronLeft className="w-5 h-5" style={{ color: 'var(--text-secondary)' }} />
        </Link>
        <div className="relative">
          <Avatar src={other.avatarUrl} name={other.username} size="md" />
          {other.isOnline && <div className="online-dot" />}
        </div>
        <div className="flex-1 min-w-0">
          <Link
            href={`/profile/${other.id}`}
            className="font-semibold text-sm hover:underline"
            style={{ color: 'var(--text-primary)' }}
          >
            @{other.username}
          </Link>
          <p className="text-xs" style={{ color: other.isOnline ? 'var(--success)' : 'var(--text-muted)' }}>
            {other.isOnline ? 'Online' : 'Offline'}
          </p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2">
        {data.hasMore && (
          <div className="flex justify-center mb-2">
            <button
              onClick={handleLoadOlder}
              disabled={loadingOlder}
              className="text-xs px-3 py-1.5 rounded-full transition-colors"
              style={{ background: 'var(--surface2)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
            >
              {loadingOlder ? <Spinner size="sm" /> : 'Carregar mensagens anteriores'}
            </button>
          </div>
        )}
        {data.messages.map((msg) => {
          const isMe = msg.senderId === user?.id
          return (
            <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
              <div className={isMe ? 'bubble-me' : 'bubble-other'}>
                <p>{msg.content}</p>
                <p
                  className="text-[10px] mt-1 text-right"
                  style={{ opacity: 0.65 }}
                >
                  {timeStr(msg.createdAt)}
                </p>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div
        className="shrink-0 flex items-center gap-2 p-3"
        style={{ borderTop: '1px solid var(--border)' }}
      >
        <input
          type="text"
          className="input rounded-full flex-1"
          placeholder="Escreve uma mensagem…"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSend())}
          maxLength={2000}
        />
        <button
          onClick={handleSend}
          disabled={!content.trim() || sendMutation.isPending}
          className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-opacity disabled:opacity-40"
          style={{ background: 'var(--accent)' }}
          aria-label="Enviar"
        >
          <Send className="w-4 h-4" style={{ color: '#000' }} />
        </button>
      </div>
    </div>
  )
}
