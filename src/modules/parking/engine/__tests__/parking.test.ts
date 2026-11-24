// Car parking along the roads (Decision "Exterior circulation", 4.6; part of Plaza-Practiko's `calles.test.ts`): runs
// split at the bends, the parallel at an edge, a row of stalls on a line's right, the pieces inside the site; in the
// option: one side or both or none, clear of the masses, courts, lanes and roads, none along a road for trucks alone.
import { describe, expect, it } from 'vitest'
import type { Project } from '../../../../model/schema.ts'
import { derive } from '../../../../engine/derive.ts'
import { deriveParking, deriveParkingBy, overlap, parallel, piecesInside, roadSides, runsOf, segmentSides, stallsAlong, withSide } from '../parking.ts'
import { updateStandards } from '../../../../state/actions/circulation.ts'
import { standardsOf } from '../../../../engine/circulation/standards.ts'
import { newProject } from '../../../../typologies/index.ts'
import { addRoad } from '../../../../state/__tests__/road.ts'
import { setParking, setStreetParking } from '../../actions.ts'
import { pointInPolygon } from '../../../../engine/geom/polygon.ts'
import { demoProject } from '../../../../state/demo.ts'
import { setStreetEdges } from '../../../../state/actions/streets.ts'

const stalls = (p: Project) => derive(p).circulation.stalls

describe('rows of stalls', () => {
  it('a road splits into runs at its bends; a curve stays one', () => {
    expect(runsOf([{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 40 }])).toHaveLength(2)
    expect(runsOf([{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 100, y: 5 }])).toHaveLength(1)
  })

  it('the parallel to the left of a polyline, mitred', () => {
    expect(parallel([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }], 2)).toEqual([
      { x: 0, y: 2 },
      { x: 8, y: 2 },
      { x: 8, y: 10 },
    ])
  })

  it('a row on a line’s right: as many stalls as fit, centred; the pieces of a line inside an outline', () => {
    const row = stallsAlong([{ x: 0, y: 0 }, { x: 61, y: 0 }], 2.5, 5.5)
    expect(row).toHaveLength(24)
    expect(row[0][0].x).toBeCloseTo(0.5, 9)
    expect(row.every((c) => c[2].y === -5.5)).toBe(true) // to the right of a line going +x: below it
    const square = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ]
    expect(piecesInside([{ x: -5, y: 5 }, { x: 15, y: 5 }], square)).toEqual([
      [
        { x: 0, y: 5 },
        { x: 10, y: 5 },
      ],
    ])
  })

  it('two convex shapes overlap only past a touch', () => {
    const a = [
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { x: 2, y: 2 },
      { x: 0, y: 2 },
    ]
    expect(overlap(a, a.map((q) => ({ x: q.x + 2, y: q.y })))).toBe(false) // side by side
    expect(overlap(a, a.map((q) => ({ x: q.x + 1, y: q.y })))).toBe(true)
  })
})

