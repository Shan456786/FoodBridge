import { passwordStrength } from '@/lib/password'
import { cn } from '@/lib/utils'

const BAR = ['bg-red-500', 'bg-red-500', 'bg-amber-500', 'bg-emerald-500', 'bg-emerald-600']

export function PasswordStrength({ value }: { value: string }) {
  if (!value) return null
  const s = passwordStrength(value)
  return (
    <div className="space-y-1" aria-live="polite">
      <div className="flex gap-1" aria-hidden="true">
        {[1, 2, 3, 4].map((i) => (
          <span key={i} className={cn('h-1 flex-1 rounded-full', i <= s.score ? BAR[s.score] : 'bg-muted')} />
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Strength: <span className="font-medium text-foreground">{s.label}</span>
      </p>
    </div>
  )
}
