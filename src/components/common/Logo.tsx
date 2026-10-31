import { cn } from '@/lib/utils'

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={cn('size-8', className)}>
      <rect width="32" height="32" rx="9" fill="#163D2B" />
      <path d="M7 21.5c3.2-5.6 14.8-5.6 18 0" stroke="#10B981" strokeWidth="2.4" fill="none" strokeLinecap="round" />
      <path d="M9.5 21.5v3M22.5 21.5v3" stroke="#10B981" strokeWidth="2.4" strokeLinecap="round" />
      <path
        d="M16 7.5c3.6 1.4 5 4.2 4.2 7.4-3.4.2-6.2-1.4-7-4.4M16 7.5c-1 2.2-1.2 4.4-.4 6.8"
        stroke="#F4FBF7"
        strokeWidth="1.8"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function Logo({ className, light = false }: { className?: string; light?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <LogoMark />
      <span className={cn('text-[1.05rem] font-bold tracking-tight', light ? 'text-white' : 'text-brand')}>
        Food<span className="text-emerald-brand">Bridge</span>
      </span>
    </span>
  )
}
