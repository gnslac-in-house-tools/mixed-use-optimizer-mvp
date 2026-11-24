// The stress test's projects (`circulation.stress.test.ts`): sites of many shapes, masses near and far, turned, many
// of them, roads that make no sense, gates in odd places, extreme standards, far from the origin. Each is built with
// the verbs a view would use, so it is a project a designer could make.
import { ProjectSchema, type Contour, type CourtByEdge, type Id, type Point, type Polygon, type Project } from '../../../model/schema.ts'
import { migrate } from '../../../model/migrate.ts'
import { newProject } from '../../../typologies/index.ts'
import { addWarehouseType, lockWarehouseStep, placeWarehouse, stretchWarehouseHall, updateWarehouseStep } from '../../../modules/warehouse/actions.ts'
import { contourFromPolygon, contourToPolygon } from '../../geom/contour.ts'
import { perimeter, perimeterPath, vertexTs } from '../../geom/perimeter.ts'
import { addExistingRoad, addGate, addGateOn, mirrorExistingRoads, moveExistingRoads, removeExistingRoad, setMassDocks, turnExistingRoads, updateGate, updateStandards } from '../../../state/actions/circulation.ts'
import { editPath } from '../../../state/actions/path.ts'
import { settle } from '../../../state/settle.ts'
import { addRoad } from '../../../state/__tests__/road.ts'
import { addLot, setParking, setStreetParking } from '../../../modules/parking/actions.ts'
import { connectStreets, followLots, mirrorStreetNodes, moveStreetNode, moveStreetNodes, removeStreetNode, setStreetEdges, setStreetSegmentWidth, turnStreetNodes } from '../../../state/actions/streets.ts'
import { lotEntrances } from '../../../modules/parking/actions.ts'
import { streetTypesOf } from '../../circulation/streets.ts'
import { addMass, moveMass } from '../../../state/actions/masses.ts'
import { drawStreet } from '../../../state/actions/streets.ts'
import { addBuilding, updateBuilding } from '../../../state/actions/buildings.ts'
import { addLevelAtEnd } from '../../../state/actions/levels.ts'
import { demoProject } from '../../../state/demo.ts'
import { sampleProject } from '../../../state/sample.ts'

/** What an edit leaves once the app has settled it (its street ends on an existing street linked, as a view's verb leaves them). */
const settled = (before: Project, after: Project): Project => {
  const r = settle(before, after)
  return 'project' in r ? r.project : after
}

/** The demo without its streets: the audit draws them as the migration does (Decision "Streets", ST.4). */
const bare = () => demoProject({ streets: false })
import { derive } from '../../derive.ts'
import { legacyStreets } from './audit.ts'
import { dockableWalls } from '../../../modules/docks/engine/docks.ts'

export interface Scenario {
  name: string
  project: Project
}

export const rectangle = (w: number, h: number, x = 0, y = 0): Polygon => [
  { x, y },
  { x: x + w, y },
  { x: x + w, y: y + h },
  { x, y: y + h },
]

/** A site of this outline, no masses; with `street`, a 15 m existing street along its first edge (outside it) and a gate in the middle of it. */
export function site(outline: Polygon, street = true): Project {
  let p = newProject('industrial', 'Stress')
  p.site.boundary = contourFromPolygon(outline)
  if (!street) return p
  const poly = contourToPolygon(p.site.boundary)
  const ts = vertexTs(poly)
  const end = ts[1] ?? 1
  p = addExistingRoad(p, perimeterPath(poly, 0, end), 15, 'left')!.project
  return addGate(p, 'o1', end / 2).project
}

/** A gate at this point of the boundary (the t nearest to it). */
export function gateAt(p: Project, q: Point, init: Parameters<typeof addGate>[3] = {}): Project {
  const poly = contourToPolygon(p.site.boundary!)
  const total = perimeter(poly)
  let best = { d: Infinity, t: 0 }
  let run = 0
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    const l = Math.hypot(b.x - a.x, b.y - a.y)
    const k = l > 0 ? Math.max(0, Math.min(1, ((q.x - a.x) * (b.x - a.x) + (q.y - a.y) * (b.y - a.y)) / (l * l))) : 0
    const d = Math.hypot(a.x + (b.x - a.x) * k - q.x, a.y + (b.y - a.y) * k - q.y)
    if (d < best.d) best = { d, t: (run + k * l) / total }
    run += l
  }
  return addGate(p, 'o1', best.t, init).project
}

export interface Box {
  x: number
  y: number
  w: number
  d: number
  rot?: number
  program?: string
  /** A building of its own (a new one in option o1); absent: the first building. */
  building?: 'own' | Id
}

/** Masses as rectangles centred at (x, y). */
export function withMasses(p: Project, boxes: Box[]): Project {
  for (const b of boxes) {
    let levelId: Id | undefined
    if (b.building === 'own') {
      const r = addBuilding(p, { optionId: 'o1' })
      p = r.project
      levelId = r.levelId
    } else if (b.building) levelId = p.buildings.find((x) => x.id === b.building)?.levels[0].id
    p = addMass(p, { programId: b.program ?? 'warehouse', levelId, footprint: { kind: 'rect', center: { x: b.x, y: b.y }, width: b.w, depth: b.d, rotation: b.rot ?? 0 } }).project
  }
  return p
}

/** Every point moved by (dx, dy): the same project somewhere else (a georeferenced site, Phase 5). */
export function translated(p: Project, dx: number, dy: number): Project {
  const move = <T,>(v: T): T => {
    if (Array.isArray(v)) return v.map(move) as T
    if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>
      if (typeof o.x === 'number' && typeof o.y === 'number' && Object.keys(o).every((k) => ['x', 'y', 'r', 'bulge'].includes(k)))
        return { ...o, x: (o.x as number) + dx, y: (o.y as number) + dy } as T
      return Object.fromEntries(Object.entries(o).map(([k, x]) => [k, move(x)])) as T
    }
    return v
  }
  return { ...p, site: move(p.site), masses: move(p.masses), options: move(p.options) }
}

/** The same project turned `deg` degrees round the origin: rectangles keep their size and turn with it. */
export function rotated(p: Project, deg: number): Project {
  const a = (deg * Math.PI) / 180
  const [c, s] = [Math.cos(a), Math.sin(a)]
  const turn = <T,>(v: T): T => {
    if (Array.isArray(v)) return v.map(turn) as T
    if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>
      if (o.kind === 'rect') return { ...o, center: turn(o.center), rotation: (o.rotation as number) + deg } as T
      if (typeof o.x === 'number' && typeof o.y === 'number' && Object.keys(o).every((k) => ['x', 'y', 'r', 'bulge'].includes(k)))
        return { ...o, x: (o.x as number) * c - (o.y as number) * s, y: (o.x as number) * s + (o.y as number) * c } as T
      return Object.fromEntries(Object.entries(o).map(([k, x]) => [k, turn(x)])) as T
    }
    return v
  }
  return { ...p, site: turn(p.site), masses: turn(p.masses), options: turn(p.options) }
}

