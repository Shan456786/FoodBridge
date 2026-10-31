/**
 * Account settings, appearance and navigation in OFFLINE DEMO mode, driven
 * through the whole app. A "reload" re-imports the app so only localStorage
 * survives, which is exactly what must persist.
 */
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn(), info: vi.fn(), message: vi.fn() }))
vi.mock('sonner', () => ({ toast, Toaster: () => null }))
vi.mock('@/lib/supabase', () => ({ isSupabaseConfigured: false, serverKeyRejected: false, supabase: { auth: {} } }))

const ROLES = ['Donor', 'Receiver', 'Volunteer', 'Admin'] as const
const GREETING = /^Good (morning|afternoon|evening), /

function go(path: string) {
  act(() => {
    window.history.pushState({}, '', path)
    window.dispatchEvent(new PopStateEvent('popstate'))
  })
}

let mounted: ReturnType<typeof render> | null = null

/** Simulates a page load: the previous page is torn down and modules start fresh. */
async function loadApp(path: string) {
  mounted?.unmount()
  vi.resetModules()
  window.history.pushState({}, '', path)
  const { default: App } = await import('@/App')
  mounted = render(<App />)
  return mounted
}

async function signInAsDemo(role: (typeof ROLES)[number] = 'Donor') {
  await loadApp('/login')
  await userEvent.click(await screen.findByText(`Demo ${role}`))
  await screen.findByRole('heading', { level: 1, name: GREETING }, { timeout: 5000 })
}

let prefersDark = false
beforeEach(() => {
  localStorage.clear()
  document.documentElement.className = ''
  prefersDark = false
  window.matchMedia = ((q: string) => ({
    matches: q.includes('dark') && prefersDark,
    media: q,
    addEventListener() {},
    removeEventListener() {},
  })) as unknown as typeof window.matchMedia
  Object.values(toast).forEach((f) => f.mockReset())
})
afterEach(() => {
  mounted = null // the global cleanup unmounts it
  document.documentElement.className = ''
})

describe('appearance', () => {
  it('switches theme, applies it to the page and persists it across a reload', async () => {
    await signInAsDemo()
    go('/settings/appearance')
    const group = await screen.findByRole('radiogroup', { name: 'Theme' })
    expect(within(group).getByRole('radio', { name: /System/ })).toHaveAttribute('aria-checked', 'true')

    await userEvent.click(within(group).getByRole('radio', { name: /Dark/ }))
    expect(document.documentElement).toHaveClass('dark')
    expect(localStorage.getItem('fb.theme')).toBe('dark')
    expect(screen.getByText(/stored only|Saved on this device/)).toBeInTheDocument()

    document.documentElement.className = '' // a fresh page starts unstyled
    await loadApp('/settings/appearance')
    expect(await screen.findByRole('radio', { name: /Dark/ }, { timeout: 5000 })).toHaveAttribute('aria-checked', 'true')
    expect(document.documentElement).toHaveClass('dark')

    await userEvent.click(screen.getByRole('radio', { name: /Light/ }))
    expect(document.documentElement).not.toHaveClass('dark')
    expect(localStorage.getItem('fb.theme')).toBe('light')
  })

  it('follows the device setting on System', async () => {
    prefersDark = true
    await signInAsDemo()
    expect(document.documentElement).toHaveClass('dark')
    expect(localStorage.getItem('fb.theme')).toBeNull()
  })

  it('offers a quick theme switch in the header', async () => {
    await signInAsDemo()
    await userEvent.click(screen.getByRole('button', { name: /^Theme:/ }))
    await userEvent.click(await screen.findByRole('menuitemradio', { name: /Dark/ }))
    expect(document.documentElement).toHaveClass('dark')
    expect(localStorage.getItem('fb.theme')).toBe('dark')
  })

  it('lets signed-out visitors toggle the theme too', async () => {
    await loadApp('/login')
    await userEvent.click((await screen.findAllByRole('button', { name: 'Switch to dark theme' }))[0])
    expect(document.documentElement).toHaveClass('dark')
    expect(localStorage.getItem('fb.theme')).toBe('dark')
  })
})

describe('display name editing (offline)', () => {
  it('validates, saves locally, updates the greeting and survives a reload', async () => {
    await signInAsDemo('Receiver')
    go('/settings/profile')
    const name = await screen.findByLabelText(/Display name/)
    expect(name).toHaveValue('Demo Receiver — NGO Coordinator')
    expect(screen.getByText('Saved locally in this browser')).toBeInTheDocument()

    await userEvent.clear(name)
    await userEvent.type(name, 'P')
    await userEvent.tab()
    expect(await screen.findByText('Enter at least 2 characters')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(toast.success).not.toHaveBeenCalled()

    await userEvent.clear(name)
    await userEvent.type(name, 'Priya Sharma')
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Saved in this browser (offline demo)'))
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Account menu' })).toHaveTextContent('Priya Sharma')

    await loadApp('/dashboard')
    expect(await screen.findByRole('heading', { level: 1, name: /, Priya$/ }, { timeout: 5000 })).toBeInTheDocument()
  })

  it('rejects markup characters in names', async () => {
    await signInAsDemo()
    go('/settings/profile')
    const name = await screen.findByLabelText(/Display name/)
    await userEvent.clear(name)
    await userEvent.type(name, '<b>Admin</b>')
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByText('Names cannot contain < or >')).toBeInTheDocument()
    expect(toast.success).not.toHaveBeenCalled()
  })

  it('cancel discards unsaved edits', async () => {
    await signInAsDemo()
    go('/settings/profile')
    const name = await screen.findByLabelText(/Display name/)
    await userEvent.type(name, ' extra')
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(name).toHaveValue('Demo Donor — Canteen Manager')
  })

  it('the demo reset restores the original name', async () => {
    await signInAsDemo()
    go('/settings/profile')
    const name = await screen.findByLabelText(/Display name/)
    await userEvent.clear(name)
    await userEvent.type(name, 'Renamed Person')
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(toast.success).toHaveBeenCalled())

    // What the banner's "Reset demo data" button does before reloading the page.
    mounted?.unmount()
    mounted = null
    const { resetOfflineDemo } = await import('@/lib/api.offline')
    resetOfflineDemo()
    await loadApp('/settings/profile')
    expect(await screen.findByLabelText(/Display name/, {}, { timeout: 5000 })).toHaveValue('Demo Donor — Canteen Manager')
  })
})

