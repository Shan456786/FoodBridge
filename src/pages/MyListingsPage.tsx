import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { format } from 'date-fns'
import { ClipboardList, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CategoryIcon } from '@/components/common/ListingCard'
import { CountdownBadge, DemoBadge, ListingStatusBadge, Pill } from '@/components/common/StatusBadge'
import { EmptyState, ErrorState, ListSkeleton, PageHeader } from '@/components/common/States'
import { useAuth } from '@/context/AuthContext'
import { useData, useNow } from '@/hooks/useData'
import { fetchOrgListings, fetchRequests } from '@/lib/api'
import { UNIT_LABELS } from '@/lib/constants'
import { effectiveStatus } from '@/lib/time'
import type { ListingStatus } from '@/lib/types'

const TABS: { key: string; label: string; statuses: ListingStatus[] }[] = [
  { key: 'active', label: 'Active', statuses: ['available', 'reserved'] },
  { key: 'collected', label: 'Collected', statuses: ['collected'] },
  { key: 'completed', label: 'Verified', statuses: ['completed'] },
  { key: 'closed', label: 'Closed', statuses: ['expired', 'cancelled', 'removed'] },
]

export default function MyListingsPage() {
  const { organization } = useAuth()
  const now = useNow(30_000)
  const [tab, setTab] = useState('active')
  const listings = useData(() => fetchOrgListings(organization!.id), [organization?.id], !!organization)
  const requests = useData(fetchRequests, [])

  const pendingByListing = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of requests.data ?? []) if (r.status === 'pending') m.set(r.listing_id, (m.get(r.listing_id) ?? 0) + 1)
    return m
  }, [requests.data])

  const grouped = useMemo(() => {
    const out: Record<string, typeof listings.data> = {}
    for (const t of TABS) out[t.key] = (listings.data ?? []).filter((l) => t.statuses.includes(effectiveStatus(l, now)))
    return out
  }, [listings.data, now])

  const rows = grouped[tab] ?? []

  return (
    <div>
      <PageHeader
        title="My listings"
        description={organization ? `Donations from ${organization.name}` : undefined}
        actions={
          <Button asChild size="lg">
            <Link to="/listings/new">
              <Plus /> New listing
            </Link>
          </Button>
        }
      />
      <Tabs value={tab} onValueChange={setTab} className="mb-4">
        <TabsList>
          {TABS.map((t) => (
            <TabsTrigger key={t.key} value={t.key}>
              {t.label}
              <span className="tabular ml-1 text-xs text-muted-foreground">{grouped[t.key]?.length ?? 0}</span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {listings.loading ? (
        <ListSkeleton />
      ) : listings.error ? (
        <ErrorState message={listings.error} onRetry={listings.reload} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title={tab === 'active' ? 'No active listings yet' : 'Nothing here yet'}
          description={tab === 'active' ? 'Create your first donation to start rescuing food.' : undefined}
          action={
            tab === 'active' && (
              <Button asChild>
                <Link to="/listings/new">
                  <Plus /> Create a listing
                </Link>
              </Button>
            )
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <ul className="divide-y">
            {rows.map((l) => {
              const status = effectiveStatus(l, now)
              const pending = pendingByListing.get(l.id) ?? 0
              return (
                <li key={l.id}>
                  <Link to={`/listings/${l.id}`} className="flex flex-col gap-3 p-4 hover:bg-muted/40 sm:flex-row sm:items-center">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <CategoryIcon category={l.category} />
                      <div className="min-w-0">
                        <p className="truncate font-medium">{l.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {Number(l.quantity)} {UNIT_LABELS[l.quantity_unit]} · {l.estimated_meals} meals · listed{' '}
                          {format(new Date(l.created_at), 'd MMM, HH:mm')}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                      {pending > 0 && status === 'available' && (
                        <Pill tone="amber">
                          {pending} pending request{pending > 1 ? 's' : ''}
                        </Pill>
                      )}
                      {status === 'available' || status === 'reserved' ? (
                        <CountdownBadge deadline={l.safe_until} now={now} />
                      ) : null}
                      <ListingStatusBadge status={status} />
                      {l.is_demo && <DemoBadge />}
                    </div>
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
