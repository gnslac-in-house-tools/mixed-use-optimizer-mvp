// The site read as geometry (Phase 8.3–8.6, Decision "Agent sees the site"): on a rectangle, an L and an irregular
// site, what the tools say is what the engine (and so getIssues) says.
import { describe, expect, it } from 'vitest'
import { derive } from '../../../engine/derive.ts'
import { regionsArea } from '../../../engine/geom/boolean.ts'
import { area, signedArea } from '../../../engine/geom/polygon.ts'
import type { Point, Project } from '../../../model/schema.ts'
import { shapedCourts } from '../../../engine/__tests__/stress/scenarios.ts'
import { actions } from '../../../state/actions/index.ts'
import { callTool, toolSchemas } from '../index.ts'
import { IRREGULAR, L_SHAPE, RECTANGLE, siteProject } from './siteFixtures.ts'

const SITES = { rectangle: RECTANGLE, L: L_SHAPE, irregular: IRREGULAR }

type SiteOut = {
  boundary: { points: Point[]; area: number; edges: { i: number; from: Point; to: Point; length: number }[] }
  buildable: { area: number; regions: { outer: Point[]; holes: Point[][]; area: number }[] }
  gates: { id: string; x: number; y: number; edge: number; inward: Point }[]
  standards: { courtDepth: number; roadWidth: number }
}
const read = (p: Project, name: string, input: unknown = {}) => {
  const r = callTool(p, name, input)
  if (!r.ok) throw new Error(r.error)
  expect(r.changed).toBe(false)
  return r.output
}

describe('getSite', () => {
  it('has no frontage tools: the street along a site is an existing street (Phase PE.2)', () => {
    const names = toolSchemas().map((t) => t.name)
    for (const gone of ['addFrontage', 'updateFrontage', 'removeFrontage']) expect(names, gone).not.toContain(gone)
    expect(names).toContain('addExistingRoad')
  })

  for (const [name, points] of Object.entries(SITES))
    it(`reads the ${name} site as the engine does`, () => {
      const p = siteProject(points, { x: 200, y: points[0].y + ((points[1].y - points[0].y) * 200) / (points[1].x - points[0].x) })
      const d = derive(p)
      const out = read(p, 'getSite') as SiteOut
      expect(signedArea(out.boundary.points)).toBeGreaterThan(0)
      expect(out.boundary.area).toBeCloseTo(area(d.site.polygon!), 1)
      expect(out.buildable.area).toBeCloseTo(regionsArea(d.site.buildable), 1)
      expect(out.buildable.regions.reduce((s, r) => s + r.area, 0)).toBeCloseTo(out.buildable.area, 0)
      // the gate in plan coordinates, on its edge (no frontage: any street is a street, Phase PE.2)
      const g = out.gates[0]
      expect(g.x).toBeCloseTo(200, 0)
      expect(g).not.toHaveProperty('onFrontage')
      const e = out.boundary.edges[g.edge]
      expect(e).not.toHaveProperty('frontage')
      expect(out).not.toHaveProperty('frontage')
      const cross = (e.to.x - e.from.x) * (g.y - e.from.y) - (e.to.y - e.from.y) * (g.x - e.from.x)
      expect(Math.abs(cross) / e.length).toBeLessThan(0.05)
      expect(out.standards).toMatchObject({ courtDepth: 40, roadWidth: 8 })
    })

  it('a boundary drawn clockwise is read counter-clockwise, its gate on the edge it stands on', () => {
    const p = siteProject([...RECTANGLE].reverse(), { x: 200, y: 260 }, true)
    const out = read(p, 'getSite') as SiteOut
    expect(signedArea(out.boundary.points)).toBeGreaterThan(0)
    const e = out.boundary.edges[out.gates[0].edge]
    expect([e.from.y, e.to.y]).toEqual([260, 260])
    expect(out.gates[0].inward).toEqual({ x: 0, y: -1 })
  })
})

