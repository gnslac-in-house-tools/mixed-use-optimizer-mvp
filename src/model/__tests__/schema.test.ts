import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { migrate } from '../migrate.ts'
import { PROJECT_VERSION, ProjectSchema } from '../schema.ts'

const valid = {
  version: 20 as const,
  id: 'p-test',
  name: 'Test site',
  typology: 'industrial',
  site: {
    boundary: {
      vertices: [
        { x: 0, y: 0, r: 0 },
        { x: 300, y: 0, r: 0 },
        { x: 300, y: 200, r: 0 },
        { x: 0, y: 200, r: 0 },
      ],
      arcs: { '2': -0.2 },
    },
    rules: { setback: 10, maxCoverage: 0.6 },
  },
  programs: [{ id: 'warehouse', name: 'Warehouse', color: '#7d8fa8', built: true }],
  buildings: [{ id: 'b1', name: 'Building 1', color: '#4e79a7', levelHeight: 12, levels: [{ id: 'l1', name: 'L1', elevation: 0, height: 12, repeat: 1 }] }],
  options: [{ id: 'o1', name: 'Option 1', buildingIds: ['b1'] }],
  masses: [
    {
      id: 'm1',
      name: 'Warehouse A',
      levelId: 'l1',
      programId: 'warehouse',
      footprint: { kind: 'rect', center: { x: 150, y: 100 }, width: 120, depth: 60, rotation: 0 },
      height: 12,
    },
  ],
}