describe('account settings (offline)', () => {
  it('redirects /settings to the profile section', async () => {
    await signInAsDemo()
    go('/settings')
    await waitFor(() => expect(window.location.pathname).toBe('/settings/profile'))
  })

  it('validates the password form but never pretends to change the password', async () => {
    await signInAsDemo()
    go('/settings/security')
    expect(await screen.findByText('Needs Supabase')).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('New password'), 'short')
    await userEvent.tab()
    expect(await screen.findByText('Use at least 8 characters')).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('Confirm new password'), 'different')
    await userEvent.tab()
    expect(await screen.findByText('Passwords do not match')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Update password/ })).toBeDisabled()
    expect(toast.success).not.toHaveBeenCalled()
  })

  it('removes a locally stored avatar and rejects non-image files', async () => {
    await signInAsDemo()
    const { writeAvatar } = await import('@/lib/preferences')
    act(() => void writeAvatar('user-donor', 'data:image/jpeg;base64,AAAA'))
    go('/settings/profile')
    expect(await screen.findByText('Stored only on this device')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Remove/ }))
    expect(localStorage.getItem('fb.avatar.user-donor')).toBeNull()
    expect(screen.getByRole('button', { name: /Upload picture/ })).toBeInTheDocument()

    const input = screen.getByLabelText('Upload profile picture')
    await userEvent.upload(input, new File(['hello'], 'notes.txt', { type: 'text/plain' }), { applyAccept: false })
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Choose a PNG, JPEG, WebP or GIF image.'))
    expect(localStorage.getItem('fb.avatar.user-donor')).toBeNull()
  })

  it('explains that password reset needs Supabase and sends nothing', async () => {
    await loadApp('/login')
    await userEvent.click(await screen.findByRole('link', { name: 'Forgot password?' }))
    expect(await screen.findByText('Password reset needs Supabase')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Send reset link' })).toBeDisabled()
    expect(screen.queryByText('Check your inbox')).not.toBeInTheDocument()

    go('/reset-password')
    expect(await screen.findByText(/no reset link to\s+complete/)).toBeInTheDocument()
  })

  it('shows help with the offline connection status', async () => {
    await signInAsDemo('Volunteer')
    go('/help')
    expect(await screen.findByRole('heading', { name: 'Help & about' })).toBeInTheDocument()
    expect(screen.getByText('Offline demo mode.')).toBeInTheDocument()
    expect(screen.getByText('You')).toBeInTheDocument() // the volunteer's own role card
  })
})

describe('navigation for every role', () => {
  for (const role of ROLES) {
    it(`gives the demo ${role} the account links and sign-out`, async () => {
      await signInAsDemo(role)
      const sidebar = screen.getAllByRole('navigation', { name: 'Main' })[0]
      for (const label of ['Dashboard', 'Notifications', 'My Profile', 'Account Settings', 'Appearance', 'Help & About'])
        expect(within(sidebar).getByRole('link', { name: new RegExp(label) })).toBeInTheDocument()
      expect(within(sidebar).getByRole('link', { name: /Dashboard/ })).toHaveAttribute('aria-current', 'page')

      await userEvent.click(screen.getByRole('button', { name: 'Account menu' }))
      const menu = await screen.findByRole('menu')
      for (const label of ['Dashboard', 'My profile', 'Account settings', 'Appearance', 'Notifications', 'Help & about', 'Sign out'])
        expect(within(menu).getByRole('menuitem', { name: new RegExp(label) })).toBeInTheDocument()

      await userEvent.click(within(menu).getByRole('menuitem', { name: /Appearance/ }))
      expect(await screen.findByRole('radiogroup', { name: 'Theme' })).toBeInTheDocument()
      expect(within(sidebar).getByRole('link', { name: /Appearance/ })).toHaveAttribute('aria-current', 'page')
      expect(within(sidebar).getByRole('link', { name: /Account Settings/ })).not.toHaveAttribute('aria-current')
    })
  }

  it('signs out from the sidebar', async () => {
    await signInAsDemo()
    await userEvent.click(screen.getAllByRole('button', { name: 'Sign out' })[0])
    await waitFor(() => expect(localStorage.getItem('fb.offline.user')).toBeNull())
    expect(toast.success).toHaveBeenCalledWith('Signed out')
  })
})
