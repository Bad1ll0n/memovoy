'use client'

import { useEffect } from 'react'

/**
 * Última rede: apanha erros lançados no próprio layout de raiz, onde nem o
 * `error.tsx` chega. Substitui o documento inteiro, por isso traz o seu próprio
 * <html> e <body> e não pode depender de nada do layout — incluindo as
 * variáveis de tema, daí as cores literais.
 */
export default function ErroGlobal({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[erro global]', error)
  }, [error])

  return (
    <html lang="pt">
      {/*
        Cores literais porque aqui não há tokens: este ecrã substitui o
        documento inteiro quando o layout de raiz falhou, e o globals.css pode
        nem ter chegado a carregar. São os valores actuais da paleta Brisa —
        --bg-body, --accent e --on-accent — copiados à mão de propósito.
      */}
      <body style={{ margin: 0, background: '#131518', color: '#E9EBEE', fontFamily: 'system-ui, sans-serif' }}>
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem', textAlign: 'center' }}>
          <p style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '0.5rem' }}>
            Alguma coisa correu mal
          </p>
          <p style={{ fontSize: '0.875rem', opacity: 0.75, marginBottom: '1.5rem', maxWidth: '24rem' }}>
            A aplicação não conseguiu arrancar. Recarrega a página para tentar de novo.
          </p>
          <button
            onClick={reset}
            style={{ background: '#47A3CB', color: '#131518', border: 0, borderRadius: '0.5rem', padding: '0.625rem 1.25rem', fontWeight: 600, fontSize: '0.875rem', cursor: 'pointer' }}
          >
            Tentar outra vez
          </button>
          {error.digest && (
            <p style={{ fontSize: '0.75rem', opacity: 0.5, marginTop: '1.5rem', fontFamily: 'monospace' }}>
              Referência: {error.digest}
            </p>
          )}
        </div>
      </body>
    </html>
  )
}
