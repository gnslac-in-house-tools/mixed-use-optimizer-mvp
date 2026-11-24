// Mirror, Array and Align as verbs of what is picked (Phase AS.5 task 4): `mirrorPicked`, `arrayPicked`, `alignPicked` of
// `state/actions/selection.ts`, as `selection.test.ts` tests Move, Copy and Rotate.
import { describe, expect, it } from 'vitest'
import { NOTHING_PICKED, type Picked } from '../../../model/picked.ts'
import type { Contour, Mass, Point, Project, SiteDrawing, Streets } from '../../../model/schema.ts'
import { derive } from '../../../engine/derive.ts'
import { gatesOf } from '../../../engine/circulation/gates.ts'
import { contourToPolygon } from '../../../engine/geom/contour.ts'
import { footprintContour, footprintPolygon } from '../../../engine/geom/footprint.ts'
import { edgeAt } from '../../../engine/geom/perimeter.ts'
import { signedArea } from '../../../engine/geom/polygon.ts'
import { reflectPoint, reflectVector } from '../../../engine/geom/reflect.ts'
import { dockableWalls } from '../../../modules/docks/engine/docks.ts'
import { wallOf } from '../../../modules/parking/engine/lots.ts'
import { addLot, lockLots, setStreetParking } from '../../../modules/parking/actions.ts'
import { addWarehouseType, placeWarehouse } from '../../../modules/warehouse/actions.ts'
import { demoProject } from '../../demo.ts'
import { createAppStore } from '../../store.ts'
import { addDimension } from '../dimensions.ts'
import { addNote, addReferenceLine } from '../annotations.ts'
import { groupMasses, groupRefs } from '../groups.ts'
import { lockGates } from '../circulation.ts'
import { addRule } from '../graph.ts'
import { addMass, toggleMassLock, updateMass } from '../masses.ts'
import { drawStreet } from '../streets.ts'
import { alignPicked, arrayPicked, copyPicked, mirrorPicked } from '../selection.ts'

const o1 = 'o1'
const pick = (p: Partial<Picked>): Picked => ({ ...NOTHING_PICKED, ...p })
const mass = (p: Project, id: string): Mass => p.masses.find((m) => m.id === id)!
const lots = (p: Project) => p.options.find((o) => o.id === o1)!.lots ?? []
const streets = (p: Project): Streets => p.options.find((o) => o.id === o1)!.streets ?? { nodes: [], segments: [] }
const polyOf = (m: Mass) => footprintPolygon(m.footprint)
const near = (a: Point, b: Point, digits = 6) => {
  expect(a.x).toBeCloseTo(b.x, digits)
  expect(a.y).toBeCloseTo(b.y, digits)
}
const rect = (cx: number, cy: number, width: number, depth: number, rotation = 0) => ({ kind: 'rect', center: { x: cx, y: cy }, width, depth, rotation }) as const

// the mirror lines: vertical x = 300, and a slanted one
const V: [Point, Point] = [{ x: 300, y: 0 }, { x: 300, y: 100 }]
const S: [Point, Point] = [{ x: 10, y: 20 }, { x: 10 + 10 * Math.cos(0.5), y: 20 + 10 * Math.sin(0.5) }]

/** The demo without streets (m1 .. m3, a boundary, a gate), on a 3 m module grid at the origin, no option grid of its own. */
function world(): Project {
  const p = demoProject({ streets: false })
  return { ...p, grid: { x: 12, y: 12, modules: 4, origin: { x: 0, y: 0 }, angle: 0 }, options: p.options.map((o) => ({ ...o, grid: undefined })) }
}

// ---- what a mass keeps by its place along its perimeter, read in site coordinates ---------------------------------

const MODULE = 3
/** The wall a `t` falls on, as the derivation reads it: its two ends in the outline's order. */
function wallAt(m: Mass, t: number) {
  const P = polyOf(m)
  const { i } = edgeAt(P, t)
  const a = P[i]
  const b = P[(i + 1) % P.length]
  const length = Math.hypot(b.x - a.x, b.y - a.y)
  const along = (s: number): Point => ({ x: a.x + ((b.x - a.x) * s) / length, y: a.y + ((b.y - a.y) * s) / length })
  return { along, length, mid: along(length / 2) }
}
const key = (q: Point) => `${(Math.round(q.x * 1e4) / 1e4 + 0).toFixed(4)},${(Math.round(q.y * 1e4) / 1e4 + 0).toFixed(4)}`
/** Where each dock, door, flipped module and court of a mass is on the plan, each point put through `at`. */
function placesOf(m: Mass, at: (q: Point) => Point = (q) => q) {
  const sorted = (xs: string[]) => [...xs].sort()
  return {
    docks: sorted((m.docks ?? []).map((t) => key(at(wallAt(m, t).mid)))),
    doors: sorted((m.doorsAt ?? []).flatMap((e) => e.at.map((s) => `${e.kind} ${key(at(wallAt(m, e.t).along(s)))}`))),
    flips: sorted((m.doorFlips ?? []).map((f) => key(at(wallAt(m, f.t).along((f.module + 0.5) * MODULE))))),
    courts: sorted((m.courts ?? []).map((c) => `${key(at(wallAt(m, c.t).mid))} ${c.depth}`)),
    blockCourts: sorted((m.blockCourts ?? []).map((c) => `${key(at(wallAt(m, c.t).mid))} ${c.depth}`)),
  }
}

/** A 120 × 60 mass at (100, 100), grid-aligned, with docks, doors at places, flipped modules and courts on its walls. */
function handed(): { p: Project; id: string } {
  const added = addMass(world(), { programId: 'warehouse', footprint: rect(100, 100, 120, 60) })
  const walls = dockableWalls(polyOf(mass(added.project, added.id)))
  const p = updateMass(added.project, added.id, {
    docks: [walls[0].t, walls[2].t],
    doorsAt: [
      { t: walls[0].t, at: [10, 40], kind: 'dock' },
      { t: walls[1].t, at: [20], kind: 'door' },
    ],
    doorFlips: [
      { t: walls[0].t, module: 3 },
      { t: walls[2].t, module: 0 },
    ],
    courts: [{ t: walls[0].t, depth: 30 }],
    blockCourts: [{ t: walls[2].t, depth: 22 }],
  })
  return { p, id: added.id }
}

