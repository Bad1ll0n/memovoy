'use client'

import { useState, useCallback, useRef } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  MapPin, Calendar, Globe, Users, Bookmark, Share2, Trash2,
  ChevronLeft, Sparkles, Pencil, X, Download, GitFork, Leaf, Plus,
} from 'lucide-react'
import { api } from '@/lib/api'
import { formatarData } from '@/lib/datas'
import { useAuthStore } from '@/store/authStore'
import { Spinner } from '@/components/ui/Spinner'
import { AlertBanner } from '@/components/ui/AlertBanner'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import { ExpensesPanel } from '@/components/itinerary/ExpensesPanel'
import { PackingPanel } from '@/components/itinerary/PackingPanel'
import { ItineraryComments } from '@/components/itinerary/ItineraryComments'
import { CollaboratorsPanel } from '@/components/itinerary/CollaboratorsPanel'
import { ItineraryRefinement } from '@/components/itinerary/ItineraryRefinement'
import { ItineraryReactions } from '@/components/itinerary/ItineraryReactions'
import { ItineraryLineage } from '@/components/itinerary/ItineraryLineage'
import { useSalaDoRoteiro } from '@/hooks/useSalaDoRoteiro'
import { AiEditModal } from '@/components/itinerary/AiEditModal'
import { type Activity, type Day, type EditTarget } from '@/components/itinerary/actividade'
import { VistaDosDias } from '@/components/itinerary/VistaDosDias'


// ─── Types ───────────────────────────────────────────────────────────────────



interface LocalPhrase {
  local: string
  translation: string
}

interface Tips {
  safetyTips: string[]
  transportTips: string[]
  budgetHacks: string[]
  mustTry: string[]
  avoid: string[]
  localPhrases?: LocalPhrase[]
}

interface Itinerary {
  id: string
  title: string
  destination: string
  country: string
  continent: string
  language: string
  currency: string
  timezone: string
  bestTimeToVisit: string
  quickFacts: string[]
  summary: string | null
  totalEstimatedCost: string | null
  groupType: string
  travelStyle: string[]
  startDate: string
  endDate: string
  budget: number
  aiGenerated: boolean
  days: Day[]
  tips: Tips | null
  savesCount: number
  viewsCount: number
  viewerSaved: boolean
  createdAt: string
  author: { id: string; username: string; avatarUrl: string | null }
}



// ─── Manual Activity Modal (add / edit) ──────────────────────────────────────

interface ManualTarget {
  mode: 'add' | 'edit'
  dayIndex: number
  activityIndex?: number
  activity?: Activity
}

