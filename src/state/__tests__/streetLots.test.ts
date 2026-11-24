// A street end follows the parking lot it reaches (Phase SE.6, Decision "Streets follow their lots"): an end drawn or
// dragged onto a lot's entrance is linked to it (its node names the lot, the lot's `entry` is the end reached); every
// edit is settled, so a lot moved, turned or carried by its mass takes the end with it, the street's other points
// stay. Dragged away, or Disconnect, it lets go. Review Focus 5: a lot deleted, copied or moved twice.
import { describe, expect, it } from 'vitest'
import { NOTHING_PICKED, type Picked } from '../../model/picked.ts'
import type { Point, Project, StreetNode } from '../../model/schema.ts'
import { derive } from '../../engine/derive.ts'
import { addLot, lotEntrances, removeLots, setLot } from '../../modules/parking/actions.ts'
import { demoProject } from '../demo.ts'
import { settle } from '../settle.ts'
import { copyPicked, movePicked, turnPicked } from '../actions/selection.ts'
import { LOT_LINK } from '../../engine/circulation/streets.ts'
import { connectStreets, disconnectStreetEnd, drawStreet, followLots, moveStreetNode } from '../actions/streets.ts'

const o1 = 'o1'
const pick = (p: Partial<Picked>): Picked => ({ ...NOTHING_PICKED, ...p })
const option = (p: Project) => p.options.find((o) => o.id === o1)!
const nodes = (p: Project): StreetNode[] => option(p).streets?.nodes ?? []
const node = (p: Project, id: string) => nodes(p).find((n) => n.id === id)!
const lot = (p: Project, id: string) => option(p).lots!.find((l) => l.id === id)!
const entrance = (p: Project, id: string) => lotEntrances(p, o1).get(id)!
/** An edit as the store keeps it: settled. */
function go(before: Project, after: Project): Project {
  const r = settle(before, after)
  if ('refused' in r) throw new Error(r.refused)
  return r.project
}
const at = (n: StreetNode): Point => ({ x: n.x, y: n.y })
const expectAt = (q: Point, want: Point) => {
  expect(q.x).toBeCloseTo(want.x, 6)
  expect(q.y).toBeCloseTo(want.y, 6)
}

/** The demo without streets and a free lot, 30 × 20 m about (200, 200), its aisles along x. */
function withLot() {
  const r = addLot(demoProject({ streets: false }), o1, { rect: { center: { x: 200, y: 200 }, width: 30, depth: 20, rotation: 0 } })!
  return { p: r.project, lot: r.id }
}

/** A cars' street from the lot's east end (its `end`, not the one it had), 40 m out east: the project settled, its end node and its far node. */
function connected() {
  const w = withLot()
  const y = lotEntrances(w.p, o1).get(w.lot)!.at.y
  // of the cars' type: a road cars may use picks a lot's entrance end
  const r = drawStreet(w.p, o1, [{ x: 215, y }, { x: 255, y }], 'cars')!
  const p = go(w.p, r.project)
  return { ...w, p, end: r.nodes[0], far: r.nodes[1] }
}

describe('lotEntrances', () => {
  it('gives each laid lot its entrance: the end of its first aisle, and which end', () => {
    const w = withLot()
    const e = entrance(w.p, w.lot)
    expect(['start', 'end']).toContain(e.end)
    // on the lot's west or east edge, between its sides
    expect([185, 215]).toContain(Math.round(e.at.x))
    expect(e.at.y).toBeGreaterThan(190)
    expect(e.at.y).toBeLessThan(210)
  })
})

describe('a street end drawn on a lot’s entrance', () => {
  it('is linked: its node names the lot, and the lot’s entry is the end reached', () => {
    const c = connected()
    expect(node(c.p, c.end).lot).toBe(c.lot)
    expect(node(c.p, c.far).lot).toBeUndefined()
    expect(lot(c.p, c.lot).entry).toBe('end')
  })

  it('drawn to the other end, the entry is that end', () => {
    const w = withLot()
    const west = { x: 185, y: entrance(w.p, w.lot).at.y }
    const r = drawStreet(w.p, o1, [{ x: 140, y: west.y }, west])!
    const p = go(w.p, r.project)
    expect(node(p, r.nodes[1]).lot).toBe(w.lot)
    expect(lot(p, w.lot).entry).toBe('start')
  })

  it('a point farther than LOT_LINK from it is not linked', () => {
    const w = withLot()
    const e = entrance(w.p, w.lot).at
    const r = drawStreet(w.p, o1, [{ x: e.x + LOT_LINK + 0.3, y: e.y }, { x: e.x + 40, y: e.y }])!
    const p = go(w.p, r.project)
    expect(nodes(p).some((n) => n.lot)).toBe(false)
    expect(lot(p, w.lot).entry).toBeUndefined()
  })
})

