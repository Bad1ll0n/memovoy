'use client'

/**
 * Uma actividade na linha temporal de um dia.
 *
 * Vivia dentro do ItineraryClient, que é a página de um roteiro já guardado.
 * O ecrã de revisão — o que aparece antes de guardar — mostrava as mesmas
 * actividades numa lista muito mais pobre, e ficava a parecer outra aplicação.
 *
 * Duas coisas são opcionais porque não fazem sentido antes de guardar:
 * arrastar para reordenar (a ordem ainda vai mudar) e marcar como visitado
 * (não se visita uma viagem que ainda não se aceitou).
 */

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { AlertCircle, CheckCircle2, GripVertical, MapPin, Pencil, Trash2, Wand2 } from 'lucide-react'
import { activityTypeClass, activityTypeLabel, type Activity } from './actividade'

export function CartaoDeActividade({
  act,
  sortId,
  podeEditar,
  arrastavel = true,
  comCheckin = true,
  checkedIn = false,
  onEditClick,
  onManualEditClick,
  onDeleteClick,
  onCheckin,
}: {
  act: Activity
  sortId: string
  podeEditar: boolean
  /** Fora do ecrã de revisão a ordem já é definitiva; lá ainda não é. */
  arrastavel?: boolean
  comCheckin?: boolean
  checkedIn?: boolean
  onEditClick: () => void
  onManualEditClick: () => void
  onDeleteClick: () => void
  onCheckin?: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: sortId })

  return (
    <div
      ref={setNodeRef}
      style={{
        transform:  CSS.Transform.toString(transform),
        transition,
        opacity:    isDragging ? 0.5 : 1,
      }}
      className="relative"
    >
      {/* Timeline dot */}
      <div
        className="absolute -left-6 top-3 w-4 h-4 rounded-full border-2 flex items-center justify-center"
        style={{ borderColor: 'var(--accent)', background: 'var(--bg-body)' }}
      >
        <div className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--accent)' }} />
      </div>

      <div className="card p-4">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${activityTypeClass[act.type] ?? 'act-leisure'}`}>
                {activityTypeLabel[act.type] ?? act.type}
              </span>
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{act.time}</span>
            </div>
            <h4 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
              {act.name}
            </h4>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {act.cost !== null && act.cost !== undefined && (
              <span className="text-sm font-bold" style={{ color: 'var(--accent)' }}>
                {act.cost} {act.currency}
              </span>
            )}
            {podeEditar && (
              <>
                <button
                  className="btn btn-ghost p-1.5 rounded-lg"
                  title="Substituir com IA"
                  aria-label={`Substituir ${act.name} com IA`}
                  onClick={onEditClick}
                >
                  <Wand2 className="w-3.5 h-3.5" />
                </button>
                <button
                  className="btn btn-ghost p-1.5 rounded-lg"
                  title="Editar manualmente"
                  aria-label={`Editar ${act.name}`}
                  onClick={onManualEditClick}
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  className="btn btn-ghost p-1.5 rounded-lg"
                  title="Eliminar actividade"
                  aria-label={`Eliminar ${act.name}`}
                  style={{ color: 'var(--danger, #ef4444)' }}
                  onClick={onDeleteClick}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
                {arrastavel && (
                  <button
                    className="btn btn-ghost p-1.5 rounded-lg cursor-grab active:cursor-grabbing"
                    style={{ color: 'var(--text-muted)' }}
                    title="Arrastar para reordenar"
                    aria-label={`Reordenar ${act.name}`}
                    {...attributes}
                    {...listeners}
                  >
                    <GripVertical className="w-3.5 h-3.5" />
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        <p className="text-xs mb-2 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          {act.description}
        </p>

        {act.address && (
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(act.geoName ?? act.address)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs hover:underline transition-opacity hover:opacity-70"
            style={{ color: 'var(--accent)' }}
          >
            <MapPin className="w-3 h-3 shrink-0" />
            {act.address}
          </a>
        )}

        {act.tips && (
          <div className="mt-2 alert-info py-2 text-xs">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            {act.tips}
          </div>
        )}

        {comCheckin && (
          <button
            onClick={onCheckin}
            className={`mt-3 flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-lg transition-all ${
              checkedIn ? 'animate-like-pop' : 'hover:opacity-80'
            }`}
            style={{
              background: checkedIn ? 'rgba(52,211,153,0.15)' : 'var(--surface2)',
              color:      checkedIn ? 'var(--success)' : 'var(--text-muted)',
            }}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            {checkedIn ? 'Já estive aqui' : 'Marcar como visitado'}
          </button>
        )}
      </div>
    </div>
  )
}
