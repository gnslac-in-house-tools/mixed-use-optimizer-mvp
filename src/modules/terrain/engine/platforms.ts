// The platforms (Decisions "Terrain", "Platforms"), pure: the flat ground an option's masses stand on and the earthwork
// it makes. A building has one of its own, unless it is joined to another's (buildings that work together share one)
// or some of its masses step onto one of their own; its truck courts stand the dock height below it. A platform's
// level is typed, or the one that balances its cut and fill: the ground under its masses and its courts counted cell
// by cell on a grid anchored to the site (the courts' cells with the dock height on top, so the courts balance too).
// Where two overlap, the first one's masses claim a cell before another's, and every platform's masses before any
// court. A context building stands on the ground as it is: its level is the ground's mean under it, never counted.
// Beyond what it grades, each platform's banks (E.5, Decision "Banks"): from its edge the ground rises or falls at the
// standards' 1 : n until it meets the ground as it is (the nearest edge's height, the cells walked out from the edges
// nearest first), their cut and fill the platform's too; the balanced level is its masses' and courts' alone.
// Every figure is an estimate: prisms on the surface, a cell's ground at its middle.
import type { Id, Point, Polygon, Project, Step } from '../../../model/schema.ts'
import { standardsOf } from '../../../engine/circulation/standards.ts'
import { area, bounds, centroid, pointInPolygon, type Bounds } from '../../../engine/geom/polygon.ts'
import { courtShapes, EARTH_BANK, EARTH_COURT, EARTH_NONE, EARTH_PAD, type DerivedDock, type DerivedMass, type DerivedPlatform, type EarthGrid, type Earthwork, type GradedShape } from '../../../engine/types.ts'
import type { Surface } from './surface.ts'

/** About how many cells the site's bounds are cut into. */
const CELLS = 40_000
/** The most cells a grid may have, however far the masses go. */
const MOST_CELLS = 1_000_000
/** The farthest a bank may reach from its platform's edge (m): the grid goes this far round what is graded at most. */
const MOST_REACH = 200

/** The building whose platform `id` stands on: itself, or the one it is joined with, followed to the end. */
export function platformRoot(p: Pick<Project, 'buildings'>, id: Id): Id {
  const seen = new Set<Id>()
  let at = id
  for (;;) {
    seen.add(at)
    const next = p.buildings.find((b) => b.id === at)?.platform?.joined
    if (next === undefined || seen.has(next) || !p.buildings.some((b) => b.id === next)) return at
    at = next
  }
}

/** The step each mass is in, with its building (a step names its own building's masses only). */
export function stepsByMass(p: Pick<Project, 'buildings'>): Map<Id, { step: Step; buildingId: Id }> {
  const out = new Map<Id, { step: Step; buildingId: Id }>()
  for (const b of p.buildings) for (const s of b.platform?.steps ?? []) for (const id of s.masses) if (!out.has(id)) out.set(id, { step: s, buildingId: b.id })
  return out
}

/** The platform a mass stands on, in an option's earthwork. */
export function platformOfMass(e: Earthwork | null, massId: Id): DerivedPlatform | undefined {
  return e?.platforms.find((x) => x.massIds.includes(massId))
}

interface Piece {
  id: Id
  step: boolean
  buildingIds: Id[]
  masses: DerivedMass[]
  context: boolean
  typed: number | undefined
}

/** The option's masses by the platform they stand on, in the order they first come. */
function piecesOf(p: Project, masses: DerivedMass[]): Piece[] {
  const steps = stepsByMass(p)
  const buildings = new Map(p.buildings.map((b) => [b.id, b]))
  const pieces = new Map<string, Piece>()
  for (const m of masses) {
    if (m.polygon.length < 3) continue
    const s = steps.get(m.id)
    const step = s && s.buildingId === m.buildingId && !m.context ? s.step : undefined
    const root = m.context ? m.buildingId : platformRoot(p, m.buildingId)
    const key = step ? `s:${step.id}` : m.context ? `c:${root}` : `b:${root}`
    let piece = pieces.get(key)
    if (!piece) {
      piece = { id: step ? step.id : root, step: step !== undefined, buildingIds: [], masses: [], context: m.context, typed: step ? step.level : buildings.get(root)?.platform?.level }
      pieces.set(key, piece)
    }
    piece.masses.push(m)
    if (!piece.buildingIds.includes(m.buildingId)) piece.buildingIds.push(m.buildingId)
  }
  return [...pieces.values()]
}

