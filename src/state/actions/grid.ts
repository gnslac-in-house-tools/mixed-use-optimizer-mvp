// Grid actions (Decisions "Structural grid", "Grid layout"; Phase G.1). Pure, like the rest: nothing changed → the same
// project. One grid for the project; an option may have its own (what it tries without moving the others'):
//   setGrid     the project's grid replaced (never taken away: a project always has one, Decision "Grid always")
//   updateGrid  a change to the grid an option stands on: its own when it has one, else the project's
//   ownGrid     an option gets its own copy of the project's grid
//   sharedGrid  an option back on the project's (its own dropped)
//   stretchBuilding  a building's end moved along the grid (its bays, an end bay: Phase G.2b)
//   splitAtGridLine  a mass split at a bay line inside it (a building stepped on a grid line: Phase G.2b)
import { massIsLocked } from '../../model/locks.ts'
import type { Footprint, Grid, Id, Mass, Point, Polygon, Project } from '../../model/schema.ts'
import { optionOf } from '../../engine/buildings.ts'
import { dockableWalls } from '../../modules/docks/engine/docks.ts'
import { footprintPolygon } from '../../engine/geom/footprint.ts'
import { edgeAt } from '../../engine/geom/perimeter.ts'
import { distancePointSegment } from '../../engine/geom/polygon.ts'
import { bayOf, gridOf, moduleOf, ON_LINE, rectFromGrid, rectOnGrid, toGrid, type Axis } from '../../engine/grid/index.ts'
import { copyMass, isBlockMass } from './masses.ts'

/** A grid that can be drawn: bays over 0, whole modules from 1, numbers that are numbers. */
function sound(g: Grid): boolean {
  const finite = [g.x, g.y, g.modules, g.origin.x, g.origin.y, g.angle].every(Number.isFinite)
  return finite && g.x > 0 && g.y > 0 && Number.isInteger(g.modules) && g.modules >= 1
}

const same = (a: Grid | undefined, b: Grid | undefined) => JSON.stringify(a) === JSON.stringify(b)

export function setGrid(p: Project, grid: Grid): Project {
  if (!sound(grid) || same(p.grid, grid)) return p
  return { ...p, grid: structuredClone(grid) }
}

/** What updateGrid changes: any of the grid's numbers, the origin's x or y alone too. */
export type GridPatch = Partial<Omit<Grid, 'origin'>> & { origin?: Partial<Point> }

export function updateGrid(p: Project, optionId: Id, patch: GridPatch): Project {
  const o = optionOf(p, optionId)
  const own = o.grid !== undefined
  const now = o.grid ?? p.grid
  if (!now) return p
  const next: Grid = { ...now, ...patch, origin: { ...now.origin, ...patch.origin } }
  if (!sound(next) || same(now, next)) return p
  return own ? { ...p, options: p.options.map((x) => (x.id === o.id ? { ...x, grid: next } : x)) } : { ...p, grid: next }
}

export function ownGrid(p: Project, optionId: Id): Project {
  const o = optionOf(p, optionId)
  if (o.grid || !p.grid) return p
  return { ...p, options: p.options.map((x) => (x.id === o.id ? { ...x, grid: structuredClone(p.grid!) } : x)) }
}

export function sharedGrid(p: Project, optionId: Id): Project {
  const o = optionOf(p, optionId)
  if (!o.grid) return p
  return {
    ...p,
    options: p.options.map((x) => {
      if (x.id !== o.id) return x
      const { grid: _, ...rest } = x
      return rest
    }),
  }
}

type Flip = NonNullable<Mass['doorFlips']>[number]

/**
 * A mass's door exceptions (Phase G.3) kept where they are on the plan when its outline changes: each module's middle
 * found on a wall of the new outline, with its index from that wall's start; one on no wall any more is dropped. An
 * exception is kept by its wall and its index from the wall's start, so a wall that grows or shrinks from its start, or
 * a mass split in two, would move it otherwise.
 */
function flipsOn(g: Grid, before: Polygon, flips: Flip[], after: Polygon): Flip[] {
  const m = moduleOf(g)
  const along = (a: Point, b: Point) => (Math.abs(toGrid(g, a).y - toGrid(g, b).y) < ON_LINE ? m.x : m.y)
  const walls = dockableWalls(after)
  return flips.flatMap((f) => {
    const { i } = edgeAt(before, f.t)
    const a = before[i]
    const b = before[(i + 1) % before.length]
    const len = Math.hypot(b.x - a.x, b.y - a.y)
    const s = (f.module + 0.5) * along(a, b)
    if (len <= 0 || s > len) return []
    const p = { x: a.x + ((b.x - a.x) * s) / len, y: a.y + ((b.y - a.y) * s) / len }
    const w = walls.find((x) => distancePointSegment(p, x.a, x.b) < 1e-3)
    return w ? [{ t: w.t, module: Math.floor(Math.hypot(p.x - w.a.x, p.y - w.a.y) / along(w.a, w.b)) }] : []
  })
}

