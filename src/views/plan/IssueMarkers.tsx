// The warnings beside the masses on the Massing plan (Decisions "Issues on the massing" and "Issues, one list";
// issueMarkers.ts says where):
//   IssueMarkers  in the plan's SVG: a round chip per place, its count (or !), solid red for an error, red ring for a
//                 warning, the same size at any zoom; its tooltip says its messages. A click (or Enter) opens the
//                 Summary's Issues tab with that place's issues picked (the one place that says what to do about
//                 them); the picked place's chip has a thicker ring. It never starts a drag or a selection window.
//   IssueHighlight  while the warnings chip is pressed: every place with issues marked in red (its masses outlined,
//                 its chip ringed), to find them on the plan; the chips show then even with the drafting bar's
//                 *Issues* off.
// On while the drafting bar's *Issues* is (layers/keys.ts `ISSUES`), or the chip is pressed.
import { useMemo } from 'react'
import type { Point } from '../../model/schema.ts'
import { useApp } from '../../state/store.ts'
import { ISSUES } from '../layers/keys.ts'
import { useHidden } from '../layers/layerView.ts'
import { showIssues } from '../stats/issueCommands.ts'
import { issueMarkers, useIssueFocus } from './issueMarkers.ts'

function useMarkers() {
  const issues = useApp((s) => s.derived.issues)
  const masses = useApp((s) => s.derived.masses)
  const level = useApp((s) => s.level)
  return useMemo(() => issueMarkers(issues, masses, level), [issues, masses, level])
}

export function IssueMarkers({ px }: { px: number }) {
  const on = !useHidden(ISSUES)
  const highlight = useIssueFocus((s) => s.highlight)
  const picked = useIssueFocus((s) => s.key)
  const markers = useMarkers()
  if (!on && !highlight) return null
  return (
    <g data-issue-markers="">
      {highlight && <IssueHighlight px={px} />}
      {markers.map((m) => {
        const error = m.severity === 'error'
        const n = m.issues.length
        const label = `${n === 1 ? '1 issue' : `${n} issues`} here: ${m.issues.map((i) => i.message).join(' ')}`
        const open = () => showIssues(m.key)
        return (
          <g
            key={m.key}
            data-issue-marker={m.key}
            data-severity={m.severity}
            role="button"
            tabIndex={0}
            aria-label={label}
            aria-pressed={picked === m.key}
            className="cursor-pointer outline-none"
            onPointerDown={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation()
              open()
            }}
            onKeyDown={(e) => {
              if (e.key !== 'Enter' && e.key !== ' ') return
              e.preventDefault()
              open()
            }}
          >
            <title>{`${m.issues.map((i) => i.message).join('\n')}\n(a click shows ${n === 1 ? 'it' : 'them'} in Issues)`}</title>
            {/* a light ring, so the chip reads over a mass's colour */}
            <circle cx={m.at.x} cy={m.at.y} r={12.5 * px} fill="var(--panel)" opacity={0.9} />
            <circle
              cx={m.at.x}
              cy={m.at.y}
              r={10 * px}
              fill={error ? 'var(--status-over)' : 'var(--panel)'}
              stroke="var(--status-over)"
              strokeWidth={(picked === m.key ? 3 : 1.5) * px}
            />
            <text
              x={m.at.x}
              y={m.at.y}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={12 * px}
              fontWeight={700}
              fill={error ? 'var(--on-ink)' : 'var(--status-over)'}
              pointerEvents="none"
            >
              {n === 1 ? '!' : n}
            </text>
          </g>
        )
      })}
    </g>
  )
}

/** Every place with issues on this level, in red: its masses outlined, a pulsing ring round its chip. */
function IssueHighlight({ px }: { px: number }) {
  const markers = useMarkers()
  const masses = useApp((s) => s.derived.masses)
  const level = useApp((s) => s.level)
  const ids = [...new Set(markers.flatMap((m) => m.issues.flatMap((i) => i.massIds)))].filter((id) => masses[id]?.levelId === level && masses[id].polygon.length >= 3)
  const drawn = (q: Point) => `${q.x},${-q.y}`
  return (
    <g data-issue-highlight="" pointerEvents="none">
      {ids.map((id) => (
        <polygon
          key={id}
          data-issue-mass={id}
          points={masses[id].polygon.map(drawn).join(' ')}
          fill="var(--status-over)"
          fillOpacity={0.12}
          stroke="var(--status-over)"
          strokeWidth={3}
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {markers.map((m) => (
        <circle key={m.key} cx={m.at.x} cy={m.at.y} r={18 * px} fill="none" stroke="var(--status-over)" strokeWidth={2} vectorEffect="non-scaling-stroke">
          <animate attributeName="r" values={`${14 * px};${26 * px};${14 * px}`} dur="1.4s" repeatCount="indefinite" />
        </circle>
      ))}
    </g>
  )
}
