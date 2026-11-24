// Short end bays join (Decision "Grid by line", GR.1): an end bay under the hall's rule (absent, two thirds of a bay)
// joins the whole bay next to it; typed in step 2 (setHallJoin) or read from an older file (project v11, block format
// 2), the docks stay on their modules (Decision "Elements by module"; an older file's rules listed by bay first stay
// in the bays where they stood) and the copies' masses follow.
import { describe, expect, it } from 'vitest'
import { BlockSchema, type HallElement, type Project, type WarehouseType } from '../../../../model/schema.ts'
import { migrate } from '../../../../model/migrate.ts'
import { demoProject } from '../../../../state/demo.ts'
import { addWarehouseType, lockWarehouseStep, placeWarehouse, setHallJoin, updateWarehouseStep } from '../../actions.ts'
import { stepStatus } from '../steps.ts'
import { runAlong } from '../bays.ts'
import { copyParts } from '../copies.ts'
import { generate, hallRuns } from '../generate.ts'
import { blockOf } from '../library.ts'
import { joinBlockEnds, legacyDoorsAt, migrateBlock, type LegacyElement, type OldElementsType } from '../migrate.ts'
import { moveMasses } from '../../../../state/actions/masses.ts'
import { footprintPolygon } from '../../../../engine/geom/footprint.ts'
import { centroid } from '../../../../engine/geom/polygon.ts'

/** A dock on each of these modules of the front. */
const docks = (modules: number[]): HallElement[] => modules.map((module, i) => ({ id: `d${i + 1}`, kind: 'dock', edge: 'e1', module, width: 3 }))
/** The same docks as an older file's rule: every module of bays 1, 2 and 17. */
const rule: LegacyElement = { id: 'd1', kind: 'dock', edge: 'e1', bays: [1, 2, 17], count: 4, width: 3 }
/** Two sets of doors standing in the same places, each within a few mm (a module's centre and a rule's piece on it
 *  differ by their rounding). */
function expectAt(a: { at: { x: number; y: number } }[], b: { at: { x: number; y: number } }[]) {
  const cm = (v: number) => Math.round(v * 100)
  const sorted = (l: { at: { x: number; y: number } }[]) => l.map((d) => d.at).sort((p, q) => cm(p.x) - cm(q.x) || cm(p.y) - cm(q.y))
  const [x, y] = [sorted(a), sorted(b)]
  expect(x).toHaveLength(y.length)
  x.forEach((p, i) => {
    expect(p.x).toBeCloseTo(y[i].x, 2)
    expect(p.y).toBeCloseTo(y[i].y, 2)
  })
}

/** A block 218 × 96 m on 12 m bays, docked on its front on every module of bays 1, 2 and 17 (its end bays 7 m under
 *  a rule of 6 m: modules 2–9 and 66–69), placed once; its rule `joinUnder`. */
function block(joinUnder?: number) {
  let { project: p, id } = addWarehouseType(demoProject())
  p = updateWarehouseStep(p, id, 'hall', { length: 218, width: 96, ends: 'both' })
  if (joinUnder !== undefined) p = setHallJoin(p, id, joinUnder)
  p = updateWarehouseStep(p, id, 'elements', docks([2, 3, 4, 5, 6, 7, 8, 9, 66, 67, 68, 69]))
  const placed = placeWarehouse(p, id, { x: 100, y: 100 }, 0, p.options[0].id)!
  return { p: placed.project, id, copy: placed.id }
}
const typeIn = (p: Project | Record<string, unknown>, id: string) => ((p.warehouseTypes ?? []) as WarehouseType[]).find((t) => t.id === id)!
const hallOf = (p: Project, building: string) => {
  const levels = new Set(p.buildings.find((b) => b.id === building)!.levels.map((l) => l.id))
  return p.masses.find((m) => levels.has(m.levelId) && m.part === 'hall')!
}

describe('the rule', () => {
  it('218 m of 12 m bays: the 7 m end bays join theirs, 19 m each; lines B and U go, the modules stay as many', () => {
    const r = runAlong(218, 12, 4, 'both')
    expect([r.start, r.end]).toEqual([19, 19])
    expect(r.bays.filter((b) => !b.end)).toHaveLength(15)
    expect(r.lines).not.toContain(7)
    expect(r.lines).not.toContain(211)
    const half = runAlong(218, 12, 4, 'both', false, 6)
    expect([half.start, half.end]).toEqual([7, 7])
    expect(r.modules).toHaveLength(half.modules.length)
  })

  it('a rule typed: under 6 m, 7 m stays; 0, none joins; at one end, 7 m joins and 8 m (two thirds) stays', () => {
    expect(runAlong(218, 12, 4, 'both', false, 6).start).toBe(7)
    expect(runAlong(218, 12, 4, 'both', false, 0).start).toBe(7)
    expect(runAlong(199, 12, 4, 'end')).toMatchObject({ start: 0, end: 19 })
    expect(runAlong(200, 12, 4, 'end')).toMatchObject({ start: 0, end: 8 })
    // past a bay, held to one: every end bay joins
    expect(runAlong(224, 12, 4, 'both', false, 50)).toMatchObject({ start: 22, end: 22 })
  })

  it('a bump’s own short end bay stays (shortEnds); fewer than two whole bays to join, the ends stay', () => {
    expect(runAlong(218, 12, 4, 'both', true).start).toBe(7)
    expect(runAlong(26, 12, 4, 'both')).toMatchObject({ start: 7, end: 7 })
  })
})

