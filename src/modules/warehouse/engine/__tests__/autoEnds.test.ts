// Step 1's *Set end bays automatically* (BE.6, Decision "Grid by line"): the end bays laid once, at both ends; the stored
// layout rewritten (`ends`, `endsWidth`, `shortEnds`; `joinUnder` stays), the grid's own lines cleared, the docks, the
// shape and the copies following the new lines like any step 1 or 2 edit (Decision "Elements by module").
import { describe, expect, it } from 'vitest'
import type { HallElement, Project, WarehouseType } from '../../../../model/schema.ts'
import { demoProject } from '../../../../state/demo.ts'
import { addWarehouseType, moveBlockEdge, moveGridLine, placeWarehouse, setEndsAutomatically, setHallJoin, shapeWarehouse, updateWarehouseStep } from '../../actions.ts'
import { autoEnds, nearestModule, runAlong } from '../bays.ts'
import { copyGenerated, onPlace } from '../copies.ts'
import { generate, hallRuns } from '../generate.ts'
import { holeRect, relaidLines } from '../shape.ts'
import type { Run } from '../bays.ts'

const docks = (modules: number[]): HallElement[] => modules.map((module, i) => ({ id: `d${i + 1}`, kind: 'dock', edge: 'e1', module, width: 3 }))
const typeIn = (p: Project, id: string): WarehouseType => p.warehouseTypes!.find((t) => t.id === id)!

/** A block 218 × 96 m on 12 m bays with its end bay at the start only (a layout an older file keeps), a join rule of
 *  6 m and docks on modules in its middle, a line of its own moved, placed once. */
function block() {
  let { project: p, id } = addWarehouseType(demoProject())
  p = updateWarehouseStep(p, id, 'hall', { length: 218, width: 96, ends: 'start', endsWidth: 'end', shortEnds: { x: true } })
  p = setHallJoin(p, id, 6)
  p = updateWarehouseStep(p, id, 'elements', docks([20, 24, 28, 32, 36, 40]))
  p = moveGridLine(p, id, 'x', 3, 40)
  const placed = placeWarehouse(p, id, { x: 100, y: 100 }, 0, p.options[0].id)!
  return { p: placed.project, id, copy: placed.id }
}

describe('autoEnds', () => {
  const t = (): WarehouseType => typeIn(addWarehouseType(demoProject()).project, 'wt1')

  it('is at both ends', () => {
    expect(autoEnds(t())).toEqual({ ends: 'both' })
  })

  it('a length of whole bays has no end bay; 11 bays and 3 m give an equal end bay at each end', () => {
    const whole = runAlong(132, 12, 4, autoEnds(t()).ends)
    expect([whole.start, whole.end]).toEqual([0, 0])
    expect(whole.bays).toHaveLength(11)
    // 3 m left: (3 + 12) / 2 = 7.5 m each, under two thirds of a bay (8 m) so each joins the bay next to it, 19.5 m
    const left = runAlong(135, 12, 4, 'both', false, 6)
    expect([left.start, left.end]).toEqual([7.5, 7.5])
    expect(left.bays.filter((b) => b.end)).toHaveLength(2)
    const joined = runAlong(135, 12, 4, 'both')
    expect([joined.start, joined.end]).toEqual([19.5, 19.5])
    expect(joined.start).toBe(joined.end)
  })
})

