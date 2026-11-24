// The On edge engine (Phase D.3, task 9; Decision "On edge engine"): `edgeOf` reads the walls of a block with their slots and elements,
// `editEdge` runs one operation (put, take, slide, width, count) on a block type (`block-type`, the block editor) or on a placed block's
// hall (`mass`, the site: the copy's own elements, a variant). One writer; a refusal is the SAME project and its reason.
import { describe, expect, it } from 'vitest'
import type { EdgeOp } from '../../../engine/edge/onEdge.ts'
import type { Project } from '../../../model/schema.ts'
import { kindOf, kinds } from '../../../kinds/index.ts'
import { demoProject } from '../../demo.ts'
import { massIsLocked } from '../../../model/locks.ts'
import { onDockRule } from '../../../modules/warehouse/engine/dockRule.ts'
import { generate, typeWith } from '../../../modules/warehouse/engine/generate.ts'
import { ANGLED_ELEMENTS } from '../../../modules/warehouse/engine/shape.ts'
import { actions } from '../index.ts'
import { EDGE_ADAPTERS, edgeOf, editEdge } from '../onEdge.ts'
import { editShape } from '../shape.ts'

/** The new block (66 × 32 modules; one dock on every module of e1's interior bays, 3–62), and one copy of it on the site. */
function placed() {
  const { project: p0, id } = actions.addWarehouseType(demoProject())
  const r = actions.placeWarehouse(p0, id, { x: 0, y: 0 }, 0, p0.options[0].id)!
  const hall = r.project.masses.find((m) => m.part === 'hall')!
  return { p: r.project, id, copy: r.id, host: { kind: 'block-type', id }, site: { kind: 'mass', id: hall.id } }
}
const typeIn = (p: Project, id: string) => p.warehouseTypes!.find((t) => t.id === id)!
const copyIn = (p: Project, id: string) => p.buildings.find((b) => b.id === id)!
const modules = (p: Project, id: string, kind: string, edge: string) =>
  typeIn(p, id)
    .elements.filter((e) => e.kind === kind && e.edge === edge)
    .map((e) => e.module)
    .sort((a, b) => a - b)
const ownModules = (p: Project, copy: string, kind: string, edge: string) =>
  (copyIn(p, copy).warehouse!.overrides?.elements ?? [])
    .filter((e) => e.kind === kind && e.edge === edge)
    .map((e) => e.module)
    .sort((a, b) => a - b)

describe('edgeOf on a block type', () => {
  it('reads each wall along the grid with its whole modules (their bays as groups) and its elements', () => {
    const { p, host } = placed()
    const r = edgeOf(p, host)!
    expect(r.edges.map((e) => e.id)).toEqual(['e1', 'e2', 'e3', 'e4'])
    const e1 = r.edges.find((e) => e.id === 'e1')!
    expect(e1.refused).toBeUndefined()
    expect(e1.slots).toHaveLength(66)
    expect(e1.slots[0]).toMatchObject({ k: 0, from: 0 })
    expect(e1.slots[1].from).toBeCloseTo(e1.slots[0].to, 6)
    // the end bay of 10 m is 3 modules, the next bay 4 modules of 3 m
    expect(e1.slots.slice(0, 3).map((s) => s.group)).toEqual([0, 0, 0])
    expect(e1.slots[3].group).toBe(1)
    expect(e1.out).toEqual({ x: 0, y: -1 })
    const docks = r.elements.filter((x) => x.kind === 'dock' && x.edge === 'e1')
    expect(docks).toHaveLength(60)
    expect(docks[0]).toMatchObject({ kind: 'dock', edge: 'e1', width: 3 })
  })

  it('reads an angled wall with its refusal and no slots', () => {
    const { p, id, host } = placed()
    const q = editShape(p, { kind: 'block-type', id }, { op: 'vertex', vertex: 2, to: { x: 150.3, y: 96.3 } }).project
    const angled = generate(typeIn(q, id)).edges.find((e) => e.axis === null)!
    const e = edgeOf(q, host)!.edges.find((x) => x.id === angled.id)!
    expect(e.refused).toBe(ANGLED_ELEMENTS)
    expect(e.slots).toEqual([])
  })

  it('answers null for what is not there', () => {
    const { p } = placed()
    expect(edgeOf(p, { kind: 'block-type', id: 'nope' })).toBeNull()
    expect(edgeOf(p, { kind: 'mass', id: 'nope' })).toBeNull()
    expect(edgeOf(p, { kind: 'street', id: 'x' })).toBeNull()
  })
})

