import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../lib/router.ts', () => ({
  navigate: vi.fn(),
}))
vi.mock('../../lib/storage.ts', () => ({
  clearAdminCode: vi.fn(),
}))

import { navigate } from '../../lib/router.ts'
import { clearAdminCode } from '../../lib/storage.ts'
import { handleAdminNotFound, handleMutationNotFound } from './adminErrors.ts'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('handleAdminNotFound (admin_get_group / admin_get_history)', () => {
  it('logs out on not_found: clears the stored admin code, navigates home and toasts', () => {
    const showToast = vi.fn()

    const handled = handleAdminNotFound('not_found', showToast)

    expect(handled).toBe(true)
    expect(clearAdminCode).toHaveBeenCalled()
    expect(navigate).toHaveBeenCalledWith('/')
    expect(showToast).toHaveBeenCalledWith('That admin code no longer works.', 'error')
  })

  it('does nothing for any other error, leaving it to the caller', () => {
    const showToast = vi.fn()

    const handled = handleAdminNotFound('network', showToast)

    expect(handled).toBe(false)
    expect(clearAdminCode).not.toHaveBeenCalled()
    expect(navigate).not.toHaveBeenCalled()
    expect(showToast).not.toHaveBeenCalled()
  })
})

describe('handleMutationNotFound (every admin mutation)', () => {
  it('on not_found, refreshes instead of logging out: toasts, reloads, never clears the code or navigates', () => {
    const showToast = vi.fn()
    const reload = vi.fn().mockResolvedValue(undefined)

    const handled = handleMutationNotFound('not_found', showToast, reload)

    expect(handled).toBe(true)
    expect(showToast).toHaveBeenCalledWith('That item changed — refreshing.', 'info')
    expect(reload).toHaveBeenCalled()
    expect(clearAdminCode).not.toHaveBeenCalled()
    expect(navigate).not.toHaveBeenCalled()
  })

  it('does nothing for any other error, leaving it to the caller', () => {
    const showToast = vi.fn()
    const reload = vi.fn()

    const handled = handleMutationNotFound('duplicate_name', showToast, reload)

    expect(handled).toBe(false)
    expect(showToast).not.toHaveBeenCalled()
    expect(reload).not.toHaveBeenCalled()
  })
})
