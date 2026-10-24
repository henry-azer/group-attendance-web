import { describe, expect, it } from 'vitest'
import { parseMemberNames } from './names.ts'

describe('parseMemberNames', () => {
  it('trims names and reports case-insensitive duplicates', () => {
    expect(parseMemberNames(' Omar\n\nomar \n Ali')).toEqual({
      names: ['Omar', 'Ali'],
      duplicates: ['omar'],
    })
  })

  it('returns a clean trimmed list with no duplicates', () => {
    expect(parseMemberNames('Ali\nOmar\nSara')).toEqual({
      names: ['Ali', 'Omar', 'Sara'],
      duplicates: [],
    })
  })

  it('ignores blank lines and surrounding whitespace', () => {
    expect(parseMemberNames('\n  \nAli\n   \n')).toEqual({
      names: ['Ali'],
      duplicates: [],
    })
  })

  it('returns empty results for empty input', () => {
    expect(parseMemberNames('')).toEqual({ names: [], duplicates: [] })
  })

  it('reports more than one distinct duplicate', () => {
    expect(parseMemberNames('Ali\nali\nSara\nSARA\nSara')).toEqual({
      names: ['Ali', 'Sara'],
      duplicates: ['ali', 'sara'],
    })
  })
})
