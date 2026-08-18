'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Eye, EyeOff, Lock } from 'lucide-react'
import { api } from '@/lib/api'
import { useRequireAuth } from '@/hooks/useRequireAuth'
import { Spinner } from '@/components/ui/Spinner'
import { AlertBanner } from '@/components/ui/AlertBanner'

export default function ChangePasswordPage() {
  const router = useRouter()
  const { isReady } = useRequireAuth()

  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNext, setShowNext] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSuccess(false)

    if (next.length < 8) {
      setError('A nova password deve ter pelo menos 8 caracteres.')
      return
    }
    if (next !== confirm) {
      setError('As passwords não coincidem.')
      return
    }

    setSaving(true)
    try {
      await api.post('/auth/change-password', {
        currentPassword: current,
        newPassword: next,
      })
      setSuccess(true)
      setCurrent('')
      setNext('')
      setConfirm('')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao alterar password.')
    } finally {
      setSaving(false)
    }
  }

  if (!isReady) {
    return (
      <div className="flex justify-center py-12">
        <Spinner size="lg" />
      </div>
    )
  }

  return (
    <div>
      <button
        onClick={() => router.back()}
        className="flex items-center gap-2 mb-5 text-sm hover:opacity-80 transition-opacity"
        style={{ color: 'var(--text-muted)' }}
      >
        <ArrowLeft className="w-4 h-4" />
        Voltar
      </button>

      <h1 className="text-xl font-bold mb-6" style={{ color: 'var(--text-primary)' }}>
        Alterar password
      </h1>

      {error && (
        <div className="mb-4">
          <AlertBanner variant="danger" message={error} />
        </div>
      )}
      {success && (
        <div className="mb-4">
          <AlertBanner variant="info" message="Password alterada com sucesso!" />
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Current password */}
        <div>
          <label className="label">Password actual</label>
          <div className="relative">
            <input
              type={showCurrent ? 'text' : 'password'}
              className="input" style={{ paddingRight: '2.5rem' }}
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete="current-password"
            />
            <button
              type="button"
              onClick={() => setShowCurrent((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2"
              style={{ color: 'var(--text-muted)' }}
              aria-label={showCurrent ? 'Ocultar' : 'Mostrar'}
            >
              {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* New password */}
        <div>
          <label className="label">Nova password</label>
          <div className="relative">
            <input
              type={showNext ? 'text' : 'password'}
              className="input" style={{ paddingRight: '2.5rem' }}
              value={next}
              onChange={(e) => setNext(e.target.value)}
              placeholder="Mínimo 8 caracteres"
              required
              minLength={8}
              autoComplete="new-password"
            />
            <button
              type="button"
              onClick={() => setShowNext((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2"
              style={{ color: 'var(--text-muted)' }}
              aria-label={showNext ? 'Ocultar' : 'Mostrar'}
            >
              {showNext ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Confirm */}
        <div>
          <label className="label">Confirmar nova password</label>
          <input
            type="password"
            className="input"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Repete a nova password"
            required
            autoComplete="new-password"
          />
        </div>

        <button type="submit" disabled={saving} className="btn btn-primary w-full gap-2">
          {saving ? <Spinner size="sm" /> : <Lock className="w-4 h-4" />}
          Alterar password
        </button>
      </form>
    </div>
  )
}
