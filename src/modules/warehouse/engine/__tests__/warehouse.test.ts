// The warehouse type as a generator (Decisions "Warehouse type", "Block shape"): the bays along a length (whole ones,
// the end bays taking what is left), the steps locked in turn, and a type's one mass (its outline, holes and zones),
// columns, walls and doors in its own frame; its copies placed on the plan and read back from a hall moved or turned.
import { describe, expect, it } from 'vitest'
import type { WarehouseType } from '../../../../model/schema.ts'
import { footprintPolygon } from '../../../../engine/geom/footprint.ts'
import { area } from '../../../../engine/geom/polygon.ts'
import { runAlong } from '../bays.ts'
import { copyParts, partFootprint, placeFromHall } from '../copies.ts'
import { newWarehouseType } from '../defaults.ts'
import { figuresOf } from '../figures.ts'
import { generate, typeWith } from '../generate.ts'
import type { LegacyType } from '../legacy/types.ts'
import { typeToMetres } from '../migrate.ts'
import { lockStep, openStep, reopenStep, stepStatus } from '../steps.ts'
import { mergeZones, neighbours, splitZone, zonesOf } from '../zones.ts'

const type = (patch: Partial<WarehouseType> = {}): WarehouseType => ({ ...newWarehouseType('wt1', 'Warehouse A', { program: 'warehouse' }), ...patch })
/** A block drawn on its module lines (the fixtures below), read into metres as a file of block format 4 is. */
const lined = (t: WarehouseType): WarehouseType => typeToMetres(t as unknown as LegacyType)

describe('bays', () => {
  it('whole bays, and the end bays take what is left: between half a bay and one', () => {
    const r = runAlong(200, 12, 4, 'both')
    expect(r.bays.filter((b) => !b.end)).toHaveLength(15)
    expect([r.start, r.end]).toEqual([10, 10])
    expect(r.lines).toHaveLength(18)
    expect(r.lines.at(-1)).toBe(200)
    // an end bay of 10 m in modules of about 3 m: 3 of them
    expect(r.bays[0].modules).toBe(3)
    expect(r.modules).toHaveLength(1 + 3 + 15 * 4 + 3)
  })

  it('a length of whole bays has none; at one end, what is left (a bay more when under half of one)', () => {
    expect(runAlong(96, 12, 4, 'both')).toMatchObject({ start: 0, end: 0 })
    expect(runAlong(200, 12, 4, 'end')).toMatchObject({ start: 0, end: 8 })
    expect(runAlong(196, 12, 4, 'start')).toMatchObject({ start: 16, end: 0 })
    // shorter than a bay: one end bay
    expect(runAlong(8, 12, 4, 'both').bays).toEqual([{ lo: 0, hi: 8, end: true, modules: 3 }])
  })
})

describe('steps', () => {
  it('free steps (Decision "Free steps"): any one locked in any order; opening one sends the later locked ones to lock again', () => {
    let t = type()
    expect(openStep(t)).toBe('grid')
    expect(stepStatus(t, 'hall')).toBe('open')
    // any step locks, whatever the ones before it are
    t = lockStep(t, 'columns')
    expect(stepStatus(t, 'columns')).toBe('locked')
    expect(lockStep(t, 'columns')).toBe(t)
    expect(openStep(t)).toBe('grid')
    t = lockStep(lockStep(t, 'grid'), 'hall')
    expect(openStep(t)).toBe('envelope')
    // the grid opened (an edit, or Unlock): the later locked ones to lock again, the ones not locked as they were
    t = reopenStep(t, 'grid')
    expect(t.locks).toEqual({ hall: 'again', columns: 'again' })
    expect(stepStatus(t, 'envelope')).toBe('open')
    // an open step opened again: nothing new to check, the same type
    expect(reopenStep(t, 'grid')).toBe(t)
    t = lockStep(t, 'hall')
    expect(stepStatus(t, 'hall')).toBe('locked')
    // the envelope edited, open: the later locked ones (none) as they were; the earlier ones keep their locks
    expect(reopenStep(t, 'envelope')).toBe(t)
  })
})

