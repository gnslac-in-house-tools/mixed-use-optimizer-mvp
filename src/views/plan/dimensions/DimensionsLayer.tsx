// The project's hand-drawn dimensions on the plan (port of Plaza-Practiko `vistas/planta/CapaAcotaciones.tsx` and
// `edicion/ManijasAcotaciones.tsx`), when "Dims" is on: those of the active level (none in All). With the Select tool a click picks one (it turns dark) and
// Delete removes it. The selected one has its lock on the line, opposite its number (a click fixes its length or frees it);
// one with a fixed length that is not selected shows a smaller lock. It is not the padlock of the masses (they are seen and
// not picked while locked, Phase AS.3): a fixed length is kept, moving one of its masses drags the other. A click on the selected one's number, or a double click on
// its line, opens a field: Enter types its length (the geometry moves), Escape or leaving it cancels. Hidden (views/layers: Dimensions, or one dimension's own
// key, Hide for one object) it is not drawn or picked and still counts.
import { useMemo, useState, type KeyboardEvent, type PointerEvent } from 'react'
import type { Dimension, Id, Point } from '../../../model/schema.ts'
import { actions } from '../../../state/actions/index.ts'
import { useApp } from '../../../state/store.ts'
import { LockGlyph } from '../LockGlyph.tsx'
import { addToMix } from '../mix.ts'
import { wholeDrag } from '../pickedDrag.ts'
import type { Drag, Start } from '../useDrag.ts'
import { DIMENSIONS, isObjectHidden } from '../../layers/keys.ts'
import { useHidden, useHiddenSet } from '../../layers/layerView.ts'
import { useDimensions, useTool } from '../tools/toolState.ts'
import { DimensionFigure } from './DimensionFigure.tsx'
import { dimensionDrawing, dimensionText, type DimensionDrawing } from './drawing.ts'
import { typeDimensionLength } from './typeLength.ts'

/** From the dimension line to the lock's centre, on the side away from the number (px). */
const LOCK_PX = 9
/** The length field (px). */
const FIELD_W = 76
const FIELD_H = 24

/** The lock's place: the middle of the dimension line, on the side opposite the text. */
function lockPlace(d: DimensionDrawing, px: number): Point {
  const r = (d.text.angle * Math.PI) / 180
  // the text sits on the left of its reading direction (up when it reads left to right)
  const up = { x: -Math.sin(r), y: Math.cos(r) }
  const m = { x: (d.line.a.x + d.line.b.x) / 2, y: (d.line.a.y + d.line.b.y) / 2 }
  return { x: m.x - up.x * LOCK_PX * px, y: m.y - up.y * LOCK_PX * px }
}

/**
 * A press on a dimension: Shift+click adds it to what is picked (or takes it out); in a group of other things, or picked beside other kinds, it drags the whole pick (Phase AS.5 task 6);
 * otherwise it is picked alone (a dimension has no drag of its own: its number and its lock are its handles).
 */
function startDimensionDrag(id: Id, scale: number): Start {
  return (e) => {
    // Shift+click: it joins what is picked, of any kind, or leaves it (Decision "Mixed selection")
    if (e.shiftKey) {
      addToMix('dimension', id, e.altKey)
      return null
    }
    const whole = wholeDrag({ kind: 'dimension', id }, () => {
      const dim = useApp.getState().project.dimensions?.find((d) => d.id === id)
      return dim ? { points: [{ p: dim.a, kind: 'endpoint' as const, label: '' }, { p: dim.b, kind: 'endpoint' as const, label: '' }], walls: [], anchor: dim.a } : null
    }, scale, e)
    if (whole) return whole
    useApp.getState().select(null)
    useDimensions.getState().select(id)
    return null
  }
}

