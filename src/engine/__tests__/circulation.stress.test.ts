// The circulation's stress test (Decision "Circulation stress pass"): some two hundred projects (sites of many shapes,
// masses near and far, turned, sites that shrink, grids and random layouts, dock walls facing each other, roads and
// gates that make no sense, extreme standards, odd masses, a drag step by step), each audited for what derive() must
// never produce (stress/audit.ts). Then the pass's rules, each on its own case; the same project far from the origin
// and turned; and time budgets.
import { describe, expect, it } from 'vitest'
import { ProjectSchema, type Point, type Project } from '../../model/schema.ts'
import { migrate } from '../../model/migrate.ts'
import { distancePointSegment, pointInPolygon } from '../geom/polygon.ts'
import { connectPaths } from '../circulation/connect.ts'
import { streetTypesOf, typeForVehicles } from '../circulation/streets.ts'
import { derive } from '../derive.ts'
import { intersection, regionsArea, union } from '../geom/boolean.ts'
import { joinedPaving } from '../path/join.ts'
import { stripOutlines, stripPieces, stripRegions } from '../path/strip.ts'
import { drawStreet, moveStreetNode } from '../../state/actions/streets.ts'
import { rotateMass } from '../../state/actions/masses.ts'
import { demoProject } from '../../state/demo.ts'
import { derivedRoadsOf } from '../circulation/legacy/toStreets.ts'
import { asLegacy, audit, edgeOffsets, frontageKept, gateHosts, laneSums, legacyStreets, pavingSeams } from './stress/audit.ts'
import { pavingRings } from '../../io/planPaving.ts'
import {
  bendsRemoved,
  carRoads,
  dragSteps,
  extremeStandards,
  facingDocks,
  frontagesMigrated,
  joined,
  lanes,
  many,
  meetingStreets,
  movedExisting,
  linkedStreets,
  nonsenseRoads,
  oddGates,
  oddMasses,
  ownSides,
  pairs,
  rotated,
  shrinking,
  readAs18,
  sampleMigrated,
  shapedCourts,
  sidedStreets,
  siteShapes,
  streetGates,
  streetsMoved,
  translated,
  turned,
  type Scenario,
} from './stress/scenarios.ts'

/** What breaks in a project; docks no gate reaches only when no Issue says so. */
function problems(p: Project): string[] {
  const a = audit(p)
  const d = a.derived
  const told = (name: string) => d.issues.some((i) => (i.code === 'access' && i.massIds.some((id) => d.masses[id]?.name === name)) || i.code === 'gate')
  return a.findings.filter((f) => f.check !== 'unreached' || !told(f.detail.replace(/^the docks of (.*) are not reached$/, '$1'))).map((f) => `${f.check}: ${f.detail}`)
}

const groups: Record<string, () => Scenario[]> = {
  'sites of many shapes': siteShapes,
  'two warehouses, near and far': pairs,
  'turned masses': turned,
  'a site that shrinks': shrinking,
  'grids and random layouts': many,
  'dock walls facing each other': facingDocks,
  'roads that make no sense': nonsenseRoads,
  'gates in odd places': oddGates,
  'extreme standards': extremeStandards,
  'odd masses': oddMasses,
  'a drag, step by step': dragSteps,
  'warehouses joined': joined,
  'car roads and an option’s parking': carRoads,
  'streets drawn by an edge': sidedStreets,
  'streets with sides of their own (Phase PE.1)': ownSides,
  'streets that meet (Phase PE.1)': meetingStreets,
  'street ends linked to an existing street (Phase PE.1)': linkedStreets,
  'lanes (Phase PE.2)': lanes,
  'frontages become existing streets (Phase PE.2)': frontagesMigrated,
  'gates on streets (Phase PE.2)': streetGates,
  'existing streets moved and turned (Phase PE.2)': movedExisting,
  'streets moved and turned with their gates (Phase PE.2)': streetsMoved,
  'a bend’s node deleted with gates on both segments (Phase PE.2)': bendsRemoved,
  'truck courts with a shape of their own (Phase D.3)': shapedCourts,
}

