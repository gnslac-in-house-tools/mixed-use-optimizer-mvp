// Truck courts by edge, from the block to the site (Decisions "Truck court", "Elements by module"; BE.2): a docked wall
// always has its court, the block's depth; the block may give an edge its own depth, or put a court in front of an
// edge without docks (no doors there); its copies' walls take them, under a copy's own pill (Mass.courts). The entries
// follow their edges when the outline changes (renamed, merged, split), and a copy's own shape carries its own.
import { describe, expect, it } from 'vitest'
import { ProjectSchema, type CourtByEdge, type HallElement, type Project, type WarehouseType } from '../../../../model/schema.ts'
import { deriveMassing } from '../../../../engine/derive.ts'
import { demoProject } from '../../../../state/demo.ts'
import { setCourtDepth } from '../../../docks/actions.ts'
import { addWarehouseType, moveBlockEdge, placeWarehouse, shapeWarehouse, updateWarehouseStep } from '../../actions.ts'
import { copyGenerated } from '../copies.ts'
import { followCourts } from '../elements.ts'
import { generate, ownBundle } from '../generate.ts'
import { boxOutline } from '../shape.ts'

const dock = (module: number, edge = 'e1'): HallElement => ({ id: `d${module}`, kind: 'dock', edge, module, width: 3 })
const withType = (p: Project, id: string, f: (t: WarehouseType) => WarehouseType): Project => ({ ...p, warehouseTypes: p.warehouseTypes!.map((t) => (t.id === id ? f(t) : t)) })
const typeIn = (p: Project, id: string) => p.warehouseTypes!.find((t) => t.id === id)!

/** A block 36 × 24 m on 12 m bays of 4 modules (12 × 8 modules), docked on these modules of its front, its courts by
 *  edge and its depth (35 m) given; in a project. */
function block(docks: number[], courts?: CourtByEdge[]): { p: Project; id: string } {
  let { project: p, id } = addWarehouseType(demoProject())
  p = updateWarehouseStep(p, id, 'grid', { x: 12, y: 12, modules: 4 })
  p = updateWarehouseStep(p, id, 'hall', { length: 36, width: 24, ends: 'both' })
  p = updateWarehouseStep(p, id, 'elements', docks.map((k) => dock(k)))
  p = withType(p, id, (t) => ({ ...t, court: { depth: 35 }, ...(courts ? { courts } : {}) }))
  return { p, id }
}

/** The block placed on the site, unturned: its building and its hall's mass. */
function onSite({ p, id }: { p: Project; id: string }) {
  const placed = placeWarehouse(p, id, { x: 200, y: 150 }, 0, p.options[0].id)!
  const q = placed.project
  return { p: q, building: placed.id, hall: hallOf(q, placed.id) }
}
const hallOf = (p: Project, building: string) => {
  const levels = new Set(p.buildings.find((b) => b.id === building)!.levels.map((l) => l.id))
  return p.masses.find((m) => levels.has(m.levelId) && m.part === 'hall')!
}

/** A mass's derived docked walls, each by the way out of it: front (e1), right (e2), back (e3), left (e4). */
function walls(p: Project, massId: string) {
  const side = (o: { x: number; y: number }) => (o.y < -0.5 ? 'front' : o.y > 0.5 ? 'back' : o.x > 0.5 ? 'right' : 'left')
  return new Map(deriveMassing(p).docks.docks.filter((d) => d.massId === massId).map((d) => [side(d.out), d]))
}

describe('truck courts by edge, to the site', () => {
  it('a court-only wall has no doors', () => {
    const { p, hall } = onSite(block([], [{ edge: 'e3' }]))
    expect(ProjectSchema.safeParse(p).success).toBe(true)
    // the wall is among its docked walls, its doors given (none on it), so no default doors from its length
    expect(hall.docks).toHaveLength(1)
    expect(hall.doorsAt).toEqual([])
    const w = walls(p, hall.id)
    expect([...w.keys()]).toEqual(['back'])
    expect(w.get('back')!.doors).toEqual([])
    expect(w.get('back')!.court).toHaveLength(4)
    // no depth of its own: the block's
    expect(w.get('back')!.depth).toBe(35)
  })

  it('a block’s edge depth reaches the site', () => {
    const { p, hall } = onSite(block([1, 2, 9, 10], [{ edge: 'e1', depth: 30 }, { edge: 'e3', depth: 20 }]))
    expect(hall.blockCourts).toHaveLength(2)
    const w = walls(p, hall.id)
    expect(w.get('front')!.depth).toBe(30)
    expect(w.get('front')!.doors).toHaveLength(4)
    expect(w.get('front')!.ownDepth).toBeUndefined()
    expect(w.get('back')!.depth).toBe(20)
    expect(w.get('back')!.doors).toEqual([])
  })

  it('a docked wall always has its court: the block’s depth where no entry says another', () => {
    const { p, hall } = onSite(block([1, 2], [{ edge: 'e2', depth: 25 }]))
    const w = walls(p, hall.id)
    expect(w.get('front')!.depth).toBe(35)
    expect(w.get('front')!.doors).toHaveLength(2)
    expect(w.get('right')!.depth).toBe(25)
  })

  it('the copy’s own pill wins', () => {
    const made = block([1, 2], [{ edge: 'e1', depth: 30 }])
    const site = onSite(made)
    const t = site.hall.docks![0]
    let p = setCourtDepth(site.p, site.hall.id, t, 25)
    expect(walls(p, site.hall.id).get('front')).toMatchObject({ depth: 25, ownDepth: true })
    // its block made again (its height): the pill stays, the block's depth under it
    p = updateWarehouseStep(p, made.id, 'envelope', { height: 14 })
    const hall = hallOf(p, site.building)
    expect(hall.blockCourts).toEqual([{ t, depth: 30 }])
    expect(walls(p, hall.id).get('front')).toMatchObject({ depth: 25, ownDepth: true })
    // the pill taken away: the block's edge depth again
    p = setCourtDepth(p, hall.id, t, null)
    expect(walls(p, hall.id).get('front')!.depth).toBe(30)
  })
})

