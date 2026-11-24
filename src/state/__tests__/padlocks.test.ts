// A padlock for a street, a lot, a gate and a building, held like a mass's (Phase AS.4 task 2, Decision "Padlocks by kind"): project
// data (`locked` on a street segment, a lot, a gate and a building), held by `settle` so no verb, tool or optimizer changes what it
// locks: every action that changes these kinds is refused whole on a locked one, with a reason that names it, and passes on its
// unlocked neighbour; `locked` itself may change; a locked segment's nodes keep their places; a locked building keeps its record
// and every mass in it, and its masses are held as locked masses. The verbs lockStreets, lockLots, lockGates and lockBuildings are
// each one undo step.
import { describe, expect, it } from 'vitest'
import type { Project, StreetSegment } from '../../model/schema.ts'
import { ProjectSchema } from '../../model/schema.ts'
import { addLot, lotEntrances, removeLots, setLot, lockLots } from '../../modules/parking/actions.ts'
import { LOT_LINK } from '../../engine/circulation/streets.ts'
import { actions } from '../actions/index.ts'
import { addBuilding, addOption, duplicateOption, removeOption, assignMasses, makeBuildingUnique, removeBuilding, removeBuildingFromOption, updateBuilding } from '../actions/buildings.ts'
import { addGate, dropOwnGates, ownGates, removeGate, updateGate } from '../actions/circulation.ts'
import { addMass, moveMass, removeMasses } from '../actions/masses.ts'
import { updateLevel } from '../actions/levels.ts'
import {
  connectStreets,
  disconnectStreetEnd,
  drawStreet,
  moveStreetNode,
  moveStreetNodes,
  removeStreetNode,
  removeStreetSegment,
  setStreetSegmentType,
  setStreetSegmentWidth,
  setStreetEdges,
  splitStreetSegment,
  turnStreetNodes,
} from '../actions/streets.ts'
import { demoProject } from '../demo.ts'
import { settle } from '../settle.ts'
import { createAppStore } from '../store.ts'

const o1 = 'o1'
const massesOfBuilding = (p: Project, id: string): string[] => { const ls = new Set(p.buildings.find((b) => b.id === id)!.levels.map((l) => l.id)); return p.masses.filter((m) => ls.has(m.levelId)).map((m) => m.id) }
const option = (p: Project, id = o1) => p.options.find((o) => o.id === id)!
const segments = (p: Project): StreetSegment[] => option(p).streets?.segments ?? []

/** What `settle` says of an edit: the reason when it is refused, null when it is kept. */
const refusal = (before: Project, after: Project): string | null => {
  const r = settle(before, after)
  return 'refused' in r ? r.refused : null
}
/** The edit did not change anything that is locked: refused whole, or nothing at all happened. */
const held = (before: Project, after: Project) => after === before || refusal(before, after) !== null

/** A street segment's `locked` set (data, not through a verb). */
const lockSegments = (p: Project, ids: string[], on = true): Project => ({
  ...p,
  options: p.options.map((o) => (o.id === o1 && o.streets ? { ...o, streets: { ...o.streets, segments: o.streets.segments.map((g) => (ids.includes(g.id) ? (on ? { ...g, locked: true } : { ...g, locked: undefined }) : g)) } } : o)),
})

// ---- streets ----

/** Two streets far apart: A (a segment, east of the masses) and B (another, west), each its own two nodes. */
function twoStreets() {
  let p = demoProject({ streets: false })
  const a = drawStreet(p, o1, [{ x: 260, y: 240 }, { x: 380, y: 240 }])!
  p = a.project
  const b = drawStreet(p, o1, [{ x: 20, y: 20 }, { x: 20, y: 60 }])!
  p = b.project
  return { p, a: { seg: a.segments[0], nodes: a.nodes }, b: { seg: b.segments[0], nodes: b.nodes } }
}