describe('the generator', () => {
  it('the hall: its envelope round the column lines, a column at every intersection, its walls and its docks', () => {
    const g = generate(type())
    expect(g.parts).toHaveLength(1)
    expect(g.parts[0]).toMatchObject({ part: 'hall', program: 'warehouse', height: 12, level: 0 })
    expect(area(g.parts[0].polygon)).toBeCloseTo(200.6 * 96.6, 3)
    expect(g.columns).toHaveLength(18 * 9)
    expect(g.walls).toHaveLength(4)
    expect(g.walls.find((w) => w.side === 'front')!.a).toEqual({ x: -0.3, y: -0.3 })
    // 4 docks centred in each of the 15 interior bays, on the front's face
    expect(g.doors).toHaveLength(60)
    expect(g.doors[0]).toMatchObject({ kind: 'dock', side: 'front', at: { x: 11.5, y: -0.3 }, part: 'hall' })
    const f = figuresOf(g)
    expect(f).toMatchObject({ bays: { x: 15, y: 8 }, ends: { x: [10, 10], y: [0, 0] }, columns: 162, docks: 60 })
    expect(f.wallArea).toBeCloseTo(2 * (200.6 + 96.6) * 12, 3)
  })

  it('every other line: the perimeter keeps its columns', () => {
    const g = generate(type({ columns: { size: 0.5, every: { x: 2, y: 2 } } }))
    // x: lines 0, 2, 4… 16 and 17 (the last) = 10; y: 0, 2, 4, 6, 8 = 5
    expect(g.columns).toHaveLength(10 * 5)
  })

  it('the shape (Decision "Block shape"): one mass, its outline on the module lines, a bump and a notch part of it, a hole', () => {
    // a bump on the front (modules 3 to 11, 3 modules out), a notch in the back (modules 3 to 7, 2 in), a hole
    const t = type({
      hall: { length: 200, width: 96, ends: 'both' },
      morphology: {
        outline: [
          { id: 'e1', x: 0, y: 3 },
          { id: 'f1', x: 3, y: 3 },
          { id: 'f2', x: 3, y: 0 },
          { id: 'f3', x: 11, y: 0 },
          { id: 'f4', x: 11, y: 3 },
          { id: 'e2', x: 66, y: 3 },
          { id: 'e3', x: 66, y: 32 },
          { id: 'b1', x: 7, y: 32 },
          { id: 'b2', x: 7, y: 30 },
          { id: 'b3', x: 3, y: 30 },
          { id: 'b4', x: 3, y: 32 },
          { id: 'e4', x: 0, y: 32 },
        ],
        holes: [{ id: 'h1', x: [30, 34], y: [12, 16] }] as never,
      },
      // a dock on every module of the bump's face (modules 3 to 10)
      elements: Array.from({ length: 8 }, (_, i) => ({ id: `e${i + 1}`, kind: 'dock' as const, edge: 'f2', module: 3 + i, width: 3 })),
    })
    const g = generate(lined(t))
    expect(g.parts).toHaveLength(1)
    expect(g.parts[0]).toMatchObject({ part: 'hall', program: 'warehouse', height: 12 })
    expect(g.edges.map((e) => e.id)).toEqual(t.morphology.outline.map((c) => c.id))
    // on the box's lines: the bump's face, the right, the back beside the notch, the left
    expect(g.edges.filter((e) => e.outer).map((e) => e.id)).toEqual(['f2', 'e2', 'e3', 'b4', 'e4'])
    // its area: the box's faces, less the front strip beside the bump, less the notch, less the hole
    const [mx, my] = [g.runs.x.modules, g.runs.y.modules]
    const hole = (mx[34] - mx[30] - 0.6) * (my[16] - my[12] - 0.6)
    // (the bump's side walls stand out of it, so each strip is its modules wide)
    const front = (mx[3] - mx[0]) * (my[3] - my[0]) + (mx[66] - mx[11]) * (my[3] - my[0])
    const notch = (mx[7] - mx[3] - 0.6) * (my[32] - my[30])
    expect(area(g.parts[0].polygon) - g.parts[0].holes.reduce((s, h) => s + area(h), 0)).toBeCloseTo(200.6 * 96.6 - front - notch - hole, 2)
    // a wall on every edge and round the hole; no column in the hole nor beside the bump
    expect(g.walls.filter((w) => w.edge).length).toBe(12)
    expect(g.walls.filter((w) => w.hole === 'h1').length).toBe(4)
    expect(g.columns.some((c) => c.x > mx[30] + 0.01 && c.x < mx[34] - 0.01 && c.y > my[12] + 0.01 && c.y < my[16] - 0.01)).toBe(false)
    expect(g.columns.some((c) => c.y < my[3] - 0.01 && (c.x < mx[3] - 0.01 || c.x > mx[11] + 0.01))).toBe(false)
    // docks on the bump's face: its two bays, four each, on its wall's outer face
    expect(g.doors).toHaveLength(8)
    expect(g.doors.every((d) => d.edge === 'f2' && d.side === 'front' && d.at.y === -0.3 && d.at.x > mx[3] && d.at.x < mx[11])).toBe(true)
  })

  it('on a longer or shorter box each corner keeps its distance from the nearer wall (Decision "Block shape")', () => {
    const outline = [
      { id: 'e1', x: 0, y: 0 },
      { id: 'e2', x: 60, y: 0 },
      { id: 'e3', x: 60, y: 28 },
      { id: 'n1', x: 50, y: 28 },
      { id: 'n2', x: 50, y: 32 },
      { id: 'e4', x: 0, y: 32 },
    ]
    // (modules of 3 m: the corners in metres)
    const t = lined(type({ hall: { length: 180, width: 96, ends: 'both' }, morphology: { outline, holes: [] } }))
    expect(generate(t).outline.map((c) => [c.x, c.y])).toEqual(outline.map((c) => [3 * c.x, 3 * c.y]))
    // 24 m longer: the notch near the right wall goes with it
    const longer = generate(typeWith(t, { hall: { length: 204 } }))
    expect(longer.outline.map((c) => [c.x, c.y])).toEqual([[0, 0], [204, 0], [204, 84], [174, 84], [174, 96], [0, 96]])
    expect(longer.outline.map((c) => c.id)).toEqual(outline.map((c) => c.id))
  })

  it('a copy’s overrides: each step’s figures over the type’s', () => {
    const t = type()
    const v = typeWith(t, { hall: { length: 144 }, envelope: { thickness: 0.5 } })
    expect(v.hall).toMatchObject({ length: 144, width: 96, ends: 'both' })
    expect(v.envelope).toEqual({ height: 12, thickness: 0.5 })
    expect(typeWith(t, undefined)).toBe(t)
  })
})

