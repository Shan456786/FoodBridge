import { useEffect, useState } from 'react'
import { Crosshair, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { LOCATION_PRESETS } from '@/lib/constants'
import { Field, NativeSelect } from './Field'

/**
 * Latitude/longitude entry: quick presets for the Vijayawada / VIT-AP region,
 * the browser's geolocation (free, permission-based) or manual coordinates.
 */
export function LocationPicker({
  latitude,
  longitude,
  onChange,
  errors,
}: {
  latitude: number | null | undefined
  longitude: number | null | undefined
  onChange: (v: { latitude: number; longitude: number; city?: string; label?: string }) => void
  errors?: { latitude?: string; longitude?: string }
}) {
  const [locating, setLocating] = useState(false)
  const fmt = (v: number | null | undefined) => (v != null && Number.isFinite(v) ? String(v) : '')
  const [latText, setLatText] = useState(fmt(latitude))
  const [lngText, setLngText] = useState(fmt(longitude))
  const parse = (t: string) => (t.trim() === '' ? NaN : Number(t))

  // Sync text when coordinates change from outside (preset / geolocation).
  useEffect(() => {
    setLatText((t) => (parse(t) === latitude || (Number.isNaN(parse(t)) && latitude == null) ? t : fmt(latitude)))
  }, [latitude])
  useEffect(() => {
    setLngText((t) => (parse(t) === longitude || (Number.isNaN(parse(t)) && longitude == null) ? t : fmt(longitude)))
  }, [longitude])

  function useMyLocation() {
    if (!('geolocation' in navigator)) {
      toast.error('Geolocation is not available in this browser.')
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false)
        onChange({
          latitude: Number(pos.coords.latitude.toFixed(5)),
          longitude: Number(pos.coords.longitude.toFixed(5)),
        })
        toast.success('Location captured')
      },
      (err) => {
        setLocating(false)
        toast.error(err.code === err.PERMISSION_DENIED ? 'Location permission was denied.' : 'Could not get your location.')
      },
      { enableHighAccuracy: false, timeout: 10_000 },
    )
  }

  return (
    <div className="space-y-3 rounded-xl border bg-muted/30 p-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <NativeSelect
          aria-label="Quick location"
          value=""
          onChange={(e) => {
            const p = LOCATION_PRESETS.find((x) => x.label === e.target.value)
            if (p) onChange({ latitude: p.latitude, longitude: p.longitude, city: p.city, label: p.label })
          }}
        >
          <option value="">Choose an area (approximate)…</option>
          {LOCATION_PRESETS.map((p) => (
            <option key={p.label} value={p.label}>
              {p.label}
            </option>
          ))}
        </NativeSelect>
        <Button type="button" variant="outline" className="h-9 shrink-0" onClick={useMyLocation} disabled={locating}>
          {locating ? <Loader2 className="animate-spin" /> : <Crosshair />}
          Use my location
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Latitude" htmlFor="lat" error={errors?.latitude}>
          <Input
            id="lat"
            inputMode="decimal"
            value={latText}
            onChange={(e) => {
              setLatText(e.target.value)
              onChange({ latitude: parse(e.target.value), longitude: parse(lngText) })
            }}
            placeholder="16.4963"
          />
        </Field>
        <Field label="Longitude" htmlFor="lng" error={errors?.longitude}>
          <Input
            id="lng"
            inputMode="decimal"
            value={lngText}
            onChange={(e) => {
              setLngText(e.target.value)
              onChange({ latitude: parse(latText), longitude: parse(e.target.value) })
            }}
            placeholder="80.4994"
          />
        </Field>
      </div>
      <p className="text-xs text-muted-foreground">Used for straight-line distance matching only. No map or tracking.</p>
    </div>
  )
}
