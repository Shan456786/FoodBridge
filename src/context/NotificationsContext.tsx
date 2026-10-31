import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { fetchNotifications, markAllNotificationsRead, markNotificationRead, OFFLINE_DEMO } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import type { AppNotification } from '@/lib/types'
import { useAuth } from './AuthContext'

interface NotificationsState {
  items: AppNotification[]
  unread: number
  loading: boolean
  live: boolean
  reload: () => Promise<void>
  markRead: (id: string) => Promise<void>
  markAllRead: () => Promise<void>
}

const Ctx = createContext<NotificationsState | null>(null)
const POLL_MS = 30_000

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const userId = session?.user.id
  const [items, setItems] = useState<AppNotification[]>([])
  const [loading, setLoading] = useState(false)
  const [live, setLive] = useState(false)

  const reload = useCallback(async () => {
    if (!userId) return
    try {
      setItems(await fetchNotifications())
    } catch (e) {
      console.warn('notifications refresh failed', e)
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    if (!userId) {
      setItems([])
      return
    }
    setLoading(true)
    void reload()

    const poll = setInterval(reload, OFFLINE_DEMO ? 5_000 : POLL_MS)
    const onFocus = () => void reload()
    window.addEventListener('focus', onFocus)
    if (OFFLINE_DEMO) {
      return () => {
        clearInterval(poll)
        window.removeEventListener('focus', onFocus)
      }
    }

    // Realtime (RLS-filtered) with a polling fallback.
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        (payload) => {
          const n = payload.new as AppNotification
          setItems((prev) => (prev.some((p) => p.id === n.id) ? prev : [n, ...prev]))
          toast(n.title, { description: n.body ?? undefined })
        },
      )
      .subscribe((status) => setLive(status === 'SUBSCRIBED'))

    return () => {
      clearInterval(poll)
      window.removeEventListener('focus', onFocus)
      void supabase.removeChannel(channel)
    }
  }, [userId, reload])

  const value = useMemo<NotificationsState>(
    () => ({
      items,
      unread: items.filter((n) => !n.read_at).length,
      loading,
      live,
      reload,
      markRead: async (id) => {
        setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n)))
        try {
          await markNotificationRead(id)
        } catch (e) {
          toast.error((e as Error).message)
          void reload()
        }
      },
      markAllRead: async () => {
        try {
          await markAllNotificationsRead()
          await reload()
        } catch (e) {
          toast.error((e as Error).message)
        }
      },
    }),
    [items, loading, live, reload],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useNotifications() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useNotifications must be used inside NotificationsProvider')
  return ctx
}
