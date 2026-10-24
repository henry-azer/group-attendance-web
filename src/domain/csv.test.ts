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

  it('emits one row per response, in order', () => {
    const csv = toCsv(buildHistory())
    const lines = csv.split('\n')
    expect(lines.length).toBe(1 + buildHistory().responses.length)
  })

  it('returns just the header for a history with no responses', () => {
    const empty: History = { members: [], events: [], occurrences: [], responses: [], attendance: [] }
    expect(toCsv(empty)).toBe('event,date,member,answer,note,came')
  })
})
