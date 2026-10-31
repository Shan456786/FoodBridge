import {
  Bell,
  BarChart3,
  ClipboardList,
  LayoutDashboard,
  LifeBuoy,
  Package,
  Palette,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Truck,
  UserRound,
  type LucideIcon,
} from 'lucide-react'
import type { Role } from '@/lib/types'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  roles?: Role[]
  /** Overrides the default "path or any sub-path" active check. */
  isActive?: (pathname: string) => boolean
}

export const NAV_SECTIONS: { label: string; items: NavItem[] }[] = [
  {
    label: 'Operations',
    items: [
      { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { to: '/app/explore', label: 'Explore Food', icon: Search },
      { to: '/listings', label: 'My Listings', icon: Package, roles: ['donor'], isActive: (p) => p === '/listings' || p === '/listings/new' || /^\/listings\/[^/]+\/edit$/.test(p) },
      { to: '/matches', label: 'Matches', icon: Sparkles, roles: ['donor', 'receiver'] },
      { to: '/requests', label: 'Requests', icon: ClipboardList, roles: ['donor', 'receiver'] },
      { to: '/pickups', label: 'Pickups', icon: Truck, roles: ['donor', 'receiver', 'volunteer'] },
    ],
  },
  {
    label: 'Insights',
    items: [
      { to: '/notifications', label: 'Notifications', icon: Bell },
      { to: '/impact', label: 'Impact Analytics', icon: BarChart3 },
      { to: '/admin', label: 'Admin Console', icon: ShieldCheck, roles: ['admin'] },
    ],
  },
  {
    label: 'Account',
    items: [
      { to: '/profile', label: 'My Profile', icon: UserRound },
      { to: '/settings', label: 'Account Settings', icon: Settings, isActive: (p) => p.startsWith('/settings') && !p.startsWith('/settings/appearance') },
      { to: '/settings/appearance', label: 'Appearance', icon: Palette },
      { to: '/help', label: 'Help & About', icon: LifeBuoy },
    ],
  },
]

export function navFor(role: Role | undefined) {
  return NAV_SECTIONS.map((s) => ({
    ...s,
    items: s.items.filter((i) => !i.roles || (role && i.roles.includes(role))),
  })).filter((s) => s.items.length)
}

export function isNavItemActive(item: NavItem, pathname: string) {
  return item.isActive ? item.isActive(pathname) : pathname === item.to || pathname.startsWith(item.to + '/')
}