describe('courts follow their edges', () => {
  const edges = (...ids: string[]) => ids.map((id) => ({ id }))

  it('renamed, merged and split: the kept edge takes a lost one’s, its own first; a split keeps it on the original', () => {
    const courts: CourtByEdge[] = [{ edge: 'e1', depth: 30 }, { edge: 'e5', depth: 20 }, { edge: 'e6' }, { edge: 'e9', depth: 40 }]
    // e5 merged into e1 (which has its own), e6 into e2 (which has none), e9 gone
    expect(followCourts(courts, new Map([['e5', 'e1'], ['e6', 'e2']]), edges('e1', 'e2', 'e3', 'e4'))).toEqual([{ edge: 'e1', depth: 30 }, { edge: 'e2' }])
    // e1 split, its rest e7: the court stays on e1
    expect(followCourts([{ edge: 'e1', depth: 30 }], new Map(), edges('e1', 'e2', 'e3', 'e4', 'e7'))).toEqual([{ edge: 'e1', depth: 30 }])
    // nothing to follow: the same list
    const same = [{ edge: 'e1', depth: 30 }]
    expect(followCourts(same, new Map(), edges('e1', 'e2'))).toBe(same)
  })

  it('a block’s edge split keeps the court on the original; merged back, the rest’s goes to the edge kept', () => {
    let { p, id } = block([1, 2, 9, 10], [{ edge: 'e1', depth: 30 }])
    // a notch pushed 2 modules into the front, from module line 4 to 8: e1 keeps 0–4, the rest past it 8–12
    p = shapeWarehouse(p, id, { kind: 'pull', edge: 'e1', from: 4, to: 8, by: -2 }).project
    const g = generate(typeIn(p, id))
    const rest = g.edges.find((e) => e.horizontal && e.outer && e.side === 'front' && e.id !== 'e1')!
    expect(typeIn(p, id).courts).toEqual([{ edge: 'e1', depth: 30 }])
    // the court moved to the rest, then the notch pulled back out: one front edge again, the court on it
    p = withType(p, id, (t) => ({ ...t, courts: [{ edge: rest.id, depth: 20 }] }))
    const inner = g.edges.find((e) => e.horizontal && !e.outer && e.side === 'front')!
    p = shapeWarehouse(p, id, { kind: 'pull', edge: inner.id, from: 4, to: 8, by: 2 }).project
    const front = generate(typeIn(p, id)).edges.filter((e) => e.horizontal && e.side === 'front')
    expect(front).toHaveLength(1)
    expect(typeIn(p, id).courts).toEqual([{ edge: front[0].id, depth: 20 }])
  })
})

describe('a copy’s own shape carries its courts', () => {
  it('one bundle: the block’s entries on its own outline’s edges', () => {
    const { p, id } = block([1, 2], [{ edge: 'e1', depth: 30 }, { edge: 'e9', depth: 40 }])
    const b = ownBundle(typeIn(p, id), { morphology: { outline: boxOutline(12, 8) } })!
    expect(b.courts).toEqual([{ edge: 'e1', depth: 30 }])
    // a bundle that has its own: as it is
    const own = { morphology: { outline: boxOutline(12, 8) }, courts: [{ edge: 'e2' }] }
    expect(ownBundle(typeIn(p, id), own)!.courts).toEqual([{ edge: 'e2' }])
  })

  it('a copy’s inner wall moved: its own outline with its courts, on the site', () => {
    let { p, id } = block([1, 2], [{ edge: 'e1', depth: 30 }, { edge: 'e2' }])
    p = shapeWarehouse(p, id, { kind: 'pull', edge: 'e3', from: 4, to: 8, by: -1 }).project
    const site = onSite({ p, id })
    const w = site.p.buildings.find((b) => b.id === site.building)!.warehouse!
    const side = copyGenerated(typeIn(site.p, id), w).edges.find((e) => !e.outer && !e.horizontal)!
    p = moveBlockEdge(site.p, site.building, side.id, 1).project
    const o = p.buildings.find((b) => b.id === site.building)!.warehouse!.overrides!
    expect(o.morphology!.outline!.length).toBeGreaterThanOrEqual(4)
    expect(o.courts).toEqual([{ edge: 'e1', depth: 30 }, { edge: 'e2' }])
    // its block's courts taken away afterwards, the copy made again: its own shape keeps its own (one bundle)
    p = updateWarehouseStep(withType(p, id, (t) => ({ ...t, courts: [] })), id, 'envelope', { height: 14 })
    const hall = hallOf(p, site.building)
    const ws = walls(p, hall.id)
    expect(ws.get('front')!.depth).toBe(30)
    expect(ws.get('right')!.doors).toEqual([])
  })
})
