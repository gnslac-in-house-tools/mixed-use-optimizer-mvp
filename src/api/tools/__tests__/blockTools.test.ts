// The agent's tools make blocks (Phase D.2 task 7; Decision "Draw makes a block"): addMass and addMassFromPoints draw a block of the
// program's type (the ids they return are the halls'), packMasses with apply places blocks, mergeMasses joins blocks of one type, and
// checkMasses stays a dry run on plain masses on a copy: it changes nothing and makes no block.
import { describe, expect, it } from 'vitest'
import { derive } from '../../../engine/derive.ts'
import { area } from '../../../engine/geom/polygon.ts'
import { footprintPolygon } from '../../../engine/geom/footprint.ts'
import { ProjectSchema, type Project } from '../../../model/schema.ts'
import { demoProject } from '../../../state/demo.ts'
import { callTool, toolSchemas } from '../index.ts'
import { RECTANGLE, siteProject } from './siteFixtures.ts'

const run = (p: Project, name: string, input: object) => {
  const r = callTool(p, name, input)
  if (!r.ok) throw new Error(r.error)
  return r
}
const hallOf = (p: Project, id: string) => p.masses.find((m) => m.id === id)!
const copyOf = (p: Project, massId: string) => p.buildings.find((b) => b.levels.some((l) => l.id === hallOf(p, massId).levelId))!

describe('addMass makes a block', () => {
  const p = demoProject()

  it('a rectangle of a program: its hall’s id, a building of its own, the program’s type made, the rectangle its outer face', () => {
    const r = run(p, 'addMass', { program: 'office', x: 300, y: 200, width: 60, depth: 30, rotation: 20 })
    const id = (r.output as { id: string }).id
    const hall = hallOf(r.project, id)
    expect(hall).toMatchObject({ part: 'hall', programId: 'office', footprint: { kind: 'rect', width: 60, depth: 30, rotation: 20 } })
    expect(copyOf(r.project, id).warehouse!.place.angle).toBe(20)
    expect(r.project.warehouseTypes!.map((t) => t.name)).toEqual(['Office'])
    expect(r.project.buildings).toHaveLength(p.buildings.length + 1)
    expect(ProjectSchema.safeParse(r.project).success).toBe(true)
    // the second one of a program is a variant of its type
    const again = run(r.project, 'addMass', { program: 'office', x: 100, y: 100, width: 30, depth: 20, name: 'Gatehouse' })
    const second = hallOf(again.project, (again.output as { id: string }).id)
    expect(copyOf(again.project, second.id).warehouse!.overrides).toBeDefined()
    expect(copyOf(again.project, second.id).name).toBe('Gatehouse')
    expect(again.project.warehouseTypes).toHaveLength(1)
  })

  it('no program shares the Block type; a rectangle too small for its walls is refused', () => {
    const r = run(p, 'addMass', { program: null, x: 300, y: 200, width: 20, depth: 10 })
    expect(r.project.warehouseTypes!.map((t) => [t.name, t.program])).toEqual([['Block', null]])
    const small = callTool(p, 'addMass', { program: null, x: 300, y: 200, width: 0.4, depth: 0.4 })
    expect(small).toEqual({ ok: false, error: expect.stringMatching(/too small/) })
  })

  it('the height asked is the block’s', () => {
    const r = run(p, 'addMass', { program: 'office', x: 300, y: 200, width: 20, depth: 10, height: 9 })
    expect(hallOf(r.project, (r.output as { id: string }).id).height).toBe(9)
  })
})

