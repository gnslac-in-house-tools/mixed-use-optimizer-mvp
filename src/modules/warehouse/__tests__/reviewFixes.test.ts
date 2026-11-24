// Phase D.2 review fixes: what a type has (arcs, zones) must not leak into a variant's own outline, a block's agent
// indices follow its face, near-orthogonal walls stay on their axis.
import { describe, expect, it } from 'vitest'
import type { Footprint, Project, WarehouseType } from '../../../model/schema.ts'
import { footprintContour, footprintPolygon } from '../../../engine/geom/footprint.ts'
import { callTool } from '../../../api/tools/index.ts'
import { actions } from '../../../state/actions/index.ts'
import { demoProject } from '../../../state/demo.ts'
import { addWarehouseType, lockWarehouseStep, placeWarehouse } from '../actions.ts'
import { blockFrame, outlineFromFace } from '../engine/blocks.ts'
import { newWarehouseType } from '../engine/defaults.ts'
import { generate, typeWith } from '../engine/generate.ts'

function start() {
  const base = demoProject()
  const made = addWarehouseType(base)
  let p = made.project
  for (const s of ['grid', 'hall', 'columns', 'envelope'] as const) p = lockWarehouseStep(p, made.id, s)
  return { p, id: made.id, option: base.options[0].id }
}
const typeIn = (p: Project, id: string): WarehouseType => p.warehouseTypes!.find((t) => t.id === id)!
const copyIn = (p: Project, id: string) => p.buildings.find((b) => b.id === id)!
const hallOf = (p: Project, buildingId: string) => {
  const levels = new Set(copyIn(p, buildingId).levels.map((l) => l.id))
  return p.masses.find((m) => levels.has(m.levelId) && m.part === 'hall')!
}
function start2() {
  const s = start()
  const placed = placeWarehouse(s.p, s.id, { x: 200, y: 150 }, 0, s.option)!
  return { ...s, p: placed.project, copy: placed.id }
}
/** The project with an arc on the type's edge 3 (it has four corners). */
function bowedType() {
  const s = start2()
  const t = typeIn(s.p, s.id)
  const { length: L, width: W } = t.hall
  const outline = [[0, 0], [L, 0], [L, W], [0, W]].map(([x, y], i) => ({ id: `e${i + 1}`, x, y }))
  const bowed: WarehouseType = { ...t, morphology: { ...t.morphology, outline, arcs: { '3': 0.25 } } }
  return { ...s, p: { ...s.p, warehouseTypes: s.p.warehouseTypes!.map((x) => (x.id === s.id ? bowed : x)) } }
}

describe('a type’s arcs do not leak into a variant’s own outline', () => {
  it('a straight four-corner outline on a copy of a bowed type has no bulge', () => {
    const { p, id, copy } = bowedType()
    expect(generate(typeIn(p, id)).edges.some((e) => e.bulge)).toBe(true)
    const poly = footprintPolygon(hallOf(p, copy).footprint)
    expect(poly).toHaveLength(4)
    const r = actions.setBlockOutline(p, hallOf(p, copy).id, poly.map((q, i) => (i === 2 ? { x: q.x - 20, y: q.y } : q)))!
    expect(r.reason).toBeUndefined()
    const w = copyIn(r.project, copy).warehouse!
    const made = typeWith(typeIn(r.project, id), w.overrides)
    expect(generate(made).edges.every((e) => !e.bulge)).toBe(true)
    // the type keeps its own
    expect(generate(typeIn(r.project, id)).edges.some((e) => e.bulge)).toBe(true)
  })

  it('typeWith takes the arcs of a copy’s own outline, not the type’s', () => {
    const { p, id, copy } = bowedType()
    const t = typeIn(p, id)
    const own = t.morphology.outline.map((c) => ({ ...c }))
    const made = typeWith(t, { morphology: { outline: own, holes: [] } } as never)
    expect(generate(made).edges.every((e) => !e.bulge)).toBe(true)
    expect(copy).toBeTruthy()
  })
})

