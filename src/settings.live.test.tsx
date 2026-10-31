/**
 * Account settings when Supabase IS configured, against a mocked client:
 * password change (re-verifies the current password), forgot/reset password,
 * and profile saving. Plus unit tests for the preference and password helpers.
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  toast: { error: vi.fn(), success: vi.fn() },
  auth: { signInWithPassword: vi.fn(), updateUser: vi.fn(), resetPasswordForEmail: vi.fn(), signOut: vi.fn() },
  updateProfile: vi.fn(),
  refresh: vi.fn(),
  state: {} as Record<string, unknown>,
}))
vi.mock('sonner', () => ({ toast: h.toast, Toaster: () => null }))
vi.mock('@/lib/supabase', () => ({ isSupabaseConfigured: true, serverKeyRejected: false, supabase: { auth: h.auth } }))
vi.mock('@/lib/api', () => ({ OFFLINE_DEMO: false, updateProfile: h.updateProfile }))
vi.mock('@/context/AuthContext', () => ({ useAuth: () => h.state }))

const { default: SecuritySettings } = await import('@/pages/settings/SecuritySettings')
const { default: ProfileSettings } = await import('@/pages/settings/ProfileSettings')
const { default: ForgotPasswordPage } = await import('@/pages/ForgotPasswordPage')
const { default: ResetPasswordPage } = await import('@/pages/ResetPasswordPage')
const prefs = await import('@/lib/preferences')
const { passwordStrength } = await import('@/lib/password')

const USER = { id: 'u1', role: 'donor', full_name: 'Ravi Kumar', phone: null, is_demo: false, organization_id: 'o1' }

beforeEach(() => {
  Object.values(h.toast).forEach((f) => f.mockReset())
  Object.values(h.auth).forEach((f) => f.mockReset())
  h.updateProfile.mockReset()
  h.refresh.mockReset().mockResolvedValue(undefined)
  h.state = {
    session: { user: { id: 'u1', email: 'ravi@example.com' } },
    profile: { ...USER },
    organization: { id: 'o1', name: 'Hostel Mess' },
    loading: false,
    passwordRecovery: false,
    refresh: h.refresh,
    signOut: vi.fn(),
  }
})

const at = (path: string, el: React.ReactNode) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path={path} element={el} />
        <Route path="/dashboard" element={<p>dashboard</p>} />
      </Routes>
    </MemoryRouter>,
  )

describe('change password', () => {
  async function fill(current: string, next: string, confirm = next) {
    at('/settings/security', <SecuritySettings />)
    await userEvent.type(screen.getByLabelText('Current password'), current)
    await userEvent.type(screen.getByLabelText('New password'), next)
    await userEvent.type(screen.getByLabelText('Confirm new password'), confirm)
    await userEvent.click(screen.getByRole('button', { name: /Update password/ }))
  }

  it('re-verifies the current password, then updates it', async () => {
    h.auth.signInWithPassword.mockResolvedValue({ error: null })
    h.auth.updateUser.mockResolvedValue({ error: null })
    await fill('old-password-1', 'brand-new-pass-2')
    await waitFor(() => expect(h.auth.updateUser).toHaveBeenCalledWith({ password: 'brand-new-pass-2' }))
    expect(h.auth.signInWithPassword).toHaveBeenCalledWith({ email: 'ravi@example.com', password: 'old-password-1' })
    expect(h.toast.success).toHaveBeenCalledWith(expect.stringMatching(/Password changed/))
    expect(screen.getByLabelText('Current password')).toHaveValue('')
  })

  it('stops when the current password is wrong', async () => {
    h.auth.signInWithPassword.mockResolvedValue({ error: { message: 'Invalid login credentials' } })
    await fill('wrong-current', 'brand-new-pass-2')
    expect(await screen.findByText('Your current password is incorrect')).toBeInTheDocument()
    expect(h.auth.updateUser).not.toHaveBeenCalled()
    expect(h.toast.success).not.toHaveBeenCalled()
  })

  it('requires the new password to differ and to match the confirmation', async () => {
    await fill('same-password', 'same-password', 'same-password')
    expect(await screen.findByText('Choose a password different from your current one')).toBeInTheDocument()
    expect(h.auth.signInWithPassword).not.toHaveBeenCalled()
  })

  it('reports a server rejection without claiming success', async () => {
    h.auth.signInWithPassword.mockResolvedValue({ error: null })
    h.auth.updateUser.mockResolvedValue({ error: { message: 'Password should be at least 6 characters', code: 'weak_password' } })
    await fill('old-password-1', 'brand-new-pass-2')
    await waitFor(() => expect(h.toast.error).toHaveBeenCalledWith(expect.stringMatching(/too weak/)))
    expect(h.toast.success).not.toHaveBeenCalled()
  })

  it('is unavailable for shared demo accounts', () => {
    h.state.profile = { ...USER, is_demo: true }
    at('/settings/security', <SecuritySettings />)
    expect(screen.getByText('Shared demo account')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Update password/ })).toBeDisabled()
    expect(screen.queryByRole('button', { name: /Sign out everywhere/ })).not.toBeInTheDocument()
  })

  it('offers sign-out everywhere for real accounts', async () => {
    h.auth.signOut.mockResolvedValue({ error: null })
    at('/settings/security', <SecuritySettings />)
    await userEvent.click(screen.getByRole('button', { name: /Sign out everywhere/ }))
    expect(h.auth.signOut).toHaveBeenCalledWith({ scope: 'global' })
  })
})

describe('profile settings (Supabase)', () => {
  it('saves the display name to the account', async () => {
    h.updateProfile.mockResolvedValue(undefined)
    at('/settings/profile', <ProfileSettings />)
    const name = screen.getByLabelText(/Display name/)
    await userEvent.clear(name)
    await userEvent.type(name, '  Ravi K  ')
    await userEvent.type(screen.getByLabelText(/Phone/), '+91 98765 43210')
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(h.updateProfile).toHaveBeenCalledWith('u1', { full_name: 'Ravi K', phone: '+91 98765 43210' }))
    expect(h.refresh).toHaveBeenCalled()
    expect(h.toast.success).toHaveBeenCalledWith('Profile saved')
    expect(screen.queryByText('Saved locally in this browser')).not.toBeInTheDocument()
  })

  it('shows the server error when saving fails', async () => {
    h.updateProfile.mockRejectedValue(new Error('Network error — check your connection and try again.'))
    at('/settings/profile', <ProfileSettings />)
    await userEvent.type(screen.getByLabelText(/Display name/), 'x')
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(h.toast.error).toHaveBeenCalledWith(expect.stringMatching(/Network error/)))
    expect(h.toast.success).not.toHaveBeenCalled()
  })
})

describe('forgot password (Supabase)', () => {
  it('requests a reset link and only then confirms', async () => {
    h.auth.resetPasswordForEmail.mockResolvedValue({ error: null })
    at('/forgot-password', <ForgotPasswordPage />)
    await userEvent.type(screen.getByLabelText('Email'), 'Ravi@Example.com')
    await userEvent.click(screen.getByRole('button', { name: 'Send reset link' }))
    expect(await screen.findByRole('heading', { name: 'Check your inbox' })).toBeInTheDocument()
    expect(h.auth.resetPasswordForEmail).toHaveBeenCalledWith('ravi@example.com', { redirectTo: `${window.location.origin}/reset-password` })
  })

  it('does not show the inbox screen when the request fails', async () => {
    h.auth.resetPasswordForEmail.mockResolvedValue({ error: { message: 'Request rate limit reached', status: 429 } })
    at('/forgot-password', <ForgotPasswordPage />)
    await userEvent.type(screen.getByLabelText('Email'), 'ravi@example.com')
    await userEvent.click(screen.getByRole('button', { name: 'Send reset link' }))
    await waitFor(() => expect(h.toast.error).toHaveBeenCalledWith(expect.stringMatching(/Too many attempts/)))
    expect(screen.queryByRole('heading', { name: 'Check your inbox' })).not.toBeInTheDocument()
  })

  it('refuses demo accounts', async () => {
    at('/forgot-password', <ForgotPasswordPage />)
    await userEvent.type(screen.getByLabelText('Email'), 'demo.donor@foodbridge.test')
    await userEvent.click(screen.getByRole('button', { name: 'Send reset link' }))
    expect(await screen.findByText(/cannot be reset/)).toBeInTheDocument()
    expect(h.auth.resetPasswordForEmail).not.toHaveBeenCalled()
  })
})

describe('reset password page (Supabase)', () => {
  it('refuses to change a password without a recovery link', () => {
    h.state.session = null
    at('/reset-password', <ResetPasswordPage />)
    expect(screen.getByRole('heading', { name: "This reset link isn't active" })).toBeInTheDocument()
    expect(screen.queryByLabelText('New password')).not.toBeInTheDocument()
  })

  it('sends signed-in users to security settings instead', () => {
    at('/reset-password', <ResetPasswordPage />)
    expect(screen.getByRole('link', { name: 'Open security settings' })).toHaveAttribute('href', '/settings/security')
  })

  it('sets the new password from a recovery link', async () => {
    h.state.passwordRecovery = true
    h.auth.updateUser.mockResolvedValue({ error: null })
    at('/reset-password', <ResetPasswordPage />)
    await userEvent.type(screen.getByLabelText('New password'), 'fresh-password-9')
    await userEvent.type(screen.getByLabelText('Confirm new password'), 'fresh-password-9')
    await userEvent.click(screen.getByRole('button', { name: 'Update password' }))
    expect(await screen.findByText('dashboard')).toBeInTheDocument()
    expect(h.auth.updateUser).toHaveBeenCalledWith({ password: 'fresh-password-9' })
  })
})

describe('preference helpers', () => {
  beforeEach(() => localStorage.clear())

  it('defaults to System and ignores unknown values', () => {
    expect(prefs.readThemePreference()).toBe('system')
    localStorage.setItem('fb.theme', 'neon')
    expect(prefs.readThemePreference()).toBe('system')
    prefs.writeThemePreference('dark')
    expect(prefs.readThemePreference()).toBe('dark')
  })

  it('survives blocked storage', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    expect(prefs.readThemePreference()).toBe('system')
    expect(prefs.readAvatar('u1')).toBeNull()
    spy.mockRestore()
  })

  it('only returns image data URLs for avatars, per user', () => {
    prefs.writeAvatar('u1', 'data:image/jpeg;base64,AAAA')
    localStorage.setItem('fb.avatar.u2', 'javascript:alert(1)')
    expect(prefs.readAvatar('u1')).toBe('data:image/jpeg;base64,AAAA')
    expect(prefs.readAvatar('u2')).toBeNull()
    expect(prefs.readAvatar(null)).toBeNull()
  })

  it('makes initials from display names', () => {
    expect(prefs.initials('Demo Donor — Canteen Manager')).toBe('DD')
    expect(prefs.initials('Priya')).toBe('PR')
    expect(prefs.initials('asha rao kumar')).toBe('AK')
  })

  it('rates password strength', () => {
    expect(passwordStrength('short').label).toBe('Too short')
    expect(passwordStrength('aaaaaaaa').score).toBe(1)
    expect(passwordStrength('Password123!').score).toBe(1) // common word
    expect(passwordStrength('Correct-Horse-Battery-9').label).toBe('Strong')
  })
})
