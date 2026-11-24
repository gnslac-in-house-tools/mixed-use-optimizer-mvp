// Making a block from a footprint (Phase D.2 task 7; Decisions "Draw makes a block", "Outline in metres"), pure: what a stroke on the
// site is as a block's data. The stroke is the block's OUTER FACE (the footprint a mass had, what the KPIs read); the block's outline
// is its walls' reference line, the stroke moved in by the wall. `drawBlock` (the Draw tool, the agent's tools) and the migration of
// the free masses (task 8) both read a footprint through here, so a drawn block and a migrated one are the same data.
//   blockFrame(footprint)     the angle the block's grid takes: a rectangle's rotation, else its longest straight wall
//   outlineFromFace(...)      the reference outline, arcs and holes in the block's frame, its box and where its column line A / 1 stands
import type { Contour, Hole, OutlineCorner, Point, ShapeHole, Footprint } from '../../../model/schema.ts'
import { arcBox, bulges, normalize } from '../../../engine/geom/contour.ts'
import { cosSin, rotate } from '../../../engine/geom/footprint.ts'
import { insetEdges, offsetEdges } from '../../../engine/geom/offsetEdges.ts'
import type { Place } from './copies.ts'
import { holeFits, tidyOutline, validOutline } from './shape.ts'

const um = (v: number) => Math.round(v * 1e6) / 1e6 + 0
const mm = (v: number) => Math.round(v * 1000) / 1000 + 0
const tidyAngle = (deg: number) => Math.round((((((deg + 180) % 360) + 360) % 360) - 180) * 1e9) / 1e9 + 0
const ORIGIN: Point = { x: 0, y: 0 }

/**
 * The angle (degrees, counter-clockwise) a footprint's block stands at, its x axis along its length: a rectangle's own rotation, else the
 * direction of its longest straight wall (an arc is not a wall); a shape of curves alone: the axes.
 */
export function blockFrame(f: Footprint): number {
  if (f.kind === 'rect') return f.rotation
  const c = normalize(f.contour)
  const bs = bulges(c)
  let best = 0
  let angle = 0
  c.vertices.forEach((a, i) => {
    const b = c.vertices[(i + 1) % c.vertices.length]
    const len = Math.hypot(b.x - a.x, b.y - a.y)
    if (bs[i] === 0 && len > best + 1e-9) {
      best = len
      angle = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI
    }
  })
  return tidyAngle(angle)
}

/** What a stroke is as a block's data: its outline, arcs and holes in the block's frame (m from column line A / 1), where that frame stands. */
export interface BlockOutline {
  /** Where the block's column line A / 1 stands on the site, and the angle of its length. */
  place: Place
  /** m: the box, the outline's bounding box. */
  length: number
  width: number
  /** The reference outline, counter-clockwise; its edges e1, e2…. With `box`, the box's own four corners. */
  outline: OutlineCorner[]
  /** The edges that bulge, keyed by the corner an edge starts at (as `Contour.arcs`). */
  arcs?: Record<string, number>
  /** Its holes: each the cut drawn, grown by the wall that stands round it. */
  holes: ShapeHole[]
  /** The holes drawn that do not stand inside the block, and so are not there. */
  dropped: number
  /** The outline is the box itself (four sharp corners on its bounding box): a type keeps none then. */
  box: boolean
}

/** m: how far off its axis a straight edge may stand and still be square to the frame (a stroke read to the centimetre is that far off). */
const SQUARE = 0.02
/** How much of its length that is, at most: a wall angled by more than this is meant. */
const SQUARE_SLOPE = 0.01

/**
 * A contour's straight edges that are square to the frame within what a stroke's rounding explains (`SQUARE`) made exactly square: both
 * ends of the edge on the mean of their two coordinates. A rectangle turned 30° and rounded to the centimetre would otherwise have a wall
 * a micrometre off its axis, which the grid does not read as along it (no dock, no bay on it).
 */
