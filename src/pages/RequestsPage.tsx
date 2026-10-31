import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { Check, Inbox, Truck, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { CategoryIcon } from '@/components/common/ListingCard'
import { CountdownBadge, DemoBadge, RequestStatusBadge, VerificationBadge } from '@/components/common/StatusBadge'
import { EmptyState, ErrorState, ListSkeleton, PageHeader } from '@/components/common/States'
import { useAuth } from '@/context/AuthContext'
import { useData, useNow } from '@/hooks/useData'
import { cancelRequest, fetchRequests, respondToRequest } from '@/lib/api'
import { formatKm } from '@/lib/geo'
import { evaluateMatch } from '@/lib/matching'
import { effectiveStatus } from '@/lib/time'
import type { RequestStatus } from '@/lib/types'

export default function RequestsPage() {
  const { profile } = useAuth()
  const isDonor = profile?.role === 'donor'
  const now = useNow(30_000)
  const [tab, setTab] = useState<RequestStatus | 'all'>('pending')
  const { data, error, loading, reload } = useData(fetchRequests, [])

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: data?.length ?? 0 }
    for (const r of data ?? []) c[r.status] = (c[r.status] ?? 0) + 1
    return c
  }, [data])
  const rows = (data ?? []).filter((r) => tab === 'all' || r.status === tab)

  async function act(fn: () => Promise<unknown>, success: string) {
    try {
      await fn()
      toast.success(success)
      void reload()
    } catch (e) {
      toast.error((e as Error).message)
      void reload()
      return false
    }
  }

  return (
    <div>
      <PageHeader
        title={isDonor ? 'Incoming requests' : 'My requests'}
        description={isDonor ? 'Accept one receiver per listing. Acceptance is atomic and closes competing requests.' : 'Track the status of food your organization requested.'}
      />
      <Tabs value={tab} onValueChange={(v) => setTab(v as RequestStatus | 'all')} className="mb-4">
        <TabsList className="flex-wrap">
          {(['pending', 'accepted', 'rejected', 'cancelled', 'all'] as const).map((t) => (
            <TabsTrigger key={t} value={t} className="capitalize">
              {t === 'rejected' ? 'Declined' : t}
              <span className="tabular ml-1 text-xs text-muted-foreground">{counts[t] ?? 0}</span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {loading ? (
        <ListSkeleton />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title={tab === 'pending' ? 'No pending requests' : 'No requests here'}
          description={isDonor ? 'When receivers request your food, it appears here.' : 'Find compatible food on the Matches page.'}
          action={!isDonor && <Button asChild variant="outline"><Link to="/matches">Find matches</Link></Button>}
        />
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <ul className="divide-y">
            {rows.map((r) => {
              const l = r.listing
              const listingStatus = l ? effectiveStatus(l, now) : null
              const m = isDonor && l && r.receiver ? evaluateMatch(l, r.receiver, now) : null
              return (
                <li key={r.id} className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center">
                  <div className="flex min-w-0 flex-1 gap-3">
                    {l && <CategoryIcon category={l.category} />}
                    <div className="min-w-0">
                      <Link to={`/listings/${r.listing_id}`} className="font-medium hover:underline">
                        {l?.title ?? 'Listing'}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {isDonor ? (
                          <>
                            from <span className="font-medium text-ink">{r.receiver?.name}</span>
                          </>
                        ) : (
                          <>
                            donor <span className="font-medium text-ink">{l?.donor?.name}</span>
                          </>
                        )}{' '}
                        · {r.distance_km != null ? `${formatKm(Number(r.distance_km))} (straight-line)` : 'distance unknown'} ·{' '}
                        {format(new Date(r.created_at), 'd MMM, HH:mm')}
                        {m?.eligible ? ` · ${m.score}% match` : ''}
                      </p>
                      {r.message && <p className="mt-1 text-sm text-slate-700">“{r.message}”</p>}
                      {r.decision_note && <p className="mt-1 text-xs text-muted-foreground">Note: {r.decision_note}</p>}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {isDonor && r.receiver && <VerificationBadge status={r.receiver.verification_status} />}
                    {l && r.status === 'pending' && <CountdownBadge deadline={l.safe_until} now={now} />}
                    <RequestStatusBadge status={r.status} />
                    {r.is_demo && <DemoBadge />}
                    {isDonor && r.status === 'pending' && listingStatus === 'available' && (
                      <>
                        <ConfirmDialog
                          destructive
                          title="Decline this request?"
                          description={`${r.receiver?.name} will be notified.`}
                          confirmLabel="Decline"
                          withNote="Reason (optional)"
                          trigger={<Button variant="outline" size="sm"><X /> Decline</Button>}
                          onConfirm={(note) => act(() => respondToRequest(r.id, false, note), 'Request declined')}
                        />
                        <ConfirmDialog
                          title={`Accept ${r.receiver?.name}?`}
                          description="This reserves the listing, creates a pickup and declines any other pending requests for it."
                          confirmLabel="Accept"
                          trigger={<Button size="sm"><Check /> Accept</Button>}
                          onConfirm={(note) => act(() => respondToRequest(r.id, true, note), 'Request accepted — pickup created')}
                        />
                      </>
                    )}
                    {!isDonor && (r.status === 'pending' || r.status === 'accepted') && (
                      <ConfirmDialog
                        destructive
                        title="Withdraw this request?"
                        description={r.status === 'accepted' ? 'The pickup will be cancelled and the donor notified.' : 'The donor will be notified.'}
                        confirmLabel="Withdraw"
                        trigger={<Button variant="outline" size="sm"><X /> Withdraw</Button>}
                        onConfirm={() => act(() => cancelRequest(r.id), 'Request withdrawn')}
                      />
                    )}
                    {r.status === 'accepted' && (
                      <Button asChild size="sm">
                        <Link to="/pickups">
                          <Truck /> Pickup
                        </Link>
                      </Button>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
