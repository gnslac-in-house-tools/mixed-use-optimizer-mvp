// Connect (Decision "Streets", ST.7): each truck court no truck gate reaches gets its shortest way to a gate or to the
// network, drawn once as streets of the trucks' type. The demo without its streets: two warehouses docked, a truck gate
// on the south side.
import { describe, expect, it } from 'vitest'
import { derive } from '../derive.ts'
import { connectPaths, steepestAlong } from '../circulation/connect.ts'
import { streetTypesOf, typeForVehicles } from '../circulation/streets.ts'
import type { Surface } from '../../modules/terrain/engine/surface.ts'
import { connectStreets } from '../../state/actions/streets.ts'
import { demoProject } from '../../state/demo.ts'
import type { Project } from '../../model/schema.ts'

const bare = () => demoProject({ streets: false })
const issues = (p: Project, code: string) => derive(p, 'o1').issues.filter((i) => i.code === code)

describe('Connect', () => {
  it('links every court no truck gate reaches: the warehouses reached, no access warning, nothing over a mass', () => {
    const p = bare()
    expect(issues(p, 'access').length).toBeGreaterThan(0)
    const r = connectStreets(p, 'o1')
    expect(r.linked).toBe(2)
    expect(r.left).toBe(0)
    expect(r.segments).toBeGreaterThan(0)
    const d = derive(r.project, 'o1')
    expect(d.circulation.reached.sort()).toEqual(['m1', 'm2'])
    expect(issues(r.project, 'access')).toEqual([])
    // no street over a mass, none a dead end (they start inside their courts)
    expect(issues(r.project, 'road')).toEqual([])
    // the trucks' type, nothing of its own
    const streets = r.project.options[0].streets!
    const trucks = typeForVehicles(streetTypesOf(r.project, r.project.options[0]), 'trucks')
    expect(streets.segments.every((s) => s.type === trucks.id)).toBe(true)
    expect(streets.segments.every((s) => s.vehicles === undefined)).toBe(true)
  })

  it('once: again, nothing left to do; the demo with its streets needs none', () => {
    const once = connectStreets(bare(), 'o1').project
    const again = connectStreets(once, 'o1')
    expect(again).toMatchObject({ segments: 0, linked: 0, left: 0 })
    expect(again.project).toBe(once)
    expect(connectPaths(demoProject(), 'o1').paths).toEqual([])
  })

  it('no truck gate and no road: no way, every court left', () => {
    const p: Project = { ...bare(), site: { ...bare().site, gates: [] } }
    expect(connectStreets(p, 'o1')).toMatchObject({ segments: 0, linked: 0, left: 2 })
    expect(connectStreets(p, 'nope')).toMatchObject({ segments: 0, left: 0 })
  })

  it('the ground’s steepest climb along a way: over each 10 m', () => {
    const ramp = { elevation: (q: { x: number }) => (q.x < 50 ? 0 : (q.x - 50) * 0.12) } as unknown as Surface
    expect(steepestAlong(ramp, [{ x: 0, y: 0 }, { x: 100, y: 0 }])).toBeCloseTo(0.12, 9)
    expect(steepestAlong(ramp, [{ x: 0, y: 0 }, { x: 40, y: 0 }])).toBe(0)
  })
})
