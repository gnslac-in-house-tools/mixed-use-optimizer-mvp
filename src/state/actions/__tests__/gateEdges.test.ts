// Gates on the On edge engine (Phase PE.2, task 9; Decisions "On edge engine", plan 15 and 19): a gate stands on a side of a street, of an existing
// street or of the site's boundary; `edgeOf` reads those sides with 0.5 m slots, `editEdge` puts, slides and widens a gate on them.
import { describe, expect, it } from 'vitest'
import type { EdgeOp } from '../../../engine/edge/onEdge.ts'
import { gatesOf } from '../../../engine/circulation/gates.ts'
import { contourToPolygon } from '../../../engine/geom/contour.ts'
import { pointAt } from '../../../engine/geom/perimeter.ts'
import type { Project } from '../../../model/schema.ts'
import { demoProject } from '../../demo.ts'
import { addOption } from '../buildings.ts'
import { drawStreet } from '../streets.ts'
import { edgeOf, editEdge } from '../onEdge.ts'

/** The demo (a south street along its first side, one gate on the boundary at x 225) with a street of 8 m through it, in o1; Option 2 has the same street. */
function fixture() {
  const base = demoProject({ streets: false })
  const r = drawStreet(base, 'o1', [{ x: 100, y: 150 }, { x: 200, y: 150 }], undefined, 8)!
  const two = addOption(r.project, { buildingIds: ['b1'] })
  const streets = r.project.options[0].streets!
  const p: Project = { ...two.project, options: two.project.options.map((o) => (o.id === two.id ? { ...o, streets: structuredClone(streets) } : o)) }
  const seg = r.segments[0]
  return { p, seg, street: { kind: 'street', id: `street:${seg}` }, o2: two.id, road: { kind: 'existing-road', id: base.site.existingRoads![0].id }, site: { kind: 'boundary', id: 'site' } }
}
const put = (p: Project, host: { kind: string; id: string }, edge: string, slot: number, optionId = 'o1') => editEdge(p, host, { op: 'put', edge, slots: [slot], kind: 'gate' }, optionId)
const newest = (p: Project, optionId = 'o1') => gatesOf(p, optionId).at(-1)!

describe('edgeOf a street', () => {
  it('two edges per segment, the left and the right walking a → b, in slots of 0.5 m', () => {
    const { p, seg, street } = fixture()
    const r = edgeOf(p, street, 'o1')!
    expect(r.edges.map((e) => e.id)).toEqual([`${seg}:left`, `${seg}:right`])
    const left = r.edges[0]
    expect(left.slots).toHaveLength(200)
    expect(left.slots[9]).toMatchObject({ k: 9, from: 4.5, to: 5 })
    expect([left.a.x, left.a.y]).toEqual([100, 154])
    expect(left.out.y).toBeCloseTo(1, 9)
    expect(r.edges[1].out.y).toBeCloseTo(-1, 9)
    expect(left.refused).toBeUndefined()
  })

  it('answers null for a street that is not there', () => {
    const { p } = fixture()
    expect(edgeOf(p, { kind: 'street', id: 'street:nope' }, 'o1')).toBeNull()
    expect(edgeOf(p, { kind: 'existing-road', id: 'nope' }, 'o1')).toBeNull()
  })

  it('lists the gates on it as elements, each on the slot under its middle', () => {
    const { p, seg, street } = fixture()
    const q = put(p, street, `${seg}:left`, 40).project
    const els = edgeOf(q, street, 'o1')!.elements
    expect(els).toHaveLength(1)
    expect(els[0]).toMatchObject({ kind: 'gate', edge: `${seg}:left`, slot: 40, width: 12 })
  })
})

describe('put a gate on a street', () => {
  it('on slot 40 of a side: a gate on that side at the slot’s middle, in the option’s own gates (o2’s), o1 unchanged', () => {
    const { p, seg, street, o2 } = fixture()
    const r = put(p, street, `${seg}:left`, 40, o2)
    expect(r.reason).toBeUndefined()
    expect(r.notes).toContain('Own gates for Option 2')
    const g = newest(r.project, o2)
    expect(g.on).toEqual({ kind: 'street', id: seg, side: 'left', at: 20.25 })
    expect(g.t).toBeUndefined()
    // Option 2 copied the site’s gate first, then the new one; Option 1 and the site are as they were
    expect(gatesOf(r.project, o2)).toHaveLength(2)
    expect(r.project.options[0]).toBe(p.options[0])
    expect(r.project.site).toBe(p.site)
  })

  it('keeps a gate half its width inside the side’s ends: slot 0 puts it at 6 m, the last slot at 94 m', () => {
    const { p, seg, street } = fixture()
    expect(newest(put(p, street, `${seg}:right`, 0).project).on!.at).toBe(6)
    expect(newest(put(p, street, `${seg}:right`, 199).project).on!.at).toBe(94)
  })

  it('an option that owns its gates adds to them without the note', () => {
    const { p, seg, street, o2 } = fixture()
    const once = put(p, street, `${seg}:left`, 20, o2).project
    const twice = put(once, street, `${seg}:right`, 100, o2)
    expect(twice.notes).toBeUndefined()
    expect(gatesOf(twice.project, o2)).toHaveLength(3)
  })

  it('two slots at once: one gate at a time; a kind that is not a gate, an edge that is not there: refused', () => {
    const { p, seg, street } = fixture()
    const two = editEdge(p, street, { op: 'put', edge: `${seg}:left`, slots: [4, 5], kind: 'gate' }, 'o1')
    expect(two.reason).toBe('One gate at a time')
    expect(two.project).toBe(p)
    expect(editEdge(p, street, { op: 'put', edge: `${seg}:left`, slots: [4], kind: 'dock' }, 'o1').reason).toBeDefined()
    expect(editEdge(p, street, { op: 'put', edge: 'nope:left', slots: [4], kind: 'gate' }, 'o1').reason).toBeDefined()
    expect(editEdge(p, street, { op: 'put', edge: `${seg}:left`, slots: [999], kind: 'gate' }, 'o1').reason).toBeDefined()
  })

  it('a side shorter than the gate refuses', () => {
    const { p } = fixture()
    const short = drawStreet(p, 'o1', [{ x: 300, y: 200 }, { x: 308, y: 200 }], undefined, 8)!
    const r = put(short.project, { kind: 'street', id: `street:${short.segments[0]}` }, `${short.segments[0]}:left`, 3)
    expect(r.reason).toBe('That side is shorter than the gate')
    expect(r.project).toBe(short.project)
  })
})