describe('the lot moves, the end follows', () => {
  it('moved: the end on its new entrance, its segment stretched, the other node where it was', () => {
    const c = connected()
    const far = at(node(c.p, c.far))
    const p = go(c.p, movePicked(c.p, o1, pick({ lots: [c.lot] }), { x: 7, y: -12 }).project)
    expectAt(at(node(p, c.end)), entrance(p, c.lot).at)
    expectAt(at(node(p, c.end)), { x: 215 + 7, y: entrance(c.p, c.lot).at.y - 12 })
    expect(at(node(p, c.far))).toEqual(far)
    expect(node(p, c.end).lot).toBe(c.lot)
  })

  it('turned: the end on its new entrance', () => {
    const c = connected()
    const far = at(node(c.p, c.far))
    const p = go(c.p, turnPicked(c.p, o1, pick({ lots: [c.lot] }), { x: 200, y: 200 }, 90).project)
    expectAt(at(node(p, c.end)), entrance(p, c.lot).at)
    expect(Math.round(entrance(p, c.lot).at.y)).toBe(215)
    expect(at(node(p, c.far))).toEqual(far)
  })

  it('anchored to a mass that moves: the end follows the mass’s lot', () => {
    const p0 = demoProject({ streets: false })
    const r = addLot(p0, o1, { anchor: { massId: 'm1', side: 's0' }, rows: 2 })!
    const e = derive(r.project, o1).circulation.lots.find((l) => l.id === r.id)!.entrance
    const s = drawStreet(r.project, o1, [e.at, { x: e.at.x + e.out.x * 30, y: e.at.y + e.out.y * 30 }])!
    const p1 = go(r.project, s.project)
    expect(node(p1, s.nodes[0]).lot).toBe(r.id)
    const far = at(node(p1, s.nodes[1]))
    const p2 = go(p1, movePicked(p1, o1, pick({ masses: ['m1'] }), { x: 4, y: 6 }).project)
    expectAt(at(node(p2, s.nodes[0])), { x: e.at.x + 4, y: e.at.y + 6 })
    expect(at(node(p2, s.nodes[1]))).toEqual(far)
  })

  it('its entrance moved to the other end (Properties’ Its entrance): the end goes there', () => {
    const c = connected()
    const p = go(c.p, setLot(c.p, o1, c.lot, { entry: 'start' }))
    expectAt(at(node(p, c.end)), { x: 185, y: entrance(c.p, c.lot).at.y })
  })

  it('a linked node shared with another street: both streets follow', () => {
    const c = connected()
    const e = at(node(c.p, c.end))
    const other = drawStreet(c.p, o1, [e, { x: e.x, y: e.y + 40 }])!
    const p1 = go(c.p, other.project)
    expect(other.nodes[0]).toBe(c.end)
    expect(node(p1, c.end).lot).toBe(c.lot)
    const p2 = go(p1, movePicked(p1, o1, pick({ lots: [c.lot] }), { x: 0, y: 10 }).project)
    expectAt(at(node(p2, c.end)), { x: e.x, y: e.y + 10 })
    const segs = option(p2).streets!.segments.filter((g) => g.a === c.end || g.b === c.end)
    expect(segs).toHaveLength(2)
    expect(at(node(p2, other.nodes[1]))).toEqual({ x: e.x, y: e.y + 40 })
  })
})

