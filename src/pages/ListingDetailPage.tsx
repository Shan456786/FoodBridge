import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { format } from 'date-fns'
import { toast } from 'sonner'
import {
  AlertTriangle,
  ArrowLeft,
  Ban,
  Check,
  Clock,
  History,
  Loader2,
  MapPin,
  Package,
  Pencil,
  Send,
  ShieldCheck,
  Thermometer,
  Truck,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { ActivityFeed } from '@/components/common/ActivityFeed'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { CategoryIcon, DietTag } from '@/components/common/ListingCard'
import { MatchScore } from '@/components/common/MatchScore'
import {
  CountdownBadge,
  DemoBadge,
  ListingStatusBadge,
  PickupStatusBadge,
  RequestStatusBadge,
  VerificationBadge,
} from '@/components/common/StatusBadge'
import { ErrorState } from '@/components/common/States'
import { useAuth } from '@/context/AuthContext'
import { useData, useNow } from '@/hooks/useData'
import {
  cancelListing,
  cancelRequest,
  fetchListing,
  fetchListingAudit,
  fetchListingPickup,
  fetchListingRequests,
  requestListing,
  respondToRequest,
} from '@/lib/api'
import { CATEGORY_LABELS, ORG_TYPE_LABELS, STORAGE_LABELS, UNIT_LABELS } from '@/lib/constants'
import { formatKm, haversineKm } from '@/lib/geo'
import { evaluateMatch } from '@/lib/matching'
import { effectiveStatus, isRequestable } from '@/lib/time'
import type { FoodListing } from '@/lib/types'

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium text-ink">{children}</dd>
    </div>
  )
}