/** The project after an edit tool, which must have run. */
const edit = (p: Project, name: string, input: unknown) => {
  const r = callTool(p, name, input)
  if (!r.ok) throw new Error(r.error)
  return r.project
}
/** A plain mass (the engine's, as the tests' projects have them): the dock tools read docks, which a block drawn has none of until its own are put. */
const warehouse = (p: Project, x: number, y: number, width = 100, depth = 50, rotation = 0) =>
  actions.addMass(p, { programId: 'warehouse', footprint: { kind: 'rect', center: { x, y }, width, depth, rotation } }).project

type DocksOut = {
  courtDepth: number
  masses: { mass: string; own: boolean; walls: { wall: number; facing: string; doors: number; court: Point[] }[]; reached: boolean; issues: string[] }[]
  noFreeWall: string[]
}

describe('getDocks and the dock tools', () => {
  const base = () => warehouse(siteProject(RECTANGLE, { x: 200, y: 0 }), 200, 160)

  it('a warehouse docks on its front, a court as deep as the standards, as the engine draws it', () => {
    const p = base()
    const out = read(p, 'getDocks') as DocksOut
    const engine = derive(p).circulation.docks
    expect(out.courtDepth).toBe(40)
    expect(out.masses).toHaveLength(1)
    const m = out.masses[0]
    expect(m.own).toBe(false)
    expect(m.walls.map((w) => w.facing)).toEqual(['S'])
    expect(m.walls[0].court).toEqual(engine[0].court.map((q) => ({ x: Math.round(q.x * 100) / 100 || 0, y: Math.round(q.y * 100) / 100 || 0 })))
    expect(m.walls[0].doors).toBe(engine[0].doors.length)
    // no street reaches it yet (since ST.4 none is derived): getIssues says so
    expect(m.reached).toBe(false)
    expect(m.issues).toEqual([expect.stringMatching(/^No truck gate reaches the docks of /)])
  })

  it('setMassDocks puts them on the walls asked, by index; a wall that takes none is refused', () => {
    const p = base()
    const id = p.masses[0].id
    const north = edit(p, 'setMassDocks', { mass: id, walls: [2] })
    const out = read(north, 'getDocks', { mass: id }) as DocksOut
    expect(out.masses[0]).toMatchObject({ own: true, walls: [{ wall: 2, facing: 'N' }] })
    const r = callTool(p, 'setMassDocks', { mass: id, walls: [7] })
    expect(!r.ok && r.error).toMatch(/no wall 7/)
    // [] : none; null: its program's again
    expect((read(edit(p, 'setMassDocks', { mass: id, walls: [] }), 'getDocks') as DocksOut).masses).toEqual([])
    expect((read(edit(north, 'setMassDocks', { mass: id, walls: null }), 'getDocks') as DocksOut).masses[0].own).toBe(false)
  })

  it('what a court runs into is what getIssues says', () => {
    // the first docks south (its own wall: a program's docks would turn to the free back); a second warehouse 15 m in front
    const first = base()
    const p = warehouse(edit(first, 'setMassDocks', { mass: first.masses[0].id, walls: [0] }), 200, 105, 100, 30, 180)
    const out = read(p, 'getDocks') as DocksOut
    const issues = (read(p, 'getIssues') as { code: string; message: string }[]).filter((i) => i.code === 'court' || i.code === 'access').map((i) => i.message)
    const said = out.masses.flatMap((m) => m.issues).concat(out.noFreeWall.map(() => 'covered'))
    expect(issues.length).toBeGreaterThan(0)
    for (const m of out.masses.flatMap((x) => x.issues)) expect(issues).toContain(m)
    expect(said.length).toBe(issues.length)
  })

  it('a court with a shape of its own: its corners on the plan (`shapes`), `court` the frame that holds them (Phase D.3)', () => {
    const p = shapedCourts().find((s) => s.name === 'shaped court: far corners chamfered 6 × 6 m')!.project
    const out = read(p, 'getDocks') as DocksOut
    const engine = derive(p).circulation.docks
    const walls = out.masses.flatMap((m) => m.walls) as (DocksOut['masses'][number]['walls'][number] & { shapes?: Point[][] })[]
    const rounded = (q: Point) => ({ x: Math.round(q.x * 100) / 100 || 0, y: Math.round(q.y * 100) / 100 || 0 })
    const shaped = walls.filter((w) => w.shapes)
    expect(shaped).toHaveLength(engine.filter((d) => d.shapes).length)
    const dock = engine.find((d) => d.shapes)!
    expect(shaped[0].shapes).toEqual(dock.shapes!.map((s) => s.map(rounded)))
    // the chamfer: more corners than the frame's four, and the frame is the rectangle that holds them
    expect(shaped[0].shapes![0].length).toBeGreaterThan(4)
    expect(shaped[0].court).toEqual(dock.court.map(rounded))
    // a wall whose court has no shape says none
    expect(walls.filter((w) => !w.shapes).length).toBe(engine.length - shaped.length)
  })

  it('any program can dock: setProgramDocks gives the office docks', () => {
    let p = actions.addMass(siteProject(RECTANGLE, { x: 200, y: 0 }), { programId: 'office', footprint: { kind: 'rect', center: { x: 200, y: 160 }, width: 60, depth: 30, rotation: 0 } }).project
    expect((read(p, 'getDocks') as DocksOut).masses).toEqual([])
    p = edit(p, 'setProgramDocks', { program: 'office', docks: { per: 'm', every: 12 } })
    expect((read(p, 'getDocks') as DocksOut).masses).toHaveLength(1)
  })
})

