import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { HandHeart, Loader2, MailCheck, Store, Truck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Field, NativeSelect } from '@/components/common/Field'
import { LocationPicker } from '@/components/common/LocationPicker'
import { DONOR_ORG_TYPES, ORG_TYPE_LABELS, RECEIVER_ORG_TYPES } from '@/lib/constants'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { authErrorMessage } from '@/lib/authErrors'
import { OFFLINE_DEMO } from '@/lib/api'

const ROLES = [
  { value: 'donor', label: 'Donor', icon: Store, text: 'Restaurant, canteen, grocery, banquet hall, community kitchen' },
  { value: 'receiver', label: 'Receiver', icon: HandHeart, text: 'NGO, food bank or community organization' },
  { value: 'volunteer', label: 'Volunteer', icon: Truck, text: 'Collect food on behalf of receivers' },
] as const

const schema = z
  .object({
    role: z.enum(['donor', 'receiver', 'volunteer']),
    full_name: z.string().trim().min(2, 'Enter your name').max(120),
    email: z.email('Enter a valid email address'),
    password: z.string().min(8, 'Use at least 8 characters').max(72),
    org_name: z.string().trim().max(120).optional(),
    org_type: z.string().optional(),
    address: z.string().trim().max(300).optional(),
    city: z.string().trim().max(80).optional(),
    latitude: z.number().optional(),
    longitude: z.number().optional(),
    has_refrigeration: z.boolean(),
    has_freezer: z.boolean(),
    capacity_meals: z.number().optional(),
    agree: z.boolean().refine((v) => v, 'Please accept the food-safety responsibility statement'),
  })
  .superRefine((v, ctx) => {
    if (v.role === 'volunteer') return
    if (!v.org_name || v.org_name.length < 2) ctx.addIssue({ code: 'custom', path: ['org_name'], message: 'Enter your organization name' })
    if (!v.org_type) ctx.addIssue({ code: 'custom', path: ['org_type'], message: 'Choose an organization type' })
    if (!v.address || v.address.length < 3) ctx.addIssue({ code: 'custom', path: ['address'], message: 'Enter an address' })
    if (v.latitude == null || !Number.isFinite(v.latitude) || Math.abs(v.latitude) > 90)
      ctx.addIssue({ code: 'custom', path: ['latitude'], message: 'Enter a valid latitude' })
    if (v.longitude == null || !Number.isFinite(v.longitude) || Math.abs(v.longitude) > 180)
      ctx.addIssue({ code: 'custom', path: ['longitude'], message: 'Enter a valid longitude' })
    if (v.role === 'receiver' && (v.capacity_meals == null || !Number.isInteger(v.capacity_meals) || v.capacity_meals < 1 || v.capacity_meals > 100000))
      ctx.addIssue({ code: 'custom', path: ['capacity_meals'], message: 'Enter how many meals you can handle (1–100000)' })
  })
type Values = z.infer<typeof schema>

