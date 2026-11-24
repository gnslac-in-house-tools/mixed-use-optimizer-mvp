// Groups of any kind (Phase AS.5 task 6, Decision "Groups of any kind"): a mass, a street, a lot, a gate, a dimension, a reference line and a note in one group, one id across kinds,
// kept in each one's own `group` (a street's on each of its segments). The verbs (`groupRefs`, `ungroupRefs`), the reader (`engine/groups.ts`), the cleanup of a group of one (in `settle`),
// the copies' groups (Copy, Array, Mirror keeping the originals) and Align's one unit.
import { describe, expect, it } from 'vitest'
import { derive } from '../../../engine/derive.ts'
import { gatesOf } from '../../../engine/circulation/gates.ts'
import { groupIdsIn, membersOfGroup, oneRefGroup, refGroup, refGroupMembers, withGroupOn, withoutLoneGroups } from '../../../engine/groups.ts'
import { NOTHING_PICKED, type Picked } from '../../../model/picked.ts'
import type { Project, StreetSegment } from '../../../model/schema.ts'
import { addLot } from '../../../modules/parking/actions.ts'
import { demoProject } from '../../demo.ts'
import { settle } from '../../settle.ts'
import { actions } from '../index.ts'

const OPTION = 'o1'

/** The demo with a free lot, a dimension, a reference line and a note on its level; the refs of one thing of each kind. */
function world() {
  let p = demoProject()
  const lot = addLot(p, OPTION, { rect: { center: { x: 220, y: 200 }, width: 40, depth: 30, rotation: 0 } })!
  p = lot.project
  const dim = actions.addDimension(p, { x: 60, y: 60 }, { x: 100, y: 60 }, 8, 'l1')!
  p = dim.project
  const line = actions.addReferenceLine(p, [{ x: 0, y: 20 }, { x: 100, y: 20 }])!
  p = line.project
  const note = actions.addNote(p, { x: 300, y: 220 }, 'Hello', 'l1')!
  p = note.project
  const road = derive(p, OPTION).circulation.roads.find((r) => r.kind === 'street')!
  const gate = gatesOf(p, OPTION)[0]
  const refs = {
    mass: { kind: 'mass', id: 'm1' },
    street: { kind: 'street', id: road.id },
    lot: { kind: 'lot', id: lot.id },
    gate: { kind: 'gate', id: gate.id },
    dimension: { kind: 'dimension', id: dim.id },
    line: { kind: 'reference-line', id: line.id },
    note: { kind: 'note', id: note.id },
  }
  return { p, refs, all: Object.values(refs), road }
}

const segmentsOf = (p: Project) => p.options.find((o) => o.id === OPTION)!.streets!.segments

