import { afterEach, describe, expect, it, vi } from 'vitest'

async function load(url: string, key: string) {
  vi.resetModules()
  vi.stubEnv('VITE_SUPABASE_URL', url)
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', key)
  return import('./supabase')
}

afterEach(() => vi.unstubAllEnvs())

describe('live vs offline selection', () => {
  it('stays offline with the .env.example placeholders and says which variables are wrong', async () => {
    const m = await load('https://YOUR-PROJECT.supabase.co', 'your-anon-or-publishable-key')
    expect(m.isSupabaseConfigured).toBe(false)
    expect(m.offlineReason).toBe('VITE_SUPABASE_URL is a placeholder; VITE_SUPABASE_ANON_KEY is a placeholder')
  })

  it('reports missing values', async () => {
    const m = await load('', '')
    expect(m.offlineReason).toBe('VITE_SUPABASE_URL is missing; VITE_SUPABASE_ANON_KEY is missing')
  })

  it('refuses a service-role key in the browser', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const payload = Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url')
    const m = await load('https://abcdefghijklmnopqrst.supabase.co', `eyJhbGciOiJIUzI1NiJ9.${payload}.sig`)
    expect(m.isSupabaseConfigured).toBe(false)
    expect(m.offlineReason).toBe('VITE_SUPABASE_ANON_KEY holds a secret key')
  })

  it('goes live with a real-looking URL and public key', async () => {
    const m = await load('https://abcdefghijklmnopqrst.supabase.co', 'sb_publishable_abc123')
    expect(m.isSupabaseConfigured).toBe(true)
    expect(m.offlineReason).toBeNull()
  })
})
