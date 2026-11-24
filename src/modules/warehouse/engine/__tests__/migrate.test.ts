// Old blocks read into an outline (Decision "Block shape", BS.1): the areas before (the old generator's, kept here as
// figures: its hall, parts out and zones' pieces) and after (the one mass) the same but for the walls a part out now
// has round its sides; the docks where they were, by edge, one a module (Decision "Elements by module"); the zones on
// the new box; a project's copies one mass each, at their new column line A / 1; an old block's file read.
import { describe, expect, it } from 'vitest'
import { BlockSchema, ProjectSchema } from '../../../../model/schema.ts'
import { area } from '../../../../engine/geom/polygon.ts'
import { migrate } from '../../../../model/migrate.ts'
import { demoProject } from '../../../../state/demo.ts'
import { generate } from '../generate.ts'
import { migrateBlock, typeFromOld, typeToMetres } from '../migrate.ts'

const old = (morphology: object, elements: object[]) => ({
  id: 'wt1',
  name: 'Cross-dock',
  program: 'warehouse',
  grid: { x: 12, y: 12, modules: 4 },
  hall: { length: 216, width: 120, ends: 'both' },
  columns: { size: 0.5, every: { x: 1, y: 1 } },
  envelope: { height: 12, thickness: { front: 0.3, back: 0.3, left: 0.3, right: 0.3 } },
  morphology: { offsets: { front: 0, back: 0, left: 0, right: 0 }, corners: [], levels: [], ...morphology },
  elements,
})
const dock = (id: string, side: string, count = 2) => ({ id, kind: 'dock', side, bays: { every: 1, offset: 0, skip: 'ends' }, count, width: 3 })

/** The sample's cross-dock as it was: an office out of its left wall, a service bay out of its right. */
const cross = old(
  {
    parts: [
      { id: 'office', name: 'Office', kind: 'out', side: 'left', from: 12, span: 16, depth: 12, program: 'office', height: 8 },
      { id: 'service', name: 'Service', kind: 'out', side: 'right', from: 4, span: 8, depth: 9 },
    ],
  },
  [dock('e1', 'front'), dock('e2', 'back')],
)
/** A notch in the back, a part out of the front, a cut corner, two zones (one an office a metre up). */
const notched = old(
  {
    parts: [
      { id: 'n1', kind: 'in', side: 'back', from: 8, span: 8, depth: 12 },
      { id: 'b1', kind: 'out', side: 'front', from: 20, span: 12, depth: 9, program: 'office' },
    ],
    corners: [{ corner: 'back-right', x: 8, y: 4 }],
    zones: [
      { id: 'z1', x: [0, 36], y: [0, 40] },
      { id: 'z2', x: [36, 72], y: [0, 40], program: 'office', level: 1 },
    ],
  },
  [dock('e1', 'front', 4)],
)
const massArea = (g: ReturnType<typeof generate>) => area(g.parts[0].polygon) - g.parts[0].holes.reduce((s, h) => s + area(h), 0)