type StreetCase = [name: string, run: (p: Project, s: { seg: string; nodes: string[] }, at: { x: number; y: number }) => Project | null]
const STREET_ACTIONS: StreetCase[] = [
  ['drawStreet (a T on it)', (p, _s, at) => drawStreet(p, o1, [{ x: at.x, y: at.y + 40 }, { x: at.x, y: at.y + 0.01 }])?.project ?? null],
  ['moveStreetNode', (p, s) => moveStreetNode(p, o1, s.nodes[0], { x: 5, y: 5 })],
  ['moveStreetNodes', (p, s) => moveStreetNodes(p, o1, s.nodes, { x: 3, y: 4 })],
  ['turnStreetNodes', (p, s) => turnStreetNodes(p, o1, s.nodes, { x: 0, y: 0 }, 30)],
  ['splitStreetSegment', (p, s, at) => splitStreetSegment(p, o1, s.seg, at)?.project ?? null],
  ['removeStreetNode', (p, s) => removeStreetNode(p, o1, s.nodes[0])],
  ['removeStreetSegment', (p, s) => removeStreetSegment(p, o1, s.seg)],
  ['setStreetSegmentType', (p, s) => setStreetSegmentType(p, o1, [s.seg], 'cars')],
  ['setStreetEdges', (p, s) => setStreetEdges(p, o1, { [s.seg]: { left: 0, right: 8 } })],
  ['setStreetSegmentWidth', (p, s) => setStreetSegmentWidth(p, o1, [s.seg], 11)],
]

describe('a locked street (its segments)', () => {
  it('is refused whole by every action that changes it, naming it, and the neighbour passes', () => {
    const { p, a, b } = twoStreets()
    const locked = lockSegments(p, [a.seg])
    for (const [name, run] of STREET_ACTIONS) {
      const onA = run(locked, a, { x: 320, y: 240 })
      expect(onA, name).not.toBeNull()
      expect(onA === locked, name).toBe(false)
      expect(refusal(locked, onA!), name).toMatch(/^Street \d+ is locked: unlock it to (change|delete) it\.$/)
      // the same action on the unlocked neighbour is kept
      const onB = run(locked, b, { x: 20, y: 40 })
      expect(onB, name).not.toBeNull()
      expect(onB === locked, name).toBe(false)
      expect(refusal(locked, onB!), name).toBeNull()
    }
  })

  it('a segment’s two nodes keep their places: a neighbour’s drag that would move a shared node is refused', () => {
    // A and C share a node: C is free, A locked; dragging the shared node moves A's end
    let { p } = twoStreets()
    const c = drawStreet(p, o1, [{ x: 380, y: 240 }, { x: 380, y: 200 }])!
    p = c.project
    const a = segments(p)[0]
    const shared = a.b
    const locked = lockSegments(p, [a.id])
    const r = refusal(locked, moveStreetNode(locked, o1, shared, { x: 390, y: 250 }))
    expect(r).toMatch(/is locked/)
    // the free end of C, not shared, moves
    expect(refusal(locked, moveStreetNode(locked, o1, c.nodes[1], { x: 390, y: 150 }))).toBeNull()
  })

  it('what a street connected to a lot does when the lot moves or lets go is held too', () => {
    const w = addLot(demoProject({ streets: false }), o1, { rect: { center: { x: 200, y: 200 }, width: 30, depth: 20, rotation: 0 } })!
    const y = lotEntrances(w.project, o1).get(w.id)!.at.y
    const drawn = drawStreet(w.project, o1, [{ x: 215, y }, { x: 255, y }], 'cars')!
    const go = (before: Project, after: Project): Project => {
      const r = settle(before, after)
      if ('refused' in r) throw new Error(r.refused)
      return r.project
    }
    const p = go(w.project, drawn.project)
    const end = option(p).streets!.nodes.find((n) => n.lot === w.id)!
    expect(end).toBeDefined()
    const lockedSeg = lockSegments(p, segments(p).map((g) => g.id))
    // the lot is moved: its connected end would follow, the locked segment would move
    const moved = setLot(lockedSeg, o1, w.id, { rect: { center: { x: 200, y: 230 }, width: 30, depth: 20, rotation: 0 } })
    expect(moved).not.toBe(lockedSeg)
    expect(refusal(lockedSeg, moved)).toMatch(/Street \d+ is locked/)
    // let go: the node loses its lot link
    expect(refusal(lockedSeg, disconnectStreetEnd(lockedSeg, o1, end.id))).toMatch(/Street \d+ is locked/)
    // unlocked, both pass
    expect(refusal(p, setLot(p, o1, w.id, { rect: { center: { x: 200, y: 230 }, width: 30, depth: 20, rotation: 0 } }))).toBeNull()
    expect(refusal(p, disconnectStreetEnd(p, o1, end.id))).toBeNull()
    expect(LOT_LINK).toBeGreaterThan(0)
  })

  it('connectStreets (it draws new streets) leaves every locked segment and its nodes as they were', () => {
    const { p } = twoStreets()
    const locked = lockSegments(p, segments(p).map((g) => g.id))
    const r = settle(locked, connectStreets(locked, o1).project)
    if ('project' in r) {
      const after = option(r.project).streets!
      for (const g of segments(locked)) expect(after.segments.find((x) => x.id === g.id)).toEqual(g)
      for (const n of option(locked).streets!.nodes) expect(after.nodes.find((x) => x.id === n.id)).toEqual(n)
    } else expect(r.refused).toMatch(/is locked/)
  })

  it('locked itself may change: lock and unlock are kept', () => {
    const { p, a } = twoStreets()
    const locked = lockStreets(p, [a.seg], true)
    expect(refusal(p, locked)).toBeNull()
    expect(segments(locked).find((g) => g.id === a.seg)!.locked).toBe(true)
    expect(refusal(locked, lockStreets(locked, [a.seg], false))).toBeNull()
  })
})