describe('setEndsAutomatically', () => {
  it('rewrites the layout: at both ends, the width’s own and the short ones gone, the join rule kept, the own lines cleared', () => {
    const { p, id } = block()
    const was = typeIn(p, id)
    expect(was.hall).toMatchObject({ ends: 'start', endsWidth: 'end', shortEnds: { x: true }, joinUnder: 6 })
    expect(was.grid.lines).toBeDefined()
    const t = typeIn(setEndsAutomatically(p, id), id)
    expect(t.hall.ends).toBe('both')
    expect(t.hall.endsWidth).toBeUndefined()
    expect(t.hall.shortEnds).toBeUndefined()
    expect(t.hall.joinUnder).toBe(6)
    expect(t.grid.lines).toBeUndefined()
    const x = hallRuns(t).x
    expect(x.start).toBe(x.end)
    expect(x.start).toBeGreaterThan(0)
  })

  it('a block with docks keeps their count, and its copy is made again on the new lines', () => {
    const { p, id, copy } = block()
    const q = setEndsAutomatically(p, id)
    expect(typeIn(q, id).elements).toHaveLength(6)
    expect(typeIn(q, id).elements.every((e) => e.kind === 'dock')).toBe(true)
    const hall = (pr: Project) => pr.masses.filter((m) => m.part === 'hall' && pr.buildings.find((b) => b.id === copy)!.levels.some((l) => l.id === m.levelId))
    expect(hall(q)).toHaveLength(hall(p).length)
    expect(q.masses).not.toBe(p.masses)
  })

  it('is idempotent: laid again, the same project; a block that has none to change, the same project', () => {
    const { p, id } = block()
    const q = setEndsAutomatically(p, id)
    expect(setEndsAutomatically(q, id)).toBe(q)
    expect(setEndsAutomatically(p, 'nope')).toBe(p)
  })

  it('a length of whole bays: its docks stay where they were', () => {
    let { project: p, id } = addWarehouseType(demoProject())
    p = updateWarehouseStep(p, id, 'hall', { length: 132, width: 96, ends: 'start' })
    p = updateWarehouseStep(p, id, 'elements', docks([10, 14, 18]))
    const q = setEndsAutomatically(p, id)
    expect(hallRuns(typeIn(q, id)).x.bays.filter((b) => b.end)).toHaveLength(0)
    expect(typeIn(q, id).elements.map((e) => e.module)).toEqual([10, 14, 18])
  })
})