describe('mirrorPicked: masses', () => {
  it('reflects a rect about the line: its centre, its rotation 2α − rotation + 180 (a wide one), the rest of it as it was', () => {
    const w = world()
    const r = mirrorPicked(w, o1, pick({ masses: ['m1'] }), ...V, false)
    expect(r.skipped).toEqual([])
    const was = mass(w, 'm1')
    const now = mass(r.project, 'm1')
    if (was.footprint.kind !== 'rect' || now.footprint.kind !== 'rect') throw new Error('a rect was expected')
    expect(now.footprint.center).toEqual({ x: 480, y: 110 })
    expect(now.footprint.rotation).toBe(0)
    expect(now.footprint.width).toBe(was.footprint.width)
    expect(r.project.masses).toHaveLength(w.masses.length)
    expect(mass(r.project, 'm2')).toBe(mass(w, 'm2'))
    expect(now.name).toBe(was.name)
    expect(now.programId).toBe(was.programId)
  })

  it('keeps each dock, door, flipped door and court on the same wall seen in the mirror (a slanted line)', () => {
    const { p, id } = handed()
    const r = mirrorPicked(p, o1, pick({ masses: [id] }), ...S, false)
    const was = placesOf(mass(p, id))
    expect(was.docks).toHaveLength(2)
    expect(was.doors).toHaveLength(3)
    const reflect = (q: Point) => reflectPoint(q, ...S)
    expect(placesOf(mass(r.project, id))).toEqual(placesOf(mass(p, id), reflect))
  })

  it('keeps each of them on the same wall seen in the mirror (a vertical line, a rotated mass)', () => {
    const { p, id } = handed()
    const turned = { ...p, masses: p.masses.map((m) => (m.id === id && m.footprint.kind === 'rect' ? { ...m, footprint: { ...m.footprint, rotation: 20 } } : m)) }
    const r = mirrorPicked(turned, o1, pick({ masses: [id] }), ...V, false)
    const reflect = (q: Point) => reflectPoint(q, ...V)
    // a rotated mass is off the grid: its walls' modules are counted all the same
    expect(placesOf(mass(r.project, id)).docks).toEqual(placesOf(mass(turned, id), reflect).docks)
    expect(placesOf(mass(r.project, id)).doors).toEqual(placesOf(mass(turned, id), reflect).doors)
    expect(placesOf(mass(r.project, id)).courts).toEqual(placesOf(mass(turned, id), reflect).courts)
    expect(placesOf(mass(r.project, id)).blockCourts).toEqual(placesOf(mass(turned, id), reflect).blockCourts)
  })

  it('mirrored twice about one line, a mass is what it was, its docks, doors and courts too', () => {
    const { p, id } = handed()
    for (const line of [V, S]) {
      const twice = mirrorPicked(mirrorPicked(p, o1, pick({ masses: [id] }), ...line, false).project, o1, pick({ masses: [id] }), ...line, false).project
      const was = mass(p, id)
      const now = mass(twice, id)
      if (was.footprint.kind !== 'rect' || now.footprint.kind !== 'rect') throw new Error('a rect was expected')
      near(now.footprint.center, was.footprint.center, 9)
      expect(now.footprint.rotation).toBeCloseTo(was.footprint.rotation, 9)
      expect(placesOf(now)).toEqual(placesOf(was))
      expect(now.docks!.map((t) => Math.round(t * 1e9))).toEqual(was.docks!.map((t) => Math.round(t * 1e9)))
      expect(now.doorsAt!.map((e) => ({ ...e, t: Math.round(e.t * 1e9), at: e.at.map((s) => Math.round(s * 1e6) / 1e6) }))).toEqual(was.doorsAt!.map((e) => ({ ...e, t: Math.round(e.t * 1e9) })))
      expect(now.doorFlips!.map((f) => f.module)).toEqual(was.doorFlips!.map((f) => f.module))
    }
  })

  it('maps a door’s place from the other end of its wall and a flipped module from the other end of its count', () => {
    const { p, id } = handed()
    const r = mirrorPicked(p, o1, pick({ masses: [id] }), ...V, false)
    const m = mass(r.project, id)
    const lengths = m.doorsAt!.map((e) => wallAt(m, e.t).length).sort((x, y) => x - y)
    expect(lengths).toEqual([60, 120])
    const long = m.doorsAt!.find((e) => wallAt(m, e.t).length === 120)!
    expect([...long.at].sort((x, y) => x - y)).toEqual([80, 110])
    // 120 m is 40 modules: module 3 is module 36 from the other end, and module 0 of the opposite 120 m wall is its module 39
    expect(m.doorFlips!.map((f) => f.module).sort((x, y) => x - y)).toEqual([36, 39])
  })

  it('reflects a contour mass with an arc: counter-clockwise after, its docks on the same walls', () => {
    const L: Contour = {
      vertices: [{ x: 100, y: 100, r: 0 }, { x: 160, y: 100, r: 0 }, { x: 160, y: 130, r: 3 }, { x: 130, y: 130, r: 0 }, { x: 130, y: 160, r: 0 }, { x: 100, y: 160, r: 0 }],
      arcs: { '1': -0.2 },
    }
    const added = addMass(world(), { programId: 'warehouse', footprint: { kind: 'contour', contour: L } })
    const walls = dockableWalls(polyOf(mass(added.project, added.id)))
    const p = updateMass(added.project, added.id, { docks: [walls[0].t, walls[walls.length - 1].t] })
    const r = mirrorPicked(p, o1, pick({ masses: [added.id] }), ...S, false)
    const now = mass(r.project, added.id)
    expect(now.footprint.kind).toBe('contour')
    expect(signedArea(polyOf(now))).toBeGreaterThan(0)
    expect(Math.abs(signedArea(polyOf(now)))).toBeCloseTo(Math.abs(signedArea(polyOf(mass(p, added.id)))), 1)
    expect(placesOf(now).docks).toEqual(placesOf(mass(p, added.id), (q) => reflectPoint(q, ...S)).docks)
    // every corner of the old shape, reflected, is a corner of the new one
    const corners = footprintContour(now.footprint).vertices
    for (const v of L.vertices) expect(corners.some((c) => Math.hypot(c.x - reflectPoint(v, ...S).x, c.y - reflectPoint(v, ...S).y) < 1e-6 && c.r === v.r)).toBe(true)
  })

  it('reflects the holes of a mass', () => {
    const w = world()
    const hole = { vertices: [{ x: 100, y: 90, r: 0 }, { x: 110, y: 90, r: 0 }, { x: 110, y: 100, r: 0 }, { x: 100, y: 100, r: 0 }] }
    const p = updateMass(w, 'm1', { holes: [hole] })
    const r = mirrorPicked(p, o1, pick({ masses: ['m1'] }), ...V, false)
    const now = mass(r.project, 'm1').holes!
    expect(now).toHaveLength(1)
    expect(signedArea(contourToPolygon(now[0]))).toBeGreaterThan(0)
    expect(now[0].vertices.map((v) => v.x).sort((x, y) => x - y)).toEqual([490, 500, 500, 490].sort((x, y) => x - y))
  })

  it('a locked mass in what is picked is refused by settle when run through the store, and nothing changes', () => {
    const locked = toggleMassLock(world(), 'm1')
    const s = createAppStore(locked)
    s.getState().apply((q) => mirrorPicked(q, o1, pick({ masses: ['m1'] }), ...V, false).project)
    expect(s.getState().project.masses).toEqual(locked.masses)
  })
})

