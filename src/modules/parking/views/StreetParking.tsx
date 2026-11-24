// Parking along the streets picked (Decision "Street parking by side"):
//   ParkingPills         (hidden with Street parking, views/layers) on the Flow plan, for each street picked (a click, Shift+click for more) that cars use: a P
//                        pill on each of its sides, past its stalls; filled where that side has stalls, empty where
//                        not. A click turns that side on or off along the whole street; one undo step
//   StreetParkingSection in Properties, for every street picked: Both · None · As the option at once
// Controls that create follow the typology (Decision "What is not there is not shown"): both show while parking is
// offered, so a new project, which starts with none, can begin. Every edit is one verb through `actions`.
import type { KeyboardEvent } from 'react'
import type { DerivedRoad } from '../../../engine/types.ts'
import type { Point, StreetParking } from '../../../model/schema.ts'
import { standardsOf } from '../../../engine/circulation/standards.ts'
import { centreShift } from '../../../engine/circulation/streets.ts'
import { actions } from '../../../state/actions/index.ts'
import { useApp } from '../../../state/store.ts'
import { Segmented } from '../../../views/controls/Segmented.tsx'
import { useModule } from '../../../views/modules.ts'
import { pickedIds, runsOf, useRoads } from '../../../views/plan/circulation/roadState.ts'
import { STREET_PARKING } from '../../../views/layers/keys.ts'
import { useHidden } from '../../../views/layers/layerView.ts'
import { useShown } from '../../../views/viewport/look.ts'
import { hasSide, parkingOf, roadSides, segmentSides, withSide } from '../engine/parking.ts'

/** px: the pill, and its gap past the stalls. */
const PILL_W_PX = 30
const PILL_H_PX = 18
const PILL_GAP_PX = 14

/** The streets picked that cars use: a trucks' street has no stalls. */
function useCarStreets(): DerivedRoad[] {
  // the two apart: a list made anew on each read would never settle
  const picked = useRoads((s) => s.picked)
  const also = useRoads((s) => s.also)
  const roads = useShown((s) => s.derived.circulation.roads)
  return pickedIds({ picked, also }).flatMap((id) => runsOf(roads, id)).filter((r) => r.vehicles !== 'trucks')
}

/** The option's side (its own, else the standards'), as each street's segments without their own take it. */
function useOptionSide() {
  const project = useApp((s) => s.project)
  const optionId = useApp((s) => s.option)
  const option = project.options.find((o) => o.id === optionId)
  return parkingOf(standardsOf(project, option), option)
}

/**
 * The streets given these sides, one step: each street's segments, turned back to their own way. A locked segment keeps its own (the padlock
 * holds its fields), so a street with some segments locked is set by its free ones, as its other Properties fields are.
 */
function setSides(streets: DerivedRoad[], sides: (r: DerivedRoad) => (StreetParking | null)[]) {
  const { apply, option, project } = useApp.getState()
  const held = new Set(project.options.find((o) => o.id === option)?.streets?.segments.filter((g) => g.locked === true).map((g) => g.id))
  const all = Object.fromEntries(Object.entries<StreetParking | null>(Object.assign({}, ...streets.map((r) => segmentSides(r, sides(r))))).filter(([id]) => !held.has(id)))
  apply((p) => actions.setStreetParking(p, option, all))
}

/** Where a street's pills go: the middle of its longest segment (on its centre line: the drawn one shifted by its side,
 *  Decision "Drawing side"), and the way it runs there. */
function pillAnchor(r: DerivedRoad): { at: Point; left: Point } | null {
  const q = r.nodePoints ?? r.points
  let best = -1
  let bestLen = 0
  for (let i = 0; i + 1 < q.length; i++) {
    const l = Math.hypot(q[i + 1].x - q[i].x, q[i + 1].y - q[i].y)
    if (l > bestLen) [best, bestLen] = [i, l]
  }
  if (best < 0) return null
  const u = { x: (q[best + 1].x - q[best].x) / bestLen, y: (q[best + 1].y - q[best].y) / bestLen }
  const d = r.nodePoints ? centreShift(r) : 0
  return { at: { x: (q[best].x + q[best + 1].x) / 2 - u.y * d, y: (q[best].y + q[best + 1].y) / 2 + u.x * d }, left: { x: -u.y, y: u.x } }
}