/** A small seeded random generator (mulberry32): the same scenarios every run. */
export function random(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const polar = (n: number, r: number, cx: number, cy: number): Polygon =>
  Array.from({ length: n }, (_, k) => ({ x: cx + r * Math.cos((2 * Math.PI * k) / n), y: cy + r * Math.sin((2 * Math.PI * k) / n) }))

const turn = (poly: Polygon, deg: number, c: Point): Polygon => {
  const a = (deg * Math.PI) / 180
  return poly.map((q) => ({ x: c.x + (q.x - c.x) * Math.cos(a) - (q.y - c.y) * Math.sin(a), y: c.y + (q.x - c.x) * Math.sin(a) + (q.y - c.y) * Math.cos(a) }))
}

/** Sites of many shapes, one or two warehouses on each. */
export function siteShapes(): Scenario[] {
  const two = (cx: number, cy: number): Box[] => [
    { x: cx - 90, y: cy, w: 140, d: 70 },
    { x: cx + 90, y: cy, w: 140, d: 70 },
  ]
  const L: Polygon = [
    { x: 0, y: 0 },
    { x: 500, y: 0 },
    { x: 500, y: 200 },
    { x: 220, y: 200 },
    { x: 220, y: 450 },
    { x: 0, y: 450 },
  ]
  const U: Polygon = [
    { x: 0, y: 0 },
    { x: 600, y: 0 },
    { x: 600, y: 400 },
    { x: 420, y: 400 },
    { x: 420, y: 150 },
    { x: 180, y: 150 },
    { x: 180, y: 400 },
    { x: 0, y: 400 },
  ]
  return [
    { name: 'rectangle', project: withMasses(site(rectangle(500, 320)), two(250, 170)) },
    { name: 'rectangle turned 30°', project: withMasses(site(turn(rectangle(500, 320), 30, { x: 250, y: 160 })), [{ x: 250, y: 160, w: 160, d: 80, rot: 30 }]) },
    { name: 'clockwise outline', project: withMasses(site([...rectangle(500, 320)].reverse()), two(250, 170)) },
    { name: 'L-shaped', project: withMasses(site(L), [{ x: 330, y: 100, w: 180, d: 70 }, { x: 110, y: 330, w: 70, d: 160 }]) },
    { name: 'U-shaped', project: withMasses(site(U), [{ x: 90, y: 250, w: 90, d: 200 }, { x: 510, y: 250, w: 90, d: 200 }, { x: 300, y: 70, w: 300, d: 60 }]) },
    {
      name: 'triangle',
      project: withMasses(
        site([
          { x: 0, y: 0 },
          { x: 600, y: 0 },
          { x: 300, y: 450 },
        ]),
        [{ x: 300, y: 140, w: 160, d: 80 }],
      ),
    },
    {
      name: 'trapezoid',
      project: withMasses(
        site([
          { x: 0, y: 0 },
          { x: 600, y: 0 },
          { x: 470, y: 300 },
          { x: 130, y: 300 },
        ]),
        two(300, 150),
      ),
    },
    { name: 'thin strip', project: withMasses(site(rectangle(900, 110)), [{ x: 250, y: 60, w: 200, d: 40 }, { x: 650, y: 60, w: 200, d: 40 }]) },
    { name: 'circle (64 sides)', project: withMasses(site(polar(64, 260, 260, 260)), two(260, 260)) },
    {
      name: 'collinear and repeated vertices',
      project: withMasses(
        site([
          { x: 0, y: 0 },
          { x: 250, y: 0 },
          { x: 500, y: 0 },
          { x: 500, y: 0.001 },
          { x: 500, y: 320 },
          { x: 0, y: 320 },
        ]),
        two(250, 170),
      ),
    },
    {
      name: 'jagged boundary',
      project: withMasses(
        site([
          ...Array.from({ length: 21 }, (_, k) => ({ x: k * 25, y: k % 2 ? 12 : 0 })),
          { x: 500, y: 340 },
          { x: 0, y: 340 },
        ]),
        two(250, 180),
      ),
    },
  ]
}

/** Two warehouses side by side, `gap` m apart, docks facing each other or not, one building or two. */
export function pairs(): Scenario[] {
  const out: Scenario[] = []
  for (const own of [false, true])
    for (const gap of [0, 4, 8, 12, 16, 20, 24, 30, 40, 50, 60, 80, 100, 120]) {
      const left = 150
      const right = left + 70 + gap + 70
      // each docks on its outer side: the left one is turned round, so its front (Decision "Docks turn with the
      // building") faces west
      const boxes: Box[] = [
        { x: left, y: 220, w: 140, d: 160, rot: 180 },
        { x: right, y: 220, w: 140, d: 160, building: own ? 'own' : undefined },
      ]
      out.push({ name: `pair ${gap} m apart${own ? ', two buildings' : ''}`, project: withMasses(site(rectangle(right + 150, 440)), boxes) })
    }
  return out
}

/** One warehouse turned, and a pair with one turned. */
export function turned(): Scenario[] {
  const out: Scenario[] = []
  for (const rot of [0, 7, 15, 30, 45, 60, 75, 89, 90, 120, 170]) {
    out.push({ name: `one turned ${rot}°`, project: withMasses(site(rectangle(520, 520)), [{ x: 260, y: 270, w: 180, d: 90, rot }]) })
    out.push({
      name: `pair, one turned ${rot}°`,
      project: withMasses(site(rectangle(700, 460)), [
        { x: 180, y: 240, w: 160, d: 90 },
        { x: 470, y: 240, w: 160, d: 90, rot, building: 'own' },
      ]),
    })
  }
  return out
}

/** A site whose corner is pulled in, step by step, until it reaches the warehouse; and one shrunk all round. */
export function shrinking(): Scenario[] {
  const out: Scenario[] = []
  for (const k of [0, 60, 120, 160, 200, 240]) {
    const outline: Polygon = [
      { x: 0, y: 0 },
      { x: 460, y: 0 },
      { x: 460 - k, y: 340 - k * 0.7 },
      { x: 0, y: 340 },
    ]
    out.push({ name: `corner pulled in ${k} m`, project: withMasses(site(outline), [{ x: 200, y: 170, w: 160, d: 80 }]) })
  }
  for (const margin of [120, 60, 30, 10, 0, -20]) {
    const w = 160 + 2 * margin
    const h = 80 + 2 * margin
    out.push({ name: `site ${margin} m round the warehouse`, project: withMasses(site(rectangle(Math.max(w, 5), Math.max(h, 5), -margin, -margin)), [{ x: 80, y: 40, w: 160, d: 80 }]) })
  }
  return out
}

/** Many warehouses: grids, and seeded random layouts. */
export function many(): Scenario[] {
  const out: Scenario[] = []
  for (const [n, gap, own] of [
    [2, 60, false],
    [3, 60, false],
    [4, 60, false],
    [5, 60, false],
    [6, 60, false],
    [4, 30, false],
    [4, 18, false],
    [4, 60, true],
    [6, 45, true],
  ] as const) {
    const boxes: Box[] = []
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) boxes.push({ x: 120 + i * (120 + gap), y: 100 + j * (70 + gap), w: 120, d: 70, building: own ? 'own' : undefined })
    const W = 120 + n * (120 + gap)
    const H = 100 + n * (70 + gap)
    out.push({ name: `grid ${n}×${n}, ${gap} m apart${own ? ', a building each' : ''}`, project: withMasses(site(rectangle(W, H)), boxes) })
  }
  for (let seed = 1; seed <= 12; seed++) {
    const r = random(seed)
    const boxes: Box[] = Array.from({ length: 4 + Math.floor(r() * 8) }, () => ({
      x: 80 + r() * 640,
      y: 80 + r() * 440,
      w: 40 + r() * 140,
      d: 30 + r() * 70,
      rot: r() < 0.5 ? 0 : Math.round(r() * 180),
      program: r() < 0.8 ? 'warehouse' : 'office',
      building: r() < 0.4 ? ('own' as const) : undefined,
    }))
    out.push({ name: `random layout ${seed}`, project: withMasses(site(rectangle(800, 600)), boxes) })
  }
  return out
}

/** Docks of its own on the walls whose outward normal is closest to each direction given. */
export function docksFacing(p: Project, massId: Id, dirs: Point[]): Project {
  const m = derive(p).masses[massId]
  const walls = dockableWalls(m.polygon)
  const ts = dirs.map((d) => walls.reduce((best, w) => (w.out.x * d.x + w.out.y * d.y > best.out.x * d.x + best.out.y * d.y ? w : best)).t)
  return setMassDocks(p, massId, ts)
}

