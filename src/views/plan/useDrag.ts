// Dragging anything on the plan: a mass, a wall, a corner. Port of Plaza-Practiko `vistas/planta/edicion/useArrastre.ts`.
// - press: `start` prepares the drag (selects, builds what attracts) and returns a `Mover` (null = no drag)
// - move: the Mover gets the cumulative offset since the press and edits through store.preview
// - release: store.commit (the whole drag = one undo step). Esc or pointercancel: store.cancel
// - either way the typed dimension hears it ended (`endTyped`): a kept drag can be corrected by typing a measure
// - a press released without moving is a click: the Mover's `click`, if it has one, runs (a group member clicked
//   alone becomes the selection); a drag kept runs its `done` (a copy becomes the selection)
// - Alt+drag copies what a drag moves (Decision "Alt+drag copies"): such a Mover says `copy`, and the plan's cursor
//   shows it while it lasts
// Each draggable thing gets its handlers from `bind(key, start)`; `key` says which one is being dragged.
import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react'
import type { Point } from '../../model/schema.ts'
import { useApp } from '../../state/store.ts'
import { chordOf } from '../commands/keys.ts'
import { keysOf } from '../commands/shortcuts.ts'
import { CLICK_TOLERANCE } from './camera.ts'
import { endTyped } from '../editing/dimension/typed.ts'
import { typingIn } from './tools/common.tsx'
import type { SnapMark } from './snap/move.ts'
import { beginDrag } from '../controls/beginDrag.ts'

export interface MoveResult {
  /** false: the edit was rejected or limited (the handle turns red). */
  ok: boolean
  /** What the snap stuck to, to draw it. */
  mark: SnapMark | null
}

export type Mover = ((delta: Point, e: { shiftKey: boolean; ctrlKey?: boolean; metaKey?: boolean }) => MoveResult) & {
  click?: () => void
  /** The drag moved and was kept. */
  done?: () => void
  /** It makes a copy, not a move (Alt+drag). */
  copy?: boolean
  /** The drag ended, kept (a click included) or cancelled: it lets go of what it took (the command line). */
  end?: (cancelled: boolean) => void
  /** First of all on release, before the store's commit and the typed dimension hear of it: a drag that previews outside the store (the block editor's ghost) applies its result here. */
  settle?: (cancelled: boolean) => void
}
export type Start = (e: PointerEvent<SVGElement>, start: Point) => Mover | null

interface Current {
  pointerId: number
  key: string
  start: Point // world
  x: number // screen, to tell a click from a drag
  y: number
  moved: boolean
  mover: Mover
}

export interface Drag {
  /** What is being dragged (null: nothing). */
  key: string | null
  /** The drag copies (Alt+drag). */
  copying: boolean
  red: boolean
  mark: SnapMark | null
  bind(key: string, start: Start): {
    'data-handle': string
    onPointerDown(e: PointerEvent<SVGElement>): void
    onPointerMove(e: PointerEvent<SVGElement>): void
    onPointerUp(e: PointerEvent<SVGElement>): void
    onPointerCancel(e: PointerEvent<SVGElement>): void
    onLostPointerCapture(e: PointerEvent<SVGElement>): void
  }
}

/** A drag that never starts: the plan's layers drawn where nothing is edited (a Compare pane). */
export const STILL_DRAG: Drag = {
  key: null,
  copying: false,
  red: false,
  mark: null,
  bind: (key) => ({ 'data-handle': key, onPointerDown() {}, onPointerMove() {}, onPointerUp() {}, onPointerCancel() {}, onLostPointerCapture() {} }),
}

/** The keys a drag swallows: Escape (it cancels the drag), and the keys Undo, Redo and Delete have now (the user's, else the
 *  defaults: `commands/shortcuts.ts`), which must not act on the project under the pointer. */
export function swallowedMidDrag(e: KeyboardEvent): boolean {
  if (e.key === 'Escape') return true
  const chord = chordOf(e)
  return !!chord && ['edit.undo', 'edit.redo', 'edit.delete'].some((id) => keysOf(id).includes(chord))
}

