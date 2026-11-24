// The optimizer's streets (ST.8, Decision "Streets"): the typology's plan Buildings → Streets → Parking; the Streets
// stage's gates and widths, then Connect on each specimen (the `streets.connect` kind: no gene); the masses' stages keep
// no room for a road between masses; a copy's courts as deep as its block's range lets them (`court.depth`).
import { describe, expect, it } from 'vitest'
import { derive } from '../../../../engine/derive.ts'
import type { CourtByEdge, Project } from '../../../../model/schema.ts'
import { addWarehouseType, placeWarehouse, setTypeCourt } from '../../../../modules/warehouse/actions.ts'
import { demoProject } from '../../../../state/demo.ts'
import { MASSES, STREETS_STAGE, WAREHOUSE_STAGE } from '../../../../typologies/plans.ts'
import { problemOf } from '../problem.ts'
import type { Template } from '../template.ts'

const bare = () => demoProject({ streets: false })

describe('the Streets stage', () => {
  it('Connect has no gene: each specimen, decoded, has the ways its courts lacked, from its own gates', () => {
    const t = problemOf(bare(), 'o1', STREETS_STAGE)
    expect(t.missing).toEqual([])
    expect(t.variables.some((v) => v.kind === 'streets.connect')).toBe(false)
    const q = t.decode(t.seeds[0])
    expect(q.options[0].streets?.segments.length).toBeGreaterThan(0)
    expect(derive(q, 'o1').circulation.reached.sort()).toEqual(['m1', 'm2'])
    // measured on what Connect drew: no circulation warning left (the bare design has its access warnings)
    const issues = STREETS_STAGE.objectives.findIndex((o) => o.measure === 'circulation-issues')
    expect(t.measure(q).objectives[issues]).toBeLessThan(t.measure(bare()).objectives[issues])
    // the project itself is left as it was
    expect(bare().options[0].streets).toBeUndefined()
  })

  it('the masses’ stages keep no room for a road between masses: the streets come after', () => {
    expect(MASSES.constraints.map((c) => c.measure)).not.toContain('road-room')
  })
})

describe('a copy’s court depth', () => {
  const only = (...kinds: { kind: string; step: number }[]): Template => ({ ...MASSES, variables: kinds, objectives: [{ measure: 'brief-gap', sense: 'min' }] })

  it('within its block’s range, a metre a step; decoded, its docked walls’ own; a block without a range, none', () => {
    const made = addWarehouseType(demoProject())
    const placed = placeWarehouse(made.project, made.id, { x: 200, y: 150 }, 0, 'o1')!
    expect(problemOf(placed.project, 'o1', only({ kind: 'court.depth', step: 1 })).variables).toEqual([])
    const p = setTypeCourt(placed.project, made.id, { depth: 35, range: [30, 40] })
    const t = problemOf(p, 'o1', only({ kind: 'court.depth', step: 1 }))
    const v = t.variables.find((x) => x.key === `${placed.id}.court`)!
    expect(v.gene).toMatchObject({ kind: 'real', min: 30, max: 40, step: 1 })
    expect(v.read(p)).toBe(35)
    const q = t.decode(t.variables.map((x) => (x === v ? 32 : x.read(p))))
    const hall = q.masses.find((m) => m.part === 'hall' && q.buildings.find((b) => b.id === placed.id)!.levels.some((l) => l.id === m.levelId))!
    expect(hall.courts?.map((c) => c.depth)).toEqual((hall.docks ?? []).map(() => 32))
    expect(v.read(q)).toBe(32)
    expect(WAREHOUSE_STAGE.variables.map((x) => x.kind)).toContain('court.depth')
  })

  // Phase D.3: a wall whose courts have a shape of their own is the designer's, as its docks are
  const shape = { vertices: [{ x: 6, y: 0, r: 0 }, { x: 30, y: 0, r: 0 }, { x: 30, y: 20, r: 0 }, { x: 6, y: 20, r: 0 }] }
  const withCourts = (courts: CourtByEdge[]) => {
    const made = addWarehouseType(demoProject())
    let p = setTypeCourt(made.project, made.id, { depth: 35, range: [30, 40] })
    p = { ...p, warehouseTypes: p.warehouseTypes!.map((t) => (t.id === made.id ? { ...t, courts } : t)) }
    return placeWarehouse(p, made.id, { x: 200, y: 150 }, 0, 'o1')!
  }
  const hallOf = (p: Project, id: string) => p.masses.find((m) => m.part === 'hall' && p.buildings.find((b) => b.id === id)!.levels.some((l) => l.id === m.levelId))!

  it('a wall with a shaped court keeps its court: only the copy’s other walls take the depth', () => {
    const placed = withCourts([{ edge: 'e3', id: 'c1', shape }])
    const hall = hallOf(placed.project, placed.id)
    const shaped = hall.blockCourts!.find((c) => c.shape)!.t
    expect(hall.docks!.length).toBeGreaterThan(1)
    const t = problemOf(placed.project, 'o1', only({ kind: 'court.depth', step: 1 }))
    const v = t.variables.find((x) => x.key === `${placed.id}.court`)!
    expect(v).toBeTruthy()
    const q = t.decode(t.variables.map((x) => (x === v ? 32 : x.read(placed.project))))
    const after = hallOf(q, placed.id)
    // the others got 32; the shaped wall got no depth of its own, and its shape is as it was
    expect(after.courts!.map((c) => [c.t, c.depth])).toEqual(hall.docks!.filter((d) => d !== shaped).map((d) => [d, 32]))
    expect(after.blockCourts).toEqual(hall.blockCourts)
  })

  it('a copy whose docked walls all have shapes has nothing to vary', () => {
    const placed = withCourts([{ edge: 'e1', id: 'c1', shape }, { edge: 'e3', id: 'c2', shape }])
    const hall = hallOf(placed.project, placed.id)
    expect(hall.blockCourts!.filter((c) => c.shape)).toHaveLength(2)
    expect(hall.docks).toHaveLength(2)
    expect(problemOf(placed.project, 'o1', only({ kind: 'court.depth', step: 1 })).variables).toEqual([])
  })
})
