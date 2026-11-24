// The parking lots on the plan (Decision "Lot tool"), over the courts and under the masses:
//   LotsLayer   each lot's paving, its stalls and aisles, the stretch of wall it is anchored to, its label (its name
//               and stalls) and its entrance's arrow. A click picks it (Properties shows it; Delete removes it); a free
//               one dragged moves, snapped as a mass is (its corners onto the corners of what is drawn, its walls onto
//               their lines: Decision "Lot turn and snap"; Shift freely), and dropped against a wall it is anchored
//               there (it shows so while it is dragged)
//   LotHandles  the picked lot's: an anchored one's ends along its wall (stall by stall) and its outer edge (row by
//               row), a free one's far corner (its size) and the masses' rotation handle (Decision "Rotate handle": by
//               15° steps round its centre, Shift freely; an anchored one turns with its wall, so it has none); its
//               entrance's In pill, a click moves it to the other end
// Every edit is one verb through `actions` (a drag: one undo step). Hidden (views/layers: Lots, or one lot's own key) a lot is
// not drawn, picked, dragged or handled, and still counts in the stalls and the totals. A locked lot (Phase AS.4, Decision "Padlocks by kind"; the padlock is
// CAD's) is seen, with the lock's glyph above its name; it answers no press (the plan's background says it is locked), is not dragged and has no handles.
import { useMemo, useState, type KeyboardEvent } from 'react'
import type { Id, Lot, Point } from '../../../model/schema.ts'
import { contourFromPolygon } from '../../../engine/geom/contour.ts'
import { centroid } from '../../../engine/geom/polygon.ts'
import { actions } from '../../../state/actions/index.ts'
import { useApp } from '../../../state/store.ts'
import { pathOf } from '../../../views/plan/camera.ts'
import { rotateHandle, turnOf } from '../../../views/plan/editing.ts'
import { LABEL_PX } from '../../../views/plan/planStyle.ts'
import { snapLevels } from '../../../views/plan/reference.ts'
import { planStep } from '../../../views/plan/snap/grid.ts'
import { shapeOf, snapMove, targetsOf, tolerances } from '../../../views/plan/snap/move.ts'
import { useSnapSettings } from '../../../views/plan/snap/settings.ts'
import { sourcesFor } from '../../../views/plan/snap/sources.ts'
import type { Drag, Mover, Start } from '../../../views/plan/useDrag.ts'
import { isObjectHidden } from '../../../views/layers/keys.ts'
import { useHiddenSet } from '../../../views/layers/layerView.ts'
import { LockGlyph } from '../../../views/plan/LockGlyph.tsx'
import { useShown } from '../../../views/viewport/look.ts'
import { anchorFor, depthOf, WALK, type DerivedLot } from '../engine/lots.ts'
import { addToMix } from '../../../views/plan/mix.ts'
import { wholeDrag } from '../../../views/plan/pickedDrag.ts'
import { changeLot, lotOf, useLots } from './lotState.ts'

const HANDLE_PX = 10
/** The rotation handle's dot and what catches the pointer round it, as a mass's (MassHandles.tsx). */
const TURN_DOT_PX = 5.5
const TURN_HIT_PX = 30
const PILL_W_PX = 26
const PILL_H_PX = 16

const add = (a: Point, b: Point, k = 1): Point => ({ x: a.x + b.x * k, y: a.y + b.y * k })
const dot = (a: Point, b: Point) => a.x * b.x + a.y * b.y
const at = (l: DerivedLot, a: number, v: number) => add(add(l.frame.start, l.frame.along, a), l.frame.out, v)

/** The masses of the active option on the plan (what a lot stands against or keeps clear of). */
function optionMasses() {
  const { project, derived, option } = useApp.getState()
  const ids = project.options.find((o) => o.id === option)?.buildingIds ?? []
  return Object.values(derived.masses).filter((m) => ids.includes(m.buildingId))
}