describe('put a gate on the boundary or on an existing street', () => {
  it('on the boundary: t at the slot’s middle, into the gates the option uses (the site’s)', () => {
    const { p, site } = fixture()
    const r = put(p, site, 'boundary:0', 100)
    expect(r.reason).toBeUndefined()
    expect(r.notes).toBeUndefined()
    const g = newest(r.project)
    expect(g.on).toBeUndefined()
    const at = pointAt(contourToPolygon(p.site.boundary!), g.t!)
    expect(at.x).toBeCloseTo(50.25, 6)
    expect(at.y).toBeCloseTo(0, 6)
    expect(r.project.site.gates).toHaveLength(2)
  })

  it('the boundary has one edge a side, with slots along it', () => {
    const { p, site } = fixture()
    const r = edgeOf(p, site, 'o1')!
    expect(r.edges.map((e) => e.id)).toEqual(['boundary:0', 'boundary:1', 'boundary:2', 'boundary:3'])
    expect(r.edges[0].slots).toHaveLength(840)
    expect(r.edges[0].out.y).toBeCloseTo(-1, 9)
    // the demo’s gate at x 225 on the south side
    expect(r.elements).toHaveLength(1)
    expect(r.elements[0]).toMatchObject({ edge: 'boundary:0', slot: 450 })
  })

  it('on an existing street: its stretch’s side, the place along its whole line', () => {
    const { p, road } = fixture()
    const r = edgeOf(p, road, 'o1')!
    expect(r.edges.map((e) => e.id)).toEqual(['0:left', '0:right'])
    const q = put(p, road, '0:right', 100)
    expect(q.reason).toBeUndefined()
    expect(newest(q.project).on).toEqual({ kind: 'existing-road', id: road.id, side: 'right', at: 50.25 })
    expect(q.project.site.gates).toHaveLength(2)
  })
})

describe('slide, width, take and count', () => {
  const placed = () => {
    const f = fixture()
    const p = put(f.p, f.street, `${f.seg}:left`, 40).project
    return { ...f, p, id: newest(p).id }
  }

  it('slide by 3 slots moves it 1.5 m along its side', () => {
    const { p, street, id } = placed()
    const r = editEdge(p, street, { op: 'slide', ids: [id], by: 3 }, 'o1')
    expect(r.reason).toBeUndefined()
    expect(gatesOf(r.project, 'o1').find((g) => g.id === id)!.on!.at).toBe(21.75)
  })

  it('a slide may be fractional, and a negative one goes back', () => {
    const { p, street, id } = placed()
    const r = editEdge(p, street, { op: 'slide', ids: [id], by: -0.5 }, 'o1')
    expect(gatesOf(r.project, 'o1').find((g) => g.id === id)!.on!.at).toBe(20)
  })

  it('past the end of its side: refused, the same project', () => {
    const { p, street, id } = placed()
    const r = editEdge(p, street, { op: 'slide', ids: [id], by: 200 }, 'o1')
    expect(r.reason).toBe('That gate cannot slide past the end of its side')
    expect(r.project).toBe(p)
    expect(editEdge(p, street, { op: 'slide', ids: [id], by: -100 }, 'o1').reason).toBeDefined()
  })

  it('a boundary gate slides along its side the same way', () => {
    const { p, site } = fixture()
    const id = gatesOf(p, 'o1')[0].id
    const r = editEdge(p, site, { op: 'slide', ids: [id], by: 4 }, 'o1')
    const t = gatesOf(r.project, 'o1')[0].t!
    expect(pointAt(contourToPolygon(p.site.boundary!), t).x).toBeCloseTo(227, 6)
    expect(editEdge(p, site, { op: 'slide', ids: [id], by: 4000 }, 'o1').reason).toBeDefined()
  })

  it('width sets the gate’s opening; a width past its side refuses', () => {
    const { p, street, id } = placed()
    const r = editEdge(p, street, { op: 'width', ids: [id], width: 8 }, 'o1')
    expect(gatesOf(r.project, 'o1').find((g) => g.id === id)!.width).toBe(8)
    expect(editEdge(p, street, { op: 'width', ids: [id], width: 400 }, 'o1').reason).toBe('That side is shorter than the gate')
    expect(editEdge(p, street, { op: 'width', ids: [id], width: 0 }, 'o1').reason).toBeDefined()
  })

  it('take removes the gates on those slots', () => {
    const { p, seg, street } = placed()
    const r = editEdge(p, street, { op: 'take', edge: `${seg}:left`, slots: [40], kind: 'gate' }, 'o1')
    expect(gatesOf(r.project, 'o1')).toHaveLength(1)
  })

  it('count is refused: gates are put one at a time', () => {
    const { p, seg, street } = placed()
    const op: EdgeOp = { op: 'count', edge: `${seg}:left`, kind: 'gate', n: 2, end: 'end' }
    const r = editEdge(p, street, op, 'o1')
    expect(r.reason).toBe('Gates are put one at a time')
    expect(r.project).toBe(p)
  })
})
