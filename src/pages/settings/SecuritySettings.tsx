import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { KeyRound, Loader2, LogOut, UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Field } from '@/components/common/Field'
import { Notice } from '@/components/common/Notice'
import { PasswordStrength } from '@/components/common/PasswordStrength'
import { useAuth } from '@/context/AuthContext'
import { OFFLINE_DEMO } from '@/lib/api'
import { authErrorMessage } from '@/lib/authErrors'
import { newPasswordSchema } from '@/lib/password'
import { supabase } from '@/lib/supabase'

// eslint-disable-next-line react-refresh/only-export-components
export const changePasswordSchema = z
  .object({
    current: z.string().min(1, 'Enter your current password'),
    password: newPasswordSchema,
    confirm: z.string().min(1, 'Confirm your new password'),
  })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'Passwords do not match' })
  .refine((v) => v.password !== v.current, { path: ['password'], message: 'Choose a password different from your current one' })
type Values = z.infer<typeof changePasswordSchema>

function ChangePasswordCard() {
  const { profile, session } = useAuth()
  const form = useForm<Values>({ resolver: zodResolver(changePasswordSchema), mode: 'onTouched' })
  const newPassword = useWatch({ control: form.control, name: 'password' })
  const { errors, isSubmitting } = form.formState
  // Offline accounts are simulated; live demo accounts share a published password.
  const blocked = OFFLINE_DEMO ? 'offline' : profile?.is_demo ? 'demo' : null

  return (
    <Card>
      <form
        noValidate
        onSubmit={form.handleSubmit(async (v) => {
          if (blocked || !session?.user.email) return
          try {
            // Confirm the current password before changing it.
            const check = await supabase.auth.signInWithPassword({ email: session.user.email, password: v.current })
            if (check.error) {
              if (/invalid login credentials/i.test(check.error.message))
                form.setError('current', { message: 'Your current password is incorrect' })
              else toast.error(authErrorMessage(check.error))
              return
            }
            const { error } = await supabase.auth.updateUser({ password: v.password })
            if (error) return void toast.error(authErrorMessage(error))
            form.reset({ current: '', password: '', confirm: '' })
            toast.success('Password changed. Use your new password next time you sign in.')
          } catch (e) {
            toast.error(authErrorMessage(e))
          }
        })}
      >
        <CardHeader>
          <CardTitle>Change password</CardTitle>
          <CardDescription>Use at least 8 characters. A longer passphrase is stronger than a short complex one.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pb-4">
          {blocked === 'offline' && (
            <Notice tone="offline" title="Needs Supabase">
              Offline demo accounts are simulated and have no real password to change. You can try the form, but nothing will
              be submitted. Password changes work once FoodBridge is connected to Supabase.
            </Notice>
          )}
          {blocked === 'demo' && (
            <Notice tone="warning" title="Shared demo account">
              Demo accounts use a published shared password, so it can't be changed. Create your own account to set a password.
            </Notice>
          )}
          <Field label="Current password" htmlFor="current" error={errors.current?.message}>
            <Input id="current" type="password" autoComplete="current-password" aria-invalid={!!errors.current} {...form.register('current')} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="New password" htmlFor="new-password" error={errors.password?.message}>
              <Input id="new-password" type="password" autoComplete="new-password" aria-invalid={!!errors.password} {...form.register('password')} />
            </Field>
            <Field label="Confirm new password" htmlFor="confirm-password" error={errors.confirm?.message}>
              <Input id="confirm-password" type="password" autoComplete="new-password" aria-invalid={!!errors.confirm} {...form.register('confirm')} />
            </Field>
          </div>
          <PasswordStrength value={newPassword ?? ''} />
        </CardContent>
        <CardFooter className="flex-wrap justify-between gap-2">
          <Link to="/forgot-password" className="text-sm font-medium text-brand hover:underline">
            Forgot your current password?
          </Link>
          <Button type="submit" disabled={!!blocked || isSubmitting} title={blocked ? 'Unavailable for this account' : undefined}>
            {isSubmitting ? <Loader2 className="animate-spin" /> : <KeyRound />} Update password
          </Button>
        </CardFooter>
      </form>
    </Card>
  )
}

function SessionsCard() {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const [busy, setBusy] = useState<'local' | 'global' | null>(null)
  const canSignOutEverywhere = !OFFLINE_DEMO && !profile?.is_demo

  async function run(scope: 'local' | 'global') {
    setBusy(scope)
    try {
      if (scope === 'global') {
        const { error } = await supabase.auth.signOut({ scope: 'global' })
        if (error) return void toast.error(authErrorMessage(error))
      } else await signOut()
      toast.success(scope === 'global' ? 'Signed out on all devices' : 'Signed out')
      navigate('/')
    } catch (e) {
      toast.error(authErrorMessage(e))
    } finally {
      setBusy(null)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sessions</CardTitle>
        <CardDescription>
          {canSignOutEverywhere
            ? 'Sign out here, or everywhere this account is signed in (e.g. a shared or lost device).'
            : 'Sign out of FoodBridge on this device.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={busy !== null} onClick={() => run('local')}>
          {busy === 'local' ? <Loader2 className="animate-spin" /> : <LogOut />} Sign out
        </Button>
        {canSignOutEverywhere && (
          <Button variant="outline" className="text-destructive hover:text-destructive" disabled={busy !== null} onClick={() => run('global')}>
            {busy === 'global' ? <Loader2 className="animate-spin" /> : <LogOut />} Sign out everywhere
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

function NewAccountCard() {
  const { signOut } = useAuth()
  const navigate = useNavigate()
  return (
    <Card>
      <CardHeader>
        <CardTitle>Create another account</CardTitle>
        <CardDescription>
          Each account has one role. To join as a different role or for another organization, sign out and register a new
          account.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {OFFLINE_DEMO && (
          <Notice tone="offline">Registration needs Supabase. In offline demo mode the sign-up page explains how to connect it.</Notice>
        )}
        <Button
          variant="outline"
          onClick={async () => {
            await signOut()
            navigate('/signup')
          }}
        >
          <UserPlus /> Sign out and create account
        </Button>
      </CardContent>
    </Card>
  )
}

export default function SecuritySettings() {
  return (
    <>
      <ChangePasswordCard />
      <SessionsCard />
      <NewAccountCard />
    </>
  )
}
