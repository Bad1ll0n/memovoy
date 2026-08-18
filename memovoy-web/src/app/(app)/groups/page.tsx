'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Users, Plus, Lock, Globe, Search, MapPin, UserCheck, UserPlus } from 'lucide-react'
import { api } from '@/lib/api'
import { useRequireAuth } from '@/hooks/useRequireAuth'
import { useAuthStore } from '@/store/authStore'
import { Spinner } from '@/components/ui/Spinner'
import { Skeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'

interface Group {
  id: string
  name: string
  description: string | null
  destination: string | null
  isPrivate: boolean
  coverUrl: string | null
  membersCount: number
  postsCount: number
  viewerIsMember: boolean
  viewerIsOwner: boolean
  owner: { id: string; username: string; displayName: string; avatarUrl: string | null }
}

function CreateGroupModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [name, setName]             = useState('')
  const [desc, setDesc]             = useState('')
  const [destination, setDest]      = useState('')
  const [isPrivate, setIsPrivate]   = useState(false)
  const [error, setError]           = useState('')
  const qc                          = useQueryClient()

  const createMutation = useMutation({
    mutationFn: () => api.post<{ id: string }>('/groups', { name: name.trim(), description: desc.trim() || undefined, destination: destination.trim() || undefined, isPrivate }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['groups'] })
      onCreated(data.id)
    },
    onError: (err: unknown) => setError(err instanceof Error ? err.message : 'Erro ao criar grupo.'),
  })

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="card w-full max-w-md p-6 flex flex-col gap-4">
        <h2 className="font-bold text-lg" style={{ color: 'var(--text-primary)' }}>Criar grupo de viagem</h2>

        {error && <p className="text-sm" style={{ color: 'var(--danger)' }}>{error}</p>}

        <div>
          <label className="label">Nome do grupo *</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Ex: Lisboa 2026 🇵🇹" />
        </div>
        <div>
          <label className="label">Descrição</label>
          <textarea className="input resize-none" rows={2} value={desc} onChange={(e) => setDesc(e.target.value)} maxLength={500} placeholder="Do que se trata este grupo?" />
        </div>
        <div>
          <label className="label">Destino</label>
          <input className="input" value={destination} onChange={(e) => setDest(e.target.value)} maxLength={100} placeholder="Ex: Japão, Costa Rica…" />
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} className="rounded" />
          <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Grupo privado (apenas por convite)</span>
        </label>

        <div className="flex gap-2 mt-2">
          <button onClick={onClose} className="btn btn-secondary flex-1">Cancelar</button>
          <button
            onClick={() => createMutation.mutate()}
            disabled={!name.trim() || createMutation.isPending}
            className="btn btn-primary flex-1"
          >
            {createMutation.isPending ? <Spinner size="sm" /> : 'Criar grupo'}
          </button>
        </div>
      </div>
    </div>
  )
}

