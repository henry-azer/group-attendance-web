import { describe, expect, it } from 'vitest'
import { toCsv } from './csv.ts'
import { buildHistory } from './fixtures.ts'
import type { History } from './types.ts'

describe('toCsv', () => {
  it('starts with the required header', () => {
    const csv = toCsv(buildHistory())
    const [header] = csv.split('\n')
    expect(header).toBe('event,date,member,answer,note,came')
  })

  it('escapes commas and quotes in notes', () => {
    const csv = toCsv(buildHistory())
    const lines = csv.split('\n')
    // Cara's 09-21 note contains a comma and double quotes: `busy, "maybe" later, sorry`
    const caraLine = lines.find((l) => l.includes('2026-09-21') && l.includes('Cara'))
    expect(caraLine).toBeDefined()
    expect(caraLine).toContain('"busy, ""maybe"" later, sorry"')

    // Alice's 10-12 note contains a comma: `a note, with a comma`
    const aliceLine = lines.find((l) => l.includes('2026-10-12') && l.includes('Alice'))
    expect(aliceLine).toBeDefined()
    expect(aliceLine).toContain('"a note, with a comma"')
  })

  it('fills in the came column from attendance, blank when unmarked', () => {
    const csv = toCsv(buildHistory())
    const lines = csv.split('\n')
    // 09-21 is checked: Bob said going but did not attend -> came=false.
    const bobChecked = lines.find((l) => l.includes('2026-09-21') && l.includes('Bob'))
    expect(bobChecked).toBe('Practice,2026-09-21,Bob,going,,false')
    // 10-05 is unchecked: no attendance row at all -> came is blank.
    const bobUnchecked = lines.find((l) => l.includes('2026-10-05') && l.includes('Bob'))
    expect(bobUnchecked).toBe('Practice,2026-10-05,Bob,cant,,')
  })

  it('emits one row per valid response, in order, excluding the stranded one', () => {
    const csv = toCsv(buildHistory())
    const lines = csv.split('\n')
    // buildHistory() includes one stranded response (2026-08-03, no matching occurrence),
    // which toCsv must drop, so there's one fewer row than there are responses.
    expect(lines.length).toBe(buildHistory().responses.length)
    expect(csv).not.toContain('2026-08-03')
  })

  it('returns just the header for a history with no responses', () => {
    const empty: History = { members: [], events: [], occurrences: [], responses: [], attendance: [] }
    expect(toCsv(empty)).toBe('event,date,member,answer,note,came')
  })

  it('excludes rows for a stranded occurrence and for a skipped occurrence', () => {
    const h: History = {
      members: [{ id: 'm1', name: 'Alice', active: true, joined_at: '2026-01-01T00:00:00Z', left_at: null }],
      events: [
        {
          id: 'e1',
          series_id: 's1',
          title: 'Game',
          location: null,
          kind: 'once',
          starts_on: '2026-01-05',
          weekdays: null,
          start_time: '10:00',
          ends_on: null,
          active: true,
        },
      ],
      occurrences: [
        { event_id: 'e1', series_id: 's1', occurrence_date: '2026-01-05', starts_at: '2026-01-05T10:00:00Z', skipped: false, checked: false },
        { event_id: 'e1', series_id: 's1', occurrence_date: '2026-01-12', starts_at: '2026-01-12T10:00:00Z', skipped: true, checked: false },
        // Note: no occurrence at all for 2026-01-19 (stranded).
      ],
      responses: [
        { event_id: 'e1', occurrence_date: '2026-01-05', member_id: 'm1', status: 'going', note: null, first_answered_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
        { event_id: 'e1', occurrence_date: '2026-01-12', member_id: 'm1', status: 'going', note: null, first_answered_at: '2026-01-08T00:00:00Z', updated_at: '2026-01-08T00:00:00Z' },
        { event_id: 'e1', occurrence_date: '2026-01-19', member_id: 'm1', status: 'going', note: null, first_answered_at: '2026-01-15T00:00:00Z', updated_at: '2026-01-15T00:00:00Z' },
      ],
      attendance: [
        { event_id: 'e1', occurrence_date: '2026-01-12', member_id: 'm1', attended: true },
        { event_id: 'e1', occurrence_date: '2026-01-19', member_id: 'm1', attended: true },
      ],
    }
    const csv = toCsv(h)
    const lines = csv.split('\n')
    expect(lines).toEqual(['event,date,member,answer,note,came', 'Game,2026-01-05,Alice,going,,'])
  })
})

describe('toCsv formula-injection protection', () => {
  function singleRowHistory(note: string, memberName: string): History {
    return {
      members: [{ id: 'm1', name: memberName, active: true, joined_at: '2026-01-01T00:00:00Z', left_at: null }],
      events: [
        {
          id: 'e1',
          series_id: 's1',
          title: 'Game',
          location: null,
          kind: 'once',
          starts_on: '2026-01-05',
          weekdays: null,
          start_time: '10:00',
          ends_on: null,
          active: true,
        },
      ],
      occurrences: [{ event_id: 'e1', series_id: 's1', occurrence_date: '2026-01-05', starts_at: '2026-01-05T10:00:00Z', skipped: false, checked: false }],
      responses: [
        {
          event_id: 'e1',
          occurrence_date: '2026-01-05',
          member_id: 'm1',
          status: 'going',
          note,
          first_answered_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
      ],
      attendance: [],
    }
  }

  it('prefixes a formula-triggering note with a single quote', () => {
    const csv = toCsv(singleRowHistory('=HYPERLINK("x")', 'Alice'))
    const [, row] = csv.split('\n')
    // The note cell, once unwrapped from CSV quoting, starts with '=.
    expect(row).toBe('Game,2026-01-05,Alice,going,"\'=HYPERLINK(""x"")",')
  })

  it('prefixes a formula-triggering member name with a single quote', () => {
    const csv = toCsv(singleRowHistory('all good', '+1 Guest'))
    const [, row] = csv.split('\n')
    expect(row).toBe("Game,2026-01-05,'+1 Guest,going,all good,")
  })

  it('leaves a normal value unchanged', () => {
    const csv = toCsv(singleRowHistory('see you there', 'Alice'))
    const [, row] = csv.split('\n')
    expect(row).toBe('Game,2026-01-05,Alice,going,see you there,')
  })
})
