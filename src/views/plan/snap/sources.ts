// What attracts while a mass is dragged. Port of Plaza-Practiko `vistas/planta/iman/fuentes.ts`: the other masses of
// the level, those of the reference level (above or below, when it shows), the site boundary and (new here) the
// setback line, which is where warehouses usually go, and (Decision "Snap first to what is drawn") the truck courts and
// the parking lots as the plan shows them, but those of the masses dragged, which move with them. A road drawn or dragged is attracted by the roads too (Decision
// "Road snap"): their centrelines, open lines, their two edges at their width (Decision "Street edges snap"), and the
// gates. And (Decision "Drawing layers") the site's drawing lines,
// parcels and contours, and the reference lines drawn on the plan (Phase AS.5), as the Snap ▾ menu's *Snap to* says. What an eye hides (views/layers: the boundary, the buildable
// line, the courts, the lots, the streets, the existing roads, the gates, a hidden building's courts, a mass whose own eye is off) does not attract: it is not on the plan.
import type { Contour, Id, Point, Project } from '../../../model/schema.ts'
import { referenceLineName } from '../../../engine/annotations.ts'
import { allLevels } from '../../../engine/buildings.ts'
import { massDrawn, massEyeOff, planBuilding } from '../../buildingView.ts'
import { contourFromPolygon } from '../../../engine/geom/contour.ts'
import { footprintContour } from '../../../engine/geom/footprint.ts'
import { courtShapes, type Derived, type DerivedRoad } from '../../../engine/types.ts'
import { BOUNDARY, BUILDABLE, COURTS, drawingLayer, isObjectHidden, parcel, roadHidden } from '../../layers/keys.ts'
import { hiddenNow } from '../../layers/layerView.ts'
import type { SnapTo } from './kinds.ts'
import type { Source } from './points.ts'

/** On which levels the masses attract: the active one, the reference's (Decision "Reference reach") and the levels the
 *  plan shows the option's other buildings at (absent: every mass). */
export interface SnapLevels {
  level: Id
  reference: Id[]
  others?: Id[]
  /** What else attracts (Decision "Drawing layers"): the Snap ▾ menu's *Snap to*, and what the eyes of Layers hide. */
  drawn?: DrawnSnap
}

export interface DrawnSnap {
  to: Record<SnapTo, boolean>
  /** The keys hidden (layers/layerView.ts). */
  hidden: readonly string[]
}

/**
 * The site's drawings as they attract (Decision "Drawing layers"): with *Drawing lines*, each reference layer's
 * lines and each parcel shown, by their corners, middles and edges, crossing nothing (thousands of short pieces); with
 * *Contours*, the ground's contours by their edges alone. None of them is a tracking line. With *Reference lines* (Phase AS.5), each
 * line drawn on the plan that is shown, but those named in `skip` (the one being drawn or dragged does not attract itself): an open
 * line that attracts by its points, middles, nearest point, the square from it and its crossings with other straight edges, and whose
 * stretches run on past their ends as tracking lines (the drafting bar's *Align*). Hidden (its own eye, the kind's) it attracts nothing.
 */
export function drawnSources(project: Project, drawn: DrawnSnap, skip: Iterable<Id> = []): Source[] {
  const out: Source[] = []
  const off = new Set(drawn.hidden)
  const moving = new Set(skip)
  if (drawn.to.referenceLines)
    (project.referenceLines ?? []).forEach((r, i) => {
      if (!moving.has(r.id) && !isObjectHidden(off, 'reference-line', r.id)) out.push({ contour: line(r.points), label: referenceLineName(i), open: true })
    })
  if (drawn.to.references) {
    for (const d of project.site.drawings ?? [])
      for (const l of d.layers) {
        if (off.has(drawingLayer(d.file, l.name))) continue
        for (const ln of l.lines) out.push({ contour: line(ln.points), label: l.name, open: !ln.closed, track: false, crossings: false })
      }
    for (const p of project.site.parcels ?? []) if (!off.has(parcel(p.name, p.file))) out.push({ contour: p.contour, label: p.name, track: false, crossings: false })
  }
  if (drawn.to.contours)
    for (const c of project.site.terrain?.contours ?? []) out.push({ contour: line(c.points), label: 'contour', open: !c.closed, track: false, edgesOnly: true })
  return out
}

/**
 * `exclude`: the mass (or masses) being dragged: their own walls move with them, so they cannot attract them; a parking
 * lot dragged names its own id here, so it does not attract itself (its corners and edges attract everything else).
 * Move and Copy (Decision "General tools") name every picked mass and lot. The dimensions never attract, so a picked one
 * has nothing to leave out.
 */
