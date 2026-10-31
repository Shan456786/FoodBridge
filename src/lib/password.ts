import { z } from 'zod'

/** Same rule as sign-up: 8–72 characters (72 is bcrypt's limit, which Supabase Auth uses). */
export const newPasswordSchema = z.string().min(8, 'Use at least 8 characters').max(72, 'Use at most 72 characters')

export interface PasswordStrength {
  score: 0 | 1 | 2 | 3 | 4
  label: 'Too short' | 'Weak' | 'Fair' | 'Good' | 'Strong'
}

/** A rough, dependency-free estimate for UI feedback only (the server enforces the real policy). */
export function passwordStrength(pw: string): PasswordStrength {
  if (pw.length < 8) return { score: 0, label: 'Too short' }
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(pw)).length
  let score = (classes >= 3 ? 2 : classes === 2 ? 1 : 0) + (pw.length >= 12 ? 1 : 0) + (pw.length >= 16 ? 1 : 0)
  if (/^(.)\1+$/.test(pw) || /password|123456|qwerty|foodbridge/i.test(pw)) score = 0
  const s = Math.max(1, Math.min(4, score)) as PasswordStrength['score']
  return { score: s, label: (['Too short', 'Weak', 'Fair', 'Good', 'Strong'] as const)[s] }
}
