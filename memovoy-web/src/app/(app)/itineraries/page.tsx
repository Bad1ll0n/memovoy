'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Map, Sparkles, Plus, Bookmark, Eye, Trash2, ExternalLink, Wand2, X, Loader2 } from 'lucide-react'
import { api } from '@/lib/api'
import { useRequireAuth } from '@/hooks/useRequireAuth'
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll'
import { EmptyState } from '@/components/ui/EmptyState'
import { ItineraryGridSkeleton } from '@/components/ui/Skeleton'
import { Spinner } from '@/components/ui/Spinner'

interface ItinerarySummary {
  id: string
  title: string
  destination: string
  startDate: string
  endDate: string
  coverUrl: string | null
  aiGenerated: boolean
  savesCount: number
  viewsCount: number
  daysCount: number
}

interface ItiPage {
  itineraries: ItinerarySummary[]
  nextCursor: string | null
}

interface MoodSuggestion {
  destination: string; country: string; why: string; vibe: string
  estimatedBudget: string; bestSeason: string
}

function MoodModal({ onClose }: { onClose: () => void }) {
  const router = useRouter()
  const [mood, setMood] = useState('')
  const [budget, setBudget] = useState('')
  const [loading, setLoading] = useState(false)
  const [suggestions, setSuggestions] = useState<MoodSuggestion[]>([])
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!mood.trim()) return
    setLoading(true)
    setError('')
    setSuggestions([])
    try {
      const res = await api.post<{ suggestions: MoodSuggestion[] }>('/itineraries/suggest-by-mood', {
        mood: mood.trim(),
        ...(budget ? { budget: Number(budget) } : {}),
      })
      setSuggestions(res.suggestions ?? [])
    } catch {
      setError('Não foi possível gerar sugestões. Tenta novamente.')
    } finally {
      setLoading(false)
    }
  }

  function goCreate(destination: string) {
    onClose()
    router.push(`/itineraries/new?destination=${encodeURIComponent(destination)}`)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      style={{ background: 'rgba(13,24,36,0.85)', backdropFilter: 'blur(6px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="w-full max-w-lg rounded-2xl p-6"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Wand2 className="w-5 h-5" style={{ color: 'var(--accent)' }} />
            <h2 className="font-bold" style={{ color: 'var(--text-primary)' }}>Gerar por Vibe</h2>
          </div>
          <button onClick={onClose} style={{ color: 'var(--text-muted)' }}>
            <X className="w-5 h-5" />
          </button>
        </div>

        {suggestions.length === 0 ? (
          <form onSubmit={handleSubmit}>
            <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
              Descreve o que sentes ou que tipo de viagem te apetece. A IA sugere-te destinos.
            </p>
            <textarea
              value={mood}
              onChange={(e) => setMood(e.target.value)}
              placeholder="Ex: Quero fugir ao stress, sossego, natureza, sem multidões…"
              className="input w-full mb-3 resize-none"
              rows={3}
              maxLength={300}
              required
            />
            <div className="flex gap-3 mb-4">
              <div className="flex-1">
                <label className="label mb-1">Orçamento (€) — opcional</label>
                <input
                  type="number"
                  value={budget}
                  onChange={(e) => setBudget(e.target.value)}
                  placeholder="ex: 1500"
                  className="input w-full"
                  min={0}
                />
              </div>
            </div>
            {error && <p className="text-sm mb-3" style={{ color: 'var(--danger)' }}>{error}</p>}
            <button
              type="submit"
              className="btn btn-primary w-full gap-2"
              disabled={loading || !mood.trim()}
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {loading ? 'A pensar…' : 'Sugerir destinos'}
            </button>
          </form>
        ) : (
          <div>
            <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
              A IA encontrou estes destinos para a tua vibe. Clica num para criar o roteiro.
            </p>
            <div className="flex flex-col gap-3 max-h-[50vh] overflow-y-auto pr-1">
              {suggestions.map((s, i) => (
                <button
                  key={i}
                  onClick={() => goCreate(s.destination)}
                  className="text-left rounded-xl p-4 transition-all hover:opacity-90 active:scale-[0.98]"
                  style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <p className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>
                      {s.destination}, {s.country}
                    </p>
                    <span className="text-xs px-2 py-0.5 rounded-full shrink-0" style={{ background: 'rgba(71,163,203,0.12)', color: 'var(--accent)' }}>
                      {s.vibe}
                    </span>
                  </div>
                  <p className="text-xs mb-2 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{s.why}</p>
                  <div className="flex gap-3 text-xs" style={{ color: 'var(--text-muted)' }}>
                    <span>Melhor época: {s.bestSeason}</span>
                    {s.estimatedBudget && <span>~{s.estimatedBudget}</span>}
                  </div>
                </button>
              ))}
            </div>
            <button
              onClick={() => setSuggestions([])}
              className="btn btn-secondary w-full mt-3 text-sm"
            >
              Tentar outra vibe
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('pt-PT', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
  })
}

function ItineraryCard({ it }: { it: ItinerarySummary }) {
  const router = useRouter()
  const qc = useQueryClient()
  const [confirmDel, setConfirmDel] = useState(false)

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/itineraries/${it.id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-itineraries'] }),
  })

  return (
    <div
      className="card overflow-hidden group relative cursor-pointer"
      onClick={() => router.push(`/itineraries/${it.id}`)}
    >
      {it.coverUrl ? (
        <div className="relative w-full" style={{ height: 160 }}>
          <Image src={it.coverUrl} alt={it.title} fill className="object-cover" sizes="620px" />
        </div>
      ) : (
        <div
          className="w-full flex items-center justify-center"
          style={{
            height: 120,
            background: 'radial-gradient(ellipse at top, var(--accent-subtle) 0%, transparent 70%), var(--surface2)',
          }}
        >
          <Map className="w-10 h-10" style={{ color: 'var(--accent)', opacity: 0.7 }} />
        </div>
      )}

      {/* Hover action overlay */}
      <div
        className="absolute inset-0 flex items-end justify-end p-2 gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
        style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.55) 0%, transparent 55%)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <Link
          href={`/itineraries/${it.id}`}
          className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium"
          style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', backdropFilter: 'blur(4px)' }}
          onClick={(e) => e.stopPropagation()}
        >
          <ExternalLink className="w-3 h-3" />
          Abrir
        </Link>
        {confirmDel ? (
          <div className="flex items-center gap-1">
            <button
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isPending}
              className="px-2 py-1 rounded-lg text-xs font-medium"
              style={{ background: 'var(--danger)', color: 'var(--on-danger)' }}
            >
              {deleteMutation.isPending ? '…' : 'Sim'}
            </button>
            <button
              onClick={() => setConfirmDel(false)}
              className="px-2 py-1 rounded-lg text-xs font-medium"
              style={{ background: 'rgba(255,255,255,0.15)', color: '#fff' }}
            >
              Não
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmDel(true)}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium"
            style={{ background: 'rgba(220,38,38,0.75)', color: '#fff', backdropFilter: 'blur(4px)' }}
          >
            <Trash2 className="w-3 h-3" />
            Eliminar
          </button>
        )}
      </div>

      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-1">
          <h2 className="font-bold text-base leading-tight" style={{ color: 'var(--text-primary)' }}>
            {it.title}
          </h2>
          {it.aiGenerated && (
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium shrink-0"
              style={{
                background: 'var(--accent-subtle)',
                border: '1px solid var(--accent-border)',
                color: 'var(--accent)',
              }}
            >
              <Sparkles className="w-2.5 h-2.5" />
              IA
            </span>
          )}
        </div>
        <p className="text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>
          {it.destination} · {it.daysCount} dias · {formatDate(it.startDate)}
        </p>
        <div className="flex items-center gap-4 text-xs" style={{ color: 'var(--text-muted)' }}>
          <span className="flex items-center gap-1">
            <Bookmark className="w-3 h-3" />
            {it.savesCount}
          </span>
          <span className="flex items-center gap-1">
            <Eye className="w-3 h-3" />
            {it.viewsCount}
          </span>
        </div>
      </div>
    </div>
  )
}

