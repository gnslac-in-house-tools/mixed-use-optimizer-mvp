// The active option's other buildings on the plan (Decision "Buildings layout"): each one at the level standing at the
// active level's height, lighter than the active building, to see, snap to and pick. A click picks a mass and makes its
// building the active one (the plan goes to its level); Shift+click adds it to the selection; a mass of a selection of
// several drags them all, as on the active level. A context building is neutral grey with a dashed outline. A program,
// a building or an option dragged from the panel drops on them as on the active level's (massDrop.ts). `still` (a
// look in the viewport, Decision "Specimen preview"): seen only, nothing answers the pointer. A locked mass is seen and
// not picked (the padlock is CAD's): its press is the background's (a window or a pan) and a click on it says it is locked.
import { useMemo, useState, type PointerEvent } from 'react'
import { massIsLocked } from '../../kinds/locked.ts'
import type { Id, Mass } from '../../model/schema.ts'
import { centroid } from '../../engine/geom/polygon.ts'
import { useApp } from '../../state/store.ts'
import { useShown } from '../viewport/look.ts'
import { fillOf, isContext, otherMasses, useBuildingView } from '../buildingView.ts'
import { LABELS } from '../layers/keys.ts'
import { useHidden, useLayerView } from '../layers/layerView.ts'
import { dropOnMass, isMassDrop } from '../panels/massDrop.ts'
import { pathOf } from './camera.ts'
import { startMassDrag } from './editing.ts'
import type { Drag } from './useDrag.ts'
import { pickOnPlan } from './massCommands.ts'

/** How much of its colour another building keeps: it reads as context, not as what is being edited. */
const OTHER_FILL = 0.3

export function OtherBuildings({ drag, scale, px, withError, still = false }: { drag: Drag; scale: number; px: number; withError: Set<Id>; still?: boolean }) {
  const project = useShown((s) => s.project)
  const derived = useShown((s) => s.derived)
  const level = useApp((s) => s.level)
  const option = useApp((s) => s.option)
  const selectedIds = useApp((s) => s.selection.massIds)
  const hidden = useLayerView((s) => s.hidden)
  const labels = !useHidden(LABELS)
  const colorBy = useBuildingView((s) => s.colorBy)
  const masses = useMemo(() => otherMasses(project, level, option, hidden), [project, level, option, hidden])
  const [dropOn, setDropOn] = useState<Id | null>(null)

  const pick = (m: Mass) => (e: PointerEvent<SVGPathElement>) => {
    if (e.button !== 0) return
    e.stopPropagation() // not a window or a pan
    pickOnPlan(m.id, e.shiftKey, e.altKey)
  }

  return (
    <g data-layer="other-buildings" pointerEvents={still ? 'none' : undefined}>
      {masses.map((m) => {
        const dm = derived.masses[m.id]
        if (!dm || dm.polygon.length < 3) return null
        const context = isContext(project, m)
        const selected = selectedIds.includes(m.id)
        // a member of a selection of several drags the group; any other press picks it
        const inGroup = selected && selectedIds.length > 1
        const handlers = massIsLocked(project, m) ? {} : inGroup ? drag.bind(`mass-${m.id}`, startMassDrag(m.id, scale)) : { onPointerDown: pick(m) }
        return (
          <path
            key={m.id}
            data-other-mass={m.id}
            d={pathOf([dm.polygon, ...dm.holes])}
            fill={context ? 'var(--context-fill)' : (fillOf(project, m, colorBy) ?? 'var(--fill)')}
            fillOpacity={context ? 1 : OTHER_FILL}
            stroke={withError.has(m.id) ? 'var(--status-over)' : selected || dropOn === m.id ? 'var(--ink)' : context ? 'var(--context-stroke)' : 'var(--ink-secondary)'}
            strokeWidth={selected || dropOn === m.id ? 2.5 : 1}
            strokeDasharray={context ? '5 3' : undefined}
            vectorEffect="non-scaling-stroke"
            className={massIsLocked(project, m) ? 'cursor-default' : 'cursor-pointer'}
            {...handlers}
            onDragOver={(e) => {
              if (!isMassDrop(e)) return
              e.preventDefault()
              e.dataTransfer.dropEffect = 'move'
              setDropOn(m.id)
            }}
            onDragLeave={() => setDropOn((d) => (d === m.id ? null : d))}
            onDrop={(e) => {
              setDropOn(null)
              if (dropOnMass(e, m.id)) e.preventDefault()
            }}
          />
        )
      })}
      {labels && masses.map((m) => {
        const dm = derived.masses[m.id]
        if (!dm || dm.polygon.length < 3) return null
        const c = centroid(dm.polygon)
        return (
          <text key={m.id} x={c.x} y={-c.y} textAnchor="middle" fontSize={11 * px} fill="var(--ink-secondary)" pointerEvents="none">
            {m.name}
          </text>
        )
      })}
    </g>
  )
}
