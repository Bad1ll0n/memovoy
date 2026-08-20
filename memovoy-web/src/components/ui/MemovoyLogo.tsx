interface MarkProps {
  size?: number
  color?: string
  className?: string
}

export function MemovoyMark({ size = 32, color = 'currentColor', className }: MarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      {/*
        Duas formas, e nada mais.

        A versão anterior tinha sete elementos e quatro opacidades — anel
        tracejado, quatro braços de 0,18 a 1,0, ponto e núcleo. A ideia era boa
        (uma bússola onde o braço forte aponta para onde vais e o esbatido para
        onde vieste), mas o símbolo é desenhado a 16 e 20px na navegação, e a
        essa escala uma linha a 18% não existe e um tracejado de 3,2/2,4 fecha
        numa mancha. Todo esse detalhe era invisível onde importava.

        Agora: a silhueta de um pino, que se reconhece de longe, com uma onda
        dentro que lhe dá o assunto. Traço grosso e uniforme, para aguentar
        16px sem se desfazer.
      */}
      <path
        d="M16 3 C 10.5 3, 6 7.5, 6 13 C 6 20, 16 29, 16 29 C 16 29, 26 20, 26 13 C 26 7.5, 21.5 3, 16 3 Z"
        stroke={color}
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <path
        d="M9.5 14.5 C 12 11.5, 14.5 17, 17 14 C 19 11.5, 21 14, 22.5 12.5"
        stroke={color}
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  )
}

interface WordmarkProps {
  color?: string
  size?: 'xs' | 'sm' | 'md' | 'lg'
  className?: string
}

const sizeMap = {
  xs: { mark: 16, fontSize: '0.75rem', gap: '0.375rem', tracking: '0.16em' },
  sm: { mark: 20, fontSize: '0.875rem', gap: '0.5rem',   tracking: '0.18em' },
  md: { mark: 24, fontSize: '1rem',     gap: '0.625rem', tracking: '0.18em' },
  lg: { mark: 32, fontSize: '1.25rem',  gap: '0.75rem',  tracking: '0.2em'  },
}

export function MemovoyWordmark({ color = 'currentColor', size = 'sm', className }: WordmarkProps) {
  const s = sizeMap[size]
  return (
    <div
      className={`flex items-center select-none ${className ?? ''}`}
      style={{ gap: s.gap }}
    >
      <MemovoyMark size={s.mark} color={color} />
      <span
        style={{
          color,
          fontSize: s.fontSize,
          fontWeight: 800,
          letterSpacing: s.tracking,
          textTransform: 'uppercase',
          lineHeight: 1,
        }}
      >
        Memovoy
      </span>
    </div>
  )
}
