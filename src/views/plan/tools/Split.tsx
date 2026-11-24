// The Split tool (Phase D.3 task 8, Decision "Split tool"; Tools strip, Massing group, beside Chamfer; key S): two clicks give a line at any angle (the second point may be typed:
// `@0,40`, or a distance along the pointer) and each truck court of a placed block it crosses is split in two, through the shape engine (`splitCourts`: op `split` on the
// `block-court`, so the copy's own courts, a variant). One undo step; a court whose piece lies off its wall loses it and the toast says so. For now only a court: a line across
// nothing it can split says *Split takes a truck court for now* (the tool says it; the kinds do not list `split`). Escape and Backspace step back; the tool stays in hand for the next line.
import { useEffect, useState } from 'react'
import type { Point } from '../../../model/schema.ts'
import { useAllCourtRefs } from '../../../modules/warehouse/views/BlockCourtHandles.tsx'
import { useApp } from '../../../state/store.ts'
import { splitCourts } from '../../editing/shape/splitCourts.ts'
import { useToast } from '../../layout/toast.ts'
import { letGo } from '../../tools/hand.ts'
import { useCommand } from '../command/commandState.ts'
import { SnapMark } from '../snap/SnapMark.tsx'
import { type SnapMark as Mark } from '../snap/move.ts'
import { Capture, Label, useDrawingKeys, useToolSnap, type ToolCamera } from './common.tsx'

/** «30°»: the line's angle to 0.1°. */
const angleText = (a: Point, b: Point) => `${((Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI).toLocaleString('en-US', { maximumFractionDigits: 1 })}°`

export function Split({ camera }: { camera: ToolCamera }) {
  const [a, setA] = useState<Point | null>(null)
  const [cursor, setCursor] = useState<Point | null>(null)
  const [mark, setMark] = useState<Mark | null>(null)
  const refs = useAllCourtRefs()
  const snap = useToolSnap(camera.scale, true)
  const px = 1 / camera.scale

  /** The line from the first point to `b`: one undo step, or the toast with why not. */
  const cut = (b: Point): boolean => {
    if (!a) return false
    if (Math.hypot(b.x - a.x, b.y - a.y) < 1e-3) return false
    const r = splitCourts(useApp.getState().project, refs, a, b)
    if (r.count === 0) {
      useToast.getState().show('error', r.reason ?? '')
      setA(null)
      return true
    }
    useApp.getState().apply((p) => splitCourts(p, refs, a, b).project)
    if (r.notes.length) useToast.getState().show('info', r.notes.join('; '))
    setA(null)
    return true
  }

  /** A point: the first, or the second (the cut). False: it could not be taken. */
  const place = (q: Point): boolean => {
    useCommand.getState().fixAngle(null)
    if (!a) {
      setA(q)
      return true
    }
    return cut(q)
  }

  const back = () => setA(null)
  const escape = () => (a ? back() : letGo())
  useDrawingKeys({ enter: () => false, escape, back })

  useEffect(() => {
    useCommand.getState().register({
      tool: 'Split',
      prompt: a ? 'Second point of the line' : 'First point of the line',
      help: a ? 'click, or type @x,y or a distance along the pointer' : 'click or type x,y; the truck court the line crosses is split',
      context: () => ({ first: !a, base: a, cursor: useCommand.getState().cursor, rectangle: false, angle: useCommand.getState().angle }),
      apply: (c) => (c.kind === 'point' ? place(c.point) : false),
      cancel: escape,
      back,
    })
  })
  useEffect(() => () => useCommand.getState().register(null), [])

  const at = (e: { clientX: number; clientY: number; shiftKey: boolean }): Point => {
    const r = snap(camera.toWorld(e), e, a)
    setMark(r.mark)
    useCommand.getState().setCursor(r.point)
    return r.point
  }

  return (
    <g data-tool="split">
      <Capture
        camera={camera}
        onPointerDown={(e) => {
          if (e.button === 0) e.stopPropagation()
        }}
        onPointerUp={(e) => {
          if (e.button === 0) place(at(e))
        }}
        onPointerMove={(e) => setCursor(at(e))}
        onPointerLeave={() => {
          setCursor(null)
          setMark(null)
        }}
      />
      {a && cursor && (
        <g pointerEvents="none" aria-hidden="true">
          <path data-split-line="" d={`M${a.x} ${-a.y}L${cursor.x} ${-cursor.y}`} stroke="var(--ink)" strokeWidth={2} strokeDasharray="7 4" vectorEffect="non-scaling-stroke" />
          <Label q={cursor} text={angleText(a, cursor)} px={px} dy={-16} />
        </g>
      )}
      {cursor && <SnapMark mark={mark} px={px} />}
    </g>
  )
}
