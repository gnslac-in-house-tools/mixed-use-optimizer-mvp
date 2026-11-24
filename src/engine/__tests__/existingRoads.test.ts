// Project 19 (Phase PE.1): an existing road is a path, its sides by stretch. `existingRoads(site)` derives one road per
// run of equal stretches.
import { describe, expect, it } from 'vitest'
import { existingRoads } from '../circulation/streets.ts'
import { derive } from '../derive.ts'
import { addExistingRoad, updateExistingRoad } from '../../state/actions/circulation.ts'
import { demoProject } from '../../state/demo.ts'
import { roadHidden } from '../../views/layers/keys.ts'
import type { ExistingRoad } from '../../model/schema.ts'

const P = (x: number, y: number) => ({ x, y })
const road = (stretches: { left: number; right: number }[], points = [P(0, 0), P(100, 0), P(200, 0), P(300, 0)]): ExistingRoad => ({ id: 'r1', points, stretches })

describe('existingRoads', () => {
  it('none: none', () => expect(existingRoads({})).toEqual([]))

  it('one road per run of equal stretches, its ids and source', () => {
    const rs = existingRoads({ existingRoads: [road([{ left: 3, right: 3 }, { left: 3, right: 3 }, { left: 0, right: 9 }])] })
    expect(rs.map((r) => r.id)).toEqual(['existing:r1', 'existing:r1:3'])
    expect(rs.every((r) => r.kind === 'existing' && r.sourceId === 'r1' && r.vehicles === 'all')).toBe(true)
    expect(rs.map((r) => [r.left, r.right, r.width])).toEqual([[3, 3, 6], [0, 9, 9]])
    expect(rs[0].nodePoints).toEqual([P(0, 0), P(100, 0), P(200, 0)])
    expect(rs[1].nodePoints).toEqual([P(200, 0), P(300, 0)])
  })

  it('the second of stretches 3 + 3, 0 + 9 is road 2 of its id, and reads the first’s eye', () => {
    const rs = existingRoads({ existingRoads: [{ id: 'r1', points: [P(0, 0), P(100, 0), P(200, 0)], stretches: [{ left: 3, right: 3 }, { left: 0, right: 9 }] }] })
    expect(rs.map((r) => r.id)).toEqual(['existing:r1', 'existing:r1:2'])
    expect(roadHidden(new Set(['existing-road:r1']), rs[1])).toBe(roadHidden(new Set(['existing-road:r1']), rs[0]))
  })

  it('its points are the centre line: a road drawn by its left edge, 0 + 9, runs 4.5 m to its right', () => {
    const [r] = existingRoads({ existingRoads: [{ id: 'r1', points: [P(0, 0), P(100, 0)], stretches: [{ left: 0, right: 9 }] }] })
    expect(r.points[0].y).toBeCloseTo(-4.5)
    expect(r.points[1].y).toBeCloseTo(-4.5)
    expect(r.nodePoints).toEqual([P(0, 0), P(100, 0)])
  })

  it('equal stretches centred: the road is its drawn line, one road', () => {
    const rs = existingRoads({ existingRoads: [road([{ left: 5, right: 5 }, { left: 5, right: 5 }, { left: 5, right: 5 }])] })
    expect(rs).toHaveLength(1)
    expect(rs[0].points).toEqual([P(0, 0), P(100, 0), P(200, 0), P(300, 0)])
  })

  it('the circulation derives them, and the buildable area leaves the paving of each stretch', () => {
    const p = demoProject({ streets: false })
    const wide = { ...p, site: { ...p.site, existingRoads: [{ id: 'r1', points: [P(-50, 140), P(460, 140)], stretches: [{ left: 5, right: 5 }] }] } }
    const lopsided = { ...p, site: { ...p.site, existingRoads: [{ id: 'r1', points: [P(-50, 140), P(460, 140)], stretches: [{ left: 0, right: 10 }] }] } }
    expect(derive(wide).circulation.roads.filter((r) => r.kind === 'existing')).toHaveLength(1)
    // the same width, the same area off the buildable one; the centre line moved
    expect(Math.abs(derive(wide).metrics.buildableArea - derive(lopsided).metrics.buildableArea)).toBeLessThan(2000)
  })
})

describe('the verbs for an existing road', () => {
  // the demo has its south street (an existing street) already: these verbs add to a site with none
  const demo = demoProject({ streets: false })
  const p = { ...demo, site: { ...demo.site, existingRoads: undefined } }
  const line = [P(0, 0), P(100, 0), P(200, 30)]

  it('addExistingRoad: centred by default, the side by its edge, the width the standards’ when absent', () => {
    expect(addExistingRoad(p, line, 10)!.project.site.existingRoads![0].stretches).toEqual([{ left: 5, right: 5 }, { left: 5, right: 5 }])
    expect(addExistingRoad(p, line, 10, 'left')!.project.site.existingRoads![0].stretches[0]).toEqual({ left: 0, right: 10 })
    expect(addExistingRoad(p, line, 10, 'right')!.project.site.existingRoads![0].stretches[1]).toEqual({ left: 10, right: 0 })
    const w = addExistingRoad(p, line)!.project.site.existingRoads![0].stretches[0]
    expect(w.left + w.right).toBeGreaterThan(0)
  })

  it('updateExistingRoad: stretches replace its sides; a longer line keeps the last pair going', () => {
    const r = addExistingRoad(p, line, 10, 'left')!
    const q = updateExistingRoad(r.project, r.id, { stretches: [{ left: 1, right: 2 }, { left: 3, right: 4 }] })
    expect(q.site.existingRoads![0].stretches).toEqual([{ left: 1, right: 2 }, { left: 3, right: 4 }])
    const longer = updateExistingRoad(q, r.id, { points: [...line, P(300, 30)] })
    expect(longer.site.existingRoads![0].stretches).toEqual([{ left: 1, right: 2 }, { left: 3, right: 4 }, { left: 3, right: 4 }])
  })
})

describe('an existing road is one street (Phase PE.1 review)', () => {
  it('every run of a widened existing road names the road as its street: existing:<id>', () => {
    const rs = existingRoads({ existingRoads: [road([{ left: 3, right: 3 }, { left: 3, right: 3 }, { left: 0, right: 9 }])] })
    expect(rs.map((r) => r.id)).toEqual(['existing:r1', 'existing:r1:3'])
    expect(rs.map((r) => r.street)).toEqual(['existing:r1', 'existing:r1'])
  })
})
