// The block plan's window and crossing selection (Decision "Multi-selection", BE.9): the main plan's rule
// (views/plan/windowSelect.ts `picks`: left → right a window, what is fully inside; right → left a crossing, what it
// touches) over what a block's plan can pick: column lines by their bubbles, docks, doors and patterns by their point
// on the wall, truck courts, zones and holes. Pure: the block's frame (m, y up) in, picks out.
import type { Id, Point, Polygon, WarehouseType } from '../../../model/schema.ts'
import { picks, type Box } from '../../../views/plan/windowSelect.ts'
import type { Generated } from '../engine/generate.ts'
import { courtsOf } from './handleMath.ts'
import type { Picked } from './warehouseState.ts'

/** A column line's bubble: `line` along `axis`, its middle `at`. */
export interface Bubble {
  axis: 'x' | 'y'
  line: number
  at: Point
}

/** The bubbles of the block's column lines, two a line, `pad` m out of its box (as its plan draws them). */
export function bubblesOf(g: Pick<Generated, 'box' | 'runs'>, pad: number): Bubble[] {
  const { x0, y0, x1, y1 } = g.box
  return [
    ...g.runs.x.lines.flatMap((x, line) => [y0 - pad, y1 + pad].map((y) => ({ axis: 'x' as const, line, at: { x, y } }))),
    ...g.runs.y.lines.flatMap((y, line) => [x0 - pad, x1 + pad].map((x) => ({ axis: 'y' as const, line, at: { x, y } }))),
  ]
}

/**
 * The block's truck courts as their plan draws them (`courtsOf`), each by its edge: one polygon for each court of a wall, its contour when it has a shape
 * of its own (Phase D.3), so a press between two courts of one wall is on neither. Picking one picks the wall's (`Picked` names the edge).
 */
export function courtPolygons(t: Pick<WarehouseType, 'court' | 'courts'>, g: Pick<Generated, 'edges' | 'doors'>, standard: number): { edge: Id; polygon: Polygon }[] {
  return courtsOf(t, g, standard).flatMap((c) => c.parts.map((part) => ({ edge: c.edge.id, polygon: part.polygon })))
}

/**
 * What a box picks on a block's plan: a window (a.x < b.x) what is fully inside it, a crossing what it touches. A
 * column line by either of its `bubbles` (once), an element by its point on its wall, a court (`courts`, from
 * `courtPolygons`), a zone by its pieces, a hole by its contour.
 */
export function pickedInBox(g: Generated, box: Box, bubbles: Bubble[], courts: { edge: Id; polygon: Polygon }[] = []): Picked[] {
  const out: Picked[] = []
  const lines = new Set<string>()
  for (const b of bubbles) {
    const id = `${b.axis}${b.line}`
    if (lines.has(id) || !picks([b.at], box)) continue
    lines.add(id)
    out.push({ kind: 'line', id, axis: b.axis, line: b.line })
  }
  for (const d of g.doors) if (picks([d.at], box) && !out.some((p) => p.kind === 'element' && p.id === d.element)) out.push({ kind: 'element', id: d.element })
  // a wall of several courts is picked once
  for (const c of courts) if (picks(c.polygon, box) && !out.some((p) => p.kind === 'court' && p.id === c.edge)) out.push({ kind: 'court', id: c.edge })
  const crossing = box.b.x < box.a.x
  for (const z of g.zones) {
    const hit = (p: Polygon) => picks(p, box)
    if (z.pieces.length && (crossing ? z.pieces.some(hit) : z.pieces.every(hit))) out.push({ kind: 'zone', id: z.id })
  }
  for (const h of g.holes) {
    if (picks(h.vertices.map((v) => ({ x: v.x, y: v.y })), box)) out.push({ kind: 'hole', id: h.id })
  }
  return out
}
