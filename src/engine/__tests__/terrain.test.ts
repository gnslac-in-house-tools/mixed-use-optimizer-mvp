// The ground (Phase E.1, Decisions "Terrain" and "Terrain layout"): contours at their file's heights make a surface
// whose elevation and slope read as the contours say; contours drawn flat are counted from two neighbours given,
// whichever way each line runs; where the ground turns the count goes wrong or stops, and a height given fixes the
// rest; points of the ground make a surface alone; the verbs import, give and take back heights, and the ground
// travels in the .gft.
import { describe, expect, it } from 'vitest'
import { readGft, writeGft } from '../../io/gft.ts'
import type { ContourLine, GroundPoint, Point, Terrain } from '../../model/schema.ts'
import { setContourHeight, setTerrain, setTerrainSmoothing } from '../../state/actions/site.ts'
import { demoProject } from '../../state/demo.ts'
import { heightsOf, surfaceOf } from '../../modules/terrain/engine/index.ts'

const circle = (r: number, cx = 0, cy = 0, n = 64): Point[] =>
  Array.from({ length: n }, (_, i) => ({ x: cx + r * Math.cos((2 * Math.PI * i) / n), y: cy + r * Math.sin((2 * Math.PI * i) / n) }))
const ring = (r: number, z?: number, cx = 0, cy = 0): ContourLine => ({ points: circle(r, cx, cy), closed: true, ...(z === undefined ? {} : { z }) })
/** A straight contour along x at `y`, running east (or west). */
const line = (y: number, west = false): ContourLine => ({ points: west ? [{ x: 100, y }, { x: 0, y }] : [{ x: 0, y }, { x: 100, y }] })
const terrain = (contours: ContourLine[], given: { contour: number; z: number }[] = [], points: GroundPoint[] = []): Terrain => ({
  contours,
  points,
  ...(given.length ? { given } : {}),
})

describe('the surface', () => {
  it('through contours at their file’s heights: a cone reads its heights and its slope; no ground beyond them', () => {
    const t = terrain([ring(10, 4), ring(20, 3), ring(30, 2), ring(40, 1)])
    const s = surfaceOf(t)!
    expect([s.min, s.max]).toEqual([1, 4])
    expect(s.elevation({ x: 0, y: 0 })).toBeCloseTo(4, 6)
    expect(Math.abs(s.elevation({ x: 15, y: 0 })! - 3.5)).toBeLessThan(0.1)
    expect(Math.abs(s.slope({ x: 0, y: 25 })! - 0.1)).toBeLessThan(0.02)
    expect(s.elevation({ x: 100, y: 100 })).toBeNull()
    expect(heightsOf(t)).toMatchObject({ from: ['file', 'file', 'file', 'file'], interval: 1 })
    // made once per terrain
    expect(surfaceOf(t)).toBe(s)
  })

  it('through points of the ground alone: a plane is read exactly', () => {
    const points: GroundPoint[] = []
    for (let x = 0; x <= 100; x += 10) for (let y = 0; y <= 100; y += 10) points.push({ x, y, z: 100 + 0.05 * x + 0.02 * y })
    const s = surfaceOf(terrain([], [], points))!
    expect(s.elevation({ x: 33, y: 47 })).toBeCloseTo(100 + 0.05 * 33 + 0.02 * 47, 9)
    expect(s.slope({ x: 71, y: 12 })).toBeCloseTo(Math.hypot(0.05, 0.02), 9)
  })
})

describe('contours drawn flat', () => {
  it('two neighbours given: the others are counted on, whichever way each line runs', () => {
    const t = terrain([line(0), line(10), line(20, true), line(30), line(40, true)], [
      { contour: 0, z: 100 },
      { contour: 1, z: 101 },
    ])
    expect(heightsOf(t)).toEqual({ z: [100, 101, 102, 103, 104], from: ['given', 'given', 'counted', 'counted', 'counted'], interval: 1 })
    const s = surfaceOf(t)!
    expect(s.elevation({ x: 50, y: 25 })).toBeCloseTo(102.5, 6)
    expect(s.slope({ x: 50, y: 25 })).toBeCloseTo(0.1, 6)
  })

  it('round a hill: the two inner given, the outer ones go down', () => {
    const t = terrain([ring(10), ring(20), ring(30), ring(40)], [
      { contour: 0, z: 104 },
      { contour: 1, z: 103 },
    ])
    expect(heightsOf(t).z).toEqual([104, 103, 102, 101])
  })

  it('one height given: nothing to count from, and no ground yet', () => {
    const t = terrain([line(0), line(10), line(20)], [{ contour: 1, z: 50 }])
    expect(heightsOf(t)).toEqual({ z: [null, 50, null], from: [null, 'given', null], interval: null })
    expect(surfaceOf(t)).toBeNull()
  })

  it('a ridge: the count goes on past it until a height is given; beyond, the way is not known until another is', () => {
    const lines = [line(0), line(10), line(20), line(30), line(40)]
    const two = [
      { contour: 0, z: 100 },
      { contour: 1, z: 101 },
    ]
    expect(heightsOf(terrain(lines, two)).z).toEqual([100, 101, 102, 103, 104])
    // the ridge is between 20 and 30: both at 102
    expect(heightsOf(terrain(lines, [...two, { contour: 3, z: 102 }])).z).toEqual([100, 101, 102, 102, null])
    expect(heightsOf(terrain(lines, [...two, { contour: 3, z: 102 }, { contour: 4, z: 101 }])).z).toEqual([100, 101, 102, 102, 101])
  })

  it('two hills in one contour: counted down from the first; the second’s height given, its top is counted from it', () => {
    // 0, 1: hill A (inner, outer); 2, 3: hill B (inner, outer); 4: round both
    const contours = [ring(10, undefined, -50), ring(20, undefined, -50), ring(10, undefined, 50), ring(20, undefined, 50), ring(90)]
    const a = [
      { contour: 0, z: 103 },
      { contour: 1, z: 102 },
    ]
    expect(heightsOf(terrain(contours, a)).z[4]).toBe(101)
    expect(heightsOf(terrain(contours, [...a, { contour: 3, z: 102 }])).z).toEqual([103, 102, 103, 102, 101])
  })
})