type CheckOut = {
  candidates: { id: string; area: number; issues: { code: string; message: string }[] }[]
  issues: { code: string; message: string; new: boolean }[]
  totals: { errors: number; warnings: number; new: number }
}
const said = (list: { code: string; message: string }[]) => list.map((i) => `${i.code}: ${i.message}`)

describe('checkMasses, a dry run', () => {
  for (const [name, points] of Object.entries(SITES))
    it(`on the ${name} site it says what getIssues says once the masses are placed, outside-buildable with its m²`, () => {
      const p = siteProject(points, { x: 200, y: points[0].y + ((points[1].y - points[0].y) * 200) / (points[1].x - points[0].x) })
      // one well inside, one across the setback near the first corner
      const layout = [
        { program: 'warehouse', x: 150, y: 100, width: 90, depth: 40 },
        { program: 'warehouse', x: points[0].x + 20, y: points[0].y + 30, width: 60, depth: 30, rotation: 15 },
      ]
      const out = read(p, 'checkMasses', { masses: layout }) as CheckOut
      const placed = layout.reduce((q, m) => edit(q, 'addMass', m), p)
      const real = read(placed, 'getIssues') as { code: string; message: string }[]
      expect(said(out.issues)).toEqual(said(real))
      const outside = out.issues.filter((i) => i.code === 'outside-buildable')
      expect(outside.length).toBeGreaterThan(0)
      expect(outside[0].message).toMatch(/\d+ m² outside the buildable area/)
      expect(out.candidates[1].issues.map((i) => i.code)).toContain('outside-buildable')
      // nothing changed
      expect(p.masses).toHaveLength(0)
    })

  it('tries a mass there is in a new place, and a removal, as updateMass and removeMasses would', () => {
    const p = warehouse(warehouse(siteProject(RECTANGLE, { x: 200, y: 0 }), 120, 160), 300, 160)
    const [a, b] = p.masses.map((m) => m.id)
    const out = read(p, 'checkMasses', { masses: [{ mass: a, x: 290 }], remove: [] }) as CheckOut
    expect(out.candidates[0].id).toBe(a)
    expect(out.issues.find((i) => i.code === 'overlap')?.new).toBe(true)
    const real = read(edit(p, 'updateMass', { mass: a, x: 290 }), 'getIssues') as { code: string; message: string }[]
    expect(said(out.issues)).toEqual(said(real))
    const gone = read(p, 'checkMasses', { masses: [{ mass: a, x: 290 }], remove: [b] }) as CheckOut
    expect(gone.issues.some((i) => i.code === 'overlap')).toBe(false)
  })

  it('a candidate that cannot be built says why', () => {
    const p = siteProject(RECTANGLE, { x: 200, y: 0 })
    const r = callTool(p, 'checkMasses', { masses: [{ program: 'warehouse', x: 10 }] })
    expect(!r.ok && r.error).toMatch(/give x, y, width and depth/)
  })
})

