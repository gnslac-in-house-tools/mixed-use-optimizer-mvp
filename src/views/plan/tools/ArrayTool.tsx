// The Tools strip's Array (key A: commands/tools.ts; Phase AS.5, Decision "Mirror, Array, Align"): whatever is picked is copied
// along a vector, `Count` copies in a row (the original counted), as the General group's ▾ says.
//   step 0  Base point: it snaps to everything, the selection too (`useToolSnap`, the roads and gates as well)
//   step 1  The place of the first copy: the vector from the base is the spacing (what attracts is frozen as the step starts,
//           without what is picked; the base is Ortho's and a typed distance's start). The copies are previewed along it from
//           the first click on, through the store's `preview`; a click or a typed point sets the array as one undo step
//   step 2  Only with Rows over 1: the place of the second row (a click or a typed point again, from the base); the grid is set
//           as one undo step
// The tool lets go when the array is set, what was picked still picked. Typing `x5` sets the count (the command line takes
// the x only while Array is on: `CommandContext.count`), a typed number is the spacing along the pointer's direction, as it is
// Move's distance. Count and rows are held to what `generalSettings.ts` allows (50 each, 100 copies in all): the verb has no cap.
// Escape, Backspace and Ctrl+Z step back (second row → first copy → base); Escape at the base lets go.
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Point } from '../../../model/schema.ts'
import { actions } from '../../../state/actions/index.ts'
import { useApp } from '../../../state/store.ts'
import { useToast } from '../../layout/toast.ts'
import { useCommand } from '../command/commandState.ts'
import { nothingPicked } from '../mix.ts'
import { type SnapMark as Mark, type Targets } from '../snap/move.ts'
import { SnapMark } from '../snap/SnapMark.tsx'
import { letGo } from '../../tools/hand.ts'
import { Capture, Label, useDrawingKeys, useToolSnap, type ToolCamera } from './common.tsx'
import { countCap, MAX_COPIES, useGeneralTools } from './generalSettings.ts'
import { holdNow, pickAgain, targetsWithout, useStandingPreview, useTell, type Held } from './standingPreview.ts'
import { lengthText } from './toolState.ts'

const between = (from: Point, to: Point): Point => ({ x: to.x - from.x, y: to.y - from.y })
const apart = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y)

