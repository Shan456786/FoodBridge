import { Link, useNavigate } from 'react-router-dom'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { KeyRound, Loader2, LinkIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field } from '@/components/common/Field'
import { Notice } from '@/components/common/Notice'
import { PasswordStrength } from '@/components/common/PasswordStrength'
import { FullPageSpinner } from '@/components/layout/Guards'
import { useAuth } from '@/context/AuthContext'
import { OFFLINE_DEMO } from '@/lib/api'
import { authErrorMessage } from '@/lib/authErrors'
import { newPasswordSchema } from '@/lib/password'
import { supabase } from '@/lib/supabase'
import { AuthCard } from '@/components/common/AuthCard'

const schema = z
  .object({ password: newPasswordSchema, confirm: z.string().min(1, 'Confirm your new password') })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'Passwords do not match' })

/** Landing page for the link in a Supabase password-reset email. */
export default function ResetPasswordPage() {
  const { session, loading, passwordRecovery } = useAuth()
  const navigate = useNavigate()
  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), mode: 'onTouched' })
  const newPassword = useWatch({ control: form.control, name: 'password' })
  const { errors, isSubmitting } = form.formState

  if (loading) return <FullPageSpinner />

  if (OFFLINE_DEMO) {
    return (
      <AuthCard>
        <h1 className="text-xl font-semibold">Reset password</h1>
        <Notice tone="offline" title="Needs Supabase" className="mt-4">
          Password reset links are issued by Supabase Auth. This app is in offline demo mode, so there is no reset link to
          complete and no password to change.
        </Notice>
        <Button asChild className="mt-6 w-full">
          <Link to="/login">Go to sign in</Link>
        </Button>
      </AuthCard>
    )
  }

  // Only a session created by the email link may set a password without the current one.
  if (!session || !passwordRecovery) {
    return (
      <AuthCard>
        <div className="flex size-11 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
          <LinkIcon className="size-5" />
        </div>
        <h1 className="mt-4 text-xl font-semibold">This reset link isn't active</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {session
            ? "You're signed in normally. To change your password, use Account settings → Password & security."
            : 'The link is invalid, has already been used, or has expired. Request a new one to continue.'}
        </p>
        <Button asChild className="mt-6 w-full">
          {session ? <Link to="/settings/security">Open security settings</Link> : <Link to="/forgot-password">Request a new link</Link>}
        </Button>
      </AuthCard>
    )
  }

  return (
    <AuthCard>
      <div className="flex size-11 items-center justify-center rounded-xl bg-forest-50 text-brand">
        <KeyRound className="size-5" />
      </div>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">Choose a new password</h1>
      <p className="mt-1 text-sm text-muted-foreground">For {session.user.email}</p>
      <form
        noValidate
        className="mt-6 space-y-4"
        onSubmit={form.handleSubmit(async ({ password }) => {
          try {
            const { error } = await supabase.auth.updateUser({ password })
            if (error) return void toast.error(authErrorMessage(error))
            toast.success('Password changed. You are signed in.')
            navigate('/dashboard', { replace: true })
          } catch (e) {
            toast.error(authErrorMessage(e))
          }
        })}
      >
        <Field label="New password" htmlFor="new-password" error={errors.password?.message}>
          <Input id="new-password" type="password" autoComplete="new-password" className="h-10" aria-invalid={!!errors.password} {...form.register('password')} />
        </Field>
        <PasswordStrength value={newPassword ?? ''} />
        <Field label="Confirm new password" htmlFor="confirm-password" error={errors.confirm?.message}>
          <Input id="confirm-password" type="password" autoComplete="new-password" className="h-10" aria-invalid={!!errors.confirm} {...form.register('confirm')} />
        </Field>
        <Button type="submit" className="h-10 w-full" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="animate-spin" />} Update password
        </Button>
      </form>
    </AuthCard>
  )
}
