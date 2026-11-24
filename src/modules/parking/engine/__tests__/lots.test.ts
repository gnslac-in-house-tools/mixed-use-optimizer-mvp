// Parking lots (Decision "Lot tool", PK.3): a lot anchored to a side of a mass's box follows it (grown, moved, turned),
// the whole wall or a length of it, as many rows as fit to the setback or as it says; a free one its rectangle; the
// stalls it runs over left out and named; its entrance an end of its first aisle a street must reach.
import { describe, expect, it } from 'vitest'
import type { Lot, Point, Polygon, Project } from '../../../../model/schema.ts'
import type { DerivedMass, DerivedRoad } from '../../../../engine/types.ts'
import { CIRCULATION_DEFAULTS } from '../../../../engine/circulation/standards.ts'
import { derive } from '../../../../engine/derive.ts'
import { centroid } from '../../../../engine/geom/polygon.ts'
import { demoProject } from '../../../../state/demo.ts'
import { moveMasses } from '../../../../state/actions/masses.ts'
import { addLot, removeLots, setLot } from '../../actions.ts'
import { anchorFor, deriveLots, depthOf, lotIssues, rowsIn, sizesOf, wallOf, wallNear, type LotInput } from '../lots.ts'

const rect = (x0: number, y0: number, x1: number, y1: number): Polygon => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
]
const turn = (poly: Polygon, deg: number): Polygon => {
  const [c, s] = [Math.cos((deg * Math.PI) / 180), Math.sin((deg * Math.PI) / 180)]
  return poly.map((q) => ({ x: q.x * c - q.y * s, y: q.x * s + q.y * c }))
}
const mass = (polygon: Polygon, id = 'm1', name = 'Warehouse 1'): DerivedMass => ({
  id,
  name,
  levelId: 'l1',
  buildingId: 'b1',
  context: false,
  span: [0, 12],
  polygon,
  holes: [],
  corridors: [],
  area: 0,
  built: true,
})
const road = (points: Point[], vehicles: DerivedRoad['vehicles'] = 'cars'): DerivedRoad => ({ id: 'r', kind: 'street', points, width: 6, vehicles })
const S = CIRCULATION_DEFAULTS // stalls 2.5 × 5.5 m, aisles 6 m
const site = rect(-200, -100, 200, 100)
const input = (lots: Lot[], over: Partial<LotInput> = {}): LotInput => ({
  lots,
  shown: [mass(rect(-50, -25, 50, 25))],
  docks: [],
  gates: [],
  roads: [],
  site: { polygon: site, buildable: [[site]] },
  standards: S,
  ...over,
})
const anchored = (anchor: NonNullable<Lot['anchor']>, extra: Partial<Lot> = {}): Lot => ({ id: 'lot1', name: 'Lot 1', anchor, ...extra })

describe('rows', () => {
  it('each row its stalls’ depth, two rows to an aisle: 4 rows of 5.5 m stalls are 34 m; 34 m hold 4', () => {
    const z = sizesOf(S, {})
    expect(depthOf(1, z)).toBe(11.5)
    expect(depthOf(4, z)).toBe(34)
    expect(rowsIn(34, z)).toBe(4)
    expect(rowsIn(33.9, z)).toBe(3)
    // its own sizes over the standards'
    expect(sizesOf(S, { sizes: { aisleWidth: 7 } })).toEqual({ stallWidth: 2.5, stallDepth: 5.5, aisleWidth: 7 })
  })
})

describe('a wall', () => {
  it('a side of the box in the mass’s own frame: t0 under its first edge, facing out of it', () => {
    const w = wallOf(rect(-50, -25, 50, 25), 't0')!
    expect(w.length).toBe(100)
    expect(w.start).toEqual({ x: -50, y: -25 })
    expect(w.out.x).toBeCloseTo(0, 9)
    expect(w.out.y).toBe(-1)
    expect(wallOf(rect(-50, -25, 50, 25), 's1')!.length).toBe(50)
  })
})

