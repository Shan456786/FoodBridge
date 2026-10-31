import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { FlaskConical, HandHeart, Loader2, ShieldCheck, Store, Truck, WifiOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field } from '@/components/common/Field'
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from '@/lib/demo'
import { OFFLINE_DEMO } from '@/lib/api'
import { offlineSignIn } from '@/lib/api.offline'
import { authErrorMessage } from '@/lib/authErrors'
import { supabase } from '@/lib/supabase'
import type { Role } from '@/lib/types'

const schema = z.object({
  email: z.email('Enter a valid email address'),
  password: z.string().min(1, 'Enter your password'),
})
type Values = z.infer<typeof schema>

const ROLE_ICONS: Record<Role, typeof Store> = { donor: Store, receiver: HandHeart, volunteer: Truck, admin: ShieldCheck }

const isDemoEmail = (email: string) => DEMO_ACCOUNTS.some((a) => a.email === email.trim().toLowerCase())

// eslint-disable-next-line react-refresh/only-export-components
export const OFFLINE_REAL_ACCOUNT_MESSAGE =
  'Real accounts need a Supabase connection, which this app does not have yet (offline demo mode). Use one of the simulated demo accounts instead.'

export default function LoginPage() {
  const [demoBusy, setDemoBusy] = useState<Role | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema) })

  async function onSubmit(values: Values) {
    if (OFFLINE_DEMO) {
      // Never imply a real account was checked: offline mode only knows the demo accounts.
      if (!isDemoEmail(values.email)) return void toast.error(OFFLINE_REAL_ACCOUNT_MESSAGE)
      if (values.password !== DEMO_PASSWORD) return void toast.error('Incorrect password for this demo account.')
      try {
        offlineSignIn(values.email.trim().toLowerCase())
        toast.success('Signed in to the simulated demo')
      } catch (e) {
        toast.error((e as Error).message)
      }
      return
    }
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: values.email.trim(), password: values.password })
      if (error) toast.error(authErrorMessage(error))
      else toast.success('Welcome back')
    } catch (e) {
      toast.error(authErrorMessage(e))
    }
  }

  async function demoLogin(role: Role, email: string) {
    setDemoBusy(role)
    try {
      if (OFFLINE_DEMO) {
        offlineSignIn(email)
        return
      }
      const { error } = await supabase.auth.signInWithPassword({ email, password: DEMO_PASSWORD })
      if (error) {
        toast.error(
          /invalid login/i.test(error.message)
            ? 'Demo accounts are not provisioned on this deployment yet (run npm run seed:demo).'
            : authErrorMessage(error),
        )
      }
    } catch (e) {
      toast.error(authErrorMessage(e))
    } finally {
      setDemoBusy(null)
    }
  }

  return (
    <div className="mx-auto grid max-w-5xl gap-8 px-4 py-12 sm:px-6 lg:grid-cols-2 lg:py-20">
      <div className="rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
        <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          New to FoodBridge?{' '}
          <Link to="/signup" className="font-medium text-brand hover:underline">
            Create an account
          </Link>
        </p>
        {OFFLINE_DEMO && (
          <div className="mt-4 flex gap-2.5 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs leading-relaxed text-amber-950" role="note">
            <WifiOff className="mt-0.5 size-4 shrink-0" />
            <p>
              <strong>Offline demo mode.</strong> This app is not connected to Supabase, so real accounts can't sign in or
              register here. Only the simulated demo accounts work. Real authentication requires{' '}
              <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> in <code>.env.local</code>.
            </p>
          </div>
        )}
        <form className="mt-6 space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
          <Field label="Email" htmlFor="email" error={errors.email?.message}>
            <Input id="email" type="email" autoComplete="email" className="h-10" aria-invalid={!!errors.email} {...register('email')} />
          </Field>
          <Field label="Password" htmlFor="password" error={errors.password?.message}>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              className="h-10"
              aria-invalid={!!errors.password}
              {...register('password')}
            />
          </Field>
          <div className="-mt-1 flex justify-end">
            <Link to="/forgot-password" className="text-xs font-medium text-brand hover:underline">
              Forgot password?
            </Link>
          </div>
          <Button type="submit" className="h-10 w-full" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="animate-spin" />}
            Sign in
          </Button>
        </form>
      </div>

      <div className="rounded-2xl border border-dashed border-emerald-300 bg-emerald-50/50 p-6 sm:p-8">
        <div className="flex items-center gap-2 text-brand">
          <FlaskConical className="size-5" />
          <h2 className="text-lg font-semibold">Try the demo</h2>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          One click, no setup. Each role uses fictional organizations around Vijayawada &amp; VIT-AP. Demo accounts can only
          interact with demo records.
          {OFFLINE_DEMO && ' In offline mode they are simulated in this browser and are not real registered users.'}
        </p>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {DEMO_ACCOUNTS.map((a) => {
            const Icon = ROLE_ICONS[a.role]
            return (
              <button
                key={a.role}
                onClick={() => demoLogin(a.role, a.email)}
                disabled={demoBusy !== null}
                className="flex items-center gap-3 rounded-xl border bg-card p-3 text-left transition hover:border-emerald-400 hover:shadow-sm disabled:opacity-60"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-forest text-emerald-300">
                  {demoBusy === a.role ? <Loader2 className="size-5 animate-spin" /> : <Icon className="size-5" />}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">Demo {a.label}</span>
                  <span className="block truncate text-xs text-muted-foreground">{a.description}</span>
                </span>
              </button>
            )
          })}
        </div>
        <div className="mt-6 rounded-xl bg-card/70 p-4 text-xs leading-relaxed text-muted-foreground">
          <p className="font-semibold text-ink">Suggested walkthrough</p>
          <ol className="mt-1.5 list-decimal space-y-1 pl-4">
            <li>Donor: create a listing, or accept the pending request on “Idli &amp; Sambar Breakfast”.</li>
            <li>Receiver: explore matches and request food; assign the demo volunteer.</li>
            <li>Donor: open Pickups → generate a handover code.</li>
            <li>Volunteer (or receiver): enter the code → Collected.</li>
            <li>Receiver: confirm receipt → verified rescue; check Impact.</li>
          </ol>
        </div>
      </div>
    </div>
  )
}