function squared(c: Contour): Contour {
  const bs = bulges(c)
  const v = c.vertices.map((q) => ({ ...q }))
  const n = v.length
  for (let i = 0; i < n; i++) {
    const a = v[i]
    const b = v[(i + 1) % n]
    if (bs[i]) continue
    const dx = Math.abs(b.x - a.x)
    const dy = Math.abs(b.y - a.y)
    if (dy > 0 && dy <= SQUARE && dy <= dx * SQUARE_SLOPE) a.y = b.y = (a.y + b.y) / 2
    else if (dx > 0 && dx <= SQUARE && dx <= dy * SQUARE_SLOPE) a.x = b.x = (a.x + b.x) / 2
  }
  return { ...c, vertices: v }
}

/** A contour turned `-angle` about the site's origin (into the block's frame), counter-clockwise, its near-square walls square. */
function inFrame(c: Contour, angle: number): Contour {
  const turned = angle === 0 ? c : { ...c, vertices: c.vertices.map((v) => ({ ...v, ...rotate(v, ORIGIN, -angle) })) }
  return squared(normalize(turned))
}

/**
 * The block a stroke makes (`face`: its outer face on the site, arcs, radii and chamfers as drawn; `holes`: the cuts in it, also faces;
 * `thickness`: the wall, m; `angle`: the frame, `blockFrame`'s). The reference outline is the face moved in by the wall; its box is the
 * bounding box of its corners and its arcs (an outward arc's farthest point: it lies inside the box, Phase D.3) and its low corner is
 * where column line A / 1 stands. What is stored is rounded to the millimetre. Null when the walls do not fit inside the face.
 */
export function outlineFromFace(face: Contour, holes: readonly Hole[], thickness: number, angle: number): BlockOutline | null {
  const local = inFrame(face, angle)
  const reference = insetEdges(
    local,
    local.vertices.map(() => thickness),
  )
  if (!reference) return null
  const far = arcBox(reference)
  const x0 = far.x0
  const y0 = far.y0
  const bs = bulges(reference)
  const corners = reference.vertices.map((v, i) => ({
    id: `e${i + 1}`,
    x: mm(v.x - x0),
    y: mm(v.y - y0),
    ...(v.r ? { r: v.r } : {}),
    ...(v.chamfer ? { chamfer: v.chamfer } : {}),
    ...(bs[i] ? { bulge: bs[i] } : {}),
  }))
  const tidy = tidyOutline(corners, true).outline
  if (!validOutline(tidy)) return null
  const arcs: Record<string, number> = {}
  tidy.forEach((c, i) => {
    if (c.bulge) arcs[String(i)] = c.bulge
  })
  const outline: OutlineCorner[] = tidy.map((c) => {
    const own: OutlineCorner & { bulge?: number } = { ...c }
    delete own.bulge
    return own
  })
  const length = mm(far.x1 - x0)
  const width = mm(far.y1 - y0)
  const isBox =
    outline.length === 4 &&
    Object.keys(arcs).length === 0 &&
    outline.every((c) => !c.r && !c.chamfer && (Math.abs(c.x) < 1e-6 || Math.abs(c.x - length) < 1e-6) && (Math.abs(c.y) < 1e-6 || Math.abs(c.y - width) < 1e-6))
  // the cuts: each a contour in the frame, grown by the wall to its reference line, kept when it stands inside the block
  const made: ShapeHole[] = []
  let dropped = 0
  holes.forEach((h) => {
    const c = inFrame(h, angle)
    const grown = offsetEdges(
      c,
      c.vertices.map(() => thickness),
    )
    const vertices = (grown ?? c).vertices.map((v) => ({ ...v, x: mm(v.x - x0), y: mm(v.y - y0) }))
    const hole: ShapeHole = { id: `h${made.length + 1}`, vertices, ...((grown ?? c).arcs ? { arcs: (grown ?? c).arcs } : {}), ...(h.corridor ? { corridor: h.corridor } : {}) }
    if (grown && holeFits(outline, hole, made)) made.push(hole)
    else dropped++
  })
  const [c, s] = cosSin(angle)
  const place: Place = { x: um(x0 * c - y0 * s), y: um(x0 * s + y0 * c), angle }
  return { place, length, width, outline, ...(Object.keys(arcs).length ? { arcs } : {}), holes: made, dropped, box: isBox }
}

