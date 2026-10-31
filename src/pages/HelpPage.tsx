import { Link } from 'react-router-dom'
import { ArrowRight, ChevronDown, Cloud, CloudOff, HandHeart, HardDrive, ShieldCheck, Store, Truck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { PageHeader } from '@/components/common/States'
import { Pill } from '@/components/common/StatusBadge'
import { useAuth } from '@/context/AuthContext'
import { OFFLINE_DEMO } from '@/lib/api'
import { cn } from '@/lib/utils'

const ROLES = [
  { role: 'donor', title: 'Donor', icon: Store, text: 'List surplus food with a safe-use deadline, accept requests and hand over with a one-time code.' },
  { role: 'receiver', title: 'Receiver (NGO)', icon: HandHeart, text: 'Find matches your storage and capacity can handle, request food, assign a volunteer and confirm receipt.' },
  { role: 'volunteer', title: 'Volunteer / transporter', icon: Truck, text: 'Collect assigned pickups, enter the handover code at the donor and deliver before the deadline.' },
  { role: 'admin', title: 'Administrator', icon: ShieldCheck, text: 'Verify organizations, moderate listings and review the audit trail.' },
] as const

const FAQ = [
  {
    q: 'How does matching decide what I can request?',
    a: 'Hard requirements come first: the listing must be open and within its safe-use deadline and pickup window, your organization must be verified, your storage (fridge/freezer) must match, the meals must fit your capacity and you must be within the donor’s pickup radius. Eligible listings are then scored 0–100 on distance, expiry urgency, quantity fit, storage fit and pickup feasibility.',
  },
  {
    q: 'What is the handover code?',
    a: 'When a pickup is ready, the donor generates a short one-time code. The collector enters it on arrival, which records the collection. Codes expire and lock after repeated wrong attempts.',
  },
  {
    q: 'Why can’t I request food yet?',
    a: 'Receiver organizations must be verified by an administrator first. You can still browse listings while you wait.',
  },
  {
    q: 'What is stored on my device?',
    a: 'Your theme, your profile picture and whether the sidebar is collapsed are saved in this browser only. In offline demo mode the sample organizations, listings and your demo name edits are stored here too.',
  },
  {
    q: 'I forgot my password.',
    a: 'Use “Forgot password?” on the sign-in page to get a reset link by email. This needs FoodBridge to be connected to Supabase; demo accounts use a shared password and can’t be reset.',
  },
]

export default function HelpPage() {
  const { profile } = useAuth()
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader title="Help & about" description="How FoodBridge works for each role, and answers to common questions." />

      <Card>
        <CardHeader>
          <CardTitle>Roles at a glance</CardTitle>
          <CardDescription>Each account has exactly one role. Yours is highlighted.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          {ROLES.map((r) => {
            const mine = profile?.role === r.role
            return (
              <div key={r.role} className={cn('rounded-xl border p-4', mine && 'border-emerald-brand bg-forest-50/60')}>
                <div className="flex items-center gap-2">
                  <span className="flex size-8 items-center justify-center rounded-lg bg-forest text-emerald-300">
                    <r.icon className="size-4" />
                  </span>
                  <p className="font-semibold">{r.title}</p>
                  {mine && <Pill tone="green" className="ml-auto">You</Pill>}
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{r.text}</p>
              </div>
            )
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Frequently asked questions</CardTitle>
        </CardHeader>
        <CardContent className="divide-y p-0">
          {FAQ.map((f) => (
            <details key={f.q} className="group px-4 [&_summary::-webkit-details-marker]:hidden">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-3.5 text-sm font-medium">
                {f.q}
                <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
              </summary>
              <p className="pb-4 text-sm leading-relaxed text-muted-foreground">{f.a}</p>
            </details>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {OFFLINE_DEMO ? <CloudOff className="size-4 text-amber-600" /> : <Cloud className="size-4 text-emerald-600" />}
              Connection
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            {OFFLINE_DEMO ? (
              <>
                <p>
                  <span className="font-medium text-foreground">Offline demo mode.</span> Not connected to Supabase. All data is
                  fictional sample data in this browser, and the four demo accounts are simulated.
                </p>
                <p>Real sign-up, password changes and password reset emails need a Supabase connection.</p>
              </>
            ) : (
              <p>
                <span className="font-medium text-foreground">Connected to Supabase.</span> Accounts, listings and pickups are
                stored in the FoodBridge database and protected by row-level security.
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <HardDrive className="size-4 text-muted-foreground" /> About FoodBridge
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              FoodBridge connects surplus food from local businesses with nearby verified organizations that can rescue it
              safely, quickly and transparently. It coordinates redistribution; it does not certify food safety.
            </p>
            <p>Built by Team Nexorithm · Food-Expiry Rescue &amp; Local Surplus Exchange.</p>
            <Button asChild variant="outline" size="sm">
              <Link to="/how-it-works">
                How it works <ArrowRight />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
