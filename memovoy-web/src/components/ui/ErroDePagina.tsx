'use client'

import Link from 'next/link'
import { RotateCw, Home } from 'lucide-react'

/**
 * Ecrã de erro partilhado pelas fronteiras de erro da App Router.
 *
 * Não existia nenhuma — nem `error.tsx`, nem `not-found.tsx`, nem
 * `global-error.tsx` — em 36 páginas. Qualquer excepção não apanhada caía no
 * ecrã por omissão do Next, que em produção é um "Application error" cinzento
 * sem forma de recuperar.
 *
 * A mensagem do erro nunca é mostrada: pode trazer detalhes internos, e não
 * diz nada de útil a quem está do outro lado. O `digest` sim, porque é o que
 * permite encontrar o erro nos registos do servidor.
 */
export function ErroDePagina({
  titulo = 'Alguma coisa correu mal',
  descricao = 'Não conseguimos carregar esta página. Podes tentar outra vez.',
  digest,
  reset,
}: {
  titulo?: string
  descricao?: string
  digest?: string
  reset?: () => void
}) {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
      <svg width="140" height="110" viewBox="0 0 140 110" fill="none" aria-hidden>
        <ellipse cx="70" cy="58" rx="52" ry="38" fill="var(--accent)" fillOpacity="0.06" />
        {/* Mala tombada */}
        <rect x="38" y="46" width="64" height="44" rx="8" fill="var(--surface2)" stroke="var(--border)" strokeWidth="1.5" />
        <path d="M58 46 L58 38 Q58 33 63 33 L77 33 Q82 33 82 38 L82 46" stroke="var(--border)" strokeWidth="1.5" fill="none" />
        <line x1="38" y1="64" x2="102" y2="64" stroke="var(--border)" strokeWidth="1.5" opacity="0.7" />
        {/* Bússola sem norte */}
        <circle cx="70" cy="76" r="9" fill="var(--accent)" fillOpacity="0.12" />
        <path d="M66 80 L72 72 M72 72 L74 78" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" opacity="0.7" />
        {/* Rota interrompida */}
        <path d="M 20 30 Q 45 16 62 26" stroke="var(--accent)" strokeWidth="1.5" strokeDasharray="4 4" strokeLinecap="round" fill="none" opacity="0.45" />
        <path d="M 84 24 Q 104 18 120 32" stroke="var(--accent)" strokeWidth="1.5" strokeDasharray="4 4" strokeLinecap="round" fill="none" opacity="0.3" />
        <circle cx="73" cy="25" r="2" fill="var(--accent)" opacity="0.5" />
      </svg>

      <p className="font-semibold text-lg mt-4 mb-1" style={{ color: 'var(--text-primary)' }}>
        {titulo}
      </p>
      <p className="text-sm mb-6 max-w-sm" style={{ color: 'var(--text-secondary)' }}>
        {descricao}
      </p>

      <div className="flex gap-2 flex-wrap justify-center">
        {reset && (
          <button onClick={reset} className="btn btn-primary text-sm inline-flex items-center gap-2">
            <RotateCw className="w-4 h-4" aria-hidden />
            Tentar outra vez
          </button>
        )}
        <Link href="/feed" className="btn text-sm inline-flex items-center gap-2">
          <Home className="w-4 h-4" aria-hidden />
          Ir para o início
        </Link>
      </div>

      {digest && (
        <p className="text-xs mt-6 font-mono" style={{ color: 'var(--text-secondary)', opacity: 0.7 }}>
          Referência: {digest}
        </p>
      )}
    </div>
  )
}
