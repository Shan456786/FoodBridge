import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { AlertTriangle, ArrowLeft, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Field, NativeSelect } from '@/components/common/Field'
import { LocationPicker } from '@/components/common/LocationPicker'
import { ErrorState, PageHeader } from '@/components/common/States'
import { FullPageSpinner } from '@/components/layout/Guards'
import { useAuth } from '@/context/AuthContext'
import { createListing, fetchListing, updateListing, type ListingInput } from '@/lib/api'
import { CATEGORY_LABELS, COMMON_ALLERGENS, DIET_LABELS, STORAGE_LABELS, UNIT_LABELS } from '@/lib/constants'
import { fromLocalInput, toLocalInput } from '@/lib/time'
import { cn } from '@/lib/utils'

const dt = z.string().min(1, 'Required')

export const listingSchema = z
  .object({
    title: z.string().trim().min(3, 'At least 3 characters').max(120),
    description: z.string().trim().max(1000).optional(),
    category: z.enum(['cooked_meals', 'bakery', 'fruits', 'vegetables', 'packaged_food', 'dairy', 'other']),
    diet: z.enum(['veg', 'non_veg', 'vegan']),
    quantity: z.number({ error: 'Enter a quantity' }).positive('Must be greater than zero').max(100000),
    quantity_unit: z.enum(['kg', 'portions', 'packets', 'trays', 'litres', 'items']),
    estimated_meals: z.number({ error: 'Enter estimated meals' }).int('Whole number').min(1, 'At least 1').max(100000),
    prepared_at: z.string().optional(),
    safe_until: dt,
    pickup_start: dt,
    pickup_end: dt,
    storage_requirement: z.enum(['ambient', 'refrigerated', 'frozen']),
    packaging: z.string().trim().max(200).optional(),
    allergens: z.array(z.string()),
    pickup_address: z.string().trim().min(3, 'Enter a pickup address').max(300),
    latitude: z.number().refine((v) => Number.isFinite(v) && Math.abs(v) <= 90, 'Invalid latitude'),
    longitude: z.number().refine((v) => Number.isFinite(v) && Math.abs(v) <= 180, 'Invalid longitude'),
    max_radius_km: z.number({ error: 'Enter a radius' }).positive().max(100, 'Max 100 km'),
    handling_confirmed: z.boolean().refine((v) => v, 'You must confirm safe handling and storage'),
  })
  .superRefine((v, ctx) => {
    const t = (s?: string) => (s ? new Date(s).getTime() : NaN)
    const now = Date.now()
    const safe = t(v.safe_until)
    const start = t(v.pickup_start)
    const end = t(v.pickup_end)
    const prepared = t(v.prepared_at)
    if (!Number.isNaN(safe) && safe <= now) ctx.addIssue({ code: 'custom', path: ['safe_until'], message: 'Must be in the future' })
    if (!Number.isNaN(end) && end <= now) ctx.addIssue({ code: 'custom', path: ['pickup_end'], message: 'Must be in the future' })
    if (!Number.isNaN(start) && !Number.isNaN(end) && start >= end)
      ctx.addIssue({ code: 'custom', path: ['pickup_end'], message: 'Must be after pickup start' })
    if (!Number.isNaN(end) && !Number.isNaN(safe) && end > safe)
      ctx.addIssue({ code: 'custom', path: ['pickup_end'], message: 'Pickup cannot end after the safe-use deadline' })
    if (!Number.isNaN(prepared)) {
      if (prepared > now + 5 * 60_000) ctx.addIssue({ code: 'custom', path: ['prepared_at'], message: 'Cannot be in the future' })
      if (!Number.isNaN(safe) && prepared >= safe)
        ctx.addIssue({ code: 'custom', path: ['prepared_at'], message: 'Must be before the safe-use deadline' })
    }
  })
export type ListingFormValues = z.infer<typeof listingSchema>

const num = { setValueAs: (v: string) => (v === '' ? undefined : Number(v)) }