function GroupCard({ group }: { group: Group }) {
  const qc = useQueryClient()
  const joinMutation = useMutation({
    mutationFn: () => api.post(`/groups/${group.id}/join`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['groups'] }),
  })
  const leaveMutation = useMutation({
    mutationFn: () => api.delete(`/groups/${group.id}/leave`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['groups'] }),
  })

  return (
    <Link href={`/groups/${group.id}`} className="card overflow-hidden block hover:opacity-90 transition-opacity">
      {/* Cover */}
      <div
        className="w-full flex items-center justify-center"
        style={{ height: 100, background: 'radial-gradient(ellipse at 60% 40%, rgba(34,152,206,0.15), transparent 70%), var(--surface2)' }}
      >
        {group.coverUrl ? (
          <Image src={group.coverUrl} alt={group.name} fill className="object-cover" />
        ) : (
          <Users className="w-10 h-10" style={{ color: 'var(--accent)', opacity: 0.6 }} />
        )}
      </div>

      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-1.5">
          <h3 className="font-bold text-sm leading-tight" style={{ color: 'var(--text-primary)' }}>
            {group.name}
          </h3>
          {group.isPrivate ? (
            <Lock className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: 'var(--text-muted)' }} />
          ) : (
            <Globe className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: 'var(--text-muted)' }} />
          )}
        </div>

        {group.destination && (
          <div className="flex items-center gap-1 mb-2">
            <MapPin className="w-3 h-3" style={{ color: 'var(--accent)' }} />
            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{group.destination}</span>
          </div>
        )}

        <div className="flex items-center gap-3 text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
          <span>{group.membersCount} membro{group.membersCount !== 1 ? 's' : ''}</span>
          <span>·</span>
          <span>{group.postsCount} post{group.postsCount !== 1 ? 's' : ''}</span>
        </div>

        {!group.viewerIsOwner && !group.isPrivate && (
          <button
            onClick={(e) => {
              e.preventDefault()
              if (group.viewerIsMember) leaveMutation.mutate()
              else joinMutation.mutate()
            }}
            disabled={joinMutation.isPending || leaveMutation.isPending}
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg w-full justify-center transition-colors"
            style={{
              background: group.viewerIsMember ? 'var(--surface2)' : 'var(--accent)',
              color:      group.viewerIsMember ? 'var(--text-secondary)' : '#fff',
              border:     group.viewerIsMember ? '1px solid var(--border)' : 'none',
            }}
          >
            {(joinMutation.isPending || leaveMutation.isPending) ? (
              <Spinner size="sm" />
            ) : group.viewerIsMember ? (
              <><UserCheck className="w-3.5 h-3.5" /> Membro</>
            ) : (
              <><UserPlus className="w-3.5 h-3.5" /> Entrar</>
            )}
          </button>
        )}
        {group.viewerIsOwner && (
          <div className="flex items-center gap-1 text-xs" style={{ color: 'var(--accent)' }}>
            <UserCheck className="w-3.5 h-3.5" /> O teu grupo
          </div>
        )}
      </div>
    </Link>
  )
}

export default function GroupsPage() {
  const router = useRouter()
  const { isReady } = useRequireAuth()
  const { user } = useAuthStore()
  const [showCreate, setShowCreate] = useState(false)
  const [search, setSearch] = useState('')

  const { data, isLoading } = useQuery<{ groups: Group[] }>({
    queryKey: ['groups', search],
    queryFn: () => api.get(`/groups${search ? `?q=${encodeURIComponent(search)}` : ''}`),
    enabled: isReady,
  })

  if (!isReady || isLoading) return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <Skeleton className="h-7 w-48 rounded" />
        <Skeleton className="h-9 w-28 rounded-xl" />
      </div>
      <Skeleton className="h-10 w-full rounded-xl mb-5" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card overflow-hidden">
            <Skeleton className="w-full" style={{ height: 100 }} />
            <div className="p-4 flex flex-col gap-2.5">
              <Skeleton className="h-4 rounded" style={{ width: '65%' }} />
              <Skeleton className="h-3 rounded" style={{ width: '40%' }} />
              <Skeleton className="h-3 rounded" style={{ width: '50%' }} />
              <Skeleton className="h-8 w-full rounded-lg mt-1" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )

  const groups = data?.groups ?? []

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Grupos de Viagem</h1>
        {user && (
          <button onClick={() => setShowCreate(true)} className="btn btn-primary text-sm gap-1.5">
            <Plus className="w-4 h-4" /> Criar grupo
          </button>
        )}
      </div>

      {/* Search */}
      <div className="relative mb-5">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-muted)' }} />
        <input
          className="input pl-9"
          placeholder="Pesquisar grupos ou destinos…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {groups.length === 0 ? (
        <EmptyState
          Icon={Users}
          title="Nenhum grupo encontrado"
          description="Cria o primeiro grupo de viagem!"
          action={{ label: 'Criar grupo', onClick: () => setShowCreate(true) }}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {groups.map((g) => <GroupCard key={g.id} group={g} />)}
        </div>
      )}

      {showCreate && (
        <CreateGroupModal
          onClose={() => setShowCreate(false)}
          onCreated={(id) => { setShowCreate(false); router.push(`/groups/${id}`) }}
        />
      )}
    </div>
  )
}
