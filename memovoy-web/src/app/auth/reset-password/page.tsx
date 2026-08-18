'use client'

import Link from 'next/link'
import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Eye, EyeOff, CheckCircle, AlertCircle } from 'lucide-react'
import { AlertBanner } from '@/components/ui/AlertBanner'
import { Spinner } from '@/components/ui/Spinner'
import { AuthBrandPanel } from '@/components/auth/AuthBrandPanel'
import { MemovoyWordmark } from '@/components/ui/MemovoyLogo'
import { api } from '@/lib/api'

function ResetPasswordForm() {
  const router      = useRouter()
  const params      = useSearchParams()
  const token       = params.get('token') ?? ''

  const [password, setPassword]     = useState('')
  const [confirm, setConfirm]       = useState('')
  const [showPwd, setShowPwd]       = useState(false)
  const [done, setDone]             = useState(false)
  const [error, setError]           = useState('')
  const [loading, setLoading]       = useState(false)

  if (!token) {
    return (
      <div className="flex flex-col items-center text-center gap-4">
        <AlertCircle className="w-12 h-12" style={{ color: 'var(--danger)' }} />
        <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Link inválido</h2>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Este link de recuperação é inválido ou expirou.
        </p>
        <Link href="/auth/forgot-password" className="btn btn-primary w-full h-11 mt-2 flex items-center justify-center">
          Pedir novo link
        </Link>
      </div>
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirm) {
      setError('As passwords não coincidem.')
      return
    }
    setError('')
    setLoading(true)

    try {
      await api.post('/auth/reset-password', { token, password })
      setDone(true)
      setTimeout(() => router.replace('/auth/login'), 3000)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Ocorreu um erro. Tenta novamente.')
    } finally {
      setLoading(false)
    }
  }

  if (done) {
    return (
      <div className="flex flex-col items-center text-center gap-4">
        <CheckCircle className="w-12 h-12" style={{ color: 'var(--success)' }} />
        <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
          Password alterada
        </h2>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          A tua password foi actualizada. Vais ser redirecionado para o login…
        </p>
      </div>
    )
  }

  return (
    <>
      <h2 className="text-2xl font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
        Nova password
      </h2>
      <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
        Cria uma nova password com pelo menos 8 caracteres, 1 maiúscula e 1 número.
      </p>

      {error && <div className="mb-4"><AlertBanner variant="danger" message={error} /></div>}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <label className="label" htmlFor="password">Nova password</label>
          <div className="relative">
            <input
              id="password"
              type={showPwd ? 'text' : 'password'}
              autoComplete="new-password"
              autoFocus
              className="input"
              style={{ paddingRight: '2.5rem' }}
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={loading}
            />
            <button
              type="button"
              onClick={() => setShowPwd((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2"
              style={{ color: 'var(--text-muted)' }}
              aria-label={showPwd ? 'Ocultar password' : 'Mostrar password'}
            >
              {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <div>
          <label className="label" htmlFor="confirm">Confirmar password</label>
          <input
            id="confirm"
            type="password"
            autoComplete="new-password"
            className="input"
            placeholder="••••••••"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            disabled={loading}
          />
        </div>

        <button
          type="submit"
          disabled={loading || !password || !confirm}
          className="btn btn-primary w-full h-11 mt-2"
        >
          {loading ? <Spinner size="sm" /> : 'Guardar nova password'}
        </button>
      </form>
    </>
  )
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen grid md:grid-cols-2">
      <AuthBrandPanel />

      <div
        className="flex flex-col items-center justify-center p-6 min-h-screen md:min-h-0"
        style={{ background: 'var(--bg-body)' }}
      >
        <div className="w-full max-w-sm animate-fade-in">
          <div className="flex justify-center mb-8 md:hidden">
            <MemovoyWordmark color="var(--accent)" size="md" />
          </div>
          <Suspense fallback={<Spinner />}>
            <ResetPasswordForm />
          </Suspense>
        </div>
      </div>
    </div>
  )
}
