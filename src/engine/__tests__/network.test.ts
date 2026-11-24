// The road network (Decision "Exterior circulation", 4.4; since ST.4 nothing of it is derived, Decision "Streets").
// What version 10 derived, the migration's to draw (legacy/): rings around each building's masses (past the courts
// where they dock), links from the gate and the courts, joins between the parts, removed roads, the load. What the
// network reads from the streets: the `access` relation, the gates that lead nowhere, the roads' issues. The demo:
// Warehouse 1 (x 40–200, y 70–150) docks south, Warehouse 2 (x 250–390) docks north, Office 1 (x 100–140, y 190–210);
// the south street's gate at x 225; roads 8 m, courts 40 m, clearance 7 m; the roads no truck takes to a court, car
// roads of 6 m (Decision "Circulation optimization"). How rings live with each other (merge, share, never doubled) is
// the stress test's (circulation.stress.test.ts).
import { describe, expect, it } from 'vitest'
import type { Point, Project } from '../../model/schema.ts'
import { derive } from '../derive.ts'
import { derivedRoadsOf } from '../circulation/legacy/toStreets.ts'
import type { LegacyOption } from '../circulation/legacy/types.ts'
import { addGate, updateGate, updateStandards } from '../../state/actions/circulation.ts'
import { removeStreetSegment, setStreetSegmentType } from '../../state/actions/streets.ts'
import { addRoad } from '../../state/__tests__/road.ts'
import { demoProject } from '../../state/demo.ts'
import { distancePointSegment } from '../geom/polygon.ts'
import { asLegacy } from './stress/audit.ts'

/** The demo as version 10 had it: no streets, its roads derived. */
const bare = () => demoProject({ streets: false })
/** What version 10 derived for Option 1 (the demo’s south street, an existing street along its boundary, was a frontage then: no road). */
const legacy = (p: Project) => derivedRoadsOf(asLegacy(p)).o1
/** Option 1 as version 10 wrote it: a field of its own. */
const withLegacy = (p: Project, o: Partial<LegacyOption>): Project => ({ ...p, options: p.options.map((x) => ({ ...x, ...o })) })
const roads = (p: Project) => derive(p).circulation.roads
const issues = (p: Project, code: string) => derive(p).issues.filter((i) => i.code === code)
const flat = (y: number) => (r: { points: { y: number }[] }) => r.points.every((q) => Math.abs(q.y - y) < 1e-6)
const on = (q: Point) => (r: { points: Point[]; width: number }) => r.points.slice(1).some((b, i) => distancePointSegment(q, r.points[i], b) <= r.width / 2)

describe('rings (version 10’s, drawn by the migration)', () => {
  it('around each mass’s rectangle: past the court where it docks (40 + 4 m), by the clearance elsewhere (7 + 4 m)', () => {
    const rs = legacy(bare()).filter((r) => r.kind === 'ring')
    // Warehouse 1's: x 29–211, y 26–170
    const south = rs.find((r) => flat(26)(r))!
    expect(south.points.map((q) => q.x).sort((a, b) => a - b)).toEqual([29, 211])
    // Warehouse 2's docks north: its ring passes 44 m north of it (y 194), 11 m south (y 59)
    expect(rs.some(flat(194))).toBe(true)
    expect(rs.some(flat(59))).toBe(true)
    // three rings
    expect(new Set(rs.map((r) => r.id.split(':').slice(0, 3).join(':'))).size).toBe(3)
    expect(rs.every((r) => r.buildingId === 'b1')).toBe(true)
  })

  it('two rings too close for two rows of stalls between them share one road, halfway', () => {
    const rs = legacy(bare()).filter((r) => r.kind === 'ring')
    // Warehouse 1's north side would run at y 161, Office 1's south side at y 179: 18 m apart. Both move to y 170;
    // Office 1's side (x 89–151) serves both, Warehouse 1's keeps the stretches past it
    const shared = rs.filter(flat(170)).map((r) => r.points.map((q) => Math.round(q.x * 1e6) / 1e6).sort((a, b) => a - b))
    expect(shared.sort((a, b) => a[0] - b[0])).toEqual([
      [29, 89],
      [89, 151],
      [151, 211],
    ])
    expect(rs.some(flat(161)) || rs.some(flat(179))).toBe(false)
    expect(rs).toHaveLength(13)
    // a truck road or, where no truck goes, a car road (by load, below)
    expect(rs.every((r) => (r.vehicles === 'all' && r.width === 8) || (r.vehicles === 'cars' && r.width === 6))).toBe(true)
  })

  it('a building’s ring off: none for it; the gate and the courts are linked instead', () => {
    const rs = legacy(withLegacy(bare(), { ringOff: ['b1'] }))
    expect(rs.filter((r) => r.kind === 'ring')).toEqual([])
    expect(rs.some((r) => r.id === 'gate:g1')).toBe(true)
    expect(rs.some((r) => r.id.startsWith('court:m2'))).toBe(true)
  })
})

