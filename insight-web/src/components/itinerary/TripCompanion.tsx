'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CloudRain, Sun, Cloud, CloudSnow, Zap, Wind, Thermometer, Wand2, RefreshCw } from 'lucide-react'
import { api } from '@/lib/api'
import { Spinner } from '@/components/ui/Spinner'

interface WeatherDay {
  date: string
  code: number
  tempMax: number
  tempMin: number
  precip: number
  isAlert: boolean
}

interface Activity {
  time: string
  name: string
  description: string
  address: string | null
  geoName?: string | null
  cost: number | null
  currency: string
  type: string
  tips: string | null
}

interface Props {
  itineraryId: string
  activeDay: number
  activeDate: string
  isOwner: boolean
  onActivitiesAdapted: (dayIndex: number, activities: Activity[]) => void
}

function weatherIcon(code: number) {
  if (code >= 95) return <Zap className="w-4 h-4" />
  if (code >= 71) return <CloudSnow className="w-4 h-4" />
  if (code >= 51) return <CloudRain className="w-4 h-4" />
  if (code >= 45) return <Wind className="w-4 h-4" />
  if (code >= 3)  return <Cloud className="w-4 h-4" />
  return <Sun className="w-4 h-4" />
}

function weatherLabel(code: number) {
  if (code >= 95) return 'Trovoada'
  if (code >= 80) return 'Aguaceiros'
  if (code >= 71) return 'Neve'
  if (code >= 61) return 'Chuva'
  if (code >= 51) return 'Chuviscos'
  if (code >= 45) return 'Nevoeiro'
  if (code >= 3)  return 'Nublado'
  return 'Sol'
}

function alertColor(code: number) {
  if (code >= 95) return { bg: 'rgba(220,38,38,0.1)', color: '#dc2626', border: 'rgba(220,38,38,0.2)' }
  if (code >= 61) return { bg: 'rgba(59,130,246,0.1)', color: '#3b82f6', border: 'rgba(59,130,246,0.2)' }
  if (code >= 45) return { bg: 'rgba(156,163,175,0.1)', color: 'var(--text-secondary)', border: 'rgba(156,163,175,0.15)' }
  return { bg: 'rgba(252,211,77,0.08)', color: '#d97706', border: 'rgba(252,211,77,0.15)' }
}

export function TripCompanion({ itineraryId, activeDay, activeDate, isOwner, onActivitiesAdapted }: Props) {
  const [adapting, setAdapting] = useState(false)
  const [adapted, setAdapted]   = useState(false)
  const [adaptError, setAdaptError] = useState('')

  const { data, isLoading } = useQuery<{ weather: WeatherDay[] }>({
    queryKey: ['companion-weather', itineraryId],
    queryFn: () => api.get(`/itineraries/${itineraryId}/companion`),
    staleTime: 30 * 60 * 1000,
  })

  const todayWeather = data?.weather?.find((w) => w.date === activeDate)

  if (isLoading) return null
  if (!todayWeather) return null

  const colors = alertColor(todayWeather.code)

  async function handleAdapt() {
    setAdapting(true)
    setAdaptError('')
    try {
      const { activities } = await api.post<{ activities: Activity[] }>(
        `/itineraries/${itineraryId}/companion/adapt`,
        {
          dayIndex:    activeDay,
          weatherCode: todayWeather!.code,
          tempMax:     todayWeather!.tempMax,
          tempMin:     todayWeather!.tempMin,
        },
      )
      onActivitiesAdapted(activeDay, activities)
      setAdapted(true)
    } catch (err: unknown) {
      setAdaptError(err instanceof Error ? err.message : 'Erro ao adaptar o dia.')
    } finally {
      setAdapting(false)
    }
  }

  return (
    <div
      className="flex items-center gap-3 px-4 py-3 rounded-2xl mb-4 flex-wrap"
      style={{ background: colors.bg, border: `1px solid ${colors.border}` }}
    >
      {/* Weather icon + info */}
      <div className="flex items-center gap-2 shrink-0" style={{ color: colors.color }}>
        {weatherIcon(todayWeather.code)}
        <span className="text-sm font-medium">{weatherLabel(todayWeather.code)}</span>
      </div>

      <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
        <Thermometer className="w-3 h-3 shrink-0" />
        <span>{todayWeather.tempMin}–{todayWeather.tempMax}°C</span>
        {todayWeather.precip > 0 && (
          <>
            <span>·</span>
            <CloudRain className="w-3 h-3 shrink-0" />
            <span>{todayWeather.precip} mm</span>
          </>
        )}
      </div>

      {/* Adapt button — owner + bad weather */}
      {isOwner && todayWeather.isAlert && (
        <div className="flex items-center gap-2 ml-auto">
          {adaptError && (
            <span className="text-xs" style={{ color: 'var(--danger)' }}>{adaptError}</span>
          )}
          {adapted ? (
            <span className="text-xs font-medium" style={{ color: 'var(--accent)' }}>
              Dia adaptado ✓
            </span>
          ) : (
            <button
              onClick={handleAdapt}
              disabled={adapting}
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-xl transition-opacity hover:opacity-80"
              style={{ background: colors.bg, border: `1px solid ${colors.border}`, color: colors.color }}
            >
              {adapting ? <Spinner size="sm" /> : adapted ? <RefreshCw className="w-3 h-3" /> : <Wand2 className="w-3 h-3" />}
              {adapting ? 'A adaptar…' : 'Adaptar com IA'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
