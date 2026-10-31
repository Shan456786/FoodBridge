/**
 * Auth behaviour when Supabase IS configured, against a mocked Supabase client:
 * sign-in errors, registration (validation, duplicates, confirmation), session
 * restore and sign-out. Real connectivity is covered by tests/db (needs a project).
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { authErrorMessage } from '@/lib/authErrors'

const h = vi.hoisted(() => ({
  toast: { error: vi.fn(), success: vi.fn() },
  auth: {
    signInWithPassword: vi.fn(),
    signUp: vi.fn(),
    signOut: vi.fn(),
    getSession: vi.fn(),
    onAuthStateChange: vi.fn(),
  },
  api: { fetchProfile: vi.fn(), fetchOrganization: vi.fn() },
}))
vi.mock('sonner', () => ({ toast: h.toast, Toaster: () => null }))
vi.mock('@/lib/supabase', () => ({ isSupabaseConfigured: true, serverKeyRejected: false, supabase: { auth: h.auth } }))
vi.mock('@/lib/api', () => ({ OFFLINE_DEMO: false, ...h.api }))

const { default: LoginPage } = await import('@/pages/LoginPage')
const { default: SignupPage } = await import('@/pages/SignupPage')
const { AuthProvider, useAuth } = await import('@/context/AuthContext')
const { RequireAuth } = await import('@/components/layout/Guards')

beforeEach(() => {
  for (const group of [h.toast, h.auth, h.api]) Object.values(group).forEach((f) => f.mockReset())
  h.auth.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } })
})

describe('authErrorMessage', () => {
  it.each([
    [{ message: 'Invalid login credentials', code: 'invalid_credentials' }, 'Incorrect email or password.'],
    [{ message: 'User already registered', code: 'user_already_exists' }, 'An account with this email already exists. Try signing in instead.'],
    [{ message: 'Email not confirmed' }, /confirm your email/],
    [new TypeError('Failed to fetch'), /Can't reach the FoodBridge server/],
    [{ name: 'AuthRetryableFetchError', message: '{}' }, /Can't reach the FoodBridge server/],
    [{ message: 'Signups not allowed for this instance' }, /sign-ups are currently disabled/],
    [{ message: 'Password should be at least 6 characters', code: 'weak_password' }, /too weak/],
    [{ message: 'Request rate limit reached', status: 429 }, /Too many attempts/],
  ])('maps %o', (err, expected) => {
    expect(authErrorMessage(err)).toMatch(expected)
  })
})

describe('sign-in (Supabase configured)', () => {
  const renderLogin = () => render(<MemoryRouter><LoginPage /></MemoryRouter>)
  async function submit(email: string, password: string) {
    await userEvent.type(screen.getByLabelText('Email'), email)
    await userEvent.type(screen.getByLabelText('Password'), password)
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
  }

  it('does not show the offline notice', () => {
    renderLogin()
    expect(screen.queryByText(/Offline demo mode/)).not.toBeInTheDocument()
  })

  it('signs in with trimmed credentials', async () => {
    h.auth.signInWithPassword.mockResolvedValue({ error: null })
    renderLogin()
    await submit('  user@example.com ', 'correct-horse')
    expect(h.auth.signInWithPassword).toHaveBeenCalledWith({ email: 'user@example.com', password: 'correct-horse' })
    expect(h.toast.success).toHaveBeenCalledWith('Welcome back')
  })

  it('reports an incorrect password', async () => {
    h.auth.signInWithPassword.mockResolvedValue({ error: { message: 'Invalid login credentials', code: 'invalid_credentials' } })
    renderLogin()
    await submit('user@example.com', 'wrong')
    await waitFor(() => expect(h.toast.error).toHaveBeenCalledWith('Incorrect email or password.'))
    expect(h.toast.success).not.toHaveBeenCalled()
  })

  it('reports network failures instead of crashing', async () => {
    h.auth.signInWithPassword.mockRejectedValue(new TypeError('Failed to fetch'))
    renderLogin()
    await submit('user@example.com', 'whatever')
    await waitFor(() => expect(h.toast.error).toHaveBeenCalledWith(expect.stringMatching(/Can't reach/)))
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled()
  })
})

describe('registration (Supabase configured)', () => {
  const renderSignup = (path = '/signup') =>
    render(
      <MemoryRouter initialEntries={[path]}>
        <SignupPage />
      </MemoryRouter>,
    )
  async function fillVolunteer(email = 'new@example.com') {
    renderSignup('/signup?role=volunteer')
    await userEvent.type(screen.getByLabelText(/Full name/), 'Asha Rao')
    await userEvent.type(screen.getByLabelText(/^Email/), email)
    await userEvent.type(screen.getByLabelText(/^Password/), 'long-enough-pw')
    await userEvent.click(screen.getByRole('checkbox'))
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }))
  }

  it('offers donor, receiver and volunteer roles but never admin', () => {
    renderSignup()
    expect(screen.getAllByRole('radio').map((r) => (r as HTMLInputElement).value)).toEqual(['donor', 'receiver', 'volunteer'])
  })

  it('validates required fields before calling Supabase', async () => {
    renderSignup()
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }))
    expect(await screen.findByText('Enter your name')).toBeInTheDocument()
    expect(screen.getByText('Enter a valid email address')).toBeInTheDocument()
    expect(screen.getByText('Use at least 8 characters')).toBeInTheDocument()
    expect(screen.getByText('Enter your organization name')).toBeInTheDocument()
    expect(screen.getByText('Please accept the food-safety responsibility statement')).toBeInTheDocument()
    expect(h.auth.signUp).not.toHaveBeenCalled()
  })

  it('registers a donor with organization details in the signup metadata', async () => {
    h.auth.signUp.mockResolvedValue({ data: { user: { identities: [{}] }, session: { user: {} } }, error: null })
    renderSignup('/signup?role=donor')
    await userEvent.type(screen.getByLabelText(/Full name/), 'Ravi Kumar')
    await userEvent.type(screen.getByLabelText(/^Email/), 'Ravi@Example.com')
    await userEvent.type(screen.getByLabelText(/^Password/), 'long-enough-pw')
    await userEvent.type(screen.getByLabelText(/Organization name/), 'Hostel Mess')
    await userEvent.selectOptions(screen.getByLabelText(/^Type/), 'canteen')
    await userEvent.type(screen.getByLabelText(/^Address/), 'Block A, Campus Road')
    await userEvent.type(screen.getByLabelText('Latitude'), '16.49')
    await userEvent.type(screen.getByLabelText('Longitude'), '80.5')
    await userEvent.click(screen.getByRole('checkbox'))
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }))

    await waitFor(() => expect(h.auth.signUp).toHaveBeenCalledTimes(1))
    const arg = h.auth.signUp.mock.calls[0][0]
    expect(arg.email).toBe('ravi@example.com')
    expect(arg.options.data).toMatchObject({ role: 'donor', full_name: 'Ravi Kumar', org_name: 'Hostel Mess', org_type: 'canteen', latitude: 16.49, longitude: 80.5 })
    expect(h.toast.success).toHaveBeenCalledWith('Account created — welcome to FoodBridge!')
  })

  it('shows the confirm-email screen when Supabase requires confirmation', async () => {
    h.auth.signUp.mockResolvedValue({ data: { user: { identities: [{}] }, session: null }, error: null })
    await fillVolunteer()
    expect(await screen.findByRole('heading', { name: 'Confirm your email' })).toBeInTheDocument()
    expect(screen.getByText('new@example.com')).toBeInTheDocument()
  })

  it('rejects a duplicate email (confirmation on: empty identities)', async () => {
    h.auth.signUp.mockResolvedValue({ data: { user: { identities: [] }, session: null }, error: null })
    await fillVolunteer('taken@example.com')
    await waitFor(() => expect(h.toast.error).toHaveBeenCalledWith(expect.stringMatching(/already exists/)))
    expect(screen.queryByRole('heading', { name: 'Confirm your email' })).not.toBeInTheDocument()
  })

  it('rejects a duplicate email (confirmation off: error)', async () => {
    h.auth.signUp.mockResolvedValue({ data: { user: null, session: null }, error: { message: 'User already registered', code: 'user_already_exists' } })
    await fillVolunteer('taken@example.com')
    await waitFor(() => expect(h.toast.error).toHaveBeenCalledWith(expect.stringMatching(/already exists/)))
  })

  it('reports network failures during registration', async () => {
    h.auth.signUp.mockRejectedValue(new TypeError('Failed to fetch'))
    await fillVolunteer()
    await waitFor(() => expect(h.toast.error).toHaveBeenCalledWith(expect.stringMatching(/Can't reach/)))
  })
})

describe('session handling (Supabase configured)', () => {
  const session = { user: { id: 'u1', email: 'u1@example.com' } }
  function Probe() {
    const { profile, signOut } = useAuth()
    return (
      <div>
        <p>role: {profile?.role}</p>
        <button onClick={() => void signOut()}>out</button>
      </div>
    )
  }
  const renderApp = () =>
    render(
      <MemoryRouter initialEntries={['/private']}>
        <AuthProvider>
          <Routes>
            <Route element={<RequireAuth />}>
              <Route path="/private" element={<Probe />} />
            </Route>
            <Route path="/login" element={<p>login screen</p>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    )

  it('restores a persisted session on load and loads the profile', async () => {
    h.auth.getSession.mockResolvedValue({ data: { session } })
    h.api.fetchProfile.mockResolvedValue({ id: 'u1', role: 'receiver', organization_id: 'o1' })
    h.api.fetchOrganization.mockResolvedValue({ id: 'o1', name: 'Org' })
    renderApp()
    expect(await screen.findByText('role: receiver')).toBeInTheDocument()
    expect(h.api.fetchProfile).toHaveBeenCalledWith('u1')
  })

  it('signs out through Supabase', async () => {
    h.auth.getSession.mockResolvedValue({ data: { session } })
    h.api.fetchProfile.mockResolvedValue({ id: 'u1', role: 'volunteer', organization_id: null })
    h.auth.signOut.mockResolvedValue({ error: null })
    renderApp()
    await userEvent.click(await screen.findByRole('button', { name: 'out' }))
    expect(h.auth.signOut).toHaveBeenCalled()
  })

  it('sends visitors to sign-in when there is no session', async () => {
    h.auth.getSession.mockResolvedValue({ data: { session: null } })
    renderApp()
    expect(await screen.findByText('login screen')).toBeInTheDocument()
  })

  it('does not hang on the spinner if restoring the session fails', async () => {
    h.auth.getSession.mockRejectedValue(new Error('storage unavailable'))
    renderApp()
    expect(await screen.findByText('login screen')).toBeInTheDocument()
  })

  it('distinguishes a profile load failure from a missing profile', async () => {
    h.auth.getSession.mockResolvedValue({ data: { session } })
    h.api.fetchProfile.mockRejectedValue(new Error('Network error — check your connection and try again.'))
    renderApp()
    expect(await screen.findByText(/loading your profile failed: Network error/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument()
  })
})
