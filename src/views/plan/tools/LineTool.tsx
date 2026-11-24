// What Mirror (`Mirror.tsx`) and Align (`Align.tsx`) share (Phase AS.5 task 5, Decision "Mirror, Array, Align"): a tool whose two
// clicks give a line, and the verb it applies to what is picked about it.
//   step 0  First point of the line: it snaps to everything, the selection too (`useToolSnap`, the roads and gates as well)
//   step 1  Second point: what attracts is frozen as the step starts (the plan without what is picked, unless the picked stay
//           where they are: Mirror keeping the original); the pointer previews the verb about the line from the first
//           point to it, from the first click on, through the store's `preview`; a click or a typed point sets it as one
//           undo step and the tool lets go, what was picked still picked. Mirror's line steps by ROTATE_STEP with Ortho
//           (Shift free) and takes a typed angle; Align's second point takes Ortho's axes from the first as a street's does
// Escape, Backspace and Ctrl+Z step back (second point → first point), dropping the preview; Escape at the first step lets go.
// What the verb cannot take along (`skipped`) is told once each. The guards of a preview that stands are `standingPreview.ts`'s.
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Id, Point, Project } from '../../../model/schema.ts'
import { NOTHING_PICKED } from '../../../model/picked.ts'
import { useApp } from '../../../state/store.ts'
import { useCommand } from '../command/commandState.ts'
import { ROTATE_STEP } from '../editing.ts'
import { nothingPicked } from '../mix.ts'
import { type SnapMark as Mark, type Targets } from '../snap/move.ts'
import { SnapMark } from '../snap/SnapMark.tsx'
import { useSnapSettings } from '../snap/settings.ts'
import { letGo } from '../../tools/hand.ts'
import { Capture, Label, useDrawingKeys, useToolSnap, type ToolCamera } from './common.tsx'
import { holdNow, pickAgain, targetsWithout, useStandingPreview, useTell, type Held } from './standingPreview.ts'

/** What a verb of what is picked gives back. */
interface Made {
  project: Project
  skipped: string[]
}

export interface LineSpec {
  tool: 'mirror' | 'align'
  /** The command line's name for the tool, and its two prompts and helps. */
  label: string
  prompt: [string, string]
  help: [string, string]
  /** The verb about the line from `a` to `b`, over `held` (the tool decides which of it: the whole, or without the locked nodes). */
  run(p: Project, option: Id, held: Held, a: Point, b: Point): Made
  /** The picked stay where they are while the line is chosen, so they still attract (Mirror keeping the original). */
  stays?(): boolean
  /** The line's angle steps by ROTATE_STEP with Ortho and a typed angle gives it (Mirror); else Ortho is the snap's axes from the first point. */
  angle?: boolean
  /** The label at the pointer, from the first point to it. */
  text(a: Point, b: Point): string
}

/** The same angle, to the nearest ROTATE_STEP, at the same distance from `a`. */
function stepped(a: Point, q: Point): Point {
  const d = Math.hypot(q.x - a.x, q.y - a.y)
  if (d < 1e-9) return q
  const turn = (Math.round(((Math.atan2(q.y - a.y, q.x - a.x) * 180) / Math.PI) / ROTATE_STEP) * ROTATE_STEP * Math.PI) / 180
  return { x: a.x + d * Math.cos(turn), y: a.y + d * Math.sin(turn) }
}