/** ms: a group of projects, each derived twice, while the rest of the suite runs beside it. */
const LONG = 60000

describe('every project keeps the invariants', () => {
  for (const [name, make] of Object.entries(groups))
    it(
      name,
      () => {
        const failures = make().flatMap((s) => problems(s.project).map((f) => `${s.name} → ${f}`))
        expect(failures).toEqual([])
      },
      LONG,
    )
})

/** m²: the paving of a project's roads, as their strips lie. */
const pavingArea = (p: Project) => regionsArea(stripRegions(derive(p).circulation.roads.map((r) => ({ points: r.points, width: r.width }))))

describe('version 18 files keep their paving (project 19, migration-kept)', () => {
  for (const [name, make] of Object.entries(groups))
    it(
      name,
      () => {
        const drift: string[] = []
        for (const sc of make()) {
          let read: Project
          try {
            read = readAs18(sc.project)
          } catch {
            continue // a project 19 refuses (a street under 0.5 m: the stress scenarios draw some) is no version 18 file to read
          }
          const d = Math.abs(pavingArea(sc.project) - pavingArea(read))
          if (d >= 1) drift.push(`${sc.name} → paving differs by ${d.toFixed(2)} m²`)
        }
        expect(drift).toEqual([])
      },
      LONG,
    )
})

describe('version 19 files keep their frontage street (project 20, migration-kept)', () => {
  it('every frontage became an existing street under the old street, and the gates stand where they stood', () => {
    const all = [...frontagesMigrated(), sampleMigrated()]
    expect(all.length).toBeGreaterThan(10)
    expect(all.flatMap((sc) => frontageKept(sc.before, sc.project, sc.frontages).map((f) => `${sc.name} → ${f}`))).toEqual([])
  })

  it('the check bites: with the existing street taken away, the old street is bare; a gate moved is told', () => {
    const sc = frontagesMigrated().find((x) => x.name === 'frontage: rectangle')!
    const without = { ...sc.project, site: { ...sc.project.site, existingRoads: undefined } }
    expect(frontageKept(sc.before, without, sc.frontages).some((f) => f.includes('is bare'))).toBe(true)
    const moved = { ...sc.project, site: { ...sc.project.site, gates: sc.project.site.gates!.map((g) => ({ ...g, t: g.t! + 0.01 })) } }
    expect(frontageKept(sc.before, moved, sc.frontages).some((f) => f.includes('moved'))).toBe(true)
  })
})

/**
 * Connect on a project (ST.7): every way it finds keeps to what a drawn street must (finite, no segment of no length,
 * its centreline in the site, its paving off the built masses), and the courts it counts add up.
 */
function connectProblems(p: Project): string[] {
  const o = p.options[0]
  const c = connectPaths(p, o.id)
  const d = derive(p)
  const site = d.site.polygon
  const t = typeForVehicles(streetTypesOf(p, o), 'trucks')
  const masses = Object.values(d.masses).filter((m) => o.buildingIds.includes(m.buildingId) && m.built && m.polygon.length >= 3 && m.span[0] <= 1e-6)
  const near = (q: Point, poly: Point[]) => pointInPolygon(q, poly) || poly.some((a, i) => distancePointSegment(q, a, poly[(i + 1) % poly.length]) <= 0.05)
  const out: string[] = []
  c.paths.forEach((path, k) => {
    if (!path.every((q) => Number.isFinite(q.x) && Number.isFinite(q.y))) out.push(`way ${k}: not finite`)
    if (path.slice(1).some((q, i) => Math.hypot(q.x - path[i].x, q.y - path[i].y) < 1e-6)) out.push(`way ${k}: a segment of no length`)
    if (site && !path.every((q) => near(q, site))) out.push(`way ${k}: leaves the site`)
    const strip = stripPieces(path, t.width)
    for (const m of masses) {
      const a = regionsArea(intersection(strip, [m.polygon]))
      if (a > 1) out.push(`way ${k}: runs over ${m.name} (${a.toFixed(0)} m²)`)
    }
  })
  if (c.linked + c.left > d.circulation.docks.length) out.push(`linked ${c.linked} + left ${c.left} > ${d.circulation.docks.length} courts`)
  return out
}

