'use client'

import { useEffect, useRef } from 'react'
import { useAuthStore } from '@/store/authStore'
import { setAccessToken } from '@/lib/api'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'

export function AuthHydrator() {
  const { setAuth, hydrate, isHydrated } = useAuthStore()
  const attempted = useRef(false)

  useEffect(() => {
    if (attempted.current || isHydrated) return
    attempted.current = true

    fetch(`${API_URL}/auth/refresh`, { method: 'POST', credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.accessToken && data?.user) {
          setAccessToken(data.accessToken)
          setAuth(data.user, data.accessToken)
        }
      })
      .catch(() => { /* sem sessão activa — normal */ })
      .finally(() => hydrate())
    // As accoes da store Zustand e o setAccessToken sao referencias estaveis;
    // isHydrated so muda uma vez e o guard do attempted evita repeticoes.
  }, [isHydrated, setAuth, hydrate])

  return null
}
