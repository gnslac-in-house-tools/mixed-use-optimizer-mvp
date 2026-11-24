// A truck court with a shape follows its wall when the outline changes (Phase D.3, task 3; Decision "Truck court"): it keeps its place on the
// plan along the wall's line, its wall side clipped to the wall that is left, cut by pieces where a bump splits its wall, dropped (and said)
// where the wall turns angled or leaves it none; a court with no shape follows as it always did (courts.test.ts). On a type (the block
// editor) and on a copy (the site); the three callers of `followCourts`.
import { describe, expect, it } from 'vitest'
import type { Contour, CourtByEdge, Project, WarehouseType } from '../../../model/schema.ts'
import { footprintPolygon } from '../../../engine/geom/footprint.ts'
import { editShape } from '../../../state/actions/shape.ts'
import { demoProject } from '../../../state/demo.ts'
import { addWarehouseType, lockWarehouseStep, moveBlockEdge, placeWarehouse, shapeWarehouse } from '../actions.ts'
import { courtsFollowed, courtsOnAngled } from '../engine/elements.ts'
import { courtDepth, faceSpan, fromWall, toWall, wallFrame } from '../engine/courts.ts'
import { fromPlace, onPlace } from '../engine/copies.ts'
import { generate, typeWith } from '../engine/generate.ts'

function start(courts: CourtByEdge[]) {
  const base = demoProject()
  const made = addWarehouseType(base)
  let p = made.project
  for (const s of ['grid', 'hall', 'columns', 'envelope'] as const) p = lockWarehouseStep(p, made.id, s)
  p = { ...p, warehouseTypes: p.warehouseTypes!.map((t) => (t.id === made.id ? { ...t, courts } : t)) }
  return { p, id: made.id, option: base.options[0].id }
}
const typeRef = (id: string) => ({ kind: 'block-type', id })
const typeIn = (p: Project, id: string): WarehouseType => p.warehouseTypes!.find((t) => t.id === id)!
const edgeOf = (t: WarehouseType, edge: string) => generate(t).edges.find((e) => e.id === edge)!
/** A wall's face from corner to corner in its frame: where a court's wall side may stand (the plan's call, task 6: the block editor's rule and the site's are one). */
const faceOf = (t: WarehouseType, edge: string) => faceSpan(edgeOf(t, edge), generate(t).walls)!
const rect = (x0: number, y0: number, x1: number, y1: number): Contour => ({
  vertices: [
    { x: x0, y: y0, r: 0 },
    { x: x1, y: y0, r: 0 },
    { x: x1, y: y1, r: 0 },
    { x: x0, y: y1, r: 0 },
  ],
})
const near = (a: number, b: number, tol = 1e-6) => expect(Math.abs(a - b), `${a} vs ${b}`).toBeLessThan(tol)
/** The wall side of a court: its corners on the wall (y 0), x from lowest to highest. */
const wallSide = (c: Contour | undefined): [number, number] => {
  const on = c!.vertices.filter((v) => Math.abs(v.y) < 1e-9).map((v) => v.x)
  return [Math.min(...on), Math.max(...on)]
}

