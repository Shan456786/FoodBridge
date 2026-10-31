import { Suspense, useEffect, useState } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { formatDistanceToNowStrict } from 'date-fns'
import {
  Bell,
  ChevronsLeft,
  ChevronsRight,
  FlaskConical,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  Menu,
  Moon,
  Palette,
  Settings,
  Sun,
  UserRound,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Logo, LogoMark } from '@/components/common/Logo'
import { DemoBadge } from '@/components/common/StatusBadge'
import { THEME_OPTIONS } from '@/components/common/themeOptions'
import { UserAvatar } from '@/components/common/UserAvatar'
import { useAuth } from '@/context/AuthContext'
import { useNotifications } from '@/context/NotificationsContext'
import { useTheme } from '@/context/ThemeContext'
import { OFFLINE_DEMO, syncExpiry } from '@/lib/api'
import { ROLE_LABELS } from '@/lib/constants'
import type { ThemePreference } from '@/lib/preferences'
import { cn } from '@/lib/utils'
import { FullPageSpinner } from './Guards'
import { isNavItemActive, navFor } from './nav'
import { OfflineBanner } from './OfflineBanner'

const COLLAPSE_KEY = 'fb.sidebar.collapsed'

function readCollapsed() {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === '1'
  } catch {
    return false
  }
}

function useSignOut() {
  const { signOut } = useAuth()
  const navigate = useNavigate()
  return async () => {
    await signOut()
    toast.success('Signed out')
    navigate('/')
  }
}

