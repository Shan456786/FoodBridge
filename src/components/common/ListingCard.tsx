import { Link } from 'react-router-dom'
import {
  Apple,
  Carrot,
  CookingPot,
  Croissant,
  Leaf,
  MapPin,
  Milk,
  Package,
  Snowflake,
  Thermometer,
  UtensilsCrossed,
  type LucideIcon,
} from 'lucide-react'
import { CATEGORY_LABELS, DIET_LABELS, STORAGE_LABELS, UNIT_LABELS } from '@/lib/constants'
import { formatKm } from '@/lib/geo'
import type { MatchResult } from '@/lib/matching'
import { effectiveStatus } from '@/lib/time'
import type { Category, FoodListing } from '@/lib/types'
import { cn } from '@/lib/utils'
import { CountdownBadge, DemoBadge, ListingStatusBadge, Pill } from './StatusBadge'
import { MatchScore } from './MatchScore'

export const CATEGORY_ICONS: Record<Category, LucideIcon> = {
  cooked_meals: CookingPot,
  bakery: Croissant,
  fruits: Apple,
  vegetables: Carrot,
  packaged_food: Package,
  dairy: Milk,
  other: UtensilsCrossed,
}

const CATEGORY_TINT: Record<Category, string> = {
  cooked_meals: 'bg-amber-50 text-amber-700',
  bakery: 'bg-orange-50 text-orange-700',
  fruits: 'bg-rose-50 text-rose-700',
  vegetables: 'bg-emerald-50 text-emerald-700',
  packaged_food: 'bg-sky-50 text-sky-700',
  dairy: 'bg-indigo-50 text-indigo-700',
  other: 'bg-slate-100 text-slate-700',
}

export function CategoryIcon({ category, className }: { category: Category; className?: string }) {
  const Icon = CATEGORY_ICONS[category]
  return (
    <div className={cn('flex size-10 shrink-0 items-center justify-center rounded-lg', CATEGORY_TINT[category], className)}>
      <Icon className="size-5" />
    </div>
  )
}

export function StorageTag({ storage }: { storage: FoodListing['storage_requirement'] }) {
  if (storage === 'ambient') return null
  return (
    <Pill tone="blue">
      {storage === 'frozen' ? <Snowflake /> : <Thermometer />}
      {STORAGE_LABELS[storage]}
    </Pill>
  )
}

export function DietTag({ diet }: { diet: FoodListing['diet'] }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <span
        className={cn(
          'inline-block size-2.5 rounded-[2px] ring-1 ring-offset-1',
          diet === 'non_veg' ? 'bg-red-600 ring-red-600' : 'bg-emerald-600 ring-emerald-600',
        )}
        aria-hidden="true"
      />
      {diet === 'vegan' && <Leaf className="size-3" />}
      {DIET_LABELS[diet]}
    </span>
  )
}

export function ListingCard({
  listing,
  now,
  match,
  distanceKm,
  footer,
  to,
}: {
  listing: FoodListing
  now: number
  match?: MatchResult
  distanceKm?: number | null
  footer?: React.ReactNode
  to?: string
}) {
  const status = effectiveStatus(listing, now)
  const distance = match?.distanceKm ?? distanceKm
  return (
    <article className="group flex flex-col rounded-xl border bg-card shadow-[0_1px_2px_rgb(16_24_40/0.04)] transition-shadow hover:shadow-md">
      <Link to={to ?? `/listings/${listing.id}`} className="flex flex-1 flex-col p-4 focus-visible:outline-none">
        <div className="flex items-start gap-3">
          <CategoryIcon category={listing.category} />
          <div className="min-w-0 flex-1">
            <h3 className="truncate font-semibold text-ink group-hover:text-brand">{listing.title}</h3>
            <p className="truncate text-xs text-muted-foreground">
              {listing.donor?.name ?? 'Donor'} · {CATEGORY_LABELS[listing.category]}
            </p>
          </div>
          {match && match.eligible && <MatchScore score={match.score} />}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Quantity</p>
            <p className="tabular font-medium">
              {Number(listing.quantity)} {UNIT_LABELS[listing.quantity_unit]}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Est. meals</p>
            <p className="tabular font-medium">{listing.estimated_meals}</p>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
          <MapPin className="size-3.5 shrink-0" />
          <span className="truncate">
            {listing.donor?.city ?? listing.pickup_address}
            {distance != null && ` · ${formatKm(distance)} (straight-line)`}
          </span>
        </div>

        {match && (
          <p
            className={cn(
              'mt-3 rounded-lg px-2.5 py-2 text-xs leading-relaxed',
              match.eligible ? 'bg-forest-50 text-brand' : 'bg-slate-50 text-slate-600',
            )}
          >
            {match.summary}
          </p>
        )}

        <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
          {status === 'available' || status === 'reserved' ? (
            <CountdownBadge deadline={listing.safe_until} now={now} />
          ) : (
            <ListingStatusBadge status={status} />
          )}
          {status === 'reserved' && <ListingStatusBadge status="reserved" />}
          <StorageTag storage={listing.storage_requirement} />
          <DietTag diet={listing.diet} />
          {listing.is_demo && <DemoBadge className="ml-auto" />}
        </div>
      </Link>
      {footer && <div className="border-t px-4 py-3">{footer}</div>}
    </article>
  )
}
