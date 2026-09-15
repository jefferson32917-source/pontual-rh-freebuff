import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Supabase client factory.
 *
 * Configure via env vars (Vite style, in app/.env.local):
 *   VITE_SUPABASE_URL=https://<project>.supabase.co
 *   VITE_SUPABASE_ANON_KEY=<anon key>
 *
 * When not configured, the app runs in DEMO MODE (localStorage data layer),
 * so the UI stays fully functional without a backend.
 *
 * SECURITY: only the anon key lives in the frontend. All authorization must
 * be enforced by Row Level Security policies (see supabase/schema.sql) —
 * the anon key is public by design and grants nothing without RLS.
 */

/** remove espaços, quebras de linha e prefixos 'NOME=' colados ao colar no painel */
function cleanEnv(value: string | undefined): string | undefined {
  if (typeof value !== 'string') return undefined
  let v = value.trim()
  const eq = v.indexOf('=')
  const looksLikeUrl = v.includes('supabase.co')
  const looksLikeJwt = v.startsWith('eyJ')
  if (eq > -1 && (looksLikeUrl || looksLikeJwt)) {
    v = v.slice(eq + 1)
  }
  v = v.replace(/^VITE_SUPABASE_URL=/i, '').replace(/^VITE_SUPABASE_ANON_KEY=/i, '')
  return v.trim() || undefined
}

const url = cleanEnv(import.meta.env.VITE_SUPABASE_URL as string | undefined)
const anonKey = cleanEnv(import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)

export const isSupabaseConfigured =
  typeof url === 'string' &&
  /^https:\/\/.+\.supabase\.(co|in)$/.test(url) &&
  typeof anonKey === 'string' &&
  anonKey.length > 20

let client: SupabaseClient | null = null

export function getSupabase(): SupabaseClient {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase não configurado: defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.')
  }
  if (!client) {
    client = createClient(url!, anonKey!)
  }
  return client
}
