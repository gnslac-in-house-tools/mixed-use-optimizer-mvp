// Dimensions anchored to mass corners follow them, and a dimension with a fixed length (its `locked` field: not the masses'
// padlock, which is CAD's) keeps its length (Decisions "Associative
// dimensions" and "Locks, typed measures, levels"; port of Plaza-Practiko `estado/acotacionesAsociativas.ts`, without
// levels). Pure: the store runs it on every edit through `settle.ts`, so a dimension follows a mass while it is
// dragged, not only on release. `a` and `b` are kept up to date, so what draws a dimension never reads the anchors.
//   a moved, resized or rotated mass    → the anchored end goes to the same corner (same index)
//   a corner added or deleted elsewhere → the anchor follows its corner to its new index
//   its corner deleted, its mass deleted → the end lets go and stays where it was
//   a fixed-length dimension between two masses → moving one drags the other along (in a chain)
//   an edit that changes a fixed-length dimension's length → refused
import type { Dimension, DimensionAnchor, Id, Mass, Point, Project } from '../model/schema.ts'
import { footprintContour } from '../engine/geom/footprint.ts'
import { moveMass } from './actions/masses.ts'

export const LOCKED_DIMENSION = 'A dimension with a fixed length keeps it: free its length to change it.'

/** Two corners closer than this are the same corner (a corner added or deleted elsewhere moves no other). */
const SAME_PLACE = 1e-6
/** A locked dimension may change its length by this much (rounding), no more. */
const TOLERANCE = 1e-6

const near = (a: Point, b: Point) => Math.abs(a.x - b.x) <= SAME_PLACE && Math.abs(a.y - b.y) <= SAME_PLACE
const length = (d: Pick<Dimension, 'a' | 'b'>) => Math.hypot(d.b.x - d.a.x, d.b.y - d.a.y)
const cornersOf = (m: Mass) => footprintContour(m.footprint).vertices
const anchored = (d: Dimension) => d.anchorA !== undefined || d.anchorB !== undefined

/** The vector if the mass moved as a whole (every corner by the same amount, not zero); null if not. */
function translation(before: Mass, after: Mass): Point | null {
  const was = cornersOf(before)
  const now = cornersOf(after)
  if (was.length !== now.length || was.length === 0) return null
  const v = { x: now[0].x - was[0].x, y: now[0].y - was[0].y }
  if (Math.abs(v.x) < 1e-12 && Math.abs(v.y) < 1e-12) return null
  for (let i = 1; i < was.length; i++) {
    if (Math.abs(now[i].x - was[i].x - v.x) > 1e-9 || Math.abs(now[i].y - was[i].y - v.y) > 1e-9) return null
  }
  return v
}

/** The anchor on the edited mass: the same index if it has as many corners; if not, the corner still in its place. */
function followAnchor(k: DimensionAnchor, before: Mass | undefined, after: Mass | undefined): DimensionAnchor | null {
  if (!after) return null
  const now = cornersOf(after)
  if (!before) return k.vertex < now.length ? k : null
  const was = cornersOf(before)
  if (was.length === now.length) return k.vertex < now.length ? k : null
  const where = was[k.vertex]
  if (!where) return null
  const i = now.findIndex((q) => near(q, where))
  return i < 0 ? null : i === k.vertex ? k : { massId: k.massId, vertex: i }
}

/**
 * The dimensions after an edit: `{ project }` (`after` itself when nothing had to follow) or `{ refused }` when it
 * would change a locked dimension's length.
 */
export function adjustDimensions(before: Project, after: Project): { project: Project } | { refused: string } {
  const dims = after.dimensions
  if (!dims?.length || before.masses === after.masses || !dims.some(anchored)) return { project: after }

  const was = new Map(before.masses.map((m) => [m.id, m]))
  const massesOf = (p: Project) => new Map(p.masses.map((m) => [m.id, m]))

  // 1. A lock between two masses: when one moved as a whole, the other comes along (in a chain)
  let p = after
  let now = massesOf(p)
  const moved = new Map<Id, Point>()
  for (const m of after.masses) {
    const b = was.get(m.id)
    const v = b && b !== m ? translation(b, m) : null
    if (v) moved.set(m.id, v)
  }
  const queue = [...moved.keys()]
  while (queue.length > 0) {
    const id = queue.shift()!
    const v = moved.get(id)!
    for (const d of dims) {
      if (!d.locked || !d.anchorA || !d.anchorB) continue
      const other = d.anchorA.massId === id ? d.anchorB.massId : d.anchorB.massId === id ? d.anchorA.massId : null
      // the other one comes along only if the edit did not touch it (if it did, its length is checked below)
      if (other === null || other === id || moved.has(other) || now.get(other) !== was.get(other)) continue
      p = moveMass(p, other, v)
      now = massesOf(p)
      moved.set(other, v)
      queue.push(other)
    }
  }

  // 2. Each dimension follows its corners; a locked one with a single anchor takes its free end along with the mass
  let changed = p !== after
  const end = (k: DimensionAnchor | undefined, q: Point): { k: DimensionAnchor | undefined; q: Point } => {
    if (!k) return { k, q }
    // a mass the edit did not reshape does not move its anchors (a renamed mass keeps its footprint)
    const b = was.get(k.massId)
    const a = now.get(k.massId)
    if (b && a && b.footprint === a.footprint) return { k, q }
    const s = followAnchor(k, b, a)
    if (!s) return { k: undefined, q }
    const v = cornersOf(a!)[s.vertex]
    return { k: s, q: v.x === q.x && v.y === q.y ? q : { x: v.x, y: v.y } }
  }
  const next = dims.map((d) => {
    if (!anchored(d)) return d
    const ea = end(d.anchorA, d.a)
    const eb = end(d.anchorB, d.b)
    let a = ea.q
    let b = eb.q
    if (d.locked && (ea.k === undefined) !== (eb.k === undefined)) {
      const v = moved.get((ea.k ?? eb.k)!.massId)
      if (v && ea.k === undefined) a = { x: a.x + v.x, y: a.y + v.y }
      if (v && eb.k === undefined) b = { x: b.x + v.x, y: b.y + v.y }
    }
    if (a === d.a && b === d.b && ea.k === d.anchorA && eb.k === d.anchorB) return d
    changed = true
    const { anchorA: _a, anchorB: _b, ...rest } = d
    return { ...rest, a, b, ...(ea.k ? { anchorA: ea.k } : {}), ...(eb.k ? { anchorB: eb.k } : {}) }
  })

  // 3. The lock: no locked dimension changes its length
  for (let i = 0; i < dims.length; i++) {
    if (dims[i].locked && Math.abs(length(next[i]) - length(dims[i])) > TOLERANCE) return { refused: LOCKED_DIMENSION }
  }
  return { project: changed ? { ...p, dimensions: next } : after }
}
