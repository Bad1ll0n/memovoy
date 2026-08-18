'use client'

import dynamic from 'next/dynamic'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useRequireAuth } from '@/hooks/useRequireAuth'
import { Spinner } from '@/components/ui/Spinner'
import Link from 'next/link'
import { Map } from 'lucide-react'

const WorldMap = dynamic(() => import('@/components/map/WorldMap'), {
  ssr: false,
  loading: () => (
    <div
      className="w-full relative overflow-hidden animate-pulse"
      style={{ height: 400, background: 'var(--surface2)', borderRadius: 12 }}
    >
      {/* Skeleton lat/lon grid lines */}
      {[0.2, 0.4, 0.6, 0.8].map((frac) => (
        <div key={frac} className="absolute left-0 right-0" style={{ top: `${frac * 100}%`, height: 1, background: 'var(--border)', opacity: 0.5 }} />
      ))}
      {[0.15, 0.35, 0.55, 0.75, 0.9].map((frac) => (
        <div key={frac} className="absolute top-0 bottom-0" style={{ left: `${frac * 100}%`, width: 1, background: 'var(--border)', opacity: 0.5 }} />
      ))}
      {/* Skeleton land blobs */}
      <div className="absolute rounded-full" style={{ width: 180, height: 60, top: '28%', left: '18%', background: 'var(--border)', opacity: 0.7 }} />
      <div className="absolute rounded-full" style={{ width: 120, height: 80, top: '25%', left: '52%', background: 'var(--border)', opacity: 0.7 }} />
      <div className="absolute rounded-full" style={{ width: 90,  height: 55, top: '45%', left: '38%', background: 'var(--border)', opacity: 0.6 }} />
      <div className="absolute rounded-full" style={{ width: 70,  height: 40, top: '55%', left: '14%', background: 'var(--border)', opacity: 0.5 }} />
      <div className="absolute rounded-full" style={{ width: 100, height: 65, top: '30%', left: '70%', background: 'var(--border)', opacity: 0.6 }} />
      <div className="absolute inset-0 flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    </div>
  ),
})

interface CountryData {
  countryCode: string
  countryName: string
  count: number
}

interface DestinationItem {
  id: string
  title: string
  destination: string
}

type MapMode = 'world' | 'mine'

export default function MapPage() {
  // Mesma protecção dos irmãos do grupo (app): as APIs de mapa são públicas,
  // mas esta página desenha a interface de utilizador autenticado.
  const { isReady } = useRequireAuth()

  const [selected, setSelected]   = useState<string | null>(null)
  const [mapMode, setMapMode]     = useState<MapMode>('world')

  const { data: worldCountries } = useQuery<CountryData[]>({
    queryKey: ['map-countries'],
    queryFn: () => api.get('/map/countries'),
    enabled: isReady,
  })

  const { data: mineCountries } = useQuery<CountryData[]>({
    queryKey: ['map-mine'],
    queryFn: () => api.get('/map/mine'),
    enabled: isReady && mapMode === 'mine',
  })

  const countries = mapMode === 'mine' ? (mineCountries ?? []) : (worldCountries ?? [])

  const { data: items, isLoading: loadingItems } = useQuery<DestinationItem[]>({
    queryKey: ['map-items', selected],
    queryFn: () => api.get(`/itineraries?country=${encodeURIComponent(selected!)}&limit=5`),
    enabled: isReady && !!selected,
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
          Mapa de Viagens
        </h1>
        <div className="flex gap-1 p-1 rounded-xl" style={{ background: 'var(--surface2)' }}>
          {(['world', 'mine'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => { setMapMode(mode); setSelected(null) }}
              className="text-xs px-3 py-1.5 rounded-lg font-medium transition-all"
              style={{
                background: mapMode === mode ? 'var(--accent)' : 'transparent',
                color:      mapMode === mode ? '#000' : 'var(--text-secondary)',
              }}
            >
              {mode === 'world' ? 'Mundo' : 'O Meu Mapa'}
            </button>
          ))}
        </div>
      </div>

      <WorldMap countries={countries} onSelectCountry={setSelected} />

      {selected && (
        <div className="mt-5">
          <h2 className="font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
            Roteiros em <strong style={{ color: 'var(--accent)' }}>{selected}</strong>
          </h2>
          {loadingItems ? (
            <div className="flex justify-center py-4"><Spinner /></div>
          ) : (items ?? []).length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Ainda sem roteiros para este país.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {items!.map((it) => (
                <Link
                  key={it.id}
                  href={`/itineraries/${it.id}`}
                  className="card p-3 flex items-center gap-3 hover:opacity-90 transition-opacity"
                >
                  <Map className="w-4 h-4 shrink-0" style={{ color: 'var(--accent)' }} />
                  <div>
                    <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                      {it.title}
                    </p>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      {it.destination}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