describe('mirrorPicked: docks that come from the program', () => {
  /** One mass alone on a huge site, so what a mirror changes is the mass and not its neighbours or the boundary. */
  const alone = (footprint: Mass['footprint']): Project => {
    const p = world()
    const big = { vertices: [{ x: -5000, y: -5000, r: 0 }, { x: 5000, y: -5000, r: 0 }, { x: 5000, y: 5000, r: 0 }, { x: -5000, y: 5000, r: 0 }] }
    return { ...p, site: { ...p.site, boundary: big }, masses: [{ ...p.masses[0], footprint }] }
  }
  const docksOf = (p: Project) => derive(p, o1).circulation.docks.filter((d) => d.massId === p.masses[0].id)
  const mid = (d: { a: Point; b: Point }): Point => ({ x: (d.a.x + d.b.x) / 2, y: (d.a.y + d.b.y) / 2 })
  const centroid = (poly: Point[]): Point => ({ x: poly.reduce((s, q) => s + q.x, 0) / poly.length, y: poly.reduce((s, q) => s + q.y, 0) / poly.length })
  const flat: [Point, Point] = [{ x: 0, y: 0 }, { x: 10, y: 0 }]

  it.each([
    ['a wide rect', rect(100, 100, 160, 80, 25)],
    ['a tall rect', rect(100, 100, 80, 160, 25)],
    ['a wide rect turned', rect(100, 100, 160, 80, 200)],
    ['a tall rect turned', rect(100, 100, 80, 160, 130)],
  ])('%s: each dock and its truck court are the mirror image of what they were', (_name, footprint) => {
    const p = alone(footprint)
    const before = docksOf(p)
    expect(before.length).toBeGreaterThan(0)
    expect(p.masses[0].docks).toBeUndefined()
    for (const line of [V, S, flat]) {
      const after = docksOf(mirrorPicked(p, o1, pick({ masses: [p.masses[0].id] }), ...line, false).project)
      expect(after).toHaveLength(before.length)
      const want = before.map((d) => `${key(reflectPoint(mid(d), ...line))} ${key(reflectPoint(centroid(d.court), ...line))}`).sort()
      expect(after.map((d) => `${key(mid(d))} ${key(centroid(d.court))}`).sort()).toEqual(want)
    }
  })

  it('mirrored twice, the docks are where they were', () => {
    const p = alone(rect(100, 100, 160, 80, 25))
    const once = mirrorPicked(p, o1, pick({ masses: [p.masses[0].id] }), ...S, false).project
    const twice = mirrorPicked(once, o1, pick({ masses: [p.masses[0].id] }), ...S, false).project
    expect(docksOf(twice).map((d) => key(mid(d))).sort()).toEqual(docksOf(p).map((d) => key(mid(d))).sort())
  })

  // a contour's outline is reversed by a reflection, so its first edge changes: the reflected outline starts so that its first long wall is the
  // mirror image of the old one (Phase AS.5 review: the docks a program gives stand on that wall)
  const asContour = (f: ReturnType<typeof rect>, shift = 0): Mass['footprint'] => {
    const c = footprintContour(f)
    const n = c.vertices.length
    return { kind: 'contour', contour: { vertices: c.vertices.map((_, i) => c.vertices[(i + shift) % n]) } }
  }
  /** An L (a notch at its upper right), 120 × 100, its first corner moved on by `shift`. */
  const ell = (shift: number, arcs?: Record<string, number>): Mass['footprint'] => {
    const v = [{ x: 100, y: 100, r: 0 }, { x: 220, y: 100, r: 0 }, { x: 220, y: 130, r: 0 }, { x: 130, y: 130, r: 0 }, { x: 130, y: 200, r: 0 }, { x: 100, y: 200, r: 0 }]
    return { kind: 'contour', contour: { vertices: v.map((_, i) => v[(i + shift) % v.length]), ...(arcs ? { arcs } : {}) } }
  }
  it.each([
    ['a wide contour (the reviewer’s case)', asContour(rect(100, 100, 160, 80))],
    ['a wide contour turned', asContour(rect(100, 100, 160, 80, 25))],
    ['a tall contour: its first edge is short and two walls are long', asContour(rect(100, 100, 80, 160, 25))],
    ['a tall contour started at its third corner', asContour(rect(100, 100, 80, 160, 130), 2)],
    ['an L', ell(0)],
    ['an L started at its second corner', ell(1)],
    ['an L started at its notch', ell(3)],
  ])('%s: each dock and its truck court are the mirror image of what they were', (_name, footprint) => {
    const p = alone(footprint)
    const before = docksOf(p)
    expect(before.length).toBeGreaterThan(0)
    expect(p.masses[0].docks).toBeUndefined()
    for (const line of [V, S, flat]) {
      const after = docksOf(mirrorPicked(p, o1, pick({ masses: [p.masses[0].id] }), ...line, false).project)
      expect(after).toHaveLength(before.length)
      const want = before.map((d) => `${key(reflectPoint(mid(d), ...line))} ${key(reflectPoint(centroid(d.court), ...line))}`).sort()
      expect(after.map((d) => `${key(mid(d))} ${key(centroid(d.court))}`).sort()).toEqual(want)
    }
  })

  it('a contour with an arc and a rounded corner, mirrored, keeps its docks on the mirror image of their wall, and its arc on the same edge', () => {
    const footprint = ell(1, { '2': -0.2 })
    if (footprint.kind !== 'contour') throw new Error('a contour was expected')
    footprint.contour.vertices[3] = { ...footprint.contour.vertices[3], r: 4 }
    const p = alone(footprint)
    const before = docksOf(p)
    expect(before.length).toBeGreaterThan(0)
    const after = docksOf(mirrorPicked(p, o1, pick({ masses: [p.masses[0].id] }), ...S, false).project)
    expect(after.map((d) => key(mid(d))).sort()).toEqual(before.map((d) => key(reflectPoint(mid(d), ...S))).sort())
  })

  it('a contour mirrored twice is the same shape (the vertex order may be turned) with its docks where they were', () => {
    const p = alone(asContour(rect(100, 100, 80, 160, 25)))
    const once = mirrorPicked(p, o1, pick({ masses: [p.masses[0].id] }), ...S, false).project
    const twice = mirrorPicked(once, o1, pick({ masses: [p.masses[0].id] }), ...S, false).project
    const a = polyOf(p.masses[0])
    const b = polyOf(twice.masses[0])
    const k = b.findIndex((q) => Math.hypot(q.x - a[0].x, q.y - a[0].y) < 1e-6)
    expect(k).toBeGreaterThanOrEqual(0)
    a.forEach((q, i) => near(q, b[(i + k) % b.length], 6))
    expect(docksOf(twice).map((d) => key(mid(d))).sort()).toEqual(docksOf(p).map((d) => key(mid(d))).sort())
  })

  it('a mass with its own docks, or a program with none, is started so that its first edge is the mirror image of the old first edge', () => {
    const p = alone(asContour(rect(100, 100, 80, 160, 25)))
    const first = (m: Mass) => footprintContour(m.footprint).vertices
    const noDocks: Project = { ...p, programs: p.programs.map((g) => (g.id === p.masses[0].programId ? { ...g, docks: undefined } : g)) }
    const own: Project = { ...p, masses: [{ ...p.masses[0], docks: [dockableWalls(polyOf(p.masses[0]))[1].t] }] }
    for (const q of [noDocks, own]) {
      const r = mirrorPicked(q, o1, pick({ masses: [q.masses[0].id] }), ...S, false).project
      const was = first(q.masses[0])
      const now = first(r.masses[0])
      near(now[0], reflectPoint(was[1], ...S), 6)
      near(now[1], reflectPoint(was[0], ...S), 6)
    }
  })
})

describe('mirrorPicked: a lot anchored to an irregular outline', () => {
  const quad = (): Mass['footprint'] => ({ kind: 'contour', contour: { vertices: [{ x: 0, y: 0, r: 0 }, { x: 40, y: 0, r: 0 }, { x: 40, y: 20, r: 0 }, { x: 10, y: 30, r: 0 }] } })
  /** One mass with no program, far from everything, with a lot along its first edge. */
  const lonely = (footprint: Mass['footprint'], programId: string | null) => {
    const w = world()
    const m = { ...w.masses[0], programId, footprint }
    const p: Project = { ...w, masses: [m] }
    const lot = addLot(p, o1, { anchor: { massId: m.id, side: 't0' } })!
    return { p: lot.project, lot: lot.id, id: m.id }
  }

  /** The middle of a wall of the box. */
  const middle = (w: NonNullable<ReturnType<typeof wallOf>>): Point => ({ x: w.start.x + (w.along.x * w.length) / 2, y: w.start.y + (w.along.y * w.length) / 2 })

  it('lands square on the mirror image of its wall, 40 m long and horizontal (the new first edge is the mirror of the old one: no skew)', () => {
    const { p, lot, id } = lonely(quad(), null)
    const r = mirrorPicked(p, o1, pick({ masses: [id], lots: [lot] }), ...V, false)
    expect(r.skipped).toEqual([])
    const now = lots(r.project).find((l) => l.id === lot)!.anchor!
    const wall = wallOf(polyOf(mass(r.project, id)), now.side)!
    // (the wall runs from the other end: along +x, the reflected old one ran −x; the lot's entrance changes end with it)
    expect(Math.abs(wall.along.x)).toBeCloseTo(1, 9)
    expect(wall.along.y).toBeCloseTo(0, 9)
    expect(wall.length).toBeCloseTo(40, 6)
    const was = wallOf(polyOf(mass(p, id)), 't0')!
    near(middle(wall), reflectPoint(middle(was), ...V), 6)
    near(wall.out, reflectVector(was.out, ...V), 9)
  })

  it('keeps it too with the original kept (the copy’s lot)', () => {
    const { p, lot, id } = lonely(quad(), null)
    const r = mirrorPicked(p, o1, pick({ masses: [id], lots: [lot] }), ...V, true)
    const copy = lots(r.project).find((l) => l.id !== lot)!
    const wall = wallOf(polyOf(mass(r.project, copy.anchor!.massId)), copy.anchor!.side)!
    expect(Math.abs(wall.along.x)).toBeCloseTo(1, 9)
    expect(wall.along.y).toBeCloseTo(0, 9)
    expect(wall.length).toBeCloseTo(40, 6)
    const was = wallOf(polyOf(mass(p, id)), 't0')!
    near(middle(wall), reflectPoint(middle(was), ...V), 6)
  })

  // known limit (Decision "Mirror, Array, Align"): a mass whose docks come from its program starts its reflected outline at the docks' wall,
  // and an anchored lot reads the first edge: when the two differ, the docks win and the lot's box is the one the new first edge frames
  it('a program’s docks win over the lot’s frame: the box is the one the new first edge frames, so the lot lands on a different one (pinned)', () => {
    // a tall mass whose first edge is short and slanted: its first long wall is edge 1, so the reflected outline starts there and the
    // frame is the vertical edge's (not the mirror image of the slanted one the lot was framed by)
    const tall: Mass['footprint'] = { kind: 'contour', contour: { vertices: [{ x: 0, y: 0, r: 0 }, { x: 12, y: 3, r: 0 }, { x: 12, y: 50, r: 0 }, { x: 0, y: 50, r: 0 }] } }
    const { p, lot, id } = lonely(tall, 'warehouse')
    const r = mirrorPicked(p, o1, pick({ masses: [id], lots: [lot] }), ...V, false)
    const now = lots(r.project).find((l) => l.id === lot)!.anchor!
    const wall = wallOf(polyOf(mass(r.project, id)), now.side)!
    const was = wallOf(polyOf(mass(p, id)), 't0')!
    // the old wall: along the slanted first edge, 23.8 m of box; the new one: square to the axes, the 12 m width of the vertical edge's box
    expect(was.length).toBeCloseTo(23.76, 1)
    expect(Math.max(Math.abs(wall.along.x), Math.abs(wall.along.y))).toBeCloseTo(1, 9)
    expect(wall.length).toBeCloseTo(12, 6)
  })
})

