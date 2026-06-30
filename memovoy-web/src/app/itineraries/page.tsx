// src/app/itineraries/page.tsx
'use client'

import Link                   from 'next/link'
import Image                  from 'next/image'
import { useQuery }           from '@tanstack/react-query'
import { useRouter }          from 'next/navigation'
import { useEffect, useState } from 'react'
import { useAuthStore }       from '@/store/auth'
import { api }                from '@/lib/api-client'
import { NavBar }             from '@/components/layout/NavBar'
import { cn, formatDateRange, groupTypeLabel } from '@/lib/utils'
import type { Itinerary }     from '@/types'

type FilterStatus = 'all' | 'published' | 'draft'

export default function ItinerariesPage() {
  const { isAuthenticated, isHydrated } = useAuthStore()
  const router  = useRouter()
  const [filter, setFilter] = useState<FilterStatus>('all')

  useEffect(() => {
    if (isHydrated && !isAuthenticated) router.replace('/auth/login')
  }, [isHydrated, isAuthenticated, router])

  const { data, isLoading } = useQuery({
    queryKey: ['itineraries', 'mine', filter],
    queryFn:  () => api.get<{ itineraries: Itinerary[] }>('/itineraries/mine', {
      params: { limit: 50, ...(filter !== 'all' ? { status: filter } : {}) },
    }),
    enabled: isAuthenticated,
  })

  const itineraries = data?.itineraries ?? []

  if (!isHydrated || !isAuthenticated) return null

  return (
    <div className="min-h-screen bg-surface-subtle">
      <NavBar />

      <main className="max-w-4xl mx-auto px-4 py-8 pb-24 md:pb-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="font-display text-2xl font-bold text-ink">Os meus roteiros</h1>
            <p className="text-ink-secondary text-sm mt-1">
              {itineraries.length} {itineraries.length === 1 ? 'roteiro' : 'roteiros'}
            </p>
          </div>
          <Link href="/itineraries/new" className="btn-primary text-sm">
            ✨ Novo roteiro
          </Link>
        </div>

        {/* Filtros */}
        <div className="flex gap-2 mb-6 overflow-x-auto scrollbar-hide pb-1">
          {(['all', 'published', 'draft'] as FilterStatus[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                'shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-colors',
                filter === f
                  ? 'bg-blue text-white'
                  : 'bg-surface text-ink-secondary hover:text-ink border border-surface-muted'
              )}
            >
              {{ all: 'Todos', published: 'Publicados', draft: 'Rascunhos' }[f]}
            </button>
          ))}
        </div>

        {/* Lista */}
        {isLoading ? (
          <div className="grid sm:grid-cols-2 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="card overflow-hidden">
                <div className="skeleton aspect-video w-full" />
                <div className="p-4 space-y-2">
                  <div className="skeleton h-4 w-3/4 rounded" />
                  <div className="skeleton h-3 w-1/2 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : itineraries.length === 0 ? (
          <div className="card p-16 text-center space-y-4">
            <p className="text-4xl">🗺</p>
            <p className="font-display text-lg font-bold text-ink">Sem roteiros ainda</p>
            <p className="text-ink-secondary text-sm max-w-xs mx-auto">
              Cria o teu primeiro roteiro com IA em segundos.
            </p>
            <Link href="/itineraries/new" className="btn-primary inline-flex text-sm">
              ✨ Criar com IA
            </Link>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-4">
            {itineraries.map((it) => (
              <ItineraryCard key={it.id} itinerary={it} />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

function ItineraryCard({ itinerary: it }: { itinerary: Itinerary }) {
  const statusConfig: Record<string, { label: string; className: string }> = {
    published: { label: 'Publicado', className: 'bg-green/10 text-green-700' },
    draft:     { label: 'Rascunho',  className: 'bg-amber/10 text-amber-700' },
    archived:  { label: 'Arquivado', className: 'bg-surface-muted text-ink-secondary' },
  }
  const sc = statusConfig[it.status] ?? statusConfig.draft

  return (
    <Link
      href={`/itineraries/${it.id}`}
      className="card overflow-hidden hover:shadow-card-md transition-shadow group"
    >
      {/* Cover */}
      <div className="relative aspect-video bg-blue/8 overflow-hidden">
        {it.coverImageUrl ? (
          <Image
            src={it.coverImageUrl} alt={it.title} fill
            className="object-cover group-hover:scale-105 transition-transform duration-500"
            sizes="(max-width: 640px) 100vw, 50vw"
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-blue/40">
            <span className="text-4xl">✈️</span>
            <p className="text-sm font-medium mt-2">{it.destinationName}</p>
          </div>
        )}
        {/* Badges sobre a imagem */}
        <div className="absolute top-2 left-2 flex gap-1.5">
          <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full', sc.className)}>
            {sc.label}
          </span>
          {it.aiGenerated && (
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue/10 text-blue">
              ✨ IA
            </span>
          )}
        </div>
      </div>

      {/* Info */}
      <div className="p-4 space-y-2">
        <h3 className="font-semibold text-ink line-clamp-2 group-hover:text-blue transition-colors">
          {it.title}
        </h3>
        <div className="flex items-center gap-3 text-xs text-ink-secondary">
          <span>📍 {it.destinationName}</span>
          <span>🗓 {it.durationDays}d</span>
          <span>{groupTypeLabel(it.groupType)}</span>
        </div>
        {it.startDate && (
          <p className="text-xs text-ink-tertiary">
            {formatDateRange(it.startDate, it.endDate)}
          </p>
        )}
        {it.totalKgCo2 != null && (
          <p className="text-xs text-green-700 flex items-center gap-1">
            🌱 {Math.round(it.totalKgCo2)} kg CO₂
            {it.carbonVsAvgPct != null && (
              <span className={it.carbonVsAvgPct < 0 ? 'text-green-600' : 'text-orange-500'}>
                ({it.carbonVsAvgPct > 0 ? '+' : ''}{Math.round(it.carbonVsAvgPct)}% vs média)
              </span>
            )}
          </p>
        )}
        <div className="flex items-center justify-between pt-1 text-xs text-ink-tertiary">
          <span>🔖 {it.savesCount} · 👁 {it.viewsCount}</span>
        </div>
      </div>
    </Link>
  )
}
