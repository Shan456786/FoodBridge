import { RotateCcw, WifiOff } from 'lucide-react'
import { OFFLINE_DEMO } from '@/lib/api'
import { resetOfflineDemo } from '@/lib/api.offline'

/** Shown on every page when the app runs without Supabase on local sample data. */
export function OfflineBanner() {
  if (!OFFLINE_DEMO) return null
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-amber-300 bg-amber-100 px-4 py-2 text-xs text-amber-950 sm:px-6" role="status">
      <WifiOff className="size-3.5 shrink-0" />
      <span className="min-w-0 flex-1">
        <strong>Offline demo mode</strong> — not connected to Supabase. All organizations, listings and metrics are fictional
        sample data stored in this browser. Requests, pickups and handovers here are simulations, not real rescues.
      </span>
      <button
        className="inline-flex items-center gap-1 rounded-md border border-amber-400 bg-card/70 px-2 py-0.5 font-medium hover:bg-card"
        onClick={() => {
          resetOfflineDemo()
          window.location.reload()
        }}
      >
        <RotateCcw className="size-3" /> Reset demo data
      </button>
    </div>
  )
}
