// src/app/posts/[id]/page.tsx
'use client'

import Image              from 'next/image'
import Link               from 'next/link'
import { useParams }      from 'next/navigation'
import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore }   from '@/store/auth'
import { api }            from '@/lib/api-client'
import { NavBar }         from '@/components/layout/NavBar'
import { cn, formatRelative, levelLabel } from '@/lib/utils'
import type { Post, Comment } from '@/types'

interface PostDetailResponse { post: Post }
interface CommentResponse    { comment: Comment }
interface LikeResponse       { liked: boolean }

export default function PostPage() {
  const { id }   = useParams<{ id: string }>()
  const { user } = useAuthStore()
  const qc       = useQueryClient()
  const [commentText, setCommentText] = useState('')
  const [replyTo, setReplyTo] = useState<{ id: string; username: string } | null>(null)
  const commentInputRef = useRef<HTMLInputElement>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['post', id],
    queryFn:  () => api.get<PostDetailResponse>(`/posts/${id}`),
  })

  // Mutation: like
  const likeMutation = useMutation({
    mutationFn: () => api.post<LikeResponse>(`/posts/${id}/like`),
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: ['post', id] })
      const prev = qc.getQueryData<PostDetailResponse>(['post', id])
      if (prev) {
        qc.setQueryData<PostDetailResponse>(['post', id], {
          post: {
            ...prev.post,
            viewerLiked: !prev.post.viewerLiked,
            likesCount:  prev.post.likesCount + (prev.post.viewerLiked ? -1 : 1),
          },
        })
      }
      return { prev }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(['post', id], ctx.prev)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['post', id] }),
  })

  // Mutation: comentário
  const commentMutation = useMutation({
    mutationFn: (content: string) =>
      api.post<CommentResponse>(`/posts/${id}/comments`, {
        content,
        ...(replyTo ? { parentCommentId: replyTo.id } : {}),
      }),
    onSuccess: () => {
      setCommentText('')
      setReplyTo(null)
      qc.invalidateQueries({ queryKey: ['post', id] })
    },
  })

  const post = data?.post

  function handleSubmitComment(e: React.FormEvent) {
    e.preventDefault()
    if (!commentText.trim()) return
    commentMutation.mutate(commentText.trim())
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-surface-subtle">
        <NavBar />
        <div className="max-w-2xl mx-auto px-4 py-8 space-y-4">
          <div className="skeleton h-96 w-full rounded-xl" />
          <div className="skeleton h-4 w-3/4 rounded" />
          <div className="skeleton h-4 w-1/2 rounded" />
        </div>
      </div>
    )
  }

  if (!post) {
    return (
      <div className="min-h-screen bg-surface-subtle">
        <NavBar />
        <div className="max-w-2xl mx-auto px-4 py-16 text-center space-y-4">
          <p className="text-4xl">🤔</p>
          <h1 className="font-display text-xl font-bold text-ink">Post não encontrado</h1>
          <Link href="/feed" className="btn-secondary text-sm">← Voltar ao feed</Link>
        </div>
      </div>
    )
  }

  const { label: lvLabel, color: lvColor } = levelLabel(post.level ?? 'explorer')

  return (
    <div className="min-h-screen bg-surface-subtle">
      <NavBar />

      <main className="max-w-2xl mx-auto px-4 py-6 pb-32 md:pb-6">
        <div className="card overflow-hidden">

          {/* Header: autor */}
          <div className="flex items-center gap-3 p-4 border-b border-surface-muted">
            <Link href={`/profile/${post.userId}`} className="shrink-0">
              {post.avatarUrl ? (
                <Image
                  src={post.avatarUrl} alt={post.displayName}
                  width={40} height={40} className="rounded-full object-cover"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-blue/10 flex items-center justify-center text-blue font-bold">
                  {post.displayName[0].toUpperCase()}
                </div>
              )}
            </Link>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <Link href={`/profile/${post.userId}`}
                  className="font-semibold text-sm text-ink hover:text-blue transition-colors">
                  {post.displayName}
                </Link>
                <span
                  className="text-2xs font-semibold px-2 py-0.5 rounded-full text-white"
                  style={{ backgroundColor: lvColor }}
                >{lvLabel}</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-ink-tertiary mt-0.5">
                {post.locationName && <span>📍 {post.locationName}</span>}
                <span>{formatRelative(post.createdAt)}</span>
              </div>
            </div>
            {/* Menu de opções */}
            {user?.id !== post.userId && (
              <Link
                href={`/posts/${id}/report`}
                className="text-ink-tertiary hover:text-red-500 text-sm transition-colors"
                title="Denunciar"
              >
                ⋯
              </Link>
            )}
          </div>

          {/* Media — carousel se múltiplas */}
          {post.media && post.media.length > 0 && (
            <MediaCarousel media={post.media} />
          )}

          {/* Acções */}
          <div className="flex items-center gap-2 px-4 py-3 border-b border-surface-muted">
            <button
              onClick={() => likeMutation.mutate()}
              disabled={!user}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors font-medium text-sm',
                post.viewerLiked
                  ? 'text-red-500 bg-red-50'
                  : 'text-ink-secondary hover:text-ink hover:bg-surface-subtle'
              )}
            >
              <span className={cn('text-lg', likeMutation.isPending && 'animate-like-pop')}>
                {post.viewerLiked ? '❤️' : '🤍'}
              </span>
              {post.likesCount}
            </button>

            <button
              onClick={() => {
                setReplyTo(null)
                commentInputRef.current?.focus()
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-ink-secondary hover:text-ink hover:bg-surface-subtle transition-colors text-sm"
            >
              💬 {post.commentsCount}
            </button>

            <div className="ml-auto flex items-center gap-3 text-xs text-ink-tertiary">
              {post.itineraryId && (
                <Link href={`/itineraries/${post.itineraryId}`} className="text-blue hover:underline text-xs">
                  🗺 Ver roteiro
                </Link>
              )}
            </div>
          </div>

          {/* Caption */}
          {post.caption && (
            <div className="px-4 py-3 border-b border-surface-muted">
              <p className="text-sm text-ink leading-relaxed">
                <Link href={`/profile/${post.userId}`}
                  className="font-semibold hover:text-blue transition-colors mr-1">
                  {post.username}
                </Link>
                {post.caption}
              </p>
            </div>
          )}

          {/* Comentários */}
          <div className="divide-y divide-surface-muted">
            {(post.comments ?? []).length === 0 ? (
              <p className="text-center text-ink-tertiary text-sm py-8">
                Ainda sem comentários. Sê o primeiro!
              </p>
            ) : (
              (post.comments ?? []).map((comment) => (
                <CommentRow
                  key={comment.id}
                  comment={comment}
                  onReply={() => {
                    setReplyTo({ id: comment.id, username: comment.username })
                    commentInputRef.current?.focus()
                  }}
                />
              ))
            )}
          </div>
        </div>
      </main>

      {/* Input de comentário fixo no fundo (só se autenticado) */}
      {user && (
        <div className="fixed bottom-0 inset-x-0 bg-surface/95 backdrop-blur-md border-t border-surface-muted z-30">
          <form onSubmit={handleSubmitComment} className="max-w-2xl mx-auto px-4 py-3">
            {replyTo && (
              <div className="flex items-center justify-between mb-2 text-xs text-ink-secondary bg-surface-subtle px-3 py-1.5 rounded-lg">
                <span>↩ A responder a <strong>@{replyTo.username}</strong></span>
                <button type="button" onClick={() => setReplyTo(null)} className="text-ink-tertiary hover:text-ink">✕</button>
              </div>
            )}
            <div className="flex gap-2 items-center">
              <input
                ref={commentInputRef}
                type="text"
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder={replyTo ? `Responder a @${replyTo.username}…` : 'Adicionar comentário…'}
                className="flex-1 px-4 py-2.5 rounded-full border border-surface-muted bg-surface-subtle
                           text-sm focus:outline-none focus:ring-2 focus:ring-blue/30 focus:border-blue"
              />
              <button
                type="submit"
                disabled={!commentText.trim() || commentMutation.isPending}
                className="btn-primary px-4 py-2 text-sm rounded-full"
              >
                {commentMutation.isPending ? '…' : 'Enviar'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// MediaCarousel — galeria de imagens com navegação
// ---------------------------------------------------------------------------

function MediaCarousel({ media }: { media: Post['media'] }) {
  const [current, setCurrent] = useState(0)
  if (!media || media.length === 0) return null

  return (
    <div className="relative bg-black">
      <div className="relative w-full aspect-square overflow-hidden">
        <Image
          src={media[current].url}
          alt={`Media ${current + 1}`}
          fill
          className="object-contain"
          sizes="(max-width: 672px) 100vw, 672px"
          priority={current === 0}
        />
      </div>

      {/* Navegação */}
      {media.length > 1 && (
        <>
          {current > 0 && (
            <button
              onClick={() => setCurrent(c => c - 1)}
              className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70 transition-colors"
            >
              ‹
            </button>
          )}
          {current < media.length - 1 && (
            <button
              onClick={() => setCurrent(c => c + 1)}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70 transition-colors"
            >
              ›
            </button>
          )}
          {/* Indicadores */}
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
            {media.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrent(i)}
                className={cn(
                  'w-1.5 h-1.5 rounded-full transition-colors',
                  i === current ? 'bg-white' : 'bg-white/40'
                )}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// CommentRow
// ---------------------------------------------------------------------------

function CommentRow({ comment, onReply }: { comment: Comment; onReply: () => void }) {
  const { user } = useAuthStore()

  return (
    <div className="flex gap-3 px-4 py-3">
      <Link href={`/profile/${comment.userId}`} className="shrink-0">
        {comment.avatarUrl ? (
          <Image src={comment.avatarUrl} alt={comment.displayName}
            width={32} height={32} className="rounded-full object-cover" />
        ) : (
          <div className="w-8 h-8 rounded-full bg-blue/10 flex items-center justify-center text-blue text-xs font-bold">
            {comment.displayName[0].toUpperCase()}
          </div>
        )}
      </Link>

      <div className="flex-1 min-w-0">
        <p className="text-sm text-ink leading-snug">
          <Link href={`/profile/${comment.userId}`}
            className="font-semibold hover:text-blue transition-colors mr-1">
            {comment.username}
          </Link>
          {comment.content}
        </p>

        <div className="flex items-center gap-4 mt-1.5 text-xs text-ink-tertiary">
          <span>{formatRelative(comment.createdAt)}</span>
          {comment.likesCount > 0 && <span>❤️ {comment.likesCount}</span>}
          {user && (
            <button onClick={onReply} className="hover:text-blue transition-colors font-medium">
              Responder
            </button>
          )}
          {comment.replyCount !== null && comment.replyCount! > 0 && (
            <span className="text-blue">
              Ver {comment.replyCount} {comment.replyCount === 1 ? 'resposta' : 'respostas'}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
