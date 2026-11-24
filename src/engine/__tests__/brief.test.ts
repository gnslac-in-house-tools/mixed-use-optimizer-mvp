// The brief against the design (Decision "Brief"): each program's area level by level (× N), its masses, how a figure
// stands against its target (±5 %), the totals and the Brief area KPI. The demo asks for two warehouses of 24,000 m²
// (it has 12,800 + 11,200), an office of 1,200 m² (it has 800) and a guard house of 24 m² (it has none).
import { describe, expect, it } from 'vitest'
import { addLevelAtEnd, updateLevel } from '../../state/actions/levels.ts'
import { addMass } from '../../state/actions/masses.ts'
import { setProgramTarget } from '../../state/actions/programs.ts'
import { demoProject } from '../../state/demo.ts'
import { briefGaps, briefRows, briefStatus, briefTotals, massRect, newMassArea, programSize, whyKeepProgram } from '../brief.ts'
import { derive } from '../derive.ts'
import { readKpi } from '../../modules/catalog.ts'

const rect = (x: number, y: number, w: number, d: number) => ({ kind: 'rect' as const, center: { x, y }, width: w, depth: d, rotation: 0 })

describe('briefStatus', () => {
  it('within ±5 % meets the target; below is under, above is over; no target, no status', () => {
    expect(briefStatus(100, 100)).toBe('met')
    expect(briefStatus(95, 100)).toBe('met')
    expect(briefStatus(105, 100)).toBe('met')
    expect(briefStatus(94, 100)).toBe('under')
    expect(briefStatus(106, 100)).toBe('over')
    expect(briefStatus(5, null)).toBeNull()
    expect(briefStatus(0, 0)).toBe('met')
    expect(briefStatus(1, 0)).toBe('over')
  })
})

describe('briefRows', () => {
  it('the demo: the warehouses meet it, the office and the guard house are under', () => {
    const p = demoProject()
    const rows = briefRows(p, derive(p))
    const row = (id: string) => rows.find((r) => r.programId === id)!
    expect(row('warehouse')).toMatchObject({ targetArea: 24000, area: 24000, targetCount: 2, count: 2, unitArea: 12000, areaStatus: 'met', countStatus: 'met' })
    expect(row('office')).toMatchObject({ targetArea: 1200, area: 800, areaStatus: 'under', count: 1, countStatus: 'met' })
    expect(row('guardhouse')).toMatchObject({ targetArea: 24, area: 0, areaStatus: 'under', count: 0, countStatus: 'under' })
    // no target: no status
    expect(row('outdoor-storage')).toMatchObject({ targetArea: null, targetCount: null, unitArea: null, areaStatus: null, countStatus: null })
    expect(rows.map((r) => r.programId)).toEqual(p.programs.map((g) => g.id))
  })

  it('a program’s area is per level × N: a typical floor counts N times, its mass once; an open program counts its ground', () => {
    let p = demoProject()
    const above = addLevelAtEnd(p, 'above')
    p = updateLevel(above.project, above.id, { repeat: 3 })
    // an office on L2 ×3, the same footprint as the one on L1
    p = addMass(p, { programId: 'office', footprint: rect(120, 200, 40, 20), levelId: above.id }).project
    p = addMass(p, { programId: 'outdoor-storage', footprint: rect(300, 220, 30, 10) }).project
    const d = derive(p)
    expect(d.metrics.areaByProgram.office).toBeCloseTo(800 + 800 * 3)
    expect(d.metrics.massesByProgram.office).toBe(2)
    expect(d.metrics.areaByProgram['outdoor-storage']).toBeCloseTo(300)
    // two overlapping masses of one program on one level count their union
    p = addMass(p, { programId: 'outdoor-storage', footprint: rect(310, 220, 30, 10) }).project
    expect(derive(p).metrics.areaByProgram['outdoor-storage']).toBeCloseTo(400)
  })

  it('context buildings are not counted', () => {
    const p = demoProject()
    const ctx = { ...p, buildings: p.buildings.map((b) => ({ ...b, context: true })) }
    expect(briefRows(ctx, derive(ctx)).find((r) => r.programId === 'warehouse')!.area).toBe(0)
  })
})