describe('an anchored lot', () => {
  it('the whole wall, to the setback: 8 rows of 40 stalls on the south, 73.5 m to the limit', () => {
    const [l] = deriveLots(input([anchored({ massId: 'm1', side: 't0' })]))
    expect(l.anchor).toMatchObject({ massId: 'm1', facing: 'south', length: 100 })
    expect(l.fits).toBe(8)
    expect(l.rows).toBe(8)
    expect(l.stalls).toHaveLength(320)
    expect(l.left).toBe(0)
    // a walk off its wall
    expect(Math.max(...l.polygon.map((q) => q.y))).toBeCloseTo(-26.5, 6)
    expect(lotIssues([l])).toEqual([expect.objectContaining({ code: 'lot', message: expect.stringContaining('No street reaches Lot 1') })])
  })

  it('a length of it from the corner, and rows set past the setback: a warning, not held back', () => {
    const [l] = deriveLots(input([anchored({ massId: 'm1', side: 't0', from: 10, length: 50 }, { rows: 10 })]))
    // its tenth row is past the site's edge: its stalls left out, the nine inside kept
    expect(l.stalls).toHaveLength(9 * 20)
    expect(l.over).toEqual(['the site’s edge'])
    expect(l.length).toBe(50)
    expect(Math.min(...l.polygon.map((q) => q.x))).toBeCloseTo(-40, 6)
    expect(lotIssues([l]).map((i) => i.message)).toContain('Lot 1: 10 rows are 85 m deep; 8 fit to the setback.')
  })

  it('follows its mass: grown, its row longer; turned 90°, it faces east with it', () => {
    const lot = anchored({ massId: 'm1', side: 't0' }, { rows: 2 })
    expect(deriveLots(input([lot]), )[0].stalls).toHaveLength(80)
    const grown = deriveLots(input([lot], { shown: [mass(rect(-50, -25, 74, 25))] }))[0]
    expect(grown.stalls).toHaveLength(2 * Math.floor(124 / 2.5))
    const turned = deriveLots(input([lot], { shown: [mass(turn(rect(-50, -25, 50, 25), 90))] }))[0]
    expect(turned.anchor!.facing).toBe('east')
    expect(centroid(turned.polygon).x).toBeGreaterThan(25)
  })

  it('to the limit it stops before the first thing in its way: a street, another mass; rows set past it, a warning', () => {
    // a car street 6 m wide along y = -60: its edge 30.5 m out of the walk, 3 rows (28.5 m) fit before it
    const street = road([{ x: -150, y: -60 }, { x: 150, y: -60 }])
    const [l] = deriveLots(input([anchored({ massId: 'm1', side: 't0' })], { roads: [street] }))
    expect(l.fits).toBe(3)
    expect(l.stop).toBe('a street')
    expect(l.left).toBe(0)
    expect(lotIssues([l]).some((i) => i.message.includes('rows are'))).toBe(false)
    const [set] = deriveLots(input([anchored({ massId: 'm1', side: 't0' }, { rows: 5 })], { roads: [street] }))
    expect(lotIssues([set]).map((i) => i.message)).toContain('Lot 1: 5 rows are 45.5 m deep; 3 fit before a street.')
    // a street beside the wall, not in front of it: the setback still
    const beside = road([{ x: 70, y: -90 }, { x: 70, y: -20 }])
    expect(deriveLots(input([anchored({ massId: 'm1', side: 't0' })], { roads: [beside] }))[0]).toMatchObject({ fits: 8, stop: 'the setback' })
    // another warehouse 15 m south of it: 12 m between the walks, 1 row (11.5 m) fits
    const other = mass(rect(-50, -100, 50, -40), 'm2', 'Warehouse 2')
    const [m2] = deriveLots(input([anchored({ massId: 'm1', side: 't0' })], { shown: [mass(rect(-50, -25, 50, 25)), other] }))
    expect(m2).toMatchObject({ fits: 1, stop: 'Warehouse 2', left: 0 })
  })

  it('its mass gone: no lot', () => {
    expect(deriveLots(input([anchored({ massId: 'gone', side: 't0' })]))).toEqual([])
  })
})

describe('a free lot', () => {
  it('its rows along its width, as many as its depth holds; the stalls over a mass left out and named', () => {
    const lot: Lot = { id: 'lot1', name: 'Lot 1', rect: { center: { x: 0, y: -40 }, width: 60, depth: 40, rotation: 0 } }
    const [l] = deriveLots(input([lot]))
    expect(l.rows).toBe(rowsIn(40, sizesOf(S, {})))
    expect(l.left).toBeGreaterThan(0)
    expect(l.over).toEqual(['Warehouse 1'])
    expect(lotIssues([l]).map((i) => i.message)).toContain(`Lot 1 runs over Warehouse 1: ${l.left} of its stalls are left out.`)
    // clear of the mass, all of them
    const clear = deriveLots(input([{ ...lot, rect: { ...lot.rect!, center: { x: 0, y: -60 } } }]))[0]
    expect(clear.left).toBe(0)
  })
})

