// A saved project's free masses become blocks when it opens (Phase D.2 task 8; Decision "Free masses migrate"): step 16 → 17's second
// half. Each test builds a version 16 project as JSON, reads it as a file is read (`migrate`) and checks the project that comes out: the
// block (its type or its variant), its building and level, what the report says, and that what the KPIs counted is what they count.
import { describe, expect, it } from 'vitest'
import { deriveMassing } from '../../engine/derive.ts'
import { footprintContour, footprintPolygon } from '../../engine/geom/footprint.ts'
import { area } from '../../engine/geom/polygon.ts'
import { dockableWalls } from '../../modules/docks/engine/docks.ts'
import { demoProject } from '../../state/demo.ts'
import { newWarehouseType } from '../../modules/warehouse/engine/defaults.ts'
import { migrate, migrateNotes } from '../migrate.ts'
import { ProjectSchema, type Footprint, type Mass, type Point, type Polygon, type Project } from '../schema.ts'

type Json = Record<string, unknown>

const rect = (cx: number, cy: number, width: number, depth: number, rotation = 0): Footprint => ({ kind: 'rect', center: { x: cx, y: cy }, width, depth, rotation })
const contour = (pts: [number, number][], extra: Json = {}): Footprint => ({ kind: 'contour', contour: { vertices: pts.map(([x, y]) => ({ x, y, r: 0 })), ...extra } as never })

const demo = demoProject({ streets: false })
/** A version 16 project: the demo's site, programs and grid, with these masses (free ones, as that version had them). */
const data = (masses: Json[], patch: Json = {}): Json => JSON.parse(JSON.stringify({ ...demo, masses, version: 16, ...patch }))
const free = (id: string, patch: Json = {}): Json => ({ id, name: `Mass ${id}`, levelId: 'l1', programId: 'warehouse', footprint: rect(100, 100, 60, 30), ...patch })
/** The project a file of that data is read as. */
const open = (d: Json): Project => ProjectSchema.parse(migrate(d))
/** The same data as the current version reads it, before any mass is a block: the numbers "as before". */
const before = (d: Json): Project => ProjectSchema.parse({ ...d, version: 20 })

const mass = (p: Project, id: string): Mass => p.masses.find((m) => m.id === id)!
const buildingOf = (p: Project, m: Mass) => p.buildings.find((b) => b.levels.some((l) => l.id === m.levelId))!
const same = (a: Polygon, b: Polygon) => a.length === b.length && a.every((p) => b.some((q) => Math.hypot(p.x - q.x, p.y - q.y) < 1e-6))
const figures = (p: Project) => {
  const m = deriveMassing(p).metrics
  return { builtFootprint: m.builtFootprint, gfa: m.gfa, builtVolume: m.builtVolume, areaByProgram: m.areaByProgram, footprintByProgram: m.footprintByProgram }
}
const near = (a: number, b: number, tol = 1e-6) => expect(Math.abs(a - b), `${a} vs ${b}`).toBeLessThan(tol)
const doorsOf = (p: Project, id: string): Point[] => deriveMassing(p).docks.docks.filter((d) => d.massId === id).flatMap((d) => d.doors)