describe('letting go', () => {
  it('the end dragged 3 m away: unlinked; within LOT_LINK: still linked', () => {
    const c = connected()
    const e = at(node(c.p, c.end))
    const near = go(c.p, moveStreetNode(c.p, o1, c.end, { x: e.x + 0.3, y: e.y }))
    expect(node(near, c.end).lot).toBe(c.lot)
    const away = go(c.p, moveStreetNode(c.p, o1, c.end, { x: e.x + 3, y: e.y }))
    expect(node(away, c.end).lot).toBeUndefined()
    expect(at(node(away, c.end))).toEqual({ x: e.x + 3, y: e.y })
  })

  it('Disconnect: unlinked, the end where it was, and moving the lot leaves it', () => {
    const c = connected()
    const e = at(node(c.p, c.end))
    const p1 = go(c.p, disconnectStreetEnd(c.p, o1, c.end))
    expect(node(p1, c.end).lot).toBeUndefined()
    expect(at(node(p1, c.end))).toEqual(e)
    const p2 = go(p1, movePicked(p1, o1, pick({ lots: [c.lot] }), { x: 0, y: 10 }).project)
    expect(at(node(p2, c.end))).toEqual(e)
    expect(node(p2, c.end).lot).toBeUndefined()
  })

  it('Disconnect on a node not linked: the project as it was', () => {
    const c = connected()
    expect(disconnectStreetEnd(c.p, o1, c.far)).toBe(c.p)
    expect(disconnectStreetEnd(c.p, o1, 'nope')).toBe(c.p)
  })
})

describe('Connect', () => {
  it('a street it draws from a lot’s entrance is linked to the lot', () => {
    const w = withLot()
    const r = connectStreets(w.p, o1)
    expect(r.lots).toBe(1)
    const p = go(w.p, r.project)
    const linked = nodes(p).filter((n) => n.lot === w.lot)
    expect(linked).toHaveLength(1)
    expectAt(at(linked[0]), entrance(p, w.lot).at)
    expect(lot(p, w.lot).entry).toBeDefined()
  })
})

describe('Review Focus 5: a lot deleted, copied or moved twice', () => {
  it('deleted: the link goes, the street does not move', () => {
    const c = connected()
    const before = nodes(c.p).map(at)
    const p = go(c.p, removeLots(c.p, o1, [c.lot]))
    expect(nodes(p).some((n) => n.lot)).toBe(false)
    expect(nodes(p).map(at)).toEqual(before)
  })

  it('copied: the copy takes no street; moving the copy leaves the street', () => {
    const c = connected()
    const r = copyPicked(c.p, o1, pick({ lots: [c.lot] }), { x: 0, y: 60 })
    const p1 = go(c.p, r.project)
    const copy = option(p1).lots!.find((l) => l.id !== c.lot)!
    expect(nodes(p1).some((n) => n.lot === copy.id)).toBe(false)
    expect(node(p1, c.end).lot).toBe(c.lot)
    const e = at(node(p1, c.end))
    const p2 = go(p1, movePicked(p1, o1, pick({ lots: [copy.id] }), { x: 5, y: 5 }).project)
    expect(at(node(p2, c.end))).toEqual(e)
  })

  it('moved twice: the end on the entrance, the entry unchanged', () => {
    const c = connected()
    // the lot had no entry: the link wrote it. A cars' street across where its west end will be: once it has moved,
    // the roads favour that end, so a lot with no entry would turn its entrance there, under the street
    const y = entrance(c.p, c.lot).at.y
    expect(withLot().p.options[0].lots![0].entry).toBeUndefined()
    const west = drawStreet(c.p, o1, [{ x: 215 - 90, y: y - 20 }, { x: 215 - 90, y: y + 20 }], 'cars')!
    const p0 = go(c.p, west.project)
    const p1 = go(p0, movePicked(p0, o1, pick({ lots: [c.lot] }), { x: -30, y: 0 }).project)
    const p2 = go(p1, movePicked(p1, o1, pick({ lots: [c.lot] }), { x: -30, y: 0 }).project)
    // the end stays on the east end, its own: not carried across the lot to the west one
    expectAt(at(node(p2, c.end)), { x: 215 - 60, y })
    expectAt(at(node(p2, c.end)), entrance(p2, c.lot).at)
    expect(lot(p2, c.lot).entry).toBe('end')
  })
})

describe('followLots', () => {
  it('nothing relevant changed: the same project', () => {
    const c = connected()
    expect(followLots(c.p, c.p)).toBe(c.p)
    const renamed = { ...c.p, name: 'Renamed' }
    expect(followLots(c.p, renamed)).toBe(renamed)
  })

  it('an old project: a street already ending on an entrance is not linked by an edit elsewhere', () => {
    const w = withLot()
    const e = entrance(w.p, w.lot).at
    // drawn and kept without settling: as a project saved before SE.6
    const old = drawStreet(w.p, o1, [e, { x: e.x + 40, y: e.y }])!.project
    const p = go(old, movePicked(old, o1, pick({ masses: ['m3'] }), { x: 1, y: 0 }).project)
    expect(nodes(p).some((n) => n.lot)).toBe(false)
  })
})
