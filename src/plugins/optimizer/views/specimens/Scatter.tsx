// The scatter (Decision "Specimens tab"): every specimen built, on two axes the designer picks (two objectives, or one
// against the generation it was born in: how the run got better). The front as dots, the rest as small grey ones, the
// ones that break a must-hold as ✕, the design as ◇; the ranges dragged on the parallel coordinates leave the rest
// faint. The feasible ones and the design set the frame: an infeasible one far outside it is counted, not drawn. The axes run as their values do (up, right: more); each says which way is better. A click picks the nearest
// specimen (anywhere else: none), the pointer marks it in the lines and the list too. Thousands of dots are one path
// each kind, so the scatter redraws as fast as a generation arrives.
import { memo, useMemo } from 'react'
import { whole } from '../../../../views/format.ts'
import type { Described } from '../../run/protocol.ts'
import { selectClass } from '../kit.ts'
import { compact, extent, inFilters, valueOn, type Axis, type Filters, type Row } from './rows.ts'
import { useSize } from './useSize.ts'
import { useSpecimenView } from './viewState.ts'
import { t as tr } from '../../../../i18n/idioma.ts' // mixed-use-mvp

/** Room for the axes' figures: on the left, the y's; below, the x's. */
const LEFT = 30
const BOTTOM = 14
const PAD = 6
/** How near, in pixels, the pointer picks a specimen. */
const NEAR = 9

