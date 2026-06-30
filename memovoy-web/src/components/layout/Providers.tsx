// src/components/layout/Providers.tsx
'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools }               from '@tanstack/react-query-devtools'
import { useEffect, useRef, type ReactNode } from 'react'
import { useAuthStore }                     from '@/store/auth'

// QueryClient configurado uma vez por sessão
function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime:          60 * 1000,      // 1 min antes de re-fetch
        gcTime:             5 * 60 * 1000,  // 5 min em cache
        retry:              1,              // 1 retry em erros de rede
        refetchOnWindowFocus: false,        // não re-fetch ao focar janela
      },
    },
  })
}

let browserQueryClient: QueryClient | undefined

function getQueryClient() {
  if (typeof window === 'undefined') return makeQueryClient()
  if (!browserQueryClient) browserQueryClient = makeQueryClient()
  return browserQueryClient
}

// AuthHydration — restaura sessão do localStorage e tenta buscar /users/me
function AuthHydration() {
  const { isAuthenticated, isHydrated, user } = useAuthStore()
  const attempted = useRef(false)

  useEffect(() => {
    if (!isHydrated || attempted.current) return
    attempted.current = true

    // Se há token em memória (do persist), validar com a API
    if (isAuthenticated && user) {
      // Sessão restaurada — sem necessidade de re-validar imediatamente
      // O primeiro request autenticado vai fazer o refresh se necessário
    }
  }, [isHydrated, isAuthenticated, user])

  return null
}

export function Providers({ children }: { children: ReactNode }) {
  const queryClient = getQueryClient()

  return (
    <QueryClientProvider client={queryClient}>
      <AuthHydration />
      {children}
      {process.env.NODE_ENV === 'development' && (
        <ReactQueryDevtools initialIsOpen={false} />
      )}
    </QueryClientProvider>
  )
}