describe('the shapes', () => {
  it('a rect mass of a program with a type: a variant with its own outline, its id the hall’s, its footprint and its figures as before', () => {
    const type = newWarehouseType('wt1', 'Warehouse A', { program: 'warehouse' })
    const d = data([free('m1')], { warehouseTypes: [type] })
    const was = before(d)
    const q = open(d)
    const m = mass(q, 'm1')
    expect(m.part).toBe('hall')
    expect(same(footprintPolygon(m.footprint), footprintPolygon(mass(was, 'm1').footprint))).toBe(true)
    const b = buildingOf(q, m)
    expect(b.warehouse!.type).toBe('wt1')
    expect(q.warehouseTypes).toHaveLength(1)
    expect(b.warehouse!.overrides!.morphology!.outline).toHaveLength(4)
    near(deriveMassing(q).masses.m1.area, deriveMassing(was).masses.m1.area)
    const a = figures(was)
    const z = figures(q)
    near(z.builtFootprint, a.builtFootprint)
    near(z.gfa, a.gfa)
    near(z.builtVolume, a.builtVolume)
    expect(z.areaByProgram).toEqual(a.areaByProgram)
  })

  it('the first mass of a program without a type makes the type itself; the next one is a variant of it', () => {
    const d = data([free('m1'), free('m2', { footprint: rect(300, 100, 40, 20) })])
    const q = open(d)
    expect(q.warehouseTypes).toHaveLength(1)
    const t = q.warehouseTypes![0]
    expect(t.program).toBe('warehouse')
    const a = buildingOf(q, mass(q, 'm1')).warehouse!
    const b = buildingOf(q, mass(q, 'm2')).warehouse!
    expect(a.type).toBe(t.id)
    expect(a.overrides?.morphology).toBeUndefined()
    expect(b.type).toBe(t.id)
    expect(b.overrides!.morphology!.outline).toHaveLength(4)
  })

  it('a contour with an arc, a radius and a chamfer: kept as the block’s outline', () => {
    const f: Footprint = {
      kind: 'contour',
      contour: {
        vertices: [
          { x: 100, y: 100, r: 0 },
          { x: 140, y: 100, r: 0, chamfer: [2, 3] },
          { x: 140, y: 130, r: 4 },
          { x: 100, y: 130, r: 0 },
        ],
        arcs: { '3': -0.2 },
      },
    }
    const d = data([free('m1', { footprint: f })])
    const was = before(d)
    const q = open(d)
    const t = q.warehouseTypes![0]
    expect(Object.keys(t.morphology.arcs ?? {})).toHaveLength(1)
    expect(t.morphology.outline.some((c) => c.chamfer)).toBe(true)
    expect(t.morphology.outline.some((c) => c.r)).toBe(true)
    const was$ = deriveMassing(was).masses.m1.area
    expect(Math.abs(deriveMassing(q).masses.m1.area - was$) / was$).toBeLessThan(0.01)
  })

  it('a hole with a corridor: kept, grown by the wall, its corridor with it', () => {
    const sq = { vertices: [{ x: 120, y: 105, r: 0 }, { x: 130, y: 105, r: 0 }, { x: 130, y: 115, r: 0 }, { x: 120, y: 115, r: 0 }], corridor: 2 }
    const d = data([free('m1', { footprint: rect(125, 115, 60, 40), holes: [sq] })])
    const was = before(d)
    const q = open(d)
    const t = q.warehouseTypes![0]
    expect(t.morphology.holes).toHaveLength(1)
    expect(t.morphology.holes[0].corridor).toBe(2)
    near(deriveMassing(q).masses.m1.area, deriveMassing(was).masses.m1.area, 1e-3)
    expect(deriveMassing(q).masses.m1.holes).toHaveLength(1)
  })
})