describe('editEdge on a block type', () => {
  it('puts two docks, takes one', () => {
    const { p, id, host } = placed()
    const q = editEdge(p, host, { op: 'put', edge: 'e1', slots: [0, 1], kind: 'dock' })
    expect(q.reason).toBeUndefined()
    expect(modules(q.project, id, 'dock', 'e1').slice(0, 3)).toEqual([0, 1, 3])
    const r = editEdge(q.project, host, { op: 'take', edge: 'e1', slots: [0], kind: 'dock' })
    expect(modules(r.project, id, 'dock', 'e1').slice(0, 3)).toEqual([1, 3, 4])
  })

  it('a put of nothing new is the same project, with no reason', () => {
    const { p, host } = placed()
    const w = editEdge(p, host, { op: 'put', edge: 'e1', slots: [3], kind: 'dock' })
    expect(w.project).toBe(p)
    expect(w.reason).toBeUndefined()
  })

  it('a bay put by the rule gets the rule’s modules; a drag’s slots too', () => {
    const { p, id, host } = placed()
    const g = generate(typeIn(p, id))
    const bay = [0, 1, 2]
    const rule = onDockRule(g, g.edges.find((e) => e.id === 'e1')!, bay)
    expect(rule.length).toBeGreaterThan(0)
    expect(rule.length).toBeLessThan(bay.length)
    const q = editEdge(p, host, { op: 'put', edge: 'e1', slots: bay, kind: 'dock', byRule: true }).project
    expect(modules(q, id, 'dock', 'e1').filter((k) => k < 3)).toEqual(rule)
    const drag = editEdge(p, host, { op: 'put', edge: 'e3', slots: [10, 11, 12, 13, 14, 15, 16, 17], kind: 'dock', byRule: true }).project
    const g3 = generate(typeIn(p, id))
    expect(modules(drag, id, 'dock', 'e3')).toEqual(onDockRule(g3, g3.edges.find((e) => e.id === 'e3')!, [10, 11, 12, 13, 14, 15, 16, 17]))
    // and the same slots by the rule are taken away again
    const gone = editEdge(drag, host, { op: 'take', edge: 'e3', slots: [10, 11, 12, 13, 14, 15, 16, 17], kind: 'dock', byRule: true }).project
    expect(modules(gone, id, 'dock', 'e3')).toEqual([])
  })

  it('slides two picked docks by one module; past a wall’s end is refused', () => {
    const { p, id, host } = placed()
    const ids = typeIn(p, id).elements.filter((e) => e.edge === 'e1' && (e.module === 3 || e.module === 4)).map((e) => e.id)
    // module 3, 4 +1 would land on 4 (moved with them) and 5 (held, not picked): refused
    expect(editEdge(p, host, { op: 'slide', ids, by: 1 }).project).toBe(p)
    const free = editEdge(p, host, { op: 'put', edge: 'e4', slots: [3, 4], kind: 'door' }).project
    const doors = typeIn(free, id).elements.filter((e) => e.edge === 'e4' && e.kind === 'door')
    const moved = editEdge(free, host, { op: 'slide', ids: doors.map((d) => d.id), by: 1 })
    expect(moved.reason).toBeUndefined()
    expect(modules(moved.project, id, 'door', 'e4')).toEqual([4, 5])
    const out = editEdge(free, host, { op: 'slide', ids: doors.map((d) => d.id), by: 100 })
    expect(out.project).toBe(free)
    expect(out.reason).toMatch(/wall|end|another/i)
  })

  it('sets the width of the ones picked (4.5 m)', () => {
    const { p, id, host } = placed()
    const ids = typeIn(p, id).elements.filter((e) => e.edge === 'e1').slice(0, 2).map((e) => e.id)
    const q = editEdge(p, host, { op: 'width', ids, width: 4.5 }).project
    expect(typeIn(q, id).elements.filter((e) => ids.includes(e.id)).map((e) => e.width)).toEqual([4.5, 4.5])
    expect(typeIn(q, id).elements.filter((e) => !ids.includes(e.id) && e.edge === 'e1').every((e) => e.width === 3)).toBe(true)
    expect(editEdge(p, host, { op: 'width', ids, width: -1 }).reason).toBeTruthy()
  })

  it('counts: 6 docks on a wall from its end by the dock rule; 2 takes the others from that end', () => {
    const { p, id, host } = placed()
    const six = editEdge(p, host, { op: 'count', edge: 'e3', kind: 'dock', n: 6, end: 'end' })
    expect(six.reason).toBeUndefined()
    const ks = modules(six.project, id, 'dock', 'e3')
    expect(ks).toHaveLength(6)
    // from the wall's end: the highest modules
    const span = edgeOf(p, host)!.edges.find((e) => e.id === 'e3')!.slots.length
    expect(Math.max(...ks)).toBeLessThan(span)
    expect(ks[ks.length - 1]).toBeGreaterThan(span - 10)
    const two = editEdge(six.project, host, { op: 'count', edge: 'e3', kind: 'dock', n: 2, end: 'end' })
    expect(modules(two.project, id, 'dock', 'e3')).toEqual(ks.slice(0, 2))
    const start = editEdge(six.project, host, { op: 'count', edge: 'e3', kind: 'dock', n: 2, end: 'start' })
    expect(modules(start.project, id, 'dock', 'e3')).toEqual(ks.slice(4))
  })

  it('an angled wall refuses with the reason, the same project', () => {
    const { p, id, host } = placed()
    const q = editShape(p, { kind: 'block-type', id }, { op: 'vertex', vertex: 2, to: { x: 150.3, y: 96.3 } }).project
    const angled = generate(typeIn(q, id)).edges.find((e) => e.axis === null)!
    const ops: EdgeOp[] = [
      { op: 'put', edge: angled.id, slots: [0, 1], kind: 'dock' },
      { op: 'take', edge: angled.id, slots: [0], kind: 'door' },
      { op: 'count', edge: angled.id, kind: 'dock', n: 2, end: 'end' },
    ]
    for (const op of ops) {
      const w = editEdge(q, host, op)
      expect(w.project).toBe(q)
      expect(w.reason).toBe('Docks, doors and patterns go on walls along the grid')
    }
  })

  it('opens each edit as one step, and a put of a dock drops a depthless court entry as putElements does', () => {
    const { p, id, host } = placed()
    const q = editEdge(p, host, { op: 'put', edge: 'e3', slots: [5], kind: 'dock' }).project
    expect(modules(q, id, 'dock', 'e3')).toEqual([5])
    // the same result as the verb of before
    expect(typeIn(actions.putElements(p, id, 'dock', 'e3', [5], true), id)).toEqual(typeIn(q, id))
  })

  it('names a refusal for an edge that is not there, and for a kind of host that has no edges', () => {
    const { p, host } = placed()
    expect(editEdge(p, host, { op: 'put', edge: 'e9', slots: [1], kind: 'dock' }).project).toBe(p)
    const w = editEdge(p, { kind: 'lot', id: 'x' }, { op: 'put', edge: 'e1', slots: [1], kind: 'dock' })
    expect(w.project).toBe(p)
    expect(w.reason).toMatch(/no edges/)
  })
})