describe('mirrorPicked: keeping the original', () => {
  it('leaves the original and adds an unlocked, mirrored copy', () => {
    const w = world()
    const r = mirrorPicked(w, o1, pick({ masses: ['m1'] }), ...V, true)
    expect(r.project.masses).toHaveLength(w.masses.length + 1)
    expect(mass(r.project, 'm1')).toBe(mass(w, 'm1'))
    const copy = r.project.masses.find((m) => !w.masses.some((x) => x.id === m.id))!
    expect(copy.locked).toBeUndefined()
    expect(copy.group).toBeUndefined()
    const f = copy.footprint
    if (f.kind !== 'rect') throw new Error('a rect was expected')
    expect(f.center).toEqual({ x: 480, y: 110 })
    expect(f.rotation).toBe(0)
  })

  it('a copy of a locked mass is born unlocked', () => {
    const locked = toggleMassLock(world(), 'm1')
    const r = mirrorPicked(locked, o1, pick({ masses: ['m1'] }), ...V, true)
    expect(r.project.masses.find((m) => !locked.masses.some((x) => x.id === m.id))!.locked).toBeUndefined()
  })

  it('the copies of a group are a group of their own', () => {
    const grouped = groupMasses(world(), ['m1', 'm2'])!
    const r = mirrorPicked(grouped.project, o1, pick({ masses: ['m1', 'm2'] }), ...V, true)
    const made = r.project.masses.filter((m) => !grouped.project.masses.some((x) => x.id === m.id))
    expect(made).toHaveLength(2)
    expect(made[0].group).toBeDefined()
    expect(made[0].group).toBe(made[1].group)
    expect(made[0].group).not.toBe(grouped.id)
    expect(mass(r.project, 'm1').group).toBe(grouped.id)
  })

  it('a copy’s docks and doors are mapped as a mass’s own (a copy keeps docks, a door pattern, flips and holes)', () => {
    const { p, id } = handed()
    const r = mirrorPicked(p, o1, pick({ masses: [id] }), ...S, true)
    const copy = r.project.masses.find((m) => !p.masses.some((x) => x.id === m.id))!
    const reflect = (q: Point) => reflectPoint(q, ...S)
    expect(placesOf(copy).docks).toEqual(placesOf(mass(p, id), reflect).docks)
    expect(placesOf(copy).flips).toEqual(placesOf(mass(p, id), reflect).flips)
  })
})

describe('mirrorPicked: a warehouse block', () => {
  const placed = () => {
    const { project: t, id } = addWarehouseType(world())
    const r = placeWarehouse(t, id, { x: 0, y: 0 }, 0, o1)!
    const levels = new Set(r.project.buildings.find((b) => b.id === r.id)!.levels.map((l) => l.id))
    return { p: r.project, hall: r.project.masses.find((m) => m.part === 'hall' && levels.has(m.levelId))! }
  }

  it('is not mirrored: it stays where it is, and the reason is said once', () => {
    const { p, hall } = placed()
    const r = mirrorPicked(p, o1, pick({ masses: [hall.id, 'm1'] }), ...V, false)
    expect(r.skipped).toEqual(['A block is not mirrored: its type has one hand'])
    expect(mass(r.project, hall.id)).toBe(hall)
    expect(mass(r.project, 'm1')).not.toBe(mass(p, 'm1'))
  })

  it('is neither mirrored nor copied when the original is kept', () => {
    const { p, hall } = placed()
    const r = mirrorPicked(p, o1, pick({ masses: [hall.id] }), ...V, true)
    expect(r.skipped).toEqual(['A block is not mirrored: its type has one hand'])
    expect(r.project).toBe(p)
  })
})