/**
 * A lot pressed: picked (Shift: added to what is picked, or taken out); a free one dragged moves, snapped as a mass is (`snapMove`: its corners, middles and centre
 * onto those of what is drawn but itself, else its walls onto their lines, else the grid; Shift freely), and against
 * a wall is anchored there. `px`: metres per screen pixel, for the snap's apertures.
 */
function startLotDrag(id: Id, px: number): Start {
  return (e) => {
    // Shift+click: it joins what is picked, of any kind, and drags nothing (Decision "Mixed selection")
    if (e.shiftKey) {
      addToMix('lot', id)
      return null
    }
    // in a group of other things, or picked beside other kinds: the whole pick moves (Phase AS.5 task 6)
    const whole = wholeDrag({ kind: 'lot', id }, () => {
      const laid = useApp.getState().derived.circulation.lots.find((l) => l.id === id)
      return laid ? shapeOf(contourFromPolygon(laid.polygon)) : null
    }, 1 / px, e)
    if (whole) return whole
    useLots.getState().pick(id)
    const { project, option, derived } = useApp.getState()
    const lot = lotOf(project, option, id)
    const laid = derived.circulation.lots.find((l) => l.id === id)
    if (!lot || !laid) return null
    const rect = lot.rect
    if (!rect) return () => ({ ok: true, mark: null })
    const shape = shapeOf(contourFromPolygon(laid.polygon))
    const targets = targetsOf(sourcesFor(project, derived, [id], snapLevels()))
    const step = planStep(project, option)
    const mover: Mover = (delta, e) => {
      const r = e.shiftKey ? { delta, mark: null } : snapMove(delta, shape, targets, useSnapSettings.getState().settings, tolerances(1 / px), step)
      const moved = { ...rect, center: add(rect.center, r.delta) }
      const anchored = anchorFor(optionMasses(), moved, laid.sizes)
      useApp.getState().preview((p) => actions.setLot(p, option, id, anchored ? { anchor: anchored.anchor, rows: anchored.rows, rect: null } : { rect: moved }))
      return { ok: true, mark: r.mark }
    }
    return mover
  }
}

/** A free lot's rotation handle, as a rect mass's (Decision "Rotate handle"): its pivot, its stem and its dot. */
const lotTurnHandle = (rect: NonNullable<Lot['rect']>, px: number) => rotateHandle({ kind: 'rect', ...rect }, px)

/**
 * A free lot's rotation handle dragged round its centre: it turns by 15° steps to whole steps of its own angle, Shift
 * freely (`turnOf`, the masses' own); one verb, `setLot` with its rect turned. `onTurn` gets the turn so far.
 */
function startLotRotateDrag(id: Id, onTurn: (degrees: number) => void): Start {
  return (_e, grabbed) => {
    const { project, option } = useApp.getState()
    const rect = lotOf(project, option, id)?.rect
    if (!rect) return null
    onTurn(0)
    return (delta, e) => {
      const turn = turnOf(rect.center, grabbed, delta, rect.rotation, e.shiftKey)
      if (turn === null) return { ok: true, mark: null }
      const rotation = (((rect.rotation + turn) % 360) + 360) % 360
      useApp.getState().preview((p) => actions.setLot(p, option, id, { rect: { ...rect, rotation } }))
      onTurn(turn)
      return { ok: true, mark: null }
    }
  }
}

/** The rows nearest a depth out of the wall (at least one). */
function rowsNear(v: number, l: DerivedLot): number {
  let best = 1
  for (let r = 1; r <= 60; r++) if (Math.abs(depthOf(r, l.sizes) - v) < Math.abs(depthOf(best, l.sizes) - v)) best = r
  return best
}

