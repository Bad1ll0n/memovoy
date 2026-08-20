'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useState, useEffect, useRef, useSyncExternalStore } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Search, X, BadgeCheck, Lock, Map, Camera, Users, Clock, Sparkles, MapPin, Wallet } from 'lucide-react'
import { api } from '@/lib/api'
import { useRequireAuth } from '@/hooks/useRequireAuth'
import { Avatar } from '@/components/ui/Avatar'
import { EmptyState } from '@/components/ui/EmptyState'
import { SearchResultsSkeleton, ItineraryGridSkeleton } from '@/components/ui/Skeleton'
import { Spinner } from '@/components/ui/Spinner'

type Tab = 'users' | 'itineraries' | 'posts'
type SearchMode = 'normal' | 'ai'

interface AiDestination {
  destination: string
  country: string
  why: string
  bestFor: string
  estimatedBudget: string
}

interface UserResult {
  id: string
  username: string
  displayName: string
  avatarUrl: string | null
  isVerified: boolean
  isPrivate: boolean
  followersCount: number
}

interface ItineraryResult {
  id: string
  title: string
  destination: string
  coverUrl: string | null
  savesCount: number
  viewsCount: number
}

interface PostResult {
  id: string
  images: string[]
  caption: string
  likesCount: number
}

interface SearchResults {
  users: UserResult[]
  itineraries: ItineraryResult[]
  posts: PostResult[]
}

function useDebounce(value: string, ms = 350) {
  const [debouncedValue, setDebouncedValue] = useState(value)

  useEffect(() => {
    const id = setTimeout(() => setDebouncedValue(value), ms)
    return () => clearTimeout(id)
  }, [value, ms])

  return debouncedValue
}

const HISTORY_KEY = 'memovoy-search-history'
const MAX_HISTORY  = 8

// O histórico vive no localStorage, não no React. Exposto como store externa
// para o componente o ler com useSyncExternalStore em vez de o copiar para
// estado num efeito. O snapshot tem de ser referencialmente estável — devolver
// um array novo a cada leitura punha o React em ciclo de renders — daí a cache.

const HISTORICO_VAZIO: string[] = []
const ouvintesHistorico = new Set<() => void>()
let historicoCache: string[] | null = null

function loadHistory(): string[] {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]') } catch { return [] }
}

function lerHistorico(): string[] {
  if (historicoCache === null) historicoCache = loadHistory()
  return historicoCache
}

function subscreverHistorico(aoMudar: () => void) {
  ouvintesHistorico.add(aoMudar)
  return () => { ouvintesHistorico.delete(aoMudar) }
}

function escreverHistorico(next: string[]) {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(next)) } catch {}
  historicoCache = next
  ouvintesHistorico.forEach((o) => o())
}

function saveToHistory(term: string) {
  const prev = lerHistorico()
  if (prev[0] === term) return   // já está no topo: não mexer nem re-renderizar
  escreverHistorico([term, ...prev.filter((t) => t !== term)].slice(0, MAX_HISTORY))
}

function removeFromHistory(term: string) {
  escreverHistorico(lerHistorico().filter((t) => t !== term))
}

