// What a template can aim at or require (Decisions "Optimizer plugin" and "Catalog"): a measure. Each module declares
// its own in its manifest (`measures`, in its measures.ts: the measures a search needs and the KPI strip does not show:
// how far from the brief and the rules, how far a truck goes, how much is broken, in m or m², so a broken design can be
// told "less broken"); the catalog adds every KPI as one (a KPI a later phase adds is an objective at once). All read a
// project and what derive() made of it, nothing else. Here: their shape, and what several of them share.
import { massesOfOption } from '../engine/buildings.ts'
import { regionsArea } from '../engine/geom/boolean.ts'
import { bounds, pointInPolygon } from '../engine/geom/polygon.ts'
import type { Area, KpiUnit } from '../engine/kpis.ts'
import type { Derived, DerivedMass } from '../engine/types.ts'
import type { DesignOption, Point, Polygon, Project } from '../model/schema.ts'

export type MeasureUnit = 'm' | KpiUnit

export interface Measure {
  id: string
  label: string
  unit: MeasureUnit
  help: string
  read(e: Evaluated): number
  /** It reads the roads or the circulation's Issues: a problem with one derives them on every specimen; one without
   *  derives the masses and the access alone (engine/derive.ts `withCirculation`), which is much faster. */
  flow?: true
  /** The area it belongs to (Decision "Areas"): the stage window groups its objectives by it. */
  area: Area
  /** Never an objective: *+ Objective* does not offer it (hidden, or a fixed rule); a saved stage that aims at it still resolves. */
  aim?: false
  /** A module's own measure: where the lists show it among the others, low first (a KPI as a measure has none: the
   *  KPIs come after, by module). */
  rank?: number
}

/** A project as one specimen stands, what derive() made of it, and what its problem read once. */
export interface Evaluated {
  project: Project
  derived: Derived
  ctx: MeasureContext
}

export interface MeasureContext {
  option: DesignOption
  /** The buildable area on a grid along the site's main axis (free-ground), made once per problem. */
  grid: Grid | null
}

/** Less than this, an area is a float's noise (m²). */
export const AREA_TOL = 0.01

/** The option's masses as derived, context ones too, each with an outline. */
export const optionMasses = (e: Evaluated): DerivedMass[] =>
  massesOfOption(e.project, e.ctx.option)
    .map((m) => e.derived.masses[m.id])
    .filter((m): m is DerivedMass => !!m && m.polygon.length >= 3)

// ---- The grid of free-ground ---------------------------------------------------------------------------------------

export interface Grid {
  origin: Point
  /** The axis's unit vectors: cells run along u (columns) and v (rows). */
  u: Point
  v: Point
  cell: number
  cols: number
  rows: number
  /** 1 where the cell's centre is buildable. */
  inside: Uint8Array
}

/** About this many cells over the buildable area, never smaller than 2 m. */
const GRID_CELLS = 6000

export function gridOf(buildable: Polygon[][], axis: number): Grid | null {
  const rings = buildable.flat()
  if (rings.length === 0) return null
  const a = (axis * Math.PI) / 180
  const u = { x: Math.cos(a), y: Math.sin(a) }
  const v = { x: -u.y, y: u.x }
  const local = rings.flat().map((q) => ({ x: q.x * u.x + q.y * u.y, y: q.x * v.x + q.y * v.y }))
  const b = bounds(local)
  const area = buildable.reduce((s, r) => s + regionsArea([r]), 0)
  const cell = Math.max(2, Math.sqrt(area / GRID_CELLS))
  const cols = Math.max(1, Math.ceil((b.maxX - b.minX) / cell))
  const rows = Math.max(1, Math.ceil((b.maxY - b.minY) / cell))
  const origin = { x: b.minX * u.x + b.minY * v.x, y: b.minX * u.y + b.minY * v.y }
  const grid: Grid = { origin, u, v, cell, cols, rows, inside: new Uint8Array(cols * rows) }
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const q = cellCentre(grid, c, r)
      // a region is [outer, ...holes]
      grid.inside[r * cols + c] = buildable.some((reg) => pointInPolygon(q, reg[0]) && !reg.slice(1).some((h) => pointInPolygon(q, h))) ? 1 : 0
    }
  return grid
}

function cellCentre(g: Grid, c: number, r: number): Point {
  const s = (c + 0.5) * g.cell
  const t = (r + 0.5) * g.cell
  return { x: g.origin.x + g.u.x * s + g.v.x * t, y: g.origin.y + g.u.y * s + g.v.y * t }
}

/** The largest rectangle of free cells (m²): the cells inside, minus those under `blocked`, by the histogram method. */
export function largestFree(g: Grid, blocked: Polygon[]): number {
  const free = g.inside.slice()
  for (const poly of blocked) {
    const local = poly.map((q) => ({ x: (q.x - g.origin.x) * g.u.x + (q.y - g.origin.y) * g.u.y, y: (q.x - g.origin.x) * g.v.x + (q.y - g.origin.y) * g.v.y }))
    const b = bounds(local)
    const c0 = Math.max(0, Math.floor(b.minX / g.cell))
    const c1 = Math.min(g.cols - 1, Math.floor(b.maxX / g.cell))
    const r0 = Math.max(0, Math.floor(b.minY / g.cell))
    const r1 = Math.min(g.rows - 1, Math.floor(b.maxY / g.cell))
    for (let r = r0; r <= r1; r++)
      for (let c = c0; c <= c1; c++) if (free[r * g.cols + c] && pointInPolygon(cellCentre(g, c, r), poly)) free[r * g.cols + c] = 0
  }
  const heights = Array.from({ length: g.cols }, () => 0)
  let best = 0
  for (let r = 0; r < g.rows; r++) {
    for (let c = 0; c < g.cols; c++) heights[c] = free[r * g.cols + c] ? heights[c] + 1 : 0
    const stack: number[] = []
    for (let c = 0; c <= g.cols; c++) {
      const h = c === g.cols ? 0 : heights[c]
      while (stack.length && heights[stack[stack.length - 1]] >= h) {
        const top = heights[stack.pop()!]
        const left = stack.length ? stack[stack.length - 1] + 1 : 0
        best = Math.max(best, top * (c - left))
      }
      stack.push(c)
    }
  }
  return best * g.cell * g.cell
}

/** A measure's value in metres (or what stands for them), so constraints of different units can be summed. */
export function inMetres(unit: MeasureUnit, v: number): number {
  if (v <= 0) return 0
  if (unit === 'm2') return Math.sqrt(v)
  if (unit === 'm3') return Math.cbrt(v)
  if (unit === 'pct') return v * 100
  if (unit === 'count') return v * 10
  return v
}