/** A handle of the picked lot dragged: an end along its wall, its outer edge, or a free one's corner. */
function startHandleDrag(id: Id, which: 'from' | 'to' | 'rows' | 'corner'): Start {
  return () => {
    const { project, option, derived } = useApp.getState()
    const lot = lotOf(project, option, id)
    const l = derived.circulation.lots.find((x) => x.id === id)
    if (!lot || !l) return null
    const f = l.frame
    const sw = l.sizes.stallWidth
    const wall = l.anchor?.length ?? 0
    const patch = (d: Point): Parameters<typeof changeLot>[1] | null => {
      if (which === 'rows') return { rows: rowsNear(f.v1 + dot(d, f.out) - WALK, l) }
      if (which === 'corner' && lot.rect) {
        const width = Math.max(2 * sw, f.a1 + dot(d, f.along))
        const depth = Math.max(depthOf(1, l.sizes), f.v1 + dot(d, f.out))
        return { rect: { ...lot.rect, width, depth, center: add(add(f.start, f.along, width / 2), f.out, depth / 2) } }
      }
      if (!lot.anchor) return null
      const snap = (a: number) => Math.round(a / sw) * sw
      let a0 = f.a0
      let a1 = f.a1
      if (which === 'from') a0 = Math.max(0, Math.min(a1 - 2 * sw, snap(f.a0 + dot(d, f.along))))
      else a1 = Math.min(wall, Math.max(a0 + 2 * sw, snap(f.a1 + dot(d, f.along))))
      const whole = a0 < 1e-6 && a1 > wall - 1e-6
      const { from: _, length: __, ...side } = lot.anchor
      return { anchor: whole ? side : { ...side, from: a0, length: a1 - a0 } }
    }
    const mover: Mover = (delta) => {
      const next = patch(delta)
      useApp.getState().preview((p) => (next ? actions.setLot(p, option, id, next) : p))
      return { ok: next !== null, mark: null }
    }
    return mover
  }
}

/** The stalls and aisles of a lot (also the Lot tool's preview). */
export function LotShape({ l, px, picked = false, ghost = false }: { l: DerivedLot; px: number; picked?: boolean; ghost?: boolean }) {
  const warned = l.left > 0 || !l.reached || (l.fits !== null && l.rows > l.fits)
  return (
    <g pointerEvents="none" opacity={ghost ? 0.6 : 1}>
      <path d={pathOf([l.polygon])} fill="var(--road)" stroke={picked ? 'var(--ink)' : ghost ? 'var(--ink-secondary)' : warned ? 'var(--status-over)' : 'var(--road-axis)'} strokeWidth={picked ? 2 : 1} strokeDasharray={ghost || (warned && !picked) ? '6 4' : undefined} vectorEffect="non-scaling-stroke" />
      {l.stalls.length > 0 && <path d={pathOf(l.stalls)} fill="var(--stall)" stroke="var(--road-axis)" strokeWidth={0.75} vectorEffect="non-scaling-stroke" />}
      {l.aisles.map(([a, b], i) => (
        <path key={i} d={`M${a.x} ${-a.y}L${b.x} ${-b.y}`} fill="none" stroke="var(--road-axis)" strokeWidth={1} strokeDasharray="10 6" vectorEffect="non-scaling-stroke" />
      ))}
      {/* the stretch of wall it is anchored to */}
      {l.anchor && <path d={`M${l.anchor.wall[0].x} ${-l.anchor.wall[0].y}L${l.anchor.wall[1].x} ${-l.anchor.wall[1].y}`} stroke="var(--ink)" strokeWidth={3} strokeLinecap="round" vectorEffect="non-scaling-stroke" data-lot-wall={l.id} />}
      {/* its entrance: an arrow into the end of its first aisle */}
      {!ghost && <Arrow l={l} px={px} />}
    </g>
  )
}

function Arrow({ l, px }: { l: DerivedLot; px: number }) {
  const { at: p, out } = l.entrance
  const n = { x: -out.y, y: out.x }
  const tip = add(p, out, -2 * px)
  const back = add(p, out, 14 * px)
  const a = add(back, n, 6 * px)
  const b = add(back, n, -6 * px)
  return <path d={`M${tip.x} ${-tip.y}L${a.x} ${-a.y}L${b.x} ${-b.y}Z`} fill={l.reached ? 'var(--ink)' : 'var(--status-over)'} data-lot-entrance={l.id} />
}