function ManualActivityModal({
  target,
  itineraryId,
  itineraryCurrency,
  existingActivities,
  onClose,
  onSaved,
}: {
  target: ManualTarget
  itineraryId: string
  itineraryCurrency: string
  existingActivities: Activity[]
  onClose: () => void
  onSaved: (activities: Activity[]) => void
}) {
  const isEdit = target.mode === 'edit'
  const pre    = target.activity

  const [time,        setTime]        = useState(pre?.time ?? '')
  const [name,        setName]        = useState(pre?.name ?? '')
  const [type,        setType]        = useState<Activity['type']>(pre?.type ?? 'visit')
  const [description, setDescription] = useState(pre?.description ?? '')
  const [address,     setAddress]     = useState(pre?.address ?? '')
  const [cost,        setCost]        = useState(pre?.cost != null ? String(pre.cost) : '')
  const [tips,        setTips]        = useState(pre?.tips ?? '')
  const [saving,      setSaving]      = useState(false)
  const [error,       setError]       = useState('')

  const conflictActivity = existingActivities.find((a, i) => {
    if (isEdit && i === target.activityIndex) return false
    return a.time === time
  })

  async function handleSubmit() {
    if (!time || !name.trim() || !description.trim()) {
      setError('Hora, nome e descrição são obrigatórios.')
      return
    }
    setSaving(true)
    setError('')
    try {
      const activity: Activity = {
        time:        time,
        name:        name.trim(),
        description: description.trim(),
        address:     address.trim() || null,
        geoName:     null,
        cost:        cost !== '' ? Number(cost) : null,
        currency:    itineraryCurrency,
        type,
        tips:        tips.trim() || null,
      }

      if (isEdit) {
        await api.patch(`/itineraries/${itineraryId}/activity`, {
          dayIndex:      target.dayIndex,
          activityIndex: target.activityIndex,
          activity,
        })
        onSaved(existingActivities.map((a, i) => i === target.activityIndex ? activity : a))
      } else {
        const result = await api.post<{ activities: Activity[] }>(`/itineraries/${itineraryId}/activity`, {
          dayIndex: target.dayIndex,
          activity,
        })
        onSaved(result.activities)
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao guardar.')
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[1100] flex items-end sm:items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="w-full max-w-lg rounded-2xl p-5 space-y-4 max-h-[92vh] overflow-y-auto"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Pencil className="w-4 h-4" style={{ color: 'var(--accent)' }} />
            <h2 className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>
              {isEdit ? 'Editar actividade' : 'Nova actividade'}
            </h2>
          </div>
          <button onClick={onClose} className="btn btn-ghost p-1"><X className="w-4 h-4" /></button>
        </div>

        <div>
          <label className="label">Hora *</label>
          <input
            type="time"
            className="input"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            disabled={saving}
          />
          {conflictActivity && (
            <p className="text-xs mt-1" style={{ color: 'var(--warning, #f59e0b)' }}>
              Já existe “{conflictActivity.name}” às {time}. Podes continuar — as actividades ficam ordenadas cronologicamente.
            </p>
          )}
        </div>

        <div>
          <label className="label">Nome *</label>
          <input
            type="text"
            className="input"
            placeholder="Ex: Visita ao Museu Nacional"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={200}
            disabled={saving}
          />
        </div>

        <div>
          <label className="label">Tipo</label>
          <select
            className="input"
            value={type}
            onChange={(e) => setType(e.target.value as Activity['type'])}
            disabled={saving}
          >
            <option value="visit">Visita</option>
            <option value="food">Refeição</option>
            <option value="transport">Transporte</option>
            <option value="leisure">Lazer</option>
            <option value="hotel">Alojamento</option>
          </select>
        </div>

        <div>
          <label className="label">Descrição *</label>
          <textarea
            className="input resize-none"
            rows={2}
            placeholder="Breve descrição da actividade…"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={500}
            disabled={saving}
          />
        </div>

        <div>
          <label className="label">
            Morada / Local{' '}
            <span className="font-normal" style={{ color: 'var(--text-muted)' }}>(opcional)</span>
          </label>
          <input
            type="text"
            className="input"
            placeholder="Ex: Praça do Comércio, Lisboa"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            maxLength={300}
            disabled={saving}
          />
        </div>

        <div>
          <label className="label">
            Custo em {itineraryCurrency}{' '}
            <span className="font-normal" style={{ color: 'var(--text-muted)' }}>(opcional)</span>
          </label>
          <input
            type="number"
            className="input"
            placeholder="0"
            min="0"
            step="0.01"
            value={cost}
            onChange={(e) => setCost(e.target.value)}
            disabled={saving}
          />
        </div>

        <div>
          <label className="label">
            Dica{' '}
            <span className="font-normal" style={{ color: 'var(--text-muted)' }}>(opcional)</span>
          </label>
          <input
            type="text"
            className="input"
            placeholder="Ex: Reserva com antecedência…"
            value={tips}
            onChange={(e) => setTips(e.target.value)}
            maxLength={300}
            disabled={saving}
          />
        </div>

        {error && <AlertBanner variant="danger" message={error} />}

        <div className="flex gap-2 pt-1">
          <button className="btn btn-secondary flex-1" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button className="btn btn-primary flex-1 gap-2" onClick={handleSubmit} disabled={saving}>
            {saving && <Spinner size="sm" />}
            {isEdit ? 'Guardar' : 'Adicionar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Sortable activity card ───────────────────────────────────────────────────

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ItineraryClient() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuthStore()
  const qc     = useQueryClient()
  const router = useRouter()
  const [activeDay, setActiveDay]                   = useState(0)
  const [editTarget, setEditTarget]                 = useState<EditTarget | null>(null)
  const [manualTarget, setManualTarget]             = useState<ManualTarget | null>(null)
  const [activityDeleteTarget, setActivityDeleteTarget] = useState<{ dayIndex: number; activityIndex: number; name: string } | null>(null)
  const [deleteOpen, setDeleteOpen]                 = useState(false)
  const [refinedDays, setRefinedDays]               = useState<Day[] | null>(null)
  const reorderTimer = useRef<ReturnType<typeof setTimeout> | null>(null)


  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/itineraries/${id}`),
    onSuccess: () => router.replace('/itineraries'),
  })

  const deleteActivityMutation = useMutation({
    mutationFn: ({ dayIndex, activityIndex }: { dayIndex: number; activityIndex: number }) =>
      api.delete(`/itineraries/${id}/activity?dayIndex=${dayIndex}&activityIndex=${activityIndex}`),
    onSuccess: (_, { dayIndex, activityIndex }) => {
      qc.setQueryData<Itinerary>(['itinerary', id], (old) => {
        if (!old) return old
        return {
          ...old,
          days: old.days.map((d, di) =>
            di === dayIndex
              ? { ...d, activities: d.activities.filter((_, ai) => ai !== activityIndex) }
              : d,
          ),
        }
      })
      qc.invalidateQueries({ queryKey: ['itinerary-checkins', id] })
      setActivityDeleteTarget(null)
    },
  })

  const reorderMutation = useMutation({
    mutationFn: ({ dayIndex, activities }: { dayIndex: number; activities: Activity[] }) =>
      api.patch(`/itineraries/${id}/reorder`, { dayIndex, activities }),
  })

  // Sincroniza com o que os outros colaboradores alteram, em tempo real.
  useSalaDoRoteiro(id)

  const { data: it, isLoading, error } = useQuery<Itinerary>({
    queryKey: ['itinerary', id],
    queryFn: () => api.get(`/itineraries/${id}`),
  })

  const { data: checkinsData } = useQuery<{ checkins: { dayIndex: number; activityIndex: number }[] }>({
    queryKey: ['itinerary-checkins', id],
    queryFn:  () => api.get(`/itineraries/${id}/checkins`),
    enabled:  !!user,
  })

  const checkinSet = new Set(
    (checkinsData?.checkins ?? []).map((c) => `${c.dayIndex}:${c.activityIndex}`),
  )

  const { data: carbonData } = useQuery<{
    totalKgCO2: number
    breakdown: { label: string; kgCO2: number }[]
    treesEquivalent: number
    carKmEquivalent: number
    offsetTip: string
  }>({
    queryKey: ['itinerary-carbon', id],
    queryFn: () => api.get(`/itineraries/${id}/carbon`),
    enabled: !!it,
    staleTime: Infinity,
  })

  const checkinMutation = useMutation({
    mutationFn: ({ dayIndex, activityIndex, activityName, destination, checked }: {
      dayIndex: number; activityIndex: number; activityName: string; destination: string; checked: boolean
    }) =>
      checked
        ? api.delete(`/itineraries/${id}/checkin?dayIndex=${dayIndex}&activityIndex=${activityIndex}`)
        : api.post(`/itineraries/${id}/checkin`, { dayIndex, activityIndex, activityName, destination }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['itinerary-checkins', id] }),
  })

  const saveMutation = useMutation({
    mutationFn: () =>
      it?.viewerSaved
        ? api.delete(`/bookmarks/itinerary/${id}`)
        : api.post('/bookmarks', { itineraryId: id }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['itinerary', id] }),
  })

  const forkMutation = useMutation({
    mutationFn: () => api.post<{ id: string }>(`/itineraries/${id}/fork`),
    onSuccess: (data) => router.push(`/itineraries/${data.id}`),
  })

  // A VistaDosDias já faz o arrasto e entrega a lista na ordem nova; aqui só
  // fica o que é desta página: pintar o resultado já e gravar com atraso.
  const handleReorder = useCallback((dayIndex: number, reordered: Activity[]) => {
    qc.setQueryData<Itinerary>(['itinerary', id], (old) => {
      if (!old) return old
      return { ...old, days: old.days.map((d, di) => (di === dayIndex ? { ...d, activities: reordered } : d)) }
    })

    // Com atraso, porque arrastar três actividades seguidas são três pedidos
    // por uma decisão só. O índice do dia é capturado agora, não quando o
    // temporizador disparar — a essa altura o utilizador já pode ter mudado.
    if (reorderTimer.current) clearTimeout(reorderTimer.current)
    reorderTimer.current = setTimeout(
      () => reorderMutation.mutate({ dayIndex, activities: reordered }),
      500,
    )
  }, [id, qc, reorderMutation])

  const handleManualSave = useCallback((activities: Activity[]) => {
    if (!manualTarget) return
    const dayIndex = manualTarget.dayIndex
    qc.setQueryData<Itinerary>(['itinerary', id], (old) => {
      if (!old) return old
      return { ...old, days: old.days.map((d, di) => di === dayIndex ? { ...d, activities } : d) }
    })
    if (manualTarget.mode === 'add') {
      qc.invalidateQueries({ queryKey: ['itinerary-checkins', id] })
    }
    setManualTarget(null)
  }, [manualTarget, id, qc])

  const handleAcceptEdit = useCallback((
    activity: Activity,
    ctx: { feedback: string; originalActivity: Activity },
  ) => {
    if (!editTarget || !it) return
    qc.setQueryData<Itinerary>(['itinerary', id], (old) => {
      if (!old) return old
      const days = old.days.map((d, di) => {
        if (di !== editTarget.dayIndex) return d
        return {
          ...d,
          activities: d.activities.map((a, ai) => (ai === editTarget.activityIndex ? activity : a)),
        }
      })
      return { ...old, days }
    })
    api.post('/itineraries/activity-feedback', {
      itineraryId: id,
      destination: it.destination,
      originalName: ctx.originalActivity.name,
      feedback: ctx.feedback,
      chosenName: activity.name,
      chosenActivity: activity,
    }).catch(() => {})
    setEditTarget(null)
  }, [editTarget, it, id, qc])

  if (isLoading) {
    return <div className="flex justify-center py-16"><Spinner size="lg" /></div>
  }

  if (error || !it) {
    return (
      <div className="py-8">
        <AlertBanner variant="danger" message="Roteiro não encontrado ou erro ao carregar." />
        <Link href="/itineraries" className="btn btn-secondary mt-4 inline-flex gap-1.5">
          <ChevronLeft className="w-4 h-4" /> Voltar
        </Link>
      </div>
    )
  }

  const days = refinedDays ?? it.days
  const currentDay = days[activeDay]
  const isOwner = user?.id === it.author.id

  // Map pins for the current day

  return (
    <div style={{ fontFamily: 'var(--font-dm-sans, var(--font-poppins, system-ui))' }}>
      {/* Hero */}
      <div
        className="relative rounded-2xl overflow-hidden mb-6 p-8 text-white"
        style={{
          background: 'radial-gradient(ellipse at top, var(--accent-border) 0%, transparent 60%), var(--bg-card)',
          minHeight: 220,
        }}
      >
        {it.aiGenerated && (
          <div
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium mb-4"
            style={{
              background: 'var(--accent-subtle)',
              border: '1px solid var(--accent-border)',
              color: 'var(--accent)',
            }}
          >
            <Sparkles className="w-3 h-3" />
            Gerado por IA
          </div>
        )}

        <h1
          className="text-3xl font-black mb-2 leading-tight"
          style={{
            fontFamily: 'var(--font-syne, var(--font-poppins, system-ui))',
            fontWeight: 800,
            background: 'linear-gradient(135deg, #fff 30%, var(--accent))',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
        >
          {it.title}
        </h1>

        <div className="flex flex-wrap gap-3 text-sm mt-3">
          {it.destination && (
            <span className="flex items-center gap-1.5" style={{ color: 'var(--text-secondary)' }}>
              <MapPin className="w-3.5 h-3.5" />
              {it.destination}{it.country ? `, ${it.country}` : ''}
            </span>
          )}
          {it.startDate && (
            <span className="flex items-center gap-1.5" style={{ color: 'var(--text-secondary)' }}>
              <Calendar className="w-3.5 h-3.5" />
              {formatarData(it.startDate)}{it.endDate ? ` → ${formatarData(it.endDate)}` : ''}
            </span>
          )}
          {it.continent && (
            <span className="flex items-center gap-1.5" style={{ color: 'var(--text-secondary)' }}>
              <Globe className="w-3.5 h-3.5" />
              {it.continent}
            </span>
          )}
          {it.groupType && (
            <span className="flex items-center gap-1.5" style={{ color: 'var(--text-secondary)' }}>
              <Users className="w-3.5 h-3.5" />
              {it.groupType}
            </span>
          )}
        </div>

        <div className="flex gap-2 mt-5">
          <button
            className={`btn gap-1.5 text-sm ${it.viewerSaved ? 'btn-secondary' : 'btn-primary'}`}
            style={{ fontSize: '0.8rem', padding: '0.4rem 0.875rem' }}
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
          >
            <Bookmark className="w-3.5 h-3.5" fill={it.viewerSaved ? 'currentColor' : 'none'} />
            {it.viewerSaved ? 'Guardado' : 'Guardar'}
            <span className="opacity-70">({it.savesCount})</span>
          </button>
          <Link
            href={`/itineraries/${it.id}/share`}
            className="btn btn-secondary gap-1.5 text-sm"
            style={{ fontSize: '0.8rem', padding: '0.4rem 0.875rem' }}
          >
            <Share2 className="w-3.5 h-3.5" />
            Partilhar
          </Link>

          <a
            href={`${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'}/itineraries/${it.id}/export.ics`}
            download
            className="btn btn-secondary gap-1.5 text-sm"
            style={{ fontSize: '0.8rem', padding: '0.4rem 0.875rem' }}
            title="Exportar para calendário (.ics)"
          >
            <Download className="w-3.5 h-3.5" />
            .ics
          </a>

          {!isOwner && (
            <button
              className="btn btn-secondary gap-1.5 text-sm"
              style={{ fontSize: '0.8rem', padding: '0.4rem 0.875rem' }}
              onClick={() => forkMutation.mutate()}
              disabled={forkMutation.isPending}
              title="Cria uma cópia deste roteiro no teu perfil para editar"
            >
              {forkMutation.isPending ? <Spinner size="sm" /> : <GitFork className="w-3.5 h-3.5" />}
              Usar como base
            </button>
          )}

          {isOwner && (
            <button
              className="btn btn-secondary gap-1.5 text-sm ml-auto"
              style={{ fontSize: '0.8rem', padding: '0.4rem 0.875rem', color: 'var(--danger)' }}
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 className="w-3.5 h-3.5" />
              Eliminar
            </button>
          )}
        </div>
      </div>

      {/* Reactions */}
      <ItineraryReactions itineraryId={it.id} />

      {/* AI Summary */}
      {it.summary && (
        <div className="card p-4 mb-4">
          <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            {it.summary}
          </p>
          {it.totalEstimatedCost && (
            <p className="text-xs font-semibold mt-2" style={{ color: 'var(--accent)' }}>
              Custo estimado: {it.totalEstimatedCost}
            </p>
          )}
        </div>
      )}

      {/* Carbon footprint */}
      {carbonData && (
        <div className="card p-4 mb-4">
          <div className="flex items-center gap-2 mb-3">
            <Leaf className="w-4 h-4" style={{ color: 'var(--success)' }} />
            <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
              Pegada de Carbono
            </h3>
          </div>
          <div className="flex items-end gap-3 mb-3">
            <span className="text-2xl font-black" style={{ color: 'var(--text-primary)' }}>
              {carbonData.totalKgCO2.toFixed(0)}
            </span>
            <span className="text-sm mb-0.5" style={{ color: 'var(--text-muted)' }}>kg CO₂</span>
          </div>
          <div className="flex flex-wrap gap-3 mb-3 text-xs" style={{ color: 'var(--text-secondary)' }}>
            <span>≈ {carbonData.treesEquivalent} árvore{carbonData.treesEquivalent !== 1 ? 's' : ''} para compensar</span>
            <span>≈ {carbonData.carKmEquivalent} km de carro</span>
          </div>
          {carbonData.breakdown.length > 0 && (
            <div className="flex flex-col gap-1 mb-3">
              {carbonData.breakdown.map((b) => (
                <div key={b.label} className="flex items-center gap-2">
                  <div className="h-1.5 rounded-full" style={{
                    width: `${Math.min(100, (b.kgCO2 / carbonData.totalKgCO2) * 100)}%`,
                    background: 'var(--success)',
                    opacity: 0.6,
                    minWidth: 4,
                  }} />
                  <span className="text-xs" style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                    {b.label} — {b.kgCO2.toFixed(0)} kg
                  </span>
                </div>
              ))}
            </div>
          )}
          <p className="text-xs italic" style={{ color: 'var(--text-muted)' }}>{carbonData.offsetTip}</p>
        </div>
      )}

      {/* Fork lineage */}
      <ItineraryLineage itineraryId={it.id} />

      {/* Quick facts */}
      {it.quickFacts?.length > 0 && (
        <div className="card p-4 mb-4">
          <h3 className="text-sm font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
            Factos rápidos
          </h3>
          <ul className="flex flex-col gap-1">
            {it.quickFacts.map((f, i) => (
              <li key={i} className="flex items-start gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                <span style={{ color: 'var(--accent)' }}>•</span>
                {f}
              </li>
            ))}
          </ul>
        </div>
      )}

      <VistaDosDias
        roteiroId={id}
        dias={days}
        diaActivo={activeDay}
        aoMudarDeDia={setActiveDay}
        podeEditar={isOwner}
        checkins={checkinSet}
        aoReordenar={handleReorder}
        aoSubstituirComIa={(dayIndex, activityIndex, activity) => setEditTarget({ dayIndex, activityIndex, activity })}
        aoEditarManualmente={(dayIndex, activityIndex, activity) => setManualTarget({ mode: 'edit', dayIndex, activityIndex, activity })}
        aoEliminar={(dayIndex, activityIndex, activity) => setActivityDeleteTarget({ dayIndex, activityIndex, name: activity.name })}
        aoMarcarVisitado={(dayIndex, activityIndex, activity) => checkinMutation.mutate({
          dayIndex, activityIndex,
          activityName: activity.name, destination: it?.destination ?? '',
          checked: checkinSet.has(`${dayIndex}:${activityIndex}`),
        })}
        aoAdaptarActividades={(dayIdx, activities) => {
          setRefinedDays((prev) => {
            const base = prev ?? it.days
            return base.map((d, i) => i === dayIdx ? { ...d, activities } : d) as Day[]
          })
        }}
      />

      {/* Add activity button — owner only */}
      {isOwner && currentDay && (
        <button
          className="btn btn-secondary gap-2 w-full mt-3 text-sm"
          onClick={() => setManualTarget({ mode: 'add', dayIndex: activeDay })}
        >
          <Plus className="w-4 h-4" />
          Adicionar actividade ao Dia {currentDay.day}
        </button>
      )}

      {/* Tips section */}
      {it.tips && (
        <div className="mt-8 mb-4">
          <h2 className="font-bold text-lg mb-4" style={{ color: 'var(--text-primary)' }}>
            Dicas da IA
          </h2>
          {[
            { label: 'Segurança',  items: it.tips.safetyTips },
            { label: 'Transporte', items: it.tips.transportTips },
            { label: 'Orçamento',  items: it.tips.budgetHacks },
            { label: 'Não percas', items: it.tips.mustTry },
            { label: 'Evita',      items: it.tips.avoid },
          ].filter((s) => s.items?.length).map((section) => (
            <div key={section.label} className="card p-4 mb-3">
              <h3 className="text-sm font-bold mb-2" style={{ color: 'var(--accent)' }}>
                {section.label}
              </h3>
              <ul className="flex flex-col gap-1">
                {section.items.map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                    <span style={{ color: 'var(--accent)' }} className="mt-0.5">→</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {/* Local phrases — retrocompat: only show if present */}
      {it.tips?.localPhrases && it.tips.localPhrases.length > 0 && (
        <div className="card p-4 mb-3">
          <h3 className="text-sm font-bold mb-3" style={{ color: 'var(--accent)' }}>
            Frases Úteis
          </h3>
          <div className="flex flex-col gap-2">
            {it.tips.localPhrases.map((p, i) => (
              <div key={i} className="flex items-center justify-between gap-4">
                <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                  {p.local}
                </span>
                <span className="text-xs text-right" style={{ color: 'var(--text-muted)' }}>
                  {p.translation}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Expenses + Packing — owner only */}
      {isOwner && (
        <div className="mt-2">
          <ExpensesPanel
            itineraryId={id}
            budget={it.budget ?? null}
            currency={it.currency || 'EUR'}
            isOwner={isOwner}
          />
          <PackingPanel itineraryId={id} isOwner={isOwner} />
          <CollaboratorsPanel
            itineraryId={id}
            isOwner={isOwner}

            ownerUsername={it.author.username}
          />
        </div>
      )}

      {/* Conversational refinement — owner only */}
      {isOwner && (
        <ItineraryRefinement
          itineraryId={id}
          onDaysUpdated={(updatedDays) => setRefinedDays(updatedDays as Day[])}
        />
      )}

      {/* Comments section */}
      <ItineraryComments itineraryId={id} />

      {/* AI Edit Modal */}
      {editTarget && (
        <AiEditModal
          target={editTarget}
          itineraryId={id}
          onClose={() => setEditTarget(null)}
          onAccept={handleAcceptEdit}
        />
      )}

      {/* Manual Add / Edit Modal */}
      {manualTarget && (
        <ManualActivityModal
          target={manualTarget}
          itineraryId={id}
          itineraryCurrency={it.currency || 'EUR'}
          existingActivities={(refinedDays ?? it.days)[manualTarget.dayIndex]?.activities ?? []}
          onClose={() => setManualTarget(null)}
          onSaved={handleManualSave}
        />
      )}

      {/* Delete itinerary confirm */}
      <ConfirmModal
        open={deleteOpen}
        title="Eliminar roteiro"
        description={`Tens a certeza que queres eliminar "${it.title}"? Esta acção é permanente e não pode ser desfeita.`}
        confirmLabel="Eliminar"
        cancelLabel="Cancelar"
        variant="danger"
        loading={deleteMutation.isPending}
        onConfirm={() => deleteMutation.mutate()}
        onCancel={() => setDeleteOpen(false)}
      />

      {/* Delete activity confirm */}
      <ConfirmModal
        open={!!activityDeleteTarget}
        title="Eliminar actividade"
        description={`Tens a certeza que queres eliminar "${activityDeleteTarget?.name}"?`}
        confirmLabel="Eliminar"
        cancelLabel="Cancelar"
        variant="danger"
        loading={deleteActivityMutation.isPending}
        onConfirm={() => activityDeleteTarget && deleteActivityMutation.mutate({ dayIndex: activityDeleteTarget.dayIndex, activityIndex: activityDeleteTarget.activityIndex })}
        onCancel={() => setActivityDeleteTarget(null)}
      />
    </div>
  )
}
