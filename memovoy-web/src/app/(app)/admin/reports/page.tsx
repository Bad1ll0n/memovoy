'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ShieldAlert, Archive, Trash2, FileQuestion } from 'lucide-react'
import { api } from '@/lib/api'
import { useRequireAuth } from '@/hooks/useRequireAuth'
import { Spinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import { ErroDePagina } from '@/components/ui/ErroDePagina'
import { toast } from '@/store/toastStore'

/**
 * Fila de moderação.
 *
 * As denúncias existiam há muito e não havia forma de as ver: o POST /reports
 * escrevia em content_reports e nada lia essa tabela. Quem denunciasse conteúdo
 * abusivo via a queixa ficar guardada para sempre, sem ninguém do outro lado.
 *
 * A API responde 404 a quem não for administrador — deliberadamente, para não
 * confirmar que a área existe. Aqui isso traduz-se num "não encontrado" normal.
 */

type Severidade = 'critical' | 'high' | 'medium' | 'low' | null

interface Denuncia {
  targetType:   'post' | 'comment' | 'itinerary' | 'user'
  targetId:     string
  total:        number
  motivos:      string[]
  denunciantes: string[]
  primeira:     string
  ultima:       string
  aiSeverity:   Severidade
  aiAction:     string | null
  aiReasoning:  string | null
  excerto:      string | null
  autorId:      string | null
  existe:       boolean
}

const NOME_DO_TIPO: Record<Denuncia['targetType'], string> = {
  post:      'Publicação',
  comment:   'Comentário',
  itinerary: 'Roteiro',
  user:      'Conta',
}

const MOTIVOS: Record<string, string> = {
  spam:           'Spam',
  hate:           'Discurso de ódio',
  violence:       'Violência',
  nudity:         'Nudez',
  misinformation: 'Desinformação',
  other:          'Outro',
}

const CORES_DA_SEVERIDADE: Record<string, string> = {
  critical: '#ef4444',
  high:     '#f97316',
  medium:   '#eab308',
  low:      '#64748b',
}

function Etiqueta({ severidade }: { severidade: Severidade }) {
  if (!severidade) return null
  const cor = CORES_DA_SEVERIDADE[severidade] ?? 'var(--text-secondary)'

  return (
    <span
      className="text-[11px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full"
      style={{ background: `${cor}1f`, color: cor }}
    >
      {severidade}
    </span>
  )
}

export default function ModeracaoPage() {
  const { isReady } = useRequireAuth()
  const qc = useQueryClient()
  const [aConfirmar, setAConfirmar] = useState<Denuncia | null>(null)

  const stats = useQuery<{ pendentes: number; resolvidas: number; criticas: number }>({
    queryKey: ['admin-report-stats'],
    queryFn:  () => api.get('/admin/reports/stats'),
    enabled:  isReady,
  })

  const { data, isLoading, error } = useQuery<{ reports: Denuncia[] }>({
    queryKey: ['admin-reports'],
    queryFn:  () => api.get('/admin/reports'),
    enabled:  isReady,
    retry:    false, // um 404 aqui significa "não és administrador", não uma falha passageira
  })

  const resolver = useMutation({
    mutationFn: (v: { d: Denuncia; resolution: 'dismissed' | 'removed' }) =>
      api.post('/admin/reports/resolve', {
        targetType: v.d.targetType,
        targetId:   v.d.targetId,
        resolution: v.resolution,
      }),
    onSuccess: (_r, v) => {
      qc.invalidateQueries({ queryKey: ['admin-reports'] })
      qc.invalidateQueries({ queryKey: ['admin-report-stats'] })
      toast(
        v.resolution === 'removed' ? 'Conteúdo removido.' : 'Denúncia arquivada.',
        { type: 'success' },
      )
      setAConfirmar(null)
    },
    onError: (e: Error) => {
      toast(e.message || 'Não foi possível resolver a denúncia.', { type: 'error' })
      setAConfirmar(null)
    },
  })

  if (!isReady || isLoading) {
    return <div className="flex justify-center py-16"><Spinner size="lg" /></div>
  }

  if (error) {
    return (
      <ErroDePagina
        titulo="Não encontrámos isto"
        descricao="Esta área não está disponível para a tua conta."
      />
    )
  }

  const denuncias = data?.reports ?? []

  return (
    <div>
      <header className="mb-5">
        <h1 className="text-xl font-bold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
          <ShieldAlert className="w-5 h-5" style={{ color: 'var(--accent)' }} aria-hidden />
          Moderação
        </h1>
        {stats.data && (
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
            {stats.data.pendentes} por decidir · {stats.data.resolvidas} resolvidas
            {stats.data.criticas > 0 && (
              <span style={{ color: CORES_DA_SEVERIDADE.critical }}>
                {' '}· {stats.data.criticas} crítica{stats.data.criticas === 1 ? '' : 's'}
              </span>
            )}
          </p>
        )}
      </header>

      {denuncias.length === 0 ? (
        <EmptyState
          Icon={ShieldAlert}
          title="Nada por decidir"
          description="Não há denúncias pendentes. Aparecem aqui assim que alguém denunciar conteúdo."
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {denuncias.map((d) => (
            <li
              key={`${d.targetType}:${d.targetId}`}
              className="rounded-xl p-4"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
            >
              <div className="flex items-center gap-2 flex-wrap mb-2">
                <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                  {NOME_DO_TIPO[d.targetType]}
                </span>
                <Etiqueta severidade={d.aiSeverity} />
                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  {d.total} denúncia{d.total === 1 ? '' : 's'}
                </span>
              </div>

              {d.existe ? (
                <p
                  className="text-sm mb-2 line-clamp-3"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {d.excerto || <em>sem texto</em>}
                </p>
              ) : (
                <p className="text-sm mb-2 flex items-center gap-1.5" style={{ color: 'var(--text-secondary)' }}>
                  <FileQuestion className="w-4 h-4" aria-hidden />
                  <em>O conteúdo já não existe — foi removido por outra via.</em>
                </p>
              )}

              <p className="text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>
                Motivos: {d.motivos.map((m) => MOTIVOS[m] ?? m).join(', ')}
              </p>
              <p className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>
                Por: {d.denunciantes.join(', ')}
              </p>

              {d.aiReasoning && (
                <p
                  className="text-xs mb-3 p-2 rounded-lg"
                  style={{ background: 'var(--surface2)', color: 'var(--text-secondary)' }}
                >
                  <strong>Análise automática:</strong> {d.aiReasoning}
                </p>
              )}

              <div className="flex gap-2 flex-wrap">
                <button
                  className="btn text-xs inline-flex items-center gap-1.5"
                  disabled={resolver.isPending}
                  onClick={() => resolver.mutate({ d, resolution: 'dismissed' })}
                >
                  <Archive className="w-3.5 h-3.5" aria-hidden />
                  Arquivar
                </button>

                {/* Contas não se removem daqui — a API recusa, e o botão não aparece. */}
                {d.targetType !== 'user' && d.existe && (
                  <button
                    className="btn btn-danger text-xs inline-flex items-center gap-1.5"
                    disabled={resolver.isPending}
                    onClick={() => setAConfirmar(d)}
                  >
                    <Trash2 className="w-3.5 h-3.5" aria-hidden />
                    {d.targetType === 'itinerary' ? 'Despublicar' : 'Remover'}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <ConfirmModal
        open={aConfirmar !== null}
        title={aConfirmar?.targetType === 'itinerary' ? 'Despublicar o roteiro?' : 'Remover o conteúdo?'}
        description={
          aConfirmar?.targetType === 'itinerary'
            ? 'O roteiro sai da vista pública mas continua a existir para o autor.'
            : 'O conteúdo é apagado e não há forma de o recuperar.'
        }
        confirmLabel={aConfirmar?.targetType === 'itinerary' ? 'Despublicar' : 'Remover'}
        loading={resolver.isPending}
        onConfirm={() => aConfirmar && resolver.mutate({ d: aConfirmar, resolution: 'removed' })}
        onCancel={() => setAConfirmar(null)}
      />
    </div>
  )
}
