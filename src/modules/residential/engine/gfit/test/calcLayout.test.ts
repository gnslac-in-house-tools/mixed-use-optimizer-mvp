import { test, expect } from 'vitest' // mixed-use-mvp patch: GIM corre Vitest sin globals
import { massBuilding } from '../src/model/massing.ts'
import { calcBuilding, calcOption } from '../src/model/calc.ts'
import { priceFactor } from '../src/model/rules.ts'
import { removeUnitType } from '../src/model/program.ts'
import { fresh } from '../src/model/state.ts'
import type { Building, State } from '../src/model/state.ts'
import type { GeomObj, Ring } from '../src/host/protocol.ts'

const sq = (x0: number, y0: number, x1: number, y1: number): Ring => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]
const obj = (id: string, ring: Ring): GeomObj => ({ id, kind: 'curve', name: id, layer: 'Default', closed: true, planar: true, z: 0, rings: [ring], bbox: [0, 0, 0, 0, 0, 0] })

function setup(patch: Partial<Building> = {}) {
  const s: State = fresh()
  const b = s.options[0].buildings[0]
  Object.assign(b, { levels: 20, stack: {}, setbackFrom: 99, basements: 0 }, patch)
  b.mode = 'fp'
  b.links.footprint = ['fp']
  b.links.core = ['core']
  const geom = new Map<string, GeomObj>([['fp', obj('fp', sq(0, 0, 30, 30))], ['core', obj('core', sq(10.5, 10.5, 19.5, 19.5))]])
  return { s, b, geom, r: () => calcBuilding(massBuilding(b, geom, s.progs), b, s, 0, geom) }
}

test('units and sellable equal the layout', () => {
  const { r } = setup()
  const R = r()
  const res = R.levels.filter((l) => l.layout)
  expect(res).toHaveLength(19)
  expect(R.levels[0].layout).toBeUndefined()
  const n = res.reduce((a, l) => a + l.layout!.units.length, 0)
  expect(n).toBeGreaterThan(19 * 8)
  expect(R.units).toBe(n)
  expect(R.counts.reduce((a, c) => a + c, 0)).toBe(n)
  for (const l of res) {
    expect(l.units).toBe(l.layout!.units.length)
    expect(l.sell).toBeCloseTo(l.layout!.unitA, 6)
    expect(l.c.reduce((a, c) => a + c, 0)).toBe(l.units)
  }
  expect(R.nsa).toBeCloseTo(res.reduce((a, l) => a + l.layout!.unitA, 0), 6)
  expect(R.circ).toBeCloseTo(R.gfa - R.nsa, 6)
  expect(R.unassigned).toBeCloseTo(res.reduce((a, l) => a + l.layout!.leftover, 0), 6)
})

test('revenue is Σ area × price × factor', () => {
  const { s, r } = setup()
  const R = r()
  let want = 0
  const byType = s.unitTypes.map(() => 0)
  for (const l of R.levels) for (const u of l.layout?.units ?? []) {
    const k = s.unitTypes.findIndex((t) => t.id === u.type)
    const v = u.area * s.unitTypes[k].price * priceFactor(u, l.num, s.rules)
    want += v
    byType[k] += v
  }
  expect(want).toBeGreaterThan(0)
  expect(R.revenue).toBeCloseTo(want, 3)
  R.revT.forEach((v, k) => expect(v).toBeCloseTo(byType[k], 3))
})

test('stalls per unit by type', () => {
  const { s, r } = setup()
  const R = r()
  const raw = s.unitTypes.reduce((a, t, k) => a + R.counts[k] * t.stalls, 0)
  expect(R.prog.res.stallsRaw).toBeCloseTo(raw, 6)
  expect(R.reqRaw).toBeCloseTo(raw * (1 + s.cg.visitors / 100), 6)
})

test('deleting a unit type removes its column', () => {
  const { s, b, geom } = setup()
  expect(removeUnitType(s, 'br2')).toBe(true)
  const T = calcOption(s.options[0], s, { geom })
  expect(T.counts).toHaveLength(2)
  expect(T.revT).toHaveLength(2)
  expect(T.bs[0].counts).toHaveLength(2)
  expect(T.bs[0].levels[1].c).toHaveLength(2)
  expect(T.bs[0].levels[1].layout!.units.every((u) => u.type !== 'br2')).toBe(true)
  void b
})

test('a podium level keeps the v0.1 method; only residential levels get a layout', () => {
  const { r } = setup({ stack: { ret: 2 } })
  const R = r()
  expect(R.levels[0].layout).toBeUndefined()
  expect(R.levels[1].layout).toBeUndefined()
  expect(R.levels[1].units).toBe(0)
  expect(R.levels[2].layout).toBeDefined()
  expect(R.prog.ret.sell).toBeGreaterThan(0)
})
