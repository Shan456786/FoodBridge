import { Link } from 'react-router-dom'
import { AlertTriangle, ArrowRight, CircleDot } from 'lucide-react'
import { Button } from '@/components/ui/button'

const LIFECYCLE = [
  {
    stage: 'Listed',
    who: 'Donor',
    detail:
      'The donor records the food, quantity, estimated meals, storage requirement, allergens, preparation time, safe-use deadline and pickup window — and declares it was handled and stored appropriately. Pickup windows can never extend past the safe-use deadline.',
  },
  {
    stage: 'Requested',
    who: 'Receiver',
    detail:
      'Verified receiver organizations browse nearby food. The server re-checks every hard constraint (deadline, storage, capacity, radius) before a request is accepted into the queue.',
  },
  {
    stage: 'Accepted',
    who: 'Donor',
    detail:
      'The donor accepts exactly one request. Acceptance locks the listing row in a single transaction, creates the pickup record and closes competing requests — so the same food can never be promised twice.',
  },
  {
    stage: 'Collected',
    who: 'Volunteer or receiver staff',
    detail:
      'At the physical handover, the donor generates a one-time 6-digit code; the collector enters it. The server checks a bcrypt hash, with a 30-minute expiry, five attempts and no reuse.',
  },
  {
    stage: 'Verified',
    who: 'Receiver',
    detail:
      'Once the food arrives, the receiver confirms receipt. Only now does it count toward verified rescue metrics. Every step is written to an append-only audit trail.',
  },
]

export default function HowItWorksPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-14 sm:px-6 lg:py-20">
      <p className="text-sm font-semibold text-emerald-600">How it works</p>
      <h1 className="mt-2 text-4xl font-bold tracking-tight text-ink">A traceable rescue lifecycle</h1>
      <p className="mt-4 text-lg text-muted-foreground">
        FoodBridge is not a delivery app or a marketplace. It is a coordination layer that makes every step of food
        redistribution explicit, enforceable and auditable.
      </p>

      <ol className="mt-12 space-y-0">
        {LIFECYCLE.map((s, i) => (
          <li key={s.stage} className="relative flex gap-5 pb-10 last:pb-0">
            {i < LIFECYCLE.length - 1 && <span className="absolute top-9 left-[17px] h-full w-px bg-border" />}
            <span className="relative z-10 flex size-9 shrink-0 items-center justify-center rounded-full bg-forest text-sm font-semibold text-white">
              {i + 1}
            </span>
            <div className="pt-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold text-ink">{s.stage}</h2>
                <span className="rounded-full bg-forest-50 px-2 py-0.5 text-xs font-medium text-brand">{s.who}</span>
              </div>
              <p className="mt-1.5 leading-relaxed text-muted-foreground">{s.detail}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-12 grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border bg-card p-5">
          <p className="flex items-center gap-2 font-semibold text-ink">
            <CircleDot className="size-4 text-slate-400" /> Alternative endings
          </p>
          <ul className="mt-3 space-y-1.5 text-sm text-muted-foreground">
            <li><strong className="text-ink">Expired</strong> — the deadline passed before collection. Expired food can never be requested.</li>
            <li><strong className="text-ink">Cancelled</strong> — the donor withdrew the listing, or a receiver withdrew before collection.</li>
            <li><strong className="text-ink">Declined</strong> — the donor rejected a request, or chose another receiver.</li>
          </ul>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <p className="flex items-center gap-2 font-semibold text-amber-900">
            <AlertTriangle className="size-4" /> Food safety responsibility
          </p>
          <p className="mt-3 text-sm leading-relaxed text-amber-900/80">
            FoodBridge coordinates redistribution but does not inspect or certify food. A deadline entered by a donor is not a
            guarantee of safety. Donors and receivers remain responsible for complying with applicable food-safety laws and
            guidance (in India, FSSAI requirements), including safe storage and handling during transport.
          </p>
        </div>
      </div>

      <div className="mt-12 flex flex-col gap-3 sm:flex-row">
        <Button asChild size="lg">
          <Link to="/signup">
            Get started <ArrowRight />
          </Link>
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link to="/explore">Explore available food</Link>
        </Button>
      </div>
    </div>
  )
}
