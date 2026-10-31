#!/usr/bin/env node
// Local secret scanner. Reports FILE:LINE and the KIND of finding only —
// it never prints secret values.
//
//   npm run security:scan            # source + config + dist
//
// Checks:
//   * credential-shaped strings (Supabase JWTs with role service_role,
//     sb_secret_ keys, Postgres URLs with passwords, private keys)
//   * the actual server-only values from .env.local / .env (service-role key,
//     DATABASE_URL and its password) appearing in any scanned file, especially
//     the built frontend bundle in dist/
//   * VITE_-prefixed variables whose names suggest server-only secrets
//   * source maps in dist/
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { parse } from 'dotenv'

const ROOT = process.cwd()
const SKIP_DIRS = new Set(['node_modules', '.git', '.vercel', 'test-results', 'playwright-report'])
const SKIP_FILES = new Set(['.env.local', '.env', 'package-lock.json'])
const TEXT_EXT = /\.(ts|tsx|js|mjs|cjs|jsx|json|sql|md|html|css|yml|yaml|toml|txt|map|svg|example)$|^\.env\.example$|^\.gitignore$/

const env = {}
for (const f of ['.env', '.env.local']) {
  if (existsSync(f)) Object.assign(env, parse(readFileSync(f)))
}
const serverOnly = []
const isReal = (v) => v && v.length >= 12 && !/YOUR-PROJECT|your-anon|your-publishable/i.test(v)
if (isReal(env.SUPABASE_SERVICE_ROLE_KEY)) serverOnly.push(['SUPABASE_SERVICE_ROLE_KEY value', env.SUPABASE_SERVICE_ROLE_KEY])
if (isReal(env.DATABASE_URL)) {
  serverOnly.push(['DATABASE_URL value', env.DATABASE_URL])
  try {
    const pw = decodeURIComponent(new URL(env.DATABASE_URL).password)
    if (pw.length >= 6) serverOnly.push(['database password', pw])
  } catch {
    /* not a URL */
  }
}

function jwtRole(token) {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'))
    return payload.role ?? null
  } catch {
    return null
  }
}

const findings = []
const add = (file, line, kind, severity = 'HIGH') => findings.push({ file: path.relative(ROOT, file), line, kind, severity })

function scanFile(file) {
  let text
  try {
    text = readFileSync(file, 'utf8')
  } catch {
    return
  }
  const lines = text.split(/\r?\n/)
  lines.forEach((ln, i) => {
    const n = i + 1
    for (const m of ln.matchAll(/eyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g)) {
      const role = jwtRole(m[0])
      if (role === 'service_role') add(file, n, 'Supabase service_role JWT')
      else add(file, n, `JWT (role: ${role ?? 'unknown'})`, role === 'anon' ? 'INFO' : 'MEDIUM')
    }
    if (/sb_secret_[A-Za-z0-9_-]{10,}/.test(ln)) add(file, n, 'Supabase secret key (sb_secret_)')
    if (/postgres(?:ql)?:\/\/[^:\s/]+:[^@\s]{4,}@/.test(ln) && !/<password>|\[YOUR-PASSWORD\]|:password@|YOUR/.test(ln))
      add(file, n, 'Postgres connection string with password')
    if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(ln)) add(file, n, 'Private key block')
    if (/\bVITE_[A-Z0-9_]*(SERVICE_ROLE|SECRET|DATABASE_URL|PASSWORD|PRIVATE)[A-Z0-9_]*\s*=/.test(ln))
      add(file, n, 'VITE_-prefixed server-only variable name (would be exposed to the browser)')
    for (const [label, value] of serverOnly) if (ln.includes(value)) add(file, n, `Server-only ${label} found`)
  })
}

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name)
    const st = statSync(full)
    if (st.isDirectory()) {
      if (!SKIP_DIRS.has(name)) walk(full)
    } else if (!SKIP_FILES.has(name) && (TEXT_EXT.test(name)) && st.size < 5_000_000) {
      if (name.endsWith('.map') && full.includes(`${path.sep}dist${path.sep}`)) add(full, 0, 'Source map in build output', 'MEDIUM')
      scanFile(full)
    }
  }
}

walk(ROOT)

// .env.local itself: report VITE_ names that look server-only (names only).
for (const [k] of Object.entries(env)) {
  if (/^VITE_/.test(k) && /(SERVICE_ROLE|SECRET|DATABASE_URL|PASSWORD|PRIVATE)/.test(k))
    findings.push({ file: '.env.local/.env', line: 0, kind: `Server-only secret in browser-exposed variable ${k}`, severity: 'HIGH' })
}
if (env.VITE_SUPABASE_ANON_KEY && (env.VITE_SUPABASE_ANON_KEY.startsWith('sb_secret_') || jwtRole(env.VITE_SUPABASE_ANON_KEY) === 'service_role'))
  findings.push({ file: '.env.local/.env', line: 0, kind: 'VITE_SUPABASE_ANON_KEY holds a service-role/secret key', severity: 'HIGH' })

const serious = findings.filter((f) => f.severity !== 'INFO')
console.log(`Scanned project (excluding node_modules). Server-only values loaded for comparison: ${serverOnly.length}.`)
if (!findings.length) console.log('No findings.')
for (const f of findings) console.log(`[${f.severity}] ${f.file}${f.line ? `:${f.line}` : ''} — ${f.kind}`)
process.exit(serious.some((f) => f.severity === 'HIGH') ? 1 : 0)
