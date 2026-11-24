// What a CAD plan carries (Phase DX.2; specs docs/superpowers/specs/2026-11-09-dxf-export-design.md and, DI,
// 2026-11-09-dxf-interior-and-paving-design.md), pure: the asked option cut at its floor, not seen as a roof (the
// drafters edit the interior in CAD), as entities on the AIA/NCS layers of the specs' table, each with its lineweight,
// linetype and colour (every entity ByLayer). JSON in, JSON out: io/exportDxf.ts writes it as DXF; a PDF plan could
// read it too.
//   blocks     a block whose program is built, cut (planInterior.ts), while its hall is still the outline its type
//              makes (moved or turned, never reshaped): its walls' bands on A-WALL, its columns on S-COLS, its zones of
//              other programs on A-AREA with name, program and area on A-AREA-IDEN, its column lines on A-GRID past
//              its box with a bubble and the name at both ends on A-GRID-IDEN, its module lines cut to inside the
//              walls on A-GRID-MODL; no project-wide grid
//   masses     any other mass's outline (arcs kept), on A-WALL when its program is built, else A-AREA-OTLN, its holes
//              too; every mass's label of three lines at its centroid (where the plan writes its name): name, program,
//              area
//   docks      each dock door a rectangle on its wall, out of it; a block's level doors and patterns a line across them
//   paving     one outline with its holes on C-ROAD (DI.2, planPaving.ts): the streets, the existing roads, the
//              truck courts and the approaches unioned, trimmed where they meet, the
//              inside corners near where streets meet rounded as arcs (curb returns) cut short of the stalls, lots
//              and buildings by them; each street's centreline on C-ROAD-CNTR, each existing road's on C-ROAD-EXST;
//              the lines between their lanes (a road of two lanes or more) on C-ROAD-STRP, open, as the centreline is
//   lots       each parking lot's outline; every stall (the lots' and the roads')
//   dims       the dimensions drawn on the option's levels
//   guides     (AS.5) every reference line of the project, an open polyline on A-ANNO-REFR (dashed); each note on the option's
//              levels on A-ANNO-NOTE, TEXT_M high, left-aligned from its point at its angle, a text per line of its text, each
//              line 1.5 text heights below the last along the note's own down (as a label's lines stand); hidden ones too
//   site       the boundary (arcs kept), the buildable line, the parcels
//   contours   each one whose height is known, at it: every fifth interval major
// 3D (`threeD`, DX.4): masses rise from their base (their platform's level, else the site's mean ground) by their
// height (`thickness`); contours and the roads' centrelines are 3D polylines at their z; a block's interior (DI.3)
// stands on the block's base (its mass's floors[0], else the ground): its walls and columns extruded to its mass's
// height, its zones, names, axes, bubbles and module lines flat there; the rest stands on the site's mean ground, the
// paving with its courts, labels, door lines and the dimensions (their `elevation`; absent in 2D, where everything is
// at 0).
//   drawings   each imported drawing's reference layers, on layers of their own (`X-<file>-<layer>`)
// Coordinates: where they were in the survey (Decision "Site file survey": the plan's point + the frame's origin), in
// the project's units (Decision "Project units"): everything stored in metres converts here, at the edge.
import type { Contour, Footprint, Id, Point, Polygon, Project } from '../model/schema.ts'
import { noteLines } from '../engine/annotations.ts'
import { buildingOf, massesOfOption, optionBuildings, optionOf } from '../engine/buildings.ts'
import { footprintPolygon } from '../engine/geom/footprint.ts'
import { centroid } from '../engine/geom/polygon.ts'
import { contourSegments, isArc } from '../engine/geom/segments.ts'
import { laneLines } from '../engine/path/lanes.ts'
import { courtShapes, type Derived } from '../engine/types.ts'
import { unitsOf } from '../engine/units.ts'
import { heightsOf, surfaceOf } from '../modules/terrain/engine/index.ts'
import { copyGenerated, onPlace, partFootprint, placeOf, type Place } from '../modules/warehouse/engine/copies.ts'
import type { Generated } from '../modules/warehouse/engine/generate.ts'
import { outwardOf } from '../modules/warehouse/engine/shape.ts'
import { modelOf } from './exportModel.ts'
import { blockInterior, type BlockInterior } from './planInterior.ts'
import { pavingRings } from './planPaving.ts'
import { METRES } from './site/dxf.ts'

export type PlanUnit = 'm' | 'ft'