describe('Group and Ungroup of any kind, as verbs', () => {
  it('a mass, a street, a lot, a gate, a dimension, a reference line and a note grouped together share one id', () => {
    const { p, all, road } = world()
    const made = actions.groupRefs(p, OPTION, all)!
    expect(made.id).toBe('g1')
    const q = made.project
    expect(q.masses.find((m) => m.id === 'm1')!.group).toBe('g1')
    expect(q.dimensions!.every((d) => d.group === 'g1')).toBe(true)
    expect(q.referenceLines![0].group).toBe('g1')
    expect(q.notes![0].group).toBe('g1')
    expect(q.options[0].lots![0].group).toBe('g1')
    expect(gatesOf(q, OPTION).find((g) => g.id === all[3].id)!.group).toBe('g1')
    // a street's is on each of its segments
    const own = new Set(derive(p, OPTION).circulation.roads.find((r) => r.id === road.id)!.segments)
    expect(segmentsOf(q).filter((s) => own.has(s.id)).every((s) => s.group === 'g1')).toBe(true)
    expect(own.size).toBeGreaterThan(0)
    // the reader: every one is in it with the six others
    for (const r of all) expect(refGroupMembers(q, OPTION, r)).toHaveLength(7)
    expect(oneRefGroup(q, OPTION, all)).toBe(true)
    expect(membersOfGroup(q, OPTION, 'g1').map((m) => m.kind)).toEqual(['mass', 'street', 'lot', 'gate', 'dimension', 'reference-line', 'note'])
  })

  it('the groups they were in join the new one, whole', () => {
    const { p, refs } = world()
    const a = actions.groupRefs(p, OPTION, [refs.mass, refs.lot])!
    const b = actions.groupRefs(a.project, OPTION, [refs.note, refs.line])!
    expect([a.id, b.id]).toEqual(['g1', 'g2'])
    // the note joins the mass: the lot (in the mass's group) and the line (in the note's) come with them
    const c = actions.groupRefs(b.project, OPTION, [refs.mass, refs.note])!
    expect(c.id).toBe('g3')
    expect(groupIdsIn(c.project)).toEqual(['g3'])
    expect(membersOfGroup(c.project, OPTION, 'g3').map((m) => m.kind)).toEqual(['mass', 'lot', 'reference-line', 'note'])
  })

  it('Ungroup takes every group the things are in apart, every member', () => {
    const { p, refs, all } = world()
    const q = actions.groupRefs(p, OPTION, all)!.project
    const free = actions.ungroupRefs(q, OPTION, [refs.note])
    expect(groupIdsIn(free)).toEqual([])
    expect(free.notes![0].group).toBeUndefined()
    // nothing in a group: the same project
    expect(actions.ungroupRefs(p, OPTION, all)).toBe(p)
    // two groups, one ungrouped by one of its members
    const two = actions.groupRefs(actions.groupRefs(p, OPTION, [refs.mass, refs.lot])!.project, OPTION, [refs.note, refs.line])!.project
    const left = actions.ungroupRefs(two, OPTION, [refs.mass])
    expect(groupIdsIn(left)).toEqual(['g2'])
  })

  it('a locked member refuses both, whole', () => {
    const { p, refs, all } = world()
    const grouped = actions.groupRefs(p, OPTION, all)!.project
    const lockedLot = actions.lockLots(p, [refs.lot.id], true)
    expect(actions.groupRefs(lockedLot, OPTION, all)).toBeNull()
    const lockedNote = actions.lockNotes(p, [refs.note.id], true)
    expect(actions.groupRefs(lockedNote, OPTION, all)).toBeNull()
    const lockedLine = actions.lockReferenceLines(p, [refs.line.id], true)
    expect(actions.groupRefs(lockedLine, OPTION, all)).toBeNull()
    const lockedGate = actions.lockGates(p, [refs.gate.id], true, OPTION)
    expect(actions.groupRefs(lockedGate, OPTION, all)).toBeNull()
    // a street with only one segment locked holds its group too
    const seg = segmentsOf(p).find((s) => derive(p, OPTION).circulation.roads.find((r) => r.id === refs.street.id)!.segments!.includes(s.id))!
    const lockedSeg = actions.lockStreets(p, [seg.id], true, OPTION)
    expect(actions.groupRefs(lockedSeg, OPTION, all)).toBeNull()
    // already grouped, then locked: Ungroup leaves everything as it is
    const lockedAfter = actions.lockNotes(grouped, [refs.note.id], true)
    expect(actions.ungroupRefs(lockedAfter, OPTION, [refs.mass])).toBe(lockedAfter)
    // a dimension's "lock" fixes a length, it is not the padlock: it may be grouped
    const fixed = actions.toggleDimensionLock(p, refs.dimension.id)
    expect(actions.groupRefs(fixed, OPTION, [refs.mass, refs.dimension])).not.toBeNull()
  })

  it('something that cannot be in a group, fewer than two things and what is not there refuse Group', () => {
    const { p, refs } = world()
    expect(actions.groupRefs(p, OPTION, [refs.mass, { kind: 'building', id: 'b1' }])).toBeNull()
    expect(actions.groupRefs(p, OPTION, [refs.mass, { kind: 'frontage', id: 'f1' }])).toBeNull()
    expect(actions.groupRefs(p, OPTION, [refs.mass, { kind: 'drawing', id: 'a.dxf' }])).toBeNull()
    expect(actions.groupRefs(p, OPTION, [refs.mass])).toBeNull()
    expect(actions.groupRefs(p, OPTION, [refs.mass, refs.mass])).toBeNull()
    expect(actions.groupRefs(p, OPTION, [refs.mass, { kind: 'note', id: 'nope' }])).toBeNull()
  })

  it('a group of one is none: the reader says so, and settle takes the lone id away', () => {
    const { p, refs } = world()
    const lone = withGroupOn(p, OPTION, [refs.note], 'g7')
    expect(refGroup(lone, OPTION, refs.note)).toBe('g7')
    expect(refGroupMembers(lone, OPTION, refs.note)).toEqual([refs.note])
    expect(oneRefGroup(lone, OPTION, [refs.note])).toBe(false)
    const settled = settle(p, lone)
    expect('project' in settled && settled.project.notes![0].group).toBeUndefined()
    // a project with no group is not rebuilt
    expect(withoutLoneGroups(p)).toBe(p)
  })

  it('a street of two groups (an old project) keeps the one the reader sees; the other, on its other segments, goes (review E4)', () => {
    const { p } = world()
    const road = derive(p, OPTION).circulation.roads.find((r) => r.id === 'street:s1')!
    expect(road.segments).toEqual(['s4', 's1', 's2'])
    const tag = (id: string, group: string) => (g: StreetSegment) => (g.id === id ? { ...g, group } : g)
    const two: Project = {
      ...p,
      masses: p.masses.map((m) => (m.id === 'm1' ? { ...m, group: 'g1' } : m)),
      options: p.options.map((o) => (o.id === OPTION ? { ...o, streets: { ...o.streets!, segments: o.streets!.segments.map(tag('s4', 'g1')).map(tag('s2', 'g2')) } } : o)),
    }
    const q = withoutLoneGroups(two)
    const by = (id: string) => segmentsOf(q).find((s) => s.id === id)!
    expect(by('s4').group).toBe('g1')
    expect(by('s2').group).toBeUndefined()
    expect(q.masses.find((m) => m.id === 'm1')!.group).toBe('g1')
  })
})

