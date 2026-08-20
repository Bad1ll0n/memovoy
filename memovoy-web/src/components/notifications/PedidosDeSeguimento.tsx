'use client'

import Link from 'next/link'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, X, UserPlus } from 'lucide-react'
import { api } from '@/lib/api'
import { Avatar } from '@/components/ui/Avatar'
import { Spinner } from '@/components/ui/Spinner'

export interface PedidoDeSeguimento {
  id: string
  userId: string
  username: string
  displayName: string
  avatarUrl: string | null
  isVerified: boolean
  followersCount: number
  createdAt: string
}

export const CHAVE_PEDIDOS = ['follow-requests'] as const

export function usePedidosDeSeguimento(activo: boolean) {
  return useQuery<{ requests: PedidoDeSeguimento[] }>({
    queryKey: CHAVE_PEDIDOS,
    queryFn: () => api.get('/users/me/follow-requests'),
    enabled: activo,
  })
}

/**
 * A fila de quem pediu para te seguir, no topo das notificações.
 *
 * Fica numa secção própria e não misturada com os gostos de propósito: um
 * pedido é a única notificação que exige uma resposta, e uma que exige resposta
 * não pode ser enterrada pelo scroll de dez gostos que chegaram depois. Fica
 * aqui até ser respondida.
 *
 * Quando não há nada pendente não desenha rigorosamente nada — um cabeçalho
 * permanentemente vazio ensina as pessoas a saltar aquela zona da página.
 */
export function PedidosDeSeguimento({ activo = true }: { activo?: boolean }) {
  const qc = useQueryClient()
  const { data, isLoading } = usePedidosDeSeguimento(activo)
  const pedidos = data?.requests ?? []

  const responder = useMutation({
    mutationFn: ({ userId, aceitar }: { userId: string; aceitar: boolean }) =>
      aceitar
        ? api.post(`/users/me/follow-requests/${userId}`)
        : api.delete(`/users/me/follow-requests/${userId}`),

    // Retirar a linha antes da resposta do servidor: quem carrega em Aceitar já
    // decidiu, e ver a linha ficar lá parada meio segundo dá a sensação de que
    // o clique não passou.
    onMutate: async ({ userId }) => {
      await qc.cancelQueries({ queryKey: CHAVE_PEDIDOS })
      const anterior = qc.getQueryData<{ requests: PedidoDeSeguimento[] }>(CHAVE_PEDIDOS)
      qc.setQueryData<{ requests: PedidoDeSeguimento[] }>(CHAVE_PEDIDOS, (old) =>
        old ? { requests: old.requests.filter((p) => p.userId !== userId) } : old,
      )
      return { anterior }
    },
    onError: (_erro, _vars, contexto) => {
      if (contexto?.anterior) qc.setQueryData(CHAVE_PEDIDOS, contexto.anterior)
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: CHAVE_PEDIDOS })
      qc.invalidateQueries({ queryKey: ['unread-notif-count'] })
    },
  })

  const aResponderA = responder.isPending ? responder.variables?.userId : null

  if (isLoading || pedidos.length === 0) return null

  return (
    <section
      className="mb-5 rounded-xl overflow-hidden"
      style={{ border: '1px solid color-mix(in srgb, var(--accent) 30%, var(--border))' }}
      aria-label="Pedidos para te seguirem"
    >
      <header
        className="flex items-center gap-2 px-4 py-2.5"
        style={{ background: 'color-mix(in srgb, var(--accent) 10%, transparent)' }}
      >
        <UserPlus className="w-4 h-4 shrink-0" style={{ color: 'var(--accent)' }} />
        <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          Pedidos para te seguirem
        </h2>
        <span
          className="ml-auto text-xs font-bold px-2 py-0.5 rounded-full"
          style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
        >
          {pedidos.length}
        </span>
      </header>

      <ul className="flex flex-col">
        {pedidos.map((p, i) => (
          <li
            key={p.id}
            className="flex items-center gap-3 px-4 py-3"
            style={{ borderTop: i === 0 ? 'none' : '1px solid var(--border)' }}
          >
            <Link href={`/profile/${p.userId}`} className="shrink-0">
              <Avatar src={p.avatarUrl} name={p.username} size="sm" />
            </Link>

            <div className="min-w-0 flex-1">
              <Link
                href={`/profile/${p.userId}`}
                className="text-sm font-semibold truncate block hover:underline"
                style={{ color: 'var(--text-primary)' }}
              >
                {p.displayName}
              </Link>
              <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
                @{p.username}
                {p.followersCount > 0 && ` · ${p.followersCount} seguidores`}
              </p>
            </div>

            {aResponderA === p.userId ? (
              <Spinner size="sm" />
            ) : (
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => responder.mutate({ userId: p.userId, aceitar: true })}
                  className="btn btn-primary text-xs gap-1 px-3 py-1.5"
                  aria-label={`Aceitar o pedido de ${p.displayName}`}
                >
                  <Check className="w-3.5 h-3.5" />
                  Aceitar
                </button>
                <button
                  onClick={() => responder.mutate({ userId: p.userId, aceitar: false })}
                  className="btn btn-secondary text-xs gap-1 px-3 py-1.5"
                  aria-label={`Recusar o pedido de ${p.displayName}`}
                >
                  <X className="w-3.5 h-3.5" />
                  Recusar
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
