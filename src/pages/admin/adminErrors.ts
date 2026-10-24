// Shared handling for the one error every admin* RPC can return: the admin code no longer
// matches a group (it was never valid, or the group/admin code changed from under this session).
// Every admin tab checks for this before falling back to its own action-specific error copy.
import { navigate } from '../../lib/router.ts'
import { clearAdminCode } from '../../lib/storage.ts'

export type ShowToast = (message: string, variant?: 'info' | 'success' | 'error') => void

/** Returns true when `error` was 'not_found' — in which case this already cleared the stored
 * admin code, navigated home and shown the toast, so the caller should stop (no further error
 * handling for this result). Returns false for every other error, leaving it to the caller. */
export function handleAdminNotFound(error: string, showToast: ShowToast): boolean {
  if (error !== 'not_found') return false
  clearAdminCode()
  navigate('/')
  showToast('That admin code no longer works.', 'error')
  return true
}