describe('Connect on every project (ST.7)', () => {
  for (const [name, make] of Object.entries(groups))
    it(
      name,
      () => {
        const failures = make().flatMap((sc) => connectProblems(sc.project).map((f) => `${sc.name} → ${f}`))
        expect(failures).toEqual([])
      },
      LONG,
    )
})

const scenario = (list: Scenario[], name: string) => list.find((s) => s.name === name)!.project
/** A scenario with its network drawn as the migration draws an old project's (Decision "Streets", ST.4), derived. */
const drawn = (p: Project) => derive(legacyStreets(p))
/** The roads version 10 derived for its first option (what the migration draws): the rings' rules are its. */
const legacy = (p: Project) => derivedRoadsOf(asLegacy(p))[p.options[0].id]
const bare = () => demoProject({ streets: false })
const vertical = (x: number) => (r: { points: Point[] }) => r.points.every((q) => Math.abs(q.x - x) < 1e-6)

describe('rings that meet (version 10’s, drawn by the migration)', () => {
  const ps = pairs()
  // the walls face each other at x 220 and 220 + gap; facing sides clear 7 m: a road needs 7 + 8 + 7 = 22 m
  it('no room for a road between two masses: one ring round both', () => {
    for (const own of ['', ', two buildings'])
      for (const gap of [0, 12, 20]) {
        const roads = legacy(scenario(ps, `pair ${gap} m apart${own}`)).filter((r) => r.kind === 'ring')
        expect(new Set(roads.map((r) => r.id.split(':').slice(0, 3).join(':'))).size).toBe(1)
        expect(roads.some((r) => r.points.every((q) => q.x > 220 - 1 && q.x < 220 + gap + 1))).toBe(false)
      }
  })

  it('room for one road but not for two with stalls between: one road, halfway', () => {
    for (const own of ['', ', two buildings'])
      for (const gap of [24, 30, 40]) {
        const roads = legacy(scenario(ps, `pair ${gap} m apart${own}`)).filter((r) => r.kind === 'ring')
        const between = roads.filter((r) => r.points.every((q) => q.x > 220 && q.x < 220 + gap))
        expect(between).toHaveLength(1)
        expect(vertical(220 + gap / 2)(between[0])).toBe(true)
      }
  })

  it('room for two rows of stalls between them: each keeps its own side', () => {
    for (const gap of [50, 60]) {
      const xs = legacy(scenario(ps, `pair ${gap} m apart`))
        .filter((r) => r.kind === 'ring' && r.points.every((q) => q.x > 220 && q.x < 220 + gap) && r.points[0].x === r.points[1].x)
        .map((r) => r.points[0].x)
      expect(xs).toHaveLength(2)
      expect(Math.abs(xs[0] - xs[1])).toBeGreaterThanOrEqual(8 + 2 * 5.5)
    }
  })

  it('dock walls 40–88 m apart share one truck court: one ring round both, the court entered from its sides, kept clear', () => {
    const fd = facingDocks()
    for (const gap of [40, 60, 80, 88]) {
      const d = drawn(scenario(fd, `dock walls facing ${gap} m apart`))
      expect(d.circulation.reached.sort()).toEqual(['m1', 'm2'])
      expect(d.circulation.approaches.length).toBeGreaterThan(0)
      expect(d.issues.filter((i) => i.code === 'access')).toEqual([])
    }
    // 100 m apart: a road down the middle, 6 m past each court's mouth: each served there, the 6 m paved
    const d = drawn(scenario(fd, 'dock walls facing 100 m apart'))
    const roads = d.circulation.roads.filter((r) => r.points.every((q) => Math.abs(q.y - 200) < 1e-6))
    expect(roads.length).toBeGreaterThan(0)
    expect(d.circulation.approaches.map((a) => Math.round(Math.abs(a[3].y - a[0].y)))).toEqual([6, 6])
    expect(d.circulation.reached.sort()).toEqual(['m1', 'm2'])
  })
})

