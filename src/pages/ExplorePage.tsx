import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Info, Search, SlidersHorizontal, UtensilsCrossed, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/common/Field'
import { ListingCard } from '@/components/common/ListingCard'
import { CardGridSkeleton, EmptyState, ErrorState, PageHeader } from '@/components/common/States'
import { useAuth } from '@/context/AuthContext'
import { useData, useNow } from '@/hooks/useData'
import { fetchAvailableListings } from '@/lib/api'
import { CATEGORY_LABELS, DIET_LABELS, LOCATION_PRESETS, STORAGE_LABELS } from '@/lib/constants'
import { haversineKm } from '@/lib/geo'
import { evaluateMatch } from '@/lib/matching'
import { isRequestable, minutesUntil } from '@/lib/time'
import type { Category, Diet, Storage } from '@/lib/types'

type Sort = 'expiry' | 'distance' | 'meals' | 'match'

export default function ExplorePage() {
  const { profile, organization, session } = useAuth()
  const now = useNow(30_000)
  const { data, error, loading, reload } = useData(fetchAvailableListings, [])

  const isReceiver = profile?.role === 'receiver' && organization
  const [q, setQ] = useState('')
  const [category, setCategory] = useState<Category | ''>('')
  const [diet, setDiet] = useState<Diet | ''>('')
  const [storage, setStorage] = useState<Storage | ''>('')
  const [minMeals, setMinMeals] = useState('')
  const [maxKm, setMaxKm] = useState('')
  const [maxHours, setMaxHours] = useState('')
  const [origin, setOrigin] = useState<string>(organization?.latitude != null ? 'org' : '')
  const [sort, setSort] = useState<Sort>(isReceiver ? 'match' : 'expiry')
  const [showFilters, setShowFilters] = useState(false)

  const originPoint = useMemo(() => {
    if (origin === 'org' && organization) return { latitude: organization.latitude, longitude: organization.longitude }
    const p = LOCATION_PRESETS.find((x) => x.label === origin)
    return p ? { latitude: p.latitude, longitude: p.longitude } : null
  }, [origin, organization])

  const rows = useMemo(() => {
    const list = (data ?? []).filter((l) => isRequestable(l, now))
    return list
      .map((l) => ({
        listing: l,
        distance: originPoint ? haversineKm(originPoint, l) : null,
        match: isReceiver ? evaluateMatch(l, organization!, now) : undefined,
      }))
      .filter(({ listing: l, distance }) => {
        if (q && !`${l.title} ${l.description ?? ''} ${l.donor?.name ?? ''}`.toLowerCase().includes(q.toLowerCase())) return false
        if (category && l.category !== category) return false
        if (diet && l.diet !== diet) return false
        if (storage && l.storage_requirement !== storage) return false
        if (minMeals && l.estimated_meals < Number(minMeals)) return false
        if (maxKm && distance != null && distance > Number(maxKm)) return false
        if (maxHours && minutesUntil(l.safe_until, now) > Number(maxHours) * 60) return false
        return true
      })
      .sort((a, b) => {
        if (sort === 'distance') return (a.distance ?? Infinity) - (b.distance ?? Infinity)
        if (sort === 'meals') return b.listing.estimated_meals - a.listing.estimated_meals
        if (sort === 'match' && a.match && b.match) {
          if (a.match.eligible !== b.match.eligible) return a.match.eligible ? -1 : 1
          return b.match.score - a.match.score
        }
        return new Date(a.listing.safe_until).getTime() - new Date(b.listing.safe_until).getTime()
      })
  }, [data, now, originPoint, isReceiver, organization, q, category, diet, storage, minMeals, maxKm, maxHours, sort])

  const activeFilters = [category, diet, storage, minMeals, maxKm, maxHours].filter(Boolean).length

  const clear = () => {
    setCategory('')
    setDiet('')
    setStorage('')
    setMinMeals('')
    setMaxKm('')
    setMaxHours('')
    setQ('')
  }

  return (
    <div className={session ? '' : 'mx-auto max-w-6xl px-4 py-10 sm:px-6'}>
      <PageHeader
        title="Explore available food"
        description={
          isReceiver
            ? 'Live surplus near your organization, ranked by match. Requests are re-checked on the server.'
            : 'Live surplus listings that are still within their safe pickup window.'
        }
        actions={
          !session && (
            <Button asChild>
              <Link to="/signup?role=receiver">Join as a receiver to request</Link>
            </Button>
          )
        }
      />

      <div className="mb-6 rounded-xl border bg-card p-3">
        <div className="flex flex-col gap-2 md:flex-row">
          <div className="relative flex-1">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search food or donor…" className="h-9 pl-9" aria-label="Search" />
          </div>
          <NativeSelect aria-label="Distance from" value={origin} onChange={(e) => setOrigin(e.target.value)} className="md:w-56">
            <option value="">Distance from…</option>
            {organization?.latitude != null && <option value="org">My organization</option>}
            {LOCATION_PRESETS.map((p) => (
              <option key={p.label} value={p.label}>
                {p.label}
              </option>
            ))}
          </NativeSelect>
          <NativeSelect aria-label="Sort by" value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="md:w-48">
            {isReceiver && <option value="match">Best match</option>}
            <option value="expiry">Expiring soonest</option>
            <option value="distance">Nearest</option>
            <option value="meals">Most meals</option>
          </NativeSelect>
          <Button variant="outline" className="h-9" onClick={() => setShowFilters((s) => !s)} aria-expanded={showFilters}>
            <SlidersHorizontal /> Filters
            {activeFilters > 0 && (
              <span className="rounded-full bg-forest px-1.5 text-[0.68rem] text-white">{activeFilters}</span>
            )}
          </Button>
        </div>
        {showFilters && (
          <div className="mt-3 grid gap-2 border-t pt-3 sm:grid-cols-3 lg:grid-cols-6">
            <NativeSelect aria-label="Category" value={category} onChange={(e) => setCategory(e.target.value as Category | '')}>
              <option value="">All categories</option>
              {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </NativeSelect>
            <NativeSelect aria-label="Diet" value={diet} onChange={(e) => setDiet(e.target.value as Diet | '')}>
              <option value="">Any diet</option>
              {Object.entries(DIET_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </NativeSelect>
            <NativeSelect aria-label="Storage" value={storage} onChange={(e) => setStorage(e.target.value as Storage | '')}>
              <option value="">Any storage</option>
              {Object.entries(STORAGE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </NativeSelect>
            <Input type="number" min={0} placeholder="Min meals" value={minMeals} onChange={(e) => setMinMeals(e.target.value)} aria-label="Minimum meals" className="h-9" />
            <Input
              type="number"
              min={0}
              placeholder={originPoint ? 'Max km' : 'Max km (pick origin)'}
              disabled={!originPoint}
              value={maxKm}
              onChange={(e) => setMaxKm(e.target.value)}
              aria-label="Maximum distance in km"
              className="h-9"
            />
            <Input type="number" min={0} placeholder="Expires within (h)" value={maxHours} onChange={(e) => setMaxHours(e.target.value)} aria-label="Expires within hours" className="h-9" />
            {activeFilters > 0 && (
              <Button variant="ghost" size="sm" onClick={clear} className="justify-self-start">
                <X /> Clear filters
              </Button>
            )}
          </div>
        )}
      </div>

      {isReceiver && organization.verification_status !== 'verified' && (
        <div className="mb-6 flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <Info className="mt-0.5 size-4 shrink-0" />
          Your organization is awaiting administrator verification. You can browse now and request food once verified.
        </div>
      )}

      {loading ? (
        <CardGridSkeleton />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={UtensilsCrossed}
          title={data?.length ? 'No listings match your filters' : 'No food available right now'}
          description={
            data?.length
              ? 'Try widening the distance or clearing filters.'
              : 'New surplus appears here as donors list it. Check back soon.'
          }
          action={
            data?.length ? (
              <Button variant="outline" onClick={clear}>
                Clear filters
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <p className="mb-3 text-xs text-muted-foreground">
            {rows.length} listing{rows.length === 1 ? '' : 's'} · distances are straight-line estimates, not road distance.
          </p>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {rows.map(({ listing, distance, match }) => (
              <ListingCard key={listing.id} listing={listing} now={now} match={match} distanceKm={distance} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
