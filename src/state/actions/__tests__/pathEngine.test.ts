// The path verbs (Phase PE.1, task 6, Decision "Path engine"): `pathOf` reads a street or an existing road as a path, `editPath`
// runs one op of the path engine on it, each kind through its adapter; a refusal is the SAME project and its reason.
import { describe, expect, it } from 'vitest'
import { ProjectSchema, type Id, type Project, type StreetSegment, type Streets } from '../../../model/schema.ts'
import { kinds } from '../../../kinds/index.ts'
import { streetChains } from '../../../engine/circulation/streets.ts'
import { demoProject } from '../../demo.ts'
import { createAppStore } from '../../store.ts'
import { actions } from '../index.ts'
import { addExistingRoad } from '../circulation.ts'
import { PATH_ADAPTERS, editPath, pathOf } from '../path.ts'

const o1 = 'o1'
const seg = (id: Id, a: Id, b: Id, left = 4, right = 4, more: Partial<StreetSegment> = {}): StreetSegment => ({ id, a, b, type: 'trucks', left, right, ...more })
const nodes = (...ns: [Id, number, number][]) => ns.map(([id, x, y]) => ({ id, x, y }))
const put = (streets: Streets, p: Project = demoProject({ streets: false, southStreet: false })): Project => ({ ...p, options: p.options.map((o) => (o.id === o1 ? { ...o, streets } : o)) })
const streetsOf = (p: Project, option = o1): Streets => p.options.find((o) => o.id === option)!.streets ?? { nodes: [], segments: [] }
const ref = (segId: Id) => ({ kind: 'street', id: `street:${segId}` })
const at = (p: Project, id: Id) => streetsOf(p).nodes.find((n) => n.id === id)!

/** A 100 m street of two stretches: s1 (left 2, right 6; parking, group), s2 drawn b → a (left 3, right 5 walking a → b). */
function line(): Project {
  return put({
    nodes: nodes(['n1', 0, 0], ['n2', 50, 0], ['n3', 100, 0]),
    segments: [seg('s1', 'n1', 'n2', 2, 6, { parking: 'left', group: 'g1' }), seg('s2', 'n3', 'n2', 3, 5, { locked: undefined, vehicles: 'cars' })],
  })
}
const sidesOf = (p: Project, id: Id) => {
  const g = streetsOf(p).segments.find((x) => x.id === id)!
  return { left: g.left, right: g.right }
}

describe('pathOf: a street', () => {
  it('is the chain’s points and sides walking it, its node ids, its locked stretches and the nodes another street meets', () => {
    const r = pathOf(line(), ref('s1'), o1)!
    expect(r.nodes).toEqual(['n1', 'n2', 'n3'])
    expect(r.path.points).toEqual([{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 100, y: 0 }])
    // s2 is stored n3 → n2: walking the chain its sides turn
    expect(r.path.stretches).toEqual([{ left: 2, right: 6 }, { left: 5, right: 3 }])
    expect(r.held).toEqual([false, false])
    expect(r.shared).toEqual([false, false, false])
    // any of its segments finds the chain
    expect(pathOf(line(), ref('s2'), o1)!.nodes).toEqual(['n1', 'n2', 'n3'])
  })

  it('tells a locked segment (held) and a T node (shared)', () => {
    const p = put({
      nodes: nodes(['n1', 0, 0], ['n2', 50, 0], ['n3', 100, 0], ['n4', 50, 40]),
      segments: [seg('s1', 'n1', 'n2'), seg('s2', 'n2', 'n3', 4, 4, { locked: true }), seg('s3', 'n2', 'n4')],
    })
    expect(streetChains(streetsOf(p))).toHaveLength(3)
    const r = pathOf(p, ref('s2'), o1)!
    expect(r.held).toEqual([true])
    expect(r.shared).toEqual([true, false])
  })

  it('is null for what is not there, or a kind with no path', () => {
    expect(pathOf(line(), ref('nope'), o1)).toBeNull()
    expect(pathOf(line(), { kind: 'mass', id: 'm1' }, o1)).toBeNull()
    expect(pathOf(line(), ref('s1'), 'nope')).toBeNull()
  })
})

