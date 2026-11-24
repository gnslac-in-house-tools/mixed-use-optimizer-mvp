// The verbs over a mixed selection (Phase GT.2, Decision "General tools"): move, copy and turn any mix of masses, a
// street's nodes, lots, gates and dimensions by one vector or about one pivot.
import { describe, expect, it } from 'vitest'
import { NOTHING_PICKED, type Picked } from '../../../model/picked.ts'
import type { Mass, Point, Project, SiteDrawing, Streets } from '../../../model/schema.ts'
import { contourToPolygon } from '../../../engine/geom/contour.ts'
import { footprintContour, rotate } from '../../../engine/geom/footprint.ts'
import { nearestT, pointAt } from '../../../engine/geom/perimeter.ts'
import { gatesOf } from '../../../engine/circulation/gates.ts'
import { addLot } from '../../../modules/parking/actions.ts'
import { addWarehouseType, placeWarehouse } from '../../../modules/warehouse/actions.ts'
import { demoProject } from '../../demo.ts'
import { createAppStore } from '../../store.ts'
import { addDimension, moveDimensions, toggleDimensionLock, turnDimensions } from '../dimensions.ts'
import { drawStreet } from '../streets.ts'
import { copyPicked, movePicked, turnPicked } from '../selection.ts'

const o1 = 'o1'
const pick = (p: Partial<Picked>): Picked => ({ ...NOTHING_PICKED, ...p })
const streets = (p: Project): Streets => p.options.find((o) => o.id === o1)!.streets ?? { nodes: [], segments: [] }
const lots = (p: Project) => p.options.find((o) => o.id === o1)!.lots ?? []
const mass = (p: Project, id: string): Mass => p.masses.find((m) => m.id === id)!
const centre = (p: Project, id: string): Point => {
  const f = mass(p, id).footprint
  if (f.kind !== 'rect') throw new Error('a rect was expected')
  return f.center
}
const boundary = (p: Project) => contourToPolygon(p.site.boundary!)
/** A placed block's hall. */
const hallOf = (p: Project, buildingId: string): Mass => {
  const levels = new Set(p.buildings.find((b) => b.id === buildingId)!.levels.map((l) => l.id))
  return p.masses.find((m) => m.part === 'hall' && levels.has(m.levelId))!
}

/** The demo without streets: three masses (m1 .. m3), a boundary and one gate (g1); then a free lot, a free dimension. */
function world() {
  let p = demoProject({ streets: false })
  const lot = addLot(p, o1, { rect: { center: { x: 200, y: 200 }, width: 30, depth: 20, rotation: 0 } })!
  p = lot.project
  const dim = addDimension(p, { x: 10, y: 300 }, { x: 50, y: 300 }, 2)!
  p = dim.project
  return { p, lot: lot.id, dim: dim.id, gate: gatesOf(p, o1)[0].id }
}

/** A street of one segment, (100,100) to (150,100): its two nodes. */
function street(p: Project, points: Point[] = [{ x: 100, y: 100 }, { x: 150, y: 100 }]) {
  const r = drawStreet(p, o1, points)!
  return { p: r.project, nodes: r.nodes }
}

