'use client'

import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { MessageCircle, Trash2, Send } from 'lucide-react'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import { Avatar } from '@/components/ui/Avatar'
import { toast } from '@/store/toastStore'

interface Comment {
  id: string
  userId: string
  username: string
  displayName: string
  avatarUrl: string | null
  content: string
  createdAt: string
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1)  return 'agora'
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}d`
}

export function ItineraryComments({ itineraryId }: { itineraryId: string }) {
  const { user } = useAuthStore()
  const qc = useQueryClient()
  const [text, setText] = useState('')
  const key = ['iti-comments', itineraryId]
  const deleteTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  const { data } = useQuery<{ comments: Comment[] }>({
    queryKey: key,
    queryFn:  () => api.get(`/itineraries/${itineraryId}/comments`),
  })

  const addMutation = useMutation<Comment, Error, string>({
    mutationFn: (content: string) =>
      api.post<Comment>(`/itineraries/${itineraryId}/comments`, { content }),
    onSuccess: (comment: Comment) => {
      qc.setQueryData<{ comments: Comment[] }>(key, (old) =>
        old ? { comments: [comment, ...old.comments] } : { comments: [comment] },
      )
      setText('')
    },
  })

  function handleDeleteComment(comment: Comment) {
    const prevData = qc.getQueryData<{ comments: Comment[] }>(key)

    // Optimistically remove from UI
    qc.setQueryData<{ comments: Comment[] }>(key, (old) =>
      old ? { comments: old.comments.filter((c) => c.id !== comment.id) } : old,
    )

    // Schedule real delete after 5 s
    const timer = setTimeout(() => {
      deleteTimers.current.delete(comment.id)
      api.delete(`/itineraries/comments/${comment.id}`).catch(() => {
        qc.setQueryData(key, prevData)
      })
    }, 5000)
    deleteTimers.current.set(comment.id, timer)

    toast('Comentário eliminado.', {
      type: 'info',
      duration: 5000,
      undoFn: () => {
        const t = deleteTimers.current.get(comment.id)
        if (t) { clearTimeout(t); deleteTimers.current.delete(comment.id) }
        qc.setQueryData(key, prevData)
      },
    })
  }

  const deleteMutation = { isPending: false }

  const comments = data?.comments ?? []

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const t = text.trim()
    if (!t || addMutation.isPending) return
    addMutation.mutate(t)
  }

  return (
    <div className="card p-4 mt-3">
      <h3
        className="text-sm font-bold mb-4 flex items-center gap-2"
        style={{ color: 'var(--text-primary)' }}
      >
        <MessageCircle className="w-4 h-4" style={{ color: 'var(--accent)' }} />
        Comentários
        {comments.length > 0 && (
          <span className="text-xs font-normal" style={{ color: 'var(--text-muted)' }}>
            ({comments.length})
          </span>
        )}
      </h3>

      {/* Add comment */}
      {user && (
        <form onSubmit={handleSubmit} className="flex gap-2 mb-5">
          <Avatar src={user.avatarUrl} name={user.displayName} size="sm" className="shrink-0 mt-0.5" />
          <div className="flex-1 relative">
            <input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Escreve um comentário…"
              maxLength={2200}
              className="input text-sm" style={{ paddingRight: '2.5rem' }}
            />
            <button
              type="submit"
              disabled={!text.trim() || addMutation.isPending}
              className="absolute right-2 top-1/2 -translate-y-1/2 disabled:opacity-30 transition-opacity"
              style={{ color: 'var(--accent)' }}
              aria-label="Publicar"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </form>
      )}

      {/* Comment list */}
      {comments.length === 0 ? (
        <p className="text-sm text-center py-4" style={{ color: 'var(--text-muted)' }}>
          Ainda não há comentários. Sê o primeiro!
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {comments.map((c) => (
            <div key={c.id} className="flex items-start gap-3 group">
              <Avatar src={c.avatarUrl} name={c.displayName} size="sm" className="shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {c.displayName}
                  </span>
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {timeAgo(c.createdAt)}
                  </span>
                </div>
                <p className="text-sm mt-0.5" style={{ color: 'var(--text-primary)' }}>
                  {c.content}
                </p>
              </div>
              {user?.id === c.userId && (
                <button
                  onClick={() => handleDeleteComment(c)}
                  disabled={deleteMutation.isPending}
                  className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5"
                  style={{ color: 'var(--text-muted)' }}
                  aria-label="Eliminar comentário"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
