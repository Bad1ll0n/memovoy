'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Users, UserPlus, X, Crown } from 'lucide-react'
import { api } from '@/lib/api'
import { Avatar } from '@/components/ui/Avatar'
import { Spinner } from '@/components/ui/Spinner'

interface Collaborator {
  userId:      string
  username:    string
  displayName: string
  avatarUrl:   string | null
  role:        'viewer' | 'editor'
  accepted:    boolean
  invitedAt:   string
}

interface Props {
  itineraryId: string
  isOwner:     boolean
  ownerId:     string
  ownerUsername: string
}

export function CollaboratorsPanel({ itineraryId, isOwner, ownerId, ownerUsername }: Props) {
  const qc   = useQueryClient()
  const qKey = ['itinerary-collaborators', itineraryId]

  const [inviteUsername, setInviteUsername] = useState('')
  const [inviteRole,     setInviteRole]     = useState<'viewer' | 'editor'>('viewer')
  const [inviteError,    setInviteError]    = useState('')

  const { data, isLoading } = useQuery<{ collaborators: Collaborator[] }>({
    queryKey: qKey,
    queryFn:  () => api.get(`/itineraries/${itineraryId}/collaborators`),
    enabled:  isOwner,
  })

  // Resolve username → userId via search
  const inviteMutation = useMutation({
    mutationFn: async () => {
      const { users } = await api.get<{ users: { id: string; username: string }[] }>(
        `/search?q=${encodeURIComponent(inviteUsername.replace('@', '').trim())}`,
      )
      const needle      = inviteUsername.replace('@', '').trim().toLowerCase()
      const targetUser  = users?.find((u) => u.username.toLowerCase() === needle)
      if (!targetUser) throw new Error('Utilizador não encontrado.')
      return api.post(`/itineraries/${itineraryId}/collaborators`, { userId: targetUser.id, role: inviteRole })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qKey })
      setInviteUsername('')
      setInviteError('')
    },
    onError: (err: unknown) => {
      setInviteError(err instanceof Error ? err.message : 'Erro ao convidar.')
    },
  })

  const removeMutation = useMutation({
    mutationFn: (userId: string) => api.delete(`/itineraries/${itineraryId}/collaborators/${userId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: qKey }),
  })

  if (!isOwner) return null

  const collaborators = data?.collaborators ?? []

  return (
    <div className="card p-4 mt-4">
      <div className="flex items-center gap-2 mb-4">
        <Users className="w-4 h-4" style={{ color: 'var(--accent)' }} />
        <h3 className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>
          Colaboradores
        </h3>
      </div>

      {/* Invite form */}
      <form
        onSubmit={(e) => { e.preventDefault(); if (inviteUsername.trim()) inviteMutation.mutate() }}
        className="flex gap-2 mb-4"
      >
        <input
          type="text"
          className="input flex-1 text-sm"
          placeholder="@username"
          value={inviteUsername}
          onChange={(e) => { setInviteUsername(e.target.value); setInviteError('') }}
          maxLength={50}
        />
        <select
          className="input text-sm shrink-0"
          style={{ width: 'auto', padding: '0.4rem 0.5rem' }}
          value={inviteRole}
          onChange={(e) => setInviteRole(e.target.value as 'viewer' | 'editor')}
        >
          <option value="viewer">Leitor</option>
          <option value="editor">Editor</option>
        </select>
        <button
          type="submit"
          disabled={inviteMutation.isPending || !inviteUsername.trim()}
          className="btn btn-secondary shrink-0 p-2"
          aria-label="Convidar"
        >
          {inviteMutation.isPending ? <Spinner size="sm" /> : <UserPlus className="w-4 h-4" />}
        </button>
      </form>

      {inviteError && (
        <p className="text-xs mb-3" style={{ color: 'var(--danger)' }}>{inviteError}</p>
      )}

      {isLoading ? (
        <div className="flex justify-center py-4"><Spinner /></div>
      ) : (
        <ul className="flex flex-col gap-2">
          {/* Owner row */}
          <li className="flex items-center gap-2.5 py-1">
            <div className="w-5 h-5 flex items-center justify-center shrink-0">
              <Crown className="w-3.5 h-3.5" style={{ color: 'var(--gold)' }} />
            </div>
            <span className="flex-1 text-sm" style={{ color: 'var(--text-primary)' }}>
              @{ownerUsername}
            </span>
            <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--surface2)', color: 'var(--text-muted)' }}>
              Dono
            </span>
          </li>

          {collaborators.map((c) => (
            <li key={c.userId} className="flex items-center gap-2.5 py-1">
              <Avatar src={c.avatarUrl} name={c.displayName} size="sm" />
              <span className="flex-1 text-sm min-w-0 truncate" style={{ color: 'var(--text-primary)' }}>
                @{c.username}
              </span>
              <span
                className="text-xs px-2 py-0.5 rounded-full shrink-0"
                style={{
                  background: c.role === 'editor' ? 'rgba(201,243,29,0.15)' : 'var(--surface2)',
                  color:      c.role === 'editor' ? 'var(--accent)' : 'var(--text-muted)',
                }}
              >
                {c.role === 'editor' ? 'Editor' : 'Leitor'}
                {!c.accepted && ' · Pendente'}
              </span>
              <button
                onClick={() => removeMutation.mutate(c.userId)}
                disabled={removeMutation.isPending}
                className="btn btn-ghost p-1 shrink-0 hover:opacity-70"
                style={{ color: 'var(--text-muted)' }}
                aria-label={`Remover ${c.username}`}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </li>
          ))}

          {collaborators.length === 0 && (
            <p className="text-xs text-center py-2" style={{ color: 'var(--text-muted)' }}>
              Nenhum colaborador ainda. Convida alguém!
            </p>
          )}
        </ul>
      )}
    </div>
  )
}