describe('docks and courts', () => {
  it('its default docks become dock elements where derive showed them', () => {
    const d = data([free('m1', { footprint: rect(120, 110, 160, 80) })])
    const was = before(d)
    const old = doorsOf(was, 'm1')
    expect(old.length).toBeGreaterThan(5)
    const q = open(d)
    const t = q.warehouseTypes![0]
    expect(t.elements.filter((e) => e.kind === 'dock')).toHaveLength(old.length)
    const now = doorsOf(q, 'm1')
    expect(now).toHaveLength(old.length)
    // each old door has one within half a module (1.5 m) of it
    for (const o of old) expect(now.some((n) => Math.hypot(n.x - o.x, n.y - o.y) <= 1.5 + 1e-6)).toBe(true)
    expect(migrateNotes(d).join(' ')).not.toMatch(/angled/)
  })

  it('a block turned on the site keeps its docks (its frame is its rotation)', () => {
    const d = data([free('m1', { footprint: rect(120, 110, 100, 50, 30) })])
    const old = doorsOf(before(d), 'm1')
    const q = open(d)
    const now = doorsOf(q, 'm1')
    expect(now).toHaveLength(old.length)
    for (const o of old) expect(now.some((n) => Math.hypot(n.x - o.x, n.y - o.y) <= 1.5 + 1e-6)).toBe(true)
  })

  it('docks by t on a wall along the grid and on an angled one: the angled one is dropped and counted', () => {
    const f = contour([
      [100, 100],
      [160, 100],
      [160, 120],
      [140, 140],
      [100, 140],
    ])
    const poly = footprintPolygon(f)
    const walls = dockableWalls(poly)
    const front = walls.find((w) => w.i === 0)!
    const slant = walls.find((w) => w.i === 2)!
    const d = data([free('m1', { footprint: f, docks: [front.t, slant.t] })])
    const was = before(d)
    const old = deriveMassing(was).docks.docks.filter((x) => x.massId === 'm1')
    const lost = old.find((x) => x.wall === 2)!.doors.length
    expect(lost).toBeGreaterThan(0)
    const q = open(d)
    const now = deriveMassing(q).docks.docks.filter((x) => x.massId === 'm1')
    expect(now.map((x) => Math.round(x.a.y * 100) / 100)).toEqual([100])
    expect(now[0].doors).toHaveLength(old.find((x) => x.wall === 0)!.doors.length)
    expect(migrateNotes(d).join(' ')).toContain(`${lost} ${lost === 1 ? 'dock' : 'docks'} on angled walls ${lost === 1 ? 'was' : 'were'} left out`)
  })

  it('a court depth by t holds on its wall, whichever corner the outline starts at', () => {
    // a rectangle drawn from its right-bottom corner: its walls are in another order than the block’s
    const f = contour([
      [160, 100],
      [160, 130],
      [100, 130],
      [100, 100],
    ])
    const walls = dockableWalls(footprintPolygon(f))
    const bottom = walls.find((w) => w.i === 3)!
    const d = data([free('m1', { footprint: f, docks: [bottom.t], courts: [{ t: bottom.t, depth: 25 }] })])
    const q = open(d)
    const m = mass(q, 'm1')
    expect(m.courts).toHaveLength(1)
    const docks = deriveMassing(q).docks.docks.filter((x) => x.massId === 'm1')
    expect(docks).toHaveLength(1)
    expect(docks[0].depth).toBe(25)
    expect(docks[0].ownDepth).toBe(true)
    near(docks[0].a.y, 100)
    near(docks[0].b.y, 100)
  })
})

