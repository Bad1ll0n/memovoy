'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff } from 'lucide-react'
import { AlertBanner } from '@/components/ui/AlertBanner'
import { Spinner } from '@/components/ui/Spinner'
import { AuthBrandPanel } from '@/components/auth/AuthBrandPanel'
import { MemovoyWordmark } from '@/components/ui/MemovoyLogo'
import { api, setAccessToken } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import type { AuthUser } from '@/store/authStore'

function validate(form: { username: string; email: string; password: string }) {
  const username = form.username.trim().toLowerCase()
  if (username.length < 3) return 'Nome de utilizador deve ter mínimo 3 caracteres.'
  if (!/^[a-z0-9_]{3,30}$/.test(username))
    return 'Só letras minúsculas, números e _ (3–30 chars).'
  if (!form.email.includes('@')) return 'Email inválido.'
  if (form.password.length < 8) return 'Password deve ter mínimo 8 caracteres.'
  if (!/(?=.*[A-Z])(?=.*\d)/.test(form.password))
    return 'Password deve conter pelo menos 1 letra maiúscula e 1 número.'
  return null
}

export default function RegisterPage() {
  const router = useRouter()
  const { setAuth, hydrate } = useAuthStore()

  const [form, setForm] = useState({ username: '', email: '', password: '' })
  const [showPwd, setShowPwd] = useState(false)
  const [error, setError] = useState('')
  const [infoMsg, setInfoMsg] = useState('')
  const [loading, setLoading] = useState(false)

  function set(field: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [field]: e.target.value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const validationError = validate(form)
    if (validationError) { setError(validationError); setInfoMsg(''); return }
    setError('')
    setInfoMsg('')
    setLoading(true)

    try {
      const result = await api.post<{ user?: AuthUser; accessToken?: string; message?: string }>(
        '/auth/register',
        {
          username: form.username.trim().toLowerCase(),
          email: form.email.trim().toLowerCase(),
          password: form.password,
        },
      )
      if (result.user && result.accessToken) {
        setAccessToken(result.accessToken)
        setAuth(result.user, result.accessToken)
        hydrate()
        router.replace(result.user.onboardingCompleted ? '/feed' : '/onboarding')
      } else {
        setInfoMsg(result.message ?? 'Verifica a tua caixa de email.')
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao criar conta.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen grid md:grid-cols-2">
      <AuthBrandPanel tagline="Junta-te à comunidade de viajantes e descobre o mundo." />

      {/* Right — form */}
      <div
        className="flex flex-col items-center justify-center p-6 min-h-screen md:min-h-0"
        style={{ background: 'var(--bg-body)' }}
      >
        <div className="w-full max-w-sm animate-fade-in">
          <div className="flex justify-center mb-8 md:hidden">
            <MemovoyWordmark color="var(--accent)" size="md" />
          </div>

          <h2 className="text-2xl font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
            Criar conta
          </h2>
          <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
            Já tens conta?{' '}
            <Link href="/auth/login" className="font-semibold hover:underline" style={{ color: 'var(--accent)' }}>
              Entrar
            </Link>
          </p>

          {error   && <div className="mb-4"><AlertBanner variant="danger" message={error} /></div>}
          {infoMsg && <div className="mb-4"><AlertBanner variant="info"   message={infoMsg} /></div>}

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label className="label" htmlFor="username">Nome de utilizador</label>
              <input
                id="username"
                type="text"
                autoComplete="username"
                className="input"
                placeholder="joao_viajante"
                value={form.username}
                onChange={set('username')}
                required
                disabled={loading}
                maxLength={30}
              />
            </div>

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
                  autoComplete="new-password"
                  className="input" style={{ paddingRight: '2.5rem' }}
                  placeholder="Mínimo 8 caracteres"
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

            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary w-full h-11 mt-2"
            >
              {loading ? <Spinner size="sm" /> : 'Criar conta'}
            </button>
          </form>

          <p className="mt-6 text-xs text-center" style={{ color: 'var(--text-muted)' }}>
            Ao registares-te, aceitas os{' '}
            <Link href="/terms" className="underline">Termos</Link>
            {' '}e a{' '}
            <Link href="/privacy" className="underline">Política de Privacidade</Link>.
          </p>
        </div>
      </div>
    </div>
  )
}