export default function SearchPage() {
  // Mesma protecção dos irmãos do grupo (app).
  const { isReady } = useRequireAuth()

  const [q, setQ] = useState('')
  const [tab, setTab] = useState<Tab>('users')
  const [mode, setMode] = useState<SearchMode>('normal')
  const history = useSyncExternalStore(subscreverHistorico, lerHistorico, () => HISTORICO_VAZIO)
  const [focused, setFocused] = useState(false)
  const dq = useDebounce(q, 350)
  const inputRef = useRef<HTMLInputElement>(null)

  // Gravar é o efeito; a lista actualiza-se sozinha porque a store notifica.
  useEffect(() => {
    if (dq.length >= 2 && mode === 'normal') saveToHistory(dq)
  }, [dq, mode])

  const { data, isLoading } = useQuery<SearchResults>({
    queryKey: ['search', dq],
    queryFn: () => api.get(`/search?q=${encodeURIComponent(dq)}`),
    enabled: isReady && dq.length >= 2 && mode === 'normal',
  })

  const aiSearchMutation = useMutation({
    mutationFn: () => api.post<{ suggestions: AiDestination[] }>('/search/destinations', { query: q }),
  })

  const tabs: { key: Tab; label: string }[] = [
    { key: 'users', label: 'Pessoas' },
    { key: 'itineraries', label: 'Roteiros' },
    { key: 'posts', label: 'Posts' },
  ]

  const showHistory = focused && q.length === 0 && history.length > 0

  return (
    <div>
      {/* Mode toggle */}
      <div className="flex items-center gap-2 mb-3">
        <button
          onClick={() => setMode('normal')}
          className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full transition-all ${mode === 'normal' ? 'chip-active' : 'chip'}`}
        >
          <Search className="w-3 h-3" />
          Pesquisa
        </button>
        <button
          onClick={() => setMode('ai')}
          className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full transition-all ${mode === 'ai' ? 'chip-active' : 'chip'}`}
        >
          <Sparkles className="w-3 h-3" />
          Pesquisa com IA
        </button>
      </div>

      {/* Search input */}
      <div className="relative mb-5">
        <Search
          className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
          style={{ color: 'var(--text-muted)' }}
        />
        <input
          ref={inputRef}
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          placeholder={mode === 'ai' ? 'Ex: praias tranquilas na Europa em outubro, budget 800€…' : 'Pesquisa pessoas, roteiros, posts…'}
          className="input" style={{ paddingLeft: '2.5rem', paddingRight: mode === 'ai' ? '7rem' : '2.5rem' }}
          autoFocus
          onKeyDown={(e) => { if (e.key === 'Enter' && mode === 'ai' && q.length >= 3) aiSearchMutation.mutate() }}
        />
        {mode === 'ai' && q.length >= 3 && (
          <button
            onClick={() => aiSearchMutation.mutate()}
            disabled={aiSearchMutation.isPending}
            className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg transition-opacity hover:opacity-80 disabled:opacity-50"
            style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
          >
            {aiSearchMutation.isPending ? <Spinner size="sm" /> : <Sparkles className="w-3 h-3" />}
            {aiSearchMutation.isPending ? '' : 'Pesquisar'}
          </button>
        )}
        {q && mode === 'normal' && (
          <button
            onClick={() => setQ('')}
            className="absolute right-3 top-1/2 -translate-y-1/2"
            style={{ color: 'var(--text-muted)' }}
            aria-label="Limpar pesquisa"
          >
            <X className="w-4 h-4" />
          </button>
        )}

        {/* History dropdown */}
        {showHistory && (
          <div
            className="absolute top-full left-0 right-0 mt-1 rounded-xl py-1 z-30 shadow-xl"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
          >
            {history.map((term) => (
              <div key={term} className="flex items-center gap-2 px-3 py-2 hover:opacity-80 cursor-pointer transition-opacity">
                <Clock className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--text-muted)' }} />
                <button
                  className="flex-1 text-left text-sm"
                  style={{ color: 'var(--text-primary)' }}
                  onClick={() => { setQ(term); inputRef.current?.focus() }}
                >
                  {term}
                </button>
                <button
                  onClick={() => removeFromHistory(term)}
                  className="shrink-0 hover:opacity-70"
                  style={{ color: 'var(--text-muted)' }}
                  aria-label={`Remover '${term}' do histórico`}
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* AI search results */}
      {mode === 'ai' && (
        <div>
          {aiSearchMutation.isPending && (
            <div className="flex justify-center py-12"><Spinner size="lg" /></div>
          )}
          {aiSearchMutation.isError && (
            <p className="text-sm text-center py-4" style={{ color: 'var(--danger)' }}>
              Pesquisa com IA indisponível. Tenta novamente.
            </p>
          )}
          {aiSearchMutation.data && (
            <div className="flex flex-col gap-3">
              {(aiSearchMutation.data.suggestions ?? []).map((s, i) => (
                <Link
                  key={i}
                  href={`/itineraries/new?destination=${encodeURIComponent(s.destination + ', ' + s.country)}`}
                  className="card p-4 flex flex-col gap-1.5 hover:opacity-90 transition-opacity"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>
                        {s.destination}
                        <span className="font-normal ml-1.5" style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                          {s.country}
                        </span>
                      </p>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>{s.why}</p>
                    </div>
                    <span
                      className="text-xs font-bold shrink-0 px-2 py-0.5 rounded-full"
                      style={{ background: 'rgba(34,152,206,0.12)', color: 'var(--accent)' }}
                    >
                      #{i + 1}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                      <MapPin className="w-3 h-3" />{s.bestFor}
                    </span>
                    <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                      <Wallet className="w-3 h-3" />{s.estimatedBudget}
                    </span>
                  </div>
                </Link>
              ))}
              {aiSearchMutation.data.suggestions.length === 0 && (
                <EmptyState Icon={Sparkles} title="Sem sugestões" description="Tenta reformular a tua pesquisa." />
              )}
            </div>
          )}
          {!aiSearchMutation.isPending && !aiSearchMutation.data && !aiSearchMutation.isError && (
            <EmptyState
              illustration="search"
              title="Pesquisa com IA"
              description="Descreve o teu destino ideal e a IA sugere-te os melhores sítios. Ex: 'praias tranquilas na Europa em outubro, budget 800€'"
            />
          )}
        </div>
      )}

      {mode === 'normal' && dq.length < 2 ? (
        <EmptyState
          illustration="search"
          title="Pesquisa Memovoy"
          description="Escreve pelo menos 2 caracteres para pesquisar."
        />
      ) : mode === 'normal' && (
        <>
          {/* Tabs */}
          <div className="flex border-b mb-5" style={{ borderColor: 'var(--border)' }}>
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`tab-item ${tab === t.key ? 'tab-item-active' : ''}`}
                disabled={isLoading}
              >
                {t.label}
              </button>
            ))}
          </div>

          {isLoading ? (
            tab === 'users'
              ? <SearchResultsSkeleton count={5} />
              : <ItineraryGridSkeleton count={4} />
          ) : (
            <>
              {/* Users */}
              {tab === 'users' && (
                <div className="flex flex-col gap-3">
                  {(data?.users ?? []).length === 0 ? (
                    <EmptyState Icon={Users} title="Sem resultados" />
                  ) : (
                    data?.users.map((u) => (
                      <Link
                        key={u.id}
                        href={`/profile/${u.id}`}
                        className="flex items-center gap-3 p-3 rounded-xl transition-colors"
                        style={{ background: 'var(--bg-card)' }}
                      >
                        <Avatar src={u.avatarUrl} name={u.displayName || u.username} size="md" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-sm truncate" style={{ color: 'var(--text-primary)' }}>
                              {u.displayName || u.username}
                            </span>
                            {u.isVerified && (
                              <BadgeCheck className="w-4 h-4 shrink-0" style={{ color: 'var(--accent)' }} />
                            )}
                            {u.isPrivate && (
                              <Lock className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--text-muted)' }} />
                            )}
                          </div>
                          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                            @{u.username} · {u.followersCount} seguidores
                          </p>
                        </div>
                      </Link>
                    ))
                  )}
                </div>
              )}

              {/* Itineraries */}
              {tab === 'itineraries' && (
                <div className="flex flex-col gap-3">
                  {(data?.itineraries ?? []).length === 0 ? (
                    <EmptyState Icon={Map} title="Sem roteiros" />
                  ) : (
                    data?.itineraries.map((it) => (
                      <Link
                        key={it.id}
                        href={`/itineraries/${it.id}`}
                        className="flex items-center gap-3 p-3 rounded-xl overflow-hidden"
                        style={{ background: 'var(--bg-card)' }}
                      >
                        {it.coverUrl ? (
                          <div className="relative w-14 h-14 rounded-lg overflow-hidden shrink-0">
                            <Image src={it.coverUrl} alt={it.title} fill className="object-cover" sizes="56px" unoptimized />
                          </div>
                        ) : (
                          <div
                            className="w-14 h-14 rounded-lg shrink-0 flex items-center justify-center"
                            style={{ background: 'var(--surface2)' }}
                          >
                            <Map className="w-5 h-5" style={{ color: 'var(--text-muted)' }} />
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="font-semibold text-sm truncate" style={{ color: 'var(--text-primary)' }}>
                            {it.title}
                          </p>
                          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                            {it.destination}
                          </p>
                        </div>
                      </Link>
                    ))
                  )}
                </div>
              )}

              {/* Posts */}
              {tab === 'posts' && (
                <div className="grid grid-cols-3 gap-1">
                  {(data?.posts ?? []).length === 0 ? (
                    <div className="col-span-3">
                      <EmptyState Icon={Camera} title="Sem posts" />
                    </div>
                  ) : (
                    data?.posts.map((p) => (
                      <Link
                        key={p.id}
                        href={`/posts/${p.id}`}
                        className="relative block"
                        style={{ aspectRatio: '1/1' }}
                      >
                        {p.images[0] ? (
                          <Image
                            src={p.images[0]}
                            alt={p.caption}
                            fill
                            className="object-cover rounded-lg"
                            sizes="(max-width: 640px) 33vw, 200px"
                          />
                        ) : (
                          <div
                            className="w-full h-full rounded-lg flex items-center justify-center"
                            style={{ background: 'var(--surface2)' }}
                          >
                            <Camera className="w-6 h-6" style={{ color: 'var(--text-muted)' }} />
                          </div>
                        )}
                      </Link>
                    ))
                  )}
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}
