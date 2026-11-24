// A divider that drags to share a space between two parts: the plan and the 3D in Split, Parameters and Properties in
// the left panel. `fraction` is the first part's share (left or top), kept between 0.2 and 0.8; the arrow keys move
// it and a double click goes back to `reset`.
import { useRef, type RefObject } from 'react'
import { beginDrag } from './beginDrag.ts'
import { t as tr } from '../../i18n/idioma.ts' // mixed-use-mvp

const MIN_FRACTION = 0.2
const MAX_FRACTION = 0.8
const KEY_STEP = 0.02
const limit = (v: number) => Math.round(Math.min(MAX_FRACTION, Math.max(MIN_FRACTION, v)) * 100) / 100

export function Divider(props: {
  /** columns: the parts sit side by side (a vertical line); rows: one over the other (a horizontal line). */
  between: 'columns' | 'rows'
  label: string
  title: string
  /** The element both parts share: the pointer's position is read against it. */
  container: RefObject<HTMLElement | null>
  fraction: number
  reset: number
  onChange(f: number): void
}) {
  const { between, container, fraction, onChange } = props
  const columns = between === 'columns'
  const dragging = useRef(false)

  return (
    <div
      role="separator"
      aria-orientation={columns ? 'vertical' : 'horizontal'}
      aria-label={props.label}
      aria-valuemin={MIN_FRACTION * 100}
      aria-valuemax={MAX_FRACTION * 100}
      aria-valuenow={Math.round(fraction * 100)}
      tabIndex={0}
      title={props.title === undefined ? undefined : tr(props.title)}
      className={`group relative shrink-0 touch-none ${columns ? 'w-2 cursor-col-resize' : 'h-2 cursor-row-resize'}`}
      onPointerDown={(e) => {
        if (e.button !== 0) return // only the main button drags
        beginDrag(e)
        dragging.current = true
      }}
      onPointerMove={(e) => {
        if (!dragging.current) return
        const r = container.current?.getBoundingClientRect()
        if (!r) return
        if (columns && r.width > 0) onChange(limit((e.clientX - r.left) / r.width))
        if (!columns && r.height > 0) onChange(limit((e.clientY - r.top) / r.height))
      }}
      onPointerUp={() => {
        dragging.current = false
      }}
      onPointerCancel={() => {
        dragging.current = false
      }}
      onDoubleClick={() => onChange(props.reset)}
      onKeyDown={(e) => {
        const back = columns ? 'ArrowLeft' : 'ArrowUp'
        const ahead = columns ? 'ArrowRight' : 'ArrowDown'
        const d = e.key === back ? -KEY_STEP : e.key === ahead ? KEY_STEP : 0
        if (d === 0) return
        e.preventDefault()
        onChange(limit(fraction + d))
      }}
    >
      <div
        className={`absolute bg-separator group-hover:bg-ink-tertiary ${
          columns ? 'inset-y-3 left-1/2 w-px -translate-x-1/2' : 'inset-x-0 top-1/2 h-px -translate-y-1/2'
        }`}
      />
    </div>
  )
}