describe('buildings and levels', () => {
  it('two masses of one building: the first takes it over, the second gets a building of its own in the same options, its level copied, its platform joined', () => {
    const d = data([free('m1'), free('m2', { footprint: rect(300, 100, 40, 20) })], { buildings: [{ id: 'b1', name: 'Building 1', color: '#4e79a7', levelHeight: 12, levels: [{ id: 'l1', name: 'L1', elevation: 0, height: 12, repeat: 2 }] }] })
    const q = open(d)
    const a = buildingOf(q, mass(q, 'm1'))
    const b = buildingOf(q, mass(q, 'm2'))
    expect(a.id).toBe('b1')
    expect(a.name).toBe('Mass m1')
    expect(b.id).not.toBe('b1')
    expect(b.name).toBe('Mass m2')
    expect(b.color).toBe(a.color)
    expect(b.levels).toHaveLength(1)
    expect(b.levels[0]).toMatchObject({ elevation: 0, height: 12, repeat: 2 })
    expect(b.levels[0].id).not.toBe('l1')
    expect(b.platform?.joined).toBe('b1')
    for (const o of q.options) if (o.buildingIds.includes('b1')) expect(o.buildingIds).toContain(b.id)
    expect(b.warehouse).toBeDefined()
  })

  it('an upper-level mass stays on its level', () => {
    const d = data([free('m1', { levelId: 'l2', footprint: rect(100, 100, 40, 20), programId: 'office' })], {
      buildings: [
        {
          id: 'b1',
          name: 'Building 1',
          color: '#4e79a7',
          levelHeight: 12,
          levels: [
            { id: 'l1', name: 'L1', elevation: 0, height: 12, repeat: 1 },
            { id: 'l2', name: 'L2', elevation: 12, height: 4, repeat: 1 },
          ],
        },
      ],
    })
    const q = open(d)
    const m = mass(q, 'm1')
    expect(m.levelId).toBe('l2')
    expect(m.height).toBe(4)
    expect(buildingOf(q, m).warehouse).toBeDefined()
    // the office keeps its kind: it is an office with a block type now
    expect(q.programs.find((g) => g.id === 'office')!.kind).toBe('office')
  })

  it('a context building’s mass is a block, and the building stays context', () => {
    const d = data([free('m1'), free('m2', { levelId: 'l9', footprint: rect(300, 100, 40, 20) })], {
      buildings: [
        { id: 'b1', name: 'Building 1', color: '#4e79a7', levelHeight: 12, levels: [{ id: 'l1', name: 'L1', elevation: 0, height: 12, repeat: 1 }] },
        { id: 'b9', name: 'Neighbour', color: '#999999', levelHeight: 12, context: true, levels: [{ id: 'l9', name: 'L1', elevation: 0, height: 12, repeat: 1 }] },
      ],
      options: [{ id: 'o1', name: 'Option 1', buildingIds: ['b1', 'b9'] }],
    })
    const q = open(d)
    const m = mass(q, 'm2')
    expect(m.part).toBe('hall')
    const b = buildingOf(q, m)
    expect(b.id).toBe('b9')
    expect(b.context).toBe(true)
    expect(b.warehouse).toBeDefined()
  })

  it('a dimension anchored to a mass that moved follows it to its new level', () => {
    const dim = { id: 'd1', levelId: 'l1', a: { x: 280, y: 90 }, b: { x: 320, y: 90 }, offset: 2, anchorA: { massId: 'm2', vertex: 0 }, anchorB: { massId: 'm2', vertex: 1 } }
    const d = data([free('m1'), free('m2', { footprint: rect(300, 100, 40, 20) })], { dimensions: [dim] })
    const q = open(d)
    const level = mass(q, 'm2').levelId
    expect(level).not.toBe('l1')
    expect(q.dimensions![0].levelId).toBe(level)
  })

  it('a platform step naming a mass that moved goes to its new building', () => {
    const d = data([free('m1'), free('m2', { footprint: rect(300, 100, 40, 20) })], {
      buildings: [{ id: 'b1', name: 'Building 1', color: '#4e79a7', levelHeight: 12, levels: [{ id: 'l1', name: 'L1', elevation: 0, height: 12, repeat: 1 }], platform: { steps: [{ id: 's1', masses: ['m2'], level: 5 }] } }],
    })
    const q = open(d)
    const b = buildingOf(q, mass(q, 'm2'))
    expect(b.platform?.steps?.map((s) => s.masses)).toEqual([['m2']])
    expect(q.buildings.find((x) => x.id === 'b1')!.platform?.steps).toBeUndefined()
  })
})

describe('what is kept', () => {
  it('its group, its lock, its name and its program', () => {
    const d = data([free('m1', { group: 'g1', locked: true, name: 'North shed' }), free('m2', { group: 'g1', footprint: rect(300, 100, 40, 20), programId: 'office' })])
    const q = open(d)
    const m = mass(q, 'm1')
    expect(m).toMatchObject({ group: 'g1', locked: true, name: 'North shed', programId: 'warehouse' })
    expect(mass(q, 'm2')).toMatchObject({ group: 'g1', programId: 'office' })
  })

  it('no program: the shared Block type', () => {
    const d = data([free('m1', { programId: null }), free('m2', { programId: null, footprint: rect(300, 100, 40, 20) })])
    const q = open(d)
    expect(q.warehouseTypes).toHaveLength(1)
    expect(q.warehouseTypes![0]).toMatchObject({ name: 'Block', program: null })
    expect(mass(q, 'm1').programId).toBeNull()
    expect(mass(q, 'm2').part).toBe('hall')
  })

  it('an open program (not built) is a block of its program’s type, as open ground', () => {
    const d = data([free('m1', { programId: 'outdoor-storage', footprint: rect(100, 100, 60, 40) })])
    const q = open(d)
    expect(q.warehouseTypes![0].program).toBe('outdoor-storage')
    expect(q.programs.find((g) => g.id === 'outdoor-storage')!.built).toBe(false)
    expect(mass(q, 'm1').part).toBe('hall')
    // its area counts as before
    near(figures(q).areaByProgram['outdoor-storage'], figures(before(d)).areaByProgram['outdoor-storage'])
  })
})

