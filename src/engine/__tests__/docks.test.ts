// Docks and truck courts (Decision "Exterior circulation", 4.3). The demo: Warehouse 1 (m1, x 40–200, y 70–150),
// Warehouse 2 (m2, x 250–390, y 70–150, turned round), Office 1 (m3, x 100–140, y 190–210); the warehouse docks on one
// long wall, a door per 700 m²; courts 40 m deep. A rect's walls: 0 south, 1 east, 2 north, 3 west (turned round, 0 is
// north).
import { describe, expect, it } from 'vitest'
import { derive } from '../derive.ts'
import { defaultWalls, dockableWalls, doorsOn } from '../../modules/docks/engine/docks.ts'
import { moveMass } from '../../state/actions/masses.ts'
import { setMassDocks, setProgramDocks, updateStandards } from '../../state/actions/circulation.ts'
import { demoProject } from '../../state/demo.ts'

const rect = (x0: number, y0: number, x1: number, y1: number) => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
]
const docksOf = (d: ReturnType<typeof derive>, id: string) => d.circulation.docks.filter((k) => k.massId === id)

describe('walls', () => {
  it('a wall at least 8 m long can take docks: its middle as t and its normal out of the mass', () => {
    const walls = dockableWalls(rect(0, 0, 100, 50))
    expect(walls.map((w) => w.i)).toEqual([0, 1, 2, 3])
    expect(walls[0].t).toBeCloseTo(50 / 300, 9)
    expect(walls[0].out).toEqual({ x: 0, y: -1 })
    expect(walls[1].out.x).toBeCloseTo(1, 9)
    expect(dockableWalls(rect(0, 0, 100, 5)).map((w) => w.i)).toEqual([0, 2])
  })

  it('a program’s docks: on one long wall, the front, unless its court has no room (Decision "Docks on or off")', () => {
    const poly = rect(0, 0, 100, 50)
    const open = { masses: [], boundary: null }
    const near = (...masses: ReturnType<typeof rect>[]) => ({ masses, boundary: null })
    // the front is the first long wall along the outline: wall 0, south
    expect(defaultWalls(poly, open, 40).map((w) => w.i)).toEqual([0])
    expect(defaultWalls(poly, near(rect(-50, 60, 150, 80)), 40).map((w) => w.i)).toEqual([0])
    // a mass 10 m south: no room for a 40 m court there, the back has it
    expect(defaultWalls(poly, near(rect(-50, -20, 150, -10)), 40).map((w) => w.i)).toEqual([2])
    // neither has room: the roomier; a tie, the front
    expect(defaultWalls(poly, near(rect(-50, -20, 150, -10), rect(-50, 70, 150, 80)), 40).map((w) => w.i)).toEqual([2])
    expect(defaultWalls(poly, near(rect(-50, -20, 150, -10), rect(-50, 60, 150, 80)), 40).map((w) => w.i)).toEqual([0])
  })

  it('never a wall another mass stands against: joined, the free side; both covered, none (Decision "Docks turn with the building")', () => {
    const poly = rect(0, 0, 100, 50)
    const south = rect(0, -50, 100, 0) // against its front
    const north = rect(0, 50, 100, 100)
    expect(defaultWalls(poly, { masses: [south], boundary: null }, 40).map((w) => w.i)).toEqual([2])
    // the free side even with too little room for its court: a neighbour's depth is not room
    expect(defaultWalls(poly, { masses: [south], boundary: rect(-10, -60, 110, 60) }, 40).map((w) => w.i)).toEqual([2])
    expect(defaultWalls(poly, { masses: [south, north], boundary: null }, 40)).toEqual([])
    // a turned outline: its first long wall is its front, wherever it faces
    const turned = [poly[2], poly[3], poly[0], poly[1]]
    expect(defaultWalls(turned, { masses: [], boundary: null }, 40).map((w) => turned[w.i])).toEqual([poly[2]])
  })

  it('doors: one every so many m, centred; or per m² of floor, spread over the walls, never closer than 4 m', () => {
    const [south] = dockableWalls(rect(0, 0, 100, 50))
    const [byLength] = doorsOn([south], { per: 'm', every: 20 }, 5000)
    expect(byLength.map((q) => q.x)).toEqual([10, 30, 50, 70, 90])
    const [byArea] = doorsOn([south], { per: 'm2', every: 1000 }, 5000)
    expect(byArea).toHaveLength(5)
    expect(byArea.every((q) => q.x >= 4 && q.x <= 96)).toBe(true)
    const [capped] = doorsOn([south], { per: 'm2', every: 10 }, 5000)
    expect(capped).toHaveLength(24) // 92 m of usable wall, a door every 4 m at most
  })
})

