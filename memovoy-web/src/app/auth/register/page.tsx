// src/app/auth/register/page.tsx
'use client'

import Link             from 'next/link'
import { useRouter }    from 'next/navigation'
import { useState }     from 'react'
import { useAuthStore } from '@/store/auth'
import { ApiError }     from '@/lib/api-client'
import { cn }           from '@/lib/utils'

// Força da password: 0–4
function passwordStrength(pwd: string): { score: number; label: string; color: string } {
  let score = 0
  if (pwd.length >= 8)                                  score++
  if (pwd.length >= 12)                                 score++
  if (/[A-Z]/.test(pwd))                               score++
  if (/[0-9]/.test(pwd))                               score++
  const levels = [
    { label: 'Muito fraca',  color: 'bg-red-500'    },
    { label: 'Fraca',        color: 'bg-amber-400'  },
    { label: 'Razoável',     color: 'bg-yellow-400' },
    { label: 'Boa',          color: 'bg-green-500'  },
    { label: 'Excelente',    color: 'bg-green-600'  },
  ]
  return { score, ...levels[score] }
}

const COUNTRIES = [
  { code: 'PT', label: '🇵🇹 Portugal'  },
  { code: 'BR', label: '🇧🇷 Brasil'    },
  { code: 'ES', label: '🇪🇸 Espanha'   },
  { code: 'FR', label: '🇫🇷 França'    },
  { code: 'DE', label: '🇩🇪 Alemanha'  },
  { code: 'GB', label: '🇬🇧 Reino Unido'},
  { code: 'US', label: '🇺🇸 EUA'       },
  { code: 'XX', label: '🌍 Outro'      },
]

export default function RegisterPage() {
  const { register }  = useAuthStore()
  const router        = useRouter()

  const [form, setForm] = useState({
    email: '', username: '', password: '', countryCode: 'PT',
  })
  const [showPwd,   setShowPwd]   = useState(false)
  const [accepted,  setAccepted]  = useState(false)
  const [error,     setError]     = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const pwd     = passwordStrength(form.password)
  const usnameErr =
    !form.username ? null :
    form.username.length < 3    ? 'Mínimo 3 caracteres' :
    form.username.length > 30   ? 'Máximo 30 caracteres' :
    !/^[a-z0-9_]+$/.test(form.username) ? 'Só letras minúsculas, números e _' :
    null

  const canSubmit =
    form.email && form.username.length >= 3 && !usnameErr &&
    pwd.score >= 2 && accepted && !isLoading

  function setField(k: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      const v = k === 'username' ? e.target.value.toLowerCase() : e.target.value
      setForm((f) => ({ ...f, [k]: v }))
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setError(null)
    setIsLoading(true)
    try {
      await register({ ...form, language: 'pt-PT' })
      router.replace('/feed')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro inesperado.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-surface-subtle flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <Link href="/" className="flex items-center justify-center gap-2 mb-10">
          <span className="text-2xl">🌍</span>
          <span className="font-display text-2xl font-bold text-ink">MemoVoy</span>
        </Link>

        <div className="card p-8 space-y-6">
          <div>
            <h1 className="font-display text-2xl font-bold text-ink">Cria a tua conta</h1>
            <p className="text-ink-secondary text-sm mt-1">Grátis, para sempre</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-ink mb-1.5">Email</label>
              <input
                type="email" value={form.email} onChange={setField('email')}
                placeholder="o.teu@email.com" autoComplete="email" required
                className="input"
              />
            </div>

            {/* Username */}
            <div>
              <label className="block text-sm font-medium text-ink mb-1.5">Username</label>
              <input
                type="text" value={form.username} onChange={setField('username')}
                placeholder="o_teu_username" autoComplete="username"
                className={cn('input', usnameErr && 'border-red-400 focus:border-red-400 focus:ring-red-200')}
              />
              {usnameErr && (
                <p className="text-red-500 text-xs mt-1">{usnameErr}</p>
              )}
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-medium text-ink mb-1.5">Password</label>
              <div className="relative">
                <input
                  type={showPwd ? 'text' : 'password'} value={form.password}
                  onChange={setField('password')} placeholder="Mínimo 8 caracteres"
                  autoComplete="new-password" className="input pr-11"
                />
                <button
                  type="button" onClick={() => setShowPwd(!showPwd)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-tertiary hover:text-ink"
                  tabIndex={-1}
                >
                  {showPwd ? '🙈' : '👁'}
                </button>
              </div>
              {form.password && (
                <div className="mt-2 space-y-1">
                  <div className="flex gap-1">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <div
                        key={i}
                        className={cn(
                          'h-1 flex-1 rounded-full transition-colors duration-300',
                          i < pwd.score ? pwd.color : 'bg-surface-muted'
                        )}
                      />
                    ))}
                  </div>
                  <p className="text-xs text-ink-secondary">{pwd.label}</p>
                </div>
              )}
            </div>

            {/* País */}
            <div>
              <label className="block text-sm font-medium text-ink mb-1.5">País</label>
              <select
                value={form.countryCode}
                onChange={setField('countryCode')}
                className="input appearance-none"
              >
                {COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>{c.label}</option>
                ))}
              </select>
            </div>

            {/* Termos */}
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)}
                className="mt-0.5 rounded border-surface-muted accent-blue"
              />
              <span className="text-sm text-ink-secondary">
                Aceito os{' '}
                <a href="/terms" className="text-blue hover:underline">Termos de Serviço</a>
                {' '}e a{' '}
                <a href="/privacy" className="text-blue hover:underline">Política de Privacidade</a>
              </span>
            </label>

            {error && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 text-red-700 text-sm">
                <span className="shrink-0 mt-0.5">⚠️</span>
                {error}
              </div>
            )}

            <button
              type="submit" disabled={!canSubmit}
              className="btn-primary w-full py-3 text-base"
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  A criar conta…
                </span>
              ) : 'Criar conta'}
            </button>
          </form>

          <p className="text-center text-sm text-ink-secondary">
            Já tens conta?{' '}
            <Link href="/auth/login" className="text-blue font-medium hover:underline">
              Entra aqui
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