describe('in the option', () => {
  it('both sides by default; one side fewer; none none', () => {
    const both = stalls(demoProject()).length
    expect(both).toBeGreaterThan(500)
    const one = stalls(updateStandards(demoProject(), { parking: 'single' })).length
    expect(one).toBeGreaterThan(100)
    expect(one).toBeLessThan(both)
    expect(stalls(updateStandards(demoProject(), { parking: 'none' }))).toEqual([])
    expect(derive(demoProject()).circulation.totals.stalls).toBe(both)
  })

  it('whole inside the site, clear of the masses and the truck courts, and of each other', () => {
    const d = derive(demoProject())
    const site = d.site.polygon!
    expect(d.circulation.stalls.every((c) => c.every((q) => pointInPolygon(q, site)))).toBe(true)
    const masses = Object.values(d.masses).map((m) => m.polygon)
    expect(d.circulation.stalls.some((c) => masses.some((m) => overlap(c, m)))).toBe(false)
    expect(d.circulation.stalls.some((c) => d.circulation.docks.some((k) => overlap(c, k.court)))).toBe(false)
    const xs = d.circulation.stalls
    expect(xs.some((c, i) => xs.slice(i + 1, i + 40).some((o) => overlap(c, o)))).toBe(false)
  })

  it('the option’s own parking over the standard (Decision "Circulation optimization"; a ring’s own went with ST.4)', () => {
    const both = stalls(demoProject()).length
    expect(stalls(setParking(demoProject(), 'o1', 'none'))).toEqual([])
    const one = stalls(setParking(demoProject(), 'o1', 'single')).length
    expect(one).toBeLessThan(both)
    expect(stalls(setParking(updateStandards(demoProject(), { parking: 'none' }), 'o1', 'double'))).toHaveLength(both)
    // cleared, back to the standard's
    expect(stalls(setParking(setParking(demoProject(), 'o1', 'none'), 'o1', null))).toHaveLength(both)
  })

  it('none along a road for trucks alone; a road for cars has its rows', () => {
    const p = demoProject({ streets: false })
    const [a, b] = [
      { x: 230, y: 230 },
      { x: 400, y: 215 },
    ]
    const l = Math.hypot(b.x - a.x, b.y - a.y)
    const u = { x: (b.x - a.x) / l, y: (b.y - a.y) / l }
    // a stall in a row along the road: its front parallel to it, its middle an edge and a half stall away from the axis
    const alongIt = (c: { x: number; y: number }[]) => {
      const f = { x: c[1].x - c[0].x, y: c[1].y - c[0].y }
      const m = { x: (c[0].x + c[2].x) / 2 - a.x, y: (c[0].y + c[2].y) / 2 - a.y }
      const s = m.x * u.x + m.y * u.y
      const off = Math.abs(m.x * -u.y + m.y * u.x)
      return Math.abs(f.x * u.y - f.y * u.x) < 0.1 && s > 0 && s < l && Math.abs(off - (4 + 2.75)) < 0.5
    }
    expect(stalls(addRoad(p, 'o1', [a, b], { vehicles: 'trucks' })!.project).filter(alongIt)).toEqual([])
    expect(stalls(addRoad(p, 'o1', [a, b], { vehicles: 'cars' })!.project).filter(alongIt).length).toBeGreaterThan(50)
  })
})

