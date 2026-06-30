// src/components/layout/NavBar.tsx
'use client'

import Link             from 'next/link'
import { usePathname }  from 'next/navigation'
import { useQuery }     from '@tanstack/react-query'
import { useAuthStore } from '@/store/auth'
import { api }          from '@/lib/api-client'
import { cn }           from '@/lib/utils'

const NAV_LINKS = [
  { href: '/feed',          label: 'Feed',         icon: HomeIcon    },
  { href: '/explore',       label: 'Explorar',     icon: ExploreIcon },
  { href: '/search',        label: 'Pesquisar',    icon: SearchIcon  },
  { href: '/itineraries',   label: 'Roteiros',     icon: MapIcon     },
  { href: '/notifications', label: 'Notificações', icon: BellIcon    },
]

export function NavBar() {
  const { isAuthenticated, user, logout } = useAuthStore()
  const pathname = usePathname()

  // Badge de notificações não lidas
  const { data: countData } = useQuery({
    queryKey: ['notifications', 'count'],
    queryFn:  () => api.get<{ count: number }>('/notifications/unread-count'),
    enabled:  isAuthenticated,
    refetchInterval: 60_000, // re-fetch a cada minuto
  })
  const unread = countData?.count ?? 0

  return (
    <header className="sticky top-0 z-40 bg-surface/90 backdrop-blur-md border-b border-surface-muted">
      <nav className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
        {/* Logo */}
        <Link href={isAuthenticated ? '/feed' : '/'} className="flex items-center gap-2 shrink-0">
          <GlobeIcon className="w-7 h-7 text-blue" />
          <span className="font-display text-xl font-bold text-ink tracking-tight">
            MemoVoy
          </span>
        </Link>

        {/* Links centrais — desktop */}
        {isAuthenticated && (
          <div className="hidden md:flex items-center gap-1">
            {NAV_LINKS.map(({ href, label, icon: Icon }) => {
              const isActive = pathname.startsWith(href)
              const isNotif  = href === '/notifications'
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    'relative flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-blue/8 text-blue'
                      : 'text-ink-secondary hover:text-ink hover:bg-surface-subtle'
                  )}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                  {isNotif && unread > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 rounded-full bg-blue text-white text-2xs font-bold flex items-center justify-center leading-none">
                      {unread > 99 ? '99+' : unread}
                    </span>
                  )}
                </Link>
              )
            })}
          </div>
        )}

        {/* Direita: perfil ou auth */}
        <div className="flex items-center gap-2 shrink-0">
          {isAuthenticated ? (
            <>
              <Link
                href="/itineraries/new"
                className="hidden md:flex btn-primary py-2 text-sm"
              >
                <PlusIcon className="w-4 h-4" />
                Criar roteiro
              </Link>
              <div className="relative group">
                <button className="flex items-center gap-2 p-1 rounded-lg hover:bg-surface-subtle transition-colors">
                  <div className="w-8 h-8 rounded-full bg-blue/10 flex items-center justify-center text-blue font-semibold text-sm">
                    {user?.username?.[0]?.toUpperCase() ?? '?'}
                  </div>
                </button>
                {/* Dropdown */}
                <div className="absolute right-0 top-full mt-1 w-48 bg-surface rounded-xl shadow-card-md border border-surface-muted opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-150 z-50">
                  <div className="p-3 border-b border-surface-muted">
                    <p className="text-sm font-semibold text-ink">{user?.username}</p>
                    <p className="text-xs text-ink-tertiary">Ver perfil</p>
                  </div>
                  <div className="p-1">
                    <Link href={`/profile/${user?.id}`}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-ink hover:bg-surface-subtle">
                      <PersonIcon className="w-4 h-4 text-ink-secondary" /> Perfil
                    </Link>
                    <button
                      onClick={() => logout()}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-red-600 hover:bg-red-50"
                    >
                      <LogoutIcon className="w-4 h-4" /> Terminar sessão
                    </button>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <>
              <Link href="/auth/login" className="btn-ghost text-sm">
                Entrar
              </Link>
              <Link href="/auth/register" className="btn-primary py-2 text-sm">
                Começar grátis
              </Link>
            </>
          )}
        </div>
      </nav>

      {/* Bottom nav — mobile */}
      {isAuthenticated && (
        <div className="md:hidden fixed bottom-0 inset-x-0 bg-surface/95 backdrop-blur-md border-t border-surface-muted z-40">
          <nav className="flex items-center justify-around h-16 px-2">
            {NAV_LINKS.map(({ href, label, icon: Icon }) => {
              const isActive = pathname.startsWith(href)
              const isNotif  = href === '/notifications'
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    'relative flex flex-col items-center gap-0.5 px-3 py-2 rounded-lg transition-colors',
                    isActive ? 'text-blue' : 'text-ink-tertiary'
                  )}
                >
                  <Icon className="w-5 h-5" />
                  <span className="text-2xs">{label}</span>
                  {isNotif && unread > 0 && (
                    <span className="absolute top-1 right-1 w-2 h-2 bg-blue rounded-full" />
                  )}
                </Link>
              )
            })}
            <Link
              href="/itineraries/new"
              className="flex flex-col items-center gap-0.5 px-3 py-2 text-ink-tertiary"
            >
              <PlusIcon className="w-5 h-5" />
              <span className="text-2xs">Criar</span>
            </Link>
          </nav>
        </div>
      )}
    </header>
  )
}

// ---------------------------------------------------------------------------
// Ícones inline (sem dependência externa)
// ---------------------------------------------------------------------------
type IconProps = { className?: string }

function SearchIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx={11} cy={11} r={8}/><line x1={21} y1={21} x2={16.65} y2={16.65}/>
    </svg>
  )
}
function GlobeIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx={12} cy={12} r={10}/>
      <line x1={2} y1={12} x2={22} y2={12}/>
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
    </svg>
  )
}
function HomeIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
    </svg>
  )
}
function ExploreIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx={11} cy={11} r={8}/><line x1={21} y1={21} x2={16.65} y2={16.65}/>
    </svg>
  )
}
function MapIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/>
      <line x1={9} y1={3} x2={9} y2={18}/><line x1={15} y1={6} x2={15} y2={21}/>
    </svg>
  )
}
function BellIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
    </svg>
  )
}
function PersonIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx={12} cy={7} r={4}/>
    </svg>
  )
}
function PlusIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <line x1={12} y1={5} x2={12} y2={19}/><line x1={5} y1={12} x2={19} y2={12}/>
    </svg>
  )
}
function LogoutIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
      <polyline points="16 17 21 12 16 7"/><line x1={21} y1={12} x2={9} y2={12}/>
    </svg>
  )
}
