// The terrain library's files and this browser's shelf (Decision "Home libraries"), the block library's twin
// (io/blocks.ts): the terrains saved here under one key, each checked as it is read; a terrain's file (.gfs, all of it,
// read back as it was) and its DXF (for CAD: the boundary, the contours at their heights and the points, on GFIT-
// layers, in the file's own units and coordinates when the site came from one). GFit's own terrains ship with the app
// (views/home/terrainLibrary.ts puts both shelves together).
import {
  LibraryTerrainSchema,
  TERRAIN_FORMAT,
  TERRAIN_VERSION,
  type Id,
  type LibraryTerrain,
  type Point,
  type Site,
  type SiteRules,
} from '../model/schema.ts'
import { contourToPolygon } from '../engine/geom/contour.ts'
import { migrateSite } from '../model/migrate.ts'
import { heightsOf } from '../modules/terrain/engine/index.ts'
import { METRES } from './site/dxf.ts'

export const TERRAINS_KEY = 'gfit.terrains'

/** A terrain as it was saved, its site brought up to the one read today (Phase PE.2: a frontage becomes an existing street, as in a project of 19). */
function current(raw: unknown): unknown {
  const t = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null
  const site = t?.site && typeof t.site === 'object' && !Array.isArray(t.site) ? (t.site as Record<string, unknown>) : null
  return t && site ? { ...t, site: migrateSite(site, {}).site } : raw
}

function read(): LibraryTerrain[] {
  try {
    const raw = JSON.parse(localStorage.getItem(TERRAINS_KEY) ?? '[]') as unknown
    if (!Array.isArray(raw)) return []
    return raw.flatMap((t) => {
      const r = LibraryTerrainSchema.safeParse(current(t))
      return r.success ? [r.data] : []
    })
  } catch {
    return []
  }
}

function write(terrains: LibraryTerrain[]): boolean {
  try {
    localStorage.setItem(TERRAINS_KEY, JSON.stringify(terrains))
    return true
  } catch {
    return false
  }
}

export const browserTerrains = {
  list: read,
  /** Saves `t` in place of the one of its id (or beside the others); false when the storage is full or blocked. */
  save: (t: LibraryTerrain): boolean => write([...read().filter((x) => x.id !== t.id), t]),
  remove: (id: Id): boolean => write(read().filter((x) => x.id !== id)),
}

