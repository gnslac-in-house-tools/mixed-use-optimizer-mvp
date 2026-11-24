// What reads a shaped truck court besides the circulation (Phase D.3, task 5; Decision "Courts in the circulation"): each reader takes the shapes for what
// is paved or in the way, the frame (`DerivedDock.court`) only for where the trucks come in. One test for each reader, and a list of the readers that
// stay on the frame, with their reason, which is checked against the sources: a file that reads `.court` and is on neither list fails.
import { describe, expect, it } from 'vitest'
import type { Lot, Polygon } from '../../../model/schema.ts'
import { CIRCULATION_DEFAULTS } from '../../../engine/circulation/standards.ts'
import { pointInPolygon } from '../../../engine/geom/polygon.ts'
import type { DerivedDock, DerivedMass, DerivedRoad } from '../../../engine/types.ts'
import { demoProject } from '../../../state/demo.ts'
import { setTerrain } from '../../../state/actions/site.ts'
import { EARTH_COURT } from '../../../engine/types.ts'
import { sourcesFor } from '../../../views/plan/snap/sources.ts'
import { layerTree } from '../../../views/layers/tree.ts'
import { CORE_MEASURES } from '../../core/measures.ts'
import { gridOf } from '../../measure.ts'
import { deriveLots } from '../../parking/engine/lots.ts'
import { deriveParkingBy } from '../../parking/engine/parking.ts'
import { courtDepthRefusal, setCourtDepth } from '../actions.ts'
import { gapOf, shapedDocks, shapedSite } from './shapedCourtFixture.ts'

const rect = (x0: number, y0: number, x1: number, y1: number): Polygon => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
]
const S = CIRCULATION_DEFAULTS

/** A dock whose court frame is `frame` and whose courts are `shapes`: only what the readers look at. */
const dock = (frame: Polygon, shapes?: Polygon[]): DerivedDock =>
  ({ massId: 'm1', wall: 0, t: 0.5, a: frame[0], b: frame[1], out: { x: 0, y: 1 }, doors: [], court: frame, ...(shapes ? { shapes } : {}), depth: 20, own: false })

const mass = (polygon: Polygon): DerivedMass => ({ id: 'm1', name: 'Warehouse 1', levelId: 'l1', buildingId: 'b1', context: false, span: [0, 12], polygon, holes: [], corridors: [], area: 0, built: true })

describe('the platform’s ground under a court', () => {
  it('a cell in the gap between two courts is not a court’s; a cell in one is', () => {
    const s = shapedSite(undefined, 0, setTerrain(demoProject(), plane()))
    const { d, split } = shapedDocks(s.p, s.optionId, s.hall.id)
    const g = d.earthwork!.grid
    const cell = (q: { x: number; y: number }) => Math.floor((q.y - g.y0) / g.size) * g.cols + Math.floor((q.x - g.x0) / g.size)
    const inShape = { x: (split.shapes![1][0].x + split.shapes![1][2].x) / 2, y: (split.shapes![1][0].y + split.shapes![1][2].y) / 2 }
    expect(g.kind[cell(inShape)]).toBe(EARTH_COURT)
    const gap = gapOf(split)
    expect(split.shapes!.some((q) => pointInPolygon(gap, q))).toBe(false)
    expect(g.kind[cell(gap)]).not.toBe(EARTH_COURT)
  })
})

describe('parking', () => {
  it('a lot keeps off the shapes, not the frame: a free lot in the gap between two courts keeps its stalls', () => {
    const lot: Lot = { id: 'lot1', name: 'Lot 1', rect: { center: { x: 0, y: -45 }, width: 12, depth: 11.5, rotation: 0 } }
    const site = rect(-200, -100, 200, 100)
    const frame = rect(-50, -60, 50, -25)
    const input = { lots: [lot], shown: [mass(rect(-50, -25, 50, 25))], gates: [], roads: [], site: { polygon: site, buildable: [[site]] }, standards: S }
    const shaped = deriveLots({ ...input, docks: [dock(frame, [rect(-50, -60, -10, -25), rect(10, -60, 50, -25)])] })[0]
    const whole = deriveLots({ ...input, docks: [dock(frame)] })[0]
    expect(whole.stalls).toHaveLength(0)
    expect(shaped.stalls.length).toBeGreaterThan(0)
    expect(shaped.stalls.every((c) => c.every((q) => Math.abs(q.x) <= 10 + 1e-6))).toBe(true)
  })

  it('the stalls along a street keep off the shapes, not the frame', () => {
    const road: DerivedRoad = { id: 'r', kind: 'street', points: [{ x: -60, y: 0 }, { x: 60, y: 0 }], width: 6, vehicles: 'all', parking: ['both'] }
    const site = rect(-100, -60, 100, 60)
    const input = { roads: [road], shown: [], gates: [], site, standards: S, option: { parking: 'double' as const } }
    const frame = rect(-30, 3, 30, 40)
    const north = (stalls: Polygon[]) => stalls.filter((c) => c.every((q) => q.y > 0))
    const shaped = deriveParkingBy({ ...input, docks: [dock(frame, [rect(-30, 3, -8, 40), rect(8, 3, 30, 40)])] }).stalls
    const whole = deriveParkingBy({ ...input, docks: [dock(frame)] }).stalls
    const inFrame = (c: Polygon) => pointInPolygon({ x: c.reduce((s, q) => s + q.x, 0) / c.length, y: c.reduce((s, q) => s + q.y, 0) / c.length }, frame)
    expect(north(whole).filter(inFrame)).toHaveLength(0)
    expect(north(shaped).filter((c) => c.every((q) => Math.abs(q.x) <= 8 + 1e-6)).length).toBeGreaterThan(0)
  })
})