export function ArrayTool({ camera }: { camera: ToolCamera }) {
  const [base, setBase] = useState<Point | null>(null)
  // the place of the first copy, once it is a step of its own (Rows over 1): the second row is asked for
  const [first, setFirst] = useState<Point | null>(null)
  const [targets, setTargets] = useState<Targets | null>(null)
  const [cursor, setCursor] = useState<Point | null>(null)
  const [mark, setMark] = useState<Mark | null>(null)
  const count = useGeneralTools((s) => s.count)
  const rows = useGeneralTools((s) => s.rows)
  const snap = useToolSnap(camera.scale, true, base ? targets : null)
  const held = useRef<Held | null>(null)
  const last = useRef<Point | null>(null)
  // where the preview was made last: a count or a rows changed while it stands makes it again
  const shownAt = useRef<Point | null>(null)
  const skipped = useRef<string[]>([])
  const tell = useTell()
  const px = 1 / camera.scale

  // the preview committed or cancelled by someone else: back to the base
  const lost = useCallback(() => {
    setBase(null)
    setFirst(null)
    setTargets(null)
    shownAt.current = null
  }, [])
  const preview = useStandingPreview(base !== null, lost)
  const drop = preview.drop

  /** The array of what is picked: the row along d, and with `d2` the rows of the grid. */
  const make = (d: Point, d2?: Point) => {
    const h = held.current
    if (!h) return
    const option = useApp.getState().option
    const { count: n, rows: m } = useGeneralTools.getState()
    preview.show((p) => {
      const r = actions.arrayPicked(p, option, h.picked, d, n, d2 ? m : 1, d2)
      skipped.current = r.skipped
      return r.project
    })
  }

  /** The preview with the pointer at q: the first copy's place, or (the second row asked for) the second row's. */
  const show = (q: Point) => {
    if (!base || !held.current) return
    shownAt.current = q
    if (first) make(between(base, first), between(base, q))
    else make(between(base, q))
  }

  // a count or rows changed (the ▾, a typed x5) while a preview stands: it follows
  useEffect(() => {
    if (base && cursor && shownAt.current) show(shownAt.current)
  }, [count, rows]) // eslint-disable-line react-hooks/exhaustive-deps

  /** The array set: one undo step, the tool lets go, what was picked still picked. */
  const setArray = (d: Point, d2?: Point): boolean => {
    const h = held.current
    if (!h) return false
    make(d, d2)
    preview.commit()
    tell(skipped.current)
    pickAgain(h)
    letGo()
    return true
  }

  /** A point: the base, the first copy's place, or the second row's. False: it could not be taken. */
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
    if (apart(base, q) < 1e-3) return false // no spacing, no direction
    if (first) return setArray(between(base, first), between(base, q))
    if (useGeneralTools.getState().rows > 1) {
      // the row stays previewed until the pointer moves to the second row
      setFirst(q)
      return true
    }
    return setArray(between(base, q))
  }

  /** A typed count: held to what the rows leave of the copies allowed, and said when it was held. */
  const typedCount = (n: number): boolean => {
    const taken = useGeneralTools.getState().setCount(n)
    if (taken !== n) {
      const m = useGeneralTools.getState().rows
      const cap = countCap(m)
      useToast.getState().show('info', `Count held to ${taken}: at most ${cap} in a row${m > 1 ? ` with ${m} rows` : ''}, ${MAX_COPIES} copies in all`)
    }
    return true
  }

  /** One step back: the second row's preview dropped and the first copy let go, or the base. */
  const back = useCallback(() => {
    drop()
    shownAt.current = null
    if (first) setFirst(null)
    else {
      setBase(null)
      setTargets(null)
    }
    if (held.current) pickAgain(held.current)
  }, [drop, first])
  const end = useCallback(() => {
    drop()
    if (held.current) pickAgain(held.current)
    letGo()
  }, [drop])
  const escape = useCallback(() => (base ? back() : end()), [base, back, end])
  const undo = useCallback(() => {
    if (!base) return false
    back()
    return true
  }, [base, back])
  useDrawingKeys({ enter: () => false, escape, back, undo })

  /** The point under the pointer: Ortho starts from the base. */
  const at = (e: { clientX: number; clientY: number; shiftKey: boolean }): Point => {
    const r = snap(camera.toWorld(e), e, base)
    setMark(r.mark)
    last.current = r.point
    useCommand.getState().setCursor(r.point)
    return r.point
  }

  useEffect(() => {
    useCommand.getState().register({
      tool: 'Array',
      prompt: first ? 'Second row' : base ? 'First copy' : 'Base point',
      help: first ? 'click, or type 12 · 12<30 · @5,3 · x5 sets the count' : base ? 'click, or type the spacing · 12 · 12<30 · @5,3 · x5 sets the count' : 'click or type x,y · x5 sets the count',
      context: () => ({ first: !base, base, cursor: useCommand.getState().cursor ?? last.current, rectangle: false, angle: useCommand.getState().angle, count: true }),
      apply: (c) => {
        if (c.kind === 'point') return place(c.point)
        if (c.kind === 'count') return typedCount(c.value)
        return false
      },
      cancel: escape,
      back,
    })
  })

  return (
    // a right-click: the preview goes first, so the plan's menu finds what is there and not the copies (the plan lets the tool go)
    <g data-tool="array" onContextMenu={drop}>
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
          shownAt.current = null
          setCursor(null)
          setMark(null)
        }}
      />
      {base && cursor && (
        <g pointerEvents="none">
          {first && <path d={`M${base.x} ${-base.y}L${first.x} ${-first.y}`} stroke="var(--ink)" strokeWidth={1} strokeDasharray="6 3" vectorEffect="non-scaling-stroke" />}
          <path d={`M${base.x} ${-base.y}L${cursor.x} ${-cursor.y}`} stroke="var(--ink)" strokeWidth={1} strokeDasharray="6 3" vectorEffect="non-scaling-stroke" />
          <Label q={cursor} text={`${lengthText(apart(base, cursor))} × ${first ? rows : count}`} px={px} dy={-16} />
        </g>
      )}
      {cursor && <SnapMark mark={mark} px={px} />}
    </g>
  )
}
