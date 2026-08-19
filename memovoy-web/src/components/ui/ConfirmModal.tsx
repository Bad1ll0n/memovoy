'use client'

import { useRef } from 'react'
import { AlertTriangle, X } from 'lucide-react'
import { useDialogoModal } from '@/hooks/useDialogoModal'
import { Spinner } from './Spinner'

interface Props {
  open: boolean
  title: string
  description: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'danger' | 'warning'
  loading?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmModal({
  open,
  title,
  description,
  confirmLabel = 'Confirmar',
  cancelLabel  = 'Cancelar',
  variant      = 'danger',
  loading      = false,
  onConfirm,
  onCancel,
}: Props) {
  // Escape, armadilha de foco e restauro do foco vivem no hook, para os outros
  // diálogos da app poderem usar o mesmo — nenhum deles tinha nada disto.
  // O foco começa no Cancelar de propósito: o botão seguro é o que deve estar
  // debaixo do dedo, para um Enter distraído não apagar nada.
  const cancelRef = useRef<HTMLButtonElement>(null)
  const caixaRef = useDialogoModal(open, onCancel, cancelRef)

  if (!open) return null

  const accentColor = variant === 'danger' ? 'var(--danger)' : 'var(--amber, #F59E0B)'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel() }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
    >
      <div
        ref={caixaRef}
        className="w-full max-w-sm rounded-2xl p-6 flex flex-col gap-4 shadow-xl"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
              style={{ background: `color-mix(in srgb, ${accentColor} 12%, transparent)` }}
            >
              <AlertTriangle className="w-4.5 h-4.5" style={{ color: accentColor }} />
            </div>
            <h2
              id="confirm-title"
              className="font-bold text-base"
              style={{ color: 'var(--text-primary)' }}
            >
              {title}
            </h2>
          </div>
          <button
            onClick={onCancel}
            className="btn btn-ghost p-1 shrink-0"
            style={{ color: 'var(--text-muted)' }}
            aria-label="Fechar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          {description}
        </p>

        <div className="flex gap-2 justify-end pt-1">
          <button
            ref={cancelRef}
            onClick={onCancel}
            disabled={loading}
            className="btn btn-secondary px-4 h-9 text-sm"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="btn px-4 h-9 text-sm font-semibold"
            style={{
              background: accentColor,
              color: '#fff',
              border: 'none',
            }}
          >
            {loading ? <Spinner size="sm" /> : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