describe('mirrorPicked: the other kinds', () => {
  it('a street: its nodes reflected, each segment’s side and parking changing hand', () => {
    const w = world()
    const drawn = drawStreet(w, o1, [{ x: 100, y: 100 }, { x: 150, y: 100 }], undefined, undefined, undefined, { side: 'left' })!
    const parked = setStreetParking(drawn.project, o1, { [drawn.segments[0]]: 'left' })
    const r = mirrorPicked(parked, o1, pick({ nodes: drawn.nodes }), ...V, false)
    const s = streets(r.project)
    expect(s.nodes.find((n) => n.id === drawn.nodes[0])).toMatchObject({ x: 500, y: 100 })
    expect(s.nodes.find((n) => n.id === drawn.nodes[1])).toMatchObject({ x: 450, y: 100 })
    expect(s.segments[0]).toMatchObject({ left: 8, right: 0, parking: 'right' })
    expect(s.segments[0].a).toBe(drawn.nodes[0])
  })

  it('a street with a centre line and stalls on both sides stays so', () => {
    const w = world()
    const drawn = drawStreet(w, o1, [{ x: 100, y: 100 }, { x: 150, y: 100 }])!
    const parked = setStreetParking(drawn.project, o1, { [drawn.segments[0]]: 'both' })
    const s = streets(mirrorPicked(parked, o1, pick({ nodes: drawn.nodes }), ...V, false).project).segments[0]
    expect([s.left, s.right]).toEqual([4, 4])
    expect(s.parking).toBe('both')
  })

  it('a mirrored street’s option still derives, with the same number of roads', () => {
    const w = world()
    const drawn = drawStreet(w, o1, [{ x: 100, y: 100 }, { x: 150, y: 100 }, { x: 150, y: 150 }], undefined, undefined, undefined, { side: 'right' })!
    const before = derive(drawn.project, o1).circulation.roads.length
    const r = mirrorPicked(drawn.project, o1, pick({ nodes: drawn.nodes }), ...S, false)
    expect(derive(r.project, o1).circulation.roads).toHaveLength(before)
    expect(streets(r.project).segments.map((g) => [g.left, g.right])).toEqual([[0, 8], [0, 8]])
  })

  it('with the original kept, the segments between two picked nodes are drawn again, reflected, their side changing hand', () => {
    const w = world()
    const drawn = drawStreet(w, o1, [{ x: 100, y: 100 }, { x: 150, y: 100 }], undefined, undefined, undefined, { side: 'left' })!
    const r = mirrorPicked(drawn.project, o1, pick({ nodes: drawn.nodes }), ...V, true)
    const s = streets(r.project)
    expect(s.segments).toHaveLength(2)
    expect(streets(drawn.project).nodes).toEqual(s.nodes.slice(0, 2))
    const copy = s.segments.find((g) => g.id !== drawn.segments[0])!
    const at = (id: string) => s.nodes.find((n) => n.id === id)!
    near(at(copy.a), { x: 500, y: 100 })
    near(at(copy.b), { x: 450, y: 100 })
    expect([copy.left, copy.right]).toEqual([8, 0])
  })

  it('a free lot: its rect reflected (centre and rotation); an anchored lot goes with its mass and alone is skipped', () => {
    const w = world()
    const free = addLot(w, o1, { rect: { center: { x: 200, y: 200 }, width: 30, depth: 20, rotation: 10 } })!
    const anchored = addLot(free.project, o1, { anchor: { massId: 'm1', side: 's0' } })!
    const r = mirrorPicked(anchored.project, o1, pick({ lots: [free.id, anchored.id] }), ...V, false)
    const name = lots(anchored.project).find((l) => l.id === anchored.id)!.name
    expect(r.skipped).toEqual([`${name} follows its wall: pick its mass to mirror it`])
    const lot = lots(r.project).find((l) => l.id === free.id)!
    expect(lot.rect!.center).toEqual({ x: 400, y: 200 })
    // its rows stack from its local bottom up: the mirror image keeps its bottom, so 2α − rotation + 180
    expect(lot.rect!.rotation).toBe(350)
    expect(lots(r.project).find((l) => l.id === anchored.id)).toBe(lots(anchored.project).find((l) => l.id === anchored.id))
  })

  it('a lot anchored to a mass that is mirrored stays against the same wall seen in the mirror', () => {
    const w = world()
    for (const side of ['s0', 's1', 't0', 't1'] as const) {
      const anchored = addLot(w, o1, { anchor: { massId: 'm1', side } })!
      const wasWall = wallOf(polyOf(mass(w, 'm1')), side)!
      for (const line of [V, S]) {
        const r = mirrorPicked(anchored.project, o1, pick({ masses: ['m1'], lots: [anchored.id] }), ...line, false)
        expect(r.skipped).toEqual([])
        const now = lots(r.project).find((l) => l.id === anchored.id)!.anchor!
        const nowWall = wallOf(polyOf(mass(r.project, 'm1')), now.side)!
        const mid = (x: NonNullable<ReturnType<typeof wallOf>>) => ({ x: x.start.x + (x.along.x * x.length) / 2, y: x.start.y + (x.along.y * x.length) / 2 })
        near(mid(nowWall), reflectPoint(mid(wasWall), ...line), 5)
      }
    }
  })

  it('an anchored lot is copied onto the mirrored copy of its mass, against the same wall seen in the mirror', () => {
    const w = world()
    const anchored = addLot(w, o1, { anchor: { massId: 'm1', side: 't0', from: 10, length: 40 } })!
    const r = mirrorPicked(anchored.project, o1, pick({ masses: ['m1'], lots: [anchored.id] }), ...V, true)
    const copy = lots(r.project).find((l) => l.id !== anchored.id)!
    expect(copy.anchor!.massId).not.toBe('m1')
    const wall = wallOf(polyOf(mass(r.project, copy.anchor!.massId)), copy.anchor!.side)!
    const was = wallOf(polyOf(mass(w, 'm1')), 't0')!
    const mid = (x: typeof was) => ({ x: x.start.x + (x.along.x * x.length) / 2, y: x.start.y + (x.along.y * x.length) / 2 })
    near(mid(wall), reflectPoint(mid(was), ...V))
    // 10 m to 50 m from the old wall's start: the new wall starts at the other end (the bottom stays the bottom, its way along reverses)
    expect(copy.anchor!.side).toBe('t0')
    expect(copy.anchor!.from).toBeCloseTo(was.length - 50, 6)
    expect(copy.anchor!.length).toBeCloseTo(40, 6)
  })

  it('a free lot keeps its stalls’ side and swaps the end of its entrance; an anchored lot swaps it when its wall’s way along reverses', () => {
    const w = world()
    const free = addLot(w, o1, { rect: { center: { x: 200, y: 200 }, width: 30, depth: 20, rotation: 0 }, entry: 'start', rows: 1 })!
    const r = mirrorPicked(free.project, o1, pick({ lots: [free.id] }), ...V, false)
    expect(lots(r.project)[0]).toMatchObject({ entry: 'end', rows: 1 })
    expect(lots(r.project)[0].rect!.rotation).toBe(0)
    // an anchored lot: its entrance swaps when its wall's way along reverses in the mirror image
    for (const side of ['t0', 's0'] as const) {
      const anchored = addLot(w, o1, { anchor: { massId: 'm1', side }, entry: 'start' })!
      const m = mirrorPicked(anchored.project, o1, pick({ masses: ['m1'], lots: [anchored.id] }), ...V, false)
      const now = lots(m.project).find((l) => l.id === anchored.id)!
      const was = wallOf(polyOf(mass(w, 'm1')), side)!
      const wall = wallOf(polyOf(mass(m.project, 'm1')), now.anchor!.side)!
      const along = reflectVector(was.along, ...V)
      const reversed = wall.along.x * along.x + wall.along.y * along.y < 0
      expect(now.entry).toBe(reversed ? 'end' : 'start')
    }
  })

  it('a free dimension: both ends reflected and the sign of its offset changed, its anchors dropped', () => {
    const w = world()
    const dim = addDimension(w, { x: 10, y: 300 }, { x: 50, y: 300 }, 2)!
    const r = mirrorPicked(dim.project, o1, pick({ dimensions: [dim.id] }), ...V, false)
    const d = r.project.dimensions![0]
    expect(d).toMatchObject({ a: { x: 590, y: 300 }, b: { x: 550, y: 300 }, offset: -2 })
    // the dimension line is on the same side of what it measures: the left of 590 → 550 is the south, as the left of 10 → 50 was the north
    expect(d.anchorA).toBeUndefined()
  })

  it('a dimension anchored to a mirrored mass follows its corners, each end on the same corner seen in the mirror', () => {
    const w = world()
    const c = footprintContour(mass(w, 'm1').footprint).vertices
    const dim = addDimension(w, c[0], c[1], 3)!
    const r = mirrorPicked(dim.project, o1, pick({ masses: ['m1'], dimensions: [dim.id] }), ...V, false)
    const d = r.project.dimensions![0]
    const now = footprintContour(mass(r.project, 'm1').footprint).vertices
    near(d.a, reflectPoint(c[0], ...V))
    near(d.b, reflectPoint(c[1], ...V))
    near(now[d.anchorA!.vertex], d.a)
    near(now[d.anchorB!.vertex], d.b)
    expect(d.offset).toBe(-3)
    // not picked, it follows its mass all the same
    const alone = mirrorPicked(dim.project, o1, pick({ masses: ['m1'] }), ...V, false).project.dimensions![0]
    expect(alone).toEqual(d)
  })

  it('a reference line: its points; a note: its point and its angle, 2α − angle', () => {
    const line = addReferenceLine(world(), [{ x: 100, y: 10 }, { x: 140, y: 30 }])!
    const note = addNote(line.project, { x: 120, y: 50 }, 'Gate', undefined, { angle: 30, size: 'large' })!
    const r = mirrorPicked(note.project, o1, pick({ lines: [line.id], notes: [note.id] }), ...V, false)
    expect(r.skipped).toEqual([])
    expect(r.project.referenceLines![0].points).toEqual([{ x: 500, y: 10 }, { x: 460, y: 30 }])
    expect(r.project.notes![0]).toMatchObject({ at: { x: 480, y: 50 }, text: 'Gate', size: 'large' })
    expect(r.project.notes![0].angle).toBeCloseTo(150, 9)
    const flat = mirrorPicked(note.project, o1, pick({ notes: [note.id] }), { x: 0, y: 0 }, { x: 10, y: 0 }, false)
    expect(flat.project.notes![0].angle).toBeCloseTo(330, 9)
  })

  it('a note whose mirrored angle is none has no angle; with the original kept, both are there and the copies are new', () => {
    const note = addNote(world(), { x: 120, y: 50 }, 'Gate', undefined, { angle: 90 })!
    const none = mirrorPicked(note.project, o1, pick({ notes: [note.id] }), { x: 0, y: 0 }, { x: 10, y: 10 }, false)
    expect('angle' in none.project.notes![0]).toBe(false)
    const line = addReferenceLine(note.project, [{ x: 1, y: 1 }, { x: 5, y: 5 }])!
    const kept = mirrorPicked(line.project, o1, pick({ lines: [line.id], notes: [note.id] }), ...V, true)
    expect(kept.project.notes).toHaveLength(2)
    expect(kept.project.referenceLines).toHaveLength(2)
    expect(kept.project.notes![0]).toBe(line.project.notes![0])
    expect(kept.project.notes![1].id).not.toBe(note.id)
    expect(kept.project.notes![1].at).toEqual({ x: 480, y: 50 })
    expect(kept.project.referenceLines![1].points).toEqual([{ x: 599, y: 1 }, { x: 595, y: 5 }])
  })

  it('gates stay and say so; drawings are not mirrored and say so; each reason once', () => {
    const w = world()
    const drawing: SiteDrawing = { file: 'a.dxf', layers: [{ name: 'Walls', lines: [{ points: [{ x: 1, y: 0 }, { x: 5, y: 0 }] }] }] }
    const p = { ...w, site: { ...w.site, drawings: [drawing] } }
    const gate = gatesOf(p, o1)[0].id
    const r = mirrorPicked(p, o1, pick({ gates: [gate], drawings: [{ file: 'a.dxf' }, { file: 'a.dxf', layer: 'Walls' }] }), ...V, false)
    expect(r.skipped).toEqual(['Gates stay on their side: Mirror leaves them', 'Drawings are not mirrored'])
    expect(r.project).toBe(p)
    const kept = mirrorPicked(p, o1, pick({ gates: [gate], drawings: [{ file: 'a.dxf' }] }), ...V, true)
    expect(kept.skipped).toEqual(['Gates stay on their side: Mirror leaves them', 'Drawings are not mirrored'])
    expect(gatesOf(kept.project, o1)).toEqual(gatesOf(p, o1))
  })
})