export function useDrag(toWorld: (ev: { clientX: number; clientY: number }) => Point): Drag {
  const commit = useApp((s) => s.commit)
  const cancel = useApp((s) => s.cancel)
  const current = useRef<Current | null>(null)
  const [key, setKey] = useState<string | null>(null)
  const [copying, setCopying] = useState(false)
  const [red, setRed] = useState(false)
  const [mark, setMark] = useState<SnapMark | null>(null)

  const finish = useCallback(
    (cancelled: boolean) => {
      const c = current.current
      if (!c) return
      current.current = null
      setKey(null)
      setCopying(false)
      setRed(false)
      setMark(null)
      c.mover.settle?.(cancelled)
      if (cancelled) cancel()
      else commit()
      endTyped(cancelled)
      if (!cancelled && !c.moved) c.mover.click?.()
      if (!cancelled && c.moved) c.mover.done?.()
      c.mover.end?.(cancelled)
    },
    [cancel, commit],
  )

  // While dragging, Esc cancels. Listened in the capture phase and stopped there: mid-drag, the app shortcuts must
  // not also clear the selection, delete or undo / redo: the keys of those commands now (Del, Backspace, Ctrl+Z, Ctrl+Y by
  // default; a key the user gave them is swallowed the same). Delete's keys in a field are the field's: they edit a
  // measure being typed in the command line.
  useEffect(() => {
    if (key === null) return
    const onKey = (e: KeyboardEvent) => {
      if (!swallowedMidDrag(e)) return
      const escape = e.key === 'Escape'
      if (!escape && typingIn(e.target) && !(e.ctrlKey || e.metaKey || e.altKey)) return
      e.preventDefault()
      e.stopPropagation()
      if (escape) finish(true)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [key, finish])

  // If the plan unmounts mid-drag, what is on screen stays as one step.
  useEffect(() => () => finish(false), [finish])

  /** A move of the pointer being dragged: the Mover gets the offset since the press. */
  const move = useCallback(
    (e: { pointerId: number; clientX: number; clientY: number; shiftKey: boolean }) => {
      const c = current.current
      if (!c || c.pointerId !== e.pointerId) return
      if (!c.moved && Math.hypot(e.clientX - c.x, e.clientY - c.y) < CLICK_TOLERANCE) return // a shaky click is not a move
      c.moved = true
      const q = toWorld(e)
      const r = c.mover({ x: q.x - c.start.x, y: q.y - c.start.y }, e)
      setRed(!r.ok)
      setMark(r.mark)
    },
    [toWorld],
  )

  // The pressed element can leave the plan mid-drag (a street dragged is drawn again as another run, Decision
  // "Streets layout"): its pointer events stop reaching it, so the window hears the rest of the drag. An event the
  // element already handled is skipped.
  const handled = useRef<Event | null>(null)
  useEffect(() => {
    if (key === null) return
    const onMove = (e: Event) => {
      if (handled.current !== e) move(e as unknown as MouseEvent & { pointerId: number })
    }
    const onUp = (e: Event) => {
      if (handled.current !== e && current.current?.pointerId === (e as unknown as { pointerId: number }).pointerId) finish(false)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [key, move, finish])

  const bind: Drag['bind'] = (k, start) => ({
    'data-handle': k,
    onPointerDown(e) {
      if (e.button !== 0 || current.current) return
      e.stopPropagation() // not a background pan
      const p = toWorld(e)
      const mover = start(e, p)
      if (!mover) return
      beginDrag(e)
      current.current = { pointerId: e.pointerId, key: k, start: p, x: e.clientX, y: e.clientY, moved: false, mover }
      setKey(k)
      setCopying(mover.copy === true)
      setRed(false)
    },
    onPointerMove(e) {
      handled.current = e.nativeEvent
      move(e)
    },
    onPointerUp(e) {
      handled.current = e.nativeEvent
      if (current.current?.pointerId !== e.pointerId) return
      e.currentTarget.releasePointerCapture?.(e.pointerId)
      finish(false)
    },
    onPointerCancel(e) {
      if (current.current?.pointerId === e.pointerId) finish(true)
    },
    onLostPointerCapture(e) {
      if (current.current?.pointerId === e.pointerId) finish(false)
    },
  })

  return { key, copying, red, mark, bind }
}