describe('what cannot migrate', () => {
  it('a mass whose outline crosses itself stays as it is, and the report names it', () => {
    const bowtie = contour([
      [0, 0],
      [40, 40],
      [40, 0],
      [0, 40],
    ])
    const d = data([free('m1'), free('m2', { footprint: bowtie })])
    const q = open(d)
    expect(mass(q, 'm1').part).toBe('hall')
    expect(mass(q, 'm2').part).toBeUndefined()
    expect(mass(q, 'm2').footprint).toEqual(bowtie)
    const said = migrateNotes(d).join(' ')
    expect(said).toContain('1 mass could not become a block')
    expect(said).toContain('Mass m2 (its outline crosses itself)')
  })
})

describe('the report', () => {
  it('says how many masses are blocks, the new block types, and what was left out', () => {
    const d = data([free('m1'), free('m2', { programId: 'office', footprint: rect(300, 100, 40, 20) })])
    const notes = migrateNotes(d)
    expect(notes[0]).toBe('2 masses are blocks now (2 new block types: Warehouse, Office).')
  })

  it('a project with no free mass has no report, and is not touched', () => {
    const d = data([])
    expect(migrateNotes(d)).toEqual([])
    expect(migrate(d)).toEqual({ ...d, version: 20 })
  })

  it('a project of the current version is not migrated at all', () => {
    const p = JSON.parse(JSON.stringify(demo))
    expect(migrateNotes(p)).toEqual([])
    expect(migrate(p)).toEqual(p)
  })
})

describe('the migrated project', () => {
  it('the demo’s masses all migrate, their footprints’ areas as they were', () => {
    const q = open(JSON.parse(JSON.stringify({ ...demo, version: 16 })))
    expect(q.masses.every((m) => m.part === 'hall')).toBe(true)
    // the footprints the demo had, the polygon within a micrometre
    for (const m of demo.masses) expect(area(footprintPolygon(mass(q, m.id).footprint))).toBeCloseTo(area(footprintPolygon(m.footprint)), 3)
  })
})

