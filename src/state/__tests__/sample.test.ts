// The sample project (Decision "Sample project"): a site of at least 10 ha on ground with a real fall, two smart blocks
// placed in each of its three options (one copy a variant), and it reads back as a .gft does.
import { describe, expect, it } from 'vitest'
import { derive } from '../../engine/derive.ts'
import { kpiCatalog } from '../../modules/catalog.ts'
import { contourToPolygon } from '../../engine/geom/contour.ts'
import { area } from '../../engine/geom/polygon.ts'
import { readGft, writeGft } from '../../io/gft.ts'
import { groundContours, SAMPLE_ID, sampleGround, sampleProject } from '../sample.ts'

describe('the sample project', () => {
  const p = sampleProject()

  it('a site over 100,000 m² whose ground falls more than 20 m', () => {
    const site = contourToPolygon(p.site.boundary!)
    expect(area(site)).toBeGreaterThan(100_000)
    const z = site.map((v) => sampleGround(v.x, v.y))
    expect(Math.max(...z) - Math.min(...z)).toBeGreaterThan(20)
    // contours every metre, no points (they drew as a dotted background)
    expect(p.site.terrain!.contours.length).toBeGreaterThan(20)
    expect(p.site.terrain!.points).toEqual([])
    expect(p.id).toBe(SAMPLE_ID)
  })

  it('its contours: one per metre of height, each on the ground at its height, open ones ending at the drawing’s edge', () => {
    const cs = groundContours()
    const heights = [...new Set(cs.map((c) => c.z))]
    expect(heights.length).toBeGreaterThan(25)
    for (const c of cs) for (const q of c.points) expect(Math.abs(sampleGround(q.x, q.y) - c.z!)).toBeLessThan(0.05)
    const edge = (q: { x: number; y: number }) => Math.abs(q.x + 60) < 1e-6 || Math.abs(q.x - 600) < 1e-6 || Math.abs(q.y + 60) < 1e-6 || Math.abs(q.y - 390) < 1e-6
    for (const c of cs.filter((x) => !x.closed)) expect(edge(c.points[0]) && edge(c.points.at(-1)!)).toBe(true)
  })

  it('four block types, all six steps locked: two smart blocks, and the guard house’s and the yard’s, drawn; three options, each with copies; a variant among them', () => {
    expect(p.warehouseTypes!.map((t) => t.name)).toEqual(['Cross-dock', 'Rear-load', 'Guard house', 'Outdoor storage'])
    for (const t of p.warehouseTypes!) expect(Object.values(t.locks ?? {}).filter((l) => l === 'locked')).toHaveLength(6)
    expect(p.options).toHaveLength(3)
    for (const o of p.options) expect(p.buildings.filter((b) => b.warehouse && o.buildingIds.includes(b.id)).length).toBeGreaterThan(0)
    const variants = p.buildings.filter((b) => b.warehouse?.overrides)
    expect(variants.some((b) => b.warehouse!.overrides!.hall)).toBe(true)
    expect(variants.some((b) => b.warehouse!.overrides!.morphology?.outline)).toBe(true)
  })

  it('every building is a block: the guard house and the yard are blocks of their programs’ types (the yard, not built, drawn as open ground)', () => {
    const hall = (name: string) => p.masses.filter((m) => m.part === 'hall' && p.buildings.find((b) => b.levels.some((l) => l.id === m.levelId))?.name === name)
    expect(hall('Guard house')).toHaveLength(3)
    expect(hall('Yard')).toHaveLength(1)
    expect(hall('Yard')[0]).toMatchObject({ programId: 'outdoor-storage', footprint: { kind: 'rect', width: 30, depth: 80 } })
    // no free mass is left: each is the hall of a copy
    expect(p.masses.every((m) => m.part !== undefined)).toBe(true)
    expect(p.buildings.filter((b) => !b.warehouse)).toEqual([])
    // the first guard house is its type itself, the next two its variants
    const copies = p.buildings.filter((b) => b.name === 'Guard house')
    expect(copies.map((b) => b.warehouse!.overrides !== undefined)).toEqual([false, true, true])
  })

  it('its figures are as they were before the envelope’s inset: footprint, floor area, volume and program areas the same; the columns and walls only gain the guard houses’', () => {
    // read before Phase D.2 task 7, when its guard houses and yard were free masses
    const before: Record<string, { builtFootprint: number; volume: number; columns: number; wallArea: number }> = {
      o1: { builtFootprint: 50982.72, volume: 611792.64, columns: 412, wallArea: 16617.6 },
      o2: { builtFootprint: 37711.68, volume: 452540.16, columns: 324, wallArea: 17150.4 },
      o3: { builtFootprint: 39513.12, volume: 474157.44, columns: 325, wallArea: 14313.6 },
    }
    for (const [id, was] of Object.entries(before)) {
      const d = derive(p, id)
      const kpi = (k: string) => kpiCatalog(p).find((x) => x.id === k)!.read(p, d) as number
      expect(Math.abs(d.metrics.builtFootprint - was.builtFootprint) / was.builtFootprint).toBeLessThan(0.005)
      expect(Math.abs(d.metrics.builtVolume - was.volume) / was.volume).toBeLessThan(0.005)
      expect(d.metrics.gfa).toBeCloseTo(d.metrics.builtFootprint, 6)
      // the guard house: four columns and its walls (20 m round, 12 m high); an option has one, the yard none
      expect(kpi('columns') - was.columns).toBe(4)
      expect(kpi('wall-area') - was.wallArea).toBeCloseTo(20 * 12, 6)
    }
    expect(derive(p, 'o3').metrics.areaByProgram['outdoor-storage']).toBeCloseTo(2400, 6)
  })

  it('a cross-dock’s office zone counts as office: its floor out of the warehouse’s, the zone one office a copy', () => {
    const o = p.options[0]
    const d = derive(p, o.id)
    const copies = p.buildings.filter((b) => o.buildingIds.includes(b.id) && b.warehouse)
    const masses = p.masses.filter((m) => copies.some((b) => b.levels.some((l) => l.id === m.levelId)))
    const office = masses.flatMap((m) => m.zones ?? []).filter((z) => z.programId === 'office')
    expect(office.length).toBeGreaterThan(0)
    for (const z of office) expect(z.area).toBeGreaterThan(400)
    const sum = office.reduce((s, z) => s + z.area, 0)
    expect(d.metrics.areaByProgram.office).toBeCloseTo(sum, 1)
    expect(d.metrics.massesByProgram.office).toBe(office.length)
    expect(d.metrics.footprintByProgram.office).toBeCloseTo(sum, 1)
    // the office's taken from the warehouse's: without the zones, the warehouse has the blocks' whole floor
    const whole = derive({ ...p, masses: p.masses.map((m) => ({ ...m, zones: undefined })) }, o.id).metrics
    expect(whole.areaByProgram.office ?? 0).toBe(0)
    expect((d.metrics.areaByProgram.warehouse ?? 0) + sum).toBeCloseTo(whole.areaByProgram.warehouse, 1)
  })

  it('every option derives with no errors; it reads back as a .gft', () => {
    for (const o of p.options) expect(derive(p, o.id).issues.filter((i) => i.severity === 'error')).toEqual([])
    expect(readGft(writeGft(p))).toEqual({ ok: true, project: p })
  })
})
