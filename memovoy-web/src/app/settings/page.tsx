// src/app/settings/page.tsx
'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/auth'
import { api, ApiError } from '@/lib/api-client'
import { NavBar } from '@/components/layout/NavBar'

export default function SettingsPage() {
  const { user, isAuthenticated, isHydrated, logout } = useAuthStore()
  const router = useRouter()

  // Auth guard — evita flash de redirect antes da hidratação
  useEffect(() => {
    if (isHydrated && !isAuthenticated) router.replace('/auth/login')
  }, [isHydrated, isAuthenticated, router])

  if (!isHydrated || !isAuthenticated) return null

  return (
    <div className="min-h-screen bg-surface-subtle">
      <NavBar />
      <main className="max-w-2xl mx-auto px-4 py-8 pb-24 md:pb-8 space-y-6">
        <h1 className="font-display text-2xl font-bold text-ink">Definições</h1>

        <AccountSection username={user?.username} onLogout={logout} />
        <DangerZone />
      </main>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Secção: conta
// ---------------------------------------------------------------------------

function AccountSection({ username, onLogout }: { username?: string; onLogout: () => void }) {
  const router = useRouter()

  return (
    <section className="card p-5 space-y-4">
      <h2 className="font-semibold text-ink">Conta</h2>
      <div className="flex items-center justify-between text-sm">
        <span className="text-ink-secondary">Utilizador</span>
        <span className="text-ink font-medium">@{username}</span>
      </div>
      <button
        onClick={async () => { await onLogout(); router.push('/') }}
        className="btn-secondary text-sm w-full"
      >
        Terminar sessão
      </button>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Secção: zona de perigo — eliminação de conta
// ---------------------------------------------------------------------------

function DangerZone() {
  const [open, setOpen] = useState(false)

  return (
    <section className="card-danger p-5 space-y-4">
      <h2 className="font-semibold text-red-600">Zona de perigo</h2>
      <p className="text-sm text-ink-secondary leading-relaxed">
        Eliminar a tua conta remove permanentemente o teu email, nome de
        utilizador, perfil e roteiros privados. Esta acção é irreversível e
        cumpre os teus direitos ao abrigo do RGPD e da LGPD.
      </p>

      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="text-sm font-medium text-red-600 hover:text-red-700 underline underline-offset-2"
        >
          Eliminar a minha conta
        </button>
      ) : (
        <DeleteAccountForm onCancel={() => setOpen(false)} />
      )}
    </section>
  )
}

function DeleteAccountForm({ onCancel }: { onCancel: () => void }) {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirmText, setConfirmText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canSubmit = password.length > 0 && confirmText === 'ELIMINAR'

  async function handleDelete() {
    if (!canSubmit) return
    setLoading(true)
    setError(null)
    try {
      await api.delete('/users/me', { password })
      // Limpar qualquer estado local e redirecionar — a conta já não existe
      useAuthStore.getState().logout().catch(() => {})
      router.push('/')
    } catch (err) {
      if (err instanceof ApiError) {
        setError(
          err.isValidation
            ? 'Password incorrecta. Confirma e tenta novamente.'
            : err.message
        )
      } else {
        setError('Algo correu mal. Tenta novamente.')
      }
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4 rounded-lg border border-red-200 bg-red-50/50 p-4">
      <p className="text-sm text-ink font-medium">
        Esta acção não pode ser desfeita. Para confirmar:
      </p>

      <div className="space-y-2">
        <label className="text-xs text-ink-secondary font-medium" htmlFor="confirm-password">
          A tua password
        </label>
        <input
          id="confirm-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-lg border border-surface-muted px-3 py-2 text-sm
                     focus:outline-none focus:ring-2 focus:ring-red-300 focus:border-red-400"
          placeholder="Password actual"
          autoComplete="current-password"
        />
      </div>

      <div className="space-y-2">
        <label className="text-xs text-ink-secondary font-medium" htmlFor="confirm-text">
          Escreve <span className="font-mono font-semibold text-red-600">ELIMINAR</span> para confirmar
        </label>
        <input
          id="confirm-text"
          type="text"
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          className="w-full rounded-lg border border-surface-muted px-3 py-2 text-sm font-mono
                     focus:outline-none focus:ring-2 focus:ring-red-300 focus:border-red-400"
          placeholder="ELIMINAR"
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-2 pt-1">
        <button
          onClick={onCancel}
          disabled={loading}
          className="btn-secondary text-sm flex-1"
        >
          Cancelar
        </button>
        <button
          onClick={handleDelete}
          disabled={!canSubmit || loading}
          className="btn-danger flex-1"
        >
          {loading ? 'A eliminar…' : 'Eliminar definitivamente'}
        </button>
      </div>
    </div>
  )
}
