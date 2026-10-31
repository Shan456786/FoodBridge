import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown, Info, Plus, Sparkles, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { NativeSelect } from '@/components/common/Field'
import { ListingCard } from '@/components/common/ListingCard'
import { MatchScore } from '@/components/common/MatchScore'
import { DemoBadge, Pill, RequestStatusBadge, VerificationBadge } from '@/components/common/StatusBadge'
import { CardGridSkeleton, EmptyState, ErrorState, ListSkeleton, PageHeader } from '@/components/common/States'
import { useAuth } from '@/context/AuthContext'
import { useData, useNow } from '@/hooks/useData'
import { fetchAvailableListings, fetchListingRequests, fetchOrgListings, fetchOrganizations } from '@/lib/api'
import { ORG_TYPE_LABELS } from '@/lib/constants'
import { DEFAULT_WEIGHTS, evaluateMatch, rankMatches } from '@/lib/matching'
import { isRequestable } from '@/lib/time'

function WeightsCard() {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <Info className="size-4 text-slate-400" /> How scores work
        </CardTitle>
        <CardDescription className="text-xs">
          Hard filters first (deadline, pickup window, verification, storage, capacity, radius). Eligible pairs are then scored:
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-5">
          {Object.entries(DEFAULT_WEIGHTS).map(([k, w]) => (
            <li key={k} className="flex justify-between gap-2 capitalize">
              <span className="text-muted-foreground">{k}</span>
              <span className="tabular font-medium">{Math.round(w * 100)}%</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[0.7rem] text-muted-foreground">Distance is straight-line (Haversine), not road distance or travel time.</p>
      </CardContent>
    </Card>
  )
}

function ReceiverMatches() {
  const { organization } = useAuth()
  const now = useNow(30_000)
  const [showIneligible, setShowIneligible] = useState(false)
  const { data, error, loading, reload } = useData(fetchAvailableListings, [])

  const ranked = useMemo(
    () => rankMatches((data ?? []).filter((l) => isRequestable(l, now)), (l) => evaluateMatch(l, organization!, now)),
    [data, now, organization],
  )
  const eligible = ranked.filter((r) => r.match.eligible)
  const ineligible = ranked.filter((r) => !r.match.eligible)

  return (
    <>
      <PageHeader title="Matches" description={`Food ranked for ${organization?.name}`} />
      <div className="mb-6">
        <WeightsCard />
      </div>
      {organization?.verification_status !== 'verified' && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          Your organization isn't verified yet, so every listing is currently ineligible. An administrator will review your
          organization.
        </div>
      )}
      {loading ? (
        <CardGridSkeleton />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : (
        <>
          {eligible.length ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {eligible.map((r) => (
                <ListingCard key={r.item.id} listing={r.item} match={r.match} now={now} />
              ))}
            </div>
          ) : (
            <EmptyState icon={Sparkles} title="No eligible matches right now" description="Compatible listings will appear here as donors post them." action={<Button asChild variant="outline"><Link to="/app/explore">Browse all food</Link></Button>} />
          )}
          {ineligible.length > 0 && (
            <div className="mt-8">
              <Button variant="ghost" onClick={() => setShowIneligible((s) => !s)} aria-expanded={showIneligible}>
                <ChevronDown className={showIneligible ? 'rotate-180 transition' : 'transition'} />
                {ineligible.length} listing{ineligible.length > 1 ? 's' : ''} not eligible for your organization
              </Button>
              {showIneligible && (
                <div className="mt-3 grid gap-4 opacity-90 sm:grid-cols-2 xl:grid-cols-3">
                  {ineligible.map((r) => (
                    <ListingCard key={r.item.id} listing={r.item} match={r.match} now={now} />
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </>
  )
}

function DonorMatches() {
  const { organization } = useAuth()
  const now = useNow(30_000)
  const listings = useData(() => fetchOrgListings(organization!.id), [organization?.id])
  const receivers = useData(() => fetchOrganizations('receiver'), [])
  const open = (listings.data ?? []).filter((l) => isRequestable(l, now))
  const [selected, setSelected] = useState<string>('')
  const listing = open.find((l) => l.id === selected) ?? open[0]
  const requests = useData(() => (listing ? fetchListingRequests(listing.id) : Promise.resolve([])), [listing?.id])

  const ranked = useMemo(
    () => (listing ? rankMatches(receivers.data ?? [], (o) => evaluateMatch(listing, o, now)) : []),
    [listing, receivers.data, now],
  )
  const requestedBy = new Map((requests.data ?? []).map((r) => [r.receiver_org_id, r]))

  return (
    <>
      <PageHeader title="Matches" description="Which receivers can best rescue each of your open listings" />
      {listings.loading || receivers.loading ? (
        <ListSkeleton />
      ) : listings.error || receivers.error ? (
        <ErrorState message={(listings.error || receivers.error)!} onRetry={() => (listings.reload(), receivers.reload())} />
      ) : !listing ? (
        <EmptyState icon={Sparkles} title="No open listings to match" description="Create a listing to see which receivers are the best fit." action={<Button asChild><Link to="/listings/new"><Plus /> New listing</Link></Button>} />
      ) : (
        <div className="space-y-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <label htmlFor="listing" className="text-sm font-medium">
              Listing
            </label>
            <NativeSelect id="listing" value={listing.id} onChange={(e) => setSelected(e.target.value)} className="sm:w-96">
              {open.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.title} · {l.estimated_meals} meals
                </option>
              ))}
            </NativeSelect>
          </div>
          <WeightsCard />
          <div className="overflow-hidden rounded-xl border bg-card">
            <ul className="divide-y">
              {ranked.map(({ item: o, match }) => {
                const req = requestedBy.get(o.id)
                return (
                  <li key={o.id} className={`flex flex-col gap-3 p-4 sm:flex-row sm:items-center ${match.eligible ? '' : 'bg-slate-50/60'}`}>
                    {match.eligible ? (
                      <MatchScore score={match.score} />
                    ) : (
                      <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs text-slate-400">—</span>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">{o.name}</p>
                        <span className="text-xs text-muted-foreground">{ORG_TYPE_LABELS[o.org_type]}</span>
                        <VerificationBadge status={o.verification_status} />
                        {o.is_demo && <DemoBadge />}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{match.summary}</p>
                    </div>
                    {req ? <RequestStatusBadge status={req.status} /> : match.eligible ? <Pill tone="gray">Not requested yet</Pill> : null}
                  </li>
                )
              })}
              {!ranked.length && (
                <li className="p-8 text-center text-sm text-muted-foreground">
                  <Users className="mx-auto mb-2 size-5" /> No receiver organizations registered yet.
                </li>
              )}
            </ul>
          </div>
          <p className="text-xs text-muted-foreground">
            Receivers request listings themselves; review requests from the listing page or{' '}
            <Link to="/requests" className="text-brand underline-offset-4 hover:underline">
              Requests
            </Link>
            .
          </p>
        </div>
      )}
    </>
  )
}

export default function MatchesPage() {
  const { profile } = useAuth()
  return profile?.role === 'donor' ? <DonorMatches /> : <ReceiverMatches />
}