function RequestDialog({ listing, onDone }: { listing: FoodListing; onDone: () => void }) {
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [ack, setAck] = useState(false)
  const [busy, setBusy] = useState(false)

  async function submit() {
    setBusy(true)
    try {
      await requestListing(listing.id, message.trim())
      toast.success('Request sent', { description: 'The donor has been notified.' })
      setOpen(false)
      onDone()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
      <DialogTrigger asChild>
        <Button size="lg">
          <Send /> Request this food
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Request “{listing.title}”</DialogTitle>
          <DialogDescription>
            You are requesting the full quantity ({Number(listing.quantity)} {UNIT_LABELS[listing.quantity_unit]}, ~
            {listing.estimated_meals} meals). The donor will accept one organization.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="msg">Message to donor (optional)</Label>
          <Textarea id="msg" value={message} maxLength={500} onChange={(e) => setMessage(e.target.value)} placeholder="e.g. Our volunteer can arrive within 30 minutes." />
        </div>
        <label className="flex items-start gap-3 rounded-lg bg-muted/50 p-3 text-sm">
          <Checkbox className="mt-0.5" checked={ack} onCheckedChange={(c) => setAck(c === true)} />
          <span>
            We can collect within the pickup window, keep the food {STORAGE_LABELS[listing.storage_requirement].toLowerCase()}, and
            will follow applicable food-safety requirements when redistributing it.
          </span>
        </label>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!ack || busy}>
            {busy && <Loader2 className="animate-spin" />} Send request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function ListingDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { profile, organization } = useAuth()
  const now = useNow(15_000)

  const listing = useData(() => fetchListing(id!), [id])
  const requests = useData(() => fetchListingRequests(id!), [id])
  const pickup = useData(() => fetchListingPickup(id!), [id])
  const audit = useData(() => fetchListingAudit(id!), [id])
  const reloadAll = () => {
    void listing.reload()
    void requests.reload()
    void pickup.reload()
    void audit.reload()
  }

  if (listing.loading && !listing.data)
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-1/2" />
        <Skeleton className="h-64" />
      </div>
    )
  if (listing.error) return <ErrorState message={listing.error} onRetry={listing.reload} />
  const l = listing.data
  if (!l)
    return (
      <ErrorState message="This listing doesn't exist, has closed, or isn't visible to your account." />
    )

  const status = effectiveStatus(l, now)
  const isDonor = profile?.role === 'donor' && organization?.id === l.donor_org_id
  const isReceiver = profile?.role === 'receiver' && organization
  const myRequest = isReceiver ? (requests.data ?? []).find((r) => r.receiver_org_id === organization!.id && ['pending', 'accepted'].includes(r.status)) : undefined
  const match = isReceiver ? evaluateMatch(l, organization!, now) : undefined
  const distance = organization ? haversineKm(organization, l) : null
  const pendingRequests = (requests.data ?? []).filter((r) => r.status === 'pending')

  async function respond(requestId: string, accept: boolean, note: string) {
    try {
      const res = await respondToRequest(requestId, accept, note)
      toast.success(accept ? 'Request accepted — pickup created' : 'Request declined')
      reloadAll()
      if (accept && res.pickup_id) navigate('/pickups')
    } catch (e) {
      toast.error((e as Error).message)
      reloadAll()
      return false
    }
  }

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" className="-ml-2" onClick={() => navigate(-1)}>
        <ArrowLeft /> Back
      </Button>

      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 gap-4">
          <CategoryIcon category={l.category} className="size-14 rounded-xl [&_svg]:size-7" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <ListingStatusBadge status={status} />
              {(status === 'available' || status === 'reserved') && <CountdownBadge deadline={l.safe_until} now={now} />}
              {l.is_demo && <DemoBadge />}
            </div>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink">{l.title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {l.donor?.name} · {CATEGORY_LABELS[l.category]} · listed {format(new Date(l.created_at), 'd MMM yyyy, HH:mm')}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {isDonor && status === 'available' && (
            <Button asChild variant="outline" size="lg">
              <Link to={`/listings/${l.id}/edit`}>
                <Pencil /> Edit
              </Link>
            </Button>
          )}
          {isDonor && (status === 'available' || status === 'reserved') && (
            <ConfirmDialog
              destructive
              title="Cancel this listing?"
              description="Open and accepted requests will be cancelled and receivers notified. This cannot be undone."
              confirmLabel="Cancel listing"
              withNote="Reason (optional)"
              trigger={
                <Button variant="destructive" size="lg">
                  <Ban /> Cancel listing
                </Button>
              }
              onConfirm={async (note) => {
                try {
                  await cancelListing(l.id, note)
                  toast.success('Listing cancelled')
                  reloadAll()
                } catch (e) {
                  toast.error((e as Error).message)
                  return false
                }
              }}
            />
          )}
          {isReceiver && !myRequest && isRequestable(l, now) && match?.eligible && <RequestDialog listing={l} onDone={reloadAll} />}
          {myRequest && (
            <ConfirmDialog
              destructive
              title="Withdraw your request?"
              description={
                myRequest.status === 'accepted'
                  ? 'The pickup will be cancelled and the listing returned to other receivers (if still within its deadline).'
                  : 'The donor will be notified.'
              }
              confirmLabel="Withdraw request"
              trigger={
                <Button variant="outline" size="lg">
                  <X /> Withdraw request
                </Button>
              }
              onConfirm={async () => {
                try {
                  await cancelRequest(myRequest.id)
                  toast.success('Request withdrawn')
                  reloadAll()
                } catch (e) {
                  toast.error((e as Error).message)
                  return false
                }
              }}
            />
          )}
        </div>
      </div>

      {l.moderation_note && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <strong>Moderator note:</strong> {l.moderation_note}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <div className="space-y-6">
          {/* Receiver: match explanation */}
          {match && (status === 'available') && (
            <Card className={match.eligible ? 'ring-emerald-200' : 'ring-slate-200'}>
              <CardContent className="flex items-start gap-4">
                {match.eligible ? <MatchScore score={match.score} size={56} /> : <AlertTriangle className="mt-1 size-6 text-amber-500" />}
                <div>
                  <p className="font-semibold">{match.eligible ? 'Compatible with your organization' : 'Not eligible for your organization'}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{match.summary}</p>
                  {myRequest && (
                    <p className="mt-2 flex items-center gap-2 text-sm">
                      Your request: <RequestStatusBadge status={myRequest.status} />
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
          {myRequest && status !== 'available' && (
            <Card>
              <CardContent className="flex items-center justify-between gap-3">
                <p className="flex items-center gap-2 text-sm">
                  Your request: <RequestStatusBadge status={myRequest.status} />
                </p>
                {myRequest.status === 'accepted' && (
                  <Button asChild size="sm">
                    <Link to="/pickups">
                      <Truck /> Manage pickup
                    </Link>
                  </Button>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {l.description && <p className="text-sm leading-relaxed text-slate-700">{l.description}</p>}
              <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
                <Detail label="Quantity">
                  {Number(l.quantity)} {UNIT_LABELS[l.quantity_unit]}
                </Detail>
                <Detail label="Estimated meals">{l.estimated_meals}</Detail>
                <Detail label="Classification">
                  <DietTag diet={l.diet} />
                </Detail>
                <Detail label="Prepared">{l.prepared_at ? format(new Date(l.prepared_at), 'd MMM, HH:mm') : 'Not specified'}</Detail>
                <Detail label="Safe-use deadline">{format(new Date(l.safe_until), 'd MMM, HH:mm')}</Detail>
                <Detail label="Pickup window">
                  {format(new Date(l.pickup_start), 'd MMM HH:mm')} – {format(new Date(l.pickup_end), 'HH:mm')}
                </Detail>
                <Detail label="Storage">
                  <span className="inline-flex items-center gap-1">
                    <Thermometer className="size-3.5 text-slate-400" /> {STORAGE_LABELS[l.storage_requirement]}
                  </span>
                </Detail>
                <Detail label="Packaging">{l.packaging || 'Not specified'}</Detail>
                <Detail label="Allergens">
                  {l.allergens?.length ? <span className="capitalize">{l.allergens.join(', ')}</span> : 'None declared'}
                </Detail>
              </dl>
              <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">
                <AlertTriangle className="size-4 shrink-0" />
                <span>
                  The donor declared this food was handled and stored appropriately. FoodBridge does not certify food safety; the
                  deadline is the donor's own assessment. Receivers must apply their own checks before redistribution.
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Donor: requests */}
          {isDonor && (
            <Card>
              <CardHeader>
                <CardTitle>Requests ({(requests.data ?? []).length})</CardTitle>
              </CardHeader>
              <CardContent>
                {requests.loading ? (
                  <Skeleton className="h-24" />
                ) : !(requests.data ?? []).length ? (
                  <p className="py-4 text-center text-sm text-muted-foreground">No requests yet. Eligible receivers nearby can see this listing.</p>
                ) : (
                  <ul className="divide-y">
                    {(requests.data ?? []).map((r) => {
                      const m = r.receiver ? evaluateMatch(l, r.receiver, now) : null
                      return (
                        <li key={r.id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-medium">{r.receiver?.name}</p>
                              <RequestStatusBadge status={r.status} />
                              {r.receiver && <VerificationBadge status={r.receiver.verification_status} />}
                            </div>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {r.distance_km != null ? `${formatKm(Number(r.distance_km))} away (straight-line)` : 'Distance unknown'} ·{' '}
                              requested {format(new Date(r.created_at), 'd MMM, HH:mm')}
                              {m?.eligible ? ` · ${m.score}% match` : ''}
                            </p>
                            {r.message && <p className="mt-1 text-sm text-slate-700">“{r.message}”</p>}
                            {r.decision_note && <p className="mt-1 text-xs text-muted-foreground">Note: {r.decision_note}</p>}
                          </div>
                          {r.status === 'pending' && status === 'available' && (
                            <div className="flex gap-2">
                              <ConfirmDialog
                                title={`Decline ${r.receiver?.name}'s request?`}
                                description="The organization will be notified."
                                confirmLabel="Decline"
                                destructive
                                withNote="Reason (optional)"
                                trigger={
                                  <Button variant="outline" size="sm">
                                    <X /> Decline
                                  </Button>
                                }
                                onConfirm={(note) => respond(r.id, false, note)}
                              />
                              <ConfirmDialog
                                title={`Accept ${r.receiver?.name}?`}
                                description={
                                  pendingRequests.length > 1
                                    ? `This reserves the listing for them and automatically declines the other ${pendingRequests.length - 1} pending request(s).`
                                    : 'This reserves the listing for them and creates a pickup.'
                                }
                                confirmLabel="Accept request"
                                trigger={
                                  <Button size="sm">
                                    <Check /> Accept
                                  </Button>
                                }
                                onConfirm={(note) => respond(r.id, true, note)}
                              />
                            </div>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Pickup location</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p className="flex gap-2">
                <MapPin className="mt-0.5 size-4 shrink-0 text-slate-400" />
                <span>
                  <span className="font-medium">{l.donor?.name}</span>
                  <br />
                  <span className="text-muted-foreground">{l.pickup_address}</span>
                </span>
              </p>
              {l.donor && (
                <div className="flex flex-wrap gap-2">
                  <VerificationBadge status={l.donor.verification_status} />
                  <span className="text-xs text-muted-foreground">{ORG_TYPE_LABELS[l.donor.org_type]}</span>
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Pickup radius {Number(l.max_radius_km)} km
                {distance != null && !isDonor && ` · ${formatKm(distance)} from your organization (straight-line)`}
              </p>
            </CardContent>
          </Card>

          {pickup.data && (
            <Card>
              <CardHeader>
                <CardTitle>Pickup</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Status</span>
                  <PickupStatusBadge status={pickup.data.status} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Receiver</span>
                  <span className="font-medium">{pickup.data.receiver?.name}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Collector</span>
                  <span className="font-medium">{pickup.data.volunteer?.full_name || 'Receiver staff'}</span>
                </div>
                <Button asChild variant="outline" className="w-full">
                  <Link to="/pickups">
                    <Package /> Open pickups
                  </Link>
                </Button>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="size-4 text-slate-400" /> Audit trail
              </CardTitle>
            </CardHeader>
            <CardContent>
              {audit.loading ? (
                <Skeleton className="h-32" />
              ) : audit.data?.length ? (
                <ActivityFeed events={audit.data} linkListings={false} />
              ) : (
                <p className="text-sm text-muted-foreground">No visible events.</p>
              )}
              <p className="mt-4 flex items-center gap-1.5 text-[0.7rem] text-slate-400">
                <ShieldCheck className="size-3" /> Append-only · written by the database
              </p>
            </CardContent>
          </Card>

          <p className="flex items-center gap-1.5 px-1 text-xs text-muted-foreground">
            <Clock className="size-3.5" /> Times shown in your local timezone.
          </p>
        </div>
      </div>
    </div>
  )
}