/** Two warehouses whose dock walls face each other across `gap` m: a shared truck court, or a road between them. */
export function facingDocks(): Scenario[] {
  return [24, 40, 60, 80, 88, 100, 110, 140].map((gap) => {
    let p = withMasses(site(rectangle(560, 140 + gap + 260)), [
      { x: 280, y: 110, w: 240, d: 80 },
      { x: 280, y: 150 + gap + 40, w: 240, d: 80 },
    ])
    p = docksFacing(p, 'm1', [{ x: 0, y: 1 }])
    p = docksFacing(p, 'm2', [{ x: 0, y: -1 }])
    return { name: `dock walls facing ${gap} m apart`, project: p }
  })
}

/** The demo with roads that make no sense, drawn by hand (streets since ST.3). */
export function nonsenseRoads(): Scenario[] {
  const demo = bare()
  // as a file may hold it: stored as drawn, a node per point (drawStreet itself joins a repeated point and refuses a
  // line of no length), of the type its vehicles take, its width and vehicles its own
  const road = (name: string, points: Point[], init: { width?: number; vehicles?: 'trucks' | 'cars' | 'all' } = {}) => {
    const vehicles = init.vehicles ?? 'all'
    const nodes = points.map((q, k) => ({ id: `n${k + 1}`, x: q.x, y: q.y }))
    const segments = points.slice(1).map((_, k) => ({ id: `s${k + 1}`, a: `n${k + 1}`, b: `n${k + 2}`, type: vehicles === 'cars' ? 'cars' : 'trucks', left: (init.width ?? 8) / 2, right: (init.width ?? 8) / 2, vehicles }))
    return { name: `road: ${name}`, project: { ...demo, options: demo.options.map((o) => ({ ...o, streets: { nodes, segments } })) } }
  }
  const r = random(7)
  const noisy = Array.from({ length: 200 }, (_, k) => ({ x: 30 + k * 2, y: 230 + (r() - 0.5) * 6 }))
  let many = demo
  for (let k = 0; k < 40; k++)
    many = addRoad(many, 'o1', [
      { x: r() * 440, y: r() * 280 },
      { x: r() * 440, y: r() * 280 },
    ])!.project
  return [
    road('no length', [{ x: 300, y: 230 }, { x: 300, y: 230 }]),
    road('a point repeated', [{ x: 230, y: 180 }, { x: 230, y: 180 }, { x: 230, y: 240 }]),
    road('out of the site', [{ x: 600, y: 600 }, { x: 800, y: 650 }]),
    road('through a mass', [{ x: 20, y: 110 }, { x: 420, y: 110 }]),
    road('100 m wide', [{ x: 230, y: 160 }, { x: 230, y: 250 }], { width: 100 }),
    road('50 cm wide', [{ x: 230, y: 160 }, { x: 230, y: 250 }], { width: 0.5 }),
    road('zigzag that crosses itself', [{ x: 220, y: 170 }, { x: 260, y: 250 }, { x: 260, y: 170 }, { x: 220, y: 250 }]),
    road('a closed loop', [{ x: 300, y: 200 }, { x: 380, y: 200 }, { x: 380, y: 250 }, { x: 300, y: 250 }, { x: 300, y: 200 }]),
    road('along the boundary', [{ x: 1, y: 1 }, { x: 419, y: 1 }, { x: 439, y: 239 }]),
    road('on a ring side', [{ x: 29, y: 26 }, { x: 211, y: 26 }]),
    road('beside a ring side', [{ x: 29, y: 29 }, { x: 211, y: 29 }]),
    road('200 noisy points', noisy),
    road('a curve of 200 points', Array.from({ length: 200 }, (_, k) => ({ x: 225 + 150 * Math.cos((k / 199) * Math.PI), y: 175 + 90 * Math.sin((k / 199) * Math.PI) }))),
    road('a spike back on itself', [{ x: 300, y: 230 }, { x: 400, y: 230 }, { x: 300, y: 230 }]),
    road('far away', [{ x: 1e7, y: 1e7 }, { x: 1e7 + 50, y: 1e7 }]),
    road('for trucks only', [{ x: 230, y: 160 }, { x: 230, y: 250 }], { vehicles: 'trucks' }),
    { name: 'road: 40 at random', project: many },
    // drawn far from the masses, then across them: its Issue is marked where it runs over them
    { name: 'street: from far away across the masses', project: drawStreet(demo, 'o1', [{ x: 435, y: 270 }, { x: 435, y: 110 }, { x: 10, y: 110 }])!.project },
    ...onPaving(demo),
  ]
}

/**
 * Streets that end on another's paving, off its drawn line (Decision "Streets stay connected", SE.1: the user dragged
 * a street and it came apart from those it touched): its end joins the other (a T); a street drawn parallel inside
 * another's paving, its ends clear of it, splits nothing; one dragged by its end onto the paving joins it.
 */
function onPaving(demo: Project): Scenario[] {
  const main = drawStreet(demo, 'o1', [{ x: 230, y: 160 }, { x: 230, y: 250 }])!.project
  const branch = drawStreet(main, 'o1', [{ x: 300, y: 205 }, { x: 330, y: 205 }])!
  return [
    { name: 'street: an end on another’s paving', project: drawStreet(main, 'o1', [{ x: 300, y: 205 }, { x: 232.5, y: 205 }])!.project },
    { name: 'street: parallel inside another’s paving', project: drawStreet(main, 'o1', [{ x: 260, y: 170 }, { x: 232, y: 170 }, { x: 232, y: 240 }, { x: 260, y: 240 }])!.project },
    { name: 'street: an end dragged onto another’s paving', project: moveStreetNode(branch.project, 'o1', branch.nodes[0], { x: 233, y: 205 }) },
  ]
}

/**
 * Streets drawn by an edge (Decisions "Drawing side", "Street side when drawing"; found in the final review of Phase
 * SE: a joint between two sides or widths carried tens of metres at gentle bends, or half a width past an in-line
 * node): a centred street switching to the edge of a mass at a 10° and a 30° bend (the Street tool's outside), a
 * widened segment of a sided street with 2° bends and one exactly in line, a sided loop round a mass, a switch of
 * side at a right angle between two masses, a sided T-junction, a sided street ending at a lot's entrance.
 */
