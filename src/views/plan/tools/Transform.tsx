// The Tools strip's Move, Copy and Rotate (keys M, C, R: commands/tools.ts) (Phases GT.4 and GT.5, Decisions "General tools", "Tools strip"): whatever is
// picked, of any kind, goes by a base point and a target point, as AutoCAD's MOVE and COPY do, or turns by a pivot, the
// start of the turn and its end, as Rhino's and SketchUp's Rotate do.
// Move and Copy:
//   step 0  Base point: it snaps to everything, the selection too (`useToolSnap`, the roads and gates as well)
//   step 1  Target point: what attracts is frozen as the step starts, without what moves (its own corners would follow
//           the pointer); the base is ortho's and a typed distance's start. The pointer previews the move (or the
//           copies) through the store's `preview`; a click or a typed point commits it as one undo step
//   Move    goes back to Select once done, the moved still picked
//   Copy    stays on for another copy from the same base, the originals still picked; Enter ends it
// Rotate:
//   step 0  Pivot, step 1 Start of the turn (not at the pivot): both snap to everything; the pivot is the start's base
//   step 2  End of the turn: what attracts is frozen without what turns; the pointer previews the turn by the angle from
//           the start to the snapped point about the pivot (Ortho: by ROTATE_STEP; Shift free), or an angle is typed.
//           A click or the angle commits it as one undo step and goes back to Select, the turned still picked
// Escape, Backspace and Ctrl+Z step back (Rotate: end → start → pivot), dropping the preview; Escape at the first step
// goes back to Select. What a verb cannot take along (`skipped`) is told once each.
// Unlike a drag's, the preview stands between two clicks, so it is kept from being made a step half-way
// (`useStandingPreview`, `standingPreview.ts`, shared with Mirror, Array and Align): the pointer leaving the plan drops it, the
// app's keys that edit the project are the tool's in the step it stands in, and an undo or redo cancels it.
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Point } from '../../../model/schema.ts'
import { actions } from '../../../state/actions/index.ts'
import { useApp } from '../../../state/store.ts'
import { useCommand } from '../command/commandState.ts'
import { ROTATE_STEP } from '../editing.ts'
import { nothingPicked, withoutHeld } from '../mix.ts'
import { type SnapMark as Mark, type Targets } from '../snap/move.ts'
import { SnapMark } from '../snap/SnapMark.tsx'
import { useSnapSettings } from '../snap/settings.ts'
import { Capture, Label, useDrawingKeys, useToolSnap, type ToolCamera } from './common.tsx'
import { letGo } from '../../tools/hand.ts'
import { holdNow, pickAgain, targetsWithout, useStandingPreview, useTell, type Held } from './standingPreview.ts'
import { lengthText } from './toolState.ts'

export type TransformMode = 'move' | 'copy' | 'rotate'

export function Transform({ camera, mode }: { camera: ToolCamera; mode: TransformMode }) {
  if (mode === 'rotate') return <Rotate camera={camera} />
  return <MoveOrCopy camera={camera} copy={mode === 'copy'} />
}

