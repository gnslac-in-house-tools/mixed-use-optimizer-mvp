// Level actions. The ones marked (port) come from Plaza-Practiko `estado/__tests__/acciones.test.ts` (duplicarMasa,
// niveles) and `transformar.test.ts` (moverANivel), with its levels: n-1 (−3.5, 3.5), n1 (0, 5), n2 (5, 4.5).
import { describe, expect, it } from 'vitest'
import type { Footprint, Mass, Project } from '../../model/schema.ts'
import { massHeight } from '../../engine/levels.ts'
import { newProject } from '../../typologies/index.ts'
import { addDimension } from '../actions/dimensions.ts'
import {
  addLevel,
  addLevelAtEnd,
  copyMassToLevel,
  moveMassToLevel,
  moveMassesToElevation,
  removeLevel,
  updateLevel,
  withLevels,
} from '../actions/levels.ts'
import { addMass } from '../actions/masses.ts'

/** A w × h rect with its lower left corner at (x, y). */
const rect = (w: number, h: number, x = 0, y = 0): Footprint => ({
  kind: 'rect',
  center: { x: x + w / 2, y: y + h / 2 },
  width: w,
  depth: h,
  rotation: 0,
})
const mass = (id: string, levelId: string, footprint: Footprint): Mass => ({ id, name: id, levelId, programId: null, footprint })

function project(masses: Mass[] = []): Project {
  return {
    ...newProject('blank', 'Test'),
    buildings: [
      {
        ...newProject('blank', 'Test').buildings[0],
        levels: [
          { id: 'n-1', name: 'B1', elevation: -3.5, height: 3.5, repeat: 1 },
          { id: 'n1', name: 'L1', elevation: 0, height: 5, repeat: 1 },
          { id: 'n2', name: 'L2', elevation: 5, height: 4.5, repeat: 1 },
        ],
      },
    ],
    masses,
  }
}
/** The levels of its one building. */
const levelsOf = (p: Project) => p.buildings[0].levels
const level = (p: Project, id: string) => levelsOf(p).find((l) => l.id === id)!
const elevations = (p: Project) => Object.fromEntries(levelsOf(p).map((l) => [l.name, l.elevation]))

describe('add, update and remove levels', () => {
  it('a level with masses, or the only one, is not removed (port)', () => {
    const p0 = project([mass('a', 'n1', rect(10, 10))])
    const { project: p1, id } = addLevel(p0, { name: 'L3', elevation: 9.5, height: 4, repeat: 1 })!
    expect(level(p1, id).name).toBe('L3')
    expect(level(updateLevel(p1, id, { elevation: 10 }), id).elevation).toBe(10)
    expect(levelsOf(removeLevel(p1, id))).toHaveLength(3)
    expect(removeLevel(p1, 'n1')).toBe(p1)
    const only = withLevels(project(), project().buildings[0].id, [level(p0, 'n1')])
    expect(removeLevel(only, 'n1')).toBe(only)
  })

  it('a removed level takes its dimensions with it', () => {
    const p = addDimension(project(), { x: 0, y: 0 }, { x: 5, y: 0 }, 1, 'n2')!.project
    expect(removeLevel(p, 'n2').dimensions).toEqual([])
  })

  it('above: on top of the highest stack, as tall as it; below: under the lowest one, as tall as it', () => {
    const p = updateLevel(project(), 'n2', { repeat: 3 }) // L2 ends at 5 + 3 × 4.5 = 18.5
    const up = addLevelAtEnd(p, 'above')
    expect(level(up.project, up.id)).toMatchObject({ name: 'L3', elevation: 18.5, height: 4.5, repeat: 1 })
    expect(levelsOf(up.project).at(-1)!.id).toBe(up.id)
    const down = addLevelAtEnd(p, 'below')
    expect(level(down.project, down.id)).toMatchObject({ name: 'B2', elevation: -7, height: 3.5, repeat: 1 })
    expect(levelsOf(down.project)[0].id).toBe(down.id)
  })

  it('×N or a height above ground moves the levels on top of it; its elevation moves it alone', () => {
    const p = project()
    expect(elevations(updateLevel(p, 'n1', { repeat: 4 }))).toEqual({ B1: -3.5, L1: 0, L2: 20 })
    expect(elevations(updateLevel(p, 'n1', { height: 6 }))).toEqual({ B1: -3.5, L1: 0, L2: 6 })
    expect(elevations(updateLevel(p, 'n2', { elevation: 7 }))).toEqual({ B1: -3.5, L1: 0, L2: 7 })
  })

  it('a basement grows downwards: its top stays at the ground', () => {
    const p = addLevelAtEnd(project(), 'below').project // B2 at −7
    expect(elevations(updateLevel(p, 'n-1', { height: 4 }))).toEqual({ B2: -7.5, B1: -4, L1: 0, L2: 5 })
  })

  it('an invalid value, or the same one, changes nothing', () => {
    const p = project()
    for (const patch of [{ height: 0 }, { height: -2 }, { repeat: 0 }, { repeat: 2.5 }, { name: '  ' }, { elevation: Number.NaN }, { height: 5 }])
      expect(updateLevel(p, 'n1', patch)).toBe(p)
    expect(updateLevel(p, 'nowhere', { height: 3 })).toBe(p)
    expect(addLevel(p, { name: 'X', elevation: 0, height: 0, repeat: 1 })).toBeNull()
    expect(level(updateLevel(p, 'n1', { name: ' Ground ' }), 'n1').name).toBe('Ground')
  })
})