describe('docks (Decision "Docks turn with the building")', () => {
  const outs = (p: Project) => derive(p).circulation.docks.map((k) => `${k.massId} ${Math.round(k.out.x)},${Math.round(k.out.y)}`)

  it('they turn with the building: Warehouse 1 turned round docks north; turned a quarter, east', () => {
    expect(outs(demoProject()).filter((x) => x.startsWith('m1'))).toEqual(['m1 0,-1'])
    expect(outs(rotateMass(demoProject(), 'm1', 180)).filter((x) => x.startsWith('m1'))).toEqual(['m1 0,1'])
    // a quarter turn (anticlockwise): its front, the local bottom, now faces east
    expect(outs(rotateMass(demoProject(), 'm1', 90)).filter((x) => x.startsWith('m1'))).toEqual(['m1 1,0'])
  })

  it('joined along their long walls: each on its free side, whatever room a neighbour’s depth would give', () => {
    for (const name of ['joined along their long walls, a site 300 m deep', 'joined along their long walls, a site 300 m deep, two buildings'])
      expect(outs(scenario(joined(), name)).sort()).toEqual(['m1 0,-1', 'm2 0,1'])
  })

  it('covered on both long walls: no docks, and an Issue says so', () => {
    const d = derive(scenario(joined(), 'three stacked'))
    expect(d.circulation.docks.map((k) => k.massId).sort()).toEqual(['m1', 'm3'])
    expect(d.circulation.covered).toEqual(['m2'])
    expect(d.issues.filter((i) => i.massIds.includes('m2')).map((i) => i.message)).toContain(
      'Warehouse 2 has no free wall for its docks: other masses stand against the walls they would take.',
    )
  })
})

describe('joins', () => {
  it('every part is joined, however many (no longer six at most), the nearest first: short joins', () => {
    for (const name of ['grid 4×4, 60 m apart, a building each', 'grid 6×6, 45 m apart, a building each', 'grid 6×6, 60 m apart']) {
      const p = scenario(many(), name)
      const d = drawn(p)
      const docked = new Set(d.circulation.docks.map((k) => k.massId))
      expect(d.circulation.reached.length).toBe(docked.size)
      const joins = legacy(p).filter((r) => r.id.startsWith('join:'))
      const length = (ps: Point[]) => ps.slice(1).reduce((n, q, i) => n + Math.hypot(q.x - ps[i].x, q.y - ps[i].y), 0)
      expect(Math.max(0, ...joins.map((r) => length(r.points)))).toBeLessThan(80)
    }
  })
})

describe('roads drawn by hand (streets since ST.3)', () => {
  it('a repeated point is joined; a line of no length is no street; a node dropped on its neighbour joins it', () => {
    const p = bare()
    const r = drawStreet(p, 'o1', [{ x: 230, y: 180 }, { x: 230, y: 180.001 }, { x: 230, y: 240 }])!
    expect(r.project.options[0].streets!.nodes.map((n) => [n.x, n.y])).toEqual([[230, 180], [230, 240]])
    expect(drawStreet(p, 'o1', [{ x: 300, y: 230 }, { x: 300, y: 230 }])).toBeNull()
    // its end dragged onto its start: nothing is left
    const [a, b] = r.project.options[0].streets!.nodes
    expect(moveStreetNode(r.project, 'o1', b.id, { x: a.x, y: a.y }).options[0].streets).toBeUndefined()
  })

  it('one drawn on a ring side takes its place: one road there, not two (the migration draws none on it)', () => {
    const d = drawn(scenario(nonsenseRoads(), 'road: on a ring side'))
    const south = d.circulation.roads.filter((r) => r.points.every((q) => Math.abs(q.y - 26) < 1e-6))
    expect(south.map((r) => r.segments)).toEqual([['s1']])
  })
})

