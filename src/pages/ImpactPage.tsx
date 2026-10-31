import { useState } from 'react'
import { BadgeCheck, Clock, Droplets, FlaskConical, Info, Leaf, ListPlus, Percent, Scale, Truck } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CategoryBars, DonorBars, RescueTrendChart, StatusDonut } from '@/components/charts/Charts'
import { ErrorState, KpiCard, PageHeader } from '@/components/common/States'
import { useAuth } from '@/context/AuthContext'
import { useData } from '@/hooks/useData'
import { getImpactStats } from '@/lib/api'

export default function ImpactPage() {
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const [scope, setScope] = useState<'mine' | 'platform'>(isAdmin ? 'platform' : 'mine')
  const { data: s, error, reload } = useData(() => getImpactStats(scope), [scope])

  const scopeLabel =
    profile?.role === 'donor' ? 'My donations' : profile?.role === 'receiver' ? 'Received by us' : profile?.role === 'volunteer' ? 'My pickups' : 'Platform'

  return (
    <div className="space-y-6">
      <PageHeader
        title="Impact analytics"
        description="Computed live from the database. Only code-verified, receipt-confirmed handovers count as rescued food."
        actions={
          !isAdmin && (
            <Tabs value={scope} onValueChange={(v) => setScope(v as 'mine' | 'platform')}>
              <TabsList>
                <TabsTrigger value="mine">{scopeLabel}</TabsTrigger>
                <TabsTrigger value="platform">Whole platform</TabsTrigger>
              </TabsList>
            </Tabs>
          )
        }
      />

      {s && s.demo_listings > 0 && (
        <div className="flex gap-2 rounded-xl border border-dashed border-slate-300 bg-card p-3 text-xs text-muted-foreground">
          <FlaskConical className="size-4 shrink-0" />
          {s.demo_listings === s.total_listings
            ? 'All figures in this view come from seeded demonstration data (fictional organizations).'
            : `This view includes ${s.demo_listings} demonstration listing(s) alongside real activity.`}
        </div>
      )}

      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !s ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-[108px] rounded-xl" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard accent icon={BadgeCheck} label="Verified rescued meals" value={s.verified_meals.toLocaleString()} hint="Receipt confirmed" />
            <KpiCard icon={Truck} label="Collected meals" value={s.collected_meals.toLocaleString()} hint="Handover code verified" />
            <KpiCard icon={ListPlus} label="Listed meals" value={s.listed_meals.toLocaleString()} hint={`${s.total_listings} listings · not rescued food`} />
            <KpiCard icon={Percent} label="Rescue completion" value={s.completion_rate == null ? '—' : `${s.completion_rate}%`} hint="Verified ÷ closed listings" />
            <KpiCard icon={Scale} label="Verified food (kg)" value={Number(s.verified_kg).toLocaleString()} hint="kg-denominated listings only" />
            <KpiCard icon={Droplets} label="Verified liquids (L)" value={Number(s.verified_litres).toLocaleString()} hint="Tracked separately from kg" />
            <KpiCard icon={Leaf} label="CO₂e avoided (estimate)" value={`${Number(s.co2e_kg_estimate).toLocaleString()} kg`} hint={`Verified kg × ${s.co2e_factor} — not measured`} />
            <KpiCard icon={Clock} label="Expired listings" value={s.expired_listings} hint={`${s.successful_pickups} successful pickups · ${s.cancelled_listings} cancelled`} />
          </div>

          <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
            <Card>
              <CardHeader>
                <CardTitle>Food rescued over time</CardTitle>
                <CardDescription>Meals per day, last 30 days (UTC days)</CardDescription>
              </CardHeader>
              <CardContent>
                <RescueTrendChart data={s.timeseries} height={300} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Listing outcomes</CardTitle>
                <CardDescription>Status of all listings in scope</CardDescription>
              </CardHeader>
              <CardContent>
                {s.status_distribution.length ? <StatusDonut data={s.status_distribution} height={300} /> : <p className="py-16 text-center text-sm text-muted-foreground">No listings yet.</p>}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Categories rescued</CardTitle>
                <CardDescription>Verified meals by food category</CardDescription>
              </CardHeader>
              <CardContent>
                {s.categories.length ? <CategoryBars data={s.categories} /> : <p className="py-16 text-center text-sm text-muted-foreground">No data yet.</p>}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Donor activity</CardTitle>
                <CardDescription>Listings and verified meals per donor</CardDescription>
              </CardHeader>
              <CardContent>
                {s.top_donors.length ? <DonorBars data={s.top_donors} /> : <p className="py-16 text-center text-sm text-muted-foreground">No data yet.</p>}
              </CardContent>
            </Card>
          </div>

          <Card size="sm">
            <CardContent className="flex gap-3 text-xs leading-relaxed text-muted-foreground">
              <Info className="mt-0.5 size-4 shrink-0" />
              <div className="space-y-1">
                <p>
                  <strong className="text-ink">Methodology.</strong> Listed and accepted food are never counted as rescued. A
                  listing contributes to verified metrics only after the collector enters the donor’s one-time code and the
                  receiver confirms receipt. Each listing has at most one accepted request, so nothing is double counted.
                </p>
                <p>
                  Meals use the donor's estimate. Kilograms and litres are reported separately; other units (portions, trays,
                  packets) are reflected through meals only. CO₂e is an <em>estimate</em>: verified kg × {s.co2e_factor} kg CO₂e/kg,
                  a commonly used average for avoided food waste. It is not a measured outcome.
                </p>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
