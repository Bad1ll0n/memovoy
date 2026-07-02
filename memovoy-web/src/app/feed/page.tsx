// src/app/feed/page.tsx
'use client'

import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef }  from 'react'
import { useRouter }          from 'next/navigation'
import { useAuthStore }       from '@/store/auth'
import { api }                from '@/lib/api-client'
import { NavBar }             from '@/components/layout/NavBar'
import { PostCard }           from '@/components/feed/PostCard'
import { PostCardSkeleton }   from '@/components/feed/PostCardSkeleton'
import type { Post, PaginatedResponse } from '@/types'

export default function FeedPage() {
  const { isAuthenticated, isHydrated } = useAuthStore()
  const router      = useRouter()
  const qc          = useQueryClient()
  const sentinelRef = useRef<HTMLDivElement>(null)

  // Auth guard
  useEffect(() => {
    if (isHydrated && !isAuthenticated) router.replace('/auth/login')
  }, [isHydrated, isAuthenticated, router])

  // Infinite query com cursor pagination
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
    refetch,
  } = useInfiniteQuery({
    queryKey: ['feed'],
    queryFn:  ({ pageParam }) =>
      api.get<PaginatedResponse<Post>>('/feed', {
        params: { limit: 20, ...(pageParam ? { cursor: pageParam } : {}) },
      }),
    initialPageParam:    undefined as string | undefined,
    getNextPageParam:    (last) => last.nextCursor ?? undefined,
    enabled:             isAuthenticated,
  })

  // IntersectionObserver para carregar mais ao chegar ao fim
  useEffect(() => {
    if (!sentinelRef.current) return
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting && hasNextPage) fetchNextPage() },
      { threshold: 0.1 }
    )
    observer.observe(sentinelRef.current)
    return () => observer.disconnect()
  }, [hasNextPage, fetchNextPage])

  // Mutation: toggle like com optimistic update
  const likeMutation = useMutation({
    mutationFn: (postId: string) =>
      api.post<{ liked: boolean }>(`/posts/${postId}/like`),
    onMutate: async (postId) => {
      await qc.cancelQueries({ queryKey: ['feed'] })
      const prev = qc.getQueryData(['feed'])

      // Optimistic update em todas as páginas
      qc.setQueryData(['feed'], (old: typeof data) => ({
        ...old!,
        pages: old!.pages.map((page) => ({
          ...page,
          items: page.items.map((p) =>
            p.id === postId
              ? { ...p, viewerLiked: !p.viewerLiked, likesCount: p.likesCount + (p.viewerLiked ? -1 : 1) }
              : p
          ),
        })),
      }))

      return { prev }
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(['feed'], ctx.prev)
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['feed'] })
    },
  })

  const posts = data?.pages.flatMap((p) => p.items) ?? []

  if (!isHydrated || !isAuthenticated) return null

  return (
    <div className="min-h-screen bg-surface-subtle">
      <NavBar />

      <main className="max-w-xl mx-auto px-4 py-6 pb-24 md:pb-6 space-y-0">
        {/* Header */}
        <div className="mb-6">
          <h1 className="font-display text-2xl font-bold text-ink">O teu feed</h1>
          <p className="text-ink-secondary text-sm mt-1">
            Publicações das pessoas que segues
          </p>
        </div>

        {/* Estados */}
        {isLoading && (
          <div className="space-y-0">
            {Array.from({ length: 5 }).map((_, i) => (
              <PostCardSkeleton key={i} />
            ))}
          </div>
        )}

        {isError && (
          <div className="card p-8 text-center space-y-4">
            <p className="text-2xl">📶</p>
            <p className="font-medium text-ink">Sem ligação</p>
            <p className="text-ink-secondary text-sm">
              Não foi possível carregar o feed.
            </p>
            <button onClick={() => refetch()} className="btn-secondary text-sm">
              Tentar novamente
            </button>
          </div>
        )}

        {!isLoading && !isError && posts.length === 0 && (
          <div className="card p-12 text-center space-y-4">
            <p className="text-4xl">👋</p>
            <p className="font-display text-lg font-bold text-ink">
              O teu feed está vazio
            </p>
            <p className="text-ink-secondary text-sm max-w-xs mx-auto">
              Segue outros viajantes para ver as suas aventuras aqui.
            </p>
            <a href="/explore" className="btn-primary inline-flex text-sm">
              Descobrir viajantes
            </a>
          </div>
        )}

        {/* Lista de posts */}
        {posts.length > 0 && (
          <div className="card overflow-hidden divide-y divide-surface-muted">
            {posts.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                onLike={() => likeMutation.mutate(post.id)}
              />
            ))}
          </div>
        )}

        {/* Sentinel para infinite scroll */}
        <div ref={sentinelRef} className="py-4 flex justify-center">
          {isFetchingNextPage && (
            <div className="flex items-center gap-2 text-ink-secondary text-sm">
              <div className="w-4 h-4 rounded-full border-2 border-blue border-t-transparent animate-spin" />
              A carregar mais…
            </div>
          )}
          {!hasNextPage && posts.length > 0 && (
            <p className="text-ink-tertiary text-xs">
              Chegaste ao fim do feed por hoje 🌙
            </p>
          )}
        </div>
      </main>
    </div>
  )
}
