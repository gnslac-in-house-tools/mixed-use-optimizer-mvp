import { test, expect } from 'vitest' // mixed-use-mvp patch: GIM corre Vitest sin globals
import { layoutBuilding, layoutComputed, layoutStats } from '../src/layout/building'
// layoutBuilding keys plates by their index in m.levels; in a footprint tower that is the level number − 1
import { massBuilding } from '../src/model/massing'
import { fresh } from '../src/model/state'
import type { Building, State } from '../src/model/state'
import type { GeomObj, Ring } from '../src/host/protocol'

const sq = (x0: number, y0: number, x1: number, y1: number): Ring => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]
const obj = (id: string, ring: Ring): GeomObj => ({ id, kind: 'curve', name: id, layer: 'Default', closed: true, planar: true, z: 0, rings: [ring], bbox: [0, 0, 0, 0, 0, 0] })

function setup(fp: Ring = sq(0, 0, 30, 30), patch: Partial<Building> = {}) {
  const s: State = fresh()
  const b = s.options[0].buildings[0]
  Object.assign(b, { levels: 24, stack: {}, setbackFrom: 99, setbackDist: 3, basements: 0 }, patch)
  b.mode = 'fp'
  b.links.footprint = ['fp']
  b.links.core = ['core']
  const geom = new Map<string, GeomObj>([['fp', obj('fp', fp)], ['core', obj('core', sq(10.5, 10.5, 19.5, 19.5))]])
  return { s, b, geom, m: () => massBuilding(b, geom, s.progs) }
}

test('a 24-level typical tower solves one plate and reuses 22', () => {
  const { s, b, m } = setup()
  const L = layoutBuilding(m(), b, s)
  expect([...L.keys()].map((i) => i + 1)).toEqual(Array.from({ length: 23 }, (_, i) => i + 2))
  expect(layoutStats()).toEqual({ solved: 1, reused: 22 })
  expect(L.get(23)!.units).toBe(L.get(1)!.units)
  expect(L.get(1)!.units.length).toBeGreaterThan(8)
})

test('a setback from L10 solves 2 plates', () => {
  const { s, b, m } = setup(sq(0, 0, 40, 40), { setbackFrom: 10, setbackDist: 3 })
  layoutBuilding(m(), b, s)
  expect(layoutStats()).toEqual({ solved: 2, reused: 21 })
})

test('a levels-only rule on L5–8 solves 3 plates', () => {
  const { s, b, m } = setup()
  s.rules.push({ id: 'lo', kind: 'levels-only', on: true, strength: 'required', types: ['studio'], a: 5, b: 8 })
  const L = layoutBuilding(m(), b, s)
  expect(layoutStats().solved).toBe(3)
  expect(L.get(5)!.units.every((u) => u.type === 'studio')).toBe(true)
  expect(L.get(8)!.units.some((u) => u.type !== 'studio')).toBe(true)
})

test('30 levels recompute in under 150 ms after a footprint change', () => {
  const fp = sq(0, 0, 30, 30)
  const { s, b, geom, m } = setup(fp, { levels: 30 })
  layoutBuilding(m(), b, s)
  // the best of three edits (each a new plate, so each a real solve): the suite runs files in parallel and one
  // timing can be several times slower than the panel alone
  let best = Infinity
  for (const x of [31.2, 31.8, 32.4]) {
    geom.set('fp', obj('fp', [[0, 0], [x, 0], [30, 30], [0, 30]]))
    const t0 = performance.now()
    layoutBuilding(m(), b, s)
    best = Math.min(best, performance.now() - t0)
    expect(layoutStats().solved).toBe(1)
  }
  expect(best).toBeLessThan(150)
}, 10000)

test('the cache returns the same object for the same inputs', () => {
  const { s, b, m } = setup()
  const a = layoutBuilding(m(), b, s).get(1)
  const c = layoutBuilding(m(), b, s).get(1)
  expect(c).toBe(a)
})

test('only residential levels above the lobby are laid out', () => {
  const { s, b, m } = setup(sq(0, 0, 30, 30), { levels: 8, stack: { off: 2 } })
  const L = layoutBuilding(m(), b, s)
  expect([...L.keys()].map((i) => i + 1)).toEqual([3, 4, 5, 6, 7, 8])
})

test('price, stalls, colour and price rules do not lay the building out again', () => {
  const { s, b, m } = setup()
  const a = layoutBuilding(m(), b, s).get(1)
  const n = layoutComputed()
  s.unitTypes[0].price += 500
  s.unitTypes[1].stalls += 0.5
  s.unitTypes[2].color = '#123456'
  s.rules.push({ id: 'pc', kind: 'price-corner', on: true, strength: 'preferred', types: [], p: 5 })
  const c = layoutBuilding(m(), b, s).get(1)
  expect(layoutComputed()).toBe(n)
  expect(c).toBe(a)
  s.unitTypes[0].wMax += 0.6
  layoutBuilding(m(), b, s)
  expect(layoutComputed()).toBeGreaterThan(n)
})
