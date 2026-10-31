import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { CountdownBadge } from '@/components/common/StatusBadge'

const signInWithPassword = vi.fn()
vi.mock('@/lib/supabase', () => ({
  isSupabaseConfigured: true,
  supabase: { auth: { signInWithPassword: (...a: unknown[]) => signInWithPassword(...a) } },
}))

const authState = { session: null as unknown, loading: false, profile: null as unknown }
vi.mock('@/context/AuthContext', () => ({ useAuth: () => authState }))

describe('CountdownBadge', () => {
  const now = Date.parse('2026-10-27T10:00:00Z')
  it('shows remaining time with urgency colouring', () => {
    render(<CountdownBadge deadline={new Date(now + 155 * 60000).toISOString()} now={now} />)
    const el = screen.getByText('2h 35m remaining')
    expect(el.className).toMatch(/amber/)
  })
  it('shows urgent red under an hour and Expired after the deadline', () => {
    const { rerender } = render(<CountdownBadge deadline={new Date(now + 45 * 60000).toISOString()} now={now} />)
    expect(screen.getByText('45m remaining').className).toMatch(/red/)
    rerender(<CountdownBadge deadline={new Date(now - 60000).toISOString()} now={now} />)
    expect(screen.getByText('Expired').className).toMatch(/slate/)
  })
})

describe('LoginPage', () => {
  beforeEach(() => signInWithPassword.mockReset())

  it('validates input before calling Supabase', async () => {
    const { default: LoginPage } = await import('@/pages/LoginPage')
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByText('Enter a valid email address')).toBeInTheDocument()
    expect(screen.getByText('Enter your password')).toBeInTheDocument()
    expect(signInWithPassword).not.toHaveBeenCalled()
  })

  it('signs in with valid credentials', async () => {
    signInWithPassword.mockResolvedValue({ error: null })
    const { default: LoginPage } = await import('@/pages/LoginPage')
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    )
    await userEvent.type(screen.getByLabelText('Email'), 'a@b.co')
    await userEvent.type(screen.getByLabelText('Password'), 'secret123')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(signInWithPassword).toHaveBeenCalledWith({ email: 'a@b.co', password: 'secret123' })
  })

  it('offers one-click demo sign-in for every role', async () => {
    const { default: LoginPage } = await import('@/pages/LoginPage')
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    )
    for (const r of ['Donor', 'Receiver', 'Volunteer', 'Admin']) expect(screen.getByText(`Demo ${r}`)).toBeInTheDocument()
  })
})

describe('protected routes', () => {
  it('redirects signed-out users to /login', async () => {
    const { RequireAuth } = await import('@/components/layout/Guards')
    authState.session = null
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route element={<RequireAuth />}>
            <Route path="/dashboard" element={<p>secret dashboard</p>} />
          </Route>
          <Route path="/login" element={<p>login screen</p>} />
        </Routes>
      </MemoryRouter>,
    )
    expect(screen.getByText('login screen')).toBeInTheDocument()
    expect(screen.queryByText('secret dashboard')).not.toBeInTheDocument()
  })

  it('blocks roles that are not allowed', async () => {
    const { RequireRole } = await import('@/components/layout/Guards')
    authState.profile = { role: 'volunteer' }
    render(
      <MemoryRouter initialEntries={['/admin']}>
        <Routes>
          <Route element={<RequireRole roles={['admin']} />}>
            <Route path="/admin" element={<p>admin console</p>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    )
    expect(screen.getByText("This area isn't available for your role")).toBeInTheDocument()
    expect(screen.queryByText('admin console')).not.toBeInTheDocument()
  })
})
