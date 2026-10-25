// One event's next session: the "are you coming" question, Going/Can't + note, and who answered
// what. Reused read-only (adminMode) by the admin "This week" tab — see Task 8.
import { useEffect, useState, type CSSProperties } from 'react'
import type { Session, Status } from '../domain/types.ts'
import { relativeDayLabel, sessionDateParts, sessionHeadline } from '../lib/format.ts'
import { Avatar, Card, Icon } from '../ui/index.ts'

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
const STACK_MAX = 5

function nameFor(members: SessionCardMember[], id: string): string {
  return members.find((m) => m.id === id)?.name ?? 'Someone'
}

interface GroupEntry {
  id: string
  name: string
  note?: string | null
}

type Tone = 'going' | 'cant' | 'none'

function AnswerGroup({ title, entries, tone }: { title: string; entries: GroupEntry[]; tone: Tone }) {
  return (
    <div className={`session-card__group session-card__group--${tone}`}>
      <h3 className="session-card__group-title">
        {title} ({entries.length})
      </h3>
      {entries.length === 0 ? (
        <p className="session-card__group-empty">No one yet</p>
      ) : tone === 'none' ? (
        <ul className="session-card__chips">
          {entries.map((entry) => (
            <li key={entry.id} className="session-card__chip">
              <Avatar name={entry.name} size="sm" />
              <span>{entry.name}</span>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="session-card__group-list">
          {entries.map((entry) => (
            <li key={entry.id} className="session-card__person">
              <Avatar name={entry.name} />
              <span className="session-card__person-text">
                <span className="session-card__person-name">{entry.name}</span>
                {entry.note ? <span className="session-card__group-note">"{entry.note}"</span> : null}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Headcount({ going, cant, noReply }: { going: GroupEntry[]; cant: number; noReply: number }) {
  const total = going.length + cant + noReply
  const pct = (n: number) => (total === 0 ? 0 : (n / total) * 100)
  const stack = going.slice(0, STACK_MAX)
  const more = going.length - stack.length

  return (
    <div className="headcount">
      <div className="headcount__top">
        <p className="headcount__figure">
          <span className="headcount__number tabular">{going.length}</span>
          <span className="headcount__label">
            going
            <span className="headcount__of tabular"> of {total}</span>
          </span>
        </p>
        {stack.length > 0 && (
          <div className="avatar-stack" aria-hidden="true">
            {stack.map((entry) => (
              <Avatar key={entry.id} name={entry.name} />
            ))}
            {more > 0 && <span className="avatar-stack__more">+{more}</span>}
          </div>
        )}
      </div>
      <div
        className="headcount__bar"
        role="img"
        aria-label={`${going.length} going, ${cant} can't, ${noReply} no reply yet`}
      >
        <span className="headcount__seg headcount__seg--going" style={{ '--w': `${pct(going.length)}%` } as CSSProperties} />
        <span className="headcount__seg headcount__seg--cant" style={{ '--w': `${pct(cant)}%` } as CSSProperties} />
      </div>
      <p className="headcount__legend tabular">
        <span className="headcount__key headcount__key--cant">{cant} can't</span>
        <span className="headcount__key headcount__key--none">{noReply} no reply</span>
      </p>
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
      <Card className="session-card session-card--empty">
        <h2 className="session-card__event">{event.title}</h2>
        <p className="muted session-card__no-session">No upcoming session</p>
      </Card>
    )
  }

  const label = relativeDayLabel(new Date(starts_at), tz, new Date())
  const headline = sessionHeadline(label)
  const parts = sessionDateParts(starts_at, tz)

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
    <Card className={['session-card', adminMode && 'session-card--admin'].filter(Boolean).join(' ')}>
      <div className="session-card__header">
        <div className="date-tile" aria-hidden="true">
          <span className="date-tile__weekday">{parts.weekday}</span>
          <span className="date-tile__day tabular">{parts.day}</span>
        </div>
        <div className="session-card__heading">
          {!adminMode && <h2 className="session-card__headline">{headline}</h2>}
          {adminMode && <h2 className="session-card__event-title">{event.title}</h2>}
          <p className="session-card__meta">
            {!adminMode && <span className="session-card__title">{event.title}</span>}
            <span className="session-card__when">
              <Icon name="clock" size={16} />
              {parts.weekday} {parts.day} {parts.month} · {parts.time}
            </span>
            {event.location ? (
              <span className="session-card__where">
                <Icon name="pin" size={16} />
                {event.location}
              </span>
            ) : null}
          </p>
        </div>
      </div>

      <Headcount going={going} cant={cant.length} noReply={noReply.length} />

      {!adminMode && (
        <div className="session-card__respond">
          <div
            className={['session-card__answers', pending && 'is-busy'].filter(Boolean).join(' ')}
            aria-busy={pending}
          >
            <button
              type="button"
              className={['answer', 'answer--going', myAnswer?.status === 'going' && 'is-selected']
                .filter(Boolean)
                .join(' ')}
              aria-pressed={myAnswer?.status === 'going'}
              disabled={answersDisabled}
              onClick={() => handleAnswer('going')}
            >
              <Icon name="check" />
              Going
            </button>
            <button
              type="button"
              className={['answer', 'answer--cant', myAnswer?.status === 'cant' && 'is-selected']
                .filter(Boolean)
                .join(' ')}
              aria-pressed={myAnswer?.status === 'cant'}
              disabled={answersDisabled}
              onClick={() => handleAnswer('cant')}
            >
              <Icon name="x" />
              Can't
            </button>
          </div>
          {!meId && <p className="session-card__hint">Pick your name first</p>}

          <div className="field session-card__note-field">
            <label className="field__label session-card__note-label" htmlFor={`note-${event.id}`}>
              Note (optional)
            </label>
            <textarea
              id={`note-${event.id}`}
              className="textarea session-card__note"
              rows={2}
              maxLength={NOTE_MAX}
              placeholder="Running 10 min late, bringing a friend…"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <div className="session-card__note-row">
              <span
                className={['session-card__note-count', 'tabular', note.length > NOTE_MAX - 20 && 'is-near']
                  .filter(Boolean)
                  .join(' ')}
              >
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
        </div>
      )}

      <div className="session-card__groups">
        <AnswerGroup title="Going" entries={going} tone="going" />
        <AnswerGroup title="Can't" entries={cant} tone="cant" />
        <AnswerGroup title="No reply yet" entries={noReply} tone="none" />
      </div>
    </Card>
  )
}