describe('in the option', () => {
  it('each warehouse docks on its front, the first long wall of its outline; a door per 700 m²; a court 40 m deep', () => {
    const d = derive(demoProject())
    const [w1] = docksOf(d, 'm1')
    expect(docksOf(d, 'm1')).toHaveLength(1)
    expect(w1.wall).toBe(0) // south
    expect(w1.doors).toHaveLength(Math.ceil(12800 / 700))
    expect(Math.min(...w1.court.map((q) => q.y))).toBeCloseTo(30, 9)
    // Warehouse 2 is turned round: its front faces north
    expect(docksOf(d, 'm2')[0]).toMatchObject({ wall: 0, out: { x: expect.closeTo(0, 9), y: expect.closeTo(1, 9) } })
    expect(docksOf(d, 'm3')).toEqual([]) // the office has none
    expect(d.circulation.totals.doors).toBe(19 + 16)
    expect(d.circulation.totals.courtArea).toBeCloseTo(160 * 40 + 140 * 40, 0)
  })

  it('a mass’s own docks: the walls it names, the program’s doors rule; [] none', () => {
    let p = setMassDocks(demoProject(), 'm1', [(160 + 40) / 480, (400 + 40) / 480]) // east and west
    let d = derive(p)
    expect(docksOf(d, 'm1').map((k) => [k.wall, k.own])).toEqual([
      [1, true],
      [3, true],
    ])
    p = setMassDocks(p, 'm1', [])
    d = derive(p)
    expect(docksOf(d, 'm1')).toEqual([])
    // the office has no docks rule: its own docks get one door every 12 m
    d = derive(setMassDocks(demoProject(), 'm3', [20 / 120]))
    expect(docksOf(d, 'm3')[0].doors).toHaveLength(3)
  })

  it('the standards set the court’s depth; a program without docks has none', () => {
    let p = updateStandards(demoProject(), { courtDepth: 30 })
    expect(Math.min(...docksOf(derive(p), 'm1')[0].court.map((q) => q.y))).toBeCloseTo(40, 9)
    p = setProgramDocks(p, 'warehouse', null)
    expect(derive(p).circulation.docks).toEqual([])
  })

  it('a court that runs into another mass, or out of the site, warns', () => {
    // the office into Warehouse 1's court (south of it)
    let p = moveMass(demoProject(), 'm3', { x: 0, y: -160 })
    let d = derive(p)
    const into = d.issues.filter((i) => i.code === 'court')
    // with the office south, the north side has more room: the court goes there, clear
    expect(docksOf(d, 'm1')[0].wall).toBe(2)
    expect(into).toEqual([])
    p = setMassDocks(p, 'm1', [80 / 480]) // its own: the south wall, onto the office
    d = derive(p)
    expect(d.issues.filter((i) => i.code === 'court').map((i) => i.message)).toEqual(['The truck court of Warehouse 1 runs into Office 1.'])
    p = updateStandards(p, { courtDepth: 80 })
    expect(derive(p).issues.filter((i) => i.code === 'court').map((i) => i.message)).toContain('The truck court of Warehouse 1 leaves the site.')
  })
})
