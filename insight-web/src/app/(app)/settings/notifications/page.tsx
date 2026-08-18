'use client'

import { useRouter } from 'next/navigation'
import { ArrowLeft, Bell } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useRequireAuth } from '@/hooks/useRequireAuth'
import { api } from '@/lib/api'
import { Spinner } from '@/components/ui/Spinner'

interface NotifPrefs {
  likes: boolean
  comments: boolean
  follows: boolean
  messages: boolean
}

const defaultPrefs: NotifPrefs = { likes: true, comments: true, follows: true, messages: true }

const ITEMS: { key: keyof NotifPrefs; label: string; desc: string }[] = [
  { key: 'likes',    label: 'Gostos',            desc: 'Quando alguém gosta de um post teu' },
  { key: 'comments', label: 'Comentários',        desc: 'Quando alguém comenta nos teus posts' },
  { key: 'follows',  label: 'Novos seguidores',   desc: 'Quando alguém começa a seguir-te' },
  { key: 'messages', label: 'Mensagens',           desc: 'Quando receberes uma nova mensagem' },
]

export default function NotificationsSettingsPage() {
  const router = useRouter()
  const { isReady } = useRequireAuth()
  const qc = useQueryClient()
  const qKey = ['notif-settings']

  const { data: prefs, isLoading } = useQuery<NotifPrefs>({
    queryKey: qKey,
    queryFn:  () => api.get('/notifications/settings'),
    enabled:  isReady,
    initialData: defaultPrefs,
  })

  const saveMutation = useMutation({
    mutationFn: (updated: NotifPrefs) => api.patch('/notifications/settings', updated),
    onMutate: async (updated) => {
      await qc.cancelQueries({ queryKey: qKey })
      const prev = qc.getQueryData<NotifPrefs>(qKey)
      qc.setQueryData(qKey, updated)
      return { prev }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(qKey, ctx.prev)
    },
  })

  function toggle(key: keyof NotifPrefs) {
    if (!prefs) return
    const updated = { ...prefs, [key]: !prefs[key] }
    saveMutation.mutate(updated)
  }

  if (!isReady || isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner size="lg" />
      </div>
    )
  }

  const current = prefs ?? defaultPrefs

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

      <h1 className="text-xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
        Notificações
      </h1>
      <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
        Escolhe quais as notificações que queres receber.
      </p>

      <div className="card overflow-hidden">
        {ITEMS.map(({ key, label, desc }, i) => (
          <div
            key={key}
            className="flex items-center gap-4 px-4 py-3"
            style={{ borderBottom: i < ITEMS.length - 1 ? '1px solid var(--border)' : 'none' }}
          >
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: 'rgba(252,163,17,0.1)' }}
            >
              <Bell className="w-4 h-4" style={{ color: 'var(--accent)' }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{label}</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{desc}</p>
            </div>
            <button
              onClick={() => toggle(key)}
              disabled={saveMutation.isPending}
              className="relative w-11 h-6 rounded-full transition-colors shrink-0"
              style={{
                background: current[key] ? 'var(--accent)' : 'var(--surface2)',
                border: '1px solid var(--border)',
              }}
              role="switch"
              aria-checked={current[key]}
              aria-label={label}
            >
              <span
                className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full transition-transform"
                style={{ background: '#fff', transform: current[key] ? 'translateX(20px)' : 'translateX(0)' }}
              />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
