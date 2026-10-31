/**
 * Device-local preferences (theme, avatar picture). These live in this
 * browser's localStorage only: they are never sent to Supabase and do not
 * follow the user to another device. Every access tolerates blocked storage.
 */

export type ThemePreference = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

export const THEME_KEY = 'fb.theme'
export const THEME_EVENT = 'fb-theme-change'
export const AVATAR_EVENT = 'fb-avatar-change'
const avatarKey = (userId: string) => `fb.avatar.${userId}`

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
    return true
  } catch {
    return false
  }
}

// ------------------------------------------------------------------- theme
export function readThemePreference(): ThemePreference {
  const v = read(THEME_KEY)
  return v === 'light' || v === 'dark' || v === 'system' ? v : 'system'
}

export function writeThemePreference(pref: ThemePreference) {
  write(THEME_KEY, pref)
}

export function systemPrefersDark(): boolean {
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  } catch {
    return false
  }
}

export function resolveTheme(pref: ThemePreference): ResolvedTheme {
  return pref === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : pref
}

/** Puts the resolved theme on <html>; with `animate`, colours cross-fade briefly. */
export function applyTheme(theme: ResolvedTheme, { animate = false } = {}) {
  const root = document.documentElement
  if (animate) {
    root.classList.add('theme-transition')
    window.setTimeout(() => root.classList.remove('theme-transition'), 260)
  }
  root.classList.toggle('dark', theme === 'dark')
  root.style.colorScheme = theme
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0B1410' : '#163D2B')
}

// ------------------------------------------------------------------ avatar
export const AVATAR_MAX_BYTES = 5 * 1024 * 1024
export const AVATAR_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']

export function readAvatar(userId: string | undefined | null): string | null {
  if (!userId) return null
  const v = read(avatarKey(userId))
  return v?.startsWith('data:image/') ? v : null
}

/** Returns false if the browser refused to store it (e.g. storage full or blocked). */
export function writeAvatar(userId: string, dataUrl: string | null): boolean {
  const ok = write(avatarKey(userId), dataUrl)
  window.dispatchEvent(new CustomEvent(AVATAR_EVENT, { detail: userId }))
  return ok
}

/** Validates an image file and returns a centre-cropped square JPEG data URL. */
export async function imageFileToAvatar(file: File, size = 160): Promise<string> {
  if (!AVATAR_TYPES.includes(file.type)) throw new Error('Choose a PNG, JPEG, WebP or GIF image.')
  if (file.size > AVATAR_MAX_BYTES) throw new Error('That image is larger than 5 MB.')
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('That file could not be read as an image.'))
      el.src = url
    })
    const side = Math.min(img.naturalWidth, img.naturalHeight)
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = size
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Your browser cannot process images.')
    ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, size, size)
    return canvas.toDataURL('image/jpeg', 0.85)
  } finally {
    URL.revokeObjectURL(url)
  }
}

export function initials(name: string) {
  const parts = name
    .replace(/[—–-].*$/, '') // "Demo Donor — Canteen Manager" → "Demo Donor"
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  return (parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : (parts[0] ?? '?').slice(0, 2)).toUpperCase()
}
