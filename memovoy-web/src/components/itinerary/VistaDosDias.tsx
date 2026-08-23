'use client'

/**
 * O roteiro dia a dia: separadores, tema, meteorologia, mapa e linha temporal.
 *
 * Era a metade de baixo do ItineraryClient, e só existia lá. O ecrã de revisão
 * — o que aparece depois de gerar e antes de guardar — mostrava as mesmas
 * actividades numa lista simples, e parecia outra aplicação. Pior: quem
 * revia um roteiro não estava a ver o roteiro que ia ficar com.
 *
 * Agora é a mesma vista nos dois sítios. O que muda entre eles são três
 * interruptores, e cada um tem uma razão:
 *
 *   comMeteorologia   antes de guardar continua a fazer sentido — saber que
 *                     vai chover no dia 2 é exactamente o tipo de coisa que
 *                     leva alguém a trocar uma actividade.
 *   comCheckin        não. Não se marca como visitada uma viagem que ainda
 *                     nem se aceitou.
 *   arrastavel        ligado nos dois; reordenar é revisão como outra qualquer.
 */

import { useState, useMemo } from 'react'
import dynamic from 'next/dynamic'
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CartaoDeActividade } from './CartaoDeActividade'
import { TripCompanion } from './TripCompanion'
import { type Activity, type Day } from './actividade'
import type { ActivityPin } from '@/components/map/ActivityMap'

const ActivityMap = dynamic(
  () => import('@/components/map/ActivityMap').then((m) => m.ActivityMap),
  { ssr: false },
)

export function VistaDosDias({
  roteiroId,
  dias,
  diaActivo,
  aoMudarDeDia,
  podeEditar,
  comMeteorologia = true,
  comCheckin = true,
  arrastavel = true,
  checkins,
  aoReordenar,
  aoSubstituirComIa,
  aoEditarManualmente,
  aoEliminar,
  aoMarcarVisitado,
  aoAdaptarActividades,
}: {
  roteiroId: string
  dias: Day[]
  diaActivo: number
  aoMudarDeDia: (i: number) => void
  podeEditar: boolean
  comMeteorologia?: boolean
  comCheckin?: boolean
  arrastavel?: boolean
  /** Chaves "dia:indice" das actividades já visitadas. */
  checkins?: Set<string>
  aoReordenar?: (diaIndex: number, actividades: Activity[]) => void
  aoSubstituirComIa: (diaIndex: number, actIndex: number, act: Activity) => void
  aoEditarManualmente: (diaIndex: number, actIndex: number, act: Activity) => void
  aoEliminar: (diaIndex: number, actIndex: number, act: Activity) => void
  aoMarcarVisitado?: (diaIndex: number, actIndex: number, act: Activity) => void
  aoAdaptarActividades?: (diaIndex: number, actividades: Activity[]) => void
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  )

  const dia = dias[diaActivo]

  const pinos: ActivityPin[] = useMemo(
    () => (dia?.activities ?? []).map((a) => ({
      name: a.name,
      address: a.address,
      geoName: a.geoName,
      type: a.type,
      // Resolvidas no servidor ao gerar. O mapa já não geocodifica nada.
      lat: a.lat,
      lon: a.lon,
    })),
    [dia],
  )

  function fimDoArrasto(evento: DragEndEvent) {
    const { active, over } = evento
    if (!over || active.id === over.id || !dia || !aoReordenar) return

    const acts = dia.activities ?? []
    const de   = acts.findIndex((_, i) => String(i) === active.id)
    const para = acts.findIndex((_, i) => String(i) === over.id)
    if (de === -1 || para === -1) return

    const reordenadas = [...acts]
    const [movida] = reordenadas.splice(de, 1)
    reordenadas.splice(para, 0, movida)
    aoReordenar(diaActivo, reordenadas)
  }

  if (dias.length === 0) return null

  const cartoes = (dia?.activities ?? []).map((act, i) => (
    <CartaoDeActividade
      key={i}
      sortId={String(i)}
      act={act}
      podeEditar={podeEditar}
      arrastavel={arrastavel && !!aoReordenar}
      comCheckin={comCheckin}
      checkedIn={checkins?.has(`${diaActivo}:${i}`) ?? false}
      onEditClick={() => aoSubstituirComIa(diaActivo, i, act)}
      onManualEditClick={() => aoEditarManualmente(diaActivo, i, act)}
      onDeleteClick={() => aoEliminar(diaActivo, i, act)}
      onCheckin={() => aoMarcarVisitado?.(diaActivo, i, act)}
    />
  ))

  return (
    <>
      {/* Separadores dos dias */}
      <div className="flex gap-2 overflow-x-auto pb-1 mb-5" style={{ scrollbarWidth: 'none' }}>
        {dias.map((d, i) => (
          <button
            key={i}
            onClick={() => aoMudarDeDia(i)}
            className={`chip shrink-0 ${diaActivo === i ? 'chip-active' : ''}`}
            aria-current={diaActivo === i ? 'true' : undefined}
          >
            Dia {d.day}
          </button>
        ))}
      </div>

      {dia && (
        <>
          <div className="mb-4">
            <p className="font-bold text-base" style={{ color: 'var(--text-primary)' }}>
              {dia.theme}
            </p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {dia.date}
            </p>
          </div>

          {comMeteorologia && (
            <TripCompanion
              itineraryId={roteiroId}
              activeDay={diaActivo}
              activeDate={dia.date}
              isOwner={podeEditar}
              onActivitiesAdapted={(diaIdx, actividades) => aoAdaptarActividades?.(diaIdx, actividades)}
            />
          )}

          {pinos.some((p) => p.address || p.geoName) && <ActivityMap activities={pinos} />}

          <div className="relative pl-6">
            <div
              className="absolute left-2 top-2 bottom-2 w-px"
              style={{ background: 'var(--border)' }}
            />

            {podeEditar && arrastavel && aoReordenar ? (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={fimDoArrasto}>
                <SortableContext
                  items={(dia.activities ?? []).map((_, i) => String(i))}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="flex flex-col gap-4">{cartoes}</div>
                </SortableContext>
              </DndContext>
            ) : (
              <div className="flex flex-col gap-4">{cartoes}</div>
            )}
          </div>
        </>
      )}
    </>
  )
}

/** Estado do dia activo, para quem usa a vista não ter de o inventar. */
export function useDiaActivo(total: number) {
  const [diaActivo, setDiaActivo] = useState(0)
  // Se o dia activo deixar de existir — porque se apagou um dia — recuar para
  // o último que existe, em vez de mostrar um ecrã vazio sem explicação.
  const seguro = total > 0 ? Math.min(diaActivo, total - 1) : 0
  return [seguro, setDiaActivo] as const
}
