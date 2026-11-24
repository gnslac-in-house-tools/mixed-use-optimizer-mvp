// The site's drawings on the plan (Phase DL.2, Decision "Drawing layers"): each reference layer's lines in its file's
// colour, thin, and the parcels inside the site, each outlined with its name and area. Those hidden in Location's
// tree (layers/layerView.ts, per project) are not drawn. Under everything that is designed, on the site's paper, but for those the
// tree puts *On top* (the same store): PlanSvg mounts this a second time, `over`, after the masses and before the dimensions, for
// those layers and parcels alone, and the first mount skips them. A hidden one on top is still hidden. Nothing answers the
// pointer: the plan's background click picks a drawing (Decision "Drawing pick"; drawingPick.ts), and what a picked
// part carries (not its locked layers and parcels, which stay) is drawn in ink, thicker, marked `data-picked`.
// A layer's path and a parcel's outline are kept per object (Decision "Drawings move"): a move gives new objects only
// to what it moves (`carry`), so a preview of one drawing rebuilds that one alone, and a pick rebuilds nothing.
import { useMemo } from 'react'
import { contourToPolygon } from '../../../engine/geom/contour.ts'
import { area, centroid } from '../../../engine/geom/polygon.ts'
import type { DrawingLayer, Parcel, Point } from '../../../model/schema.ts'
import { useApp } from '../../../state/store.ts'
import { pathOf } from '../camera.ts'
import { aciColor } from './aci.ts'
import { SELECTED_PX } from '../planStyle.ts'
import { keysOf, useDrawingPick } from './drawingPick.ts'
import { drawingLayer, parcel } from '../../layers/keys.ts'
import { useLayerView } from '../../layers/layerView.ts'
import { linesPath } from './linesPath.ts'

const paths = new WeakMap<DrawingLayer, string>()
/** The layer's path, built once per layer object. */
function layerPath(l: DrawingLayer): string {
  let d = paths.get(l)
  if (d === undefined) {
    d = linesPath(l.lines)
    paths.set(l, d)
  }
  return d
}

const outlines = new WeakMap<Parcel, { d: string; at: Point; area: number }>()
/** The parcel's outline, centre and area, once per parcel object. */
function parcelOutline(p: Parcel): { d: string; at: Point; area: number } {
  let o = outlines.get(p)
  if (!o) {
    const poly = contourToPolygon(p.contour)
    o = { d: pathOf([poly]), at: centroid(poly), area: area(poly) }
    outlines.set(p, o)
  }
  return o
}

const m2 = (v: number) => `${Math.round(v).toLocaleString('en-US')} m²`

/** `over`: the layers and parcels put on top (drawn over the masses); not: the others, under all that is designed. */
export function DrawingsLayer({ px, over = false }: { px: number; over?: boolean }) {
  const drawings = useApp((s) => s.project.site.drawings)
  const parcels = useApp((s) => s.project.site.parcels)
  const hidden = useLayerView((s) => s.hidden)
  const onTop = useLayerView((s) => s.onTop)
  const picked = useDrawingPick((s) => s.picked)
  const layers = useMemo(() => {
    const off = new Set(hidden)
    const top = new Set(onTop)
    return (drawings ?? []).flatMap((d) =>
      d.layers
        .filter((l) => !off.has(drawingLayer(d.file, l.name)) && top.has(drawingLayer(d.file, l.name)) === over)
        .map((l) => ({ key: drawingLayer(d.file, l.name), color: aciColor(l.color), d: layerPath(l) })),
    )
  }, [drawings, hidden, onTop, over])
  const shown = useMemo(() => {
    const off = new Set(hidden)
    const top = new Set(onTop)
    return (parcels ?? [])
      .filter((p) => !off.has(parcel(p.name, p.file)) && top.has(parcel(p.name, p.file)) === over)
      .map((p) => ({ key: parcel(p.name, p.file), name: p.name, ...parcelOutline(p) }))
  }, [parcels, hidden, onTop, over])
  // what the picked parts carry: their locked layers and parcels stay, so they are not marked
  const marked = useMemo(() => new Set(keysOf({ drawings, parcels }, picked)), [drawings, parcels, picked])
  if (!layers.length && !shown.length) return null
  const size = 10 * px
  return (
    <g aria-label="Drawing layers" data-on-top={over || undefined} pointerEvents="none">
      {/* the paths are kept as the drawings are; only the mark follows a pick */}
      {layers.map((l) => ({ ...l, picked: marked.has(l.key) })).map((l) => (
        <path
          key={l.key}
          data-drawing-layer={l.key}
          data-picked={l.picked || undefined}
          d={l.d}
          fill="none"
          stroke={l.picked ? 'var(--ink)' : l.color}
          strokeWidth={l.picked ? SELECTED_PX : 0.75}
          opacity={l.picked ? 1 : 0.85}
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {shown.map((p) => ({ ...p, picked: marked.has(p.key) })).map((p) => (
        <g key={p.key} data-parcel={p.name}>
          <path
            d={p.d}
            data-picked={p.picked || undefined}
            fill="none"
            stroke={p.picked ? 'var(--ink)' : 'var(--ink-secondary)'}
            strokeWidth={p.picked ? SELECTED_PX : 1.25}
            strokeDasharray="10 3 2 3"
            vectorEffect="non-scaling-stroke"
          />
          <text
            x={p.at.x}
            y={-p.at.y}
            textAnchor="middle"
            fontSize={size}
            fill="var(--ink-secondary)"
            stroke="var(--panel)"
            strokeWidth={size * 0.35}
            paintOrder="stroke"
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            <tspan x={p.at.x}>{p.name}</tspan>
            <tspan x={p.at.x} dy={size * 1.2}>
              {m2(p.area)}
            </tspan>
          </text>
        </g>
      ))}
    </g>
  )
}
