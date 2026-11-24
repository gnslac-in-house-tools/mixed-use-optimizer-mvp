// What may change (Decisions "Optimizer plugin", "Optimization pipeline", "Masses template", "Fixed size" and "Catalog"):
// the parameter kinds, the twin of the KPIs. Each module declares its own kinds in its manifest (`params`, in its
// params.ts) and the optimizer reads them through the catalog, never naming one. A kind gives each mass, level,
// dimension, gate or building it applies to its genes and writes their values back through the same pure verbs the UI
// and MCP use, on a copy of the project; the optimizer's engine never sees what they mean (a choice's names are the views').
// Every kind goes in steps (fewer specimens, each one visibly different). They are written in their `order`: the
// warehouse types' (their copies are remade where they stand), the grid's (the masses stand on it), the masses', their
// platforms', their doors', then the circulation's.
// A warehouse copy's masses keep their type's shape: neither floors nor proportion reshape them (they move and turn).
// Shapes: a rect changes its proportion, or takes its fixed size; a contour keeps its shape (it moves and turns); what
// is more specific is said with dimensions, a knob (dimension.length) or a lock. A mass whose dimensions hold its shape
// (a locked one anchored to it, or a knob on it) is reshaped by neither its floors nor its proportion.
// Levels move through updateLevel, so the levels above a taller or higher level go up with it and nothing floats;
// a mass without a height of its own follows its level's. The level a mass stands on never changes (the user).
// Which masses: the option's design masses (not context), not locked, not one that *moves with* another (its leader
// carries it: Decision "Links"). Masses that go together are a unit, carried by its first in the project's order (it
// alone gets genes): a building's masses that touch in plan (Decision "A building's masses together"), a group
// (Decision "Groups") and masses a locked dimension ties (it holds their distance). A unit
// turns about its bounds' middle and moves whole, no member changes its shape, and one with a member that is not free
// stays as it is. A mass a locked dimension pins by one end (the other free) moves but never turns: the plan refuses
// that too. Which levels: those of the option's design buildings where such a mass stands, above ground.
// What every kind shares is read once per problem (`contextOf`); what only one module's kinds need (the warehouse
// types, the platforms, the dock patterns) each of those kinds reads once itself (`prepare`).
// What the kinds write is settled at the end (the optimizer's problem), as an edit on the plan is: the dimensions follow
// their corners, and a specimen that would break a lock is refused.
import type { Area } from '../engine/kpis.ts'
import { massIsLocked } from '../model/locks.ts'
import { fixedSize, programAspect } from '../engine/brief.ts'
import { buildingOf, buildingOfLevel, massesOfOption, optionOf } from '../engine/buildings.ts'
import { gateSideOf, gatesOf } from '../engine/circulation/gates.ts'
import { boundaryRoads } from '../engine/circulation/streets.ts'
import { mainAxis } from '../engine/geom/axis.ts'
import { footprintPolygon } from '../engine/geom/footprint.ts'
import { perimeter, stretchLength, vertexTs } from '../engine/geom/perimeter.ts'
import { bounds, boundsTouch, centroid, distancePointSegment, pointInPolygon } from '../engine/geom/polygon.ts'
import { groupMembers } from '../engine/groups.ts'
import { followerMap } from '../engine/graph/links.ts'
import { gridOf, rectOnGrid, toGrid } from '../engine/grid/index.ts'
import { isBasement } from '../engine/levels.ts'
import { deriveSite } from '../engine/massing/site.ts'
import type { Building, Dimension, DesignOption, Grid, Id, Level, Mass, Point, Project, Standards } from '../model/schema.ts'

/** How far a floor height may go from its own, either way (m). */
export const HEIGHT_RANGE = 2
export const MIN_FLOOR_HEIGHT = 2.5
export const MAX_FLOORS = 4
/** How far a dimension's length may go from its own, either way, as a share of it. */
export const DIMENSION_RANGE = 0.2
/** How far a platform's level may go from its balanced one, either way (m). */
export const PLATFORM_RANGE = 3
/** How far a grid's bay may go from its own, either way (m); its angle (°); its modules, at most; a door every so
 *  many modules, at most. */
export const GRID_BAY_RANGE = 3
export const GRID_ANGLE_RANGE = 15
export const MOST_MODULES = 6
export const MOST_EVERY = 4
/** How far a hall's length or width may go from its own without a range of its type's, either way (bays). */
export const HALL_RANGE = 2

/**
 * One gene (Decision "Optimizer plugin"): what the optimizer's engine knows about a variable, and nothing else. A mass's
 * x is a `real`, its rotation a `real` with a step that wraps, a choice a `choice`. A step keeps a value on min + k ×
 * step; `wrap` makes the range a circle (an angle: max is min again, so 0..360 by 15 gives 0, 15 … 345).
 */
