// A handful of stroke icons on a 20px grid. Stroke-only so they take the text colour they sit in.
import type { ReactNode } from 'react'

export type IconName = 'check' | 'x' | 'clock' | 'pin' | 'chevron' | 'copy' | 'share' | 'arrow'

const PATHS: Record<IconName, ReactNode> = {
  check: <path d="M4.5 10.5l3.5 3.5 7.5-8" />,
  x: <path d="M5.5 5.5l9 9M14.5 5.5l-9 9" />,
  clock: (
    <>
      <circle cx="10" cy="10" r="7" />
      <path d="M10 6.5V10l2.5 1.5" />
    </>
  ),
  pin: (
    <>
      <path d="M10 17.5s5.5-5 5.5-9.25a5.5 5.5 0 10-11 0C4.5 12.5 10 17.5 10 17.5z" />
      <circle cx="10" cy="8.25" r="2" />
    </>
  ),
  chevron: <path d="M7.5 5l5 5-5 5" />,
  copy: (
    <>
      <rect x="7" y="7" width="9.5" height="9.5" rx="2" />
      <path d="M13 7V5.5a2 2 0 00-2-2H5.5a2 2 0 00-2 2V11a2 2 0 002 2H7" />
    </>
  ),
  share: (
    <>
      <path d="M10 12.5V3M6.5 6.5L10 3l3.5 3.5" />
      <path d="M5 10v5.5a1.5 1.5 0 001.5 1.5h7a1.5 1.5 0 001.5-1.5V10" />
    </>
  ),
  arrow: <path d="M4 10h12M11 5l5 5-5 5" />,
}

export function Icon({ name, size = 20, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg
      className={['icon', className].filter(Boolean).join(' ')}
      viewBox="0 0 20 20"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  )
}