describe('its entrance', () => {
  it('the end of its first aisle nearer a road cars use; a road there reaches it, a trucks’ alone does not', () => {
    const lot = anchored({ massId: 'm1', side: 't0' }, { rows: 2 })
    // a car road running north–south past the lot's east end
    const east = road([{ x: 56, y: -80 }, { x: 56, y: -20 }])
    const [l] = deriveLots(input([lot], { roads: [east] }))
    expect(l.entrance.end).toBe('end')
    expect(l.entrance.names).toEqual(['West end', 'East end'])
    expect(l.reached).toBe(true)
    expect(deriveLots(input([lot], { roads: [{ ...east, vehicles: 'trucks' }] }))[0].reached).toBe(false)
    // set to the other end: no road there
    expect(deriveLots(input([{ ...lot, entry: 'start' }], { roads: [east] }))[0].reached).toBe(false)
  })
})

describe('the Lot tool', () => {
  it('next to a wall it finds it; a free rectangle dropped against one is anchored to it', () => {
    const shown = [mass(rect(-50, -25, 50, 25))]
    expect(wallNear(shown, { x: 0, y: -40 })).toMatchObject({ massId: 'm1', wall: { side: 't0' } })
    expect(wallNear(shown, { x: 0, y: -80 })).toBeNull()
    const z = sizesOf(S, {})
    expect(anchorFor(shown, { center: { x: -20, y: -26.5 - 17 }, width: 40, depth: 34, rotation: 0 }, z)).toEqual({
      anchor: { massId: 'm1', side: 't0', from: 10, length: 40 },
      rows: 4,
    })
    expect(anchorFor(shown, { center: { x: 0, y: -80 }, width: 40, depth: 34, rotation: 0 }, z)).toBeNull()
  })
})

describe('in the project', () => {
  /** The demo's option with a lot against the first ground mass's wall that has no court. */
  function withLot(): { p: Project; massId: string } {
    const p0 = demoProject()
    const d = derive(p0)
    const o = p0.options[0]
    const ground = Object.values(d.masses).find((x) => o.buildingIds.includes(x.buildingId) && x.built && x.polygon.length >= 3)!
    const r = addLot(p0, o.id, { anchor: { massId: ground.id, side: 's0' }, rows: 2 })!
    return { p: r.project, massId: ground.id }
  }

  it('its stalls count with the option’s, a street’s none inside it; moved with its mass', () => {
    const { p, massId } = withLot()
    const c = derive(p).circulation
    expect(c.lots).toHaveLength(1)
    expect(c.totals.lotStalls).toBe(c.lots[0].stalls.length)
    expect(c.totals.stalls).toBe(c.stalls.length + c.totals.lotStalls)
    const moved = derive(moveMasses(p, [massId], { x: 10, y: 5 })).circulation.lots[0]
    const before = centroid(c.lots[0].polygon)
    expect(centroid(moved.polygon).x - before.x).toBeCloseTo(10, 6)
    expect(centroid(moved.polygon).y - before.y).toBeCloseTo(5, 6)
  })

  it('addLot names it, setLot changes or takes away a field, removeLots takes it away; a lot both ways is none', () => {
    const { p } = withLot()
    const o = p.options[0].id
    const lot = p.options[0].lots![0]
    expect(lot.name).toBe('Lot 1')
    const two = addLot(p, o, { rect: { center: { x: 0, y: 0 }, width: 40, depth: 30, rotation: 0 } })!
    expect(two.project.options[0].lots![1].name).toBe('Lot 2')
    expect(addLot(p, o, { rect: { center: { x: 0, y: 0 }, width: 40, depth: 30, rotation: 0 }, anchor: lot.anchor })).toBeNull()
    expect(setLot(p, o, lot.id, { rows: null }).options[0].lots![0].rows).toBeUndefined()
    expect(setLot(p, o, lot.id, { rows: 2 })).toBe(p)
    expect(setLot(p, o, lot.id, { anchor: null })).toBe(p) // neither anchored nor free: not a lot
    expect(removeLots(p, o, [lot.id]).options[0].lots).toBeUndefined()
  })
})
