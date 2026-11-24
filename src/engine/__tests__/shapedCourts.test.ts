// The circulation reads a shaped truck court (Phase D.3, task 4; Decisions "Court shape", "Courts in the circulation"): what is paved and what stands in
// a court is its shapes (`DerivedDock.shapes`, polygons on the plan), where trucks come in is the frame (`DerivedDock.court`, the rectangle that holds
// them, its mouth at `court[3]`–`court[2]`). The stress test's scenarios (stress/scenarios.ts `shapedCourts`) hold the audit; these hold the numbers.
import { describe, expect, it } from 'vitest'
import type { Contour, Point, Project } from '../../model/schema.ts'
import { DOCKS_MEASURES } from '../../modules/docks/measures.ts'
import { connectStreets } from '../../state/actions/streets.ts'
import { onPlace } from '../../modules/warehouse/engine/copies.ts'
import { fromWall, wallFrame } from '../../modules/warehouse/engine/courts.ts'
import { generate } from '../../modules/warehouse/engine/generate.ts'
import { connectPaths } from '../circulation/connect.ts'
import { courtBlock as roadBlock } from '../circulation/route.ts'
import { derive, deriveMassing } from '../derive.ts'
import { area, bounds, pointInPolygon } from '../geom/polygon.ts'
import type { DerivedDock } from '../types.ts'
import { courtBlock, placedBlock, rectangle, shapedCourts, site, slab, withMasses } from './stress/scenarios.ts'

const scenario = (name: string) => shapedCourts().find((s) => s.name === name)!.project
const docksOf = (p: Project) => deriveMassing(p).docks.docks
const key = (q: Point) => `${q.x.toFixed(3)},${q.y.toFixed(3)}`
const sameSet = (a: Point[], b: Point[]) => expect(a.map(key).sort()).toEqual(b.map(key).sort())
/** How far out of a dock's wall a point is, and how far along it from the wall's start (m). */
const out = (d: DerivedDock, q: Point) => (q.x - d.a.x) * d.out.x + (q.y - d.a.y) * d.out.y
const along = (d: DerivedDock, q: Point) => {
  const l = Math.hypot(d.b.x - d.a.x, d.b.y - d.a.y)
  return ((q.x - d.a.x) * (d.b.x - d.a.x) + (q.y - d.a.y) * (d.b.y - d.a.y)) / l
}
const mouthOut = (d: DerivedDock) => out(d, d.court[3])

describe('a court narrower than its wall', () => {
  const p = scenario('shaped court: narrower than its wall, centred')
  const [d] = docksOf(p)

  it('derives its shape on the plan, where the copy’s court has one', () => {
    expect(docksOf(p)).toHaveLength(1)
    expect(d.shapes).toHaveLength(1)
    expect(area(d.shapes![0])).toBeCloseTo(48 * 40, 2)
    // centred on its wall, its wall side on the wall's line
    const us = d.shapes![0].map((q) => along(d, q))
    const wall = Math.hypot(d.b.x - d.a.x, d.b.y - d.a.y)
    expect((Math.min(...us) + Math.max(...us)) / 2).toBeCloseTo(wall / 2, 3)
    expect(Math.max(...us) - Math.min(...us)).toBeCloseTo(48, 3)
    expect(Math.min(...d.shapes![0].map((q) => out(d, q)))).toBeCloseTo(0, 5)
    expect(Math.max(...d.shapes![0].map((q) => out(d, q)))).toBeCloseTo(40, 5)
  })

  it('lands on the plan points the wall’s frame names, through the copy’s place', () => {
    const t = p.warehouseTypes![0]
    const copy = p.buildings.find((b) => b.warehouse)!.warehouse!
    const e1 = generate(t).edges.find((e) => e.id === 'e1')!
    const frame = wallFrame(e1)
    const corners = [
      { x: 12, y: 0 },
      { x: 60, y: 0 },
      { x: 60, y: 40 },
      { x: 12, y: 40 },
    ].map((q) => onPlace(copy.place, fromWall(frame, q)))
    sameSet(d.shapes![0], corners)
  })

  it('the frame is the rectangle that holds it: its mouth at the far edge, its ends on the wall’s line', () => {
    expect(d.court).toHaveLength(4)
    expect(area(d.court)).toBeCloseTo(48 * 40, 2)
    expect(mouthOut(d)).toBeCloseTo(40, 5)
    expect(out(d, d.court[0])).toBeCloseTo(0, 5)
    expect(out(d, d.court[1])).toBeCloseTo(0, 5)
    expect(d.depth).toBeCloseTo(40, 5)
    // the frame's start is the shape's lowest x, not the wall's
    expect(along(d, d.court[0])).toBeGreaterThan(5)
  })

  it('the court’s area is the shape’s', () => {
    expect(deriveMassing(p).docks.courtArea).toBeCloseTo(48 * 40, 1)
    expect(derive(p).circulation.totals.courtArea).toBeCloseTo(48 * 40, 1)
  })
})

