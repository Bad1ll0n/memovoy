'use client'

import Image from 'next/image'
import dynamic from 'next/dynamic'
import { useState, useCallback, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query'
import { Lock, Camera, BadgeCheck, Map, Heart, MessageCircle, Bookmark, MapPin, Globe, Star, Award, Zap, Compass, UserPlus, UserCheck, Clock, BarChart2 } from 'lucide-react'
import Link from 'next/link'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import { Avatar } from '@/components/ui/Avatar'
import { Spinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { ProfileHeaderSkeleton } from '@/components/ui/Skeleton'
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll'
import type { Post } from '@/components/feed/PostCard'

const WorldMap = dynamic(() => import('@/components/map/WorldMap'), {
  ssr: false,
  loading: () => (
    <div
      className="w-full animate-pulse rounded-xl"
      style={{ height: 240, background: 'var(--surface2)' }}
    />
  ),
})

type Tab = 'posts' | 'itineraries' | 'saved' | 'liked' | 'checkins'

interface ProfileUser {
  id: string
  username: string
  displayName: string
  bio: string | null
  location: string | null
  website: string | null
  avatarUrl: string | null
  coverUrl: string | null
  isVerified: boolean
  isPrivate: boolean
  score: number
  postsCount: number
  followersCount: number
  followingCount: number
  countriesCount:   number
  itinerariesCount: number
  viewerFollows:    boolean
  /** Pedido enviado e ainda por responder. Distinto de viewerFollows: pedir
   *  não dá acesso a nada até a outra pessoa aceitar. */
  viewerRequested:  boolean
}

interface ItinerarySummary {
  id: string
  title: string
  destination: string
  coverUrl: string | null
  savesCount: number
  viewsCount: number
  aiGenerated: boolean
}

export default function ProfilePage() {
  const { userId: rawUserId } = useParams<{ userId: string }>()
  const { user: me, isHydrated } = useAuthStore()
  const router = useRouter()
  const qc = useQueryClient()
  const [tab, setTab] = useState<Tab>('posts')
  const [showMap, setShowMap] = useState(false)
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null)

  // Resolve "me" to the real user ID once hydrated
  useEffect(() => {
    if (rawUserId === 'me' && isHydrated && me?.id) {
      router.replace(`/profile/${me.id}`)
    }
  }, [rawUserId, isHydrated, me?.id, router])

  const userId = rawUserId === 'me' ? (me?.id ?? null) : rawUserId
  const isOwn = me?.id === userId

  const { data: profile, isLoading: loadingProfile } = useQuery<ProfileUser>({
    queryKey: ['profile', userId],
    queryFn: () => api.get(`/users/${userId}`),
    enabled: !!userId,
  })

  // Só pedimos o conteúdo depois de sabermos que temos direito a vê-lo.
  //
  // Até aqui o pedido era sempre feito, o servidor respondia com tudo, e era
  // esta página que decidia não o desenhar. Quem abrisse o separador de rede
  // via as publicações de uma conta privada na resposta. O servidor passou a
  // recusar, e a interface deixa de bater a uma porta que sabe estar fechada.
  const podeVerConteudo = !!profile && (!profile.isPrivate || profile.viewerFollows || isOwn)

  const followMutation = useMutation({
    mutationFn: () =>
      // O mesmo DELETE serve para deixar de seguir e para retirar um pedido
      // por responder — do lado de quem carrega é a mesma intenção.
      profile?.viewerFollows || profile?.viewerRequested
        ? api.delete(`/users/${userId}/follow`)
        : api.post(`/users/${userId}/follow`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['profile', userId] }),
  })

  const messageMutation = useMutation({
    mutationFn: () => api.post<{ id: string }>('/conversations', { userId }),
    onSuccess: (data) => router.push(`/messages/${data.id}`),
  })

  // Posts
  const {
    data: postsData,
    isLoading: loadingPosts,
    fetchNextPage: fetchMorePosts,
    hasNextPage: hasMorePosts,
  } = useInfiniteQuery<{ posts: Post[]; nextCursor: string | null }>({
    queryKey: ['profile-posts', userId],
    queryFn: ({ pageParam }) =>
      api.get(`/users/${userId}/posts${pageParam ? `?cursor=${pageParam}` : ''}`),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled: tab === 'posts' && !!userId && podeVerConteudo,
  })

  // Itineraries
  const {
    data: itiData,
    isLoading: loadingIti,
    fetchNextPage: fetchMoreIti,
    hasNextPage: hasMoreIti,
  } = useInfiniteQuery<{ itineraries: ItinerarySummary[]; nextCursor: string | null }>({
    queryKey: ['profile-itineraries', userId],
    queryFn: ({ pageParam }) =>
      api.get(`/users/${userId}/itineraries${pageParam ? `?cursor=${pageParam}` : ''}`),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled: tab === 'itineraries' && !!userId && podeVerConteudo,
  })

  // Saved
  interface SavedItem {
    bookmarkId: string
    bookmarkedAt: string
    post: { id: string; images: string[]; caption: string; userId: string } | null
    itinerary: { id: string; title: string; destination: string; coverUrl: string | null } | null
  }

  const {
    data: savedData,
    isLoading: loadingSaved,
    fetchNextPage: fetchMoreSaved,
    hasNextPage: hasMoreSaved,
  } = useInfiniteQuery<{ items: SavedItem[]; nextCursor: string | null }>({
    queryKey: ['profile-saved', userId],
    queryFn: ({ pageParam }) =>
      api.get(`/users/${userId}/saved${pageParam ? `?cursor=${pageParam}` : ''}`),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled: tab === 'saved' && !!userId && podeVerConteudo,
  })

  // Liked posts (only own)
  const {
    data: likedData,
    isLoading: loadingLiked,
    fetchNextPage: fetchMoreLiked,
    hasNextPage: hasMoreLiked,
  } = useInfiniteQuery<{ posts: Post[]; nextCursor: string | null }>({
    queryKey: ['profile-liked', userId],
    queryFn: ({ pageParam }) =>
      api.get(`/users/${userId}/liked${pageParam ? `?cursor=${pageParam}` : ''}`),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled: tab === 'liked' && isOwn && !!userId,
  })

  // Checkins
  const { data: checkinsData, isLoading: loadingCheckins } = useQuery<{
    checkins: { itineraryId: string; itineraryTitle: string; coverUrl: string | null; activityName: string; destination: string; dayIndex: number; checkedInAt: string }[]
  }>({
    queryKey: ['profile-checkins', userId],
    queryFn:  () => api.get(`/users/${userId}/checkins`),
    enabled:  tab === 'checkins' && !!userId && podeVerConteudo,
  })

  // Travel stats
  const [showStats, setShowStats] = useState(false)
  interface TravelStats {
    byYear: { year: number; itineraries: number; countries: number }[]
    totalItineraries: number
    totalCountries: number
    topDestinations: { destination: string; visits: number }[]
  }
  const { data: travelStats } = useQuery<TravelStats>({
    queryKey: ['travel-stats', userId],
    queryFn:  () => api.get(`/users/${userId}/travel-stats`),
    enabled:  showStats && !!userId && podeVerConteudo,
    staleTime: 5 * 60 * 1000,
  })

  // Travel map data — lazy-loaded only when the user opens the map section
  const { data: mapCountries } = useQuery<{ countryCode: string; countryName: string; count: number }[]>({
    queryKey: ['profile-map', userId, isOwn],
    queryFn: () => api.get(isOwn ? '/map/mine' : `/map/users/${userId}`),
    enabled: showMap && !!userId && podeVerConteudo,
    staleTime: 5 * 60 * 1000,
  })

  const handleLoadMorePosts = useCallback(() => fetchMorePosts(), [fetchMorePosts])
  const handleLoadMoreIti = useCallback(() => fetchMoreIti(), [fetchMoreIti])
  const handleLoadMoreSaved = useCallback(() => fetchMoreSaved(), [fetchMoreSaved])
  const handleLoadMoreLiked = useCallback(() => fetchMoreLiked(), [fetchMoreLiked])
  const postsSentinel  = useInfiniteScroll({ hasMore: !!hasMorePosts,  onLoadMore: handleLoadMorePosts })
  const itiSentinel    = useInfiniteScroll({ hasMore: !!hasMoreIti,    onLoadMore: handleLoadMoreIti })
  const savedSentinel  = useInfiniteScroll({ hasMore: !!hasMoreSaved,  onLoadMore: handleLoadMoreSaved })
  const likedSentinel  = useInfiniteScroll({ hasMore: !!hasMoreLiked,  onLoadMore: handleLoadMoreLiked })

  const posts        = postsData?.pages.flatMap((p) => p.posts) ?? []
  const itineraries  = itiData?.pages.flatMap((p) => p.itineraries) ?? []
  const savedItems   = savedData?.pages.flatMap((p) => p.items) ?? []
  const likedPosts   = likedData?.pages.flatMap((p) => p.posts) ?? []

  if (!userId || loadingProfile) {
    return <ProfileHeaderSkeleton />
  }

  if (!profile) return null


  // Badge definitions (threshold-based, derived from public data)
  const BADGES = [
    { id: 'explorer',   label: 'Explorador',    Icon: Compass, description: '1 roteiro criado',       unlocked: profile.postsCount >= 1 },
    { id: 'traveller',  label: 'Viajante',       Icon: Globe,   description: '3 países visitados',     unlocked: profile.countriesCount >= 3 },
    { id: 'social',     label: 'Social',         Icon: Heart,   description: '10 seguidores',          unlocked: profile.followersCount >= 10 },
    { id: 'creator',    label: 'Criador',        Icon: Star,    description: '5 posts publicados',     unlocked: profile.postsCount >= 5 },
    { id: 'globetrotter', label: 'Globe-trotter', Icon: Award, description: '10 países visitados',    unlocked: profile.countriesCount >= 10 },
    { id: 'influencer', label: 'Influencer',     Icon: Zap,     description: '100 seguidores',        unlocked: profile.followersCount >= 100 },
  ] as const

  return (
    <div>
      {/* Cover photo */}
      <div
        className="relative rounded-2xl overflow-hidden mb-0"
        style={{ height: 128, background: 'linear-gradient(135deg, #b87200, var(--accent))' }}
      >
        {profile.coverUrl && (
          <Image src={profile.coverUrl} alt="Cover" fill className="object-cover" unoptimized />
        )}
      </div>

      {/* Profile info */}
      <div className="px-1 pb-4" style={{ marginTop: -40 }}>
        <div className="flex items-end justify-between gap-3 mb-3">
          <div className="relative">
            <Avatar
              src={profile.avatarUrl}
              name={profile.displayName || profile.username}
              size="xl"
              className="border-4"
              style={{ borderColor: 'var(--bg-body)' } as React.CSSProperties}
            />
          </div>

          {isOwn ? (
            <Link href={`/profile/${userId}/edit`} className="btn btn-secondary text-sm">
              Editar perfil
            </Link>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={() => messageMutation.mutate()}
                disabled={messageMutation.isPending}
                className="btn btn-secondary text-sm gap-1.5"
                aria-label="Enviar mensagem"
              >
                <MessageCircle className="w-3.5 h-3.5" />
                {messageMutation.isPending ? '…' : 'Mensagem'}
              </button>
              <button
                onClick={() => followMutation.mutate()}
                disabled={followMutation.isPending}
                className={`btn text-sm gap-1.5 transition-all ${profile.viewerFollows || profile.viewerRequested ? 'btn-secondary' : 'btn-primary'} ${profile.viewerFollows ? 'animate-follow-pop' : ''}`}
              >
                {followMutation.isPending ? (
                  <span className="text-sm">…</span>
                ) : profile.viewerFollows ? (
                  <><UserCheck className="w-3.5 h-3.5" />A seguir</>
                ) : profile.viewerRequested ? (
                  // Não é "A seguir": não se vê nada até a outra pessoa
                  // responder, e dizer o contrário seria mentir ao utilizador.
                  <><Clock className="w-3.5 h-3.5" />Pedido enviado</>
                ) : (
                  <><UserPlus className="w-3.5 h-3.5" />Seguir</>
                )}
              </button>
            </div>
          )}
        </div>

        {/* Name & bio */}
        <div className="flex items-center gap-1.5 flex-wrap mb-1">
          <h1 className="font-bold text-lg" style={{ color: 'var(--text-primary)' }}>
            {profile.displayName || profile.username}
          </h1>
          {profile.isVerified && (
            <span title="Conta verificada">
              <BadgeCheck className="w-5 h-5 shrink-0" style={{ color: 'var(--accent)' }} />
            </span>
          )}
        </div>
        <p className="text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>
          @{profile.username}
        </p>
        {profile.location && (
          <p className="flex items-center gap-1 text-xs mb-1" style={{ color: 'var(--text-muted)' }}>
            <MapPin className="w-3 h-3 shrink-0" />
            {profile.location}
          </p>
        )}
        {profile.website && (
          <a
            href={profile.website}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs mb-1.5 hover:underline"
            style={{ color: 'var(--accent)' }}
          >
            <Globe className="w-3 h-3 shrink-0" />
            {profile.website.replace(/^https?:\/\//, '')}
          </a>
        )}
        {profile.bio && (
          <p className="text-sm mb-3" style={{ color: 'var(--text-primary)' }}>
            {profile.bio}
          </p>
        )}

        {/* Stats */}
        <div className="flex gap-5">
          {[
            { label: 'Posts', value: profile.postsCount },
            { label: 'Seguidores', value: profile.followersCount, href: `/profile/${userId}/followers` },
            { label: 'A seguir', value: profile.followingCount, href: `/profile/${userId}/following` },
            { label: 'Países', value: profile.countriesCount },
          ].map(({ label, value, href }) => (
            href ? (
              <Link key={label} href={href} className="text-center hover:opacity-80">
                <p className="font-bold text-base" style={{ color: 'var(--text-primary)' }}>{value}</p>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{label}</p>
              </Link>
            ) : (
              <div key={label} className="text-center">
                <p className="font-bold text-base" style={{ color: 'var(--text-primary)' }}>{value}</p>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{label}</p>
              </div>
            )
          ))}
        </div>
      </div>

      {/* Badges / Conquistas */}
      <div className="mb-4">
        <h3 className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>
          Conquistas
        </h3>
        <div className="grid grid-cols-3 gap-2">
          {BADGES.map(({ id, label, Icon, description, unlocked }) => (
            <div
              key={id}
              className="flex flex-col items-center gap-1 p-3 rounded-xl text-center transition-opacity"
              style={{
                background: 'var(--surface2)',
                opacity: unlocked ? 1 : 0.4,
              }}
            >
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center mb-0.5"
                style={{
                  background: unlocked ? 'rgba(252,163,17,0.15)' : 'var(--bg-body)',
                }}
              >
                <Icon
                  className="w-4 h-4"
                  style={{ color: unlocked ? 'var(--accent)' : 'var(--text-muted)' }}
                />
              </div>
              <p className="text-[11px] font-semibold leading-tight" style={{ color: unlocked ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                {label}
              </p>
              <p className="text-[10px] leading-tight" style={{ color: 'var(--text-muted)' }}>
                {description}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Travel Stats */}
      <div
        className="grid grid-cols-3 gap-2 mb-4 p-4 rounded-2xl"
        style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}
      >
        {[
          { label: 'Países', value: profile.countriesCount, Icon: Globe, onClick: () => { setShowMap((v) => !v); setShowStats(false) }, active: showMap },
          { label: 'Roteiros', value: profile.itinerariesCount ?? 0, Icon: Map, onClick: undefined, active: false },
          { label: 'Pontos', value: profile.score, Icon: Star, onClick: undefined, active: false },
          { label: 'Estatísticas', value: null, Icon: BarChart2, onClick: () => { setShowStats((v) => !v); setShowMap(false); setSelectedCountry(null) }, active: showStats },
        ].map(({ label, value, Icon, onClick, active }) => (
          <div
            key={label}
            role={onClick ? 'button' : undefined}
            tabIndex={onClick ? 0 : undefined}
            onClick={onClick}
            onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') onClick() } : undefined}
            className={`flex flex-col items-center gap-1 text-center ${onClick ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''}`}
          >
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center mb-0.5"
              style={{ background: active ? 'rgba(34,152,206,0.25)' : 'rgba(34,152,206,0.1)' }}
            >
              <Icon className="w-4 h-4" style={{ color: 'var(--accent)' }} />
            </div>
            <p className="font-bold text-lg leading-none" style={{ color: 'var(--text-primary)' }}>
              {value !== null ? value.toLocaleString('pt-PT') : '···'}
            </p>
            <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{label}</p>
          </div>
        ))}
      </div>

      {/* Travel WorldMap — toggled by clicking "Países" stat */}
      {showMap && (
        <div
          className="mb-4 rounded-2xl overflow-hidden"
          style={{ border: '1px solid var(--border)', background: 'var(--surface2)' }}
        >
          <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
            <div className="flex items-center gap-2">
              <Map className="w-4 h-4" style={{ color: 'var(--accent)' }} />
              <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                Mapa de viagens
              </span>
              {(mapCountries?.length ?? 0) > 0 && (
                <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}>
                  {mapCountries!.length} {mapCountries!.length === 1 ? 'país' : 'países'}
                </span>
              )}
            </div>
            <button
              onClick={() => { setShowMap(false); setSelectedCountry(null) }}
              className="text-xs hover:opacity-70 transition-opacity"
              style={{ color: 'var(--text-muted)' }}
              aria-label="Fechar mapa"
            >
              Fechar
            </button>
          </div>
          <div style={{ height: 260 }}>
            <WorldMap
              countries={mapCountries ?? []}
              onSelectCountry={(name) => setSelectedCountry(name)}
            />
          </div>
          {selectedCountry && (
            <div className="px-4 py-2.5 text-sm font-medium" style={{ color: 'var(--text-primary)', borderTop: '1px solid var(--border)' }}>
              <span style={{ color: 'var(--text-muted)' }}>País selecionado: </span>
              {selectedCountry}
              {mapCountries?.find((c) => c.countryName === selectedCountry) && (
                <span className="ml-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
                  · {mapCountries.find((c) => c.countryName === selectedCountry)!.count} roteiro(s)
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Travel Statistics panel */}
      {showStats && (
        <div className="mb-4 rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border)', background: 'var(--surface2)' }}>
          <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
            <div className="flex items-center gap-2">
              <BarChart2 className="w-4 h-4" style={{ color: 'var(--accent)' }} />
              <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Estatísticas de viagem</span>
            </div>
            <button onClick={() => setShowStats(false)} className="text-xs hover:opacity-70 transition-opacity" style={{ color: 'var(--text-muted)' }}>Fechar</button>
          </div>
          <div className="p-4 flex flex-col gap-4">
            {/* Summary totals */}
            {travelStats && (
              <div className="flex gap-3">
                <div className="flex-1 text-center p-3 rounded-xl" style={{ background: 'var(--bg-card)' }}>
                  <p className="font-bold text-xl" style={{ color: 'var(--accent)' }}>{travelStats.totalCountries}</p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>países visitados</p>
                </div>
                <div className="flex-1 text-center p-3 rounded-xl" style={{ background: 'var(--bg-card)' }}>
                  <p className="font-bold text-xl" style={{ color: 'var(--accent)' }}>{travelStats.totalItineraries}</p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>roteiros criados</p>
                </div>
              </div>
            )}
            {/* Year-by-year bar chart (pure CSS) */}
            {travelStats && travelStats.byYear.length > 0 && (
              <div>
                <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>Por ano</p>
                <div className="flex flex-col gap-2">
                  {travelStats.byYear.map((y) => {
                    const maxIti = Math.max(...travelStats.byYear.map((r) => r.itineraries), 1)
                    const pct = Math.round((y.itineraries / maxIti) * 100)
                    return (
                      <div key={y.year} className="flex items-center gap-2">
                        <span className="text-xs font-mono w-10 shrink-0" style={{ color: 'var(--text-muted)' }}>{y.year}</span>
                        <div className="flex-1 relative h-5 rounded-full overflow-hidden" style={{ background: 'var(--bg-card)' }}>
                          <div
                            className="h-full rounded-full transition-all"
                            style={{ width: `${pct}%`, background: 'var(--accent)', opacity: 0.8 }}
                          />
                        </div>
                        <span className="text-xs w-20 shrink-0 text-right" style={{ color: 'var(--text-muted)' }}>
                          {y.itineraries} rot · {y.countries} {y.countries === 1 ? 'país' : 'países'}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
            {/* Top destinations */}
            {travelStats && travelStats.topDestinations.length > 0 && (
              <div>
                <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>Destinos favoritos</p>
                <div className="flex flex-wrap gap-2">
                  {travelStats.topDestinations.map((d, i) => (
                    <span key={i} className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full" style={{ background: 'rgba(34,152,206,0.1)', color: 'var(--accent)' }}>
                      <MapPin className="w-3 h-3" />{d.destination} ×{d.visits}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {!travelStats && (
              <div className="flex justify-center py-4"><Spinner size="sm" /></div>
            )}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b mb-4 overflow-x-auto" style={{ borderColor: 'var(--border)' }}>
        {(
          [
            ['posts', 'Posts'],
            ['itineraries', 'Roteiros'],
            ['saved', 'Guardados'],
            ...(isOwn ? [['liked', 'Curtidos']] : []),
            ['checkins', 'Check-ins'],
          ] as [Tab, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`tab-item ${tab === key ? 'tab-item-active' : ''}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Private account gate */}
      {!podeVerConteudo && (
        <div className="py-12 text-center">
          <Lock className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
          <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>
            Conta privada
          </p>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
            {profile.viewerRequested
              ? 'Pedido enviado. Vais ver o conteúdo assim que for aceite.'
              : 'Pede para seguir e vê o conteúdo assim que for aceite.'}
          </p>
        </div>
      )}

      {/* Posts grid */}
      {podeVerConteudo && tab === 'posts' && (
        <>
          {loadingPosts ? (
            <div className="flex justify-center py-8"><Spinner /></div>
          ) : posts.length === 0 ? (
            <EmptyState Icon={Camera} title="Ainda sem posts" />
          ) : (
            <div className="grid grid-cols-3 gap-1">
              {posts.map((p) => (
                <Link
                  key={p.id}
                  href={`/posts/${p.id}`}
                  className="relative group block"
                  style={{ aspectRatio: '1/1' }}
                >
                  {p.images[0] ? (
                    <Image
                      src={p.images[0]}
                      alt={p.caption}
                      fill
                      className="object-cover"
                      sizes="(max-width: 640px) 33vw, 200px"
                    />
                  ) : (
                    <div
                      className="w-full h-full flex items-center justify-center"
                      style={{ background: 'var(--surface2)' }}
                    >
                      <Camera className="w-6 h-6" style={{ color: 'var(--text-muted)' }} />
                    </div>
                  )}
                  <div
                    className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3"
                    style={{ background: 'rgba(0,0,0,0.5)' }}
                  >
                    <span className="flex items-center gap-1 text-white text-xs font-semibold">
                      <Heart className="w-3.5 h-3.5" fill="currentColor" /> {p.likesCount}
                    </span>
                    <span className="flex items-center gap-1 text-white text-xs font-semibold">
                      <MessageCircle className="w-3.5 h-3.5" /> {p.commentsCount}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
          <div ref={postsSentinel} className="h-4" />
        </>
      )}

      {/* Itineraries */}
      {podeVerConteudo && tab === 'itineraries' && (
        <>
          {loadingIti ? (
            <div className="flex justify-center py-8"><Spinner /></div>
          ) : itineraries.length === 0 ? (
            <EmptyState
              Icon={Map}
              title="Ainda sem roteiros"
              action={isOwn ? { label: 'Criar roteiro', href: '/itineraries/new' } : undefined}
            />
          ) : (
            <div className="flex flex-col gap-3">
              {itineraries.map((it) => (
                <Link key={it.id} href={`/itineraries/${it.id}`} className="card p-4 flex gap-3 hover:opacity-90 transition-opacity">
                  {it.coverUrl ? (
                    <div className="relative w-16 h-16 rounded-lg overflow-hidden shrink-0">
                      <Image src={it.coverUrl} alt={it.title} fill className="object-cover" sizes="64px" unoptimized />
                    </div>
                  ) : (
                    <div className="w-16 h-16 rounded-lg shrink-0 flex items-center justify-center" style={{ background: 'var(--surface2)' }}>
                      <Map className="w-6 h-6" style={{ color: 'var(--text-muted)' }} />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-sm truncate" style={{ color: 'var(--text-primary)' }}>
                      {it.title}
                    </p>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      {it.destination}
                    </p>
                    <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                      {it.savesCount} guardados · {it.viewsCount} visualizações
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )}
          <div ref={itiSentinel} className="h-4" />
        </>
      )}

      {/* Saved */}
      {podeVerConteudo && tab === 'saved' && (
        <>
          {loadingSaved ? (
            <div className="flex justify-center py-8"><Spinner /></div>
          ) : savedItems.length === 0 ? (
            <EmptyState Icon={Bookmark} title="Ainda sem guardados" description="Guarda posts e roteiros para os ver aqui." />
          ) : (
            <div className="grid grid-cols-3 gap-1">
              {savedItems.map((item) => {
                if (item.post) {
                  return (
                    <Link
                      key={item.bookmarkId}
                      href={`/posts/${item.post.id}`}
                      className="relative group block"
                      style={{ aspectRatio: '1/1' }}
                    >
                      {item.post.images[0] ? (
                        <Image
                          src={item.post.images[0]}
                          alt={item.post.caption}
                          fill
                          className="object-cover"
                          sizes="(max-width: 640px) 33vw, 200px"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center" style={{ background: 'var(--surface2)' }}>
                          <Camera className="w-6 h-6" style={{ color: 'var(--text-muted)' }} />
                        </div>
                      )}
                      <div
                        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                        style={{ background: 'rgba(0,0,0,0.45)' }}
                      >
                        <Bookmark className="w-5 h-5 text-white" fill="currentColor" />
                      </div>
                    </Link>
                  )
                }
                if (item.itinerary) {
                  return (
                    <Link
                      key={item.bookmarkId}
                      href={`/itineraries/${item.itinerary.id}`}
                      className="relative group block rounded-lg overflow-hidden"
                      style={{ aspectRatio: '1/1' }}
                    >
                      {item.itinerary.coverUrl ? (
                        <Image
                          src={item.itinerary.coverUrl}
                          alt={item.itinerary.title}
                          fill
                          className="object-cover"
                          sizes="(max-width: 640px) 33vw, 200px"
                        />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center gap-1 p-2" style={{ background: 'linear-gradient(135deg, #b87200, var(--accent))' }}>
                          <Map className="w-5 h-5 text-white" />
                          <p className="text-white text-[10px] text-center font-medium leading-tight">{item.itinerary.destination}</p>
                        </div>
                      )}
                      <div
                        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                        style={{ background: 'rgba(0,0,0,0.45)' }}
                      >
                        <Bookmark className="w-5 h-5 text-white" fill="currentColor" />
                      </div>
                    </Link>
                  )
                }
                return null
              })}
            </div>
          )}
          <div ref={savedSentinel} className="h-4" />
        </>
      )}

      {/* Liked posts — own profile only */}
      {isOwn && tab === 'liked' && (
        <>
          {loadingLiked ? (
            <div className="flex justify-center py-8"><Spinner /></div>
          ) : likedPosts.length === 0 ? (
            <EmptyState Icon={Heart} title="Ainda sem posts curtidos" description="Os posts que deres like aparecem aqui." />
          ) : (
            <div className="grid grid-cols-3 gap-1">
              {likedPosts.map((p) => (
                <Link
                  key={p.id}
                  href={`/posts/${p.id}`}
                  className="relative group block"
                  style={{ aspectRatio: '1/1' }}
                >
                  {p.images[0] ? (
                    <Image
                      src={p.images[0]}
                      alt={p.caption}
                      fill
                      className="object-cover"
                      sizes="(max-width: 640px) 33vw, 200px"
                    />
                  ) : (
                    <div
                      className="w-full h-full flex items-center justify-center"
                      style={{ background: 'var(--surface2)' }}
                    >
                      <Camera className="w-6 h-6" style={{ color: 'var(--text-muted)' }} />
                    </div>
                  )}
                  <div
                    className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3"
                    style={{ background: 'rgba(0,0,0,0.5)' }}
                  >
                    <span className="flex items-center gap-1 text-white text-xs font-semibold">
                      <Heart className="w-3.5 h-3.5" fill="currentColor" /> {p.likesCount}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
          <div ref={likedSentinel} className="h-4" />
        </>
      )}

      {/* Check-ins */}
      {podeVerConteudo && tab === 'checkins' && (
        <>
          {loadingCheckins ? (
            <div className="flex justify-center py-8"><Spinner /></div>
          ) : (checkinsData?.checkins ?? []).length === 0 ? (
            <EmptyState Icon={MapPin} title="Nenhum check-in ainda" description="Marca actividades como visitadas nos roteiros." />
          ) : (
            <div className="flex flex-col gap-2">
              {(checkinsData?.checkins ?? []).map((c, i) => (
                <Link
                  key={i}
                  href={`/itineraries/${c.itineraryId}`}
                  className="card p-3 flex items-center gap-3 hover:opacity-90 transition-opacity"
                >
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: 'rgba(52,211,153,0.15)' }}
                  >
                    <MapPin className="w-4 h-4" style={{ color: 'var(--success)' }} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                      {c.activityName}
                    </p>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      {c.destination} · {c.itineraryTitle}
                    </p>
                  </div>
                  <p className="text-[10px] shrink-0" style={{ color: 'var(--text-muted)' }}>
                    {new Date(c.checkedInAt).toLocaleDateString('pt-PT')}
                  </p>
                </Link>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