describe('a shaped court follows its wall on a type', () => {
  it('a wall pushed out 3 m: the court goes with it, its shape the same', () => {
    const shape = { vertices: [{ x: 10, y: 0, r: 0 }, { x: 60, y: 0, r: 0 }, { x: 60, y: 30, r: 0, chamfer: [6, 6] as [number, number] }, { x: 10, y: 30, r: 0 }] }
    const { p, id } = start([{ edge: 'e1', id: 'c1', shape }])
    const r = editShape(p, typeRef(id), { op: 'push', wall: 0, by: 3, free: true })
    expect(r.reason).toBeUndefined()
    const t = typeIn(r.project, id)
    expect(t.courts).toEqual([{ edge: 'e1', id: 'c1', shape }])
    // the wall did move: the block is 3 m wider than it was
    near(t.hall.width - typeIn(p, id).hall.width, 3, 1e-3)
  })

  it('the wall shortened at its start by 6 m: the court keeps its place on the plan, re-based', () => {
    const { p, id } = start([{ edge: 'e1', id: 'c1', shape: rect(20, 0, 60, 30) }])
    const r = editShape(p, typeRef(id), { op: 'vertex', vertex: 0, to: { x: 5.7, y: -0.3 } })
    expect(r.reason).toBeUndefined()
    const before = edgeOf(typeIn(p, id), 'e1')
    const after = edgeOf(typeIn(r.project, id), 'e1')
    const t = typeIn(r.project, id)
    expect(t.courts).toHaveLength(1)
    expect(t.courts![0]).toMatchObject({ edge: 'e1', id: 'c1' })
    // the same two points of the plan: the court's wall side ends, before and after
    const shift = r.shift ?? { x: 0, y: 0 }
    const [lo, hi] = wallSide(t.courts![0].shape)
    for (const [was, now] of [[20, lo], [60, hi]] as const) {
      const old = fromWall(wallFrame(before), { x: was, y: 0 })
      const to = toWall(wallFrame(after), { x: old.x + shift.x, y: old.y + shift.y })
      near(now, to.x, 1e-6)
    }
    // the wall lost about 6 m at its start, so the court is about 6 m closer to it
    expect(20 - lo).toBeGreaterThan(5)
    expect(20 - lo).toBeLessThan(7)
    near(courtDepth(t.courts![0].shape!), 30)
  })

  it('its wall side clipped to the wall that is left', () => {
    const { p, id } = start([{ edge: 'e1', id: 'c1', shape: rect(0, 0, 200, 30) }])
    const r = editShape(p, typeRef(id), { op: 'vertex', vertex: 0, to: { x: 5.7, y: -0.3 } })
    const t = typeIn(r.project, id)
    const L = wallFrame(edgeOf(t, 'e1')).length
    const face = faceOf(t, 'e1')
    const [lo, hi] = wallSide(t.courts![0].shape)
    // its start held to the wall's face, a wall's thickness before its reference line's start at a convex corner (what the site's court spans); its end is where the court stood (the wall's end did not move)
    near(lo, face.lo, 1e-3)
    near(hi, L, 1e-3)
    expect(hi).toBeLessThan(face.hi)
    expect(L).toBeLessThan(195)
  })

  it('a court with no wall side left goes, with its note', () => {
    const { p, id } = start([{ edge: 'e1', id: 'c1', shape: rect(0, 0, 4, 30) }])
    const r = editShape(p, typeRef(id), { op: 'vertex', vertex: 0, to: { x: 5.7, y: -0.3 } })
    expect(r.reason).toBeUndefined()
    expect(typeIn(r.project, id).courts ?? []).toEqual([])
    expect(r.notes?.join(' ')).toMatch(/1 truck court left out/)
  })

  it('a bump in the middle of its wall: the court in front of each piece (the bump’s face too) is cut, each part a court with its own id', () => {
    const { p, id } = start([{ edge: 'e1', id: 'c1', shape: rect(0, 0, 200, 30) }])
    const r = editShape(p, typeRef(id), { op: 'bump', wall: 0, from: 80.3, to: 120.3, by: 4.3 })
    expect(r.reason).toBeUndefined()
    const t = typeIn(r.project, id)
    expect(t.courts).toHaveLength(3)
    expect(t.courts!.map((c) => c.id)).toEqual(['c1', 'c2', 'c3'])
    expect(t.courts![0].edge).toBe('e1')
    expect(new Set(t.courts!.map((c) => c.edge)).size).toBe(3)
    let total = 0
    for (const c of t.courts!) {
      const face = faceOf(t, c.edge)
      const [lo, hi] = wallSide(c.shape)
      expect(lo).toBeGreaterThanOrEqual(face.lo - 1e-6)
      expect(hi).toBeLessThanOrEqual(face.hi + 1e-6)
      near(courtDepth(c.shape!), 30)
      total += hi - lo
    }
    // the three pieces of the wall hold what the wall was, less what its two sides take
    expect(total).toBeGreaterThan(195)
    expect(total).toBeLessThan(201)
  })

  it('a wall turned angled: its court dropped, with the note of a wall along the grid', () => {
    const { p, id } = start([{ edge: 'e1', id: 'c1', shape: rect(20, 0, 60, 30) }])
    const r = editShape(p, typeRef(id), { op: 'vertex', vertex: 1, to: { x: 200.3, y: 5.7 } })
    expect(r.reason).toBeUndefined()
    expect(edgeOf(typeIn(r.project, id), 'e1').axis).toBeNull()
    expect(typeIn(r.project, id).courts ?? []).toEqual([])
    expect(r.notes?.join(' ')).toMatch(/1 truck court left out: a truck court goes on a wall along the grid/)
  })

  it('a court with no shape is as it was: kept by its edge', () => {
    const { p, id } = start([{ edge: 'e1', depth: 30 }])
    const r = editShape(p, typeRef(id), { op: 'vertex', vertex: 0, to: { x: 5.7, y: -0.3 } })
    expect(typeIn(r.project, id).courts).toEqual([{ edge: 'e1', depth: 30 }])
  })
})

