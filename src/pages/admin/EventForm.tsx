// Create/edit one event. Two modes:
//  - Standalone (default, used by EventsTab): owns its own fields, validation and a plain
//    `type="button"` Save/Cancel (not a <form>, so it can be dropped inside another form without
//    nested-form issues). Calls `onSubmit` itself once the draft is valid.
//  - `embedded` (used by CreatePage, where the optional first event is one section of a single
//    bigger form with one primary action — "Create group"): no Save/Cancel of its own. The parent
//    drives validation on demand via `ref` — see `EventFormHandle` — and reads back the built
//    `EventInput` (or `null` if the section was left empty, which is valid: the event is
//    optional) once its own submit runs. This is what keeps "Create group" as the only primary
//    action, and keeps Enter-to-submit on an event field from silently dropping it: there's no
//    competing button to bypass, so Enter just triggers the same validated submit.
import { useImperativeHandle, useState, type Ref } from 'react'
import type { EventInput } from '../../api/rpc.ts'
import type { Event } from '../../domain/types.ts'
import { Button, Field, Segmented, TextInput } from '../../ui/index.ts'

export type { EventInput } from '../../api/rpc.ts'

export interface EventFormHandle {
  /** Validates the current draft. `{ ok: true, event: null }` means the section was left empty —
   * valid, since the event is optional (only meaningful when `embedded`). `{ ok: true, event }`
   * means it validated. `{ ok: false }` means it has content but failed validation; the form's own
   * inline field errors are shown as a side effect, so the caller needs no error copy of its own. */
  validate(): { ok: true; event: EventInput | null } | { ok: false }
}

export interface EventFormProps {
  initial?: Event
  onSubmit?: (event: EventInput) => Promise<void>
  onCancel?: () => void
  submitLabel?: string
  /** No own Save/Cancel; see the module comment. */
  embedded?: boolean
  ref?: Ref<EventFormHandle>
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

export function EventForm({
  initial,
  onSubmit,
  onCancel,
  submitLabel = 'Save event',
  embedded = false,
  ref,
}: EventFormProps) {
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

  // Embedded-only: hides every field but Title until there's a title, same as the rest of
  // CreatePage's "optional" sections — also means a user can't half-fill the schedule fields
  // without ever entering a title, so there's no orphaned-fields edge case to validate around.
  const showDetails = !embedded || title.trim().length > 0

  function toggleWeekday(value: number) {
    setWeekdays((current) =>
      current.includes(value) ? current.filter((d) => d !== value) : [...current, value],
    )
  }

  function validate(): { ok: true; event: EventInput | null } | { ok: false } {
    const trimmedTitle = title.trim()

    if (embedded && !trimmedTitle) {
      setErrors({})
      return { ok: true, event: null }
    }

    const nextErrors: FormErrors = {}
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
    if (Object.keys(nextErrors).length > 0) return { ok: false }

    const event: EventInput = {
      id: initial?.id,
      title: trimmedTitle,
      location: location.trim() || null,
      kind,
      starts_on: kind === 'once' ? date : startsOn || todayIso(),
      weekdays: kind === 'weekly' ? sortedWeekdays(weekdays) : null,
      start_time: time,
      ends_on: kind === 'weekly' ? endsOn || null : null,
    }
    return { ok: true, event }
  }

  useImperativeHandle(ref, () => ({ validate }), [
    embedded,
    initial,
    title,
    location,
    kind,
    date,
    weekdays,
    time,
    startsOn,
    endsOn,
  ])

  async function handleSave() {
    const result = validate()
    if (!result.ok || !result.event) return

    setFormError(null)
    setSubmitting(true)
    try {
      await onSubmit?.(result.event)
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

      {showDetails && (
        <>
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
        </>
      )}

      {formError && (
        <p className="form-error" role="alert">
          {formError}
        </p>
      )}

      {!embedded && (
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
      )}
    </div>
  )
}