function MoveOrCopy({ camera, copy }: { camera: ToolCamera; copy: boolean }) {
  const [base, setBase] = useState<Point | null>(null)
  const [targets, setTargets] = useState<Targets | null>(null)
  const [cursor, setCursor] = useState<Point | null>(null)
  const [mark, setMark] = useState<Mark | null>(null)
  const snap = useToolSnap(camera.scale, true, base ? targets : null)
  const held = useRef<Held | null>(null)
  // the pointer's last point on the plan: when it leaves to type, a distance still goes towards it
  const last = useRef<Point | null>(null)
  const skipped = useRef<string[]>([])
  const tell = useTell()
  const px = 1 / camera.scale

  // the preview committed or cancelled by someone else: its base is gone with it
  const lost = useCallback(() => {
    setBase(null)
    setTargets(null)
  }, [])
  const preview = useStandingPreview(base !== null, lost)
  const drop = preview.drop

  /** The preview of the things picked going from the base to q. */
  const show = (q: Point) => {
    const h = held.current
    if (!base || !h) return
    const d = { x: q.x - base.x, y: q.y - base.y }
    const option = useApp.getState().option
    preview.show((p) => {
      const r = copy ? actions.copyPicked(p, option, h.picked, d) : actions.movePicked(p, option, withoutHeld(h.picked), d)
      skipped.current = r.skipped
      return r.project
    })
  }

  /** A point: the base, or the target (committed). False: it could not be taken. */
  const place = (q: Point): boolean => {
    useCommand.getState().fixAngle(null)
    if (!base) {
      if (nothingPicked()) {
        letGo()
        return false
      }
      held.current = holdNow()
      setTargets(targetsWithout(held.current))
      setBase(q)
      return true
    }
    const h = held.current
    if (!h || Math.hypot(q.x - base.x, q.y - base.y) < 1e-3) return false // the target cannot be the base
    show(q)
    preview.commit()
    tell(skipped.current)
    pickAgain(h)
    if (!copy) {
      letGo()
      return true
    }
    // another copy from the same base: the one just made attracts too
    setTargets(targetsWithout(h))
    return true
  }

  const back = useCallback(() => {
    drop()
    setBase(null)
    setTargets(null)
    if (held.current) pickAgain(held.current)
  }, [drop])
  const end = useCallback(() => {
    drop()
    if (held.current) pickAgain(held.current)
    letGo()
  }, [drop])
  // Enter ends Copy (at either step: as AutoCAD's COPY); Move has nothing to finish
  const enter = useCallback(() => {
    if (!copy) return false
    end()
    return true
  }, [copy, end])
  const escape = useCallback(() => (base ? back() : end()), [base, back, end])
  const undo = useCallback(() => {
    if (!base) return false
    back()
    return true
  }, [base, back])
  useDrawingKeys({ enter, escape, back, undo })

  /** The point under the pointer: the target's starts from the base (ortho). */
  const at = (e: { clientX: number; clientY: number; shiftKey: boolean }): Point => {
    const r = snap(camera.toWorld(e), e, base)
    setMark(r.mark)
    last.current = r.point
    useCommand.getState().setCursor(r.point)
    return r.point
  }

  useEffect(() => {
    useCommand.getState().register({
      tool: copy ? 'Copy' : 'Move',
      prompt: base ? 'Target point' : 'Base point',
      help: base ? 'click, or type 12 · 12<30 · @5,3' : 'click or type x,y',
      context: () => ({ first: !base, base, cursor: useCommand.getState().cursor ?? last.current, rectangle: false, angle: useCommand.getState().angle }),
      apply: (c) => {
        if (c.kind === 'point') return place(c.point)
        if (c.kind === 'empty') return enter()
        return false
      },
      cancel: escape,
      back,
    })
  })

  const tool = copy ? 'copy' : 'move'
  return (
    <g data-tool={tool} onContextMenu={drop}>
      <Capture
        camera={camera}
        onPointerDown={(e) => {
          if (e.button === 0) e.stopPropagation()
        }}
        onPointerUp={(e) => {
          if (e.button === 0) place(at(e))
        }}
        onPointerMove={(e) => {
          const q = at(e)
          setCursor(q)
          show(q)
        }}
        onPointerLeave={() => {
          // off the plan, nothing previews: a panel's edit or a typed point starts from the project as it was
          drop()
          setCursor(null)
          setMark(null)
        }}
      />
      {base && cursor && (
        <g pointerEvents="none">
          <path d={`M${base.x} ${-base.y}L${cursor.x} ${-cursor.y}`} stroke="var(--ink)" strokeWidth={1} strokeDasharray="6 3" vectorEffect="non-scaling-stroke" />
          <Label q={cursor} text={lengthText(Math.hypot(cursor.x - base.x, cursor.y - base.y))} px={px} dy={-16} />
        </g>
      )}
      {cursor && <SnapMark mark={mark} px={px} />}
    </g>
  )
}

/**
 * The signed turn, in degrees (−180, 180], from `start − pivot` to `q − pivot` (counter-clockwise positive); with
 * `ortho`, to the nearest ROTATE_STEP. 0 when either point is at the pivot.
 */
export function turnAngle(pivot: Point, start: Point, q: Point, ortho: boolean): number {
  const sx = start.x - pivot.x
  const sy = start.y - pivot.y
  const qx = q.x - pivot.x
  const qy = q.y - pivot.y
  if (Math.hypot(sx, sy) < 1e-9 || Math.hypot(qx, qy) < 1e-9) return 0
  const raw = (Math.atan2(sx * qy - sy * qx, sx * qx + sy * qy) * 180) / Math.PI
  const turn = ortho ? Math.round(raw / ROTATE_STEP) * ROTATE_STEP : raw
  // atan2 gives [−180, 180]: −180 is the same turn as 180
  return turn <= -180 ? turn + 360 : turn === 0 ? 0 : turn
}

/** «30°», «-12.5°»: to 0.1°. */
const angleText = (degrees: number) => `${degrees.toLocaleString('en-US', { maximumFractionDigits: 1 })}°`