/** The union of some bounds. */
function joinBounds(bs: Bounds[]): Bounds | null {
  if (bs.length === 0) return null
  return {
    minX: Math.min(...bs.map((b) => b.minX)),
    minY: Math.min(...bs.map((b) => b.minY)),
    maxX: Math.max(...bs.map((b) => b.maxX)),
    maxY: Math.max(...bs.map((b) => b.maxY)),
  }
}

/** An empty grid over `over`, its cells anchored to `anchor`'s corner and sized from its area. */
function gridOver(over: Bounds, anchor: Bounds): EarthGrid {
  let size = Math.max(1, Math.sqrt(((anchor.maxX - anchor.minX) * (anchor.maxY - anchor.minY)) / CELLS))
  const span = () => ((over.maxX - over.minX) / size + 2) * ((over.maxY - over.minY) / size + 2)
  while (span() > MOST_CELLS) size *= 2
  const i0 = Math.floor((over.minX - anchor.minX) / size)
  const j0 = Math.floor((over.minY - anchor.minY) / size)
  const x0 = anchor.minX + i0 * size
  const y0 = anchor.minY + j0 * size
  const cols = Math.max(1, Math.ceil((over.maxX - x0) / size))
  const rows = Math.max(1, Math.ceil((over.maxY - y0) / size))
  return {
    x0,
    y0,
    size,
    cols,
    rows,
    depth: new Float32Array(cols * rows).fill(Number.NaN),
    owner: new Int32Array(cols * rows).fill(-1),
    kind: new Uint8Array(cols * rows),
  }
}

/** Each cell of the grid whose middle is in `poly`: its index and its middle. */
function eachCellIn(g: EarthGrid, poly: Polygon, visit: (k: number, x: number, y: number) => void) {
  const b = bounds(poly)
  const i0 = Math.max(0, Math.floor((b.minX - g.x0) / g.size))
  const i1 = Math.min(g.cols - 1, Math.floor((b.maxX - g.x0) / g.size))
  const j0 = Math.max(0, Math.floor((b.minY - g.y0) / g.size))
  const j1 = Math.min(g.rows - 1, Math.floor((b.maxY - g.y0) / g.size))
  for (let j = j0; j <= j1; j++)
    for (let i = i0; i <= i1; i++) {
      const x = g.x0 + (i + 0.5) * g.size
      const y = g.y0 + (j + 0.5) * g.size
      if (pointInPolygon({ x, y }, poly)) visit(j * g.cols + i, x, y)
    }
}

/** A binary heap of cells by their distance, least first. */
class Heap {
  private cells: number[] = []
  private keys: number[] = []
  get size() {
    return this.cells.length
  }
  push(c: number, k: number) {
    let i = this.cells.length
    this.cells.push(c)
    this.keys.push(k)
    while (i > 0) {
      const up = (i - 1) >> 1
      if (this.keys[up] <= k) break
      this.cells[i] = this.cells[up]
      this.keys[i] = this.keys[up]
      i = up
    }
    this.cells[i] = c
    this.keys[i] = k
  }
  pop(): [cell: number, key: number] {
    const top: [number, number] = [this.cells[0], this.keys[0]]
    const c = this.cells.pop()!
    const k = this.keys.pop()!
    const n = this.cells.length
    if (n > 0) {
      let i = 0
      for (;;) {
        const l = 2 * i + 1
        const r = l + 1
        let m = i
        let mk = k
        if (l < n && this.keys[l] < mk) [m, mk] = [l, this.keys[l]]
        if (r < n && this.keys[r] < mk) [m, mk] = [r, this.keys[r]]
        if (m === i) break
        this.cells[i] = this.cells[m]
        this.keys[i] = this.keys[m]
        i = m
      }
      this.cells[i] = c
      this.keys[i] = k
    }
    return top
  }
}