export type Gene =
  | { kind: 'real'; min: number; max: number; step?: number; wrap?: boolean }
  /** One of `options` choices, as its index 0 … options − 1. */
  | { kind: 'choice'; options: number }

/** What the kinds read once per problem: what every kind shares. */
export interface Context {
  option: DesignOption
  /** The kinds the template uses: one kind may depend on another (a footprint follows the floors). */
  active: Set<string>
  /** The site's main axis, in degrees: rotations step from it. */
  axis: number
  /** Where a centre may go: the buildable area's bounds (else the site's), out to whole metres. */
  area: { minX: number; minY: number; maxX: number; maxY: number }
  /** The masses the optimizer may change, as they were when the problem was made (of a unit, its first). */
  masses: Mass[]
  /** Each of those masses with the masses that go with it (its unit; itself alone when it has none). */
  units: Map<Id, Id[]>
  /** The levels whose height and floors may change, as they were. */
  levels: Level[]
  /** The floor area each mass must keep over its floors: the brief's per mass, else its footprint × its floors. */
  floorArea: Map<Id, number>
  /** How elongated each mass may become (N:1, its program's). */
  aspect: Map<Id, number>
  /** The size each mass whose program fixes it must have. */
  fixed: Map<Id, { width: number; depth: number }>
  /** The masses whose dimensions hold their shape: a locked one anchored to it, or a knob on it. */
  held: Set<Id>
  /** The masses a locked dimension pins by one end (of a unit, its first): they never turn. */
  pinned: Set<Id>
  /** The dimensions that may change (with dimension.length): not locked, both ends on one free mass alone. */
  knobs: Dimension[]
  /**
   * The gates: the stretch (t) of the boundary side each stands on, its length (m) and how near its corners a gate may go (m). A gate on a street's side
   * (Phase PE.2) has `on`: the metres along its host's drawn line where its side starts (`from` and `to` mean nothing then), and `length` is the side's.
   */
  gates: { id: Id; name: string; from: number; to: number; length: number; margin: number; on?: { from: number } }[]
  /** The site's perimeter (m): a gate's t from metres along its side. */
  perimeter: number
  /** The option's design buildings with masses. */
  buildings: Building[]
  /** The grid the option stands on as the problem found it (null: none): the masses' kinds go on it. */
  grid: Grid | null
  /** On it, the buildable area's box in its frame: where a mass's low corner may go. */
  gridArea: { minX: number; minY: number; maxX: number; maxY: number }
  /** The masses whose proportion gene counts modules (rects on the grid as the problem found them). */
  gridded: Set<Id>
  /** The ranges the standards let the road widths be searched in (with road.width). */
  search: NonNullable<Standards['search']>
}

/** One gene, with what it means. */
export interface Variable {
  /** `<mass, level or dimension id>.<what>`: unique in a problem. */
  key: string
  /** Its kind's id. */
  kind: string
  target: Id
  /** For the genome's bars: "Warehouse 1 · x". */
  label: string
  gene: Gene
  /** A choice's names, by its index. */
  choices?: readonly string[]
  /** Its value in a project (the design as it is, a seed). */
  read(p: Project): number
}

/** A kind's settings in a template: its step and, for the kinds that have one, how far a value may go. */
export interface KindSettings {
  step: number
  range: number
}

/** How a kind's step and range read in a stage's window (its row's fields). */
export type KindFields = 'step' | 'range-step' | 'floors' | 'share-step' | 'switch' | 'modules' | 'choice' | 'hall'

export interface ParamKind<Own = unknown> {
  /** What a template names (`mass.position`): never changes, so saved templates keep working. */
  id: string
  /** The module that declares it. */
  module: string
  /** The area it belongs to (Decision "Areas"): the stage window groups *What may change* by it. */
  area: Area
  /** Where it is written in a genome, low first (one kind may build on another's values). */
  order: number
  /** Where *What may change* lists it, low first (the stage window's order, not the write order). */
  rank: number
  /**
   * What it does in a stage plan (Decision "Way back to Massing"): it moves or reshapes the masses, or it is the
   * circulation's (a stage whose own kinds are all the circulation's is a stage of the circulation); else none.
   */
  role?: 'masses' | 'circulation'
  label: string
  help: string
  fields: KindFields
  /** The words its row shows by its fields (the unit, a choice's names). */
  hint: string
  unit: 'm' | '°' | 'floors' | 'on/off' | 'choice'
  /** The step a template starts with. */
  step: number
  /** The range a template starts with (the kinds that have one): ± m, ± a share, the most floors. */
  range?: number
  /** What only this kind needs, read once per problem (warehouses, platforms, dock patterns). */
  prepare?(p: Project, ctx: Context): Own
  variables(ctx: Context, s: KindSettings, own: Own): Variable[]
  /** Writes this kind's values (all of them at once: a centre's x and y go together). */
  write(p: Project, values: Map<string, number>, ctx: Context, own: Own): Project
}