describe('parking keeps off a court by its area, not its convex hull (review S4)', () => {
  it('a lot in the notch of a U-shaped court keeps its stalls there, none in the prongs', () => {
    const lot: Lot = { id: 'lot1', name: 'Lot 1', rect: { center: { x: 0, y: -50 }, width: 12, depth: 11.5, rotation: 0 } }
    const site = rect(-200, -100, 200, 100)
    const frame = rect(-50, -60, 50, -25)
    const u: Polygon = [{ x: -50, y: -25 }, { x: 50, y: -25 }, { x: 50, y: -60 }, { x: 10, y: -60 }, { x: 10, y: -40 }, { x: -10, y: -40 }, { x: -10, y: -60 }, { x: -50, y: -60 }]
    const out = deriveLots({ lots: [lot], shown: [mass(rect(-50, -25, 50, 25))], gates: [], roads: [], site: { polygon: site, buildable: [[site]] }, standards: S, docks: [dock(frame, [u])] })[0]
    expect(out.stalls.length).toBeGreaterThan(0)
    expect(out.stalls.every((c) => c.every((q) => Math.abs(q.x) <= 10 + 1e-6))).toBe(true)
  })

  it('the stalls along a street stand in the notch of a court open to it', () => {
    const road: DerivedRoad = { id: 'r', kind: 'street', points: [{ x: -60, y: 0 }, { x: 60, y: 0 }], width: 6, vehicles: 'all', parking: ['both'] }
    const site = rect(-100, -60, 100, 60)
    const frame = rect(-30, 3, 30, 40)
    const u: Polygon = [{ x: -30, y: 3 }, { x: -8, y: 3 }, { x: -8, y: 25 }, { x: 8, y: 25 }, { x: 8, y: 3 }, { x: 30, y: 3 }, { x: 30, y: 40 }, { x: -30, y: 40 }]
    const stalls = deriveParkingBy({ roads: [road], shown: [], gates: [], site, standards: S, option: { parking: 'double' as const }, docks: [dock(frame, [u])] }).stalls
    const inFrame = (c: Polygon) => c.every((q) => q.y > 0 && Math.abs(q.x) < 30)
    expect(stalls.filter(inFrame).length).toBeGreaterThan(0)
    expect(stalls.filter(inFrame).every((c) => c.every((q) => Math.abs(q.x) <= 8 + 1e-6))).toBe(true)
  })
})

describe('the free ground', () => {
  it('a gap between two courts is free ground; under the frame it would not be', () => {
    const s = shapedSite()
    const { d, split } = shapedDocks(s.p, s.optionId, s.hall.id)
    const gap = gapOf(split, 6)
    // a buildable strip in the gap, inside the frame and out of the masses
    const strip = rect(gap.x - 3, gap.y - 4, gap.x + 3, gap.y + 4)
    const grid = gridOf([[strip]], 0)!
    const e = { project: s.p, derived: d, ctx: { option: s.p.options.find((o) => o.id === s.optionId)!, grid } }
    const free = CORE_MEASURES.find((m) => m.id === 'free-ground')!.read(e)
    expect(free).toBeGreaterThan(20)
    const framed = { ...d, circulation: { ...d.circulation, docks: d.circulation.docks.map((k) => ({ ...k, shapes: undefined })) } }
    expect(CORE_MEASURES.find((m) => m.id === 'free-ground')!.read({ ...e, derived: framed })).toBe(0)
  })
})

describe('the plan’s snap and the layers tree', () => {
  it('a court’s corners are snap points: a source for each shape, none for the frame', () => {
    const s = shapedSite()
    const { d } = shapedDocks(s.p, s.optionId, s.hall.id)
    const courts = sourcesFor(s.p, d).filter((x) => x.label === 'truck court')
    const mine = d.circulation.docks.reduce((n, k) => n + (k.shapes?.length ?? 1), 0)
    expect(courts).toHaveLength(mine)
    const corners = courts.flatMap((c) => c.contour.vertices.map((v) => `${v.x.toFixed(3)},${v.y.toFixed(3)}`))
    const chamfered = shapedDocks(s.p, s.optionId, s.hall.id).split.shapes![0]
    for (const q of chamfered) expect(corners).toContain(`${q.x.toFixed(3)},${q.y.toFixed(3)}`)
  })

  it('the Truck courts row counts the courts, not the walls', () => {
    const s = shapedSite()
    const { d } = shapedDocks(s.p, s.optionId, s.hall.id)
    const rows = layerTree(s.p, s.optionId, d, { terrain: false, parking: true })
    const find = (rs: ReturnType<typeof layerTree>): { count?: number } | undefined => rs.flatMap((r) => (r.id === 'courts' ? [r] : r.children ? [find(r.children)] : [])).find(Boolean)
    expect(find(rows)?.count).toBe(d.circulation.docks.reduce((n, k) => n + (k.shapes?.length ?? 1), 0))
  })
})