export interface LayerStyle {
  /** mm */
  weight: number
  linetype: 'CONTINUOUS' | 'CENTER' | 'DASHED' | 'PHANTOM' | 'DIVIDE'
  /** AutoCAD Color Index */
  color: number
}

const style = (weight: number, linetype: LayerStyle['linetype'], color: number): LayerStyle => ({ weight, linetype, color })

/** The spec's table, in its order; `X-<file>-<layer>` ones are added per drawing. */
export const PLAN_LAYERS: Record<string, LayerStyle> = {
  // the palette the user approved in AutoCAD (2026-11-09): white for what is built and cut, one muted hue per family
  // (ACI only: R2000 has no true colour), the lineweights carrying a monochrome plot
  'A-WALL': style(0.5, 'CONTINUOUS', 7),
  'S-COLS': style(0.35, 'CONTINUOUS', 7),
  'A-AREA': style(0.25, 'DASHED', 201),
  'A-AREA-IDEN': style(0.18, 'CONTINUOUS', 201),
  'A-AREA-OTLN': style(0.25, 'CONTINUOUS', 9),
  'A-DOOR-DOCK': style(0.35, 'CONTINUOUS', 31),
  'A-DOOR': style(0.25, 'CONTINUOUS', 33),
  'A-GRID': style(0.13, 'CENTER', 153),
  'A-GRID-IDEN': style(0.18, 'CONTINUOUS', 153),
  'A-GRID-MODL': style(0.09, 'CONTINUOUS', 155),
  'A-ANNO-DIMS': style(0.18, 'CONTINUOUS', 51),
  'A-ANNO-TEXT': style(0.18, 'CONTINUOUS', 7),
  // AS.5: the reference lines (dashed, quiet: a guide) and the notes (text as the labels'), both drawn by hand
  'A-ANNO-REFR': style(0.13, 'DASHED', 8),
  'A-ANNO-NOTE': style(0.18, 'CONTINUOUS', 7),
  'C-PROP': style(0.7, 'PHANTOM', 11),
  'C-PROP-SETB': style(0.25, 'DASHED', 13),
  'C-PROP-LOTS': style(0.35, 'DIVIDE', 213),
  'C-TOPO-MAJR': style(0.25, 'CONTINUOUS', 33),
  'C-TOPO-MINR': style(0.13, 'CONTINUOUS', 35),
  'C-ROAD': style(0.35, 'CONTINUOUS', 254),
  'C-ROAD-CNTR': style(0.13, 'CENTER', 253),
  'C-ROAD-EXST': style(0.25, 'DASHED', 8),
  // PE.2: the dividers between a road's lanes, quiet and dashed (a street's and an existing street's)
  'C-ROAD-STRP': style(0.13, 'DASHED', 252),
  'C-PKNG-STRP': style(0.13, 'CONTINUOUS', 123),
  'C-PKNG-OTLN': style(0.35, 'CONTINUOUS', 123),
}

/** An imported drawing's reference layer: thin, continuous, in its own colour (8 when its file gave none). */
const REFERENCE = { weight: 0.13, linetype: 'CONTINUOUS' as const, color: 8 }

/**
 * An entity of the plan, in the output's coordinates and unit. `poly`: `bulges[i]` belongs to the edge
 * points[i] → points[i+1] (0 when straight), in DXF's sign (counter-clockwise positive; GFit's contours bulge the other
 * way, engine/geom/contour.ts). `text`: `at` is its baseline's start (left) or middle (center); `angle` turns it counter-clockwise
 * about `at`, in degrees (absent: 0, as the labels are). `elevation` of `line`,
 * `circle`, `text` and `dim`: the z they stand at, in the output unit; set in a 3D plan only (absent: 0).
 */
export type PlanEntity =
  | { kind: 'poly'; layer: string; points: Point[]; bulges: number[]; closed: boolean; elevation: number; thickness: number }
  | { kind: 'poly3d'; layer: string; points: { x: number; y: number; z: number }[]; closed: boolean }
  | { kind: 'line'; layer: string; a: Point; b: Point; elevation?: number }
  | { kind: 'circle'; layer: string; c: Point; r: number; elevation?: number }
  | { kind: 'text'; layer: string; at: Point; height: number; text: string; align: 'left' | 'center'; angle?: number; elevation?: number }
  | { kind: 'dim'; layer: string; a: Point; b: Point; line: Point /* a point on the dimension line */; text: string; elevation?: number }

export interface PlanExport {
  name: string
  units: PlanUnit
  threeD: boolean
  layers: Record<string, LayerStyle>
  entities: PlanEntity[]
}

