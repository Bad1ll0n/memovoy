'use client'

import { useState, useEffect, useCallback } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { MapPin, Navigation, Wifi } from 'lucide-react'
import { api } from '@/lib/api'
import { useRequireAuth } from '@/hooks/useRequireAuth'
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll'
import { PostCard } from '@/components/feed/PostCard'
import { Spinner } from '@/components/ui/Spinner'
import { PostCardSkeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'

interface NearbyPost {
  id: string
  distanceKm: number
  [key: string]: unknown
}

interface NearbyPage {
  posts: NearbyPost[]
  nextCursor: string | null
}

type GeoState = 'idle' | 'loading' | 'granted' | 'denied' | 'unsupported'

export default function NearbyPage() {
  const { isReady } = useRequireAuth()
  const [geoState, setGeoState] = useState<GeoState>('idle')
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null)
  const RADIUS = 50 // km

  useEffect(() => {
    if (!('geolocation' in navigator)) {
      setGeoState('unsupported')
    }
  }, [])

  function requestLocation() {
    setGeoState('loading')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lon: pos.coords.longitude })
        setGeoState('granted')
      },
      () => setGeoState('denied'),
      { timeout: 10000, maximumAge: 300000 },
    )
  }

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteQuery<NearbyPage>({
      queryKey: ['nearby-posts', coords],
      queryFn: ({ pageParam }) =>
        api.get(
          `/posts/nearby?lat=${coords!.lat}&lon=${coords!.lon}&radius=${RADIUS}${pageParam ? `&cursor=${pageParam}` : ''}`,
        ),
      initialPageParam: null as string | null,
      getNextPageParam: (last) => last.nextCursor,
      enabled: isReady && !!coords,
    })

  const handleLoadMore = useCallback(() => fetchNextPage(), [fetchNextPage])
  const sentinelRef = useInfiniteScroll({ hasMore: !!hasNextPage, onLoadMore: handleLoadMore })

  const posts = data?.pages.flatMap((p) => p.posts) ?? []

  if (!isReady) return <div className="flex justify-center py-16"><Spinner size="lg" /></div>

  return (
    <div>
      <div className="flex items-center gap-2 mb-5">
        <Navigation className="w-5 h-5" style={{ color: 'var(--accent)' }} />
        <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
          Perto de mim
        </h1>
      </div>

      {geoState === 'idle' || geoState === 'unsupported' || geoState === 'denied' ? (
        <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5"
            style={{ background: 'rgba(252,163,17,0.08)', border: '1px solid rgba(252,163,17,0.15)' }}
          >
            <MapPin className="w-8 h-8" style={{ color: 'var(--accent)' }} />
          </div>

          {geoState === 'unsupported' ? (
            <>
              <p className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                Geolocalização não disponível
              </p>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                O teu browser não suporta geolocalização.
              </p>
            </>
          ) : geoState === 'denied' ? (
            <>
              <p className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                Acesso à localização negado
              </p>
              <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
                Permite o acesso à localização nas definições do browser.
              </p>
            </>
          ) : (
            <>
              <p className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                Descobre posts perto de ti
              </p>
              <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
                Vê o que viajantes estão a partilhar a menos de {RADIUS} km de onde estás.
              </p>
              <button
                onClick={requestLocation}
                className="btn btn-primary gap-2"
              >
                <Wifi className="w-4 h-4" />
                Ativar localização
              </button>
            </>
          )}
        </div>
      ) : geoState === 'loading' ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <Spinner size="lg" />
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>A obter localização…</p>
        </div>
      ) : isLoading ? (
        <div className="flex flex-col gap-4">
          {Array.from({ length: 3 }).map((_, i) => <PostCardSkeleton key={i} />)}
        </div>
      ) : posts.length === 0 ? (
        <EmptyState
          illustration="search"
          title="Sem posts perto de ti"
          description={`Nenhum post encontrado a menos de ${RADIUS} km. Sê o primeiro a partilhar!`}
        />
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>
            Posts a menos de {RADIUS} km · {posts.length} resultado{posts.length !== 1 ? 's' : ''}
          </p>
          {posts.map((post, i) => (
            <div key={post.id} className="relative">
              <PostCard post={post as never} queryKey={['nearby-posts', coords]} index={i} />
              <div
                className="absolute top-3 right-3 flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium"
                style={{ background: 'rgba(0,0,0,0.55)', color: '#fff', backdropFilter: 'blur(4px)' }}
              >
                <MapPin className="w-2.5 h-2.5" />
                {post.distanceKm < 1 ? '<1 km' : `${post.distanceKm} km`}
              </div>
            </div>
          ))}
          <div ref={sentinelRef} className="h-4" />
          {isFetchingNextPage && <div className="flex justify-center py-4"><Spinner /></div>}
          {!hasNextPage && posts.length > 0 && (
            <p className="end-of-list">Fim dos posts próximos</p>
          )}
        </div>
      )}
    </div>
  )
}