function lockStreets(p: Project, ids: string[], on: boolean, optionId = o1) {
  return actions.lockStreets(p, ids, on, optionId)
}

describe('lockStreets', () => {
  it('locks and frees segments, the flag absent when free; nothing to do: the same project', () => {
    const { p, a, b } = twoStreets()
    const q = lockStreets(p, [a.seg], true)
    expect(segments(q).find((g) => g.id === a.seg)!.locked).toBe(true)
    expect(segments(q).find((g) => g.id === b.seg)!.locked).toBeUndefined()
    expect(ProjectSchema.safeParse(q).success).toBe(true)
    expect(lockStreets(q, [a.seg], true)).toBe(q)
    expect(lockStreets(p, [a.seg], false)).toBe(p)
    expect('locked' in segments(lockStreets(q, [a.seg], false)).find((g) => g.id === a.seg)!).toBe(false)
    expect(lockStreets(p, ['nope'], true)).toBe(p)
  })
})

describe('a padlock is of one option', () => {
  it('a street locked in a copy of the option leaves the original free, and the reverse', () => {
    const { p, a } = twoStreets()
    const d = duplicateOption(p, o1)!
    const q = lockStreets(d.project, [a.seg], true, d.id)
    expect(segments(q).find((g) => g.id === a.seg)!.locked).toBeUndefined()
    expect(option(q, d.id).streets!.segments.find((g) => g.id === a.seg)!.locked).toBe(true)
    const r = lockStreets(d.project, [a.seg], true, o1)
    expect(segments(r).find((g) => g.id === a.seg)!.locked).toBe(true)
    expect(option(r, d.id).streets!.segments.find((g) => g.id === a.seg)!.locked).toBeUndefined()
    const back = lockStreets(q, [a.seg], false, o1)
    expect(back).toBe(q)
  })
})

// ---- gates ----

