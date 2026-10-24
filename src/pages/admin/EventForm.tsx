// Create/edit one event. Self-contained: owns its own fields, validation and save button (a
// plain button, not a <form>, so it can be dropped inside another form — e.g. CreatePage's — or
// stand on its own — e.g. EventsTab — without nested-form issues). The caller decides what
// `onSubmit` actually does: call the real admin_upsert_event RPC (EventsTab) or just stage the
// draft until the group itself is created (CreatePage).
import { useState } from 'react'
import type { EventInput } from '../../api/rpc.ts'
import type { Event } from '../../domain/types.ts'
import { Button, Field, Segmented, TextInput } from '../../ui/index.ts'

export type { EventInput } from '../../api/rpc.ts'

export interface EventFormProps {
  initial?: Event
  onSubmit: (event: EventInput) => Promise<void>
  onCancel?: () => void
  submitLabel?: string
}

const WEEKDAYS: { value: number; label: string }[] = [
  { value: 0, label: 'Sun' },
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
]

const EVENT_KIND_OPTIONS = [
  { value: 'weekly' as const, label: 'Every week' },
  { value: 'once' as const, label: 'One time' },
]

function todayIso(): string {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

function sortedWeekdays(weekdays: number[]): number[] {
  return [...weekdays].sort((a, b) => a - b)
}

function sameWeekdays(a: number[], b: number[]): boolean {
  const sa = sortedWeekdays(a)
  const sb = sortedWeekdays(b)
  return sa.length === sb.length && sa.every((v, i) => v === sb[i])
}

interface FormErrors {
  title?: string
  date?: string
  weekdays?: string
  time?: string
}

export function EventForm({ initial, onSubmit, onCancel, submitLabel = 'Save event' }: EventFormProps) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [location, setLocation] = useState(initial?.location ?? '')
  const [kind, setKind] = useState<'once' | 'weekly'>(initial?.kind ?? 'weekly')
  const [date, setDate] = useState(initial && initial.kind === 'once' ? initial.starts_on : todayIso())
  const [weekdays, setWeekdays] = useState<number[]>(initial?.weekdays ?? [])
  const [time, setTime] = useState(initial?.start_time ?? '')
  const [startsOn, setStartsOn] = useState(
    initial && initial.kind === 'weekly' ? initial.starts_on : todayIso(),
  )
  const [endsOn, setEndsOn] = useState(initial?.ends_on ?? '')
  const [errors, setErrors] = useState<FormErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const scheduleChanged =
    Boolean(initial) &&
    (kind !== initial!.kind ||
      time !== initial!.start_time ||
      (kind === 'once' ? date !== initial!.starts_on : startsOn !== initial!.starts_on) ||
      (kind === 'weekly' && !sameWeekdays(weekdays, initial!.weekdays ?? [])))

  function toggleWeekday(value: number) {
    setWeekdays((current) =>
      current.includes(value) ? current.filter((d) => d !== value) : [...current, value],
    )
  }

  async function handleSave() {
    const nextErrors: FormErrors = {}
    const trimmedTitle = title.trim()
    if (!trimmedTitle || trimmedTitle.length > 80) {
      nextErrors.title = 'Enter a title up to 80 characters.'
    }
    if (kind === 'once' && !date) {
      nextErrors.date = 'Pick a date.'
    }
    if (kind === 'weekly' && weekdays.length === 0) {
      nextErrors.weekdays = 'Pick at least one day.'
    }
    if (!time) {
      nextErrors.time = 'Pick a time.'
    }

    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    const input: EventInput = {
      id: initial?.id,
      title: trimmedTitle,
      location: location.trim() || null,
      kind,
      starts_on: kind === 'once' ? date : startsOn || todayIso(),
      weekdays: kind === 'weekly' ? sortedWeekdays(weekdays) : null,
      start_time: time,
      ends_on: kind === 'weekly' ? endsOn || null : null,
    }

    setFormError(null)
    setSubmitting(true)
    try {
      await onSubmit(input)
    } catch {
      setFormError('Something went wrong saving this event. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="event-form">
      <Field label="Title" htmlFor="event-form-title" error={errors.title}>
        <TextInput
          id="event-form-title"
          name="title"
          placeholder="e.g. Practice"
          maxLength={80}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </Field>

      <div className="field">
        <span className="field__label">How often</span>
        <Segmented aria-label="How often" options={EVENT_KIND_OPTIONS} value={kind} onChange={setKind} />
      </div>

      {kind === 'once' ? (
        <Field label="Date" htmlFor="event-form-date" error={errors.date}>
          <TextInput
            id="event-form-date"
            name="date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </Field>
      ) : (
        <>
          <div className="field">
            <span className="field__label">Which day(s)</span>
            <div className="weekday-picker" role="group" aria-label="Which day(s)">
              {WEEKDAYS.map((day) => (
                <button
                  key={day.value}
                  type="button"
                  className={['weekday-picker__chip', weekdays.includes(day.value) && 'is-active']
                    .filter(Boolean)
                    .join(' ')}
                  aria-pressed={weekdays.includes(day.value)}
                  onClick={() => toggleWeekday(day.value)}
                >
                  {day.label}
                </button>
              ))}
            </div>
            {errors.weekdays && (
              <p className="field__error" role="alert">
                {errors.weekdays}
              </p>
            )}
          </div>

          <Field label="Starts on (optional)" htmlFor="event-form-starts-on">
            <TextInput
              id="event-form-starts-on"
              name="startsOn"
              type="date"
              value={startsOn}
              onChange={(e) => setStartsOn(e.target.value)}
            />
          </Field>

          <Field label="Ends on (optional)" htmlFor="event-form-ends-on">
            <TextInput
              id="event-form-ends-on"
              name="endsOn"
              type="date"
              value={endsOn}
              onChange={(e) => setEndsOn(e.target.value)}
            />
          </Field>
        </>
      )}

      <Field label="Time" htmlFor="event-form-time" error={errors.time}>
        <TextInput
          id="event-form-time"
          name="time"
          type="time"
          value={time}
          onChange={(e) => setTime(e.target.value)}
        />
      </Field>

      <Field label="Location (optional)" htmlFor="event-form-location">
        <TextInput
          id="event-form-location"
          name="location"
          placeholder="e.g. Community hall"
          maxLength={120}
          value={location}
          onChange={(e) => setLocation(e.target.value)}
        />
      </Field>

      {scheduleChanged && (
        <p className="event-form__warning" role="status">
          Changing the schedule starts a new version. Past sessions and answers are kept.
        </p>
      )}

      {formError && (
        <p className="form-error" role="alert">
          {formError}
        </p>
      )}

      <div className="event-form__actions">
        <Button type="button" fullWidth={!onCancel} disabled={submitting} onClick={handleSave}>
          {submitting ? 'Saving…' : submitLabel}
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" disabled={submitting} onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </div>
  )
}