describe('movePicked', () => {
  it('moves masses, a free lot, a gate along the boundary and a free dimension by one vector', () => {
    const w = world()
    const d = { x: 5, y: 7 }
    const r = movePicked(w.p, o1, pick({ masses: ['m1'], lots: [w.lot], gates: [w.gate], dimensions: [w.dim] }), d)
    expect(r.skipped).toEqual([])
    expect(centre(r.project, 'm1')).toEqual({ x: centre(w.p, 'm1').x + 5, y: centre(w.p, 'm1').y + 7 })
    expect(lots(r.project)[0].rect!.center).toEqual({ x: 205, y: 207 })
    const poly = boundary(w.p)
    const was = gatesOf(w.p, o1)[0]
    const want = pointAt(poly, nearestT(poly, { x: pointAt(poly, was.t!).x + d.x, y: pointAt(poly, was.t!).y + d.y }))
    const at = pointAt(poly, gatesOf(r.project, o1)[0].t!)
    expect(at.x).toBeCloseTo(want.x)
    expect(at.y).toBeCloseTo(want.y)
    const dim = r.project.dimensions![0]
    expect(dim.a).toEqual({ x: 15, y: 307 })
    expect(dim.b).toEqual({ x: 55, y: 307 })
    expect(dim.offset).toBe(2)
  })

  it('a street moved keeps the nodes it shares: the street meeting it stretches', () => {
    const one = street(demoProject({ streets: false }))
    const two = drawStreet(one.p, o1, [{ x: 150, y: 100 }, { x: 150, y: 150 }])!
    const shared = one.nodes[1]
    expect(two.nodes[0]).toBe(shared)
    expect(streets(two.project).nodes).toHaveLength(3)
    const r = movePicked(two.project, o1, pick({ nodes: one.nodes }), { x: 0, y: -10 })
    const s = streets(r.project)
    expect(s.nodes).toHaveLength(3)
    const other = s.segments.find((g) => g.id === two.segments[0])!
    expect([other.a, other.b]).toContain(shared)
    expect(s.nodes.find((n) => n.id === shared)).toMatchObject({ x: 150, y: 90 })
  })

  it('an anchored lot moves with its mass and alone is skipped with a notice', () => {
    const w = world()
    const anchored = addLot(w.p, o1, { anchor: { massId: 'm1', side: 's0' } })!
    const name = lots(anchored.project).find((l) => l.id === anchored.id)!.name
    const alone = movePicked(anchored.project, o1, pick({ lots: [anchored.id] }), { x: 5, y: 0 })
    expect(alone.skipped).toEqual([`${name} follows its wall: pick its mass to move it`])
    expect(alone.project).toBe(anchored.project)
    const both = movePicked(anchored.project, o1, pick({ masses: ['m1'], lots: [anchored.id] }), { x: 5, y: 0 })
    expect(both.skipped).toEqual([])
    expect(lots(both.project).find((l) => l.id === anchored.id)!.anchor).toEqual({ massId: 'm1', side: 's0' })
    expect(centre(both.project, 'm1').x).toBe(centre(anchored.project, 'm1').x + 5)
  })

  it('a dimension anchored to masses that move is not moved twice', () => {
    const w = world()
    const corners = footprintContour(mass(w.p, 'm1').footprint).vertices
    const added = addDimension(w.p, corners[0], corners[1], 3)!
    expect(added.project.dimensions!.find((x) => x.id === added.id)!.anchorA).toBeDefined()
    const s = createAppStore(added.project)
    s.getState().apply((q) => movePicked(q, o1, pick({ masses: ['m1'], dimensions: [added.id] }), { x: 10, y: 0 }).project)
    const dim = s.getState().project.dimensions!.find((x) => x.id === added.id)!
    expect(dim.a.x).toBeCloseTo(corners[0].x + 10)
    expect(dim.a.y).toBeCloseTo(corners[0].y)
    expect(dim.b.x).toBeCloseTo(corners[1].x + 10)
    expect(dim.anchorA).toBeDefined()
  })

  it('a locked dimension still pulls its other mass', () => {
    const w = world()
    const a = footprintContour(mass(w.p, 'm1').footprint).vertices[1]
    const b = footprintContour(mass(w.p, 'm2').footprint).vertices[0]
    const added = addDimension(w.p, a, b, 3)!
    const locked = toggleDimensionLock(added.project, added.id)
    const before = centre(locked, 'm2')
    const s = createAppStore(locked)
    s.getState().apply((q) => movePicked(q, o1, pick({ masses: ['m1'] }), { x: 0, y: 20 }).project)
    expect(centre(s.getState().project, 'm1').y).toBeCloseTo(centre(locked, 'm1').y + 20)
    expect(centre(s.getState().project, 'm2')).toEqual({ x: before.x, y: before.y + 20 })
  })
})

