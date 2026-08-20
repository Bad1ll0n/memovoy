'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useState, useRef, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Heart, MessageCircle, Bookmark, MoreHorizontal, MapPin, ArrowLeft, Send, CornerDownRight, Trash2, Link2, Flag, Pencil, Check, X } from 'lucide-react'
import { api } from '@/lib/api'
import { useRequireAuth } from '@/hooks/useRequireAuth'
import { Avatar } from '@/components/ui/Avatar'
import { Spinner } from '@/components/ui/Spinner'
import { AlertBanner } from '@/components/ui/AlertBanner'
import { VideoPlayer, isVideoUrl } from '@/components/ui/VideoPlayer'
import { Lightbox } from '@/components/ui/Lightbox'
import { ReportModal } from '@/components/ui/ReportModal'
import type { Post } from '@/components/feed/PostCard'

interface Comment {
  id: string
  userId: string
  username: string
  displayName: string
  avatarUrl: string | null
  parentId: string | null
  content: string
  likes: number
  viewerLiked: boolean
  createdAt: string
}

export default function PostDetailClient() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { isReady, user } = useRequireAuth()
  const qc = useQueryClient()
  const [imgIdx, setImgIdx]               = useState(0)
  const [lightboxOpen, setLightboxOpen]   = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState(0)
  const [reportOpen, setReportOpen]       = useState(false)
  const [comment, setComment]             = useState('')
  const [replyTo, setReplyTo]       = useState<{ id: string; username: string } | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError]           = useState('')
  const [showMenu, setShowMenu]         = useState(false)
  const [confirmDel, setConfirmDel]     = useState(false)
  const [editMode, setEditMode]         = useState(false)
  const [editCaption, setEditCaption]   = useState('')
  const [editDest, setEditDest]         = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const menuRef  = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!showMenu) return
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false)
        setConfirmDel(false)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [showMenu])

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/posts/${id}`),
    onSuccess: () => router.replace('/feed'),
  })

  const editMutation = useMutation({
    mutationFn: (data: { caption: string; destination: string }) =>
      api.patch(`/posts/${id}`, { caption: data.caption, destination: data.destination || null }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: postKey })
      setEditMode(false)
    },
  })

  const postKey = ['post', id]
  const { data: post, isLoading: loadingPost } = useQuery<Post>({
    queryKey: postKey,
    queryFn: () => api.get(`/posts/${id}`),
    enabled: isReady,
  })

  const isOwner = user?.id === post?.userId

  const commentsKey = ['comments', id]
  const { data: commentsData, isLoading: loadingComments } = useQuery<{ comments: Comment[] }>({
    queryKey: commentsKey,
    queryFn: () => api.get(`/posts/${id}/comments`),
    enabled: isReady,
  })

  const likeMutation = useMutation({
    mutationFn: () =>
      post?.viewerLiked ? api.delete(`/posts/${id}/like`) : api.post(`/posts/${id}/like`),
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: postKey })
      const prev = qc.getQueryData<Post>(postKey)
      qc.setQueryData<Post>(postKey, (old) =>
        old
          ? {
              ...old,
              viewerLiked: !old.viewerLiked,
              likesCount: old.likesCount + (old.viewerLiked ? -1 : 1),
            }
          : old,
      )
      return prev
    },
    onError: (_err, _v, ctx) => qc.setQueryData(postKey, ctx),
  })

  const saveMutation = useMutation({
    mutationFn: () =>
      post?.viewerSaved
        ? api.delete(`/bookmarks/post/${id}`)
        : api.post('/bookmarks', { postId: id }),
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: postKey })
      const prev = qc.getQueryData<Post>(postKey)
      qc.setQueryData<Post>(postKey, (old) =>
        old ? { ...old, viewerSaved: !old.viewerSaved } : old,
      )
      return prev
    },
    onError: (_err, _v, ctx) => qc.setQueryData(postKey, ctx),
  })

  function handleLikeComment(commentId: string, currentlyLiked: boolean) {
    qc.setQueryData<{ comments: Comment[] }>(commentsKey, (old) => {
      if (!old) return old
      return {
        comments: old.comments.map((c) =>
          c.id === commentId
            ? { ...c, viewerLiked: !currentlyLiked, likes: c.likes + (currentlyLiked ? -1 : 1) }
            : c,
        ),
      }
    })
    const fn = currentlyLiked
      ? api.delete(`/posts/comments/${commentId}/like`)
      : api.post(`/posts/comments/${commentId}/like`)
    fn.catch(() => {
      // revert on failure
      qc.setQueryData<{ comments: Comment[] }>(commentsKey, (old) => {
        if (!old) return old
        return {
          comments: old.comments.map((c) =>
            c.id === commentId
              ? { ...c, viewerLiked: currentlyLiked, likes: c.likes + (currentlyLiked ? 1 : -1) }
              : c,
          ),
        }
      })
    })
  }

  async function handleSubmitComment(e: React.FormEvent) {
    e.preventDefault()
    if (!comment.trim()) return
    setSubmitting(true)
    setError('')
    try {
      const newComment = await api.post<Comment>(`/posts/${id}/comments`, {
        content: comment.trim(),
        parentId: replyTo?.id,
      })
      qc.setQueryData<{ comments: Comment[] }>(commentsKey, (old) =>
        old ? { comments: [newComment, ...old.comments] } : { comments: [newComment] },
      )
      qc.setQueryData<Post>(postKey, (old) =>
        old ? { ...old, commentsCount: old.commentsCount + 1 } : old,
      )
      setComment('')
      setReplyTo(null)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao comentar.')
    } finally {
      setSubmitting(false)
    }
  }

  if (!isReady || loadingPost) {
    return (
      <div className="flex justify-center py-12">
        <Spinner size="lg" />
      </div>
    )
  }

  if (!post) {
    return (
      <div className="text-center py-12">
        <p style={{ color: 'var(--text-muted)' }}>Post não encontrado.</p>
        <button onClick={() => router.back()} className="btn btn-secondary mt-4 text-sm">
          Voltar
        </button>
      </div>
    )
  }

  const images = post.images ?? []

  return (
    <div>
      <button
        onClick={() => router.back()}
        className="flex items-center gap-2 mb-4 text-sm hover:opacity-80 transition-opacity"
        style={{ color: 'var(--text-muted)' }}
      >
        <ArrowLeft className="w-4 h-4" />
        Voltar
      </button>

      <article className="card overflow-hidden animate-fade-in relative">
        {/* Header */}
        <div className="flex items-center gap-3 p-3">
          <Link href={`/profile/${post.userId}`}>
            <Avatar src={post.avatarUrl} name={post.displayName || post.username} size="md" />
          </Link>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <Link
                href={`/profile/${post.userId}`}
                className="font-semibold text-sm hover:underline"
                style={{ color: 'var(--text-primary)' }}
              >
                {post.displayName || post.username}
              </Link>
            </div>
            {post.destination && (
              <div className="flex items-center gap-1 mt-0.5">
                <MapPin className="w-3 h-3" style={{ color: 'var(--text-muted)' }} />
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {post.destination}
                </span>
              </div>
            )}
          </div>
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => { setShowMenu((v) => !v); setConfirmDel(false) }}
              className="btn-ghost p-1 rounded-lg"
              style={{ color: 'var(--text-muted)' }}
              aria-label="Opções"
            >
              <MoreHorizontal className="w-5 h-5" />
            </button>
            {showMenu && (
              <div
                className="absolute right-0 top-8 z-30 rounded-xl py-1 min-w-[172px] shadow-xl"
                style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
              >
                <button
                  onClick={() => {
                    navigator.clipboard?.writeText(window.location.href)
                    setShowMenu(false)
                  }}
                  className="w-full text-left flex items-center gap-2.5 px-3.5 py-2 text-sm hover:opacity-80 transition-opacity"
                  style={{ color: 'var(--text-primary)' }}
                >
                  <Link2 className="w-3.5 h-3.5 shrink-0" />
                  Copiar link
                </button>
                {isOwner && (
                  <button
                    onClick={() => {
                      setEditCaption(post?.caption ?? '')
                      setEditDest(post?.destination ?? '')
                      setEditMode(true)
                      setShowMenu(false)
                    }}
                    className="w-full text-left flex items-center gap-2.5 px-3.5 py-2 text-sm hover:opacity-80 transition-opacity"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    <Pencil className="w-3.5 h-3.5 shrink-0" />
                    Editar post
                  </button>
                )}
                {isOwner ? (
                  confirmDel ? (
                    <div className="px-3.5 py-2 flex flex-col gap-1.5">
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Tens a certeza?</p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => deleteMutation.mutate()}
                          disabled={deleteMutation.isPending}
                          className="btn text-xs py-0.5 px-2.5 rounded-md"
                          style={{ background: 'var(--danger)', color: 'var(--on-danger)' }}
                        >
                          {deleteMutation.isPending ? '…' : 'Sim'}
                        </button>
                        <button
                          onClick={() => setConfirmDel(false)}
                          className="btn btn-ghost text-xs py-0.5 px-2.5 rounded-md"
                        >
                          Não
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmDel(true)}
                      className="w-full text-left flex items-center gap-2.5 px-3.5 py-2 text-sm hover:opacity-80 transition-opacity"
                      style={{ color: 'var(--danger)' }}
                    >
                      <Trash2 className="w-3.5 h-3.5 shrink-0" />
                      Eliminar post
                    </button>
                  )
                ) : (
                  <button
                    onClick={() => { setShowMenu(false); setReportOpen(true) }}
                    className="w-full text-left flex items-center gap-2.5 px-3.5 py-2 text-sm hover:opacity-80 transition-opacity"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    <Flag className="w-3.5 h-3.5 shrink-0" />
                    Reportar
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Media */}
        {images.length > 0 && (
          <div
            className="relative"
            style={{ aspectRatio: isVideoUrl(images[0]) ? '16/9' : '4/5' }}
            onTouchStart={(e) => { (e.currentTarget as HTMLDivElement).dataset.touchX = String(e.touches[0].clientX) }}
            onTouchEnd={(e) => {
              const startX = Number((e.currentTarget as HTMLDivElement).dataset.touchX ?? 0)
              const delta = e.changedTouches[0].clientX - startX
              if (delta > 50)  setImgIdx((i) => Math.max(0, i - 1))
              if (delta < -50) setImgIdx((i) => Math.min(images.length - 1, i + 1))
            }}
          >
            {isVideoUrl(images[imgIdx]) ? (
              <VideoPlayer src={images[imgIdx]} className="absolute inset-0 w-full h-full" />
            ) : (
            <Image
              src={images[imgIdx]}
              alt={post.caption}
              fill
              className="object-cover cursor-zoom-in"
              sizes="(max-width: 640px) 100vw, 620px"
              priority
              onClick={() => {
                const photoImages = images.filter((img) => !isVideoUrl(img))
                const clickedIndex = photoImages.indexOf(images[imgIdx])
                setLightboxIndex(Math.max(0, clickedIndex))
                setLightboxOpen(true)
              }}
            />
            )}
            {images.length > 1 && (
              <>
                <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5">
                  {images.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setImgIdx(i)}
                      className="w-1.5 h-1.5 rounded-full transition-all"
                      style={{ background: i === imgIdx ? '#fff' : 'rgba(255,255,255,0.45)' }}
                      aria-label={`Imagem ${i + 1}`}
                    />
                  ))}
                </div>
                {imgIdx > 0 && (
                  <button
                    onClick={() => setImgIdx((i) => i - 1)}
                    className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full flex items-center justify-center"
                    style={{ background: 'rgba(0,0,0,0.45)' }}
                    aria-label="Anterior"
                  >
                    <span className="text-white text-sm">‹</span>
                  </button>
                )}
                {imgIdx < images.length - 1 && (
                  <button
                    onClick={() => setImgIdx((i) => i + 1)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full flex items-center justify-center"
                    style={{ background: 'rgba(0,0,0,0.45)' }}
                    aria-label="Próxima"
                  >
                    <span className="text-white text-sm">›</span>
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-1 px-3 py-2.5">
          <button
            onClick={() => likeMutation.mutate()}
            className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg transition-all ${post.viewerLiked ? 'animate-like-pop' : ''}`}
            style={{ color: post.viewerLiked ? 'var(--danger)' : 'var(--text-secondary)' }}
            aria-pressed={post.viewerLiked}
            aria-label={post.viewerLiked ? 'Descurtir' : 'Curtir'}
          >
            <Heart className="w-5 h-5" fill={post.viewerLiked ? 'currentColor' : 'none'} />
            <span className="text-xs font-medium">{post.likesCount}</span>
          </button>

          <div className="flex items-center gap-1.5 px-2 py-1.5" style={{ color: 'var(--text-secondary)' }}>
            <MessageCircle className="w-5 h-5" />
            <span className="text-xs font-medium">{post.commentsCount}</span>
          </div>

          <button
            onClick={() => saveMutation.mutate()}
            className="ml-auto px-2 py-1.5 rounded-lg transition-colors"
            style={{ color: post.viewerSaved ? 'var(--accent)' : 'var(--text-secondary)' }}
            aria-pressed={post.viewerSaved}
            aria-label={post.viewerSaved ? 'Remover dos guardados' : 'Guardar'}
          >
            <Bookmark className="w-5 h-5" fill={post.viewerSaved ? 'currentColor' : 'none'} />
          </button>
        </div>

        {/* Caption / Edit */}
        <div className="px-3 pb-4">
          {editMode ? (
            <div className="flex flex-col gap-2">
              <textarea
                className="input text-sm resize-none"
                rows={3}
                maxLength={2200}
                value={editCaption}
                onChange={(e) => setEditCaption(e.target.value)}
                placeholder="Legenda…"
                autoFocus
              />
              <input
                className="input text-sm"
                maxLength={100}
                value={editDest}
                onChange={(e) => setEditDest(e.target.value)}
                placeholder="Destino (opcional)"
              />
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setEditMode(false)}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg btn btn-ghost"
                  disabled={editMutation.isPending}
                >
                  <X className="w-3.5 h-3.5" /> Cancelar
                </button>
                <button
                  onClick={() => editMutation.mutate({ caption: editCaption, destination: editDest })}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg btn btn-primary"
                  disabled={editMutation.isPending}
                >
                  <Check className="w-3.5 h-3.5" /> Guardar
                </button>
              </div>
            </div>
          ) : (
            <p className="text-sm" style={{ color: 'var(--text-primary)' }}>
              <Link
                href={`/profile/${post.userId}`}
                className="font-semibold mr-1 hover:underline"
              >
                {post.username}
              </Link>
              {post.caption}
            </p>
          )}
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
            {new Date(post.createdAt).toLocaleDateString('pt-PT', {
              day: '2-digit',
              month: 'long',
              year: 'numeric',
            })}
          </p>
        </div>
      </article>

      {lightboxOpen && (
        <Lightbox
          images={images.filter((img) => !isVideoUrl(img))}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxOpen(false)}
        />
      )}
      {reportOpen && post && (
        <ReportModal
          targetType="post"
          targetId={post.id}
          onClose={() => setReportOpen(false)}
        />
      )}

      {/* Comments section */}
      <div className="mt-4">
        <h2 className="font-semibold text-sm mb-3 px-1" style={{ color: 'var(--text-primary)' }}>
          Comentários ({post.commentsCount})
        </h2>

        {/* Comment input */}
        <div className="card p-3 mb-4">
          {replyTo && (
            <div
              className="flex items-center gap-2 mb-2 text-xs rounded-lg px-2 py-1"
              style={{ background: 'var(--accent-faint)', color: 'var(--text-muted)' }}
            >
              <CornerDownRight className="w-3 h-3" />
              <span>A responder a @{replyTo.username}</span>
              <button
                onClick={() => setReplyTo(null)}
                className="ml-auto hover:opacity-70"
                aria-label="Cancelar resposta"
              >
                ✕
              </button>
            </div>
          )}
          {error && (
            <div className="mb-2">
              <AlertBanner variant="danger" message={error} />
            </div>
          )}
          <form onSubmit={handleSubmitComment} className="flex items-center gap-2">
            <Avatar
              src={user?.avatarUrl ?? null}
              name={user?.displayName || user?.username || '?'}
              size="sm"
            />
            <input
              ref={inputRef}
              type="text"
              className="input flex-1 text-sm"
              placeholder="Adicionar comentário…"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              style={{ borderRadius: 99 }}
            />
            <button
              type="submit"
              disabled={!comment.trim() || submitting}
              className="w-9 h-9 rounded-full flex items-center justify-center transition-opacity disabled:opacity-40 shrink-0"
              style={{ background: 'var(--accent)' }}
              aria-label="Enviar comentário"
            >
              {submitting ? (
                <Spinner size="sm" />
              ) : (
                <Send className="w-4 h-4" style={{ color: '#000' }} />
              )}
            </button>
          </form>
        </div>

        {/* Comments list */}
        {loadingComments ? (
          <div className="flex justify-center py-6">
            <Spinner />
          </div>
        ) : (commentsData?.comments ?? []).length === 0 ? (
          <p className="text-center text-sm py-6" style={{ color: 'var(--text-muted)' }}>
            Sem comentários ainda. Sê o primeiro!
          </p>
        ) : (() => {
          const all = commentsData?.comments ?? []
          const topLevel = all.filter((c) => c.parentId === null)
          const repliesFor = (parentId: string) => all.filter((c) => c.parentId === parentId)

          const renderComment = (c: Comment, isReply = false) => (
            <div key={c.id} className={isReply ? 'ml-8 mt-2' : 'card p-3'}>
              <div className={isReply ? 'flex gap-2 rounded-xl p-2.5' : 'flex gap-2'} style={isReply ? { background: 'var(--surface2)' } : {}}>
                {isReply && <CornerDownRight className="w-3 h-3 mt-1 shrink-0" style={{ color: 'var(--text-muted)' }} />}
                <Link href={`/profile/${c.userId}`}>
                  <Avatar src={c.avatarUrl} name={c.displayName || c.username} size="sm" />
                </Link>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <Link
                      href={`/profile/${c.userId}`}
                      className="text-xs font-semibold hover:underline"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {c.displayName || c.username}
                    </Link>
                    <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                      {new Date(c.createdAt).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short' })}
                    </span>
                  </div>
                  <p className="text-sm mt-0.5 break-words" style={{ color: 'var(--text-secondary)' }}>
                    {c.content}
                  </p>
                  <div className="flex items-center gap-3 mt-1">
                    {!isReply && (
                      <button
                        onClick={() => { setReplyTo({ id: c.id, username: c.username }); inputRef.current?.focus() }}
                        className="text-[11px] hover:underline"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        Responder
                      </button>
                    )}
                    <button
                      onClick={() => handleLikeComment(c.id, c.viewerLiked)}
                      className="flex items-center gap-1 text-[11px] transition-colors"
                      style={{ color: c.viewerLiked ? 'var(--danger)' : 'var(--text-muted)' }}
                      aria-pressed={c.viewerLiked}
                    >
                      <Heart className="w-3 h-3" fill={c.viewerLiked ? 'currentColor' : 'none'} />
                      {c.likes > 0 && <span>{c.likes}</span>}
                    </button>
                  </div>
                </div>
              </div>
              {repliesFor(c.id).map((r) => renderComment(r, true))}
            </div>
          )

          return (
            <div className="space-y-3">
              {topLevel.map((c) => renderComment(c))}
            </div>
          )
        })()}
      </div>
    </div>
  )
}