describe('a version 10 file read (Decision "Streets", ST.4)', () => {
  it('every road it showed is a street of its width and vehicles; a ring off and a road removed stay so; their fields go', () => {
    // a version 10 file had no frontage street among its existing roads (the demo's is one now)
    const p = asLegacy(bare())
    const side = legacy(p).find((r) => r.kind === 'ring')!
    const removed = { x: (side.points[0].x + side.points[1].x) / 2, y: (side.points[0].y + side.points[1].y) / 2 }
    const v10 = JSON.parse(JSON.stringify({ ...p, version: 10, options: p.options.map((o) => ({ ...o, ringOff: ['b2'], removedRoads: [removed], ringParking: { b1: 'none' } })) }))
    const read = migrate(v10)
    const o = (read.options as Record<string, unknown>[])[0]
    expect([read.version, 'ringOff' in o, 'removedRoads' in o, 'ringParking' in o]).toEqual([20, false, false, false])
    const was = legacy(v10 as Project)
    expect(was.length).toBeGreaterThan(0)
    const roads = derive(ProjectSchema.parse(read)).circulation.roads
    const at = (q: Point) => roads.filter((r) => r.points.slice(1).some((b, i) => distancePointSegment(q, r.points[i], b) <= 0.05))
    for (const r of was)
      for (const [i, b] of r.points.slice(1).entries()) {
        const m = { x: (r.points[i].x + b.x) / 2, y: (r.points[i].y + b.y) / 2 }
        expect(at(m).some((x) => x.width === r.width && x.vehicles === r.vehicles), `${r.id} at ${m.x}, ${m.y}`).toBe(true)
      }
    // the side removed is no street
    expect(at(removed)).toEqual([])
  })
})

describe('the same project anywhere', () => {
  const summary = (p: Project) => {
    const d = drawn(p)
    const c = d.circulation
    return { roads: c.roads.length, stalls: c.stalls.length, reached: [...c.reached].sort(), issues: d.issues.map((i) => i.code).sort(), doors: c.totals.doors, area: c.totals.roadArea }
  }

  it('far from the origin (UTM coordinates, as a georeferenced site will be): the same', () => {
    const here = summary(bare())
    const there = summary(translated(bare(), 500000, 2000000))
    expect({ ...there, area: 0 }).toEqual({ ...here, area: 0 })
    expect(there.area).toBeCloseTo(here.area, 0)
  })

  it('turned 37°: the same roads and access, about the same stalls', () => {
    const here = summary(bare())
    const turnedSite = summary(rotated(bare(), 37))
    expect(turnedSite.roads).toBe(here.roads)
    expect(turnedSite.reached).toEqual(here.reached)
    expect(turnedSite.doors).toBe(here.doors)
    expect(Math.abs(turnedSite.stalls - here.stalls) / here.stalls).toBeLessThan(0.03)
  })
})

describe('the paving', () => {
  const lines: Record<string, Point[]> = {
    arc: Array.from({ length: 200 }, (_, k) => ({ x: 200 * Math.cos((k / 199) * Math.PI), y: 200 * Math.sin((k / 199) * Math.PI) })),
    L: [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
    ],
    zigzag: [
      { x: 220, y: 170 },
      { x: 260, y: 250 },
      { x: 260, y: 170 },
      { x: 220, y: 250 },
    ],
    'short steps': Array.from({ length: 60 }, (_, k) => ({ x: k * 1.5, y: (k % 2) * 1.2 })),
  }

  it('as outlines, the same area as its convex pieces; a curve of 200 points is one polygon', () => {
    for (const [name, pts] of Object.entries(lines)) {
      const pieces = regionsArea(union(stripPieces(pts, 8), []))
      const outlines = regionsArea(stripRegions([{ points: pts, width: 8 }]))
      expect(Math.abs(outlines - pieces) / pieces, name).toBeLessThan(0.01)
    }
    expect(stripOutlines(lines.arc, 8)).toHaveLength(1)
  })
})

