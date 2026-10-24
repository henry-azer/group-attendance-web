// Error codes an RPC call can fail with, and the shared user-facing copy for the generic ones.
// Kept free of the Supabase client so components (and their tests, which mock rpc.ts) can import
// it directly.

export type ApiError =
  | 'not_found'
  | 'invalid_input'
  | 'duplicate_name'
  | 'session_closed'
  | 'not_started'
  | 'rate_limited'
  | 'network'
  | 'server'

/** User-facing copy for the errors that need the same wording everywhere. */
export const API_ERROR_MESSAGES = {
  network: "Couldn't reach the server. Check your connection and try again.",
  server: 'Something went wrong on our side. Try again.',
  rate_limited: 'Too many groups are being created right now. Try again in a minute.',
} as const

/** Second line under a "Couldn't load ..." heading: blame the connection only when it was one. */
export function loadErrorHint(error: ApiError | null): string {
  return error === 'network' ? 'Check your connection and try again.' : API_ERROR_MESSAGES.server
}
