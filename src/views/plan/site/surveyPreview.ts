// What a surveyed file draws while its window is open (Decision "Site file survey"), pure: every layer's lines and
// points where they would land on the plan (ImportLayer.tsx draws them by what each layer is, the hovered one strong),
// and a thumbnail of each layer for its row, in the drawing's own coordinates.
import type { Point } from '../../../model/schema.ts'
import { bounds, type Bounds } from '../../../engine/geom/polygon.ts'
import { strokeOf, type DxfDrawing } from '../../../io/site/dxf.ts'
import type { LayerKind } from '../../../io/site/survey.ts'

export interface PreviewLayer {
  name: string
  kind: LayerKind
  /** Its lines on the plan (m); a closed one ends on its first point. */
  lines: Point[][]
  points: Point[]
}

/** Every layer that has lines or points, placed (`place`: a point of the drawing on the plan). */
export function previewOf(d: DxfDrawing, kinds: Record<string, LayerKind>, place: (p: Point) => Point): PreviewLayer[] {
  const by = new Map<string, PreviewLayer>()
  const layer = (name: string) => {
    let l = by.get(name)
    if (!l) by.set(name, (l = { name, kind: kinds[name] ?? 'ignore', lines: [], points: [] }))
    return l
  }
  // its arcs as drawn (a polyline's bulges, arcs and circles): a reference shows as it will be kept
  for (const l of [...d.lines, ...d.curves]) {
    const pts = strokeOf(l).map(place)
    layer(l.layer).lines.push(l.closed && pts.length > 2 ? [...pts, pts[0]] : pts)
  }
  for (const p of [...d.points, ...d.labels]) layer(p.layer).points.push(place(p))
  return [...by.values()]
}

/** The box round what was chosen (round everything, if nothing is), with the boundary's candidates; null: nothing. */
export function previewBounds(layers: PreviewLayer[], extra: Point[]): Bounds | null {
  const of = (ls: PreviewLayer[]) => ls.flatMap((l) => [...l.lines.flat(), ...l.points])
  const chosen = [...of(layers.filter((l) => l.kind !== 'ignore')), ...extra]
  const pts = chosen.length ? chosen : of(layers)
  return pts.length ? bounds(pts) : null
}

/** A thumbnail's box, in px. */
export const THUMB = { w: 40, h: 28, pad: 2 }
/** At most this many corners and points in a thumbnail. */
const THUMB_MAX = 400

/** Each layer's lines and points as an SVG path in the THUMB box, framed on the layer alone (y up). */
export function thumbnailsOf(d: DxfDrawing): Record<string, string> {
  const drawn = [...d.lines, ...d.curves]
  const names = new Set([...drawn.map((l) => l.layer), ...d.points.map((p) => p.layer), ...d.labels.map((p) => p.layer)])
  const out: Record<string, string> = {}
  for (const name of names) {
    const lines = drawn
      .filter((l) => l.layer === name)
      .map((l) => {
        const ps = strokeOf(l)
        return l.closed && ps.length > 2 ? [...ps, ps[0]] : ps
      })
    const points = [...d.points, ...d.labels].filter((p) => p.layer === name)
    const all = [...lines.flat(), ...points]
    const b = bounds(all)
    const span = Math.max(b.maxX - b.minX, b.maxY - b.minY) || 1
    const k = Math.min((THUMB.w - 2 * THUMB.pad) / (b.maxX - b.minX || span), (THUMB.h - 2 * THUMB.pad) / (b.maxY - b.minY || span))
    const ox = (THUMB.w - (b.maxX - b.minX) * k) / 2
    const oy = (THUMB.h - (b.maxY - b.minY) * k) / 2
    const at = (p: Point) => `${(ox + (p.x - b.minX) * k).toFixed(1)},${(THUMB.h - oy - (p.y - b.minY) * k).toFixed(1)}`
    const every = Math.max(1, Math.ceil(all.length / THUMB_MAX))
    const thin = <T>(xs: T[]) => (xs.length > 2 ? xs.filter((_, i) => i % every === 0 || i === xs.length - 1) : xs)
    const path = [
      ...lines.filter((_, i) => i % Math.max(1, Math.ceil(lines.length / 120)) === 0).map((l) => `M${thin(l).map(at).join('L')}`),
      ...thin(points).map((p) => `M${at(p)}h0`),
    ]
    out[name] = path.join('')
  }
  return out
}
