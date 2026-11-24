// The lock drawn on the plan (Decision "Locks, typed measures, levels"): the same sign as the `lock` icon, sized in
// screen px through `px` (metres per px) so it reads the same at any zoom. `badge` puts it on a paper disc, as on a
// dimension line (port of the `Candado` of Plaza-Practiko `vistas/planta/edicion/ManijasAcotaciones.tsx`).
import { ICON_PATHS } from '../controls/Icon.tsx'
import type { Point } from '../../model/schema.ts'

export function LockGlyph(props: { at: Point; px: number; open?: boolean; badge?: boolean; size?: number; color?: string }) {
  const { at, px, open = false, badge = false, size = 10, color = 'var(--ink-secondary)' } = props
  const s = (size * px) / 16
  return (
    <g pointerEvents="none">
      {badge && <circle cx={at.x} cy={-at.y} r={size * 0.8 * px} fill="var(--panel)" stroke={color} strokeWidth={1} vectorEffect="non-scaling-stroke" />}
      <path
        d={ICON_PATHS[open ? 'unlock' : 'lock']}
        transform={`translate(${at.x - 8 * s} ${-at.y - 8 * s}) scale(${s})`}
        fill="none"
        stroke={color}
        strokeWidth={1.25}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </g>
  )
}