export function sidedStreets(): Scenario[] {
  const base = () => site(rectangle(700, 500), false)
  const w = streetTypesOf(base())[0].width
  const dir = (deg: number): Point => ({ x: Math.cos((deg * Math.PI) / 180), y: Math.sin((deg * Math.PI) / 180) })
  const at = (q: Point, u: Point, k: number): Point => ({ x: q.x + u.x * k, y: q.y + u.y * k })
  const draw = (p: Project, points: Point[], opts: Parameters<typeof drawStreet>[6] = {}) => drawStreet(p, 'o1', points, undefined, undefined, undefined, opts)!
  // a mass whose south-west corner is C, turned by deg; a street drawn centred, from the west to 2 m short of C, then
  // along its south edge: that segment takes the edge that keeps it off the mass
  const bend = (deg: number) => {
    const C = { x: 200, y: 150 }
    const u = dir(deg)
    const v = dir(deg + 90)
    const p = withMasses(base(), [{ ...at(at(C, u, 60), v, 30), w: 120, d: 60, rot: deg }])
    const N = at(C, u, -2)
    return draw(p, [{ x: N.x - 120, y: N.y }, N, at(N, u, 140)], { outside: true }).project
  }
  // drawn by its left edge, three segments of 80 m, the middle one widened by 4 m
  const widened = (deg: number) => {
    const q0 = { x: 100, y: 200 }
    const q1 = at(q0, dir(0), 80)
    const q2 = at(q1, dir(deg), 80)
    const r = draw(base(), [q0, q1, q2, at(q2, dir(0), 80)], { side: 'left' })
    return setStreetSegmentWidth(r.project, 'o1', [r.segments[1]], w + 4)
  }
  const loop = () => {
    const p = withMasses(base(), [{ x: 300, y: 250, w: 160, d: 80 }])
    const ring = [{ x: 220, y: 210 }, { x: 380, y: 210 }, { x: 380, y: 290 }, { x: 220, y: 290 }, { x: 220, y: 210 }]
    return draw(p, ring, { outside: true }).project
  }
  // east by its left edge (paving south, a mass north), then north by its right edge (paving west, a mass east)
  const corner = () => {
    const N = { x: 350, y: 200 }
    const p = withMasses(base(), [
      { x: N.x - 70, y: N.y + 32, w: 120, d: 60 },
      { x: N.x + 32, y: N.y + 70, w: 60, d: 120, building: 'own' },
    ])
    const r = draw(p, [{ x: N.x - 200, y: N.y }, N], { side: 'left' })
    return draw(r.project, [N, { x: N.x, y: N.y + 200 }], { side: 'right' }).project
  }
  // a street by its left edge (paving south, a mass north), a branch south from its drawn line by its right edge
  const tee = () => {
    const p = withMasses(base(), [{ x: 250, y: 232, w: 260, d: 60 }])
    const r = draw(p, [{ x: 100, y: 200 }, { x: 400, y: 200 }], { side: 'left' })
    return draw(r.project, [{ x: 250, y: 200 }, { x: 250, y: 80 }], { side: 'right' }).project
  }
  // a free lot, a street drawn by its left edge to its entrance, then connected as the settle step connects it
  const lot = () => {
    const p = addLot(base(), 'o1', { rect: { center: { x: 450, y: 300 }, width: 60, depth: 40, rotation: 0 } })!.project
    const e = lotEntrances(p, 'o1').values().next().value!.at
    return followLots(p, draw(p, [{ x: e.x - 200, y: e.y - 150 }, { x: e.x - 200, y: e.y }, e], { side: 'left' }).project)
  }
  return [
    { name: 'sided: a centred street switching to a mass’s edge at a 10° bend', project: bend(10) },
    { name: 'sided: a centred street switching to a mass’s edge at a 30° bend', project: bend(30) },
    { name: 'sided: a widened segment, 2° bends', project: widened(2) },
    { name: 'sided: a widened segment, in line', project: widened(0) },
    { name: 'sided: a loop round a mass', project: loop() },
    { name: 'sided: a switch of side at a right angle between two masses', project: corner() },
    { name: 'sided: a T-junction', project: tee() },
    { name: 'sided: an end at a lot’s entrance', project: lot() },
  ]
}

/** The project written as a version 18 file and read again (migrated): each segment's `left` and `right` as the `width` and `side` of 18. */
export function readAs18(p: Project): Project {
  const json = JSON.parse(JSON.stringify(p)) as { version: number; site: { existingRoads?: Record<string, unknown>[] }; options: { streets?: { segments: Record<string, unknown>[] } }[] }
  json.version = 18
  // an existing road of version 18 has a width; sides that are not equal on every stretch are no version 18 (kept as they are)
  json.site.existingRoads = json.site.existingRoads?.map(({ stretches, ...r }) => {
    const t = stretches as { left: number; right: number }[]
    return t.every((x) => x.left === x.right && x.left === t[0].left) ? { ...r, width: t[0].left * 2 } : { ...r, stretches }
  })
  for (const o of json.options)
    o.streets = o.streets && {
      ...o.streets,
      segments: o.streets.segments.map(({ left, right, ...g }) => {
        const l = left as number
        const r = right as number
        // unequal sides, both over 0, are no side of 18: those are written already as 19 (kept as they are)
        return l > 0 && r > 0 && l !== r ? { ...g, left: l, right: r } : { ...g, width: l + r, ...(l === 0 ? { side: 'left' } : r === 0 ? { side: 'right' } : {}) }
      }),
    }
  return ProjectSchema.parse(migrate(json as never))
}

/**
 * Streets with sides of their own (Phase PE.1, project 19): a street of 2 + 6 m, stretches 4 + 4, 0 + 8 and 6 + 2 in a
 * row, a street pulled to 0 on one side, and a project with streets of every side written as a version 18 file and
 * migrated.
 */
export function ownSides(): Scenario[] {
  const base = () => site(rectangle(700, 500), false)
  const draw = (p: Project, points: Point[], opts: Parameters<typeof drawStreet>[6] = {}) => drawStreet(p, 'o1', points, undefined, undefined, undefined, opts)!
  const set = (r: { project: Project; segments: Id[] }, edges: { left: number; right: number }[]) => setStreetEdges(r.project, 'o1', Object.fromEntries(r.segments.map((id, i) => [id, edges[i]])))
  const two = draw(base(), [{ x: 100, y: 250 }, { x: 500, y: 250 }])
  const row = draw(base(), [{ x: 100, y: 250 }, { x: 250, y: 250 }, { x: 400, y: 250 }, { x: 550, y: 250 }])
  const pulled = draw(base(), [{ x: 100, y: 250 }, { x: 300, y: 250 }, { x: 300, y: 400 }])
  return [
    { name: 'sides: a street of 2 + 6 m', project: set(two, [{ left: 2, right: 6 }]) },
    { name: 'sides: stretches 4 + 4, 0 + 8, 6 + 2 in a row', project: set(row, [{ left: 4, right: 4 }, { left: 0, right: 8 }, { left: 6, right: 2 }]) },
    { name: 'sides: a street pulled to 0 on one side', project: set(pulled, [{ left: 8, right: 0 }, { left: 0, right: 8 }]) },
    ...sidedStreets().map((s) => ({ name: `sides: ${s.name}, read as a version 18 file`, project: readAs18(s.project) })),
  ]
}

/**
 * Streets that meet (Phase PE.1): a street ending on an existing street from either side, on its end in line and at 90°,
 * an existing street crossed by a street, and streets of every side and a widened segment at one node. Checked for the
 * paving's seams and the edges' offsets (stress/audit.ts) before the path engine joins them.
 */
export function meetingStreets(): Scenario[] {
  const base = () => site(rectangle(700, 500), false)
  const w = streetTypesOf(base())[0].width
  const draw = (p: Project, points: Point[], opts: Parameters<typeof drawStreet>[6] = {}) => drawStreet(p, 'o1', points, undefined, undefined, undefined, opts)!
  const existing = (points: Point[]) => addExistingRoad(base(), points)!.project
  const through = existing([{ x: 50, y: 250 }, { x: 650, y: 250 }])
  const crossed = existing([{ x: 350, y: 20 }, { x: 350, y: 480 }])
  // two stretches of its own sides: 3 + 3, then 0 + 9 (its drawn line the left edge of the second)
  const uneven = (() => {
    const p = existing([{ x: 50, y: 250 }, { x: 350, y: 250 }, { x: 650, y: 250 }])
    const [r] = p.site.existingRoads!
    return { ...p, site: { ...p.site, existingRoads: [{ ...r, stretches: [{ left: 3, right: 3 }, { left: 0, right: 9 }] }] } }
  })()
  const endToEnd = existing([{ x: 50, y: 250 }, { x: 300, y: 250 }])
  // four streets of every side at one node: left, centre, right and a widened one
  const node = { x: 350, y: 250 }
  const every = () => {
    let p = base()
    p = draw(p, [{ x: 150, y: 250 }, node], { side: 'left' }).project
    p = draw(p, [node, { x: 350, y: 100 }]).project
    p = draw(p, [node, { x: 550, y: 250 }], { side: 'right' }).project
    const r = draw(p, [node, { x: 350, y: 400 }])
    return setStreetSegmentWidth(r.project, 'o1', [r.segments[0]], w + 4)
  }
  return [
    { name: 'meeting: a street T-joined to an existing street from the north', project: draw(through, [{ x: 350, y: 100 }, { x: 350, y: 250 }]).project },
    { name: 'meeting: a street T-joined to an existing street from the south', project: draw(through, [{ x: 350, y: 400 }, { x: 350, y: 250 }]).project },
    { name: 'meeting: a street end on an existing street’s end, in line', project: draw(endToEnd, [{ x: 300, y: 250 }, { x: 600, y: 250 }]).project },
    { name: 'meeting: a street end on an existing street’s end, at 90°', project: draw(endToEnd, [{ x: 300, y: 250 }, { x: 300, y: 450 }]).project },
    { name: 'meeting: an existing street through the site crossed by a street', project: draw(crossed, [{ x: 100, y: 250 }, { x: 600, y: 250 }]).project },
    { name: 'meeting: streets of every side at one node', project: every() },
    { name: 'meeting: an existing street of stretches 3 + 3, 0 + 9, a street T-joined to its second', project: draw(uneven, [{ x: 500, y: 100 }, { x: 500, y: 250 }]).project },
  ]
}

