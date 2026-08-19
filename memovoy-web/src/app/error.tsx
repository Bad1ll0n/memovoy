'use client'

import { useEffect } from 'react'
import { ErroDePagina } from '@/components/ui/ErroDePagina'

/**
 * Fronteira de erro para as rotas fora da aplicação autenticada — /auth,
 * /onboarding, /privacy, /terms.
 */
export default function Erro({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[erro de rota]', error)
  }, [error])

  return <ErroDePagina digest={error.digest} reset={reset} />
}
