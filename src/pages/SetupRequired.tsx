import { Logo } from '@/components/common/Logo'

/** Shown when the app is built without Supabase environment variables. */
export default function SetupRequired() {
  return (
    <div className="flex min-h-svh items-center justify-center px-4">
      <div className="w-full max-w-lg rounded-2xl border bg-card p-8 shadow-sm">
        <Logo />
        <h1 className="mt-6 text-xl font-semibold">Connect FoodBridge to Supabase</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This build has no Supabase connection configured. Create a <code className="rounded bg-muted px-1">.env.local</code>{' '}
          file in the project root (see <code className="rounded bg-muted px-1">.env.example</code>) and restart the dev server:
        </p>
        <pre className="mt-4 overflow-x-auto rounded-lg bg-forest-900 p-4 text-xs text-mint-50">
          {`VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-or-publishable-key`}
        </pre>
        <p className="mt-4 text-xs text-muted-foreground">
          Only the public anon/publishable key belongs here. Never expose the service-role key in frontend variables.
        </p>
      </div>
    </div>
  )
}