type PackOut = {
  asked: number
  placed: number
  area: number
  masses: { x: number; y: number; width: number; depth: number; rotation: number }[]
  limit: { reason: string; message: string; closer?: { gap: number; placed: number }[] } | null
  applied: false | string[]
}
const pack = (p: Project, input: object) => {
  const r = callTool(p, 'packMasses', input)
  if (!r.ok) throw new Error(r.error)
  return { project: r.project, out: r.output as PackOut }
}
/** What getIssues says that a placed layout must not: errors, courts, overlaps (its access is the streets', drawn after). */
const broken = (p: Project) =>
  (read(p, 'getIssues') as { code: string; severity: string; message: string }[]).filter((i) => i.severity === 'error' || ['court', 'overlap'].includes(i.code))

// a site of about 102,800 m², as the user's: 10 m setback, 60 % coverage (industrial's), a truck gate on its street
const PARK = [
  { x: 0, y: 0 },
  { x: 360, y: 0 },
  { x: 360, y: 285.6 },
  { x: 0, y: 285.6 },
]

describe('packMasses', () => {
  it('ten warehouses of about 5,000 m² on 10 ha: how many fit a road apart, that ten fit closer, and placed with no court or overlap', { timeout: 60_000 }, () => {
    const p = siteProject(PARK, { x: 180, y: 0 })
    const { project, out } = pack(p, { program: 'warehouse', count: 10, area: 5000 })
    // only said: nothing changed
    expect(project).toBe(p)
    expect(out.placed).toBeLessThan(10)
    expect(out.limit?.reason).toBe('shape')
    const closer = out.limit!.closer!.find((c) => c.placed === 10)!
    expect(closer).toBeDefined()
    // placed at that gap: ten, each within the tolerance, none outside the buildable area, no court or access Issue
    const placed = pack(p, { program: 'warehouse', count: 10, area: 5000, gap: closer.gap, apply: true })
    expect(placed.out.placed).toBe(10)
    expect(placed.out.limit).toBeNull()
    expect(placed.out.applied).toHaveLength(10)
    expect(placed.out.area).toBeGreaterThanOrEqual(4500)
    expect(placed.project.masses).toHaveLength(10)
    expect(broken(placed.project)).toEqual([])
    // each court clear; reached once the streets are drawn (since ST.4 none is derived)
    expect((read(placed.project, 'getDocks') as DocksOut).masses.every((m) => m.issues.every((i) => i.startsWith('No truck gate reaches')))).toBe(true)
  })

  for (const [name, points] of Object.entries({ L: L_SHAPE, irregular: IRREGULAR }))
    it(`on the ${name} site what it places breaks nothing getIssues checks`, { timeout: 60_000 }, () => {
      const p = siteProject(points, { x: 200, y: points[0].y + ((points[1].y - points[0].y) * 200) / (points[1].x - points[0].x) })
      const { project, out } = pack(p, { program: 'warehouse', count: 6, area: 4000, apply: true })
      expect(out.placed).toBeGreaterThan(0)
      expect(project.masses).toHaveLength(out.placed)
      expect(broken(project)).toEqual([])
    })

  it('packs around what is there, and a program without docks in rows without courts', { timeout: 60_000 }, () => {
    const p = warehouse(siteProject(PARK, { x: 180, y: 0 }), 180, 150, 120, 60)
    const { project, out } = pack(p, { program: 'office', count: 4, area: 1500, apply: true })
    expect(out.placed).toBe(4)
    expect(broken(project)).toEqual([])
    expect((read(project, 'getDocks') as DocksOut).masses).toHaveLength(1)
  })

  it('stops at the coverage limit and says so', { timeout: 60_000 }, () => {
    // 20 % of 102,816 m²: 20,563 m², four warehouses of 5,000 m²
    const p = edit(siteProject(PARK, { x: 180, y: 0 }), 'updateSiteRules', { maxCoverage: 0.2 })
    const { out } = pack(p, { program: 'warehouse', count: 6, area: 5000, tolerance: 0 })
    expect(out.placed).toBe(4)
    expect(out.limit).toMatchObject({ reason: 'coverage', message: expect.stringMatching(/coverage limit \(20 %/) })
  })
})
