'use client'

/**
 * O ecrã entre "gerado" e "guardado".
 *
 * Duas versões atrás isto mostrava três actividades por dia e um "+4
 * actividades…" que não abria. A versão seguinte mostrava tudo, mas numa lista
 * pobre que não se parecia nada com a página de um roteiro guardado — quem
 * revia não estava a ver o roteiro com que ia ficar.
 *
 * Agora é a MESMA vista: separadores por dia, tema, meteorologia, mapa e linha
 * temporal. O que muda é o que fica por baixo — guardar ou descartar — e o
 * facto de não haver "marcar como visitado", que não faz sentido numa viagem
 * que ainda não foi aceite.
 *
 * As alterações gravam à medida. O roteiro já existe na base de dados, por
 * confirmar e privado, e é isso que faz o "Descartar" apagar uma coisa
 * coerente em vez de meia edição.
 */

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, Check } from 'lucide-react'
import { api } from '@/lib/api'
import { Spinner } from '@/components/ui/Spinner'
import { AlertBanner } from '@/components/ui/AlertBanner'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import { AiEditModal } from './AiEditModal'
import { VistaDosDias, useDiaActivo } from './VistaDosDias'
import { type Activity, type Day, type EditTarget } from './actividade'

export function RevisaoDoRoteiro({
  roteiroId,
  dias,
  resumo,
  custoEstimado,
  aoDescartar,
}: {
  roteiroId: string
  dias: Day[]
  resumo?: string
  custoEstimado?: string
  aoDescartar: () => Promise<void> | void
}) {
  const router = useRouter()

  const [diasLocais, setDiasLocais] = useState<Day[]>(dias)
  const [diaActivo, setDiaActivo]   = useDiaActivo(diasLocais.length)
  const [alvo, setAlvo]             = useState<EditTarget | null>(null)
  const [aRemover, setARemover]     = useState<EditTarget | null>(null)
  const [aGuardar, setAGuardar]     = useState(false)
  const [aDescartar, setADescartar] = useState(false)
  const [confirmarDescarte, setConfirmarDescarte] = useState(false)
  const [erro, setErro]             = useState('')

  const totalActividades = diasLocais.reduce((n, d) => n + (d.activities?.length ?? 0), 0)

  // ── Esperar pelas coordenadas ──────────────────────────────────────────────
  //
  // Os dias chegam pelo fluxo da geração SEM lat/lon: a geocodificação corre em
  // segundo plano no servidor e leva uns quinze segundos, porque o Nominatim
  // permite um pedido por segundo. Sem isto o mapa nunca aparecia na revisão —
  // só depois de guardar, que é exactamente quando já não serve para decidir.
  //
  // Vai buscá-las uma vez, e desiste ao fim de um minuto. Um mapa que não
  // aparece é melhor do que uma página a bater no servidor para sempre.
  const jaEditou = useRef(false)
  useEffect(() => {
    let vivo = true
    let tentativas = 0

    async function buscar() {
      if (!vivo || jaEditou.current || tentativas >= 12) return
      tentativas++
      try {
        const r = await api.get<{ days?: Day[] }>(`/itineraries/${roteiroId}`)
        const temCoordenadas = (r.days ?? []).some((d) =>
          (d.activities ?? []).some((a) => typeof a.lat === 'number'))

        // Só substitui quando as coordenadas já lá estão, e só se o utilizador
        // ainda não mexeu — substituir por baixo de uma edição dele seria
        // desfazer-lhe o trabalho sem aviso.
        if (temCoordenadas && !jaEditou.current && vivo) {
          setDiasLocais(r.days as Day[])
          return
        }
      } catch { /* volta a tentar */ }
      if (vivo) setTimeout(buscar, 5000)
    }

    const inicio = setTimeout(buscar, 4000)
    return () => { vivo = false; clearTimeout(inicio) }
  }, [roteiroId])

  /** Substitui uma actividade no ecrã. Quem chama já gravou no servidor. */
  function trocarNoEcra(diaIndex: number, actIndex: number, nova: Activity) {
    jaEditou.current = true
    setDiasLocais((prev) => prev.map((d, di) => (
      di !== diaIndex ? d : { ...d, activities: d.activities.map((a, ai) => (ai === actIndex ? nova : a)) }
    )))
  }

  async function reordenar(diaIndex: number, actividades: Activity[]) {
    jaEditou.current = true
    setDiasLocais((prev) => prev.map((d, di) => (di === diaIndex ? { ...d, activities: actividades } : d)))
    try {
      await api.patch(`/itineraries/${roteiroId}/reorder`, { dayIndex: diaIndex, activities: actividades })
    } catch {
      // A ordem no ecrã já mudou e o utilizador viu-a mudar. Repor seria mais
      // confuso do que útil: ele volta a arrastar, e o pedido seguinte grava.
      setErro('A nova ordem pode não ter sido gravada. Verifica antes de guardar.')
    }
  }

  async function remover() {
    if (!aRemover) return
    const { dayIndex, activityIndex } = aRemover
    jaEditou.current = true
    setErro('')
    try {
      await api.delete(`/itineraries/${roteiroId}/activity?dayIndex=${dayIndex}&activityIndex=${activityIndex}`)
      setDiasLocais((prev) => prev.map((d, di) => (
        di !== dayIndex ? d : { ...d, activities: d.activities.filter((_, ai) => ai !== activityIndex) }
      )))
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : 'Não foi possível remover a actividade.')
    } finally {
      setARemover(null)
    }
  }

  async function guardar() {
    setAGuardar(true)
    setErro('')
    try {
      await api.post(`/itineraries/${roteiroId}/confirm`, {})
      router.push(`/itineraries/${roteiroId}`)
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : 'Não foi possível guardar o roteiro.')
      setAGuardar(false)
    }
  }

  async function descartar() {
    setADescartar(true)
    try {
      await aoDescartar()
    } finally {
      setADescartar(false)
      setConfirmarDescarte(false)
    }
  }

  return (
    <div className="py-8" style={{ fontFamily: 'var(--font-dm-sans, var(--font-poppins, system-ui))' }}>
      <div className="flex items-center gap-3 mb-5">
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
          style={{ background: 'var(--accent-subtle)' }}
        >
          <Check className="w-5 h-5" style={{ color: 'var(--accent)' }} />
        </div>
        <div>
          <p className="font-bold" style={{ color: 'var(--text-primary)' }}>Roteiro gerado</p>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            {diasLocais.length} {diasLocais.length === 1 ? 'dia' : 'dias'} · {totalActividades} actividades.
            Muda o que não gostares antes de guardar.
          </p>
        </div>
      </div>

      {(resumo || custoEstimado) && (
        <div className="card p-4 mb-5">
          {resumo && <p className="text-sm mb-2" style={{ color: 'var(--text-secondary)' }}>{resumo}</p>}
          {custoEstimado && (
            <p className="text-xs font-semibold" style={{ color: 'var(--accent)' }}>
              Custo estimado: {custoEstimado}
            </p>
          )}
        </div>
      )}

      {erro && <div className="mb-4"><AlertBanner variant="danger" message={erro} /></div>}

      <VistaDosDias
        roteiroId={roteiroId}
        dias={diasLocais}
        diaActivo={diaActivo}
        aoMudarDeDia={setDiaActivo}
        podeEditar
        // Saber que vai chover no dia 2 é exactamente o que leva alguém a
        // trocar uma actividade — por isso a meteorologia fica.
        comMeteorologia
        // Não se marca como visitada uma viagem que ainda nem foi aceite.
        comCheckin={false}
        checkins={undefined}
        aoReordenar={reordenar}
        aoSubstituirComIa={(dayIndex, activityIndex, activity) => setAlvo({ dayIndex, activityIndex, activity })}
        aoEditarManualmente={(dayIndex, activityIndex, activity) => setAlvo({ dayIndex, activityIndex, activity })}
        aoEliminar={(dayIndex, activityIndex, activity) => setARemover({ dayIndex, activityIndex, activity })}
        aoAdaptarActividades={(diaIndex, actividades) => {
          setDiasLocais((prev) => prev.map((d, i) => (i === diaIndex ? { ...d, activities: actividades } : d)))
        }}
      />

      <div
        className="flex items-start gap-2 rounded-xl p-3 mt-6 mb-4 text-xs"
        style={{ background: 'var(--surface2)', color: 'var(--text-muted)' }}
      >
        <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
        <p>Enquanto não guardares, este roteiro é só teu — não aparece na tua lista nem para mais ninguém.</p>
      </div>

      <div className="flex flex-col gap-3">
        <button className="btn btn-primary w-full gap-2" onClick={guardar} disabled={aGuardar}>
          {aGuardar ? <Spinner size="sm" /> : <Check className="w-4 h-4" />}
          Guardar Roteiro
        </button>
        <button
          className="btn btn-secondary w-full"
          onClick={() => setConfirmarDescarte(true)}
          disabled={aGuardar || aDescartar}
        >
          {aDescartar ? 'A descartar…' : 'Descartar'}
        </button>
      </div>

      {alvo && (
        <AiEditModal
          target={alvo}
          itineraryId={roteiroId}
          onClose={() => setAlvo(null)}
          onAccept={(nova) => { trocarNoEcra(alvo.dayIndex, alvo.activityIndex, nova); setAlvo(null) }}
        />
      )}

      <ConfirmModal
        open={aRemover !== null}
        title="Remover actividade?"
        description={aRemover
          ? `"${aRemover.activity.name}" sai do dia ${diasLocais[aRemover.dayIndex]?.day}.`
          : ''}
        confirmLabel="Remover"
        variant="danger"
        onConfirm={remover}
        onCancel={() => setARemover(null)}
      />

      <ConfirmModal
        open={confirmarDescarte}
        title="Descartar este roteiro?"
        description="O roteiro e as alterações que fizeste são apagados. Não dá para recuperar."
        confirmLabel="Descartar"
        variant="danger"
        loading={aDescartar}
        onConfirm={descartar}
        onCancel={() => setConfirmarDescarte(false)}
      />
    </div>
  )
}
