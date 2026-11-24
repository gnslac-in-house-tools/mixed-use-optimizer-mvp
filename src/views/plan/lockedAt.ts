// What is under a point of the plan, by its place (Phase AS.4, Decision "Padlocks by kind"): a note and a dimension, a reference line (Phase AS.5), a gate, a street, a lot, or an existing road, as the plan draws them,
// from the one drawn on top down. Two things ask it, as `lockedMassAt` / `massAtPoint` (massCommands.ts) answer for the masses:
//   lockedThingAt   the locked street, lot or gate under a press of the background: a locked thing is seen and not picked, so its press is the background's (a
//                   window, a pan) and a click on it only says it is locked (the notice). A street with only some segments locked is mixed, not locked: it is picked.
//   thingAt         what a right-click finds with a tool in hand (the layers let the pointer through to the tool): the same, locked or not, to pick it and open its menu.
// Hidden things (an eye of Layers) are not on the plan, so they are not found. `px`: metres per screen pixel, for the reach of a thin line and of a handle.
import { existingRoads } from '../../engine/circulation/streets.ts'
import { distancePointSegment, pointInPolygon } from '../../engine/geom/polygon.ts'
import type { Ref } from '../../kinds/types.ts'
import type { Point } from '../../model/schema.ts'
import { useApp } from '../../state/store.ts'
import { isObjectHidden, REFERENCE_LINES, roadHidden } from '../layers/keys.ts'
import { hiddenNow, useLayerView } from '../layers/layerView.ts'
import { isRefLocked } from '../layers/locks.ts'
import { noteBox } from './annotations/noteLook.ts'
import { streetIdOf } from './circulation/roadState.ts'

/** How far from a dimension's line a point still touches it (px). */
const DIMENSION_REACH_PX = 8
/**
 * The radius (px) of a gate's hit circle on the plan: the transparent circle round its handle that takes the press (`access/AccessLayer.tsx` draws it with this). A press anywhere
 * in it is a free gate's pick, so it is a locked gate's notice too: one number for both.
 */
export const GATE_HIT_PX = 22
/** How near a reference line a point counts (px): its transparent stroke is this wide on the plan (`annotations/ReferenceLinesLayer.tsx`). */
const GUIDE_REACH_PX = 6

const distanceToLine = (q: Point, line: Point[]): number => {
  let best = Infinity
  for (let i = 0; i + 1 < line.length; i++) best = Math.min(best, distancePointSegment(q, line[i], line[i + 1]))
  return best
}

/** The notes, dimensions, reference lines, gates, streets, lots and existing roads under `q`, the one on top first (the order the plan draws them in, reversed: the lines come where they are drawn, over the masses *On top*, else with the site's own). */
export function thingsAt(q: Point, px: number): Ref[] {
  const { project, derived, level, showAll } = useApp.getState()
  if (showAll) return []
  const off = hiddenNow()
  const out: Ref[] = []
  // the notes are drawn over the dimensions: the text's box (as the plan sizes it at this zoom) is what is hit
  for (const n of project.notes ?? []) {
    if (n.levelId === level && !isObjectHidden(off, 'note', n.id) && pointInPolygon(q, noteBox(n, px).polygon)) out.push({ kind: 'note', id: n.id })
  }
  for (const d of project.dimensions ?? []) {
    if (d.levelId === level && !isObjectHidden(off, 'dimension', d.id) && distancePointSegment(q, d.a, d.b) <= DIMENSION_REACH_PX * px) out.push({ kind: 'dimension', id: d.id })
  }
  // the project's reference lines (no level, every option): over the design's when *On top*, else under it with the site's own
  const guides = (): void => {
    for (const r of project.referenceLines ?? []) {
      if (!isObjectHidden(off, 'reference-line', r.id) && distanceToLine(q, r.points) <= GUIDE_REACH_PX * px) out.push({ kind: 'reference-line', id: r.id })
    }
  }
  const onTop = useLayerView.getState().onTop.includes(REFERENCE_LINES)
  if (onTop) guides()
  // the gates are drawn above the roads (their handles stand on a street's edge), so they come first
  for (const g of derived.circulation.gates) {
    if (!isObjectHidden(off, 'gate', g.id) && Math.hypot(q.x - g.at.x, q.y - g.at.y) <= GATE_HIT_PX * px) out.push({ kind: 'gate', id: g.id })
  }
  for (const r of derived.circulation.roads) {
    // the street, by its id (a widened street is several runs: one thing)
    if (r.kind === 'street' && !roadHidden(off, r) && distanceToLine(q, r.points) <= r.width / 2 && !out.some((o) => o.kind === 'street' && o.id === streetIdOf(r))) out.push({ kind: 'street', id: streetIdOf(r) })
  }
  for (const l of derived.circulation.lots) {
    if (!isObjectHidden(off, 'lot', l.id) && l.polygon.length >= 3 && pointInPolygon(q, l.polygon)) out.push({ kind: 'lot', id: l.id })
  }
  // the site's own, under the design's: an existing road by its paving's width
  for (const r of existingRoads(project.site)) {
    const id = r.sourceId ?? r.id
    if (!isObjectHidden(off, 'existing-road', id) && distanceToLine(q, r.points) <= r.width / 2 && !out.some((o) => o.kind === 'existing-road' && o.id === id)) out.push({ kind: 'existing-road', id })
  }
  if (!onTop) guides()
  return out
}

/** The first thing under `q` (the one on top), or null. */
export const thingAt = (q: Point, px: number): Ref | null => thingsAt(q, px)[0] ?? null

/** The locked street, lot or gate under `q`, if any: a click on it picks nothing and says it is locked. */
export const lockedThingAt = (q: Point, px: number): Ref | null => thingsAt(q, px).find(isRefLocked) ?? null