describe('mirrorPicked: nothing to do', () => {
  it('nothing picked, or no line, returns the same project', () => {
    const w = world()
    expect(mirrorPicked(w, o1, NOTHING_PICKED, ...V, false)).toEqual({ project: w, skipped: [] })
    expect(mirrorPicked(w, o1, NOTHING_PICKED, ...V, true).project).toBe(w)
    expect(mirrorPicked(w, o1, pick({ masses: ['m1'] }), { x: 5, y: 5 }, { x: 5, y: 5 }, false)).toEqual({ project: w, skipped: [] })
    expect(mirrorPicked(w, o1, pick({ masses: ['m1'] }), { x: 5, y: NaN }, { x: 5, y: 9 }, true).project).toBe(w)
  })
})

describe('arrayPicked', () => {
  const d = { x: 0, y: 200 }
  const made = (p: Project, q: Project) => q.masses.filter((m) => !p.masses.some((x) => x.id === m.id))
  const centreOf = (m: Mass): Point => (m.footprint as Extract<Mass['footprint'], { kind: 'rect' }>).center

  it('makes count − 1 copies, the k-th k·d from the original', () => {
    const w = world()
    const r = arrayPicked(w, o1, pick({ masses: ['m1'] }), d, 4)
    expect(r.skipped).toEqual([])
    const copies = made(w, r.project)
    expect(copies).toHaveLength(3)
    const c = centreOf(mass(w, 'm1'))
    expect(copies.map((m) => centreOf(m).y - c.y).sort((a, b) => a - b)).toEqual([200, 400, 600])
    expect(new Set(r.project.masses.map((m) => m.id)).size).toBe(r.project.masses.length)
    expect(mass(r.project, 'm1')).toBe(mass(w, 'm1'))
  })

  it('makes a grid: rows along d2, the whole row repeated', () => {
    const w = world()
    const r = arrayPicked(w, o1, pick({ masses: ['m1'] }), { x: 0, y: 200 }, 3, 2, { x: 300, y: 0 })
    const copies = made(w, r.project)
    expect(copies).toHaveLength(5)
    const c = centreOf(mass(w, 'm1'))
    expect(copies.map((m) => `${centreOf(m).x - c.x},${centreOf(m).y - c.y}`).sort()).toEqual(['0,200', '0,400', '300,0', '300,200', '300,400'])
  })

  it('a count of 1 and one row returns the same project; so does a row count without its spacing', () => {
    const w = world()
    expect(arrayPicked(w, o1, pick({ masses: ['m1'] }), d, 1).project).toBe(w)
    expect(arrayPicked(w, o1, pick({ masses: ['m1'] }), d, 1, 1, { x: 5, y: 5 }).project).toBe(w)
    expect(arrayPicked(w, o1, pick({ masses: ['m1'] }), d, 1, 3).project).toBe(w)
    expect(arrayPicked(w, o1, NOTHING_PICKED, d, 5).project).toBe(w)
    expect(arrayPicked(w, o1, pick({ masses: ['m1'] }), { x: 0, y: 0 }, 5).project).toBe(w)
    expect(arrayPicked(w, o1, pick({ masses: ['m1'] }), d, 0).project).toBe(w)
    expect(arrayPicked(w, o1, pick({ masses: ['m1'] }), d, 2.5).project).toBe(w)
  })

  it('is what copy makes, count − 1 times: an anchored lot goes onto each copied mass, a group’s copies are a group each', () => {
    const grouped = groupMasses(world(), ['m1', 'm2'])!
    const anchored = addLot(grouped.project, o1, { anchor: { massId: 'm1', side: 's0' } })!
    const r = arrayPicked(anchored.project, o1, pick({ masses: ['m1', 'm2'], lots: [anchored.id] }), d, 3)
    const copies = made(anchored.project, r.project)
    expect(copies).toHaveLength(4)
    const groups = new Set(copies.map((m) => m.group))
    expect(groups.size).toBe(2)
    expect(groups.has(undefined)).toBe(false)
    expect(groups.has(grouped.id)).toBe(false)
    const lotsMade = lots(r.project).filter((l) => l.id !== anchored.id)
    expect(lotsMade).toHaveLength(2)
    expect(new Set(lotsMade.map((l) => l.anchor!.massId)).size).toBe(2)
    for (const l of lotsMade) expect(copies.some((m) => m.id === l.anchor!.massId)).toBe(true)
  })

  it('a block arrayed is new copies of its type, one for each copy', () => {
    const { project: t, id } = addWarehouseType(world())
    const placed = placeWarehouse(t, id, { x: 0, y: 0 }, 0, o1)!
    const levels = new Set(placed.project.buildings.find((b) => b.id === placed.id)!.levels.map((l) => l.id))
    const hall = placed.project.masses.find((m) => m.part === 'hall' && levels.has(m.levelId))!
    const r = arrayPicked(placed.project, o1, pick({ masses: [hall.id] }), { x: 0, y: 400 }, 3)
    const blocks = r.project.buildings.filter((b) => b.warehouse && !placed.project.buildings.some((x) => x.id === b.id))
    expect(blocks).toHaveLength(2)
    expect(blocks.every((b) => b.warehouse!.type === id)).toBe(true)
    expect(r.project.buildings.find((b) => b.id === placed.id)).toBe(placed.project.buildings.find((b) => b.id === placed.id))
  })

  it('says what copy skips once, however many copies', () => {
    const w = world()
    const drawing: SiteDrawing = { file: 'a.dxf', layers: [{ name: 'Walls', lines: [{ points: [{ x: 1, y: 0 }, { x: 5, y: 0 }] }] }] }
    const p = { ...w, site: { ...w.site, drawings: [drawing] } }
    const r = arrayPicked(p, o1, pick({ masses: ['m1'], drawings: [{ file: 'a.dxf' }] }), d, 4)
    expect(r.skipped).toEqual(['Drawings are not copied'])
    expect(made(p, r.project)).toHaveLength(3)
  })

  it('copies the other kinds along the same vector: a free lot, a note, a reference line, a dimension', () => {
    const w = world()
    const lot = addLot(w, o1, { rect: { center: { x: 200, y: 200 }, width: 30, depth: 20, rotation: 0 } })!
    const note = addNote(lot.project, { x: 5, y: 5 })!
    const line = addReferenceLine(note.project, [{ x: 0, y: 0 }, { x: 10, y: 0 }])!
    const dim = addDimension(line.project, { x: 10, y: 300 }, { x: 50, y: 300 }, 2)!
    const r = arrayPicked(dim.project, o1, pick({ lots: [lot.id], notes: [note.id], lines: [line.id], dimensions: [dim.id] }), { x: 7, y: 0 }, 3)
    expect(lots(r.project).map((l) => l.rect!.center.x)).toEqual([200, 207, 214])
    expect(r.project.notes!.map((n) => n.at.x)).toEqual([5, 12, 19])
    expect(r.project.referenceLines!.map((l) => l.points[0].x)).toEqual([0, 7, 14])
    expect(r.project.dimensions!.map((x) => x.a.x)).toEqual([10, 17, 24])
  })
})

