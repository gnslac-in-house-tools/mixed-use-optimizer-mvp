// Docks and truck courts on the Massing plan (Decision "Exterior circulation", 4.3):
//   CourtsLayer  under the masses: each truck court (a shaped one as its shapes, a path of a sub-path to each), paved and dashed; its approach (the paved way from it to the road
//                that serves it a little way off, or past its side) paved, undashed; a court a warning names
//                (Decision "Truck court": into a mass, off the site, a shared one short of its depth) dashed in the
//                warning colour
//   DocksLayer   over them: each docked wall as a heavy line with a tick per door, outwards
//   DockMarks    over the handles, for the one selected mass with docks (its own, or its program's): a mark beside each
//                wall that can take docks, clear of the wall's handle; filled where it docks, empty where not. A click
//                turns that wall's docks on or off; a filled mark dragged onto another wall moves its docks there
//                (Decision "Docks turn with the building"; the user: "the docks could have a centre point to drag to the
//                side you want"), Alt+dragged copies them there (Decision "Alt+drag copies"), the wall it would land on
//                drawn while it is dragged. Either way the mass then has its own docks; one undo step
//   DoorSlots    on the structural grid (Phase G.3b), for that mass: a square beside each module of its docked walls, a
//                click adds or takes away its door
//   CourtPills   for that mass, a pill on each court's outer edge saying its depth: dragged out or in, the court deeper
//                or shallower (the wall's own, Decision "Truck court"), by the half metre; one undo step
//   CourtGaps    the yard between two warehouses whose docked walls face each other (ST.6): a dimension wall to wall,
//                in the warning colour under the deeper court's depth; with one of the two picked, a click on its
//                figure types the gap and the one picked moves (with its group), straight across; one undo step
// A locked mass (the padlock is CAD's) is seen and not changed: its docks and courts stay drawn, and DockMarks, DoorSlots
// and CourtPills draw nothing for it, so none of them can edit it (settle.ts holds it as well).
// The truck courts have an eye (views/layers, Courts): hidden, CourtsLayer, CourtPills and CourtGaps draw nothing; the
// courts still count in the totals and the issues. A building's eye takes its courts and its docks with it (the one rule,
// `massDrawn` in views/buildingView.ts: a hidden building is not drawn, but the building the plan is on stays drawn
// where it is edited; a Compare pane has no such building: `compare`).
import { useCallback, useState } from 'react'
import { massIsLocked } from '../../../model/locks.ts'
import type { Id, Point, Polygon } from '../../../model/schema.ts'
import { COURT_DEPTH_MAX, COURT_DEPTH_MIN, courtShapes, dockableWalls, type Wall } from '../engine/docks.ts'
import type { CourtGap, DerivedDock } from '../../../engine/types.ts'
import { groupMembers } from '../../../engine/groups.ts'
import { DimensionFigure } from '../../../views/plan/dimensions/DimensionFigure.tsx'
import { dimensionDrawing } from '../../../views/plan/dimensions/drawing.ts'
import { moveTyped, startTyped, typedEnded } from '../../../views/editing/dimension/typed.ts'
import { useToast } from '../../../views/layout/toast.ts'
import { distancePointSegment } from '../../../engine/geom/polygon.ts'
import { actions } from '../../../state/actions/index.ts'
import { useApp } from '../../../state/store.ts'
import { COURTS } from '../../../views/layers/keys.ts'
import { useHidden, useHiddenSet } from '../../../views/layers/layerView.ts'
import { massDrawn, planBuilding } from '../../../views/buildingView.ts'
import { useShown } from '../../../views/viewport/look.ts'
import { pathOf } from '../../../views/plan/camera.ts'
import type { Drag, Mover, Start } from '../../../views/plan/useDrag.ts'

/** px: a door's tick, out of the wall; the wall's mark, out of the wall. */
const TICK_PX = 7
const MARK_PX = 26
const MARK_SIZE_PX = 11

