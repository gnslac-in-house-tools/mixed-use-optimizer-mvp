// What "locked" means for a `Ref` in a project (Phase AS.4 task 2, Decision "Padlocks by kind"): a mass is locked by its own flag or by
// its building's; a building by its own flag (not the sum of its masses); a street by its segments (all: locked, some: mixed); a lot
// and a gate by their flag. Pure: a project in, an answer out.
import { describe, expect, it } from 'vitest'
import { streetRoads, streetTypesOf } from '../../engine/circulation/streets.ts'
import type { Project } from '../../model/schema.ts'
import { demoProject } from '../../state/demo.ts'
import { addBuilding, assignMasses } from '../../state/actions/buildings.ts'
import { addLot } from '../../modules/parking/actions.ts'
import { drawStreet } from '../../state/actions/streets.ts'
import { isLocked, lockedAmong, massLocked, roadSegments, segmentLocked, streetLockState } from '../locked.ts'

const o1 = 'o1'
const option = (p: Project) => p.options.find((o) => o.id === o1)!

/** The demo with a street of its own, two segments long, away from the rest. */
function withStreet() {
  const r = drawStreet(demoProject({ streets: false }), o1, [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 40 }])!
  return { p: r.project, segments: r.segments }
}

describe('massLocked', () => {
  it('is the mass’s own flag, or its building’s', () => {
    const p = demoProject()
    expect(massLocked(p, o1, 'm1')).toBe(false)
    const own: Project = { ...p, masses: p.masses.map((m) => (m.id === 'm1' ? { ...m, locked: true } : m)) }
    expect(massLocked(own, o1, 'm1')).toBe(true)
    expect(massLocked(own, o1, 'm2')).toBe(false)
    const building: Project = { ...p, buildings: p.buildings.map((b) => ({ ...b, locked: true })) }
    expect(p.buildings).toHaveLength(1)
    for (const m of p.masses) expect(massLocked(building, o1, m.id), m.id).toBe(true)
  })

  it('only the masses of the locked building, not those of another', () => {
    const base = addBuilding(demoProject(), { optionId: o1 })
    const p = assignMasses(base.project, ['m3'], base.id)
    const locked: Project = { ...p, buildings: p.buildings.map((b) => (b.id === base.id ? { ...b, locked: true } : b)) }
    expect(massLocked(locked, o1, 'm3')).toBe(true)
    expect(massLocked(locked, o1, 'm1')).toBe(false)
  })

  it('a mass that is not in the project is not locked', () => {
    expect(massLocked(demoProject(), o1, 'nope')).toBe(false)
  })
})

describe('isLocked', () => {
  it('a building by its own flag, not by the sum of its masses', () => {
    const p = demoProject()
    const allMasses: Project = { ...p, masses: p.masses.map((m) => ({ ...m, locked: true })) }
    expect(isLocked(allMasses, { kind: 'building', id: 'b1' })).toBe(false)
    const flag: Project = { ...p, buildings: p.buildings.map((b) => ({ ...b, locked: true })) }
    expect(isLocked(flag, { kind: 'building', id: 'b1' })).toBe(true)
  })

  it('a mass, and a level by the sum of its masses', () => {
    const p = demoProject()
    const one: Project = { ...p, masses: p.masses.map((m) => (m.id === 'm1' ? { ...m, locked: true } : m)) }
    expect(isLocked(one, { kind: 'mass', id: 'm1' })).toBe(true)
    expect(isLocked(one, { kind: 'mass', id: 'm2' })).toBe(false)
    const level = p.buildings[0].levels[0].id
    expect(isLocked(one, { kind: 'level', id: level })).toBe(false)
    const all: Project = { ...p, masses: p.masses.map((m) => ({ ...m, locked: true })) }
    expect(isLocked(all, { kind: 'level', id: level })).toBe(true)
  })

  it('a gate: the option’s gate, its own copy or the site’s', () => {
    const p = demoProject()
    const id = p.site.gates![0].id
    expect(isLocked(p, { kind: 'gate', id }, o1)).toBe(false)
    const site: Project = { ...p, site: { ...p.site, gates: p.site.gates!.map((g) => ({ ...g, locked: true })) } }
    expect(isLocked(site, { kind: 'gate', id }, o1)).toBe(true)
    expect(isLocked(site, { kind: 'gate', id })).toBe(true)
    // the option owns a copy that is not locked: it answers for its own
    const own: Project = { ...site, options: site.options.map((o) => (o.id === o1 ? { ...o, gates: site.site.gates!.map((g) => ({ ...g, locked: false })) } : o)) }
    expect(isLocked(own, { kind: 'gate', id }, o1)).toBe(false)
  })

  it('a lot by its flag', () => {
    const r = addLot(demoProject({ streets: false }), o1, { rect: { center: { x: 200, y: 200 }, width: 30, depth: 20, rotation: 0 } })!
    expect(isLocked(r.project, { kind: 'lot', id: r.id })).toBe(false)
    const locked: Project = { ...r.project, options: r.project.options.map((o) => ({ ...o, lots: o.lots?.map((l) => ({ ...l, locked: true })) })) }
    expect(isLocked(locked, { kind: 'lot', id: r.id }, o1)).toBe(true)
  })

  it('a street (the derived road) is locked when all its segments are', () => {
    const { p, segments } = withStreet()
    const road = streetRoads(option(p).streets, streetTypesOf(p, option(p))).find((r) => r.segments?.includes(segments[0]))!
    expect(road.segments).toEqual(segments)
    const mark = (ids: string[]): Project => ({
      ...p,
      options: p.options.map((o) => (o.id === o1 ? { ...o, streets: { ...o.streets!, segments: o.streets!.segments.map((g) => (ids.includes(g.id) ? { ...g, locked: true } : g)) } } : o)),
    })
    expect(isLocked(p, { kind: 'street', id: road.id }, o1)).toBe(false)
    expect(isLocked(mark([segments[0]]), { kind: 'street', id: road.id }, o1)).toBe(false)
    expect(isLocked(mark(segments), { kind: 'street', id: road.id }, o1)).toBe(true)
    // without the option: the one that has it
    expect(isLocked(mark(segments), { kind: 'street', id: road.id })).toBe(true)
  })

  it('a kind with no padlock of this kind, or a thing that is not there, is not locked', () => {
    const p = demoProject()
    expect(isLocked(p, { kind: 'dimension', id: 'd1' })).toBe(false)
    expect(isLocked(p, { kind: 'gate', id: 'nope' })).toBe(false)
    expect(isLocked(p, { kind: 'street', id: 'street:nope' })).toBe(false)
    expect(isLocked(p, { kind: 'nope', id: 'x' })).toBe(false)
  })
})

