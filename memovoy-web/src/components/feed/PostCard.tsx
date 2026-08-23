'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useState, useRef, useEffect } from 'react'
import { Heart, MessageCircle, Bookmark, MoreHorizontal, MapPin, Trash2, Link2, Flag, Radio, Share2, CalendarDays, Map } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { formatarData } from '@/lib/datas'
import { Avatar } from '@/components/ui/Avatar'
import { VideoPlayer, isVideoUrl } from '@/components/ui/VideoPlayer'
import { Lightbox } from '@/components/ui/Lightbox'
import { ReportModal } from '@/components/ui/ReportModal'
import { useEstaAoVivo } from '@/hooks/useEstaAoVivo'
import { useAuthStore } from '@/store/authStore'
import { toast } from '@/store/toastStore'

export interface ItineraryLinked {
  id: string
  title: string
  destination: string
  startDate: string | null
  endDate: string | null
  coverUrl: string | null
  daysCount: number
}

export interface Post {
  id: string
  userId: string
  username: string
  displayName: string
  avatarUrl: string | null
  isVerified: boolean
  caption: string
  images: string[]
  destination: string | null
  likesCount: number
  commentsCount: number
  viewerLiked: boolean
  viewerSaved: boolean
  createdAt: string
  isFollowing?: boolean
  itineraryLinked?: ItineraryLinked | null
}