const massOf = (p: Project, id: Id) => p.masses.find((m) => m.id === id)
const levelIn = (p: Project, id: Id) => buildingOfLevel(p, id)?.levels.find((l) => l.id === id)

/** A mass's centre: a rect's, a contour's centroid. */
export function centreOf(m: Mass): Point {
  return m.footprint.kind === 'rect' ? m.footprint.center : centroid(footprintPolygon(m.footprint))
}

/** The widths a rect of this area may take, whole metres inside 1:aspect … aspect:1 (null: none fits). */
export function widths(area: number, aspect: number): [number, number] | null {
  const min = Math.ceil(Math.sqrt(area / aspect) - 1e-9)
  const max = Math.floor(Math.sqrt(area * aspect) + 1e-9)
  return max >= min ? [min, max] : null
}

// the site's main axis is the core's now (the grid lines up with it too)
export { mainAxis }

/** How near a building's masses count as joined (m): a wall against a wall, or one over the other. */
const JOINED = 0.5

/** Do two outlines touch or overlap in plan (closer than JOINED)? */
function joined(a: Point[], b: Point[]): boolean {
  if (!boundsTouch(bounds(a), bounds(b), JOINED)) return false
  if (pointInPolygon(a[0], b) || pointInPolygon(b[0], a)) return true
  const near = (p: Point[], q: Point[]) => p.some((v) => q.some((w, i) => distancePointSegment(v, w, q[(i + 1) % q.length]) <= JOINED))
  return near(a, b) || near(b, a)
}

/** The units of a project: each mass with the masses that go with it (its design building's masses it touches, its
 *  group, the masses a locked dimension ties to it, in a chain), in the project's order. */
export function unitsOf(p: Project): (id: Id) => Id[] {
  const root = new Map(p.masses.map((m) => [m.id, m.id]))
  const find = (id: Id): Id => {
    let r = id
    while (root.get(r) !== r) r = root.get(r)!
    return r
  }
  const join = (a: Id, b: Id) => {
    if (root.has(a) && root.has(b)) root.set(find(b), find(a))
  }
  // a building's masses that touch stay together (the stress test: an office left its warehouse for another's side)
  const outline = new Map(p.masses.map((m) => [m.id, footprintPolygon(m.footprint)]))
  p.masses.forEach((m, i) => {
    const b = buildingOf(p, m)
    if (b.context) return
    for (const n of p.masses.slice(i + 1)) if (buildingOf(p, n).id === b.id && joined(outline.get(m.id)!, outline.get(n.id)!)) join(m.id, n.id)
  })
  for (const m of p.masses) for (const id of groupMembers(p, m.id)) join(m.id, id)
  for (const d of p.dimensions ?? []) if (d.locked && d.anchorA && d.anchorB) join(d.anchorA.massId, d.anchorB.massId)
  return (id) => {
    const r = find(id)
    return p.masses.filter((m) => find(m.id) === r).map((m) => m.id)
  }
}

