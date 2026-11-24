// The docks and the gates in the 3D (Decision "Fixtures in 3D"): a door panel per dock door on its wall, at its mass's
// floor and its platform's lift, facing out; each dock wall's face the dock height under its platform, on the laid
// ground alone. The demo: Warehouse 1 (x 40–200, y 70–150) docks south.
import { describe, expect, it } from 'vitest'
import type { GroundPoint, Terrain } from '../../../model/schema.ts'
import { derive } from '../../../engine/derive.ts'
import { setPlatformLevel } from '../../../modules/terrain/actions.ts'
import { setTerrain } from '../../../state/actions/site.ts'
import { demoProject } from '../../../state/demo.ts'
import { DOOR, dockFaces, doorsOf } from '../Fixtures.tsx'
import { laidOf, liftOf } from '../laid.ts'

const plane = (): Terrain => {
  const points: GroundPoint[] = []
  for (let x = -100; x <= 700; x += 50) for (let y = -100; y <= 500; y += 50) points.push({ x, y, z: 100 + 0.05 * x })
  return { contours: [], points }
}

describe('the docks in 3D', () => {
  it('a door per dock door, on its wall, a door high over the floor, facing out', () => {
    const d = derive(demoProject())
    const doors = doorsOf(d.circulation, d.masses, () => 0)
    expect(doors.length).toBe(d.circulation.docks.reduce((s, x) => s + x.doors.length, 0))
    expect(doors.length).toBeGreaterThan(0)
    // Warehouse 1's south wall's first door
    const k = d.circulation.docks.findIndex((x) => x.massId === 'm1' && x.out.y < -0.9)
    const first = doors[d.circulation.docks.slice(0, k).reduce((s, x) => s + x.doors.length, 0)]
    expect(first.at.y).toBeCloseTo(d.masses.m1.span[0] + DOOR.height / 2, 6)
    // the scene's z is the plan's −y: the south wall (y 70) a hair out of it
    expect(-first.at.z).toBeCloseTo(70 - DOOR.off, 6)
    expect(first.angle).toBeCloseTo(-Math.PI / 2, 6)
  })

  it('on the laid ground, lifted with its platform; each dock wall’s face the dock height under it', () => {
    const p = setPlatformLevel(setTerrain(demoProject(), plane()), 'b1', 110)
    const d = derive(p)
    const laid = laidOf(p.site.terrain, 'contours', d.site.polygon, d.earthwork, 1.2)!
    const doors = doorsOf(d.circulation, d.masses, (id) => liftOf(laid, id))
    expect(Math.min(...doors.map((x) => x.at.y))).toBeCloseTo(110 - laid.base + DOOR.height / 2, 6)
    const faces = dockFaces(d.circulation, laid)
    expect(faces.length).toBe(d.circulation.docks.length * 18)
    const ys = [...faces].filter((_, i) => i % 3 === 1)
    expect(Math.max(...ys)).toBeCloseTo(110 - laid.base, 6)
    expect(Math.min(...ys)).toBeCloseTo(110 - laid.base - 1.2, 6)
  })
})
