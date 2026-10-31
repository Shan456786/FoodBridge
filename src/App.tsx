import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Toaster } from 'sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AppLayout } from '@/components/layout/AppLayout'
import { PublicLayout } from '@/components/layout/PublicLayout'
import { FullPageSpinner, RedirectIfAuthed, RequireAuth, RequireRole } from '@/components/layout/Guards'
import { AuthProvider, useAuth } from '@/context/AuthContext'
import { NotificationsProvider } from '@/context/NotificationsContext'
import { ThemeProvider, useTheme } from '@/context/ThemeContext'
import LandingPage from '@/pages/LandingPage'

const HowItWorksPage = lazy(() => import('@/pages/HowItWorksPage'))
const ExplorePage = lazy(() => import('@/pages/ExplorePage'))
const LoginPage = lazy(() => import('@/pages/LoginPage'))
const SignupPage = lazy(() => import('@/pages/SignupPage'))
const DashboardPage = lazy(() => import('@/pages/DashboardPage'))
const MyListingsPage = lazy(() => import('@/pages/MyListingsPage'))
const ListingFormPage = lazy(() => import('@/pages/ListingFormPage'))
const ListingDetailPage = lazy(() => import('@/pages/ListingDetailPage'))
const MatchesPage = lazy(() => import('@/pages/MatchesPage'))
const RequestsPage = lazy(() => import('@/pages/RequestsPage'))
const PickupsPage = lazy(() => import('@/pages/PickupsPage'))
const NotificationsPage = lazy(() => import('@/pages/NotificationsPage'))
const ImpactPage = lazy(() => import('@/pages/ImpactPage'))
const ProfilePage = lazy(() => import('@/pages/ProfilePage'))
const SettingsPage = lazy(() => import('@/pages/SettingsPage'))
const ProfileSettings = lazy(() => import('@/pages/settings/ProfileSettings'))
const SecuritySettings = lazy(() => import('@/pages/settings/SecuritySettings'))
const AppearanceSettings = lazy(() => import('@/pages/settings/AppearanceSettings'))
const NotificationSettings = lazy(() => import('@/pages/settings/NotificationSettings'))
const ForgotPasswordPage = lazy(() => import('@/pages/ForgotPasswordPage'))
const ResetPasswordPage = lazy(() => import('@/pages/ResetPasswordPage'))
const HelpPage = lazy(() => import('@/pages/HelpPage'))
const AdminPage = lazy(() => import('@/pages/AdminPage'))
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage'))

/** /explore is public, but signed-in users see it inside the app shell. */
function ExploreRoute() {
  const { session, loading } = useAuth()
  if (loading) return <FullPageSpinner />
  return session ? <Navigate to="/app/explore" replace /> : <ExplorePage />
}

function AppRoutes() {
  return (
    <Suspense fallback={<FullPageSpinner />}>
      <Routes>
        <Route element={<PublicLayout />}>
          <Route index element={<LandingPage />} />
          <Route path="how-it-works" element={<HowItWorksPage />} />
          <Route path="explore" element={<ExploreRoute />} />
          <Route path="login" element={<RedirectIfAuthed><LoginPage /></RedirectIfAuthed>} />
          <Route path="signup" element={<RedirectIfAuthed><SignupPage /></RedirectIfAuthed>} />
          <Route path="forgot-password" element={<ForgotPasswordPage />} />
          <Route path="reset-password" element={<ResetPasswordPage />} />
        </Route>

        <Route element={<RequireAuth />}>
          <Route element={<NotificationsProvider><AppLayout /></NotificationsProvider>}>
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="app/explore" element={<ExplorePage />} />
            <Route path="listings/:id" element={<ListingDetailPage />} />
            <Route element={<RequireRole roles={['donor']} />}>
              <Route path="listings" element={<MyListingsPage />} />
              <Route path="listings/new" element={<ListingFormPage />} />
              <Route path="listings/:id/edit" element={<ListingFormPage />} />
            </Route>
            <Route element={<RequireRole roles={['donor', 'receiver']} />}>
              <Route path="matches" element={<MatchesPage />} />
              <Route path="requests" element={<RequestsPage />} />
            </Route>
            <Route element={<RequireRole roles={['donor', 'receiver', 'volunteer']} />}>
              <Route path="pickups" element={<PickupsPage />} />
            </Route>
            <Route path="notifications" element={<NotificationsPage />} />
            <Route path="impact" element={<ImpactPage />} />
            <Route path="profile" element={<ProfilePage />} />
            <Route path="settings" element={<SettingsPage />}>
              <Route index element={<Navigate to="profile" replace />} />
              <Route path="profile" element={<ProfileSettings />} />
              <Route path="security" element={<SecuritySettings />} />
              <Route path="appearance" element={<AppearanceSettings />} />
              <Route path="notifications" element={<NotificationSettings />} />
              <Route path="*" element={<Navigate to="/settings/profile" replace />} />
            </Route>
            <Route path="help" element={<HelpPage />} />
            <Route element={<RequireRole roles={['admin']} />}>
              <Route path="admin" element={<AdminPage />} />
            </Route>
          </Route>
        </Route>

        <Route element={<PublicLayout />}>
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </Suspense>
  )
}

function ThemedToaster() {
  const { resolved } = useTheme()
  return (
    <Toaster
      theme={resolved}
      richColors
      closeButton
      position="top-right"
      toastOptions={{ className: 'font-sans', style: { borderRadius: 'var(--radius-xl)' } }}
    />
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <TooltipProvider delayDuration={200}>
            <AppRoutes />
            <ThemedToaster />
          </TooltipProvider>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  )
}
