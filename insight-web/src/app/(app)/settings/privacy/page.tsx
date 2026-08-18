'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Lock, Globe } from 'lucide-react'
import { api } from '@/lib/api'
import { useRequireAuth } from '@/hooks/useRequireAuth'
import { useAuthStore } from '@/store/authStore'
import { Spinner } from '@/components/ui/Spinner'
import { AlertBanner } from '@/components/ui/AlertBanner'
import type { AuthUser } from '@/store/authStore'

export default function PrivacyPage() {
  const router = useRouter()
  const { isReady, user } = useRequireAuth()
  const { setAuth, accessToken } = useAuthStore()

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleToggle() {
    if (!user) return
    setSaving(true)
    setError('')
    try {
      const { user: updated } = await api.patch<{ user: AuthUser }>('/users/me', {
        isPrivate: !user.isPrivate,
      })
      setAuth(updated, accessToken!)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao actualizar privacidade.')
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

  if (!user) return null

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
        Privacidade
      </h1>

      {error && (
        <div className="mb-4">
          <AlertBanner variant="danger" message={error} />
        </div>
      )}

      <div className="card p-4">
        <div className="flex items-start gap-4">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: 'rgba(252,163,17,0.12)' }}
          >
            {user.isPrivate ? (
              <Lock className="w-5 h-5" style={{ color: 'var(--accent)' }} />
            ) : (
              <Globe className="w-5 h-5" style={{ color: 'var(--accent)' }} />
            )}
          </div>

          <div className="flex-1">
            <p className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
              {user.isPrivate ? 'Conta privada' : 'Conta pública'}
            </p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
              {user.isPrivate
                ? 'Apenas os teus seguidores podem ver os teus posts e roteiros.'
                : 'Qualquer pessoa pode ver os teus posts e roteiros.'}
            </p>
          </div>

          <button
            onClick={handleToggle}
            disabled={saving}
            className="relative w-11 h-6 rounded-full transition-colors shrink-0"
            style={{
              background: user.isPrivate ? 'var(--accent)' : 'var(--surface2)',
              border: '1px solid var(--border)',
            }}
            role="switch"
            aria-checked={user.isPrivate}
            aria-label="Conta privada"
          >
            {saving ? (
              <span className="absolute inset-0 flex items-center justify-center">
                <Spinner size="sm" />
              </span>
            ) : (
              <span
                className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full transition-transform"
                style={{
                  background: '#fff',
                  transform: user.isPrivate ? 'translateX(20px)' : 'translateX(0)',
                }}
              />
            )}
          </button>
        </div>
      </div>

      <div
        className="mt-4 rounded-xl p-4 text-xs"
        style={{
          background: 'rgba(252,163,17,0.06)',
          border: '1px solid rgba(252,163,17,0.15)',
          color: 'var(--text-secondary)',
        }}
      >
        <p className="font-semibold mb-1" style={{ color: 'var(--accent)' }}>
          O que muda ao tornar a conta privada?
        </p>
        <ul className="list-disc list-inside space-y-1">
          <li>Os teus posts deixam de aparecer no Explorar</li>
          <li>Só seguidores aprovados podem ver o teu perfil completo</li>
          <li>Os teus roteiros ficam visíveis apenas para ti e seguidores</li>
        </ul>
      </div>
    </div>
  )
}
