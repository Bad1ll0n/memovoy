import React from 'react'
import Link from 'next/link'
import { type LucideIcon } from 'lucide-react'

// ── SVG travel illustrations ────────────────────────────────────────────────

function IllustrationFeed() {
  return (
    <svg width="140" height="110" viewBox="0 0 140 110" fill="none" aria-hidden>
      {/* Sky backdrop */}
      <ellipse cx="70" cy="55" rx="60" ry="42" fill="var(--accent)" fillOpacity="0.06" />
      {/* Cloud left */}
      <ellipse cx="22" cy="46" rx="13" ry="8" fill="var(--surface2)" />
      <ellipse cx="32" cy="41" rx="10" ry="7" fill="var(--surface2)" />
      {/* Cloud right */}
      <ellipse cx="112" cy="58" rx="15" ry="9" fill="var(--surface2)" />
      <ellipse cx="100" cy="53" rx="10" ry="7" fill="var(--surface2)" />
      {/* Dotted flight path */}
      <path
        d="M 22 60 Q 70 28 118 55"
        stroke="var(--accent)"
        strokeWidth="1.5"
        strokeDasharray="4 4"
        strokeLinecap="round"
        opacity="0.45"
      />
      {/* Plane body */}
      <g transform="translate(72, 38) rotate(-18)">
        <path d="M-14 0 L14 0 Q18 0 18 4 L-14 4 Z" fill="var(--accent)" opacity="0.85" />
        {/* Wing */}
        <path d="M-2 0 L-12 -9 L6 -2 Z" fill="var(--accent)" opacity="0.65" />
        {/* Tail */}
        <path d="M-14 0 L-18 -6 L-10 0 Z" fill="var(--accent)" opacity="0.65" />
      </g>
      {/* Stars */}
      <circle cx="50" cy="30" r="1.5" fill="var(--accent)" opacity="0.5" />
      <circle cx="90" cy="25" r="1" fill="var(--accent)" opacity="0.4" />
      <circle cx="110" cy="38" r="1.5" fill="var(--accent)" opacity="0.35" />
      {/* Ground horizon */}
      <path
        d="M 15 82 Q 70 72 125 82"
        stroke="var(--border)"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.6"
      />
      {/* Map pin on ground */}
      <circle cx="70" cy="80" r="4" fill="var(--accent)" opacity="0.7" />
      <path d="M70 76 L70 72" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" opacity="0.7" />
    </svg>
  )
}

function IllustrationItineraries() {
  return (
    <svg width="140" height="110" viewBox="0 0 140 110" fill="none" aria-hidden>
      {/* Map background card */}
      <rect x="25" y="20" width="90" height="72" rx="10" fill="var(--surface2)" />
      <rect x="25" y="20" width="90" height="72" rx="10" stroke="var(--border)" strokeWidth="1.5" />
      {/* Map grid lines */}
      <line x1="25" y1="46" x2="115" y2="46" stroke="var(--border)" strokeWidth="1" opacity="0.6" />
      <line x1="25" y1="66" x2="115" y2="66" stroke="var(--border)" strokeWidth="1" opacity="0.6" />
      <line x1="55" y1="20" x2="55" y2="92" stroke="var(--border)" strokeWidth="1" opacity="0.6" />
      <line x1="85" y1="20" x2="85" y2="92" stroke="var(--border)" strokeWidth="1" opacity="0.6" />
      {/* Route dotted line */}
      <path
        d="M 42 80 C 42 60, 60 60, 60 46 C 60 32, 85 32, 98 46"
        stroke="var(--accent)"
        strokeWidth="2"
        strokeDasharray="5 3"
        strokeLinecap="round"
        fill="none"
        opacity="0.7"
      />
      {/* Pin A */}
      <circle cx="42" cy="80" r="5" fill="var(--accent)" opacity="0.85" />
      <path d="M42 75 L42 68" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" opacity="0.7" />
      {/* Pin B */}
      <circle cx="98" cy="46" r="5" fill="var(--accent)" opacity="0.85" />
      <path d="M98 41 L98 34" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" opacity="0.7" />
      {/* Day labels suggestion */}
      <rect x="33" y="26" width="20" height="6" rx="3" fill="var(--accent)" opacity="0.15" />
      <rect x="59" y="26" width="20" height="6" rx="3" fill="var(--accent)" opacity="0.1" />
      <rect x="85" y="26" width="20" height="6" rx="3" fill="var(--accent)" opacity="0.07" />
    </svg>
  )
}

function IllustrationNotifications() {
  return (
    <svg width="140" height="110" viewBox="0 0 140 110" fill="none" aria-hidden>
      {/* Glow */}
      <ellipse cx="70" cy="62" rx="30" ry="22" fill="var(--accent)" fillOpacity="0.07" />
      {/* Bell body */}
      <path
        d="M 70 28 C 55 28 48 40 48 56 L 45 72 L 95 72 L 92 56 C 92 40 85 28 70 28 Z"
        fill="var(--surface2)"
        stroke="var(--accent)"
        strokeWidth="1.5"
        opacity="0.9"
      />
      {/* Bell clapper */}
      <path
        d="M 62 72 Q 70 80 78 72"
        stroke="var(--accent)"
        strokeWidth="1.5"
        strokeLinecap="round"
        fill="none"
        opacity="0.7"
      />
      {/* Handle notch at top */}
      <path
        d="M 66 28 Q 70 22 74 28"
        stroke="var(--accent)"
        strokeWidth="1.5"
        strokeLinecap="round"
        fill="none"
        opacity="0.6"
      />
      {/* Stars / sparkles */}
      <circle cx="40" cy="38" r="2" fill="var(--accent)" opacity="0.5" />
      <circle cx="102" cy="44" r="2.5" fill="var(--accent)" opacity="0.4" />
      <path d="M 108 32 L 110 36 L 108 40 L 106 36 Z" fill="var(--accent)" opacity="0.35" />
      <path d="M 28 52 L 30 56 L 28 60 L 26 56 Z" fill="var(--accent)" opacity="0.3" />
      {/* All caught up checkmark */}
      <circle cx="70" cy="90" r="8" fill="var(--accent)" opacity="0.12" />
      <path d="M 66 90 L 69 93 L 74 87" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.6" />
    </svg>
  )
}