/**
 * Street ends linked to an existing street (Phase PE.1, task 9; `StreetNode.road`): an end dropped on its paving, the road's
 * node dragged under a linked end, the road deleted under one. Checked for `link-off` (stress/audit.ts): a linked node lies on
 * its road's drawn line, and names a road that is there.
 */
export function linkedStreets(): Scenario[] {
  const base = site(rectangle(700, 500), false)
  const { project: withRoad, id } = addExistingRoad(base, [{ x: 50, y: 250 }, { x: 350, y: 250 }, { x: 650, y: 250 }])!
  // one end on the paving, one exactly on the drawn line
  const first = drawStreet(withRoad, 'o1', [{ x: 200, y: 100 }, { x: 200, y: 253 }])!.project
  const drawn = drawStreet(first, 'o1', [{ x: 500, y: 400 }, { x: 500, y: 250 }])!.project
  const ref = { kind: 'existing-road' as const, id }
  return [
    { name: 'links: a street end on an existing street’s paving, linked', project: settled(withRoad, drawn) },
    {
      name: 'links: an existing street’s node dragged under a linked end',
      project: settled(drawn, editPath(drawn, ref, { op: 'node', i: 1, to: { x: 350, y: 380 } }, 'o1').project),
    },
    { name: 'links: an existing street deleted under a linked end', project: settled(drawn, removeExistingRoad(drawn, id)) },
  ]
}

/**
 * Streets with lanes (Phase PE.2, project 20): a street of 3 + 3.5 + 4.25 m drawn by its left edge, a chain whose middle stretch
 * has stored lanes, a segment stored b → a walked in a chain, an existing street with lanes by stretch, a lane added to every
 * stretch. Checked for `lanes-sum` (stress/audit.ts): each road's lanes add up to its width, and so do the lanes a segment or a
 * stretch keeps.
 */
export function lanes(): Scenario[] {
  const base = () => site(rectangle(700, 500), false)
  const draw = (p: Project, points: Point[], opts: Parameters<typeof drawStreet>[6] = {}) => drawStreet(p, 'o1', points, undefined, undefined, undefined, opts)!
  const street = (segment: Id) => ({ kind: 'street', id: `street:${segment}` })
  const edit = (p: Project, ref: { kind: string; id: Id }, op: Parameters<typeof editPath>[2]) => editPath(p, ref, op, 'o1').project
  // 3 + 3.5 + 4.25 m, its drawn line the left edge
  const three = (() => {
    const r = draw(base(), [{ x: 100, y: 250 }, { x: 500, y: 250 }], { side: 'left' })
    const wide = setStreetEdges(r.project, 'o1', { [r.segments[0]]: { left: 0, right: 10.75 } })
    return edit(wide, street(r.segments[0]), { op: 'lane-widths', k: 0, widths: [3, 3.5, 4.25] })
  })()
  // three stretches of 8 m, the middle one of two lanes of 3 + 5 m
  const chain = (() => {
    const r = draw(base(), [{ x: 100, y: 250 }, { x: 250, y: 250 }, { x: 400, y: 250 }, { x: 550, y: 250 }])
    return { r, project: edit(r.project, street(r.segments[0]), { op: 'lane-widths', k: 1, widths: [3, 5] }) }
  })()
  // the second segment is drawn from the east end back to the node they share, so it is stored b → a
  const backwards = (() => {
    const first = draw(base(), [{ x: 100, y: 250 }, { x: 300, y: 250 }])
    const second = draw(first.project, [{ x: 500, y: 250 }, { x: 300, y: 250 }])
    const r = street(first.segments[0])
    return edit(edit(second.project, r, { op: 'lane-widths', k: 1, widths: [3, 5] }), r, { op: 'lanes', k: 0, by: 1 })
  })()
  const existing = (() => {
    const { project, id } = addExistingRoad(base(), [{ x: 50, y: 100 }, { x: 350, y: 100 }, { x: 650, y: 100 }], 8)!
    const ref = { kind: 'existing-road', id }
    return edit(edit(project, ref, { op: 'lanes', k: 0, by: 1 }), ref, { op: 'lane-widths', k: 1, widths: [2, 6] })
  })()
  const added = edit(chain.r.project, street(chain.r.segments[0]), { op: 'lanes', k: 'all', by: 1 })
  return [
    { name: 'lanes: a street of 3 + 3.5 + 4.25 m drawn by its left edge', project: three },
    { name: 'lanes: a chain whose middle stretch has stored lanes', project: chain.project },
    { name: 'lanes: a segment stored b → a, walked in a chain', project: backwards },
    { name: 'lanes: an existing street with lanes by stretch', project: existing },
    { name: 'lanes: a lane added to every stretch', project: added },
  ]
}

/**
 * Gates on the sides of streets (Phase PE.2, project 20; the On edge engine): one on each side of a street through the site, one on the side of an
 * existing street outside the boundary (a migrated frontage's), one on a street split under it, one beside a T. Checked for `gate-host`
 * (stress/audit.ts): a gate with `on` lies on its host's side within 1 cm, half its width inside the side's ends, and a gate with `t` on the boundary.
 */
export function streetGates(): Scenario[] {
  const base = () => site(rectangle(500, 340))
  const street = (p: Project, points: Point[], width = 10) => drawStreet(p, 'o1', points, undefined, width)!
  const on = (p: Project, host: Parameters<typeof addGateOn>[2]) => addGateOn(p, 'o1', host).project
  // a street through the site, a gate on its left and one on its right
  const through = street(base(), [{ x: 40, y: 170 }, { x: 460, y: 170 }])
  const first = through.segments[0]
  const both = on(on(through.project, { kind: 'street', id: first, side: 'left', at: 120 }), { kind: 'street', id: first, side: 'right', at: 300 })
  // the existing street along the first side (outside it, 15 m): a gate on the side away from the site, and one on the side facing it
  const outside = base()
  const road = outside.site.existingRoads![0]
  const frontage = on(on(outside, { kind: 'existing-road', id: road.id, side: 'right', at: 60 }), { kind: 'existing-road', id: road.id, side: 'left', at: 140 })
  // the street split at x 250 with a gate on each side of its halves
  const split = (() => {
    const gated = on(on(through.project, { kind: 'street', id: first, side: 'right', at: 100 }), { kind: 'street', id: first, side: 'left', at: 330 })
    return settled(gated, editPath(gated, { kind: 'street', id: `street:${first}` }, { op: 'insert', k: 0, at: { x: 250, y: 170 } }, 'o1').project)
  })()
  // a T: a second street ends on the first; a gate on each side of the stem, and one on the through street beside the T
  const tee = (() => {
    const stem = street(through.project, [{ x: 250, y: 170 }, { x: 250, y: 300 }], 8)
    const gated = on(on(stem.project, { kind: 'street', id: stem.segments[0], side: 'left', at: 60 }), { kind: 'street', id: stem.segments[0], side: 'right', at: 100 })
    return on(gated, { kind: 'street', id: first, side: 'right', at: 60 })
  })()
  return [
    { name: 'street gates: a gate on each side of a street through the site', project: both },
    { name: 'street gates: on an existing street outside the boundary', project: frontage },
    { name: 'street gates: on a street split under it', project: split },
    { name: 'street gates: beside a T', project: tee },
  ]
}