/** What every kind needs of a project's option, read once; `active`: the kinds the template uses. */
export function contextOf(p: Project, optionId: Id, active: Iterable<string> = []): Context {
  const option = optionOf(p, optionId)
  const on = new Set(active)
  const site = deriveSite(p.site)
  const zone = site.buildable.flat().flat()
  const pts = zone.length >= 3 ? zone : (site.polygon ?? [])
  const b = pts.length ? bounds(pts) : { minX: 0, minY: 0, maxX: 0, maxY: 0 }
  // on a grid, the masses turn with its axes (Phase G.4)
  const grid = gridOf(p, option.id)
  const axis = grid ? grid.angle : site.polygon ? mainAxis(site.polygon, boundaryRoads(p.site)) : 0
  const followers = new Set([...followerMap(p).values()].flat())
  const free = (m: Mass | undefined) => m !== undefined && !massIsLocked(p, m) && !followers.has(m.id) && !buildingOf(p, m).context
  const unitOf = unitsOf(p)
  const units = new Map<Id, Id[]>()
  const masses: Mass[] = []
  for (const m of massesOfOption(p, option)) {
    const unit = unitOf(m.id)
    // a unit goes as one, carried by its first mass, and only when every member is free
    if (unit[0] !== m.id || !unit.every((id) => free(massOf(p, id)))) continue
    units.set(m.id, unit)
    masses.push(m)
  }
  const leaderOf = new Map([...units].flatMap(([id, unit]) => unit.map((x) => [x, id] as const)))
  // the locks: a locked dimension holds the shape of the masses it is anchored to; by one end, it pins its mass
  const held = new Set<Id>()
  const pinned = new Set<Id>()
  for (const d of p.dimensions ?? []) {
    if (!d.locked) continue
    for (const k of [d.anchorA, d.anchorB]) if (k) held.add(k.massId)
    const one = (d.anchorA ?? d.anchorB)?.massId
    if (one && (d.anchorA === undefined) !== (d.anchorB === undefined) && leaderOf.has(one)) pinned.add(leaderOf.get(one)!)
  }
  const programOf = (m: Mass) => p.programs.find((x) => x.id === m.programId)
  const fixed = new Map(masses.flatMap((m) => (fixedSize(programOf(m)) ? [[m.id, fixedSize(programOf(m))!] as const] : [])))
  // a knob: a side of a mass alone, whose size neither a lock nor the brief fixes
  const knobs = on.has('dimension.length')
    ? (p.dimensions ?? []).filter((d) => {
        const id = d.anchorA?.massId
        return !d.locked && id !== undefined && d.anchorB?.massId === id && units.get(id)?.length === 1 && !held.has(id) && !fixed.has(id)
      })
    : []
  for (const d of knobs) held.add(d.anchorA!.massId)
  // a warehouse copy's shape is its type's
  for (const m of massesOfOption(p, option)) if (m.part !== undefined) held.add(m.id)

  const levelIds = new Set(masses.map((m) => m.levelId))
  const levels = option.buildingIds
    .flatMap((id) => p.buildings.find((x) => x.id === id && !x.context)?.levels ?? [])
    .filter((l) => levelIds.has(l.id) && !isBasement(l))
  const floorArea = new Map(
    masses.map((m) => {
      const g = programOf(m)?.target
      const repeat = levelIn(p, m.levelId)?.repeat ?? 1
      const own = footprintArea(m) * repeat
      return [m.id, g?.area && g.count ? g.area / g.count : own]
    }),
  )
  const aspect = new Map(masses.map((m) => [m.id, programAspect(programOf(m))]))
  // the circulation's: the gates that are not locked (a locked gate keeps every field: it is no variable), each along its boundary side, between
  // its two corners (the last side runs on to t 1); the buildings with masses
  const per = site.polygon ? perimeter(site.polygon) : 0
  const corners = site.polygon && site.polygon.length >= 3 ? vertexTs(site.polygon) : []
  const gates = gatesOf(p, option.id).flatMap((g, i) => {
    if (g.locked === true) return []
    // on a street's side: metres along that side, half its width from each end (the side is the gene's, `on.at` what it writes)
    if (g.on) {
      const r = gateSideOf(g, site.polygon, { streets: option.streets, existingRoads: p.site.existingRoads })
      return r ? [{ id: g.id, name: `Gate ${i + 1}`, from: 0, to: 0, length: r.side.length, margin: g.width / 2, on: { from: r.side.from } }] : []
    }
    if (g.t === undefined || per <= 0 || corners.length === 0) return []
    const k = corners.reduce((last, t, j) => (t <= g.t! + 1e-9 ? j : last), 0)
    const from = corners[k]
    const to = k + 1 < corners.length ? corners[k + 1] : 1
    return [{ id: g.id, name: `Gate ${i + 1}`, from, to, length: stretchLength(from, to) * per, margin: g.width / 2 }]
  })
  const built = new Set(massesOfOption(p, option).map((m) => buildingOfLevel(p, m.levelId)?.id))
  const buildings = option.buildingIds.flatMap((id) => p.buildings.filter((b) => b.id === id && !b.context && built.has(b.id)))
  // on the grid: where a mass's low corner may go, the rects whose width counts modules
  const inGrid = grid && pts.length ? pts.map((q) => toGrid(grid, q)) : []
  const gridArea = inGrid.length
    ? { minX: Math.min(...inGrid.map((q) => q.x)), minY: Math.min(...inGrid.map((q) => q.y)), maxX: Math.max(...inGrid.map((q) => q.x)), maxY: Math.max(...inGrid.map((q) => q.y)) }
    : { minX: 0, minY: 0, maxX: 0, maxY: 0 }
  const gridded = new Set(grid ? masses.filter((m) => rectOnGrid(grid, m.footprint)).map((m) => m.id) : [])
  return {
    option,
    active: on,
    axis,
    search: p.standards?.search ?? {},
    grid,
    gridArea,
    gridded,
    area: { minX: Math.floor(b.minX), minY: Math.floor(b.minY), maxX: Math.ceil(b.maxX), maxY: Math.ceil(b.maxY) },
    masses,
    units,
    levels,
    floorArea,
    aspect,
    fixed,
    held,
    pinned,
    knobs,
    gates,
    perimeter: per,
    buildings,
  }
}

const footprintArea = (m: Mass) => (m.footprint.kind === 'rect' ? m.footprint.width * m.footprint.depth : 0)
