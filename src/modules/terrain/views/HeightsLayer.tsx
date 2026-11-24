// The Heights tool on the plan (Decision "Terrain layout", Phase E.2b): every contour with its height written along it,
// by where it comes from (given: strong; the file's: plain; counted: italic; none: a red "?" and the contour dashed),
// the one under the pointer strong. A click on one opens a field where it was clicked: Enter gives it that height
// (`setContourHeight`, one undo step; the others are counted again from it), empty takes a given one back, Escape
// closes it (and, with none open, leaves the tool). Two neighbouring contours given say the interval and the way up.
import { useEffect, useState } from 'react'
import type { Point } from '../../../model/schema.ts'
import { actions } from '../../../state/actions/index.ts'
import { useApp } from '../../../state/store.ts'
import { useToast } from '../../../views/layout/toast.ts'
import type { ToolCamera } from '../../../views/plan/tools/common.tsx'
import { useSiteTool } from '../../../views/plan/site/siteTools.ts'
import { letGo } from '../../../views/tools/hand.ts'
import { contoursOf, heightText, type ContourDrawing } from './terrainDraw.ts'
import { t as tr } from '../../../i18n/idioma.ts' // mixed-use-mvp

const FIELD_W = 88
const FIELD_H = 24
/** The width of a contour's hit area, in screen px. */
const HIT_PX = 12

const linePath = (pts: Point[]) => `M${pts.map((p) => `${p.x.toFixed(2)},${(-p.y).toFixed(2)}`).join('L')}`

/** A typed height: a number (a decimal comma too), or empty to take it back; undefined: not one. */
export function typedHeight(text: string): number | null | undefined {
  const t = text.trim().replace(',', '.')
  if (t === '') return null
  const v = Number(t)
  return Number.isFinite(v) ? v : undefined
}

function look(c: ContourDrawing, on: boolean) {
  if (on) return { stroke: 'var(--ink)', width: 2.5, dash: undefined }
  if (c.from === null) return { stroke: 'var(--status-over)', width: 1, dash: '4 3' }
  if (c.from === 'given') return { stroke: 'var(--ink)', width: 1.5, dash: undefined }
  return { stroke: 'var(--ink-secondary)', width: 1, dash: undefined }
}

function HeightField({ c, at, px, close }: { c: ContourDrawing; at: Point; px: number; close(): void }) {
  const [text, setText] = useState(c.z !== null ? String(Math.round(c.z * 100) / 100) : '')
  const commit = () => {
    const z = typedHeight(text)
    if (z === undefined) {
      useToast.getState().show('error', `“${text}” is not a height: type it in metres (1205.5), or leave it empty to take a given one back.`)
      return
    }
    useApp.getState().apply((p) => actions.setContourHeight(p, c.index, z))
    close()
  }
  return (
    <foreignObject x={at.x - (FIELD_W / 2) * px} y={-at.y - (FIELD_H / 2) * px} width={FIELD_W * px} height={FIELD_H * px}>
      <div style={{ width: FIELD_W, height: FIELD_H, transform: `scale(${px})`, transformOrigin: '0 0' }}>
        <input
          aria-label="Contour height"
          autoFocus
          inputMode="decimal"
          placeholder="Height (m)"
          value={text}
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => setText(e.target.value)}
          onPointerDown={(e) => e.stopPropagation()}
          onBlur={close}
          onKeyDown={(e) => {
            // the field's keys are the field's: the plan's shortcuts and the tool's Escape do not see them
            e.stopPropagation()
            if (e.key === 'Enter') {
              e.preventDefault()
              commit()
            } else if (e.key === 'Escape') {
              e.preventDefault()
              close()
            }
          }}
          className="h-full w-full rounded-control border border-ink bg-panel px-1.5 text-center text-label text-ink shadow-control outline-none"
          style={{ fontVariantNumeric: 'tabular-nums' }}
        />
      </div>
    </foreignObject>
  )
}