export function LotsLayer({ px, drag, interactive }: { px: number; drag: Drag; interactive: boolean }) {
  const all = useShown((s) => s.derived.circulation.lots)
  const project = useShown((s) => s.project)
  const option = useApp((s) => s.option)
  const off = useHiddenSet()
  const lots = useMemo(() => all.filter((l) => !isObjectHidden(off, 'lot', l.id)), [all, off])
  const picked = useLots((s) => s.picked)
  const also = useLots((s) => s.also)
  if (lots.length === 0) return null
  return (
    <g data-layer="lots">
      {lots.map((l) => {
        const c = centroid(l.polygon)
        const on = l.id === picked || also.includes(l.id)
        const locked = lotOf(project, option, l.id)?.locked === true
        return (
          <g key={l.id} data-lot-shape={l.id} aria-selected={on}>
            <LotShape l={l} px={px} picked={on} />
            {/* what takes the presses: the lot's outline */}
            <path
              d={pathOf([l.polygon])}
              fill="transparent"
              data-lot={l.id}
              aria-label={l.name}
              {...(interactive && locked
                ? { style: { cursor: 'default' } }
                : interactive
                  ? { ...drag.bind(`lot-${l.id}`, startLotDrag(l.id, px)), style: { cursor: drag.key === `lot-${l.id}` ? 'grabbing' : 'pointer' } }
                  : { pointerEvents: 'none' as const })}
            />
            {locked && (
              <g data-lock={l.id}>
                <LockGlyph at={{ x: c.x, y: c.y + 20 * px }} px={px} size={11} />
              </g>
            )}
            <text
              x={c.x}
              y={-c.y}
              textAnchor="middle"
              fontSize={LABEL_PX * px}
              fill="var(--ink)"
              stroke="var(--panel)"
              strokeWidth={LABEL_PX * 0.25 * px}
              strokeLinejoin="round"
              paintOrder="stroke"
              pointerEvents="none"
              data-lot-label={l.id}
            >
              <tspan x={c.x} dy={-0.15 * LABEL_PX * px} fontWeight={600}>
                {l.name}
              </tspan>
              <tspan x={c.x} dy={1.2 * LABEL_PX * px}>
                {`${l.stalls.length.toLocaleString('en-US')} stalls`}
              </tspan>
            </text>
          </g>
        )
      })}
    </g>
  )
}

export function LotHandles({ px, drag }: { px: number; drag: Drag }) {
  const picked = useLots((s) => s.picked)
  const l = useShown((s) => s.derived.circulation.lots.find((x) => x.id === picked))
  const lot = useApp((s) => (picked ? lotOf(s.project, s.option, picked) : undefined))
  const off = useHiddenSet()
  const [turned, setTurned] = useState(0)
  // a locked lot has no handles (the padlock is CAD's: it is seen, not changed)
  if (!l || !lot || lot.locked === true || isObjectHidden(off, 'lot', l.id)) return null
  const f = l.frame
  const mid = (f.v0 + f.v1) / 2
  const handles: { which: 'from' | 'to' | 'rows' | 'corner'; q: Point; title: string }[] = lot.anchor
    ? [
        { which: 'from', q: at(l, f.a0, mid), title: 'Drag along the wall: where it starts, stall by stall' },
        { which: 'to', q: at(l, f.a1, mid), title: 'Drag along the wall: where it ends, stall by stall' },
        { which: 'rows', q: at(l, (f.a0 + f.a1) / 2, f.v1), title: 'Drag out or in: a row more or less' },
      ]
    : [{ which: 'corner', q: at(l, f.a1, f.v1), title: 'Drag: its size' }]
  return (
    <g data-layer="lot-handles">
      {handles.map((h) => (
        <circle
          key={h.which}
          data-lot-handle={h.which}
          cx={h.q.x}
          cy={-h.q.y}
          r={(HANDLE_PX / 2) * px}
          fill="var(--panel)"
          stroke="var(--ink)"
          strokeWidth={1.5}
          vectorEffect="non-scaling-stroke"
          style={{ cursor: 'move', touchAction: 'none' }}
          {...drag.bind(`lot-h-${l.id}-${h.which}`, startHandleDrag(l.id, h.which))}
        >
          <title>{h.title}</title>
        </circle>
      ))}
      {lot.rect && <TurnHandle id={l.id} rect={lot.rect} px={px} drag={drag} turned={turned} onTurn={setTurned} />}
      <EntrancePill l={l} lot={lot} px={px} />
    </g>
  )
}

