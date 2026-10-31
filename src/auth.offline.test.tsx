/**
 * End-to-end auth behaviour of the whole app in OFFLINE DEMO mode (no Supabase):
 * demo sign-in for every role, honest errors for real accounts, session
 * persistence across a reload, sign-out, and role-based route access.
 */
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn(), info: vi.fn(), message: vi.fn() }))
vi.mock('sonner', () => ({ toast, Toaster: () => null }))
vi.mock('@/lib/supabase', () => ({
  isSupabaseConfigured: false,
  serverKeyRejected: false,
  supabase: { auth: {} },
}))

const DENIED = "This area isn't available for your role"
const ROLES = ['Donor', 'Receiver', 'Volunteer', 'Admin'] as const
// Route → roles allowed, mirroring src/App.tsx.
const ACCESS: Record<string, (typeof ROLES)[number][]> = {
  '/listings': ['Donor'],
  '/matches': ['Donor', 'Receiver'],
  '/requests': ['Donor', 'Receiver'],
  '/pickups': ['Donor', 'Receiver', 'Volunteer'],
  '/admin': ['Admin'],
}

function go(path: string) {
  act(() => {
    window.history.pushState({}, '', path)
    window.dispatchEvent(new PopStateEvent('popstate'))
  })
}

/** Fresh module graph = a page reload: only localStorage survives. */
async function loadApp(path: string) {
  vi.resetModules()
  window.history.pushState({}, '', path)
  const { default: App } = await import('@/App')
  return render(<App />)
}

async function signInAsDemo(role: (typeof ROLES)[number]) {
  await loadApp('/login')
  await userEvent.click(await screen.findByText(`Demo ${role}`))
  await screen.findByRole('heading', { level: 1, name: /^Good (morning|afternoon|evening), Demo$/ }, { timeout: 5000 })
}

beforeEach(() => {
  localStorage.clear()
  Object.values(toast).forEach((f) => f.mockReset())
})

describe('offline demo authentication', () => {
  it('explains that real authentication needs Supabase', async () => {
    await loadApp('/login')
    expect(await screen.findByText(/real accounts can't sign in or\s+register here/)).toBeInTheDocument()
    expect(screen.getByText(/not real registered users/)).toBeInTheDocument()

    go('/signup')
    expect(await screen.findByRole('heading', { name: 'Sign-up needs the live backend' })).toBeInTheDocument()
    expect(screen.getByText(/no real account can be created/)).toBeInTheDocument()
  })

  it('never pretends a real account signed in', async () => {
    await loadApp('/login')
    await userEvent.type(await screen.findByLabelText('Email'), 'someone@example.com')
    await userEvent.type(screen.getByLabelText('Password'), 'any-password')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/Real accounts need a Supabase connection/)))
    expect(toast.success).not.toHaveBeenCalled()
    expect(localStorage.getItem('fb.offline.user')).toBeNull()
  })

  it('rejects a wrong password for a demo account', async () => {
    await loadApp('/login')
    await userEvent.type(await screen.findByLabelText('Email'), 'demo.donor@foodbridge.test')
    await userEvent.type(screen.getByLabelText('Password'), 'wrong-password')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Incorrect password for this demo account.'))
    expect(localStorage.getItem('fb.offline.user')).toBeNull()
  })

  it('signs in with the demo email and password through the form', async () => {
    await loadApp('/login')
    await userEvent.type(await screen.findByLabelText('Email'), ' Demo.Receiver@foodbridge.test ')
    await userEvent.type(screen.getByLabelText('Password'), 'FoodBridge-Demo-2026')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByText('Community Food Collective', {}, { timeout: 5000 })).toBeInTheDocument()
    expect(toast.success).toHaveBeenCalledWith('Signed in to the simulated demo')
  })

  it('redirects signed-out visitors from protected pages to sign-in', async () => {
    await loadApp('/dashboard')
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
  })

  it('keeps the session after a reload, then signs out', async () => {
    await signInAsDemo('Donor')
    expect(screen.getByText('Central Canteen')).toBeInTheDocument()

    await loadApp('/dashboard') // simulated refresh
    expect(
      await screen.findByRole('heading', { level: 1, name: /^Good (morning|afternoon|evening), Demo$/ }, { timeout: 5000 }),
    ).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Account menu' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: /Sign out/ }))
    await waitFor(() => expect(localStorage.getItem('fb.offline.user')).toBeNull())

    go('/dashboard')
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
  })

  for (const role of ROLES) {
    it(`enforces route access for the demo ${role}`, async () => {
      await signInAsDemo(role)
      for (const [path, allowed] of Object.entries(ACCESS)) {
        go(path)
        if (allowed.includes(role)) {
          await waitFor(() => expect(screen.queryByText(DENIED)).not.toBeInTheDocument())
          expect(window.location.pathname).toBe(path)
        } else {
          expect(await screen.findByText(DENIED), `${role} should be denied ${path}`).toBeInTheDocument()
        }
      }
    })
  }
})
