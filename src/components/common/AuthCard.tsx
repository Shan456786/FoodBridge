/** Centered card used by the small public account screens (forgot / reset password). */
export function AuthCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-md px-4 py-12 sm:py-20">
      <div className="rounded-2xl border bg-card p-6 shadow-card sm:p-8">{children}</div>
    </div>
  )
}
