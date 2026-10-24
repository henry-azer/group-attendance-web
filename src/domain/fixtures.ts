import type { History } from './types.ts'

// One weekly series ("Practice", Mondays 18:00).
//
// Occurrences, in order:
//   09-07  checked   (all 3 then-expected members present)
//   09-14  checked   (all 3 then-expected members present)
//   09-21  checked   (Bob joins here: one no-show (Bob), one walk-in (Cara))
//   09-28  unchecked (Cara still expected; Dee says can't)
//   10-05  unchecked (Cara has left; Bob says can't)
//   10-12  unchecked (Dee gives no reply)
//   10-19  SKIPPED   (would otherwise be a 7th past session)
//   10-26  future    (after `now`, not yet counted)
//
// `now` for tests is 2026-10-23T12:00:00Z, so the first 6 dates above are past and
// not skipped ("counts only past non-skipped sessions" => sessions.length === 6),
// 10-19 is past but skipped (excluded), and 10-26 is still in the future (excluded).
//
// Members:
//   Alice — joined well before 09-07, never left  => expected in all 6 sessions
//   Bob   — joined 2026-09-18 (between 09-14 and 09-21) => expected in 4 sessions
//   Cara  — joined before 09-07, left 2026-09-30 (between 09-28 and 10-05) => expected in 4
//   Dee   — joined well before 09-07, never left  => expected in all 6 sessions
// => expected per member, in (Alice, Bob, Cara, Dee) order: 6, 4, 4, 6.

export const seriesId = 'series-practice'
const eventId = 'event-practice'

export const memberAlice = {
  id: 'member-alice',
  name: 'Alice',
  active: true,
  joined_at: '2026-08-01T00:00:00Z',
  left_at: null,
}
export const memberBob = {
  id: 'member-bob',
  name: 'Bob',
  active: true,
  joined_at: '2026-09-18T00:00:00Z',
  left_at: null,
}
export const memberCara = {
  id: 'member-cara',
  name: 'Cara',
  active: false,
  joined_at: '2026-08-01T00:00:00Z',
  left_at: '2026-09-30T00:00:00Z',
}
export const memberDee = {
  id: 'member-dee',
  name: 'Dee',
  active: true,
  joined_at: '2026-08-01T00:00:00Z',
  left_at: null,
}

export const now = new Date('2026-10-23T12:00:00Z')

