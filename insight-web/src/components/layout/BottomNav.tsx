'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Globe, Plus, MessageCircle, Bell } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { useUnreadCounts } from '@/hooks/useUnreadCounts'
import { Avatar } from '@/components/ui/Avatar'

const items = [
  { href: '/feed',          Icon: Home,          label: 'Feed' },
  { href: '/explore',       Icon: Globe,         label: 'Explorar' },
  { href: '/itineraries/new', Icon: Plus,        label: 'Novo', accent: true },
  { href: '/messages',      Icon: MessageCircle, label: 'Mensagens',    badgeKey: 'msg' as const },
  { href: '/notifications', Icon: Bell,          label: 'Notificações', badgeKey: 'notif' as const },
]

export function BottomNav() {
  const pathname = usePathname()
  const { user } = useAuthStore()
  const { notifCount, msgCount } = useUnreadCounts()

  const badges = { msg: msgCount, notif: notifCount }

  return (
    <nav
      className="lg:hidden fixed bottom-0 inset-x-0 flex items-center justify-around px-2 z-40 safe-area-pb"
      style={{
        height: 'var(--bottom-nav-h)',
        background: 'var(--bg-card)',
        borderTop: '1px solid var(--border)',
      }}
    >
      {items.map(({ href, Icon, label, accent, badgeKey }) => {
        const active = pathname === href
        const count = badgeKey ? badges[badgeKey] : 0
        return (
          <Link
            key={href}
            href={href}
            className="flex flex-col items-center justify-center gap-0.5 flex-1 py-1 relative"
            aria-label={label}
          >
            {accent ? (
              <span
                className="w-10 h-10 rounded-full flex items-center justify-center"
                style={{ background: 'var(--accent)' }}
              >
                <Icon className="w-5 h-5" style={{ color: '#000' }} />
              </span>
            ) : (
              <>
                <span className="relative">
                  <Icon
                    className="w-5 h-5"
                    style={{ color: active ? 'var(--accent)' : 'var(--text-secondary)' }}
                  />
                  {count > 0 && (
                    <span
                      className="absolute -top-1.5 -right-1.5 min-w-[14px] h-[14px] rounded-full text-[9px] font-bold flex items-center justify-center px-0.5"
                      style={{ background: '#ff4757', color: '#fff' }}
                    >
                      {count > 99 ? '99+' : count}
                    </span>
                  )}
                </span>
                <span
                  className="text-[10px]"
                  style={{ color: active ? 'var(--accent)' : 'var(--text-secondary)' }}
                >
                  {label}
                </span>
              </>
            )}
          </Link>
        )
      })}

      {/* Profile tab */}
      <Link
        href={user ? `/profile/${user.id}` : '/auth/login'}
        className="flex flex-col items-center justify-center flex-1 py-1"
        aria-label="Perfil"
      >
        <Avatar src={user?.avatarUrl} name={user?.username ?? '?'} size="xs" />
        <span className="text-[10px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>
          Perfil
        </span>
      </Link>
    </nav>
  )
}