describe('a court with its far corners chamfered', () => {
  const p = scenario('shaped court: far corners chamfered 6 × 6 m')
  const [d] = docksOf(p)

  it('pays only the shape: the frame keeps the cut corners, a stall or a road there is not in the court', () => {
    expect(d.shapes).toHaveLength(1)
    expect(area(d.shapes![0])).toBeCloseTo(72 * 40 - 36, 1)
    expect(area(d.court)).toBeCloseTo(72 * 40, 1)
    expect(deriveMassing(p).docks.courtArea).toBeCloseTo(72 * 40 - 36, 1)
    // the frame's far corners are cut off the shape
    for (const q of [d.court[2], d.court[3]]) expect(pointInPolygon(q, d.shapes![0])).toBe(false)
    const inside = { x: (d.court[2].x + d.court[3].x) / 2, y: (d.court[2].y + d.court[3].y) / 2 }
    expect(pointInPolygon({ x: inside.x - d.out.x * 0.5, y: inside.y - d.out.y * 0.5 }, d.shapes![0])).toBe(true)
  })

  it('the mouth is the frame’s far edge, as it was', () => {
    expect(mouthOut(d)).toBeCloseTo(40, 5)
  })
})

describe('a wall with two courts after a split', () => {
  const p = scenario('shaped court: two courts on one wall after a split, a gap between them')
  const [d] = docksOf(p)

  it('one dock with both shapes, the gap between them not paved', () => {
    expect(docksOf(p)).toHaveLength(1)
    expect(d.shapes).toHaveLength(2)
    for (const sh of d.shapes!) expect(area(sh)).toBeCloseTo(1200, 1)
    expect(deriveMassing(p).docks.courtArea).toBeCloseTo(2400, 1)
    // the frame spans both, the gap included
    expect(area(d.court)).toBeCloseTo(72 * 40, 1)
    const mid = { x: (d.a.x + d.b.x) / 2 + d.out.x * 10, y: (d.a.y + d.b.y) / 2 + d.out.y * 10 }
    expect(pointInPolygon(mid, d.court)).toBe(true)
    expect(d.shapes!.some((s) => pointInPolygon(mid, s))).toBe(false)
    expect(d.depth).toBeCloseTo(40, 5)
  })
})

describe('a shaped court facing another warehouse’s court', () => {
  it('shared: the shape stops at the other wall, as the rectangle does', () => {
    const p = scenario('shaped court: facing a rectangular court 30 m away, under both depths (shared, cut at the other wall)')
    // each block's front has its docks and their court; the courts that face each other are the shared ones
    const ds = docksOf(p).filter((d) => d.shares)
    expect(ds).toHaveLength(2)
    const shaped = ds.find((d) => d.shapes)!
    const plain = ds.find((d) => !d.shapes)!
    expect(shaped.shares).toBeDefined()
    expect(plain.shares).toBeDefined()
    const gap = shaped.shares!.gap
    expect(gap).toBeLessThan(40)
    expect(Math.max(...shaped.shapes!.flatMap((s) => s.map((q) => out(shaped, q))))).toBeCloseTo(gap, 4)
    expect(mouthOut(shaped)).toBeCloseTo(gap, 4)
    expect(mouthOut(plain)).toBeCloseTo(plain.shares!.gap, 4)
    // its width is its own: 48 m, not the wall's 72
    expect(area(shaped.shapes![0])).toBeCloseTo(48 * gap, 1)
    // what it asks stays what it asked: the Issue says so
    const said = derive(p).issues.filter((i) => i.code === 'court').map((i) => i.message)
    expect(said.some((m) => m.includes('share a truck court'))).toBe(true)
  })
})

