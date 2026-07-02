// src/app/search/page.tsx
'use client'

import Image              from 'next/image'
import Link               from 'next/link'
import { useRouter }      from 'next/navigation'
import { useState, useEffect, useRef, useTransition } from 'react'
import { useQuery }       from '@tanstack/react-query'
import { NavBar }         from '@/components/layout/NavBar'
import { api }            from '@/lib/api-client'
import { cn, formatDateRange, groupTypeLabel, levelLabel, countryFlag, formatRelative } from '@/lib/utils'
import type { Itinerary, UserProfile, Post } from '@/types'

// ---------------------------------------------------------------------------
// Tipos de resposta
// ---------------------------------------------------------------------------

interface AutocompleteResult {
  destinations: { destination_name: string; country_code: string; trip_count: number }[]
  users:        Array<{
    id: string; username: string; displayName: string
    avatarUrl: string | null; level: string; isVerified: boolean; followerCount: number
  }>
}

interface SearchResult {
  itineraries: Itinerary[]
  users:       UserProfile[]
  posts:       Post[]
}

type Tab = 'all' | 'itineraries' | 'users' | 'posts'

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

// ---------------------------------------------------------------------------
// Página
// ---------------------------------------------------------------------------

export default function SearchPage() {
  const [query,    setQuery]    = useState('')
  const [tab,      setTab]      = useState<Tab>('all')
  const [isPending, startTransition] = useTransition()
  const inputRef = useRef<HTMLInputElement>(null)
  const router   = useRouter()

  const debouncedQuery = useDebounce(query, 300)
  const showAutocomplete = debouncedQuery.length >= 2 && debouncedQuery.length < 3

  // Autocomplete (a partir de 2 chars, antes do search completo)
  const { data: autocomplete } = useQuery({
    queryKey: ['autocomplete', debouncedQuery],
    queryFn:  () => api.get<AutocompleteResult>('/search/autocomplete', {
      params: { q: debouncedQuery },
    }),
    enabled: showAutocomplete,
    staleTime: 10 * 60 * 1000,
  })

  // Pesquisa completa (a partir de 3 chars)
  const { data: results, isLoading, isError, refetch } = useQuery({
    queryKey: ['search', debouncedQuery, tab],
    queryFn:  () => api.get<SearchResult>('/search', {
      params: { q: debouncedQuery, type: tab, limit: 20 },
    }),
    enabled: debouncedQuery.length >= 3,
    staleTime: 5 * 60 * 1000,
  })

  // Focar o input ao montar
  useEffect(() => { inputRef.current?.focus() }, [])

  const hasResults =
    (results?.itineraries?.length ?? 0) > 0 ||
    (results?.users?.length ?? 0)       > 0 ||
    (results?.posts?.length ?? 0)       > 0

  return (
    <div className="min-h-screen bg-surface-subtle">
      <NavBar />

      <main className="max-w-3xl mx-auto px-4 py-6 pb-24 md:pb-6">

        {/* Campo de pesquisa */}
        <div className="relative mb-6">
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-tertiary text-lg">
              🔍
            </span>
            <input
              ref={inputRef}
              type="search"
              value={query}
              onChange={(e) => startTransition(() => setQuery(e.target.value))}
              placeholder="Pesquisar roteiros, destinos, viajantes…"
              className="input pl-12 pr-4 py-3.5 rounded-xl text-base shadow-card"
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-ink-tertiary hover:text-ink"
              >
                ✕
              </button>
            )}
          </div>

          {/* Dropdown de autocomplete */}
          {showAutocomplete && autocomplete && (
            <div className="absolute top-full mt-1 left-0 right-0 bg-surface rounded-xl shadow-card-md border border-surface-muted z-50 overflow-hidden">
              {autocomplete.destinations.length > 0 && (
                <div className="p-2">
                  <p className="text-2xs text-ink-tertiary font-semibold uppercase px-3 py-1">Destinos</p>
                  {autocomplete.destinations.map((d) => (
                    <button
                      key={d.destination_name}
                      onClick={() => setQuery(d.destination_name)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-surface-subtle text-left"
                    >
                      <span className="text-lg">{countryFlag(d.country_code)}</span>
                      <div>
                        <p className="text-sm font-medium text-ink">{d.destination_name}</p>
                        <p className="text-xs text-ink-tertiary">{d.trip_count} roteiros</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {autocomplete.users.length > 0 && (
                <div className="p-2 border-t border-surface-muted">
                  <p className="text-2xs text-ink-tertiary font-semibold uppercase px-3 py-1">Viajantes</p>
                  {autocomplete.users.map((u) => (
                    <Link
                      key={u.id}
                      href={`/profile/${u.id}`}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-surface-subtle"
                    >
                      <div className="w-8 h-8 rounded-full bg-blue/10 flex items-center justify-center text-blue text-sm font-bold">
                        {u.displayName[0]?.toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-ink">{u.displayName}</p>
                        <p className="text-xs text-ink-tertiary">@{u.username}</p>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Estado inicial — sugestões populares */}
        {!query && (
          <div className="space-y-6">
            <div>
              <h2 className="text-sm font-semibold text-ink-secondary mb-3 uppercase tracking-wide">
                Destinos populares
              </h2>
              <div className="flex flex-wrap gap-2">
                {['Tokyo', 'Lisboa', 'Bali', 'Paris', 'Brasil', 'Marrocos', 'Islândia', 'Nova York'].map((d) => (
                  <button
                    key={d}
                    onClick={() => setQuery(d)}
                    className="px-4 py-2 rounded-full bg-surface border border-surface-muted text-sm
                               text-ink hover:border-blue/40 hover:text-blue transition-colors"
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Resultados */}
        {debouncedQuery.length >= 3 && (
          <>
            {/* Tabs de filtro */}
            <div className="flex gap-1 mb-6 border-b border-surface-muted">
              {([
                { id: 'all',          label: 'Todos'     },
                { id: 'itineraries',  label: 'Roteiros'  },
                { id: 'users',        label: 'Viajantes' },
                { id: 'posts',        label: 'Posts'     },
              ] as { id: Tab; label: string }[]).map(({ id, label }) => (
                <button
                  key={id}
                  onClick={() => setTab(id)}
                  className={cn(
                    'px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px',
                    tab === id
                      ? 'text-blue border-blue'
                      : 'text-ink-secondary border-transparent hover:text-ink'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Erro */}
            {isError && (
              <div className="card p-8 text-center space-y-3">
                <p className="text-ink-secondary text-sm">Não foi possível realizar a pesquisa.</p>
                <button onClick={() => refetch()} className="btn-secondary text-sm">
                  Tentar novamente
                </button>
              </div>
            )}

            {/* Loading */}
            {isLoading && (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="card p-4 flex gap-3">
                    <div className="skeleton w-16 h-16 rounded-lg shrink-0" />
                    <div className="flex-1 space-y-2">
                      <div className="skeleton h-4 w-3/4 rounded" />
                      <div className="skeleton h-3 w-1/2 rounded" />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Sem resultados */}
            {!isLoading && !hasResults && (
              <div className="card p-16 text-center space-y-3">
                <p className="text-3xl">🔭</p>
                <p className="font-display text-lg font-bold text-ink">
                  Sem resultados para "{debouncedQuery}"
                </p>
                <p className="text-ink-secondary text-sm">
                  Tenta termos diferentes ou verifica a ortografia.
                </p>
              </div>
            )}

            {/* Secção: Roteiros */}
            {(tab === 'all' || tab === 'itineraries') && (results?.itineraries?.length ?? 0) > 0 && (
              <section className="mb-8">
                {tab === 'all' && (
                  <h2 className="font-display text-lg font-bold text-ink mb-4">Roteiros</h2>
                )}
                <div className="space-y-3">
                  {results!.itineraries.map((it) => (
                    <ItinerarySearchCard key={it.id} itinerary={it} query={debouncedQuery} />
                  ))}
                </div>
              </section>
            )}

            {/* Secção: Viajantes */}
            {(tab === 'all' || tab === 'users') && (results?.users?.length ?? 0) > 0 && (
              <section className="mb-8">
                {tab === 'all' && (
                  <h2 className="font-display text-lg font-bold text-ink mb-4">Viajantes</h2>
                )}
                <div className="card divide-y divide-surface-muted overflow-hidden">
                  {results!.users.map((u) => (
                    <UserSearchRow key={u.id} user={u} />
                  ))}
                </div>
              </section>
            )}

            {/* Secção: Posts */}
            {(tab === 'all' || tab === 'posts') && (results?.posts?.length ?? 0) > 0 && (
              <section className="mb-8">
                {tab === 'all' && (
                  <h2 className="font-display text-lg font-bold text-ink mb-4">Publicações</h2>
                )}
                <div className="grid grid-cols-3 gap-1">
                  {results!.posts.map((post) => (
                    <PostSearchThumb key={post.id} post={post} />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Componentes de resultado
// ---------------------------------------------------------------------------

function ItinerarySearchCard({ itinerary: it, query }: { itinerary: Itinerary; query: string }) {
  return (
    <Link
      href={`/itineraries/${it.id}`}
      className="card flex gap-4 p-4 hover:shadow-card-md transition-shadow group"
    >
      {/* Thumbnail */}
      <div className="w-20 h-20 rounded-lg bg-blue/8 shrink-0 overflow-hidden relative">
        {it.coverImageUrl ? (
          <Image src={it.coverImageUrl} alt={it.title} fill className="object-cover" sizes="80px" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-2xl">✈️</div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <h3 className="font-semibold text-ink text-sm leading-snug group-hover:text-blue transition-colors line-clamp-2">
          <Highlight text={it.title} query={query} />
        </h3>
        <p className="text-xs text-ink-secondary mt-1">
          <Highlight text={it.destinationName} query={query} />
          {' · '}{it.durationDays} dias · {groupTypeLabel(it.groupType)}
        </p>
        {it.startDate && (
          <p className="text-xs text-ink-tertiary mt-0.5">
            {formatDateRange(it.startDate, it.endDate)}
          </p>
        )}
        <div className="flex items-center gap-3 mt-1.5 text-xs text-ink-tertiary">
          <span>🔖 {it.savesCount}</span>
          <span>👁 {it.viewsCount}</span>
          {it.aiGenerated && <span className="text-blue">✨ IA</span>}
        </div>
      </div>
    </Link>
  )
}

function UserSearchRow({ user: u }: { user: UserProfile }) {
  const { label: lvLabel, color: lvColor } = levelLabel(u.profile.level)
  return (
    <Link
      href={`/profile/${u.id}`}
      className="flex items-center gap-3 p-4 hover:bg-surface-subtle transition-colors"
    >
      {u.profile.avatarUrl ? (
        <Image
          src={u.profile.avatarUrl} alt={u.profile.displayName}
          width={44} height={44} className="rounded-full object-cover shrink-0"
        />
      ) : (
        <div className="w-11 h-11 rounded-full bg-blue/10 flex items-center justify-center text-blue font-bold shrink-0">
          {u.profile.displayName[0].toUpperCase()}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-sm text-ink">{u.profile.displayName}</span>
          {u.isVerified && <span className="text-xs">✅</span>}
          <span
            className="level-badge text-white"
            style={{ '--lv': lvColor } as React.CSSProperties}
          >
            {lvLabel}
          </span>
        </div>
        <p className="text-xs text-ink-tertiary">@{u.username} · {u.followerCount} seguidores</p>
      </div>
      {u.isPrivate && <span className="text-ink-tertiary text-sm shrink-0">🔒</span>}
    </Link>
  )
}

function PostSearchThumb({ post }: { post: Post }) {
  return (
    <Link
      href={`/posts/${post.id}`}
      className="relative aspect-square overflow-hidden rounded-sm bg-surface-muted group block"
    >
      {post.coverMedia ? (
        <Image
          src={post.coverMedia.thumbnailUrl ?? post.coverMedia.url}
          alt={post.caption ?? ''}
          fill className="object-cover group-hover:scale-105 transition-transform duration-500"
          sizes="(max-width: 768px) 33vw, 200px"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-2xl text-ink-disabled">📷</div>
      )}
      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
        <span className="text-white text-xs font-medium">❤️ {post.likesCount}</span>
      </div>
    </Link>
  )
}

// Highlight — realçar o termo pesquisado no texto
function Highlight({ text, query }: { text: string; query: string }) {
  if (!query || !text) return <>{text}</>
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return <>{text}</>
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-blue/15 text-blue rounded px-0.5">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  )
}
