// The structural grid on the plan (Phase G.2a; Decisions "Grid layout", "Grid always"), while Show's *Grid* is on: the
// paper the plan is drawn on. Hairlines (1 px or less, faint) at its bay lines and, fainter still, its module lines,
// along its angle from its origin, **across the whole viewport** (not only the site), **behind every drawing**: on the
// site's paper, under the boundary, the ground, the roads and the masses, so an opaque mass hides it and a ghosted one
// (Detail's *Ghosted*) lets it show through. Only the lines inside the view are made (the view box's corners in the
// grid's frame), so a pan or a zoom costs a few hundred segments at most; lines closer than a few pixels are left out.
// The bay lines' names stand small and faint along the view's bottom and left edges, as a ruler's figures, once the
// bays are wide enough on screen to read them. Reads the option shown (a specimen's own grid too); draws, never edits.
// In the colour and at the opacity Show's Grid sets (Decision "Grid in 3D"); the 3D draws it too (scene/Grid3D.tsx).
import { gridLines, gridOf, nameBase, type GridLine } from '../../../engine/grid/index.ts'
import type { Point } from '../../../model/schema.ts'
import { useShown } from '../../viewport/look.ts'
import { gridToken, useGridShown, useGridView } from './gridView.ts'

/** px on screen: a bay line shows from this far apart, a module line from this, a name from this. */
const BAY_PX = 4
const MODULE_PX = 8
const NAME_GAP_PX = 28
/** The hairlines: width (px, never scaled) and opacity, a bay line's and a module line's. */
const BAY_WIDTH = 0.75
const BAY_OPACITY = 0.3
const MODULE_WIDTH = 0.5
const MODULE_OPACITY = 0.14
/** A name: its size and how far in from the view's edge (px), its opacity. */
const NAME_PX = 9
const INSET_PX = 8
const NAME_OPACITY = 0.55

interface Box {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

/** The view box (`x y w h`, in the plan's flipped y) as a box of plan metres. */
export function viewBounds(viewBox: string | undefined): Box | null {
  if (!viewBox) return null
  const [x, y, w, h] = viewBox.split(/[\s,]+/).map(Number)
  if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) return null
  return { minX: x, maxX: x + w, minY: 0 - (y + h), maxY: 0 - y }
}

/** Where a line first enters a box (its `a` end's side), or null when it misses it (Liang–Barsky). */
function entry(l: GridLine, b: Box): Point | null {
  const d = { x: l.b.x - l.a.x, y: l.b.y - l.a.y }
  let t0 = 0
  let t1 = 1
  const edges: [number, number][] = [
    [-d.x, l.a.x - b.minX],
    [d.x, b.maxX - l.a.x],
    [-d.y, l.a.y - b.minY],
    [d.y, b.maxY - l.a.y],
  ]
  for (const [p, q] of edges) {
    if (Math.abs(p) < 1e-12) {
      if (q < 0) return null
      continue
    }
    const t = q / p
    if (p < 0) t0 = Math.max(t0, t)
    else t1 = Math.min(t1, t)
    if (t0 > t1) return null
  }
  return { x: l.a.x + d.x * t0, y: l.a.y + d.y * t0 }
}

export function GridLayer({ px, viewBox }: { px: number; viewBox: string | undefined }) {
  const project = useShown((s) => s.project)
  const derived = useShown((s) => s.derived)
  const visible = useGridShown()
  const color = useGridView((s) => s.color)
  const opacity = useGridView((s) => s.opacity)
  const g = gridOf(project, derived.option)
  const view = viewBounds(viewBox)
  if (!visible || !g || !view) return null
  const stroke = `var(${gridToken(color)})`
  const corners = [
    { x: view.minX, y: view.minY },
    { x: view.maxX, y: view.minY },
    { x: view.maxX, y: view.maxY },
    { x: view.minX, y: view.maxY },
  ]
  const bayPx = Math.min(g.x, g.y) / px
  if (bayPx < BAY_PX) return null
  const modules = bayPx / g.modules >= MODULE_PX
  const lines = gridLines(g, corners, nameBase(g, derived.site.polygon), { modules })
  const seg = (a: Point, b: Point) => `M${a.x} ${-a.y}L${b.x} ${-b.y}`
  const moduleLines = lines.filter((l) => !l.name)
  const bayLines = lines.filter((l) => l.name)
  // the names, a few pixels in from where each bay line enters the view
  const inset = INSET_PX * px
  const inner = { minX: view.minX + inset, maxX: view.maxX - inset, minY: view.minY + inset, maxY: view.maxY - inset }
  const names =
    bayPx >= NAME_GAP_PX && inner.minX < inner.maxX && inner.minY < inner.maxY
      ? bayLines.flatMap((l) => {
          const at = entry(l, inner)
          return at ? [{ key: `${l.axis}${l.k}`, name: l.name!, at }] : []
        })
      : []

  return (
    <g data-layer="grid" data-grid={`${g.x}x${g.y}/${g.modules}`} pointerEvents="none" opacity={opacity < 1 ? opacity : undefined}>
      {moduleLines.length > 0 && (
        <path
          data-grid-modules={moduleLines.length}
          d={moduleLines.map((l) => seg(l.a, l.b)).join('')}
          stroke={stroke}
          strokeOpacity={MODULE_OPACITY}
          strokeWidth={MODULE_WIDTH}
          fill="none"
          vectorEffect="non-scaling-stroke"
        />
      )}
      <path
        data-grid-lines={bayLines.length}
        d={bayLines.map((l) => seg(l.a, l.b)).join('')}
        stroke={stroke}
        strokeOpacity={BAY_OPACITY}
        strokeWidth={BAY_WIDTH}
        fill="none"
        vectorEffect="non-scaling-stroke"
      />
      {names.length > 0 && (
        <g fill={stroke} fillOpacity={NAME_OPACITY} fontSize={NAME_PX * px} textAnchor="middle" dominantBaseline="central">
          {names.map((n) => (
            <text key={n.key} data-grid-name={n.name} x={n.at.x} y={-n.at.y}>
              {n.name}
            </text>
          ))}
        </g>
      )}
    </g>
  )
}