export function HeightsLayer({ camera }: { camera: ToolCamera }) {
  const terrain = useApp((s) => s.project.site.terrain)
  const [hover, setHover] = useState<number | null>(null)
  const [editing, setEditing] = useState<{ index: number; at: Point } | null>(null)
  const open = editing !== null

  // Escape with no field open leaves the tool (the field's own Escape closes it)
  useEffect(() => {
    if (open) return
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') letGo()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [open])

  if (!terrain) return null
  const px = 1 / camera.scale
  const size = 10 * px
  const contours = contoursOf(terrain)
  const edited = editing ? contours[editing.index] : null
  return (
    <g data-heights="">
      {contours.map((c) => {
        const s = look(c, hover === c.index || editing?.index === c.index)
        const d = linePath(c.points)
        return (
          <g key={c.index} data-contour={c.index} data-from={c.from ?? 'none'}>
            <path d={d} fill="none" stroke={s.stroke} strokeWidth={s.width} strokeDasharray={s.dash} vectorEffect="non-scaling-stroke" pointerEvents="none" />
            <path
              d={d}
              fill="none"
              stroke="transparent"
              strokeWidth={HIT_PX}
              vectorEffect="non-scaling-stroke"
              style={{ cursor: 'pointer' }}
              onPointerEnter={() => setHover(c.index)}
              onPointerLeave={() => setHover((h) => (h === c.index ? null : h))}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation()
                setEditing({ index: c.index, at: camera.toWorld(e) })
              }}
            >
              <title>{c.z === null ? 'No height: click to give it one' : `${heightText(c.z)} m (${c.from === 'given' ? 'given' : c.from === 'file' ? 'the file’s' : 'counted'}): click to change it`}</title>
            </path>
            <text
              x={c.label.at.x}
              y={-c.label.at.y}
              dy={size * 0.35}
              transform={`rotate(${-c.label.angle} ${c.label.at.x} ${-c.label.at.y})`}
              textAnchor="middle"
              fontSize={size}
              fontWeight={c.from === 'given' ? 600 : 400}
              fontStyle={c.from === 'counted' ? 'italic' : undefined}
              fill={c.from === null ? 'var(--status-over)' : c.from === 'given' ? 'var(--ink)' : 'var(--ink-secondary)'}
              stroke="var(--panel)"
              strokeWidth={size * 0.35}
              paintOrder="stroke"
              pointerEvents="none"
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {c.z === null ? '?' : heightText(c.z)}
            </text>
          </g>
        )
      })}
      {editing && edited && <HeightField key={`${editing.index}`} c={edited} at={editing.at} px={px} close={() => setEditing(null)} />}
    </g>
  )
}

/** The tool's bar, top centre over the viewport while it is at work: what to do, how many have no height, Done. */
export function HeightsBar() {
  const on = useSiteTool((s) => s.tool === 'heights')
  const terrain = useApp((s) => s.project.site.terrain)
  if (!on || !terrain) return null
  const none = contoursOf(terrain).filter((c) => c.z === null).length
  return (
    <div className="pointer-events-none absolute inset-x-0 top-4 z-10 flex justify-center px-4 phone:top-3">
      <div role="toolbar" aria-label="Heights" className="glass pointer-events-auto flex max-w-full flex-wrap items-center gap-1.5 rounded-glass px-2 py-1 shadow-glass">
        <span className="min-w-0 px-1 text-label text-ink" title="Two neighbouring contours given say the interval and the way up; the others are counted from them. Where the count is wrong (a hilltop, a valley), give that one its height.">
          <span className="font-semibold">{tr("Heights")}</span> · click a contour and type its height
          {none > 0 && <span className="text-status-over"> · {none} without one</span>}
        </span>
        <span aria-hidden className="mx-0.5 h-4 w-px bg-separator" />
        <button type="button" title="Leave Heights (Escape)" onClick={() => letGo()} className="pressable h-row shrink-0 rounded-control bg-fill px-2.5 text-label text-ink hover:bg-hover">
          {tr("Done")}
        </button>
      </div>
    </div>
  )
}
