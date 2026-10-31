import { useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { ImageUp, Loader2, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Field } from '@/components/common/Field'
import { Notice } from '@/components/common/Notice'
import { DemoBadge, Pill } from '@/components/common/StatusBadge'
import { UserAvatar, useLocalAvatar } from '@/components/common/UserAvatar'
import { useAuth } from '@/context/AuthContext'
import { OFFLINE_DEMO, updateProfile } from '@/lib/api'
import { ROLE_LABELS } from '@/lib/constants'
import { imageFileToAvatar, writeAvatar } from '@/lib/preferences'

// eslint-disable-next-line react-refresh/only-export-components
export const profileSchema = z.object({
  full_name: z
    .string()
    .trim()
    .min(2, 'Enter at least 2 characters')
    .max(120, 'Use at most 120 characters')
    .refine((v) => !/[<>]/.test(v), 'Names cannot contain < or >'),
  phone: z.string().trim().max(30, 'Use at most 30 characters').regex(/^[+\d\s()-]*$/, 'Digits, spaces and + ( ) - only'),
})
type Values = z.infer<typeof profileSchema>

function AvatarCard() {
  const { profile, session } = useAuth()
  const name = profile?.full_name || session?.user.email || 'You'
  const current = useLocalAvatar(profile?.id)
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  async function onFile(file: File | undefined) {
    if (!file || !profile) return
    setBusy(true)
    try {
      const dataUrl = await imageFileToAvatar(file)
      if (!writeAvatar(profile.id, dataUrl)) throw new Error('This browser blocked saving the picture (storage is full or disabled).')
      toast.success('Profile picture updated on this device')
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ''
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile picture</CardTitle>
        <CardDescription>Shown in the sidebar and account menu.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-4">
          <UserAvatar userId={profile?.id} name={name} size="xl" />
          <div className="flex flex-wrap gap-2">
            <input
              ref={input}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="sr-only"
              id="avatar-file"
              aria-label="Upload profile picture"
              onChange={(e) => void onFile(e.target.files?.[0])}
            />
            <Button variant="outline" disabled={busy} onClick={() => input.current?.click()}>
              {busy ? <Loader2 className="animate-spin" /> : <ImageUp />} {current ? 'Change picture' : 'Upload picture'}
            </Button>
            {current && (
              <Button
                variant="ghost"
                className="text-muted-foreground hover:text-destructive"
                onClick={() => {
                  writeAvatar(profile!.id, null)
                  toast.success('Profile picture removed')
                }}
              >
                <Trash2 /> Remove
              </Button>
            )}
          </div>
        </div>
        <Notice tone="local" title="Stored only on this device">
          Your picture is resized and kept in this browser's local storage. It is not uploaded to FoodBridge, so other
          people won't see it and it won't appear on your other devices. PNG, JPEG, WebP or GIF, up to 5 MB.
        </Notice>
      </CardContent>
    </Card>
  )
}

function DetailsCard() {
  const { profile, session, organization, refresh } = useAuth()
  const form = useForm<Values>({
    resolver: zodResolver(profileSchema),
    mode: 'onTouched',
    defaultValues: { full_name: profile?.full_name ?? '', phone: profile?.phone ?? '' },
  })
  const { errors, isSubmitting, isDirty } = form.formState

  return (
    <Card>
      <form
        noValidate
        onSubmit={form.handleSubmit(async (v) => {
          try {
            await updateProfile(profile!.id, { full_name: v.full_name, phone: v.phone || null })
            await refresh()
            form.reset(v)
            toast.success(OFFLINE_DEMO ? 'Saved in this browser (offline demo)' : 'Profile saved')
          } catch (e) {
            toast.error((e as Error).message)
          }
        })}
      >
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            Personal details {profile?.is_demo && <DemoBadge />}
          </CardTitle>
          <CardDescription>Your display name appears on your dashboard greeting, pickups and activity.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pb-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Display name" htmlFor="full_name" error={errors.full_name?.message} hint="Your first word is used in greetings." required>
              <Input id="full_name" autoComplete="name" aria-invalid={!!errors.full_name} {...form.register('full_name')} />
            </Field>
            <Field label="Phone" htmlFor="phone" error={errors.phone?.message} hint="Shared only with your pickup partners.">
              <Input id="phone" type="tel" autoComplete="tel" aria-invalid={!!errors.phone} {...form.register('phone')} />
            </Field>
            <Field label="Email" htmlFor="email" hint={OFFLINE_DEMO ? 'Demo sign-in email.' : 'Your sign-in email.'}>
              <Input id="email" value={session?.user.email ?? ''} readOnly disabled />
            </Field>
            <Field label="Role" htmlFor="role" hint="Assigned at sign-up or by an administrator.">
              <div id="role" className="flex h-9 flex-wrap items-center gap-2">
                {profile && <Pill tone="green">{ROLE_LABELS[profile.role]}</Pill>}
                {organization && <span className="truncate text-sm text-muted-foreground">{organization.name}</span>}
              </div>
            </Field>
          </div>
          {OFFLINE_DEMO ? (
            <Notice tone="local" title="Saved locally in this browser">
              Offline demo mode: changes are stored with the sample data in this browser only. "Reset demo data" in the banner
              restores the original names.
            </Notice>
          ) : profile?.is_demo ? (
            <Notice tone="warning" title="Shared demo account">
              Changes are saved to the demo database, are visible to anyone using this demo account, and are reset when the demo
              is reseeded.
            </Notice>
          ) : null}
        </CardContent>
        <CardFooter className="justify-end gap-2">
          <Button type="button" variant="ghost" disabled={!isDirty || isSubmitting} onClick={() => form.reset()}>
            Cancel
          </Button>
          <Button type="submit" disabled={!isDirty || isSubmitting}>
            {isSubmitting && <Loader2 className="animate-spin" />} Save changes
          </Button>
        </CardFooter>
      </form>
    </Card>
  )
}

export default function ProfileSettings() {
  return (
    <>
      <DetailsCard />
      <AvatarCard />
    </>
  )
}