export function DimensionsLayer({ px, drag }: { px: number; drag: Drag }) {
  const all = useApp((s) => s.project.dimensions)
  const level = useApp((s) => s.level)
  const showAll = useApp((s) => s.showAll)
  const off = useHiddenSet()
  const dimensions = useMemo(() => (showAll ? [] : (all ?? []).filter((d) => d.levelId === level && !isObjectHidden(off, 'dimension', d.id))), [all, level, showAll, off])
  const visible = !useHidden(DIMENSIONS)
  const selected = useDimensions((s) => s.selected)
  const also = useDimensions((s) => s.also)
  const tool = useTool((s) => s.tool)
  const [editing, setEditing] = useState<Id | null>(null)
  if (!visible || !dimensions.length) return null
  const select = tool === 'select'

  return (
    <g data-layer="dimensions">
      {dimensions.map((dim) => {
        const d = dimensionDrawing(dim, px)
        if (!d) return null
        const on = dim.id === selected
        // picked with Shift+click beside the first (Decision "Mixed selection"): dark as it is, without its lock
        const marked = on || also.includes(dim.id)
        const color = marked ? 'var(--ink)' : 'var(--ink-secondary)'
        return (
          <g
            key={dim.id}
            data-dimension={dim.id}
            aria-selected={marked}
            style={{ cursor: select ? 'pointer' : undefined }}
            pointerEvents={select ? 'auto' : 'none'}
            {...drag.bind(`dimension-${dim.id}`, startDimensionDrag(dim.id, 1 / px))}
            onPointerDown={(e: PointerEvent) => {
              if (e.button !== 0) return
              e.stopPropagation()
              // the number of the dimension already selected: type its length (preventDefault: the press's mousedown
              // would take the focus from the new field, and leaving the field closes it)
              if (on && !dim.locked && e.target instanceof Element && e.target.tagName === 'text') {
                e.preventDefault()
                return setEditing(dim.id)
              }
              // the press is the drag's (Shift+click, the pick, the whole pick's drag: `startDimensionDrag`)
              drag.bind(`dimension-${dim.id}`, startDimensionDrag(dim.id, 1 / px)).onPointerDown(e as PointerEvent<SVGElement>)
            }}
            onDoubleClick={() => {
              if (!dim.locked) setEditing(dim.id)
            }}
          >
            {/* a wide invisible stroke makes the thin line easy to hit */}
            <path d={`M${d.line.a.x} ${-d.line.a.y}L${d.line.b.x} ${-d.line.b.y}`} stroke="transparent" strokeWidth={10} vectorEffect="non-scaling-stroke" />
            <DimensionFigure d={d} color={color} width={marked ? 2 : 1} />
            {on ? <LockButton dim={dim} at={lockPlace(d, px)} px={px} /> : dim.locked && <LockGlyph at={lockPlace(d, px)} px={px} size={8} />}
            {editing === dim.id && <LengthField d={d} px={px} id={dim.id} close={() => setEditing(null)} />}
          </g>
        )
      })}
    </g>
  )
}

function LockButton({ dim, at, px }: { dim: Dimension; at: Point; px: number }) {
  const locked = dim.locked === true
  const toggle = () => useApp.getState().apply((p) => actions.toggleDimensionLock(p, dim.id))
  return (
    <g
      role="button"
      tabIndex={0}
      aria-label="Fixed length"
      aria-pressed={locked}
      data-dimension-lock
      style={{ cursor: 'pointer' }}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation()
        toggle()
      }}
      onKeyDown={(e: KeyboardEvent) => {
        if (e.key !== 'Enter' && e.key !== ' ') return
        e.preventDefault()
        e.stopPropagation()
        toggle()
      }}
    >
      <title>{locked ? 'Its length is kept: moving one of its masses drags the other. Free its length' : 'Fix its length: moving one of its masses drags the other'}</title>
      {/* a hit area larger than the sign */}
      <circle cx={at.x} cy={-at.y} r={10 * px} fill="transparent" />
      <LockGlyph at={at} px={px} open={!locked} badge color={locked ? 'var(--ink)' : 'var(--ink-secondary)'} />
    </g>
  )
}

/** The length field over the number: in screen px at any zoom (its content is scaled back by `px`). */
function LengthField({ d, px, id, close }: { d: DimensionDrawing; px: number; id: Id; close(): void }) {
  const [text, setText] = useState(dimensionText(d.length).replace(/,/g, ''))
  const q = d.text.q
  return (
    <foreignObject x={q.x - (FIELD_W / 2) * px} y={-q.y - (FIELD_H / 2) * px} width={FIELD_W * px} height={FIELD_H * px}>
      <div style={{ width: FIELD_W, height: FIELD_H, transform: `scale(${px})`, transformOrigin: '0 0' }}>
        <input
          aria-label="Dimension length"
          autoFocus
          inputMode="decimal"
          value={text}
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => setText(e.target.value)}
          onPointerDown={(e) => e.stopPropagation()}
          onBlur={close}
          onKeyDown={(e) => {
            // the field's keys are the field's: the plan's shortcuts do not see them
            e.stopPropagation()
            if (e.key === 'Enter') {
              e.preventDefault()
              typeDimensionLength(id, text)
              close()
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
