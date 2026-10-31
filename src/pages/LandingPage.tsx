import { Link } from 'react-router-dom'
import {
  ArrowRight,
  BadgeCheck,
  BarChart3,
  Bell,
  Building2,
  CheckCircle2,
  Clock,
  CookingPot,
  Croissant,
  HandHeart,
  KeyRound,
  ListPlus,
  MapPin,
  Milk,
  Route,
  ShieldCheck,
  Snowflake,
  Sparkles,
  Store,
  Truck,
  Users,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { MatchScore } from '@/components/common/MatchScore'
import { DEFAULT_WEIGHTS } from '@/lib/matching'
import { cn } from '@/lib/utils'

function SectionHeading({ eyebrow, title, description, center = false }: { eyebrow: string; title: string; description?: string; center?: boolean }) {
  return (
    <div className={cn('max-w-2xl', center && 'mx-auto text-center')}>
      <p className="text-sm font-semibold text-emerald-600">{eyebrow}</p>
      <h2 className="mt-2 text-3xl font-semibold tracking-tight text-ink sm:text-[2.1rem]">{title}</h2>
      {description && <p className="mt-3 text-base leading-relaxed text-muted-foreground">{description}</p>}
    </div>
  )
}

/** Static, illustrative product preview built from UI primitives (no external images). */
function DashboardPreview() {
  const rows = [
    { icon: CookingPot, tint: 'bg-amber-50 text-amber-700', title: 'Veg Biryani & Raita', org: 'Campus canteen · 2.4 km', time: '2h 35m', tone: 'amber', score: 92 },
    { icon: Croissant, tint: 'bg-orange-50 text-orange-700', title: 'Assorted Bread & Buns', org: 'Grocery store · 6.1 km', time: '19h 10m', tone: 'green', score: 81 },
    { icon: Milk, tint: 'bg-indigo-50 text-indigo-700', title: 'Curd & Buttermilk Packs', org: 'Grocery store · 6.1 km', time: '45m', tone: 'red', score: 74 },
  ] as const
  const tones = { green: 'bg-emerald-50 text-emerald-700', amber: 'bg-amber-50 text-amber-700', red: 'bg-red-50 text-red-700' }
  return (
    <div className="relative">
      <div className="absolute -inset-4 -z-10 rounded-[2rem] bg-gradient-to-br from-emerald-100/70 via-transparent to-forest-100/60 blur-2xl" />
      <div className="overflow-hidden rounded-2xl border bg-card shadow-[0_20px_60px_-20px_rgb(22_61_43/0.35)]">
        <div className="flex items-center justify-between border-b bg-slate-50/70 px-4 py-2.5">
          <div className="flex gap-1.5">
            <span className="size-2.5 rounded-full bg-slate-200" />
            <span className="size-2.5 rounded-full bg-slate-200" />
            <span className="size-2.5 rounded-full bg-slate-200" />
          </div>
          <span className="text-[0.68rem] font-medium text-slate-400">Illustrative preview · demo data</span>
        </div>
        <div className="grid grid-cols-3 gap-2 border-b p-4">
          {[
            { k: 'Verified meals', v: '1,240' },
            { k: 'Active listings', v: '8' },
            { k: 'Completion', v: '86%' },
          ].map((s) => (
            <div key={s.k} className="rounded-lg bg-forest-50/70 p-2.5">
              <p className="text-[0.62rem] font-medium tracking-wide text-slate-500 uppercase">{s.k}</p>
              <p className="tabular mt-0.5 text-base font-semibold text-brand">{s.v}</p>
            </div>
          ))}
        </div>
        <div className="p-4">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-500">
            <Sparkles className="size-3.5 text-emerald-500" /> Best matches for your organization
          </p>
          <ul className="space-y-2">
            {rows.map((r) => (
              <li key={r.title} className="flex items-center gap-3 rounded-xl border p-2.5">
                <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg', r.tint)}>
                  <r.icon className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-ink">{r.title}</span>
                  <span className="block truncate text-xs text-muted-foreground">{r.org}</span>
                </span>
                <span className={cn('tabular hidden items-center gap-1 rounded-full px-2 py-0.5 text-[0.68rem] font-medium sm:inline-flex', tones[r.tone])}>
                  <Clock className="size-3" />
                  {r.time}
                </span>
                <MatchScore score={r.score} size={38} />
              </li>
            ))}
          </ul>
          <div className="mt-3 rounded-lg bg-forest-50 px-3 py-2 text-xs text-brand">
            92% match — 2.4 km away (straight-line), pickup window compatible, fits capacity.
          </div>
        </div>
      </div>
      <div className="absolute -bottom-5 -left-3 hidden items-center gap-2 rounded-xl border bg-card px-3 py-2 shadow-lg sm:flex">
        <span className="flex size-8 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
          <KeyRound className="size-4" />
        </span>
        <span>
          <span className="block text-xs font-semibold text-ink">Handover verified</span>
          <span className="block text-[0.68rem] text-muted-foreground">One-time code · audit logged</span>
        </span>
      </div>
    </div>
  )
}

const STEPS = [
  { icon: ListPlus, title: 'Donor lists surplus', text: 'Quantity, storage needs, allergens and a safe-use deadline — with a handling declaration.' },
  { icon: Sparkles, title: 'Smart matching', text: 'Eligible nearby receivers are ranked with a transparent, explainable score.' },
  { icon: CheckCircle2, title: 'Request & accept', text: 'Receivers request; the donor accepts one. Reservation is atomic — no double booking.' },
  { icon: KeyRound, title: 'Verified handover', text: 'A one-time code confirms physical handover; the receiver confirms delivery.' },
]

const AUDIENCES = [
  { icon: Store, title: 'Donors', who: 'Restaurants, college canteens, grocery stores, banquet halls, community kitchens', points: ['List surplus in under a minute', 'Review and accept requests', 'Generate handover codes', 'Track verified impact'] },
  { icon: HandHeart, title: 'Receivers', who: 'NGOs, food banks, community organizations', points: ['Browse food nearby', 'See compatibility & distance', 'Request and track pickups', 'Confirm receipt'] },
  { icon: Truck, title: 'Volunteers', who: 'Individuals collecting on behalf of receivers', points: ['See assigned pickups only', 'Update progress', 'Complete code handover', 'View completed tasks'] },
  { icon: ShieldCheck, title: 'Administrators', who: 'Platform operators', points: ['Verify organizations', 'Moderate listings', 'Monitor pickups & expiry', 'Review the audit trail'] },
]

export default function LandingPage() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="bg-grid absolute inset-0 [mask-image:radial-gradient(ellipse_at_top,black_30%,transparent_70%)]" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 pt-14 pb-20 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:pt-20 lg:pb-28">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-card px-3 py-1 text-xs font-medium text-brand">
              <span className="size-1.5 rounded-full bg-emerald-brand" />
              Hyperlocal food rescue for campuses &amp; cities
            </span>
            <h1 className="mt-5 text-4xl leading-[1.08] font-bold tracking-tight text-ink sm:text-5xl">
              Good food deserves a <span className="text-emerald-600">second chance.</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted-foreground">
              FoodBridge connects surplus food from local businesses with nearby organizations that can rescue it safely,
              quickly, and transparently.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" className="h-11 px-5 text-[0.95rem]">
                <Link to="/explore">
                  Explore Available Food <ArrowRight />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="h-11 px-5 text-[0.95rem]">
                <Link to="/signup?role=donor">Become a Donor</Link>
              </Button>
            </div>
            <p className="mt-4 text-sm text-muted-foreground">
              Judging or just curious?{' '}
              <Link to="/login" className="font-medium text-brand underline-offset-4 hover:underline">
                Try the demo
              </Link>{' '}
              — no setup needed.
            </p>
            <dl className="mt-10 grid max-w-lg grid-cols-3 gap-4 border-t pt-6">
              {[
                { icon: Clock, k: 'Live countdowns', v: 'Deadline-aware' },
                { icon: Route, k: 'Haversine matching', v: 'Explainable' },
                { icon: BadgeCheck, k: 'Code handover', v: 'Verified' },
              ].map((f) => (
                <div key={f.k}>
                  <f.icon className="size-4 text-emerald-600" />
                  <dt className="mt-2 text-xs text-muted-foreground">{f.k}</dt>
                  <dd className="text-sm font-semibold text-ink">{f.v}</dd>
                </div>
              ))}
            </dl>
          </div>
          <DashboardPreview />
        </div>
      </section>

      {/* How it works */}
      <section className="border-y bg-card py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <SectionHeading center eyebrow="How FoodBridge works" title="From surplus to verified rescue in four steps" />
          <ol className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s, i) => (
              <li key={s.title} className="relative rounded-2xl border bg-background p-6">
                <span className="tabular absolute top-6 right-6 text-xs font-semibold text-slate-300">0{i + 1}</span>
                <span className="flex size-10 items-center justify-center rounded-xl bg-forest text-emerald-300">
                  <s.icon className="size-5" />
                </span>
                <h3 className="mt-5 font-semibold text-ink">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.text}</p>
              </li>
            ))}
          </ol>
          <div className="mt-10 text-center">
            <Button asChild variant="outline" size="lg">
              <Link to="/how-it-works">
                See the full lifecycle <ArrowRight />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Who can use */}
      <section className="py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <SectionHeading eyebrow="Who can use FoodBridge" title="Built for every hand that moves food" description="Role-aware workspaces give each participant exactly the tools — and the data — they need." />
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {AUDIENCES.map((a) => (
              <div key={a.title} className="flex flex-col rounded-2xl border bg-card p-6">
                <a.icon className="size-6 text-emerald-600" />
                <h3 className="mt-4 text-lg font-semibold text-ink">{a.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{a.who}</p>
                <ul className="mt-5 space-y-2 text-sm">
                  {a.points.map((p) => (
                    <li key={p} className="flex gap-2">
                      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-500" />
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Why it matters */}
      <section className="bg-forest py-20 text-white">
        <div className="mx-auto grid max-w-6xl gap-12 px-4 sm:px-6 lg:grid-cols-2">
          <div>
            <p className="text-sm font-semibold text-emerald-300">Why food rescue matters</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight sm:text-[2.1rem]">
              Edible surplus is usually lost to timing, not quality.
            </h2>
            <p className="mt-4 leading-relaxed text-mint-50/80">
              A canteen closes with forty portions left. A banquet ends early. A grocery pulls bread at the end of the day.
              The food is fine — but by the time someone makes calls and finds a taker, the safe window has passed.
              FoodBridge turns that scramble into a coordinated, traceable process.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              { icon: Clock, t: 'Time is the constraint', d: 'Every listing carries a safe-use deadline. Countdowns and urgency-aware matching keep it front and centre.' },
              { icon: MapPin, t: 'Proximity matters', d: 'Matching favours nearby, capable receivers so food spends less time in transit.' },
              { icon: ShieldCheck, t: 'Trust is earned', d: 'Verified organizations, storage checks and handover codes make every rescue accountable.' },
              { icon: BarChart3, t: 'Impact is measured honestly', d: 'Only verified handovers count as rescued food — listed or accepted food never inflates totals.' },
            ].map((c) => (
              <div key={c.t} className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
                <c.icon className="size-5 text-emerald-300" />
                <h3 className="mt-3 font-semibold">{c.t}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-mint-50/70">{c.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Smart matching */}
      <section className="py-20">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-2">
          <div>
            <SectionHeading
              eyebrow="Smart matching, explained"
              title="Deterministic, transparent, and safety-first"
              description="No black box and no paid AI. Safety-critical constraints are hard filters; only eligible receivers are scored."
            />
            <div className="mt-8 rounded-2xl border bg-card p-5">
              <p className="text-sm font-semibold text-ink">Hard eligibility filters</p>
              <ul className="mt-3 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
                {['Before safe-use deadline', 'Pickup window still open', 'Receiver verified', 'Storage capability (fridge / freezer)', 'Handling capacity', 'Within donor’s pickup radius'].map((f) => (
                  <li key={f} className="flex gap-2">
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-500" /> {f}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div className="rounded-2xl border bg-card p-6">
            <p className="text-sm font-semibold text-ink">Ranking weights (configurable)</p>
            <ul className="mt-4 space-y-3">
              {(
                [
                  ['Distance (Haversine, straight-line)', DEFAULT_WEIGHTS.distance],
                  ['Quantity fit vs. capacity', DEFAULT_WEIGHTS.quantity],
                  ['Expiry urgency (only when feasible)', DEFAULT_WEIGHTS.urgency],
                  ['Pickup feasibility', DEFAULT_WEIGHTS.feasibility],
                  ['Storage fit', DEFAULT_WEIGHTS.storage],
                ] as const
              ).map(([label, w]) => (
                <li key={label}>
                  <div className="flex justify-between text-sm">
                    <span>{label}</span>
                    <span className="tabular font-medium text-brand">{Math.round(w * 100)}%</span>
                  </div>
                  <div className="mt-1.5 h-2 rounded-full bg-muted">
                    <div className="h-2 rounded-full bg-emerald-brand" style={{ width: `${w * 100 * 2.4}%` }} />
                  </div>
                </li>
              ))}
            </ul>
            <div className="mt-6 flex items-center gap-3 rounded-xl bg-forest-50 p-3">
              <MatchScore score={92} />
              <p className="text-sm text-brand">
                “92% match — 2.4 km away, refrigerated storage available, pickup window compatible.”
              </p>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">Distances are straight-line estimates, not road distance or travel time.</p>
          </div>
        </div>
      </section>

      {/* Verified pickup */}
      <section className="border-y bg-card py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <SectionHeading center eyebrow="Verified pickup process" title="Every handover is proven, not assumed" description="Codes are generated and checked on the server. Only a hash is stored; codes expire, allow limited attempts and can never be reused." />
          <div className="mt-12 grid gap-4 md:grid-cols-5">
            {[
              { icon: CheckCircle2, t: 'Accepted', d: 'Pickup record created atomically' },
              { icon: Users, t: 'Collector assigned', d: 'Receiver staff or a volunteer' },
              { icon: KeyRound, t: 'Code generated', d: 'Donor gets a one-time 6-digit code' },
              { icon: BadgeCheck, t: 'Collected', d: 'Collector enters code at handover' },
              { icon: HandHeart, t: 'Verified', d: 'Receiver confirms delivery' },
            ].map((s, i, arr) => (
              <div key={s.t} className="relative rounded-2xl border bg-background p-5 text-center">
                <span className="mx-auto flex size-10 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
                  <s.icon className="size-5" />
                </span>
                <p className="mt-3 font-semibold text-ink">{s.t}</p>
                <p className="mt-1 text-xs text-muted-foreground">{s.d}</p>
                {i < arr.length - 1 && (
                  <ArrowRight className="absolute top-1/2 -right-3.5 z-10 hidden size-5 -translate-y-1/2 rounded-full bg-card text-slate-300 md:block" />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Impact */}
      <section className="py-20">
        <div className="mx-auto grid max-w-6xl gap-12 px-4 sm:px-6 lg:grid-cols-[1fr_1.1fr]">
          <SectionHeading
            eyebrow="Impact measurement"
            title="Listed is not rescued. Accepted is not rescued."
            description="FoodBridge counts food as rescued only after a code-verified handover and confirmed receipt. Meals and kilograms are tracked separately — incompatible units are never added together."
          />
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              { icon: ListPlus, t: 'Listed meals', d: 'Everything donors offered — context, not impact.' },
              { icon: Truck, t: 'Collected meals', d: 'Handover code verified at the donor.' },
              { icon: BadgeCheck, t: 'Verified rescued meals', d: 'Receipt confirmed. This is the headline number.' },
              { icon: Snowflake, t: 'CO₂e (estimate)', d: 'Verified kg × a documented factor — always labelled as an estimate.' },
            ].map((c, i) => (
              <div key={c.t} className={cn('rounded-2xl border p-5', i === 2 ? 'border-brand bg-forest text-white' : 'bg-card')}>
                <c.icon className={cn('size-5', i === 2 ? 'text-emerald-300' : 'text-emerald-600')} />
                <p className="mt-3 font-semibold">{c.t}</p>
                <p className={cn('mt-1 text-sm', i === 2 ? 'text-mint-50/75' : 'text-muted-foreground')}>{c.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-4 pb-20 sm:px-6">
        <div className="relative mx-auto max-w-6xl overflow-hidden rounded-3xl bg-forest px-6 py-14 text-center text-white sm:px-12">
          <div className="bg-grid absolute inset-0 opacity-20 invert" />
          <div className="relative">
            <Building2 className="mx-auto size-8 text-emerald-300" />
            <h2 className="mx-auto mt-4 max-w-2xl text-3xl font-semibold tracking-tight">
              Have surplus today? Need food for tonight?
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-mint-50/80">
              Join as a donor, receiver organization or volunteer. It takes two minutes.
            </p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <Button asChild size="lg" className="h-11 bg-emerald-brand px-5 text-white hover:bg-emerald-600">
                <Link to="/signup">Create an account</Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="h-11 border-white/25 bg-transparent px-5 text-white hover:bg-white/10 hover:text-white">
                <Link to="/login">
                  <Bell /> Try the demo
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