describe('an old type read into an outline', () => {
  it('the cross-dock: one mass, its parts joined; the area as before but for the parts’ side walls; its docks where they were, by module', () => {
    const { type, shift } = typeFromOld(cross)
    const g = generate(typeToMetres(type))
    // before: the hall 26,121.96 m², the office 576, the service 216
    const before = 26121.96 + 576 + 216
    // after: each part's two side walls (0.3 m) stand out of its module lines: 2 × 0.3 × (12 + 9) m more
    expect(massArea(g)).toBeCloseTo(before + 0.6 * (12 + 9), 2)
    expect(g.parts).toHaveLength(1)
    expect(g.parts[0].program).toBe('warehouse')
    // the box is the outline's: 12 m of office on the left, 9 of service on the right; the old bays kept, the 9 m an end bay
    expect(type.hall).toMatchObject({ length: 237, width: 120, ends: 'end' })
    expect(shift).toEqual({ x: -12, y: 0 })
    expect(g.runs.x.lines.slice(0, 3)).toEqual([0, 12, 24])
    // 18 bays × 2 docks a wall, as before, one element a module: the two middle modules of each bay (the office's 4
    // modules first)
    expect(g.doors).toHaveLength(72)
    expect(type.elements).toHaveLength(72)
    expect([...new Set(type.elements.map((e) => e.edge))]).toEqual(['e1', 'e3'])
    expect(type.elements.filter((e) => e.edge === 'e1').slice(0, 2).map((e) => e.module)).toEqual([5, 6])
    expect(g.edges.find((e) => e.id === 'e1')!.side).toBe('front')
    expect(g.edges.find((e) => e.id === 'e3')!.side).toBe('back')
  })

  it('a notch, a part out, a cut corner and zones: the area within a tenth of a percent, the docks either side of the part, the part on the zone it touches', () => {
    const { type } = typeFromOld(notched)
    const g = generate(typeToMetres(type))
    // before: the hall's two zone pieces 12,772.98 and 12,762.09 m², the part 324
    const before = 12772.98 + 12762.09 + 324
    expect(Math.abs(massArea(g) - before) / before).toBeLessThan(0.001)
    // the 60 docks of before, on the front's two stretches either side of the part out
    expect(g.doors).toHaveLength(60)
    expect(new Set(type.elements.map((e) => e.edge)).size).toBe(2)
    // the zones on the new box, the office a metre up; the part out joined to the zone beside it, on the block's program
    expect(g.zones.map((z) => [z.id, z.program, z.level])).toEqual([
      ['z1', 'warehouse', 0],
      ['z2', 'office', 1],
    ])
    expect(g.zones[0].area).toBeCloseTo(12772.98 + 324, -2)
    expect(g.zones.reduce((s, z) => s + z.area, 0)).toBeCloseTo(massArea(g), 1)
  })
})

describe('an old project and an old block', () => {
  it('a version 8 project: its type an outline, each copy one mass at its new column line A / 1, its parts’ masses gone', () => {
    const p = demoProject()
    const levelId = p.buildings[0].levels[0].id
    const rect = (x: number, y: number, w: number, d: number) => ({ kind: 'rect', center: { x, y }, width: w, depth: d, rotation: 0 })
    const raw = {
      ...p,
      version: 8,
      warehouseTypes: [cross],
      buildings: [{ ...p.buildings[0], warehouse: { type: 'wt1', place: { x: 100, y: 50, angle: 0 } } }],
      masses: [
        { id: 'w1', name: 'Hall', levelId, programId: 'warehouse', footprint: rect(208.3, 110.3, 216.6, 120.6), part: 'hall', group: 'g1' },
        { id: 'w2', name: 'Office', levelId, programId: 'office', footprint: rect(93.85, 110, 12, 48), part: 'office', group: 'g1' },
        { id: 'w3', name: 'Service', levelId, programId: 'warehouse', footprint: rect(321.1, 74, 9, 24), part: 'service', group: 'g1' },
      ],
    }
    const q = migrate(raw as never)
    const r = ProjectSchema.safeParse(q)
    expect(r.success).toBe(true)
    const project = r.data!
    expect(project.version).toBe(20)
    expect(project.masses.map((m) => [m.id, m.part, m.group])).toEqual([['w1', 'hall', undefined]])
    expect(project.buildings[0].warehouse!.place).toEqual({ x: 88, y: 50, angle: 0 })
    expect(project.masses[0].footprint.kind).toBe('contour')
    expect(project.warehouseTypes![0].elements[0].edge).toBe('e1')
  })

  it('a block’s file of the old shape: its type an outline, format 4 (Decisions "Grid by line", "Elements by module" after it), a block', () => {
    const read = migrateBlock({ format: 'gfit-block', id: 'b', version: 3, savedAt: 0, type: cross, programs: [{ id: 'warehouse', name: 'Warehouse', color: '#7d8fa8', built: true }] })
    const r = BlockSchema.safeParse(read)
    expect(r.success).toBe(true)
    expect(r.data!.formatVersion).toBe(6)
    expect(r.data!.type.morphology.outline.length).toBe(12)
  })
})
