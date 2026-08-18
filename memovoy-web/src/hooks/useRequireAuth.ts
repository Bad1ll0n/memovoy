'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/authStore'

export function useRequireAuth() {
  const router = useRouter()
  const { user, accessToken, isHydrated } = useAuthStore()

  useEffect(() => {
    if (!isHydrated) return
    if (!user) router.replace('/auth/login')
  }, [isHydrated, user, router])

  return { user, accessToken, isReady: isHydrated && !!user }
}
