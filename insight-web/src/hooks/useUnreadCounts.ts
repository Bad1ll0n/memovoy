'use client'

import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'

interface Conversation {
  unreadCount: number
}

export function useUnreadCounts() {
  const { user } = useAuthStore()
  const enabled = !!user

  const { data: notifData } = useQuery<{ count: number }>({
    queryKey: ['unread-notif-count'],
    queryFn: () => api.get('/notifications/unread-count'),
    enabled,
    refetchInterval: 30_000,
    staleTime: 20_000,
  })

  const { data: conversations } = useQuery<Conversation[]>({
    queryKey: ['conversations'],
    queryFn: () => api.get('/conversations'),
    enabled,
    refetchInterval: 30_000,
    staleTime: 20_000,
  })

  const msgCount = (conversations ?? []).reduce((acc, c) => acc + (c.unreadCount ?? 0), 0)

  return {
    notifCount: notifData?.count ?? 0,
    msgCount,
  }
}
