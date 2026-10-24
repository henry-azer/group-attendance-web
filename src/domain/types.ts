// Mirrors the jsonb shapes returned by the Supabase RPCs in supabase/migrations/0001_init.sql.
// Field names are snake_case to match the real SQL output exactly. Dates are 'YYYY-MM-DD'
// strings, timestamps are ISO strings (see event_json / member_json / session_json /
// admin_get_history in the migration).

export type Status = 'going' | 'cant'

export interface Event {
  id: string
  series_id: string
  title: string
  location: string | null
  kind: 'once' | 'weekly'
  starts_on: string
  weekdays: number[] | null
  start_time: string
  ends_on: string | null
  active: boolean
}

export interface Answer {
  member_id: string
  status: Status
  note: string | null
}

// session_json: occurrence_date/starts_at are null when the event has no upcoming occurrence.
export interface Session {
  event: Event
  occurrence_date: string | null
  starts_at: string | null
  answers: Answer[]
}

export interface PublicMember {
  id: string
  name: string
}

// get_group_public
export interface PublicGroup {
  name: string
  timezone: string
  members: PublicMember[]
  sessions: Session[]
}

// member_json
export interface AdminMember {
  id: string
  name: string
  active: boolean
  joined_at: string
  left_at: string | null
}

// admin_get_group
export interface AdminGroup {
  id: string
  name: string
  timezone: string
  share_code: string
  members: AdminMember[]
  events: Event[]
  sessions: Session[]
}

export interface HistoryOccurrence {
  event_id: string
  series_id: string
  occurrence_date: string
  starts_at: string
  skipped: boolean
  checked: boolean
}

export interface HistoryResponse {
  event_id: string
  occurrence_date: string
  member_id: string
  status: Status
  note: string | null
  first_answered_at: string
  updated_at: string
}

export interface HistoryAttendance {
  event_id: string
  occurrence_date: string
  member_id: string
  attended: boolean
}

// admin_get_history
export interface History {
  members: AdminMember[]
  events: Event[]
  occurrences: HistoryOccurrence[]
  responses: HistoryResponse[]
  attendance: HistoryAttendance[]
}

// ---------------------------------------------------------------------------
// Insights (computed client-side; see src/domain/insights.ts)
// ---------------------------------------------------------------------------

export interface SessionStat {
  date: string
  startsAt: string
  expected: number
  came: number
  cant: number
  noReply: number
  checked: boolean
}

export interface MemberStat {
  memberId: string
  name: string
  active: boolean
  expected: number
  came: number
  pct: number
  recentPct: number
  currentStreak: number
  longestStreak: number
  noReplyPct: number
  saidGoing: number
  reliabilityPct: number | null
  noShows: number
  walkIns: number
}

export interface SeriesInsights {
  sessions: SessionStat[]
  avgAttendancePct: number
  avgHeadcount: number
  members: MemberStat[]
  byWeekday: { weekday: number; pct: number; sessions: number }[]
  avgLeadHours: number | null
  uncheckedCount: number
}
