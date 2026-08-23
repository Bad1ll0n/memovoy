'use client'

/**
 * O ecrã entre "gerado" e "guardado".
 *
 * O que havia antes dizia "Revê o resumo e decide se queres guardar" e mostrava
 * TRÊS actividades por dia, com "+4 actividades…" por baixo. Não dava para ver
 * o resto, não dava para mudar nada, e o botão "Guardar Roteiro" não guardava
 * coisa nenhuma — o roteiro já estava gravado, e público, desde o momento em
 * que a geração acabou. Só navegava para lá.
 *
 * Agora mostra os dias inteiros e deixa mexer antes de aceitar. As alterações
 * são gravadas à medida — o roteiro existe mesmo, só está por confirmar e
 * privado — e é isso que faz o "Descartar" apagar uma coisa coerente em vez de
 * meia edição.
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, ChevronDown, ChevronUp, MapPin, Trash2, Wand2, AlertCircle } from 'lucide-react'
import { api } from '@/lib/api'
import { Spinner } from '@/components/ui/Spinner'
import { AlertBanner } from '@/components/ui/AlertBanner'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import { AiEditModal } from './AiEditModal'
import { activityTypeLabel, type Activity, type Day, type EditTarget } from './actividade'

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
  // Todos abertos à partida. O problema deste ecrã era não se ver o roteiro;
  // abrir fechado seria repetir o problema com outra roupagem.
  const [fechados, setFechados]     = useState<Set<number>>(new Set())
  const [alvo, setAlvo]             = useState<EditTarget | null>(null)
  const [aRemover, setARemover]     = useState<EditTarget | null>(null)
  const [aGuardar, setAGuardar]     = useState(false)
  const [aDescartar, setADescartar] = useState(false)
  const [confirmarDescarte, setConfirmarDescarte] = useState(false)
  const [erro, setErro]             = useState('')

  const totalActividades = diasLocais.reduce((n, d) => n + (d.activities?.length ?? 0), 0)

  function alternar(i: number) {
    setFechados((prev) => {
      const s = new Set(prev)
      if (s.has(i)) s.delete(i)
      else s.add(i)
      return s
    })
  }

  /** O modal já gravou no servidor; aqui só se acerta o que está no ecrã. */
  function aoTrocar(nova: Activity) {
    if (!alvo) return
    setDiasLocais((prev) => prev.map((d, di) => (
      di !== alvo.dayIndex ? d : {
        ...d,
        activities: d.activities.map((a, ai) => (ai === alvo.activityIndex ? nova : a)),
      }
    )))
    setAlvo(null)
  }

  async function remover() {
    if (!aRemover) return
    const { dayIndex, activityIndex } = aRemover
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
    <div className="py-8">
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
        <div className="card p-4 mb-4">
          {resumo && <p className="text-sm mb-2" style={{ color: 'var(--text-secondary)' }}>{resumo}</p>}
          {custoEstimado && (
            <p className="text-xs font-semibold" style={{ color: 'var(--accent)' }}>
              Custo estimado: {custoEstimado}
            </p>
          )}
        </div>
      )}

      {erro && <div className="mb-4"><AlertBanner variant="danger" message={erro} /></div>}

      <div className="flex flex-col gap-3 mb-6">
        {diasLocais.map((d, dayIndex) => {
          const aberto = !fechados.has(dayIndex)
          return (
            <div key={d.day} className="card overflow-hidden">
              <button
                className="w-full flex items-center justify-between gap-3 p-4 text-left"
                onClick={() => alternar(dayIndex)}
                aria-expanded={aberto}
              >
                <div className="min-w-0">
                  <p className="text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--accent)' }}>
                    Dia {d.day}
                  </p>
                  <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                    {d.theme}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {d.activities?.length ?? 0}
                  </span>
                  {aberto
                    ? <ChevronUp className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
                    : <ChevronDown className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />}
                </div>
              </button>

              {aberto && (
                <div className="px-4 pb-4 flex flex-col gap-2">
                  {(d.activities ?? []).length === 0 && (
                    <p className="text-xs italic" style={{ color: 'var(--text-muted)' }}>
                      Este dia ficou sem actividades. Podes acrescentar depois de guardar.
                    </p>
                  )}

                  {(d.activities ?? []).map((a, activityIndex) => (
                    <div
                      key={activityIndex}
                      className="rounded-xl p-3"
                      style={{ background: 'var(--surface2)' }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-xs mb-0.5" style={{ color: 'var(--text-muted)' }}>
                            {a.time} · {activityTypeLabel[a.type] ?? a.type}
                            {a.cost !== null && a.cost !== undefined && ` · ${a.currency} ${a.cost}`}
                          </p>
                          <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                            {a.name}
                          </p>
                          {a.description && (
                            <p className="text-xs mt-0.5 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                              {a.description}
                            </p>
                          )}
                          {a.address && (
                            <p className="flex items-center gap-1 text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                              <MapPin className="w-3 h-3 shrink-0" />
                              <span className="truncate">{a.address}</span>
                            </p>
                          )}
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            className="btn btn-ghost p-1.5"
                            title="Trocar por outra"
                            aria-label={`Trocar ${a.name}`}
                            onClick={() => setAlvo({ dayIndex, activityIndex, activity: a })}
                          >
                            <Wand2 className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} />
                          </button>
                          <button
                            className="btn btn-ghost p-1.5"
                            title="Remover"
                            aria-label={`Remover ${a.name}`}
                            onClick={() => setARemover({ dayIndex, activityIndex, activity: a })}
                          >
                            <Trash2 className="w-3.5 h-3.5" style={{ color: 'var(--danger)' }} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div
        className="flex items-start gap-2 rounded-xl p-3 mb-4 text-xs"
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
          onAccept={(nova) => aoTrocar(nova)}
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
