import { Suspense } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { Bell, Palette, ShieldCheck, UserRound } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { PageHeader } from '@/components/common/States'
import { cn } from '@/lib/utils'

const SECTIONS = [
  { to: 'profile', label: 'Profile', icon: UserRound, hint: 'Name, photo, contact' },
  { to: 'security', label: 'Password & security', icon: ShieldCheck, hint: 'Password, sessions' },
  { to: 'appearance', label: 'Appearance', icon: Palette, hint: 'Light, dark, system' },
  { to: 'notifications', label: 'Notifications', icon: Bell, hint: 'How alerts arrive' },
]

/** Account settings shell: section navigation (tabs on mobile, side list on desktop) + the active section. */
export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Account settings" description="Manage your profile, sign-in security and how FoodBridge looks on this device." />
      <div className="grid gap-6 lg:grid-cols-[220px_1fr] lg:gap-8">
        <nav aria-label="Settings sections" className="-mx-4 overflow-x-auto px-4 lg:mx-0 lg:overflow-visible lg:px-0">
          <ul className="flex gap-1 border-b lg:flex-col lg:border-b-0">
            {SECTIONS.map((s) => (
              <li key={s.to} className="shrink-0">
                <NavLink
                  to={s.to}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-2.5 border-b-2 border-transparent px-3 py-2.5 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground lg:rounded-lg lg:border-b-0 lg:py-2',
                      isActive ? 'border-emerald-brand text-foreground lg:bg-muted' : 'lg:hover:bg-muted/60',
                    )
                  }
                >
                  <s.icon className="size-4 shrink-0" />
                  <span>
                    {s.label}
                    <span className="hidden text-xs font-normal text-muted-foreground lg:block">{s.hint}</span>
                  </span>
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <div className="min-w-0 space-y-6">
          <Suspense fallback={<Skeleton className="h-64 w-full rounded-xl" />}>
            <Outlet />
          </Suspense>
        </div>
      </div>
    </div>
  )
}