describe('typed in step 2 (setHallJoin)', () => {
  it('two thirds again: the docks stay on their modules, the copy’s mass follows; one undo step', () => {
    const { p, id, copy } = block(6)
    expect(hallRuns(typeIn(p, id)).x.start).toBe(7)
    const q = setHallJoin(p, id, null)
    const t = typeIn(q, id)
    expect(t.hall.joinUnder).toBeUndefined()
    expect(hallRuns(t).x.start).toBe(19)
    // a joined bay keeps its modules: each dock on its own, the first two now in the 19 m end bay
    expect(t.elements).toEqual(typeIn(p, id).elements)
    expect(generate(t).doors.map((d) => d.module)).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 66, 67, 68, 69])
    const b = q.buildings.find((x) => x.id === copy)!
    expect(hallOf(q, copy).doorsAt).toEqual(copyParts(t, b.warehouse!)[0].doorsAt)
    expect(hallOf(q, copy).doorsAt).not.toEqual(hallOf(p, copy).doorsAt)
  })

  it('its field lives in step 1 (the grid): step 1 is the step it opens, the later locked ones to lock again (final review, Minor 6)', () => {
    let { p, id } = block(6)
    p = lockWarehouseStep(p, id, 'grid')
    p = lockWarehouseStep(p, id, 'hall')
    const t = typeIn(setHallJoin(p, id, 8), id)
    expect(stepStatus(t, 'grid')).not.toBe('locked')
    expect(t.locks?.hall).toBe('again')
  })

  it('the same rule, or not a figure: the same project', () => {
    const { p, id } = block(6)
    expect(setHallJoin(p, id, 6)).toBe(p)
    expect(setHallJoin(p, id, -1)).toBe(p)
    expect(setHallJoin(p, id, Number.NaN)).toBe(p)
    expect(setHallJoin(p, 'nope', 8)).toBe(p)
    const none = block().p
    expect(setHallJoin(none, id, null)).toBe(none)
  })
})

describe('an older file', () => {
  // a file of version 11: laid under the rule of then (half a bay), the same as 6 m here, without the field
  const older = () => {
    const { p, id, copy } = block(6)
    const json = JSON.parse(JSON.stringify(p)) as Record<string, unknown>
    delete (typeIn(json, id).hall as { joinUnder?: number }).joinUnder
    ;(typeIn(json, id) as unknown as OldElementsType).elements = [rule]
    return { json: { ...json, version: 11 }, p, id, copy }
  }

  it('a project of version 11: its blocks joined at two thirds, docks where they stood, the copies’ masses made again', () => {
    const { json, id, copy } = older()
    // version 12: the rule's bays listed again where they stood, bay 1 (7–19 m) now the 19 m end bay
    const v12 = migrate(json, 12)
    expect((typeIn(v12, id) as unknown as OldElementsType).elements).toEqual([{ ...rule, bays: [0, 1, 16] }])
    const q = migrate(json) as unknown as Project
    expect(q.version).toBe(20)
    const t = typeIn(q, id)
    expect(t.hall.joinUnder).toBeUndefined()
    // then by module, each dock where the rule put it
    expectAt(generate(t).doors, legacyDoorsAt(typeIn(v12, id) as unknown as OldElementsType))
    expect(hallOf(q, copy).doorsAt).toEqual(copyParts(t, q.buildings.find((b) => b.id === copy)!.warehouse!)[0].doorsAt)
  })

  it('a copy moved by hand since it was made: its masses made again where its hall stands, not where it was placed', () => {
    const { p, id, copy } = block(6)
    const hall = hallOf(p, copy)
    const moved = moveMasses(p, [hall.id], { x: 30, y: -20 })
    const json = JSON.parse(JSON.stringify(moved)) as Record<string, unknown>
    delete (typeIn(json, id).hall as { joinUnder?: number }).joinUnder
    const q = migrate({ ...json, version: 11 }) as unknown as Project
    const mid = (r: Project) => centroid(footprintPolygon(hallOf(r, copy).footprint))
    expect(mid(q).x).toBeCloseTo(mid(moved).x, 3)
    expect(mid(q).y).toBeCloseTo(mid(moved).y, 3)
  })

  it('a block of its own rule, or one the rule does not change: as it was', () => {
    const { p } = block(6)
    const json = { ...(JSON.parse(JSON.stringify(p)) as Record<string, unknown>), version: 11 }
    expect({ ...(migrate(json, 16) as Record<string, unknown>), version: 11 }).toEqual(json)
  })

  it('a block’s file of format 2: format 5, its end bays joined, its docks where they stood', () => {
    const { p, id } = block(6)
    const b = blockOf(p, id, 'blk', 1, 0)!
    const type = { ...(JSON.parse(JSON.stringify(b.type)) as WarehouseType), elements: [rule] } as unknown as OldElementsType
    delete (type.hall as { joinUnder?: number }).joinUnder
    const read = BlockSchema.parse(migrateBlock({ ...b, formatVersion: 2, type }))
    expect(read.formatVersion).toBe(6)
    const joined = joinBlockEnds(type) as OldElementsType
    expect(joined.elements).toEqual([{ ...rule, bays: [0, 1, 16] }])
    expectAt(generate(read.type).doors, legacyDoorsAt(joined))
  })
})