describe('a mass and its level', () => {
  it('a new mass goes on the ground floor and takes its height, which it follows', () => {
    const r = addMass(project(), { programId: null, footprint: rect(10, 10) })
    const m = r.project.masses[0]
    expect(m.levelId).toBe('n1')
    expect(m.height).toBeUndefined()
    expect(massHeight(r.project, m)).toBe(5)
    const taller = updateLevel(r.project, 'n1', { height: 6 })
    expect(massHeight(taller, taller.masses[0])).toBe(6)
    // a height of its own stays
    const own = addMass(project(), { programId: null, footprint: rect(10, 10), height: 9, levelId: 'n2' }).project.masses[0]
    expect([own.levelId, own.height]).toEqual(['n2', 9])
  })
})

describe('copyMassToLevel (port of duplicarMasa)', () => {
  it('down from the lowest level makes a new level at its elevation minus the height (port)', () => {
    const p0 = project([mass('a', 'n-1', rect(10, 10))])
    const r = copyMassToLevel(p0, 'a', -1)!
    expect(levelsOf(r.project)).toHaveLength(4)
    expect(level(r.project, r.levelId)).toMatchObject({ name: 'B2', elevation: -7, height: 3.5 })
    expect(levelsOf(r.project)[0].id).toBe(r.levelId)
    const copy = r.project.masses.find((m) => m.id === r.id)!
    expect(copy.levelId).toBe(r.levelId)
    expect(copy.footprint).toEqual(p0.masses[0].footprint)
  })

  it('up skips the level that already has a mass over it (port)', () => {
    const p0 = project([mass('a', 'n-1', rect(10, 10)), mass('b', 'n1', rect(10, 10, 5, 5))])
    const r = copyMassToLevel(p0, 'a', 1)!
    expect(r.levelId).toBe('n2')
    expect(levelsOf(r.project)).toHaveLength(3)
  })

  it('up ignores masses that only touch its edge (port)', () => {
    const p0 = project([mass('a', 'n-1', rect(10, 10)), mass('b', 'n1', rect(10, 10, 10))])
    expect(copyMassToLevel(p0, 'a', 1)!.levelId).toBe('n1')
  })

  it('up from the last level makes one on top (port)', () => {
    const p0 = project([mass('a', 'n2', rect(10, 10))])
    const r = copyMassToLevel(p0, 'a', 1)!
    expect(level(r.project, r.levelId)).toMatchObject({ name: 'L3', elevation: 9.5, height: 4.5 })
    expect(levelsOf(r.project).at(-1)!.id).toBe(r.levelId)
  })

  it('a mass that does not exist: null', () => {
    expect(copyMassToLevel(project(), 'x', 1)).toBeNull()
  })
})

