import { useMemo, useState, type FormEvent } from 'react'
import { adminUpsertEvent, createGroup, type EventInput } from '../api/rpc.ts'
import { parseMemberNames } from '../domain/names.ts'
import { navigate } from '../lib/router.ts'
import { setAdminCode } from '../lib/storage.ts'
import { Button, Card, Field, Segmented, TextArea, TextInput, useToast } from '../ui/index.ts'
import { setCreatedGroup } from './createdGroupStore.ts'

// Re-exported so anything written against "parseMemberNames lives on CreatePage" keeps working;
// the implementation and its tests live in src/domain/names.ts (pure, no React dependency).
export { parseMemberNames } from '../domain/names.ts'

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

function timezoneOptions(): string[] {
  try {
    return Intl.supportedValuesOf('timeZone')
  } catch {
    return [Intl.DateTimeFormat().resolvedOptions().timeZone]
  }
}

interface EventDraft {
  title: string
  kind: 'once' | 'weekly'
  date: string
  weekdays: number[]
  time: string
  location: string
}

interface FormErrors {
  name?: string
  members?: string
  eventDate?: string
  eventWeekdays?: string
  eventTime?: string
}

export function CreatePage() {
  const { showToast } = useToast()
  const [name, setName] = useState('')
  const [timezone, setTimezone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone)
  const [membersText, setMembersText] = useState('')
  const [event, setEvent] = useState<EventDraft>({
    title: '',
    kind: 'weekly',
    date: todayIso(),
    weekdays: [],
    time: '',
    location: '',
  })
  const [errors, setErrors] = useState<FormErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const timezones = useMemo(timezoneOptions, [])
  const parsedMembers = useMemo(() => parseMemberNames(membersText), [membersText])
  const eventFilled = event.title.trim().length > 0

  function toggleWeekday(value: number) {
    setEvent((current) => ({
      ...current,
      weekdays: current.weekdays.includes(value)
        ? current.weekdays.filter((d) => d !== value)
        : [...current.weekdays, value].sort((a, b) => a - b),
    }))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const nextErrors: FormErrors = {}

    const trimmedName = name.trim()
    if (!trimmedName || trimmedName.length > 80) {
      nextErrors.name = 'Enter a name up to 80 characters.'
    }
    if (parsedMembers.names.length === 0) {
      nextErrors.members = 'Add at least one member name.'
    } else if (parsedMembers.names.some((n) => n.length > 60)) {
      nextErrors.members = 'Names must be 60 characters or fewer.'
    }
    if (eventFilled) {
      if (event.kind === 'once' && !event.date) {
        nextErrors.eventDate = 'Pick a date.'
      }
      if (event.kind === 'weekly' && event.weekdays.length === 0) {
        nextErrors.eventWeekdays = 'Pick at least one day.'
      }
      if (!event.time) {
        nextErrors.eventTime = 'Pick a time.'
      }
    }

    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    setFormError(null)
    setSubmitting(true)
    const result = await createGroup({
      name: trimmedName,
      timezone,
      members: parsedMembers.names,
    })

    if (!result.ok) {
      setSubmitting(false)
      setFormError(
        result.error === 'network'
          ? "Couldn't reach the server. Check your connection and try again."
          : 'Something about that form was invalid. Double-check it and try again.',
      )
      return
    }

    const { share_code, admin_code } = result.data

    if (eventFilled) {
      const eventInput: EventInput = {
        title: event.title.trim(),
        location: event.location.trim() || null,
        kind: event.kind,
        starts_on: event.kind === 'once' ? event.date : todayIso(),
        weekdays: event.kind === 'weekly' ? event.weekdays : null,
        start_time: event.time,
      }
      const eventResult = await adminUpsertEvent({ admin: admin_code, event: eventInput })
      if (!eventResult.ok) {
        showToast("Group created, but the first session couldn't be saved. Add it from Admin.", 'error')
      }
    }

    setAdminCode(admin_code, false)
    setCreatedGroup({ name: trimmedName, shareCode: share_code, adminCode: admin_code })
    navigate('/created')
  }

  return (
    <div className="container screen">
      <h1>Create a group</h1>
      <p className="muted">Takes about two minutes. You'll get two codes at the end.</p>

      <form onSubmit={handleSubmit} noValidate>
        <Field label="Group name" htmlFor="group-name" error={errors.name}>
          <TextInput
            id="group-name"
            name="name"
            placeholder="e.g. Friday 5-a-side"
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>

        <Field label="Timezone" htmlFor="group-timezone">
          <select
            id="group-timezone"
            name="timezone"
            className="input"
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
          >
            {timezones.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Members" htmlFor="group-members" error={errors.members}>
          <TextArea
            id="group-members"
            name="members"
            placeholder={'One name per line\nOmar\nSara\nAli'}
            rows={6}
            value={membersText}
            onChange={(e) => setMembersText(e.target.value)}
          />
          <p className="members-meta">
            {parsedMembers.names.length === 1
              ? '1 member'
              : `${parsedMembers.names.length} members`}
            {parsedMembers.duplicates.length > 0 && (
              <span className="members-meta__warning">
                {' '}
                · repeated: {parsedMembers.duplicates.join(', ')} (kept once)
              </span>
            )}
          </p>
        </Field>

        <Card className="event-card">
          <h2 className="event-card__heading">First session (optional)</h2>
          <Field label="Title" htmlFor="event-title">
            <TextInput
              id="event-title"
              name="eventTitle"
              placeholder="e.g. Practice"
              maxLength={80}
              value={event.title}
              onChange={(e) => setEvent((current) => ({ ...current, title: e.target.value }))}
            />
          </Field>

          {eventFilled && (
            <>
              <div className="field">
                <span className="field__label">How often</span>
                <Segmented
                  aria-label="How often"
                  options={EVENT_KIND_OPTIONS}
                  value={event.kind}
                  onChange={(kind) => setEvent((current) => ({ ...current, kind }))}
                />
              </div>

              {event.kind === 'once' ? (
                <Field label="Date" htmlFor="event-date" error={errors.eventDate}>
                  <TextInput
                    id="event-date"
                    name="eventDate"
                    type="date"
                    value={event.date}
                    onChange={(e) => setEvent((current) => ({ ...current, date: e.target.value }))}
                  />
                </Field>
              ) : (
                <div className="field">
                  <span className="field__label">Which day(s)</span>
                  <div className="weekday-picker" role="group" aria-label="Which day(s)">
                    {WEEKDAYS.map((day) => (
                      <button
                        key={day.value}
                        type="button"
                        className={[
                          'weekday-picker__chip',
                          event.weekdays.includes(day.value) && 'is-active',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                        aria-pressed={event.weekdays.includes(day.value)}
                        onClick={() => toggleWeekday(day.value)}
                      >
                        {day.label}
                      </button>
                    ))}
                  </div>
                  {errors.eventWeekdays && (
                    <p className="field__error" role="alert">
                      {errors.eventWeekdays}
                    </p>
                  )}
                </div>
              )}

              <Field label="Time" htmlFor="event-time" error={errors.eventTime}>
                <TextInput
                  id="event-time"
                  name="eventTime"
                  type="time"
                  value={event.time}
                  onChange={(e) => setEvent((current) => ({ ...current, time: e.target.value }))}
                />
              </Field>

              <Field label="Location (optional)" htmlFor="event-location">
                <TextInput
                  id="event-location"
                  name="eventLocation"
                  placeholder="e.g. Community hall"
                  maxLength={120}
                  value={event.location}
                  onChange={(e) =>
                    setEvent((current) => ({ ...current, location: e.target.value }))
                  }
                />
              </Field>
            </>
          )}
        </Card>

        {formError && (
          <p className="form-error" role="alert">
            {formError}
          </p>
        )}

        <Button type="submit" fullWidth disabled={submitting}>
          {submitting ? 'Creating…' : 'Create group'}
        </Button>
      </form>
    </div>
  )
}
