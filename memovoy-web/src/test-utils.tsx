import type { ReactElement, ReactNode } from 'react'
import { render, type RenderOptions } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// Utilitários partilhados pelos testes de componente. Não é um ficheiro de
// teste — o glob dos scripts só apanha *.test.{ts,tsx}.

/**
 * QueryClient com retentativas desligadas: nos testes, uma mutação que falha
 * deve falhar já, não ao fim de três tentativas com espera entre elas.
 */
export function criarQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries:   { retry: false },
      mutations: { retry: false },
    },
  })
}

/** Renderiza com os providers de que a app precisa. */
export function renderComProviders(ui: ReactElement, options?: Omit<RenderOptions, 'wrapper'>) {
  const queryClient = criarQueryClient()

  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }

  return { queryClient, ...render(ui, { wrapper: Wrapper, ...options }) }
}