/** A new terrain's id: no other terrain of this browser's has it. */
export function newTerrainId(): Id {
  return `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}

/**
 * A site with no group on its existing streets: a group's id is the project's own (its members are things of that project), so it does not travel
 * with a street into a terrain, or from one into another project (Phase PE.2, review E9).
 */
function ungrouped<T extends Pick<Site, 'existingRoads'>>(site: T): T {
  if (!site.existingRoads?.some((r) => r.group !== undefined)) return site
  return { ...site, existingRoads: site.existingRoads.map(({ group: _group, ...road }) => road) }
}

/** A site as a library terrain: all of it but its rules, and the groups of its existing streets. */
export function terrainOf(site: Site, init: { id: Id; name: string; version?: number; savedAt?: number }): LibraryTerrain {
  const { rules: _, ...rest } = ungrouped(structuredClone(site))
  return { format: TERRAIN_FORMAT, formatVersion: TERRAIN_VERSION, id: init.id, name: init.name, version: init.version ?? 1, savedAt: init.savedAt ?? Date.now(), site: rest }
}

/** A library terrain as a project's site, under the project's own rules. */
export function siteOf(t: Pick<LibraryTerrain, 'site'>, rules: SiteRules): Site {
  return { ...ungrouped(structuredClone(t.site)), rules }
}

/** A terrain's file. */
export const TERRAIN_EXTENSION = 'gfs'

export function writeTerrainFile(t: LibraryTerrain): string {
  return `${JSON.stringify(t, null, 2)}\n`
}

export type TerrainRead = { ok: true; terrain: LibraryTerrain } | { ok: false; error: string }

/** A terrain's file read and checked: the terrain, or why it is not one. */
export function readTerrainFile(text: string): TerrainRead {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { ok: false, error: 'it is not JSON' }
  }
  const r = LibraryTerrainSchema.safeParse(current(raw))
  if (!r.success) return { ok: false, error: 'it is not a GFit terrain' }
  return { ok: true, terrain: r.data }
}

const segment = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'terrain'

/** A terrain's file name: its name, lower case, and `.gfs` (or another extension: `dxf`). */
export const terrainFileName = (t: Pick<LibraryTerrain, 'name'>, extension = TERRAIN_EXTENSION) => `${segment(t.name)}.${extension}`

/** The DXF's layers. */
export const DXF_LAYERS = { boundary: 'GFIT-BOUNDARY', contours: 'GFIT-CONTOURS', points: 'GFIT-POINTS' } as const

/** $INSUNITS of each unit. */
const INSUNITS = { in: 1, ft: 2, mm: 4, cm: 5, m: 6 } as const

const num = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(6).replace(/0+$/, ''))

/**
 * A terrain as an ASCII DXF, R12 (AC1009): the version every CAD opens with no tables, only the entities (an
 * LWPOLYLINE needs R2000 and its tables and handles, and AutoCAD may refuse it without them). The boundary a closed
 * POLYLINE (its arcs and rounded corners as short edges); each contour a 3D POLYLINE whose vertices are at the height
 * GFit shows it at (heightsOf: the one given it, else its file's, else counted; none: at 0); each point of the ground
 * a POINT. In the units and coordinates of the file the site came from (its frame), else in metres on the plan; the
 * header's $INSUNITS (an R2000 variable, which R12 readers pass over) says which for those that read it, GFit too.
 */
export function terrainDxf(t: Pick<LibraryTerrain, 'site'>): string {
  const { frame, boundary, terrain } = t.site
  const k = frame ? METRES[frame.units] : 1
  const o = frame?.origin ?? { x: 0, y: 0 }
  const at = (p: Point) => ({ x: (p.x + o.x) / k, y: (p.y + o.y) / k })
  const header = [9, '$ACADVER', 1, 'AC1009', 9, '$INSUNITS', 70, INSUNITS[frame?.units ?? 'm']]
  const out: (string | number)[] = [0, 'SECTION', 2, 'HEADER', ...header, 0, 'ENDSEC', 0, 'SECTION', 2, 'ENTITIES']
  /** A POLYLINE (66 1: its vertices follow), each corner a VERTEX, then SEQEND; `z`: a 3D polyline (70 has 8) at z. */
  const polyline = (layer: string, points: Point[], closed: boolean, z?: number) => {
    const d3 = z !== undefined
    out.push(0, 'POLYLINE', 8, layer, 66, 1, 10, 0, 20, 0, 30, 0, 70, (closed ? 1 : 0) | (d3 ? 8 : 0))
    for (const p of points.map(at)) out.push(0, 'VERTEX', 8, layer, 10, num(p.x), 20, num(p.y), 30, d3 ? num(z / k) : 0, 70, d3 ? 32 : 0)
    out.push(0, 'SEQEND', 8, layer)
  }
  if (boundary) polyline(DXF_LAYERS.boundary, contourToPolygon(boundary), true)
  const heights = terrain?.contours.length ? heightsOf(terrain).z : []
  terrain?.contours.forEach((c, i) => polyline(DXF_LAYERS.contours, c.points, !!c.closed, heights[i] ?? 0))
  for (const p of terrain?.points ?? []) {
    const q = at(p)
    out.push(0, 'POINT', 8, DXF_LAYERS.points, 10, num(q.x), 20, num(q.y), 30, num(p.z / k))
  }
  out.push(0, 'ENDSEC', 0, 'EOF')
  return `${out.join('\n')}\n`
}

