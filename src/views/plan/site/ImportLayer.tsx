// What a file being imported draws over the plan, where it would land (Decisions "Site step layout" and
// "Site file survey"). A surveyed file (DXF, CSV): every layer's lines and points, the contours and the points of the
// ground as such, the layers ignored faint, the one whose row is under the pointer strong. Then the boundary's
// candidates: dashed, the one under the pointer marked, the one picked solid; a click picks it (a geolocated file's is
// imported at once). The smaller ones are drawn last, over the bigger, so a shape inside another can be picked too.
import { useMemo } from 'react'
import type { Point } from '../../../model/schema.ts'
import { contourToPolygon } from '../../../engine/geom/contour.ts'
import { pathOf } from '../camera.ts'
import { useSiteImport } from './importState.ts'
import type { PreviewLayer } from './surveyPreview.ts'

const linesPath = (ls: Point[][]) => ls.map((l) => `M${l.map((p) => `${p.x.toFixed(2)},${(-p.y).toFixed(2)}`).join('L')}`).join('')
const dotsPath = (ps: Point[]) => ps.map((p) => `M${p.x.toFixed(2)},${(-p.y).toFixed(2)}h0`).join('')

/** A layer's look on the plan, by what it is. */
function look(kind: PreviewLayer['kind'], strong: boolean) {
  if (strong) return { stroke: 'var(--ink)', width: 2, dot: 6, opacity: 1 }
  if (kind === 'contours') return { stroke: 'var(--ink-secondary)', width: 1, dot: 4, opacity: 1 }
  if (kind === 'points') return { stroke: 'var(--ink-secondary)', width: 1, dot: 4, opacity: 1 }
  if (kind === 'roads') return { stroke: 'var(--ink)', width: 2.5, dot: 4, opacity: 0.8 }
  // Decision "Drawing layers": the parcels as the site's lines, the references as they will show, thin
  if (kind === 'parcels') return { stroke: 'var(--ink-secondary)', width: 1.25, dot: 3, opacity: 1 }
  if (kind === 'reference') return { stroke: 'var(--ink-secondary)', width: 0.75, dot: 3, opacity: 0.8 }
  return { stroke: 'var(--ink-tertiary)', width: 0.75, dot: 3, opacity: 0.45 }
}

function SurveyLayers({ preview, strong }: { preview: PreviewLayer[]; strong: string | null }) {
  const paths = useMemo(() => preview.map((l) => ({ name: l.name, kind: l.kind, lines: linesPath(l.lines), dots: dotsPath(l.points) })), [preview])
  // the strong one last, over the others
  const ordered = [...paths.filter((p) => p.name !== strong), ...paths.filter((p) => p.name === strong)]
  return (
    <g data-survey-preview="" pointerEvents="none" fill="none" strokeLinecap="round" strokeLinejoin="round">
      {ordered.map((p) => {
        const s = look(p.kind, p.name === strong)
        return (
          <g key={p.name} data-layer={p.name} stroke={s.stroke} opacity={s.opacity}>
            {p.lines && <path d={p.lines} strokeWidth={s.width} vectorEffect="non-scaling-stroke" />}
            {p.dots && <path d={p.dots} strokeWidth={s.dot} vectorEffect="non-scaling-stroke" />}
          </g>
        )
      })}
    </g>
  )
}

export function ImportLayer() {
  const pending = useSiteImport((s) => s.pending)
  if (!pending) return null
  const { hover, pick } = useSiteImport.getState()
  const picked = pending.kind === 'survey' ? pending.picked : null
  return (
    <g data-site-import="">
      {pending.kind === 'survey' && <SurveyLayers preview={pending.preview} strong={pending.hoverLayer} />}
      {pending.candidates.map((c, i) => {
        const on = pending.hover === i || picked === i
        return (
          <path
            key={i}
            data-candidate={i}
            data-picked={picked === i ? '' : undefined}
            d={pathOf([contourToPolygon(c.contour)])}
            fill={on ? 'var(--hover)' : 'transparent'}
            stroke={on ? 'var(--ink)' : 'var(--ink-secondary)'}
            strokeWidth={on ? 2.5 : 1.5}
            strokeDasharray={picked === i ? undefined : '7 4'}
            vectorEffect="non-scaling-stroke"
            style={{ cursor: 'pointer' }}
            onPointerEnter={() => hover(i)}
            onPointerLeave={() => hover(null)}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation()
              pick(i)
            }}
          >
            <title>{`${c.name} · ${Math.round(c.area).toLocaleString('en-US')} m²`}</title>
          </path>
        )
      })}
    </g>
  )
}
