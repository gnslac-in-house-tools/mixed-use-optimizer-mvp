// What snapping looks like on the plan (port of Plaza-Practiko `vistas/planta/iman/MarcaIman.tsx` + `CapaGuias.tsx`):
// dashed guides for aligned walls, tracking / ortho lines across the view, the sign of the point it stuck to (the
// same one as in the toolbar chip). No label (the user: "these little notes are too much, always take them out"): the
// mark's `label` stays in its data, for tests and screen readers' sake, but is not drawn.
// In the snap colour, apart from the plan's greys (the grid, the contours): what aligned reads at a glance.
// Sizes are in screen pixels: `px` = metres per pixel. World y goes up, SVG y goes down, hence the -y.
import { signPath } from './kinds.ts'
import type { SnapMark as Mark } from './move.ts'

const SIGN_PX = 5
/** Half length of a tracking line (screen px): more than any screen is wide. */
const LINE_HALF_PX = 2500

export function SnapMark({ mark, px }: { mark: Mark | null; px: number }) {
  if (!mark) return null
  return (
    <g data-snap={mark.kind ?? 'align'} pointerEvents="none" aria-hidden="true">
      {mark.guides.map((g, i) => (
        <line
          key={i}
          x1={g.a.x}
          y1={-g.a.y}
          x2={g.b.x}
          y2={-g.b.y}
          stroke="var(--snap)"
          strokeWidth={1}
          strokeDasharray="5 4"
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {/* Tracking and ortho lines: a fixed length in screen px each side of the point, so the browser never draws
          thousands of dashes (Plaza clips them to the view for the same reason). */}
      {(mark.lines ?? []).map((l, i) => (
        <line
          key={`t${i}`}
          data-line={l.label}
          x1={mark.at.x - l.u.x * LINE_HALF_PX * px}
          y1={-(mark.at.y - l.u.y * LINE_HALF_PX * px)}
          x2={mark.at.x + l.u.x * LINE_HALF_PX * px}
          y2={-(mark.at.y + l.u.y * LINE_HALF_PX * px)}
          stroke="var(--snap)"
          strokeOpacity={0.85}
          strokeWidth={1}
          strokeDasharray="5 4"
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {mark.kind && (
        <path
          transform={`translate(${mark.at.x} ${-mark.at.y})`}
          d={signPath(mark.kind, SIGN_PX * px)}
          fill="none"
          stroke="var(--snap)"
          strokeWidth={2}
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      )}
    </g>
  )
}
