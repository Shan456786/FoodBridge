import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Building2, CalendarDays, KeyRound, Loader2, Mail, Pencil, Phone, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Field, NativeSelect } from '@/components/common/Field'
import { LocationPicker } from '@/components/common/LocationPicker'
import { Notice } from '@/components/common/Notice'
import { DemoBadge, Pill, VerificationBadge } from '@/components/common/StatusBadge'
import { PageHeader } from '@/components/common/States'
import { UserAvatar } from '@/components/common/UserAvatar'
import { useAuth } from '@/context/AuthContext'
import { OFFLINE_DEMO, updateOrganization } from '@/lib/api'
import { DONOR_ORG_TYPES, ORG_TYPE_LABELS, RECEIVER_ORG_TYPES, ROLE_LABELS } from '@/lib/constants'
import type { OrgType } from '@/lib/types'

const orgSchema = z.object({
  name: z.string().trim().min(2).max(120),
  org_type: z.string(),
  address: z.string().trim().max(300),
  city: z.string().trim().max(80),
  latitude: z.number().refine((v) => Number.isFinite(v) && Math.abs(v) <= 90, 'Invalid latitude'),
  longitude: z.number().refine((v) => Number.isFinite(v) && Math.abs(v) <= 180, 'Invalid longitude'),
  has_refrigeration: z.boolean(),
  has_freezer: z.boolean(),
  capacity_meals: z.number({ error: 'Enter a number' }).int().min(0).max(100000),
})

function ProfileSummary() {
  const { profile, organization, session } = useAuth()
  const name = profile?.full_name || session?.user.email || 'Your account'
  const details = [
    { icon: Mail, label: 'Email', value: session?.user.email ?? '—' },
    { icon: Phone, label: 'Phone', value: profile?.phone || 'Not added' },
    { icon: Building2, label: 'Organization', value: organization?.name ?? (profile?.role === 'volunteer' ? 'Independent volunteer' : '—') },
    {
      icon: CalendarDays,
      label: 'Member since',
      value: profile?.created_at ? new Date(profile.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : '—',
    },
  ]
  return (
    <Card className="overflow-hidden p-0">
      <div className="h-20 bg-forest bg-grid sm:h-24" aria-hidden="true" />
      <CardContent className="-mt-10 space-y-5 px-5 pb-5 sm:px-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex items-end gap-4">
            <UserAvatar userId={profile?.id} name={name} size="xl" className="ring-4 ring-card" />
            <div className="min-w-0 pb-1">
              <h2 className="truncate text-xl font-semibold tracking-tight text-ink">{name}</h2>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                {profile && <Pill tone="green">{ROLE_LABELS[profile.role]}</Pill>}
                {profile?.is_demo && <DemoBadge />}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link to="/settings/profile">
                <Pencil /> Edit profile
              </Link>
            </Button>
            <Button asChild variant="ghost">
              <Link to="/settings/security">
                <KeyRound /> Security
              </Link>
            </Button>
          </div>
        </div>
        <dl className="grid gap-x-6 gap-y-4 border-t pt-5 sm:grid-cols-2">
          {details.map((d) => (
            <div key={d.label} className="flex gap-3">
              <d.icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <dt className="text-xs text-muted-foreground">{d.label}</dt>
                <dd className="truncate text-sm font-medium">{d.value}</dd>
              </div>
            </div>
          ))}
        </dl>
        {profile && (
          <p className="flex items-start gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
            Roles are assigned at sign-up or by a platform operator and can't be changed from your profile.
          </p>
        )}
      </CardContent>
    </Card>
  )
}

function OrganizationForm() {
  const { organization, refresh } = useAuth()
  const org = organization!
  const form = useForm<z.infer<typeof orgSchema>>({
    resolver: zodResolver(orgSchema),
    defaultValues: {
      name: org.name,
      org_type: org.org_type,
      address: org.address ?? '',
      city: org.city ?? '',
      latitude: org.latitude ?? NaN,
      longitude: org.longitude ?? NaN,
      has_refrigeration: org.has_refrigeration,
      has_freezer: org.has_freezer,
      capacity_meals: org.capacity_meals,
    },
  })
  const { errors, isSubmitting } = form.formState
  const [saved, setSaved] = useState(false)
  const types = org.kind === 'donor' ? DONOR_ORG_TYPES : RECEIVER_ORG_TYPES

  return (
    <form
      className="space-y-4"
      onSubmit={form.handleSubmit(async (v) => {
        try {
          await updateOrganization(org.id, { ...v, org_type: v.org_type as OrgType })
          await refresh()
          setSaved(true)
          toast.success('Organization saved')
        } catch (e) {
          toast.error((e as Error).message)
        }
      })}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Organization name" htmlFor="org_name" error={errors.name?.message}>
          <Input id="org_name" {...form.register('name')} />
        </Field>
        <Field label="Type" htmlFor="org_type">
          <NativeSelect id="org_type" {...form.register('org_type')}>
            {types.map((t) => (
              <option key={t} value={t}>
                {ORG_TYPE_LABELS[t]}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Address" htmlFor="address" error={errors.address?.message}>
          <Input id="address" {...form.register('address')} />
        </Field>
        <Field label="City" htmlFor="city" error={errors.city?.message}>
          <Input id="city" {...form.register('city')} />
        </Field>
      </div>
      <LocationPicker
        latitude={form.watch('latitude')}
        longitude={form.watch('longitude')}
        errors={{ latitude: errors.latitude?.message, longitude: errors.longitude?.message }}
        onChange={(v) => {
          form.setValue('latitude', v.latitude, { shouldDirty: true })
          form.setValue('longitude', v.longitude, { shouldDirty: true })
        }}
      />
      {org.kind === 'receiver' && (
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Meals you can handle" htmlFor="cap" error={errors.capacity_meals?.message}>
            <Input id="cap" type="number" min={0} {...form.register('capacity_meals', { setValueAs: (v) => (v === '' ? NaN : Number(v)) })} />
          </Field>
          <label className="flex items-center gap-2 self-end pb-2 text-sm">
            <Checkbox checked={form.watch('has_refrigeration')} onCheckedChange={(c) => form.setValue('has_refrigeration', c === true, { shouldDirty: true })} />
            Refrigeration
          </label>
          <label className="flex items-center gap-2 self-end pb-2 text-sm">
            <Checkbox checked={form.watch('has_freezer')} onCheckedChange={(c) => form.setValue('has_freezer', c === true, { shouldDirty: true })} />
            Freezer
          </label>
        </div>
      )}
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="animate-spin" />} Save organization
        </Button>
        {saved && <span className="text-xs text-muted-foreground">Saved.</span>}
      </div>
    </form>
  )
}

export default function ProfilePage() {
  const { organization } = useAuth()
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="My profile" description="Your account at a glance and your organization's details." />
      <ProfileSummary />
      {organization && (
        <Card>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2">
              {organization.name} <VerificationBadge status={organization.verification_status} />
            </CardTitle>
            <CardDescription>
              {organization.kind === 'receiver'
                ? 'Storage capability and capacity are hard constraints in matching — keep them accurate.'
                : 'Your organization’s default pickup location for new listings.'}
              {organization.verification_note && ` Admin note: ${organization.verification_note}`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {OFFLINE_DEMO && (
              <Notice tone="local">Offline demo mode: organization changes are saved in this browser only.</Notice>
            )}
            <OrganizationForm />
          </CardContent>
        </Card>
      )}
    </div>
  )
}
