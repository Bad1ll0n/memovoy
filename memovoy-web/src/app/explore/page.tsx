// src/app/explore/page.tsx
'use client'

import Image                    from 'next/image'
import Link                     from 'next/link'
import { useInfiniteQuery }     from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { NavBar }               from '@/components/layout/NavBar'
import { api }                  from '@/lib/api-client'
import { cn, groupTypeLabel, countryFlag } from '@/lib/utils'
import type { Post, PaginatedResponse }   from '@/types'

const POPULAR_COUNTRIES = [
  'PT','BR','JP','IT','FR','ES','TH','GR','MX','US','DE','ID','MA','IS','AR',
]

export default function ExplorePage() {
  const [country,    setCountry]    = useState<string | null>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)

  const {
    data, fetchNextPage, hasNextPage,
    isFetchingNextPage, isLoading,
  } = useInfiniteQuery({
    queryKey: ['feed', 'discovery', country],
    queryFn:  ({ pageParam }) =>
      api.get<PaginatedResponse<Post>>('/feed/discovery', {
        params: {
          limit:  24,
          ...(pageParam            ? { cursor:  pageParam } : {}),
          ...(country             ? { country }            : {}),
        },
      }),
    initialPageParam:  undefined as string | undefined,
    getNextPageParam:  (last) => last.nextCursor ?? undefined,
  })

  useEffect(() => {
    if (!sentinelRef.current) return
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting && hasNextPage) fetchNextPage() },
      { threshold: 0.1 }
    )
    obs.observe(sentinelRef.current)
    return () => obs.disconnect()
  }, [hasNextPage, fetchNextPage])

  const posts = data?.pages.flatMap((p) => p.items) ?? []

  return (
    <div className="min-h-screen bg-surface-subtle">
      <NavBar />

      <main className="max-w-5xl mx-auto px-4 py-8 pb-24 md:pb-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="font-display text-2xl font-bold text-ink">Explorar</h1>
          <p className="text-ink-secondary text-sm mt-1">
            Descobre roteiros de viajantes de todo o mundo
          </p>
        </div>

        {/* Filtros por país */}
        <div className="flex gap-2 mb-6 overflow-x-auto scrollbar-hide pb-1">
          <button
            onClick={() => setCountry(null)}
            className={cn(
              'shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-colors',
              country === null
                ? 'bg-blue text-white'
                : 'bg-surface text-ink-secondary hover:text-ink border border-surface-muted'
            )}
          >
            Todos
          </button>
          {POPULAR_COUNTRIES.map((cc) => (
            <button
              key={cc}
              onClick={() => setCountry(cc === country ? null : cc)}
              className={cn(
                'shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors',
                country === cc
                  ? 'bg-blue text-white'
                  : 'bg-surface text-ink-secondary hover:text-ink border border-surface-muted'
              )}
            >
              {countryFlag(cc)} {cc}
            </button>
          ))}
        </div>

        {/* Grelha */}
        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="skeleton aspect-square rounded-md" />
            ))}
          </div>
        ) : posts.length === 0 ? (
          <div className="card p-16 text-center space-y-3">
            <p className="text-4xl">🌍</p>
            <p className="font-display text-lg font-bold text-ink">Nenhum resultado</p>
            <p className="text-ink-secondary text-sm">
              Experimenta outro filtro ou volta mais tarde.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1">
            {posts.map((post) => (
              <ExploreCard key={post.id} post={post} />
            ))}
          </div>
        )}

        {/* Sentinel */}
        <div ref={sentinelRef} className="py-6 flex justify-center">
          {isFetchingNextPage && (
            <div className="w-5 h-5 rounded-full border-2 border-blue border-t-transparent animate-spin" />
          )}
        </div>
      </main>
    </div>
  )
}

function ExploreCard({ post }: { post: Post }) {
  return (
    <Link
      href={`/posts/${post.id}`}
      className="group relative overflow-hidden rounded-md bg-surface-muted aspect-square block"
    >
      {post.coverMedia ? (
        <Image
          src={post.coverMedia.thumbnailUrl ?? post.coverMedia.url}
          alt={post.caption ?? 'Post'}
          fill
          className="object-cover group-hover:scale-105 transition-transform duration-500"
          sizes="(max-width: 640px) 50vw, 33vw"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-3xl text-ink-disabled">
          📷
        </div>
      )}

      {/* Overlay com info ao hover */}
      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col justify-end p-3">
        <p className="text-white text-xs font-medium line-clamp-2 leading-snug">
          {post.caption ?? post.locationName ?? post.displayName}
        </p>
        <div className="flex items-center gap-3 mt-1.5 text-white/80 text-xs">
          <span>❤️ {post.likesCount}</span>
          <span>💬 {post.commentsCount}</span>
        </div>
      </div>

      {/* Badge de múltiplos media */}
      {(post.mediaCount ?? 0) > 1 && (
        <div className="absolute top-1.5 right-1.5 bg-black/60 text-white text-xs px-1.5 py-0.5 rounded font-medium">
          ⊞ {post.mediaCount}
        </div>
      )}
    </Link>
  )
}
