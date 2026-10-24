// Pure parsing for the Create page's "one member per line" textarea. Case-insensitive duplicate
// detection (so "Omar" / "omar" collide); the first-seen casing wins and later repeats are
// reported as duplicates instead of being added twice.

export interface ParsedMemberNames {
  names: string[]
  duplicates: string[]
}

export function parseMemberNames(text: string): ParsedMemberNames {
  const seen = new Set<string>()
  const duplicates = new Set<string>()
  const names: string[] = []

  for (const line of text.split('\n')) {
    const name = line.trim()
    if (!name) continue
    const key = name.toLowerCase()
    if (seen.has(key)) {
      duplicates.add(key)
      continue
    }
    seen.add(key)
    names.push(name)
  }

  return { names, duplicates: Array.from(duplicates) }
}