describe('turnPicked', () => {
  it('turns masses, streets, free lots and free dimensions about the pivot; gates stay with a notice', () => {
    const w = world()
    const st = street(w.p)
    const pivot = { x: 50, y: 20 }
    const r = turnPicked(st.p, o1, pick({ masses: ['m1'], nodes: st.nodes, lots: [w.lot], gates: [w.gate], dimensions: [w.dim] }), pivot, 90)
    expect(r.skipped).toEqual(['Gates stay on their side: Rotate leaves them'])
    const f = mass(r.project, 'm1').footprint
    expect(f.kind === 'rect' && f.rotation).toBe(90)
    const c = rotate(centre(w.p, 'm1'), pivot, 90)
    expect(centre(r.project, 'm1').x).toBeCloseTo(c.x)
    expect(centre(r.project, 'm1').y).toBeCloseTo(c.y)
    const n0 = streets(r.project).nodes.find((n) => n.id === st.nodes[0])!
    const q0 = rotate({ x: 100, y: 100 }, pivot, 90)
    expect(n0.x).toBeCloseTo(q0.x)
    expect(n0.y).toBeCloseTo(q0.y)
    const lot = lots(r.project)[0].rect!
    expect(lot.rotation).toBe(90)
    expect(lot.center.x).toBeCloseTo(rotate({ x: 200, y: 200 }, pivot, 90).x)
    const dim = r.project.dimensions![0]
    expect(dim.a.x).toBeCloseTo(rotate({ x: 10, y: 300 }, pivot, 90).x)
    expect(dim.b.y).toBeCloseTo(rotate({ x: 50, y: 300 }, pivot, 90).y)
    expect(gatesOf(r.project, o1)).toEqual(gatesOf(w.p, o1))
  })

  it('an anchored lot never turns on its own', () => {
    const w = world()
    const anchored = addLot(w.p, o1, { anchor: { massId: 'm1', side: 's0' } })!
    const name = lots(anchored.project).find((l) => l.id === anchored.id)!.name
    const r = turnPicked(anchored.project, o1, pick({ lots: [anchored.id] }), { x: 0, y: 0 }, 30)
    expect(r.skipped).toEqual([`${name} follows its wall: pick its mass to turn it`])
    expect(r.project).toBe(anchored.project)
  })
})

describe('moveDimensions and turnDimensions', () => {
  it('move a and b, drop the anchors, keep the lock and the offset', () => {
    const w = world()
    const c = footprintContour(mass(w.p, 'm1').footprint).vertices
    const added = addDimension(w.p, c[0], c[1], 3)!
    const locked = toggleDimensionLock(added.project, added.id)
    const moved = moveDimensions(locked, [added.id], { x: 4, y: 0 }).dimensions!.find((x) => x.id === added.id)!
    expect(moved).toMatchObject({ locked: true, offset: 3, a: { x: c[0].x + 4, y: c[0].y } })
    expect(moved.anchorA).toBeUndefined()
    expect(moved.anchorB).toBeUndefined()
    const turned = turnDimensions(locked, [added.id], c[0], 90).dimensions!.find((x) => x.id === added.id)!
    expect(turned).toMatchObject({ locked: true, offset: 3 })
    expect(turned.anchorA).toBeUndefined()
    expect(turned.a.x).toBeCloseTo(c[0].x)
    expect(turned.b.x).toBeCloseTo(c[0].x)
    expect(moveDimensions(locked, ['nope'], { x: 1, y: 1 })).toBe(locked)
    expect(moveDimensions(locked, [added.id], { x: 0, y: 0 })).toBe(locked)
    expect(turnDimensions(locked, [added.id], c[0], 0)).toBe(locked)
  })
})