function IllustrationMessages() {
  return (
    <svg width="140" height="110" viewBox="0 0 140 110" fill="none" aria-hidden>
      {/* Back bubble */}
      <rect x="50" y="18" width="70" height="46" rx="14" fill="var(--surface2)" stroke="var(--border)" strokeWidth="1.5" />
      <path d="M 80 64 L 72 74 L 84 64 Z" fill="var(--surface2)" stroke="var(--border)" strokeWidth="1.5" strokeLinejoin="round" />
      {/* Front bubble */}
      <rect x="22" y="42" width="65" height="42" rx="12" fill="var(--surface2)" stroke="var(--accent)" strokeWidth="1.5" opacity="0.9" />
      <path d="M 50 84 L 42 94 L 56 84 Z" fill="var(--surface2)" stroke="var(--accent)" strokeWidth="1.5" strokeLinejoin="round" opacity="0.9" />
      {/* Dots in front bubble */}
      <circle cx="37" cy="63" r="3.5" fill="var(--accent)" opacity="0.5" />
      <circle cx="49" cy="63" r="3.5" fill="var(--accent)" opacity="0.35" />
      <circle cx="61" cy="63" r="3.5" fill="var(--accent)" opacity="0.2" />
      {/* Paper plane in back bubble */}
      <g transform="translate(85, 41) rotate(15)">
        <path d="M-10 0 L10 -3 L2 4 Z" fill="var(--accent)" opacity="0.6" />
        <path d="M-10 0 L10 -3 L-2 8 Z" fill="var(--accent)" opacity="0.4" />
      </g>
    </svg>
  )
}

function IllustrationSearch() {
  return (
    <svg width="140" height="110" viewBox="0 0 140 110" fill="none" aria-hidden>
      {/* Magnifying glass circle */}
      <circle cx="62" cy="52" r="28" fill="var(--surface2)" stroke="var(--accent)" strokeWidth="2" opacity="0.85" />
      {/* Globe grid inside lens */}
      <circle cx="62" cy="52" r="20" fill="var(--accent)" fillOpacity="0.05" />
      <ellipse cx="62" cy="52" rx="20" ry="12" stroke="var(--border)" strokeWidth="1" opacity="0.6" />
      <line x1="42" y1="52" x2="82" y2="52" stroke="var(--border)" strokeWidth="1" opacity="0.6" />
      <line x1="62" y1="32" x2="62" y2="72" stroke="var(--border)" strokeWidth="1" opacity="0.6" />
      {/* Map pin on globe */}
      <circle cx="68" cy="46" r="3.5" fill="var(--accent)" opacity="0.75" />
      <path d="M68 42.5 L68 38" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" opacity="0.65" />
      {/* Handle */}
      <path
        d="M 83 70 L 105 90"
        stroke="var(--accent)"
        strokeWidth="5"
        strokeLinecap="round"
        opacity="0.6"
      />
      {/* Stars — no results vibe */}
      <path d="M 110 30 L 112 35 L 117 35 L 113 38 L 115 43 L 110 40 L 105 43 L 107 38 L 103 35 L 108 35 Z"
        fill="var(--accent)" opacity="0.2" />
      <circle cx="30" cy="35" r="2" fill="var(--accent)" opacity="0.3" />
      <circle cx="25" cy="70" r="1.5" fill="var(--accent)" opacity="0.25" />
    </svg>
  )
}

const ILLUSTRATIONS: Record<string, () => React.ReactElement> = {
  feed: IllustrationFeed,
  itineraries: IllustrationItineraries,
  notifications: IllustrationNotifications,
  messages: IllustrationMessages,
  search: IllustrationSearch,
}

// ── EmptyState component ─────────────────────────────────────────────────────

export function EmptyState({
  Icon,
  illustration,
  title,
  description,
  action,
}: {
  Icon?: LucideIcon
  illustration?: 'feed' | 'itineraries' | 'notifications' | 'messages' | 'search'
  title: string
  description?: string
  action?: { label: string; href?: string; onClick?: () => void }
}) {
  const Svg = illustration ? ILLUSTRATIONS[illustration] : null

  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      {Svg ? (
        <div className="mb-4">
          <Svg />
        </div>
      ) : Icon ? (
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
          style={{ background: 'rgba(252,163,17,0.1)' }}
        >
          <Icon className="w-7 h-7" style={{ color: 'var(--accent)' }} />
        </div>
      ) : null}
      <p className="font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
        {title}
      </p>
      {description && (
        <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
          {description}
        </p>
      )}
      {action && (
        <>
          {action.href ? (
            <Link href={action.href} className="btn btn-primary mt-2 text-sm">
              {action.label}
            </Link>
          ) : (
            <button onClick={action.onClick} className="btn btn-primary mt-2 text-sm">
              {action.label}
            </button>
          )}
        </>
      )}
    </div>
  )
}
