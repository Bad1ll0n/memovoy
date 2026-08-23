'use client'

import { useParams, useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import Image from 'next/image'
import Link from 'next/link'
import { MapPin, Calendar, Users, Sparkles, ArrowLeft, ExternalLink, Share2 } from 'lucide-react'
import { api } from '@/lib/api'
import { formatarData } from '@/lib/datas'
import { Avatar } from '@/components/ui/Avatar'
import { Spinner } from '@/components/ui/Spinner'
import { AlertBanner } from '@/components/ui/AlertBanner'

const typeColors: Record<string, string> = {
  visit:     'rgba(71,163,203,0.2)',
  food:      'rgba(252,163,17,0.2)',
  transport: 'rgba(168,85,247,0.18)',
  leisure:   'rgba(34,197,94,0.18)',
  hotel:     'rgba(248,113,113,0.18)',
}
const typeLabels: Record<string, string> = {
  visit: 'Visita', food: 'Refeição', transport: 'Transporte', leisure: 'Lazer', hotel: 'Alojamento',
}

interface Activity {
  time: string; name: string; description: string; address: string | null; type: string; cost: number | null; currency: string
}
interface Day { day: number; date: string; theme: string; activities: Activity[] }
interface Itinerary {
  id: string; title: string; destination: string; country: string; summary: string | null
  totalEstimatedCost: string | null; startDate: string; endDate: string; groupType: string
  coverUrl: string | null; aiGenerated: boolean; days: Day[]
  author: { id: string; username: string; avatarUrl: string | null }
}

export default function SharePage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  const { data: it, isLoading, error } = useQuery<Itinerary>({
    queryKey: ['itinerary-share', id],
    queryFn: () => api.get(`/itineraries/${id}`),
  })

  async function handleShare() {
    const url = window.location.origin + `/itineraries/${id}`
    if (navigator.share) {
      await navigator.share({ title: it?.title ?? 'Roteiro', url }).catch(() => {})
    } else {
      await navigator.clipboard?.writeText(url)
    }
  }

  if (isLoading) return <div className="flex justify-center py-20"><Spinner size="lg" /></div>
  if (error || !it) return (
    <div className="py-8">
      <AlertBanner variant="danger" message="Roteiro não encontrado ou sem permissão de acesso." />
      <button onClick={() => router.back()} className="btn btn-secondary mt-4 gap-1.5">
        <ArrowLeft className="w-4 h-4" /> Voltar
      </button>
    </div>
  )

  return (
    <div style={{ fontFamily: 'var(--font-dm-sans, system-ui)' }}>
      {/* Nav strip */}
      <div className="flex items-center gap-2 mb-6">
        <Link href={`/itineraries/${id}`} className="flex items-center gap-1.5 text-sm" style={{ color: 'var(--text-muted)' }}>
          <ArrowLeft className="w-4 h-4" /> Ver detalhes
        </Link>
        <button
          onClick={handleShare}
          className="ml-auto flex items-center gap-1.5 text-sm btn btn-secondary"
          style={{ fontSize: '0.8rem', padding: '0.4rem 0.875rem' }}
        >
          <Share2 className="w-3.5 h-3.5" /> Partilhar
        </button>
      </div>

      {/* Hero */}
      <div className="relative rounded-3xl overflow-hidden mb-8" style={{ minHeight: 280 }}>
        {it.coverUrl ? (
          <Image src={it.coverUrl} alt={it.title} fill className="object-cover" sizes="760px" priority />
        ) : (
          <div
            className="absolute inset-0"
            style={{ background: 'radial-gradient(ellipse at 30% 60%, rgba(71,163,203,0.35) 0%, transparent 70%), var(--bg-card)' }}
          />
        )}
        <div
          className="absolute inset-0"
          style={{ background: it.coverUrl ? 'linear-gradient(to top, rgba(13,24,36,0.92) 0%, rgba(13,24,36,0.4) 55%, transparent 100%)' : undefined }}
        />
        <div className="relative p-8 flex flex-col justify-end h-full" style={{ minHeight: 280 }}>
          {it.aiGenerated && (
            <span
              className="inline-flex self-start items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium mb-3"
              style={{ background: 'var(--accent-subtle)', border: '1px solid var(--accent-border)', color: 'var(--accent)' }}
            >
              <Sparkles className="w-3 h-3" /> Gerado por IA
            </span>
          )}
          <h1
            className="text-3xl font-black mb-3 leading-tight"
            style={{ fontFamily: 'var(--font-syne, system-ui)', color: '#fff' }}
          >
            {it.title}
          </h1>
          <div className="flex flex-wrap gap-4 text-sm" style={{ color: 'rgba(255,255,255,0.8)' }}>
            {it.destination && (
              <span className="flex items-center gap-1.5">
                <MapPin className="w-4 h-4" /> {it.destination}{it.country ? `, ${it.country}` : ''}
              </span>
            )}
            {it.startDate && (
              <span className="flex items-center gap-1.5">
                <Calendar className="w-4 h-4" />
                {formatarData(it.startDate, 'longo')}{it.endDate ? ` → ${formatarData(it.endDate, 'longo')}` : ''}
              </span>
            )}
            {it.groupType && (
              <span className="flex items-center gap-1.5">
                <Users className="w-4 h-4" /> {it.groupType}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Author */}
      <div className="flex items-center gap-3 mb-6 card p-4">
        <Avatar src={it.author.avatarUrl} name={it.author.username} size="md" />
        <div>
          <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>@{it.author.username}</p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Criador deste roteiro</p>
        </div>
        <Link
          href={`/profile/${it.author.id}`}
          className="ml-auto flex items-center gap-1.5 text-xs"
          style={{ color: 'var(--accent)' }}
        >
          Ver perfil <ExternalLink className="w-3 h-3" />
        </Link>
      </div>

      {/* Summary */}
      {(it.summary || it.totalEstimatedCost) && (
        <div className="card p-5 mb-6">
          {it.summary && <p className="text-sm leading-relaxed mb-2" style={{ color: 'var(--text-secondary)' }}>{it.summary}</p>}
          {it.totalEstimatedCost && (
            <span className="inline-block text-xs font-semibold px-3 py-1 rounded-full" style={{ background: 'rgba(71,163,203,0.12)', color: 'var(--accent)' }}>
              Custo estimado: {it.totalEstimatedCost}
            </span>
          )}
        </div>
      )}

      {/* Days */}
      {it.days.map((day, dayIdx) => (
        <div key={dayIdx} className="mb-8">
          {/* Day header */}
          <div className="flex items-center gap-3 mb-4">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-black shrink-0"
              style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
            >
              {day.day}
            </div>
            <div>
              <p className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>{day.theme}</p>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{day.date}</p>
            </div>
          </div>

          {/* Activities */}
          <div className="flex flex-col gap-3 pl-3" style={{ borderLeft: '2px solid var(--border)' }}>
            {day.activities.map((act, actIdx) => (
              <div
                key={actIdx}
                className="rounded-2xl p-4 ml-3"
                style={{ background: typeColors[act.type] ?? 'var(--surface2)', border: '1px solid var(--border)' }}
              >
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div>
                    <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>{act.time}</span>
                    <p className="font-semibold text-sm mt-0.5" style={{ color: 'var(--text-primary)' }}>{act.name}</p>
                  </div>
                  <span
                    className="text-xs px-2 py-0.5 rounded-full shrink-0"
                    style={{ background: 'rgba(255,255,255,0.08)', color: 'var(--text-muted)' }}
                  >
                    {typeLabels[act.type] ?? act.type}
                  </span>
                </div>
                <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{act.description}</p>
                {act.address && (
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(act.address)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs mt-2 hover:underline"
                    style={{ color: 'var(--accent)' }}
                  >
                    <MapPin className="w-3 h-3 shrink-0" /> {act.address}
                  </a>
                )}
                {act.cost != null && (
                  <p className="text-xs mt-1.5 font-medium" style={{ color: 'var(--text-muted)' }}>
                    ~{act.cost} {act.currency}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* CTA */}
      <div
        className="rounded-2xl p-6 text-center mb-4"
        style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}
      >
        <p className="font-bold mb-1" style={{ color: 'var(--text-primary)' }}>Gostaste deste roteiro?</p>
        <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>Cria o teu próprio ou usa este como base no Memovoy.</p>
        <div className="flex gap-3 justify-center">
          <Link href={`/itineraries/${id}`} className="btn btn-primary gap-1.5 text-sm">
            <Sparkles className="w-4 h-4" /> Ver roteiro completo
          </Link>
          <Link href="/itineraries/new" className="btn btn-secondary text-sm">
            Criar o meu
          </Link>
        </div>
      </div>
    </div>
  )
}
