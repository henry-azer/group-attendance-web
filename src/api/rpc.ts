// One typed function per RPC in supabase/migrations/0001_init.sql. Parameter names on the wire
// (p_share, p_admin, ...) match the SQL exactly; the camelCase option objects here are just a
// nicer call shape for the rest of the app. Domain return shapes come from src/domain/types.ts;
// shapes that aren't modelled there (create_group's codes, admin_rename_group, occurrence
// skip/unskip, admin_mark_attendance) are declared locally below.
//
// There is no admin_list_past_occurrences RPC — history.occurrences (admin_get_history) already
// carries past-occurrence + checked state.
import { callRpc, type Result } from './client.ts'
import type {
  AdminGroup,
  AdminMember,
  Event,
  History,
  PublicGroup,
  Session,
  Status,
} from '../domain/types.ts'

export type { ApiError, Result } from './client.ts'

export interface CreateGroupCodes {
  share_code: string
  admin_code: string
}

export interface RenameGroupResult {
  name: string
  timezone: string
}

export interface OccurrenceSkipResult {
  event_id: string
  occurrence_date: string
  skipped: boolean
  reason: string | null
}

export interface AttendanceMark {
  member_id: string
  attended: boolean
}

export interface MarkAttendanceResult {
  event_id: string
  occurrence_date: string
  attendance: AttendanceMark[]
}

export interface EventInput {
  id?: string | null
  title: string
  location?: string | null
  kind: 'once' | 'weekly'
  starts_on: string
  weekdays?: number[] | null
  start_time: string
  ends_on?: string | null
}

export function ping(): Promise<Result<string>> {
  return callRpc<string>('ping', {})
}

export function createGroup(params: {
  name: string
  timezone: string
  members: string[]
}): Promise<Result<CreateGroupCodes>> {
  return callRpc<CreateGroupCodes>('create_group', {
    p_name: params.name,
    p_timezone: params.timezone,
    p_members: params.members,
  })
}

export function getGroupPublic(share: string): Promise<Result<PublicGroup>> {
  return callRpc<PublicGroup>('get_group_public', { p_share: share })
}

export function submitResponse(params: {
  share: string
  event: string
  date: string
  member: string
  status: Status
  note?: string | null
}): Promise<Result<Session>> {
  return callRpc<Session>('submit_response', {
    p_share: params.share,
    p_event: params.event,
    p_date: params.date,
    p_member: params.member,
    p_status: params.status,
    p_note: params.note ?? null,
  })
}

export function adminGetGroup(admin: string): Promise<Result<AdminGroup>> {
  return callRpc<AdminGroup>('admin_get_group', { p_admin: admin })
}

export function adminRenameGroup(params: {
  admin: string
  name: string
  timezone?: string | null
}): Promise<Result<RenameGroupResult>> {
  return callRpc<RenameGroupResult>('admin_rename_group', {
    p_admin: params.admin,
    p_name: params.name,
    p_timezone: params.timezone ?? null,
  })
}

export function adminUpsertMember(params: {
  admin: string
  id?: string | null
  name: string
}): Promise<Result<AdminMember>> {
  return callRpc<AdminMember>('admin_upsert_member', {
    p_admin: params.admin,
    p_id: params.id ?? null,
    p_name: params.name,
  })
}

export function adminDeactivateMember(params: {
  admin: string
  id: string
}): Promise<Result<AdminMember>> {
  return callRpc<AdminMember>('admin_deactivate_member', {
    p_admin: params.admin,
    p_id: params.id,
  })
}

export function adminUpsertEvent(params: {
  admin: string
  event: EventInput
}): Promise<Result<Event>> {
  return callRpc<Event>('admin_upsert_event', {
    p_admin: params.admin,
    p_event: params.event,
  })
}

export function adminEndEvent(params: { admin: string; id: string }): Promise<Result<Event>> {
  return callRpc<Event>('admin_end_event', { p_admin: params.admin, p_id: params.id })
}

export function adminSkipOccurrence(params: {
  admin: string
  event: string
  date: string
  reason?: string | null
}): Promise<Result<OccurrenceSkipResult>> {
  return callRpc<OccurrenceSkipResult>('admin_skip_occurrence', {
    p_admin: params.admin,
    p_event: params.event,
    p_date: params.date,
    p_reason: params.reason ?? null,
  })
}

export function adminUnskipOccurrence(params: {
  admin: string
  event: string
  date: string
}): Promise<Result<OccurrenceSkipResult>> {
  return callRpc<OccurrenceSkipResult>('admin_unskip_occurrence', {
    p_admin: params.admin,
    p_event: params.event,
    p_date: params.date,
  })
}

export function adminSetResponse(params: {
  admin: string
  event: string
  date: string
  member: string
  status: Status | null
  note?: string | null
}): Promise<Result<Session>> {
  return callRpc<Session>('admin_set_response', {
    p_admin: params.admin,
    p_event: params.event,
    p_date: params.date,
    p_member: params.member,
    p_status: params.status,
    p_note: params.note ?? null,
  })
}

export function adminMarkAttendance(params: {
  admin: string
  event: string
  date: string
  marks: AttendanceMark[]
}): Promise<Result<MarkAttendanceResult>> {
  return callRpc<MarkAttendanceResult>('admin_mark_attendance', {
    p_admin: params.admin,
    p_event: params.event,
    p_date: params.date,
    p_marks: params.marks,
  })
}

export function adminGetHistory(admin: string, from?: string): Promise<Result<History>> {
  return callRpc<History>('admin_get_history', { p_admin: admin, p_from: from ?? null })
}
