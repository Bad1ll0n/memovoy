'use client'

import { useState, useRef, useCallback } from 'react'
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import { Camera, Sparkles, RefreshCw } from 'lucide-react'
import { api } from '@/lib/api'
import { useRequireAuth } from '@/hooks/useRequireAuth'
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll'
import { PostCard, type Post } from '@/components/feed/PostCard'
import { PostCardSkeleton } from '@/components/feed/PostCardSkeleton'
import { CreatePostModal } from '@/components/feed/CreatePostModal'
import { LiveTripButton } from '@/components/feed/LiveTripButton'
import { EmptyState } from '@/components/ui/EmptyState'
import { Spinner } from '@/components/ui/Spinner'
import { useAuthStore } from '@/store/authStore'
import { Avatar } from '@/components/ui/Avatar'

interface FeedPage {
  posts: Post[]
  nextCursor: string | null
  isCurated?: boolean
}

const QUERY_KEY = ['feed']
const PTR_THRESHOLD = 64

export default function FeedPage() {
  const { isReady } = useRequireAuth()
  const { user } = useAuthStore()
  const qc = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [ptrY, setPtrY] = useState(0)
  const [ptrActive, setPtrActive] = useState(false)
  const touchStartY = useRef(0)

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteQuery<FeedPage>({
      queryKey: QUERY_KEY,
      queryFn: ({ pageParam }) =>
        api.get(`/feed${pageParam ? `?cursor=${pageParam}` : ''}`),
      initialPageParam: null as string | null,
      getNextPageParam: (last) => last.nextCursor,
      enabled: isReady,
    })

  const sentinelRef = useInfiniteScroll({
    hasMore: !!hasNextPage,
    onLoadMore: fetchNextPage,
  })

  const handleRefresh = useCallback(() => {
    qc.invalidateQueries({ queryKey: QUERY_KEY })
  }, [qc])

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY
  }, [])

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (window.scrollY > 0) return
    const delta = e.touches[0].clientY - touchStartY.current
    if (delta > 0) setPtrY(Math.min(delta * 0.4, PTR_THRESHOLD + 16))
  }, [])

  const onTouchEnd = useCallback(() => {
    if (ptrY >= PTR_THRESHOLD) {
      setPtrActive(true)
      handleRefresh()
      setTimeout(() => { setPtrActive(false); setPtrY(0) }, 800)
    } else {
      setPtrY(0)
    }
  }, [ptrY, handleRefresh])

  if (!isReady || isLoading) {
    return (
      <div>
        <PostCardSkeleton />
        <PostCardSkeleton />
        <PostCardSkeleton />
      </div>
    )
  }

  const posts = data?.pages.flatMap((p) => p.posts) ?? []
  const isCurated = data?.pages[0]?.isCurated ?? false

  return (
    <div
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {/* Pull-to-refresh indicator */}
      {(ptrY > 8 || ptrActive) && (
        <div
          className="flex justify-center items-center overflow-hidden transition-all duration-200"
          style={{ height: ptrActive ? 40 : ptrY * 0.5, opacity: ptrY > 16 || ptrActive ? 1 : 0 }}
        >
          <RefreshCw
            className={`w-5 h-5 ${ptrActive ? 'animate-spin' : ''}`}
            style={{ color: 'var(--accent)', transform: `rotate(${ptrY * 4}deg)` }}
          />
        </div>
      )}

      {/* Create post prompt */}
      <div className="card w-full flex items-center gap-3 p-3 mb-5">
        <Avatar
          src={user?.avatarUrl ?? null}
          name={user?.displayName || user?.username || '?'}
          size="md"
        />
        <button
          onClick={() => setShowCreate(true)}
          className="flex-1 text-sm rounded-full px-4 py-2 text-left hover:opacity-90 transition-opacity"
          style={{
            background: 'var(--surface2)',
            color: 'var(--text-muted)',
            border: '1px solid var(--border)',
          }}
        >
          Partilha a tua aventura…
        </button>
        <LiveTripButton />
        <button
          onClick={() => setShowCreate(true)}
          className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
          style={{ background: 'var(--accent)' }}
          aria-label="Criar post"
        >
          <Camera className="w-4 h-4" style={{ color: '#000' }} />
        </button>
      </div>

      {/* Curated banner */}
      {isCurated && posts.length > 0 && (
        <div
          className="flex items-center gap-2 px-3 py-2 rounded-xl mb-4 text-sm"
          style={{ background: 'rgba(201,243,29,0.08)', border: '1px solid rgba(201,243,29,0.2)' }}
        >
          <Sparkles className="w-4 h-4 shrink-0" style={{ color: 'var(--accent)' }} />
          <span style={{ color: 'var(--text-secondary)' }}>
            Sugestões em destaque — segue viajantes para personalizar o teu feed
          </span>
        </div>
      )}

      {posts.length === 0 ? (
        <EmptyState
          illustration="feed"
          title="O teu feed está vazio"
          description="Segue viajantes ou cria o teu primeiro post."
          action={{ label: 'Explorar', href: '/explore' }}
        />
      ) : (
        <>
          {posts.map((post, i) => (
            <PostCard key={post.id} post={post} queryKey={QUERY_KEY} index={i} />
          ))}

          <div ref={sentinelRef} className="h-4" />

          {isFetchingNextPage && (
            <div className="flex justify-center py-4">
              <Spinner />
            </div>
          )}

          {!hasNextPage && posts.length > 0 && (
            <p className="end-of-list">Viste tudo por hoje ✦</p>
          )}
        </>
      )}

      {showCreate && <CreatePostModal onClose={() => setShowCreate(false)} />}
    </div>
  )
}
