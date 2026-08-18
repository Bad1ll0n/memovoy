'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  User, Lock, Bell, Trash2, ChevronRight, LogOut,
  Shield, Globe, Palette, ShieldCheck, Monitor, Download, Sparkles,
} from 'lucide-react'
import { useRequireAuth } from '@/hooks/useRequireAuth'
import { useTheme } from '@/hooks/useTheme'
import { useAuthStore } from '@/store/authStore'
import { api, setAccessToken } from '@/lib/api'
import { Avatar } from '@/components/ui/Avatar'
import { AlertBanner } from '@/components/ui/AlertBanner'
import { Spinner } from '@/components/ui/Spinner'

export default function SettingsPage() {
  const { isReady, user } = useRequireAuth()
  const { clearAuth } = useAuthStore()
  const { theme, toggle } = useTheme()
  const router = useRouter()

  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [deleteInput, setDeleteInput] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogout() {
    try {
      await api.post('/auth/logout')
    } finally {
      setAccessToken(null)
      clearAuth()
      router.replace('/auth/login')
    }
  }

  async function handleExport() {
    try {
      const token = (await import('@/lib/api')).getAccessToken()
      const res = await fetch(`${(await import('@/lib/api')).API_URL}/users/me/export`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (!res.ok) throw new Error()
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `memovoy-export-${Date.now()}.json`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch {
      setError('Erro ao exportar dados. Tenta novamente.')
    }
  }

  async function handleDeleteAccount() {
    if (deleteInput !== user?.username) return
    setLoading(true)
    try {
      await api.delete('/users/me')
      setAccessToken(null)
      clearAuth()
      router.replace('/auth/register')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao eliminar conta.')
      setLoading(false)
    }
  }

  if (!isReady) return <div className="flex justify-center py-12"><Spinner size="lg" /></div>
  if (!user) return null

  const sections = [
    {
      title: 'Conta',
      items: [
        { Icon: User, label: 'Editar perfil', href: `/profile/${user.id}/edit` },
        { Icon: Lock, label: 'Alterar password', href: '/settings/password' },
        { Icon: ShieldCheck, label: 'Segurança & 2FA', href: '/settings/security' },
        { Icon: Monitor, label: 'Sessões activas', href: '/settings/sessions' },
        { Icon: Shield, label: 'Privacidade', href: '/settings/privacy' },
        { Icon: Download, label: 'Exportar os meus dados', onClick: handleExport },
      ],
    },
    {
      title: 'Preferências',
      items: [
        { Icon: Bell, label: 'Notificações', href: '/settings/notifications' },
        { Icon: Globe, label: 'Idioma', href: '/settings/language' },
        {
          Icon: Palette,
          label: `Tema: ${theme === 'dark' ? 'Escuro' : 'Claro'}`,
          onClick: toggle,
        },
      ],
    },
  ]

  return (
    <div>
      <h1 className="text-xl font-bold mb-5" style={{ color: 'var(--text-primary)' }}>
        Definições
      </h1>

      {/* Profile mini card */}
      <div className="card p-4 flex items-center gap-4 mb-6">
        <Avatar src={user.avatarUrl} name={user.displayName || user.username} size="lg" />
        <div className="flex-1 min-w-0">
          <p className="font-bold text-base truncate" style={{ color: 'var(--text-primary)' }}>
            @{user.username}
          </p>
          <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
            {user.email}
          </p>
        </div>
        <Link
          href={`/profile/${user.id}`}
          className="btn btn-secondary text-sm shrink-0"
        >
          Ver perfil
        </Link>
      </div>

      {/* Memovoy Pro */}
      <div
        className="rounded-2xl p-4 mb-6 flex items-center gap-4"
        style={{
          background: 'linear-gradient(135deg, rgba(34,152,206,0.12) 0%, rgba(34,152,206,0.04) 100%)',
          border: '1px solid rgba(34,152,206,0.25)',
        }}
      >
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: 'rgba(34,152,206,0.15)' }}
        >
          <Sparkles className="w-5 h-5" style={{ color: 'var(--accent)' }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>Memovoy Pro</p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            IA ilimitada · Roteiros premium · Sem anúncios
          </p>
        </div>
        <button
          className="text-xs font-semibold px-3 py-1.5 rounded-lg shrink-0 cursor-not-allowed opacity-70"
          style={{ background: 'var(--accent)', color: '#fff' }}
          disabled
          title="Em breve"
        >
          Em breve
        </button>
      </div>

      {/* Sections */}
      {sections.map((section) => (
        <div key={section.title} className="mb-5">
          <p
            className="text-xs font-semibold uppercase tracking-widest px-1 mb-2"
            style={{ color: 'var(--text-muted)' }}
          >
            {section.title}
          </p>
          <div className="card overflow-hidden">
            {section.items.map(({ Icon, label, href, onClick }, i) => {
              const inner = (
                <div
                  className="flex items-center gap-3 px-4 py-3 transition-colors"
                  style={{
                    borderBottom: i < section.items.length - 1 ? '1px solid var(--border)' : 'none',
                  }}
                >
                  <Icon className="w-4 h-4 shrink-0" style={{ color: 'var(--text-muted)' }} />
                  <span className="flex-1 text-sm" style={{ color: 'var(--text-primary)' }}>
                    {label}
                  </span>
                  <ChevronRight className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
                </div>
              )

              return onClick ? (
                <button key={label} onClick={onClick} className="w-full text-left hover:opacity-80 transition-opacity">
                  {inner}
                </button>
              ) : (
                <Link key={label} href={href!} className="block hover:opacity-80 transition-opacity">
                  {inner}
                </Link>
              )
            })}
          </div>
        </div>
      ))}

      {/* Logout */}
      <div className="mb-5">
        <button
          onClick={handleLogout}
          className="btn btn-secondary w-full gap-2 text-sm"
          style={{ color: 'var(--danger)' }}
        >
          <LogOut className="w-4 h-4" />
          Terminar sessão
        </button>
      </div>

      {/* Danger zone */}
      <div className="card p-4" style={{ border: '1px solid rgba(248,113,113,0.3)' }}>
        <h3 className="font-bold text-sm mb-2" style={{ color: 'var(--danger)' }}>
          Zona de Perigo
        </h3>
        {!deleteConfirm ? (
          <button
            onClick={() => setDeleteConfirm(true)}
            className="btn btn-danger text-sm w-full gap-2"
          >
            <Trash2 className="w-4 h-4" />
            Eliminar conta
          </button>
        ) : (
          <div>
            {error && <div className="mb-3"><AlertBanner variant="danger" message={error} /></div>}
            <p className="text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>
              Escreve <strong style={{ color: 'var(--danger)' }}>@{user.username}</strong> para confirmar.
            </p>
            <input
              type="text"
              className="input mb-3"
              placeholder={user.username}
              value={deleteInput}
              onChange={(e) => setDeleteInput(e.target.value)}
            />
            <div className="flex gap-2">
              <button
                onClick={() => { setDeleteConfirm(false); setDeleteInput('') }}
                className="btn btn-secondary flex-1 text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={handleDeleteAccount}
                disabled={deleteInput !== user.username || loading}
                className="btn btn-danger flex-1 text-sm gap-1.5"
              >
                {loading ? <Spinner size="sm" /> : <Trash2 className="w-3.5 h-3.5" />}
                Eliminar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
