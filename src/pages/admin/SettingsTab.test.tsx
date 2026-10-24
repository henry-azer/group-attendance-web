import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AdminGroup } from '../../domain/types.ts'
import { ToastProvider } from '../../ui/Toast.tsx'
import { SettingsTab } from './SettingsTab.tsx'

vi.mock('../../api/rpc.ts', () => ({
  adminRenameGroup: vi.fn(),
}))
vi.mock('../../lib/router.ts', () => ({
  navigate: vi.fn(),
}))
vi.mock('../../lib/storage.ts', () => ({
  getAdminCode: vi.fn(() => 'ADMIN1234567890A'),
  isAdminCodeRemembered: vi.fn(() => false),
  setAdminCode: vi.fn(),
  clearAdminCode: vi.fn(),
}))

import { adminRenameGroup } from '../../api/rpc.ts'
import { navigate } from '../../lib/router.ts'
import { clearAdminCode } from '../../lib/storage.ts'

function buildGroup(): AdminGroup {
  return {
    id: 'g1',
    name: 'Friday Futsal',
    timezone: 'Africa/Cairo',
    share_code: 'SHARE123456',
    members: [],
    events: [],
    sessions: [],
  }
}

function renderTab() {
  const onReload = vi.fn().mockResolvedValue(undefined)
  render(
    <ToastProvider>
      <SettingsTab adminCode="ADMIN1234567890A" group={buildGroup()} onReload={onReload} />
    </ToastProvider>,
  )
  return { onReload }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('SettingsTab', () => {
  it('refreshes instead of logging out when adminRenameGroup hits a stale not_found', async () => {
    vi.mocked(adminRenameGroup).mockResolvedValueOnce({ ok: false, error: 'not_found' })
    const { onReload } = renderTab()

    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByText('That item changed — refreshing.')).toBeTruthy()
    await waitFor(() => expect(onReload).toHaveBeenCalled())
    expect(clearAdminCode).not.toHaveBeenCalled()
    expect(navigate).not.toHaveBeenCalled()
  })

  it('warns that a timezone change shifts past session times, only once it is changed', () => {
    renderTab()
    const note = 'Changing the timezone shifts the times of past sessions too.'
    expect(screen.queryByText(note)).toBeFalsy()
    fireEvent.change(screen.getByLabelText('Timezone'), { target: { value: 'UTC' } })
    expect(screen.getByText(note)).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Timezone'), { target: { value: 'Africa/Cairo' } })
    expect(screen.queryByText(note)).toBeFalsy()
  })

  it('requires a second tap to forget the admin code on this device', () => {
    renderTab()

    fireEvent.click(screen.getByRole('button', { name: 'Forget on this device' }))
    expect(clearAdminCode).not.toHaveBeenCalled()
    expect(navigate).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Confirm forget' }))
    expect(clearAdminCode).toHaveBeenCalled()
    expect(navigate).toHaveBeenCalledWith('/')
  })
})
