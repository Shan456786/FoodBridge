import { createClient } from '@supabase/supabase-js'
import { isPlaceholder, isServerOnlyKey } from './keyGuard'

// The ONLY Supabase credentials the browser may use. Both are public by design;
// Row Level Security and database functions enforce every permission.
// SUPABASE_SERVICE_ROLE_KEY and DATABASE_URL are read only by scripts/*.mjs.
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** Defence in depth: refuse to run the browser client with a service-role / secret key. */
export const serverKeyRejected = isServerOnlyKey(anonKey)
if (serverKeyRejected) {
  console.error(
    'FoodBridge refused to start the Supabase client: VITE_SUPABASE_ANON_KEY contains a service-role/secret key. ' +
      'Use the anon/publishable key, and rotate the exposed key in the Supabase dashboard.',
  )
}

export const isSupabaseConfigured = Boolean(
  url && anonKey && !isPlaceholder(url) && !isPlaceholder(anonKey) && !serverKeyRejected,
)

/** Why the app fell back to offline demo mode (variable names only, never values); null when live. */
export const offlineReason: string | null = isSupabaseConfigured
  ? null
  : [
      !url ? 'VITE_SUPABASE_URL is missing' : isPlaceholder(url) ? 'VITE_SUPABASE_URL is a placeholder' : null,
      !anonKey ? 'VITE_SUPABASE_ANON_KEY is missing' : isPlaceholder(anonKey) ? 'VITE_SUPABASE_ANON_KEY is a placeholder' : null,
      serverKeyRejected ? 'VITE_SUPABASE_ANON_KEY holds a secret key' : null,
    ]
      .filter(Boolean)
      .join('; ')

if (offlineReason && import.meta.env.DEV) {
  console.info(
    `[FoodBridge] Offline demo mode: ${offlineReason}. Set real values in .env.local, restart the dev server, ` +
      'and run `npm run verify:supabase` to check the connection.',
  )
}

export const supabase = createClient(
  isSupabaseConfigured ? url! : 'http://localhost:54321',
  isSupabaseConfigured ? anonKey! : 'missing-anon-key',
  { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } },
)