function SidebarNav({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const { profile } = useAuth()
  const { unread } = useNotifications()
  const { pathname } = useLocation()
  return (
    <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4" aria-label="Main">
      {navFor(profile?.role).map((section) => (
        <div key={section.label}>
          {!collapsed && (
            <p className="mb-1.5 px-3 text-[0.68rem] font-semibold tracking-wider text-muted-foreground/80 uppercase">{section.label}</p>
          )}
          <ul className="space-y-0.5">
            {section.items.map((item) => {
              const active = isNavItemActive(item, pathname)
              const link = (
                <Link
                  to={item.to}
                  onClick={onNavigate}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'group relative flex h-9 items-center gap-3 rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                    active &&
                      'bg-sidebar-accent text-sidebar-accent-foreground before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-r before:bg-emerald-brand',
                    collapsed && 'justify-center px-0',
                  )}
                >
                  <item.icon className={cn('size-[18px] shrink-0', active ? 'text-emerald-brand' : 'opacity-80 group-hover:opacity-100')} />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                  {item.to === '/notifications' && unread > 0 && (
                    <span
                      className={cn(
                        'tabular rounded-full bg-emerald-brand px-1.5 text-[0.68rem] leading-[18px] font-semibold text-white',
                        collapsed ? 'absolute top-0.5 right-1' : 'ml-auto',
                      )}
                    >
                      {unread > 99 ? '99+' : unread}
                    </span>
                  )}
                </Link>
              )
              return (
                <li key={item.to}>
                  {collapsed ? (
                    <Tooltip>
                      <TooltipTrigger asChild>{link}</TooltipTrigger>
                      <TooltipContent side="right">{item.label}</TooltipContent>
                    </Tooltip>
                  ) : (
                    link
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </nav>
  )
}

/** Signed-in user summary + sign-out at the foot of the sidebar. */
function SidebarAccount({ collapsed }: { collapsed: boolean }) {
  const { profile, session } = useAuth()
  const signOut = useSignOut()
  const name = profile?.full_name || session?.user.email || 'Account'
  const button = (
    <Button
      variant="ghost"
      size={collapsed ? 'icon-lg' : 'default'}
      className={cn('text-muted-foreground hover:text-destructive', !collapsed && 'w-full justify-start')}
      onClick={signOut}
      aria-label="Sign out"
    >
      <LogOut />
      {!collapsed && 'Sign out'}
    </Button>
  )
  return (
    <div className={cn('space-y-1 border-t p-3', collapsed && 'flex flex-col items-center')}>
      {!collapsed && (
        <Link to="/profile" className="flex items-center gap-3 rounded-lg p-2 hover:bg-sidebar-accent">
          <UserAvatar userId={profile?.id} name={name} />
          <span className="min-w-0">
            <span className="block truncate text-sm leading-tight font-medium">{name}</span>
            <span className="block truncate text-xs leading-tight text-muted-foreground">{profile ? ROLE_LABELS[profile.role] : ''}</span>
          </span>
        </Link>
      )}
      {collapsed ? (
        <Tooltip>
          <TooltipTrigger asChild>{button}</TooltipTrigger>
          <TooltipContent side="right">Sign out</TooltipContent>
        </Tooltip>
      ) : (
        button
      )}
    </div>
  )
}

function ThemeMenu() {
  const { theme, resolved, setTheme } = useTheme()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-lg" aria-label={`Theme: ${theme}`}>
          {resolved === 'dark' ? <Moon className="size-5" /> : <Sun className="size-5" />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuLabel className="text-xs text-muted-foreground">Theme</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={theme} onValueChange={(v) => setTheme(v as ThemePreference)}>
          {THEME_OPTIONS.map((o) => (
            <DropdownMenuRadioItem key={o.value} value={o.value}>
              <o.icon /> {o.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function NotificationBell() {
  const { items, unread, markRead, markAllRead, live } = useNotifications()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon-lg" className="relative" aria-label={`Notifications (${unread} unread)`}>
          <Bell className="size-5" />
          {unread > 0 && (
            <span className="tabular absolute top-1 right-1 flex min-w-4 items-center justify-center rounded-full bg-emerald-brand px-1 text-[0.62rem] leading-4 font-semibold text-white ring-2 ring-background">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(92vw,380px)] p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <p className="text-sm font-semibold">Notifications</p>
            <p className="text-xs text-muted-foreground">{live ? 'Live updates on' : 'Refreshing every 30s'}</p>
          </div>
          <Button variant="ghost" size="sm" disabled={!unread} onClick={markAllRead}>
            Mark all read
          </Button>
        </div>
        <ul className="max-h-96 overflow-y-auto">
          {items.slice(0, 8).map((n) => (
            <li key={n.id}>
              <button
                className="flex w-full gap-3 border-b px-4 py-3 text-left last:border-0 hover:bg-muted/60"
                onClick={() => {
                  if (!n.read_at) void markRead(n.id)
                  setOpen(false)
                  if (n.link) navigate(n.link)
                }}
              >
                <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', n.read_at ? 'bg-transparent' : 'bg-emerald-brand')} />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{n.title}</span>
                  {n.body && <span className="line-clamp-2 block text-xs text-muted-foreground">{n.body}</span>}
                  <span className="mt-1 block text-[0.7rem] text-muted-foreground/80">
                    {formatDistanceToNowStrict(new Date(n.created_at), { addSuffix: true })}
                  </span>
                </span>
              </button>
            </li>
          ))}
          {!items.length && <li className="px-4 py-8 text-center text-sm text-muted-foreground">You're all caught up.</li>}
        </ul>
        <div className="border-t p-2">
          <Button variant="ghost" className="w-full" onClick={() => (setOpen(false), navigate('/notifications'))}>
            View all notifications
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function UserMenu() {
  const { profile, organization, session } = useAuth()
  const { unread } = useNotifications()
  const navigate = useNavigate()
  const signOut = useSignOut()
  const name = profile?.full_name || session?.user.email || 'Account'
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-2 rounded-lg p-1 pr-2 outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50" aria-label="Account menu">
          <UserAvatar userId={profile?.id} name={name} />
          <span className="hidden text-left sm:block">
            <span className="block max-w-40 truncate text-sm leading-tight font-medium">{name}</span>
            <span className="block text-xs leading-tight text-muted-foreground">{profile ? ROLE_LABELS[profile.role] : ''}</span>
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="flex items-center gap-3 py-2 font-normal">
          <UserAvatar userId={profile?.id} name={name} size="md" />
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold">{name}</span>
            <span className="block truncate text-xs text-muted-foreground">{session?.user.email}</span>
            <span className="mt-1 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
              {profile && ROLE_LABELS[profile.role]}
              {organization && <> · <span className="truncate">{organization.name}</span></>}
              {profile?.is_demo && <DemoBadge className="ml-0.5" />}
            </span>
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={() => navigate('/dashboard')}>
            <LayoutDashboard /> Dashboard
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => navigate('/profile')}>
            <UserRound /> My profile
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => navigate('/settings/profile')}>
            <Settings /> Account settings
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => navigate('/settings/appearance')}>
            <Palette /> Appearance
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => navigate('/notifications')}>
            <Bell /> Notifications
            {unread > 0 && <span className="tabular ml-auto text-xs text-muted-foreground">{unread}</span>}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => navigate('/help')}>
            <LifeBuoy /> Help &amp; about
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={signOut}>
          <LogOut /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function AppLayout() {
  const { profile } = useAuth()
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const [mobileOpen, setMobileOpen] = useState(false)
  const location = useLocation()

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0')
    } catch {
      /* storage unavailable */
    }
  }, [collapsed])

  // Opportunistic expiry synchronisation (all reads also treat overdue listings as expired).
  useEffect(() => {
    void syncExpiry()
    const t = setInterval(syncExpiry, 5 * 60_000)
    return () => clearInterval(t)
  }, [])

  // Braces matter: newer browsers return a value from scrollTo, and an effect
  // must return nothing or a cleanup function.
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [location.pathname])

  return (
    <div className="flex min-h-svh">
      <aside
        className={cn(
          'sticky top-0 hidden h-svh shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-200 lg:flex',
          collapsed ? 'w-[72px]' : 'w-64',
        )}
      >
        <div className={cn('flex h-16 items-center border-b border-sidebar-border px-4', collapsed && 'justify-center px-0')}>
          <Link to="/dashboard" aria-label="FoodBridge dashboard">
            {collapsed ? <LogoMark /> : <Logo />}
          </Link>
        </div>
        <SidebarNav collapsed={collapsed} />
        <SidebarAccount collapsed={collapsed} />
        <div className={cn('px-3 pb-3', collapsed && 'flex justify-center')}>
          <Button
            variant="ghost"
            size={collapsed ? 'icon-lg' : 'sm'}
            className={cn('text-muted-foreground', !collapsed && 'w-full justify-start')}
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <ChevronsRight /> : <ChevronsLeft />}
            {!collapsed && 'Collapse'}
          </Button>
        </div>
      </aside>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="flex w-72 flex-col gap-0 bg-sidebar p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <div className="flex h-16 items-center border-b px-4">
            <Logo />
          </div>
          <SidebarNav collapsed={false} onNavigate={() => setMobileOpen(false)} />
          <SidebarAccount collapsed={false} />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur-md supports-[backdrop-filter]:bg-background/70 sm:px-6">
          <Button variant="ghost" size="icon-lg" className="lg:hidden" aria-label="Open navigation" onClick={() => setMobileOpen(true)}>
            <Menu className="size-5" />
          </Button>
          <Link to="/dashboard" className="lg:hidden" aria-label="FoodBridge dashboard">
            <LogoMark className="size-7" />
          </Link>
          <div className="ml-auto flex items-center gap-1">
            <ThemeMenu />
            <NotificationBell />
            <UserMenu />
          </div>
        </header>
        <OfflineBanner />
        {profile?.is_demo && !OFFLINE_DEMO && (
          <div className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900 sm:px-6">
            <FlaskConical className="size-3.5 shrink-0" />
            <span>
              <strong>Demo mode.</strong> You're exploring with fictional organizations and sample data. Demo accounts can only
              interact with demo records{profile.role === 'admin' ? ' and the demo admin can only moderate demo data' : ''}.
            </span>
          </div>
        )}
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {/* Keeps the sidebar and header on screen while a page's code loads. */}
          <Suspense fallback={<FullPageSpinner />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  )
}