describe('copyPicked', () => {
  it('copies each kind and leaves the originals', () => {
    const w = world()
    const st = street(w.p)
    const picked = pick({ masses: ['m1'], nodes: st.nodes, lots: [w.lot], gates: [w.gate], dimensions: [w.dim] })
    const r = copyPicked(st.p, o1, picked, { x: 30, y: 40 })
    expect(r.skipped).toEqual([])
    expect(r.project.masses).toHaveLength(st.p.masses.length + 1)
    expect(lots(r.project)).toHaveLength(lots(st.p).length + 1)
    expect(gatesOf(r.project, o1)).toHaveLength(gatesOf(st.p, o1).length + 1)
    expect(r.project.dimensions).toHaveLength(st.p.dimensions!.length + 1)
    expect(streets(r.project).segments).toHaveLength(streets(st.p).segments.length + 1)
    // the originals are untouched
    expect(mass(r.project, 'm1')).toBe(mass(st.p, 'm1'))
    expect(lots(r.project)[0]).toEqual(lots(st.p)[0])
    expect(gatesOf(r.project, o1)[0]).toEqual(gatesOf(st.p, o1)[0])
    expect(r.project.dimensions![0]).toEqual(st.p.dimensions![0])
    expect(streets(r.project).nodes.find((n) => n.id === st.nodes[0])).toEqual(streets(st.p).nodes.find((n) => n.id === st.nodes[0]))
    // and the copies are where d puts them
    const copy = r.project.masses.find((m) => !st.p.masses.some((x) => x.id === m.id))!
    expect(copy.footprint).toMatchObject({ center: { x: centre(w.p, 'm1').x + 30, y: centre(w.p, 'm1').y + 40 } })
    expect(lots(r.project)[1].rect!.center).toEqual({ x: 230, y: 240 })
    expect(lots(r.project)[1].name).not.toBe(lots(r.project)[0].name)
    expect(r.project.dimensions![1]).toMatchObject({ a: { x: 40, y: 340 }, b: { x: 80, y: 340 }, offset: 2 })
    expect(streets(r.project).nodes.some((n) => n.x === 130 && n.y === 140)).toBe(true)
  })

  // Decision "Streets stay connected" (SE.1): a copy is drawn segment by segment, so its inner nodes are no ends
  it('a copied street’s inner corner on another street’s paving does not join it', () => {
    const other = street(world().p, [{ x: 100, y: 200 }, { x: 200, y: 200 }]) // trucks: 8 m wide
    const l = street(other.p, [{ x: 60, y: 102 }, { x: 150, y: 102 }, { x: 150, y: 140 }])
    const r = copyPicked(l.p, o1, pick({ nodes: l.nodes }), { x: 0, y: 100 })
    const s = streets(r.project)
    // the corner lands 2 m off the other street's drawn line: it stays there, and the other is not split
    expect(s.nodes.some((n) => n.x === 150 && n.y === 202)).toBe(true)
    expect(s.nodes.filter((n) => n.y === 200)).toHaveLength(2)
    expect(s.segments).toHaveLength(5)
  })

  it('a street copied 2 m beside itself keeps all its segments', () => {
    const st = street(world().p, [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 80, y: 0 }, { x: 120, y: 0 }])
    const r = copyPicked(st.p, o1, pick({ nodes: st.nodes }), { x: 0, y: 2 })
    const s = streets(r.project)
    expect(s.segments).toHaveLength(6)
    expect(s.nodes.filter((n) => n.y === 2)).toHaveLength(4)
    expect(s.nodes.filter((n) => n.y === 0)).toHaveLength(4)
  })

  it('an anchored lot is copied with its mass, onto the copy; alone, it is skipped', () => {
    const w = world()
    const anchored = addLot(w.p, o1, { anchor: { massId: 'm2', side: 's0' }, rows: 2 })!
    const name = lots(anchored.project).find((l) => l.id === anchored.id)!.name
    const r = copyPicked(anchored.project, o1, pick({ masses: ['m1', 'm2'], lots: [anchored.id] }), { x: 0, y: 500 })
    expect(r.skipped).toEqual([])
    const made = r.project.masses.filter((m) => !anchored.project.masses.some((x) => x.id === m.id))
    expect(made).toHaveLength(2)
    const copy = lots(r.project).find((l) => l.id !== anchored.id && l.anchor)!
    expect(copy.anchor).toMatchObject({ massId: made[1].id, side: 's0' })
    expect(copy.rows).toBe(2)
    const alone = copyPicked(anchored.project, o1, pick({ lots: [anchored.id] }), { x: 0, y: 500 })
    expect(alone.skipped).toEqual([`${name} follows its wall: pick its mass to copy it`])
    expect(alone.project).toBe(anchored.project)
  })

  it('a placed block and its anchored lot are copied together: the lot onto the new hall, no notice', () => {
    const { project: t, id } = addWarehouseType(demoProject({ streets: false }))
    const placed = placeWarehouse(t, id, { x: 0, y: 0 }, 0, o1)!
    const hall = hallOf(placed.project, placed.id)
    const anchored = addLot(placed.project, o1, { anchor: { massId: hall.id, side: 's0' } })!
    const r = copyPicked(anchored.project, o1, pick({ masses: [hall.id], lots: [anchored.id] }), { x: 0, y: 500 })
    expect(r.skipped).toEqual([])
    const made = r.project.buildings.find((b) => !anchored.project.buildings.some((x) => x.id === b.id))!
    const copy = lots(r.project).find((l) => l.id !== anchored.id && l.anchor)!
    expect(copy.anchor).toEqual({ massId: hallOf(r.project, made.id).id, side: 's0' })
  })

  it('a loose mass is matched to its copy by its footprint, whatever else is copied with it', () => {
    const { project: t, id } = addWarehouseType(demoProject({ streets: false }))
    const placed = placeWarehouse(t, id, { x: 0, y: 0 }, 0, o1)!
    // m3 has a part but no placed block: loose for copyWithBlocks too, copied after m2
    const p = { ...placed.project, masses: placed.project.masses.map((m) => (m.id === 'm3' ? { ...m, part: 'office' } : m)) }
    const anchored = addLot(p, o1, { anchor: { massId: 'm2', side: 's0' } })!
    const r = copyPicked(anchored.project, o1, pick({ masses: [hallOf(p, placed.id).id, 'm2', 'm3'], lots: [anchored.id] }), { x: 0, y: 500 })
    expect(r.skipped).toEqual([])
    const copy = lots(r.project).find((l) => l.id !== anchored.id && l.anchor)!
    const m2 = r.project.masses.find((m) => m.id === copy.anchor!.massId)!
    expect(m2.id).not.toBe('m2')
    expect(centre(r.project, m2.id)).toEqual({ x: centre(p, 'm2').x, y: centre(p, 'm2').y + 500 })
  })
})

