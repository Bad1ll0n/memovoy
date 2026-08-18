'use client'

import Link from 'next/link'
import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff, ShieldCheck } from 'lucide-react'
import { AlertBanner } from '@/components/ui/AlertBanner'
import { Spinner } from '@/components/ui/Spinner'
import { AuthBrandPanel } from '@/components/auth/AuthBrandPanel'
import { MemovoyWordmark } from '@/components/ui/MemovoyLogo'
import { api, setAccessToken } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import type { AuthUser } from '@/store/authStore'

export default function LoginPage() {
  const router = useRouter()
  const { setAuth, hydrate } = useAuthStore()

  const [form, setForm]           = useState({ email: '', password: '' })
  const [showPwd, setShowPwd]     = useState(false)
  const [error, setError]         = useState('')
  const [loading, setLoading]     = useState(false)
  const [tempToken, setTempToken] = useState<string | null>(null)
  const [totpCode, setTotpCode]   = useState('')
  const totpRef = useRef<HTMLInputElement>(null)

  function set(field: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [field]: e.target.value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.email.trim() || !form.password) return
    setError('')
    setLoading(true)

    try {
      const res = await api.post<{ user?: AuthUser; accessToken?: string; requires2fa?: boolean; tempToken?: string }>(
        '/auth/login',
        { email: form.email.trim().toLowerCase(), password: form.password },
      )
      if (res.requires2fa && res.tempToken) {
        setTempToken(res.tempToken)
        setTimeout(() => totpRef.current?.focus(), 50)
        return
      }
      setAccessToken(res.accessToken!)
      setAuth(res.user!, res.accessToken!)
      hydrate()
      router.replace('/feed')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Credenciais inválidas.')
    } finally {
      setLoading(false)
    }
  }

  async function handleTotp(e: React.FormEvent) {
    e.preventDefault()
    if (totpCode.length !== 6) return
    setError('')
    setLoading(true)
    try {
      const { user, accessToken } = await api.post<{ user: AuthUser; accessToken: string }>(
        '/auth/2fa/authenticate',
        { tempToken, code: totpCode },
      )
      setAccessToken(accessToken)
      setAuth(user, accessToken)
      hydrate()
      router.replace('/feed')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Código inválido.')
      setTotpCode('')
      totpRef.current?.focus()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen grid md:grid-cols-2">
      <AuthBrandPanel />

      {/* Right — form */}
      <div
        className="flex flex-col items-center justify-center p-6 min-h-screen md:min-h-0"
        style={{ background: 'var(--bg-body)' }}
      >
        <div className="w-full max-w-sm animate-fade-in">
          {/* Mobile brand */}
          <div className="flex justify-center mb-8 md:hidden">
            <MemovoyWordmark color="var(--accent)" size="md" />
          </div>

          {tempToken ? (
            /* ── TOTP step ── */
            <>
              <div className="flex items-center gap-2 mb-1">
                <ShieldCheck className="w-5 h-5" style={{ color: 'var(--accent)' }} />
                <h2 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
                  Verificação 2FA
                </h2>
              </div>
              <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
                Abre a tua app de autenticação e introduce o código de 6 dígitos.
              </p>

              {error && <div className="mb-4"><AlertBanner variant="danger" message={error} /></div>}

              <form onSubmit={handleTotp} className="flex flex-col gap-4">
                <div>
                  <label className="label" htmlFor="totp">Código de autenticação</label>
                  <input
                    ref={totpRef}
                    id="totp"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    className="input text-center text-2xl tracking-widest font-mono"
                    placeholder="000000"
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                    disabled={loading}
                  />
                </div>
                <button
                  type="submit"
                  disabled={totpCode.length !== 6 || loading}
                  className="btn btn-primary w-full h-11"
                >
                  {loading ? <Spinner size="sm" /> : 'Verificar'}
                </button>
                <button
                  type="button"
                  onClick={() => { setTempToken(null); setTotpCode(''); setError('') }}
                  className="text-xs text-center hover:underline"
                  style={{ color: 'var(--text-muted)' }}
                >
                  Voltar ao login
                </button>
              </form>
            </>
          ) : (
            /* ── Password step ── */
            <>
              <h2 className="text-2xl font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
                Bem-vindo de volta
              </h2>
              <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
                Não tens conta?{' '}
                <Link href="/auth/register" className="font-semibold hover:underline" style={{ color: 'var(--accent)' }}>
                  Regista-te
                </Link>
              </p>

              {error && <div className="mb-4"><AlertBanner variant="danger" message={error} /></div>}

              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                <div>
                  <label className="label" htmlFor="email">Email</label>
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    className="input"
                    placeholder="tu@exemplo.com"
                    value={form.email}
                    onChange={set('email')}
                    required
                    disabled={loading}
                  />
                </div>

                <div>
                  <label className="label" htmlFor="password">Password</label>
                  <div className="relative">
                    <input
                      id="password"
                      type={showPwd ? 'text' : 'password'}
                      autoComplete="current-password"
                      className="input" style={{ paddingRight: '2.5rem' }}
                      placeholder="••••••••"
                      value={form.password}
                      onChange={set('password')}
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

                <div className="flex justify-end -mt-2">
                  <Link
                    href="/auth/forgot-password"
                    className="text-xs hover:underline"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    Esqueceste a password?
                  </Link>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="btn btn-primary w-full h-11 mt-2"
                >
                  {loading ? <Spinner size="sm" /> : 'Entrar'}
                </button>
              </form>

              <p className="mt-6 text-xs text-center" style={{ color: 'var(--text-muted)' }}>
                Ao entrares, aceitas os{' '}
                <Link href="/terms" className="underline">Termos</Link>
                {' '}e a{' '}
                <Link href="/privacy" className="underline">Política de Privacidade</Link>.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
