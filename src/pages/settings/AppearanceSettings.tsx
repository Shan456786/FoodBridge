import { Check } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Notice } from '@/components/common/Notice'
import { THEME_OPTIONS } from '@/components/common/themeOptions'
import { useTheme } from '@/context/ThemeContext'
import type { ThemePreference } from '@/lib/preferences'
import { cn } from '@/lib/utils'

const DESCRIPTIONS: Record<ThemePreference, string> = {
  light: 'Bright surfaces, ideal for daytime and outdoor use.',
  dark: 'Low-glare surfaces for evenings and dim kitchens.',
  system: 'Matches your device setting and switches automatically.',
}

/** Miniature of the app shell in a given palette. */
function Preview({ dark }: { dark: boolean }) {
  return (
    <div className={cn('flex h-full w-full gap-1.5 p-2', dark ? 'bg-[#0b1410]' : 'bg-[#f8faf8]')}>
      <div className={cn('w-1/4 space-y-1 rounded p-1', dark ? 'bg-[#0e1813]' : 'bg-white')}>
        <div className="h-1.5 w-3/4 rounded-sm bg-[#10b981]" />
        <div className={cn('h-1 w-full rounded-sm', dark ? 'bg-[#24362d]' : 'bg-[#e3e9e5]')} />
        <div className={cn('h-1 w-2/3 rounded-sm', dark ? 'bg-[#24362d]' : 'bg-[#e3e9e5]')} />
      </div>
      <div className="flex-1 space-y-1.5">
        <div className={cn('h-2 w-1/2 rounded-sm', dark ? 'bg-[#e3ece6]' : 'bg-[#17231d]')} />
        <div className="grid grid-cols-2 gap-1.5">
          <div className={cn('h-6 rounded', dark ? 'bg-[#111c16] ring-1 ring-[#24362d]' : 'bg-white ring-1 ring-[#e3e9e5]')} />
          <div className="h-6 rounded bg-[#163d2b]" />
        </div>
      </div>
    </div>
  )
}

export default function AppearanceSettings() {
  const { theme, resolved, setTheme } = useTheme()
  return (
    <Card>
      <CardHeader>
        <CardTitle>Theme</CardTitle>
        <CardDescription>
          Currently showing <span className="font-medium text-foreground">{resolved === 'dark' ? 'dark' : 'light'}</span>
          {theme === 'system' ? ' (following your device).' : '.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div role="radiogroup" aria-label="Theme" className="grid gap-3 sm:grid-cols-3">
          {THEME_OPTIONS.map((o) => {
            const selected = theme === o.value
            return (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setTheme(o.value)}
                className={cn(
                  'group overflow-hidden rounded-xl border text-left transition-shadow outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                  selected ? 'border-emerald-brand ring-2 ring-emerald-brand/25' : 'hover:border-muted-foreground/40',
                )}
              >
                <div className="relative aspect-[16/9] border-b">
                  {o.value === 'system' ? (
                    <div className="grid h-full grid-cols-2">
                      <Preview dark={false} />
                      <Preview dark />
                    </div>
                  ) : (
                    <Preview dark={o.value === 'dark'} />
                  )}
                  {selected && (
                    <span className="absolute top-2 right-2 flex size-5 items-center justify-center rounded-full bg-emerald-brand text-white">
                      <Check className="size-3.5" />
                    </span>
                  )}
                </div>
                <div className="p-3">
                  <p className="flex items-center gap-2 text-sm font-semibold">
                    <o.icon className="size-4 text-muted-foreground" /> {o.label}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{DESCRIPTIONS[o.value]}</p>
                </div>
              </button>
            )
          })}
        </div>
        <Notice tone="local" title="Saved on this device">
          Your theme is kept in this browser's local storage and applied on every visit, including offline. It does not sync to
          other devices.
        </Notice>
      </CardContent>
    </Card>
  )
}
