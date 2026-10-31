import { useSyncExternalStore } from 'react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { AVATAR_EVENT, initials, readAvatar } from '@/lib/preferences'
import { cn } from '@/lib/utils'

function subscribe(onChange: () => void) {
  window.addEventListener(AVATAR_EVENT, onChange)
  window.addEventListener('storage', onChange) // other tabs
  return () => {
    window.removeEventListener(AVATAR_EVENT, onChange)
    window.removeEventListener('storage', onChange)
  }
}

/** The avatar picture saved on this device for a user, kept in sync across components and tabs. */
// eslint-disable-next-line react-refresh/only-export-components
export function useLocalAvatar(userId: string | undefined | null) {
  return useSyncExternalStore(subscribe, () => readAvatar(userId), () => null)
}

const SIZES = {
  sm: 'size-8 text-xs',
  md: 'size-10 text-sm',
  lg: 'size-16 text-lg',
  xl: 'size-20 text-xl',
} as const

export function UserAvatar({
  userId,
  name,
  size = 'sm',
  className,
}: {
  userId: string | undefined | null
  name: string
  size?: keyof typeof SIZES
  className?: string
}) {
  const src = useLocalAvatar(userId)
  return (
    <Avatar className={cn(SIZES[size], className)}>
      {src && <AvatarImage src={src} alt="" />}
      <AvatarFallback className="bg-forest font-semibold text-white">{initials(name)}</AvatarFallback>
    </Avatar>
  )
}