/**
 * The banks round what is graded: walked out cell by cell from the graded cells (nearest first, a side 1 cell, a corner
 * √2), each cell taking the nearest edge's height and platform; at `s` m from the edge the bank stands `s / ratio`
 * above it where the ground is higher (cut) or below where lower (fill); where it meets the ground the walk stops.
 * Writes each bank cell's depth, owner and kind (EARTH_BANK) and its ground (`ground`, as the graded cells' is);
 * returns the bank cells.
 */
function walkBanks(g: EarthGrid, ground: Float64Array, surface: Surface, ratio: number): number[] {
  const best = new Float64Array(g.cols * g.rows).fill(Infinity)
  const from = new Float64Array(g.cols * g.rows)
  const owner = new Int32Array(g.cols * g.rows).fill(-1)
  const heap = new Heap()
  const out: number[] = []
  // a walk starts from a graded cell at its graded height
  for (let c = 0; c < g.kind.length; c++) {
    if (g.kind[c] === EARTH_NONE || Number.isNaN(g.depth[c])) continue
    best[c] = 0
    owner[c] = g.owner[c]
    from[c] = ground[c] + g.depth[c]
    heap.push(c, 0)
  }
  while (heap.size) {
    const [c, d] = heap.pop()
    if (d > best[c]) continue
    if (g.kind[c] === EARTH_NONE) {
      const z = surface.elevation(cellMiddle(g, c))
      if (z === null) continue
      const s = Math.max(0, d - g.size / 2)
      const top = from[c]
      const bank = z > top ? top + s / ratio : top - s / ratio
      // met the ground: no bank here, and none beyond
      if (z > top ? bank >= z : bank <= z) continue
      g.kind[c] = EARTH_BANK
      g.owner[c] = owner[c]
      g.depth[c] = bank - z
      ground[c] = z
      out.push(c)
    }
    const i = c % g.cols
    const j = Math.floor(c / g.cols)
    for (let dj = -1; dj <= 1; dj++)
      for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue
        const a = i + di
        const b = j + dj
        if (a < 0 || b < 0 || a >= g.cols || b >= g.rows) continue
        const nb = b * g.cols + a
        if (g.kind[nb] !== EARTH_NONE) continue
        const nd = d + (di && dj ? Math.SQRT2 : 1) * g.size
        if (nd >= best[nb]) continue
        best[nb] = nd
        from[nb] = from[c]
        owner[nb] = owner[c]
        heap.push(nb, nd)
      }
  }
  return out
}

/** The platforms whose cells touch (a side or a corner), each pair once, the lower index first. */
function neighboursIn(g: EarthGrid): [number, number][] {
  const pairs = new Set<number>()
  const n = g.owner.reduce((m, k) => Math.max(m, k + 1), 0)
  // a bank's cell is not its platform's ground: banks that meet make no neighbours
  const own = (c: number) => (g.kind[c] === EARTH_BANK ? -1 : g.owner[c])
  const meet = (a: number, b: number) => {
    if (a < 0 || b < 0 || a === b) return
    pairs.add(Math.min(a, b) * n + Math.max(a, b))
  }
  for (let j = 0; j < g.rows; j++)
    for (let i = 0; i < g.cols; i++) {
      const k = own(j * g.cols + i)
      if (k < 0) continue
      if (i + 1 < g.cols) meet(k, own(j * g.cols + i + 1))
      if (j + 1 < g.rows) {
        meet(k, own((j + 1) * g.cols + i))
        if (i + 1 < g.cols) meet(k, own((j + 1) * g.cols + i + 1))
        if (i > 0) meet(k, own((j + 1) * g.cols + i - 1))
      }
    }
  return [...pairs].sort((a, b) => a - b).map((x) => [Math.floor(x / n), x % n])
}

/** A cell's middle. */
export function cellMiddle(g: EarthGrid, k: number): Point {
  return { x: g.x0 + ((k % g.cols) + 0.5) * g.size, y: g.y0 + (Math.floor(k / g.cols) + 0.5) * g.size }
}

