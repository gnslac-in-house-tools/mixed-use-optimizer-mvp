// The selection window being drawn (Decision "Multi-selection"), as in AutoCAD: a window (left → right) a solid line,
// a crossing (right → left) dashed. In world metres, y drawn down (camera.ts). The site's plan and the block's draw it.
import { isCrossing, type Box } from './windowSelect.ts'

export function SelectionWindow({ box }: { box: Box }) {
  return (
    <rect
      x={Math.min(box.a.x, box.b.x)}
      y={-Math.max(box.a.y, box.b.y)}
      width={Math.abs(box.b.x - box.a.x)}
      height={Math.abs(box.b.y - box.a.y)}
      fill="var(--hover)"
      stroke="var(--ink-secondary)"
      strokeWidth={1}
      strokeDasharray={isCrossing(box) ? '6 4' : undefined}
      vectorEffect="non-scaling-stroke"
      pointerEvents="none"
      data-selection-window={isCrossing(box) ? 'crossing' : 'window'}
    />
  )
}
