// Initials avatar with a stable per-name tint. The hue is derived from the name, so "Omar" is the
// same colour on every screen and every device; lightness/chroma come from tokens so the tint
// flips correctly in dark mode. Always decorative — the name is rendered next to it as text.
import type { CSSProperties } from 'react'

export interface AvatarProps {
  name: string
  size?: 'sm' | 'md'
  className?: string
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return Array.from(parts[0])[0]!.toUpperCase()
  return (Array.from(parts[0])[0]! + Array.from(parts[parts.length - 1])[0]!).toUpperCase()
}

export function nameHue(name: string): number {
  let hash = 0
  for (const ch of name.toLowerCase()) hash = (hash * 31 + ch.codePointAt(0)!) >>> 0
  return hash % 360
}

export function Avatar({ name, size = 'md', className }: AvatarProps) {
  const style = { '--h': nameHue(name) } as CSSProperties
  return (
    <span
      className={['avatar', `avatar--${size}`, className].filter(Boolean).join(' ')}
      style={style}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  )
}
