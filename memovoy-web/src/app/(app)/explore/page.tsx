'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useState, useCallback, useRef } from 'react'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { Camera, Heart, MessageCircle, Sparkles, MapPin, Trophy, Map, Navigation } from 'lucide-react'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll'
import { EmptyState } from '@/components/ui/EmptyState'
import { Spinner } from '@/components/ui/Spinner'
import type { Post } from '@/components/feed/PostCard'

const REGIONS = ['Todos', 'Europa', 'Ásia', 'Américas', 'África', 'Oceânia']

interface ExplorePage {
  posts: Post[]
  nextCursor: string | null
}

interface ForYouData {
  itineraries: { id: string; title: string; destination: string; coverUrl: string | null; daysCount: number; username: string }[]
  destinations: { name: string; country: string; why: string; emoji: string }[]
}

export default function ExplorePage() {
  const { user } = useAuthStore()
  const [region, setRegion] = useState('Todos')
  const itineraryScrollRef = useRef<HTMLDivElement>(null)
  const [itineraryAtEnd, setItineraryAtEnd] = useState(false)

  function onItineraryScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget
    setItineraryAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 16)
  }

  const { data: forYou } = useQuery<ForYouData>({
    queryKey: ['explore-for-you'],
    queryFn:  () => api.get('/explore/for-you'),
    enabled:  !!user,
    staleTime: 5 * 60 * 1000,
  })

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteQuery<ExplorePage>({
      queryKey: ['explore', region],
      queryFn: ({ pageParam }) =>
        api.get(
          `/explore?${region !== 'Todos' ? `region=${encodeURIComponent(region)}&` : ''}${pageParam ? `cursor=${pageParam}` : ''}`,
        ),
      initialPageParam: null as string | null,
      getNextPageParam: (last) => last.nextCursor,
    })

  const handleLoadMore = useCallback(() => fetchNextPage(), [fetchNextPage])
  const sentinelRef = useInfiniteScroll({ hasMore: !!hasNextPage, onLoadMore: handleLoadMore })

  const posts = data?.pages.flatMap((p) => p.posts) ?? []

  const showForYou = user && ((forYou?.itineraries?.length ?? 0) > 0 || (forYou?.destinations?.length ?? 0) > 0)

  return (
    <div>
      {/* Quick-access links (visible on all screen sizes, critical for mobile where sidebar is hidden) */}
      <div className="flex gap-2 mb-5 overflow-x-auto pb-1 lg:hidden" style={{ scrollbarWidth: 'none' }}>
        {[
          { href: '/rankings', Icon: Trophy, label: 'Rankings', color: 'var(--gold)' },
          { href: '/map',      Icon: Map,    label: 'Mapa',     color: 'var(--accent)' },
          { href: '/nearby',   Icon: Navigation, label: 'Perto de mim', color: 'var(--success)' },
        ].map(({ href, Icon, label, color }) => (
          <Link
            key={href}
            href={href}
            className="shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-opacity hover:opacity-80"
            style={{ background: 'var(--surface2)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
          >
            <Icon className="w-4 h-4 shrink-0" style={{ color }} />
            {label}
          </Link>
        ))}
      </div>

      {/* For You section */}
      {showForYou && (
        <section className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-4 h-4" style={{ color: 'var(--accent)' }} />
            <h2 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
              Com base nas tuas viagens
            </h2>
          </div>

          {/* AI destination suggestions */}
          {(forYou?.destinations?.length ?? 0) > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-2 mb-3" style={{ scrollbarWidth: 'none' }}>
              {forYou!.destinations.map((d, i) => (
                <div
                  key={i}
                  className="shrink-0 p-3 rounded-xl flex flex-col gap-1"
                  style={{ background: 'var(--surface2)', minWidth: 140, maxWidth: 160 }}
                >
                  <span className="text-xl">{d.emoji}</span>
                  <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {d.name}
                  </span>
                  <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                    {d.country}
                  </span>
                  <span className="text-[10px] leading-snug" style={{ color: 'var(--text-secondary)' }}>
                    {d.why}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Similar itineraries */}
          {(forYou?.itineraries?.length ?? 0) > 0 && (
            <div className="relative">
              {/* Right fade — indicates more scrollable content */}
              {!itineraryAtEnd && (
                <div
                  className="absolute right-0 top-0 bottom-0 w-12 pointer-events-none z-10"
                  style={{ background: 'linear-gradient(to right, transparent, var(--bg-body))' }}
                />
              )}
            <div
              ref={itineraryScrollRef}
              onScroll={onItineraryScroll}
              className="flex gap-3 overflow-x-auto pb-1"
              style={{ scrollbarWidth: 'none' }}
            >
              {forYou!.itineraries.map((iti) => (
                <Link
                  key={iti.id}
                  href={`/itineraries/${iti.id}`}
                  className="shrink-0 rounded-xl overflow-hidden hover:opacity-90 transition-opacity"
                  style={{ width: 160, border: '1px solid var(--border)' }}
                >
                  <div className="relative" style={{ height: 90 }}>
                    {iti.coverUrl ? (
                      <Image src={iti.coverUrl} alt={iti.destination} fill className="object-cover" sizes="160px" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center" style={{ background: 'var(--surface2)' }}>
                        <MapPin className="w-6 h-6" style={{ color: 'var(--text-muted)' }} />
                      </div>
                    )}
                  </div>
                  <div className="p-2" style={{ background: 'var(--bg-card)' }}>
                    <p className="text-xs font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                      {iti.destination}
                    </p>
                    <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                      {iti.daysCount} dias · @{iti.username}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
            </div>
          )}
        </section>
      )}

      {/* Filter chips */}
      <div
        className={`flex gap-2 mb-5 overflow-x-auto pb-1 ${isLoading ? 'opacity-50 pointer-events-none' : ''}`}
        style={{ scrollbarWidth: 'none' }}
      >
        {REGIONS.map((r) => (
          <button
            key={r}
            onClick={() => setRegion(r)}
            className={`chip shrink-0 ${region === r ? 'chip-active' : ''}`}
            disabled={isLoading}
          >
            {r}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Spinner size="lg" /></div>
      ) : posts.length === 0 ? (
        <EmptyState
          Icon={Camera}
          title="Nenhum post encontrado"
          description="Tenta outro filtro ou volta mais tarde."
        />
      ) : (
        <div className="grid grid-cols-3 gap-1">
          {posts.map((post) => (
            <Link
              key={post.id}
              href={`/posts/${post.id}`}
              className="relative group block"
              style={{ aspectRatio: '1/1' }}
            >
              {post.images[0] ? (
                <Image
                  src={post.images[0]}
                  alt={post.caption}
                  fill
                  className="object-cover"
                  sizes="(max-width: 640px) 33vw, 200px"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center" style={{ background: 'var(--surface2)' }}>
                  <Camera className="w-8 h-8" style={{ color: 'var(--text-muted)' }} />
                </div>
              )}
              {/* Hover overlay */}
              <div
                className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4"
                style={{ background: 'rgba(0,0,0,0.5)' }}
              >
                <span className="flex items-center gap-1.5 text-white text-sm font-semibold">
                  <Heart className="w-4 h-4" fill="currentColor" />
                  {post.likesCount}
                </span>
                <span className="flex items-center gap-1.5 text-white text-sm font-semibold">
                  <MessageCircle className="w-4 h-4" />
                  {post.commentsCount}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}

      <div ref={sentinelRef} className="h-4 mt-4" />
      {isFetchingNextPage && <div className="flex justify-center py-4"><Spinner /></div>}
      {!hasNextPage && posts.length > 0 && <p className="end-of-list">Fim dos resultados</p>}
    </div>
  )
}