describe('editPath: a street', () => {
  it('side and width write each segment’s left and right, turned back for one walked b → a; every segment keeps its id, parking, vehicles, group', () => {
    const p = line()
    const r = editPath(p, ref('s1'), { op: 'side', k: 'all', side: 'left', by: 1 }, o1)
    expect(r.reason).toBeUndefined()
    expect(sidesOf(r.project, 's1')).toEqual({ left: 3, right: 6 })
    // s2 walked b → a: the chain's left is its right
    expect(sidesOf(r.project, 's2')).toEqual({ left: 3, right: 6 })
    expect(streetsOf(r.project).segments[0]).toMatchObject({ id: 's1', parking: 'left', group: 'g1' })
    expect(streetsOf(r.project).segments[1]).toMatchObject({ id: 's2', vehicles: 'cars' })
    expect(ProjectSchema.safeParse(r.project).success).toBe(true)
    const w = editPath(p, ref('s1'), { op: 'width', k: 1, side: 'right', to: 9 }, o1)
    // chain stretch 1's right is s2's left: 9 − 5 (chain left) → 4
    expect(sidesOf(w.project, 's2')).toEqual({ left: 4, right: 5 })
    expect(sidesOf(w.project, 's1')).toEqual({ left: 2, right: 6 })
  })

  it('side clamps with its note; width refuses past the drawn line, the same project', () => {
    const p = line()
    const c = editPath(p, ref('s1'), { op: 'side', k: 0, side: 'left', by: -5 }, o1)
    expect(sidesOf(c.project, 's1').left).toBe(0)
    expect(c.notes).toContain('That side is the drawn line now')
    const w = editPath(p, ref('s1'), { op: 'width', k: 0, side: 'left', to: 4 }, o1)
    expect(w.project).toBe(p)
    expect(w.reason).toBe('That side would pass the drawn line')
  })

  it('node moves a node and what joins it follows; one dropped on another street’s node joins it', () => {
    let p = put({
      nodes: nodes(['n1', 0, 0], ['n2', 50, 0], ['n3', 100, 0], ['n4', 100, 40]),
      segments: [seg('s1', 'n1', 'n2'), seg('s3', 'n3', 'n4')],
    })
    const moved = editPath(p, ref('s1'), { op: 'node', i: 1, to: { x: 60, y: 5 } }, o1)
    expect(at(moved.project, 'n2')).toMatchObject({ x: 60, y: 5 })
    const joined = editPath(p, ref('s1'), { op: 'node', i: 1, to: { x: 100, y: 40 } }, o1)
    expect(streetsOf(joined.project).nodes).toHaveLength(3)
    expect(streetsOf(joined.project).segments.find((g) => g.id === 's1')).toMatchObject({ a: 'n1' })
    p = joined.project
    expect(ProjectSchema.safeParse(p).success).toBe(true)
  })

  it('an end dropped on another street’s paving makes a T there', () => {
    const p = put({
      nodes: nodes(['n1', 0, 0], ['n2', 50, 0], ['n3', 100, 0], ['n4', 100, 40]),
      segments: [seg('s1', 'n1', 'n2'), seg('s3', 'n3', 'n4')],
    })
    const r = editPath(p, ref('s1'), { op: 'node', i: 1, to: { x: 98, y: 20 } }, o1)
    expect(streetsOf(r.project).segments).toHaveLength(3)
    const joint = streetsOf(r.project).nodes.find((n) => n.x === 100 && n.y === 20)
    expect(joint).toBeDefined()
    expect(streetsOf(r.project).segments.find((g) => g.id === 's1')!.b).toBe(joint!.id)
  })

  it('stretch moves the stretch’s two nodes by a vector', () => {
    const r = editPath(line(), ref('s1'), { op: 'stretch', k: 0, by: { x: 0, y: 7 } }, o1)
    expect(at(r.project, 'n1')).toMatchObject({ x: 0, y: 7 })
    expect(at(r.project, 'n2')).toMatchObject({ x: 50, y: 7 })
    expect(at(r.project, 'n3')).toMatchObject({ x: 100, y: 0 })
  })

  it('insert splits the stretch at its nearest point; both halves keep its sides, the first its id', () => {
    const r = editPath(line(), ref('s1'), { op: 'insert', k: 0, at: { x: 20, y: 9 } }, o1)
    const s = streetsOf(r.project)
    expect(s.segments).toHaveLength(3)
    const node = s.nodes.find((n) => n.x === 20)!
    expect(node.y).toBe(0)
    expect(s.segments.find((g) => g.id === 's1')).toMatchObject({ a: 'n1', b: node.id, left: 2, right: 6, parking: 'left', group: 'g1' })
    expect(s.segments.find((g) => g.a === node.id)).toMatchObject({ b: 'n2', left: 2, right: 6 })
    // on a node: nothing to insert
    const same = editPath(line(), ref('s1'), { op: 'insert', k: 0, at: { x: 0, y: 0 } }, o1)
    expect(same.reason).toBeDefined()
  })

  it('remove of an inner node makes the two stretches one, with the first’s sides and id', () => {
    const p = line()
    const r = editPath(p, ref('s1'), { op: 'remove', i: 1 }, o1)
    const s = streetsOf(r.project)
    expect(s.segments).toHaveLength(1)
    expect(s.segments[0]).toMatchObject({ id: 's1', a: 'n1', b: 'n3', left: 2, right: 6, parking: 'left', group: 'g1' })
    expect(s.nodes.map((n) => n.id)).toEqual(['n1', 'n3'])
    expect(editPath(r.project, ref('s1'), { op: 'remove', i: 0 }, o1)).toMatchObject({ reason: 'A street has two nodes at least' })
  })

  it('remove of an inner node keeps the earliest segment of the street, so its id stays (the first’s sides, walking)', () => {
    // the earliest (s1) is the second of the walk n1 → n2 → n3: s2 is stored n2 → n1, so it is walked turned
    const p = put({ nodes: nodes(['n1', 0, 0], ['n2', 50, 0], ['n3', 100, 0]), segments: [seg('s1', 'n2', 'n3', 3, 5, { group: 'g1' }), seg('s2', 'n2', 'n1', 2, 6)] })
    expect(streetChains(streetsOf(p))[0].id).toBe('street:s1')
    const r = editPath(p, ref('s1'), { op: 'remove', i: 1 }, o1)
    expect(r.reason).toBeUndefined()
    const s = streetsOf(r.project)
    // the survivor is s1 (its id and group), the first's own segment grown to n3 as it was stored (s2: n2 → n1, left 2, right 6): n3 → n1, the same sides
    expect(s.segments).toHaveLength(1)
    expect(s.segments[0]).toMatchObject({ id: 's1', a: 'n3', b: 'n1', left: 2, right: 6, group: 'g1' })
    expect(streetChains(s)[0].id).toBe('street:s1')
    // the node-removal verb keeps the same survivor
    const same = actions.removeStreetNode(put({ nodes: nodes(['n1', 0, 0], ['n2', 50, 0], ['n3', 100, 0]), segments: [seg('s1', 'n2', 'n3'), seg('s2', 'n2', 'n1')] }), o1, 'n2')
    expect(streetsOf(same).segments.map((g) => g.id)).toEqual(['s1'])
  })

  it('remove where the earlier segment is the walk’s second takes the first’s data whole and only the earlier one’s identity (review E2)', () => {
    // walking n1 → n2 → n3: s2 (trucks, 10 m, vehicles trucks) first; s1 (cars, 6 m, parking), earlier in the array, second
    const p = put({
      nodes: nodes(['n1', 0, 0], ['n2', 50, 0], ['n3', 100, 0]),
      segments: [seg('s1', 'n2', 'n3', 3, 3, { type: 'cars', vehicles: 'cars', radius: 7, parking: 'right', group: 'g1' }), seg('s2', 'n2', 'n1', 4, 6, { type: 'trucks', vehicles: 'trucks', radius: 12 })],
    })
    const r = editPath(p, ref('s1'), { op: 'remove', i: 1 }, o1)
    const [m, ...rest] = streetsOf(r.project).segments
    expect(rest).toHaveLength(0)
    expect(m).toMatchObject({ id: 's1', type: 'trucks', vehicles: 'trucks', radius: 12, group: 'g1' })
    expect(m.parking).toBeUndefined()
    // 10 m, sides as s2 had them, whichever way the segment is stored
    expect(m.left + m.right).toBe(10)
    expect(m.a === 'n1' ? { l: m.left, r: m.right } : { l: m.right, r: m.left }).toEqual({ l: 6, r: 4 })
  })

  const tee = () =>
    put({
      nodes: nodes(['n1', 0, 0], ['n2', 50, 0], ['n3', 100, 0], ['n4', 50, 40], ['n5', 50, 80]),
      segments: [seg('s1', 'n1', 'n2'), seg('s2', 'n2', 'n3'), seg('s3', 'n2', 'n4'), seg('s4', 'n4', 'n5')],
    })

  it('remove of the end of a chain at a T takes that street’s segment only: the other streets stay whole', () => {
    const p = tee()
    // the branch s3 + s4 is one chain n2 → n4 → n5: its end at the T goes with its first segment
    const r = editPath(p, ref('s4'), { op: 'remove', i: 0 }, o1)
    expect(streetsOf(r.project).segments.map((g) => g.id)).toEqual(['s1', 's2', 's4'])
    expect(streetsOf(r.project).nodes.map((n) => n.id).sort()).toEqual(['n1', 'n2', 'n3', 'n4', 'n5'])
    // its free end goes with its node
    const free = editPath(p, ref('s4'), { op: 'remove', i: 2 }, o1)
    expect(streetsOf(free.project).segments.map((g) => g.id)).toEqual(['s1', 's2', 's3'])
    expect(streetsOf(free.project).nodes.map((n) => n.id)).not.toContain('n5')
  })

  it('equal moves the nodes to the paving’s centre and the sides equal; the node another street meets stays', () => {
    const p = put({
      nodes: nodes(['n1', 0, 0], ['n2', 30, 0], ['n3', 50, 0], ['n4', 50, -20], ['n5', 50, 20]),
      segments: [seg('s1', 'n1', 'n2', 2, 6), seg('s2', 'n2', 'n3', 2, 6), seg('s3', 'n4', 'n3'), seg('s4', 'n3', 'n5')],
    })
    const r = editPath(p, ref('s1'), { op: 'equal' }, o1)
    expect(r.notes).toContain('Its ends tied to something else stayed')
    expect(at(r.project, 'n1')).toMatchObject({ x: 0, y: -2 })
    expect(at(r.project, 'n2')).toMatchObject({ y: -2 })
    expect(at(r.project, 'n3')).toMatchObject({ x: 50, y: 0 })
    expect(sidesOf(r.project, 's1')).toEqual({ left: 4, right: 4 })
    expect(sidesOf(r.project, 's2')).toEqual({ left: 4, right: 4 })
  })

  it('equal leaves a node tied to a lot or to an existing street where it is (PE.1 review)', () => {
    const base = put({
      nodes: nodes(['n1', 0, 0], ['n2', 30, 0], ['n3', 60, 0]),
      segments: [seg('s1', 'n1', 'n2', 2, 6), seg('s2', 'n2', 'n3', 2, 6)],
    })
    const tie = (tag: 'lot' | 'road'): Project => put({ nodes: nodes(['n1', 0, 0], ['n2', 30, 0], ['n3', 60, 0]).map((n) => (n.id === 'n1' ? { ...n, [tag]: 'x1' } : n)), segments: streetsOf(base).segments }, base)
    for (const tag of ['lot', 'road'] as const) {
      const r = editPath(tie(tag), ref('s1'), { op: 'equal' }, o1)
      expect(at(r.project, 'n1'), tag).toMatchObject({ x: 0, y: 0 })
      expect(at(r.project, 'n2'), tag).toMatchObject({ y: -2 })
      expect(at(r.project, 'n3'), tag).toMatchObject({ y: -2 })
    }
  })

  it('a locked stretch refuses an op that touches it, the same project and why; one it does not touch passes', () => {
    const p = put({
      nodes: nodes(['n1', 0, 0], ['n2', 50, 0], ['n3', 100, 0]),
      segments: [seg('s1', 'n1', 'n2'), seg('s2', 'n2', 'n3', 4, 4, { locked: true })],
    })
    for (const op of [
      { op: 'node', i: 1, to: { x: 55, y: 3 } },
      { op: 'node', i: 2, to: { x: 105, y: 3 } },
      { op: 'side', k: 1, side: 'left', by: 1 },
      { op: 'side', k: 'all', side: 'left', by: 1 },
      { op: 'remove', i: 1 },
      { op: 'insert', k: 1, at: { x: 70, y: 0 } },
      { op: 'equal' },
    ] as const) {
      const r = editPath(p, ref('s1'), op, o1)
      expect(r.project, JSON.stringify(op)).toBe(p)
      expect(r.reason, JSON.stringify(op)).toBe('That stretch is locked')
    }
    const free = editPath(p, ref('s1'), { op: 'side', k: 0, side: 'left', by: 1 }, o1)
    expect(free.reason).toBeUndefined()
    expect(sidesOf(free.project, 's1').left).toBe(5)
  })

  it('a street that is not there, an option that is not there: the same project and why', () => {
    const p = line()
    expect(editPath(p, ref('nope'), { op: 'equal' }, o1)).toMatchObject({ project: p, reason: expect.any(String) })
    expect(editPath(p, ref('s1'), { op: 'equal' }, 'nope')).toMatchObject({ project: p, reason: expect.any(String) })
    expect(editPath(p, { kind: 'mass', id: 'm1' }, { op: 'equal' }, o1)).toMatchObject({ project: p, reason: expect.any(String) })
  })

  it('is one undo step each', () => {
    const s = createAppStore(line())
    const before = s.getState().project
    s.getState().apply((p) => editPath(p, ref('s1'), { op: 'side', k: 'all', side: 'right', by: 2 }, o1).project)
    expect(s.getState().project).not.toBe(before)
    s.getState().undo()
    expect(s.getState().project.options).toBe(before.options)
  })
})