describe('ProjectSchema', () => {
  it('accepts a valid project', () => {
    expect(ProjectSchema.parse(valid)).toEqual(valid)
  })

  it('rejects bad input from outside (file, MCP, optimizer)', () => {
    const negativeWidth = structuredClone(valid)
    negativeWidth.masses[0].footprint.width = -5
    expect(ProjectSchema.safeParse(negativeWidth).success).toBe(false)

    const twoPointSite = structuredClone(valid)
    twoPointSite.site.boundary.vertices = twoPointSite.site.boundary.vertices.slice(0, 2)
    expect(ProjectSchema.safeParse(twoPointSite).success).toBe(false)

    const coverageOver1 = structuredClone(valid)
    coverageOver1.site.rules.maxCoverage = 1.5
    expect(ProjectSchema.safeParse(coverageOver1).success).toBe(false)

    // levels: at least one per building, a whole ×N ≥ 1, unique in the project, and what stands on a level names one
    const b = valid.buildings[0]
    const l = b.levels[0]
    const withBuildings = (buildings: unknown[]) => ({ ...valid, buildings })
    expect(ProjectSchema.safeParse(withBuildings([{ ...b, levels: [] }])).success).toBe(false)
    expect(ProjectSchema.safeParse(withBuildings([{ ...b, levels: [{ ...l, repeat: 1.5 }] }])).success).toBe(false)
    expect(ProjectSchema.safeParse({ ...valid, masses: [{ ...valid.masses[0], levelId: 'l9' }] }).success).toBe(false)
    expect(ProjectSchema.safeParse(withBuildings([b, { ...b, id: 'b2' }])).success).toBe(false) // l1 twice
    // buildings and options (Decision "Buildings and options"): at least one of each, unique ids, an option names
    // buildings that exist
    expect(ProjectSchema.safeParse(withBuildings([])).success).toBe(false)
    expect(ProjectSchema.safeParse({ ...valid, options: [] }).success).toBe(false)
    expect(ProjectSchema.safeParse(withBuildings([b, { ...b, levels: [{ ...l, id: 'l2' }] }])).success).toBe(false) // b1 twice
    expect(ProjectSchema.safeParse({ ...valid, options: [{ id: 'o1', name: 'A', buildingIds: ['b9'] }] }).success).toBe(false)
    expect(ProjectSchema.safeParse({ ...valid, options: [valid.options[0], valid.options[0]] }).success).toBe(false)
  })

  it('a mass without a height of its own is valid: it takes its level’s', () => {
    const { height: _, ...free } = valid.masses[0]
    expect(ProjectSchema.safeParse({ ...valid, masses: [free] }).success).toBe(true)
  })

  it('a padlock (`locked`) is optional on a street segment, a lot, a gate (the site’s and an option’s own) and a building', () => {
    expect(PROJECT_VERSION).toBe(20)
    const p = structuredClone(valid) as Record<string, unknown> & { buildings: Record<string, unknown>[]; options: Record<string, unknown>[]; site: Record<string, unknown> }
    p.buildings[0].locked = true
    p.site.gates = [{ id: 'g1', t: 0.1, width: 12, radius: 12, flow: 'both', vehicles: 'all', locked: true }]
    p.options[0].gates = [{ id: 'g1', t: 0.1, width: 12, radius: 12, flow: 'both', vehicles: 'all', locked: true }]
    p.options[0].streets = {
      nodes: [{ id: 'n1', x: 0, y: 0 }, { id: 'n2', x: 20, y: 0 }],
      segments: [{ id: 's1', a: 'n1', b: 'n2', type: 'trucks', left: 4, right: 4, locked: true }],
    }
    p.options[0].lots = [{ id: 'lot1', name: 'Lot 1', rect: { center: { x: 50, y: 50 }, width: 30, depth: 20, rotation: 0 }, locked: true }]
    const r = ProjectSchema.safeParse(p)
    expect(r.success).toBe(true)
    expect(r.data).toEqual(p)
    expect(ProjectSchema.safeParse({ ...p, buildings: [{ ...p.buildings[0], locked: 'yes' }] }).success).toBe(false)
  })

  it('a version 13 project (no free mass: those become blocks, Phase D.2) migrates to 18 unchanged but for its version', () => {
    const v13 = { ...structuredClone(valid), masses: [], version: 13 } as Record<string, unknown>
    const read = migrate(v13)
    expect(read).toEqual({ ...v13, version: 20 })
    expect(ProjectSchema.safeParse(read).success).toBe(true)
    // a version 18 file is left as it is
    expect(migrate(structuredClone(valid) as Record<string, unknown>)).toEqual(valid)
  })

  it('a version 14 project migrates to 18 unchanged but for its version (Phase AS.5: reference lines, notes and groups are all optional)', () => {
    const v14 = { ...structuredClone(valid), masses: [], version: 14 } as Record<string, unknown>
    const read = migrate(v14)
    expect(read).toEqual({ ...v14, version: 20 })
    expect(ProjectSchema.safeParse(read).success).toBe(true)
  })

  it('a version 15 project migrates to 18 unchanged but for its version (Phase D.1: a corner’s chamfer is optional)', () => {
    const v15 = { ...structuredClone(valid), masses: [], version: 15 } as Record<string, unknown>
    const read = migrate(v15)
    expect(read).toEqual({ ...v15, version: 20 })
    expect(ProjectSchema.safeParse(read).success).toBe(true)
  })

  it('a version 16 project without blocks migrates to 18 unchanged but for its version (Phase D.2: a block’s outline is in metres)', () => {
    const v16 = { ...structuredClone(valid), masses: [], version: 16 } as Record<string, unknown>
    const read = migrate(v16)
    expect(read).toEqual({ ...v16, version: 20 })
    expect(ProjectSchema.safeParse(read).success).toBe(true)
  })

  it('a version 17 project migrates to 18 unchanged but for its version (Phase D.3: a truck court’s shape and id are optional)', () => {
    const v17 = { ...structuredClone(valid), masses: [], version: 17 } as Record<string, unknown>
    const read = migrate(v17)
    expect(read).toEqual({ ...v17, version: 20 })
    expect(ProjectSchema.safeParse(read).success).toBe(true)
  })

  it('a corner’s chamfer is two set-backs, each at least 0 (Phase D.1)', () => {
    const corner = (chamfer: unknown) => ({ ...valid, site: { ...valid.site, boundary: { vertices: [{ ...valid.site.boundary.vertices[0], chamfer }, ...valid.site.boundary.vertices.slice(1)] } } })
    expect(ProjectSchema.safeParse(corner([2, 3])).data?.site.boundary?.vertices[0].chamfer).toEqual([2, 3])
    expect(ProjectSchema.safeParse(corner(undefined)).success).toBe(true)
    expect(ProjectSchema.safeParse(corner([-1, 3])).success).toBe(false)
    expect(ProjectSchema.safeParse(corner([1, -0.5])).success).toBe(false)
    expect(ProjectSchema.safeParse(corner([1])).success).toBe(false)
    expect(ProjectSchema.safeParse(corner([1, 2, 3])).success).toBe(false)
  })

  it('reference lines and notes are project data: two or more points, a note on a level that is there (as a dimension is)', () => {
    const p = {
      ...structuredClone(valid),
      referenceLines: [
        { id: 'r1', points: [{ x: 0, y: 0 }, { x: 10, y: 0 }] },
        { id: 'r2', points: [{ x: 0, y: 5 }, { x: 10, y: 5 }, { x: 20, y: 9 }], locked: true, group: 'g1' },
      ],
      notes: [
        { id: 't1', levelId: 'l1', at: { x: 5, y: 5 }, text: 'Fire lane' },
        { id: 't2', levelId: 'l1', at: { x: 9, y: 5 }, text: 'Two\nlines', angle: 90, size: 'large', locked: true, group: 'g1' },
        { id: 't3', levelId: 'l1', at: { x: 9, y: 9 }, text: 'Small', size: 'small' },
      ],
    }
    const r = ProjectSchema.safeParse(p)
    expect(r.success).toBe(true)
    expect(r.data).toEqual(p)
    // a line has two points at least, a note a level that is there, a size one of the two, ids unique in each list
    expect(ProjectSchema.safeParse({ ...p, referenceLines: [{ id: 'r1', points: [{ x: 0, y: 0 }] }] }).success).toBe(false)
    expect(ProjectSchema.safeParse({ ...p, notes: [{ ...p.notes[0], levelId: 'l9' }] }).success).toBe(false)
    expect(ProjectSchema.safeParse({ ...p, notes: [{ ...p.notes[0], size: 'huge' }] }).success).toBe(false)
    expect(ProjectSchema.safeParse({ ...p, notes: [p.notes[0], p.notes[0]] }).success).toBe(false)
    expect(ProjectSchema.safeParse({ ...p, referenceLines: [p.referenceLines[0], p.referenceLines[0]] }).success).toBe(false)
  })

  it('a street segment, a lot, a gate and a dimension may be in a group (the field a mass has)', () => {
    const p = structuredClone(valid) as Record<string, unknown> & { options: Record<string, unknown>[]; site: Record<string, unknown> }
    p.site.gates = [{ id: 'g1', t: 0.1, width: 12, radius: 12, flow: 'both', vehicles: 'all', group: 'g1' }]
    p.options[0].streets = {
      nodes: [{ id: 'n1', x: 0, y: 0 }, { id: 'n2', x: 20, y: 0 }],
      segments: [{ id: 's1', a: 'n1', b: 'n2', type: 'trucks', left: 4, right: 4, group: 'g1' }],
    }
    p.options[0].lots = [{ id: 'lot1', name: 'Lot 1', rect: { center: { x: 50, y: 50 }, width: 30, depth: 20, rotation: 0 }, group: 'g1' }]
    p.dimensions = [{ id: 'd1', levelId: 'l1', a: { x: 0, y: 0 }, b: { x: 5, y: 0 }, offset: 1, group: 'g1' }]
    const r = ProjectSchema.safeParse(p)
    expect(r.success).toBe(true)
    expect(r.data).toEqual(p)
  })

  it('exports a JSON Schema (what an MCP tool will publish)', () => {
    const json = z.toJSONSchema(ProjectSchema) as { properties: Record<string, unknown> }
    expect(Object.keys(json.properties)).toEqual(['version', 'id', 'name', 'units', 'typology', 'site', 'programs', 'buildings', 'options', 'masses', 'kpis', 'dimensions', 'referenceLines', 'notes', 'rules', 'standards', 'grid', 'warehouseTypes', 'residential', 'plugins', 'log']) // mixed-use-mvp
  })
})