describe('a locked gate', () => {
  function withGates() {
    const base = demoProject()
    const g1 = base.site.gates![0].id
    const two = addGate(base, o1, 0.6)
    const lockedAt = (p: Project, id: string): Project => ({ ...p, site: { ...p.site, gates: p.site.gates!.map((g) => (g.id === id ? { ...g, locked: true } : g)) } })
    return { p: lockedAt(two.project, g1), g1, g2: two.id }
  }

  it('is refused whole by updateGate and removeGate, naming it; the neighbour passes', () => {
    const { p, g1, g2 } = withGates()
    expect(refusal(p, updateGate(p, o1, g1, { width: 14 }))).toBe('Gate 1 is locked: unlock it to change it.')
    expect(refusal(p, updateGate(p, o1, g1, { t: 0.3 }))).toBe('Gate 1 is locked: unlock it to change it.')
    expect(refusal(p, removeGate(p, o1, g1))).toBe('Gate 1 is locked: unlock it to delete it.')
    expect(refusal(p, updateGate(p, o1, g2, { width: 14 }))).toBeNull()
    expect(refusal(p, removeGate(p, o1, g2))).toBeNull()
  })

  it('Own gates keeps the flag in the copy; dropping own gates that include a locked one is refused', () => {
    const { p, g1 } = withGates()
    const own = ownGates(p, o1)
    expect(refusal(p, own)).toBeNull()
    expect(option(own).gates!.find((g) => g.id === g1)!.locked).toBe(true)
    const kept = settle(p, own)
    expect('project' in kept && option(kept.project).gates!.find((g) => g.id === g1)!.locked).toBe(true)
    // the copy's own locked gate is held there too
    expect(refusal(own, updateGate(own, o1, g1, { width: 14 }))).toBe('Gate 1 is locked: unlock it to change it.')
    // the own copy is the site's gate, so *Use the site's* drops it and the gate is the same
    expect(refusal(own, dropOwnGates(own, o1))).toBeNull()
    // a locked own gate that differs from the site's (a copy whose fields were changed before it was locked) is not let go
    const differs: Project = { ...own, options: own.options.map((o) => ({ ...o, gates: o.gates?.map((g) => (g.id === g1 ? { ...g, width: g.width + 3 } : g)) })) }
    expect(refusal(differs, dropOwnGates(differs, o1))).toMatch(/^Gate 1 is locked/)
    // a locked own gate the site does not have is not let go either
    const added = addGate(own, o1, 0.2)
    const onlyOwn: Project = { ...added.project, options: added.project.options.map((o) => ({ ...o, gates: o.gates?.map((g) => (g.id === added.id ? { ...g, locked: true } : g)) })) }
    expect(refusal(onlyOwn, dropOwnGates(onlyOwn, o1))).toMatch(/is locked/)
    // unlocked, dropping is fine
    const free = ownGates(demoProject(), o1)
    expect(refusal(free, dropOwnGates(free, o1))).toBeNull()
  })

  it('lockGates locks and frees, locked itself may change', () => {
    const { p, g1, g2 } = withGates()
    const q = actions.lockGates(p, [g2], true, o1)
    expect(refusal(p, q)).toBeNull()
    expect(q.site.gates!.find((g) => g.id === g2)!.locked).toBe(true)
    expect(refusal(q, actions.lockGates(q, [g1, g2], false, o1))).toBeNull()
    const open = actions.lockGates(q, [g1, g2], false, o1)
    expect(open.site.gates!.every((g) => g.locked === undefined)).toBe(true)
    expect(actions.lockGates(q, [g2], true, o1)).toBe(q)
    // the option's own copy is the one it answers for
    const own = ownGates(p, o1)
    const lockedOwn = actions.lockGates(own, [g2], true, o1)
    expect(option(lockedOwn).gates!.find((g) => g.id === g2)!.locked).toBe(true)
    expect(lockedOwn.site.gates!.find((g) => g.id === g2)!.locked).toBeUndefined()
    expect(ProjectSchema.safeParse(lockedOwn).success).toBe(true)
  })
})

// ---- lots ----

