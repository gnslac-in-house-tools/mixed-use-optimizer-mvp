// The parallel coordinates (Decision "Specimens tab"; Galapagos' middle pane): one axis per objective, better at the
// top of each, one line per specimen the list shows (the front, the feasible ones or all), the design dashed. Lines
// that cross are objectives at odds; lines that run together, objectives that move together. Dragging on an axis keeps
// a range of it (the list, the scatter and these lines leave the rest faint); a click on an axis lets its range go.
// Anywhere else the pointer marks the nearest line and a click picks it.
import { memo, useMemo, useState } from 'react'
import { beginDrag } from '../../../host.ts'
import type { Described } from '../../run/protocol.ts'
import { compact, extent, inFilters, type Filters, type Row } from './rows.ts'
import { useSize } from './useSize.ts'
import { useSpecimenView } from './viewState.ts'

const TOP = 14
const BOTTOM = 30
const SIDE = 16
/** How near an axis, in pixels, a drag sets its range. */
const ON_AXIS = 10
const NEAR = 6

export const Lines = memo(function Lines(props: {
  rows: Row[]
  problem: Described
  filters: Filters
  picked: number | null
  hover: number | null
  wide: boolean
}) {
  const { rows, problem, filters, picked, hover } = props
  const [ref, size] = useSize<HTMLDivElement>({ w: 280, h: 136 })
  const { w, h } = size
  const n = problem.objectives.length
  const design = problem.design.objectives
  const [drag, setDrag] = useState<{ axis: number; from: number; to: number } | null>(null)

  const axes = useMemo(() => {
    const step = n > 1 ? (w - 2 * SIDE) / (n - 1) : 0
    const bottom = h - BOTTOM
    return problem.objectives.map((o, i) => {
      const [lo, hi] = extent([...rows.map((r) => r.read[i]), ...(design[i] !== undefined ? [design[i]] : [])])
      // better up: a min objective's least at the top, a max one's most
      const t = (v: number) => Math.min(1, Math.max(0, (v - lo) / (hi - lo)))
      const y = (v: number) => (o.sense === 'min' ? TOP + t(v) * (bottom - TOP) : bottom - t(v) * (bottom - TOP))
      const value = (py: number) => {
        const f = Math.min(1, Math.max(0, (py - TOP) / (bottom - TOP)))
        return o.sense === 'min' ? lo + f * (hi - lo) : hi - f * (hi - lo)
      }
      return { o, x: SIDE + i * step, y, value, best: o.sense === 'min' ? lo : hi, worst: o.sense === 'min' ? hi : lo, step }
    })
  }, [problem, rows, design, w, h, n])

  const lineOf = useMemo(() => (read: number[]) => axes.map((a, i) => `${i ? 'L' : 'M'}${a.x.toFixed(1)} ${a.y(read[i]).toFixed(1)}`).join(''), [axes])

  const paths = useMemo(() => {
    let kept = ''
    let faint = ''
    for (const r of rows) {
      if (inFilters(r, filters)) kept += lineOf(r.read)
      else faint += lineOf(r.read)
    }
    return { kept, faint }
  }, [rows, filters, lineOf])

  if (n < 2) return null

  const local = (e: React.MouseEvent) => {
    const box = e.currentTarget.getBoundingClientRect()
    return { mx: e.clientX - box.left, my: e.clientY - box.top }
  }
  const axisAt = (mx: number) => axes.findIndex((a) => Math.abs(a.x - mx) <= ON_AXIS)
  const nearest = (mx: number, my: number) => {
    const k = Math.min(n - 2, Math.max(0, Math.floor((mx - SIDE) / (axes[1].x - axes[0].x))))
    const f = Math.min(1, Math.max(0, (mx - axes[k].x) / (axes[k + 1].x - axes[k].x)))
    let best: number | null = null
    let d = NEAR
    for (const r of rows) {
      const y = axes[k].y(r.read[k]) * (1 - f) + axes[k + 1].y(r.read[k + 1]) * f
      if (Math.abs(y - my) < d) {
        d = Math.abs(y - my)
        best = r.s.id
      }
    }
    return best
  }
  const row = (id: number | null) => (id === null ? null : (rows.find((r) => r.s.id === id) ?? null))
  const shownPick = row(picked)
  const shownHover = hover !== picked ? row(hover) : null
  // a label's room: half the way to its neighbour each side; the first and the last lean outward, on the edge
  const chars = (i: number, step: number) => Math.max(4, Math.floor((i === 0 || i === n - 1 ? step / 2 + SIDE - 6 : step - 6) / 6))
  const cut = (s: string, k: number) => (s.length > k ? `${s.slice(0, k - 1)}…` : s)

  return (
    <div ref={ref} className={`relative min-h-0 ${props.wide ? 'h-full' : 'h-[8.5rem]'}`}>
      <svg
        role="img"
        aria-label={`Parallel coordinates: ${rows.length} specimens on ${n} objectives, better at the top; drag on an axis to keep a range`}
        width={w}
        height={h}
        className="absolute inset-0 block touch-none select-none"
        onPointerDown={(e) => {
          const { mx, my } = local(e)
          const axis = axisAt(mx)
          if (axis < 0) return
          beginDrag(e)
          setDrag({ axis, from: my, to: my })
        }}
        onPointerMove={(e) => {
          const { mx, my } = local(e)
          if (drag) return setDrag({ ...drag, to: my })
          const id = axisAt(mx) < 0 ? nearest(mx, my) : null
          if (id !== useSpecimenView.getState().hover) useSpecimenView.getState().set({ hover: id })
        }}
        onPointerUp={() => {
          if (!drag) return
          const a = axes[drag.axis]
          // a click on an axis lets its range go; a drag keeps one
          if (Math.abs(drag.to - drag.from) < 4) useSpecimenView.getState().filter(drag.axis, null)
          else {
            const [p, q] = [a.value(drag.from), a.value(drag.to)]
            useSpecimenView.getState().filter(drag.axis, [Math.min(p, q), Math.max(p, q)])
          }
          setDrag(null)
        }}
        onPointerLeave={() => !drag && useSpecimenView.getState().set({ hover: null })}
        onClick={(e) => {
          const { mx, my } = local(e)
          if (axisAt(mx) < 0) useSpecimenView.getState().set({ picked: nearest(mx, my) })
        }}
      >
        <path d={paths.faint} fill="none" className="stroke-ink-tertiary" strokeOpacity={0.15} />
        <path d={paths.kept} fill="none" className="stroke-ink-secondary" strokeOpacity={0.45} />
        {design.length === n && <path data-design d={lineOf(design)} fill="none" className="stroke-ink" strokeWidth={1.5} strokeDasharray="4 3" />}
        {shownHover && <path d={lineOf(shownHover.read)} fill="none" className="stroke-ink-secondary" strokeWidth={2} />}
        {shownPick && (
          <g data-picked={shownPick.s.id}>
            <path d={lineOf(shownPick.read)} fill="none" className="stroke-panel" strokeWidth={4.5} />
            <path d={lineOf(shownPick.read)} fill="none" className="stroke-ink" strokeWidth={2} />
          </g>
        )}
        {axes.map((a, i) => {
          const range = drag?.axis === i ? [drag.from, drag.to] : filters[i] ? [a.y(filters[i][0]), a.y(filters[i][1])] : null
          const anchor = i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'
          const tx = i === 0 ? a.x - 6 : i === n - 1 ? a.x + 6 : a.x
          return (
            <g key={a.o.id} data-axis={i} className="cursor-ns-resize">
              <title>{`${a.o.label}: ${a.o.sense === 'min' ? 'the least' : 'the most'} at the top; drag to keep a range, click to let it go`}</title>
              <rect x={a.x - ON_AXIS} y={TOP} width={2 * ON_AXIS} height={Math.max(0, h - BOTTOM - TOP)} fill="transparent" />
              <line x1={a.x} x2={a.x} y1={TOP} y2={h - BOTTOM} className="stroke-ink-tertiary" />
              {range && (
                <rect
                  data-range={i}
                  x={a.x - 5}
                  y={Math.min(range[0], range[1])}
                  width={10}
                  height={Math.abs(range[1] - range[0])}
                  rx={2}
                  className="fill-ink stroke-ink"
                  fillOpacity={0.12}
                />
              )}
              <text x={tx} y={TOP - 4} textAnchor={anchor} className="fill-ink-secondary text-[10px] tabular-nums">
                {compact(a.best, a.o.unit)}
              </text>
              <text x={tx} y={h - BOTTOM + 11} textAnchor={anchor} className="fill-ink-secondary text-[10px] tabular-nums">
                {compact(a.worst, a.o.unit)}
              </text>
              <text x={tx} y={h - 3} textAnchor={anchor} className="fill-ink text-[10px]">
                {cut(a.o.label, chars(i, a.step || w))}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
})
