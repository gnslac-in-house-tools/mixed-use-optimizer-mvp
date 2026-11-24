// The rotation handles, Transform's (Decision "Rotate handle"; port of Plaza-Practiko `vistas/planta/edicion/Manijas.tsx`): the walls, the corners
// and the holes of an outline are the shape engine's (`views/editing/shape/`, Phase D.1 task 5).
// - `MassHandles`: a white dot on a stem beyond the selected mass: drag = turn it by 15° steps, Shift freely; the turn shows by it while it is
//   dragged, and a number typed during or after it is the angle.
// - `GroupTurn`: the same for several masses, or a group of any kind, about the centre of their frame.
// A locked mass keeps its place: no handle to turn. Hit areas are 30 screen px at any zoom. A handle turns red when its last edit was rejected.
// Geometry is drawn in world coordinates inside a y-flipped group; text is drawn outside it (flipped text mirrors).
import { useState } from 'react'
import { massIsLocked } from '../../kinds/locked.ts'
import type { Point } from '../../model/schema.ts'
import { useApp } from '../../state/store.ts'
import { rotate } from '../../engine/geom/footprint.ts'
import { groupHandle, rotateHandle, startGroupRotateDrag, startPickedRotateDrag, startRotateDrag, turnedHandle } from './editing.ts'
import { oneGroupOnPlan, usePickedRefs } from './mix.ts'
import type { Drag } from './useDrag.ts'
import { isGroupable, oneGroup } from '../../engine/groups.ts'
import { isLocked } from '../../kinds/locked.ts'

/** The rotation handle: its dot and what catches the pointer round it (less than the pills', which it would cover). */
const TURN_DOT_PX = 5.5
const TURN_HIT_PX = 30

/** A label in screen-sized text with a halo, at world point q shifted (dx, dy) screen px. */
function Label(props: { q: Point; text: string; px: number; dx?: number; dy?: number; anchor?: 'start' | 'middle' | 'end' }) {
  const { q, text, px, dx = 0, dy = 0, anchor = 'middle' } = props
  return (
    <text x={q.x + dx * px} y={-q.y + dy * px} textAnchor={anchor} dominantBaseline="middle" fontSize={11 * px} fill="var(--ink)" stroke="var(--panel)" strokeWidth={3 * px} paintOrder="stroke" pointerEvents="none">
      {text}
    </text>
  )
}

export function MassHandles(props: { drag: Drag; scale: number }) {
  const { drag, scale } = props
  const id = useApp((s) => s.selection.massId)
  const mass = useApp((s) => s.project.masses.find((m) => m.id === s.selection.massId))
  const massLocked = useApp((s) => { const m = s.project.masses.find((x) => x.id === s.selection.massId); return m !== undefined && massIsLocked(s.project, m) })
  const [turned, setTurned] = useState(0)

  // a locked mass keeps its place: no handle to turn
  if (!id || !mass || massLocked) return null
  const px = 1 / scale
  const turn = rotateHandle(mass.footprint, px)
  const turning = drag.key === 'rotate'
  const angle = mass.footprint.kind === 'rect' ? mass.footprint.rotation : null
  const red = (k: string) => drag.key === k && drag.red

  return (
    <g data-layer="handles" data-mass={id}>
      <g transform="scale(1 -1)">
        {/* The rotation handle, past the top pill and the docks' mark. */}
        <g {...drag.bind('rotate', startRotateDrag(id, scale, setTurned))} data-rotate style={{ cursor: turning ? 'grabbing' : 'grab', touchAction: 'none' }}>
          <line x1={turn.stem.x} y1={turn.stem.y} x2={turn.at.x} y2={turn.at.y} stroke="var(--ink)" strokeWidth={1.25} vectorEffect="non-scaling-stroke" pointerEvents="none" />
          <circle cx={turn.at.x} cy={turn.at.y} r={(TURN_HIT_PX / 2) * px} fill="transparent" />
          <circle
            cx={turn.at.x}
            cy={turn.at.y}
            r={TURN_DOT_PX * px}
            fill={red('rotate') ? 'var(--status-over)' : turning ? 'var(--ink)' : 'var(--panel)'}
            stroke={red('rotate') ? 'var(--status-over)' : 'var(--ink)'}
            strokeWidth={1.5}
            vectorEffect="non-scaling-stroke"
          />
        </g>
      </g>

      {/* While it turns: by how much (and a rect's angle). */}
      {turning && (
        <Label
          q={turn.at}
          px={px}
          dx={14}
          anchor="start"
          text={angle === null ? `${turned > 0 ? '+' : ''}${turned}°` : `${Math.round(angle * 10) / 10}° (${turned > 0 ? '+' : ''}${turned}°)`}
        />
      )}
    </g>
  )
}

