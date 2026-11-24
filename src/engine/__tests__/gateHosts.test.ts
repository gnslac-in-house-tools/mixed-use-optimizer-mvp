// A gate's host (Phase PE.2, task 9; Decision "On edge engine"): on the boundary (`t`) or on a side of a street or an existing street (`on`).
// `gatePlace` puts its opening on that side, the lane running away from the street; `deriveGates` leaves out a gate whose host is not there.
import { describe, expect, it } from 'vitest'
import type { ExistingRoad, Gate, Polygon, Streets } from '../../model/schema.ts'
import { GateSchema } from '../../model/schema.ts'
import { deriveGates } from '../circulation/access.ts'
import { GATE_SLOT, gatePlace, type GateHosts } from '../circulation/gates.ts'
import { gateSides } from '../circulation/gateSides.ts'
import { derive } from '../derive.ts'
import { addGateOn } from '../../state/actions/circulation.ts'
import { demoProject } from '../../state/demo.ts'

const BOUNDARY: Polygon = [
  { x: 0, y: 0 },
  { x: 400, y: 0 },
  { x: 400, y: 300 },
  { x: 0, y: 300 },
]
// one segment from (0, 100) to (100, 100): 4 m of paving each side
const STREETS: Streets = {
  nodes: [
    { id: 'n1', x: 0, y: 100 },
    { id: 'n2', x: 100, y: 100 },
  ],
  segments: [{ id: 's1', a: 'n1', b: 'n2', type: 'street', left: 4, right: 4 }],
}
// an existing street (0, 0) → (50, 0) → (50, 50), 6 m to its right, 2 m to its left (the second stretch 3 + 3)
const EXISTING: ExistingRoad = {
  id: 'e1',
  points: [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 50 }],
  stretches: [{ left: 2, right: 6 }, { left: 3, right: 3 }],
}
const hosts: GateHosts = { streets: STREETS, existingRoads: [EXISTING] }
const gate = (over: Partial<Gate>): Gate => ({ id: 'g1', width: 6, radius: 12, flow: 'both', vehicles: 'all', ...over }) as Gate

describe('the schema: a gate stands on the boundary or on a street', () => {
  it('t alone and on alone are valid', () => {
    expect(GateSchema.safeParse(gate({ t: 0.25 })).success).toBe(true)
    expect(GateSchema.safeParse(gate({ on: { kind: 'street', id: 's1', side: 'right', at: 20 } })).success).toBe(true)
    expect(GateSchema.safeParse(gate({ on: { kind: 'existing-road', id: 'e1', side: 'left', at: 10 } })).success).toBe(true)
  })

  it('neither, or both, is refused with its message', () => {
    for (const g of [gate({}), gate({ t: 0.5, on: { kind: 'street', id: 's1', side: 'left', at: 1 } })]) {
      const r = GateSchema.safeParse(g)
      expect(r.success).toBe(false)
      if (!r.success) expect(r.error.issues.map((i) => i.message)).toContain('A gate stands on the boundary or on a street')
    }
  })

  it('an unknown side or a negative place is refused', () => {
    expect(GateSchema.safeParse(gate({ on: { kind: 'street', id: 's1', side: 'up' as 'left', at: 1 } })).success).toBe(false)
    expect(GateSchema.safeParse(gate({ on: { kind: 'street', id: 's1', side: 'left', at: -1 } })).success).toBe(false)
  })
})

describe('gatePlace', () => {
  it('a boundary gate: on the boundary, its lane into the site', () => {
    const r = gatePlace(gate({ t: 0.125 }), BOUNDARY, {})!
    expect(r.at.x).toBeCloseTo(0.125 * 1400, 6)
    expect(r.at.y).toBeCloseTo(0, 6)
    expect(r.inward.y).toBeCloseTo(1, 6)
  })

  it('a gate on the right of a {4, 4} segment at 20 m: 4 m right of the drawn line, along it, the lane away from the street', () => {
    const r = gatePlace(gate({ on: { kind: 'street', id: 's1', side: 'right', at: 20 } }), BOUNDARY, hosts)!
    expect(r.at.x).toBeCloseTo(20, 6)
    expect(r.at.y).toBeCloseTo(96, 6)
    expect([r.dir.x, r.dir.y]).toEqual([1, 0])
    expect(r.inward.x).toBeCloseTo(0, 6)
    expect(r.inward.y).toBeCloseTo(-1, 6)
  })

  it('the left side lies 4 m to the other hand, its lane the other way', () => {
    const r = gatePlace(gate({ on: { kind: 'street', id: 's1', side: 'left', at: 20 } }), null, hosts)!
    expect(r.at.y).toBeCloseTo(104, 6)
    expect(r.inward.y).toBeCloseTo(1, 6)
  })

  it('a gate on an existing street: the stretch its place falls in, that stretch’s own side', () => {
    const first = gatePlace(gate({ on: { kind: 'existing-road', id: 'e1', side: 'right', at: 10 } }), null, hosts)!
    expect(first.at.x).toBeCloseTo(10, 6)
    expect(first.at.y).toBeCloseTo(-6, 6)
    // 60 m along the line: 10 m into the second stretch, which runs +y; its right is +x … walking +y the right hand is +x
    const second = gatePlace(gate({ on: { kind: 'existing-road', id: 'e1', side: 'right', at: 60 } }), null, hosts)!
    expect(second.at.x).toBeCloseTo(53, 6)
    expect(second.at.y).toBeCloseTo(10, 6)
    expect(second.inward.x).toBeCloseTo(1, 6)
  })

  it('a host that is not there gives nothing', () => {
    expect(gatePlace(gate({ on: { kind: 'street', id: 'nope', side: 'left', at: 1 } }), BOUNDARY, hosts)).toBeNull()
    expect(gatePlace(gate({ on: { kind: 'existing-road', id: 'nope', side: 'left', at: 1 } }), BOUNDARY, hosts)).toBeNull()
    expect(gatePlace(gate({ on: { kind: 'street', id: 's1', side: 'left', at: 1 } }), BOUNDARY, {})).toBeNull()
    expect(gatePlace(gate({ t: 0.3 }), null, hosts)).toBeNull()
  })

  it('the slot is half a metre', () => {
    expect(GATE_SLOT).toBe(0.5)
  })
})

