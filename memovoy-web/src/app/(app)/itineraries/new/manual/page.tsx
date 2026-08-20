'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  GripVertical, Plus, Trash2, ChevronDown, ChevronUp,
  MapPin, Clock, DollarSign, ArrowLeft, Save, X, Sparkles,
} from 'lucide-react'
import { api } from '@/lib/api'
import { useRequireAuth } from '@/hooks/useRequireAuth'
import { Spinner } from '@/components/ui/Spinner'
import { AlertBanner } from '@/components/ui/AlertBanner'

type ActivityType = 'visit' | 'food' | 'transport' | 'leisure' | 'hotel'

interface Activity {
  id: string
  time: string
  name: string
  description: string
  address: string
  cost: number
  currency: string
  type: ActivityType
}

interface Day {
  id: string
  day: number
  date: string
  theme: string
  activities: Activity[]
}

function uid() {
  return Math.random().toString(36).slice(2, 10)
}

function makeActivity(): Activity {
  return {
    id: uid(),
    time: '09:00',
    name: '',
    description: '',
    address: '',
    cost: 0,
    currency: 'EUR',
    type: 'visit',
  }
}

function makeDay(dayNum: number, startDate: string): Day {
  const d = new Date(startDate)
  d.setDate(d.getDate() + dayNum - 1)
  return {
    id: uid(),
    day: dayNum,
    date: d.toISOString().split('T')[0],
    theme: `Dia ${dayNum}`,
    activities: [makeActivity()],
  }
}

const TYPE_LABELS: Record<ActivityType, string> = {
  visit: 'Visita',
  food: 'Refeição',
  transport: 'Transporte',
  leisure: 'Lazer',
  hotel: 'Alojamento',
}

const TYPE_COLORS: Record<ActivityType, string> = {
  visit: '#3B82F6',
  food: '#22C55E',
  transport: '#A855F7',
  leisure: '#F97316',
  hotel: '#EAB308',
}

