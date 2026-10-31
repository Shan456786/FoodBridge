import path from 'node:path'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import { forbiddenBrowserEnvNames, isServerOnlyKey } from './src/lib/keyGuard.ts'

/**
 * Fails dev/build if a server-only credential would be exposed to the browser:
 * a VITE_-prefixed secret-looking variable, or a service-role/secret key placed
 * in VITE_SUPABASE_ANON_KEY. Reports variable NAMES only, never values.
 */
function secretGuard(mode: string): Plugin {
  return {
    name: 'foodbridge-secret-guard',
    configResolved() {
      const env = loadEnv(mode, process.cwd(), 'VITE_')
      const bad = forbiddenBrowserEnvNames(env)
      if (isServerOnlyKey(env.VITE_SUPABASE_ANON_KEY)) bad.push('VITE_SUPABASE_ANON_KEY (contains a service-role/secret key)')
      if (bad.length) {
        throw new Error(
          `Refusing to start: server-only secrets would be bundled into the browser via ${bad.join(', ')}. ` +
            'Only VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY may be VITE_ variables.',
        )
      }
    },
  }
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss(), secretGuard(mode)],
  // Listen on IPv4 and IPv6 so both http://localhost:5173 and http://127.0.0.1:5173 work.
  server: { host: true, port: 5173 },
  preview: { host: true, port: 4173 },
  // Never publish source maps.
  build: { sourcemap: false },
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
}))
