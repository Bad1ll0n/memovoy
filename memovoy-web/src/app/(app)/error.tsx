'use client'

import { useEffect } from 'react'
import { ErroDePagina } from '@/components/ui/ErroDePagina'

/**
 * Fronteira de erro dentro da aplicação. Fica abaixo do layout de `(app)`, por
 * isso a navegação e a barra lateral continuam de pé — quem apanha o erro numa
 * página pode saltar para outra sem recarregar tudo.
 */
export default function ErroDaApp({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[erro na app]', error)
  }, [error])

  return <ErroDePagina digest={error.digest} reset={reset} />
}