describe('briefTotals and the Brief area KPI', () => {
  it('sums the programs with a target area; the KPI is their area over their targets', () => {
    const p = demoProject()
    const d = derive(p)
    const t = briefTotals(briefRows(p, d))
    // 98 % of the whole: it meets it, though the office alone does not
    expect(t).toEqual({ targetArea: 24000 + 1200 + 24, area: 24000 + 800, status: 'met' })
    const k = readKpi('brief', p, d)!
    expect(k.value).toBeCloseTo(24800 / 25224)
    expect(k.status).toBe('within')
    const short = setProgramTarget(p, 'office', { area: 5000 })
    expect(briefTotals(briefRows(short, derive(short))).status).toBe('under')
    expect(readKpi('brief', short, derive(short))!.status).toBe('over') // off the target: red, like a broken limit
  })

  it('without targets there is nothing to read', () => {
    let p = demoProject()
    for (const g of p.programs) p = setProgramTarget(p, g.id, { area: null, count: null })
    const d = derive(p)
    expect(briefTotals(briefRows(p, d))).toEqual({ targetArea: null, area: 0, status: null })
    expect(readKpi('brief', p, d)).toMatchObject({ value: null, status: null })
  })
})

describe('programs', () => {
  it('a new mass: the brief’s area per mass at 2:1, else its typical area, else the default; a size set by hand wins', () => {
    const p = demoProject()
    const g = (id: string) => p.programs.find((x) => x.id === id)!
    // 24,000 m² in 2 masses: 12,000 each; its depth to the half metre, twice as wide
    expect(newMassArea(g('warehouse'))).toBe(12000)
    expect(programSize(g('warehouse'))).toEqual({ width: 155, depth: 77.5 })
    expect(programSize(g('guardhouse'))).toEqual({ width: 7, depth: 3.5 })
    // no target: its typical area (outdoor storage, 2,400 m²); not even that: 6,000 m²
    expect(programSize(g('outdoor-storage'))).toEqual(massRect(2400))
    expect(massRect(2400)).toEqual({ width: 69, depth: 34.5 })
    const bare = { id: 'x', name: 'X', color: '#000', built: true }
    expect(programSize(bare)).toEqual({ width: 110, depth: 55 })
    // an area without a count: one mass of it; a count of 0: the typical area
    expect(newMassArea({ ...bare, target: { area: 800, count: null } })).toBe(800)
    expect(newMassArea({ ...bare, massArea: 50, target: { area: 800, count: 0 } })).toBe(50)
    expect(programSize({ ...g('warehouse'), size: { width: 30, depth: 40 } })).toEqual({ width: 30, depth: 40 })
    expect(massRect(0.01)).toEqual({ width: 1, depth: 0.5 })
  })

  it('why a program cannot be removed', () => {
    const p = demoProject()
    expect(whyKeepProgram(p, 'warehouse')).toBe('2 masses use it: give them another program first')
    expect(whyKeepProgram(p, 'office')).toBe('1 mass uses it: give it another program first')
    expect(whyKeepProgram(p, 'guardhouse')).toBeNull()
  })
})

describe('briefGaps (Decision "Brief sync")', () => {
  it('the demo: a guard house asked for and none placed; the rest agree', () => {
    const p = demoProject()
    expect(briefGaps(briefRows(p, derive(p)))).toEqual([{ programId: 'guardhouse', asks: 1, has: 0 }])
  })

  it('a mass too many, and a program drawn that the brief does not count', () => {
    let p = demoProject()
    p = addMass(p, { programId: 'office', footprint: { kind: 'rect', center: { x: 300, y: 200 }, width: 40, depth: 20, rotation: 0 } }).project
    p = addMass(p, { programId: 'outdoor-storage', footprint: { kind: 'rect', center: { x: 250, y: 30 }, width: 20, depth: 10, rotation: 0 } }).project
    expect(briefGaps(briefRows(p, derive(p)))).toEqual([
      { programId: 'office', asks: 1, has: 2 },
      { programId: 'guardhouse', asks: 1, has: 0 },
      { programId: 'outdoor-storage', asks: null, has: 1 },
    ])
  })
})
