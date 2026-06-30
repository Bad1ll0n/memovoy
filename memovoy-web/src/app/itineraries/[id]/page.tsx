// src/app/itineraries/[id]/page.tsx
'use client'

import Link              from 'next/link'
import Image             from 'next/image'
import { useParams }     from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState }      from 'react'
import { api }           from '@/lib/api-client'
import { NavBar }        from '@/components/layout/NavBar'
import { cn, formatDateRange, categoryIcon, formatMoney } from '@/lib/utils'
import type { Itinerary, ItineraryDay, Activity } from '@/types'

export default function ItineraryPage() {
  const { id } = useParams<{ id: string }>()
  const qc     = useQueryClient()

  const { data, isLoading, error } = useQuery({
    queryKey: ['itinerary', id],
    queryFn:  () => api.get<{ itinerary: Itinerary }>(`/itineraries/${id}`),
  })

  const publishMutation = useMutation({
    mutationFn: () => api.post<{ itinerary: Itinerary }>(`/itineraries/${id}/publish`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['itinerary', id] }),
  })

  const itinerary = data?.itinerary

  return (
    <div className="min-h-screen bg-surface-subtle">
      <NavBar />

      {isLoading && (
        <div className="max-w-3xl mx-auto px-4 py-8 space-y-4">
          <div className="skeleton h-64 w-full rounded-xl" />
          <div className="skeleton h-8 w-2/3 rounded" />
          <div className="skeleton h-4 w-1/2 rounded" />
        </div>
      )}

      {error && (
        <div className="max-w-3xl mx-auto px-4 py-16 text-center">
          <p className="text-4xl mb-4">😕</p>
          <h1 className="font-display text-xl font-bold text-ink mb-2">Roteiro não encontrado</h1>
          <Link href="/itineraries" className="btn-secondary text-sm">← Voltar</Link>
        </div>
      )}

      {itinerary && (
        <main className="max-w-3xl mx-auto px-4 py-8 pb-24 md:pb-8 space-y-6">

          {/* Hero */}
          <div className="relative rounded-2xl overflow-hidden">
            {itinerary.coverImageUrl ? (
              <div className="relative h-56 md:h-72">
                <Image
                  src={itinerary.coverImageUrl}
                  alt={itinerary.title}
                  fill
                  className="object-cover"
                  priority
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
              </div>
            ) : (
              <div className="h-56 md:h-72 bg-gradient-to-br from-blue-600 to-blue flex items-center justify-center">
                <div className="text-center text-white">
                  <p className="text-5xl mb-2">✈️</p>
                  <p className="text-xl font-semibold">{itinerary.destinationName}</p>
                </div>
              </div>
            )}

            {/* Badges sobrepostos */}
            <div className="absolute top-3 left-3 flex gap-2">
              {itinerary.status === 'draft' && (
                <span className="px-2.5 py-1 rounded-full bg-amber/90 text-white text-xs font-bold">
                  Rascunho
                </span>
              )}
              {itinerary.aiGenerated && (
                <span className="px-2.5 py-1 rounded-full bg-blue/90 text-white text-xs font-bold">
                  ✨ IA
                </span>
              )}
            </div>
          </div>

          {/* Título e meta */}
          <div className="card p-6 space-y-4">
            <div>
              <h1 className="font-display text-2xl md:text-3xl font-bold text-ink">
                {itinerary.title}
              </h1>
              <div className="flex flex-wrap items-center gap-3 mt-2 text-sm text-ink-secondary">
                <span>📍 {itinerary.destinationName}</span>
                <span>📅 {formatDateRange(itinerary.startDate, itinerary.endDate)}</span>
                <span>🌙 {itinerary.durationDays} dias</span>
                <span>👥 {itinerary.groupType}</span>
              </div>
            </div>

            {/* Carbono */}
            {itinerary.totalKgCo2 != null && (
              <div className="p-4 rounded-xl bg-green/5 border border-green/20 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-green-700 font-semibold">
                    <span>🌱</span>
                    Pegada de carbono
                  </div>
                  <span className="font-display text-xl font-bold text-ink">
                    {Math.round(itinerary.totalKgCo2)} kg CO₂
                  </span>
                </div>
                {itinerary.carbonVsAvgPct != null && (
                  <p className={cn(
                    'text-xs font-medium',
                    itinerary.carbonVsAvgPct < 0 ? 'text-green-600' : 'text-orange-500'
                  )}>
                    {itinerary.carbonVsAvgPct < 0 ? '↓' : '↑'}{' '}
                    {Math.abs(Math.round(itinerary.carbonVsAvgPct))}%{' '}
                    {itinerary.carbonVsAvgPct < 0 ? 'abaixo' : 'acima'} da média para este destino
                  </p>
                )}
              </div>
            )}

            {/* Acções */}
            <div className="flex flex-wrap gap-2 pt-2">
              {itinerary.status === 'draft' && (
                <button
                  onClick={() => publishMutation.mutate()}
                  disabled={publishMutation.isPending}
                  className="btn-primary text-sm"
                >
                  {publishMutation.isPending ? '⏳ A publicar…' : '📢 Publicar roteiro'}
                </button>
              )}
              <Link href={`/itineraries/${id}/expenses`} className="btn-secondary text-sm">
                💳 Gastos
              </Link>
              <Link href={`/itineraries/${id}/packing`} className="btn-secondary text-sm">
                🎒 Packing list
              </Link>
            </div>
          </div>

          {/* Programa por dias */}
          {itinerary.days && itinerary.days.length > 0 && (
            <div className="space-y-4">
              <h2 className="font-display text-xl font-bold text-ink">Programa</h2>
              {itinerary.days.map((day) => (
                <DayCard key={day.id} day={day} />
              ))}
            </div>
          )}
        </main>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// DayCard — accordion
// ---------------------------------------------------------------------------

function DayCard({ day }: { day: ItineraryDay }) {
  const [open, setOpen] = useState(true)

  return (
    <div className="card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-surface-subtle transition-colors"
      >
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-blue bg-blue/8 px-2 py-0.5 rounded-full">
              Dia {day.dayNumber}
            </span>
            {day.theme && (
              <span className="font-semibold text-ink text-sm">{day.theme}</span>
            )}
          </div>
          <p className="text-xs text-ink-tertiary mt-0.5">{day.date}</p>
        </div>
        <span className={cn(
          'text-ink-secondary transition-transform duration-200',
          open ? 'rotate-180' : ''
        )}>
          ▾
        </span>
      </button>

      {open && (
        <div className="border-t border-surface-muted">
          {day.notes && (
            <p className="px-5 py-3 text-sm text-ink-secondary bg-surface-subtle border-b border-surface-muted">
              📝 {day.notes}
            </p>
          )}
          <div className="divide-y divide-surface-muted">
            {day.activities.map((act) => (
              <ActivityRow key={act.id} activity={act} />
            ))}
            {day.activities.length === 0 && (
              <p className="px-5 py-4 text-sm text-ink-tertiary italic">
                Sem actividades neste dia.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function ActivityRow({ activity: act }: { activity: Activity }) {
  return (
    <div className="px-5 py-4 flex gap-4">
      {/* Ícone */}
      <div className="shrink-0 w-10 h-10 rounded-full bg-blue/8 flex items-center justify-center text-lg">
        {categoryIcon(act.category)}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-medium text-ink text-sm leading-snug">{act.name}</h3>
          {act.startTime && (
            <span className="text-xs text-ink-tertiary shrink-0 font-mono">{act.startTime}</span>
          )}
        </div>

        {act.address && (
          <p className="text-xs text-ink-secondary mt-0.5 line-clamp-1">📍 {act.address}</p>
        )}

        <div className="flex flex-wrap items-center gap-3 mt-1.5">
          {act.durationMinutes && (
            <span className="text-xs text-ink-tertiary">⏱ {act.durationMinutes}min</span>
          )}
          {act.priceEstimate != null && (
            <span className="text-xs text-ink-tertiary">
              {act.priceEstimate === 0 ? '🆓 Grátis' : `💶 ${formatMoney(act.priceEstimate)}`}
            </span>
          )}
          {act.aiSuggested && (
            <span className="text-xs text-blue font-medium">✨ IA</span>
          )}
        </div>

        {act.aiWarning && (
          <div className="mt-2 flex items-start gap-1.5 p-2 rounded-lg bg-amber/8 text-amber-700 text-xs">
            <span className="shrink-0">⚠️</span>
            {act.aiWarning}
          </div>
        )}

        {act.notes && (
          <p className="mt-1.5 text-xs text-ink-secondary">{act.notes}</p>
        )}

        {act.bookingUrl && (
          <a
            href={act.bookingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1.5 inline-flex items-center gap-1 text-xs text-blue hover:underline"
          >
            🔗 Reservar
          </a>
        )}
      </div>
    </div>
  )
}
