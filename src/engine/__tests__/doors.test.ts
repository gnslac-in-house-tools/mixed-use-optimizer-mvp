// Dock doors by pattern (Phase G.3a, Decision "Structural grid"): on the grid, a mass on it has its doors module by
// module (one every module by default, the building's end bays skipped; a pattern of its program's or its own: every
// k from an offset, the corners skipped, a repeating mask), its exceptions flipped; the brief's doors become its target,
// short of it an Issue and the KPI *Doors short*; off the grid, or without one, the doors as before. The demo on a
// 10 × 10 m grid in 4 (2.5 m modules) from Warehouse 1's corner (40, 70): Warehouse 1 docks on its south wall, 160 m,
// 64 modules, the first 4 in Building 1's first bay (x 40–50: it starts on a line, so that whole bay is its end bay);
// the brief asks one door per 700 m² of floor, 19 for its 12,800 m².
import { describe, expect, it } from 'vitest'
import type { DockPattern, Grid, Project } from '../../model/schema.ts'
import { flipDoor, setDoorPattern, setProgramPattern, clearDoorFlips } from '../../modules/docks/actions.ts'
import { setGrid, splitAtGridLine, stretchBuilding } from '../../state/actions/grid.ts'
import { demoProject } from '../../state/demo.ts'
import { slotsOn, type Wall } from '../../modules/docks/engine/docks.ts'
import { derive } from '../derive.ts'
import { readKpi } from '../../modules/catalog.ts'

const grid: Grid = { x: 10, y: 10, modules: 4, origin: { x: 40, y: 70 }, angle: 0 }
const onGrid = (): Project => setGrid(demoProject(), grid)
const dock = (p: Project, id = 'm1') => derive(p).docks.docks.find((d) => d.massId === id)!
const pattern = (patch: Partial<DockPattern> = {}): DockPattern => ({ every: 1, offset: 0, skip: 'ends', ...patch })

describe('the doors by pattern', () => {
  it('a door every module of the wall on the grid; the target the brief’s; without a grid, as before', () => {
    const before = dock(demoProject())
    expect(before.slots).toBeUndefined()
    const d = dock(onGrid())
    expect(d.slots).toHaveLength(64)
    expect(d.doors).toHaveLength(60)
    expect(d.doors[0]).toEqual({ x: 51.25, y: 70 })
    const set = derive(onGrid()).docks
    expect(set.targets.find((t) => t.massId === 'm1')).toEqual({ massId: 'm1', doors: 60, target: before.doors.length })
    expect(before.doors).toHaveLength(19)
    expect(set.short).toBe(0)
    expect(derive(demoProject()).docks.short).toBeNull()
  })

  it('every k from an offset; the corners skipped; a mask that repeats', () => {
    const doors = (pt: DockPattern) => dock(setDoorPattern(onGrid(), 'm1', pt)).slots!.filter((s) => s.door).map((s) => s.module)
    expect(doors(pattern({ every: 4 }))).toHaveLength(15)
    expect(doors(pattern({ every: 4, offset: 2 })).slice(0, 3)).toEqual([6, 10, 14])
    const corners = doors(pattern({ skip: 'corners' }))
    expect([corners.length, corners[0], corners.at(-1)]).toEqual([62, 1, 62])
    expect(doors(pattern({ mask: [1, 1, 0] })).slice(0, 5)).toEqual([4, 5, 7, 8, 10])
    // the program's pattern for its masses, a mass's own over it
    const p = setProgramPattern(onGrid(), 'warehouse', pattern({ every: 2 }))
    expect(dock(p, 'm2').doors).toHaveLength(26)
    expect(dock(setDoorPattern(p, 'm2', pattern({ every: 7 })), 'm2').doors).toHaveLength(8)
    expect(setDoorPattern(p, 'm2', pattern({ every: 0 }))).toBe(p)
  })

  it('the building’s end bays skipped: Warehouse 1 a module longer west, past line E, its first module has no door', () => {
    const p = stretchBuilding(onGrid(), 'o1', 'b1', 'x', 'start', -2.5)
    const d = dock(p)
    expect(d.slots).toHaveLength(65)
    expect(d.slots![0]).toMatchObject({ door: false, flipped: false })
    expect(d.doors).toHaveLength(64)
    expect(dock(setDoorPattern(p, 'm1', pattern({ skip: 'none' }))).doors).toHaveLength(65)
  })

  it('an exception: a module’s door taken away, or one added; again, undone; cleared', () => {
    const p = setDoorPattern(onGrid(), 'm1', pattern({ every: 2 }))
    const t = dock(p).t
    // modules 0–3 are the end bay's: the pattern's first door is module 4
    const off = flipDoor(p, 'm1', t, 4)
    expect(dock(off).slots![4]).toMatchObject({ door: false, flipped: true })
    const on = flipDoor(off, 'm1', t, 5)
    expect(dock(on).slots!.slice(4, 6).map((s) => s.door)).toEqual([false, true])
    expect(dock(on).doors).toHaveLength(30)
    expect(flipDoor(on, 'm1', t, 5).masses[0].doorFlips).toEqual([{ t, module: 4 }])
    expect(clearDoorFlips(on, 'm1').masses[0].doorFlips).toBeUndefined()
    expect(flipDoor(p, 'm1', t, -1)).toBe(p)
  })

  it('an exception stays where it is on the plan: the wall stretched from its start, the mass split in two', () => {
    const p = onGrid()
    const t = dock(p).t
    // modules 3 and 41 of Warehouse 1's south wall (from x 40): their middles at x 46.25 and 141.25
    const flipped = flipDoor(flipDoor(p, 'm1', t, 2), 'm1', t, 40)
    const longer = stretchBuilding(flipped, 'o1', 'b1', 'x', 'start', -5)
    expect(longer.masses[0].doorFlips!.map((f) => f.module)).toEqual([4, 42])
    expect(dock(longer).slots!.filter((x) => x.flipped).map((x) => x.at.x)).toEqual([46.25, 141.25])
    // split at x 120: the first keeps the one at 46.25, the copy the one at 141.25, its module 9 from x 120
    const r = splitAtGridLine(flipped, 'o1', 'm1', 'x', 8)!
    expect(r.project.masses.find((m) => m.id === 'm1')!.doorFlips!.map((f) => f.module)).toEqual([2])
    expect(r.project.masses.find((m) => m.id === r.id)!.doorFlips!.map((f) => f.module)).toEqual([8])
    expect(dock(r.project, r.id).slots!.filter((x) => x.flipped).map((x) => x.at.x)).toEqual([141.25])
  })

  it('short of the brief: an Issue and the KPI', () => {
    const p = setDoorPattern(onGrid(), 'm1', pattern({ every: 4 }))
    const d = derive(p)
    expect(d.docks.short).toBe(4)
    expect(d.issues.filter((i) => i.code === 'doors').map((i) => i.message)).toEqual([
      'Warehouse 1: 15 dock doors by its pattern, the brief asks 19 (one per 700 m² of floor).',
    ])
    expect(readKpi('doors-short', p, d)).toMatchObject({ value: 4, status: 'over' })
    expect(readKpi('doors-short', onGrid(), derive(onGrid()))).toMatchObject({ value: 0, status: 'within' })
  })

  it('a wall off the grid’s modules has no slots', () => {
    const w: Wall = { i: 0, a: { x: 40, y: 70 }, b: { x: 41, y: 70 }, t: 0, length: 1, out: { x: 0, y: -1 } }
    expect(slotsOn(w, grid, null, pattern(), new Set())).toBeNull()
  })
})