export default function SignupPage() {
  const [params] = useSearchParams()
  const initialRole = (['donor', 'receiver', 'volunteer'] as const).find((r) => r === params.get('role')) ?? 'donor'
  const [sentTo, setSentTo] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { role: initialRole, has_refrigeration: false, has_freezer: false, agree: false },
  })
  const role = watch('role')
  const isOrg = role !== 'volunteer'

  async function onSubmit(v: Values) {
    const meta: Record<string, unknown> = { role: v.role, full_name: v.full_name }
    if (isOrg) {
      Object.assign(meta, {
        org_name: v.org_name,
        org_type: v.org_type,
        address: v.address,
        city: v.city,
        latitude: v.latitude,
        longitude: v.longitude,
        has_refrigeration: String(v.has_refrigeration),
        has_freezer: String(v.has_freezer),
        capacity_meals: v.role === 'receiver' ? v.capacity_meals : 0,
      })
    }
    let result: Awaited<ReturnType<typeof supabase.auth.signUp>>
    try {
      result = await supabase.auth.signUp({
        email: v.email.trim().toLowerCase(),
        password: v.password,
        options: { data: meta, emailRedirectTo: `${window.location.origin}/dashboard` },
      })
    } catch (e) {
      toast.error(authErrorMessage(e))
      return
    }
    const { data, error } = result
    if (error) {
      toast.error(authErrorMessage(error))
      return
    }
    // With email confirmation on, Supabase hides duplicates by returning a user with no identities.
    if (data.user && data.user.identities?.length === 0) {
      toast.error('An account with this email already exists. Try signing in instead.')
      return
    }
    if (!data.session) setSentTo(v.email)
    else toast.success('Account created — welcome to FoodBridge!')
  }

  if (sentTo) {
    return (
      <div className="mx-auto max-w-md px-4 py-24 text-center">
        <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
          <MailCheck className="size-7" />
        </div>
        <h1 className="mt-5 text-2xl font-semibold">Confirm your email</h1>
        <p className="mt-2 text-muted-foreground">
          We sent a confirmation link to <strong className="text-ink">{sentTo}</strong>. Open it to activate your account, then
          sign in.
        </p>
        <Button asChild className="mt-8" variant="outline">
          <Link to="/login">Go to sign in</Link>
        </Button>
      </div>
    )
  }

  const types = role === 'donor' ? DONOR_ORG_TYPES : RECEIVER_ORG_TYPES

  if (OFFLINE_DEMO) {
    return (
      <div className="mx-auto max-w-md px-4 py-24 text-center">
        <h1 className="text-2xl font-semibold">Sign-up needs the live backend</h1>
        <p className="mt-2 text-muted-foreground">
          This deployment is running in offline demo mode without Supabase, so no real account can be created and nothing you
          enter would be saved. Use one of the simulated demo accounts to explore every role.
        </p>
        <p className="mt-3 text-xs text-muted-foreground">
          Real registration requires a Supabase project: set <code>VITE_SUPABASE_URL</code> and{' '}
          <code>VITE_SUPABASE_ANON_KEY</code> in <code>.env.local</code>, apply the database setup, and restart the app.
        </p>
        <Button asChild className="mt-8">
          <Link to="/login">Use a demo account</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6 lg:py-16">
      <h1 className="text-3xl font-semibold tracking-tight">Create your FoodBridge account</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Already registered?{' '}
        <Link to="/login" className="font-medium text-brand hover:underline">
          Sign in
        </Link>{' '}
        · Just exploring?{' '}
        <Link to="/login" className="font-medium text-brand hover:underline">
          Use a demo account
        </Link>
      </p>

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="mt-8 space-y-8">
        <fieldset>
          <legend className="text-sm font-semibold">I am joining as</legend>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {ROLES.map((r) => (
              <label
                key={r.value}
                className={cn(
                  'flex cursor-pointer flex-col rounded-xl border bg-card p-4 transition',
                  role === r.value ? 'border-brand ring-2 ring-brand/15' : 'hover:border-slate-300',
                )}
              >
                <input type="radio" value={r.value} className="sr-only" {...register('role')} />
                <r.icon className={cn('size-5', role === r.value ? 'text-emerald-600' : 'text-slate-400')} />
                <span className="mt-2 font-semibold">{r.label}</span>
                <span className="mt-0.5 text-xs text-muted-foreground">{r.text}</span>
              </label>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Administrator access is granted by platform operators only and cannot be selected here.
          </p>
        </fieldset>

        <section className="space-y-4 rounded-2xl border bg-card p-5 sm:p-6">
          <h2 className="font-semibold">Your details</h2>
          <Field label="Full name" htmlFor="full_name" error={errors.full_name?.message} required>
            <Input id="full_name" autoComplete="name" {...register('full_name')} aria-invalid={!!errors.full_name} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Email" htmlFor="email" error={errors.email?.message} required>
              <Input id="email" type="email" autoComplete="email" {...register('email')} aria-invalid={!!errors.email} />
            </Field>
            <Field label="Password" htmlFor="password" error={errors.password?.message} hint="At least 8 characters" required>
              <Input id="password" type="password" autoComplete="new-password" {...register('password')} aria-invalid={!!errors.password} />
            </Field>
          </div>
        </section>

        {isOrg && (
          <section className="space-y-4 rounded-2xl border bg-card p-5 sm:p-6">
            <div>
              <h2 className="font-semibold">Your organization</h2>
              {role === 'receiver' && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Receiver organizations are reviewed by an administrator before they can request food.
                </p>
              )}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Organization name" htmlFor="org_name" error={errors.org_name?.message} required>
                <Input id="org_name" {...register('org_name')} aria-invalid={!!errors.org_name} />
              </Field>
              <Field label="Type" htmlFor="org_type" error={errors.org_type?.message} required>
                <NativeSelect id="org_type" {...register('org_type')} defaultValue="" aria-invalid={!!errors.org_type}>
                  <option value="" disabled>
                    Select…
                  </option>
                  {types.map((t) => (
                    <option key={t} value={t}>
                      {ORG_TYPE_LABELS[t]}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
              <Field label="Address" htmlFor="address" error={errors.address?.message} required>
                <Input id="address" {...register('address')} aria-invalid={!!errors.address} />
              </Field>
              <Field label="City" htmlFor="city" error={errors.city?.message}>
                <Input id="city" {...register('city')} />
              </Field>
            </div>
            <LocationPicker
              latitude={watch('latitude')}
              longitude={watch('longitude')}
              errors={{ latitude: errors.latitude?.message, longitude: errors.longitude?.message }}
              onChange={(v) => {
                setValue('latitude', v.latitude, { shouldValidate: !!errors.latitude })
                setValue('longitude', v.longitude, { shouldValidate: !!errors.longitude })
                if (v.city && !watch('city')) setValue('city', v.city)
              }}
            />
            {role === 'receiver' && (
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Meals you can handle" htmlFor="capacity" error={errors.capacity_meals?.message} required>
                  <Input
                    id="capacity"
                    type="number"
                    min={1}
                    {...register('capacity_meals', { setValueAs: (v) => (v === '' ? undefined : Number(v)) })}
                    aria-invalid={!!errors.capacity_meals}
                  />
                </Field>
                <label className="flex items-center gap-2 self-end pb-2 text-sm">
                  <Checkbox checked={watch('has_refrigeration')} onCheckedChange={(c) => setValue('has_refrigeration', c === true)} />
                  Refrigeration
                </label>
                <label className="flex items-center gap-2 self-end pb-2 text-sm">
                  <Checkbox checked={watch('has_freezer')} onCheckedChange={(c) => setValue('has_freezer', c === true)} />
                  Freezer
                </label>
              </div>
            )}
          </section>
        )}

        <div className="space-y-4">
          <label className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
            <Checkbox className="mt-0.5" checked={watch('agree')} onCheckedChange={(c) => setValue('agree', c === true, { shouldValidate: true })} />
            <span>
              I understand that FoodBridge coordinates food redistribution but does not certify food safety, and that my
              organization remains responsible for following applicable food-safety requirements.
            </span>
          </label>
          {errors.agree && <p className="text-xs text-red-600">{errors.agree.message}</p>}
          <Button type="submit" size="lg" className="h-11 w-full" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="animate-spin" />}
            Create account
          </Button>
        </div>
      </form>
    </div>
  )
}
