import { describe, test, expect } from 'vitest' // mixed-use-mvp patch: GIM corre Vitest sin globals
import { massBuilding } from '../src/model/massing'
import { calcBuilding, calcOption, parkingShape } from '../src/model/calc'
import { fresh, newBuilding, parseSaved } from '../src/model/state'
import type { Building, State } from '../src/model/state'
import { area } from '../src/model/geom'
import type { GeomObj, Ring } from '../src/host/protocol'

const sq = (x0: number, y0: number, x1: number, y1: number): Ring => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]
const obj = (id: string, ring: Ring): GeomObj => ({ id, kind: 'curve', name: id, layer: 'Default', closed: true, planar: true, z: 0, rings: [ring], bbox: [0, 0, 0, 0, 0, 0] })
const close = (a: number, b: number, eps = 1e-6) => expect(Math.abs(a - b)).toBeLessThan(eps)

function setup(fp: Ring = sq(0, 0, 30, 30), core: Ring | null = sq(12, 12, 18, 18), patch: Partial<Building> = {}) {
  const s: State = fresh()
  const b = s.options[0].buildings[0]
  Object.assign(b, { levels: 10, lobbyH: 4.5, typH: 3.2, mix: { studio: 30, br1: 45, br2: 25 }, stack: {}, setbackFrom: 99, setbackDist: 3, basements: 0 }, patch)
  b.mode = 'fp'
  b.links.footprint = ['fp']
  b.links.core = core ? ['core'] : []
  const geom = new Map<string, GeomObj>([['fp', obj('fp', fp)]])
  if (core) geom.set('core', obj('core', core))
  return { s, b, geom }
}

