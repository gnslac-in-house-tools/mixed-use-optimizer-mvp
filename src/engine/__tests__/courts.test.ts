// The truck court of the warehouse (Decision "Truck court", ST.5): its depth by docked wall (the wall's own, its block's,
// the standards'), moved with it, and the court two facing docked walls share. The demo: Warehouse 1 (m1, x 40–200,
// y 70–150, docked on its south wall), Warehouse 2 (m2, 140 × 80, turned round: its wall 0 the north one).
import { describe, expect, it } from 'vitest'
import { derive } from '../derive.ts'
import { area } from '../geom/polygon.ts'
import { facingGap } from '../../modules/docks/engine/docks.ts'
import { setCourtDepth } from '../../modules/docks/actions.ts'
import { addWarehouseType, placeWarehouse, setTypeCourt } from '../../modules/warehouse/actions.ts'
import { moveMass } from '../../state/actions/masses.ts'
import { setMassDocks, updateStandards } from '../../state/actions/circulation.ts'
import { demoProject } from '../../state/demo.ts'
import type { Project } from '../../model/schema.ts'

const bare = () => demoProject({ streets: false })
const docksOf = (p: Project, id: string) => derive(p).circulation.docks.filter((k) => k.massId === id)
const courtIssues = (p: Project) => derive(p).issues.filter((i) => i.code === 'court').map((i) => i.message)
const SOUTH = 80 / 480 // Warehouse 1's south wall, as the t of its middle

/** Warehouse 2 under Warehouse 1, its docked north wall facing Warehouse 1's docked south one, 40 m apart, along
 *  each other x 40–180 (the office out of the way). */
function facing(): Project {
  let p = moveMass(bare(), 'm3', { x: 250, y: 0 }) // x 350–390, y 190–210
  p = moveMass(p, 'm1', { x: 0, y: 60 }) // x 40–200, y 130–210
  p = moveMass(p, 'm2', { x: -210, y: -60 }) // x 40–180, y 10–90
  p = setMassDocks(p, 'm1', [SOUTH])
  return setMassDocks(p, 'm2', [70 / 440])
}

describe('a court’s depth', () => {
  it('the standards’, unless its wall has its own: set, kept by the wall, moved with the warehouse', () => {
    let p = setMassDocks(bare(), 'm1', [SOUTH])
    expect(docksOf(p, 'm1')[0]).toMatchObject({ depth: 40 })
    expect(docksOf(p, 'm1')[0].ownDepth).toBeUndefined()
    p = setCourtDepth(p, 'm1', SOUTH, 32.5)
    const [d] = docksOf(p, 'm1')
    expect(d).toMatchObject({ depth: 32.5, ownDepth: true })
    expect(Math.min(...d.court.map((q) => q.y))).toBeCloseTo(70 - 32.5, 9)
    // moved: the court with it, as deep
    const moved = docksOf(moveMass(p, 'm1', { x: 10, y: 5 }), 'm1')[0]
    expect(Math.min(...moved.court.map((q) => q.y))).toBeCloseTo(75 - 32.5, 9)
    // the standards no longer reach it; null gives it back
    expect(docksOf(updateStandards(p, { courtDepth: 30 }), 'm1')[0].depth).toBe(32.5)
    expect(docksOf(setCourtDepth(p, 'm1', SOUTH, null), 'm1')[0].depth).toBe(40)
    expect(setCourtDepth(p, 'm1', SOUTH, null).masses.find((m) => m.id === 'm1')!.courts).toBeUndefined()
  })

  it('a depth of its own stays within 5–200 m; not a depth: the same project', () => {
    const p = setMassDocks(bare(), 'm1', [SOUTH])
    expect(docksOf(setCourtDepth(p, 'm1', SOUTH, 1), 'm1')[0].depth).toBe(5)
    expect(docksOf(setCourtDepth(p, 'm1', SOUTH, 900), 'm1')[0].depth).toBe(200)
    expect(setCourtDepth(p, 'm1', SOUTH, Number.NaN)).toBe(p)
    expect(setCourtDepth(p, 'm1', SOUTH, -3)).toBe(p)
  })

  it('a block’s copy: the block’s depth over the standards’, its wall’s own over both; kept when the block changes', () => {
    const added = addWarehouseType(bare())
    let p = setTypeCourt(added.project, added.id, { depth: 35, range: [30, 40] })
    expect(p.warehouseTypes!.find((t) => t.id === added.id)!.court).toEqual({ depth: 35, range: [30, 40] })
    const placed = placeWarehouse(p, added.id, { x: 300, y: -150 }, 0, p.options[0].id)!
    p = placed.project
    const hall = p.masses.find((m) => m.part === 'hall' && p.buildings.find((b) => b.id === placed.id)!.levels.some((l) => l.id === m.levelId))!
    const mine = () => docksOf(p, hall.id)
    expect(mine().length).toBeGreaterThan(0)
    expect(mine().every((d) => d.depth === 35)).toBe(true)
    p = setCourtDepth(p, hall.id, mine()[0].t, 38)
    expect(mine()[0]).toMatchObject({ depth: 38, ownDepth: true })
    // the block's depth changed: the copy is made again, its wall's own kept
    p = setTypeCourt(p, added.id, { depth: 33 })
    expect(mine()[0].depth).toBe(38)
    expect(mine().slice(1).every((d) => d.depth === 33)).toBe(true)
    // a range that does not hold the depth: refused
    expect(setTypeCourt(p, added.id, { depth: 50, range: [30, 40] })).toBe(p)
    // none: the standards’ again
    p = setTypeCourt(p, added.id, null)
    expect(mine().slice(1).every((d) => d.depth === 40)).toBe(true)
  })
})