describe('setEndsAutomatically at an unchanged length keeps everything in its place (final review, Important 1)', () => {
  const HALF = 1.5 + 1e-6
  /** A block `length` × 96 m (12 m bays, 3 m modules) with its end bay at `ends`, docks on modules 1, 2, its middle,
   *  n − 3 and n − 2 of its front, a hole on module lines 30–34 × 4–8. */
  function laid(length: number, ends: 'start' | 'end') {
    let { project: p, id } = addWarehouseType(demoProject())
    p = updateWarehouseStep(p, id, 'hall', { length, width: 96, ends })
    const n = hallRuns(typeIn(p, id)).x.modules.length - 1
    p = updateWarehouseStep(p, id, 'elements', docks([1, 2, Math.floor(n / 2), n - 3, n - 2]))
    p = shapeWarehouse(p, id, { kind: 'hole', x: [30, 34], y: [4, 8] }).project
    return { p, id, n }
  }
  /** Where a type's docks stand (m along its length), each with its module, and its holes (m). */
  const site = (t: WarehouseType) => {
    const g = generate(t)
    return { docks: g.doors.filter((d) => d.edge === 'e1').map((d) => ({ module: d.module, x: d.at.x })), holes: g.holes.map((h) => holeRect(h)) }
  }
  function keepsPlace(p: Project, id: string) {
    const before = site(typeIn(p, id))
    const q = setEndsAutomatically(p, id)
    const t = typeIn(q, id)
    const after = site(t)
    const runs = hallRuns(t)
    expect(after.docks).toHaveLength(before.docks.length)
    after.docks.forEach((d, i) => {
      expect(Math.abs(d.x - before.docks[i].x)).toBeLessThanOrEqual(HALF)
      // on the module whose centre is nearest where it stood
      expect(d.module).toBe(nearestModule(runs.x, before.docks[i].x))
    })
    expect(after.holes).toHaveLength(1)
    for (const k of ['x0', 'x1', 'y0', 'y1'] as const) expect(Math.abs(after.holes[0][k] - before.holes[0][k])).toBeLessThanOrEqual(HALF)
    return { before, after, q }
  }

  it('218 m at the start: 73 modules → 72, its docks and its hole keep their place', () => {
    const { p, id, n } = laid(218, 'start')
    const q = setEndsAutomatically(p, id)
    expect(hallRuns(typeIn(q, id)).x.modules.length - 1).not.toBe(n)
    keepsPlace(p, id)
  })

  it('139 m at the start and 137 m at the end: the module count the same, its docks and its hole keep their place', () => {
    for (const [length, ends] of [
      [139, 'start'],
      [137, 'end'],
    ] as const) {
      const { p, id, n } = laid(length, ends)
      const q = setEndsAutomatically(p, id)
      expect(hallRuns(typeIn(q, id)).x.modules.length - 1).toBe(n)
      keepsPlace(p, id)
    }
  })

  it('an own-shape copy is relaid the same: its docks and its hole keep their place on the site', () => {
    let { p, id } = laid(218, 'start')
    p = shapeWarehouse(p, id, { kind: 'pull', edge: 'e3', from: 40, to: 48, by: -1 }).project
    const placed = placeWarehouse(p, id, { x: 100, y: 100 }, 0, p.options[0].id)!
    p = placed.project
    const w0 = p.buildings.find((b) => b.id === placed.id)!.warehouse!
    const side = copyGenerated(typeIn(p, id), w0).edges.find((e) => !e.outer && !e.horizontal)!
    p = moveBlockEdge(p, placed.id, side.id, 1).project
    expect(p.buildings.find((b) => b.id === placed.id)!.warehouse!.overrides!.morphology!.outline!.length).toBeGreaterThanOrEqual(4)
    const onSite = (pr: Project) => {
      const w = pr.buildings.find((b) => b.id === placed.id)!.warehouse!
      const g = copyGenerated(typeIn(pr, id), w)
      return { docks: g.doors.filter((d) => d.edge === 'e1').map((d) => onPlace(w.place, d.at).x), holes: g.holes.map((h) => holeRect(h)) }
    }
    const before = onSite(p)
    const after = onSite(setEndsAutomatically(p, id))
    expect(after.docks).toHaveLength(before.docks.length)
    after.docks.forEach((x, i) => expect(Math.abs(x - before.docks[i])).toBeLessThanOrEqual(HALF))
    expect(after.holes).toHaveLength(1)
    for (const k of ['x0', 'x1'] as const) expect(Math.abs(after.holes[0][k] - before.holes[0][k])).toBeLessThanOrEqual(HALF)
  })
})