/** A free lot's rotation handle: a stem off its up side and a white dot; while it turns, its angle and the turn. */
function TurnHandle({ id, rect, px, drag, turned, onTurn }: { id: Id; rect: NonNullable<Lot['rect']>; px: number; drag: Drag; turned: number; onTurn(d: number): void }) {
  const key = `lot-rotate-${id}`
  const turning = drag.key === key
  const h = lotTurnHandle(rect, px)
  const sign = turned > 0 ? '+' : ''
  return (
    <>
      <g {...drag.bind(key, startLotRotateDrag(id, onTurn))} style={{ cursor: turning ? 'grabbing' : 'grab', touchAction: 'none' }}>
        <title>Drag round the lot: turn it by 15° steps, Shift freely</title>
        <line x1={h.stem.x} y1={-h.stem.y} x2={h.at.x} y2={-h.at.y} stroke="var(--ink)" strokeWidth={1.25} vectorEffect="non-scaling-stroke" pointerEvents="none" />
        <circle cx={h.at.x} cy={-h.at.y} r={(TURN_HIT_PX / 2) * px} fill="transparent" />
        <circle cx={h.at.x} cy={-h.at.y} r={TURN_DOT_PX * px} fill={turning ? 'var(--ink)' : 'var(--panel)'} stroke="var(--ink)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      </g>
      {turning && (
        <text x={h.at.x + 14 * px} y={-h.at.y} textAnchor="start" dominantBaseline="middle" fontSize={11 * px} fill="var(--ink)" stroke="var(--panel)" strokeWidth={3 * px} paintOrder="stroke" pointerEvents="none">
          {`${Math.round(rect.rotation * 10) / 10}° (${sign}${turned}°)`}
        </text>
      )}
    </>
  )
}

/** The In pill past the picked lot's entrance: a click moves it to the other end of its aisles. */
function EntrancePill({ l, lot, px }: { l: DerivedLot; lot: Lot; px: number }) {
  const c = add(l.entrance.at, l.entrance.out, 30 * px)
  const w = PILL_W_PX * px
  const h = PILL_H_PX * px
  const other = l.entrance.end === 'start' ? 'end' : 'start'
  const toggle = () => changeLot(lot.id, { entry: other })
  return (
    <g
      role="button"
      tabIndex={0}
      aria-label={`${l.name}’s entrance, at its ${l.entrance.names[l.entrance.end === 'start' ? 0 : 1].toLowerCase()}: move it to the other end`}
      data-lot-pill={l.id}
      style={{ cursor: 'pointer' }}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation()
        toggle()
      }}
      onKeyDown={(e: KeyboardEvent) => {
        if (e.key !== 'Enter' && e.key !== ' ') return
        e.preventDefault()
        toggle()
      }}
    >
      <title>{l.reached ? 'Its entrance: click to move it to the other end' : 'No street reaches its entrance: click to move it to the other end, or Connect draws one'}</title>
      <rect x={c.x - w / 2} y={-c.y - h / 2} width={w} height={h} rx={h / 2} fill="var(--panel)" stroke={l.reached ? 'var(--ink)' : 'var(--status-over)'} strokeWidth={1.25} vectorEffect="non-scaling-stroke" />
      <text x={c.x} y={-c.y} textAnchor="middle" dominantBaseline="central" fontSize={10 * px} fontWeight={600} fill="var(--ink)" pointerEvents="none">
        In
      </text>
    </g>
  )
}