describe('moveMassToLevel (port of moverANivel)', () => {
  it('to the first free level; if there is none, to a new one (port)', () => {
    const p = project([mass('a', 'n1', rect(10, 10)), mass('b', 'n1', rect(10, 10))])
    const up = moveMassToLevel(p, 'b', 1)!
    expect(up.levelId).toBe('n2')
    expect(up.project.masses.find((m) => m.id === 'b')!.levelId).toBe('n2')
    const full = project([mass('a', 'n1', rect(10, 10)), mass('b', 'n1', rect(10, 10)), mass('c', 'n2', rect(10, 10))])
    const fresh = moveMassToLevel(full, 'b', 1)!
    expect(levelsOf(full).some((l) => l.id === fresh.levelId)).toBe(false)
    expect(levelsOf(fresh.project)).toHaveLength(levelsOf(full).length + 1)
  })

  it('the dimensions of the level it leaves let go of it', () => {
    const p = addDimension(project([mass('a', 'n1', rect(10, 10))]), { x: 0, y: 0 }, { x: 10, y: 0 }, 1, 'n1')!.project
    expect(p.dimensions![0]).toMatchObject({ anchorA: { massId: 'a' }, anchorB: { massId: 'a' } })
    const d = moveMassToLevel(p, 'a', 1)!.project.dimensions![0]
    expect(d.anchorA).toBeUndefined()
    expect(d.anchorB).toBeUndefined()
    expect([d.a, d.b]).toEqual([p.dimensions![0].a, p.dimensions![0].b])
  })
})

describe('dimensions on a level', () => {
  it('an end anchors only to a corner of a mass on its level', () => {
    const p = project([mass('a', 'n1', rect(10, 10)), mass('b', 'n2', rect(10, 10))])
    const on2 = addDimension(p, { x: 0, y: 0 }, { x: 10, y: 0 }, 1, 'n2')!.project.dimensions![0]
    expect(on2).toMatchObject({ levelId: 'n2', anchorA: { massId: 'b' }, anchorB: { massId: 'b' } })
    const onB1 = addDimension(p, { x: 0, y: 0 }, { x: 10, y: 0 }, 1, 'n-1')!.project.dimensions![0]
    expect(onB1.anchorA).toBeUndefined()
  })
})

it('no level action changes the project it is given', () => {
  const base = project([mass('a', 'n1', rect(10, 10)), mass('b', 'n2', rect(10, 10))])
  const copy = structuredClone(base)
  const all: ((p: Project) => unknown)[] = [
    (p) => addLevel(p, { name: 'L9', elevation: 20, height: 3, repeat: 1 }),
    (p) => addLevelAtEnd(p, 'above'),
    (p) => addLevelAtEnd(p, 'below'),
    (p) => updateLevel(p, 'n1', { height: 7, repeat: 2 }),
    (p) => updateLevel(p, 'n-1', { height: 4 }),
    (p) => removeLevel(p, 'n-1'),
    (p) => copyMassToLevel(p, 'a', 1),
    (p) => copyMassToLevel(p, 'a', -1),
    (p) => moveMassToLevel(p, 'b', -1),
  ]
  for (const f of all) {
    f(base)
    expect(base).toEqual(copy)
  }
})

describe('moveMassesToElevation: the level follows its masses (Decision "Levels follow the masses")', () => {
  it('all the masses of a level, where no level is: the level goes with them (same id), the others stay', () => {
    const p = project([mass('a', 'n2', rect(10, 10)), mass('b', 'n2', rect(10, 10, 20)), mass('c', 'n1', rect(10, 10))])
    const r = moveMassesToElevation(p, ['a', 'b'], 7.2)!
    expect(level(r, 'n2').elevation).toBe(7.2)
    expect(r.masses.filter((m) => m.levelId === 'n2').map((m) => m.id)).toEqual(['a', 'b'])
    expect(levelsOf(r)).toHaveLength(3)
  })

  it('some of them: a new level for those that move, the old one keeps the rest; onto a level: they join it', () => {
    const p = project([mass('a', 'n2', rect(10, 10)), mass('b', 'n2', rect(10, 10, 20))])
    expect(moveMassesToElevation(p, ['a'], 7.2)).toBeNull()
    const r = moveMassesToElevation(p, ['a'], 7.2, true)!
    const made = levelsOf(r).find((l) => l.elevation === 7.2)!
    expect(made.id).not.toBe('n2')
    expect(r.masses.map((m) => m.levelId)).toEqual([made.id, 'n2'])
    const onto = moveMassesToElevation(p, ['a', 'b'], 0)!
    expect(onto.masses.map((m) => m.levelId)).toEqual(['n1', 'n1'])
    expect(level(onto, 'n2').elevation).toBe(5)
  })
})
