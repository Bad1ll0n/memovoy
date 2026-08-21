import Image from 'next/image'

type Size = 'xs' | 'sm' | 'md' | 'lg' | 'xl'

const sizes: Record<Size, { px: number; cls: string }> = {
  xs: { px: 24, cls: 'w-6 h-6 text-[9px]' },
  sm: { px: 32, cls: 'w-8 h-8 text-xs' },
  md: { px: 40, cls: 'w-10 h-10 text-sm' },
  lg: { px: 48, cls: 'w-12 h-12 text-base' },
  xl: { px: 88, cls: 'w-22 h-22 text-2xl' },
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
}

export function Avatar({
  src,
  name,
  size = 'md',
  className = '',
  style,
}: {
  src?: string | null
  name: string
  size?: Size
  className?: string
  style?: React.CSSProperties
}) {
  const { px, cls } = sizes[size]

  if (src) {
    return (
      <Image
        src={src}
        alt={name}
        width={px}
        height={px}
        className={`rounded-full object-cover shrink-0 ${cls} ${className}`}
        style={style}
        unoptimized
      />
    )
  }

  return (
    <div
      className={`rounded-full shrink-0 flex items-center justify-center font-semibold select-none ${cls} ${className}`}
      style={{ background: 'var(--accent)', color: 'var(--on-accent)', ...style }}
      aria-label={name}
    >
      {initials(name)}
    </div>
  )
}