/**
 * Existing streets moved, turned and mirrored (Phase PE.2, task 11): an existing street of lanes by stretch with a street end linked to it and a gate on each
 * of its sides, moved 30 m, turned 30° about its middle, mirrored across a horizontal line, and all three one after another. Checked for `link-off` and
 * `gate-host` (stress/audit.ts): the linked end lies on the drawn line still, the gates on their sides still, after the same settle a view's verb gets.
 */
export function movedExisting(): Scenario[] {
  const base = site(rectangle(700, 500), false)
  const { project: withRoad, id } = addExistingRoad(base, [{ x: 100, y: 250 }, { x: 350, y: 250 }, { x: 600, y: 250 }], 8)!
  const lanesOn = editPath(withRoad, { kind: 'existing-road', id }, { op: 'lane-widths', k: 1, widths: [2, 6] }, 'o1').project
  const linked = settled(lanesOn, drawStreet(lanesOn, 'o1', [{ x: 200, y: 400 }, { x: 200, y: 252 }])!.project)
  const gated = addGateOn(addGateOn(linked, 'o1', { kind: 'existing-road', id, side: 'right', at: 80 }).project, 'o1', { kind: 'existing-road', id, side: 'left', at: 400 }).project
  const pivot = { x: 350, y: 250 }
  const across = { a: { x: 0, y: 400 }, b: { x: 100, y: 400 } }
  const moved = settled(gated, moveExistingRoads(gated, [id], { x: 30, y: -20 }))
  const turned = settled(gated, turnExistingRoads(gated, [id], pivot, 30))
  const mirrored = settled(gated, mirrorExistingRoads(gated, [id], across.a, across.b))
  const both = settled(moved, turnExistingRoads(moved, [id], pivot, 30))
  const all = settled(both, mirrorExistingRoads(both, [id], across.a, across.b))
  return [
    { name: 'moved existing: a street with a linked end and two gates, moved 30 m', project: moved },
    { name: 'moved existing: turned 30° about its middle', project: turned },
    { name: 'moved existing: mirrored across a horizontal line', project: mirrored },
    { name: 'moved existing: moved, turned and mirrored', project: all },
  ]
}

/**
 * A street with a gate on each side, moved with its nodes (Phase PE.2, review E1): dragged across another street (its segment split where it crosses,
 * the gate on the half the knit gave a new id), dragged so that its end lands on the other street's paving (joined there), turned across it and mirrored onto
 * it. The edit's nodes move and the network is knit in one step: the gates must come out on the street still (a gate lost is told by the test, as
 * `gate-host` sees only the gates that are there). Each scenario keeps its two gates.
 */
export function streetsMoved(): Scenario[] {
  const base = () => site(rectangle(500, 340), false)
  const cross = drawStreet(base(), 'o1', [{ x: 250, y: 40 }, { x: 250, y: 300 }], undefined, 8)!
  const own = drawStreet(cross.project, 'o1', [{ x: 40, y: 100 }, { x: 200, y: 100 }], undefined, 10)!
  const seg = own.segments[0]
  const gated = addGateOn(addGateOn(own.project, 'o1', { kind: 'street', id: seg, side: 'right', at: 120 }).project, 'o1', { kind: 'street', id: seg, side: 'left', at: 30 }).project
  const mine = own.nodes
  const pivot = { x: 225, y: 100 }
  return [
    { name: 'streets moved: dragged across another street', project: settled(gated, moveStreetNodes(gated, 'o1', mine, { x: 120, y: 0 })) },
    { name: 'streets moved: dragged so that its end lands on another street’s paving', project: settled(gated, moveStreetNodes(gated, 'o1', mine, { x: 48, y: 0 })) },
    { name: 'streets moved: turned across another street', project: settled(gated, turnStreetNodes(gated, 'o1', mine, pivot, 120)) },
    { name: 'streets moved: mirrored so that its end lands on another street', project: settled(gated, mirrorStreetNodes(gated, 'o1', mine, { x: 145, y: 0 }, { x: 145, y: 1 })) },
  ]
}

/**
 * A street with a bend and a gate on each of its two segments, the bend's node deleted (Phase PE.2, review R1): by the plan's Delete on a node (the path
 * engine's `remove`) and by `removeStreetNode`, at a bend of 20° and of 30°. The two segments become one (the chord across the bend: a gate stays when it stood within its street’s widest side + 1 m of it) and each gate must stay on the street (a gate
 * lost is told by the test, as `gate-host` sees only the gates that are there).
 */
export function bendsRemoved(): Scenario[] {
  const out: Scenario[] = []
  for (const turn of [20, 30]) {
    const bend = { x: 130 + 40 * Math.cos((turn * Math.PI) / 180), y: 150 + 40 * Math.sin((turn * Math.PI) / 180) }
    const drawn = drawStreet(site(rectangle(500, 340), false), 'o1', [{ x: 90, y: 150 }, { x: 130, y: 150 }, bend], undefined, 8)!
    const [first, second] = drawn.segments
    const gated = addGateOn(addGateOn(drawn.project, 'o1', { kind: 'street', id: first, side: 'right', at: 20 }).project, 'o1', { kind: 'street', id: second, side: 'right', at: 30 }).project
    out.push({ name: `bend removed: ${turn}°, by Delete on its node`, project: settled(gated, editPath(gated, { kind: 'street', id: `street:${first}` }, { op: 'remove', i: 1 }, 'o1').project) })
    out.push({ name: `bend removed: ${turn}°, by removeStreetNode`, project: settled(gated, removeStreetNode(gated, 'o1', drawn.nodes[1])) })
  }
  return out
}

/** A frontage as a version 19 file held it (the schema has none since Phase PE.2): a stretch of the boundary and the width of the street outside it. */
export interface LegacyFrontage {
  id: Id
  from: number
  to: number
  name?: string
  streetWidth?: number
}

/** A scenario that was a version 19 file: `before` is the project as that file held it without its frontages (no existing road of the site's own), `frontages` those. */
export interface MigratedScenario extends Scenario {
  before: Project
  frontages: LegacyFrontage[]
}

/**
 * The project written as a version 19 file holding these `frontages` in place of its existing roads, and read again (migrated):
 * `project` is what such a file opens as, `before` the project it was (read at version 20, which has no frontage: zod strips it).
 */
export function readAs19WithFrontage(p: Project, frontages: LegacyFrontage[]): { before: Project; project: Project; frontages: LegacyFrontage[] } {
  const json = JSON.parse(JSON.stringify(p)) as { version: number; site: Record<string, unknown> }
  const { existingRoads: _, ...rest } = json.site
  const file = { ...json, site: { ...rest, frontage: frontages } }
  return { before: ProjectSchema.parse({ ...file, version: 20 }), project: ProjectSchema.parse(migrate({ ...file, version: 19 } as never)), frontages }
}

/**
 * Saved frontages that became existing streets (Phase PE.2, project 20): the sites of `siteShapes()` with the frontage their first
 * edge had (15 m), the demo's (15 m, from 60 to 380), a run across a corner and a run past the first vertex. `frontageKept`
 * (stress/audit.ts) holds each to what it was: the old street under the joined paving, the gates where they stood.
 */
export function frontagesMigrated(): MigratedScenario[] {
  const long = (p: Project) => perimeter(contourToPolygon(p.site.boundary!))
  const demo = bare()
  const rect = withMasses(site(rectangle(500, 320)), [{ x: 250, y: 170, w: 140, d: 70 }])
  const ts = vertexTs(contourToPolygon(rect.site.boundary!))
  const out: MigratedScenario[] = []
  const add = (name: string, p: Project, frontages: LegacyFrontage[]) => out.push({ name: `frontage: ${name}`, ...readAs19WithFrontage(p, frontages) })
  for (const s of siteShapes()) add(s.name, s.project, [{ id: 'f1', from: 0, to: vertexTs(contourToPolygon(s.project.site.boundary!))[1] ?? 1, streetWidth: 15 }])
  add('the demo’s', demo, [{ id: 'f1', from: 60 / long(demo), to: 380 / long(demo), name: 'South street', streetWidth: 15 }])
  add('a run across a corner', rect, [{ id: 'f1', from: ts[1] - 0.1, to: ts[1] + 0.1, streetWidth: 12 }])
  add('a run past the first vertex', rect, [{ id: 'f1', from: ts[3] + 0.05, to: ts[1] - 0.05, streetWidth: 12 }])
  return out
}

