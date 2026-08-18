'use client'

import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react'
import { io, type Socket } from 'socket.io-client'
import { useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/store/authStore'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'

const SocketContext = createContext<Socket | null>(null)

export function useSocket() {
  return useContext(SocketContext)
}

export function SocketProvider({ children }: { children: ReactNode }) {
  const { accessToken, user } = useAuthStore()
  const qc = useQueryClient()
  const socketRef = useRef<Socket | null>(null)

  useEffect(() => {
    if (!accessToken || !user) {
      socketRef.current?.disconnect()
      socketRef.current = null
      return
    }

    if (socketRef.current?.connected) return

    const socket = io(API_URL, {
      auth:       { token: accessToken },
      transports: ['websocket'],
    })

    socket.on('new_notification', () => {
      qc.invalidateQueries({ queryKey: ['notifications'] })
      qc.invalidateQueries({ queryKey: ['unread-notif-count'] })
    })

    socket.on('conversations:updated', () => {
      qc.invalidateQueries({ queryKey: ['conversations'] })
    })

    // Async AI generation progress — consumers subscribe to 'itinerary:job' via useSocket()
    // No query invalidation here; components handle the event directly for streaming UX.

    socketRef.current = socket

    return () => {
      socket.disconnect()
      socketRef.current = null
    }
  }, [accessToken, user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <SocketContext.Provider value={socketRef.current}>
      {children}
    </SocketContext.Provider>
  )
}
