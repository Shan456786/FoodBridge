import { afterEach, describe, expect, it, vi } from 'vitest'
import { forbiddenBrowserEnvNames, isPlaceholder, isServerOnlyKey } from './keyGuard'

// Unsigned test tokens (header.payload.signature) — not real credentials.
const b64 = (o: object) => btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
// Fake fixture assembled at runtime so secret scanners don't flag it as a real key.
const FAKE_SECRET_KEY = ['sb', 'secret', 'abcdefghijklmnop'].join('_')
const jwt = (role: string) => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ iss: 'supabase', role })}.test-signature`

describe('keyGuard', () => {
  it('flags service-role JWTs and sb_secret_ keys as server-only', () => {
    expect(isServerOnlyKey(jwt('service_role'))).toBe(true)
    expect(isServerOnlyKey(FAKE_SECRET_KEY)).toBe(true)
  })
  it('accepts anon JWTs and publishable keys', () => {
    expect(isServerOnlyKey(jwt('anon'))).toBe(false)
    expect(isServerOnlyKey('sb_publishable_abcdefghijklmnop')).toBe(false)
    expect(isServerOnlyKey(undefined)).toBe(false)
  })
  it('detects template placeholders', () => {
    expect(isPlaceholder('https://YOUR-PROJECT-REF.supabase.co')).toBe(true)
    expect(isPlaceholder('your-anon-or-publishable-key')).toBe(true)
    expect(isPlaceholder('')).toBe(true)
    expect(isPlaceholder('https://abcd.supabase.co')).toBe(false)
  })
  it('flags VITE_ variables that look like server-only secrets', () => {
    expect(
      forbiddenBrowserEnvNames({
        VITE_SUPABASE_URL: 'x',
        VITE_SUPABASE_ANON_KEY: 'x',
        VITE_SUPABASE_SERVICE_ROLE_KEY: 'x',
        VITE_DATABASE_URL: 'x',
        SUPABASE_SERVICE_ROLE_KEY: 'x',
      }),
    ).toEqual(['VITE_SUPABASE_SERVICE_ROLE_KEY', 'VITE_DATABASE_URL'])
  })
})

describe('browser Supabase client configuration', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })
  const load = async (url: string, key: string) => {
    vi.stubEnv('VITE_SUPABASE_URL', url)
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', key)
    vi.resetModules()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    return import('./supabase')
  }
  it('treats template placeholders as not configured (offline demo)', async () => {
    const m = await load('https://YOUR-PROJECT-REF.supabase.co', 'your-anon-or-publishable-key')
    expect(m.isSupabaseConfigured).toBe(false)
  })
  it('uses real-looking public credentials', async () => {
    const m = await load('https://abcd.supabase.co', jwt('anon'))
    expect(m.isSupabaseConfigured).toBe(true)
  })
  it('refuses a service-role key in the browser', async () => {
    const m = await load('https://abcd.supabase.co', jwt('service_role'))
    expect(m.serverKeyRejected).toBe(true)
    expect(m.isSupabaseConfigured).toBe(false)
  })
})
