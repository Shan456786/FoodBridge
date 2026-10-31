import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { fetchOrganization, fetchProfile, OFFLINE_DEMO } from '@/lib/api'
import { OFFLINE_AUTH_EVENT, offlineEmail, offlineSignOut, offlineUserId } from '@/lib/api.offline'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import type { Organization, Profile } from '@/lib/types'

interface AuthState {
  session: Session | null
  profile: Profile | null
  organization: Organization | null
  loading: boolean
  /** Set when the profile could not be loaded (e.g. network error), as opposed to not existing. */
  profileError: string | null
  /** True when the current session came from a password-reset email link. */
  passwordRecovery: boolean
  refresh: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [organization, setOrganization] = useState<Organization | null>(null)
  const [loading, setLoading] = useState(true)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [passwordRecovery, setPasswordRecovery] = useState(false)
  const userIdRef = useRef<string | null>(null)

  const loadProfile = useCallback(async (s: Session | null) => {
    setProfileError(null)
    if (!s) {
      setProfile(null)
      setOrganization(null)
      return
    }
    try {
      const p = await fetchProfile(s.user.id)
      setProfile(p)
      setOrganization(p?.organization_id ? await fetchOrganization(p.organization_id) : null)
    } catch (e) {
      console.error('Failed to load profile', e)
      setProfileError((e as Error).message || 'Could not load your profile.')
      setProfile(null)
      setOrganization(null)
    }
  }, [])

  // Offline demo: local session for the built-in demo accounts (no Supabase).
  useEffect(() => {
    if (!OFFLINE_DEMO) return
    const sync = () => {
      const id = offlineUserId()
      const s = id ? ({ user: { id, email: offlineEmail(id) } } as unknown as Session) : null
      setSession(s)
      setLoading(true)
      loadProfile(s).finally(() => setLoading(false))
    }
    sync()
    window.addEventListener(OFFLINE_AUTH_EVENT, sync)
    return () => window.removeEventListener(OFFLINE_AUTH_EVENT, sync)
  }, [loadProfile])

  useEffect(() => {
    if (!isSupabaseConfigured) return
    let active = true
    supabase.auth
      .getSession()
      .then(async ({ data }) => {
        if (!active) return
        setSession(data.session)
        userIdRef.current = data.session?.user.id ?? null
        await loadProfile(data.session)
      })
      .catch((e) => console.error('Failed to restore session', e))
      .finally(() => {
        if (active) setLoading(false)
      })
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s)
      if (event === 'PASSWORD_RECOVERY') setPasswordRecovery(true)
      if (event === 'SIGNED_OUT') setPasswordRecovery(false)
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED' || event === 'PASSWORD_RECOVERY') {
        const nextId = s?.user.id ?? null
        // Same user re-authenticating or updating (e.g. a password change): refresh quietly so
        // the current page isn't swapped for the full-page spinner mid-action.
        const sameUser = nextId !== null && nextId === userIdRef.current
        userIdRef.current = nextId
        // Defer: Supabase recommends not awaiting other calls inside this callback.
        setTimeout(() => {
          if (sameUser) return void loadProfile(s)
          setLoading(true)
          loadProfile(s).finally(() => setLoading(false))
        }, 0)
      }
    })
    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [loadProfile])

  const value = useMemo<AuthState>(
    () => ({
      session,
      profile,
      organization,
      loading,
      profileError,
      passwordRecovery,
      refresh: () => loadProfile(session),
      signOut: async () => {
        if (OFFLINE_DEMO) offlineSignOut()
        else await supabase.auth.signOut()
      },
    }),
    [session, profile, organization, loading, profileError, passwordRecovery, loadProfile],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