export default function ItinerariesPage() {
  const { isReady } = useRequireAuth()
  const [moodOpen, setMoodOpen] = useState(false)

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteQuery<ItiPage>({
      queryKey: ['my-itineraries'],
      queryFn: ({ pageParam }) =>
        api.get(`/itineraries/mine${pageParam ? `?cursor=${pageParam}` : ''}`),
      initialPageParam: null as string | null,
      getNextPageParam: (last) => last.nextCursor,
      enabled: isReady,
    })

  const handleLoadMore = useCallback(() => fetchNextPage(), [fetchNextPage])
  const sentinelRef = useInfiniteScroll({ hasMore: !!hasNextPage, onLoadMore: handleLoadMore })

  const itineraries = data?.pages.flatMap((p) => p.itineraries) ?? []

  if (!isReady || isLoading) {
    return (
      <div>
        <div className="flex items-center justify-between mb-5">
          <div className="h-7 w-40 rounded-lg animate-pulse" style={{ background: 'var(--skeleton-bg, rgba(255,255,255,0.07))' }} />
          <div className="h-9 w-20 rounded-lg animate-pulse" style={{ background: 'var(--skeleton-bg, rgba(255,255,255,0.07))' }} />
        </div>
        <ItineraryGridSkeleton count={6} />
      </div>
    )
  }

  return (
    <div>
      {moodOpen && <MoodModal onClose={() => setMoodOpen(false)} />}

      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
          Os meus Roteiros
        </h1>
        <div className="flex gap-2">
          <button
            onClick={() => setMoodOpen(true)}
            className="btn btn-secondary text-sm gap-1.5"
            title="Gerar destinos por vibe com IA"
          >
            <Wand2 className="w-4 h-4" />
            Vibe
          </button>
          <Link href="/itineraries/new" className="btn btn-primary text-sm gap-1.5">
            <Plus className="w-4 h-4" />
            Novo
          </Link>
        </div>
      </div>

      {itineraries.length === 0 ? (
        <EmptyState
          illustration="itineraries"
          title="Ainda sem roteiros"
          description="Cria o teu primeiro roteiro com IA ou manualmente."
          action={{ label: 'Criar roteiro', href: '/itineraries/new' }}
        />
      ) : (
        <div className="flex flex-col gap-4">
          {itineraries.map((it) => (
            <ItineraryCard key={it.id} it={it} />
          ))}
        </div>
      )}

      <div ref={sentinelRef} className="h-4 mt-4" />
      {isFetchingNextPage && <div className="flex justify-center py-4"><Spinner /></div>}
      {!hasNextPage && itineraries.length > 0 && <p className="end-of-list">Fim dos roteiros</p>}
    </div>
  )
}
