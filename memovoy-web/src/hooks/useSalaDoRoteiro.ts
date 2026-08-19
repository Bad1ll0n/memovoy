'use client'

import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useSocket } from '@/components/ui/SocketProvider'

/**
 * Mantém o roteiro aberto sincronizado com o que os outros colaboradores fazem.
 *
 * O backend já tinha isto todo: salas `itinerary:<id>`, controlo de acesso por
 * dono ou colaborador no `join_itinerary`, e emissão de `itinerary_changed` em
 * quatro pontos de escrita. Faltava só o lado do cliente — ninguém entrava na
 * sala nem ouvia o evento, por isso duas pessoas a editar o mesmo roteiro não
 * viam nada uma da outra.
 *
 * Entrar na sala é pedido, não garantido: se quem pede não for dono nem
 * colaborador, o servidor ignora em silêncio e o evento nunca chega. É o
 * comportamento certo — a autorização é dele, não nossa.
 */
export function useSalaDoRoteiro(itineraryId: string | undefined) {
  const socket = useSocket()
  const qc = useQueryClient()

  useEffect(() => {
    if (!socket || !itineraryId) return

    const entrar = () => socket.emit('join_itinerary', itineraryId)

    // Também a cada reconexão: o servidor perde as salas quando a ligação cai,
    // e sem isto uma quebra de rede deixava a página muda para sempre.
    entrar()
    socket.on('connect', entrar)

    const aoMudar = () => {
      qc.invalidateQueries({ queryKey: ['itinerary', itineraryId] })
    }
    socket.on('itinerary_changed', aoMudar)

    return () => {
      socket.off('connect', entrar)
      socket.off('itinerary_changed', aoMudar)
      socket.emit('leave_itinerary', itineraryId)
    }
  }, [socket, itineraryId, qc])
}