describe('time', () => {
  /** The median of five derives, after one to warm up. */
  const ms = (p: Project) => {
    derive(p)
    const t = Array.from({ length: 5 }, () => {
      const t0 = performance.now()
      derive(p)
      return performance.now() - t0
    }).sort((a, b) => a - b)
    return t[2]
  }

  // Alone these take ~5× under budget; the full suite can load the machine enough to cross it,
  // so a slow run is measured again. A real regression fails every try.
  it('the demo, a grid of 36 warehouses, a road of 200 points: within budget (a drag redraws each step)', { retry: 2, timeout: LONG }, () => {
    expect(ms(demoProject())).toBeLessThan(40)
    // with the network drawn: what a project read from a version 10 file has
    expect(ms(legacyStreets(scenario(many(), 'grid 6×6, 60 m apart')))).toBeLessThan(300)
    expect(ms(legacyStreets(scenario(nonsenseRoads(), 'road: a curve of 200 points')))).toBeLessThan(60)
    expect(ms(legacyStreets(scenario(nonsenseRoads(), 'road: 200 noisy points')))).toBeLessThan(400)
  })

  /** The median of five joins of a project's roads into one paving (what the plan redraws at every step of a drag). */
  const joinMs = (p: Project) => {
    const roads = derive(p).circulation.roads.map((r) => ({ points: r.points, width: r.width, radius: r.radius }))
    joinedPaving(roads)
    const t = Array.from({ length: 5 }, () => {
      const t0 = performance.now()
      joinedPaving(roads)
      return performance.now() - t0
    }).sort((a, b) => a - b)
    return t[2]
  }

  it('the one paving of the demo, of a grid of streets, of a curve of 200 points: within budget', { retry: 2, timeout: LONG }, () => {
    expect(joinMs(demoProject())).toBeLessThan(40)
    expect(joinMs(legacyStreets(scenario(many(), 'grid 6×6, 60 m apart')))).toBeLessThan(300)
    expect(joinMs(legacyStreets(scenario(nonsenseRoads(), 'road: a curve of 200 points')))).toBeLessThan(60)
  })
})

describe('the checks of streets that meet (Phase PE.1)', () => {
  // two roads of 8 m meeting at a right angle at (0, 0): one along x from the east, one along y from the north
  const L = [
    { id: 'a', points: [{ x: 0, y: 0 }, { x: 40, y: 0 }], width: 8 },
    { id: 'b', points: [{ x: 0, y: 0 }, { x: 0, y: 40 }], width: 8 },
  ]
  const rings = (roads: typeof L) => pavingRings({ roads, areas: [] }).map((r) => r.points)

  it('paving-seam: the joined paving has none; two strips laid side by side leave the corner bare', () => {
    expect(pavingSeams(L, rings(L))).toEqual([])
    const strips = L.flatMap((r) => stripOutlines(r.points, r.width))
    expect(pavingSeams(L, union(strips, []).map((x) => x[0])).length).toBeGreaterThan(0)
  })

  it('paving-seam: a hole of the paving at the joint is told', () => {
    const hole = [{ x: -2, y: -2 }, { x: -2, y: 2 }, { x: 2, y: 2 }, { x: 2, y: -2 }]
    expect(pavingSeams(L, [...rings(L), hole]).some((f) => f.includes('hole'))).toBe(true)
  })

  it('edge-offset: a run whose centre line is half a width off its drawn line, on its side, passes; one on it fails', () => {
    const run = (centre: number) => ({
      id: 'street:s1',
      kind: 'street' as const,
      width: 8,
      left: 0,
      right: 8,
      nodePoints: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
      points: [{ x: 0, y: centre }, { x: 100, y: centre }],
    })
    // drawn by its left edge walking east (+x): the centre line lies 4 m to its right (-y)
    expect(edgeOffsets([run(-4)])).toEqual([])
    expect(edgeOffsets([run(0)]).length).toBeGreaterThan(0)
    expect(edgeOffsets([run(4)]).length).toBeGreaterThan(0)
  })
})

