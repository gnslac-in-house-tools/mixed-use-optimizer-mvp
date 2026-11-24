// A drawing surveyed (Decision "Site file survey"), pure: what each layer holds and a guess of what it is, by its name
// and what it has; then the layers the designer chose read in one frame: the boundary's candidates, the contours and
// the points of the ground, where they land on the plan, and the frame and the georeference they bring.
//   local   moved so the middle of what was chosen sits at the plan's origin; no georeference
//   utm     the same, and the georeference its zone gives that middle; a file with no boundary chosen, on a site that
//           has a georeference but no frame (its boundary from a KML, or drawn), lands through that georeference
//   site    in the site's frame: another file of the same coordinates (any units) lands on the site's
import { contourToPolygon } from '../../engine/geom/contour.ts'
import { area, bounds, type Bounds } from '../../engine/geom/polygon.ts'
import { toPlan } from '../../engine/geo/local.ts'
import { fromUtm, trueNorthOnGrid } from '../../engine/geo/utm.ts'
import type { Contour, ContourLine, Geo, GroundPoint, Point, Site, SiteDrawing, SiteFrame } from '../../model/schema.ts'
import { METRES, strokeOf, type DrawnLine, type DxfDrawing, type LengthUnit, type Pt3 } from './dxf.ts'
import type { Candidate } from './place.ts'

/** What a layer is: `roads` are the site's existing roads, by their centrelines (Decision "Survey points and roads");
 *  `parcels`, closed shapes inside the site, `reference`, lines kept as drawn (Decision "Drawing layers"); `ignore`, a
 *  layer deleted from the import (the survey window's Delete). */
export const LAYER_KINDS = ['boundary', 'parcels', 'contours', 'points', 'roads', 'reference', 'ignore'] as const
export type LayerKind = (typeof LAYER_KINDS)[number]

/** What a drawing brought only for its references may be (Decision "Drawing layers"). */
export const REFERENCE_KINDS: readonly LayerKind[] = ['reference', 'parcels', 'ignore']

export interface LayerSurvey {
  name: string
  /** Closed shapes: the boundary can be one. */
  shapes: number
  /** Polylines and lines, as drawn. */
  lines: number
  /** Arcs and circles: a reference's lines too. */
  curves: number
  /** Points of the ground: POINTs, blocks at a height, a TIN's corners. */
  points: number
  texts: number
  /** Its texts that are a number: spot heights, points of the ground as a Points layer. */
  labels: number
  /** The heights of its lines and points, in the drawing's units; null: none, or all at 0 (drawn flat). */
  heights: { min: number; max: number } | null
  guess: LayerKind
}

/** A layer's name without accents or case, so "Límite" reads as "limite". */
const plain = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()

/** What a layer's name says it is, the first that matches (points before contours: "PUNTOS_TOPO" is points). */
const NAMES: [LayerKind, RegExp][] = [
  // parcels before the boundary: "AUX-BOUNDARY", "SUBDIVISION" are the parcels inside it
  ['parcels', /sub.?div|sub.?parcel|sub.?lote|fraccion|lotific|manzana|(^|[^a-z])aux([^a-z]|$)/],
  ['boundary', /poligonal|lindero|predio|limite|boundary|parcel|property|lote/],
  ['points', /punto|pto|pts|levantamiento|survey|point|spot|tin|cota|elev/],
  ['roads', /(^|[^a-z])(ejes?|cntr|centerline|centreline|eje de via)([^a-z]|$)/],
  ['contours', /curva|contour|topo|nivel|isolin|(^|[^a-z])cn([^a-z]|$)/],
]

/** Does the layer hold what the kind needs (a closed shape, a line; points, a 3D line's corners or spot heights)? */
export function canBe(l: Pick<LayerSurvey, 'shapes' | 'lines' | 'points' | 'labels'> & { curves?: number }, kind: LayerKind): boolean {
  if (kind === 'boundary' || kind === 'parcels') return l.shapes > 0
  if (kind === 'reference') return l.lines + l.shapes + (l.curves ?? 0) > 0
  if (kind === 'contours' || kind === 'roads') return l.lines > 0
  if (kind === 'points') return l.points > 0 || l.lines > 0 || l.labels > 0
  return true
}

