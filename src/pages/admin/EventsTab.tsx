// #/a/events — create, edit and end events. Editing a schedule-defining field (kind, weekdays,
// start_time, starts_on) is flagged by EventForm itself (it owns the comparison against `initial`).
import { useState } from 'react'
import { adminEndEvent, adminUpsertEvent, type EventInput } from '../../api/rpc.ts'
import type { AdminGroup, Event } from '../../domain/types.ts'
import { Button, Card, EmptyState, useToast } from '../../ui/index.ts'
import { handleMutationNotFound } from './adminErrors.ts'
import { EventForm } from './EventForm.tsx'

export interface EventsTabProps {
  adminCode: string
  group: AdminGroup
  onReload: () => Promise<void>
}

const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function formatTime(time: string): string {
  const [h, m] = time.split(':').map(Number)
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(2000, 0, 1, h, m)))
}

function formatDate(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(y, m - 1, d)))
}

function describeSchedule(event: Event): string {
  const time = formatTime(event.start_time)
  if (event.kind === 'once') {
    return `One time · ${formatDate(event.starts_on)} · ${time}`
  }
  const days = (event.weekdays ?? []).map((d) => WEEKDAY_NAMES[d]).join(', ')
  const until = event.ends_on ? ` · until ${formatDate(event.ends_on)}` : ''
  return `Weekly · ${days} · ${time}${until}`
}

export function EventsTab({ adminCode, group, onReload }: EventsTabProps) {
  const { showToast } = useToast()
  const [mode, setMode] = useState<'none' | 'create' | string>('none')
  const [endingId, setEndingId] = useState<string | null>(null)
  const [confirmingEndId, setConfirmingEndId] = useState<string | null>(null)

  const activeEvents = group.events.filter((e) => e.active)
  const endedEvents = group.events.filter((e) => !e.active)

  async function saveEvent(input: EventInput) {
    const result = await adminUpsertEvent({ admin: adminCode, event: input })
    if (!result.ok) {
      if (handleMutationNotFound(result.error, showToast, onReload)) return
      showToast("Couldn't save that event. Try again.", 'error')
      return
    }
    showToast(input.id ? 'Event updated' : 'Event added', 'success')
    setMode('none')
    await onReload()
  }

  async function endEvent(id: string) {
    setEndingId(id)
    const result = await adminEndEvent({ admin: adminCode, id })
    setEndingId(null)
    setConfirmingEndId(null)
    if (!result.ok) {
      if (handleMutationNotFound(result.error, showToast, onReload)) return
      showToast("Couldn't end that event. Try again.", 'error')
      return
    }
    showToast('Event ended', 'success')
    await onReload()
  }

  return (
    <div className="events-tab">
      {mode === 'create' ? (
        <Card className="events-tab__form-card">
          <h2 className="events-tab__form-heading">Add an event</h2>
          <EventForm submitLabel="Add event" onSubmit={saveEvent} onCancel={() => setMode('none')} />
        </Card>
      ) : (
        <Button fullWidth onClick={() => setMode('create')}>
          Add event
        </Button>
      )}

      {activeEvents.length === 0 && mode !== 'create' && (
        <EmptyState title="No events yet" description="Add one to start collecting answers." />
      )}

      <ul className="events-list">
        {activeEvents.map((event) => (
          <li key={event.id}>
            {mode === event.id ? (
              <Card className="events-tab__form-card">
                <h2 className="events-tab__form-heading">Edit event</h2>
                <EventForm
                  initial={event}
                  submitLabel="Save changes"
                  onSubmit={saveEvent}
                  onCancel={() => setMode('none')}
                />
              </Card>
            ) : (
              <Card className="events-card">
                <h2 className="events-card__title">{event.title}</h2>
                <p className="events-card__schedule">{describeSchedule(event)}</p>
                {event.location && <p className="events-card__location">{event.location}</p>}
                <div className="events-card__actions">
                  <Button variant="secondary" onClick={() => setMode(event.id)}>
                    Edit
                  </Button>
                  {confirmingEndId === event.id ? (
                    <>
                      <Button
                        variant="secondary"
                        disabled={endingId === event.id}
                        onClick={() => endEvent(event.id)}
                      >
                        {endingId === event.id ? 'Ending…' : 'Confirm end'}
                      </Button>
                      <Button variant="ghost" onClick={() => setConfirmingEndId(null)}>
                        Cancel
                      </Button>
                    </>
                  ) : (
                    <Button variant="ghost" onClick={() => setConfirmingEndId(event.id)}>
                      End event
                    </Button>
                  )}
                </div>
              </Card>
            )}
          </li>
        ))}
      </ul>

      {endedEvents.length > 0 && (
        <details className="events-tab__ended">
          <summary>Ended events ({endedEvents.length})</summary>
          <ul className="events-list events-list--ended">
            {endedEvents.map((event) => (
              <li key={event.id} className="events-card events-card--ended">
                <h3 className="events-card__title">{event.title}</h3>
                <p className="events-card__schedule">{describeSchedule(event)}</p>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}