export function PostCard({ post, queryKey, index = 0 }: { post: Post; queryKey: unknown[]; index?: number }) {
  const qc = useQueryClient()

  const estaAoVivo = useEstaAoVivo(post.createdAt)
  const { user } = useAuthStore()
  const [imgIdx, setImgIdx]         = useState(0)
  const [showMenu, setShowMenu]     = useState(false)
  const [lightboxOpen, setLightboxOpen]   = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState(0)
  const [reportOpen, setReportOpen]       = useState(false)
  const menuRef       = useRef<HTMLDivElement>(null)
  const deleteTimer   = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isOwner = user?.id === post.userId

  useEffect(() => {
    if (!showMenu) return
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [showMenu])

  function handleDelete() {
    setShowMenu(false)

    // Optimistically remove post from paginated cache
    const prevData = qc.getQueryData(queryKey)
    qc.setQueryData(queryKey, (old: { pages: { posts: Post[] }[] } | undefined) => {
      if (!old) return old
      return {
        ...old,
        pages: old.pages.map((pg) => ({
          ...pg,
          posts: pg.posts.filter((p) => p.id !== post.id),
        })),
      }
    })

    // Schedule actual API delete after 5 s
    deleteTimer.current = setTimeout(() => {
      api.delete(`/posts/${post.id}`).then(() => {
        qc.invalidateQueries({ queryKey })
      }).catch(() => {
        qc.setQueryData(queryKey, prevData)
      })
    }, 5000)

    toast('Post eliminado.', {
      type: 'info',
      duration: 5000,
      undoFn: () => {
        if (deleteTimer.current) clearTimeout(deleteTimer.current)
        qc.setQueryData(queryKey, prevData)
      },
    })
  }

  const likeMutation = useMutation({
    mutationFn: () =>
      post.viewerLiked
        ? api.delete(`/posts/${post.id}/like`)
        : api.post(`/posts/${post.id}/like`),
    onMutate: async () => {
      await qc.cancelQueries({ queryKey })
      const prev = qc.getQueryData(queryKey)
      qc.setQueryData(queryKey, (old: { pages: { posts: Post[] }[] } | undefined) => {
        if (!old) return old
        return {
          ...old,
          pages: old.pages.map((pg) => ({
            ...pg,
            posts: pg.posts.map((p) =>
              p.id === post.id
                ? {
                    ...p,
                    viewerLiked: !p.viewerLiked,
                    likesCount: p.likesCount + (p.viewerLiked ? -1 : 1),
                  }
                : p,
            ),
          })),
        }
      })
      return prev
    },
    onError: (_err, _v, ctx) => qc.setQueryData(queryKey, ctx),
  })

  const saveMutation = useMutation({
    mutationFn: () =>
      post.viewerSaved
        ? api.delete(`/bookmarks/post/${post.id}`)
        : api.post('/bookmarks', { postId: post.id }),
    onMutate: async () => {
      await qc.cancelQueries({ queryKey })
      const prev = qc.getQueryData(queryKey)
      qc.setQueryData(queryKey, (old: { pages: { posts: Post[] }[] } | undefined) => {
        if (!old) return old
        return {
          ...old,
          pages: old.pages.map((pg) => ({
            ...pg,
            posts: pg.posts.map((p) =>
              p.id === post.id ? { ...p, viewerSaved: !p.viewerSaved } : p,
            ),
          })),
        }
      })
      return prev
    },
    onError: (_err, _v, ctx) => qc.setQueryData(queryKey, ctx),
  })

  const images = post.images ?? []

  return (
    <article
      className="card mb-5 overflow-hidden animate-fade-in relative"
      style={{ '--stagger-i': Math.min(index, 8) } as React.CSSProperties}
    >
      {/* Header */}
      <div className="flex items-center gap-3 p-3">
        <Link href={`/profile/${post.userId}`}>
          <Avatar src={post.avatarUrl} name={post.displayName || post.username} size="md" />
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <Link
              href={`/profile/${post.userId}`}
              className="font-semibold text-sm hover:underline truncate"
              style={{ color: 'var(--text-primary)' }}
            >
              {post.displayName || post.username}
            </Link>
            {post.isFollowing && (
              <span
                className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                style={{
                  background: 'var(--accent-subtle)',
                  border: '1px solid var(--accent-border)',
                  color: 'var(--accent)',
                }}
              >
                A seguir
              </span>
            )}
          </div>
          {post.destination && (
            <div className="flex items-center gap-1 mt-0.5 flex-wrap">
              <MapPin className="w-3 h-3 shrink-0" style={{ color: 'var(--text-muted)' }} />
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {post.destination}
              </span>
              {estaAoVivo && (
                <span
                  className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full ml-1"
                  // A mesma pastilha LIVE do LiveTripButton, duplicada aqui com
                  // as cores em código. Dava 3,75:1 no escuro e 3,10 no claro.
                  style={{ background: 'var(--danger-subtle)', color: 'var(--danger)' }}
                >
                  <Radio className="w-2.5 h-2.5" />
                  LIVE
                </span>
              )}
            </div>
          )}
        </div>
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setShowMenu((v) => !v)}
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
                  navigator.clipboard?.writeText(`${window.location.origin}/posts/${post.id}`)
                  setShowMenu(false)
                }}
                className="w-full text-left flex items-center gap-2.5 px-3.5 py-2 text-sm hover:opacity-80 transition-opacity"
                style={{ color: 'var(--text-primary)' }}
              >
                <Link2 className="w-3.5 h-3.5 shrink-0" />
                Copiar link
              </button>
              {isOwner ? (
                <button
                  onClick={handleDelete}
                  className="w-full text-left flex items-center gap-2.5 px-3.5 py-2 text-sm hover:opacity-80 transition-opacity"
                  style={{ color: 'var(--danger)' }}
                >
                  <Trash2 className="w-3.5 h-3.5 shrink-0" />
                  Eliminar post
                </button>
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

      {/* Media (images + video) */}
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
              {/* Dots */}
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
              {/* Arrows */}
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
          aria-label={post.viewerLiked ? 'Descurtir' : 'Curtir'}
          aria-pressed={post.viewerLiked}
        >
          <Heart
            className="w-5 h-5"
            fill={post.viewerLiked ? 'currentColor' : 'none'}
          />
          <span className="text-xs font-medium">{post.likesCount}</span>
        </button>

        <Link
          href={`/posts/${post.id}`}
          className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg transition-colors"
          style={{ color: 'var(--text-secondary)' }}
        >
          <MessageCircle className="w-5 h-5" />
          <span className="text-xs font-medium">{post.commentsCount}</span>
        </Link>

        <button
          onClick={() => {
            const url = `${window.location.origin}/posts/${post.id}`
            const title = `${post.displayName || post.username} em ${post.destination ?? 'Memovoy'}`
            if (navigator.share) {
              navigator.share({ title, url }).catch(() => {})
            } else {
              navigator.clipboard?.writeText(url)
            }
          }}
          className="px-2 py-1.5 rounded-lg transition-colors"
          style={{ color: 'var(--text-secondary)' }}
          aria-label="Partilhar post"
        >
          <Share2 className="w-5 h-5" />
        </button>

        <button
          onClick={() => saveMutation.mutate()}
          className="ml-auto px-2 py-1.5 rounded-lg transition-colors"
          style={{ color: post.viewerSaved ? 'var(--accent)' : 'var(--text-secondary)' }}
          aria-label={post.viewerSaved ? 'Remover dos guardados' : 'Guardar'}
          aria-pressed={post.viewerSaved}
        >
          <Bookmark
            className="w-5 h-5"
            fill={post.viewerSaved ? 'currentColor' : 'none'}
          />
        </button>
      </div>

      {/* Caption */}
      <div className="px-3 pb-3">
        <p className="text-sm" style={{ color: 'var(--text-primary)' }}>
          <Link
            href={`/profile/${post.userId}`}
            className="font-semibold mr-1 hover:underline"
          >
            {post.username}
          </Link>
          {post.caption}
        </p>

        {/* Linked itinerary card */}
        {post.itineraryLinked && (
          <Link
            href={`/itineraries/${post.itineraryLinked.id}`}
            className="mt-3 flex items-center gap-3 rounded-xl p-3 transition-opacity hover:opacity-80"
            style={{
              background: 'var(--surface2)',
              border: '1px solid var(--border)',
              borderLeft: '3px solid var(--accent)',
            }}
          >
            {post.itineraryLinked.coverUrl ? (
              <div className="relative w-12 h-12 shrink-0 rounded-lg overflow-hidden">
                <Image
                  src={post.itineraryLinked.coverUrl}
                  alt={post.itineraryLinked.title}
                  fill
                  className="object-cover"
                  sizes="48px"
                  unoptimized
                />
              </div>
            ) : (
              <div
                className="w-12 h-12 shrink-0 rounded-lg flex items-center justify-center"
                style={{ background: 'rgba(201,243,29,0.12)' }}
              >
                <Map className="w-5 h-5" style={{ color: 'var(--accent)' }} />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                {post.itineraryLinked.title}
              </p>
              <div className="flex items-center gap-1 mt-0.5">
                <MapPin className="w-3 h-3 shrink-0" style={{ color: 'var(--text-muted)' }} />
                <span className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
                  {post.itineraryLinked.destination}
                </span>
              </div>
              {(post.itineraryLinked.startDate || post.itineraryLinked.daysCount > 0) && (
                <div className="flex items-center gap-1 mt-0.5">
                  <CalendarDays className="w-3 h-3 shrink-0" style={{ color: 'var(--text-muted)' }} />
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {formatarData(post.itineraryLinked.startDate)}
                    {post.itineraryLinked.daysCount > 0 && (
                      <span className="ml-1">· {post.itineraryLinked.daysCount} {post.itineraryLinked.daysCount === 1 ? 'dia' : 'dias'}</span>
                    )}
                  </span>
                </div>
              )}
            </div>
            <span className="text-xs font-medium shrink-0" style={{ color: 'var(--accent)' }}>
              Ver roteiro →
            </span>
          </Link>
        )}

        <Link
          href={`/posts/${post.id}`}
          className="text-xs mt-1 block hover:underline"
          style={{ color: 'var(--text-muted)' }}
        >
          {post.commentsCount > 0 ? `Ver todos os ${post.commentsCount} comentários` : 'Adicionar comentário…'}
        </Link>
      </div>

      {lightboxOpen && (
        <Lightbox
          images={images.filter((img) => !isVideoUrl(img))}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxOpen(false)}
        />
      )}
      {reportOpen && (
        <ReportModal
          targetType="post"
          targetId={post.id}
          onClose={() => setReportOpen(false)}
        />
      )}
    </article>
  )
}
