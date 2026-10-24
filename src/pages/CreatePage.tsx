import { useMemo, useState, type FormEvent } from 'react'
import { adminUpsertEvent, createGroup, type EventInput } from '../api/rpc.ts'
import { parseMemberNames } from '../domain/names.ts'
import { navigate } from '../lib/router.ts'
import { setAdminCode } from '../lib/storage.ts'
import { EventForm } from './admin/EventForm.tsx'
import { Button, Card, Field, TextArea, TextInput, useToast } from '../ui/index.ts'
import { setCreatedGroup } from './createdGroupStore.ts'

// Re-exported so anything written against "parseMemberNames lives on CreatePage" keeps working;
// the implementation and its tests live in src/domain/names.ts (pure, no React dependency).
export { parseMemberNames } from '../domain/names.ts'

function timezoneOptions(): string[] {
  try {
    return Intl.supportedValuesOf('timeZone')
  } catch {
    return [Intl.DateTimeFormat().resolvedOptions().timeZone]
  }
}

function capitalize(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1)
}

function joinNames(names: string[]): string {
  if (names.length === 1) return names[0]
  if (names.length === 2) return `${names[0]} and ${names[1]}`
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

// The blocking copy shown as the field's error once a submit is attempted with duplicate names
// still in the textarea.
function duplicateNamesError(duplicates: string[]): string {
  const names = duplicates.map(capitalize)
  const verb = names.length === 1 ? 'appears twice' : 'appear more than once'
  return `Each name must be unique: ${joinNames(names)} ${verb}. Add a last initial to tell them apart.`
}

// The shorter live warning shown under the textarea while typing, before any submit is attempted.
function duplicateNamesHint(duplicates: string[]): string {
  const names = duplicates.map(capitalize)
  const noun = names.length === 1 ? 'name' : 'names'
  return `Fix duplicate ${noun} before creating: ${joinNames(names)}.`
}

interface FormErrors {
  name?: string
  members?: string
}

export function CreatePage() {
  const { showToast } = useToast()
  const [name, setName] = useState('')
  const [timezone, setTimezone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone)
  const [membersText, setMembersText] = useState('')
  const [stagedEvent, setStagedEvent] = useState<EventInput | null>(null)
  const [errors, setErrors] = useState<FormErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const timezones = useMemo(timezoneOptions, [])
  const parsedMembers = useMemo(() => parseMemberNames(membersText), [membersText])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const nextErrors: FormErrors = {}

    const trimmedName = name.trim()
    if (!trimmedName || trimmedName.length > 80) {
      nextErrors.name = 'Enter a name up to 80 characters.'
    }
    if (parsedMembers.duplicates.length > 0) {
      nextErrors.members = duplicateNamesError(parsedMembers.duplicates)
    } else if (parsedMembers.names.length === 0) {
      nextErrors.members = 'Add at least one member name.'
    } else if (parsedMembers.names.some((n) => n.length > 60)) {
      nextErrors.members = 'Names must be 60 characters or fewer.'
    }

    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    setFormError(null)
    setSubmitting(true)
    // Duplicates are blocked above, so this is always a clean, unique list.
    const result = await createGroup({
      name: trimmedName,
      timezone,
      members: parsedMembers.names,
    })

    if (!result.ok) {
      setSubmitting(false)
      if (result.error === 'duplicate_name') {
        // Defense in depth: the client already blocks duplicates, but if the server still
        // rejects the list (e.g. a race, or a rule the client doesn't know about), use the same
        // kind of actionable copy rather than a generic "invalid" message.
        setFormError(
          'Each name must be unique. Two or more members have the same name — add a last initial to tell them apart.',
        )
      } else if (result.error === 'network') {
        setFormError("Couldn't reach the server. Check your connection and try again.")
      } else {
        setFormError('Something about that form was invalid. Double-check it and try again.')
      }
      return
    }

    const { share_code, admin_code } = result.data

    if (stagedEvent) {
      const eventResult = await adminUpsertEvent({ admin: admin_code, event: stagedEvent })
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
          </p>
          {parsedMembers.duplicates.length > 0 && (
            <p className="members-meta__warning">{duplicateNamesHint(parsedMembers.duplicates)}</p>
          )}
        </Field>

        <Card className="event-card">
          <h2 className="event-card__heading">First session (optional)</h2>
          {stagedEvent ? (
            <div className="event-card__staged">
              <p className="event-card__staged-summary">"{stagedEvent.title}" will be added once the group is created.</p>
              <Button variant="ghost" onClick={() => setStagedEvent(null)}>
                Remove
              </Button>
            </div>
          ) : (
            <EventForm submitLabel="Add this session" onSubmit={async (input) => setStagedEvent(input)} />
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
