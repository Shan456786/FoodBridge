import { Link } from 'react-router-dom'
import {
  ArrowRight,
  BadgeCheck,
  CheckCircle2,
  FlaskConical,
  History,
  Package,
  Percent,
  Plus,
  Scale,
  Search,
  ShieldAlert,
  ShieldCheck,
  Truck,
  UtensilsCrossed,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { RescueTrendChart, StatusDonut } from '@/components/charts/Charts'
import { ActivityFeed } from '@/components/common/ActivityFeed'
import { CategoryIcon, ListingCard } from '@/components/common/ListingCard'
import { CountdownBadge, PickupStatusBadge } from '@/components/common/StatusBadge'
import { EmptyState, ErrorState, KpiCard } from '@/components/common/States'
import { useAuth } from '@/context/AuthContext'
import { useData, useNow } from '@/hooks/useData'
import { fetchAllListings, fetchAvailableListings, fetchOrgListings, fetchPickups, fetchRecentActivity, getImpactStats } from '@/lib/api'
import { rankMatches, evaluateMatch } from '@/lib/matching'
import { effectiveStatus } from '@/lib/time'
import type { FoodListing, Pickup } from '@/lib/types'

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

const ACTIVE_PICKUP = ['scheduled', 'assigned', 'en_route', 'arrived', 'collected']

export default function DashboardPage() {
  const { profile, organization } = useAuth()
  const role = profile!.role
  const now = useNow(30_000)

  const stats = useData(() => getImpactStats('mine'), [])
  const activity = useData(() => fetchRecentActivity(8), [])
  const pickups = useData<Pickup[]>(() => (role === 'admin' ? Promise.resolve([]) : fetchPickups()), [role])
  const listings = useData<FoodListing[]>(() => {
    if (role === 'donor' && organization) return fetchOrgListings(organization.id)
    if (role === 'admin') return fetchAllListings(60)
    if (role === 'receiver') return fetchAvailableListings()
    return Promise.resolve([])
  }, [role, organization?.id])

  const s = stats.data
  const activeListings = (listings.data ?? []).filter((l) => ['available', 'reserved'].includes(effectiveStatus(l, now)))
  const urgentPickups = (pickups.data ?? [])
    .filter((p) => ACTIVE_PICKUP.includes(p.status))
    .sort((a, b) => new Date(a.listing?.safe_until ?? 0).getTime() - new Date(b.listing?.safe_until ?? 0).getTime())

  const primaryAction =
    role === 'donor' ? (
      <Button asChild size="lg">
        <Link to="/listings/new">
          <Plus /> New listing
        </Link>
      </Button>
    ) : role === 'receiver' ? (
      <Button asChild size="lg">
        <Link to="/matches">
          <Search /> Find matches
        </Link>
      </Button>
    ) : role === 'volunteer' ? (
      <Button asChild size="lg">
        <Link to="/pickups">
          <Truck /> My pickups
        </Link>
      </Button>
    ) : (
      <Button asChild size="lg">
        <Link to="/admin">
          <ShieldCheck /> Admin console
        </Link>
      </Button>
    )

  const firstName = profile?.full_name?.split(' ')[0] || 'there'

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{organization?.name ?? (role === 'volunteer' ? 'Volunteer workspace' : 'Platform overview')}</p>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">
            {greeting()}, {firstName}
          </h1>
        </div>
        {primaryAction}
      </div>

      {organization && organization.verification_status !== 'verified' && (
        <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <ShieldAlert className="mt-0.5 size-5 shrink-0" />
          <div>
            <p className="font-semibold">
              {organization.verification_status === 'rejected' ? 'Verification was declined' : 'Verification pending'}
            </p>
            <p className="mt-0.5 text-amber-900/80">
              {organization.kind === 'receiver'
                ? 'An administrator must verify your organization before you can request food. You can browse listings meanwhile.'
                : 'Receivers can see that your organization has not been verified yet. You can still list food.'}
              {organization.verification_note && ` Note: ${organization.verification_note}`}
            </p>
          </div>
        </div>
      )}

      {/* KPIs */}
      {stats.error ? (
        <ErrorState message={stats.error} onRetry={stats.reload} />
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {!s ? (
            Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[108px] rounded-xl" />)
          ) : (
            <>
              <KpiCard
                accent
                icon={BadgeCheck}
                label="Verified rescued meals"
                value={s.verified_meals.toLocaleString()}
                hint={s.demo_listings > 0 ? 'Includes demonstration data' : 'Confirmed handovers only'}
              />
              <KpiCard
                icon={Package}
                label={role === 'donor' || role === 'admin' ? 'Active listings' : 'In progress'}
                value={role === 'donor' || role === 'admin' ? s.active_listings : s.in_progress}
                hint={`${s.total_listings} total ${role === 'volunteer' ? 'assignments' : 'listings'}`}
              />
              <KpiCard icon={Scale} label="Verified food (kg)" value={Number(s.verified_kg).toLocaleString()} hint="Only kg-denominated listings" />
              <KpiCard
                icon={Percent}
                label="Completion rate"
                value={s.completion_rate == null ? '—' : `${s.completion_rate}%`}
                hint={`${s.successful_pickups} verified · ${s.expired_listings} expired`}
              />
            </>
          )}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        {/* Main column */}
        <div className="space-y-6">
          {role !== 'volunteer' && (
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <div>
                  <CardTitle>
                    {role === 'donor' ? 'Your active listings' : role === 'receiver' ? 'Top matches for you' : 'Open listings across the platform'}
                  </CardTitle>
                  <CardDescription>
                    {role === 'receiver' ? 'Ranked by the matching engine' : 'Sorted by safe-use deadline'}
                  </CardDescription>
                </div>
                <Button asChild variant="ghost" size="sm">
                  <Link to={role === 'donor' ? '/listings' : role === 'receiver' ? '/matches' : '/admin'}>
                    View all <ArrowRight />
                  </Link>
                </Button>
              </CardHeader>
              <CardContent>
                {listings.loading ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Skeleton className="h-44" />
                    <Skeleton className="h-44" />
                  </div>
                ) : listings.error ? (
                  <ErrorState message={listings.error} onRetry={listings.reload} />
                ) : role === 'receiver' && organization ? (
                  (() => {
                    const ranked = rankMatches(activeListings, (l) => evaluateMatch(l, organization, now))
                      .filter((r) => r.match.eligible)
                      .slice(0, 4)
                    return ranked.length ? (
                      <div className="grid gap-3 sm:grid-cols-2">
                        {ranked.map((r) => (
                          <ListingCard key={r.item.id} listing={r.item} match={r.match} now={now} />
                        ))}
                      </div>
                    ) : (
                      <EmptyState icon={Search} title="No eligible matches right now" description="We'll show listings here as soon as compatible food is posted nearby." action={<Button asChild variant="outline"><Link to="/app/explore">Browse all food</Link></Button>} />
                    )
                  })()
                ) : activeListings.length ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {activeListings
                      .sort((a, b) => new Date(a.safe_until).getTime() - new Date(b.safe_until).getTime())
                      .slice(0, 4)
                      .map((l) => (
                        <ListingCard key={l.id} listing={l} now={now} />
                      ))}
                  </div>
                ) : (
                  <EmptyState
                    icon={UtensilsCrossed}
                    title="No active listings yet"
                    description={role === 'donor' ? 'Create your first donation to start rescuing food.' : 'There are no open listings right now.'}
                    action={
                      role === 'donor' && (
                        <Button asChild>
                          <Link to="/listings/new">
                            <Plus /> Create a listing
                          </Link>
                        </Button>
                      )
                    }
                  />
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Rescue trend · last 30 days</CardTitle>
              <CardDescription>Listed meals vs. meals verified as rescued{s && s.demo_listings > 0 ? ' · includes demonstration data' : ''}</CardDescription>
            </CardHeader>
            <CardContent>{s ? <RescueTrendChart data={s.timeseries} /> : <Skeleton className="h-[260px]" />}</CardContent>
          </Card>
        </div>

        {/* Side column */}
        <div className="space-y-6">
          {role !== 'admin' && (
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <div>
                  <CardTitle>Urgent pickups</CardTitle>
                  <CardDescription>Active pickups by deadline</CardDescription>
                </div>
                <Button asChild variant="ghost" size="sm">
                  <Link to="/pickups">
                    All <ArrowRight />
                  </Link>
                </Button>
              </CardHeader>
              <CardContent>
                {pickups.loading ? (
                  <Skeleton className="h-32" />
                ) : pickups.error ? (
                  <ErrorState message={pickups.error} onRetry={pickups.reload} />
                ) : urgentPickups.length ? (
                  <ul className="divide-y">
                    {urgentPickups.slice(0, 5).map((p) => (
                      <li key={p.id}>
                        <Link to="/pickups" className="flex items-center gap-3 py-2.5 hover:opacity-80">
                          {p.listing && <CategoryIcon category={p.listing.category} className="size-9" />}
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{p.listing?.title}</p>
                            <div className="mt-1 flex flex-wrap gap-1.5">
                              <PickupStatusBadge status={p.status} />
                              {p.listing && p.status !== 'collected' && <CountdownBadge deadline={p.listing.safe_until} now={now} />}
                            </div>
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <EmptyState icon={CheckCircle2} title="Nothing urgent" description="No active pickups right now." className="py-8" />
                )}
              </CardContent>
            </Card>
          )}

          {s && s.status_distribution.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Status distribution</CardTitle>
                <CardDescription>{role === 'volunteer' ? 'Listings you handled' : 'All listings in scope'}</CardDescription>
              </CardHeader>
              <CardContent>
                <StatusDonut data={s.status_distribution} height={220} />
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="size-4 text-slate-400" /> Recent activity
              </CardTitle>
            </CardHeader>
            <CardContent>
              {activity.loading ? (
                <Skeleton className="h-40" />
              ) : activity.error ? (
                <ErrorState message={activity.error} onRetry={activity.reload} />
              ) : activity.data?.length ? (
                <ActivityFeed events={activity.data} compact />
              ) : (
                <p className="py-6 text-center text-sm text-muted-foreground">No activity yet.</p>
              )}
            </CardContent>
          </Card>

          {profile?.is_demo && (
            <div className="flex gap-2 rounded-xl border border-dashed p-3 text-xs text-muted-foreground">
              <FlaskConical className="size-4 shrink-0" />
              Figures on this page come from seeded demonstration data and fictional organizations.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
