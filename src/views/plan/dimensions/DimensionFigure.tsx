// Draws one dimension (dimensions/drawing.ts) in the plan's SVG: world metres, y up, drawn as (x, −y).
import type { DimensionDrawing, Segment } from './drawing.ts'

const line = (s: Segment) => `M${s.a.x} ${-s.a.y}L${s.b.x} ${-s.b.y}`

export function DimensionFigure({ d, color = 'var(--ink-secondary)', width = 1 }: { d: DimensionDrawing; color?: string; width?: number }) {
  const { q, angle, anchor, content, size, above } = d.text
  return (
    <g>
      <path d={[...d.extensions, d.line, ...d.ticks].map(line).join('')} fill="none" stroke={color} strokeWidth={width} vectorEffect="non-scaling-stroke" />
      <text
        x={q.x}
        y={-q.y - above}
        transform={`rotate(${-angle} ${q.x} ${-q.y})`}
        textAnchor={anchor}
        fontSize={size}
        fill={color}
        stroke="var(--panel)"
        strokeWidth={size * 0.3}
        paintOrder="stroke"
        style={{ fontVariantNumeric: 'tabular-nums' }}
      >
        {content}
      </text>
    </g>
  )
}