describe('a court that flares past its wall’s ends', () => {
  const flare: Contour = {
    vertices: [
      { x: 24, y: 0, r: 0 },
      { x: 48, y: 0, r: 0 },
      { x: 92, y: 40, r: 0 },
      { x: -20, y: 40, r: 0 },
    ],
  }
  const block = () => {
    const b = courtBlock(site(rectangle(500, 320)), [{ edge: 'e1', id: 'c1', shape: flare }])
    return placedBlock(b.project, b.id, 250, 170)
  }
  const runsInto = (p: Project) => derive(p).issues.filter((i) => i.code === 'court' && i.message.includes('runs into')).map((i) => i.message)

  it('the frame is as wide as the flare, past the wall; the shape is the flare', () => {
    const [d] = docksOf(block())
    const wall = Math.hypot(d.b.x - d.a.x, d.b.y - d.a.y)
    const us = d.court.slice(0, 2).map((q) => along(d, q))
    expect(Math.max(...us) - Math.min(...us)).toBeGreaterThan(wall)
    expect(Math.max(...d.court.map((q) => along(d, q))) - Math.min(...d.court.map((q) => along(d, q)))).toBeCloseTo(112, 3)
    expect(area(d.shapes![0])).toBeCloseTo(((24 + 112) / 2) * 40, 1)
  })

  it('a neighbour in the shape is run into', () => {
    const p = withMasses(block(), [{ x: 296, y: 116, w: 12, d: 12, building: 'own' }])
    expect(runsInto(p)).toHaveLength(1)
  })

  it('a neighbour in the frame but outside the shape is not', () => {
    const p = withMasses(block(), [{ x: 300, y: 138, w: 8, d: 8, building: 'own' }])
    const [d] = docksOf(p).filter((x) => x.shapes)
    const at = { x: 300, y: 138 }
    expect(pointInPolygon(at, d.court)).toBe(true)
    expect(d.shapes!.some((s) => pointInPolygon(at, s))).toBe(false)
    expect(runsInto(p)).toEqual([])
  })
})

describe('a court that leaves the site', () => {
  const p = scenario('shaped court: leaving the site')

  it('the Issue says so, and the measure counts the part of the shape that is out', () => {
    expect(derive(p).issues.some((i) => i.code === 'court' && i.message.includes('leaves the site'))).toBe(true)
    const e = { project: p, derived: derive(p), ctx: { option: p.options[0], grid: null } }
    const clash = DOCKS_MEASURES.find((m) => m.id === 'court-clash')!.read(e)
    const [d] = docksOf(p)
    // the shape, 48 m wide, from the wall 24 m in from the site's edge (the block's wall stands 46 m up): what is out is 48 m wide
    const box = bounds(d.shapes![0])
    expect(box.minY).toBeLessThan(0)
    expect(clash).toBeCloseTo(48 * -box.minY, 0)
  })
})

describe('a court without a shape', () => {
  it('has no shapes: its court is the rectangle, as it was', () => {
    const b = courtBlock(site(rectangle(500, 320)), [{ edge: 'e1', depth: 30 }])
    const p = placedBlock(b.project, b.id, 250, 170)
    const [d] = docksOf(p)
    expect(d.shapes).toBeUndefined()
    expect(d.depth).toBe(30)
    expect(mouthOut(d)).toBeCloseTo(30, 5)
  })
})

describe('a copy turned 30°', () => {
  it('its shapes land on the plan points the type’s frame names, through the place', () => {
    const b = courtBlock(site(rectangle(500, 320)), [{ edge: 'e1', id: 'c1', shape: slab(12, 60, 40, 6) }])
    const p = placedBlock(b.project, b.id, 250, 170, 30)
    const [d] = docksOf(p).filter((x) => x.shapes)
    const copy = p.buildings.find((x) => x.warehouse)!.warehouse!
    const frame = wallFrame(generate(p.warehouseTypes![0]).edges.find((e) => e.id === 'e1')!)
    // the shape's four corners, the chamfered ones cut: the plan points of the sharp ones are corners of the polygon
    for (const q of [{ x: 12, y: 0 }, { x: 60, y: 0 }]) {
      const at = onPlace(copy.place, fromWall(frame, q))
      expect(d.shapes![0].some((v) => Math.hypot(v.x - at.x, v.y - at.y) < 1e-4)).toBe(true)
    }
    expect(area(d.shapes![0])).toBeCloseTo(48 * 40 - 36, 1)
    // and the wall's own way out: the frame's mouth is 40 m out of the wall's line, turned with the copy
    expect(mouthOut(d)).toBeCloseTo(40, 4)
  })
})