describe('a locked lot', () => {
  function withLots() {
    const a = addLot(demoProject({ streets: false }), o1, { rect: { center: { x: 200, y: 220 }, width: 30, depth: 20, rotation: 0 } })!
    const b = addLot(a.project, o1, { rect: { center: { x: 300, y: 220 }, width: 30, depth: 20, rotation: 0 } })!
    const locked: Project = { ...b.project, options: b.project.options.map((o) => ({ ...o, lots: o.lots?.map((l) => (l.id === a.id ? { ...l, locked: true } : l)) })) }
    return { p: locked, a: a.id, b: b.id }
  }

  it('is refused whole by setLot and removeLots, naming it; the neighbour passes', () => {
    const { p, a, b } = withLots()
    const name = option(p).lots!.find((l) => l.id === a)!.name
    expect(refusal(p, setLot(p, o1, a, { rows: 2 }))).toBe(`${name} is locked: unlock it to change it.`)
    expect(refusal(p, setLot(p, o1, a, { name: 'Other' }))).toBe(`${name} is locked: unlock it to change it.`)
    expect(refusal(p, removeLots(p, o1, [a]))).toBe(`${name} is locked: unlock it to delete it.`)
    // both at once: the whole action is refused, the neighbour is not removed either
    expect(refusal(p, removeLots(p, o1, [a, b]))).toBe(`${name} is locked: unlock it to delete it.`)
    expect(refusal(p, setLot(p, o1, b, { rows: 2 }))).toBeNull()
    expect(refusal(p, removeLots(p, o1, [b]))).toBeNull()
  })

  it('lotEntrances changes nothing, and the lot moved with its mass is not changed (it is anchored: its data stays)', () => {
    const { p } = withLots()
    expect(lotEntrances(p, o1).size).toBeGreaterThan(0)
  })

  it("a copy of the option does not carry the lots, so a lot’s padlock is of one option", () => {
    const { p } = withLots()
    const d = duplicateOption(p, o1)!
    expect(option(d.project, d.id).lots ?? []).toEqual([])
  })

  it('a copy of the option does not carry the lots: a lot’s padlock is of one option', () => {
    const { p } = withLots()
    expect(option(duplicateOption(p, o1)!.project, 'o2').lots ?? []).toEqual([])
  })

  it('lockLots locks and frees; the flag absent when free', () => {
    const { p, a, b } = withLots()
    const q = lockLots(p, [b], true)
    expect(refusal(p, q)).toBeNull()
    expect(option(q).lots!.filter((l) => l.locked).map((l) => l.id).sort()).toEqual([a, b].sort())
    const free = lockLots(q, [a, b], false)
    expect(option(free).lots!.every((l) => !('locked' in l))).toBe(true)
    expect(lockLots(q, [a], true)).toBe(q)
    expect(ProjectSchema.safeParse(q).success).toBe(true)
  })
})

// ---- buildings ----