describe('the segments’ helpers', () => {
  it('segmentLocked and streetLockState: locked, unlocked or mixed', () => {
    const { p, segments } = withStreet()
    const mark = (ids: string[]): Project => ({
      ...p,
      options: p.options.map((o) => (o.id === o1 ? { ...o, streets: { ...o.streets!, segments: o.streets!.segments.map((g) => (ids.includes(g.id) ? { ...g, locked: true } : g)) } } : o)),
    })
    expect(segmentLocked(p, o1, segments[0])).toBe(false)
    expect(streetLockState(p, o1, segments)).toBe('unlocked')
    expect(segmentLocked(mark([segments[0]]), o1, segments[0])).toBe(true)
    expect(segmentLocked(mark([segments[0]]), o1, segments[1])).toBe(false)
    expect(streetLockState(mark([segments[0]]), o1, segments)).toBe('mixed')
    expect(streetLockState(mark(segments), o1, segments)).toBe('locked')
    expect(streetLockState(p, o1, [])).toBe('unlocked')
  })
})

describe('lockedAmong', () => {
  it('the refs that are locked, in the order given', () => {
    const p = demoProject()
    const q: Project = { ...p, masses: p.masses.map((m) => (m.id === 'm2' ? { ...m, locked: true } : m)), site: { ...p.site, gates: p.site.gates!.map((g, i) => (i === 0 ? { ...g, locked: true } : g)) } }
    const refs = [
      { kind: 'mass', id: 'm1' },
      { kind: 'mass', id: 'm2' },
      { kind: 'gate', id: q.site.gates![0].id },
    ]
    expect(lockedAmong(q, refs, o1)).toEqual([refs[1], refs[2]])
  })
})

describe('roadSegments (Phase PE.1 review: a street is one thing, a run is a part of it)', () => {
  /** A street of three segments whose middle one is wider: three runs, `street:sA` the street. */
  function widened() {
    const base = demoProject({ streets: false })
    const nodes = [{ id: 'n1', x: 0, y: 0 }, { id: 'n2', x: 0, y: 20 }, { id: 'n3', x: 0, y: 40 }, { id: 'n4', x: 0, y: 60 }]
    const g = (id: string, a: string, b: string, left = 4, right = 4) => ({ id, a, b, type: 'trucks', left, right })
    const streets = { nodes, segments: [g('sA', 'n1', 'n2'), g('sB', 'n2', 'n3', 4, 8), g('sC', 'n3', 'n4')] }
    return { ...base, options: base.options.map((o) => (o.id === o1 ? { ...o, streets } : o)) }
  }

  it('the street’s id gives every run’s segments', () => {
    expect(roadSegments(widened(), o1, 'street:sA')).toEqual(['sA', 'sB', 'sC'])
  })

  it('a run’s id gives that run’s segments', () => {
    expect(roadSegments(widened(), o1, 'street:sB')).toEqual(['sB'])
    expect(roadSegments(widened(), o1, 'street:sC')).toEqual(['sC'])
  })
})