describe('setEndsAutomatically never collapses a hole, a zone or an outline run (residual review)', () => {
  /** A block `length` × 96 m (12 m bays, 3 m modules) with its end bay at `ends`. */
  function hall(length: number, ends: 'start' | 'end') {
    const { project, id } = addWarehouseType(demoProject())
    const p = updateWarehouseStep(project, id, 'hall', { length, width: 96, ends })
    const runs = hallRuns(typeIn(p, id))
    return { p, id, nx: runs.x.modules.length - 1, ny: runs.y.modules.length - 1 }
  }
  /** Within a module and a half of the largest module after: a side moved to the next line stays near its place. */
  const near = (r: ReturnType<typeof hallRuns>['x']) => 1.5 * Math.max(...r.modules.slice(1).map((v, i) => v - r.modules[i])) + 1e-6
  const xOf = (r: ReturnType<typeof hallRuns>['x'], k: number) => r.modules[k]

  it('110 m at the start (37 → 36 modules): a hole one module wide keeps its place, one module wide at least', () => {
    const { p, id } = hall(110, 'start')
    const q0 = shapeWarehouse(p, id, { kind: 'hole', x: [4, 5], y: [4, 8] }).project
    const before = hallRuns(typeIn(q0, id))
    const q = setEndsAutomatically(q0, id)
    const t = typeIn(q, id)
    const after = hallRuns(t)
    expect([before.x.modules.length - 1, after.x.modules.length - 1]).toEqual([37, 36])
    expect(t.morphology.holes).toHaveLength(1)
    // a hole is in metres: it stays where it stood, a module wide, whatever lines the box is laid on
    const h = holeRect(t.morphology.holes[0])
    expect(h.x1 - h.x0).toBeGreaterThan(2)
    expect([h.y0, h.y1]).toEqual([xOf(before.y, 4), xOf(before.y, 8)])
    expect(h.x0).toBeCloseTo(xOf(before.x, 4), 6)
    expect(h.x1).toBeCloseTo(xOf(before.x, 5), 6)
    expect(near(after.x)).toBeGreaterThan(0)
  })

  it('110 m at the start: a zone one module wide keeps its place, one module wide at least, the zones still tiling', () => {
    const { p, id, nx, ny } = hall(110, 'start')
    const q0 = updateWarehouseStep(p, id, 'morphology', { zones: [{ id: 'z1', x: [0, 4], y: [0, ny] }, { id: 'z2', x: [4, 5], y: [0, ny] }, { id: 'z3', x: [5, nx], y: [0, ny] }] })
    const before = hallRuns(typeIn(q0, id))
    const t = typeIn(setEndsAutomatically(q0, id), id)
    const after = hallRuns(t)
    const zones = t.morphology.zones!
    expect(zones.map((z) => z.id)).toEqual(['z1', 'z2', 'z3'])
    const [z1, z2, z3] = zones
    expect(z2.x[1] - z2.x[0]).toBeGreaterThanOrEqual(1)
    expect([z1.x[0], z1.x[1], z3.x[0], z3.x[1]]).toEqual([0, z2.x[0], z2.x[1], after.x.modules.length - 1])
    expect(Math.abs(xOf(after.x, z2.x[0]) - xOf(before.x, 4))).toBeLessThanOrEqual(near(after.x))
    expect(Math.abs(xOf(after.x, z2.x[1]) - xOf(before.x, 5))).toBeLessThanOrEqual(near(after.x))
  })

  it('60–200 m, at the start or the end: every hole, zone, notch and dock survives the button, each dock near where it stood', () => {
    const failures: string[] = []
    for (let length = 60; length <= 200; length++)
      for (const ends of ['start', 'end'] as const) {
        const { p: p0, id, nx, ny } = hall(length, ends)
        let p = updateWarehouseStep(p0, id, 'elements', docks([1, 2, Math.floor(nx / 2), nx - 3, nx - 2]))
        p = shapeWarehouse(p, id, { kind: 'hole', x: [4, 5], y: [4, 8] }).project
        p = shapeWarehouse(p, id, { kind: 'hole', x: [nx - 5, nx - 4], y: [4, 8] }).project
        p = shapeWarehouse(p, id, { kind: 'pull', edge: 'e3', from: 4, to: 5, by: -1 }).project
        p = updateWarehouseStep(p, id, 'morphology', { zones: [{ id: 'z1', x: [0, 4], y: [0, ny] }, { id: 'z2', x: [4, 5], y: [0, ny] }, { id: 'z3', x: [5, nx], y: [0, ny] }] })
        const was = typeIn(p, id)
        const q = setEndsAutomatically(p, id)
        if (q === p) continue
        const t = typeIn(q, id)
        const at = `${length} m ${ends}`
        if (t.morphology.holes.length !== was.morphology.holes.length || t.morphology.holes.some((h, i) => JSON.stringify(holeRect(h)) !== JSON.stringify(holeRect(was.morphology.holes[i])))) failures.push(`${at}: holes ${JSON.stringify(t.morphology.holes.map((h) => holeRect(h)))}`)
        if ((t.morphology.zones ?? []).length !== 3 || t.morphology.zones!.some((z) => z.x[1] - z.x[0] < 1)) failures.push(`${at}: zones ${JSON.stringify(t.morphology.zones?.map((z) => z.x))}`)
        if (t.morphology.outline.length !== was.morphology.outline.length) failures.push(`${at}: outline ${was.morphology.outline.length} → ${t.morphology.outline.length} corners`)
        const g0 = generate(was)
        const g1 = generate(t)
        // none lost while the edge has room (late review: two that fall on one module, the second on the nearest free
        // one); each on the module whose centre is nearest (m rounded to the mm), or, that one held by another, its
        // neighbour, within a module and a half
        const width = (k: number) => g1.runs.x.modules[k + 1] - g1.runs.x.modules[k]
        if (g1.doors.length !== g0.doors.length) failures.push(`${at}: docks ${g0.doors.length} → ${g1.doors.length}`)
        for (const d of g0.doors) {
          const e = g1.doors.find((x) => x.element === d.element)
          const nearest = nearestModule(g1.runs.x, d.at.x)
          const held = g1.doors.some((x) => x.element !== d.element && x.edge === d.edge && x.module === nearest)
          const reach = (e: { module: number }) => (held ? 1.5 : 0.5) * width(e.module) + 0.002
          if (!e || Math.abs(e.at.x - d.at.x) > reach(e)) failures.push(`${at}: dock ${d.element} ${d.at.x} → ${e?.at.x}`)
        }
      }
    expect(failures).toEqual([])
  }, 120000)
})