describe('addMassFromPoints makes a block', () => {
  const p = demoProject()
  const L = [
    { x: 0, y: 0 },
    { x: 40, y: 0 },
    { x: 40, y: 20 },
    { x: 20, y: 20 },
    { x: 20, y: 40 },
    { x: 0, y: 40 },
  ]
  const sq = (x0: number, y0: number, x1: number, y1: number) => [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ]

  it('an L is a block with a free outline, its area the stroke’s', () => {
    const r = run(p, 'addMassFromPoints', { program: 'office', points: L })
    const hall = hallOf(r.project, (r.output as { id: string }).id)
    expect(hall.part).toBe('hall')
    expect(Math.abs(area(footprintPolygon(hall.footprint)))).toBeCloseTo(1200, 6)
    expect(r.project.warehouseTypes![0].morphology.outline).toHaveLength(6)
  })

  it('its holes are cuts of the block, a corridor kept; one outside is refused', () => {
    const big = [{ x: 0, y: -200 }, { x: 80, y: -200 }, { x: 100, y: -170 }, { x: 80, y: -140 }, { x: 0, y: -140 }]
    const r = run(p, 'addMassFromPoints', { program: 'warehouse', points: big, holes: [{ points: sq(10, -190, 30, -170), corridor: 2 }, { points: sq(45, -190, 65, -170) }] })
    const hall = hallOf(r.project, (r.output as { id: string }).id)
    expect(hall.holes).toHaveLength(2)
    expect(hall.holes![0].corridor).toBe(2)
    expect(derive(r.project).masses[hall.id].area).toBeCloseTo(80 * 60 + (60 * 20) / 2 - 800, 4)
    const outside = callTool(p, 'addMassFromPoints', { program: 'warehouse', points: big, holes: [{ points: sq(300, 200, 310, 210) }] })
    expect(outside).toEqual({ ok: false, error: 'The hole falls outside the block: give corners inside its outline.' })
  })
})

describe('mergeMasses on blocks', () => {
  const p = demoProject()
  const two = (a: string, b: string) => {
    const one = run(p, 'addMass', { program: a, x: 300, y: 200, width: 40, depth: 20 })
    const ida = (one.output as { id: string }).id
    const next = run(one.project, 'addMass', { program: b, x: 340, y: 200, width: 40, depth: 20 })
    return { project: next.project, ids: [ida, (next.output as { id: string }).id] }
  }

  it('blocks of one type join; of two types the tool says why not', () => {
    const same = two('office', 'office')
    const r = run(same.project, 'mergeMasses', { masses: same.ids })
    expect(hallOf(r.project, same.ids[0]).footprint).toMatchObject({ kind: 'rect', width: 80, depth: 20 })
    expect(r.project.masses.some((m) => m.id === same.ids[1])).toBe(false)
    const other = two('office', 'warehouse')
    expect(callTool(other.project, 'mergeMasses', { masses: other.ids })).toEqual({ ok: false, error: 'Blocks of different types do not join: give them one type first.' })
  })
})

describe('packMasses and checkMasses', () => {
  const base = () => siteProject(RECTANGLE, { x: 200, y: 0 })

  it('with apply it places blocks, each a building of its own, the ids those of the halls', { timeout: 60_000 }, () => {
    const p = base()
    const r = run(p, 'packMasses', { program: 'office', count: 3, area: 1500, apply: true })
    const out = r.output as { placed: number; applied: string[] }
    expect(out.placed).toBe(3)
    expect(out.applied).toHaveLength(3)
    for (const id of out.applied) {
      expect(hallOf(r.project, id)).toMatchObject({ part: 'hall', programId: 'office' })
      expect(copyOf(r.project, id).warehouse).toBeDefined()
    }
    expect(r.project.warehouseTypes!.map((t) => t.name)).toEqual(['Office'])
    expect(r.project.buildings.filter((b) => b.warehouse)).toHaveLength(3)
  })

  it('without apply it only says it; checkMasses is a dry run: the project is untouched and nothing is made a block', { timeout: 60_000 }, () => {
    const p = base()
    const said = run(p, 'packMasses', { program: 'office', count: 2, area: 1500 })
    expect(said.project).toBe(p)
    const dry = run(p, 'checkMasses', { masses: [{ program: 'office', x: 200, y: 130, width: 60, depth: 30 }] })
    expect(dry.project).toBe(p)
    expect(dry.changed).toBe(false)
    expect(p.warehouseTypes).toBeUndefined()
  })
})

describe('what the tools say of the blocks they make', () => {
  const said = (name: string) => toolSchemas().find((t) => t.name === name)!.description

  it('a drawn block has no docks: packMasses, addMass and addFromBrief do not promise any', () => {
    expect(said('packMasses')).not.toMatch(/docks toward/)
    for (const name of ['packMasses', 'addMass', 'addFromBrief']) expect(said(name), name).toMatch(/no docks|without docks|with no docks of their own/)
  })
})
