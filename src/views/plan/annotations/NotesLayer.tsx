// The project's notes on the plan (Phase AS.5, Decision "Notes"): a text placed at a point of a level, drawn as the plan's labels are: the same size on screen at any zoom (12 px; *Small*
// 10, *Large* 16), ink on the panel's halo, left-aligned from its point, a line per line of its text, at its angle. Like the dimensions, they are the active level's: none in *All
// levels*, none of another level. Drawn over the masses, with the dimensions (`PlanSvg.tsx`).
//   a press       picks it (Shift+click adds it to what is picked, or takes it out); dragged, it moves, snapped as a mass is (its point onto what is drawn; Shift freely); one that is
//                 picked drags with the others picked beside it; a double click selects its text in Properties (its text is its name: `editing/rename.ts`)
// Every edit is one verb through `actions` (a drag: one undo step). Hidden (Layers: Notes, or one note's own key) a note is not drawn, picked or dragged, and the plan still holds it. A
// locked note (the padlock is CAD's) is seen, with the lock's glyph, and answers no press (the background says it is locked: `lockedAt.ts`). A note attracts no snap.
import { useMemo, type MouseEvent } from 'react'
import { noteName } from '../../../engine/annotations.ts'
import type { Id, Note, Point } from '../../../model/schema.ts'
import { actions } from '../../../state/actions/index.ts'
import { useApp } from '../../../state/store.ts'
import { renameRef } from '../../editing/refOps.ts'
import { isObjectHidden, note as noteKey } from '../../layers/keys.ts'
import { useHiddenSet } from '../../layers/layerView.ts'
import { LockGlyph } from '../LockGlyph.tsx'
import { addToMix, pickedRefs, pickRefs } from '../mix.ts'
import { wholeDrag } from '../pickedDrag.ts'
import { snapLevels } from '../reference.ts'
import { SELECTED_PX } from '../planStyle.ts'
import { planStep } from '../snap/grid.ts'
import { snapMove, targetsOf, tolerances, type Shape } from '../snap/move.ts'
import { useSnapSettings } from '../snap/settings.ts'
import { sourcesFor } from '../snap/sources.ts'
import type { Drag, Mover, Start } from '../useDrag.ts'
import { useAnnotations } from './annotationState.ts'
import { noteBox, noteLines } from './noteLook.ts'

/** A note as a shape that snaps when it moves: its point (the rest of its text is not a place). */
const shapeOfNotes = (notes: readonly Note[], anchor: Point): Shape => ({
  points: notes.map((n) => ({ p: n.at, kind: 'endpoint' as const, label: noteName(n.text) })),
  walls: [],
  anchor,
})

/**
 * A press on a note: Shift+click adds it to what is picked, of any kind, or takes it out, and drags nothing; otherwise it is picked (alone, unless it is among the notes picked
 * already) and dragged, with the other notes picked beside it. A locked note is not dragged (its press never gets here: the background says it is locked). `scale`: px per metre.
 */
export function startNoteDrag(id: Id, scale: number): Start {
  return (e) => {
    if (e.shiftKey) {
      addToMix('note', id)
      return null
    }
    // in a group of other things, or picked beside other kinds: the whole pick moves (Phase AS.5 task 6)
    const whole = wholeDrag({ kind: 'note', id }, () => {
      const note = useApp.getState().project.notes?.find((n) => n.id === id)
      return note ? shapeOfNotes([note], note.at) : null
    }, scale, e)
    if (whole) return whole
    if (!useAnnotations.getState().notes.includes(id)) pickRefs([{ kind: 'note', id }])
    const { project, derived, option } = useApp.getState()
    const notes = useAnnotations
      .getState()
      .notes.flatMap((x) => project.notes?.find((n) => n.id === x && n.locked !== true) ?? [])
    const mine = notes.find((n) => n.id === id)
    if (!mine) return null
    const ids = notes.map((n) => n.id)
    const shape = shapeOfNotes(notes, mine.at)
    // a note attracts nothing, so there is nothing of its own to leave out
    const targets = targetsOf(sourcesFor(project, derived, null, snapLevels()))
    const step = planStep(project, option)
    const mover: Mover = (delta, ev) => {
      const r = ev.shiftKey ? { delta, mark: null } : snapMove(delta, shape, targets, useSnapSettings.getState().settings, tolerances(scale), step)
      useApp.getState().preview((p) => actions.moveNotes(p, ids, r.delta))
      return { ok: true, mark: r.mark }
    }
    return mover
  }
}

/**
 * The notes of the level in view. `interactive`: the Select tool is in hand (a tool or a look lets the pointer through, and All levels answers nothing).
 */
export function NotesLayer({ px, drag, interactive }: { px: number; drag: Drag; interactive: boolean }) {
  const all = useApp((s) => s.project.notes)
  const level = useApp((s) => s.level)
  const showAll = useApp((s) => s.showAll)
  const off = useHiddenSet()
  const picked = useAnnotations((s) => s.notes)
  const notes = useMemo(() => (showAll ? [] : (all ?? []).filter((n) => n.levelId === level && !isObjectHidden(off, 'note', n.id))), [all, level, showAll, off])
  if (notes.length === 0) return null
  return (
    <g data-layer="notes" aria-label="Notes">
      {notes.map((n) => {
        const on = picked.includes(n.id)
        const locked = n.locked === true
        const live = interactive && !locked
        const box = noteBox(n, px)
        const corners = box.polygon.map((q) => `${q.x},${-q.y}`).join(' ')
        const lines = noteLines(n.text)
        const turn = n.angle ? `rotate(${-n.angle} ${n.at.x} ${-n.at.y})` : undefined
        const ref = { kind: 'note', id: n.id }
        return (
          <g
            key={n.id}
            data-note={n.id}
            aria-selected={on}
            aria-label={noteName(n.text)}
            pointerEvents={live ? undefined : 'none'}
            className={live ? (drag.key === `note-${n.id}` ? 'cursor-grabbing' : 'cursor-grab') : undefined}
            {...(live ? drag.bind(`note-${n.id}`, startNoteDrag(n.id, 1 / px)) : {})}
            onDoubleClick={
              live
                ? (e: MouseEvent) => {
                    // its text is its name: the double click picks it (the presses before it did) and selects its words in Properties
                    e.stopPropagation()
                    if (!pickedRefs().some((r) => r.kind === 'note' && r.id === n.id)) pickRefs([ref])
                    renameRef(ref)
                  }
                : undefined
            }
          >
            {/* the box its text fills makes the words easy to hit */}
            <polygon points={corners} fill="transparent" stroke="none" pointerEvents={live ? 'all' : 'none'} />
            {/* a picked note: its extent, dashed in ink */}
            {on && <polygon data-note-frame points={corners} fill="none" stroke="var(--ink)" strokeWidth={SELECTED_PX / 2} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" pointerEvents="none" />}
            <text
              data-picked={on || undefined}
              x={n.at.x}
              y={-n.at.y}
              fontSize={box.size}
              fill="var(--ink)"
              stroke="var(--panel)"
              strokeWidth={box.size / 3}
              strokeLinejoin="round"
              paintOrder="stroke"
              xmlSpace="preserve"
              transform={turn}
              pointerEvents="none"
            >
              {lines.map((l, i) => (
                <tspan key={i} x={n.at.x} dy={i === 0 ? 0 : box.line}>
                  {l}
                </tspan>
              ))}
            </text>
            {locked && (
              <g data-lock={noteKey(n.id)}>
                <LockGlyph at={box.place(box.width + 9 * px, -0.3 * box.size)} px={px} size={9} />
              </g>
            )}
          </g>
        )
      })}
    </g>
  )
}