export function LineTool({ camera, spec }: { camera: ToolCamera; spec: LineSpec }) {
  const [a, setA] = useState<Point | null>(null)
  const [targets, setTargets] = useState<Targets | null>(null)
  const [cursor, setCursor] = useState<Point | null>(null)
  // where the line ends as previewed (Mirror's, stepped by Ortho)
  const [end, setEnd] = useState<Point | null>(null)
  const [mark, setMark] = useState<Mark | null>(null)
  const snap = useToolSnap(camera.scale, true, a ? targets : null)
  const held = useRef<Held | null>(null)
  const last = useRef<Point | null>(null)
  const skipped = useRef<string[]>([])
  const tell = useTell()
  const px = 1 / camera.scale

  // the preview committed or cancelled by someone else: back to the first point
  const lost = useCallback(() => {
    setA(null)
    setTargets(null)
    setEnd(null)
  }, [])
  const preview = useStandingPreview(a !== null, lost)
  const drop = preview.drop

  /** The line's end for the pointer at q: Mirror's steps by ROTATE_STEP with Ortho (Shift free). */
  const lineEnd = (q: Point, free: boolean): Point => (a && spec.angle && !free && useSnapSettings.getState().settings.ortho ? stepped(a, q) : q)

  /** The preview of the verb about the line from the first point to b. */
  const show = (b: Point) => {
    const h = held.current
    if (!a || !h) return
    // no line yet: the project as it was
    if (Math.hypot(b.x - a.x, b.y - a.y) < 1e-3) return drop()
    const option = useApp.getState().option
    preview.show((p) => {
      const r = spec.run(p, option, h, a, b)
      skipped.current = r.skipped
      return r.project
    })
  }

  /** The verb made one undo step; the tool lets go, what was picked still picked. */
  const set = (b: Point): boolean => {
    const h = held.current
    if (!a || !h || Math.hypot(b.x - a.x, b.y - a.y) < 1e-3) return false
    show(b)
    preview.commit()
    tell(skipped.current)
    pickAgain(h)
    letGo()
    return true
  }

  /** A point: the first, or the second (set). False: it could not be taken. */
  const place = (q: Point, free = false): boolean => {
    useCommand.getState().fixAngle(null)
    if (!a) {
      if (nothingPicked()) {
        letGo()
        return false
      }
      held.current = holdNow()
      // what stays where it is attracts too: the line may run along the picked thing's own wall
      setTargets(targetsWithout(spec.stays?.() ? { ...held.current, picked: NOTHING_PICKED, roads: [], drawings: [] } : held.current))
      setA(q)
      return true
    }
    return set(lineEnd(q, free))
  }

  /** One step back: the second point's preview dropped, the first point let go. */
  const back = useCallback(() => {
    drop()
    setA(null)
    setTargets(null)
    setEnd(null)
    if (held.current) pickAgain(held.current)
  }, [drop])
  const finish = useCallback(() => {
    drop()
    if (held.current) pickAgain(held.current)
    letGo()
  }, [drop])
  const escape = useCallback(() => (a ? back() : finish()), [a, back, finish])
  const undo = useCallback(() => {
    if (!a) return false
    back()
    return true
  }, [a, back])
  useDrawingKeys({ enter: () => false, escape, back, undo })

  /** The point under the pointer: the second point's Ortho (axes) starts from the first, but for Mirror's, which steps the angle. */
  const at = (e: { clientX: number; clientY: number; shiftKey: boolean }): Point => {
    const r = snap(camera.toWorld(e), e, spec.angle ? null : a)
    setMark(r.mark)
    last.current = r.point
    useCommand.getState().setCursor(r.point)
    return r.point
  }

  useEffect(() => {
    useCommand.getState().register({
      tool: spec.label,
      prompt: a ? spec.prompt[1] : spec.prompt[0],
      help: a ? spec.help[1] : spec.help[0],
      context: () => ({
        first: !a,
        base: a,
        cursor: useCommand.getState().cursor ?? last.current,
        rectangle: false,
        angle: useCommand.getState().angle,
        ...(spec.angle && a ? { angleOnly: true } : {}),
      }),
      apply: (c) => {
        if (c.kind === 'point') return place(c.point, true)
        // a typed angle gives the line's: from the first point, towards it
        if (c.kind === 'angle' && a && spec.angle) {
          const t = (c.degrees * Math.PI) / 180
          return set({ x: a.x + Math.cos(t), y: a.y + Math.sin(t) })
        }
        return false
      },
      cancel: escape,
      back,
    })
  })

  const shown = end ?? cursor
  return (
    // a right-click: the preview goes first, so the plan's menu finds what is there and not what the tool shows (the plan lets the tool go)
    <g data-tool={spec.tool} onContextMenu={drop}>
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
          if (!a) return
          const b = lineEnd(q, e.shiftKey)
          setEnd(b)
          show(b)
        }}
        onPointerLeave={() => {
          // off the plan, nothing previews: a panel's edit or a typed point starts from the project as it was
          drop()
          setCursor(null)
          setEnd(null)
          setMark(null)
        }}
      />
      {a && shown && (
        <g pointerEvents="none">
          <path d={`M${a.x} ${-a.y}L${shown.x} ${-shown.y}`} stroke="var(--ink)" strokeWidth={1} strokeDasharray="6 3" vectorEffect="non-scaling-stroke" />
          <Label q={shown} text={spec.text(a, shown)} px={px} dy={-16} />
        </g>
      )}
      {cursor && <SnapMark mark={mark} px={px} />}
    </g>
  )
}
