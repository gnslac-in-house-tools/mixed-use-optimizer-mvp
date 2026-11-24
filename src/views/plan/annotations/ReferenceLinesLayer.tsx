// The project's reference lines on the plan (Phase AS.5, Decision "Reference lines"): guides the other tools snap to, each a line of two points or more, thin and dashed in the
// guide's colour (`--guide`). They are the project's, not a level's: seen on every level, in every option and in All levels, as the grid is. Two mounts, as the drawings' layer has
// (`PlanSvg.tsx`): the first under all that is designed, and a second, `over`, after the masses and before the dimensions, for them when *On top* is on (`useLayerView.onTop`, the
// key `reference-lines`); each draws the lines only when its side is the kind's.
//   the layer     a press on a line picks it (Shift+click adds it to what is picked, or takes it out); dragged, it moves, snapped as a mass is (its points, middles and walls onto
//                 what is drawn but itself; Shift freely); one that is picked drags with the others picked beside it
//   ReferenceLineHandles   a line picked alone shows its points: one dragged moves that point, snapped as a street's node is (Shift freely)
// Every edit is one verb through `actions` (a drag: one undo step). Hidden (Layers: Reference lines, or one line's own key) a line is not drawn, picked, dragged or snapped to, and the
// plan still holds it. A locked line (the padlock is CAD's) is seen, with the lock's glyph, and answers no press (the background says it is locked: `lockedAt.ts`).
import { useMemo } from 'react'
import type { Contour, Id, Point, ReferenceLine } from '../../../model/schema.ts'
import { referenceLineName } from '../../../engine/annotations.ts'
import { actions } from '../../../state/actions/index.ts'
import { useApp } from '../../../state/store.ts'
import { isObjectHidden, REFERENCE_LINES, referenceLine as lineKey } from '../../layers/keys.ts'
import { useHiddenSet, useLayerView } from '../../layers/layerView.ts'
import { LockGlyph } from '../LockGlyph.tsx'
import { addToMix, usePickedRefs } from '../mix.ts'
import { wholeDrag } from '../pickedDrag.ts'
import { snapLevels } from '../reference.ts'
import { SELECTED_PX } from '../planStyle.ts'
import { planStep } from '../snap/grid.ts'
import { snapMove, targetsOf, tolerances, type Shape } from '../snap/move.ts'
import { snapPointsOf } from '../snap/points.ts'
import { resolveSnap } from '../snap/resolve.ts'
import { useSnapSettings } from '../snap/settings.ts'
import { sourcesFor } from '../snap/sources.ts'
import { straightWalls } from '../snap/walls.ts'
import type { Drag, Mover, Start } from '../useDrag.ts'
import { useAnnotations } from './annotationState.ts'

/** The handle of a point (px across). */
const HANDLE_PX = 10
/** The reach of a press on a line (px across its transparent stroke). */
const HIT_PX = 10
/** The dashes of a guide: thin, with room between. */
const DASH = '8 4'

const pathOf = (points: readonly Point[]): string => points.map((q, i) => `${i ? 'L' : 'M'}${q.x} ${-q.y}`).join('')

/** A line as a shape that snaps when it moves: its points and the middles of its stretches, its straight stretches. */
function shapeOfLines(lines: readonly ReferenceLine[], anchor: Point): Shape {
  const contours: Contour[] = lines.map((r) => ({ vertices: r.points.map((q) => ({ x: q.x, y: q.y, r: 0 })) }))
  return {
    points: contours.flatMap((contour) => snapPointsOf([{ contour, label: '', open: true }]).filter((q) => q.kind === 'endpoint' || q.kind === 'midpoint')),
    walls: contours.flatMap((contour) => straightWalls(contour, true)),
    anchor,
  }
}

/**
 * A press on a line: Shift+click adds it to what is picked, of any kind, or takes it out, and drags nothing; otherwise it is picked (alone, unless it is among the lines picked
 * already) and dragged, with the other lines picked beside it. A locked line is not dragged (its press never gets here: the background says it is locked). `scale`: px per metre.
 */
export function startLineDrag(id: Id, scale: number): Start {
  return (e) => {
    if (e.shiftKey) {
      addToMix('reference-line', id)
      return null
    }
    // in a group of other things, or picked beside other kinds: the whole pick moves (Phase AS.5 task 6)
    const whole = wholeDrag({ kind: 'reference-line', id }, () => {
      const line = useApp.getState().project.referenceLines?.find((r) => r.id === id)
      return line ? shapeOfLines([line], line.points[0]) : null
    }, scale, e)
    if (whole) return whole
    if (!useAnnotations.getState().lines.includes(id)) useAnnotations.getState().set([id])
    const { project, derived, option } = useApp.getState()
    const lines = useAnnotations
      .getState()
      .lines.flatMap((x) => project.referenceLines?.find((r) => r.id === x && r.locked !== true) ?? [])
    const mine = lines.find((r) => r.id === id)
    if (!mine) return null
    const ids = lines.map((r) => r.id)
    const shape = shapeOfLines(lines, mine.points[0])
    const targets = targetsOf(sourcesFor(project, derived, ids, snapLevels()))
    const step = planStep(project, option)
    const mover: Mover = (delta, ev) => {
      const r = ev.shiftKey ? { delta, mark: null } : snapMove(delta, shape, targets, useSnapSettings.getState().settings, tolerances(scale), step)
      useApp.getState().preview((p) => actions.moveReferenceLines(p, ids, r.delta))
      return { ok: true, mark: r.mark }
    }
    return mover
  }
}

