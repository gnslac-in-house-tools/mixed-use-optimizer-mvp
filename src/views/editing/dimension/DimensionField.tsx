// The typed dimension's field (D.1 task 4): beside the handle being dragged, in the viewport's frame (the site's plan, the
// block editor's), the live number and then what is typed, with a caret; red with the reason when refused, a note under it
// when the value was held (a court's depth to 200 m). Drawn in screen px at any zoom (`px`: m per px), as the plan's labels.
// It takes no press: the handle under it keeps the pointer. `mode` is the viewport's: a drag shows its field where it is.
// A field is its viewport's: when it unmounts (the block editor closed, the plan gone) the drag it showed is forgotten, and when a
// window opens or closes (`useUi.dialog`) every correction standing lets go, so no digit is swallowed for an object no longer in view.
import { useEffect, useRef } from 'react'
import { useUi } from '../../layout/ui.ts'
import { resetTyped, useTyped } from './typed.ts'

const H_PX = 20
const CHAR_PX = 6.6
const PAD_PX = 12
const OFF_PX = 16
const LINE_PX = 14

export function DimensionField({ px, mode }: { px: number; mode: 'live' | 'ghost' }) {
  const cur = useTyped((s) => s.cur)
  const dialog = useUi((s) => s.dialog)
  const was = useRef(dialog)
  useEffect(() => {
    if (was.current === dialog) return
    was.current = dialog
    resetTyped()
  }, [dialog])
  useEffect(
    () => () => {
      if (useTyped.getState().cur?.mode === mode) resetTyped()
    },
    [mode],
  )
  if (!cur || cur.mode !== mode) return null
  // released (kept) it is only the correction's seat: the number goes with the drag or the typed value, and is back when a digit is typed or something must be said (a refusal, a held value)
  if (cur.phase === 'kept' && cur.text === '' && cur.error === null && !cur.note) return null
  const typed = cur.text !== ''
  const main = typed ? cur.text : cur.shown
  if (main === '' && !cur.error) return null
  const red = cur.error !== null
  const lines = [red ? cur.error! : cur.note].filter((x): x is string => !!x)
  const w = (Math.max(main.length + 1, ...lines.map((l) => l.length)) * CHAR_PX + PAD_PX) * px
  const h = (H_PX + lines.length * LINE_PX) * px
  const x = cur.at.x + OFF_PX * px
  const y = -cur.at.y - (OFF_PX + H_PX / 2) * px
  return (
    <g data-dimension-field={cur.measure} data-typing={typed || undefined} data-refused={red || undefined} aria-label="Typed dimension" pointerEvents="none">
      <rect x={x} y={y - (H_PX / 2) * px} width={w} height={h} rx={(H_PX / 2) * px} fill="var(--panel)" stroke={red ? 'var(--status-over)' : 'var(--ink)'} strokeWidth={1.25} vectorEffect="non-scaling-stroke" />
      <text x={x + (PAD_PX / 2) * px} y={y} dominantBaseline="central" fontSize={12 * px} fill={red ? 'var(--status-over)' : 'var(--ink)'} className="tabular-nums">
        {main}
        {typed && <tspan fill="var(--ink-secondary)">|</tspan>}
      </text>
      {lines.map((l, i) => (
        <text key={l} x={x + (PAD_PX / 2) * px} y={y + (H_PX / 2 + LINE_PX * (i + 0.5)) * px} dominantBaseline="central" fontSize={10.5 * px} fill={red ? 'var(--status-over)' : 'var(--ink-secondary)'}>
          {l}
        </text>
      ))}
    </g>
  )
}