describe('deleting members leaves no group of one', () => {
  const settled = (before: Project, after: Project): Project => {
    const r = settle(before, after)
    if (!('project' in r)) throw new Error(r.refused)
    return r.project
  }

  it('each kind: the last partner goes and the group goes with it', () => {
    const { p, refs } = world()
    const q = actions.groupRefs(p, OPTION, [refs.mass, refs.lot, refs.note, refs.line])!.project
    // a note, a reference line, a lot: the group of the others stays while two are left
    const a = settled(q, actions.removeNote(q, refs.note.id))
    expect(groupIdsIn(a)).toEqual(['g1'])
    const b = settled(a, actions.removeReferenceLine(a, refs.line.id))
    expect(groupIdsIn(b)).toEqual(['g1'])
    const c = settled(b, actions.removeLots(b, OPTION, [refs.lot.id]))
    // the mass is left alone: no group of one
    expect(groupIdsIn(c)).toEqual([])
    expect(c.masses.find((m) => m.id === 'm1')!.group).toBeUndefined()
  })

  it('a street, a gate and a dimension count too', () => {
    const { p, refs } = world()
    const q = actions.groupRefs(p, OPTION, [refs.street, refs.gate, refs.dimension])!.project
    const a = settled(q, actions.removeDimension(q, refs.dimension.id))
    expect(groupIdsIn(a)).toEqual(['g1'])
    const b = settled(a, actions.removeGate(a, OPTION, refs.gate.id))
    expect(groupIdsIn(b)).toEqual([])
    expect(segmentsOf(b).every((s) => s.group === undefined)).toBe(true)
  })

  it('a locked thing may lose its group when its partners go, and may not gain or change one', () => {
    const { p, refs } = world()
    const q = actions.lockLots(actions.groupRefs(p, OPTION, [refs.lot, refs.note])!.project, [refs.lot.id], true)
    const a = settled(q, actions.removeNote(q, refs.note.id))
    expect(a.options[0].lots![0]).toMatchObject({ locked: true })
    expect(a.options[0].lots![0].group).toBeUndefined()
    // a group put on a locked lot by an edit is refused, as a change to it is
    const lockedLot = actions.lockLots(p, [refs.lot.id], true)
    expect(settle(lockedLot, withGroupOn(lockedLot, OPTION, [refs.lot, refs.note], 'g1'))).toMatchObject({ refused: expect.stringContaining('locked') })
    // and one it has cannot be changed to another
    expect(settle(q, withGroupOn(q, OPTION, [refs.lot, refs.note], 'g9'))).toMatchObject({ refused: expect.stringContaining('locked') })
  })
})

const pickedOf = (p: Partial<Picked>): Picked => ({ ...NOTHING_PICKED, ...p })

