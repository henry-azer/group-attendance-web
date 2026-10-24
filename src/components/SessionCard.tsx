// One event's next session: the "are you coming" question, Going/Can't + note, and who answered
// what. Reused read-only (adminMode) by the admin "This week" tab — see Task 8.
import { useEffect, useState } from 'react'
import type { Session, Status } from '../domain/types.ts'
import { formatSessionWhen, relativeDayLabel, sessionHeadline } from '../lib/format.ts'
import { Button, Card } from '../ui/index.ts'

export interface SessionCardMember {
  id: string
  name: string
}

export interface SessionCardProps {
  session: Session
  members: SessionCardMember[]
  meId: string | null
  tz: string
  onAnswer?: (status: Status, note: string) => Promise<void>
  adminMode?: boolean
}

const NOTE_MAX = 140

function nameFor(members: SessionCardMember[], id: string): string {
  return members.find((m) => m.id === id)?.name ?? 'Someone'
}

interface GroupEntry {
  id: string
  name: string
  note?: string | null
}

function AnswerGroup({ title, entries }: { title: string; entries: GroupEntry[] }) {
  return (
    <div className="session-card__group">
      <h3 className="session-card__group-title">
        {title} ({entries.length})
      </h3>
      {entries.length === 0 ? (
        <p className="session-card__group-empty">No one yet</p>
      ) : (
        <ul className="session-card__group-list">
          {entries.map((entry) => (
            <li key={entry.id}>
              {entry.name}
              {entry.note ? <span className="session-card__group-note"> — "{entry.note}"</span> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function SessionCard({
  session,
  members,
  meId,
  tz,
  onAnswer,
  adminMode = false,
}: SessionCardProps) {
  const { event, occurrence_date, starts_at, answers } = session
  const myAnswer = meId ? answers.find((a) => a.member_id === meId) : undefined
  const [note, setNote] = useState(myAnswer?.note ?? '')
  const [pending, setPending] = useState(false)

  // Re-sync the draft when a different member is picked, or the server hands back a fresh
  // answer for the one we have (after a successful submit or a refetch).
  useEffect(() => {
    setNote(myAnswer?.note ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meId, event.id, myAnswer?.note])

  if (!occurrence_date || !starts_at) {
    return (
      <Card className="session-card">
        <h2 className="session-card__event">{event.title}</h2>
        <p className="muted session-card__no-session">No upcoming session</p>
      </Card>
    )
  }

  const label = relativeDayLabel(new Date(starts_at), tz, new Date())
  const headline = sessionHeadline(label)
  const when = formatSessionWhen(starts_at, tz, new Date())

  const going: GroupEntry[] = answers
    .filter((a) => a.status === 'going')
    .map((a) => ({ id: a.member_id, name: nameFor(members, a.member_id), note: a.note }))
  const cant: GroupEntry[] = answers
    .filter((a) => a.status === 'cant')
    .map((a) => ({ id: a.member_id, name: nameFor(members, a.member_id), note: a.note }))
  const answeredIds = new Set(answers.map((a) => a.member_id))
  const noReply: GroupEntry[] = members
    .filter((m) => !answeredIds.has(m.id))
    .map((m) => ({ id: m.id, name: m.name }))

  const noteChanged = Boolean(myAnswer) && note.trim() !== (myAnswer?.note ?? '')
  const answersDisabled = pending || !meId

  async function handleAnswer(status: Status) {
    if (!onAnswer || pending) return
    setPending(true)
    try {
      await onAnswer(status, note.trim())
    } finally {
      setPending(false)
    }
  }

  async function handleSaveNote() {
    if (!onAnswer || !myAnswer || pending) return
    setPending(true)
    try {
      await onAnswer(myAnswer.status, note.trim())
    } finally {
      setPending(false)
    }
  }

  return (
    <Card className="session-card">
      {!adminMode && <h2 className="session-card__headline">{headline}</h2>}
      <p className="session-card__meta">
        {event.title}
        {event.location ? ` · ${event.location}` : ''}
      </p>
      <p className="session-card__when">{when}</p>

      {!adminMode && (
        <>
          <div
            className={['session-card__answers', pending && 'is-busy'].filter(Boolean).join(' ')}
            aria-busy={pending}
          >
            <Button
              variant={myAnswer?.status === 'going' ? 'primary' : 'secondary'}
              aria-pressed={myAnswer?.status === 'going'}
              disabled={answersDisabled}
              onClick={() => handleAnswer('going')}
            >
              Going
            </Button>
            <Button
              variant={myAnswer?.status === 'cant' ? 'primary' : 'secondary'}
              aria-pressed={myAnswer?.status === 'cant'}
              disabled={answersDisabled}
              onClick={() => handleAnswer('cant')}
            >
              Can't
            </Button>
          </div>
          {!meId && <p className="session-card__hint">Pick your name first</p>}

          <div className="field session-card__note-field">
            <label className="field__label" htmlFor={`note-${event.id}`}>
              Note (optional)
            </label>
            <textarea
              id={`note-${event.id}`}
              className="textarea"
              rows={2}
              maxLength={NOTE_MAX}
              placeholder="Running 10 min late, bringing a friend, etc."
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <div className="session-card__note-row">
              <span className="session-card__note-count">
                {note.length}/{NOTE_MAX}
              </span>
              {noteChanged && (
                <button
                  type="button"
                  className="session-card__save-note"
                  disabled={pending}
                  onClick={handleSaveNote}
                >
                  Save note
                </button>
              )}
            </div>
          </div>
        </>
      )}

      <div className="session-card__groups">
        <AnswerGroup title="Going" entries={going} />
        <AnswerGroup title="Can't" entries={cant} />
        <AnswerGroup title="No reply yet" entries={noReply} />
      </div>
    </Card>
  )
}
