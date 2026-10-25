// Stacked headcount-per-session chart for the Insights tab. One column per session: came (solid
// accent, bottom), can't (solid muted warm tone), no reply (outline only, line-strong) — stacked
// bottom to top so "came" is always easiest to compare across sessions. An unchecked session gets
// a hatched overlay (its numbers come from answers, not a checked-in headcount) with a legend note
// explaining that. Each column carries its exact numbers two ways: a visible <title> (mouse hover)
// and an aria-label on a dedicated hit rect (screen readers) — the visible segments themselves are
// aria-hidden so the count isn't announced twice.
import { formatInsightDateLabel } from '../../lib/format.ts'
import type { SessionStat } from '../../domain/types.ts'
import { EmptyState } from '../../ui/index.ts'

export interface HeadcountBarsProps {
  sessions: SessionStat[]
}

const BAR_WIDTH = 28
const BAR_GAP = 14
const CHART_HEIGHT = 140
const TOP_PADDING = 10
const SEGMENT_GAP = 1.5

function sessionLabel(s: SessionStat): string {
  return `${formatInsightDateLabel(s.date)}: ${s.came} came of ${s.expected}`
}

export function HeadcountBars({ sessions }: HeadcountBarsProps) {
  if (sessions.length === 0) {
    return <EmptyState title="No past sessions yet" />
  }

  const maxExpected = Math.max(1, ...sessions.map((s) => s.expected))
  const plotHeight = CHART_HEIGHT - TOP_PADDING
  const viewBoxWidth = sessions.length * (BAR_WIDTH + BAR_GAP) + BAR_GAP
  // Only count a session toward the legend note if it would actually render the hatch overlay —
  // a zero-expected session never does (see the per-session render below), so an unchecked session
  // with nothing expected shouldn't claim "based on answers" when there's no hatch on the chart.
  const hasUnchecked = sessions.some((s) => !s.checked && s.expected > 0)

  const scale = (count: number) => (count / maxExpected) * plotHeight

  return (
    <div className="headcount-bars">
      <svg
        className="headcount-bars__chart"
        viewBox={`0 0 ${viewBoxWidth} ${CHART_HEIGHT}`}
        width="100%"
        role="group"
        aria-label="Headcount per session"
      >
        <defs>
          <pattern
            id="headcount-hatch"
            width="6"
            height="6"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <line x1="0" y1="0" x2="0" y2="6" stroke="var(--line-strong)" strokeWidth="2" />
          </pattern>
        </defs>

        {sessions.map((s, i) => {
          const x = BAR_GAP + i * (BAR_WIDTH + BAR_GAP)
          const cameHeight = Math.max(0, scale(s.came) - (s.came > 0 ? SEGMENT_GAP : 0))
          const cantHeight = Math.max(0, scale(s.cant) - (s.cant > 0 ? SEGMENT_GAP : 0))
          const noReplyHeight = Math.max(0, scale(s.noReply) - (s.noReply > 0 ? SEGMENT_GAP : 0))

          const cameY = CHART_HEIGHT - cameHeight
          // Each segment owns `scale(n)` of the column and draws `scale(n) - gap` of it, stacked
          // bottom-up: came, then can't, then no reply.
          const cantY = CHART_HEIGHT - scale(s.came) - cantHeight
          const noReplyY = CHART_HEIGHT - scale(s.came) - scale(s.cant) - noReplyHeight

          const label = sessionLabel(s)

          return (
            <g key={`${s.date}-${i}`}>
              {s.expected === 0 ? (
                // Nothing was expected at this session — a hatched full-height bar here would
                // read as "everyone missing", which is misleading. A thin baseline tick keeps the
                // session's place in the x-axis without implying any headcount at all.
                <rect
                  aria-hidden="true"
                  className="headcount-bars__seg headcount-bars__seg--baseline"
                  x={x}
                  y={CHART_HEIGHT - 2}
                  width={BAR_WIDTH}
                  height={2}
                  rx={1}
                />
              ) : (
                <>
                  {s.came > 0 && (
                    <rect
                      aria-hidden="true"
                      className="headcount-bars__seg headcount-bars__seg--came"
                      x={x}
                      y={cameY}
                      width={BAR_WIDTH}
                      height={cameHeight}
                      rx={2}
                    />
                  )}
                  {s.cant > 0 && (
                    <rect
                      aria-hidden="true"
                      className="headcount-bars__seg headcount-bars__seg--cant"
                      x={x}
                      y={cantY}
                      width={BAR_WIDTH}
                      height={cantHeight}
                      rx={2}
                    />
                  )}
                  {s.noReply > 0 && (
                    <rect
                      aria-hidden="true"
                      className="headcount-bars__seg headcount-bars__seg--noreply"
                      x={x + 1}
                      y={noReplyY}
                      width={BAR_WIDTH - 2}
                      height={Math.max(noReplyHeight, 2)}
                      rx={2}
                    />
                  )}
                  {!s.checked && (
                    <rect
                      aria-hidden="true"
                      className="headcount-bars__seg headcount-bars__seg--hatch"
                      x={x}
                      y={0}
                      width={BAR_WIDTH}
                      height={CHART_HEIGHT}
                      fill="url(#headcount-hatch)"
                      rx={2}
                    />
                  )}
                </>
              )}
              <rect
                role="img"
                aria-label={label}
                className="headcount-bars__hit"
                x={x}
                y={0}
                width={BAR_WIDTH}
                height={CHART_HEIGHT}
                fill="transparent"
              >
                <title>{label}</title>
              </rect>
            </g>
          )
        })}
      </svg>

      <ul className="headcount-bars__legend">
        <li className="headcount-bars__legend-item">
          <span className="headcount-bars__swatch headcount-bars__swatch--came" aria-hidden="true" />
          Came
        </li>
        <li className="headcount-bars__legend-item">
          <span className="headcount-bars__swatch headcount-bars__swatch--cant" aria-hidden="true" />
          Can't
        </li>
        <li className="headcount-bars__legend-item">
          <span className="headcount-bars__swatch headcount-bars__swatch--noreply" aria-hidden="true" />
          No reply
        </li>
        {hasUnchecked && (
          <li className="headcount-bars__legend-item">
            <span className="headcount-bars__swatch headcount-bars__swatch--hatch" aria-hidden="true" />
            Unchecked — based on answers
          </li>
        )}
      </ul>
    </div>
  )
}