describe('a shaped court follows its wall on a copy', () => {
  it('the copy’s own outline edited: its own courts carry the re-based shape, its type’s untouched', () => {
    const { p, id, option } = start([{ edge: 'e1', id: 'c1', shape: rect(20, 0, 60, 30) }])
    const placed = placeWarehouse(p, id, { x: 200, y: 150 }, 0, option)!
    const levels = new Set(placed.project.buildings.find((b) => b.id === placed.id)!.levels.map((l) => l.id))
    const hall = placed.project.masses.find((m) => levels.has(m.levelId) && m.part === 'hall')!
    // the copy's corner 0 of its face, 6 m along its front
    const v0 = footprintPolygon(hall.footprint)[0]
    const r = editShape(placed.project, { kind: 'mass', id: hall.id }, { op: 'vertex', vertex: 0, to: { x: v0.x + 6, y: v0.y } })
    expect(r.reason).toBeUndefined()
    const w = r.project.buildings.find((b) => b.id === placed.id)!.warehouse!
    expect(w.overrides?.courts).toHaveLength(1)
    const t = typeIn(r.project, id)
    expect(t.courts).toEqual([{ edge: 'e1', id: 'c1', shape: rect(20, 0, 60, 30) }])
    const before = edgeOf(t, 'e1')
    const after = edgeOf(typeWith(t, w.overrides), 'e1')
    const [lo, hi] = wallSide(w.overrides!.courts![0].shape)
    // the court's wall side ends stay where they stood on the plan: through the copy's place before and after (its box shrank a hair at its low wall)
    const was = placed.project.buildings.find((b) => b.id === placed.id)!.warehouse!.place
    for (const [x, now] of [[20, lo], [60, hi]] as const) {
      const onPlan = onPlace(was, fromWall(wallFrame(before), { x, y: 0 }))
      near(now, toWall(wallFrame(after), fromPlace(w.place, onPlan)).x, 1e-6)
    }
    expect(20 - lo).toBeGreaterThan(5)
  })

  it('an inner wall moved: the copy’s courts are carried along, their shapes the same', () => {
    const { p, id, option } = start([{ edge: 'e1', id: 'c1', shape: rect(20, 0, 60, 30) }])
    const notched = shapeWarehouse(p, id, { kind: 'pull', edge: 'e3', from: 20, to: 32, by: -4 }).project
    const placed = placeWarehouse(notched, id, { x: 200, y: 150 }, 0, option)!
    const inner = generate(typeIn(placed.project, id)).edges.find((e) => !e.outer && e.horizontal)!
    const r = moveBlockEdge(placed.project, placed.id, inner.id, 1)
    expect(r.applied).not.toBe(0)
    const w = r.project.buildings.find((b) => b.id === placed.id)!.warehouse!
    expect(w.overrides?.courts).toEqual([{ edge: 'e1', id: 'c1', shape: rect(20, 0, 60, 30) }])
  })
})

describe('what following a wall cut in pieces says (review N2, N3)', () => {
  /** The type's wall e1 cut at its middle: `e1` (the first half) and `e9` (the second); `lean`: the first one angled. */
  function cut(angled = false) {
    const { p, id } = start([])
    const e1 = edgeOf(typeIn(p, id), 'e1')
    const mid = { x: (e1.a.x + e1.b.x) / 2, y: e1.a.y }
    const first = { ...e1, b: mid, ...(angled ? { axis: null } : {}) }
    const second = { ...e1, id: 'e9', a: mid }
    return { e1, first, second, after: [first, second] }
  }
  it('a piece that turned angled while the other stays straight: the court is carried, and not said to be left out', () => {
    const { e1, after } = cut(true)
    const court: CourtByEdge = { edge: 'e1', id: 'c1', shape: rect(0, 0, 200, 30) }
    const r = courtsFollowed([court], new Map(), after as never, { before: [e1], after: after as never, pieces: new Map([['e1', ['e1', 'e9']]]) })
    expect(r.courts.map((c) => c.edge)).toEqual(['e9'])
    expect(courtsOnAngled([court], r.courts, after as never, new Map(), r.carried)).toEqual([])
    expect(r.notes.join(' ')).not.toMatch(/left out/)
  })
  it('a piece the rule holds says so: the depth held to 5 m is passed on', () => {
    const { e1, after } = cut()
    const shape: Contour = { vertices: [{ x: 0, y: 0, r: 0 }, { x: 200, y: 0, r: 0 }, { x: 200, y: 30, r: 0 }, { x: 110, y: 30, r: 0 }, { x: 110, y: 3, r: 0 }, { x: 0, y: 3, r: 0 }] }
    const r = courtsFollowed([{ edge: 'e1', id: 'c1', shape }], new Map(), after as never, { before: [e1], after: after as never, pieces: new Map([['e1', ['e1', 'e9']]]) })
    expect(r.courts).toHaveLength(2)
    expect(r.notes.join(' ')).toMatch(/Held to 5 m/)
  })
})
