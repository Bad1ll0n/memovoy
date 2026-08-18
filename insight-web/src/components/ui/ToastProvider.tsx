'use client'

import { useEffect, useRef } from 'react'
import { Undo2, X, CheckCircle, AlertCircle, Info } from 'lucide-react'
import { useToastStore, type Toast } from '@/store/toastStore'

function ToastItem({ toast }: { toast: Toast }) {
  const remove = useToastStore((s) => s.remove)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const duration = toast.duration ?? 4000
    timerRef.current = setTimeout(() => remove(toast.id), duration)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [toast.id, toast.duration, remove])

  async function handleUndo() {
    if (timerRef.current) clearTimeout(timerRef.current)
    remove(toast.id)
    await toast.undoFn?.()
  }

  const IconMap = { success: CheckCircle, error: AlertCircle, info: Info }
  const Icon = IconMap[toast.type]
  const accentMap = {
    success: 'var(--success)',
    error:   'var(--danger)',
    info:    'var(--accent)',
  }
  const accent = accentMap[toast.type]

  return (
    <div
      role="alert"
      className="flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg animate-fade-in"
      style={{
        background:  'var(--surface2)',
        border:      `1px solid ${accent}44`,
        minWidth:    280,
        maxWidth:    380,
      }}
    >
      <Icon className="w-4 h-4 shrink-0" style={{ color: accent }} />
      <span className="flex-1 text-sm" style={{ color: 'var(--text-primary)' }}>
        {toast.message}
      </span>
      {toast.undoFn && (
        <button
          onClick={handleUndo}
          className="flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-lg hover:opacity-80 transition-opacity shrink-0"
          style={{ color: accent, background: `${accent}18` }}
        >
          <Undo2 className="w-3 h-3" />
          Desfazer
        </button>
      )}
      <button
        onClick={() => remove(toast.id)}
        className="hover:opacity-60 transition-opacity shrink-0"
        aria-label="Fechar"
        style={{ color: 'var(--text-muted)' }}
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}

export function ToastProvider() {
  const toasts = useToastStore((s) => s.toasts)

  if (toasts.length === 0) return null

  return (
    <div
      className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[9999] flex flex-col gap-2 items-center lg:bottom-6"
      aria-live="polite"
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </div>
  )
}
