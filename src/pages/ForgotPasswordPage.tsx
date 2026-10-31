import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { ArrowLeft, KeyRound, Loader2, MailCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AuthCard } from '@/components/common/AuthCard'
import { Field } from '@/components/common/Field'
import { Notice } from '@/components/common/Notice'
import { OFFLINE_DEMO } from '@/lib/api'
import { authErrorMessage } from '@/lib/authErrors'
import { DEMO_ACCOUNTS } from '@/lib/demo'
import { supabase } from '@/lib/supabase'

const schema = z.object({ email: z.email('Enter a valid email address') })

export default function ForgotPasswordPage() {
  const [requestedFor, setRequestedFor] = useState<string | null>(null)
  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), mode: 'onTouched' })
  const { errors, isSubmitting } = form.formState

  if (requestedFor) {
    return (
      <AuthCard>
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
          <MailCheck className="size-6" />
        </div>
        <h1 className="mt-4 text-center text-xl font-semibold">Check your inbox</h1>
        <p className="mt-2 text-center text-sm text-muted-foreground">
          The reset request was accepted. If an account exists for <strong className="text-foreground">{requestedFor}</strong>,
          it will receive an email with a link to choose a new password. The link expires after a short time.
        </p>
        <p className="mt-3 text-center text-xs text-muted-foreground">Nothing arrived? Check your spam folder or try again in a minute.</p>
        <Button asChild variant="outline" className="mt-6 w-full">
          <Link to="/login">
            <ArrowLeft /> Back to sign in
          </Link>
        </Button>
      </AuthCard>
    )
  }

  return (
    <AuthCard>
      <div className="flex size-11 items-center justify-center rounded-xl bg-forest-50 text-brand">
        <KeyRound className="size-5" />
      </div>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">Forgot your password?</h1>
      <p className="mt-1 text-sm text-muted-foreground">Enter your account email and we'll send you a link to reset it.</p>

      {OFFLINE_DEMO && (
        <Notice tone="offline" title="Password reset needs Supabase" className="mt-5">
          This app is running in offline demo mode, so it cannot send email and has no real accounts to reset. No email will be
          sent from this screen. Demo accounts don't need a reset; use the one-click demo sign-in instead.
        </Notice>
      )}

      <form
        noValidate
        className="mt-6 space-y-4"
        onSubmit={form.handleSubmit(async ({ email }) => {
          if (OFFLINE_DEMO) return
          const normalized = email.trim().toLowerCase()
          if (DEMO_ACCOUNTS.some((a) => a.email === normalized))
            return void form.setError('email', { message: 'Demo accounts use a shared password and cannot be reset.' })
          try {
            const { error } = await supabase.auth.resetPasswordForEmail(normalized, {
              redirectTo: `${window.location.origin}/reset-password`,
            })
            if (error) return void toast.error(authErrorMessage(error))
            setRequestedFor(normalized)
          } catch (e) {
            toast.error(authErrorMessage(e))
          }
        })}
      >
        <Field label="Email" htmlFor="email" error={errors.email?.message}>
          <Input id="email" type="email" autoComplete="email" className="h-10" aria-invalid={!!errors.email} {...form.register('email')} />
        </Field>
        <Button type="submit" className="h-10 w-full" disabled={OFFLINE_DEMO || isSubmitting}>
          {isSubmitting && <Loader2 className="animate-spin" />} Send reset link
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        Remembered it?{' '}
        <Link to="/login" className="font-medium text-brand hover:underline">
          Back to sign in
        </Link>
      </p>
    </AuthCard>
  )
}