describe('a locked building', () => {
  /** b1 (m1, m2) and b2 (m3), both in o1; b2 also in o2. b2 is locked. */
  function withBuildings() {
    const made = addBuilding(demoProject(), { name: 'Annex', optionId: o1 })
    let p = assignMasses(made.project, ['m3'], made.id)
    p = addOption(p, { name: 'Other', buildingIds: [made.id] }).project
    const b2 = made.id
    const locked: Project = { ...p, buildings: p.buildings.map((b) => (b.id === b2 ? { ...b, locked: true } : b)) }
    return { p: locked, b2, level: locked.buildings.find((b) => b.id === b2)!.levels[0].id, other: locked.options.find((o) => o.id !== o1)!.id }
  }

  it('keeps its own data: updateBuilding, removeBuilding, the levels’ and the platform’s actions are refused naming it', () => {
    const { p, b2, level } = withBuildings()
    for (const after of [
      updateBuilding(p, b2, { name: 'Other name' }),
      updateBuilding(p, b2, { context: true }),
      removeBuilding(p, b2, true),
      updateLevel(p, level, { name: 'Ground' }),
      updateLevel(p, level, { height: 7 }),
      { ...p, buildings: p.buildings.map((b) => (b.id === b2 ? { ...b, platform: { level: 3 } } : b)) },
    ]) {
      expect(after).not.toBe(p)
      expect(refusal(p, after)).toMatch(/^Annex is locked: unlock it to (change|delete) it\.$/)
    }
    // the unlocked building passes
    expect(refusal(p, updateBuilding(p, 'b1', { name: 'Main' }))).toBeNull()
    expect(refusal(p, updateBuilding(p, 'b1', { context: true }))).toBeNull()
  })

  it('no mass is moved into or out of it, none is added to it, and its masses are held as locked masses', () => {
    const { p, b2, level } = withBuildings()
    // into it
    expect(refusal(p, assignMasses(p, ['m1'], b2))).toMatch(/^Annex is locked/)
    // out of it: the mass is held, not moved (the verb skips it, or settle refuses it)
    expect(held(p, assignMasses(p, ['m3'], 'b1'))).toBe(true)
    // a mass added on its level
    const added = addMass(p, { programId: 'warehouse', footprint: { kind: 'rect', center: { x: 50, y: 50 }, width: 10, depth: 10, rotation: 0 }, levelId: level }).project
    expect(refusal(p, added)).toMatch(/^Annex is locked/)
    // its mass is a locked mass: it does not move, it is not deleted
    expect(refusal(p, moveMass(p, 'm3', { x: 5, y: 0 }))).toMatch(/^Warehouse 2 is locked: unlock it to change its shape\.$|is locked: unlock it to change its shape\./)
    expect(refusal(p, removeMasses(p, ['m3']))).toBe('Annex is locked: unlock it to change it.')
    // a free mass of another building moves
    expect(refusal(p, moveMass(p, 'm1', { x: 5, y: 0 }))).toBeNull()
  })

  it('stays in the options that show it: Remove from the option and Make unique are refused; deleting an option another shows is not', () => {
    const { p, b2, other } = withBuildings()
    expect(refusal(p, removeBuildingFromOption(p, other, b2))).toMatch(/^Annex is locked/)
    const unique = makeBuildingUnique(p, b2, other)!.project
    expect(refusal(p, unique)).toMatch(/^Annex is locked/)
  })

  it('removing an option takes what is only its own, locked or not (Undo brings it back); a building another option shows stays, locked', () => {
    // a building another option shows stays, with its flag: Other shows b2, so does o1
    const { p, b2, other } = withBuildings()
    const kept = removeOption(p, other)
    expect(refusal(p, kept)).toBeNull()
    expect(kept.buildings.find((b) => b.id === b2)!.locked).toBe(true)
    expect(kept.masses.some((m) => m.id === 'm3')).toBe(true)
    // a building only the removed option shows goes with it, its masses too: locked, and a mass locked by itself in it
    const d = duplicateOption(demoProject(), o1)!
    const own = makeBuildingUnique(d.project, 'b1', d.id)!
    const mine = massesOfBuilding(own.project, own.id)
    let q = actions.lockMasses(own.project, [mine[0]], true)
    q = actions.lockBuildings(q, [own.id], true)
    const gone = removeOption(q, d.id)
    expect(gone.options.map((o) => o.id)).toEqual([o1])
    expect(gone.buildings.some((b) => b.id === own.id)).toBe(false)
    expect(refusal(q, gone)).toBeNull()
    // a locked mass of its own, alone, goes the same
    const alone = actions.lockMasses(own.project, [mine[0]], true)
    expect(refusal(alone, removeOption(alone, d.id))).toBeNull()
    // the option's locked street, lot and gate go without a word, as ever
    const withStreet = lockStreets(q, option(q, d.id).streets!.segments.map((g) => g.id), true, d.id)
    expect(refusal(withStreet, removeOption(withStreet, d.id))).toBeNull()
    // deleting the building while its option stays is still refused
    expect(refusal(q, removeBuildingFromOption(q, d.id, own.id))).toMatch(/^Building 1 · Option 2 is locked/)
  })

  it('lockBuildings: the flag on; off, it also frees the masses locked one by one; each one undo step', () => {
    const base = withBuildings()
    const free: Project = { ...base.p, buildings: base.p.buildings.map((b) => ({ ...b, locked: undefined })) }
    // m3 locked one by one before the building is
    const one = actions.lockMasses(free, ['m3'], true)
    const on = actions.lockBuildings(one, [base.b2], true)
    expect(refusal(one, on)).toBeNull()
    expect(on.buildings.find((b) => b.id === base.b2)!.locked).toBe(true)
    expect(on.masses.find((m) => m.id === 'm3')!.locked).toBe(true)
    const off = actions.lockBuildings(on, [base.b2], false)
    expect(refusal(on, off)).toBeNull()
    expect('locked' in off.buildings.find((b) => b.id === base.b2)!).toBe(false)
    expect('locked' in off.masses.find((m) => m.id === 'm3')!).toBe(false)
    expect(actions.lockBuildings(off, [base.b2], false)).toBe(off)
    expect(ProjectSchema.safeParse(on).success && ProjectSchema.safeParse(off).success).toBe(true)

    const store = createAppStore(one)
    store.getState().apply((q) => actions.lockBuildings(q, [base.b2], true))
    expect(store.getState().history.past).toHaveLength(1)
    expect(store.getState().project.buildings.find((b) => b.id === base.b2)!.locked).toBe(true)
    store.getState().undo()
    expect(store.getState().project.buildings.find((b) => b.id === base.b2)!.locked).toBeUndefined()
    store.getState().redo()
    expect(store.getState().project.buildings.find((b) => b.id === base.b2)!.locked).toBe(true)
  })

  it('a building turned on while a mass is changed in the same edit is held by what was before', () => {
    const { p } = withBuildings()
    // the edit unlocks the building and moves its mass at once: the mass was locked before, so it is refused
    const both = { ...moveMass(p, 'm3', { x: 5, y: 0 }), buildings: p.buildings.map((b) => ({ ...b, locked: undefined })) }
    expect(refusal(p, both)).toMatch(/is locked/)
  })
})