describe('alignPicked', () => {
  /** The extent of a mass along the line's normal (a horizontal line y = 100: along y), of its real outline. */
  const yRange = (m: Mass) => {
    const ys = polyOf(m).map((q) => q.y)
    return { lo: Math.min(...ys), hi: Math.max(...ys) }
  }
  const H: [Point, Point] = [{ x: 0, y: 100 }, { x: 50, y: 100 }]

  it('edges: the side of a rotated rect nearest the line touches it; the other masses stay', () => {
    const w = world()
    const p = { ...w, masses: w.masses.map((m) => (m.id === 'm1' && m.footprint.kind === 'rect' ? { ...m, footprint: { ...m.footprint, center: { x: 120, y: 300 }, rotation: 30 } } : m)) }
    const r = alignPicked(p, o1, pick({ masses: ['m1'] }), ...H, 'edges')
    expect(r.skipped).toEqual([])
    expect(yRange(mass(r.project, 'm1')).lo).toBeCloseTo(100, 9)
    // moved square to the line: x did not change
    const was = mass(p, 'm1').footprint
    const now = mass(r.project, 'm1').footprint
    if (was.kind !== 'rect' || now.kind !== 'rect') throw new Error('a rect was expected')
    expect(now.center.x).toBe(was.center.x)
    expect(now.rotation).toBe(30)
    expect(mass(r.project, 'm2')).toBe(mass(p, 'm2'))
  })

  it('edges: a thing below the line is put on it by its top side, the centre decides the side', () => {
    const w = world()
    const p = { ...w, masses: w.masses.map((m) => (m.id === 'm1' && m.footprint.kind === 'rect' ? { ...m, footprint: { ...m.footprint, center: { x: 120, y: 20 } } } : m)) }
    const r = alignPicked(p, o1, pick({ masses: ['m1'] }), ...H, 'edges')
    expect(yRange(mass(r.project, 'm1')).hi).toBeCloseTo(100, 9)
  })

  it('centres: the centre of the extent is on the line', () => {
    const w = world()
    const p = { ...w, masses: w.masses.map((m) => (m.id === 'm1' && m.footprint.kind === 'rect' ? { ...m, footprint: { ...m.footprint, center: { x: 120, y: 300 }, rotation: 30 } } : m)) }
    const r = alignPicked(p, o1, pick({ masses: ['m1'] }), ...H, 'centres')
    const e = yRange(mass(r.project, 'm1'))
    expect((e.lo + e.hi) / 2).toBeCloseTo(100, 9)
  })

  it('works along a slanted line, square to it', () => {
    const w = world()
    const a = { x: 0, y: 0 }
    const b = { x: 100, y: 100 }
    const r = alignPicked(w, o1, pick({ masses: ['m3'] }), a, b, 'centres')
    const n = { x: -Math.SQRT1_2, y: Math.SQRT1_2 }
    const s = polyOf(mass(r.project, 'm3')).map((q) => q.x * n.x + q.y * n.y)
    expect((Math.min(...s) + Math.max(...s)) / 2).toBeCloseTo(0, 9)
    const was = footprintContour(mass(w, 'm3').footprint).vertices[0]
    const now = footprintContour(mass(r.project, 'm3').footprint).vertices[0]
    // the move is along the normal alone
    expect((now.x - was.x) * Math.SQRT1_2 + (now.y - was.y) * Math.SQRT1_2).toBeCloseTo(0, 9)
  })

  it('a contour mass is measured by its real outline, an arc’s bulge included', () => {
    const C: Contour = { vertices: [{ x: 100, y: 200, r: 0 }, { x: 160, y: 200, r: 0 }, { x: 160, y: 240, r: 0 }, { x: 100, y: 240, r: 0 }], arcs: { '0': -0.5 } }
    const added = addMass(world(), { programId: 'warehouse', footprint: { kind: 'contour', contour: C } })
    // edge 0 bulges down (outwards): a half-chord of 30 and a bulge of 0.5 give a sagitta of 15 m: the lowest point is y = 185
    const r = alignPicked(added.project, o1, pick({ masses: [added.id] }), ...H, 'edges')
    // the arc's lowest point is on the line: its corners are 15 m above it
    const ys = footprintContour(mass(r.project, added.id).footprint).vertices.map((v) => v.y)
    expect(Math.min(...ys)).toBeCloseTo(115, 3)
    expect(Math.max(...ys)).toBeCloseTo(155, 3)
  })

  it('a group is one unit: its members keep their places among themselves', () => {
    const grouped = groupMasses(world(), ['m1', 'm3'])!
    const r = alignPicked(grouped.project, o1, pick({ masses: ['m1', 'm3'] }), ...H, 'edges')
    const lo = Math.min(yRange(mass(r.project, 'm1')).lo, yRange(mass(r.project, 'm3')).lo)
    expect(lo).toBeCloseTo(100, 9)
    const dy = (id: string) => (mass(r.project, id).footprint as { center: Point }).center.y - (mass(grouped.project, id).footprint as { center: Point }).center.y
    expect(dy('m1')).toBeCloseTo(dy('m3'), 9)
    // the other group member stays as it was among them: only one of the two moved by that much, and they moved the same
    expect(dy('m1')).not.toBeCloseTo(0, 3)
  })

  it('a free lot, a reference line and a note: their extent is on the line', () => {
    const w = world()
    const lot = addLot(w, o1, { rect: { center: { x: 200, y: 200 }, width: 30, depth: 20, rotation: 0 } })!
    const line = addReferenceLine(lot.project, [{ x: 0, y: 150 }, { x: 10, y: 170 }])!
    const note = addNote(line.project, { x: 5, y: 230 })!
    const picked = pick({ lots: [lot.id], lines: [line.id], notes: [note.id] })
    const edges = alignPicked(note.project, o1, picked, ...H, 'edges').project
    expect(lots(edges)[0].rect!.center).toEqual({ x: 200, y: 110 })
    expect(edges.referenceLines![0].points).toEqual([{ x: 0, y: 100 }, { x: 10, y: 120 }])
    expect(edges.notes![0].at).toEqual({ x: 5, y: 100 })
    const centres = alignPicked(note.project, o1, picked, ...H, 'centres').project
    expect(lots(centres)[0].rect!.center).toEqual({ x: 200, y: 100 })
    expect(centres.referenceLines![0].points).toEqual([{ x: 0, y: 90 }, { x: 10, y: 110 }])
    expect(centres.notes![0].at).toEqual({ x: 5, y: 100 })
  })

  it('skips streets, gates, dimensions, drawings and an anchored lot alone, and says each once', () => {
    const w = world()
    const drawing: SiteDrawing = { file: 'a.dxf', layers: [{ name: 'Walls', lines: [{ points: [{ x: 1, y: 0 }, { x: 5, y: 0 }] }] }] }
    const st = drawStreet({ ...w, site: { ...w.site, drawings: [drawing] } }, o1, [{ x: 100, y: 300 }, { x: 150, y: 300 }])!
    const anchored = addLot(st.project, o1, { anchor: { massId: 'm1', side: 's0' } })!
    const dim = addDimension(anchored.project, { x: 10, y: 300 }, { x: 50, y: 300 }, 2)!
    const gate = gatesOf(dim.project, o1)[0].id
    const name = lots(dim.project).find((l) => l.id === anchored.id)!.name
    const r = alignPicked(dim.project, o1, pick({ nodes: st.nodes, gates: [gate], dimensions: [dim.id], drawings: [{ file: 'a.dxf' }], lots: [anchored.id] }), ...H, 'edges')
    expect(r.skipped).toEqual([
      `${name} follows its wall: pick its mass to align it`,
      'Streets are not aligned: move their nodes',
      'Gates are not aligned: they stay on their side',
      'Dimensions are not aligned',
      'Drawings are not aligned',
    ])
    expect(r.project).toBe(dim.project)
  })

  it('an anchored lot picked with its mass goes with it, unsaid', () => {
    const w = world()
    const anchored = addLot(w, o1, { anchor: { massId: 'm1', side: 's0' } })!
    const r = alignPicked(anchored.project, o1, pick({ masses: ['m1'], lots: [anchored.id] }), ...H, 'edges')
    expect(r.skipped).toEqual([])
    expect(lots(r.project)[0].anchor).toEqual({ massId: 'm1', side: 's0' })
  })

  it('nothing picked, no line, or a thing already there returns the same project', () => {
    const w = world()
    expect(alignPicked(w, o1, NOTHING_PICKED, ...H, 'edges')).toEqual({ project: w, skipped: [] })
    expect(alignPicked(w, o1, pick({ masses: ['m1'] }), { x: 5, y: 5 }, { x: 5, y: 5 }, 'edges').project).toBe(w)
    const once = alignPicked(w, o1, pick({ masses: ['m1'] }), ...H, 'edges').project
    expect(alignPicked(once, o1, pick({ masses: ['m1'] }), ...H, 'edges').project).toBe(once)
  })

  it('a locked mass is refused by settle when run through the store', () => {
    const locked = toggleMassLock(world(), 'm1')
    const s = createAppStore(locked)
    s.getState().apply((q) => alignPicked(q, o1, pick({ masses: ['m1'] }), ...H, 'edges').project)
    expect(s.getState().project.masses).toEqual(locked.masses)
  })
})