/**
 * An option's platforms and their earthwork, on the ground's surface; null without one. `masses`: the option's shown
 * masses (its context's too); `docks`: its docks, whose courts stand the dock height below their mass's platform;
 * `site`: the boundary the grid is anchored to (absent: the masses').
 */
export function derivePlatforms(
  p: Project,
  surface: Surface | null,
  masses: DerivedMass[],
  docks: DerivedDock[],
  site: Polygon | null,
  trial?: { id: Id; level: number },
): Earthwork | null {
  if (!surface) return null
  const { dockHeight, bankRatio } = standardsOf(p)
  const pieces = piecesOf(p, masses)
  // the search of bankBalancedLevel: one platform at a level of its own, as if typed
  if (trial) for (const x of pieces) if (x.id === trial.id && !x.context) x.typed = trial.level
  const pieceOf = new Map<Id, number>()
  pieces.forEach((x, k) => x.masses.forEach((m) => pieceOf.set(m.id, k)))
  // a court with shapes of its own is each of them (Phase D.3): the ground under the frame that holds them, between two, is nobody's
  const courts = docks.flatMap((d) => {
    const k = pieceOf.get(d.massId)
    return k !== undefined && !pieces[k].context && d.court.length >= 3 ? courtShapes(d).flatMap((court) => (court.length >= 3 ? [{ k, court, dock: d }] : [])) : []
  })
  const outlines = [...pieces.flatMap((x) => x.masses.map((m) => m.polygon)), ...courts.map((c) => c.court)]
  const over = joinBounds(outlines.map(bounds))
  const anchor = site && site.length >= 3 ? bounds(site) : over
  if (!over || !anchor)
    return { platforms: [], cut: 0, fill: 0, grid: gridOver({ minX: 0, minY: 0, maxX: 1, maxY: 1 }, { minX: 0, minY: 0, maxX: 1, maxY: 1 }), shapes: [], neighbours: [] }
  // round what is graded, as far as a bank may reach
  const reach = Math.min(MOST_REACH, bankRatio * (surface.max - surface.min + 5))
  const g = gridOver({ minX: over.minX - reach, minY: over.minY - reach, maxX: over.maxX + reach, maxY: over.maxY + reach }, anchor)
  const { kind } = g
  const ground = new Float64Array(g.cols * g.rows)
  // the cells each design platform's masses claim, then its courts'; a cell with no ground is nobody's
  const claim = (k: number, poly: Polygon, as: number) =>
    eachCellIn(g, poly, (c, x, y) => {
      if (g.owner[c] >= 0) return
      const z = surface.elevation({ x, y })
      if (z === null) return
      g.owner[c] = k
      kind[c] = as
      ground[c] = z
    })
  pieces.forEach((x, k) => {
    if (!x.context) for (const m of x.masses) claim(k, m.polygon, EARTH_PAD)
  })
  for (const c of courts) claim(c.k, c.court, EARTH_COURT)

  // the balanced level: the mean of the ground it grades, a court's raised by the dock height
  const n = new Float64Array(pieces.length)
  const sum = new Float64Array(pieces.length)
  for (let c = 0; c < g.owner.length; c++) {
    const k = g.owner[c]
    if (k < 0) continue
    n[k]++
    sum[k] += ground[c] + (kind[c] === EARTH_COURT ? dockHeight : 0)
  }
  // a context building's: the ground's mean under it, nothing claimed
  pieces.forEach((x, k) => {
    if (!x.context) return
    for (const m of x.masses)
      eachCellIn(g, m.polygon, (_c, cx, cy) => {
        const z = surface.elevation({ x: cx, y: cy })
        if (z === null) return
        n[k]++
        sum[k] += z
      })
  })
  const levels = pieces.map((x, k) => x.typed ?? (n[k] ? sum[k] / n[k] : null))

  const cell = g.size * g.size
  const cut = new Float64Array(pieces.length)
  const fill = new Float64Array(pieces.length)
  for (let c = 0; c < g.owner.length; c++) {
    const k = g.owner[c]
    if (k < 0) continue
    const level = levels[k]
    if (level === null) continue
    const d = level - (kind[c] === EARTH_COURT ? dockHeight : 0) - ground[c]
    g.depth[c] = d
    if (d > 0) fill[k] += d * cell
    else cut[k] -= d * cell
  }

  // the banks: their cut and fill the platform's too, and how much of them is outside the site
  const banks = pieces.map((): DerivedPlatform['banks'] => ({ cut: 0, fill: 0, outside: 0, outsideAt: null }))
  const out = pieces.map((): Point[] => [])
  for (const c of walkBanks(g, ground, surface, bankRatio)) {
    const k = g.owner[c]
    const d = g.depth[c]
    if (d > 0) {
      fill[k] += d * cell
      banks[k].fill += d * cell
    } else {
      cut[k] -= d * cell
      banks[k].cut -= d * cell
    }
    const q = cellMiddle(g, c)
    if (site && site.length >= 3 && !pointInPolygon(q, site)) {
      banks[k].outside += cell
      out[k].push(q)
    }
  }
  // where they leave it: the cell outside nearest the middle of those outside (a cell outside, not a mean between two)
  out.forEach((qs, k) => {
    if (qs.length === 0) return
    const m = { x: qs.reduce((s, q) => s + q.x, 0) / qs.length, y: qs.reduce((s, q) => s + q.y, 0) / qs.length }
    banks[k].outsideAt = qs.reduce((a, b) => (Math.hypot(b.x - m.x, b.y - m.y) < Math.hypot(a.x - m.x, a.y - m.y) ? b : a))
  })

  const platforms: DerivedPlatform[] = pieces.map((x, k) => {
    const largest = x.masses.reduce((a, b) => (area(b.polygon) > area(a.polygon) ? b : a))
    return {
      id: x.id,
      step: x.step,
      buildingIds: x.buildingIds,
      massIds: x.masses.map((m) => m.id),
      context: x.context,
      level: levels[k],
      typed: x.typed !== undefined,
      balanced: n[k] ? sum[k] / n[k] : null,
      cut: cut[k],
      fill: fill[k],
      area: x.context ? 0 : n[k] * cell,
      banks: banks[k],
      at: centroid(largest.polygon),
    }
  })
  const counted = platforms.filter((x) => !x.context)
  const shapes: GradedShape[] = [
    ...pieces.flatMap((x, k) => (x.context || levels[k] === null ? [] : x.masses.map((m) => ({ polygon: m.polygon, z: levels[k]! })))),
    ...courts.flatMap((c) => (levels[c.k] === null ? [] : [{ polygon: c.court, z: levels[c.k]! - dockHeight, wall: { a: c.dock.a, b: c.dock.b, out: c.dock.out } }])),
  ]
  return { platforms, cut: counted.reduce((s, x) => s + x.cut, 0), fill: counted.reduce((s, x) => s + x.fill, 0), grid: g, shapes, neighbours: neighboursIn(g) }
}

/**
 * The level at which platform `id` (a building's root or a step) balances its cut and fill with its banks (Decision
 * "Balance with banks"): what it grades and its banks together, found by halving to the centimetre (its fill less its
 * cut grows with its level). Null without ground, for a context platform or one with no ground under it.
 */
export function bankBalancedLevel(
  p: Project,
  surface: Surface | null,
  masses: DerivedMass[],
  docks: DerivedDock[],
  site: Polygon | null,
  id: Id,
): number | null {
  if (!surface) return null
  const net = (level: number) => {
    const x = derivePlatforms(p, surface, masses, docks, site, { id, level })?.platforms.find((q) => q.id === id)
    return x && !x.context && x.area > 0 ? x.fill - x.cut : null
  }
  let lo = surface.min - 10
  let hi = surface.max + 10
  const a = net(lo)
  const b = net(hi)
  if (a === null || b === null || a > 0 || b < 0) return null
  while (hi - lo > 0.005) {
    const mid = (lo + hi) / 2
    if (net(mid)! < 0) lo = mid
    else hi = mid
  }
  return Math.round(((lo + hi) / 2) * 100) / 100
}