export default function ListingFormPage() {
  const { id } = useParams()
  const editing = Boolean(id)
  const navigate = useNavigate()
  const { organization } = useAuth()
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(!editing)

  const n = new Date()
  const plus = (h: number) => toLocalInput(new Date(n.getTime() + h * 3600_000))

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ListingFormValues>({
    resolver: zodResolver(listingSchema),
    defaultValues: {
      category: 'cooked_meals',
      diet: 'veg',
      quantity_unit: 'portions',
      storage_requirement: 'ambient',
      prepared_at: plus(-0.5),
      safe_until: plus(4),
      pickup_start: toLocalInput(n),
      pickup_end: plus(3),
      allergens: [],
      pickup_address: organization?.address ?? '',
      latitude: organization?.latitude ?? undefined,
      longitude: organization?.longitude ?? undefined,
      max_radius_km: 15,
      handling_confirmed: false,
    },
  })

  useEffect(() => {
    if (!id) return
    fetchListing(id)
      .then((l) => {
        if (!l) throw new Error('Listing not found or not visible to you.')
        if (l.status !== 'available') throw new Error('Only available listings can be edited.')
        if (l.donor_org_id !== organization?.id) throw new Error('You can only edit your own organization’s listings.')
        reset({
          title: l.title,
          description: l.description ?? '',
          category: l.category,
          diet: l.diet,
          quantity: Number(l.quantity),
          quantity_unit: l.quantity_unit,
          estimated_meals: l.estimated_meals,
          prepared_at: l.prepared_at ? toLocalInput(new Date(l.prepared_at)) : '',
          safe_until: toLocalInput(new Date(l.safe_until)),
          pickup_start: toLocalInput(new Date(l.pickup_start)),
          pickup_end: toLocalInput(new Date(l.pickup_end)),
          storage_requirement: l.storage_requirement,
          packaging: l.packaging ?? '',
          allergens: l.allergens ?? [],
          pickup_address: l.pickup_address,
          latitude: l.latitude,
          longitude: l.longitude,
          max_radius_km: Number(l.max_radius_km),
          handling_confirmed: false,
        })
        setLoaded(true)
      })
      .catch((e: Error) => setLoadError(e.message))
  }, [id, organization?.id, reset])

  async function onSubmit(v: ListingFormValues) {
    const payload: Omit<ListingInput, 'donor_org_id'> = {
      title: v.title,
      description: v.description || null,
      category: v.category,
      diet: v.diet,
      quantity: v.quantity,
      quantity_unit: v.quantity_unit,
      estimated_meals: v.estimated_meals,
      prepared_at: v.prepared_at ? fromLocalInput(v.prepared_at) : null,
      safe_until: fromLocalInput(v.safe_until),
      pickup_start: fromLocalInput(v.pickup_start),
      pickup_end: fromLocalInput(v.pickup_end),
      storage_requirement: v.storage_requirement,
      packaging: v.packaging || null,
      allergens: v.allergens,
      pickup_address: v.pickup_address,
      latitude: v.latitude,
      longitude: v.longitude,
      max_radius_km: v.max_radius_km,
      handling_confirmed: v.handling_confirmed,
    }
    try {
      if (editing && id) {
        await updateListing(id, payload)
        toast.success('Listing updated')
        navigate(`/listings/${id}`)
      } else {
        if (!organization) throw new Error('Your account is not linked to a donor organization.')
        const created = await createListing({ ...payload, donor_org_id: organization.id })
        toast.success('Listing published', { description: 'Nearby receivers can now request it.' })
        navigate(`/listings/${created.id}`)
      }
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  if (loadError) return <ErrorState message={loadError} />
  if (!loaded) return <FullPageSpinner />

  const allergens = watch('allergens')
  const toggleAllergen = (a: string) =>
    setValue('allergens', allergens.includes(a) ? allergens.filter((x) => x !== a) : [...allergens, a])

  return (
    <div className="mx-auto max-w-3xl">
      <Button asChild variant="ghost" size="sm" className="mb-3 -ml-2">
        <Link to={editing ? `/listings/${id}` : '/listings'}>
          <ArrowLeft /> Back
        </Link>
      </Button>
      <PageHeader
        title={editing ? 'Edit listing' : 'List surplus food'}
        description="All times are entered in your local timezone and stored in UTC."
      />

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-6">
        <section className="space-y-4 rounded-2xl border bg-card p-5 sm:p-6">
          <h2 className="font-semibold">What are you donating?</h2>
          <Field label="Title" htmlFor="title" error={errors.title?.message} required>
            <Input id="title" placeholder="e.g. Veg Biryani & Raita" {...register('title')} aria-invalid={!!errors.title} />
          </Field>
          <Field label="Description" htmlFor="description" error={errors.description?.message} hint="Condition, how it was kept, anything collectors should know.">
            <Textarea id="description" rows={3} {...register('description')} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Category" htmlFor="category" required>
              <NativeSelect id="category" {...register('category')}>
                {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Classification" htmlFor="diet" required>
              <NativeSelect id="diet" {...register('diet')}>
                {Object.entries(DIET_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Quantity" htmlFor="quantity" error={errors.quantity?.message} required>
              <Input id="quantity" type="number" step="0.1" min={0} {...register('quantity', num)} aria-invalid={!!errors.quantity} />
            </Field>
            <Field label="Unit" htmlFor="unit" required>
              <NativeSelect id="unit" {...register('quantity_unit')}>
                {Object.entries(UNIT_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Estimated meals" htmlFor="meals" error={errors.estimated_meals?.message} required>
              <Input id="meals" type="number" min={1} {...register('estimated_meals', num)} aria-invalid={!!errors.estimated_meals} />
            </Field>
          </div>
        </section>

        <section className="space-y-4 rounded-2xl border bg-card p-5 sm:p-6">
          <h2 className="font-semibold">Timing</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Prepared / packed at" htmlFor="prepared_at" error={errors.prepared_at?.message} hint="Optional for packaged goods">
              <Input id="prepared_at" type="datetime-local" {...register('prepared_at')} />
            </Field>
            <Field label="Safe-use deadline" htmlFor="safe_until" error={errors.safe_until?.message} hint="Your own assessment — not a guarantee" required>
              <Input id="safe_until" type="datetime-local" {...register('safe_until')} aria-invalid={!!errors.safe_until} />
            </Field>
            <Field label="Pickup window start" htmlFor="pickup_start" error={errors.pickup_start?.message} required>
              <Input id="pickup_start" type="datetime-local" {...register('pickup_start')} />
            </Field>
            <Field label="Pickup window end" htmlFor="pickup_end" error={errors.pickup_end?.message} required>
              <Input id="pickup_end" type="datetime-local" {...register('pickup_end')} aria-invalid={!!errors.pickup_end} />
            </Field>
          </div>
        </section>

        <section className="space-y-4 rounded-2xl border bg-card p-5 sm:p-6">
          <h2 className="font-semibold">Storage, packaging & allergens</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Storage requirement" htmlFor="storage" hint="Receivers without this capability can't request it" required>
              <NativeSelect id="storage" {...register('storage_requirement')}>
                {Object.entries(STORAGE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Packaging" htmlFor="packaging" error={errors.packaging?.message}>
              <Input id="packaging" placeholder="e.g. Sealed containers" {...register('packaging')} />
            </Field>
          </div>
          <div>
            <p className="mb-2 text-[0.8rem] font-medium">Contains allergens</p>
            <div className="flex flex-wrap gap-2">
              {COMMON_ALLERGENS.map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => toggleAllergen(a)}
                  aria-pressed={allergens.includes(a)}
                  className={cn(
                    'rounded-full border px-3 py-1 text-xs font-medium capitalize transition',
                    allergens.includes(a) ? 'border-amber-400 bg-amber-50 text-amber-800' : 'bg-card text-slate-600 hover:border-slate-300',
                  )}
                >
                  {a}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {allergens.length ? `Declared: ${allergens.join(', ')}` : 'None declared. Only leave empty if you are confident.'}
            </p>
          </div>
        </section>

        <section className="space-y-4 rounded-2xl border bg-card p-5 sm:p-6">
          <h2 className="font-semibold">Pickup location</h2>
          <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
            <Field label="Pickup address" htmlFor="pickup_address" error={errors.pickup_address?.message} required>
              <Input id="pickup_address" {...register('pickup_address')} aria-invalid={!!errors.pickup_address} />
            </Field>
            <Field label="Max pickup radius (km)" htmlFor="radius" error={errors.max_radius_km?.message} required>
              <Input id="radius" type="number" min={1} max={100} {...register('max_radius_km', num)} />
            </Field>
          </div>
          <LocationPicker
            latitude={watch('latitude')}
            longitude={watch('longitude')}
            errors={{ latitude: errors.latitude?.message, longitude: errors.longitude?.message }}
            onChange={(v) => {
              setValue('latitude', v.latitude, { shouldValidate: !!errors.latitude })
              setValue('longitude', v.longitude, { shouldValidate: !!errors.longitude })
            }}
          />
        </section>

        <section className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50 p-5 sm:p-6">
          <p className="flex items-center gap-2 font-semibold text-amber-950">
            <AlertTriangle className="size-4" /> Food safety declaration
          </p>
          <p className="text-sm text-amber-950/80">
            FoodBridge does not inspect or certify food. The deadline you enter is your own assessment. You remain responsible for
            complying with applicable food-safety requirements.
          </p>
          <label className="flex items-start gap-3 text-sm text-amber-950">
            <Checkbox
              className="mt-0.5"
              checked={watch('handling_confirmed')}
              onCheckedChange={(c) => setValue('handling_confirmed', c === true, { shouldValidate: true })}
            />
            I confirm this food has been prepared, handled and stored appropriately, and the information above is accurate.
          </label>
          {errors.handling_confirmed && <p className="text-xs text-red-600">{errors.handling_confirmed.message}</p>}
        </section>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button asChild type="button" variant="outline" size="lg">
            <Link to={editing ? `/listings/${id}` : '/listings'}>Cancel</Link>
          </Button>
          <Button type="submit" size="lg" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="animate-spin" />}
            {editing ? 'Save changes' : 'Publish listing'}
          </Button>
        </div>
      </form>
    </div>
  )
}