describe('the terrain’s verbs', () => {
  const t = terrain([line(0), line(10), line(20)])

  it('import replaces, null removes; a height given, changed and taken back; one that is not there changes nothing', () => {
    const p = setTerrain(demoProject(), t)
    expect(p.site.terrain).toBe(t)
    const given = setContourHeight(p, 1, 50)
    expect(given.site.terrain!.given).toEqual([{ contour: 1, z: 50 }])
    expect(setContourHeight(given, 1, 50)).toBe(given)
    expect(setContourHeight(given, 1, 51).site.terrain!.given).toEqual([{ contour: 1, z: 51 }])
    expect(setContourHeight(given, 1, null).site.terrain!.given).toBeUndefined()
    expect(setContourHeight(given, 3, 50)).toBe(given)
    expect(setContourHeight(demoProject(), 0, 50).site.terrain).toBeUndefined()
    expect(setTerrain(p, null).site.terrain).toBeUndefined()
    const none = demoProject()
    expect(setTerrain(none, null)).toBe(none)
  })

  it('travels in the .gft', () => {
    const p = setContourHeight(setTerrain(demoProject(), { ...t, points: [{ x: 1, y: 2, z: 3 }], source: { file: 'site.dxf', layers: ['TOPO'] } }), 0, 10)
    const r = readGft(writeGft(p))
    expect(r.ok && r.project.site.terrain).toEqual(p.site.terrain)
  })
})

describe('the ground smoothed (Decision "Terrain smoothing")', () => {
  // a ridge down the plan whose contours bend tight at x 30, 8 m apart: as triangulated, flat triangles at each bend
  const ridge = (smoothing?: 'off'): Terrain => ({
    contours: Array.from({ length: 11 }, (_, k) => ({ points: Array.from({ length: 61 }, (_, i) => ({ x: i * 2 - 30, y: 8 * k + (i * 2 - 60) ** 2 / 8 })), z: 100 + k })),
    points: [],
    ...(smoothing ? { smoothing } : {}),
  })
  const along = (t: Terrain) => {
    const s = surfaceOf(t)!
    return Array.from({ length: 21 }, (_, i) => s.slope({ x: 30, y: 20 + 2 * i })!)
  }

  it('by default the flat triangles where a contour bends lean towards the ground round them; the contours keep their heights', () => {
    // as triangulated, the ridge stands flat at each bend; smoothed, it climbs all the way
    expect(Math.min(...along(ridge('off')))).toBeLessThan(0.01)
    expect(Math.min(...along(ridge()))).toBeGreaterThan(0.1)
    const s = surfaceOf(ridge())!
    expect(s.elevation({ x: 30, y: 40 })).toBeCloseTo(105, 6)
    expect([s.min, s.max]).toEqual([100, 110])
  })

  it('a hill’s flat top is left flat, the ground’s edge as it was; points alone are not smoothed', () => {
    const cone = surfaceOf(terrain([ring(10, 4), ring(20, 3), ring(30, 2), ring(40, 1)]))!
    expect(cone.elevation({ x: 2, y: 3 })).toBeCloseTo(4, 6)
    expect([cone.min, cone.max]).toEqual([1, 4])
    const points: GroundPoint[] = [
      { x: 0, y: 0, z: 1 },
      { x: 10, y: 0, z: 1 },
      { x: 0, y: 10, z: 1 },
      { x: 10, y: 10, z: 5 },
    ]
    const flat = surfaceOf(terrain([], [], points))!
    expect(flat.x.length).toBe(4)
  })

  it('the verb: as triangulated is kept; smoothed, the default, is left absent; without ground nothing changes', () => {
    const p = setTerrain(demoProject(), ridge())
    const off = setTerrainSmoothing(p, 'off')
    expect(off.site.terrain!.smoothing).toBe('off')
    expect(setTerrainSmoothing(off, 'surface').site.terrain).not.toHaveProperty('smoothing')
    expect(setTerrainSmoothing(p, 'surface')).toBe(p)
    const bare = demoProject()
    expect(setTerrainSmoothing(bare, 'off')).toBe(bare)
  })
})
