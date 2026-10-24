// Shared handling for 'not_found' errors from admin* RPCs. The same error code means two very
// different things depending on which call raised it, so there are two helpers — mixing them up
// is the bug this file exists to prevent:
//
//  - From admin_get_group / admin_get_history ("fetch the whole group by admin code"), not_found
//    only ever means the admin code itself no longer matches a group — use handleAdminNotFound,
//    which logs this device out (it's the one case where the stored code truly can't work again).
//  - From any *mutation* (admin_upsert_event, admin_set_response, admin_mark_attendance, ...),
//    not_found instead means the admin code is still fine but the specific record it pointed at
//    (a member, event or occurrence) went stale — it was removed, ended, or changed by another
//    admin session. Use handleMutationNotFound, which never touches the stored code: it just tells
//    the tab to refetch so the UI catches up with reality.
import { navigate } from '../../lib/router.ts'
import { clearAdminCode } from '../../lib/storage.ts'

export type ShowToast = (message: string, variant?: 'info' | 'success' | 'error') => void

/** For admin_get_group / admin_get_history only. Returns true when `error` was 'not_found' — in
 * which case this already cleared the stored admin code, navigated home and shown the toast, so
 * the caller should stop (no further error handling for this result). Returns false for every
 * other error, leaving it to the caller. */
export function handleAdminNotFound(error: string, showToast: ShowToast): boolean {
  if (error !== 'not_found') return false
  clearAdminCode()
  navigate('/')
  showToast('That admin code no longer works.', 'error')
  return true
}

/** For every admin mutation. Returns true when `error` was 'not_found' — in which case this
 * already showed a "refreshing" toast and triggered `reload`, so the caller should stop. Returns
 * false for every other error, leaving it to the caller's own action-specific copy. Never clears
 * the admin code or navigates: an ordinary race (someone else just removed this member/event, or
 * it changed under this session) is not proof the code itself is bad. */
export function handleMutationNotFound(
  error: string,
  showToast: ShowToast,
  reload: () => Promise<void> | void,
): boolean {
  if (error !== 'not_found') return false
  showToast('That item changed — refreshing.', 'info')
  void reload()
  return true
}
