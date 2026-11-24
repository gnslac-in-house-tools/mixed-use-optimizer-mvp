// The ground's surface in the 3D (Phase E.2c, Decision "Terrain in 3D"): laid round the site's mean height, plan
// (x, y, z) as the scene's (x, z − base, −y); the slope's classes per triangle; the site's lines cut and lying on it;
// the map's image where MapGround would lay it.
import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import type { Terrain } from '../../../model/schema.ts'
import { meanHeight, surfaceOf } from '../../../modules/terrain/engine/index.ts'
import { contourSegments, drapedSegments, LIFT, mapUvs, slopeMesh, surfacePositions, upward } from '../terrain3d.ts'
import { ups } from './faces.ts'

/** Eleven straight contours, 1200 to 1210 m, 8 m apart going north (12.5 %). */
const slope = (): Terrain => ({
  contours: Array.from({ length: 11 }, (_, k) => ({
    points: [
      { x: 0, y: 8 * k },
      { x: 60, y: 8 * k },
    ],
    z: 1200 + k,
  })),
  points: [],
})

const site = [
  { x: 10, y: 10 },
  { x: 50, y: 10 },
  { x: 50, y: 70 },
  { x: 10, y: 70 },
]

describe('the surface in the scene', () => {
  it('the mean height over the site: its middle, on an even slope', () => {
    const s = surfaceOf(slope())!
    // y 10…70 is 1201.25…1208.75 m
    expect(meanHeight(s, site)).toBeCloseTo(1205, 6)
    expect(meanHeight(s, [{ x: 500, y: 500 }, { x: 510, y: 500 }, { x: 510, y: 510 }])).toBeNull()
  })

  it('plan (x, y, z) is the scene’s (x, z − base, −y); every triangle of an even 12.5 % in one class', () => {
    const s = surfaceOf(slope())!
    const p = surfacePositions(s, 1205)
    expect([p[0], p[1], p[2]]).toEqual([s.x[0], s.z[0] - 1205, -s.y[0]])
    const { positions, classes } = slopeMesh(s, 1205)
    expect(positions.length).toBe(s.triangles.length * 3)
    // every triangle faces up: seen from above, its front (the surface's run clockwise with y up)
    expect(ups(positions).every((y) => y > 0)).toBe(true)
    expect(Array.from(upward(new Uint32Array([0, 1, 2])))).toEqual([0, 2, 1])
    expect(new Set(classes)).toEqual(new Set([3]))
  })

  it('the site’s lines cut every 2 m and lying on the ground; the contours at their heights', () => {
    const s = surfaceOf(slope())!
    const d = drapedSegments([site], s.elevation, 1205)
    // 40 + 60 + 40 + 60 m: 100 cuts, two corners each
    expect(d.length).toBe(100 * 6)
    // the first corner (10, 10) at 1201.25 m
    expect(d[1]).toBeCloseTo(1201.25 - 1205 + LIFT, 6)
    // beyond the ground: at the base
    expect(drapedSegments([[{ x: 500, y: 500 }, { x: 501, y: 500 }]], s.elevation, 1205)[1]).toBeCloseTo(LIFT, 6)
    expect(Array.from(contourSegments([{ points: [{ x: 0, y: 0 }, { x: 60, y: 0 }], z: 1200 }], 1205))).toEqual([0, 1200 - 1205 + LIFT, -0, 60, 1200 - 1205 + LIFT, -0].map(Math.fround))
  })

  it('the map’s image falls where MapGround lays it: the centre in the middle, turned with it', () => {
    const center = { x: 30, y: 40 }
    const rotation = 25
    const [w, h] = [300, 200]
    // MapGround: a plane w × h lying flat (−90° about x) in a group at the centre, turned `rotation`° about y
    const group = new THREE.Matrix4().compose(new THREE.Vector3(center.x, 0, -center.y), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, (rotation * Math.PI) / 180, 0)), new THREE.Vector3(1, 1, 1))
    const plane = new THREE.Matrix4().makeRotationX(-Math.PI / 2)
    const toScene = group.multiply(plane)
    for (const [u, v] of [
      [0.5, 0.5],
      [0.8, 0.3],
      [0.1, 0.9],
    ]) {
      // the image's (u, v) on the plane, in the scene, back to the plan
      const q = new THREE.Vector3((u - 0.5) * w, (v - 0.5) * h, 0).applyMatrix4(toScene)
      const uv = mapUvs({ x: new Float64Array([q.x]), y: new Float64Array([-q.z]) }, center, rotation, w, h)
      expect(uv[0]).toBeCloseTo(u, 6)
      expect(uv[1]).toBeCloseTo(v, 6)
    }
  })
})