describe('the lanes check (Phase PE.2)', () => {
  it('the lanes scenarios store the lanes they are named for (a refused edit would leave them bare)', () => {
    const stored = (p: Project) => [...(p.options[0].streets?.segments.map((g) => g.lanes) ?? []), ...(p.site.existingRoads?.flatMap((r) => r.stretches.map((t) => t.lanes)) ?? [])]
    const by = Object.fromEntries(lanes().map((sc) => [sc.name.replace(/^lanes: /, ''), stored(sc.project)]))
    expect(by['a street of 3 + 3.5 + 4.25 m drawn by its left edge']).toEqual([[3, 3.5, 4.25]])
    expect(by['a chain whose middle stretch has stored lanes']).toEqual([undefined, [3, 5], undefined])
    expect(by['a segment stored b → a, walked in a chain'].map((l) => l?.length)).toEqual([3, 2])
    expect(by['an existing street with lanes by stretch']).toEqual([[4, 4, 3.5], [2, 6]])
    expect(by['a lane added to every stretch'].map((l) => l?.length)).toEqual([3, 3, 3])
  })

  const p = demoProject()
  const road = (lanes: number[] | undefined, width = 7) => ({ id: 'street:s1', width, lanes })

  it('lanes-sum: roads whose lanes add up to their width pass; a road with none, a lane of 0 or a sum off by a centimetre fail', () => {
    expect(laneSums([road([3.5, 3.5])], p, 'o1')).toEqual([])
    expect(laneSums([road([3.5, 3.5, 0.0004])], p, 'o1')).toEqual([])
    expect(laneSums([road(undefined)], p, 'o1')).toHaveLength(1)
    expect(laneSums([road([7, 0])], p, 'o1')).toHaveLength(1)
    expect(laneSums([road([3.5, 3.49])], p, 'o1')).toHaveLength(1)
  })

  it('lanes-sum: the lanes a segment or an existing stretch keeps must add up to its sides', () => {
    const q = JSON.parse(JSON.stringify(p)) as Project
    const g = q.options[0].streets!.segments[0]
    g.left = 0
    g.right = 7
    g.lanes = [3, 3]
    expect(laneSums([], q, 'o1')).toHaveLength(1)
    g.lanes = [3.5, 3.5]
    expect(laneSums([], q, 'o1')).toEqual([])
    q.site.existingRoads = [{ id: 'e1', points: [{ x: 0, y: 0 }, { x: 10, y: 0 }], stretches: [{ left: 2, right: 2, lanes: [1, 1] }] }]
    expect(laneSums([], q, 'o1')).toHaveLength(1)
  })
})

