'use client'

import { useState } from 'react'
import { Mail, X } from 'lucide-react'
import { useMutation } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'

export function EmailVerificationBanner() {
  const { user } = useAuthStore()
  const [dismissed, setDismissed] = useState(false)
  const [sent, setSent] = useState(false)

  const resendMutation = useMutation({
    mutationFn: () => api.post('/auth/resend-verification'),
    onSuccess: () => setSent(true),
  })

  if (!user || user.emailVerified || dismissed) return null

  return (
    <div
      className="flex items-center gap-3 px-4 py-2.5 text-sm"
      style={{
        background:  'rgba(252,163,17,0.12)',
        borderBottom: '1px solid rgba(252,163,17,0.3)',
      }}
    >
      <Mail className="w-4 h-4 shrink-0" style={{ color: 'var(--accent)' }} />
      <span className="flex-1" style={{ color: 'var(--text-primary)' }}>
        Verifica o teu email para desbloquear todas as funcionalidades.{' '}
        {!sent ? (
          <button
            onClick={() => resendMutation.mutate()}
            disabled={resendMutation.isPending}
            className="underline font-medium"
            style={{ color: 'var(--accent)' }}
          >
            {resendMutation.isPending ? 'A enviar…' : 'Reenviar email'}
          </button>
        ) : (
          <span style={{ color: 'var(--accent)' }}>Email enviado! Verifica a tua caixa.</span>
        )}
      </span>
      <button
        onClick={() => setDismissed(true)}
        style={{ color: 'var(--text-muted)' }}
        aria-label="Fechar aviso"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}
