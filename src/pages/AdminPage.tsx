import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { AlertTriangle, BadgeCheck, Building2, Check, Clock, Package, RotateCcw, ShieldCheck, Trash2, Truck, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { describeEvent } from '@/components/common/ActivityFeed'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import {
  CountdownBadge,
  DemoBadge,
  ListingStatusBadge,
  Pill,
  PickupStatusBadge,
  VerificationBadge,
} from '@/components/common/StatusBadge'
import { ErrorState, KpiCard, ListSkeleton, PageHeader } from '@/components/common/States'
import { useAuth } from '@/context/AuthContext'
import { useData, useNow } from '@/hooks/useData'
import {
  fetchAllListings,
  fetchAuditEvents,
  fetchOrganizations,
  fetchPickups,
  fetchProfiles,
  getImpactStats,
  removeListing,
  setOrgVerification,
} from '@/lib/api'
import { ORG_TYPE_LABELS } from '@/lib/constants'
import { effectiveStatus, minutesUntil } from '@/lib/time'
import type { Organization } from '@/lib/types'

function canSee(isDemoAdmin: boolean, recordIsDemo: boolean) {
  return !isDemoAdmin || recordIsDemo
}

function OrgActions({ org, onDone, locked }: { org: Organization; onDone: () => void; locked: boolean }) {
  const run = (status: 'verified' | 'rejected' | 'pending', msg: string) => async (note: string) => {
    try {
      await setOrgVerification(org.id, status, note)
      toast.success(msg)
      onDone()
    } catch (e) {
      toast.error((e as Error).message)
      return false
    }
  }
  if (locked) return <span className="text-xs text-muted-foreground">Real data — read-only in demo</span>
  return (
    <div className="flex justify-end gap-1.5">
      {org.verification_status !== 'verified' && (
        <ConfirmDialog
          title={`Verify ${org.name}?`}
          description={org.kind === 'receiver' ? 'Verified receivers can request food.' : 'The donor will show as verified to receivers.'}
          confirmLabel="Verify"
          withNote="Note (optional)"
          trigger={<Button size="xs"><Check /> Verify</Button>}
          onConfirm={run('verified', 'Organization verified')}
        />
      )}
      {org.verification_status !== 'rejected' && (
        <ConfirmDialog
          destructive
          title={`Decline verification for ${org.name}?`}
          description="Members will be notified. Receivers cannot request food while unverified."
          confirmLabel="Decline"
          withNote="Reason"
          noteRequired
          trigger={<Button size="xs" variant="outline"><X /> Decline</Button>}
          onConfirm={run('rejected', 'Verification declined')}
        />
      )}
      {org.verification_status !== 'pending' && (
        <ConfirmDialog
          title="Reset to pending?"
          description="The organization returns to the review queue."
          confirmLabel="Reset"
          trigger={<Button size="xs" variant="ghost" aria-label="Reset to pending"><RotateCcw /></Button>}
          onConfirm={run('pending', 'Reset to pending')}
        />
      )}
    </div>
  )
}

export default function AdminPage() {
  const { profile } = useAuth()
  const isDemoAdmin = !!profile?.is_demo
  const now = useNow(30_000)
  const stats = useData(() => getImpactStats('platform'), [])
  const orgs = useData(() => fetchOrganizations(), [])
  const listings = useData(() => fetchAllListings(200), [])
  const pickups = useData(fetchPickups, [])
  const audit = useData(() => fetchAuditEvents(150), [])
  const profiles = useData(fetchProfiles, [])
  const [orgFilter, setOrgFilter] = useState<'pending' | 'all'>('pending')

  const names = useMemo(() => new Map((profiles.data ?? []).map((p) => [p.id, p.full_name || p.email || 'User'])), [profiles.data])
  const orgList = (orgs.data ?? []).filter((o) => canSee(isDemoAdmin, o.is_demo))
  const pendingOrgs = orgList.filter((o) => o.verification_status === 'pending')
  const expiringSoon = (listings.data ?? []).filter(
    (l) => effectiveStatus(l, now) === 'available' && minutesUntil(l.safe_until, now) <= 120,
  )
  const activePickups = (pickups.data ?? []).filter((p) => ['scheduled', 'assigned', 'en_route', 'arrived', 'collected'].includes(p.status))
  const s = stats.data

  return (
    <div className="space-y-6">
      <PageHeader
        title="Admin console"
        description={
          isDemoAdmin
            ? 'Demo administrator: you can review and moderate demo records only. Real organizations and users are hidden.'
            : 'Review organizations, moderate listings, monitor pickups and audit activity.'
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard accent icon={BadgeCheck} label="Verified rescued meals" value={s ? s.verified_meals.toLocaleString() : '…'} hint={s && s.demo_listings ? 'Includes demonstration data' : 'Platform-wide'} />
        <KpiCard icon={Building2} label="Pending verification" value={orgs.loading ? '…' : pendingOrgs.length} hint={`${orgList.length} organizations`} />
        <KpiCard icon={Truck} label="Active pickups" value={pickups.loading ? '…' : activePickups.length} hint="Scheduled → collected" />
        <KpiCard icon={Clock} label="Expiring < 2h" value={listings.loading ? '…' : expiringSoon.length} hint="Unreserved listings" />
      </div>

      <Tabs defaultValue="orgs">
        <TabsList className="flex-wrap">
          <TabsTrigger value="orgs">Organizations {pendingOrgs.length > 0 && <Pill tone="amber" className="ml-1 h-5">{pendingOrgs.length}</Pill>}</TabsTrigger>
          <TabsTrigger value="listings">Listings</TabsTrigger>
          <TabsTrigger value="pickups">Pickups</TabsTrigger>
          <TabsTrigger value="audit">Audit log</TabsTrigger>
        </TabsList>

        <TabsContent value="orgs" className="mt-4">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <div>
                <CardTitle>Organization review</CardTitle>
                <CardDescription>Manual verification for the MVP. Check registration documents offline before verifying.</CardDescription>
              </div>
              <Tabs value={orgFilter} onValueChange={(v) => setOrgFilter(v as 'pending' | 'all')}>
                <TabsList>
                  <TabsTrigger value="pending">Pending</TabsTrigger>
                  <TabsTrigger value="all">All</TabsTrigger>
                </TabsList>
              </Tabs>
            </CardHeader>
            <CardContent>
              {orgs.loading ? <ListSkeleton rows={3} /> : orgs.error ? <ErrorState message={orgs.error} onRetry={orgs.reload} /> : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Organization</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead className="hidden md:table-cell">Capabilities</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(orgFilter === 'pending' ? pendingOrgs : orgList).map((o) => (
                        <TableRow key={o.id}>
                          <TableCell>
                            <p className="font-medium">{o.name} {o.is_demo && <DemoBadge className="ml-1" />}</p>
                            <p className="text-xs text-muted-foreground">{ORG_TYPE_LABELS[o.org_type]} · {o.city ?? 'No city'} · joined {format(new Date(o.created_at), 'd MMM yyyy')}</p>
                          </TableCell>
                          <TableCell className="capitalize">{o.kind}</TableCell>
                          <TableCell className="hidden text-xs text-muted-foreground md:table-cell">
                            {o.kind === 'receiver' ? `${o.capacity_meals} meals · ${[o.has_refrigeration && 'fridge', o.has_freezer && 'freezer'].filter(Boolean).join(', ') || 'ambient only'}` : '—'}
                          </TableCell>
                          <TableCell><VerificationBadge status={o.verification_status} /></TableCell>
                          <TableCell className="text-right">
                            <OrgActions org={o} onDone={orgs.reload} locked={isDemoAdmin && !o.is_demo} />
                          </TableCell>
                        </TableRow>
                      ))}
                      {(orgFilter === 'pending' ? pendingOrgs : orgList).length === 0 && (
                        <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">No organizations awaiting review.</TableCell></TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="listings" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Listing moderation</CardTitle>
              <CardDescription>Remove inappropriate or unsafe open listings. Donors and affected receivers are notified.</CardDescription>
            </CardHeader>
            <CardContent>
              {listings.loading ? <ListSkeleton rows={4} /> : listings.error ? <ErrorState message={listings.error} onRetry={listings.reload} /> : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Listing</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="hidden md:table-cell">Deadline</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(listings.data ?? []).map((l) => {
                        const st = effectiveStatus(l, now)
                        return (
                          <TableRow key={l.id}>
                            <TableCell>
                              <Link to={`/listings/${l.id}`} className="font-medium hover:underline">{l.title}</Link>
                              <p className="text-xs text-muted-foreground">{l.donor?.name} · {l.estimated_meals} meals {l.is_demo && '· demo'}</p>
                            </TableCell>
                            <TableCell><ListingStatusBadge status={st} /></TableCell>
                            <TableCell className="hidden md:table-cell">
                              {st === 'available' || st === 'reserved' ? <CountdownBadge deadline={l.safe_until} now={now} /> : <span className="text-xs text-muted-foreground">{format(new Date(l.safe_until), 'd MMM HH:mm')}</span>}
                            </TableCell>
                            <TableCell className="text-right">
                              {(st === 'available' || st === 'reserved') && canSee(isDemoAdmin, l.is_demo) && (
                                <ConfirmDialog
                                  destructive
                                  title={`Remove “${l.title}”?`}
                                  description="The listing is closed, open requests and pickups are cancelled, and the donor is notified with your note."
                                  confirmLabel="Remove listing"
                                  withNote="Moderation note (shared with donor)"
                                  noteRequired
                                  trigger={<Button size="xs" variant="destructive"><Trash2 /> Remove</Button>}
                                  onConfirm={async (note) => {
                                    try {
                                      await removeListing(l.id, note)
                                      toast.success('Listing removed')
                                      void listings.reload()
                                      void audit.reload()
                                    } catch (e) {
                                      toast.error((e as Error).message)
                                      return false
                                    }
                                  }}
                                />
                              )}
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pickups" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Pickup monitor</CardTitle>
              <CardDescription>All pickups visible to your admin scope.</CardDescription>
            </CardHeader>
            <CardContent>
              {pickups.loading ? <ListSkeleton rows={4} /> : pickups.error ? <ErrorState message={pickups.error} onRetry={pickups.reload} /> : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Food</TableHead>
                        <TableHead>Donor → Receiver</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="hidden md:table-cell">Updated</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(pickups.data ?? []).map((p) => (
                        <TableRow key={p.id}>
                          <TableCell className="font-medium">{p.listing?.title}</TableCell>
                          <TableCell className="text-xs">{p.donor?.name} → {p.receiver?.name}{p.volunteer && <span className="block text-muted-foreground">via {p.volunteer.full_name}</span>}</TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              <PickupStatusBadge status={p.status} />
                              {p.listing && ['scheduled', 'assigned', 'en_route', 'arrived'].includes(p.status) && minutesUntil(p.listing.safe_until, now) < 60 && (
                                <Pill tone="red"><AlertTriangle /> At risk</Pill>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="hidden text-xs text-muted-foreground md:table-cell">{format(new Date(p.updated_at), 'd MMM HH:mm')}</TableCell>
                        </TableRow>
                      ))}
                      {!(pickups.data ?? []).length && <TableRow><TableCell colSpan={4} className="py-8 text-center text-muted-foreground">No pickups yet.</TableCell></TableRow>}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="audit" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><ShieldCheck className="size-4 text-emerald-600" /> Audit log</CardTitle>
              <CardDescription>Append-only. Written by database functions and triggers; no user can edit or delete events.</CardDescription>
            </CardHeader>
            <CardContent>
              {audit.loading ? <ListSkeleton rows={5} /> : audit.error ? <ErrorState message={audit.error} onRetry={audit.reload} /> : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>When</TableHead>
                        <TableHead>Event</TableHead>
                        <TableHead>Actor</TableHead>
                        <TableHead className="hidden lg:table-cell">Entity</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(audit.data ?? []).map((e) => {
                        const d = describeEvent(e)
                        return (
                          <TableRow key={e.id}>
                            <TableCell className="text-xs whitespace-nowrap text-muted-foreground">{format(new Date(e.created_at), 'd MMM HH:mm:ss')}</TableCell>
                            <TableCell>
                              <p className="text-sm font-medium">{d.label}</p>
                              {d.detail && <p className="max-w-xs truncate text-xs text-muted-foreground">{d.detail}</p>}
                            </TableCell>
                            <TableCell className="text-xs">{e.actor_id ? names.get(e.actor_id) ?? 'User' : <span className="text-muted-foreground">System</span>}</TableCell>
                            <TableCell className="hidden font-mono text-[0.68rem] text-muted-foreground lg:table-cell">
                              {e.entity_type}:{e.entity_id?.slice(0, 8)}
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Package className="size-3.5" /> To grant full admin rights, a platform operator runs a one-line SQL update in the Supabase SQL editor (see README).
      </p>
    </div>
  )
}
