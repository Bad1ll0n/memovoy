'use client'

import Link from 'next/link'
import { useState } from 'react'
import { ArrowLeft, CheckCircle } from 'lucide-react'
import { AlertBanner } from '@/components/ui/AlertBanner'
import { Spinner } from '@/components/ui/Spinner'
import { AuthBrandPanel } from '@/components/auth/AuthBrandPanel'
import { MemovoyWordmark } from '@/components/ui/MemovoyLogo'
import { api } from '@/lib/api'

export default function ForgotPasswordPage() {
  const [email, setEmail]     = useState('')
  const [sent, setSent]       = useState(false)
  const [error, setError]     = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return
    setError('')
    setLoading(true)

    try {
      await api.post('/auth/forgot-password', { email: email.trim().toLowerCase() })
      setSent(true)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Ocorreu um erro. Tenta novamente.')
    } finally {
      setLoading(false)
    }
  }

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

          {sent ? (
            <div className="flex flex-col items-center text-center gap-4">
              <CheckCircle className="w-12 h-12" style={{ color: 'var(--success)' }} />
              <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
                Email enviado
              </h2>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                Se existe uma conta com <strong>{email}</strong>, receberás um link
                para repor a password. Verifica também a pasta de spam.
              </p>
              <Link href="/auth/login" className="btn btn-secondary w-full h-11 mt-2 flex items-center justify-center gap-2">
                <ArrowLeft className="w-4 h-4" />
                Voltar ao login
              </Link>
            </div>
          ) : (
            <>
              <Link
                href="/auth/login"
                className="inline-flex items-center gap-1.5 text-sm mb-6 hover:underline"
                style={{ color: 'var(--text-muted)' }}
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Voltar ao login
              </Link>

              <h2 className="text-2xl font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
                Esqueceste a password?
              </h2>
              <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
                Indica o teu email e enviamos um link para criares uma nova password.
              </p>

              {error && <div className="mb-4"><AlertBanner variant="danger" message={error} /></div>}

              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                <div>
                  <label className="label" htmlFor="email">Email</label>
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    autoFocus
                    className="input"
                    placeholder="tu@exemplo.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    disabled={loading}
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading || !email.trim()}
                  className="btn btn-primary w-full h-11 mt-2"
                >
                  {loading ? <Spinner size="sm" /> : 'Enviar link de recuperação'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