describe('the copies of a group are a group of their own, across kinds', () => {
  /** A group of a mass, a street, a lot, a gate, a dimension, a reference line and a note, and what is picked of it. */
  function grouped() {
    const w = world()
    const q = actions.groupRefs(w.p, OPTION, w.all)!.project
    const picked = pickedOf({ masses: ['m1'], nodes: w.road.nodes, lots: [w.refs.lot.id], gates: [w.refs.gate.id], dimensions: [w.refs.dimension.id], lines: [w.refs.line.id], notes: [w.refs.note.id] })
    return { ...w, q, picked }
  }

  /** The kinds of the things in a group, in the project. */
  const kindsIn = (p: Project, group: string) => [...new Set(membersOfGroup(p, OPTION, group).map((m) => m.kind))]
  /** Far from the originals: a copy that crosses a street splits it (its pieces stay in its group, so they would count more than one street). */
  const FAR = { x: 0, y: -400 }

  it('Copy: the copies share one new group; the originals keep theirs', () => {
    const { q, picked } = grouped()
    const { project, skipped } = actions.copyPicked(q, OPTION, picked, FAR)
    void skipped
    expect(groupIdsIn(project).sort()).toEqual(['g1', 'g2'])
    expect(kindsIn(project, 'g1')).toEqual(['mass', 'street', 'lot', 'gate', 'dimension', 'reference-line', 'note'])
    expect(kindsIn(project, 'g2')).toEqual(['mass', 'street', 'lot', 'gate', 'dimension', 'reference-line', 'note'])
    // the originals are where they were, in their group
    expect(project.masses.find((m) => m.id === 'm1')!.group).toBe('g1')
  })

  it('a member copied alone is in no group; two or more are', () => {
    const { q, picked, refs } = grouped()
    const alone = actions.copyPicked(q, OPTION, pickedOf({ notes: picked.notes }), FAR).project
    expect(groupIdsIn(alone)).toEqual(['g1'])
    expect(alone.notes!.find((n) => n.group === undefined)).toBeDefined()
    const two = actions.copyPicked(q, OPTION, pickedOf({ notes: picked.notes, lines: picked.lines }), FAR).project
    expect(groupIdsIn(two).sort()).toEqual(['g1', 'g2'])
    expect(kindsIn(two, 'g2')).toEqual(['reference-line', 'note'])
    void refs
  })

  it('Array: each copy of the group is a group of its own, and none joins the original’s', () => {
    const { q, picked } = grouped()
    const { project } = actions.arrayPicked(q, OPTION, picked, { x: 0, y: -400 }, 3)
    expect(groupIdsIn(project).sort()).toEqual(['g1', 'g2', 'g3'])
    for (const g of ['g1', 'g2', 'g3']) expect(kindsIn(project, g)).toHaveLength(7)
  })

  it('Mirror keeping the originals: the mirror image of a group is a group of its own', () => {
    const { q, picked } = grouped()
    const { project } = actions.mirrorPicked(q, OPTION, pickedOf({ ...picked, gates: [] }), { x: 0, y: 300 }, { x: 100, y: 300 }, true)
    expect(groupIdsIn(project).sort()).toEqual(['g1', 'g2'])
    expect(kindsIn(project, 'g2')).toEqual(['mass', 'street', 'lot', 'dimension', 'reference-line', 'note'])
    // not kept: the same group, reflected
    const moved = actions.mirrorPicked(q, OPTION, pickedOf({ ...picked, gates: [] }), { x: 0, y: 300 }, { x: 100, y: 300 }, false).project
    expect(groupIdsIn(moved)).toEqual(['g1'])
  })

  it('a building copied takes the copies of its masses’ groups, with a group id free in every kind', () => {
    const { p, refs } = world()
    const mass = p.masses.find((m) => m.id === 'm1')!
    const building = p.buildings.find((b) => b.levels.some((l) => l.id === mass.levelId))!
    const sibling = p.masses.find((m) => m.id !== 'm1' && building.levels.some((l) => l.id === m.levelId))
    expect(sibling).toBeDefined()
    // the masses of the building and a note on its level are one group; a street's segment keeps g2 (a group id the masses do not use)
    let q = actions.groupRefs(p, OPTION, [refs.mass, { kind: 'mass', id: sibling!.id }, refs.note])!.project
    q = { ...q, options: q.options.map((o) => (o.id === OPTION ? { ...o, streets: { ...o.streets!, segments: o.streets!.segments.map((s, i) => (i === 0 ? { ...s, group: 'g2' } : s)) } } : o)) }
    const copy = actions.copyBuilding(q, building.id, OPTION)!
    const fresh = groupIdsIn(copy.project).filter((g) => g !== 'g1' && g !== 'g2')
    expect(fresh).toHaveLength(1)
    // the copy's masses and its note are in it
    expect(copy.project.notes!.filter((n) => n.group === fresh[0])).toHaveLength(1)
  })
})