describe('the gate-host check (Phase PE.2)', () => {
  const sc = () => streetGates()[0].project
  const derivedOf = (p: Project) => derive(p).circulation.gates

  it('the street gates scenarios put gates on their hosts (a refused edit would leave them bare)', () => {
    const on = (p: Project) => (p.options[0].gates ?? []).filter((g) => g.on).length
    expect(streetGates().map((x) => on(x.project) + (x.project.site.gates ?? []).filter((g) => g.on).length)).toEqual([2, 2, 2, 3])
  })

  it('gates on their hosts pass', () => {
    for (const s of streetGates()) expect(gateHosts(s.project, 'o1', derivedOf(s.project)), s.name).toEqual([])
  })

  it('a gate derived off its side, one whose host is gone and one past the end of its side fail', () => {
    const p = sc()
    const gates = derivedOf(p)
    const moved = gates.map((g) => (g.id === (p.options[0].gates ?? []).find((x) => x.on)!.id ? { ...g, at: { x: g.at.x, y: g.at.y + 1 } } : g))
    expect(gateHosts(p, 'o1', moved).some((f) => f.includes('across'))).toBe(true)
    const gone = { ...p, options: p.options.map((o) => ({ ...o, streets: undefined })) } as Project
    expect(gateHosts(gone, 'o1', gates).some((f) => f.includes('not there'))).toBe(true)
    const near = JSON.parse(JSON.stringify(p)) as Project
    near.options[0].gates!.find((g) => g.on)!.on!.at = 2
    expect(gateHosts(near, 'o1', derivedOf(near)).some((f) => f.includes('half-width'))).toBe(true)
  })

  it('a gate on the boundary derived off it fails', () => {
    const p = demoProject()
    const gates = derivedOf(p)
    expect(gateHosts(p, 'o1', gates)).toEqual([])
    expect(gateHosts(p, 'o1', gates.map((g) => ({ ...g, at: { x: g.at.x, y: g.at.y + 3 } }))).some((f) => f.includes('off the boundary'))).toBe(true)
  })
})

describe('the moved existing streets scenarios (Phase PE.2, task 11)', () => {
  it('each keeps its linked end and its two gates on the street (a refused edit would leave it bare)', () => {
    for (const s of movedExisting()) {
      expect(s.project.options[0].streets!.nodes.filter((n) => n.road !== undefined), s.name).toHaveLength(1)
      expect((s.project.site.gates ?? []).filter((g) => g.on?.kind === 'existing-road').length + (s.project.options[0].gates ?? []).filter((g) => g.on?.kind === 'existing-road').length, s.name).toBe(2)
    }
  })

  it('the street really moved, turned and mirrored', () => {
    const [moved, turned, mirrored] = movedExisting().map((s) => s.project.site.existingRoads!.find((r) => r.name === undefined)!)
    expect(moved.points[0]).toEqual({ x: 130, y: 230 })
    expect(turned.points[0].y).not.toBe(250)
    expect(mirrored.points[0]).toEqual({ x: 100, y: 550 })
    expect(mirrored.stretches[1]).toEqual({ left: 4, right: 4, lanes: [6, 2] })
  })
})

describe('the bend scenarios (Phase PE.2, review R1)', () => {
  it('each keeps its two gates on the street, one segment now (a gate lost when the node went would leave fewer)', () => {
    const lost = bendsRemoved().flatMap((s) => {
      const o = s.project.options[0]
      const gates = [...(s.project.site.gates ?? []), ...(o.gates ?? [])].filter((g) => g.on?.kind === 'street')
      return gates.length === 2 && o.streets!.segments.length === 1 ? [] : [`${s.name} → ${gates.length} gates, ${o.streets!.segments.length} segments`]
    })
    expect(lost).toEqual([])
  })
})

describe('the streets moved scenarios (Phase PE.2, review E1)', () => {
  it('each keeps its two gates on a street, one each side (a gate lost when the street is knit would leave fewer)', () => {
    const lost = streetsMoved().flatMap((s) => {
      const gates = [...(s.project.site.gates ?? []), ...(s.project.options[0].gates ?? [])]
      const sides = gates.filter((g) => g.on?.kind === 'street').map((g) => g.on!.side).sort()
      return sides.join() === 'left,right' ? [] : [`${s.name} → ${sides.join() || 'no gate'} left`]
    })
    expect(lost).toEqual([])
  })

  it('each really knit the network: more than the two streets’ four nodes, or the moved street joined the other', () => {
    for (const s of streetsMoved()) {
      const o = s.project.options[0].streets!
      expect(o.segments.length, s.name).toBeGreaterThan(2)
    }
  })
})