export function buildHistory(): History {
  return {
    members: [memberAlice, memberBob, memberCara, memberDee],
    events: [
      {
        id: eventId,
        series_id: seriesId,
        title: 'Practice',
        location: 'Gym',
        kind: 'weekly',
        starts_on: '2026-09-07',
        weekdays: [1],
        start_time: '18:00',
        ends_on: null,
        active: true,
      },
    ],
    occurrences: [
      { event_id: eventId, series_id: seriesId, occurrence_date: '2026-09-07', starts_at: '2026-09-07T18:00:00Z', skipped: false, checked: true },
      { event_id: eventId, series_id: seriesId, occurrence_date: '2026-09-14', starts_at: '2026-09-14T18:00:00Z', skipped: false, checked: true },
      { event_id: eventId, series_id: seriesId, occurrence_date: '2026-09-21', starts_at: '2026-09-21T18:00:00Z', skipped: false, checked: true },
      { event_id: eventId, series_id: seriesId, occurrence_date: '2026-09-28', starts_at: '2026-09-28T18:00:00Z', skipped: false, checked: false },
      { event_id: eventId, series_id: seriesId, occurrence_date: '2026-10-05', starts_at: '2026-10-05T18:00:00Z', skipped: false, checked: false },
      { event_id: eventId, series_id: seriesId, occurrence_date: '2026-10-12', starts_at: '2026-10-12T18:00:00Z', skipped: false, checked: false },
      { event_id: eventId, series_id: seriesId, occurrence_date: '2026-10-19', starts_at: '2026-10-19T18:00:00Z', skipped: true, checked: false },
      { event_id: eventId, series_id: seriesId, occurrence_date: '2026-10-26', starts_at: '2026-10-26T18:00:00Z', skipped: false, checked: false },
    ],
    responses: [
      // 09-07: Alice, Cara, Dee expected (Bob hasn't joined yet).
      { event_id: eventId, occurrence_date: '2026-09-07', member_id: memberAlice.id, status: 'going', note: null, first_answered_at: '2026-09-05T10:00:00Z', updated_at: '2026-09-05T10:00:00Z' },
      { event_id: eventId, occurrence_date: '2026-09-07', member_id: memberCara.id, status: 'going', note: null, first_answered_at: '2026-09-05T11:00:00Z', updated_at: '2026-09-05T11:00:00Z' },
      { event_id: eventId, occurrence_date: '2026-09-07', member_id: memberDee.id, status: 'going', note: null, first_answered_at: '2026-09-05T12:00:00Z', updated_at: '2026-09-05T12:00:00Z' },

      // 09-14: same expected set, all going.
      { event_id: eventId, occurrence_date: '2026-09-14', member_id: memberAlice.id, status: 'going', note: null, first_answered_at: '2026-09-12T10:00:00Z', updated_at: '2026-09-12T10:00:00Z' },
      { event_id: eventId, occurrence_date: '2026-09-14', member_id: memberCara.id, status: 'going', note: null, first_answered_at: '2026-09-12T11:00:00Z', updated_at: '2026-09-12T11:00:00Z' },
      { event_id: eventId, occurrence_date: '2026-09-14', member_id: memberDee.id, status: 'going', note: null, first_answered_at: '2026-09-12T12:00:00Z', updated_at: '2026-09-12T12:00:00Z' },

      // 09-21: Bob now expected too. Bob says going but is a no-show; Cara says can't
      // (with an escaping-worthy note) but walks in anyway.
      { event_id: eventId, occurrence_date: '2026-09-21', member_id: memberAlice.id, status: 'going', note: null, first_answered_at: '2026-09-19T10:00:00Z', updated_at: '2026-09-19T10:00:00Z' },
      { event_id: eventId, occurrence_date: '2026-09-21', member_id: memberBob.id, status: 'going', note: null, first_answered_at: '2026-09-19T09:00:00Z', updated_at: '2026-09-19T09:00:00Z' },
      { event_id: eventId, occurrence_date: '2026-09-21', member_id: memberCara.id, status: 'cant', note: 'busy, "maybe" later, sorry', first_answered_at: '2026-09-19T11:00:00Z', updated_at: '2026-09-19T11:00:00Z' },
      { event_id: eventId, occurrence_date: '2026-09-21', member_id: memberDee.id, status: 'going', note: null, first_answered_at: '2026-09-19T12:00:00Z', updated_at: '2026-09-19T12:00:00Z' },

      // 09-28: unchecked. Cara still expected (leaves after this one). Dee says can't.
      { event_id: eventId, occurrence_date: '2026-09-28', member_id: memberAlice.id, status: 'going', note: null, first_answered_at: '2026-09-26T10:00:00Z', updated_at: '2026-09-26T10:00:00Z' },
      { event_id: eventId, occurrence_date: '2026-09-28', member_id: memberBob.id, status: 'going', note: null, first_answered_at: '2026-09-26T09:00:00Z', updated_at: '2026-09-26T09:00:00Z' },
      { event_id: eventId, occurrence_date: '2026-09-28', member_id: memberCara.id, status: 'going', note: null, first_answered_at: '2026-09-26T11:00:00Z', updated_at: '2026-09-26T11:00:00Z' },
      { event_id: eventId, occurrence_date: '2026-09-28', member_id: memberDee.id, status: 'cant', note: null, first_answered_at: '2026-09-26T12:00:00Z', updated_at: '2026-09-26T12:00:00Z' },

      // 10-05: unchecked. Cara has left. Bob says can't.
      { event_id: eventId, occurrence_date: '2026-10-05', member_id: memberAlice.id, status: 'going', note: null, first_answered_at: '2026-10-03T10:00:00Z', updated_at: '2026-10-03T10:00:00Z' },
      { event_id: eventId, occurrence_date: '2026-10-05', member_id: memberBob.id, status: 'cant', note: null, first_answered_at: '2026-10-03T09:00:00Z', updated_at: '2026-10-03T09:00:00Z' },
      { event_id: eventId, occurrence_date: '2026-10-05', member_id: memberDee.id, status: 'going', note: null, first_answered_at: '2026-10-03T12:00:00Z', updated_at: '2026-10-03T12:00:00Z' },

      // 10-12: unchecked. Dee gives no reply.
      { event_id: eventId, occurrence_date: '2026-10-12', member_id: memberAlice.id, status: 'going', note: 'a note, with a comma', first_answered_at: '2026-10-10T10:00:00Z', updated_at: '2026-10-10T10:00:00Z' },
      { event_id: eventId, occurrence_date: '2026-10-12', member_id: memberBob.id, status: 'going', note: null, first_answered_at: '2026-10-10T09:00:00Z', updated_at: '2026-10-10T09:00:00Z' },

      // Stranded response: no matching occurrence for this series (schedule versioning
      // leftover). Must be ignored by computeInsights.
      { event_id: eventId, occurrence_date: '2026-08-03', member_id: memberAlice.id, status: 'going', note: null, first_answered_at: '2026-08-01T10:00:00Z', updated_at: '2026-08-01T10:00:00Z' },
    ],
    attendance: [
      // 09-07
      { event_id: eventId, occurrence_date: '2026-09-07', member_id: memberAlice.id, attended: true },
      { event_id: eventId, occurrence_date: '2026-09-07', member_id: memberCara.id, attended: true },
      { event_id: eventId, occurrence_date: '2026-09-07', member_id: memberDee.id, attended: true },
      // 09-14
      { event_id: eventId, occurrence_date: '2026-09-14', member_id: memberAlice.id, attended: true },
      { event_id: eventId, occurrence_date: '2026-09-14', member_id: memberCara.id, attended: true },
      { event_id: eventId, occurrence_date: '2026-09-14', member_id: memberDee.id, attended: true },
      // 09-21: Bob said going but didn't attend (no-show). Cara said can't but attended (walk-in).
      { event_id: eventId, occurrence_date: '2026-09-21', member_id: memberAlice.id, attended: true },
      { event_id: eventId, occurrence_date: '2026-09-21', member_id: memberBob.id, attended: false },
      { event_id: eventId, occurrence_date: '2026-09-21', member_id: memberCara.id, attended: true },
      { event_id: eventId, occurrence_date: '2026-09-21', member_id: memberDee.id, attended: true },
      // Stranded attendance row (same leftover occurrence_date as above) — must be ignored too.
      { event_id: eventId, occurrence_date: '2026-08-03', member_id: memberAlice.id, attended: true },
    ],
  }
}