describe('relaidLines (pure): the lines a shape uses on a run relaid at its size', () => {
  const run = (modules: number[]): Run => ({ length: modules[modules.length - 1], bay: 0, bays: [], lines: [], modules, start: 0, end: 0, module: modules[1] - modules[0] })
  const map = (m: Map<number, number> | null) => (m ? Object.fromEntries(m) : null)

  it('each on the line nearest where it stood; two that fall on one kept apart; the walls stay the walls', () => {
    // 3 m → 4 m modules: 3 m to 4 (line 1), 6 m to 4 too (nearest, the first as near two): it goes on to 8 (line 2)
    expect(map(relaidLines([0, 1, 2, 4], run([0, 3, 6, 9, 12]), run([0, 4, 8, 12])))).toEqual({ 0: 0, 1: 1, 2: 2, 4: 3 })
    expect(map(relaidLines([4, 0, 4], run([0, 3, 6, 9, 12]), run([0, 4, 8, 12])))).toEqual({ 0: 0, 4: 3 })
  })

  it('of two that fall on one line, the one whose move is the shorter moves', () => {
    // 3 m and 6 m both nearest 4.5 m (line 2): the second up to 11 m is 5 m, the first down to 1 m is 2 m: the first goes
    expect(map(relaidLines([1, 2], run([0, 3, 6, 12]), run([0, 1, 4.5, 11, 12])))).toEqual({ 1: 1, 2: 2 })
    // 3 m and 6 m both nearest 4 m (line 1): the second up to 8 m is 2 m, the first down to 0 m is 3 m: the second goes
    expect(map(relaidLines([1, 2], run([0, 3, 6, 12]), run([0, 4, 8, 12])))).toEqual({ 1: 1, 2: 2 })
  })

  it('a wall never moves: one pushed against it pushes the others back', () => {
    // lines 3 and 4 (the wall) of a 4-module run on a 3-module one: 9 m to 8 (line 2), the wall 12 m to line 3
    expect(map(relaidLines([0, 3, 4], run([0, 3, 6, 9, 12]), run([0, 4, 8, 12])))).toEqual({ 0: 0, 3: 2, 4: 3 })
  })

  it('more lines used than the run has: null', () => {
    expect(relaidLines([0, 1, 2, 3, 4], run([0, 3, 6, 9, 12]), run([0, 6, 12]))).toBeNull()
  })
})