/**
 * Several masses selected (Decision "Rotate handle"): a dashed frame round them and its dot above; dragged, they turn
 * together about the frame's centre, as one piece, by 15° (Shift freely), the turn shown by the dot. While they turn
 * the frame and the dot stay where the drag began, the dot going round with the pointer. None while one is locked.
 * When they are one group (Decision "Groups") the frame is solid and says *Group · n* over its corner. A group that holds other kinds than masses (Phase AS.5 task 6) has the same
 * frame round everything picked, *n* counting every member, and its dot turns what Rotate turns (`actions.turnPicked`).
 */
export function GroupTurn(props: { drag: Drag; scale: number }) {
  const { drag, scale } = props
  const ids = useApp((s) => s.selection.massIds)
  const project = useApp((s) => s.project)
  const option = useApp((s) => s.option)
  const refs = usePickedRefs().filter((r) => isGroupable(r.kind))
  // one group that holds other kinds beside masses: its frame is round all of them that the plan can pick (a locked or hidden member is left out of the pick, and of the frame)
  const several = refs.some((r) => r.kind !== 'mass') && oneGroupOnPlan(refs)
  const group = several || oneGroup(project, ids)
  // while they turn, where they were when it began
  const base = useApp((s) => s.dragStart) ?? project
  const [turned, setTurned] = useState(0)
  const px = 1 / scale
  if (several ? refs.some((r) => isLocked(project, r, option)) : ids.length < 2 || project.masses.some((m) => ids.includes(m.id) && massIsLocked(project, m))) return null
  const h = several ? turnedHandle(base, option, px) : groupHandle(base, ids, px)
  if (!h) return null
  const turning = drag.key === 'group-rotate'
  const at = turning ? rotate(h.at, h.pivot, turned) : h.at
  const stem = turning ? rotate(h.stem, h.pivot, turned) : h.stem
  return (
    <g data-layer="group-handles">
      <g transform="scale(1 -1)">
        {!turning && (
          <rect
            data-group-frame
            x={h.box.minX}
            y={h.box.minY}
            width={h.box.maxX - h.box.minX}
            height={h.box.maxY - h.box.minY}
            fill="none"
            stroke="var(--ink)"
            strokeWidth={1}
            strokeDasharray={group ? undefined : '5 4'}
            vectorEffect="non-scaling-stroke"
            pointerEvents="none"
          />
        )}
        <g {...drag.bind('group-rotate', several ? startPickedRotateDrag(scale, setTurned) : startGroupRotateDrag(ids, scale, setTurned))} data-rotate style={{ cursor: turning ? 'grabbing' : 'grab', touchAction: 'none' }}>
          <line x1={stem.x} y1={stem.y} x2={at.x} y2={at.y} stroke="var(--ink)" strokeWidth={1.25} vectorEffect="non-scaling-stroke" pointerEvents="none" />
          <circle cx={at.x} cy={at.y} r={(TURN_HIT_PX / 2) * px} fill="transparent" />
          <circle cx={at.x} cy={at.y} r={TURN_DOT_PX * px} fill={turning ? 'var(--ink)' : 'var(--panel)'} stroke="var(--ink)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
        </g>
      </g>
      {turning && <Label q={at} px={px} dx={14} anchor="start" text={`${turned > 0 ? '+' : ''}${turned}°`} />}
      {group && !turning && (
        <g data-group-label="">
          <Label q={{ x: h.box.minX, y: h.box.maxY }} px={px} dy={-9} anchor="start" text={`Group · ${several ? refs.length : ids.length}`} />
        </g>
      )}
    </g>
  )
}
