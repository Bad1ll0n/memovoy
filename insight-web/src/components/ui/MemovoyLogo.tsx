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
      {/* Orbit ring — dashed, suggests continuous journey */}
      <circle
        cx="16"
        cy="16"
        r="13"
        stroke={color}
        strokeWidth="1.25"
        strokeDasharray="3.2 2.4"
        opacity="0.35"
      />

      {/* South arm — where you came from (faded) */}
      <line
        x1="16" y1="17.5"
        x2="11" y2="26"
        stroke={color}
        strokeWidth="1.75"
        strokeLinecap="round"
        opacity="0.22"
      />

      {/* West stub */}
      <line
        x1="14.5" y1="16"
        x2="7" y2="13.5"
        stroke={color}
        strokeWidth="1"
        strokeLinecap="round"
        opacity="0.18"
      />

      {/* East stub */}
      <line
        x1="17.5" y1="16"
        x2="25" y2="19"
        stroke={color}
        strokeWidth="1"
        strokeLinecap="round"
        opacity="0.18"
      />

      {/* North arm — where you're going (dominant) */}
      <line
        x1="16" y1="14.5"
        x2="21.5" y2="6"
        stroke={color}
        strokeWidth="2.25"
        strokeLinecap="round"
      />

      {/* North tip — location pin dot (the destination) */}
      <circle cx="21.5" cy="5.5" r="3" fill={color} />

      {/* Center hub */}
      <circle cx="16" cy="16" r="2" fill={color} opacity="0.45" />
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