/** The mass with a new footprint, its door exceptions kept where they are on the plan. */
function reshaped(g: Grid, m: Mass, footprint: Footprint): Mass {
  if (!m.doorFlips?.length) return { ...m, footprint }
  const flips = flipsOn(g, footprintPolygon(m.footprint), m.doorFlips, footprintPolygon(footprint))
  const { doorFlips: _, ...rest } = m
  return flips.length ? { ...rest, footprint, doorFlips: flips } : { ...rest, footprint }
}

/**
 * A building's end along one of the grid's axes moved to `to` (m, in the grid's frame): every rect of it along the
 * grid's axes whose side stands on that end stretches or shrinks to it (its bays or an end bay typed in Properties).
 * Refused (the same project) when a locked mass stands there or a mass would get thinner than 1 m; a free shape stays.
 */
export function stretchBuilding(p: Project, optionId: Id, buildingId: Id, axis: Axis, side: 'start' | 'end', to: number): Project {
  const g = gridOf(p, optionId)
  const b = p.buildings.find((x) => x.id === buildingId)
  if (!g || !b || b.context || !Number.isFinite(to)) return p
  const levels = new Set(b.levels.map((l) => l.id))
  const built = (m: Mass) => (m.programId ? p.programs.find((x) => x.id === m.programId)?.built : undefined) ?? true
  const own = new Set(p.masses.filter((m) => levels.has(m.levelId) && built(m)).map((m) => m.id))
  if (own.size === 0) return p
  const along = (pt: Point) => toGrid(g, pt)[axis]
  const ends = p.masses.filter((m) => own.has(m.id)).flatMap((m) => footprintPolygon(m.footprint).map(along))
  const at = side === 'start' ? Math.min(...ends) : Math.max(...ends)
  let refused = false
  let changed = false
  const masses = p.masses.map((m) => {
    if (!own.has(m.id) || m.footprint.kind !== 'rect') return m
    const r = rectOnGrid(g, m.footprint)
    if (!r || Math.abs((side === 'start' ? r.lo : r.hi)[axis] - at) > ON_LINE) return m
    const lo = { ...r.lo }
    const hi = { ...r.hi }
    if (side === 'start') lo[axis] = to
    else hi[axis] = to
    if (massIsLocked(p, m) || hi[axis] - lo[axis] < 1) refused = true
    if (Math.abs(to - at) < 1e-9) return m
    changed = true
    return reshaped(g, m, rectFromGrid(g, m.footprint, lo, hi, r.widthAlongX))
  })
  return refused || !changed ? p : { ...p, masses }
}

/**
 * A rect along the grid's axes split at the bay line `k` across `axis` (at least 1 m from its ends): it keeps the part
 * before the line, a copy of it (its program, height and docks; its group and its platform step too) takes the part
 * after. So a building can step on a grid line (then *Own platform*). Null when it cannot: no grid, a locked mass, one
 * with holes, a block's hall (Phase D.2 leaves its split out), not along the grid, the line not inside it.
 */
export function splitAtGridLine(p: Project, optionId: Id, massId: Id, axis: Axis, k: number): { project: Project; id: Id } | null {
  const g = gridOf(p, optionId)
  const m = p.masses.find((x) => x.id === massId)
  if (!g || !m || massIsLocked(p, m) || isBlockMass(p, m) || m.holes?.length || m.footprint.kind !== 'rect') return null
  const r = rectOnGrid(g, m.footprint)
  const at = k * bayOf(g, axis)
  if (!r || at - r.lo[axis] < 1 || r.hi[axis] - at < 1) return null
  const before = { ...r.hi, [axis]: at }
  const after = { ...r.lo, [axis]: at }
  // each part keeps the door exceptions that stand on its walls
  const first = reshaped(g, m, rectFromGrid(g, m.footprint, r.lo, before, r.widthAlongX))
  let q: Project = { ...p, masses: p.masses.map((x) => (x.id === m.id ? first : x)) }
  // the copy has the mass's outline and exceptions as they were: reshaped to the part after the line
  const copy = copyMass(q, m, { x: 0, y: 0 })
  const rest = rectFromGrid(g, m.footprint, after, r.hi, r.widthAlongX)
  const second = (x: Mass) => ({ ...reshaped(g, x, rest), ...(m.group ? { group: m.group } : {}) })
  q = { ...copy.project, masses: copy.project.masses.map((x) => (x.id === copy.id ? second(x) : x)) }
  // on the step the mass was on, if any
  const buildings = q.buildings.map((b) => {
    const steps = b.platform?.steps
    if (!steps?.some((s) => s.masses.includes(m.id))) return b
    return { ...b, platform: { ...b.platform, steps: steps.map((s) => (s.masses.includes(m.id) ? { ...s, masses: [...s.masses, copy.id] } : s)) } }
  })
  return { project: { ...q, buildings }, id: copy.id }
}
