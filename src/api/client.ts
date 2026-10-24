// Supabase client + the one place that calls RPCs and maps their errors to a typed Result.
//
// supabase-js never throws for a Postgres error raised with RAISE EXCEPTION — it resolves with
// `{ data: null, error: PostgrestError }`, where `error.message` contains the raised code (e.g.
// 'not_found'). Known codes map to themselves. Otherwise:
//   * 'network' — the request never reached the server: a rejected call (fetch TypeError,
//     offline, DNS, CORS) or a resolved transport failure (status 0 / 'TypeError: ...').
//   * 'server'  — the server answered with an error we don't know (a bug or an outage).
import { createClient } from '@supabase/supabase-js'
import type { ApiError } from './errors.ts'

export type { ApiError } from './errors.ts'
export { API_ERROR_MESSAGES, loadErrorHint } from './errors.ts'

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
)

export type Result<T> = { ok: true; data: T } | { ok: false; error: ApiError }

const KNOWN_ERRORS: ApiError[] = [
  'not_found',
  'invalid_input',
  'duplicate_name',
  'session_closed',
  'not_started',
  'rate_limited',
]

const NETWORK_MESSAGE = /^(TypeError|FetchError|AbortError)\b|failed to fetch|networkerror|load failed|fetch failed|network request failed/i

function knownCode(text: string): ApiError | null {
  for (const code of KNOWN_ERRORS) {
    if (text.includes(code)) return code
  }
  return null
}

export async function callRpc<T>(fn: string, params: Record<string, unknown>): Promise<Result<T>> {
  try {
    const { data, error, status } = await supabase.rpc(fn, params)
    if (error) {
      const message = error.message ?? ''
      const known = knownCode(message)
      if (known) return { ok: false, error: known }
      const isTransport = status === 0 || NETWORK_MESSAGE.test(message)
      return { ok: false, error: isTransport ? 'network' : 'server' }
    }
    return { ok: true, data: data as T }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const known = knownCode(message)
    if (known) return { ok: false, error: known }
    // A thrown call never got a response: fetch rejects with a TypeError when offline.
    return { ok: false, error: err instanceof TypeError || NETWORK_MESSAGE.test(message) ? 'network' : 'server' }
  }
}
