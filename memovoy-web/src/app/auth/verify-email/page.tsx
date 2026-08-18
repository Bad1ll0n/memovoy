'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { CheckCircle, XCircle, Loader2 } from 'lucide-react'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'

type State = 'loading' | 'success' | 'error'

function VerifyEmailContent() {
  const searchParams = useSearchParams()
  const router       = useRouter()
  const { user, setAuth, accessToken } = useAuthStore()
  const token = searchParams.get('token')

  // A falta de token é derivável do URL durante o render — não precisa de um
  // efeito a corrigir o estado depois de pintar.
  const [resultado, setResultado] = useState<{ state: State; msg: string } | null>(null)
  const state = resultado?.state ?? (token ? 'loading' : 'error')
  const msg   = resultado?.msg   ?? (token ? '' : 'Token em falta.')

  useEffect(() => {
    if (!token) return

    fetch(`${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'}/auth/verify-email?token=${token}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.message ?? 'Token inválido ou expirado.')
        }
        setResultado({ state: 'success', msg: '' })
        if (user && accessToken) {
          setAuth({ ...user, emailVerified: true }, accessToken)
        }
        setTimeout(() => router.replace('/feed'), 2500)
      })
      .catch((err: Error) => {
        setResultado({ state: 'error', msg: err.message })
      })
  }, [token]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: 'var(--bg-body)' }}
    >
      <div className="w-full max-w-sm text-center">
        <p className="text-xl font-extrabold tracking-widest uppercase mb-8" style={{ color: 'var(--accent)' }}>
          Memovoy
        </p>

        {state === 'loading' && (
          <>
            <Loader2 className="w-12 h-12 animate-spin mx-auto mb-4" style={{ color: 'var(--accent)' }} />
            <p style={{ color: 'var(--text-muted)' }}>A verificar o teu email…</p>
          </>
        )}

        {state === 'success' && (
          <>
            <CheckCircle className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--success, #22c55e)' }} />
            <h1 className="text-xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
              Email verificado!
            </h1>
            <p style={{ color: 'var(--text-muted)' }}>A redirecionar…</p>
          </>
        )}

        {state === 'error' && (
          <>
            <XCircle className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--danger, #ef4444)' }} />
            <h1 className="text-xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
              Verificação falhada
            </h1>
            <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>{msg}</p>
            <button
              onClick={() => router.replace('/feed')}
              className="btn btn-primary"
            >
              Ir para o início
            </button>
          </>
        )}
      </div>
    </div>
  )
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg-body)' }}>
          <Loader2 className="w-12 h-12 animate-spin" style={{ color: 'var(--accent)' }} />
        </div>
      }
    >
      <VerifyEmailContent />
    </Suspense>
  )
}
