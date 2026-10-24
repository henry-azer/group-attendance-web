// Supabase client + the one place that calls RPCs and maps their errors to a typed Result.
//
// supabase-js never throws for a Postgres error raised with RAISE EXCEPTION — it resolves with
// `{ data: null, error: PostgrestError }`, where `error.message` contains the raised code (e.g.
// 'not_found'). A thrown/rejected call means the request never reached Postgres at all (offline,
// DNS failure, CORS, etc.) and is mapped to 'network'. Both paths go through the same mapError so
// behaviour is identical either way.
import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
)

export type ApiError =
  | 'not_found'
  | 'invalid_input'
  | 'duplicate_name'
  | 'session_closed'
  | 'not_started'
  | 'network'

export type Result<T> = { ok: true; data: T } | { ok: false; error: ApiError }

const KNOWN_ERRORS: ApiError[] = [
  'not_found',
  'invalid_input',
  'duplicate_name',
  'session_closed',
  'not_started',
]

function mapError(message: string | undefined | null): ApiError {
  const text = message ?? ''
  for (const code of KNOWN_ERRORS) {
    if (text.includes(code)) return code
  }
  return 'network'
}

export async function callRpc<T>(fn: string, params: Record<string, unknown>): Promise<Result<T>> {
  try {
    const { data, error } = await supabase.rpc(fn, params)
    if (error) {
      return { ok: false, error: mapError(error.message) }
    }
    return { ok: true, data: data as T }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, error: mapError(message) }
  }
}
