// Massing's graph (Decision "Graph in Massing"; the user: "maybe it is seeing the geometries ghosted when the graph is
// on"): while Show's *Graph* is on, the plan ghosts the masses (PlanSvg.tsx) and this layer draws the graph
// over them, where they are, so it can never pile up:
//   a bubble per design mass of the level, at its middle: a white ring round its program's colour, its name under it;
//     it drags its mass as the mass itself does (and a press picks it)
//   a line per relation the rules make, from bubble to bubble, as the Graph's legend draws its kind, green when met
//     and red when broken; what was measured beside it (a broken one's chip sits at its middle instead, when the
//     chips are on); a click picks it, and Properties says how it stands (*Edit the rule* goes to the Rules step)
// The lines are always curved, so a broken rule's chip (issueMarkers.ts) sits on its line.
import type { Id, Point } from '../../model/schema.ts'
import { centroid } from '../../engine/geom/polygon.ts'
import type { Relation } from '../../engine/graph/relations.ts'
import { useApp } from '../../state/store.ts'
import { massDrawn, planBuilding } from '../buildingView.ts'
import { ISSUES } from '../layers/keys.ts'
import { useHidden, useLayerView } from '../layers/layerView.ts'
import { bubbleBox, edgePath, labelSpot, LINE_LOOK, type Box } from '../graph/diagram.ts'
import { useGraph } from '../graph/graphState.ts'
import type { Drag } from './useDrag.ts'

const R = 10 // px: a bubble's radius
const m = (v: number) => `${Math.round(v)} m`

/** What a relation's line says: what was measured. */
export function relationShort(x: Relation): string {
  if (x.kind === 'adjacent') return x.met ? `${m(x.value)} wall` : `${m(x.value)} of wall`
  if (x.kind === 'attached') return 'moves with'
  return m(x.value)
}

/** `bind`: a bubble drags its mass; without it (the masses answer nothing: Flow, a look) the bubbles only show. */
export function GraphLayer({ px, bind }: { px: number; bind?(id: Id): ReturnType<Drag['bind']> }) {
  const project = useApp((s) => s.project)
  const derived = useApp((s) => s.derived)
  const level = useApp((s) => s.level)
  const option = useApp((s) => s.option)
  const selected = useApp((s) => s.selection.massIds)
  const picked = useGraph((s) => s.relation)
  const markers = !useHidden(ISSUES)
  const hidden = useLayerView((s) => s.hidden)

  // the bubbles follow the masses: drawn when the masses are (a hidden building's are not, but the one the plan is on stays drawn)
  const shown = project.options.find((o) => o.id === option)?.buildingIds ?? []
  const planOn = planBuilding(project, level)
  const masses = Object.values(derived.masses).filter(
    (x) => x.levelId === level && !x.context && x.polygon.length >= 3 && shown.includes(x.buildingId) && massDrawn(derived.masses, x.id, hidden, planOn),
  )
  const own = new Map(project.masses.map((x) => [x.id, x]))
  const colorOf = (id: Id) => project.programs.find((g) => g.id === own.get(id)?.programId)?.color ?? 'var(--fill)'
  // drawn on the plan's points (y down)
  const at = (id: Id): Point => {
    const c = centroid(derived.masses[id].polygon)
    return { x: c.x, y: -c.y }
  }
  const relations = derived.relations.filter((x) => derived.masses[x.a] && derived.masses[x.b] && (derived.masses[x.a].levelId === level || derived.masses[x.b].levelId === level))
  // labels keep off the bubbles and their names, and off one another
  const taken: Box[] = masses.map((x) => bubbleBox({ r: R * px, label: x.name.length * 12 * 0.56 * px }, at(x.id), 0))
  const lines = relations.map((x) => {
    // centre to centre, as the chips' arcs: the bubbles cover the ends
    const path = edgePath(at(x.a), at(x.b), 0, 0, 'curved')
    const label = relationShort(x)
    const chip = !x.met && markers
    const w = (label.length * 11 * 0.56 + 8) * px
    const h = 14 * px
    const spot = chip ? path.mid : labelSpot(path.at, w, h, taken)
    if (!chip) taken.push({ x0: spot.x - w / 2, y0: spot.y - h / 2, x1: spot.x + w / 2, y1: spot.y + h / 2 })
    return { x, d: path.d, spot, label, chip }
  })

  // a pick shows in Properties when its tab is open (Decision "Properties on the rail")
  const pick = (id: string) => useGraph.getState().selectRelation(id)

  return (
    <g data-graph-layer="">
      {lines.map(({ x, d, spot, label, chip }) => {
        const look = LINE_LOOK[x.kind]
        const color = x.kind === 'attached' ? 'var(--ink-secondary)' : x.met ? 'var(--status-within)' : 'var(--status-over)'
        const on = picked === x.id
        return (
          <g key={x.id} data-relation={x.id} data-met={x.met}>
            <path d={d} fill="none" stroke="var(--panel)" strokeWidth={(look.width + 4) * px} strokeLinecap="round" opacity={0.8} pointerEvents="none" />
            <path
              d={d}
              fill="none"
              stroke={color}
              strokeWidth={(on ? look.width + 2 : look.width) * px}
              strokeDasharray={look.dash?.split(' ').map((v) => Number(v) * px).join(' ')}
              strokeLinecap="round"
              pointerEvents="none"
            />
            <path
              d={d}
              fill="none"
              stroke="transparent"
              strokeWidth={14 * px}
              className="cursor-pointer"
              aria-label={`${label}: ${x.met ? 'met' : 'broken'}`}
              onPointerDown={(e) => {
                e.stopPropagation()
                pick(x.id)
              }}
            />
            {!chip && (
              <text
                x={spot.x}
                y={spot.y}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={11 * px}
                fill={color}
                stroke="var(--panel)"
                strokeWidth={4 * px}
                paintOrder="stroke"
                pointerEvents="none"
              >
                {label}
              </text>
            )}
          </g>
        )
      })}
      {masses.map((x) => {
        const p = at(x.id)
        const on = selected.includes(x.id)
        return (
          <g key={x.id} data-graph-bubble={x.id} className={bind ? 'cursor-grab' : undefined} {...bind?.(x.id)}>
            <circle cx={p.x} cy={p.y} r={R * px} fill="var(--panel)" stroke={on ? 'var(--ink)' : 'var(--ink-tertiary)'} strokeWidth={(on ? 2.5 : 1) * px} />
            <circle cx={p.x} cy={p.y} r={R * 0.68 * px} fill={colorOf(x.id)} />
            <text
              x={p.x}
              y={p.y + (R + 13) * px}
              textAnchor="middle"
              fontSize={12 * px}
              fill="var(--ink)"
              stroke="var(--panel)"
              strokeWidth={4 * px}
              paintOrder="stroke"
              pointerEvents="none"
            >
              {x.name}
            </text>
          </g>
        )
      })}
    </g>
  )
}
