'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Home,
  Search,
  Globe,
  Map,
  Compass,
  Navigation,
  Users,
  MessageCircle,
  Bell,
  Trophy,
  User,
  Settings,
  Plus,
  Sun,
  Moon,
} from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { useTheme } from '@/hooks/useTheme'
import { useUnreadCounts } from '@/hooks/useUnreadCounts'
import { Avatar } from '@/components/ui/Avatar'
import { MemovoyWordmark } from '@/components/ui/MemovoyLogo'

function Badge({ count }: { count: number }) {
  if (count === 0) return null
  return (
    <span
      className="ml-auto min-w-[18px] h-[18px] rounded-full text-[10px] font-bold flex items-center justify-center px-1"
      style={{ background: 'var(--danger)', color: 'var(--on-danger)' }}
    >
      {count > 99 ? '99+' : count}
    </span>
  )
}

export function Sidebar() {
  const pathname = usePathname()
  const { user } = useAuthStore()
  const { theme, toggle } = useTheme()
  const { notifCount, msgCount } = useUnreadCounts()

  const navItems = [
    { href: '/feed',          label: 'Feed',          Icon: Home },
    { href: '/explore',       label: 'Explorar',      Icon: Globe },
    { href: '/search',        label: 'Pesquisa',      Icon: Search },
    { href: '/itineraries',   label: 'Roteiros',      Icon: Map },
    { href: '/map',           label: 'Mapa',          Icon: Compass },
    { href: '/nearby',        label: 'Perto de mim',  Icon: Navigation },
    { href: '/groups',        label: 'Grupos',        Icon: Users },
    { href: '/messages',      label: 'Mensagens',     Icon: MessageCircle, badge: msgCount },
    { href: '/notifications', label: 'Notificações',  Icon: Bell,          badge: notifCount },
    { href: '/rankings',      label: 'Rankings',       Icon: Trophy },
  ]

  return (
    <aside
      // overflow-hidden aqui e overflow-y-auto no <nav>, e não o contrário.
      //
      // Era o <aside> inteiro que deslizava, por isso num ecrã baixo subiam com
      // ele a marca, o botão "Novo Roteiro" e o cartão do utilizador — as três
      // coisas que têm de estar sempre à mão. A coluna precisa de 883px e um
      // portátil de 1366x768 dá cerca de 640 de viewport, portanto isto não é
      // um caso extremo: é o ecrã mais comum que há.
      className="hidden lg:flex flex-col py-5 px-3 h-screen sticky top-0 overflow-hidden"
      style={{
        width: 'var(--sidebar-width)',
        borderRight: '1px solid var(--border)',
        background: 'var(--bg-body)',
      }}
    >
      {/* Brand */}
      <Link href="/feed" className="px-3 mb-6 shrink-0">
        <MemovoyWordmark color="var(--accent)" size="sm" />
      </Link>

      {/* Create button */}
      <div className="px-1 mb-5 shrink-0">
        <Link href="/itineraries/new" className="btn btn-primary w-full gap-2 justify-center">
          <Plus className="w-4 h-4" />
          Novo Roteiro
        </Link>
      </div>

      {/* Nav items */}
      <nav className="flex flex-col gap-1.5 flex-1 min-h-0 overflow-y-auto">
        <p className="menu-seccao px-3 mb-1">Menu</p>
        {navItems.map(({ href, label, Icon, badge }) => {
          const active = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              className={`menu-item ${active ? 'menu-item-active' : ''}`}
            >
              <Icon className="w-5 h-5 shrink-0" />
              <span className="flex-1">{label}</span>
              {badge !== undefined && <Badge count={badge} />}
            </Link>
          )
        })}

        <div className="divider my-3" />

        {user && (
          <Link
            href={`/profile/${user.id}`}
            className={`menu-item ${pathname.startsWith('/profile') ? 'menu-item-active' : ''}`}
          >
            <User className="w-5 h-5 shrink-0" />
            <span>Perfil</span>
          </Link>
        )}

        <Link
          href="/settings"
          className={`menu-item ${pathname === '/settings' ? 'menu-item-active' : ''}`}
        >
          <Settings className="w-5 h-5 shrink-0" />
          <span>Definições</span>
        </Link>
      </nav>

      {/* Bottom: theme + user */}
      <div className="shrink-0 pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
        <button
          onClick={toggle}
          className="menu-item w-full text-left mb-2"
          aria-label="Alternar tema"
        >
          {theme === 'dark' ? (
            <Sun className="w-5 h-5 shrink-0" />
          ) : (
            <Moon className="w-5 h-5 shrink-0" />
          )}
          <span>{theme === 'dark' ? 'Modo claro' : 'Modo escuro'}</span>
        </button>

        {user && (
          <Link
            href={`/profile/${user.id}`}
            className="flex items-center gap-3 px-3 py-2 rounded-xl transition-colors hover:opacity-80"
          >
            <Avatar src={user.avatarUrl} name={user.username} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                @{user.username}
              </p>
              <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
                {user.email}
              </p>
            </div>
          </Link>
        )}
      </div>
    </aside>
  )
}