describe('copies on the plan', () => {
  it('placed and turned: the hall a rect, its docked wall and doors; the place read back from the hall moved', () => {
    const t = type()
    const place = { x: 50, y: 20, angle: 30 }
    const parts = copyParts(t, { place })
    expect(parts).toHaveLength(1)
    const hall = parts[0]
    expect(hall.footprint).toMatchObject({ kind: 'rect', width: 200.6, depth: 96.6, rotation: 30 })
    expect(hall.docks).toHaveLength(1)
    expect(hall.doorsAt).toHaveLength(1)
    expect(hall.doorsAt[0].at).toHaveLength(60)
    expect(hall.doorsAt[0].at[0]).toBeCloseTo(11.8, 6)
    // read back where it stands
    expect(placeFromHall(t, { place }, hall.footprint)).toEqual(place)
    const moved = { ...hall.footprint, center: { x: 0, y: 0 }, rotation: 120 } as typeof hall.footprint
    const read = placeFromHall(t, { place }, moved)!
    expect(read.angle).toBeCloseTo(120, 9)
    expect(footprintPolygon(partFootprint(generate(t).parts[0].polygon, read))[0].x).toBeCloseTo(footprintPolygon(moved)[0].x, 6)
  })
})

describe('zones (Decision "Warehouse by hand")', () => {
  const morphology = (zones: WarehouseType['morphology']['zones']): WarehouseType['morphology'] => ({ outline: [], holes: [], zones })

  it('none: one, the whole box', () => {
    const t = type()
    expect(zonesOf(t, generate(t).runs)).toEqual([{ id: '1', x: [0, 66], y: [0, 32] }])
  })

  it('split on a module line, merged back; neighbours share a whole side', () => {
    const t = type()
    const runs = generate(t).runs
    const two = splitZone(zonesOf(t, runs), '1', 'x', 20)!
    expect(two.map((z) => [z.id, z.x, z.y])).toEqual([
      ['1', [0, 20], [0, 32]],
      ['z1', [20, 66], [0, 32]],
    ])
    const three = splitZone(two, 'z1', 'y', 8)!
    expect(three.map((z) => z.id)).toEqual(['1', 'z1', 'z2'])
    expect(splitZone(three, 'z2', 'x', 10)).toBeNull()
    expect(neighbours(three, '1').map((z) => z.id)).toEqual([])
    expect(neighbours(three, 'z1').map((z) => z.id)).toEqual(['z2'])
    expect(mergeZones(three, 'z1', 'z2')).toEqual(two)
    expect(mergeZones(three, '1', 'z2')).toBeNull()
  })

  it('each zone a piece of the one mass with its program, level and area; no wall between them; a new size re-applies them', () => {
    const zones = [
      { id: '1', x: [0, 20], y: [0, 32] },
      { id: 'z1', x: [20, 66], y: [0, 8], program: 'office', level: -1.2 },
      { id: 'z2', x: [20, 66], y: [8, 32], program: null },
    ] satisfies WarehouseType['morphology']['zones']
    const g = generate(type({ morphology: morphology(zones) }))
    expect(g.parts).toHaveLength(1)
    expect(g.zones.map((z) => [z.id, z.program, z.level])).toEqual([
      ['1', 'warehouse', 0],
      ['z1', 'office', -1.2],
      ['z2', null, 0],
    ])
    expect(g.zones.reduce((s, z) => s + z.area, 0)).toBeCloseTo(200.6 * 96.6, 1)
    expect(g.walls.some((w) => Math.abs(w.a.x - g.runs.x.modules[20]) < 1e-6 && Math.abs(w.b.x - g.runs.x.modules[20]) < 1e-6)).toBe(false)
    // longer: the zones that reached the last line reach the new one
    const longer = generate(type({ hall: { length: 260, width: 96, ends: 'both' }, morphology: morphology(zones) }))
    const n = longer.runs.x.modules.length - 1
    expect(zonesOf(type({ hall: { length: 260, width: 96, ends: 'both' }, morphology: morphology(zones) }), longer.runs).map((z) => z.x)).toEqual([
      [0, 20],
      [20, n],
      [20, n],
    ])
  })
})
