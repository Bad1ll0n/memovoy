// src/app/auth/login/page.tsx
'use client'

import Link             from 'next/link'
import { useRouter }    from 'next/navigation'
import { useState, useEffect } from 'react'
import { useAuthStore } from '@/store/auth'
import { ApiError }     from '@/lib/api-client'
import { cn }           from '@/lib/utils'

export default function LoginPage() {
  const { login, isAuthenticated, isHydrated } = useAuthStore()
  const router = useRouter()

  const [email,     setEmail]     = useState('')
  const [password,  setPassword]  = useState('')
  const [showPwd,   setShowPwd]   = useState(false)
  const [error,     setError]     = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (isHydrated && isAuthenticated) router.replace('/feed')
  }, [isHydrated, isAuthenticated, router])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setIsLoading(true)
    try {
      await login(email, password)
      router.replace('/feed')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro inesperado. Tenta novamente.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-surface-subtle flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <Link href="/" className="flex items-center justify-center gap-2 mb-10">
          <span className="text-2xl">🌍</span>
          <span className="font-display text-2xl font-bold text-ink">MemoVoy</span>
        </Link>

        <div className="card p-8 space-y-6">
          <div>
            <h1 className="font-display text-2xl font-bold text-ink">Bem-vindo de volta</h1>
            <p className="text-ink-secondary text-sm mt-1">Inicia sessão para continuares</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-ink mb-1.5">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="o.teu@email.com"
                autoComplete="email"
                required
                className="input"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-ink mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPwd ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="A tua password"
                  autoComplete="current-password"
                  required
                  className={cn('input pr-11')}
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(!showPwd)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-tertiary hover:text-ink transition-colors"
                  tabIndex={-1}
                >
                  {showPwd ? '🙈' : '👁'}
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 text-red-700 text-sm">
                <span className="shrink-0 mt-0.5">⚠️</span>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading || !email || password.length < 8}
              className="btn-primary w-full py-3 text-base"
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  A entrar…
                </span>
              ) : 'Entrar'}
            </button>
          </form>

          <p className="text-center text-sm text-ink-secondary">
            Não tens conta?{' '}
            <Link href="/auth/register" className="text-blue font-medium hover:underline">
              Cria uma gratuitamente
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