/** A layer of annotations ("C-TOPO-TEXT", "TEXTO_CURVAS", "C-TOPO-LABL"): its leaders are no contours, its frames no boundary. */
const ANNOTATION = /(^|[^a-z])(text|txt|texto|textos|labl|label|labels|anno|anot|notas?)([^a-z]|$)/

/** A guess by the name, if the layer holds what that kind needs; else Ignore (a layer of annotations too). */
export function guessKind(l: Omit<LayerSurvey, 'guess'>): LayerKind {
  const name = plain(l.name)
  if (ANNOTATION.test(name)) return 'ignore'
  return NAMES.find(([kind, re]) => re.test(name) && (kind === 'points' ? l.points + l.labels > 0 : canBe(l, kind)))?.[0] ?? 'ignore'
}

/**
 * Every layer of the drawing with what it holds and its guess; those guessed something first, then by name. When no
 * name says Boundary, the layers with closed shapes not guessed something else are (as before the survey: any closed
 * shape may be the boundary, clicked on the plan). A layer still guessed nothing, of lines, that lies round what was
 * guessed is a Reference (Decision "Drawing layers": a title block far off is not).
 */
export function surveyLayers(d: DxfDrawing): LayerSurvey[] {
  const names = new Set([
    ...d.shapes.map((s) => s.layer),
    ...d.lines.map((l) => l.layer),
    ...d.curves.map((l) => l.layer),
    ...d.points.map((p) => p.layer),
    ...Object.keys(d.texts),
  ])
  const rank = (k: LayerKind) => LAYER_KINDS.indexOf(k)
  const layers = [...names].map((name) => {
    const zs = [...d.lines.filter((l) => l.layer === name).flatMap((l) => l.points.map((p) => p.z)), ...d.points.filter((p) => p.layer === name).map((p) => p.z)]
    const flat = zs.every((z) => z === 0)
    const l = {
      name,
      shapes: d.shapes.filter((s) => s.layer === name).length,
      lines: d.lines.filter((x) => x.layer === name).length,
      curves: d.curves.filter((x) => x.layer === name).length,
      points: d.points.filter((p) => p.layer === name).length,
      texts: d.texts[name] ?? 0,
      labels: d.labels.filter((p) => p.layer === name).length,
      // a reduce, not Math.min(...zs): a survey's layer may have more corners than a call takes arguments
      heights: flat ? null : { min: zs.reduce((a, z) => Math.min(a, z), Infinity), max: zs.reduce((a, z) => Math.max(a, z), -Infinity) },
    }
    return { ...l, guess: guessKind(l) }
  })
  const named = layers.some((l) => l.guess === 'boundary')
  const guessed = layers.map((l) => (!named && l.guess === 'ignore' && l.shapes > 0 && !ANNOTATION.test(plain(l.name)) ? { ...l, guess: 'boundary' as LayerKind } : l))
  // what was guessed, a half again round it: a layer of lines whose middle is in there is a reference
  const kept = new Set(guessed.filter((l) => l.guess !== 'ignore').map((l) => l.name))
  const around = kept.size ? layerBox(d, (layer) => kept.has(layer)) : null
  const near = (name: string) => {
    if (!around) return false
    const b = layerBox(d, (layer) => layer === name)
    if (!b) return false
    const [w, h] = [(around.maxX - around.minX) / 4, (around.maxY - around.minY) / 4]
    const [x, y] = [(b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2]
    return x >= around.minX - w && x <= around.maxX + w && y >= around.minY - h && y <= around.maxY + h
  }
  return guessed
    .map((l) => (l.guess === 'ignore' && canBe(l, 'reference') && near(l.name) ? { ...l, guess: 'reference' as LayerKind } : l))
    .sort((a, b) => rank(a.guess) - rank(b.guess) || a.name.localeCompare(b.name))
}

/** The box round the layers `use` takes: their shapes, lines, arcs and points; null: nothing there. */
function layerBox(d: DxfDrawing, use: (layer: string) => boolean): Bounds | null {
  const pts = [...allPoints(d, use), ...d.curves.filter((l) => use(l.layer)).flatMap((l) => l.points)]
  return pts.length ? bounds(pts) : null
}

/** The kinds of the layers, by name: each layer's guess. */
export const guessedKinds = (layers: LayerSurvey[]): Record<string, LayerKind> => Object.fromEntries(layers.map((l) => [l.name, l.guess]))

/** Everything the drawing has, in its units: its shapes' corners, its lines' and its points. */
export function allPoints(d: DxfDrawing, use: (layer: string) => boolean = () => true): Point[] {
  return [
    ...d.shapes.filter((s) => use(s.layer)).flatMap((s) => contourToPolygon(s.contour)),
    ...d.lines.filter((l) => use(l.layer)).flatMap((l) => l.points),
    ...d.points.filter((p) => use(p.layer)),
    ...d.labels.filter((p) => use(p.layer)),
  ]
}

/**
 * Do the drawing's coordinates look like UTM (an easting of 100–900 km, a northing up to 10 000 km, in metres)? Of the
 * layers `use` takes (all by default): a title block near the origin must not hide a site drawn in UTM.
 */
export function looksLikeUtmAll(d: DxfDrawing, units: LengthUnit, use?: (layer: string) => boolean): boolean {
  const pts = allPoints(d, use)
  if (!pts.length) return false
  const b = bounds(pts)
  const k = METRES[units]
  return b.minX * k > 100000 && b.maxX * k < 900000 && b.minY * k >= 0 && b.maxY * k <= 10000000 && (b.maxX - b.minX) * k < 50000
}

/**
 * The units to read a drawing in, and whether it looks like UTM, judged by the layers guessed something (all, if none
 * is): what the header says, unless its numbers look like UTM in metres and not in the header's units (a civil drawing
 * in metres saved with $INSUNITS millimetres: read as said, a 300 000 m² parcel came 0.3 m² and its ground 1000
 * times flatter). `overridden`: the header said otherwise.
 */
export function guessedUnits(d: DxfDrawing, kinds: Record<string, LayerKind>): { units: LengthUnit; utm: boolean; overridden: boolean } {
  const chosen = (layer: string) => (kinds[layer] ?? 'ignore') !== 'ignore'
  const use = allPoints(d, chosen).length ? chosen : undefined
  const said = d.units ?? 'm'
  if (looksLikeUtmAll(d, said, use)) return { units: said, utm: true, overridden: false }
  if (said !== 'm' && looksLikeUtmAll(d, 'm', use)) return { units: 'm', utm: true, overridden: true }
  return { units: said, utm: false, overridden: false }
}

export type Coordinates = { kind: 'local' } | { kind: 'utm'; zone: number; south: boolean } | { kind: 'site' }

export interface SurveyChoice {
  units: LengthUnit
  coordinates: Coordinates
  /** What each layer is, by name; a layer not named is ignored. */
  kinds: Record<string, LayerKind>
}

export interface Surveyed {
  /** The boundary layers' closed shapes on the plan, biggest first. */
  candidates: Candidate[]
  /** The contours on the plan: at their heights, or drawn flat (a layer all at 0). */
  contours: ContourLine[]
  points: GroundPoint[]
  /** The roads layers' lines on the plan: the site's existing roads, by their centrelines. */
  roads: Point[][]
  /** The Reference layers on the plan, with their colours (Decision "Drawing layers"). */
  references: SiteDrawing['layers']
  /** The Parcels layers' closed shapes on the plan, named by layer and number, biggest first. */
  parcels: Candidate[]
  /** The frame they were read in (the site's, with `site`). */
  frame: SiteFrame | null
  /** The georeference a UTM file brings (null: local, or read through the site's). */
  geo: Geo | null
  /** The layers read for the ground, for its `source`. */
  layers: string[]
  warnings: string[]
}

/** Below this, two heights are one (a contour drawn at one height). */
const SAME_Z = 1e-6

/** Open lines of one layer and one height joined end to end (a contour drawn as pieces); closed ones as they are. */
function joined(lines: DrawnLine[], tol: number): { points: Pt3[]; closed: boolean }[] {
  const out: { points: Pt3[]; closed: boolean }[] = []
  const open: Pt3[][] = []
  for (const l of lines) {
    const pts = l.closed && l.points.length > 2 && Math.hypot(l.points[0].x - l.points.at(-1)!.x, l.points[0].y - l.points.at(-1)!.y) < tol ? l.points.slice(0, -1) : l.points
    if (l.closed) out.push({ points: pts, closed: true })
    else open.push(pts)
  }
  const near = (a: Pt3, b: Pt3) => Math.hypot(a.x - b.x, a.y - b.y) <= tol
  const used = Array.from({ length: open.length }, () => false)
  for (let i = 0; i < open.length; i++) {
    if (used[i]) continue
    used[i] = true
    let run = open[i]
    // grow at either end while a piece touches it
    for (let grew = true; grew; ) {
      grew = false
      for (let j = 0; j < open.length; j++) {
        if (used[j]) continue
        const p = open[j]
        const [s, e] = [run[0], run.at(-1)!]
        if (near(e, p[0])) run = [...run, ...p.slice(1)]
        else if (near(e, p.at(-1)!)) run = [...run, ...[...p].reverse().slice(1)]
        else if (near(s, p.at(-1)!)) run = [...p, ...run.slice(1)]
        else if (near(s, p[0])) run = [...[...p].reverse(), ...run.slice(1)]
        else continue
        used[j] = true
        grew = true
      }
    }
    const closes = run.length > 2 && near(run[0], run.at(-1)!)
    out.push({ points: closes ? run.slice(0, -1) : run, closed: closes })
  }
  return out
}

/** Where a drawing lands for a choice: a point of it (its units) on the plan (m), and the frame and georeference. */
export interface Placer {
  place: (p: Point) => Point
  frame: SiteFrame | null
  geo: Geo | null
  warnings: string[]
}

/** The frame: the site's, through the site's georeference, or the middle of what was chosen (of all, if nothing is). */
export function placerOf(d: DxfDrawing, c: SurveyChoice, site?: Pick<Site, 'frame' | 'geo'>): Placer {
  const kindOf = (layer: string) => c.kinds[layer] ?? 'ignore'
  const k = METRES[c.units]
  const boundary = d.shapes.some((s) => kindOf(s.layer) === 'boundary')
  if (c.coordinates.kind === 'site') {
    const f = site?.frame
    if (!f) throw new Error('The site came from no file: pick Local or UTM')
    return { place: (p) => ({ x: p.x * k - f.origin.x, y: p.y * k - f.origin.y }), frame: f, geo: null, warnings: [] }
  }
  if (c.coordinates.kind === 'utm' && !boundary && site?.geo && !site.frame) {
    const { zone, south } = c.coordinates
    const g = site.geo
    return { place: (p) => toPlan(g, fromUtm({ zone, south, x: p.x * k, y: p.y * k })), frame: null, geo: null, warnings: [] }
  }
  // the middle of the site and its ground: the references round it do not move it (of them, if they are all there is)
  const core = allPoints(d, (layer) => kindOf(layer) !== 'ignore' && kindOf(layer) !== 'reference')
  const chosen = core.length ? core : allPoints(d, (layer) => kindOf(layer) !== 'ignore')
  const pts = chosen.length ? chosen : allPoints(d)
  const b = pts.length ? bounds(pts) : { minX: 0, maxX: 0, minY: 0, maxY: 0 }
  const origin = { x: ((b.minX + b.maxX) / 2) * k, y: ((b.minY + b.maxY) / 2) * k }
  let frame: SiteFrame = { units: c.units, origin }
  let geo: Geo | null = null
  if (c.coordinates.kind === 'utm') {
    const u = { zone: c.coordinates.zone, south: c.coordinates.south, x: origin.x, y: origin.y }
    frame = { ...frame, utm: { zone: u.zone, south: u.south } }
    geo = { ...fromUtm(u), north: trueNorthOnGrid(u) }
  }
  const warnings = !boundary && site?.frame ? ['Read in its own coordinates, not the site’s: it may not land on the site (As the site’s puts it there)'] : []
  return { place: (p) => ({ x: p.x * k - origin.x, y: p.y * k - origin.y }), frame, geo, warnings }
}

/** The chosen layers of a drawing read on the plan (`site`: the site the file lands on, for `site` and `utm`). */
export function readChosen(d: DxfDrawing, c: SurveyChoice, site?: Pick<Site, 'frame' | 'geo'>): Surveyed {
  const kindOf = (layer: string) => c.kinds[layer] ?? 'ignore'
  const chosen = (layer: string) => kindOf(layer) !== 'ignore'
  const k = METRES[c.units]
  const { place, frame, geo, warnings: placing } = placerOf(d, c, site)
  const warnings = [...placing]

  const shapesOf = (kind: LayerKind) =>
    d.shapes
      .filter((s) => kindOf(s.layer) === kind)
      .map((s): Candidate => {
        const contour: Contour = { ...s.contour, vertices: s.contour.vertices.map((v) => ({ ...place(v), r: v.r * k })) }
        return { name: s.layer, contour, area: area(contourToPolygon(contour)) }
      })
      .sort((a, b) => b.area - a.area)
  const candidates = shapesOf('boundary')
  // the parcels, named by their layer and, when it has several, their number (the biggest first)
  const parcels = shapesOf('parcels').map((p, _, all) => {
    const same = all.filter((q) => q.name === p.name)
    return same.length > 1 ? { ...p, name: `${p.name} ${same.indexOf(p) + 1}` } : p
  })
  // the references: each layer's lines and arcs as drawn, flat, its arcs as corners
  const references: SiteDrawing['layers'] = [...new Set([...d.lines, ...d.curves].map((l) => l.layer))]
    .filter((layer) => kindOf(layer) === 'reference')
    .sort((a, b) => a.localeCompare(b))
    .map((name) => {
      const lines = [...d.lines, ...d.curves]
        .filter((l) => l.layer === name)
        .map((l) => ({ points: strokeOf(l).map(place), closed: l.closed }))
        .filter((l) => l.points.length >= 2)
        .map((l) => (l.closed ? l : { points: l.points }))
      const color = d.colors[name]
      return { name, ...(color ? { color } : {}), lines }
    })
    .filter((l) => l.lines.length > 0)

  // the ground: contours from the contour layers, points from the point layers (and a 3D line's corners)
  const extent = allPoints(d, chosen)
  const eb = extent.length ? bounds(extent) : null
  const tol = eb ? Math.max(1e-9, Math.hypot(eb.maxX - eb.minX, eb.maxY - eb.minY) * 1e-5) : 1e-9
  const contours: ContourLine[] = []
  const points: GroundPoint[] = []
  const ground = (p: Pt3): GroundPoint => ({ ...place(p), z: p.z * k })
  const layers = [...new Set([...d.lines.map((l) => l.layer), ...d.points.map((p) => p.layer), ...d.labels.map((p) => p.layer)])].filter(
    (l) => kindOf(l) === 'contours' || kindOf(l) === 'points',
  )
  // the existing roads: each line of a roads layer, flat on the plan (its centreline)
  const roads = d.lines.filter((l) => kindOf(l.layer) === 'roads' && l.points.length >= 2).map((l) => l.points.map(place))
  for (const layer of layers) {
    const lines = d.lines.filter((l) => l.layer === layer)
    const pts = d.points.filter((p) => p.layer === layer)
    const flat = [...lines.flatMap((l) => l.points), ...pts].every((p) => p.z === 0)
    if (kindOf(layer) === 'points') {
      // its spot heights too: a text that is a number, at its place
      const spots = d.labels.filter((p) => p.layer === layer)
      if (flat && !spots.length) {
        warnings.push(`${layer}: its points are all at 0, left out (a point of the ground needs its height)`)
        continue
      }
      if (!flat) points.push(...pts.map(ground), ...lines.flatMap((l) => l.points.map(ground)))
      points.push(...spots.map(ground))
      continue
    }
    // contours: a line at one height is a contour; one whose corners change height is a 3D line, its corners points
    const level = lines.filter((l) => l.points.every((p) => Math.abs(p.z - l.points[0].z) < SAME_Z))
    const sloped = lines.filter((l) => !level.includes(l))
    points.push(...sloped.flatMap((l) => l.points.map(ground)), ...(flat ? [] : pts.map(ground)))
    const byHeight = new Map<number, DrawnLine[]>()
    for (const l of level) byHeight.set(l.points[0].z, [...(byHeight.get(l.points[0].z) ?? []), l])
    for (const [z, ls] of byHeight)
      for (const run of joined(ls, tol)) {
        if (run.points.length < 2) continue
        contours.push({ points: run.points.map(place), ...(run.closed ? { closed: true } : {}), ...(flat ? {} : { z: z * k }) })
      }
  }
  return { candidates, contours, points, roads, references, parcels, frame, geo, layers, warnings }
}