describe('massing', () => {
  test('L01 is lobby with no units', () => {
    const { s, b, geom } = setup()
    const r = calcBuilding(massBuilding(b, geom, s.progs), b, s, 0)
    expect(r.levels[0].program).toBe('Lobby')
    expect(r.levels[0].units).toBe(0)
    close(r.levels[0].sell, 0)
  })

  test('L02 net is 900 − 36 = 864 and sellable 743.04', () => {
    const { s, b, geom } = setup()
    const m = massBuilding(b, geom, s.progs)
    close(m.levels[1].net, 864, 1e-3)
    close(m.levels[1].sell, 743.04, 1e-3)
  })

  // the average method (round(743.04 / 58) = 13 split 4/6/3) is replaced by the WFC layout, spec §2.6
  test('units per level are the layout units, split by type', () => {
    const { s, b, geom } = setup()
    const r = calcBuilding(massBuilding(b, geom, s.progs), b, s, 0)
    const L = r.levels[1].layout!
    expect(r.levels[1].units).toBe(L.units.length)
    expect(r.levels[1].c).toEqual(s.unitTypes.map((t) => L.units.filter((u) => u.type === t.id).length))
    expect(r.units).toBe(r.levels.reduce((a, l) => a + (l.layout?.units.length ?? 0), 0))
    expect(r.units).toBeGreaterThan(9 * 8)
  })

  test('height = 4.5 + 9 × 3.2 = 33.3', () => {
    const { s, b, geom } = setup()
    close(massBuilding(b, geom, s.progs).height, 33.3, 1e-9)
  })

  // was ceil(9 × 10.4 × 1.10) = 103 from the average split; now Σ type stalls × layout count × 1.10, spec §2.6
  test('required stalls = ceil(Σ type stalls × count × 1.10)', () => {
    const { s, b, geom } = setup()
    const r = calcBuilding(massBuilding(b, geom, s.progs), b, s, 0)
    const raw = s.unitTypes.reduce((a, t, k) => a + r.counts[k] * t.stalls, 0) * 1.1
    close(r.reqRaw, raw, 1e-6)
    expect(r.req).toBe(Math.ceil(raw - 1e-9))
  })

  test('retail podium of 2 levels uses floor height 5.0 and 1 stall per 30 m² rentable', () => {
    const { s, b, geom } = setup(undefined, undefined, { stack: { ret: 2 } })
    const m = massBuilding(b, geom, s.progs)
    expect(m.levels[0].h).toBe(5)
    expect(m.levels[1].h).toBe(5)
    close(m.height, 5 + 5 + 8 * 3.2, 1e-9)
    const r = calcBuilding(m, b, s, 0)
    close(r.prog.ret.sell, 864 * 0.8 * 0.85 + 864 * 0.85, 1e-3)
    close(r.prog.ret.stallsRaw, (864 * 0.8 * 0.85 + 864 * 0.85) / 30, 1e-6)
  })

  test('setback from L06 by 3 m gives 24 × 24 plates', () => {
    const { s, b, geom } = setup(undefined, null, { setbackFrom: 6, setbackDist: 3 })
    const m = massBuilding(b, geom, s.progs)
    close(area(m.levels[4].shape), 900, 1e-3)
    close(area(m.levels[5].shape), 576, 1e-3)
    close(area(m.levels[9].shape), 576, 1e-3)
  })

  test('setback collapse leaves empty upper plates and an issue', () => {
    const { s, b, geom } = setup(sq(0, 0, 10, 10), null, { setbackFrom: 6, setbackDist: 6 })
    const m = massBuilding(b, geom, s.progs)
    expect(m.levels.length).toBe(5)
    close(m.height, 4.5 + 4 * 3.2, 1e-9)
    expect(m.issues).toContain('Setback leaves no plate from L06')
    const r = calcBuilding(m, b, s, 0)
    expect(Number.isFinite(r.gfa)).toBe(true)
    close(r.gfa, 5 * 100, 1e-3)
  })

  test('net area with core outside the footprint subtracts only the overlap', () => {
    const { s, b, geom } = setup(sq(0, 0, 30, 30), sq(27, 27, 33, 33))
    close(massBuilding(b, geom, s.progs).levels[1].net, 891, 1e-3)
  })

  test('massing ignores invalid rings', () => {
    const { s, b, geom } = setup([[0, 0], [10, 10], [10, 0], [0, 10]], null)
    const m = massBuilding(b, geom, s.progs)
    expect(m.ok).toBe(false)
    expect(m.issues).toContain('Footprint is not a simple closed curve')
  })

  test('no footprint linked is not ok', () => {
    const { s, b, geom } = setup()
    b.links.footprint = []
    const m = massBuilding(b, geom, s.progs)
    expect(m.ok).toBe(false)
    expect(m.issues).toContain('No footprint linked')
  })
})

describe('calculator', () => {
  test('land is allocated by footprint share across two buildings', () => {
    const { s, geom } = setup(sq(0, 0, 30, 30), null)
    const b2 = newBuilding(s.options[0])
    Object.assign(b2, { mode: 'fp', levels: 10, stack: {} })
    b2.links.footprint = ['fp2']
    geom.set('fp2', obj('fp2', sq(40, 0, 50, 10)))
    const t = calcOption(s.options[0], s, { geom })
    close(t.land, 10e6, 1e-3)
    close(t.bs[0].land, 9e6, 1e-3)
    close(t.bs[1].land, 1e6, 1e-3)
  })

  test('a block is sliced from host sections', () => {
    const { s, b, geom } = setup()
    b.mode = 'mass'
    b.blocks = [{ id: 'm', prog: 'res' }]
    geom.set('m', { ...obj('m', sq(0, 0, 20, 20)), kind: 'brep', planar: false, bbox: [0, 0, 0, 20, 20, 60] })
    const sec = new Map<number, Ring[]>()
    const sections = new Map([['m', sec]])
    const m0 = massBuilding(b, geom, s.progs, sections)
    expect(m0.ok).toBe(false)
    expect(m0.needs).toHaveLength(1)
    expect(m0.needs[0].zs.length).toBe(18)
    m0.needs[0].zs.forEach((z) => sec.set(z, [sq(0, 0, 20, 20)]))
    const m = massBuilding(b, geom, s.progs, sections)
    expect(m.ok).toBe(true)
    close(area(m.levels[3].shape), 400, 1e-6)
  })

  test('parking provided uses stalls per basement × basements', () => {
    const { s, b, geom } = setup(undefined, undefined, { basements: 3 })
    const r = calcBuilding(massBuilding(b, geom, s.progs), b, s, 25)
    expect(r.prov).toBe(75)
  })
})