describe('links and joins (version 10’s)', () => {
  it('the gate’s lane is linked to the nearest ring; the rings no gate reaches are joined', () => {
    const rs = legacy(bare())
    const link = rs.find((r) => r.id === 'gate:g1')!
    expect(link.kind).toBe('link')
    expect(link.points[0].x).toBeCloseTo(225, 6) // from the gate
    // Warehouse 2's ring, to Warehouse 1's (Office 1's shares its road)
    expect(rs.filter((r) => r.id.startsWith('join:'))).toHaveLength(1)
  })

  it('a removed road stays out while a derived road passes there', () => {
    const rs = legacy(withLegacy(bare(), { removedRoads: [{ x: 120, y: 26 }] })).filter((r) => r.kind === 'ring') // Warehouse 1's south side
    expect(rs.some(flat(26))).toBe(false)
    expect(rs).toHaveLength(12)
  })
})

describe('road width by load (version 10’s)', () => {
  // a court's roads: those that pass within a road and the clearance of it
  const near = (court: { x: number; y: number }[], r: { points: { x: number; y: number }[]; width: number }) =>
    court.some((q) => r.points.slice(1).some((b, i) => distancePointSegment(q, r.points[i], b) <= r.width / 2 + 7 + 1))

  it('the roads the trucks take from the gate to each court stay truck roads; the rest are car roads, 6 m', () => {
    const p = bare()
    const rs = legacy(p)
    const cars = rs.filter((r) => r.vehicles === 'cars')
    expect(cars.length).toBeGreaterThan(0)
    expect(cars.every((r) => r.width === 6)).toBe(true)
    // the gate's link and a truck road at each court
    expect(rs.find((r) => r.id === 'gate:g1')).toMatchObject({ vehicles: 'all', width: 8 })
    for (const k of derive(p).circulation.docks) expect(rs.some((r) => r.vehicles === 'all' && near(k.court, r))).toBe(true)
    // Office 1's side of the shared road (x 89–151, y 170) leads to no court
    expect(rs.find((r) => flat(170)(r) && Math.min(...r.points.map((q) => q.x)) > 88)).toMatchObject({ vehicles: 'cars', width: 6 })
  })

  it('the car road width is a standard; a gate for cars only makes every derived road a car road', () => {
    expect(legacy(updateStandards(bare(), { carRoadWidth: 5.5 })).filter((r) => r.vehicles === 'cars').every((r) => r.width === 5.5)).toBe(true)
    expect(legacy(updateGate(bare(), 'o1', 'g1', { vehicles: 'cars' })).every((r) => r.vehicles === 'cars' && r.width === 6)).toBe(true)
  })

  it('a second gate for trucks out: the way from the courts to it stays a truck road too', () => {
    const one = legacy(bare()).filter((r) => r.vehicles === 'all').length
    const p = addGate(bare(), 'o1', 0.15, { flow: 'out', vehicles: 'trucks' }).project
    const out = derive(p).circulation.gates.find((g) => g.flow === 'out')!
    const rs = legacy(p)
    expect(rs.filter((r) => r.points.slice(1).some((b, i) => distancePointSegment(out.at, r.points[i], b) <= r.width / 2 + 1)).some((r) => r.vehicles === 'all')).toBe(true)
    expect(rs.filter((r) => r.vehicles === 'all').length).toBeGreaterThanOrEqual(one)
  })
})

