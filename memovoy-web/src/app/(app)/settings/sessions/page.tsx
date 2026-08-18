'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Monitor, Smartphone, Tablet, Trash2, Shield } from 'lucide-react'
import { api } from '@/lib/api'
import { useRequireAuth } from '@/hooks/useRequireAuth'
import { Spinner } from '@/components/ui/Spinner'
import { AlertBanner } from '@/components/ui/AlertBanner'
import { toast } from '@/store/toastStore'

interface Session {
  id: string
  jti: string
  deviceName: string | null
  ipAddress: string | null
  userAgent: string | null
  createdAt: string
  lastSeenAt: string
  expiresAt: string
}

function deviceIcon(ua: string | null) {
  if (!ua) return Monitor
  const lower = ua.toLowerCase()
  if (/mobile|android|iphone/.test(lower)) return Smartphone
  if (/ipad|tablet/.test(lower)) return Tablet
  return Monitor
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('pt-PT', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export default function SessionsPage() {
  const { isReady } = useRequireAuth()
  const qc = useQueryClient()
  const [revoking, setRevoking] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['device-sessions'],
    queryFn: () => api.get<{ sessions: Session[] }>('/users/me/sessions').then((r) => r.sessions),
    enabled: isReady,
  })

  const revokeMutation = useMutation({
    mutationFn: (jti: string) => api.delete(`/users/me/sessions/${jti}`),
    onSuccess: (_, jti) => {
      qc.setQueryData<Session[]>(['device-sessions'], (old) => old?.filter((s) => s.jti !== jti) ?? [])
      toast('Sessão revogada.', { type: 'success' })
      setRevoking(null)
    },
    onError: () => {
      toast('Erro ao revogar sessão.', { type: 'error' })
      setRevoking(null)
    },
  })

  if (!isReady || isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner size="lg" />
      </div>
    )
  }

  const sessions = data ?? []

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: 'rgba(34,152,206,0.12)' }}
        >
          <Shield className="w-5 h-5" style={{ color: 'var(--accent)' }} />
        </div>
        <div>
          <h1 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
            Sessões activas
          </h1>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {sessions.length} sessão(ões) activa(s)
          </p>
        </div>
      </div>

      {sessions.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Nenhuma sessão activa encontrada.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {sessions.map((session) => {
            const Icon = deviceIcon(session.userAgent)
            return (
              <div
                key={session.jti}
                className="card p-4 flex items-start gap-3"
              >
                <div
                  className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                  style={{ background: 'var(--surface2)' }}
                >
                  <Icon className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                    {session.deviceName
                      ? session.deviceName.slice(0, 60)
                      : 'Dispositivo desconhecido'}
                  </p>
                  {session.ipAddress && (
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                      IP: {session.ipAddress}
                    </p>
                  )}
                  <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                    Última actividade: {formatDate(session.lastSeenAt)}
                  </p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    Expira: {formatDate(session.expiresAt)}
                  </p>
                </div>
                {revoking === session.jti ? (
                  <div className="flex flex-col gap-1.5 shrink-0">
                    <p className="text-xs" style={{ color: 'var(--danger)' }}>Confirmar?</p>
                    <div className="flex gap-1">
                      <button
                        onClick={() => revokeMutation.mutate(session.jti)}
                        disabled={revokeMutation.isPending}
                        className="btn btn-danger text-xs py-1 px-2 gap-1"
                      >
                        {revokeMutation.isPending ? <Spinner size="sm" /> : 'Sim'}
                      </button>
                      <button
                        onClick={() => setRevoking(null)}
                        className="btn btn-secondary text-xs py-1 px-2"
                      >
                        Não
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setRevoking(session.jti)}
                    className="p-2 rounded-lg hover:opacity-80 transition-opacity shrink-0"
                    style={{ color: 'var(--danger)' }}
                    aria-label="Revogar sessão"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