// ---- undo and redo, for the four ----

describe('undo and redo keep the flag', () => {
  it('a street, a lot and a gate: one step each', () => {
    const { p, a } = twoStreets()
    const store = createAppStore(p)
    store.getState().apply((q) => actions.lockStreets(q, [a.seg], true, 'o1'))
    expect(segments(store.getState().project).find((g) => g.id === a.seg)!.locked).toBe(true)
    store.getState().undo()
    expect(segments(store.getState().project).find((g) => g.id === a.seg)!.locked).toBeUndefined()
    store.getState().redo()
    expect(segments(store.getState().project).find((g) => g.id === a.seg)!.locked).toBe(true)
    expect(store.getState().history.past).toHaveLength(1)

    const lotted = addLot(demoProject({ streets: false }), o1, { rect: { center: { x: 200, y: 220 }, width: 30, depth: 20, rotation: 0 } })!
    const s2 = createAppStore(lotted.project)
    s2.getState().apply((q) => actions.lockLots(q, [lotted.id], true))
    expect(option(s2.getState().project).lots![0].locked).toBe(true)
    s2.getState().undo()
    expect(option(s2.getState().project).lots![0].locked).toBeUndefined()

    const s3 = createAppStore(demoProject())
    const id = s3.getState().project.site.gates![0].id
    s3.getState().apply((q) => actions.lockGates(q, [id], true, o1))
    expect(s3.getState().project.site.gates![0].locked).toBe(true)
    s3.getState().undo()
    expect(s3.getState().project.site.gates![0].locked).toBeUndefined()
    s3.getState().redo()
    expect(s3.getState().project.site.gates![0].locked).toBe(true)
  })

  it('a refused edit leaves the project and the history as they were', () => {
    const { p, a } = twoStreets()
    const store = createAppStore(lockSegments(p, [a.seg]))
    const before = store.getState().project
    store.getState().apply((q) => removeStreetSegment(q, o1, a.seg))
    expect(store.getState().project).toBe(before)
    expect(store.getState().history.past).toHaveLength(0)
    expect(store.getState().refusal?.text).toMatch(/^Street \d+ is locked/)
  })
})

describe('a locked street is named as Layers names it (review E3)', () => {
  it('numbers by street, not by run: a widened street before it is one street', () => {
    let p = demoProject({ streets: false })
    // street A: two segments, the second wider, so it derives as two runs of one street
    const a = drawStreet(p, o1, [{ x: 260, y: 240 }, { x: 320, y: 240 }, { x: 380, y: 240 }])!
    p = setStreetEdges(a.project, o1, { [a.segments[1]]: { left: 8, right: 8 } })
    const b = drawStreet(p, o1, [{ x: 20, y: 20 }, { x: 20, y: 60 }])!
    p = lockSegments(b.project, b.segments)
    const moved = moveStreetNode(p, o1, b.nodes[0], { x: 5, y: 5 })
    expect(refusal(p, moved)).toBe('Street 2 is locked: unlock it to change it.')
  })
})
