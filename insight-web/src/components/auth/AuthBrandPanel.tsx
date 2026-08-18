import { MemovoyWordmark } from '@/components/ui/MemovoyLogo'

function GlobeIllustration() {
  return (
    <svg width="96" height="96" viewBox="0 0 96 96" fill="none" aria-hidden>
      {/* Outer glow ring */}
      <circle cx="48" cy="48" r="44" stroke="rgba(71,163,203,0.12)" strokeWidth="1.5" />
      {/* Globe body */}
      <circle cx="48" cy="48" r="34" fill="rgba(71,163,203,0.07)" stroke="rgba(71,163,203,0.25)" strokeWidth="1.5" />
      {/* Latitude lines */}
      <ellipse cx="48" cy="48" rx="34" ry="14" stroke="rgba(71,163,203,0.18)" strokeWidth="1" />
      <ellipse cx="48" cy="48" rx="34" ry="24" stroke="rgba(71,163,203,0.1)" strokeWidth="1" />
      {/* Vertical meridian */}
      <line x1="48" y1="14" x2="48" y2="82" stroke="rgba(71,163,203,0.15)" strokeWidth="1" />
      <line x1="14" y1="48" x2="82" y2="48" stroke="rgba(71,163,203,0.15)" strokeWidth="1" />
      {/* Flight arc — Europe to Asia */}
      <path
        d="M 26 42 Q 48 22 70 38"
        stroke="#47A3CB"
        strokeWidth="1.5"
        strokeDasharray="4 3"
        strokeLinecap="round"
        fill="none"
        opacity="0.7"
      />
      {/* Flight arc — Americas to Europe */}
      <path
        d="M 22 56 Q 38 68 62 58"
        stroke="#47A3CB"
        strokeWidth="1.5"
        strokeDasharray="4 3"
        strokeLinecap="round"
        fill="none"
        opacity="0.5"
      />
      {/* Pin — Europe */}
      <circle cx="42" cy="36" r="4" fill="#47A3CB" opacity="0.9" />
      <path d="M42 32 L42 26" stroke="#47A3CB" strokeWidth="1.5" strokeLinecap="round" opacity="0.8" />
      {/* Pin — Asia */}
      <circle cx="66" cy="42" r="3.5" fill="#47A3CB" opacity="0.75" />
      <path d="M66 38.5 L66 34" stroke="#47A3CB" strokeWidth="1.5" strokeLinecap="round" opacity="0.65" />
      {/* Pin — Americas */}
      <circle cx="26" cy="54" r="3" fill="#47A3CB" opacity="0.6" />
      {/* Plane near Europe-Asia arc */}
      <g transform="translate(54, 27) rotate(30)">
        <path d="M-5 0 L5 -1.5 L2 2 Z" fill="#47A3CB" opacity="0.85" />
        <path d="M-5 0 L5 -1.5 L-1 4 Z" fill="#47A3CB" opacity="0.55" />
      </g>
    </svg>
  )
}

const STATS = [
  { value: '12k+', label: 'Viajantes' },
  { value: '95',   label: 'Países' },
  { value: '50k+', label: 'Dias planeados' },
]

export function AuthBrandPanel({ tagline }: { tagline?: string }) {
  return (
    <div
      className="hidden md:flex flex-col items-center justify-between p-12 text-center relative overflow-hidden select-none"
      style={{ background: '#0D1824' }}
    >
      {/* Dot grid texture */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.04) 1px, transparent 1px)',
          backgroundSize: '32px 32px',
        }}
      />

      {/* Subtle blue glow — bottom */}
      <div
        aria-hidden
        className="absolute bottom-0 left-0 right-0 pointer-events-none"
        style={{
          height: '45%',
          background:
            'radial-gradient(ellipse 70% 55% at 50% 100%, rgba(71,163,203,0.08) 0%, transparent 70%)',
        }}
      />

      {/* Wordmark */}
      <div className="relative z-10">
        <MemovoyWordmark color="#47A3CB" size="lg" />
      </div>

      {/* Hero content */}
      <div className="relative z-10 flex flex-col items-center">
        {/* Globe illustration */}
        <div className="mb-8">
          <GlobeIllustration />
        </div>

        <h1
          className="text-[2.25rem] font-bold leading-[1.15] mb-5"
          style={{ color: '#CBE0F2' }}
        >
          O mundo começa<br />
          <span style={{ color: '#47A3CB', fontWeight: 700 }}>onde o mapa acaba.</span>
        </h1>

        <div
          className="mb-5 h-px w-10"
          style={{ background: 'rgba(71,163,203,0.3)' }}
        />

        <p
          className="text-base leading-relaxed"
          style={{ color: '#8AAECB', maxWidth: '30ch' }}
        >
          {tagline ?? 'Roteiros gerados por IA, memórias partilhadas com a comunidade.'}
        </p>

        {/* Stats */}
        <div className="flex justify-center gap-10 mt-10">
          {STATS.map((s) => (
            <div key={s.label}>
              <p
                className="text-2xl font-black leading-none mb-0.5"
                style={{ color: '#CBE0F2', fontVariantNumeric: 'tabular-nums' }}
              >
                {s.value}
              </p>
              <p className="text-xs" style={{ color: '#7090AA' }}>
                {s.label}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Testimonial card */}
      <div
        className="relative z-10 w-full rounded-2xl p-5 text-left"
        style={{
          background: '#132234',
          border: '1px solid #253D54',
        }}
      >
        <div className="flex gap-0.5 mb-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <span key={i} style={{ color: '#47A3CB', fontSize: '0.75rem' }}>★</span>
          ))}
        </div>
        <p className="text-sm leading-relaxed mb-4" style={{ color: '#8AAECB' }}>
          “Esta app mudou por completo a forma como planeio as minhas viagens.
          O itinerário de Tóquio foi absolutamente perfeito.”
        </p>
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
            style={{ background: 'rgba(71,163,203,0.12)', color: '#47A3CB' }}
          >
            A
          </div>
          <div>
            <p className="text-xs font-semibold" style={{ color: '#CBE0F2' }}>Ana Santos</p>
            <p className="text-xs" style={{ color: '#7090AA' }}>Lisboa, Portugal</p>
          </div>
        </div>
      </div>
    </div>
  )
}