describe('by street side (Decision "Street parking by side")', () => {
  // the demo without its streets, the option parking nowhere, and one car street west to east at y 225, from x 160
  // to 260 and on to 360: two segments, the second drawn the other way (360 → 260)
  const street = () => {
    let p = setParking(demoProject({ streets: false }), 'o1', 'none')
    p = addRoad(p, 'o1', [{ x: 160, y: 225 }, { x: 260, y: 225 }], { vehicles: 'cars' })!.project
    p = addRoad(p, 'o1', [{ x: 360, y: 225 }, { x: 260, y: 225 }], { vehicles: 'cars' })!.project
    const [s1, s2] = p.options[0].streets!.segments
    return { p, s1: s1.id, s2: s2.id }
  }
  // the stalls along it: those whose middle is north (y over 225) or south of it, west or east of the corner at 260
  // (clear of it: there a stretch's row reaches half a street past its node, as at a bend)
  const near = (p: Project) => stalls(p).map((c) => ({ x: (c[0].x + c[2].x) / 2, y: (c[0].y + c[2].y) / 2 })).filter((m) => m.x > 155 && m.x < 365 && Math.abs(m.y - 225) < 12)
  const count = (p: Project, f: (m: { x: number; y: number }) => boolean) => near(p).filter(f).length
  const north = (m: { y: number }) => m.y > 225
  const west = (m: { x: number }) => m.x < 250
  const east = (m: { x: number }) => m.x > 270

  it('a segment’s own side over the option’s: its left walking a → b, its right, both; cleared, the option’s', () => {
    const { p, s1 } = street()
    expect(near(p)).toEqual([])
    const left = setStreetParking(p, 'o1', { [s1]: 'left' }) // s1 runs east: its left is north
    expect(count(left, (m) => west(m) && north(m))).toBeGreaterThan(25)
    expect(count(left, (m) => !north(m) || east(m))).toBe(0)
    const right = setStreetParking(p, 'o1', { [s1]: 'right' })
    expect(count(right, (m) => west(m) && !north(m))).toBeGreaterThan(25)
    expect(count(right, north)).toBe(0)
    const both = setStreetParking(p, 'o1', { [s1]: 'both' })
    expect(count(both, west)).toBe(count(left, west) + count(right, west))
    expect(near(setStreetParking(both, 'o1', { [s1]: null }))).toEqual([])
    expect(setStreetParking(both, 'o1', { [s1]: null }).options[0].streets!.segments[0].parking).toBeUndefined()
  })

  it('a segment drawn the other way: its left is the run’s right; one road, its segments each their stretch', () => {
    const { p, s1, s2 } = street()
    const road = derive(p).circulation.roads.find((r) => r.segments?.includes(s1))!
    expect(road.segments).toEqual([s1, s2]) // one street: the two meet at 260 and nothing else does
    expect(road.forward).toEqual([true, false])
    const q = setStreetParking(p, 'o1', { [s1]: 'left', [s2]: 'left' }) // s2 runs west: its left is south
    expect(derive(q).circulation.roads.find((r) => r.segments?.includes(s1))!.parking).toEqual(['left', 'right'])
    expect(count(q, (m) => west(m) && north(m))).toBeGreaterThan(25)
    expect(count(q, (m) => east(m) && !north(m))).toBeGreaterThan(25)
    expect(count(q, (m) => (west(m) && !north(m)) || (east(m) && north(m)))).toBe(0)
  })

  it('the option’s side for the segments with none of their own; a truck street none either way', () => {
    const { p, s1 } = street()
    const q = setStreetParking(setParking(p, 'o1', 'double'), 'o1', { [s1]: 'none' })
    expect(count(q, west)).toBe(0)
    expect(count(q, (m) => east(m) && north(m))).toBeGreaterThan(25)
    expect(count(q, (m) => east(m) && !north(m))).toBeGreaterThan(25)
    const trucks = addRoad(setParking(demoProject({ streets: false }), 'o1', 'none'), 'o1', [{ x: 160, y: 225 }, { x: 360, y: 225 }], { vehicles: 'trucks' })!
    expect(near(setStreetParking(trucks.project, 'o1', { [trucks.id]: 'both' }))).toEqual([])
  })

  it('a side turned on or off keeps the other; the sides written back to each segment’s own way', () => {
    expect(withSide('none', 'left', true)).toBe('left')
    expect(withSide('left', 'right', true)).toBe('both')
    expect(withSide('both', 'left', false)).toBe('right')
    expect(withSide('right', 'right', false)).toBe('none')
    const { p, s1, s2 } = street()
    const road = derive(p).circulation.roads.find((r) => r.segments?.includes(s1))!
    expect(segmentSides(road, ['left', null])).toEqual({ [s1]: 'left', [s2]: null })
    expect(segmentSides(road, ['right', 'right'])).toEqual({ [s1]: 'right', [s2]: 'left' })
    expect(roadSides(road, 'single')).toEqual(['left', 'left']) // the option's one side: the run's left
  })

  // Decision "Drawing side" (SE.2): the stretches run along the centre line, not the drawn edge
  it('a street drawn by its left edge, its segments parking differently: the stalls stand along its centre line', () => {
    const { p, s1, s2 } = street()
    const sided = setStreetEdges(p, 'o1', { [s1]: { left: 0, right: 8 }, [s2]: { left: 8, right: 0 } }) // s2 runs west: its right is the run's left
    const w = derive(sided).circulation.roads.find((r) => r.segments?.includes(s1))!.width
    const mixed = (q: Project) => setStreetParking(q, 'o1', { [s1]: 'right', [s2]: 'none' })
    const along = (q: Project) => stalls(q).map((c) => ({ x: (c[0].x + c[2].x) / 2, y: (c[0].y + c[2].y) / 2 })).filter((m) => m.x > 155 && m.x < 250 && Math.abs(m.y - 225) < 20)
    const centred = along(mixed(p))
    expect(centred.length).toBeGreaterThan(25)
    // the centre line half a width south of the drawn one: every stall too
    const moved = along(mixed(sided))
    expect(moved).toHaveLength(centred.length)
    moved.forEach((m, i) => expect(m.y).toBeCloseTo(centred[i].y - w / 2, 6))
  })

  it('a new industrial project parks nowhere until a street is given a side; the verb is one step, unknown ids left alone', () => {
    expect(standardsOf(newProject('industrial')).parking).toBe('none')
    const { p, s1 } = street()
    expect(setStreetParking(p, 'o1', { nope: 'both' })).toBe(p)
    expect(setStreetParking(p, 'o1', { [s1]: null })).toBe(p)
    expect(setStreetParking(p, 'o2', { [s1]: 'both' })).toBe(p)
  })
})

