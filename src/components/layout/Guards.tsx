import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { Loader2, ShieldX } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/context/AuthContext'
import type { Role } from '@/lib/types'
import { Link } from 'react-router-dom'

export function FullPageSpinner() {
  return (
    <div className="flex min-h-[60svh] items-center justify-center" role="status" aria-label="Loading">
      <Loader2 className="size-6 animate-spin text-brand" />
    </div>
  )
}

export function RequireAuth() {
  const { session, loading, profile, profileError, signOut } = useAuth()
  const location = useLocation()
  if (loading) return <FullPageSpinner />
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  if (!profile)
    return (
      <div className="mx-auto max-w-md px-4 py-24 text-center">
        <h1 className="text-lg font-semibold">We couldn't load your profile</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {profileError
            ? `You are signed in, but loading your profile failed: ${profileError}`
            : 'Your account exists but its FoodBridge profile is missing. Make sure the database migrations have been applied, then sign in again.'}
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Button onClick={() => window.location.reload()}>Retry</Button>
          <Button variant="outline" onClick={() => void signOut()}>
            Sign out
          </Button>
        </div>
      </div>
    )
  return <Outlet />
}

export function RequireRole({ roles }: { roles: Role[] }) {
  const { profile } = useAuth()
  if (!profile || !roles.includes(profile.role)) {
    return (
      <div className="mx-auto max-w-md py-20 text-center">
        <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-red-50 text-red-600">
          <ShieldX className="size-6" />
        </div>
        <h1 className="text-lg font-semibold">This area isn't available for your role</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your account role doesn't have access to this page. Access is also enforced by the database.
        </p>
        <Button asChild className="mt-6">
          <Link to="/dashboard">Back to overview</Link>
        </Button>
      </div>
    )
  }
  return <Outlet />
}

export function RedirectIfAuthed({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth()
  const location = useLocation()
  if (loading) return <FullPageSpinner />
  if (session) {
    const from = (location.state as { from?: string } | null)?.from
    return <Navigate to={from && from !== '/login' ? from : '/dashboard'} replace />
  }
  return <>{children}</>
}