describe('what copy does is untouched', () => {
  it('copyPicked still makes one copy by d', () => {
    const w = world()
    expect(copyPicked(w, o1, pick({ masses: ['m1'] }), { x: 0, y: 10 }).project.masses).toHaveLength(w.masses.length + 1)
  })

  it('a copy of a locked lot is born unlocked, as a mirrored one is', () => {
    const lot = addLot(world(), o1, { rect: { center: { x: 200, y: 200 }, width: 30, depth: 20, rotation: 0 } })!
    const locked = lockLots(lot.project, [lot.id], true)
    const copied = copyPicked(locked, o1, pick({ lots: [lot.id] }), { x: 5, y: 0 }).project
    expect(lots(copied).map((l) => l.locked)).toEqual([true, undefined])
    const mirrored = mirrorPicked(locked, o1, pick({ lots: [lot.id] }), ...V, true).project
    expect(lots(mirrored).map((l) => l.locked)).toEqual([true, undefined])
  })
})

describe('Phase AS.5 review: a copy of a locked gate, Align with a rule and Align with a group already on the line', () => {
  const H0: [Point, Point] = [{ x: 0, y: 0 }, { x: 50, y: 0 }]
  const yRange = (m: Mass) => {
    const ys = polyOf(m).map((q) => q.y)
    return { lo: Math.min(...ys), hi: Math.max(...ys) }
  }

  it('a copy of a locked gate is born unlocked, an array of it too', () => {
    const w = world()
    const gate = gatesOf(w, o1)[0]
    const locked = lockGates(w, [gate.id], true, o1)
    expect(gatesOf(locked, o1).find((g) => g.id === gate.id)!.locked).toBe(true)
    const copied = copyPicked(locked, o1, pick({ gates: [gate.id] }), { x: 5, y: 0 }).project
    const made = gatesOf(copied, o1).filter((g) => g.id !== gate.id)
    expect(made.length).toBeGreaterThan(0)
    expect(made.every((g) => g.locked === undefined)).toBe(true)
    const arrayed = arrayPicked(locked, o1, pick({ gates: [gate.id] }), { x: 5, y: 0 }, 3).project
    const more = gatesOf(arrayed, o1).filter((g) => g.id !== gate.id)
    expect(more.length).toBeGreaterThan(1)
    expect(more.every((g) => g.locked === undefined)).toBe(true)
  })

  it('a follower picked with its leader moves once, by its own unit’s shift (the rule “office moves with warehouse”)', () => {
    const w = addRule(world(), { kind: 'attached', a: 'office', b: 'warehouse' })!.project
    // m1 (warehouse) is the leader of m3 (office): both picked, each is a unit of its own, aligned on y = 0 by its edge
    const r = alignPicked(w, o1, pick({ masses: ['m1', 'm3'] }), ...H0, 'edges')
    expect(r.skipped).toEqual([])
    expect(yRange(mass(r.project, 'm1'))).toEqual({ lo: 0, hi: 80 })
    expect(yRange(mass(r.project, 'm3'))).toEqual({ lo: 0, hi: 20 })
    // the leader not picked with it: the follower still goes with its leader, by its shift
    const alone = alignPicked(w, o1, pick({ masses: ['m1'] }), ...H0, 'edges')
    const dy = (id: string) => (mass(alone.project, id).footprint as { center: Point }).center.y - (mass(w, id).footprint as { center: Point }).center.y
    expect(dy('m1')).toBeCloseTo(-70, 9)
    expect(dy('m3')).toBeCloseTo(-70, 9)
    expect(mass(alone.project, 'm2')).toBe(mass(w, 'm2'))
  })

  it('a leader’s own follower picked in another unit is not moved by the leader as well', () => {
    const w = addRule(world(), { kind: 'attached', a: 'office', b: 'warehouse' })!.project
    const grouped = groupMasses(w, ['m1', 'm2'])!.project
    const r = alignPicked(grouped, o1, pick({ masses: ['m1', 'm2', 'm3'] }), ...H0, 'centres')
    // the two warehouses are one unit (80 m deep, centre at 110): 110 up; the office a unit of its own (centre 200): 200 up
    const centre = (id: string) => (yRange(mass(r.project, id)).lo + yRange(mass(r.project, id)).hi) / 2
    expect(centre('m3')).toBeCloseTo(0, 9)
    expect((Math.min(yRange(mass(r.project, 'm1')).lo, yRange(mass(r.project, 'm2')).lo) + Math.max(yRange(mass(r.project, 'm1')).hi, yRange(mass(r.project, 'm2')).hi)) / 2).toBeCloseTo(0, 9)
  })

  it('a group already on the line says nothing is skipped for its dimension, reference line and note', () => {
    let p = world()
    const note = addNote(p, { x: 5, y: 100 })!
    const line = addReferenceLine(note.project, [{ x: 0, y: 100 }, { x: 10, y: 100 }])!
    const dim = addDimension(line.project, { x: 0, y: 100 }, { x: 10, y: 100 }, 2)!
    const group = groupRefs(dim.project, o1, [{ kind: 'note', id: note.id }, { kind: 'reference-line', id: line.id }, { kind: 'dimension', id: dim.id }])!
    p = group.project
    const r = alignPicked(p, o1, pick({ notes: [note.id], lines: [line.id], dimensions: [dim.id] }), { x: 0, y: 100 }, { x: 50, y: 100 }, 'edges')
    expect(r.skipped).toEqual([])
    expect(r.project).toBe(p)
  })
})