/** m: text height, 2.5 mm × $DIMSCALE 200 (TEXT does not follow $DIMSCALE). */
export const TEXT_M = 0.5

/** m: a dock door's width along its wall (the standards have none) and how far its mark stands out of the wall. */
const DOCK_DOOR = 3.0
const DOCK_OUT = 0.6

/** A layer name CAD takes: the characters it refuses (`< > / \ " : ; ? * | , = \``) become `_`, letters stay. */
export function cadLayerName(s: string): string {
  return s.replace(/[<>/\\":;?*|,=`]/g, '_')
}

/** A whole number with a comma every thousand: 12,345. */
const thousands = (n: number): string => {
  const r = Math.round(n)
  return (r < 0 ? '-' : '') + String(Math.abs(r)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

/** A file's name without its folders and its extension: `C:\a\survey.dwg` → `survey`. */
const baseName = (file: string): string => {
  const name = file.split(/[\\/]/).pop() ?? file
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(0, dot) : name
}

/** A closed contour as a polyline's corners and bulges (DXF's sign): rounded corners and arc edges stay arcs. */
function contourPoly(c: Contour): { points: Point[]; bulges: number[] } {
  const points: Point[] = []
  const bulges: number[] = []
  for (const s of contourSegments(c)) {
    points.push(s.a)
    if (!isArc(s)) {
      bulges.push(0)
      continue
    }
    // bulge = tan(θ/4) = sagitta / half chord; the arc's middle to the left of a → b is clockwise from a, DXF's negative
    const l = Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y)
    const left = { x: -(s.b.y - s.a.y) / l, y: (s.b.x - s.a.x) / l }
    const sagitta = (s.m.x - (s.a.x + s.b.x) / 2) * left.x + (s.m.y - (s.a.y + s.b.y) / 2) * left.y
    bulges.push(l > 0 ? (-2 * sagitta) / l : 0)
  }
  return { points, bulges }
}

/** The contours' interval: the most common step between consecutive heights (0.01 m), null with fewer than two. */
function intervalOf(zs: number[]): number | null {
  const sorted = [...new Set(zs)].sort((a, b) => a - b)
  const steps = new Map<number, number>()
  for (let k = 1; k < sorted.length; k++) {
    const step = Math.round((sorted[k] - sorted[k - 1]) * 100) / 100
    if (step > 0) steps.set(step, (steps.get(step) ?? 0) + 1)
  }
  let best: number | null = null
  for (const [step, n] of steps) if (best === null || n > steps.get(best)! || (n === steps.get(best)! && step < best)) best = step
  return best
}

const multipleOf = (z: number, step: number) => Math.abs(z / step - Math.round(z / step)) < 1e-6

const unit = (a: Point, b: Point): Point => {
  const l = Math.hypot(b.x - a.x, b.y - a.y)
  return l > 0 ? { x: (b.x - a.x) / l, y: (b.y - a.y) / l } : { x: 0, y: 0 }
}

/** m: a hall's corner farther than this from where its type makes it, at the place read from the hall, is reshaped. */
const SAME_HALL = 1e-3

/**
 * Where a block stands, read from its hall as it is on the plan (moved or turned since it was made), as placeFromHall
 * reads it but from the copy already made (`g`); and only while that hall is still the outline its type makes there,
 * corner by corner: placeOf reads a place from any outline with as many corners (a hall stretched by an edit or the
 * agent), where its type's walls and columns no longer fit. Null: no place, a plain mass.
 */
function hallPlace(g: Generated, hall: Footprint): Place | null {
  const made = g.parts.find((x) => x.part === 'hall')
  if (!made) return null
  const local = footprintPolygon(partFootprint(made.polygon, { x: 0, y: 0, angle: 0 }))
  const site = footprintPolygon(hall)
  const place = placeOf(local, site)
  if (!place) return null
  const fits = local.every((q, i) => {
    const r = onPlace(place, q)
    return Math.hypot(r.x - site[i].x, r.y - site[i].y) <= SAME_HALL
  })
  return fits ? place : null
}

export function planOf(p: Project, d: Derived, opts: { threeD: boolean }): PlanExport {
  const units = unitsOf(p)
  const k = METRES[units]
  const origin = p.site.frame?.origin ?? { x: 0, y: 0 }
  /** A plan point (m) where it was in the survey, in the output unit; a length, a height. */
  const at = (q: Point): Point => ({ x: (q.x + origin.x) / k, y: (q.y + origin.y) / k })
  const len = (v: number) => v / k

  const option = optionOf(p, d.option)
  const model = modelOf(p, d, 'geometry')
  // 3D: what has no height of its own stands on the site's mean ground (as modelOf's site, else its terrain's middle)
  const surface = p.site.terrain ? surfaceOf(p.site.terrain) : null
  const ground = !opts.threeD ? 0 : (model.site?.z ?? (surface ? (surface.min + surface.max) / 2 : 0))

  const layers: Record<string, LayerStyle> = { ...PLAN_LAYERS }
  const entities: PlanEntity[] = []
  const poly = (layer: string, points: Point[], closed: boolean, bulges?: number[], elevation = ground, thickness = 0) => {
    if (points.length < 2) return
    entities.push({ kind: 'poly', layer, points: points.map(at), bulges: bulges ?? points.map(() => 0), closed, elevation: len(elevation), thickness: len(thickness) })
  }
  /** A 3D polyline: z in the output unit like a length; the frame's origin moves x and y only. */
  const poly3d = (layer: string, points: { x: number; y: number; z: number }[], closed: boolean) => {
    if (points.length < 2) return
    entities.push({ kind: 'poly3d', layer, points: points.map((q) => ({ ...at(q), z: len(q.z) })), closed })
  }
  const outline = (layer: string, c: Contour, elevation = ground, thickness = 0) => {
    const { points, bulges } = contourPoly(c)
    poly(layer, points, true, bulges, elevation, thickness)
  }
  const ring = (layer: string, r: Polygon, elevation = ground, thickness = 0) => r.length >= 3 && poly(layer, r, true, undefined, elevation, thickness)
  /** The z of a flat entity (line, circle, text, dimension): `z` (default the ground) in 3D, absent in 2D. */
  const flatZ = (z = ground) => (opts.threeD ? { elevation: len(z) } : {})
  const line = (layer: string, a: Point, b: Point, z = ground) => entities.push({ kind: 'line', layer, a: at(a), b: at(b), ...flatZ(z) })
  const text = (layer: string, q: Point, s: string, z = ground) =>
    entities.push({ kind: 'text', layer, at: at(q), height: len(TEXT_M), text: s, align: 'center', ...flatZ(z) })

  // the site: its boundary, the buildable line, the parcels
  if (p.site.boundary) outline('C-PROP', p.site.boundary)
  for (const r of model.site?.buildable ?? []) ring('C-PROP-SETB', r)
  for (const parcel of p.site.parcels ?? []) outline('C-PROP-LOTS', parcel.contour)

  // the contours whose height is known, at it (2D: a polyline at its elevation; 3D: a 3D polyline)
  const terrain = p.site.terrain
  if (terrain) {
    const heights = heightsOf(terrain).z
    const known = terrain.contours.flatMap((c, i) => (heights[i] === null || heights[i] === undefined ? [] : [{ c, z: heights[i]! }]))
    const interval = intervalOf(known.map((x) => x.z))
    for (const { c, z } of known) {
      const layer = interval !== null && multipleOf(z, 5 * interval) ? 'C-TOPO-MAJR' : 'C-TOPO-MINR'
      if (opts.threeD) poly3d(layer, c.points.map((q) => ({ ...q, z })), !!c.closed)
      else poly(layer, c.points, !!c.closed, undefined, z)
    }
  }

  // the imported drawings' reference layers
  const spellings = new Map(Object.keys(layers).map((n) => [n.toLowerCase(), n]))
  for (const drawing of p.site.drawings ?? []) {
    const file = baseName(drawing.file)
    for (const l of drawing.layers) {
      // CAD names are case-insensitive: the first spelling serves every layer that differs only in case
      const spelled = cadLayerName(`X-${file}-${l.name}`)
      const name = spellings.get(spelled.toLowerCase()) ?? spelled
      if (!spellings.has(name.toLowerCase())) {
        spellings.set(name.toLowerCase(), name)
        layers[name] = { ...REFERENCE, color: l.color ?? REFERENCE.color }
      }
      for (const x of l.lines) poly(name, x.points, !!x.closed)
    }
  }

  // the one paving (DI.2): streets, existing roads, courts and approaches unioned, curb returns as
  // arcs, each cut short of the stalls, lots and buildings that stand by it (a return is never drawn across them)
  const paving = pavingRings({
    roads: d.circulation.roads.map((r) => ({ points: r.points, width: r.width, radius: r.radius })),
    areas: [...d.circulation.docks.flatMap(courtShapes), ...d.circulation.approaches],
    blockers: [...d.circulation.stalls.map((s) => [s]), ...d.circulation.lots.map((l) => [l.polygon]), ...model.masses.map((m) => [m.polygon, ...m.holes])],
  })
  for (const r of paving) if (r.points.length >= 3) poly('C-ROAD', r.points, true, r.bulges)
  // each street's centreline, each existing road's (open; 3D at the heights its grading gives it)
  for (const r of model.roads) {
    const layer = r.name === 'Street' ? 'C-ROAD-CNTR' : 'C-ROAD-EXST'
    if (opts.threeD) poly3d(layer, r.centre, false)
    else poly(layer, r.centre, false)
    // the lines between its lanes: its centre line shifted to where the lanes meet (offsetLine keeps the points, so each keeps its height)
    if (r.lanes.length > 1) {
      for (const line of laneLines(r.centre.map(({ x, y }) => ({ x, y })), r.left, r.right, r.lanes)) {
        if (opts.threeD) poly3d('C-ROAD-STRP', line.map((q, i) => ({ ...q, z: r.centre[i].z })), false)
        else poly('C-ROAD-STRP', line, false)
      }
    }
  }
  // the lots and every stall (the lots' and the roads')
  for (const lot of d.circulation.lots) {
    ring('C-PKNG-OTLN', lot.polygon)
    for (const s of lot.stalls) ring('C-PKNG-STRP', s)
  }
  for (const s of d.circulation.stalls) ring('C-PKNG-STRP', s)

  /** An area in the output's unit: 12,345 m². */
  const areaText = (m2: number) => `${thousands(m2 / (k * k))} ${units}²`
  /** Three lines centred on `c`; a blank one writes no TEXT, the others keep their place. */
  const label = (layer: string, c: Point, lines: string[], z = ground) =>
    lines.forEach((s, i) => {
      if (s.trim() !== '') text(layer, { x: c.x, y: c.y + (1 - i) * 1.5 * TEXT_M - TEXT_M / 2 }, s, z)
    })

  // the blocks: each hall of a copy, made once, where its hall stands now (moved or turned since it was made); a hall
  // no longer the outline its type makes there has no place: a plain mass, no interior, no doors (hallPlace)
  const blocks = new Map<Id, { g: Generated; place: Place }>()
  for (const m of massesOfOption(p, option)) {
    const copy = m.part === 'hall' ? buildingOf(p, m).warehouse : undefined
    const t = copy && p.warehouseTypes?.find((x) => x.id === copy.type)
    if (!copy || !t) continue
    const g = copyGenerated(t, copy)
    const place = hallPlace(g, m.footprint)
    if (place) blocks.set(m.id, { g, place })
  }
  // cut at their floor: those whose program is built
  const built = new Map(model.masses.map((m) => [m.id, m.built]))
  const interiors = new Map<Id, BlockInterior>()
  for (const [id, { g, place }] of blocks) if (built.get(id)) interiors.set(id, blockInterior(g, place))
  const programName = new Map(p.programs.map((g) => [g.id, g.name]))
  // 3D: walls and columns rise from the block's base (its mass's floors[0]) by its height; everything else stands at the base
  const cut = (block: BlockInterior, base: number, height: number) => {
    for (const r of block.walls) for (const x of r) ring('A-WALL', x, base, height)
    for (const c of block.columns) ring('S-COLS', c, base, height)
    for (const z of block.zones) {
      for (const r of z.regions) for (const x of r) ring('A-AREA', x, base)
      label('A-AREA-IDEN', z.at, [z.name ?? '', (z.program && programName.get(z.program)) || 'No program', areaText(z.area)], base)
    }
    // each axis from bubble to bubble, a bubble beyond each end with its name
    const bubble = 1.5 * TEXT_M
    for (const l of block.axes) {
      line('A-GRID', l.a, l.b, base)
      const u = unit(l.a, l.b)
      for (const c of [
        { x: l.a.x - u.x * bubble, y: l.a.y - u.y * bubble },
        { x: l.b.x + u.x * bubble, y: l.b.y + u.y * bubble },
      ]) {
        entities.push({ kind: 'circle', layer: 'A-GRID-IDEN', c: at(c), r: len(bubble), ...flatZ(base) })
        text('A-GRID-IDEN', { x: c.x, y: c.y - TEXT_M / 2 }, l.name, base)
      }
    }
    for (const [a, b] of block.modules) poly('A-GRID-MODL', [a, b], false, undefined, base)
  }

  // the masses: a block cut, any other its outline seen from above and its holes; each its label
  for (const m of model.masses) {
    // 3D: from its base (floors[0]) up, as thick as it is tall
    const base = opts.threeD ? (m.floors[0] ?? ground) : 0
    const height = opts.threeD ? m.height : 0
    const inside = interiors.get(m.id)
    if (inside) cut(inside, base, height)
    else {
      const layer = m.built ? 'A-WALL' : 'A-AREA-OTLN'
      outline(layer, m.contour, base, height)
      // its holes as drawn (arcs kept); Derived's polygons (arcs as chords) only for a mass with none of its own
      const own = p.masses.find((x) => x.id === m.id)?.holes ?? []
      if (own.length > 0) for (const h of own) outline(layer, h, base, height)
      else for (const h of m.holes) if (h.length >= 3) poly(layer, h, true, undefined, base, height)
    }
    label('A-ANNO-TEXT', centroid(m.polygon), [m.name, m.program, areaText(m.area)])
  }

  // the docks: a door's mark on its wall, out of it
  for (const dock of d.circulation.docks) {
    const u = unit(dock.a, dock.b)
    const half = { x: (u.x * DOCK_DOOR) / 2, y: (u.y * DOCK_DOOR) / 2 }
    const out = { x: dock.out.x * DOCK_OUT, y: dock.out.y * DOCK_OUT }
    for (const q of dock.doors) {
      const a = { x: q.x - half.x, y: q.y - half.y }
      const b = { x: q.x + half.x, y: q.y + half.y }
      poly('A-DOOR-DOCK', [a, b, { x: b.x + out.x, y: b.y + out.y }, { x: a.x + out.x, y: a.y + out.y }], true)
    }
  }

  // a block's level doors and patterns (its docks are the docks' doors above): a line across each, where its type puts
  // it at the block's place (none for a hall that has none)
  for (const [id, { g, place }] of blocks) {
    if (!d.masses[id] || d.masses[id].polygon.length < 3) continue
    for (const door of g.doors) {
      if (door.kind === 'dock') continue
      const n = outwardOf(door.side)
      const half = { x: (Math.abs(n.y) * door.width) / 2, y: (Math.abs(n.x) * door.width) / 2 }
      line('A-DOOR', onPlace(place, { x: door.at.x - half.x, y: door.at.y - half.y }), onPlace(place, { x: door.at.x + half.x, y: door.at.y + half.y }))
    }
  }

  // the dimensions drawn on the option's levels: the line `offset` to the left of a → b, the length in the output unit
  const levels = new Set(optionBuildings(p, option).flatMap((b) => b.levels.map((l) => l.id)))
  for (const x of p.dimensions ?? []) {
    if (!levels.has(x.levelId)) continue
    const length = Math.hypot(x.b.x - x.a.x, x.b.y - x.a.y)
    if (!(length > 0)) continue
    const u = unit(x.a, x.b)
    const lineAt = { x: x.a.x - u.y * x.offset, y: x.a.y + u.x * x.offset }
    entities.push({ kind: 'dim', layer: 'A-ANNO-DIMS', a: at(x.a), b: at(x.b), line: at(lineAt), text: len(length).toFixed(2), ...flatZ() })
  }

  // the reference lines: the project's, so every one, open, flat at the ground as the dimensions and the site's lines are
  for (const r of p.referenceLines ?? []) poly('A-ANNO-REFR', r.points, false)
  // the notes on the option's levels: a TEXT per line, left-aligned from the note's point at its angle; the next line one
  // line step (a label's, 1.5 text heights) down the note's own down, (sin a, −cos a), so a turned note stays stacked square
  // to its text; a blank line writes nothing and the others keep their place. Its size on the plan does not change the CAD height.
  for (const n of p.notes ?? []) {
    if (!levels.has(n.levelId)) continue
    const angle = n.angle ?? 0
    const down = { x: Math.sin((angle * Math.PI) / 180), y: -Math.cos((angle * Math.PI) / 180) }
    noteLines(n.text).forEach((s, i) => {
      if (s.trim() === '') return
      const step = i * 1.5 * TEXT_M
      entities.push({ kind: 'text', layer: 'A-ANNO-NOTE', at: at({ x: n.at.x + down.x * step, y: n.at.y + down.y * step }), height: len(TEXT_M), text: s, align: 'left', angle, ...flatZ() })
    })
  }

  return { name: p.name, units, threeD: opts.threeD, layers, entities }
}