describe('editPath: a loop (Review Focus 2)', () => {
  const square = () =>
    put({
      nodes: nodes(['n1', 0, 0], ['n2', 40, 0], ['n3', 40, 40], ['n4', 0, 40]),
      segments: [seg('s1', 'n1', 'n2', 2, 6), seg('s2', 'n2', 'n3', 2, 6), seg('s3', 'n3', 'n4', 2, 6), seg('s4', 'n4', 'n1', 2, 6)],
    })

  it('is one closed path', () => {
    const r = pathOf(square(), ref('s3'), o1)!
    expect(r.nodes).toEqual(['n1', 'n2', 'n3', 'n4', 'n1'])
    expect(r.path.points).toHaveLength(5)
    expect(r.shared).toEqual([false, false, false, false, false])
  })

  it('side with "all" keeps it closed, and an inner node removed keeps it closed', () => {
    const p = square()
    const w = editPath(p, ref('s1'), { op: 'side', k: 'all', side: 'left', by: 1 }, o1)
    expect(streetsOf(w.project).segments.map((g) => [g.a, g.b])).toEqual(streetsOf(p).segments.map((g) => [g.a, g.b]))
    expect(streetChains(streetsOf(w.project))).toHaveLength(1)
    const r = editPath(p, ref('s1'), { op: 'remove', i: 1 }, o1)
    const s = streetsOf(r.project)
    expect(s.segments).toHaveLength(3)
    expect(s.nodes.map((n) => n.id)).not.toContain('n2')
    expect(streetChains(s)).toHaveLength(1)
    expect(streetChains(s)[0].nodes[0]).toBe(streetChains(s)[0].nodes[3])
    // the closing node too
    const first = editPath(p, ref('s1'), { op: 'remove', i: 0 }, o1)
    expect(streetsOf(first.project).segments).toHaveLength(3)
    expect(streetChains(streetsOf(first.project))).toHaveLength(1)
  })

  it('a loop of three nodes keeps them: its node cannot go', () => {
    const p = put({ nodes: nodes(['n1', 0, 0], ['n2', 40, 0], ['n3', 20, 30]), segments: [seg('s1', 'n1', 'n2'), seg('s2', 'n2', 'n3'), seg('s3', 'n3', 'n1')] })
    const r = editPath(p, ref('s1'), { op: 'remove', i: 1 }, o1)
    expect(r.project).toBe(p)
    expect(r.reason).toBeDefined()
  })

  it('a node of a loop moved moves it once, both its stretches following', () => {
    const r = editPath(square(), ref('s1'), { op: 'node', i: 4, to: { x: -5, y: -5 } }, o1)
    expect(at(r.project, 'n1')).toMatchObject({ x: -5, y: -5 })
  })
})

