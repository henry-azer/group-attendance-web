// In-memory hand-off from CreatePage to CreatedPage. Deliberately not URL/storage: the admin code
// must never appear in the URL, and the codes screen should disappear on an actual page reload
// (this module-level variable resets with the JS runtime, which is exactly what we want — a
// refresh of #/created shows "nothing to show" rather than resurrecting stale codes).
export interface CreatedGroupInfo {
  name: string
  shareCode: string
  adminCode: string
}

let current: CreatedGroupInfo | null = null

export function setCreatedGroup(info: CreatedGroupInfo): void {
  current = info
}

export function getCreatedGroup(): CreatedGroupInfo | null {
  return current
}
