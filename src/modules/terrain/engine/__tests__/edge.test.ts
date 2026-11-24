// The ground carried to the boundary (Decision "Ground to the boundary"): a survey that covers part of the parcel gets
// points along the rest of the boundary, at the nearest ground's height, so the surface reaches the whole site; a
// ground that covers it gets none; a file imported makes them.
import { describe, expect, it } from 'vitest'
import type { Contour, Point, Terrain } from '../../../../model/schema.ts'
import { importSiteFile } from '../../../../state/actions/site.ts'
import { demoProject } from '../../../../state/demo.ts'
import { edgeOf, withEdge } from '../edge.ts'
import { surfaceOf } from '../surface.ts'

// contours from x 0 to 100, y 0 to 20: the parcel runs to x 200
const terrain: Terrain = {
  contours: [
    { points: [{ x: 0, y: 0 }, { x: 100, y: 0 }], z: 10 },
    { points: [{ x: 0, y: 20 }, { x: 100, y: 20 }], z: 12 },
  ],
  points: [],
}
const parcel: Point[] = [
  { x: 0, y: 0 },
  { x: 200, y: 0 },
  { x: 200, y: 20 },
  { x: 0, y: 20 },
]

describe('the ground to the boundary', () => {
  it('points along the boundary beyond the survey, each at the nearest ground’s height; the surface then reaches it all', () => {
    expect(surfaceOf(terrain)!.elevation({ x: 150, y: 10 })).toBeNull()
    const edge = edgeOf(terrain, parcel)
    expect(edge.length).toBeGreaterThan(0)
    expect(edge.every((p) => p.x > 100)).toBe(true)
    // along the bottom the nearest ground is the 10 m contour, along the top the 12 m one
    expect(edge.find((p) => p.x === 200 && p.y === 0)?.z).toBe(10)
    expect(edge.find((p) => p.x === 200 && p.y === 20)?.z).toBe(12)
    const t = withEdge(terrain, parcel)
    expect(t.points).toEqual([])
    expect(surfaceOf(t)!.elevation({ x: 150, y: 10 })).toBeCloseTo(11)
  })

  it('none when the ground covers the boundary; made again, not added to, for another boundary', () => {
    const inside: Point[] = [
      { x: 10, y: 5 },
      { x: 90, y: 5 },
      { x: 90, y: 15 },
    ]
    expect(withEdge(terrain, inside)).toEqual(terrain)
    expect(withEdge(withEdge(terrain, parcel), inside).edge).toBeUndefined()
  })

  it('a file imported carries its ground to the boundary picked', () => {
    const boundary: Contour = { vertices: parcel.map((p) => ({ ...p, r: 0 })) }
    const p = importSiteFile(demoProject(), { name: 'civil.dwg', boundary, terrain })
    expect(p.site.terrain?.edge?.length).toBeGreaterThan(0)
    expect(p.site.terrain?.contours).toBe(terrain.contours)
  })
})