describe('Align moves a group of several kinds as one unit', () => {
  it('one extent, one move: the lot and the line go with the mass by the same vector', () => {
    const { p, refs, road } = world()
    const q = actions.groupRefs(p, OPTION, [refs.mass, refs.lot, refs.line, refs.street])!.project
    const picked = pickedOf({ masses: ['m1'], lots: [refs.lot.id], lines: [refs.line.id], nodes: road.nodes })
    // the line y = 400 (above everything): edges: the unit's top edge goes onto it
    const { project, skipped } = actions.alignPicked(q, OPTION, picked, { x: 0, y: 400 }, { x: 100, y: 400 }, 'edges')
    const dy = (a: number, b: number) => b - a
    const m0 = q.masses.find((m) => m.id === 'm1')!
    const m1 = project.masses.find((m) => m.id === 'm1')!
    const lot0 = q.options[0].lots![0].rect!
    const lot1 = project.options[0].lots![0].rect!
    const by = dy(m0.footprint.kind === 'rect' ? m0.footprint.center.y : 0, m1.footprint.kind === 'rect' ? m1.footprint.center.y : 0)
    expect(by).toBeGreaterThan(0)
    expect(dy(lot0.center.y, lot1.center.y)).toBeCloseTo(by, 6)
    expect(dy(q.referenceLines![0].points[0].y, project.referenceLines![0].points[0].y)).toBeCloseTo(by, 6)
    // the street's nodes go with the group (it is not skipped: it is in it)
    const node0 = q.options[0].streets!.nodes.find((n) => n.id === road.nodes![0])!
    const node1 = project.options[0].streets!.nodes.find((n) => n.id === road.nodes![0])!
    expect(dy(node0.y, node1.y)).toBeCloseTo(by, 6)
    expect(skipped.some((s) => s.startsWith('Streets are not aligned'))).toBe(false)
    // the topmost point of the whole group is on the line (one extent), not each member's own
    const tops = [m1.footprint.kind === 'rect' ? m1.footprint.center.y + m1.footprint.depth / 2 : 0, lot1.center.y + lot1.depth / 2, project.referenceLines![0].points[0].y]
    expect(Math.max(...tops)).toBeCloseTo(400, 6)
  })

  it('things in no group are aligned each on its own, and a street in none is skipped, said', () => {
    const { p, refs, road } = world()
    const picked = pickedOf({ masses: ['m1'], lots: [refs.lot.id], nodes: road.nodes })
    const { project, skipped } = actions.alignPicked(p, OPTION, picked, { x: 0, y: 400 }, { x: 100, y: 400 }, 'edges')
    const m1 = project.masses.find((m) => m.id === 'm1')!
    const lot1 = project.options[0].lots![0].rect!
    expect(m1.footprint.kind === 'rect' && m1.footprint.center.y + m1.footprint.depth / 2).toBeCloseTo(400, 6)
    expect(lot1.center.y + lot1.depth / 2).toBeCloseTo(400, 6)
    expect(skipped).toContain('Streets are not aligned: move their nodes')
  })
})

describe('a new group’s id is free among every kind’s (Phase AS.5 review)', () => {
  it('Group on masses does not take the id of a group of a lot and a note', () => {
    const { p, refs } = world()
    const first = actions.groupRefs(p, OPTION, [refs.lot, refs.note])!
    expect(first.id).toBe('g1')
    const masses = actions.groupMasses(first.project, ['m1', 'm2'])!
    expect(masses.id).toBe('g2')
    // the lot and the note are still the pair they were: the masses did not join them
    expect(membersOfGroup(masses.project, OPTION, 'g1').map((m) => m.kind)).toEqual(['lot', 'note'])
    expect(membersOfGroup(masses.project, OPTION, 'g2').map((m) => m.kind)).toEqual(['mass', 'mass'])
  })

  it('the copies of a two-mass group take a free id, not the lot and note group’s', () => {
    const { p, refs } = world()
    const first = actions.groupRefs(p, OPTION, [refs.lot, refs.note])!
    const masses = actions.groupMasses(first.project, ['m1', 'm2'])!
    // g1 is the lot's and the note's, g2 the masses': the copies' is the first free, g3
    const sources = masses.project.masses.filter((m) => m.group === 'g2')
    const copied = actions.copyMasses(masses.project, sources, { x: 10, y: 10 })
    const copies = copied.project.masses.filter((m) => copied.ids.includes(m.id))
    expect(copies.map((m) => m.group)).toEqual(['g3', 'g3'])
    expect(membersOfGroup(copied.project, OPTION, 'g1').map((m) => m.kind)).toEqual(['lot', 'note'])
  })

  it('the copies of a group copied through Copy are a group of their own too', () => {
    const { p, refs } = world()
    const first = actions.groupRefs(p, OPTION, [refs.lot, refs.note])!
    const masses = actions.groupMasses(first.project, ['m1', 'm2'])!
    const r = actions.copyPicked(masses.project, OPTION, pickedOf({ masses: ['m1', 'm2'] }), { x: 10, y: 10 })
    const copies = r.project.masses.filter((m) => !masses.project.masses.some((x) => x.id === m.id))
    expect(copies.map((m) => m.group)).toEqual(['g3', 'g3'])
  })
})
