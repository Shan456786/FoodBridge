/**
 * Pure helpers (no browser or Node APIs beyond atob) used by both the browser
 * Supabase client and the Vite build guard to keep server-only credentials
 * out of the frontend. They never log or return key material.
 */

/** Values copied from .env.example that do not count as configuration. */
export function isPlaceholder(v: string | undefined | null): boolean {
  return !v || /YOUR-PROJECT|your-anon|your-publishable|^\s*$/i.test(v)
}

function jwtRole(token: string): string | null {
  const part = token.split('.')[1]
  if (!part) return null
  try {
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '=')
    const payload = JSON.parse(atob(b64)) as { role?: unknown }
    return typeof payload.role === 'string' ? payload.role : null
  } catch {
    return null
  }
}

/**
 * True for keys that must never reach a browser: legacy service_role JWTs and
 * new-style `sb_secret_` keys. Anon JWTs and `sb_publishable_` keys are fine.
 */
export function isServerOnlyKey(key: string | undefined | null): boolean {
  if (!key) return false
  const k = key.trim()
  if (k.startsWith('sb_secret_')) return true
  return k.startsWith('eyJ') && jwtRole(k) === 'service_role'
}

/** Browser-exposed (VITE_) variable names that look like server-only secrets. */
export function forbiddenBrowserEnvNames(env: Record<string, string | undefined>): string[] {
  return Object.keys(env).filter(
    (name) => name.startsWith('VITE_') && /(SERVICE_ROLE|SECRET|DATABASE_URL|DB_URL|PASSWORD|PRIVATE)/.test(name),
  )
}
