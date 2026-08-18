'use client'

import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, UserPlus, UserCheck } from 'lucide-react'
import { api } from '@/lib/api'
import { useRequireAuth } from '@/hooks/useRequireAuth'
import { useAuthStore } from '@/store/authStore'
import { Avatar } from '@/components/ui/Avatar'
import { Spinner } from '@/components/ui/Spinner'

interface FollowUser {
  id: string
  username: string
  displayName: string
  avatarUrl: string | null
  isVerified: boolean
  viewerFollows: boolean
}

export default function FollowersPage() {
  const { userId } = useParams<{ userId: string }>()
  const router = useRouter()
  const { isReady } = useRequireAuth()
  const { user: me } = useAuthStore()
  const qc = useQueryClient()

  const { data, isLoading } = useQuery<{ users: FollowUser[] }>({
    queryKey: ['followers', userId],
    queryFn: () => api.get(`/users/${userId}/followers`),
    enabled: isReady,
  })

  if (!isReady || isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner size="lg" />
      </div>
    )
  }

  const users = data?.users ?? []

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

      <h1 className="text-xl font-bold mb-5" style={{ color: 'var(--text-primary)' }}>
        Seguidores ({users.length})
      </h1>

      {users.length === 0 ? (
        <p className="text-center text-sm py-8" style={{ color: 'var(--text-muted)' }}>
          Sem seguidores ainda.
        </p>
      ) : (
        <div className="space-y-2">
          {users.map((u) => (
            <UserRow
              key={u.id}
              user={u}
              isMe={me?.id === u.id}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function UserRow({ user, isMe }: { user: FollowUser; isMe: boolean }) {
  const qc = useQueryClient()
  const { userId } = useParams<{ userId: string }>()

  const followMutation = useMutation({
    mutationFn: () =>
      user.viewerFollows
        ? api.delete(`/users/${user.id}/follow`)
        : api.post(`/users/${user.id}/follow`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['followers', userId] })
    },
  })

  return (
    <div className="card p-3 flex items-center gap-3">
      <Link href={`/profile/${user.id}`}>
        <Avatar src={user.avatarUrl} name={user.displayName || user.username} size="md" />
      </Link>
      <div className="flex-1 min-w-0">
        <Link
          href={`/profile/${user.id}`}
          className="font-semibold text-sm hover:underline block truncate"
          style={{ color: 'var(--text-primary)' }}
        >
          {user.displayName || user.username}
        </Link>
        <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
          @{user.username}
        </p>
      </div>
      {!isMe && (
        <button
          onClick={() => followMutation.mutate()}
          disabled={followMutation.isPending}
          className={`btn text-xs px-3 py-1.5 gap-1.5 shrink-0 ${user.viewerFollows ? 'btn-secondary' : 'btn-primary'}`}
        >
          {followMutation.isPending ? (
            <Spinner size="sm" />
          ) : user.viewerFollows ? (
            <>
              <UserCheck className="w-3.5 h-3.5" />
              A seguir
            </>
          ) : (
            <>
              <UserPlus className="w-3.5 h-3.5" />
              Seguir
            </>
          )}
        </button>
      )}
    </div>
  )
}