describe('nothing to do', () => {
  it('nothing picked or no change returns the same project', () => {
    const w = world()
    const picked = pick({ masses: ['m1'], lots: [w.lot], gates: [w.gate], dimensions: [w.dim] })
    for (const verb of [movePicked, copyPicked]) {
      expect(verb(w.p, o1, NOTHING_PICKED, { x: 3, y: 3 })).toEqual({ project: w.p, skipped: [] })
      expect(verb(w.p, o1, NOTHING_PICKED, { x: 3, y: 3 }).project).toBe(w.p)
      expect(verb(w.p, o1, picked, { x: 0, y: 0 }).project).toBe(w.p)
    }
    expect(turnPicked(w.p, o1, NOTHING_PICKED, { x: 0, y: 0 }, 30).project).toBe(w.p)
    expect(turnPicked(w.p, o1, picked, { x: 0, y: 0 }, 0).project).toBe(w.p)
  })
})

describe('drawings in the mixed selection (Phase DM.2)', () => {
  const drawing: SiteDrawing = {
    file: 'a.dxf',
    layers: [{ name: 'Walls', lines: [{ points: [{ x: 1, y: 0 }, { x: 5, y: 0 }] }] }],
  }
  const withDrawing = (): Project => {
    const w = world()
    return { ...w.p, site: { ...w.p.site, drawings: [drawing], parcels: [{ name: 'P1', file: 'a.dxf', contour: { vertices: [{ x: 10, y: 10, r: 0 }, { x: 15, y: 10, r: 0 }, { x: 15, y: 15, r: 0 }], arcs: {} } }] } }
  }
  const walls = (p: Project) => p.site.drawings![0].layers[0].lines[0].points

  it('Move moves a mass and a drawing by the same vector, as one result', () => {
    const p = withDrawing()
    const r = movePicked(p, o1, pick({ masses: ['m1'], drawings: [{ file: 'a.dxf', layer: 'Walls' }] }), { x: 4, y: 6 })
    expect(r.skipped).toEqual([])
    expect(centre(r.project, 'm1')).toEqual({ x: centre(p, 'm1').x + 4, y: centre(p, 'm1').y + 6 })
    expect(walls(r.project)).toEqual([{ x: 5, y: 6 }, { x: 9, y: 6 }])
  })

  it('Move of a drawing alone works, and a whole file with locked parcels says so', () => {
    const p = withDrawing()
    const r = movePicked(p, o1, pick({ drawings: [{ file: 'a.dxf' }] }), { x: 1, y: 1 })
    expect(walls(r.project)[0]).toEqual({ x: 2, y: 1 })
    expect(r.skipped).toEqual(['1 layer stayed: locked'])
    expect(r.project.site.parcels).toEqual(p.site.parcels)
  })

  it('Rotate turns a mass and a drawing about the same pivot', () => {
    const p = withDrawing()
    const pivot = { x: 0, y: 0 }
    const r = turnPicked(p, o1, pick({ masses: ['m1'], drawings: [{ file: 'a.dxf', layer: 'Walls' }] }), pivot, 90)
    const turned = rotate(centre(p, 'm1'), pivot, 90)
    expect(centre(r.project, 'm1').x).toBeCloseTo(turned.x)
    expect(centre(r.project, 'm1').y).toBeCloseTo(turned.y)
    expect(walls(r.project)[0].x).toBeCloseTo(0)
    expect(walls(r.project)[0].y).toBeCloseTo(1)
    expect(walls(r.project)[1].y).toBeCloseTo(5)
  })

  it('a locked layer stays where it is and the move says to unlock it', () => {
    const p = withDrawing()
    const locked = { ...p, site: { ...p.site, drawings: [{ ...drawing, layers: [{ ...drawing.layers[0], locked: true }] }] } }
    const r = movePicked(locked, o1, pick({ masses: ['m1'], drawings: [{ file: 'a.dxf', layer: 'Walls' }] }), { x: 4, y: 6 })
    expect(r.skipped).toEqual(['Locked: unlock it in Layers'])
    expect(walls(r.project)).toEqual(walls(locked))
    expect(centre(r.project, 'm1').x).toBeCloseTo(centre(p, 'm1').x + 4)
  })

  it('Copy leaves the drawings and says so once; with only a drawing the project is unchanged', () => {
    const p = withDrawing()
    const alone = copyPicked(p, o1, pick({ drawings: [{ file: 'a.dxf' }, { file: 'a.dxf', layer: 'Walls' }] }), { x: 4, y: 6 })
    expect(alone.project).toBe(p)
    expect(alone.skipped).toEqual(['Drawings are not copied'])
    const mixed = copyPicked(p, o1, pick({ masses: ['m1'], drawings: [{ file: 'a.dxf' }] }), { x: 4, y: 6 })
    expect(mixed.project.masses.length).toBe(p.masses.length + 1)
    expect(mixed.project.site.drawings).toEqual(p.site.drawings)
    expect(mixed.skipped).toEqual(['Drawings are not copied'])
  })

  it('a move by nothing, with a drawing picked, returns the same project', () => {
    const p = withDrawing()
    expect(movePicked(p, o1, pick({ drawings: [{ file: 'a.dxf', layer: 'Walls' }] }), { x: 0, y: 0 }).project).toBe(p)
    expect(turnPicked(p, o1, pick({ drawings: [{ file: 'a.dxf', layer: 'Walls' }] }), { x: 0, y: 0 }, 0).project).toBe(p)
  })

  it('through the store one Move is one undo step: the drawing and the parcels come back as they were', () => {
    const p = withDrawing()
    const unlocked = { ...p, site: { ...p.site, parcels: p.site.parcels!.map((x) => ({ ...x, unlocked: true as const })) } }
    const s = createAppStore(unlocked)
    s.getState().apply((q) => movePicked(q, o1, pick({ masses: ['m1'], drawings: [{ file: 'a.dxf' }] }), { x: 4, y: 6 }).project)
    expect(walls(s.getState().project)).not.toEqual(walls(unlocked))
    expect(s.getState().project.site.parcels).not.toEqual(unlocked.site.parcels)
    s.getState().undo()
    expect(s.getState().project.site.drawings).toEqual(unlocked.site.drawings)
    expect(s.getState().project.site.parcels).toEqual(unlocked.site.parcels)
    expect(centre(s.getState().project, 'm1')).toEqual(centre(unlocked, 'm1'))
  })
})
