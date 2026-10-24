import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../ui/Toast.tsx'
import { CreatePage, parseMemberNames } from './CreatePage.tsx'

vi.mock('../api/rpc.ts', () => ({
  createGroup: vi.fn(),
  adminUpsertEvent: vi.fn(),
}))
vi.mock('../lib/router.ts', () => ({
  navigate: vi.fn(),
}))
vi.mock('../lib/storage.ts', () => ({
  setAdminCode: vi.fn(),
}))
vi.mock('./createdGroupStore.ts', () => ({
  setCreatedGroup: vi.fn(),
}))

import { adminUpsertEvent, createGroup } from '../api/rpc.ts'
import { navigate } from '../lib/router.ts'
import { setAdminCode } from '../lib/storage.ts'
import { setCreatedGroup } from './createdGroupStore.ts'

function renderPage() {
  return render(
    <ToastProvider>
      <CreatePage />
    </ToastProvider>,
  )
}

function fillMembers(text: string) {
  fireEvent.change(screen.getByLabelText('Members'), { target: { value: text } })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('parseMemberNames (re-export)', () => {
  it('is re-exported from CreatePage for callers that import it from here', () => {
    expect(parseMemberNames('Ali\nAli')).toEqual({ names: ['Ali'], duplicates: ['ali'] })
  })
})

describe('CreatePage', () => {
  it('shows a validation error and does not submit when name and members are empty', async () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Create group' }))

    expect(await screen.findByText('Enter a name up to 80 characters.')).toBeTruthy()
    expect(screen.getByText('Add at least one member name.')).toBeTruthy()
    expect(createGroup).not.toHaveBeenCalled()
  })

  it('shows a live member count and a duplicate warning', () => {
    renderPage()
    fillMembers(' Omar\n\nomar \n Ali')

    expect(screen.getByText('2 members')).toBeTruthy()
    expect(screen.getByText(/Fix duplicate name before creating: Omar/)).toBeTruthy()
  })

  it('creates the group with the member names, stores the admin code and navigates to /created', async () => {
    vi.mocked(createGroup).mockResolvedValueOnce({
      ok: true,
      data: { share_code: 'SHARE123456', admin_code: 'ADMIN1234567890A' },
    })

    renderPage()
    fireEvent.change(screen.getByLabelText('Group name'), { target: { value: 'Friday Futsal' } })
    fillMembers('Omar\nAli')
    fireEvent.click(screen.getByRole('button', { name: 'Create group' }))

    await waitFor(() => expect(createGroup).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Friday Futsal', members: ['Omar', 'Ali'] }),
    ))
    expect(adminUpsertEvent).not.toHaveBeenCalled()
    expect(setAdminCode).toHaveBeenCalledWith('ADMIN1234567890A', false)
    expect(setCreatedGroup).toHaveBeenCalledWith({
      name: 'Friday Futsal',
      shareCode: 'SHARE123456',
      adminCode: 'ADMIN1234567890A',
    })
    expect(navigate).toHaveBeenCalledWith('/created')
  })

  it('blocks submit and shows an error when member names are duplicated', async () => {
    renderPage()
    fireEvent.change(screen.getByLabelText('Group name'), { target: { value: 'Friday Futsal' } })
    fillMembers('Omar\nomar\nAli')
    fireEvent.click(screen.getByRole('button', { name: 'Create group' }))

    expect(
      await screen.findByText('Each name must be unique: Omar appears twice. Add a last initial to tell them apart.'),
    ).toBeTruthy()
    expect(createGroup).not.toHaveBeenCalled()
    expect(navigate).not.toHaveBeenCalled()
  })

  it('also saves the first event when its title was filled in', async () => {
    vi.mocked(createGroup).mockResolvedValueOnce({
      ok: true,
      data: { share_code: 'SHARE123456', admin_code: 'ADMIN1234567890A' },
    })
    vi.mocked(adminUpsertEvent).mockResolvedValueOnce({ ok: true, data: {} as never })

    renderPage()
    fireEvent.change(screen.getByLabelText('Group name'), { target: { value: 'Friday Futsal' } })
    fillMembers('Omar\nAli')
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Practice' } })
    fireEvent.click(screen.getByRole('button', { name: 'Mon' }))
    fireEvent.change(screen.getByLabelText('Time'), { target: { value: '19:00' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create group' }))

    await waitFor(() =>
      expect(adminUpsertEvent).toHaveBeenCalledWith({
        admin: 'ADMIN1234567890A',
        event: expect.objectContaining({
          title: 'Practice',
          kind: 'weekly',
          weekdays: [1],
          start_time: '19:00',
        }),
      }),
    )
    expect(navigate).toHaveBeenCalledWith('/created')
  })

  it('requires a weekday when the optional event is filled in as weekly', async () => {
    renderPage()
    fireEvent.change(screen.getByLabelText('Group name'), { target: { value: 'Friday Futsal' } })
    fillMembers('Omar')
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Practice' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create group' }))

    expect(await screen.findByText('Pick at least one day.')).toBeTruthy()
    expect(createGroup).not.toHaveBeenCalled()
  })
})