describe('the stalls and the road each stands along (Phase AS.4: Hide for one street)', () => {
  const two = () => {
    let p = demoProject({ streets: false })
    p = addRoad(p, 'o1', [{ x: 160, y: 225 }, { x: 260, y: 225 }], { vehicles: 'cars' })!.project
    p = addRoad(p, 'o1', [{ x: 300, y: 190 }, { x: 400, y: 190 }], { vehicles: 'cars' })!.project
    return p
  }
  const middle = (c: { x: number; y: number }[]) => ({ x: (c[0].x + c[2].x) / 2, y: (c[0].y + c[2].y) / 2 })
  const from = (q: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) => {
    const t = Math.max(0, Math.min(1, ((q.x - a.x) * (b.x - a.x) + (q.y - a.y) * (b.y - a.y)) / ((b.x - a.x) ** 2 + (b.y - a.y) ** 2)))
    return Math.hypot(q.x - (a.x + t * (b.x - a.x)), q.y - (a.y + t * (b.y - a.y)))
  }

  it('stallRoads has one entry for each stall, index for index, and names the street it stands along', () => {
    const c = derive(two()).circulation
    const streets = c.roads.filter((r) => r.kind === 'street')
    expect(streets).toHaveLength(2)
    expect(c.stalls.length).toBeGreaterThan(20)
    expect(c.stallRoads).toHaveLength(c.stalls.length)
    for (const [i, stall] of c.stalls.entries()) {
      const q = middle(stall)
      const nearest = streets.map((r) => ({ id: r.id, d: Math.min(...(r.nodePoints ?? r.points).slice(1).map((b, k) => from(q, (r.nodePoints ?? r.points)[k], b))) })).sort((a, b) => a.d - b.d)[0]
      expect(c.stallRoads![i]).toBe(nearest.id)
    }
    // both streets have stalls of their own
    expect(new Set(c.stallRoads)).toEqual(new Set(streets.map((r) => r.id)))
  })

  it('deriveParking gives the stalls deriveParkingBy gives, the same polygons in the same order; no site, none', () => {
    const p = two()
    const roads = derive(p).circulation.roads.filter((r) => r.kind === 'street')
    const input = { roads, shown: [], docks: [], gates: [], site: [{ x: 0, y: 0 }, { x: 600, y: 0 }, { x: 600, y: 500 }, { x: 0, y: 500 }], standards: standardsOf(p), option: p.options[0] }
    const by = deriveParkingBy(input)
    expect(by.stalls.length).toBeGreaterThan(20)
    expect(deriveParking(input)).toEqual(by.stalls)
    expect(by.roads).toHaveLength(by.stalls.length)
    expect(new Set(by.roads)).toEqual(new Set(roads.map((r) => r.id)))
    expect(deriveParkingBy({ ...input, site: null })).toEqual({ stalls: [], roads: [] })
    expect(deriveParking({ ...input, site: null })).toEqual([])
  })
})