describe('saved state', () => {
  test('parses its own output', () => {
    const s = fresh()
    const r = parseSaved(JSON.stringify(s))
    expect(r.warning).toBeUndefined()
    expect(r.state.options[0].buildings[0].name).toBe('Tower A')
  })
  test('foreign or broken state gives a fresh state and a warning', () => {
    expect(parseSaved('{"schema":7}').warning).toMatch(/another version/)
    expect(parseSaved('not json').warning).toMatch(/could not be read/)
    expect(parseSaved(null).warning).toBeUndefined()
  })
})

test('a footprint with no area in plan says so instead of showing 0 m²', () => {
  const { s, b, geom } = setup([[0, 0], [20, 0], [20, 0], [0, 0]], null) // a curve seen edge-on from Top
  const m = massBuilding(b, geom, s.progs)
  expect(m.ok).toBe(false)
  expect(m.issues.join(' ')).toMatch(/no area in plan/)
})

test('a 60 m Residential block builds a lobby and 17 floors: height is the solid, not a level counter', () => {
  const { s, b, geom } = setup()
  Object.assign(b, { mode: 'mass', levels: 24 }); b.blocks = [{ id: 'm', prog: 'res' }]
  geom.set('m', { ...obj('m', sq(0, 0, 20, 20)), kind: 'brep', planar: false, bbox: [0, 0, 0, 20, 20, 60] })
  const sec = new Map<number, Ring[]>()
  const sections = new Map([['m', sec]])
  massBuilding(b, geom, s.progs, sections).needs[0].zs.forEach((z) => sec.set(z, z < 60 ? [sq(0, 0, 20, 20)] : []))
  const m = massBuilding(b, geom, s.progs, sections)
  expect(m.levels.length).toBe(18)
  close(m.height, 60, 1e-9)
  const T = calcOption(s.options[0], s, { geom, sections } as never)
  expect(T.floors).toBe(17)
  close(T.height, 60, 1e-9)
})

// spec 2026-11-04-blocks §5.7: curves combine by nesting (even-odd)
describe('nested curves', () => {
  test('a footprint curve inside another is a hole', () => {
    const { s, b, geom } = setup(sq(0, 0, 40, 40), null)
    geom.set('hole', obj('hole', sq(15, 15, 25, 25)))
    b.links.footprint = ['fp', 'hole']
    close(massBuilding(b, geom, s.progs).levels[1].plateA, 1500, 0.5)
  })

  test('an island inside a hole is a plate again', () => {
    const { s, b, geom } = setup(sq(0, 0, 40, 40), null)
    geom.set('hole', obj('hole', sq(15, 15, 25, 25)))
    geom.set('isle', obj('isle', sq(18, 18, 22, 22)))
    b.links.footprint = ['fp', 'hole', 'isle']
    close(massBuilding(b, geom, s.progs).levels[1].plateA, 1516, 0.5)
  })

  test('parking curves nest the same way', () => {
    const { s, b, geom } = setup()
    geom.set('pk', obj('pk', sq(0, 0, 50, 30)))
    geom.set('pkh', obj('pkh', sq(20, 10, 30, 20)))
    b.links.parking = ['pk', 'pkh']
    const m = massBuilding(b, geom, s.progs)
    close(area(parkingShape(b, m, geom)), 1400, 0.5)
  })
})