/** A point of the line picked alone, dragged: it goes where the pointer is, snapped as a street's node is (Shift freely); one undo step. */
function startPointDrag(id: Id, index: number, scale: number): Start {
  return () => {
    const { project, derived, option } = useApp.getState()
    const line = project.referenceLines?.find((r) => r.id === id)
    if (!line || line.locked === true || !line.points[index]) return null
    const from = line.points[index]
    // the line's own points and stretches do not attract it
    const targets = targetsOf(sourcesFor(project, derived, [id], snapLevels()))
    const step = planStep(project, option)
    // the neighbour it was drawn from: the square and ortho start there
    const base = line.points[index === 0 ? 1 : index - 1] ?? null
    const tol = tolerances(scale)
    const mover: Mover = (delta, ev) => {
      const q = { x: from.x + delta.x, y: from.y + delta.y }
      const s = ev.shiftKey ? { point: q, mark: null } : resolveSnap(q, { targets, settings: useSnapSettings.getState().settings, tolPoint: tol.point, tolLine: tol.line, step, base, orthoFrom: base })
      useApp.getState().preview((p) => actions.setReferenceLinePoint(p, id, index, s.point))
      return { ok: true, mark: s.mark }
    }
    return mover
  }
}

/**
 * The lines of one side: `over` the ones *On top* puts over the masses, not the others. `interactive`: the Select tool is in hand (a tool or a look lets the pointer through, and
 * All levels answers nothing).
 */
export function ReferenceLinesLayer({ px, drag, interactive, over = false }: { px: number; drag: Drag; interactive: boolean; over?: boolean }) {
  const all = useApp((s) => s.project.referenceLines)
  const off = useHiddenSet()
  const onTop = useLayerView((s) => s.onTop.includes(REFERENCE_LINES))
  const picked = useAnnotations((s) => s.lines)
  const lines = useMemo(() => (onTop === over ? (all ?? []).filter((r) => !isObjectHidden(off, 'reference-line', r.id)) : []), [all, off, onTop, over])
  // the number of a line is its place among the project's: its glyph's title says it
  const names = useMemo(() => new Map((all ?? []).map((r, i) => [r.id, referenceLineName(i)])), [all])
  if (lines.length === 0) return null
  return (
    <g data-layer="reference-lines" data-on-top={over || undefined} aria-label="Reference lines">
      {lines.map((r) => {
        const on = picked.includes(r.id)
        const locked = r.locked === true
        const live = interactive && !locked
        const d = pathOf(r.points)
        const mid = r.points.length > 1 ? { x: (r.points[0].x + r.points[1].x) / 2, y: (r.points[0].y + r.points[1].y) / 2 } : r.points[0]
        return (
          <g
            key={r.id}
            data-reference-line={r.id}
            aria-selected={on}
            aria-label={names.get(r.id)}
            pointerEvents={live ? undefined : 'none'}
            className={live ? (drag.key === `reference-line-${r.id}` ? 'cursor-grabbing' : 'cursor-grab') : undefined}
            {...(live ? drag.bind(`reference-line-${r.id}`, startLineDrag(r.id, 1 / px)) : {})}
          >
            {/* a wide invisible stroke makes the thin line easy to hit */}
            <path d={d} fill="none" stroke="transparent" strokeWidth={HIT_PX} strokeLinejoin="round" vectorEffect="non-scaling-stroke" pointerEvents={live ? 'stroke' : 'none'} />
            {/* the paper's halo under a picked line, as a mass's outline has */}
            {on && <path d={d} fill="none" stroke="var(--panel)" strokeWidth={SELECTED_PX + 3} strokeLinejoin="round" vectorEffect="non-scaling-stroke" pointerEvents="none" />}
            <path
              data-reference-line-stroke
              data-picked={on || undefined}
              d={d}
              fill="none"
              stroke={on ? 'var(--ink)' : 'var(--guide)'}
              strokeWidth={on ? SELECTED_PX : 1}
              strokeDasharray={DASH}
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              pointerEvents="none"
            />
            {locked && (
              <g data-lock={lineKey(r.id)}>
                <LockGlyph at={{ x: mid.x, y: mid.y + 12 * px }} px={px} size={9} />
              </g>
            )}
          </g>
        )
      })}
    </g>
  )
}

/**
 * The points of a line picked alone, each a handle that moves that point (not while a tool is in hand, not for a hidden or a locked line). Alone is all that is picked: a line in a group, or
 * beside another kind, is dragged with the rest, and a press near its end must not take a point instead.
 */
export function ReferenceLineHandles({ px, drag }: { px: number; drag: Drag }) {
  const picked = useAnnotations((s) => s.lines)
  const everything = usePickedRefs()
  const all = useApp((s) => s.project.referenceLines)
  const off = useHiddenSet()
  if (picked.length !== 1 || everything.length !== 1) return null
  const line = all?.find((r) => r.id === picked[0])
  if (!line || line.locked === true || isObjectHidden(off, 'reference-line', line.id)) return null
  return (
    <g data-layer="reference-line-points">
      {line.points.map((q, i) => (
        <circle
          key={i}
          data-reference-line-point={`${line.id}:${i}`}
          cx={q.x}
          cy={-q.y}
          r={(HANDLE_PX / 2) * px}
          fill="var(--panel)"
          stroke="var(--ink)"
          strokeWidth={1.5}
          vectorEffect="non-scaling-stroke"
          style={{ cursor: 'move', touchAction: 'none' }}
          {...drag.bind(`reference-line-point-${line.id}-${i}`, startPointDrag(line.id, i, 1 / px))}
        />
      ))}
    </g>
  )
}
