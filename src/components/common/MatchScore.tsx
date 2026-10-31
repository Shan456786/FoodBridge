import { cn } from '@/lib/utils'

/** Circular score indicator for match quality (0–100). */
export function MatchScore({ score, size = 44, className }: { score: number; size?: number; className?: string }) {
  const r = (size - 6) / 2
  const c = 2 * Math.PI * r
  const color = score >= 75 ? 'var(--chart-2)' : score >= 50 ? 'var(--chart-1)' : 'var(--chart-3)'
  return (
    <div
      className={cn('relative shrink-0', className)}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${score}% match`}
      title={`${score}% match`}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border)" strokeWidth="4" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - score / 100)}
        />
      </svg>
      <span className="tabular absolute inset-0 flex items-center justify-center text-[0.7rem] font-semibold text-ink">
        {score}%
      </span>
    </div>
  )
}
