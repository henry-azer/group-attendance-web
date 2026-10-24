// A small circular percentage gauge for stat tiles (avg attendance %, reliability, ...). Purely
// decorative alongside the numeric label that's always rendered as real text next to it — the ring
// is a glance-able magnitude cue, never the only way to read the value (dataviz: status/magnitude
// is never color- or shape-alone).
export interface MeterProps {
  value: number // 0-100
  label: string
  size?: number
}

const STROKE = 6

export function Meter({ value, label, size = 56 }: MeterProps) {
  const clamped = Math.max(0, Math.min(100, value))
  const radius = (size - STROKE) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference * (1 - clamped / 100)
  const center = size / 2

  return (
    <svg
      className="meter"
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={label}
    >
      <circle
        className="meter__track"
        cx={center}
        cy={center}
        r={radius}
        strokeWidth={STROKE}
        fill="none"
      />
      <circle
        className="meter__value"
        cx={center}
        cy={center}
        r={radius}
        strokeWidth={STROKE}
        fill="none"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${center} ${center})`}
      />
      <text className="meter__text" x={center} y={center} textAnchor="middle" dominantBaseline="central">
        {Math.round(clamped)}%
      </text>
    </svg>
  )
}
