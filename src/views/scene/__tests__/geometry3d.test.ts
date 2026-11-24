// Ported from Plaza-Practiko `vistas/tresd/__tests__/geometria3d.test.ts`, plus the slab and the scene's box.
import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { derive } from '../../../engine/derive.ts'
import { massHeight } from '../../../engine/levels.ts'
import { addLevelAtEnd, updateLevel } from '../../../state/actions/levels.ts'
import { addMass } from '../../../state/actions/masses.ts'
import { demoProject } from '../../../state/demo.ts'
import { extrude, massBody, ringSegments, sceneBox, SLAB, volume } from '../geometry3d.ts'

const square = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 10, y: 10 },
  { x: 0, y: 10 },
]

describe('extrude', () => {
  it('a 10 m square 4 m tall: box from (0, z0, −10) to (10, z0 + 4, 0), volume 400', () => {
    const g = extrude(square, 43.4, 4)
    g.computeBoundingBox()
    const b = g.boundingBox as THREE.Box3
    expect(b.min.x).toBeCloseTo(0)
    expect(b.min.y).toBeCloseTo(43.4, 4) // Float32
    expect(b.min.z).toBeCloseTo(-10)
    expect(b.max.x).toBeCloseTo(10)
    expect(b.max.y).toBeCloseTo(47.4)
    expect(b.max.z).toBeCloseTo(0)
    expect(volume(g)).toBeCloseTo(400, 6)
  })

  it('a clockwise polygon gives the same volume (it is not turned inside out)', () => {
    expect(volume(extrude([...square].reverse(), 0, 4))).toBeCloseTo(400, 6)
  })

  it('a concave L: volume = area × height; a hole is taken out', () => {
    const ell = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 4 },
      { x: 4, y: 4 },
      { x: 4, y: 10 },
      { x: 0, y: 10 },
    ]
    expect(volume(extrude(ell, 2, 3))).toBeCloseTo(64 * 3, 6)
    const hole = [
      { x: 2, y: 2 },
      { x: 4, y: 2 },
      { x: 4, y: 4 },
      { x: 2, y: 4 },
    ]
    expect(volume(extrude(square, 0, 1, [hole]))).toBeCloseTo(96, 6)
  })

  it('fewer than 3 points or no height: empty geometry', () => {
    expect(extrude(square.slice(0, 2), 0, 4).getAttribute('position').count).toBe(0)
    expect(extrude(square, 0, 0).getAttribute('position').count).toBe(0)
  })
})

describe('ringSegments', () => {
  it('a closed ring of 4 points gives 4 segments at height z (plan z → three y)', () => {
    const s = ringSegments([square], 5)
    expect(s.length).toBe(4 * 2 * 3)
    expect(Array.from(s.slice(0, 6)).map(Math.abs)).toEqual([0, 5, 0, 10, 5, 0])
  })
})

describe('massBody and sceneBox', () => {
  it('a built mass rises its height; one that is not built is a thin slab', () => {
    const p = demoProject()
    const m = p.masses[0]
    const yard = p.programs.find((g) => !g.built)!
    expect(m.programId).toBe('warehouse')
    expect(massBody(p, m)).toEqual({ z0: 0, height: massHeight(p, m), slab: false, floors: [0] })
    expect(massBody(p, { ...m, programId: yard.id })).toEqual({ z0: 0, height: SLAB, slab: true, floors: [0] })
    expect(massBody(p, { ...m, programId: null }).height).toBe(massHeight(p, m))
  })

  it('a mass stands at its level’s elevation, once per floor when the level repeats ×N', () => {
    let p = demoProject()
    const up = addLevelAtEnd(p, 'above') // L2 at 12, 12 m tall
    p = updateLevel(up.project, up.id, { height: 4, repeat: 3 })
    p = addMass(p, { programId: 'office', footprint: p.masses[0].footprint, levelId: up.id }).project
    const m = p.masses.at(-1)!
    expect(massBody(p, m)).toEqual({ z0: 12, height: 4, slab: false, floors: [12, 16, 20] })
    expect(sceneBox(p, derive(p))!.max.y).toBe(24)
  })

  it('the box holds the site on the ground and the tallest mass; nothing → null', () => {
    const p = demoProject()
    const b = sceneBox(p, derive(p))!
    expect(b.min.y).toBe(0)
    expect(b.max.y).toBe(Math.max(...p.masses.map((m) => massHeight(p, m))))
    expect(b.max.x - b.min.x).toBeGreaterThan(400) // the demo site is ~440 m wide
    const empty = { ...p, masses: [], site: { ...p.site, boundary: null } }
    expect(sceneBox(empty, derive(empty))).toBeNull()
  })
})