/**
 * The sample's frontage (20 m, from 20 to 500 m along its south side) as a version 19 file had it. Held to `frontageKept` but not audited with the
 * group: the network the migration would draw for the sample (its halls pulled out of their boxes) runs over its masses with or without the street,
 * which has nothing to do with the frontage.
 */
export function sampleMigrated(): MigratedScenario {
  const sample = sampleProject()
  const total = perimeter(contourToPolygon(sample.site.boundary!))
  return { name: 'frontage: the sample’s', ...readAs19WithFrontage(sample, [{ id: 'f1', from: 20 / total, to: 500 / total, name: 'South street', streetWidth: 20 }]) }
}

/** Gates in odd places and of odd kinds. */
export function oddGates(): Scenario[] {
  const demo = bare()
  const base: Project = { ...demo, site: { ...demo.site, gates: [] } }
  const at = (t: number, init = {}) => addGate(base, 'o1', t, init).project
  let eight = base
  for (let k = 0; k < 8; k++) eight = addGate(eight, 'o1', 0.03 + k * 0.03).project
  return [
    { name: 'gate at a corner (t 0)', project: at(0) },
    { name: 'gate just before the end (t 0.999)', project: at(0.999) },
    { name: 'gate off the street (north side)', project: at(0.55) },
    { name: 'gate behind a warehouse', project: gateAt(base, { x: 430, y: 110 }) },
    { name: 'gate out only', project: at(0.12, { flow: 'out' }) },
    { name: 'gate for cars only', project: at(0.12, { vehicles: 'cars' }) },
    { name: 'gate 60 m wide, no radius', project: at(0.12, { width: 60, radius: 0 }) },
    { name: 'eight gates', project: eight },
    { name: 'no gate', project: base },
    { name: 'gate, no street', project: removeExistingRoad(at(0.12), 'e1') },
  ]
}

/** The standards pushed to their ends. */
export function extremeStandards(): Scenario[] {
  const demo = bare()
  return (
    [
      ['roads 3 m', { roadWidth: 3 }],
      ['roads 30 m', { roadWidth: 30 }],
      ['courts 1 m', { courtDepth: 1 }],
      ['courts 120 m', { courtDepth: 120 }],
      ['no clearance', { ringClear: 0 }],
      ['clearance 50 m', { ringClear: 50 }],
      ['stalls 0.8 m wide', { stallWidth: 0.8 }],
      ['stalls 10 m wide', { stallWidth: 10 }],
      ['stalls 30 m deep', { stallDepth: 30 }],
      ['parking on one side', { parking: 'single' }],
      ['no parking', { parking: 'none' }],
    ] as const
  ).map(([name, patch]) => ({ name: `standards: ${name}`, project: updateStandards(demo, patch) }))
}

/**
 * Car roads and an option's parking (Decision "Circulation optimization"): the gate for cars, for trucks out, two
 * gates of each kind; car roads narrower and wider than the truck roads; the option's parking; offices
 * alone (no docks: every road a car road); a grid of warehouses with a car gate beside the truck gate.
 */
export function carRoads(): Scenario[] {
  const demo = bare()
  const gates = (p: Project) => {
    let q = addGate(p, 'o1', 0.06, { vehicles: 'cars' }).project
    return addGate(q, 'o1', 0.18, { vehicles: 'trucks', flow: 'out' }).project
  }
  const grid = many().find((s) => s.name === 'grid 3×3, 60 m apart')!.project
  // its network drawn first (as the audit draws it), then a side per segment
  const bySide = (p: Project) => {
    const q = legacyStreets(p)
    const sides = ['left', 'right', 'both', 'none'] as const
    const segments = q.options[0].streets?.segments ?? []
    return setStreetParking(q, 'o1', Object.fromEntries(segments.map((g, i) => [g.id, sides[i % sides.length]])))
  }
  // Decision "Lot tool": lots against walls (to the setback, and a length of one), a free one over a court, then Connect
  const lot = (p: Project, fields: Parameters<typeof addLot>[2]) => addLot(p, 'o1', fields)?.project ?? p
  const lots = (p: Project) =>
    lot(lot(lot(p, { anchor: { massId: 'm1', side: 't1' } }), { anchor: { massId: 'm1', side: 's0', from: 10, length: 30 }, rows: 3 }), {
      rect: { center: { x: 150, y: 60 }, width: 60, depth: 40, rotation: 0 },
    })
  const offices = withMasses(site(rectangle(400, 300)), [
    { x: 120, y: 150, w: 80, d: 40, program: 'office' },
    { x: 280, y: 150, w: 80, d: 40, program: 'office', building: 'own' },
  ])
  return [
    { name: 'cars: the only gate for cars', project: updateGate(demo, 'o1', 'g1', { vehicles: 'cars' }) },
    { name: 'cars: a gate for cars and one for trucks out', project: gates(demo) },
    { name: 'cars: car roads 3 m', project: updateStandards(demo, { carRoadWidth: 3 }) },
    { name: 'cars: car roads 12 m', project: updateStandards(demo, { carRoadWidth: 12 }) },
    { name: 'cars: the option parks on one side', project: setParking(demo, 'o1', 'single') },
    { name: 'cars: the option parks nowhere', project: setParking(demo, 'o1', 'none') },
    // Decision "Street parking by side": each segment its own side, one after another; and over an option of none
    { name: 'cars: each street segment parks on a side of its own', project: bySide(demo) },
    { name: 'cars: segments park by side, the option nowhere', project: setParking(bySide(demo), 'o1', 'none') },
    { name: 'cars: offices alone', project: offices },
    { name: 'lots: two against walls and a free one over a court', project: lots(demo) },
    { name: 'lots: and Connect to their entrances', project: settled(lots(demo), connectStreets(lots(demo), 'o1').project) },
    { name: 'lots: over an option of none, segments by side', project: lots(setParking(bySide(demo), 'o1', 'none')) },
    { name: 'cars: a grid with a car gate and a truck gate out', project: gates(grid) },
  ]
}

/** Odd masses: overlapping, on an upper level only, a context building, a ring switched off, out of the site. */
export function oddMasses(): Scenario[] {
  const up = addLevelAtEnd(bare(), 'above')
  const upper = addMass(up.project, { programId: 'warehouse', levelId: up.id, footprint: { kind: 'rect', center: { x: 120, y: 230 }, width: 80, depth: 30, rotation: 0 } }).project
  const ctx = withMasses(bare(), [{ x: 330, y: 220, w: 100, d: 30, building: 'own' }])
  const context = updateBuilding(ctx, ctx.buildings[ctx.buildings.length - 1].id, { context: true })
  return [
    { name: 'masses overlapping', project: withMasses(site(rectangle(500, 340)), [{ x: 200, y: 170, w: 160, d: 80 }, { x: 300, y: 170, w: 160, d: 80 }]) },
    { name: 'masses overlapping, two buildings', project: withMasses(site(rectangle(500, 340)), [{ x: 200, y: 170, w: 160, d: 80 }, { x: 300, y: 170, w: 160, d: 80, building: 'own' }]) },
    { name: 'a mass on L2 only', project: upper },
    { name: 'a context building', project: context },
    // as a version 10 file held it (the ring roads went with ST.4): the migration draws no ring round b1
    { name: 'ring off', project: { ...bare(), options: bare().options.map((o) => ({ ...o, ringOff: ['b1'] })) } as Project },
    { name: 'a mass out of the site', project: withMasses(bare(), [{ x: 700, y: 100, w: 100, d: 60 }]) },
    { name: 'a sliver mass', project: withMasses(bare(), [{ x: 300, y: 230, w: 120, d: 0.5 }]) },
    { name: 'a tiny mass', project: withMasses(bare(), [{ x: 300, y: 230, w: 2, d: 2 }]) },
  ]
}

