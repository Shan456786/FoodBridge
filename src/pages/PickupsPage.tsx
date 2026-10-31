import { useState } from 'react'
import { Link } from 'react-router-dom'
import { format } from 'date-fns'
import { toast } from 'sonner'
import {
  ArrowRight,
  BadgeCheck,
  Building2,
  HandHeart,
  KeyRound,
  Loader2,
  MapPin,
  Navigation,
  PackageCheck,
  Truck,
  UserRound,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { NativeSelect } from '@/components/common/Field'
import { CategoryIcon } from '@/components/common/ListingCard'
import { CountdownBadge, DemoBadge, PickupStatusBadge } from '@/components/common/StatusBadge'
import { EmptyState, ErrorState, ListSkeleton, PageHeader } from '@/components/common/States'
import { useAuth } from '@/context/AuthContext'
import { useData, useNow } from '@/hooks/useData'
import {
  assignVolunteer,
  confirmReceipt,
  fetchPickups,
  generateHandoverCode,
  listVolunteers,
  updatePickupProgress,
  verifyHandoverCode,
} from '@/lib/api'
import { UNIT_LABELS } from '@/lib/constants'
import { OFFLINE_DEMO } from '@/lib/api'
import { formatKm, haversineKm } from '@/lib/geo'
import type { Pickup, PickupStatus } from '@/lib/types'
import { cn } from '@/lib/utils'

const PRE_COLLECTION: PickupStatus[] = ['scheduled', 'assigned', 'en_route', 'arrived']
const STEPS: { key: PickupStatus; label: string }[] = [
  { key: 'scheduled', label: 'Accepted' },
  { key: 'en_route', label: 'En route' },
  { key: 'arrived', label: 'Arrived' },
  { key: 'collected', label: 'Collected' },
  { key: 'verified', label: 'Verified' },
]
const ORDER: Record<PickupStatus, number> = { scheduled: 0, assigned: 0, en_route: 1, arrived: 2, collected: 3, verified: 4, cancelled: -1, expired: -1 }

function Stepper({ status }: { status: PickupStatus }) {
  const idx = ORDER[status]
  if (idx < 0) return null
  return (
    <ol className="flex items-center gap-1" aria-label="Pickup progress">
      {STEPS.map((s, i) => (
        <li key={s.key} className="flex flex-1 flex-col items-center gap-1">
          <span className={cn('h-1.5 w-full rounded-full', i <= idx ? 'bg-emerald-brand' : 'bg-slate-200')} />
          <span className={cn('text-[0.65rem]', i <= idx ? 'font-medium text-brand' : 'text-slate-400')}>{s.label}</span>
        </li>
      ))}
    </ol>
  )
}

function GenerateCodeDialog({ pickup, onDone }: { pickup: Pickup; onDone: () => void }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [code, setCode] = useState<{ code: string; expires_at: string } | null>(null)

  async function generate() {
    setBusy(true)
    try {
      setCode(await generateHandoverCode(pickup.id))
      onDone()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) setCode(null)
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">
          <KeyRound /> Handover code
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Handover verification code</DialogTitle>
          <DialogDescription>
            Generate this when the collector is with you. Share it in person; they enter it on their device to record the
            collection.
          </DialogDescription>
        </DialogHeader>
        {code ? (
          <div className="rounded-xl bg-forest p-6 text-center text-white">
            <p className="text-xs tracking-widest text-emerald-200 uppercase">One-time code</p>
            <p className="tabular mt-2 font-mono text-5xl font-bold tracking-[0.3em]" aria-live="polite">
              {code.code}
            </p>
            <p className="mt-3 text-xs text-mint-100/80">
              Expires {format(new Date(code.expires_at), 'HH:mm')} · 5 attempts · single use
            </p>
          </div>
        ) : (
          <ul className="space-y-1.5 rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
            <li>• Only a secure hash is stored — the code is shown once.</li>
            <li>• Generating a new code invalidates any previous one.</li>
            <li>• Valid for 30 minutes (or until the safe-use deadline).</li>
          </ul>
        )}
        <DialogFooter>
          {code ? (
            <Button variant="outline" onClick={generate} disabled={busy}>
              {busy && <Loader2 className="animate-spin" />} Regenerate
            </Button>
          ) : (
            <Button onClick={generate} disabled={busy}>
              {busy && <Loader2 className="animate-spin" />} Generate code
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function EnterCodeDialog({ pickup, onDone }: { pickup: Pickup; onDone: () => void }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [code, setCode] = useState('')
  const [feedback, setFeedback] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setFeedback(null)
    try {
      const res = await verifyHandoverCode(pickup.id, code)
      if (res.ok) {
        toast.success('Handover verified', { description: res.message })
        setOpen(false)
        setCode('')
        onDone()
      } else {
        setFeedback(res.attempts_remaining != null ? `${res.message} ${res.attempts_remaining} attempt(s) left.` : res.message)
      }
    } catch (err) {
      setFeedback((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && (setOpen(o), setFeedback(null))}>
      <DialogTrigger asChild>
        <Button size="sm">
          <BadgeCheck /> Enter handover code
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Verify handover</DialogTitle>
            <DialogDescription>Ask the donor for the 6-digit code at the moment of handover.</DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            className="tabular my-5 h-14 text-center font-mono text-3xl tracking-[0.4em]"
            aria-label="Handover code"
            placeholder="••••••"
          />
          {feedback && (
            <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">
              {feedback}
            </p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={code.length !== 6 || busy} className="w-full sm:w-auto">
              {busy && <Loader2 className="animate-spin" />} Verify code
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function AssignVolunteer({ pickup, onDone }: { pickup: Pickup; onDone: () => void }) {
  const volunteers = useData(listVolunteers, [])
  const [busy, setBusy] = useState(false)
  async function change(id: string) {
    setBusy(true)
    try {
      await assignVolunteer(pickup.id, id || null)
      toast.success(id ? 'Volunteer assigned and notified' : 'Volunteer unassigned')
      onDone()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="flex items-center gap-2">
      <NativeSelect
        aria-label="Assign volunteer"
        value={pickup.volunteer_id ?? ''}
        onChange={(e) => change(e.target.value)}
        disabled={busy || volunteers.loading}
        className="h-7 w-52 text-xs"
      >
        <option value="">{volunteers.loading ? 'Loading…' : 'Collect ourselves (no volunteer)'}</option>
        {(volunteers.data ?? []).map((v) => (
          <option key={v.id} value={v.id}>
            {v.full_name || 'Unnamed volunteer'}
          </option>
        ))}
      </NativeSelect>
      {busy && <Loader2 className="size-4 animate-spin text-slate-400" />}
    </div>
  )
}

function Party({ icon: Icon, label, name, address }: { icon: typeof Building2; label: string; name?: string; address?: string | null }) {
  return (
    <div className="flex min-w-0 gap-2">
      <Icon className="mt-0.5 size-4 shrink-0 text-slate-400" />
      <div className="min-w-0">
        <p className="text-[0.68rem] font-medium tracking-wide text-slate-400 uppercase">{label}</p>
        <p className="truncate text-sm font-medium">{name ?? '—'}</p>
        {address && <p className="truncate text-xs text-muted-foreground">{address}</p>}
      </div>
    </div>
  )
}

function PickupCard({ p, now, onChange }: { p: Pickup; now: number; onChange: () => void }) {
  const { profile, organization, session } = useAuth()
  const l = p.listing
  const isDonor = organization?.id === p.donor_org_id
  const isReceiver = organization?.id === p.receiver_org_id
  const isVolunteer = session?.user.id === p.volunteer_id
  const pre = PRE_COLLECTION.includes(p.status)
  const canProgress = pre && (isVolunteer || (isReceiver && !p.volunteer_id))
  const canEnterCode = pre && (isVolunteer || isReceiver)
  const distance = p.donor && p.receiver ? haversineKm(p.donor, p.receiver) : null

  async function progress(status: 'en_route' | 'arrived') {
    try {
      await updatePickupProgress(p.id, status)
      toast.success(status === 'en_route' ? 'Marked en route' : 'Marked as arrived')
      onChange()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <article className="rounded-xl border bg-card shadow-[0_1px_2px_rgb(16_24_40/0.04)]">
      <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          {l && <CategoryIcon category={l.category} />}
          <div className="min-w-0">
            <Link to={`/listings/${p.listing_id}`} className="block truncate font-semibold hover:underline">
              {l?.title}
            </Link>
            <p className="text-xs text-muted-foreground">
              {l && `${Number(l.quantity)} ${UNIT_LABELS[l.quantity_unit]} · ${l.estimated_meals} meals · `}
              pickup by {l ? format(new Date(l.pickup_end), 'd MMM, HH:mm') : '—'}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {l && pre && <CountdownBadge deadline={l.safe_until} now={now} />}
          <PickupStatusBadge status={p.status} />
          {p.is_demo && <DemoBadge />}
        </div>
      </div>

      <div className="grid gap-4 p-4 sm:grid-cols-3">
        <Party icon={Building2} label="Collect from" name={p.donor?.name} address={l?.pickup_address ?? p.donor?.address} />
        <Party icon={HandHeart} label="Deliver to" name={p.receiver?.name} address={[p.receiver?.address, p.receiver?.city].filter(Boolean).join(', ')} />
        <Party icon={UserRound} label="Collector" name={p.volunteer?.full_name || (p.volunteer_id ? 'Volunteer' : 'Receiver staff')} address={distance != null ? `${formatKm(distance)} donor → receiver (straight-line)` : null} />
      </div>

      <div className="px-4 pb-4">
        <Stepper status={p.status} />
      </div>

      {(isDonor || isReceiver || isVolunteer) && !['verified', 'cancelled', 'expired'].includes(p.status) && (
        <div className="flex flex-col gap-3 border-t bg-muted/30 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs text-muted-foreground">
            {p.status === 'collected'
              ? isReceiver
                ? 'Food collected. Confirm once it has arrived at your organization.'
                : 'Waiting for the receiver to confirm delivery.'
              : isDonor
                ? 'When the collector arrives, generate a code and share it in person.'
                : 'Ask the donor for the handover code at pickup.'}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isReceiver && profile?.role === 'receiver' && (p.status === 'scheduled' || p.status === 'assigned') && (
              <AssignVolunteer pickup={p} onDone={onChange} />
            )}
            {canProgress && (p.status === 'scheduled' || p.status === 'assigned') && (
              <Button size="sm" variant="outline" onClick={() => progress('en_route')}>
                <Navigation /> En route
              </Button>
            )}
            {canProgress && p.status !== 'arrived' && (
              <Button size="sm" variant="outline" onClick={() => progress('arrived')}>
                <MapPin /> Arrived
              </Button>
            )}
            {isDonor && pre && <GenerateCodeDialog pickup={p} onDone={onChange} />}
            {canEnterCode && <EnterCodeDialog pickup={p} onDone={onChange} />}
            {isReceiver && p.status === 'collected' && (
              <ConfirmDialog
                title="Confirm receipt?"
                description="Confirm the food has arrived at your organization. This completes the rescue and counts it in verified impact metrics."
                confirmLabel="Confirm receipt"
                trigger={
                  <Button size="sm">
                    <PackageCheck /> Confirm receipt
                  </Button>
                }
                onConfirm={async () => {
                  try {
                    await confirmReceipt(p.id)
                    toast.success(OFFLINE_DEMO ? 'Receipt confirmed (offline demo simulation)' : 'Rescue verified', {
                      description: OFFLINE_DEMO
                        ? 'Demo impact metrics updated. This is sample data, not a real rescue.'
                        : `${l?.estimated_meals ?? ''} meals added to verified impact.`,
                    })
                    onChange()
                  } catch (e) {
                    toast.error((e as Error).message)
                    return false
                  }
                }}
              />
            )}
          </div>
        </div>
      )}
      {p.status === 'verified' && p.verified_at && (
        <div className="flex items-center gap-2 border-t bg-forest-50 px-4 py-2.5 text-xs text-brand">
          <BadgeCheck className="size-4" /> Verified rescue · {format(new Date(p.verified_at), 'd MMM yyyy, HH:mm')}
        </div>
      )}
    </article>
  )
}

export default function PickupsPage() {
  const { profile } = useAuth()
  const now = useNow(15_000)
  const [tab, setTab] = useState('active')
  const { data, error, loading, reload } = useData(fetchPickups, [])

  const groups = {
    active: (data ?? []).filter((p) => [...PRE_COLLECTION, 'collected'].includes(p.status)),
    completed: (data ?? []).filter((p) => p.status === 'verified'),
    closed: (data ?? []).filter((p) => p.status === 'cancelled' || p.status === 'expired'),
  }
  const rows = groups[tab as keyof typeof groups]

  return (
    <div>
      <PageHeader
        title={profile?.role === 'volunteer' ? 'My pickup tasks' : 'Pickups'}
        description={
          profile?.role === 'volunteer'
            ? 'Only pickups assigned to you are shown.'
            : 'Accepted → collected (code-verified handover) → verified (receipt confirmed).'
        }
      />
      <Tabs value={tab} onValueChange={setTab} className="mb-4">
        <TabsList>
          <TabsTrigger value="active">Active <span className="tabular ml-1 text-xs text-muted-foreground">{groups.active.length}</span></TabsTrigger>
          <TabsTrigger value="completed">Completed <span className="tabular ml-1 text-xs text-muted-foreground">{groups.completed.length}</span></TabsTrigger>
          <TabsTrigger value="closed">Cancelled / expired <span className="tabular ml-1 text-xs text-muted-foreground">{groups.closed.length}</span></TabsTrigger>
        </TabsList>
      </Tabs>
      {loading && !data ? (
        <ListSkeleton rows={3} />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Truck}
          title={tab === 'active' ? 'No active pickups' : 'Nothing here yet'}
          description={
            profile?.role === 'volunteer'
              ? 'Receivers will assign pickups to you. You will get a notification.'
              : profile?.role === 'donor'
                ? 'Pickups appear when you accept a request.'
                : 'Pickups appear when a donor accepts your request.'
          }
          action={
            profile?.role === 'receiver' && (
              <Button asChild variant="outline">
                <Link to="/matches">
                  Find food <ArrowRight />
                </Link>
              </Button>
            )
          }
        />
      ) : (
        <div className="space-y-4">
          {rows.map((p) => (
            <PickupCard key={p.id} p={p} now={now} onChange={reload} />
          ))}
        </div>
      )}
    </div>
  )
}
