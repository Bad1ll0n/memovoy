// src/components/feed/PostCard.tsx
'use client'

import Link             from 'next/link'
import Image            from 'next/image'
import { useState }     from 'react'
import { cn, formatRelative, levelLabel } from '@/lib/utils'
import type { Post }    from '@/types'

interface Props {
  post:   Post
  onLike: () => void
}

export function PostCard({ post, onLike }: Props) {
  const [likeAnimating, setLikeAnimating] = useState(false)

  function handleLike() {
    setLikeAnimating(true)
    onLike()
    setTimeout(() => setLikeAnimating(false), 350)
  }

  const { label: lvLabel, color: lvColor } = levelLabel(post.level ?? 'explorer')

  return (
    <article className="bg-surface">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3">
        <Link href={`/profile/${post.userId}`} className="shrink-0">
          {post.avatarUrl ? (
            <Image
              src={post.avatarUrl}
              alt={post.displayName}
              width={36} height={36}
              className="rounded-full object-cover"
            />
          ) : (
            <div className="w-9 h-9 rounded-full bg-blue/10 flex items-center justify-center text-blue font-semibold text-sm">
              {post.displayName[0].toUpperCase()}
            </div>
          )}
        </Link>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Link
              href={`/profile/${post.userId}`}
              className="font-semibold text-ink text-sm hover:text-blue transition-colors"
            >
              {post.displayName}
            </Link>
            {post.level && (
              <span
                className="level-badge text-white"
                style={{ backgroundColor: lvColor }}
              >
                {lvLabel}
              </span>
            )}
          </div>
          {post.locationName && (
            <p className="text-ink-tertiary text-xs flex items-center gap-1 mt-0.5">
              <span>📍</span>
              {post.locationName}
            </p>
          )}
        </div>

        <span className="text-ink-tertiary text-xs shrink-0">
          {formatRelative(post.createdAt)}
        </span>
      </div>

      {/* Media */}
      {post.coverMedia && (
        <Link href={`/posts/${post.id}`} className="block relative">
          <div className="relative w-full aspect-[4/3] bg-surface-muted overflow-hidden">
            <Image
              src={post.coverMedia.thumbnailUrl ?? post.coverMedia.url}
              alt={post.caption ?? 'Foto da viagem'}
              fill
              className="object-cover"
              sizes="(max-width: 640px) 100vw, 640px"
            />
          </div>
          {/* Badge de múltiplas fotos */}
          {(post.mediaCount ?? 0) > 1 && (
            <div className="absolute top-2 right-2 flex items-center gap-1 bg-black/60 text-white text-xs font-semibold px-2 py-1 rounded-md">
              <span>⊞</span>
              {post.mediaCount}
            </div>
          )}
        </Link>
      )}

      {/* Caption */}
      {post.caption && (
        <div className="px-4 pt-3 pb-1">
          <p className="text-ink text-sm leading-relaxed line-clamp-3">
            <Link
              href={`/profile/${post.userId}`}
              className="font-semibold hover:text-blue transition-colors mr-1"
            >
              {post.username}
            </Link>
            {post.caption}
          </p>
        </div>
      )}

      {/* Acções */}
      <div className="flex items-center gap-1 px-3 py-2">
        {/* Like */}
        <button
          onClick={handleLike}
          className={cn(
            'flex items-center gap-1.5 px-2 py-1.5 rounded-lg transition-colors',
            post.viewerLiked
              ? 'text-red-500 hover:text-red-600'
              : 'text-ink-secondary hover:text-ink'
          )}
        >
          <span
            className={cn(
              'text-lg leading-none',
              likeAnimating && 'animate-like-pop'
            )}
          >
            {post.viewerLiked ? '❤️' : '🤍'}
          </span>
          <span className="text-sm font-medium tabular-nums">{post.likesCount}</span>
        </button>

        {/* Comentários */}
        <Link
          href={`/posts/${post.id}`}
          className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-ink-secondary hover:text-ink hover:bg-surface-subtle transition-colors"
        >
          <span className="text-lg leading-none">💬</span>
          <span className="text-sm font-medium tabular-nums">{post.commentsCount}</span>
        </Link>

        {/* Roteiro associado */}
        {post.itineraryId && (
          <Link
            href={`/itineraries/${post.itineraryId}`}
            className="ml-auto flex items-center gap-1 text-xs text-blue hover:underline"
          >
            <span>🗺</span> Ver roteiro
          </Link>
        )}
      </div>
    </article>
  )
}