describe('the access relation and the gates, on the streets', () => {
  it('the demo’s streets reach both warehouses from the gate; nothing warns', () => {
    const d = derive(demoProject())
    expect(d.circulation.reached.sort()).toEqual(['m1', 'm2'])
    expect(d.circulation.nowhere).toEqual([])
    expect(d.issues.filter((i) => ['gate', 'access', 'road', 'court'].includes(i.code))).toEqual([])
    expect(d.circulation.totals.roadArea).toBeGreaterThan(8 * 1000)
  })

  it('no street: no road is derived and no warehouse is reached (the gate stands on the south street, an existing street, so it leads somewhere)', () => {
    const d = derive(bare())
    // only its south street, an existing street: no street of the option's
    expect(d.circulation.roads.filter((r) => r.kind !== 'existing')).toEqual([])
    expect(d.issues.filter((i) => i.code === 'gate').map((i) => i.message)).toEqual([])
    expect(d.issues.filter((i) => i.code === 'access').map((i) => i.message)).toEqual(['No truck gate reaches the docks of Warehouse 1.', 'No truck gate reaches the docks of Warehouse 2.'])
  })

  it('no gate: one warning that says where to put one', () => {
    const p = demoProject()
    const none = { ...p, site: { ...p.site, gates: undefined } }
    expect(issues(none, 'gate').map((i) => i.message)).toEqual(['No gate yet: place a gate on the boundary or on a street’s side (Gate, in the Streets group of the Tools strip).'])
    expect(issues(none, 'access')).toEqual([])
  })

  it('a gate for cars only lets no trucks in', () => {
    const p = updateGate(demoProject(), 'o1', 'g1', { vehicles: 'cars' })
    expect(issues(p, 'gate').map((i) => i.message)).toEqual(['No gate lets trucks in: the docks cannot be reached.'])
  })

  it('the street from the gate deleted: no warehouse is reached (the gate still stands on the south street)', () => {
    const p = demoProject()
    const g = derive(p).circulation.gates[0]
    const street = roads(p).find((r) => r.kind === 'street' && on(g.at)(r))!
    const q = (street.segments ?? []).reduce((x, id) => removeStreetSegment(x, 'o1', id), p)
    expect(issues(q, 'gate').map((i) => i.message)).toEqual([])
    expect(issues(q, 'access').map((i) => i.message)).toEqual(['No truck gate reaches the docks of Warehouse 1.', 'No truck gate reaches the docks of Warehouse 2.'])
  })

  it('a street for cars is no way for trucks: the street from the gate made a car street, no warehouse is reached', () => {
    const p = demoProject()
    const g = derive(p).circulation.gates[0]
    const street = roads(p).find((r) => r.kind === 'street' && on(g.at)(r))!
    const q = setStreetSegmentType(p, 'o1', street.segments ?? [], 'cars')
    expect(issues(q, 'access').map((i) => i.message)).toEqual(['No truck gate reaches the docks of Warehouse 1.', 'No truck gate reaches the docks of Warehouse 2.'])
  })
})

describe('streets drawn by hand', () => {
  it('kept in the network; too narrow, over a mass or with an end that leads nowhere, they warn', () => {
    // from Warehouse 1's street (y 170) north into the open, 5 m wide, for trucks
    let p = addRoad(demoProject(), 'o1', [{ x: 60, y: 170 }, { x: 60, y: 240 }], { width: 5, vehicles: 'trucks' })!.project
    expect(roads(p).some((r) => r.kind === 'street' && r.width === 5)).toBe(true)
    expect(issues(p, 'road').map((i) => i.message)).toEqual(['A street is 5 m wide: its trucks need 7 m.', 'A street ends nowhere: a dead end.'])
    // across Office 1
    p = addRoad(demoProject(), 'o1', [{ x: 90, y: 200 }, { x: 160, y: 200 }])!.project
    expect(issues(p, 'road').map((i) => i.message)).toContain('A street runs over Office 1.')
  })
})