describe('trucks come in by the frame', () => {
  const chamfered = scenario('shaped court: far corners chamfered 6 × 6 m')

  it('Connect starts its way half a metre inside the frame’s mouth, and the court is reached by it', () => {
    const o = chamfered.options[0]
    const [d] = docksOf(chamfered)
    const mouth = { x: (d.court[2].x + d.court[3].x) / 2 - d.out.x * 0.5, y: (d.court[2].y + d.court[3].y) / 2 - d.out.y * 0.5 }
    const c = connectPaths(chamfered, o.id)
    expect(c.paths.some((path) => Math.hypot(path[0].x - mouth.x, path[0].y - mouth.y) < 1e-6)).toBe(true)
    const connected = connectStreets(chamfered, o.id).project
    expect(derive(connected).circulation.reached).toContain(d.massId)
  })

  it('a road keeps out of the frame as a whole: its block is as wide as the frame, past the wall’s ends where the court flares', () => {
    const flare = scenario('shaped court: flaring past its wall’s ends into a neighbour')
    const d = docksOf(flare).find((x) => x.shapes)!
    const wall = Math.hypot(d.b.x - d.a.x, d.b.y - d.a.y)
    const block = roadBlock(d, 0)
    const us = block.map((q) => along(d, q))
    expect(Math.max(...us) - Math.min(...us)).toBeGreaterThan(wall + 30)
    expect(Math.max(...us) - Math.min(...us)).toBeCloseTo(112, 3)
    // an unshaped court's block is the wall's, as it was
    const plain = docksOf(derivedPlain())[0]
    const pu = roadBlock(plain, 0).map((q) => along(plain, q))
    expect(Math.max(...pu) - Math.min(...pu)).toBeCloseTo(Math.hypot(plain.b.x - plain.a.x, plain.b.y - plain.a.y), 6)
  })

  it('dock → truck gate measures from the frame’s mouth: a court off to one side of its wall', () => {
    const b = courtBlock(site(rectangle(500, 320)), [{ edge: 'e1', id: 'c1', shape: slab(0, 24, 40) }])
    const p = placedBlock(b.project, b.id, 250, 170)
    const d = docksOf(p).find((x) => x.shapes)!
    const e = { project: p, derived: derive(p), ctx: { option: p.options[0], grid: null } }
    const gates = e.derived.circulation.gates.filter((g) => g.vehicles !== 'cars' && g.flow !== 'out').map((g) => g.end)
    expect(gates.length).toBeGreaterThan(0)
    const mouth = { x: (d.court[0].x + d.court[1].x) / 2 + d.out.x * d.depth, y: (d.court[0].y + d.court[1].y) / 2 + d.out.y * d.depth }
    const want = Math.min(...gates.map((g) => Math.hypot(mouth.x - g.x, mouth.y - g.y)))
    const read = DOCKS_MEASURES.find((m) => m.id === 'dock-to-gate')!.read(e)
    // the block's front also has its docks' court (the walls without a shape): the sum has theirs too
    const others = e.derived.circulation.docks
      .filter((x) => x !== d && !x.shapes)
      .reduce((n, x) => n + Math.min(...gates.map((g) => Math.hypot((x.a.x + x.b.x) / 2 + x.out.x * x.depth - g.x, (x.a.y + x.b.y) / 2 + x.out.y * x.depth - g.y))), 0)
    expect(read).toBeCloseTo(want + others, 6)
    // off the wall's middle: the wall's own would have said otherwise
    const wallMouth = { x: (d.a.x + d.b.x) / 2 + d.out.x * d.depth, y: (d.a.y + d.b.y) / 2 + d.out.y * d.depth }
    expect(Math.hypot(mouth.x - wallMouth.x, mouth.y - wallMouth.y)).toBeGreaterThan(10)
  })
})

/** A block with a court that has no shape, on the same site. */
function derivedPlain(): Project {
  const b = courtBlock(site(rectangle(500, 320)), [{ edge: 'e1', depth: 40 }])
  return placedBlock(b.project, b.id, 250, 170)
}
