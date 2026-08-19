'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { io, type Socket } from 'socket.io-client'
import { useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/store/authStore'
import { setSocketId } from '@/lib/api'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'

const SocketContext = createContext<Socket | null>(null)

export function useSocket() {
  return useContext(SocketContext)
}

export function SocketProvider({ children }: { children: ReactNode }) {
  const { accessToken, user } = useAuthStore()
  const qc = useQueryClient()

  // Estado, não ref: atribuir a uma ref não provoca re-render, por isso o
  // contexto continuava a servir null depois de o socket já existir — quem
  // depende de useSocket() (o progresso da geração de roteiros por IA) nunca
  // chegava a recebê-lo.
  const [socket, setSocket] = useState<Socket | null>(null)

  useEffect(() => {
    if (!accessToken || !user) return

    const s = io(API_URL, {
      auth:       { token: accessToken },
      transports: ['websocket'],
    })

    // O id só existe depois do handshake, e muda a cada reconexão.
    s.on('connect', () => setSocketId(s.id ?? null))
    s.on('disconnect', () => setSocketId(null))

    s.on('new_notification', () => {
      qc.invalidateQueries({ queryKey: ['notifications'] })
      qc.invalidateQueries({ queryKey: ['unread-notif-count'] })
    })

    s.on('conversations:updated', () => {
      qc.invalidateQueries({ queryKey: ['conversations'] })
    })

    // Excepção deliberada ao set-state-in-effect: expor um recurso externo
    // criado no efeito é precisamente para isto que o estado serve. Criá-lo
    // durante o render — num useMemo — abriria a ligação num sítio que tem de
    // ser puro, o que é pior.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSocket(s)

    return () => {
      s.disconnect()
      setSocketId(null)
      setSocket(null)
    }
  }, [accessToken, user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <SocketContext.Provider value={socket}>
      {children}
    </SocketContext.Provider>
  )
}