describe('editPath: an option’s copy (Review Focus 3)', () => {
  it('two options with the same segment ids: an edit in o2 leaves o1 as it was', () => {
    const base = line()
    const streets = streetsOf(base)
    const p: Project = { ...base, options: [...base.options, { id: 'o2', name: 'Option 2', buildingIds: [], streets }] }
    const r = editPath(p, ref('s1'), { op: 'side', k: 'all', side: 'left', by: 2 }, 'o2')
    expect(streetsOf(r.project, o1)).toBe(streets)
    expect(streetsOf(r.project, 'o2').segments[0].left).toBe(4)
    const n = editPath(p, ref('s1'), { op: 'node', i: 1, to: { x: 60, y: 9 } }, 'o2')
    expect(streetsOf(n.project, o1)).toBe(streets)
    const e = editPath(p, ref('s1'), { op: 'equal' }, 'o2')
    expect(streetsOf(e.project, o1)).toBe(streets)
  })
})

describe('editPath: an existing road', () => {
  const road = () => {
    const r = addExistingRoad(demoProject({ streets: false }), [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 100, y: 0 }], 8)!
    return { p: r.project, ref: { kind: 'existing-road', id: r.id } }
  }
  const roadOf = (p: Project, id: Id) => p.site.existingRoads!.find((x) => x.id === id)!

  it('is read as a path: its points, its stretches, its nodes’ indexes', () => {
    const { p, ref: r } = road()
    const read = pathOf(p, r, o1)!
    expect(read.path.points).toHaveLength(3)
    expect(read.path.stretches).toEqual([{ left: 4, right: 4 }, { left: 4, right: 4 }])
    expect(read.nodes).toEqual(['0', '1', '2'])
    expect(read.held).toEqual([false, false])
    expect(read.shared).toEqual([false, false, false])
    // the derived road’s id finds it too
    expect(pathOf(p, { kind: 'existing-road', id: `existing:${r.id}` }, o1)).not.toBeNull()
  })

  it('takes the same ops: a pull on one stretch, a node, an insert, a remove, an equal', () => {
    const { p, ref: r } = road()
    const side = editPath(p, r, { op: 'side', k: 1, side: 'left', by: 2 }, o1)
    expect(roadOf(side.project, r.id).stretches).toEqual([{ left: 4, right: 4 }, { left: 6, right: 4 }])
    const node = editPath(p, r, { op: 'node', i: 1, to: { x: 50, y: 10 } }, o1)
    expect(roadOf(node.project, r.id).points[1]).toEqual({ x: 50, y: 10 })
    const ins = editPath(p, r, { op: 'insert', k: 0, at: { x: 20, y: 3 } }, o1)
    expect(roadOf(ins.project, r.id).points).toHaveLength(4)
    expect(roadOf(ins.project, r.id).stretches).toHaveLength(3)
    const rem = editPath(side.project, r, { op: 'remove', i: 1 }, o1)
    expect(roadOf(rem.project, r.id).points).toHaveLength(2)
    expect(roadOf(rem.project, r.id).stretches).toEqual([{ left: 4, right: 4 }])
    const eq = editPath(side.project, r, { op: 'equal' }, o1)
    expect(roadOf(eq.project, r.id).stretches[1]).toEqual({ left: 5, right: 5 })
    expect(ProjectSchema.safeParse(eq.project).success).toBe(true)
  })

  it('a node dropped on its neighbour drops the stretch between them', () => {
    const { p, ref: r } = road()
    const out = editPath(p, r, { op: 'node', i: 1, to: { x: 100, y: 0.01 } }, o1)
    expect(roadOf(out.project, r.id).points).toEqual([{ x: 0, y: 0 }, { x: 100, y: 0 }])
    expect(roadOf(out.project, r.id).stretches).toHaveLength(1)
    expect(ProjectSchema.safeParse(out.project).success).toBe(true)
  })

  it('refuses what the path engine refuses, the same project and why; a road not there too', () => {
    const { p, ref: r } = road()
    const two = editPath(editPath(p, r, { op: 'remove', i: 0 }, o1).project, r, { op: 'remove', i: 0 }, o1)
    expect(two.reason).toBe('A street has two nodes at least')
    expect(editPath(p, { kind: 'existing-road', id: 'nope' }, { op: 'equal' }, o1)).toMatchObject({ project: p, reason: expect.any(String) })
  })
})

describe('the kinds’ path', () => {
  it('a street and an existing road take a free width and lanes (Phase PE.2)', () => {
    const withPath = kinds().filter((k) => k.path)
    expect(withPath.map((k) => [k.id, k.path])).toEqual([
      ['street', { width: 'free', lanes: true }],
      ['existing-road', { width: 'free', lanes: true }],
    ])
  })

  it('every kind with a path has an adapter, and none without', () => {
    expect(Object.keys(PATH_ADAPTERS).sort()).toEqual(kinds().filter((k) => k.path).map((k) => k.id).sort())
  })

  it('the verbs are in the registry', () => {
    expect(typeof actions.pathOf).toBe('function')
    expect(typeof actions.editPath).toBe('function')
  })
})
