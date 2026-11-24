// The brief's rules on the plan (Decision "Rules": the massing shows them): a light arc per relation between the
// masses the plan shows, styled by kind as in the Graph's legend, red when broken. Overlays' *Rules* turns them on or
// off (layers/keys.ts `RULES`, Decisions "Issues on the massing", "Bottom bar"): on, only the broken ones (a rule
// that is met goes out). What was measured shows at a broken arc's middle when the
// warnings' chips are off (when on, its chip sits there). It never takes a press: the masses under it stay the plan's.
import { centroid } from '../../engine/geom/polygon.ts'
import { useApp } from '../../state/store.ts'
import { useShown } from '../viewport/look.ts'
import { edgePath, LINE_LOOK } from '../graph/diagram.ts'
import { ISSUES, RULES } from '../layers/keys.ts'
import { useHidden } from '../layers/layerView.ts'

export function RulesLayer({ px }: { px: number }) {
  const arcsHidden = useHidden(RULES)
  const markers = !useHidden(ISSUES)
  const relations = useShown((s) => s.derived.relations)
  const masses = useShown((s) => s.derived.masses)
  const level = useApp((s) => s.level)
  if (arcsHidden) return null
  // the plan draws y up as −y: the arcs are built on the drawn points
  const drawn = (id: string) => {
    const c = centroid(masses[id].polygon)
    return { x: c.x, y: -c.y }
  }
  const shown = relations.filter((x) => !x.met && masses[x.a] && masses[x.b] && (masses[x.a].levelId === level || masses[x.b].levelId === level))
  return (
    <g pointerEvents="none" data-rules-layer="">
      {shown.map((x) => {
        const { d, mid } = edgePath(drawn(x.a), drawn(x.b), 0, 0, 'curved')
        const look = LINE_LOOK[x.kind]
        const color = x.kind === 'attached' ? 'var(--ink-secondary)' : x.met ? 'var(--status-within)' : 'var(--status-over)'
        return (
          <g key={x.id} data-rule-arc={x.id} data-met={x.met}>
            <path
              d={d}
              fill="none"
              stroke={color}
              strokeOpacity={x.met ? 0.55 : 0.9}
              strokeWidth={look.width * 0.6 * px}
              strokeDasharray={look.dash?.split(' ').map((v) => Number(v) * px).join(' ')}
              strokeLinecap="round"
            />
            {!x.met && !markers && (
              <text
                x={mid.x}
                y={mid.y}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={11 * px}
                fill={color}
                stroke="var(--panel)"
                strokeWidth={4 * px}
                paintOrder="stroke"
              >
                {x.kind === 'adjacent' ? `${Math.round(x.value)} m of wall` : `${Math.round(x.value)} m`}
              </text>
            )}
          </g>
        )
      })}
    </g>
  )
}
