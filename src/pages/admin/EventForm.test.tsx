import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Event } from '../../domain/types.ts'
import { EventForm } from './EventForm.tsx'

function buildEvent(overrides: Partial<Event> = {}): Event {
  return {
    id: 'event-1',
    series_id: 'series-1',
    title: 'Practice',
    location: 'Gym',
    kind: 'weekly',
    starts_on: '2026-09-07',
    weekdays: [1],
    start_time: '18:00',
    ends_on: null,
    active: true,
    ...overrides,
  }
}

describe('EventForm', () => {
  it('requires at least one weekday for a weekly event and does not submit', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<EventForm onSubmit={onSubmit} />)

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Practice' } })
    fireEvent.change(screen.getByLabelText('Time'), { target: { value: '19:00' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save event' }))

    expect(await screen.findByText('Pick at least one day.')).toBeTruthy()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('emits sorted weekdays regardless of click order', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<EventForm onSubmit={onSubmit} />)

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Practice' } })
    fireEvent.change(screen.getByLabelText('Time'), { target: { value: '19:00' } })
    fireEvent.click(screen.getByRole('button', { name: 'Fri' }))
    fireEvent.click(screen.getByRole('button', { name: 'Mon' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save event' }))

    await vi.waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ weekdays: [1, 5] })),
    )
  })

  it('hides the weekday picker for a one-time event and requires a date instead', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<EventForm onSubmit={onSubmit} />)

    fireEvent.click(screen.getByRole('radio', { name: 'One time' }))

    expect(screen.queryByRole('button', { name: 'Mon' })).toBeFalsy()
    expect(screen.getByLabelText('Date')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Practice' } })
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '' } })
    fireEvent.change(screen.getByLabelText('Time'), { target: { value: '19:00' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save event' }))

    expect(await screen.findByText('Pick a date.')).toBeTruthy()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('prefills fields from an existing event when editing', () => {
    render(<EventForm initial={buildEvent()} onSubmit={vi.fn()} />)

    expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('Practice')
    expect((screen.getByLabelText('Location (optional)') as HTMLInputElement).value).toBe('Gym')
    expect((screen.getByLabelText('Time') as HTMLInputElement).value).toBe('18:00')
    const mon = screen.getByRole('button', { name: 'Mon' })
    expect(mon.getAttribute('aria-pressed')).toBe('true')
  })

  it('shows the versioning warning only once an existing event\'s schedule is actually changed', () => {
    render(<EventForm initial={buildEvent()} onSubmit={vi.fn()} />)

    expect(screen.queryByText(/Changing the schedule starts a new version/)).toBeFalsy()

    fireEvent.click(screen.getByRole('button', { name: 'Fri' }))

    expect(screen.getByText(/Changing the schedule starts a new version/)).toBeTruthy()
  })

  it('calls onCancel when provided and Cancel is clicked', () => {
    const onCancel = vi.fn()
    render(<EventForm initial={buildEvent()} onSubmit={vi.fn()} onCancel={onCancel} />)

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalled()
  })
})