export function sourcesFor(project: Project, derived: Derived, exclude: Id | readonly Id[] | null = null, levels?: SnapLevels): Source[] {
  const out: Source[] = []
  const skip = new Set(exclude === null ? [] : typeof exclude === 'string' ? [exclude] : exclude)
  const names = new Map(allLevels(project).map((l) => [l.id, l.name]))
  const off = hiddenNow()
  for (const m of project.masses) {
    if (skip.has(m.id) || massEyeOff(off, m.id)) continue
    const reference = levels !== undefined && levels.reference.includes(m.levelId)
    if (levels && m.levelId !== levels.level && !reference && !levels.others?.includes(m.levelId)) continue
    const label = reference ? `${m.name || 'mass'} (${names.get(m.levelId)})` : m.name || 'mass'
    out.push({ contour: footprintContour(m.footprint), label, centroid: true })
  }
  // the courts and lots of the masses dragged go with them: they cannot attract them; nor a lot dragged itself
  // a hidden building's courts are not on the plan (the building the plan is on stays drawn there, so its courts attract)
  const planOn = levels ? planBuilding(project, levels.level) : undefined
  if (!off.has(COURTS))
    for (const d of derived.circulation.docks)
      if (!skip.has(d.massId) && massDrawn(derived.masses, d.massId, off, planOn))
        for (const court of courtShapes(d)) if (court.length >= 3) out.push({ contour: contourFromPolygon(court), label: 'truck court' })
  for (const l of derived.circulation.lots ?? []) if (!isObjectHidden(off, 'lot', l.id) && !skip.has(l.id) && !(l.anchor && skip.has(l.anchor.massId))) out.push({ contour: contourFromPolygon(l.polygon), label: l.name })
  if (project.site.boundary && !off.has(BOUNDARY)) out.push({ contour: project.site.boundary, label: 'site', track: false })
  // with no setback the line is the boundary itself: nothing new to add
  if (project.site.rules.setback > 0 && !off.has(BUILDABLE)) {
    for (const region of derived.site.buildable) {
      for (const ring of region) if (ring.length >= 3) out.push({ contour: contourFromPolygon(ring), label: 'setback', track: false })
    }
  }
  if (levels?.drawn) out.push(...drawnSources(project, levels.drawn, skip))
  return out
}

const line = (points: Point[]): Contour => ({ vertices: points.map((q) => ({ x: q.x, y: q.y, r: 0 })) })

/**
 * Whether a street's drawn line is its centre line (a street drawn by its centre): its two sides are equal. Read from the sides, not by
 * comparing its rounded centre line with the sharp drawn one (a centred street with bends would differ at every bend).
 */
const drawnIsCentre = (r: DerivedRoad): boolean => r.left !== undefined && r.right !== undefined && Math.abs(r.left - r.right) < 1e-9

const ROAD_LABELS = { existing: 'existing road', street: 'street' } as const

/** m: how far past the half-width a gentle bend's mitre may stand (a curve's many points stay one per point). */
const MITRE_PAST = 0.001

/**
 * A road's edge, `d` m to the left of its centreline (negative: to its right), as the plan strokes the paving (round
 * joins and caps): each piece moved `d` along its normal. At a bend the outer side is a bevel, the two pieces ending at
 * their own offset points, both on the round join (never a mitre past the half-width, unless it stands within
 * MITRE_PAST of it); the inner side meets where the two offsets cross within both pieces, else is bevelled too.
 */