describe('editEdge on a placed block (the site)', () => {
  it('reads the walls in the site’s frame: a block placed at 400, 0 has its front there', () => {
    const { p, id, site } = placed()
    const t = edgeOf(p, site)!.edges.find((e) => e.id === 'e1')!
    expect(t.slots).toHaveLength(66)
    expect(t.out).toEqual({ x: 0, y: -1 })
    const q = actions.placeWarehouseAt(p, id, { x: 400, y: 0, angle: 90 }, p.options[0].id)!
    const hall = q.project.masses.filter((m) => m.part === 'hall').find((m) => m.id !== site.id)!
    const e = edgeOf(q.project, { kind: 'mass', id: hall.id })!.edges.find((x) => x.id === 'e1')!
    expect(Math.hypot(e.out.x, e.out.y)).toBeCloseTo(1, 6)
    expect(e.out.y).toBeCloseTo(0, 6)
    expect(e.origin.x).toBeGreaterThan(300)
  })

  it('the same ops make the copy’s own elements; the type is unchanged', () => {
    const { p, id, copy, site } = placed()
    const q = editEdge(p, site, { op: 'put', edge: 'e1', slots: [0, 1], kind: 'dock' }).project
    expect(q).not.toBe(p)
    expect(typeIn(q, id)).toEqual(typeIn(p, id))
    expect(ownModules(q, copy, 'dock', 'e1').slice(0, 3)).toEqual([0, 1, 3])
    const w = editEdge(q, site, { op: 'slide', ids: typeWith(typeIn(q, id), copyIn(q, copy).warehouse!.overrides).elements.filter((e) => e.edge === 'e1' && e.module < 2).map((e) => e.id), by: -1 })
    expect(w.reason).toBeTruthy()
    const wide = typeWith(typeIn(q, id), copyIn(q, copy).warehouse!.overrides).elements.find((e) => e.edge === 'e1')!
    const r = editEdge(q, site, { op: 'width', ids: [wide.id], width: 5 }).project
    expect(copyIn(r, copy).warehouse!.overrides!.elements!.find((e) => e.id === wide.id)!.width).toBe(5)
    expect(typeIn(r, id)).toEqual(typeIn(p, id))
    const c = editEdge(p, site, { op: 'count', edge: 'e3', kind: 'dock', n: 3, end: 'start' }).project
    expect(ownModules(c, copy, 'dock', 'e3')).toHaveLength(3)
    expect(modules(c, id, 'dock', 'e3')).toEqual([])
  })

  it('Back to type clears them', () => {
    const { p, copy, site } = placed()
    const q = editEdge(p, site, { op: 'put', edge: 'e3', slots: [4], kind: 'dock' }).project
    expect(copyIn(q, copy).warehouse!.overrides?.elements).toBeDefined()
    const back = actions.copyBackToType(q, copy)
    expect(copyIn(back, copy).warehouse!.overrides?.elements).toBeUndefined()
  })

  it('a locked block refuses, the same project and its reason', () => {
    const { p, copy, site } = placed()
    const locked: Project = { ...p, buildings: p.buildings.map((b) => (b.id === copy ? { ...b, locked: true } : b)) }
    const hall = locked.masses.find((m) => m.id === site.id)!
    expect(massIsLocked(locked, hall)).toBe(true)
    const w = editEdge(locked, site, { op: 'put', edge: 'e3', slots: [4], kind: 'dock' })
    expect(w.project).toBe(locked)
    expect(w.reason).toBe('That block is locked')
  })

  it('the verbs of before still give what they gave (a copy’s put through the core)', () => {
    const { p, copy, site } = placed()
    const viaVerb = actions.putCopyElements(p, copy, 'dock', 'e3', [4, 5], true)
    const viaEngine = editEdge(p, site, { op: 'put', edge: 'e3', slots: [4, 5], kind: 'dock' }).project
    expect(copyIn(viaEngine, copy).warehouse).toEqual(copyIn(viaVerb, copy).warehouse)
  })
})