export const Scatter = memo(function Scatter(props: {
  rows: Row[]
  problem: Described
  filters: Filters
  x: Axis
  y: Axis
  picked: number | null
  hover: number | null
  /** Wide under the viewport: as tall as its column; in the panel, as wide as it and a little less tall. */
  wide: boolean
}) {
  const { rows, problem, filters, x, y, picked, hover } = props
  const [ref, size] = useSize<HTMLDivElement>({ w: 280, h: 180 })
  const { w, h } = size
  const design = problem.design.objectives

  const scale = useMemo(() => {
    // the feasible ones and the design set the frame; an infeasible one outside it stands on its edge
    const framing = rows.some((r) => r.feasible) ? rows.filter((r) => r.feasible) : rows
    const span = (axis: Axis) => {
      const values = framing.map((r) => valueOn(r, axis))
      if (axis !== 'generation' && design[axis] !== undefined) values.push(design[axis])
      const [lo, hi] = extent(values)
      const pad = (hi - lo) * 0.04
      return [lo - pad, hi + pad] as const
    }
    const [x0, x1] = span(x)
    const [y0, y1] = span(y)
    return {
      x0,
      x1,
      y0,
      y1,
      px: (v: number) => LEFT + ((v - x0) / (x1 - x0)) * (w - LEFT - PAD),
      py: (v: number) => PAD + (1 - (v - y0) / (y1 - y0)) * (h - PAD - BOTTOM),
    }
  }, [rows, design, x, y, w, h])

  const points = useMemo(
    () =>
      rows
        .map((r) => ({ r, px: scale.px(valueOn(r, x)), py: scale.py(valueOn(r, y)) }))
        .filter((p) => p.px >= LEFT - 0.5 && p.px <= w - PAD + 0.5 && p.py >= PAD - 0.5 && p.py <= h - BOTTOM + 0.5),
    [rows, scale, x, y, w, h],
  )

  const paths = useMemo(() => {
    let rest = ''
    let faint = ''
    let crosses = ''
    const front: typeof points = []
    for (const p of points) {
      const at = `M${p.px.toFixed(1)} ${p.py.toFixed(1)}`
      if (!inFilters(p.r, filters)) faint += `${at}h0`
      else if (!p.r.feasible) crosses += `${at}m-2 -2l4 4m0 -4l-4 4`
      else if (p.r.front) front.push(p)
      else rest += `${at}h0`
    }
    return { rest, faint, crosses, front }
  }, [points, filters])

  const nearest = (e: React.PointerEvent | React.MouseEvent) => {
    const box = e.currentTarget.getBoundingClientRect()
    const mx = e.clientX - box.left
    const my = e.clientY - box.top
    let best: number | null = null
    let d = NEAR * NEAR
    for (const p of points) {
      const dd = (p.px - mx) ** 2 + (p.py - my) ** 2
      if (dd < d) {
        d = dd
        best = p.r.s.id
      }
    }
    return best
  }

  const at = (id: number | null) => (id === null ? null : (points.find((p) => p.r.s.id === id) ?? null))
  const shownPick = at(picked)
  const shownHover = hover !== picked ? at(hover) : null
  const designAt = x !== 'generation' && y !== 'generation' && design[x] !== undefined && design[y] !== undefined ? { px: scale.px(design[x]), py: scale.py(design[y]) } : null
  const fmt = (axis: Axis, v: number) => (axis === 'generation' ? whole(v) : compact(v, problem.objectives[axis].unit))
  const front = rows.filter((r) => r.front).length
  const broken = rows.filter((r) => !r.feasible).length
  const outside = rows.length - points.length

  return (
    <div className={`flex min-h-0 flex-col gap-1.5 ${props.wide ? 'h-full' : ''}`}>
      <div className="flex items-center gap-2">
        <AxisPicker axis="X" value={x} problem={problem} onChange={(v) => useSpecimenView.getState().set({ x: v, y })} />
        <AxisPicker axis="Y" value={y} problem={problem} onChange={(v) => useSpecimenView.getState().set({ x, y: v })} />
      </div>
      <div ref={ref} className={`relative min-h-0 ${props.wide ? 'flex-1' : 'aspect-[8/5]'}`}>
        <svg
          role="img"
          aria-label={`Specimens on ${axisLabel(x, problem)} and ${axisLabel(y, problem)}: ${whole(rows.length)}, ${whole(front)} on the front`}
          width={w}
          height={h}
          className="absolute inset-0 block cursor-crosshair touch-none select-none"
          onPointerMove={(e) => {
            const id = nearest(e)
            if (id !== useSpecimenView.getState().hover) useSpecimenView.getState().set({ hover: id })
          }}
          onPointerLeave={() => useSpecimenView.getState().set({ hover: null })}
          onClick={(e) => useSpecimenView.getState().set({ picked: nearest(e) })}
        >
          <rect x={LEFT} y={PAD} width={Math.max(0, w - LEFT - PAD)} height={Math.max(0, h - PAD - BOTTOM)} rx={4} className="fill-panel-sunken stroke-separator" />
          <text x={LEFT - 4} y={PAD + 8} textAnchor="end" className="fill-ink-secondary text-[10px] tabular-nums">
            {fmt(y, scale.y1)}
          </text>
          <text x={LEFT - 4} y={h - BOTTOM} textAnchor="end" className="fill-ink-secondary text-[10px] tabular-nums">
            {fmt(y, scale.y0)}
          </text>
          <text x={LEFT} y={h - 2} className="fill-ink-secondary text-[10px] tabular-nums">
            {fmt(x, scale.x0)}
          </text>
          <text x={w - PAD} y={h - 2} textAnchor="end" className="fill-ink-secondary text-[10px] tabular-nums">
            {fmt(x, scale.x1)}
          </text>
          {/* the broken ones under the rest, light: there are often as many as the others */}
          <path d={paths.crosses} className="stroke-status-over" strokeOpacity={0.2} strokeWidth={1} fill="none" />
          <path d={paths.faint} className="stroke-ink-tertiary" strokeOpacity={0.25} strokeWidth={3} strokeLinecap="round" />
          <path d={paths.rest} className="stroke-ink-tertiary" strokeOpacity={0.6} strokeWidth={3} strokeLinecap="round" />
          {paths.front.map((p) => (
            <circle key={p.r.s.id} data-front={p.r.s.id} cx={p.px} cy={p.py} r={3} className="fill-ink" />
          ))}
          {designAt && (
            <path
              data-design
              d={`M${designAt.px} ${designAt.py - 5}l5 5l-5 5l-5 -5z`}
              className="fill-panel stroke-ink"
              strokeWidth={1.5}
            />
          )}
          {shownHover && <circle cx={shownHover.px} cy={shownHover.py} r={5.5} fill="none" className="stroke-ink-secondary" strokeWidth={1.5} />}
          {shownPick && (
            <g data-picked={shownPick.r.s.id}>
              <circle cx={shownPick.px} cy={shownPick.py} r={6.5} fill="none" className="stroke-panel" strokeWidth={4} />
              <circle cx={shownPick.px} cy={shownPick.py} r={6.5} fill="none" className="stroke-ink" strokeWidth={2} />
            </g>
          )}
        </svg>
      </div>
      <p className="text-caption text-ink-secondary">
        <span className="text-ink">●</span> front {whole(front)} · <span className="text-ink-tertiary">●</span> the rest {whole(rows.length - front - broken)}
        {broken > 0 && (
          <>
            {' '}
            · <span className="text-status-over">✕</span> {whole(broken)} break a must-hold{outside > 0 && ` (${whole(outside)} off the chart)`}
          </>
        )}
        {designAt && ' · ◇ your design'}
      </p>
    </div>
  )
})

const axisLabel = (axis: Axis, problem: Described) => (axis === 'generation' ? 'the generation' : problem.objectives[axis].label)

/** An axis' objective (or the generation), and which way is better along it. */
function AxisPicker({ axis, value, problem, onChange }: { axis: 'X' | 'Y'; value: Axis; problem: Described; onChange(v: Axis): void }) {
  const o = value === 'generation' ? null : problem.objectives[value]
  const better = o ? (axis === 'X' ? (o.sense === 'min' ? '← better' : 'better →') : o.sense === 'min' ? '↓ better' : '↑ better') : null
  return (
    <label className="flex min-w-0 flex-1 items-center gap-1 text-caption text-ink-secondary">
      {axis}
      <select
        aria-label={`The scatter's ${axis}`}
        className={`${selectClass} min-w-0 flex-1`}
        value={String(value)}
        onChange={(e) => onChange(e.target.value === 'generation' ? 'generation' : Number(e.target.value))}
      >
        {problem.objectives.map((o, i) => (
          <option key={o.id} value={i}>
            {o.label}
          </option>
        ))}
        <option value="generation">{tr("Generation")}</option>
      </select>
      {better && <span className="shrink-0 whitespace-nowrap">{better}</span>}
    </label>
  )
}