describe('review fixes', () => {
  it('a rotated rectangle rounded to the centimetre keeps its docks (its walls are on the block’s axes)', () => {
    const c = Math.cos(Math.PI / 6)
    const s = Math.sin(Math.PI / 6)
    const at = (x: number, y: number): [number, number] => [Math.round((120 + x * c - y * s) * 100) / 100, Math.round((110 + x * s + y * c) * 100) / 100]
    const f = contour([at(0, 0), at(100.3, 0), at(100.3, 50.7), at(0, 50.7)])
    const d = data([free('m1', { footprint: f })])
    const old = doorsOf(before(d), 'm1')
    expect(old.length).toBeGreaterThan(3)
    const q = open(d)
    const now = doorsOf(q, 'm1')
    expect(now).toHaveLength(old.length)
    expect(migrateNotes(d).join(' ')).not.toMatch(/angled/)
  })

  it('a dimension anchored to a corner still points at that corner when the block reorders its corners', () => {
    // drawn clockwise from its top-right corner: the block reads it counter-clockwise from its low corner
    const f = contour([
      [160, 100],
      [160, 130],
      [100, 130],
      [100, 100],
    ])
    const dim = { id: 'd1', levelId: 'l1', a: { x: 160, y: 100 }, b: { x: 160, y: 130 }, offset: 2, anchorA: { massId: 'm1', vertex: 0 }, anchorB: { massId: 'm1', vertex: 1 } }
    const q = open(data([free('m1', { footprint: f })], { dimensions: [dim] }))
    const vs = footprintContour(mass(q, 'm1').footprint).vertices
    const d = q.dimensions![0]
    for (const [k, p] of [[d.anchorA, d.a], [d.anchorB, d.b]] as const) {
      if (!k) continue
      near(vs[k.vertex].x, p.x, 2e-3)
      near(vs[k.vertex].y, p.y, 2e-3)
    }
    expect(d.anchorA).toBeTruthy()
    expect(d.anchorB).toBeTruthy()
  })

  it('an anchor on a corner the block does not have (a curve faceted) is dropped, the dimension kept', () => {
    const f: Footprint = { kind: 'contour', contour: { vertices: [{ x: 100, y: 100, r: 0 }, { x: 160, y: 100, r: 0 }, { x: 160, y: 130, r: 0 }, { x: 100, y: 130, r: 0 }], arcs: { '1': -0.3 } } as never }
    const dim = { id: 'd1', levelId: 'l1', a: { x: 160, y: 100 }, b: { x: 100, y: 130 }, offset: 2, anchorA: { massId: 'm1', vertex: 1 }, anchorB: { massId: 'm1', vertex: 3 } }
    const q = open(data([free('m1', { footprint: f })], { dimensions: [dim] }))
    const vs = footprintContour(mass(q, 'm1').footprint).vertices
    const d = q.dimensions![0]
    expect(d.a).toEqual(dim.a)
    for (const [k, p] of [[d.anchorA, d.a], [d.anchorB, d.b]] as const) if (k) expect(Math.hypot(vs[k.vertex].x - p.x, vs[k.vertex].y - p.y)).toBeLessThan(2e-3)
  })

  it('a locked mass’s door exceptions stay on their wall when the corners are reordered', () => {
    const f = contour([
      [160, 100],
      [160, 130],
      [100, 130],
      [100, 100],
    ])
    const walls = dockableWalls(footprintPolygon(f))
    const bottom = walls.find((w) => w.i === 3)!
    const d = data([free('m1', { footprint: f, locked: true, docks: [bottom.t], doorFlips: [{ t: bottom.t, module: 2 }] })])
    const q = open(d)
    const m = mass(q, 'm1')
    const now = dockableWalls(footprintPolygon(m.footprint)).find((w) => Math.abs(w.a.y - 100) < 1e-3 && Math.abs(w.b.y - 100) < 1e-3)!
    expect(m.doorFlips ?? []).toEqual([{ t: now.t, module: 2 }])
  })
})

describe('review fixes: buildings and programs', () => {
  const bowtie = contour([
    [0, 0],
    [40, 40],
    [40, 0],
    [0, 40],
  ])
  it('a free mass left in a building is not left inside a block’s: the first mass refused, the next accepted', () => {
    const q = open(data([free('m1', { footprint: bowtie }), free('m2')]))
    expect(mass(q, 'm1').part).toBeUndefined()
    expect(mass(q, 'm2').part).toBe('hall')
    expect(buildingOf(q, mass(q, 'm2')).warehouse).toBeDefined()
    expect(buildingOf(q, mass(q, 'm1')).warehouse).toBeUndefined()
    expect(buildingOf(q, mass(q, 'm1')).id).not.toBe(buildingOf(q, mass(q, 'm2')).id)
    expect(ProjectSchema.safeParse(q).success).toBe(true)
  })

  it('the same when the refused mass comes after the accepted one', () => {
    const q = open(data([free('m1'), free('m2', { footprint: bowtie })]))
    expect(mass(q, 'm2').part).toBeUndefined()
    expect(buildingOf(q, mass(q, 'm2')).warehouse).toBeUndefined()
    expect(buildingOf(q, mass(q, 'm1')).warehouse).toBeDefined()
    expect(buildingOf(q, mass(q, 'm1')).id).not.toBe(buildingOf(q, mass(q, 'm2')).id)
    // both stay in the option
    const option = q.options.find((o) => o.buildingIds.includes(buildingOf(q, mass(q, 'm1')).id))!
    expect(option.buildingIds).toContain(buildingOf(q, mass(q, 'm2')).id)
  })

  it('a program that is not in the project: the mass becomes a Block, and the report says so', () => {
    const d = data([free('m1', { programId: 'ghost' })])
    const q = open(d)
    expect(mass(q, 'm1').part).toBe('hall')
    expect(q.warehouseTypes![0].program).toBeNull()
    expect(migrateNotes(d).join(' ')).toMatch(/program that is not in the project.*Mass m1/)
  })
})