/** Is this mass's building drawn on this plan? Its courts and docks follow (`compare`: a Compare pane, which has no building it is on). */
function useDrawnMass(compare = false): (massId: Id) => boolean {
  const masses = useShown((s) => s.derived.masses)
  const off = useHiddenSet()
  const planOn = useApp((s) => (compare ? null : planBuilding(s.project, s.level)))
  return useCallback((massId: Id) => massDrawn(masses, massId, off, planOn), [masses, off, planOn])
}

/** `approaches`: the ways into the courts the network paves (Flow's; Massing draws the courts alone). */
export function CourtsLayer({ approaches: paved = true, compare = false }: { approaches?: boolean; compare?: boolean }) {
  const drawn = useDrawnMass(compare)
  const docks = useShown((s) => s.derived.circulation.docks).filter((d) => drawn(d.massId))
  const all = useShown((s) => s.derived.circulation.approaches)
  const approaches = paved ? all : []
  const issues = useShown((s) => s.derived.issues)
  const hidden = useHidden(COURTS)
  if (hidden || docks.length === 0) return null
  // the courts a warning names: the first mass's (into another, off the site), both of a shared one's pair
  const warned = (d: DerivedDock) =>
    issues.some((i) => i.code === 'court' && i.massIds?.[0] !== undefined && (d.shares && i.massIds.length === 2 ? i.massIds.includes(d.massId) && i.massIds.includes(d.shares.massId) : i.massIds[0] === d.massId))
  return (
    <g data-layer="courts" pointerEvents="none">
      {approaches.length > 0 && <path data-approaches={approaches.length} d={pathOf(approaches)} fill="var(--court)" />}
      {docks.map((d) => (
        <path
          key={`${d.massId}-${d.wall}`}
          data-court={`${d.massId}:${d.wall}`}
          data-court-warned={warned(d) || undefined}
          d={pathOf(courtShapes(d))}
          fill="var(--court)"
          stroke={warned(d) ? 'var(--status-over)' : 'var(--ink-tertiary)'}
          strokeWidth={1}
          strokeDasharray="6 3"
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </g>
  )
}

export function DocksLayer({ px, compare = false }: { px: number; compare?: boolean }) {
  const drawn = useDrawnMass(compare)
  const docks = useShown((s) => s.derived.circulation.docks).filter((d) => drawn(d.massId))
  return (
    <g data-layer="docks">
      {docks.map((d) => {
        const tick = TICK_PX * px
        const ticks = d.doors.map((q) => `M${q.x} ${-q.y}L${q.x + d.out.x * tick} ${-(q.y + d.out.y * tick)}`).join('')
        return (
          <g key={`${d.massId}-${d.wall}`} data-dock={`${d.massId}:${d.wall}`} data-doors={d.doors.length} pointerEvents="none">
            <path d={`M${d.a.x} ${-d.a.y}L${d.b.x} ${-d.b.y}`} stroke="var(--ink)" strokeWidth={3.5} vectorEffect="non-scaling-stroke" />
            {ticks && <path d={ticks} stroke="var(--ink)" strokeWidth={1.25} vectorEffect="non-scaling-stroke" />}
          </g>
        )
      })}
    </g>
  )
}

/** The walls a mass docks on now (its own or its program's). */
const dockedTs = (id: Id) => useApp.getState().derived.circulation.docks.filter((k) => k.massId === id)

/** The dockable wall nearest to q (its distance to the wall's segment). */
function nearestWall(walls: Wall[], q: Point): Wall | null {
  let best: Wall | null = null
  let dm = Infinity
  for (const w of walls) {
    const dd = distancePointSegment(q, w.a, w.b)
    if (dd < dm) [best, dm] = [w, dd]
  }
  return best
}

/**
 * A mark pressed: a click turns its wall's docks on or off; a docked wall's mark dragged onto another wall moves them
 * there, Alt+dragged docks that wall too (`onTarget`: the wall it would land on, for the view).
 */
function startMarkDrag(id: Id, polygon: Polygon, wall: Wall, docked: boolean, onTarget: (i: number | null) => void): Start {
  return (e, start) => {
    const copy = e.altKey && docked
    const walls = dockableWalls(polygon)
    // the docked walls but these, as the t of each one's middle
    const now = dockedTs(id)
    const rest = (...skip: number[]) => now.filter((k) => !skip.includes(k.wall)).map((k) => k.t)
    const mover: Mover = (delta) => {
      if (!docked) return { ok: true, mark: null }
      const target = nearestWall(walls, { x: start.x + delta.x, y: start.y + delta.y })
      const moved = target !== null && target.i !== wall.i
      onTarget(moved ? target.i : null)
      useApp.getState().preview((p) => (moved ? actions.setMassDocks(p, id, [...(copy ? rest(target.i) : rest(wall.i, target.i)), target.t]) : p))
      return { ok: true, mark: null }
    }
    mover.copy = copy
    mover.click = () => useApp.getState().apply((p) => actions.setMassDocks(p, id, docked ? rest(wall.i) : [...rest(), wall.t]))
    return mover
  }
}

export function DockMarks({ px, drag }: { px: number; drag: Drag }) {
  // the one selected mass on the plan's level, when it docks: its own docks, or a program that gives it some
  const id = useApp((s) => {
    const ids = s.selection.massIds
    if (ids.length !== 1) return null
    const m = s.project.masses.find((x) => x.id === ids[0])
    if (!m || m.levelId !== s.level || massIsLocked(s.project, m)) return null
    const program = s.project.programs.find((g) => g.id === m.programId)
    return m.docks !== undefined || program?.docks ? m.id : null
  })
  return id ? <WallMarks id={id} px={px} drag={drag} /> : null
}

function WallMarks({ id, px, drag }: { id: Id; px: number; drag: Drag }) {
  const polygon = useShown((s) => s.derived.masses[id]?.polygon)
  const docks = useShown((s) => s.derived.circulation.docks)
  const [target, setTarget] = useState<number | null>(null)
  if (!polygon || polygon.length < 3) return null
  const docked = new Set(docks.filter((k) => k.massId === id).map((k) => k.wall))
  const walls = dockableWalls(polygon)
  const size = MARK_SIZE_PX * px
  const landing = drag.key?.startsWith(`dock-mark-${id}-`) ? walls.find((w) => w.i === target) : undefined
  return (
    <g data-layer="dock-marks">
      {landing && (
        <path
          data-dock-target={landing.i}
          d={`M${landing.a.x} ${-landing.a.y}L${landing.b.x} ${-landing.b.y}`}
          stroke="var(--ink)"
          strokeWidth={5}
          strokeDasharray="8 5"
          vectorEffect="non-scaling-stroke"
          pointerEvents="none"
        />
      )}
      {walls.map((w) => {
        const on = docked.has(w.i)
        const c = { x: (w.a.x + w.b.x) / 2 + w.out.x * MARK_PX * px, y: (w.a.y + w.b.y) / 2 + w.out.y * MARK_PX * px }
        return (
          <g
            key={w.i}
            role="button"
            aria-label={on ? `Docks on wall ${w.i + 1}: on` : `Docks on wall ${w.i + 1}: off`}
            aria-pressed={on}
            data-dock-mark={w.i}
            style={{ cursor: on ? 'grab' : 'pointer', touchAction: 'none' }}
            {...drag.bind(`dock-mark-${id}-${w.i}`, startMarkDrag(id, polygon, w, on, setTarget))}
          >
            <title>{on ? 'Docks on this wall: drag onto another wall to move them there, click to take them off' : 'No docks on this wall: click to put them on'}</title>
            <circle cx={c.x} cy={-c.y} r={size} fill="transparent" />
            <rect
              x={c.x - size / 2}
              y={-c.y - size / 2}
              width={size}
              height={size}
              rx={2 * px}
              fill={on ? 'var(--ink)' : 'var(--panel)'}
              stroke="var(--ink)"
              strokeWidth={1.5}
              vectorEffect="non-scaling-stroke"
            />
          </g>
        )
      })}
    </g>
  )
}

/** The one selected mass on the plan's level that is not locked (its doors and courts are edited from the plan), else null. */
function pickedFreeMass(s: ReturnType<typeof useApp.getState>): Id | null {
  if (s.selection.massIds.length !== 1) return null
  const m = s.project.masses.find((x) => x.id === s.selection.massIds[0])
  return m && m.levelId === s.level && !massIsLocked(s.project, m) ? m.id : null
}

/** px: a door slot's side, how far out of its wall it stands; the slots show once a module is this wide on screen. */
const SLOT_PX = 8
const SLOT_OUT_PX = 13
const SLOT_MIN_PX = 11

/**
 * The selected mass's doors on the grid (Phase G.3b, Decision "Grid layout"): a square beside each module of its docked
 * walls, filled where it has a door, dashed where that is an exception to the pattern; a click adds or takes away its
 * door (`flipDoor`, one undo step). A wall shows them once its modules are wide enough on screen to click.
 */
export function DoorSlots({ px }: { px: number }) {
  const id = useApp(pickedFreeMass)
  const docks = useShown((s) => s.derived.circulation.docks)
  if (!id) return null
  const mine = docks.filter((d) => d.massId === id && d.slots && d.slots.length > 0)
  const wide = (d: DerivedDock) => Math.hypot(d.b.x - d.a.x, d.b.y - d.a.y) / d.slots!.length / px >= SLOT_MIN_PX
  const shown = mine.filter(wide)
  if (shown.length === 0) return null
  const side = SLOT_PX * px
  return (
    <g data-layer="door-slots">
      {shown.flatMap((d) =>
        d.slots!.map((slot) => {
          const c = { x: slot.at.x + d.out.x * SLOT_OUT_PX * px, y: slot.at.y + d.out.y * SLOT_OUT_PX * px }
          const what = slot.door ? 'a door' : 'no door'
          return (
            <rect
              key={`${d.wall}-${slot.module}`}
              role="button"
              aria-label={`Wall ${d.wall + 1}, module ${slot.module + 1}: ${what}${slot.flipped ? ' (an exception)' : ''}`}
              aria-pressed={slot.door}
              data-door-slot={`${d.wall}:${slot.module}`}
              x={c.x - side / 2}
              y={-c.y - side / 2}
              width={side}
              height={side}
              rx={1.5 * px}
              fill={slot.door ? 'var(--ink)' : 'var(--panel)'}
              stroke="var(--ink)"
              strokeWidth={slot.flipped ? 1.5 : 1}
              strokeDasharray={slot.flipped ? '2 1.5' : undefined}
              vectorEffect="non-scaling-stroke"
              style={{ cursor: 'pointer' }}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation()
                useApp.getState().apply((p) => actions.flipDoor(p, id, d.t, slot.module))
              }}
            >
              <title>{`${slot.door ? 'A door here: click to take it away' : 'No door here: click to add one'}${slot.flipped ? ' (an exception to the pattern)' : ''}`}</title>
            </rect>
          )
        }),
      )}
    </g>
  )
}

/** px: a court pill's height; its width for each character of its text. */
const PILL_H_PX = 16
const PILL_CHAR_PX = 6.5

const depthText = (v: number) => `${Number.isInteger(v) ? v : v.toFixed(1)} m`

/** A pill pressed: dragged along the court's way out, its wall's own depth, by the half metre, within 5–200 m. */
function startPillDrag(id: Id, d: DerivedDock): Start {
  return () => {
    const pill = (depth: number): Point => ({ x: (d.a.x + d.b.x) / 2 + d.out.x * depth, y: (d.a.y + d.b.y) / 2 + d.out.y * depth })
    // the number is the depth; typed, the depth itself (5–200 m: held to them, and said)
    startTyped({
      what: 'Court depth',
      name: `Truck court, wall ${d.wall + 1}`,
      measure: 'value',
      shown: '',
      at: pill(d.depth),
      unit: ' m',
      help: `the depth in metres, ${COURT_DEPTH_MIN}–${COURT_DEPTH_MAX}`,
      apply: (v) => (p, told) => {
        const typed = v as number
        if (!(typed > 0)) {
          told.why = 'A court is a depth in metres: 35'
          return null
        }
        const depth = Math.min(COURT_DEPTH_MAX, Math.max(COURT_DEPTH_MIN, typed))
        if (depth !== typed) told.note = `Held to ${depthText(depth)}: a court is ${COURT_DEPTH_MIN}–${COURT_DEPTH_MAX} m deep`
        return actions.setCourtDepth(p, id, d.t, depth)
      },
      mode: 'live',
    })
    const mover: Mover = (delta) => {
      if (typedEnded()) return { ok: true, mark: null }
      const raw = d.depth + delta.x * d.out.x + delta.y * d.out.y
      const depth = Math.min(COURT_DEPTH_MAX, Math.max(COURT_DEPTH_MIN, Math.round(raw * 2) / 2))
      useApp.getState().preview((p) => (depth === d.depth ? p : actions.setCourtDepth(p, id, d.t, depth)))
      moveTyped(depthText(depth), undefined, pill(depth))
      return { ok: true, mark: null }
    }
    return mover
  }
}

/**
 * The selected mass's courts: a pill on each one's outer edge, its depth (Decision "Truck court"). A placed block's courts are shapes on the shape engine (Phase D.3 task 7: its pill is
 * `views/editing/shape/`'s, `modules/warehouse/views/BlockCourtHandles.tsx`): this is the plain mass's, which has no court kind.
 */
export function CourtPills({ px, drag }: { px: number; drag: Drag }) {
  const id = useApp((s) => {
    const mass = pickedFreeMass(s)
    const m = mass !== null ? s.project.masses.find((x) => x.id === mass) : undefined
    return m && !actions.isBlockMass(s.project, m) ? mass : null
  })
  const docks = useShown((s) => s.derived.circulation.docks)
  const hidden = useHidden(COURTS)
  if (hidden || !id) return null
  const mine = docks.filter((d) => d.massId === id)
  if (mine.length === 0) return null
  const h = PILL_H_PX * px
  return (
    <g data-layer="court-pills">
      {mine.map((d) => {
        const text = depthText(d.depth)
        const w = (text.length * PILL_CHAR_PX + 10) * px
        const c = { x: (d.a.x + d.b.x) / 2 + d.out.x * d.depth, y: (d.a.y + d.b.y) / 2 + d.out.y * d.depth }
        return (
          <g
            key={d.wall}
            role="slider"
            aria-label={`Truck court, wall ${d.wall + 1}`}
            aria-valuenow={d.depth}
            aria-valuemin={COURT_DEPTH_MIN}
            aria-valuemax={COURT_DEPTH_MAX}
            data-court-pill={`${d.massId}:${d.wall}`}
            style={{ cursor: 'move', touchAction: 'none' }}
            {...drag.bind(`court-pill-${id}-${d.wall}`, startPillDrag(id, d))}
          >
            <title>{`Truck court ${text} deep${d.ownDepth ? ' (its own)' : ''}: drag out or in to make it deeper or shallower`}</title>
            <rect x={c.x - w / 2} y={-c.y - h / 2} width={w} height={h} rx={h / 2} fill="var(--panel)" stroke="var(--ink)" strokeWidth={1.25} vectorEffect="non-scaling-stroke" />
            <text x={c.x} y={-c.y} textAnchor="middle" dominantBaseline="central" fontSize={11 * px} fill="var(--ink)" pointerEvents="none" className="tabular-nums">
              {text}
            </text>
          </g>
        )
      })}
    </g>
  )
}

/** m: a gap this much under the depth it is asked for is short (as the courts' Issue). */
const GAP_SHORT = 0.01
/** The gap field (px). */
const GAP_FIELD_W = 76
const GAP_FIELD_H = 24

const gapText = (v: number) => `${(Math.round(v * 10) / 10).toFixed(1)} m`

/**
 * A gap typed: the picked one of its two masses (with its group) moves straight across, along the first wall's way out,
 * so the walls stand that many metres apart. Not a length: a notice, nothing moved.
 */
export function typeCourtGap(g: CourtGap, massId: Id, text: string): boolean {
  const v = Number(text.trim().replace(',', '.').replace(/\s*m$/, ''))
  if (!Number.isFinite(v) || v <= 0) {
    useToast.getState().show('info', 'A gap is a length in metres: 40.')
    return false
  }
  const u = { x: (g.to.x - g.from.x) / g.gap, y: (g.to.y - g.from.y) / g.gap }
  const k = massId === g.a.massId ? g.gap - v : v - g.gap
  if (Math.abs(k) < 1e-9) return false
  const d = { x: u.x * k, y: u.y * k }
  const { selection } = useApp.getState()
  let moved = false
  useApp.getState().apply((p) => {
    const ids = selection.massIds.includes(massId) ? selection.massIds : groupMembers(p, massId)
    const next = actions.moveMasses(p, ids, d)
    moved = next !== p
    return next
  })
  return moved
}

/** The yards between warehouses: a dimension wall to wall; typed, the one picked moves. */
export function CourtGaps({ px, compare = false }: { px: number; compare?: boolean }) {
  const drawn = useDrawnMass(compare)
  const gaps = useShown((s) => s.derived.docks.gaps)?.filter((g) => drawn(g.a.massId) && drawn(g.b.massId))
  const picked = useApp((s) => s.selection.massIds)
  const [editing, setEditing] = useState<string | null>(null)
  const hidden = useHidden(COURTS)
  if (hidden || !gaps || gaps.length === 0) return null
  return (
    <g data-layer="court-gaps">
      {gaps.map((g) => {
        const key = `${g.a.massId}:${g.a.wall}|${g.b.massId}:${g.b.wall}`
        const d = dimensionDrawing({ a: g.from, b: g.to, offset: 0 }, px)
        if (!d) return null
        const text = gapText(g.gap)
        const drawing = { ...d, text: { ...d.text, content: text } }
        const mover = picked.includes(g.a.massId) ? g.a.massId : picked.includes(g.b.massId) ? g.b.massId : null
        const short = g.gap < g.asks - GAP_SHORT
        const color = short ? 'var(--status-over)' : mover ? 'var(--ink)' : 'var(--ink-secondary)'
        const q = d.text.q
        const w = (text.length * 6.5 + 8) * px
        const h = 14 * px
        return (
          <g key={key} data-court-gap={key} data-gap={Math.round(g.gap * 100) / 100} data-gap-short={short || undefined}>
            <g pointerEvents="none">
              <DimensionFigure d={drawing} color={color} width={mover ? 1.5 : 1} />
            </g>
            <rect
              role="button"
              aria-label={`Gap between the warehouses: ${text}`}
              data-court-gap-figure={key}
              x={q.x - w / 2}
              y={-q.y - h}
              width={w}
              height={h}
              fill="transparent"
              transform={`rotate(${-d.text.angle} ${q.x} ${-q.y})`}
              style={{ cursor: mover ? 'text' : 'default' }}
              onPointerDown={(e) => {
                if (!mover) return
                // the press's mousedown would take the focus from the new field
                e.preventDefault()
                e.stopPropagation()
                setEditing(key)
              }}
            >
              <title>{`${text} wall to wall${short ? `, under the ${gapText(g.asks)} the deeper court asks` : ''}. ${mover ? 'Click to type it: the warehouse picked moves' : 'Pick one of the two warehouses, then click to type it: that one moves'}`}</title>
            </rect>
            {editing === key && mover && <GapField at={q} px={px} value={g.gap} close={() => setEditing(null)} onType={(t) => typeCourtGap(g, mover, t)} />}
          </g>
        )
      })}
    </g>
  )
}

/** The gap's field over its figure, in screen px at any zoom: Enter types it, Escape or leaving it cancels. */
function GapField({ at, px, value, close, onType }: { at: Point; px: number; value: number; close(): void; onType(text: string): void }) {
  const [text, setText] = useState(String(Math.round(value * 100) / 100))
  return (
    <foreignObject x={at.x - (GAP_FIELD_W / 2) * px} y={-at.y - (GAP_FIELD_H / 2) * px} width={GAP_FIELD_W * px} height={GAP_FIELD_H * px}>
      <div style={{ width: GAP_FIELD_W, height: GAP_FIELD_H, transform: `scale(${px})`, transformOrigin: '0 0' }}>
        <input
          aria-label="Gap between the warehouses"
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
              onType(text)
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