function Rotate({ camera }: { camera: ToolCamera }) {
  const [pivot, setPivot] = useState<Point | null>(null)
  const [start, setStart] = useState<Point | null>(null)
  const [targets, setTargets] = useState<Targets | null>(null)
  const [cursor, setCursor] = useState<Point | null>(null)
  const [turn, setTurn] = useState(0)
  const [mark, setMark] = useState<Mark | null>(null)
  const snap = useToolSnap(camera.scale, true, start ? targets : null)
  const held = useRef<Held | null>(null)
  const last = useRef<Point | null>(null)
  const skipped = useRef<string[]>([])
  const tell = useTell()
  const px = 1 / camera.scale

  // the preview committed or cancelled by someone else: back to the pivot
  const lost = useCallback(() => {
    setPivot(null)
    setStart(null)
    setTargets(null)
  }, [])
  const preview = useStandingPreview(start !== null, lost)
  const drop = preview.drop

  /** The preview of the things picked turned by `degrees` about the pivot. */
  const show = (degrees: number) => {
    const h = held.current
    if (!pivot || !start || !h) return
    const option = useApp.getState().option
    preview.show((p) => {
      const r = actions.turnPicked(p, option, withoutHeld(h.picked), pivot, degrees)
      skipped.current = r.skipped
      return r.project
    })
  }

  /** The turn by `degrees` made one undo step; the tool goes back to Select, the turned still picked. */
  const turnBy = (degrees: number): boolean => {
    const h = held.current
    if (!pivot || !start || !h) return false
    show(degrees)
    preview.commit()
    tell(skipped.current)
    pickAgain(h)
    letGo()
    return true
  }

  /** The turn towards q, as the pointer gives it (Ortho by steps, Shift free). */
  const turnTo = (q: Point, free: boolean): number =>
    pivot && start ? turnAngle(pivot, start, q, !free && useSnapSettings.getState().settings.ortho) : 0

  /** A point: the pivot, the start, or the end (committed). False: it could not be taken. */
  const place = (q: Point, free = false): boolean => {
    useCommand.getState().fixAngle(null)
    if (!pivot) {
      if (nothingPicked()) {
        letGo()
        return false
      }
      held.current = holdNow()
      setPivot(q)
      return true
    }
    if (Math.hypot(q.x - pivot.x, q.y - pivot.y) < 1e-3) return false // no direction from the pivot
    if (!start) {
      if (held.current) setTargets(targetsWithout(held.current))
      setStart(q)
      return true
    }
    return turnBy(turnTo(q, free))
  }

  /** One step back: the end's preview dropped and the start let go, or the pivot. */
  const back = useCallback(() => {
    drop()
    if (start) {
      setStart(null)
      setTargets(null)
    } else setPivot(null)
    if (held.current) pickAgain(held.current)
  }, [drop, start])
  const end = useCallback(() => {
    drop()
    if (held.current) pickAgain(held.current)
    letGo()
  }, [drop])
  const escape = useCallback(() => (pivot ? back() : end()), [pivot, back, end])
  const undo = useCallback(() => {
    if (!pivot) return false
    back()
    return true
  }, [pivot, back])
  useDrawingKeys({ enter: () => false, escape, back, undo })

  /** The point under the pointer: the start's ortho starts from the pivot; the end's turns by steps instead. */
  const at = (e: { clientX: number; clientY: number; shiftKey: boolean }): Point => {
    const r = snap(camera.toWorld(e), e, start ? null : pivot)
    setMark(r.mark)
    last.current = r.point
    useCommand.getState().setCursor(r.point)
    return r.point
  }

  useEffect(() => {
    useCommand.getState().register({
      tool: 'Rotate',
      prompt: start ? 'End of the turn' : pivot ? 'Start of the turn' : 'Pivot',
      help: start ? 'click, or type the angle · 30 · -45' : pivot ? 'click, or type 12 · 12<30 · @5,3' : 'click or type x,y',
      context: () => ({
        first: !pivot,
        base: pivot,
        cursor: useCommand.getState().cursor ?? last.current,
        rectangle: false,
        angle: useCommand.getState().angle,
        angleOnly: start !== null,
      }),
      apply: (c) => {
        if (c.kind === 'point') return place(c.point, true)
        if (c.kind === 'angle' && start) return turnBy(c.degrees)
        return false
      },
      cancel: escape,
      back,
    })
  })

  return (
    <g data-tool="rotate" onContextMenu={drop}>
      <Capture
        camera={camera}
        onPointerDown={(e) => {
          if (e.button === 0) e.stopPropagation()
        }}
        onPointerUp={(e) => {
          if (e.button === 0) place(at(e), e.shiftKey)
        }}
        onPointerMove={(e) => {
          const q = at(e)
          setCursor(q)
          if (!start) return
          const degrees = turnTo(q, e.shiftKey)
          setTurn(degrees)
          show(degrees)
        }}
        onPointerLeave={() => {
          // off the plan, nothing previews: a panel's edit or a typed angle starts from the project as it was
          drop()
          setCursor(null)
          setMark(null)
        }}
      />
      {pivot && (cursor || start) && (
        <g pointerEvents="none">
          {start && <path d={`M${pivot.x} ${-pivot.y}L${start.x} ${-start.y}`} stroke="var(--ink)" strokeWidth={1} strokeDasharray="6 3" vectorEffect="non-scaling-stroke" />}
          {cursor && <path d={`M${pivot.x} ${-pivot.y}L${cursor.x} ${-cursor.y}`} stroke="var(--ink)" strokeWidth={1} strokeDasharray="6 3" vectorEffect="non-scaling-stroke" />}
          {start && cursor && <Label q={pivot} text={angleText(turn)} px={px} dy={-16} />}
        </g>
      )}
      {cursor && <SnapMark mark={mark} px={px} />}
    </g>
  )
}
