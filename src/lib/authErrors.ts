/**
 * Maps Supabase Auth errors (and fetch failures) to messages a user can act on.
 * Accepts an AuthError, an Error thrown by fetch, or a bare message string.
 */
export function authErrorMessage(error: unknown): string {
  const e = (error ?? {}) as { message?: string; name?: string; status?: number; code?: string }
  const message = typeof error === 'string' ? error : (e.message ?? '')
  const code = typeof error === 'string' ? '' : (e.code ?? '')

  if (
    /failed to fetch|networkerror|network request failed|load failed|fetch failed/i.test(message) ||
    e.name === 'AuthRetryableFetchError'
  )
    return "Can't reach the FoodBridge server. Check your internet connection and try again."
  if (code === 'invalid_credentials' || /invalid login credentials/i.test(message)) return 'Incorrect email or password.'
  if (code === 'email_not_confirmed' || /email not confirmed/i.test(message))
    return 'Please confirm your email address first — check your inbox for the link.'
  if (code === 'user_already_exists' || code === 'email_exists' || /already (been )?registered|already exists/i.test(message))
    return 'An account with this email already exists. Try signing in instead.'
  if (code === 'weak_password' || /password should|weak password/i.test(message))
    return 'That password is too weak. Use at least 8 characters with a mix of letters and numbers.'
  if (code === 'signup_disabled' || /signups not allowed|signup.*disabled/i.test(message))
    return 'New sign-ups are currently disabled on this FoodBridge server.'
  if (code === 'email_address_invalid' || /email address .* is invalid|invalid email/i.test(message))
    return 'That email address was rejected. Please use a different address.'
  if (code === 'over_email_send_rate_limit' || /rate limit|too many requests/i.test(message) || e.status === 429)
    return 'Too many attempts. Please wait a minute and try again.'
  return message || 'Something went wrong. Please try again.'
}