describe('the registry: kinds and adapters', () => {
  it('every host a kind’s `onEdge` names has an adapter, and every adapter is a host some kind names', () => {
    const named = new Set(kinds(demoProject()).flatMap((k) => k.onEdge?.hosts ?? []))
    for (const h of named) expect(EDGE_ADAPTERS[h], h).toBeDefined()
    for (const h of Object.keys(EDGE_ADAPTERS)) expect(named.has(h), h).toBe(true)
    expect(kindOf('element', demoProject())!.onEdge).toEqual({ hosts: ['block-type', 'mass'] })
  })

  it('a gate stands on three hosts (a street, an existing street, the site’s boundary), each with an adapter (Phase PE.2)', () => {
    const gate = kindOf('gate', demoProject())!
    expect(gate.onEdge).toEqual({ hosts: ['street', 'existing-road', 'boundary'] })
    for (const h of gate.onEdge!.hosts) expect(EDGE_ADAPTERS[h], h).toBeDefined()
    expect(kindOf('boundary', demoProject())).toMatchObject({ label: 'Site boundary', group: null, base: [], own: [] })
  })
})

describe('a shaped truck court stays when docks go on its wall (review B1)', () => {
  const shape = { vertices: [{ x: 0, y: 0, r: 0 }, { x: 30, y: 0, r: 0 }, { x: 30, y: 20, r: 0 }, { x: 0, y: 12, r: 0 }] }
  it('put and count on the type: the court keeps its id and shape', () => {
    const { p, id, host } = placed()
    const q = { ...p, warehouseTypes: p.warehouseTypes!.map((t) => (t.id === id ? { ...t, courts: [{ edge: 'e1', id: 'c1', shape }] } : t)) }
    const put = editEdge(q, host, { op: 'put', edge: 'e1', slots: [0], kind: 'dock' }).project
    expect(typeIn(put, id).courts).toEqual([{ edge: 'e1', id: 'c1', shape }])
    const more = editEdge(q, host, { op: 'count', edge: 'e1', kind: 'dock', n: 61, end: 'end' }).project
    expect(typeIn(more, id).courts).toEqual([{ edge: 'e1', id: 'c1', shape }])
  })
  it('put on a copy that has its own courts: they stay', () => {
    const { p, copy, site } = placed()
    const q = { ...p, buildings: p.buildings.map((b) => (b.id === copy ? { ...b, warehouse: { ...b.warehouse!, overrides: { ...b.warehouse!.overrides, courts: [{ edge: 'e1', id: 'c1', shape }] } } } : b)) }
    const put = editEdge(q, site, { op: 'put', edge: 'e1', slots: [0], kind: 'dock' }).project
    expect(copyIn(put, copy).warehouse!.overrides!.courts).toEqual([{ edge: 'e1', id: 'c1', shape }])
  })
})