function plane() {
  const points = []
  for (let x = -100; x <= 700; x += 50) for (let y = -100; y <= 500; y += 50) points.push({ x, y, z: 100 + 0.05 * x })
  return { contours: [], points }
}

// ---- Who reads which ---------------------------------------------------------------------------------------------------------------------------------

const sources = import.meta.glob<string>(['/src/**/*.{ts,tsx}', '!**/__tests__/**'], { query: '?raw', import: 'default', eager: true })
const source = (path: string): string => sources[path] ?? ''

describe('every reader of a dock’s court', () => {
  // what is drawn, paved, exported, counted, built over or kept clear of: the shapes
  const SHAPES = [
    '/src/engine/circulation/index.ts',
    '/src/modules/docks/measures.ts',
    '/src/modules/docks/views/DocksLayer.tsx',
    '/src/views/scene/Paving.tsx',
    '/src/io/exportPlan.ts',
    '/src/io/exportModel.ts',
    '/src/modules/terrain/engine/platforms.ts',
    '/src/modules/parking/engine/lots.ts',
    '/src/modules/parking/engine/parking.ts',
    '/src/modules/core/measures.ts',
    '/src/views/plan/snap/sources.ts',
    '/src/views/layers/tree.ts',
    '/src/state/actions/graph.ts',
    '/src/api/tools/site.ts',
  ]

  // where the trucks come in, or the wall the court stands on: the frame (`DerivedDock.court`), with the reason
  const FRAME: Record<string, string> = {
    '/src/engine/circulation/connect.ts': 'a court’s mouth (court[3]–court[2]) is where a way to a gate or a road begins',
    '/src/engine/circulation/network.ts': 'the approaches and the road network begin at the frame’s mouth',
    '/src/engine/circulation/route.ts': 'a route goes round the frame, one obstacle the trucks swing in',
    '/src/engine/circulation/legacy/rings.ts': 'the legacy ring road keeps clear of the frame whole (v10, frozen)',
    '/src/engine/circulation/legacy/network.ts': 'the legacy network’s approaches begin at the frame’s mouth (v10, frozen)',
    '/src/modules/docks/measures.ts': 'dock-to-gate measures from the frame’s mouth, court-clash reads the shapes (both in the one file)',
    '/src/api/tools/site.ts': 'getDocks says the frame (`court`) and, beside it, `shapes`',
    '/src/views/commands/index.ts': 'names the Court tool only, reads no dock: nothing to change',
  }

  // the wall a court stands on (its a, b and out), not the court: the 3D's dock faces and doors
  const WALL = ['/src/views/scene/Fixtures.tsx']

  it('the readers of what is paved or in the way take courtShapes', () => {
    for (const f of SHAPES) expect(source(f), f).toContain('courtShapes')
  })

  it('the readers on the frame say why, and still read it', () => {
    for (const [f, why] of Object.entries(FRAME)) {
      expect(why.length, f).toBeGreaterThan(10)
      expect(source(f), f).toMatch(/\.court\b|\bcourt\b|Court/)
    }
    for (const f of WALL) expect(source(f), f).not.toContain('.court')
  })

  it('no file takes a dock’s frame as the courts’ paving in its own words: `.map((d) => d.court)` is not left', () => {
    const left = Object.entries(sources)
      .filter(([f]) => !f.startsWith('/src/engine/circulation/') && !f.startsWith('/src/engine/massing/'))
      .filter(([, text]) => /docks?\.map\(\((?:d|x|k|c|dock)\) => (?:d|x|k|c|dock)\.court\)/.test(text))
      .map(([f]) => f)
    expect(left).toEqual([])
  })
})

describe('a wall’s own depth on a shaped wall (review S2)', () => {
  it('setCourtDepth is refused there: the same project, with its reason; a reset still works, and a wall without shapes still takes it', () => {
    const { p, hall } = shapedSite()
    const t = hall.blockCourts!.find((c) => c.shape)!.t
    expect(courtDepthRefusal(p, hall.id, t)).toMatch(/own shape/)
    expect(setCourtDepth(p, hall.id, t, 40)).toBe(p)
    const plain = hall.blockCourts!.find((c) => !c.shape)
    if (plain) expect(courtDepthRefusal(p, hall.id, plain.t)).toBeUndefined()
  })
})