describe('a shared court', () => {
  it('two docked walls facing each other, their courts meeting: each says the other and the gap', () => {
    const p = facing()
    expect(docksOf(p, 'm1')[0].shares).toEqual({ massId: 'm2', wall: 0, gap: expect.closeTo(40, 6) })
    expect(docksOf(p, 'm2')[0].shares).toEqual({ massId: 'm1', wall: 0, gap: expect.closeTo(40, 6) })
    // 40 m apart, each 40 m deep: room for both, no warning
    expect(courtIssues(p)).toEqual([])
    // not along each other: no sharing
    expect(docksOf(moveMass(p, 'm2', { x: 200, y: 0 }), 'm1')[0].shares).toBeUndefined()
  })

  it('under the deeper court’s depth: one warning naming whose depth it lacks, and the courts stop at the other wall', () => {
    let p = updateStandards(facing(), { courtDepth: 50 })
    expect(courtIssues(p)).toEqual(["Warehouse 1 and Warehouse 2 share a truck court 40.0 m deep: Warehouse 1's asks 50.0 m."])
    // Warehouse 1's court stops at Warehouse 2's wall, all along its own: a rectangle, its mouth at that wall
    const [d] = docksOf(p, 'm1')
    expect(Math.abs(area(d.court))).toBeCloseTo(160 * 40, 3)
    expect([d.court[3].y, d.court[2].y]).toEqual([expect.closeTo(90, 6), expect.closeTo(90, 6)])
    // Warehouse 1's own 30 m: Warehouse 2's 50 m is the one it lacks
    p = setCourtDepth(p, 'm1', SOUTH, 30)
    expect(courtIssues(p)).toEqual(["Warehouse 1 and Warehouse 2 share a truck court 40.0 m deep: Warehouse 2's asks 50.0 m."])
  })

  it('facing: opposite ways out, one in front of the other, along each other at least 1 m', () => {
    const p = { a: { x: 0, y: 0 }, b: { x: 100, y: 0 }, out: { x: 0, y: -1 } }
    expect(facingGap(p, { a: { x: 100, y: -30 }, b: { x: 20, y: -30 }, out: { x: 0, y: 1 } })).toBeCloseTo(30, 9)
    expect(facingGap(p, { a: { x: 100, y: -30 }, b: { x: 20, y: -30 }, out: { x: 0, y: -1 } })).toBeNull() // same way
    expect(facingGap(p, { a: { x: 100, y: 30 }, b: { x: 20, y: 30 }, out: { x: 0, y: 1 } })).toBeNull() // behind
    expect(facingGap(p, { a: { x: 300, y: -30 }, b: { x: 200, y: -30 }, out: { x: 0, y: 1 } })).toBeNull() // past its end
  })
})

describe('the gap between warehouses (ST.6)', () => {
  const gaps = (p: Project) => derive(p).docks.gaps

  it('between two docked walls facing each other: from the middle of the stretch they share, wall to wall', () => {
    expect(gaps(facing())).toEqual([
      {
        a: { massId: 'm1', wall: 0 },
        b: { massId: 'm2', wall: 0 },
        from: { x: expect.closeTo(110, 6), y: expect.closeTo(130, 6) },
        to: { x: expect.closeTo(110, 6), y: expect.closeTo(90, 6) },
        gap: expect.closeTo(40, 6),
        asks: 40,
      },
    ])
    // courts that do not meet still have their gap; the deeper court is what it asks
    const shallow = setCourtDepth(updateStandards(facing(), { courtDepth: 15 }), 'm2', 70 / 440, 18)
    expect(gaps(shallow)).toMatchObject([{ gap: expect.closeTo(40, 6), asks: 18 }])
    expect(docksOf(shallow, 'm1')[0].shares).toBeUndefined()
  })

  it('none with a mass between them, nor between walls that do not face each other', () => {
    expect(gaps(moveMass(facing(), 'm3', { x: -240, y: -90 }))).toEqual([]) // the office at x 110–150, y 100–120
    expect(gaps(moveMass(facing(), 'm2', { x: 200, y: 0 }))).toEqual([])
    expect(gaps(bare())).toEqual([])
  })
})
