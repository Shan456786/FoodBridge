import { Suspense, useState } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { Menu, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Logo } from '@/components/common/Logo'
import { ThemeToggle } from '@/components/common/ThemeToggle'
import { FullPageSpinner } from './Guards'
import { useAuth } from '@/context/AuthContext'
import { cn } from '@/lib/utils'
import { OfflineBanner } from './OfflineBanner'

const LINKS = [
  { to: '/how-it-works', label: 'How it works' },
  { to: '/explore', label: 'Explore food' },
]

export function PublicHeader() {
  const { session } = useAuth()
  const [open, setOpen] = useState(false)
  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link to="/" aria-label="FoodBridge home">
          <Logo />
        </Link>
        <nav className="hidden items-center gap-1 md:flex">
          {LINKS.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              className={({ isActive }) =>
                cn(
                  'rounded-md px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:text-brand',
                  isActive && 'text-brand',
                )
              }
            >
              {l.label}
            </NavLink>
          ))}
        </nav>
        <div className="hidden items-center gap-2 md:flex">
          <ThemeToggle />
          {session ? (
            <Button asChild size="lg">
              <Link to="/dashboard">Open dashboard</Link>
            </Button>
          ) : (
            <>
              <Button asChild variant="ghost" size="lg">
                <Link to="/login">Sign in</Link>
              </Button>
              <Button asChild size="lg">
                <Link to="/signup">Get started</Link>
              </Button>
            </>
          )}
        </div>
        <div className="flex items-center md:hidden">
          <ThemeToggle />
          <Button variant="ghost" size="icon-lg" aria-label={open ? 'Close menu' : 'Open menu'} onClick={() => setOpen((o) => !o)}>
            {open ? <X /> : <Menu />}
          </Button>
        </div>
      </div>
      {open && (
        <div className="border-t bg-background px-4 pt-2 pb-4 md:hidden">
          {LINKS.map((l) => (
            <Link key={l.to} to={l.to} onClick={() => setOpen(false)} className="block rounded-md px-2 py-2.5 text-sm font-medium">
              {l.label}
            </Link>
          ))}
          <div className="mt-3 grid grid-cols-2 gap-2">
            {session ? (
              <Button asChild className="col-span-2" size="lg">
                <Link to="/dashboard">Open dashboard</Link>
              </Button>
            ) : (
              <>
                <Button asChild variant="outline" size="lg">
                  <Link to="/login">Sign in</Link>
                </Button>
                <Button asChild size="lg">
                  <Link to="/signup">Get started</Link>
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  )
}

export function PublicFooter() {
  return (
    <footer className="border-t bg-forest-900 text-mint-50/80">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:px-6 md:grid-cols-[1.5fr_1fr_1fr]">
        <div>
          <Logo light />
          <p className="mt-3 max-w-sm text-sm leading-relaxed text-mint-50/70">
            Connecting surplus food with the people who need it, before time runs out.
          </p>
          <p className="mt-4 max-w-sm text-xs leading-relaxed text-mint-50/50">
            FoodBridge coordinates food redistribution. It does not certify food safety; participating organizations remain
            responsible for applicable food-safety requirements.
          </p>
        </div>
        <div>
          <p className="text-sm font-semibold text-white">Platform</p>
          <ul className="mt-3 space-y-2 text-sm">
            <li><Link className="hover:text-white" to="/how-it-works">How it works</Link></li>
            <li><Link className="hover:text-white" to="/explore">Explore food</Link></li>
            <li><Link className="hover:text-white" to="/signup">Join as donor or receiver</Link></li>
          </ul>
        </div>
        <div>
          <p className="text-sm font-semibold text-white">Team</p>
          <p className="mt-3 text-sm">Built by <span className="font-semibold text-white">Team Nexorithm</span></p>
          <p className="mt-1 text-xs text-mint-50/50">Hackathon project · Food-Expiry Rescue &amp; Local Surplus Exchange</p>
        </div>
      </div>
      <div className="border-t border-white/10 py-4 text-center text-xs text-mint-50/50">
        © {new Date().getFullYear()} FoodBridge · Team Nexorithm
      </div>
    </footer>
  )
}

export function PublicLayout() {
  return (
    <div className="flex min-h-svh flex-col">
      <OfflineBanner />
      <PublicHeader />
      <main className="flex-1">
        <Suspense fallback={<FullPageSpinner />}>
          <Outlet />
        </Suspense>
      </main>
      <PublicFooter />
    </div>
  )
}
