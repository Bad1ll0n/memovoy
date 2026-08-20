'use client'

import { useState } from 'react'
import { Flag, X } from 'lucide-react'
import { api } from '@/lib/api'
import { useDialogoModal } from '@/hooks/useDialogoModal'
import { Spinner } from './Spinner'

const REASONS = [
  { value: 'spam',          label: 'Spam ou publicidade' },
  { value: 'hate',          label: 'Discurso de ódio' },
  { value: 'violence',      label: 'Violência ou conteúdo perturbador' },
  { value: 'nudity',        label: 'Nudez ou conteúdo sexual' },
  { value: 'misinformation', label: 'Desinformação' },
  { value: 'other',         label: 'Outro motivo' },
] as const

type Reason = typeof REASONS[number]['value']

interface Props {
  targetType: 'post' | 'comment' | 'itinerary' | 'user'
  targetId: string
  onClose: () => void
}

export function ReportModal({ targetType, targetId, onClose }: Props) {
  // Sempre aberto enquanto está montado — quem o mostra é o pai, condicionalmente.
  const caixaRef = useDialogoModal(true, onClose)

  const [reason, setReason]   = useState<Reason | ''>('')
  const [detail, setDetail]   = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone]       = useState(false)

  async function handleSubmit() {
    if (!reason) return
    setLoading(true)
    try {
      await api.post('/reports', { targetType, targetId, reason, detail: detail.trim() || undefined })
      setDone(true)
    } catch {
      // already reported or server error — show success anyway to avoid information leakage
      setDone(true)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[1200] flex items-end sm:items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(2px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-denuncia"
    >
      <div
        ref={caixaRef}
        className="w-full max-w-sm rounded-2xl p-5"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Flag className="w-4 h-4" style={{ color: 'var(--danger)' }} />
            <h2 id="titulo-denuncia" className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>
              Reportar conteúdo
            </h2>
          </div>
          <button onClick={onClose} className="btn btn-ghost p-1" aria-label="Fechar">
            <X className="w-4 h-4" />
          </button>
        </div>

        {done ? (
          <div className="text-center py-4">
            <p className="font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
              Obrigado pelo reporte
            </p>
            <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
              A nossa equipa irá analisar este conteúdo.
            </p>
            <button onClick={onClose} className="btn btn-secondary text-sm">Fechar</button>
          </div>
        ) : (
          <>
            <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
              Qual o motivo do reporte?
            </p>
            <div className="space-y-1.5 mb-4">
              {REASONS.map((r) => (
                <label
                  key={r.value}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-colors"
                  style={{
                    background: reason === r.value ? 'rgba(220,38,38,0.08)' : 'var(--surface2)',
                    border: `1px solid ${reason === r.value ? 'rgba(220,38,38,0.3)' : 'transparent'}`,
                  }}
                >
                  <input
                    type="radio"
                    name="reason"
                    value={r.value}
                    checked={reason === r.value}
                    onChange={() => setReason(r.value)}
                    className="accent-red-500"
                  />
                  <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{r.label}</span>
                </label>
              ))}
            </div>

            {reason === 'other' && (
              <textarea
                className="input w-full text-sm resize-none mb-4"
                placeholder="Descreve o problema (opcional)…"
                rows={2}
                maxLength={500}
                value={detail}
                onChange={(e) => setDetail(e.target.value)}
                style={{ borderRadius: 12 }}
              />
            )}

            <button
              onClick={handleSubmit}
              disabled={!reason || loading}
              className="btn w-full text-sm disabled:opacity-40"
              style={{ background: 'var(--danger)', color: 'var(--on-danger)' }}
            >
              {loading ? <Spinner size="sm" /> : 'Enviar reporte'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
