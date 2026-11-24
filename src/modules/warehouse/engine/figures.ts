// A warehouse type's figures (Decision "Warehouse layout": its KPIs in the right panel), pure, from what it generates.
import { area } from '../../../engine/geom/polygon.ts'
import type { Generated } from './generate.ts'

export interface WarehouseFigures {
  /** m²: the footprint, its holes out (the hall's area: the same, Decision "Block shape"). */
  area: number
  hallArea: number
  /** m, column line to column line. */
  length: number
  width: number
  /** Whole bays each way, and the end bays (m; 0: none) at the start and the end of each. */
  bays: { x: number; y: number }
  ends: { x: [number, number]; y: [number, number] }
  columns: number
  docks: number
  doors: number
  /** The named pattern's marks. */
  marks: number
  /** m of wall, and its area (m², each stretch as tall as its part). */
  wallLength: number
  wallArea: number
  /** The outline's edges, its holes and its zones. */
  edges: number
  holes: number
  zones: number
  /** The bay cells its outline cuts (Phase D.2: the grid clipped by a free outline): how many, and their floor (m²). A bay count stays whole bays. */
  partialBays: number
  partialArea: number
}

/**
 * A block's figures. `built` false: its program is open ground (not built: no walls, columns or roof), so none of its
 * columns or walls are counted; its floor counts as it did.
 */
export function figuresOf(g: Generated, built = true): WarehouseFigures {
  const footprint = g.parts.reduce((s, p) => s + area(p.polygon) - p.holes.reduce((h, x) => h + area(x), 0), 0)
  const height = new Map(g.parts.map((p) => [p.part, p.height]))
  const len = (w: Generated['walls'][number]) => Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y)
  const count = (kind: string) => g.doors.filter((d) => d.kind === kind).length
  return {
    area: footprint,
    hallArea: footprint,
    length: g.runs.x.length,
    width: g.runs.y.length,
    bays: { x: g.runs.x.bays.filter((b) => !b.end).length, y: g.runs.y.bays.filter((b) => !b.end).length },
    ends: { x: [g.runs.x.start, g.runs.x.end], y: [g.runs.y.start, g.runs.y.end] },
    columns: built ? g.columns.length : 0,
    docks: count('dock'),
    doors: count('door'),
    marks: count('pattern'),
    wallLength: built ? g.walls.reduce((s, w) => s + len(w), 0) : 0,
    wallArea: built ? g.walls.reduce((s, w) => s + len(w) * (height.get(w.part) ?? 0), 0) : 0,
    edges: g.edges.length,
    holes: g.holes.length,
    zones: g.zones.length,
    partialBays: g.cells.filter((c) => !c.whole).length,
    partialArea: g.cells.filter((c) => !c.whole).reduce((s, c) => s + c.area, 0),
  }
}