/** Warehouse 2 of the demo dragged west, 10 m a step, across the gate and into Warehouse 1: every step derived. */
export function dragSteps(): Scenario[] {
  const out: Scenario[] = []
  for (let x = 320; x >= 100; x -= 10) out.push({ name: `drag: Warehouse 2 at x ${x}`, project: moveMass(bare(), 'm2', { x: x - 320, y: 0 }) })
  return out
}

/**
 * Warehouses joined (Decision "Docks turn with the building"): two along their long walls, in one building or two, on
 * sites with less room on their free sides than a neighbour is deep (a ray measured from inside the neighbour used to
 * find the shared wall roomier); three stacked, the middle one covered on both long walls; joined end to end; a pair
 * joined and turned.
 */
export function joined(): Scenario[] {
  const out: Scenario[] = []
  for (const own of [false, true]) {
    const two = own ? ', two buildings' : ''
    const building = own ? ('own' as const) : undefined
    for (const height of [300, 360, 440])
      out.push({
        name: `joined along their long walls, a site ${height} m deep${two}`,
        project: withMasses(site(rectangle(400, height)), [
          { x: 200, y: height / 2 - 40, w: 160, d: 80 },
          { x: 200, y: height / 2 + 40, w: 160, d: 80, building },
        ]),
      })
    out.push({
      name: `three stacked${two}`,
      project: withMasses(site(rectangle(400, 420)), [
        { x: 200, y: 130, w: 160, d: 80 },
        { x: 200, y: 210, w: 160, d: 80, building },
        { x: 200, y: 290, w: 160, d: 80 },
      ]),
    })
    out.push({
      name: `joined end to end${two}`,
      project: withMasses(site(rectangle(560, 320)), [
        { x: 200, y: 160, w: 160, d: 80 },
        { x: 360, y: 160, w: 160, d: 80, building },
      ]),
    })
    for (const rot of [90, 180, 270])
      out.push({
        name: `joined along their long walls, turned ${rot}°${two}`,
        project: withMasses(site(rectangle(420, 420)), [
          { x: 170, y: 210, w: 160, d: 80, rot },
          { x: 250, y: 210, w: 160, d: 80, rot, building },
        ].map((b) => (rot % 180 === 0 ? { ...b, x: 210, y: b.x + 40 } : b))),
      })
  }
  return out
}

/**
 * A truck court's contour in its wall's frame (Phase D.3, Decision "Court shape": x m along the wall's face from its start, y m out of it): its wall
 * side from x0 to x1, `depth` m deep, its far corners cut by a chamfer of `cut` m each way.
 */
export function slab(x0: number, x1: number, depth: number, cut = 0): Contour {
  const far = cut ? { chamfer: [cut, cut] as [number, number] } : {}
  return {
    vertices: [
      { x: x0, y: 0, r: 0 },
      { x: x1, y: 0, r: 0 },
      { x: x1, y: depth, r: 0, ...far },
      { x: x0, y: depth, r: 0, ...far },
    ],
  }
}

/**
 * A block 72 × 48 m on bays of 12 m with these courts by edge (e1 its front, e2 its right, e3 its back, e4 its left; the courts of a wall with no docks
 * put none in front of it, so a court says its wall), its steps locked, in the project.
 */
export function courtBlock(p: Project, courts: CourtByEdge[]): { project: Project; id: Id } {
  const made = addWarehouseType(p)
  let q = updateWarehouseStep(made.project, made.id, 'grid', { x: 12, y: 12, modules: 4 })
  q = updateWarehouseStep(q, made.id, 'hall', { length: 72, width: 48, ends: 'both' })
  for (const s of ['grid', 'hall', 'columns', 'envelope'] as const) q = lockWarehouseStep(q, made.id, s)
  return { project: { ...q, warehouseTypes: q.warehouseTypes!.map((t) => (t.id === made.id ? { ...t, courts } : t)) }, id: made.id }
}

/** A block placed with its middle at (x, y), turned `angle` degrees, in the project's first option. */
export const placedBlock = (p: Project, id: Id, x: number, y: number, angle = 0): Project => placeWarehouse(p, id, { x, y }, angle, p.options[0].id)!.project

/**
 * Truck courts with a shape of their own (Phase D.3, Decision "Court shape"): a court narrower than its wall, one with its far corners chamfered, a
 * wall with two courts after a split, a shaped court facing another warehouse's rectangular court (shared: its shape cut at the other wall), one that
 * flares past its wall's ends into a neighbour, and one that leaves the site. The wall is the block's front (e1, south) unless it says otherwise.
 */
export function shapedCourts(): Scenario[] {
  const base = () => site(rectangle(500, 320))
  const one = (shape: Contour, y = 170, plan = base()) => {
    const b = courtBlock(plan, [{ edge: 'e1', id: 'c1', shape }])
    return placedBlock(b.project, b.id, 250, y)
  }
  // two warehouses whose walls face each other `gap` m apart: the first's back wall has a shaped court, the second (turned round) a rectangle
  const facingPair = (gap: number) => {
    const a = courtBlock(base(), [{ edge: 'e3', id: 'c1', shape: slab(12, 60, 40) }])
    const b = courtBlock(a.project, [{ edge: 'e3' }])
    return placedBlock(placedBlock(b.project, a.id, 250, 100), b.id, 250, 100 + 48 + gap, 180)
  }
  const flare: Contour = {
    vertices: [
      { x: 24, y: 0, r: 0 },
      { x: 48, y: 0, r: 0 },
      { x: 92, y: 40, r: 0 },
      { x: -20, y: 40, r: 0 },
    ],
  }
  return [
    { name: 'shaped court: narrower than its wall, centred', project: one(slab(12, 60, 40)) },
    { name: 'shaped court: far corners chamfered 6 × 6 m', project: one(slab(0, 72, 40, 6)) },
    {
      name: 'shaped court: two courts on one wall after a split, a gap between them',
      project: (() => {
        const b = courtBlock(base(), [
          { edge: 'e1', id: 'c1', shape: slab(0, 30, 40) },
          { edge: 'e1', id: 'c2', shape: slab(42, 72, 40) },
        ])
        return placedBlock(b.project, b.id, 250, 170)
      })(),
    },
    { name: 'shaped court: facing a rectangular court 30 m away, under both depths (shared, cut at the other wall)', project: facingPair(30) },
    { name: 'shaped court: flaring past its wall’s ends into a neighbour', project: withMasses(one(flare), [{ x: 296, y: 116, w: 12, d: 12, building: 'own' }]) },
    {
      name: 'shaped court: a notch in its far edge (not convex)',
      project: one({ vertices: [{ x: 0, y: 0, r: 0 }, { x: 72, y: 0, r: 0 }, { x: 72, y: 40, r: 0 }, { x: 46, y: 40, r: 0 }, { x: 46, y: 22, r: 0 }, { x: 26, y: 22, r: 0 }, { x: 26, y: 40, r: 0 }, { x: 0, y: 40, r: 0 }] }),
    },
    { name: 'shaped court: leaving the site', project: one(slab(12, 60, 80), 70) },
    {
      name: 'shaped court: on a copy shrunk by its pill, past its wall’s new end',
      project: (() => {
        const b = courtBlock(base(), [{ edge: 'e1', id: 'c1', shape: slab(40, 72, 40) }])
        const q = placeWarehouse(b.project, b.id, { x: 250, y: 170 }, 0, b.project.options[0].id)!
        return stretchWarehouseHall(q.project, q.id, { axis: 'length', end: 1 }, -24, true).project
      })(),
    },
  ]
}
