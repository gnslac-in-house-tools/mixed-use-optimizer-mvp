// The engine with levels (Decision "Levels"): checks within a level, coverage from above, GFA and volume × N.
import { describe, expect, it } from 'vitest'
import type { Level, Mass, Project } from '../../model/schema.ts'
import { contourFromPolygon } from '../geom/contour.ts'
import { derive } from '../derive.ts'
import { readKpi } from '../../modules/catalog.ts'
import { groundLevel, isBasement, levelTop, massHeight, nearFloor, SAME_FLOOR, tidyLevels } from '../levels.ts'
import { addDimension } from '../../state/actions/dimensions.ts'

const LEVELS: Level[] = [
  { id: 'b1', name: 'B1', elevation: -4, height: 4, repeat: 1 },
  { id: 'l1', name: 'L1', elevation: 0, height: 6, repeat: 1 },
  { id: 'l2', name: 'L2', elevation: 6, height: 4, repeat: 3 },
]

// A 300 × 200 m site, no setback or spacing rule, so only overlaps are issues.
function project(masses: Mass[]): Project {
  return {
    version: 20,
    id: 'p-test',
    name: 'test',
    typology: 'blank',
    site: {
      boundary: contourFromPolygon([
        { x: 0, y: 0 },
        { x: 300, y: 0 },
        { x: 300, y: 200 },
        { x: 0, y: 200 },
      ]),
      rules: { setback: 0, maxCoverage: null },
    },
    programs: [{ id: 'w', name: 'W', color: '#000', built: true }],
    buildings: [{ id: 'b', name: 'Building 1', color: '#000', levelHeight: 6, levels: LEVELS }],
    options: [{ id: 'o1', name: 'Option 1', buildingIds: ['b'] }],
    masses,
  }
}
/** A w × d rect centred at (cx, 100). */
const box = (id: string, levelId: string, cx: number, w: number, d = 50): Mass => ({
  id,
  name: id,
  levelId,
  programId: 'w',
  footprint: { kind: 'rect', center: { x: cx, y: 100 }, width: w, depth: d, rotation: 0 },
})

describe('levels in the engine', () => {
  it('where a stack ends, which level is a basement, which one is the ground floor', () => {
    expect(levelTop(LEVELS[2])).toBe(18)
    expect(LEVELS.map(isBasement)).toEqual([true, false, false])
    expect(groundLevel(LEVELS).id).toBe('l1')
    expect(groundLevel([LEVELS[0]]).id).toBe('b1')
  })

  it('a mass over another one on another level is not an overlap; on the same level it is', () => {
    const stacked = derive(project([box('A', 'l1', 100, 100), box('B', 'l2', 100, 60)]))
    expect(stacked.issues).toEqual([])
    const same = derive(project([box('A', 'l1', 100, 100), box('B', 'l1', 100, 60)]))
    expect(same.issues.map((i) => i.code)).toEqual(['overlap'])
  })

  it('coverage is the projection of the levels above ground; GFA counts each floor × N, basements included', () => {
    // A 100 × 50 on L1, B 60 × 50 over it on L2 (×3), C 200 × 50 in the basement
    const p = project([box('A', 'l1', 100, 100), box('B', 'l2', 100, 60), box('C', 'b1', 150, 200)])
    const d = derive(p)
    expect(d.metrics.builtFootprint).toBeCloseTo(5000, 6)
    expect(d.metrics.coverage).toBeCloseTo(5000 / 60_000, 9)
    expect(d.metrics.floorAreaByLevel).toEqual({ b1: 10_000, l1: 5000, l2: 3000 })
    expect(d.metrics.gfa).toBeCloseTo(10_000 + 5000 + 3 * 3000, 6)
    expect(d.metrics.footprintByProgram.w).toBeCloseTo(5000, 6)
    expect(readKpi('gfa', p, d)!.value).toBeCloseTo(24_000, 6)
    // volume: each mass's footprint × its height (its level's) × its level's ×N
    expect(readKpi('built-volume', p, d)!.value).toBeCloseTo(10_000 * 4 + 5000 * 6 + 3000 * 4 * 3, 6)
  })

  it('a mass takes its level’s height unless it has its own', () => {
    const p = project([box('A', 'l2', 100, 10), { ...box('B', 'l2', 200, 10), height: 9 }])
    expect(p.masses.map((m) => massHeight(p, m))).toEqual([4, 9])
  })
})

describe('levels follow the masses (Decision "Levels follow the masses")', () => {
  it('a level with no masses goes; the same project when there is nothing to tidy', () => {
    const p = project([box('a', 'l1', 50, 40)])
    const t = tidyLevels(p)
    expect(t.buildings[0].levels.map((l) => l.id)).toEqual(['l1'])
    expect(t.masses).toBe(p.masses)
    expect(tidyLevels(t)).toBe(t)
  })

  it('two levels at one elevation become one: the fuller stays, the other’s masses and dimensions go onto it', () => {
    const twin: Level = { id: 'l1b', name: 'L1b', elevation: 0.002, height: 5, repeat: 1 }
    const base = project([box('a', 'l1', 50, 40), box('b', 'l1b', 150, 40), box('c', 'l1b', 250, 40)])
    const p = { ...base, buildings: [{ ...base.buildings[0], levels: [...LEVELS, twin] }] }
    const withDim = addDimension(p, { x: 0, y: 10 }, { x: 30, y: 10 }, -5, 'l1')!.project
    const t = tidyLevels(withDim)
    expect(t.buildings[0].levels.map((l) => l.id)).toEqual(['l1b'])
    expect(t.masses.map((m) => m.levelId)).toEqual(['l1b', 'l1b', 'l1b'])
    expect(t.dimensions?.map((d) => d.levelId)).toEqual(['l1b'])
  })

  it('with no masses at all a building keeps its lowest level; the dimensions of the others go', () => {
    const p = addDimension(project([]), { x: 0, y: 10 }, { x: 30, y: 10 }, -5, 'l2')!.project
    const t = tidyLevels(p)
    expect(t.buildings[0].levels.map((l) => l.id)).toEqual(['b1'])
    expect(t.dimensions ?? []).toEqual([])
  })

  it('a level this near another’s floor, not on it: the floor it may mean', () => {
    const near: Level = { id: 'l3', name: 'L3', elevation: 6.3, height: 4, repeat: 1 }
    const levels = [...LEVELS, near]
    expect(nearFloor(levels, near)?.id).toBe('l2')
    expect(nearFloor(levels, LEVELS[1])).toBeNull()
    expect(nearFloor(levels, { ...near, elevation: 6 + SAME_FLOOR + 0.01 })).toBeNull()
  })
})
