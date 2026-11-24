// A line by hand (Decision "Grid by line", GR.3): a block's own column lines on its module lines, moved or deleted,
// each counted from its nearer wall, so a copy of another length keeps an edit at an end and one past its middle gives
// way to the rules; Regular grid again; the docks stay on their modules (Decision "Elements by module").
import { describe, expect, it } from 'vitest'
import type { HallElement, Project, WarehouseType } from '../../../../model/schema.ts'
import { demoProject } from '../../../../state/demo.ts'
import { addWarehouseType, moveGridLine, placeWarehouse, regularGrid, removeGridLine, setHallJoin, updateWarehouseStep } from '../../actions.ts'
import { lineModules, ownLinesOf, runAlong, withOwnLines } from '../bays.ts'
import { generate, hallRuns, typeWith } from '../generate.ts'

const docks = (modules: number[]): HallElement[] => modules.map((module, i) => ({ id: `d${i + 1}`, kind: 'dock', edge: 'e1', module, width: 3 }))

/** A block 218 × 96 m on 12 m bays, its end bays of 7 m (a rule of 6 m), docked on a module of bays 1, 2 and 17 (its
 *  modules 3, 7 and 67), placed once. */
function block() {
  let { project: p, id } = addWarehouseType(demoProject())
  p = updateWarehouseStep(p, id, 'hall', { length: 218, width: 96, ends: 'both' })
  p = setHallJoin(p, id, 6)
  p = updateWarehouseStep(p, id, 'elements', docks([3, 7, 67]))
  const placed = placeWarehouse(p, id, { x: 100, y: 100 }, 0, p.options[0].id)!
  return { p: placed.project, id, copy: placed.id }
}
const typeIn = (p: Project, id: string) => p.warehouseTypes!.find((t) => t.id === id)!
const linesOf = (t: WarehouseType) => hallRuns(t).x.lines

describe('own lines on a run', () => {
  const r = runAlong(218, 12, 4, 'both', false, 6) // 7 | 12 × 17 | 7: module lines 0, 3.5, 7, 10, 13…
  it('a line deleted: the bays either side one, the module lines where they were; the end bay keeps its mark', () => {
    const own = ownLinesOf(r, lineModules(r).filter((i) => i !== 2))
    expect(own).toEqual({ off: [2] })
    const s = withOwnLines(r, own)
    expect(s.lines.slice(0, 3)).toEqual([0, 19, 31])
    expect(s.modules).toEqual(r.modules)
    expect(s.bays[0]).toEqual({ lo: 0, hi: 19, end: true, modules: 6 })
    expect(s.start).toBe(19)
  })

  it('counted from the nearer wall: the last but one line is −2; one past a copy’s middle gives way to the rules', () => {
    const n = r.modules.length - 1
    expect(ownLinesOf(r, lineModules(r).filter((i) => i !== n - 2))).toEqual({ off: [-2] })
    // a copy 2 bays longer keeps both ends' edits
    const long = runAlong(242, 12, 4, 'both', false, 6)
    const s = withOwnLines(long, { off: [2, -2] })
    expect(s.lines).not.toContain(7)
    expect(s.lines).not.toContain(235)
    // module 40 from the start, past the middle of a copy of 30 modules: the rules'
    const short = runAlong(90, 12, 4, 'both', false, 6)
    expect(withOwnLines(short, { off: [40, 20] })).toEqual(short)
  })
})

describe('by hand in the block editor', () => {
  it('a line moved: to the module line nearest, between its neighbours; its walls stay; docks where they stood', () => {
    const { p, id, copy } = block()
    // line B (7 m) to 12 m: the module line nearest is 13 (two modules on from 7)
    const q = moveGridLine(p, id, 'x', 1, 12)
    const t = typeIn(q, id)
    expect(linesOf(t).slice(0, 3)).toEqual([0, 13, 19])
    expect(t.grid.lines).toEqual({ x: { off: [2], on: [4] } })
    // never past its neighbours (a module from each), never a wall
    expect(linesOf(typeIn(moveGridLine(p, id, 'x', 1, 50), id))[1]).toBe(16)
    expect(moveGridLine(p, id, 'x', 0, 5)).toBe(p)
    expect(moveGridLine(p, id, 'x', 1, 7)).toBe(p)
    // the copy follows; its docks on their modules, so its one mass as it was
    expect(q.buildings.find((b) => b.id === copy)).toBeDefined()
    expect(generate(t).doors.map((d) => d.at)).toEqual(generate(typeIn(p, id)).doors.map((d) => d.at))
    expect(q.masses).toEqual(p.masses)
  })

  it('a line deleted: B and U, the docks on their modules where they stood; Regular grid again brings them back', () => {
    const { p, id } = block()
    let q = removeGridLine(p, id, 'x', 1)
    const n = hallRuns(typeIn(q, id)).x.lines.length
    q = removeGridLine(q, id, 'x', n - 2)
    const t = typeIn(q, id)
    expect(hallRuns(t).x).toMatchObject({ start: 19, end: 19 })
    expect(t.grid.lines).toEqual({ x: { off: [-2, 2] } })
    expect(generate(t).doors.map((d) => d.module)).toEqual([3, 7, 67])
    expect(generate(t).doors.map((d) => d.at)).toEqual(generate(typeIn(p, id)).doors.map((d) => d.at))
    const back = regularGrid(q, id)
    expect(typeIn(back, id).grid.lines).toBeUndefined()
    expect(hallRuns(typeIn(back, id)).x.start).toBe(7)
    expect(regularGrid(back, id)).toBe(back)
  })

  it('a copy of another length keeps an edit at its ends, counted from its walls', () => {
    const { p, id } = block()
    const q = removeGridLine(p, id, 'x', 1)
    const longer = typeWith(typeIn(q, id), { hall: { length: 242 } })
    expect(hallRuns(longer).x.lines.slice(0, 2)).toEqual([0, 19])
  })
})