describe('a block’s wall and corner indices are its face’s', () => {
  it('a chamfer at corner 1: getMassOutline lists the 4 face walls, and moveWall(3) moves the wall it names', () => {
    const { p, copy } = start2()
    const hall = hallOf(p, copy)
    const ref = { kind: 'mass', id: hall.id }
    const cut = actions.editShape(p, ref, { op: 'chamfer', vertex: 1, a: 4, b: 4 })
    expect(cut.reason).toBeUndefined()
    const q = cut.project
    // the footprint is faceted (5 corners); the face is 4 corners and 4 walls, the chamfer on corner 1
    expect(footprintPolygon(hallOf(q, copy).footprint).length).toBeGreaterThan(4)
    const r = callTool(q, 'getMassOutline', { mass: hall.id })
    if (!r.ok) throw new Error(r.error)
    const o = r.output as { corners: { i: number; x: number; y: number; chamfer?: number[] }[]; walls: { i: number }[] }
    expect(o.walls).toHaveLength(4)
    expect(o.corners).toHaveLength(4)
    expect(o.corners[1].chamfer).toEqual([4, 4])
    // wall 3 is the left wall (corner 3 to corner 0): a push of it moves those two corners, nothing else
    const before = actions.shapeOf(q, ref)!.contour.vertices
    const m = callTool(q, 'moveWall', { mass: hall.id, wall: 3, d: 2 })
    if (!m.ok) throw new Error(m.error)
    const after = actions.shapeOf(m.project, ref)!.contour.vertices
    expect(after).toHaveLength(4)
    const moved = after.map((v, i) => Math.hypot(v.x - before[i].x, v.y - before[i].y) > 0.5)
    expect(moved).toEqual([true, false, false, true])
  })
})

describe('a dimension’s length on a chamfered block', () => {
  it('stretches the wall the face names, the chamfer kept', () => {
    const { p, copy } = start2()
    const hall = hallOf(p, copy)
    const ref = { kind: 'mass', id: hall.id }
    const q = actions.editShape(p, ref, { op: 'chamfer', vertex: 1, a: 4, b: 4 }).project
    const face = actions.shapeOf(q, ref)!.contour.vertices
    // along the back wall, corner 3 to corner 2: the right side (walls 1) is what grows
    const a = face[3]
    const b = face[2]
    const added = actions.addDimension(q, { x: a.x, y: a.y }, { x: b.x, y: b.y }, 5)!
    const d = added.project.dimensions!.find((x) => x.id === added.id)!
    const len = Math.hypot(d.b.x - d.a.x, d.b.y - d.a.y)
    const r = actions.setDimensionLength(added.project, added.id, len + 12)
    expect(r.notice).toBeUndefined()
    const after = actions.shapeOf(r.project, ref)!.contour.vertices
    expect(after).toHaveLength(4)
    expect(after[1].chamfer).toEqual([4, 4])
  })
})

describe('a rotated rectangle rounded to the centimetre is still a rectangle on its axes', () => {
  const rounded = (angle: number): Footprint => {
    const c = Math.cos((angle * Math.PI) / 180)
    const s = Math.sin((angle * Math.PI) / 180)
    const at = (x: number, y: number) => ({ x: Math.round((200 + x * c - y * s) * 100) / 100, y: Math.round((100 + x * s + y * c) * 100) / 100, r: 0 })
    return { kind: 'contour', contour: { vertices: [at(0, 0), at(61.3, 0), at(61.3, 27.7), at(0, 27.7)] } }
  }
  it('every wall of the block has its axis, and it is a box', () => {
    for (const angle of [30, 17, 75]) {
      const f = rounded(angle)
      const o = outlineFromFace(footprintContour(f), [], 0.3, blockFrame(f))!
      expect(o, `${angle}°`).toBeTruthy()
      expect(o.outline, `${angle}°`).toHaveLength(4)
      const t = newWarehouseType('wt1', 'T', {})
      const made = { ...t, elements: [], hall: { ...t.hall, length: o.length, width: o.width }, morphology: { outline: o.outline, holes: o.holes } }
      expect(generate(made).edges.map((e) => e.axis), `${angle}°`).not.toContain(null)
    }
  })
})
