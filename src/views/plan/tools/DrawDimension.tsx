// The Dimension tool (D; port of Plaza-Practiko `vistas/planta/edicion/DibujarCota.tsx`): click the first point, the
// second, and the pointer moves the dimension line away; a click leaves it. The points go through the snap and the
// command line takes what the ruler does; in the third step a number is the offset (on the pointer's side) and Enter
// leaves it where the pointer is. The tool stays on to place another; Escape cancels the one in progress and, without
// one, goes back to Select. Backspace removes a point. Each dimension is one undo step, saved in the Project; a plan
// with its own (the block editor's, BE.10) places it with `onPlace` (on the type) and reads it in its unit
// (SnapSourceContext).
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Point } from '../../../model/schema.ts'
import { actions } from '../../../state/actions/index.ts'
import { useApp } from '../../../state/store.ts'
import { useCommand } from '../command/commandState.ts'
import { DimensionFigure } from '../dimensions/DimensionFigure.tsx'
import { dimensionDrawing, offsetFrom } from '../dimensions/drawing.ts'
import type { SnapMark as Mark } from '../snap/move.ts'
import { SnapMark } from '../snap/SnapMark.tsx'
import { useSnapSource } from '../snap/SnapSourceContext.tsx'
import { Capture, useDrawingKeys, useToolSnap, type ToolCamera } from './common.tsx'
import { letGo } from '../../tools/hand.ts'
import { DIMENSIONS } from '../../layers/keys.ts'
import { useLayerView } from '../../layers/layerView.ts'

/** The foot of the perpendicular from q on the line a→b. */
function foot(a: Point, b: Point, q: Point): Point {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const l2 = dx * dx + dy * dy || 1
  const t = ((q.x - a.x) * dx + (q.y - a.y) * dy) / l2
  return { x: a.x + dx * t, y: a.y + dy * t }
}

/** `onPlace`: where a dimension goes (true: placed); absent, the Project's, on the active level. */
export function DrawDimension({ camera, onPlace }: { camera: ToolCamera; onPlace?(a: Point, b: Point, offset: number): boolean }) {
  const apply = useApp((s) => s.apply)
  const snap = useToolSnap(camera.scale)
  // the plan's own text (its unit), else the drawings' (two decimals, no unit)
  const format = useSnapSource()?.format
  const [points, setPoints] = useState<Point[]>([])
  const [cursor, setCursor] = useState<Point | null>(null)
  const [mark, setMark] = useState<Mark | null>(null)
  // the pointer's last point on the plan: when it leaves to type, a number and Enter still use it
  const last = useRef<Point | null>(null)
  const px = 1 / camera.scale
  const [a, b] = points

  const place = useCallback(
    (offset: number) => {
      if (!a || !b) return false
      if (onPlace) {
        if (!onPlace(a, b, offset)) return false
        setPoints([])
        return true
      }
      const { project, level } = useApp.getState()
      const r = actions.addDimension(project, a, b, offset, level)
      if (!r) return false
      apply(() => r.project)
      useLayerView.getState().setHidden([DIMENSIONS], false)
      setPoints([])
      return true
    },
    [a, b, apply, onPlace],
  )
  const enter = useCallback(() => {
    const c = cursor ?? last.current
    return a && b && c ? place(offsetFrom(a, b, c)) : false
  }, [a, b, cursor, place])
  const escape = useCallback(() => (points.length > 0 ? setPoints([]) : letGo()), [points.length])
  const back = useCallback(() => setPoints((ps) => ps.slice(0, -1)), [])
  useDrawingKeys({ enter, escape, back })

  /** The point under the pointer: the second starts from the first (ortho, perpendicular); the third has no base. */
  const at = (e: { clientX: number; clientY: number; shiftKey: boolean }): Point => {
    const r = snap(camera.toWorld(e), e, points.length === 1 ? a : null)
    setMark(r.mark)
    last.current = r.point
    useCommand.getState().setCursor(r.point)
    return r.point
  }
  const addPoint = (q: Point): boolean => {
    useCommand.getState().fixAngle(null)
    if (points.length >= 2) return place(offsetFrom(a, b, q))
    if (a && Math.hypot(q.x - a.x, q.y - a.y) < 1e-3) return false // the second point cannot be the first
    setPoints((ps) => [...ps, q])
    return true
  }

  useEffect(() => {
    const step = points.length
    useCommand.getState().register({
      tool: 'Dimension',
      prompt: step === 0 ? 'First point' : step === 1 ? 'Second point' : 'Distance of the dimension line',
      help: step === 0 ? 'click or type x,y' : step === 1 ? '12 · 12<30 · 5,3 · #5,3 · <30' : 'click, or type the distance · Enter',
      context: () => {
        const c = useCommand.getState().cursor ?? last.current
        if (step < 2 || !c) return { first: step === 0, base: step === 1 ? a : null, cursor: c, rectangle: false, angle: useCommand.getState().angle }
        // in the third step the base is the pointer's foot on the line: a number is the distance towards the pointer;
        // with the pointer on the line it goes to the left of a→b
        const base = foot(a, b, c)
        const l = Math.hypot(b.x - a.x, b.y - a.y)
        const left = { x: base.x - (b.y - a.y) / l, y: base.y + (b.x - a.x) / l }
        return { first: false, base, cursor: Math.abs(offsetFrom(a, b, c)) < 1e-6 ? left : c, rectangle: false }
      },
      apply: (c) => {
        if (c.kind === 'point') return addPoint(c.point)
        if (c.kind === 'empty') return enter()
        return false
      },
      cancel: escape,
      back,
    })
  })
  useEffect(() => () => useCommand.getState().register(null), [])

  const end = b ?? cursor
  const preview = a && end ? dimensionDrawing({ a, b: end, offset: b && cursor ? offsetFrom(a, b, cursor) : 0 }, px, format) : null

  return (
    <g data-tool="dimension">
      <Capture
        camera={camera}
        onPointerDown={(e) => {
          if (e.button === 0) e.stopPropagation()
        }}
        onPointerUp={(e) => {
          if (e.button === 0) addPoint(at(e))
        }}
        onPointerMove={(e) => setCursor(at(e))}
        onPointerLeave={() => {
          setCursor(null)
          setMark(null)
        }}
      />
      {preview && (
        <g pointerEvents="none" opacity={b ? 1 : 0.6}>
          <DimensionFigure d={preview} color="var(--ink)" />
        </g>
      )}
      {cursor && <SnapMark mark={mark} px={px} />}
    </g>
  )
}