export function ParkingPills({ px }: { px: number }) {
  const { offered } = useModule('parking')
  const streets = useCarStreets()
  const side = useOptionSide()
  const depth = useApp((s) => standardsOf(s.project).stallDepth)
  const hidden = useHidden(STREET_PARKING)
  if (hidden || !offered || streets.length === 0) return null
  const w = PILL_W_PX * px
  const h = PILL_H_PX * px
  return (
    <g data-layer="parking-pills">
      {streets.flatMap((r) => {
        const a = pillAnchor(r)
        if (!a) return []
        const sides = roadSides(r, side)
        return (['left', 'right'] as const).map((which) => {
          const on = sides.every((x) => hasSide(x, which))
          const k = (which === 'left' ? 1 : -1) * (r.width / 2 + depth + PILL_GAP_PX * px)
          const c = { x: a.at.x + a.left.x * k, y: a.at.y + a.left.y * k }
          const toggle = () => setSides([r], () => sides.map((x) => withSide(x, which, !on)))
          return (
            <g
              key={`${r.id}-${which}`}
              role="button"
              tabIndex={0}
              aria-pressed={on}
              aria-label={`Car stalls on this side of the street: ${on ? 'on' : 'off'}`}
              data-parking-pill={`${r.id}:${which}`}
              style={{ cursor: 'pointer' }}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation()
                toggle()
              }}
              onKeyDown={(e: KeyboardEvent) => {
                if (e.key !== 'Enter' && e.key !== ' ') return
                e.preventDefault()
                toggle()
              }}
            >
              <title>{on ? 'Stalls on this side: click to take them away' : 'No stalls on this side: click to add them'}</title>
              <rect x={c.x - w / 2} y={-c.y - h / 2} width={w} height={h} rx={h / 2} fill={on ? 'var(--ink)' : 'var(--panel)'} stroke="var(--ink)" strokeWidth={1.25} vectorEffect="non-scaling-stroke" />
              <text x={c.x} y={-c.y} textAnchor="middle" dominantBaseline="central" fontSize={11 * px} fontWeight={600} fill={on ? 'var(--on-ink)' : 'var(--ink)'} pointerEvents="none">
                {on ? 'P ✓' : '+ P'}
              </text>
            </g>
          )
        })
      })}
    </g>
  )
}

type Choice = 'both' | 'none' | 'option'

/** Both · None · As the option, for every street picked; one side is the plan's pills. */
export function StreetParkingSection({ road, muted }: { road: DerivedRoad; muted: string }) {
  const { offered } = useModule('parking')
  const streets = useCarStreets()
  const count = useRoads((s) => (s.picked === null ? 0 : 1 + s.also.length))
  const side = useOptionSide()
  if (!offered) return null
  if (road.vehicles === 'trucks' && streets.length === 0)
    return <p className={`select-text text-caption ${muted}`}>A trucks’ street has no car stalls along it.</p>
  if (streets.length === 0) return null
  const all = streets.flatMap((r) => roadSides(r, side))
  const own = streets.some((r) => r.parking?.some((x) => x !== null))
  const ownAll = streets.every((r) => (r.segments ?? []).every((_, i) => r.parking?.[i] != null))
  const value: Choice | 'mixed' = !own ? 'option' : ownAll && all.every((x) => x === 'both') ? 'both' : ownAll && all.every((x) => x === 'none') ? 'none' : 'mixed'
  const choose = (c: Choice) => setSides(streets, (r) => (r.segments ?? []).map(() => (c === 'option' ? null : c)))
  return (
    <div className="flex flex-col gap-2" aria-label="Street parking">
      <div className="flex justify-between gap-3 text-body">
        <span className={`text-label ${muted}`}>Car stalls along {count > 1 ? `${count} streets` : 'it'}</span>
      </div>
      <Segmented<Choice | 'mixed'>
        kind="toggle"
        label="Car stalls along the streets picked"
        stretch
        value={value}
        onChange={(k) => k !== 'mixed' && choose(k)}
        options={[
          { key: 'both', label: 'Both' },
          { key: 'none', label: 'None' },
          { key: 'option', label: 'As the option' },
        ]}
      />
      <p className={`select-text text-caption ${muted}`}>
        One side: its P on the plan.{value === 'mixed' ? ' Now: by side.' : ''} Shift+click picks more streets.
      </p>
    </div>
  )
}
