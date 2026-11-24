// The site's access, derived (Decision "Exterior circulation", 4.2): gates with their lane, guard house and arrow,
// existing roads out of the buildable area (a street the site faces is one: Phase PE.2). The demo site:
// (0,0) → (420,0) → (440,240) → (20,280), counter-clockwise; its bottom side is the first 420 m of the perimeter.
import { describe, expect, it } from 'vitest'
import { derive } from '../derive.ts'
import { perimeter } from '../geom/perimeter.ts'
import { clampToStretch } from '../circulation/access.ts'
import { stripRegions } from '../path/strip.ts'
import { regionsArea } from '../geom/boolean.ts'
import { addExistingRoad, addGate, ownGates, updateGate } from '../../state/actions/circulation.ts'
import { addOption } from '../../state/actions/buildings.ts'
import { demoProject } from '../../state/demo.ts'

/** The demo without its access (no existing street, no gates): each test marks its own. */
const bareDemo = () => {
  const p = demoProject()
  return { ...p, site: { boundary: p.site.boundary, rules: p.site.rules } }
}

const P = perimeter([
  { x: 0, y: 0 },
  { x: 420, y: 0 },
  { x: 440, y: 240 },
  { x: 20, y: 280 },
])
const t = (along: number) => along / P // a point `along` m from (0,0) on the bottom side

describe('gates', () => {
  it('an opening on the boundary, a lane inside as long as its queue, a guard house beside it, an arrow in', () => {
    const p = addGate(bareDemo(), 'o1', t(200), { width: 12, queue: 30, guardHouse: true, flow: 'in' }).project
    const [g] = derive(p).circulation.gates
    expect(g.at.x).toBeCloseTo(200, 6)
    expect(g.inward.y).toBeCloseTo(1, 9)
    expect([g.a.x, g.b.x].map((x) => Math.round(x))).toEqual([194, 206])
    expect(Math.max(...g.lane.map((q) => q.y))).toBeCloseTo(30, 6) // the queue
    expect(g.guardHouse!.every((q) => q.x > 206 && q.y >= 1)).toBe(true)
    expect(g.arrow.to.y).toBeCloseTo(30, 6)
    expect(g.arrow.from.y).toBeLessThan(0) // from the street
    expect(g).not.toHaveProperty('onFrontage')
  })

  it('a lane is at least a road long without a queue', () => {
    const p = addGate(bareDemo(), 'o1', t(200)).project
    expect(Math.max(...derive(p).circulation.gates[0].lane.map((q) => q.y))).toBeCloseTo(8, 6)
  })

  it('a gate anywhere on the boundary draws no warning for where it stands (a street is the network’s: network.test.ts)', () => {
    const p = addGate(bareDemo(), 'o1', t(50)).project
    expect(derive(p).issues.filter((i) => i.code === 'gate' && /street/.test(i.message))).toEqual([])
    expect(derive(p).circulation).not.toHaveProperty('frontage')
  })

  it('an option with its own gates draws those; the others the site’s', () => {
    let p = addGate(bareDemo(), 'o1', t(200)).project
    p = addOption(p, { buildingIds: ['b1'] }).project
    p = ownGates(p, 'o2')
    p = updateGate(p, 'o2', 'g1', { t: t(300) })
    const d = derive(p)
    expect(d.options.o1.circulation.gates[0].at.x).toBeCloseTo(200, 6)
    expect(d.options.o2.circulation.gates[0].at.x).toBeCloseTo(300, 6)
  })
})

describe('existing roads', () => {
  it('are drawn as roads of the network and leave the buildable area, setback around them included', () => {
    const before = derive(bareDemo()).metrics.buildableArea
    const r = addExistingRoad(bareDemo(), [{ x: -10, y: 140 }, { x: 460, y: 140 }], 10)!
    const d = derive(r.project)
    expect(d.circulation.roads.filter((x) => x.kind === 'existing')).toEqual([{ id: `existing:${r.id}`, kind: 'existing', points: [{ x: -10, y: 140 }, { x: 460, y: 140 }], width: 10, left: 5, right: 5, lanes: [10 / 3, 10 / 3, 10 / 3], vehicles: 'all', sourceId: r.id, street: `existing:${r.id}`, nodePoints: [{ x: -10, y: 140 }, { x: 460, y: 140 }] }])
    // the road (10 m) and the setback (10 m) on each side: a 30 m band across the buildable area
    expect(before - d.metrics.buildableArea).toBeGreaterThan(30 * 380)
    expect(before - d.metrics.buildableArea).toBeLessThan(30 * 420)
  })

  it('a bent centreline is paved without a notch at its bend', () => {
    const area = regionsArea(stripRegions([{ points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }], width: 10 }]))
    // two 100 × 10 strips, overlapping at the bend, plus the bend's outer corner rounded
    expect(area).toBeGreaterThan(1950)
    expect(area).toBeLessThan(2100)
  })
})

describe('sliding along a boundary side', () => {
  it('keeps t inside the stretch, a margin from its ends; outside, at the nearer end', () => {
    expect(clampToStretch(0.25, 0.2, 0.4, 0.01)).toBeCloseTo(0.25, 9)
    expect(clampToStretch(0.1, 0.2, 0.4, 0.01)).toBeCloseTo(0.21, 9)
    expect(clampToStretch(0.5, 0.2, 0.4, 0.01)).toBeCloseTo(0.39, 9)
    expect(clampToStretch(0.95, 0.9, 0.1, 0.01)).toBeCloseTo(0.95, 9) // across vertex 0
    expect(clampToStretch(0.12, 0.9, 0.1, 0.01)).toBeCloseTo(0.09, 9)
    expect(clampToStretch(0.3, 0.2, 0.21, 0.01)).toBeCloseTo(0.205, 9) // too short: its middle
  })
})