describe('gateSides', () => {
  it('a street’s two sides per segment, a boundary’s one per side, an existing street’s two per stretch', () => {
    expect(gateSides({ kind: 'street', id: 's1' }, hosts).map((s) => s.id)).toEqual(['s1:left', 's1:right'])
    expect(gateSides({ kind: 'existing-road', id: 'e1' }, hosts).map((s) => s.id)).toEqual(['0:left', '0:right', '1:left', '1:right'])
    expect(gateSides({ kind: 'boundary', id: 'site' }, hosts, BOUNDARY).map((s) => s.id)).toEqual(['boundary:0', 'boundary:1', 'boundary:2', 'boundary:3'])
  })

  it('a side has its length, its ends and its outward vector', () => {
    const [left, right] = gateSides({ kind: 'street', id: 's1' }, hosts)
    expect(left.length).toBeCloseTo(100, 6)
    expect([left.a.x, left.a.y]).toEqual([0, 104])
    expect([right.b.x, right.b.y]).toEqual([100, 96])
    expect(left.out.x).toBeCloseTo(0, 9)
    expect(left.out.y).toBeCloseTo(1, 9)
    expect(right.out.y).toBeCloseTo(-1, 6)
  })
})

describe('deriveGates', () => {
  it('a gate on the right side: its opening on that side, its lane away from the street, the end the network reaches', () => {
    const [d] = deriveGates(BOUNDARY, [gate({ on: { kind: 'street', id: 's1', side: 'right', at: 20 } })], hosts, 8)
    expect(d.on).toEqual({ kind: 'street', id: 's1', side: 'right', at: 20 })
    expect(d.t).toBeUndefined()
    expect(d.at.y).toBeCloseTo(96, 6)
    expect([d.a.x, d.a.y]).toEqual([17, 96])
    expect([d.b.x, d.b.y]).toEqual([23, 96])
    expect(d.inward.y).toBeCloseTo(-1, 6)
    expect(d.end.x).toBeCloseTo(20, 6)
    expect(d.end.y).toBeCloseTo(96 - 8, 6)
    expect(d.lane.map((q) => q.y).sort((x, y) => x - y)).toEqual([88, 88, 96, 96])
  })

  it('a gate whose host is not there is left out; a boundary one still needs the boundary', () => {
    const list = [gate({ id: 'g1', on: { kind: 'street', id: 'gone', side: 'left', at: 5 } }), gate({ id: 'g2', t: 0.1 }), gate({ id: 'g3', on: { kind: 'existing-road', id: 'e1', side: 'left', at: 5 } })]
    expect(deriveGates(BOUNDARY, list, hosts, 8).map((g) => g.id)).toEqual(['g2', 'g3'])
    expect(deriveGates(null, list, hosts, 8).map((g) => g.id)).toEqual(['g3'])
  })

  it('deriveCirculation gives it the option’s streets and the site’s existing streets', () => {
    const p = demoProject()
    const seg = p.options[0].streets!.segments[0]
    const q = addGateOn(p, 'o1', { kind: 'street', id: seg.id, side: 'right', at: 10 }).project
    const g = derive(q).circulation.gates.find((x) => x.on)!
    expect(g.on).toMatchObject({ kind: 'street', id: seg.id })
    const e = addGateOn(p, 'o1', { kind: 'existing-road', id: p.site.existingRoads![0].id, side: 'right', at: 30 }).project
    expect(derive(e).circulation.gates.find((x) => x.on)!.at.y).toBeLessThan(-14)
  })
})