export default function ManualBuilderPage() {
  const router = useRouter()
  const { isReady } = useRequireAuth()

  const [title, setTitle] = useState('')
  const [destination, setDestination] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [days, setDays] = useState<Day[]>([])
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set())
  const [editingActivity, setEditingActivity] = useState<{
    dayId: string
    activityId: string
  } | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  function toggleDay(dayId: string) {
    setExpandedDays((prev) => {
      const next = new Set(prev)
      if (next.has(dayId)) next.delete(dayId)
      else next.add(dayId)
      return next
    })
  }

  function generateDays() {
    if (!startDate || !endDate) return
    const start = new Date(startDate)
    const end = new Date(endDate)
    const diff = Math.ceil((end.getTime() - start.getTime()) / 86400000) + 1
    if (diff < 1 || diff > 30) return

    const newDays = Array.from({ length: diff }, (_, i) => makeDay(i + 1, startDate))
    setDays(newDays)
    setExpandedDays(new Set([newDays[0].id]))
  }

  function addDay() {
    const last = days[days.length - 1]
    const baseDate = last ? new Date(last.date) : startDate ? new Date(startDate) : new Date()
    if (isNaN(baseDate.getTime())) return
    const nextDate = new Date(baseDate)
    if (last) nextDate.setDate(nextDate.getDate() + 1)
    const newDay = {
      ...makeDay(days.length + 1, nextDate.toISOString().split('T')[0]),
      date: nextDate.toISOString().split('T')[0],
    }
    setDays((prev) => [...prev, newDay])
    setExpandedDays((prev) => new Set([...prev, newDay.id]))
  }

  function removeDay(dayId: string) {
    setDays((prev) =>
      prev
        .filter((d) => d.id !== dayId)
        .map((d, i) => ({ ...d, day: i + 1 })),
    )
  }

  function updateDay(dayId: string, patch: Partial<Omit<Day, 'id' | 'activities'>>) {
    setDays((prev) => prev.map((d) => (d.id === dayId ? { ...d, ...patch } : d)))
  }

  function addActivity(dayId: string) {
    const act = makeActivity()
    setDays((prev) =>
      prev.map((d) =>
        d.id === dayId ? { ...d, activities: [...d.activities, act] } : d,
      ),
    )
    setEditingActivity({ dayId, activityId: act.id })
  }

  function addSuggestedActivity(dayId: string, suggestion: Omit<Activity, 'id'>) {
    const act: Activity = { ...suggestion, id: uid() }
    setDays((prev) =>
      prev.map((d) =>
        d.id === dayId ? { ...d, activities: [...d.activities, act] } : d,
      ),
    )
  }

  function removeActivity(dayId: string, actId: string) {
    setDays((prev) =>
      prev.map((d) =>
        d.id === dayId
          ? { ...d, activities: d.activities.filter((a) => a.id !== actId) }
          : d,
      ),
    )
  }

  function updateActivity(dayId: string, actId: string, patch: Partial<Activity>) {
    setDays((prev) =>
      prev.map((d) =>
        d.id === dayId
          ? {
              ...d,
              activities: d.activities.map((a) => (a.id === actId ? { ...a, ...patch } : a)),
            }
          : d,
      ),
    )
  }

  function handleDayDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setDays((prev) => {
      const oldIdx = prev.findIndex((d) => d.id === active.id)
      const newIdx = prev.findIndex((d) => d.id === over.id)
      return arrayMove(prev, oldIdx, newIdx).map((d, i) => ({ ...d, day: i + 1 }))
    })
  }

  function handleActivityDragEnd(dayId: string, event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setDays((prev) =>
      prev.map((d) => {
        if (d.id !== dayId) return d
        const oldIdx = d.activities.findIndex((a) => a.id === active.id)
        const newIdx = d.activities.findIndex((a) => a.id === over.id)
        return { ...d, activities: arrayMove(d.activities, oldIdx, newIdx) }
      }),
    )
  }

  async function handleSave() {
    setError('')
    if (!title.trim()) { setError('Adiciona um título ao roteiro.'); return }
    if (!destination.trim()) { setError('Adiciona um destino.'); return }
    if (days.length === 0) { setError('Adiciona pelo menos um dia.'); return }
    if (days.some((d) => d.activities.some((a) => !a.name.trim()))) {
      setError('Todas as actividades devem ter nome antes de guardar.'); return
    }

    setSaving(true)
    try {
      const payload = {
        title: title.trim(),
        destination: destination.trim(),
        startDate: startDate || null,
        endDate: endDate || null,
        data: {
          days: days.map((d) => ({
            day: d.day,
            date: d.date,
            theme: d.theme,
            activities: d.activities.map((a) => ({
              time: a.time,
              name: a.name,
              description: a.description,
              address: a.address,
              cost: a.cost,
              currency: a.currency,
              type: a.type,
              tips: '',
            })),
          })),
        },
      }

      const { id } = await api.post<{ id: string }>('/itineraries', payload)
      router.replace(`/itineraries/${id}`)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao guardar roteiro.')
      setSaving(false)
    }
  }

  if (!isReady) {
    return (
      <div className="flex justify-center py-12">
        <Spinner size="lg" />
      </div>
    )
  }

  const editDay = editingActivity ? days.find((d) => d.id === editingActivity.dayId) : null
  const editAct = editDay?.activities.find((a) => a.id === editingActivity?.activityId)

  return (
    <div className="pb-8">
      <button
        onClick={() => router.back()}
        className="flex items-center gap-2 mb-5 text-sm hover:opacity-80 transition-opacity"
        style={{ color: 'var(--text-muted)' }}
      >
        <ArrowLeft className="w-4 h-4" />
        Voltar
      </button>

      <h1 className="text-xl font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
        Criar roteiro manual
      </h1>
      <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
        Constrói o teu roteiro dia a dia, com drag-and-drop para reordenar.
      </p>

      {error && (
        <div className="mb-4">
          <AlertBanner variant="danger" message={error} />
        </div>
      )}

      {/* Basic info */}
      <div className="card p-4 mb-4 space-y-3">
        <div>
          <label className="label">Título do roteiro</label>
          <input
            type="text"
            className="input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ex: Verão em Lisboa"
            maxLength={100}
          />
        </div>
        <div>
          <label className="label">Destino</label>
          <div className="relative">
            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-muted)' }} />
            <input
              type="text"
              className="input" style={{ paddingLeft: '2.25rem' }}
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              placeholder="Ex: Lisboa, Portugal"
              maxLength={100}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Início</label>
            <input
              type="date"
              className="input"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Fim</label>
            <input
              type="date"
              className="input"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
        </div>
        {startDate && endDate && days.length === 0 && (
          <button
            type="button"
            onClick={generateDays}
            className="btn btn-secondary w-full text-sm"
          >
            Gerar dias automaticamente
          </button>
        )}
      </div>

      {/* Days list */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDayDragEnd}>
        <SortableContext items={days.map((d) => d.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-3 mb-4">
            {days.map((day) => (
              <SortableDay
                key={day.id}
                day={day}
                destination={destination}
                expanded={expandedDays.has(day.id)}
                onToggle={() => toggleDay(day.id)}
                onUpdateDay={(patch) => updateDay(day.id, patch)}
                onRemoveDay={() => removeDay(day.id)}
                onAddActivity={() => addActivity(day.id)}
                onAddSuggestedActivity={(s) => addSuggestedActivity(day.id, s)}
                onEditActivity={(actId) => setEditingActivity({ dayId: day.id, activityId: actId })}
                onRemoveActivity={(actId) => removeActivity(day.id, actId)}
                onActivityDragEnd={(e) => handleActivityDragEnd(day.id, e)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      <button
        type="button"
        onClick={addDay}
        className="btn btn-secondary w-full gap-2 mb-5 text-sm"
      >
        <Plus className="w-4 h-4" />
        Adicionar dia
      </button>

      <button
        onClick={handleSave}
        disabled={saving}
        className="btn btn-primary w-full gap-2"
      >
        {saving ? <Spinner size="sm" /> : <Save className="w-4 h-4" />}
        Guardar roteiro
      </button>

      {/* Activity edit modal */}
      {editingActivity && editAct && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.6)' }}
          onClick={(e) => { if (e.target === e.currentTarget) setEditingActivity(null) }}
        >
          <div
            className="card w-full max-w-lg max-h-[85vh] overflow-y-auto"
            style={{ borderRadius: 16, padding: 20 }}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-base" style={{ color: 'var(--text-primary)' }}>
                Editar actividade
              </h3>
              <button
                onClick={() => setEditingActivity(null)}
                className="p-1 rounded-lg hover:opacity-70"
                style={{ color: 'var(--text-muted)' }}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Hora</label>
                  <div className="relative">
                    <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
                    <input
                      type="time"
                      className="input text-sm" style={{ paddingLeft: '2rem' }}
                      value={editAct.time}
                      onChange={(e) =>
                        updateActivity(editingActivity.dayId, editAct.id, { time: e.target.value })
                      }
                    />
                  </div>
                </div>
                <div>
                  <label className="label">Tipo</label>
                  <select
                    className="input text-sm"
                    value={editAct.type}
                    onChange={(e) =>
                      updateActivity(editingActivity.dayId, editAct.id, {
                        type: e.target.value as ActivityType,
                      })
                    }
                  >
                    {(Object.keys(TYPE_LABELS) as ActivityType[]).map((t) => (
                      <option key={t} value={t}>
                        {TYPE_LABELS[t]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="label">Nome</label>
                <input
                  type="text"
                  className="input text-sm"
                  value={editAct.name}
                  onChange={(e) =>
                    updateActivity(editingActivity.dayId, editAct.id, { name: e.target.value })
                  }
                  placeholder="Ex: Museu Nacional de Arte Antiga"
                  maxLength={100}
                />
              </div>

              <div>
                <label className="label">Descrição</label>
                <textarea
                  className="input text-sm resize-none"
                  rows={3}
                  value={editAct.description}
                  onChange={(e) =>
                    updateActivity(editingActivity.dayId, editAct.id, { description: e.target.value })
                  }
                  placeholder="Breve descrição da actividade…"
                  maxLength={500}
                />
              </div>

              <div>
                <label className="label">Endereço</label>
                <input
                  type="text"
                  className="input text-sm"
                  value={editAct.address}
                  onChange={(e) =>
                    updateActivity(editingActivity.dayId, editAct.id, { address: e.target.value })
                  }
                  placeholder="Ex: Rua das Janelas Verdes, Lisboa"
                  maxLength={200}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Custo estimado</label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
                    <input
                      type="number"
                      className="input text-sm" style={{ paddingLeft: '2rem' }}
                      value={editAct.cost}
                      min={0}
                      onChange={(e) =>
                        updateActivity(editingActivity.dayId, editAct.id, {
                          cost: Number(e.target.value),
                        })
                      }
                    />
                  </div>
                </div>
                <div>
                  <label className="label">Moeda</label>
                  <input
                    type="text"
                    className="input text-sm"
                    value={editAct.currency}
                    onChange={(e) =>
                      updateActivity(editingActivity.dayId, editAct.id, { currency: e.target.value })
                    }
                    maxLength={5}
                    placeholder="EUR"
                  />
                </div>
              </div>
            </div>

            <button
              onClick={() => setEditingActivity(null)}
              className="btn btn-primary w-full mt-5"
            >
              Confirmar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

interface AiSuggestion {
  time: string; name: string; description: string; address: string | null;
  cost: number | null; currency: string; type: ActivityType; tips: string | null;
}

function SortableDay({
  day,
  destination,
  expanded,
  onToggle,
  onUpdateDay,
  onRemoveDay,
  onAddActivity,
  onAddSuggestedActivity,
  onEditActivity,
  onRemoveActivity,
  onActivityDragEnd,
}: {
  day: Day
  destination: string
  expanded: boolean
  onToggle: () => void
  onUpdateDay: (patch: Partial<Omit<Day, 'id' | 'activities'>>) => void
  onRemoveDay: () => void
  onAddActivity: () => void
  onAddSuggestedActivity: (s: Omit<Activity, 'id'>) => void
  onEditActivity: (actId: string) => void
  onRemoveActivity: (actId: string) => void
  onActivityDragEnd: (event: DragEndEvent) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: day.id,
  })

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  const [suggesting, setSuggesting] = useState(false)
  const [suggestions, setSuggestions] = useState<AiSuggestion[]>([])
  const [suggestErr, setSuggestErr] = useState('')

  async function handleSuggestAi() {
    if (!destination.trim()) { setSuggestErr('Define o destino primeiro.'); return }
    setSuggesting(true)
    setSuggestErr('')
    setSuggestions([])
    try {
      const res = await api.post<{ suggestions: AiSuggestion[] }>('/itineraries/suggest-for-day', {
        destination: destination.trim(),
        dayNumber: day.day,
        existingActivities: day.activities.map((a) => ({ name: a.name })),
        currency: day.activities[0]?.currency || 'EUR',
      })
      setSuggestions(res.suggestions ?? [])
    } catch {
      setSuggestErr('Erro ao obter sugestões. Tenta novamente.')
    } finally {
      setSuggesting(false)
    }
  }

  function acceptSuggestion(s: AiSuggestion) {
    onAddSuggestedActivity({
      time: s.time,
      name: s.name,
      description: s.description,
      address: s.address ?? '',
      cost: s.cost ?? 0,
      currency: s.currency || 'EUR',
      type: (s.type as ActivityType) || 'visit',
    })
    setSuggestions((prev) => prev.filter((x) => x !== s))
  }

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
      }}
    >
      <div
        className="card overflow-hidden"
        style={{ border: expanded ? '1px solid var(--accent-border)' : '1px solid var(--border)' }}
      >
        {/* Day header */}
        <div className="flex items-center gap-2 px-3 py-2.5">
          <button
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing p-0.5 rounded hover:opacity-60"
            style={{ color: 'var(--text-muted)', touchAction: 'none' }}
            aria-label="Reordenar dia"
          >
            <GripVertical className="w-4 h-4" />
          </button>

          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold shrink-0"
            style={{ background: 'var(--accent)', color: '#000' }}
          >
            {day.day}
          </div>

          <button onClick={onToggle} className="flex-1 text-left min-w-0">
            <p className="font-semibold text-sm truncate" style={{ color: 'var(--text-primary)' }}>
              {day.theme || `Dia ${day.day}`}
            </p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {day.date || 'Sem data'} · {day.activities.length} actividades
            </p>
          </button>

          <button
            onClick={onRemoveDay}
            className="p-1 rounded-lg hover:opacity-70"
            style={{ color: 'var(--danger)' }}
            aria-label="Remover dia"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={onToggle}
            className="p-1 rounded-lg hover:opacity-70"
            style={{ color: 'var(--text-muted)' }}
            aria-label={expanded ? 'Colapsar' : 'Expandir'}
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>

        {/* Day body */}
        {expanded && (
          <div style={{ borderTop: '1px solid var(--border)', padding: '12px 12px' }}>
            <div className="grid grid-cols-2 gap-2 mb-3">
              <div>
                <label className="label text-[10px]">Tema</label>
                <input
                  type="text"
                  className="input text-sm py-1.5"
                  value={day.theme}
                  onChange={(e) => onUpdateDay({ theme: e.target.value })}
                  placeholder="Tema do dia"
                  maxLength={80}
                />
              </div>
              <div>
                <label className="label text-[10px]">Data</label>
                <input
                  type="date"
                  className="input text-sm py-1.5"
                  value={day.date}
                  onChange={(e) => onUpdateDay({ date: e.target.value })}
                />
              </div>
            </div>

            {/* Activities */}
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={onActivityDragEnd}
            >
              <SortableContext
                items={day.activities.map((a) => a.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-2 mb-3">
                  {day.activities.map((act) => (
                    <SortableActivity
                      key={act.id}
                      activity={act}
                      onEdit={() => onEditActivity(act.id)}
                      onRemove={() => onRemoveActivity(act.id)}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={onAddActivity}
                className="btn btn-secondary flex-1 text-xs gap-1.5 py-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                Adicionar
              </button>
              <button
                type="button"
                onClick={handleSuggestAi}
                disabled={suggesting}
                className="btn btn-secondary text-xs gap-1.5 py-1.5 px-3"
                style={{ color: 'var(--accent)', borderColor: 'var(--accent-border)' }}
              >
                {suggesting ? <Spinner size="sm" /> : <Sparkles className="w-3.5 h-3.5" />}
                {suggesting ? '' : 'IA'}
              </button>
            </div>

            {/* AI suggestions */}
            {suggestErr && (
              <p className="text-xs mt-2" style={{ color: 'var(--danger)' }}>{suggestErr}</p>
            )}
            {suggestions.length > 0 && (
              <div className="mt-3 space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--accent)' }}>
                  Sugestões da IA
                </p>
                {suggestions.map((s, i) => (
                  <div
                    key={i}
                    className="rounded-xl p-3 flex gap-2 items-start"
                    style={{ background: 'var(--accent-faint)', border: '1px solid var(--accent-subtle)' }}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>{s.name}</p>
                      <p className="text-[11px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{s.description}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => acceptSuggestion(s)}
                      className="btn btn-primary text-[11px] px-2.5 py-1 shrink-0"
                    >
                      Adicionar
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function SortableActivity({
  activity,
  onEdit,
  onRemove,
}: {
  activity: Activity
  onEdit: () => void
  onRemove: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: activity.id,
  })

  return (
    <div
      ref={setNodeRef}
      className="flex items-center gap-2 rounded-lg px-2 py-1.5"
      style={{
        background: 'var(--surface2)',
        border: '1px solid var(--border)',
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
      }}
    >
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing p-0.5"
        style={{ color: 'var(--text-muted)', touchAction: 'none' }}
        aria-label="Reordenar actividade"
      >
        <GripVertical className="w-3.5 h-3.5" />
      </button>

      <span
        className="w-2 h-2 rounded-full shrink-0"
        style={{ background: TYPE_COLORS[activity.type] }}
      />

      <div className="flex-1 min-w-0" onClick={onEdit} style={{ cursor: 'pointer' }}>
        <p className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>
          {activity.name || '(sem nome)'}
        </p>
        <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
          {activity.time} · {TYPE_LABELS[activity.type]}
          {activity.cost > 0 ? ` · ${activity.cost} ${activity.currency}` : ''}
        </p>
      </div>

      <button
        onClick={onEdit}
        className="text-[10px] px-2 py-0.5 rounded hover:opacity-80"
        style={{ background: 'var(--accent-subtle)', color: 'var(--accent)' }}
      >
        Editar
      </button>

      <button
        onClick={onRemove}
        className="p-0.5 rounded hover:opacity-70"
        style={{ color: 'var(--danger)' }}
        aria-label="Remover actividade"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}