export function roadEdge(points: Point[], d: number): Point[] {
  const t: Point[] = []
  for (const q of points) if (!t.length || Math.hypot(q.x - t[t.length - 1].x, q.y - t[t.length - 1].y) > 1e-9) t.push(q)
  if (t.length < 2) return []
  const pieces = t.slice(1).map((b, i) => {
    const a = t[i]
    const l = Math.hypot(b.x - a.x, b.y - a.y)
    const n = { x: (-(b.y - a.y) / l) * d, y: ((b.x - a.x) / l) * d }
    return { a: { x: a.x + n.x, y: a.y + n.y }, b: { x: b.x + n.x, y: b.y + n.y } }
  })
  const out: Point[] = [pieces[0].a]
  for (let i = 1; i < pieces.length; i++) {
    const [p, q] = [pieces[i - 1], pieces[i]]
    const [u, v] = [{ x: p.b.x - p.a.x, y: p.b.y - p.a.y }, { x: q.b.x - q.a.x, y: q.b.y - q.a.y }]
    const den = u.x * v.y - u.y * v.x
    const lu = Math.hypot(u.x, u.y)
    const lv = Math.hypot(v.x, v.y)
    // straight on: the two pieces meet
    if (Math.abs(den) < 1e-12 * lu * lv && u.x * v.x + u.y * v.y > 0) {
      out.push(q.a)
      continue
    }
    const half = Math.acos(Math.max(-1, Math.min(1, (u.x * v.x + u.y * v.y) / (lu * lv)))) / 2
    // the turn to the left (den > 0) puts the left side inside
    const inner = den * d > 0
    const w = { x: q.a.x - p.a.x, y: q.a.y - p.a.y }
    const s = (w.x * v.y - w.y * v.x) / den
    const r = (w.x * u.y - w.y * u.x) / den
    const crossing = { x: p.a.x + u.x * s, y: p.a.y + u.y * s }
    if (inner ? s >= 0 && s <= 1 && r >= 0 && r <= 1 : Math.abs(d) * (1 / Math.cos(half) - 1) <= MITRE_PAST) out.push(crossing)
    else out.push(p.b, q.a)
  }
  out.push(pieces[pieces.length - 1].b)
  return out
}

/**
 * The roads as they stand (the option's: existing, drawn by hand and derived), each centreline an open line, its two
 * edges too (Decision "Street edges snap": the sides of the paving the plan strokes, the centreline moved half its
 * width either way, bevelled through the round join at a bend, `roadEdge`; a point slides onto them, their ends are the corners of the street's end), and each gate a point;
 * each parking lot's entrance a point too (Decision "Streets follow their lots": a street end dropped there connects).
 * `exclude`: the road being dragged (its id in `derived.circulation.roads`), or the roads, gates and lots a general
 * tool moves (Decision "General tools": their ids in `derived.circulation`). `node`: when a street's node is dragged (that street
 * the one excluded), its other nodes still attract, so it can be dropped on one (they join).
 */
export function roadSources(derived: Derived, exclude: string | ReadonlySet<string> | null = null, node: number | null = null): Source[] {
  const skip: ReadonlySet<string> = typeof exclude === 'string' ? new Set([exclude]) : (exclude ?? new Set())
  const off = hiddenNow()
  const drawn = (r: DerivedRoad) => !roadHidden(off, r)
  // a set names streets too (a general tool moves a street whole: every run of it); one id names the run dragged
  const skipped = (r: DerivedRoad) => skip.has(r.id) || (typeof exclude !== 'string' && r.street !== undefined && skip.has(r.street))
  const roads = derived.circulation.roads
    .filter((r) => !skipped(r) && r.points.length >= 2 && drawn(r))
    .flatMap((r) => [
      { contour: line(r.points), label: ROAD_LABELS[r.kind], open: true, track: false },
      // a street drawn by one edge (or unevenly) has its drawn line off its centre: the line the designer drew attracts too
      ...(r.kind === 'street' && r.nodePoints && r.nodePoints.length >= 2 && !drawnIsCentre(r) ? [{ contour: line(r.nodePoints), label: 'street drawn line', open: true, track: false }] : []),
      ...(r.width > 0 ? [1, -1].map((side) => ({ contour: line(roadEdge(r.points, (side * r.width) / 2)), label: `${ROAD_LABELS[r.kind]} edge`, open: true, track: false })) : []),
    ])
  const gates = derived.circulation.gates.filter((g) => !skip.has(g.id) && !isObjectHidden(off, 'gate', g.id)).map((g) => ({ contour: line([g.at]), label: 'gate', open: true }))
  // a street end dropped on a lot's entrance connects to it (Decision "Streets follow their lots")
  const entrances = (derived.circulation.lots ?? []).filter((l) => !skip.has(l.id) && !isObjectHidden(off, 'lot', l.id)).map((l) => ({ contour: line([l.entrance.at]), label: `${l.name} entrance`, open: true }))
  const nodes = derived.circulation.roads
    .filter((r) => r.kind === 'street' && r.nodePoints && drawn(r) && (!skipped(r) || node !== null))
    .flatMap((r) => r.nodePoints!.filter((_, i) => !skipped(r) || i !== node).map((q) => ({ contour: line([q]), label: 'street node', open: true })))
  return [...roads, ...gates, ...entrances, ...nodes]
}
