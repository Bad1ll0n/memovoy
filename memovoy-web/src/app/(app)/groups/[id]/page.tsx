'use client'

import { useCallback, useRef, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Users, Lock, Globe, MapPin, Trash2, UserCheck, UserPlus, ChevronLeft, Camera, Mail, X, ArrowRightLeft } from 'lucide-react'
import { api } from '@/lib/api'
import { useRequireAuth } from '@/hooks/useRequireAuth'
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll'
import { PostCard } from '@/components/feed/PostCard'
import { Avatar } from '@/components/ui/Avatar'
import { Spinner } from '@/components/ui/Spinner'
import { AlertBanner } from '@/components/ui/AlertBanner'
import { EmptyState } from '@/components/ui/EmptyState'

interface GroupDetail {
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
  recentMembers: { id: string; username: string; displayName: string; avatarUrl: string | null }[]
}

interface FeedPage { posts: unknown[]; nextCursor: string | null }

export default function GroupDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { isReady } = useRequireAuth()
  const router = useRouter()
  const qc = useQueryClient()
  const coverInputRef = useRef<HTMLInputElement>(null)
  const [coverUploading, setCoverUploading]   = useState(false)
  const [inviteOpen, setInviteOpen]           = useState(false)
  const [inviteQuery, setInviteQuery]         = useState('')
  const [inviteFound, setInviteFound]         = useState<{ id: string; username: string; avatarUrl: string | null } | null>(null)
  const [inviteSearching, setInviteSearching] = useState(false)
  const [inviteMsg, setInviteMsg]             = useState('')
  const [transferOpen, setTransferOpen]       = useState(false)
  const [transferQuery, setTransferQuery]     = useState('')
  const [transferFound, setTransferFound]     = useState<{ id: string; username: string } | null>(null)

  const { data: group, isLoading, error } = useQuery<GroupDetail>({
    queryKey: ['group', id],
    queryFn: () => api.get(`/groups/${id}`),
    enabled: isReady,
  })

  const { data: feedData, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteQuery<FeedPage>({
      queryKey: ['group-feed', id],
      queryFn: ({ pageParam }) => api.get(`/groups/${id}/feed${pageParam ? `?cursor=${pageParam}` : ''}`),
      initialPageParam: null as string | null,
      getNextPageParam: (last) => last.nextCursor,
      enabled: isReady && !!group,
    })

  const joinMutation = useMutation({
    mutationFn: () => api.post(`/groups/${id}/join`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['group', id] }); qc.invalidateQueries({ queryKey: ['groups'] }) },
  })

  const leaveMutation = useMutation({
    mutationFn: () => api.delete(`/groups/${id}/leave`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['group', id] }); qc.invalidateQueries({ queryKey: ['groups'] }) },
  })

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/groups/${id}`),
    onSuccess: () => router.replace('/groups'),
  })

  const inviteMutation = useMutation({
    mutationFn: (userId: string) => api.post(`/groups/${id}/invite`, { userId }),
    onSuccess: () => { setInviteMsg('Convite enviado!'); setInviteFound(null); setInviteQuery('') },
    onError: (err: Error) => setInviteMsg(err.message),
  })

  const transferMutation = useMutation({
    mutationFn: (userId: string) => api.patch(`/groups/${id}/transfer`, { userId }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['group', id] }); setTransferOpen(false) },
  })

  async function handleInviteSearch() {
    if (!inviteQuery.trim()) return
    setInviteSearching(true)
    setInviteMsg('')
    try {
      const res = await api.get<{ users?: { id: string; username: string; avatarUrl: string | null }[] }>(`/search?q=${encodeURIComponent(inviteQuery)}&type=users`)
      const found = res.users?.[0] ?? null
      setInviteFound(found)
      if (!found) setInviteMsg('Utilizador não encontrado.')
    } catch {
      setInviteMsg('Erro na pesquisa.')
    } finally {
      setInviteSearching(false)
    }
  }

  async function handleTransferSearch() {
    if (!transferQuery.trim()) return
    try {
      const res = await api.get<{ users?: { id: string; username: string }[] }>(`/search?q=${encodeURIComponent(transferQuery)}&type=users`)
      setTransferFound(res.users?.[0] ?? null)
    } catch { /* ignore */ }
  }

  async function handleCoverUpload(file: File) {
    if (!file) return
    setCoverUploading(true)
    try {
      // O endpoint devolve uploadUrl, não url. Estava a destruturar o nome
      // errado: o fetch ia para undefined, não lançava, e a capa acabava a
      // apontar para um ficheiro que nunca chegou a ser enviado.
      const { uploadUrl, publicUrl } = await api.post<{ uploadUrl: string; publicUrl: string; key: string }>(
        '/uploads/presign',
        { filename: file.name, contentType: file.type, size: file.size },
      )

      const envio = await fetch(uploadUrl, {
        method: 'PUT', body: file, headers: { 'Content-Type': file.type },
      })
      // fetch só rejeita em falha de rede — um 4xx/5xx passava despercebido.
      if (!envio.ok) throw new Error(`upload falhou: ${envio.status}`)

      await api.patch(`/groups/${id}`, { coverUrl: publicUrl })
      qc.invalidateQueries({ queryKey: ['group', id] })
      qc.invalidateQueries({ queryKey: ['groups'] })
    } catch {
      // silently fail — user sees no change
    } finally {
      setCoverUploading(false)
    }
  }

  const handleLoadMore = useCallback(() => fetchNextPage(), [fetchNextPage])
  const sentinelRef = useInfiniteScroll({ hasMore: !!hasNextPage, onLoadMore: handleLoadMore })

  const posts = feedData?.pages.flatMap((p) => p.posts) ?? []

  if (!isReady || isLoading) return <div className="flex justify-center py-16"><Spinner size="lg" /></div>
  if (error || !group) return (
    <div>
      <AlertBanner variant="danger" message="Grupo não encontrado ou acesso negado." />
      <Link href="/groups" className="btn btn-secondary mt-4 inline-flex gap-1.5">
        <ChevronLeft className="w-4 h-4" /> Voltar
      </Link>
    </div>
  )

  return (
    <div>
      {/* Back */}
      <Link href="/groups" className="inline-flex items-center gap-1.5 text-sm mb-4 hover:opacity-70 transition-opacity" style={{ color: 'var(--text-muted)' }}>
        <ChevronLeft className="w-4 h-4" /> Grupos
      </Link>

      {/* Header */}
      <div className="card overflow-hidden mb-4">
        {/* Cover photo */}
        <div
          className="relative w-full flex items-center justify-center"
          style={{ height: 140, background: 'radial-gradient(ellipse at 60% 40%, rgba(34,152,206,0.18), transparent 70%), var(--surface2)' }}
        >
          {group.coverUrl && (
            <Image src={group.coverUrl} alt={group.name} fill className="object-cover" sizes="100vw" />
          )}
          {group.viewerIsOwner && (
            <button
              onClick={() => coverInputRef.current?.click()}
              disabled={coverUploading}
              className="absolute bottom-2 right-2 flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-xl transition-opacity hover:opacity-90"
              style={{ background: 'rgba(0,0,0,0.55)', color: '#fff', backdropFilter: 'blur(4px)' }}
            >
              {coverUploading ? <Spinner size="sm" /> : <Camera className="w-3.5 h-3.5" />}
              {coverUploading ? 'A enviar…' : 'Alterar capa'}
            </button>
          )}
          <input
            ref={coverInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleCoverUpload(f); e.target.value = '' }}
          />
        </div>

        <div className="p-5">
        <div className="flex items-start gap-4">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center shrink-0 -mt-10 relative z-10"
            style={{ background: 'var(--bg-card)', border: '3px solid var(--bg-card)', boxShadow: '0 2px 8px rgba(0,0,0,0.3)' }}
          >
            <Users className="w-8 h-8" style={{ color: 'var(--accent)' }} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>{group.name}</h1>
              {group.isPrivate ? (
                <Lock className="w-4 h-4 shrink-0" style={{ color: 'var(--text-muted)' }} />
              ) : (
                <Globe className="w-4 h-4 shrink-0" style={{ color: 'var(--text-muted)' }} />
              )}
            </div>
            {group.destination && (
              <div className="flex items-center gap-1 mb-2">
                <MapPin className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} />
                <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{group.destination}</span>
              </div>
            )}
            {group.description && (
              <p className="text-sm mb-2" style={{ color: 'var(--text-secondary)' }}>{group.description}</p>
            )}
            <div className="flex items-center gap-3 text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
              <span>{group.membersCount} membro{group.membersCount !== 1 ? 's' : ''}</span>
              <span>·</span>
              <span>{group.postsCount} post{group.postsCount !== 1 ? 's' : ''}</span>
              <span>·</span>
              <span>Criado por <span style={{ color: 'var(--text-primary)' }}>@{group.owner.username}</span></span>
            </div>

            {/* Actions */}
            {!group.viewerIsOwner && !group.isPrivate && (
              <button
                onClick={() => group.viewerIsMember ? leaveMutation.mutate() : joinMutation.mutate()}
                disabled={joinMutation.isPending || leaveMutation.isPending}
                className="flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-xl transition-colors"
                style={{
                  background: group.viewerIsMember ? 'var(--surface2)' : 'var(--accent)',
                  color:      group.viewerIsMember ? 'var(--text-primary)' : 'var(--on-accent)',
                  border:     group.viewerIsMember ? '1px solid var(--border)' : 'none',
                }}
              >
                {(joinMutation.isPending || leaveMutation.isPending) ? <Spinner size="sm" /> :
                  group.viewerIsMember ? <><UserCheck className="w-4 h-4" /> Membro</> :
                  <><UserPlus className="w-4 h-4" /> Entrar no grupo</>
                }
              </button>
            )}
            {group.viewerIsMember && group.isPrivate && (
              <button
                onClick={() => { setInviteOpen(true); setInviteMsg(''); setInviteFound(null); setInviteQuery('') }}
                className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-xl"
                style={{ background: 'rgba(71,163,203,0.1)', color: 'var(--accent)', border: '1px solid rgba(71,163,203,0.3)' }}
              >
                <Mail className="w-4 h-4" /> Convidar
              </button>
            )}
            {group.viewerIsOwner && (
              <button
                onClick={() => { setTransferOpen(true); setTransferQuery(''); setTransferFound(null) }}
                className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-xl"
                style={{ background: 'var(--surface2)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
              >
                <ArrowRightLeft className="w-4 h-4" /> Transferir
              </button>
            )}
            {group.viewerIsOwner && (
              <button
                onClick={() => { if (confirm('Eliminar este grupo permanentemente?')) deleteMutation.mutate() }}
                disabled={deleteMutation.isPending}
                className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-xl"
                style={{ background: 'rgba(220,38,38,0.1)', color: 'var(--danger)' }}
              >
                <Trash2 className="w-4 h-4" /> Eliminar grupo
              </button>
            )}
          </div>
        </div>

        {/* Recent members */}
        {group.recentMembers.length > 0 && (
          <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--border)' }}>
            <p className="text-xs font-medium mb-2" style={{ color: 'var(--text-muted)' }}>MEMBROS RECENTES</p>
            <div className="flex items-center gap-2 flex-wrap">
              {group.recentMembers.slice(0, 8).map((m) => (
                <Link key={m.id} href={`/profile/${m.id}`} title={`@${m.username}`}>
                  <Avatar src={m.avatarUrl} name={m.displayName} size="sm" />
                </Link>
              ))}
              {group.membersCount > 8 && (
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>+{group.membersCount - 8}</span>
              )}
            </div>
          </div>
        )}
        </div>{/* /p-5 */}
      </div>

      {/* Feed */}
      <h2 className="text-base font-bold mb-3" style={{ color: 'var(--text-primary)' }}>Posts do grupo</h2>

      {/* Invite modal */}
      {inviteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }}>
          <div className="card p-5 w-full max-w-sm" style={{ maxWidth: 380 }}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>Convidar para o grupo</h3>
              <button onClick={() => setInviteOpen(false)} className="btn-ghost p-1 rounded-lg"><X className="w-4 h-4" style={{ color: 'var(--text-muted)' }} /></button>
            </div>
            <div className="flex gap-2 mb-3">
              <input
                className="input text-sm flex-1"
                placeholder="@username"
                value={inviteQuery}
                onChange={(e) => setInviteQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleInviteSearch()}
                autoFocus
              />
              <button
                onClick={handleInviteSearch}
                disabled={inviteSearching || !inviteQuery.trim()}
                className="btn btn-primary text-xs px-3"
              >
                {inviteSearching ? '…' : 'Procurar'}
              </button>
            </div>
            {inviteFound && (
              <div className="flex items-center gap-2 p-2 rounded-xl mb-2" style={{ background: 'var(--surface2)' }}>
                <Avatar src={inviteFound.avatarUrl} name={inviteFound.username} size="sm" />
                <span className="text-sm flex-1" style={{ color: 'var(--text-primary)' }}>@{inviteFound.username}</span>
                <button
                  onClick={() => inviteMutation.mutate(inviteFound.id)}
                  disabled={inviteMutation.isPending}
                  className="btn btn-primary text-xs px-3"
                >
                  Convidar
                </button>
              </div>
            )}
            {inviteMsg && (
              <p className="text-xs" style={{ color: inviteMsg.includes('!') ? 'var(--success)' : 'var(--danger)' }}>{inviteMsg}</p>
            )}
          </div>
        </div>
      )}

      {/* Transfer ownership modal */}
      {transferOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }}>
          <div className="card p-5 w-full" style={{ maxWidth: 380 }}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>Transferir propriedade</h3>
              <button onClick={() => setTransferOpen(false)} className="btn-ghost p-1 rounded-lg"><X className="w-4 h-4" style={{ color: 'var(--text-muted)' }} /></button>
            </div>
            <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>O novo dono deve ser membro do grupo.</p>
            <div className="flex gap-2 mb-3">
              <input
                className="input text-sm flex-1"
                placeholder="@username do novo dono"
                value={transferQuery}
                onChange={(e) => setTransferQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleTransferSearch()}
                autoFocus
              />
              <button onClick={handleTransferSearch} disabled={!transferQuery.trim()} className="btn btn-secondary text-xs px-3">Procurar</button>
            </div>
            {transferFound && (
              <div className="flex items-center gap-2 p-2 rounded-xl mb-3" style={{ background: 'var(--surface2)' }}>
                <span className="text-sm flex-1" style={{ color: 'var(--text-primary)' }}>@{transferFound.username}</span>
                <button
                  onClick={() => { if (confirm(`Transferir propriedade para @${transferFound.username}?`)) transferMutation.mutate(transferFound.id) }}
                  disabled={transferMutation.isPending}
                  className="btn text-xs px-3"
                  style={{ background: 'var(--danger)', color: 'var(--on-danger)' }}
                >
                  Confirmar
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Feed */}
      {!group.viewerIsMember && !group.viewerIsOwner ? (
        <div className="card p-8 text-center">
          <Users className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
          <p className="font-medium mb-1" style={{ color: 'var(--text-primary)' }}>Entra no grupo para ver os posts</p>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Os membros partilham roteiros e experiências aqui.</p>
        </div>
      ) : posts.length === 0 ? (
        <EmptyState Icon={Users} title="Ainda sem posts" description="Os membros ainda não partilharam nada neste grupo." />
      ) : (
        <div className="flex flex-col gap-4">
          {posts.map((post, i) => (
            <PostCard key={(post as { id: string }).id} post={post as never} queryKey={['group-feed', id]} index={i} />
          ))}
          <div ref={sentinelRef} className="h-4" />
          {isFetchingNextPage && <div className="flex justify-center py-4"><Spinner /></div>}
          {!hasNextPage && posts.length > 0 && <p className="end-of-list">Fim dos posts do grupo</p>}
        </div>
      )}
    </div>
  )
}
