'use client'

import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { PlusCircle, Trash2, Package, GripVertical, Sparkles } from 'lucide-react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { api } from '@/lib/api'
import { Spinner } from '@/components/ui/Spinner'

interface PackingItem {
  id: string
  label: string
  packed: boolean
  sortOrder: number
  createdAt: string
}

interface PackingData {
  items: PackingItem[]
  total: number
  packed: number
}

interface Props {
  itineraryId: string
  isOwner: boolean
}

function SortableItem({
  item,
  onToggle,
  onDelete,
}: {
  item: PackingItem
  onToggle: () => void
  onDelete: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity:   isDragging ? 0.5 : 1,
  }

  return (
    <li
      ref={setNodeRef}
      style={{ ...style, background: 'var(--surface2)' }}
      className="group flex items-center gap-2 p-2 rounded-xl"
    >
      <button
        {...attributes}
        {...listeners}
        className="shrink-0 cursor-grab active:cursor-grabbing touch-none p-0.5"
        style={{ color: 'var(--text-muted)' }}
        aria-label="Arrastar para reordenar"
      >
        <GripVertical className="w-3.5 h-3.5" />
      </button>

      <input
        type="checkbox"
        checked={item.packed}
        onChange={onToggle}
        className="w-4 h-4 shrink-0 cursor-pointer"
        style={{ accentColor: 'var(--accent)' }}
      />

      <span
        className="flex-1 text-sm min-w-0 truncate"
        style={{
          color:          item.packed ? 'var(--text-muted)' : 'var(--text-primary)',
          textDecoration: item.packed ? 'line-through' : 'none',
        }}
      >
        {item.label}
      </span>

      <button
        onClick={onDelete}
        className="btn btn-ghost p-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ color: 'var(--text-muted)' }}
        aria-label="Remover item"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </li>
  )
}

export function PackingPanel({ itineraryId, isOwner }: Props) {
  const qc   = useQueryClient()
  const qKey = ['packing', itineraryId]

  const { data, isLoading } = useQuery<PackingData>({
    queryKey: qKey,
    queryFn:  () => api.get(`/packing/itinerary/${itineraryId}`),
    enabled:  isOwner,
  })

  const [newLabel, setNewLabel] = useState('')
  const inputRef               = useRef<HTMLInputElement>(null)

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const addMutation = useMutation({
    mutationFn: (label: string) => api.post(`/packing/itinerary/${itineraryId}`, { label }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qKey })
      setNewLabel('')
      inputRef.current?.focus()
    },
  })

  const toggleMutation = useMutation({
    mutationFn: ({ id, packed }: { id: string; packed: boolean }) =>
      api.patch(`/packing/${id}`, { packed }),
    onMutate: async ({ id, packed }) => {
      await qc.cancelQueries({ queryKey: qKey })
      const prev = qc.getQueryData<PackingData>(qKey)
      qc.setQueryData<PackingData>(qKey, (old) =>
        old
          ? {
              ...old,
              items:  old.items.map((i) => (i.id === id ? { ...i, packed } : i)),
              packed: old.items.filter((i) => (i.id === id ? packed : i.packed)).length,
            }
          : old,
      )
      return { prev }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(qKey, ctx.prev)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: qKey }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/packing/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: qKey }),
  })

  const reorderMutation = useMutation({
    mutationFn: (orderedIds: string[]) =>
      api.post(`/packing/itinerary/${itineraryId}/reorder`, { orderedIds }),
  })

  const [aiLoading, setAiLoading] = useState(false)
  async function handleAiSuggest() {
    setAiLoading(true)
    try {
      const { items } = await api.post<{ items: string[] }>(`/packing/itinerary/${itineraryId}/ai-suggest`, {})
      for (const label of items) {
        await api.post(`/packing/itinerary/${itineraryId}`, { label })
      }
      qc.invalidateQueries({ queryKey: qKey })
    } catch {
      /* silently ignore — user can retry */
    } finally {
      setAiLoading(false)
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id || !data) return

    const items      = data.items
    const oldIndex   = items.findIndex((i) => i.id === active.id)
    const newIndex   = items.findIndex((i) => i.id === over.id)
    const reordered  = arrayMove(items, oldIndex, newIndex)

    qc.setQueryData<PackingData>(qKey, (old) => old ? { ...old, items: reordered } : old)
    reorderMutation.mutate(reordered.map((i) => i.id))
  }

  if (!isOwner) return null

  const total  = data?.total  ?? 0
  const packed = data?.packed ?? 0
  const pct    = total > 0 ? Math.round((packed / total) * 100) : 0
  const items  = data?.items ?? []

  return (
    <div className="card p-4 mt-4">
      <div className="flex items-center gap-2 mb-4">
        <Package className="w-4 h-4" style={{ color: 'var(--accent)' }} />
        <h3 className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>
          Lista de Embalagem
        </h3>
        <button
          onClick={handleAiSuggest}
          disabled={aiLoading}
          className="btn btn-ghost p-1.5 ml-1 text-xs gap-1 flex items-center"
          style={{ color: 'var(--accent)', fontSize: '11px' }}
          title="Gerar lista com IA"
        >
          {aiLoading ? <Spinner size="sm" /> : <Sparkles className="w-3.5 h-3.5" />}
          {!aiLoading && 'IA'}
        </button>
        {total > 0 && (
          <span
            className="ml-auto text-xs font-semibold px-2 py-0.5 rounded-full"
            style={{
              background: pct === 100 ? 'rgba(52,211,153,0.15)' : 'var(--surface2)',
              color:      pct === 100 ? 'var(--success)'         : 'var(--text-muted)',
            }}
          >
            {packed}/{total} · {pct}%
          </span>
        )}
      </div>

      {total > 0 && (
        <div className="h-1.5 rounded-full overflow-hidden mb-4" style={{ background: 'var(--surface2)' }}>
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${pct}%`, background: pct === 100 ? 'var(--success)' : 'var(--accent)' }}
          />
        </div>
      )}

      <form
        onSubmit={(e) => { e.preventDefault(); if (newLabel.trim()) addMutation.mutate(newLabel.trim()) }}
        className="flex gap-2 mb-4"
      >
        <input
          ref={inputRef}
          type="text"
          className="input flex-1 text-sm"
          placeholder="Adicionar item…"
          maxLength={200}
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
        />
        <button
          type="submit"
          disabled={addMutation.isPending || !newLabel.trim()}
          className="btn btn-secondary shrink-0 p-2"
          aria-label="Adicionar"
        >
          {addMutation.isPending ? <Spinner size="sm" /> : <PlusCircle className="w-4 h-4" />}
        </button>
      </form>

      {isLoading ? (
        <div className="flex justify-center py-4"><Spinner /></div>
      ) : items.length > 0 ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
            <ul className="flex flex-col gap-1.5">
              {items.map((item) => (
                <SortableItem
                  key={item.id}
                  item={item}
                  onToggle={() => toggleMutation.mutate({ id: item.id, packed: !item.packed })}
                  onDelete={() => deleteMutation.mutate(item.id)}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      ) : (
        <p className="text-xs text-center py-2" style={{ color: 'var(--text-muted)' }}>
          A lista está vazia. Adiciona o que precisas de levar.
        </p>
      )}
    </div>
  )
}
