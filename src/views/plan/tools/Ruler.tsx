// The ruler (T; port of Plaza-Practiko `vistas/planta/CapaMedidas.tsx`): a temporary measurement, never saved. Click
// and click (or press and drag) through the snap; Shift free; Escape clears it. Only with the Select tool: a drawing
// tool takes over. What it snaps to and how it reads a length are the plan's (SnapSourceContext: the site's, or the
// block editor's, in its unit).
import { useEffect, useState } from 'react'
import type { Point } from '../../../model/schema.ts'
import { useCommand } from '../command/commandState.ts'
import type { SnapMark as Mark } from '../snap/move.ts'
import { SnapMark } from '../snap/SnapMark.tsx'
import { useLengthFormat } from '../snap/SnapSourceContext.tsx'
import { Capture, Label, menuOpen, useToolSnap, type ToolCamera } from './common.tsx'
import { letGo } from '../../tools/hand.ts'
import { useRuler } from './toolState.ts'
import { beginDrag } from '../../controls/beginDrag.ts'

export function Ruler({ camera }: { camera: ToolCamera }) {
  const { a, b } = useRuler()
  const snap = useToolSnap(camera.scale)
  const lengthText = useLengthFormat()
  const [cursor, setCursor] = useState<Point | null>(null)
  const [pressed, setPressed] = useState(false)
  const [mark, setMark] = useState<Mark | null>(null)
  const px = 1 / camera.scale

  const at = (e: { clientX: number; clientY: number; shiftKey: boolean }) => {
    // the second end starts from the first (ortho, perpendicular)
    const r = snap(camera.toWorld(e), e, a && !b ? a : null)
    setMark(r.mark)
    useCommand.getState().setCursor(r.point)
    return r.point
  }
  /** An end placed (click or typed): after a whole measurement it starts another; with half of one, it finishes it. */
  const placeEnd = (q: Point) => {
    if (!a || b) useRuler.setState({ a: q, b: null })
    else useRuler.setState({ b: q })
    useCommand.getState().fixAngle(null)
  }
  const second = a !== null && b === null

  useEffect(() => {
    useCommand.getState().register({
      tool: 'Ruler',
      prompt: second ? 'Second end' : 'First end',
      help: second ? '12 · 12<30 · 5,3 · #5,3 · <30' : 'click or type x,y',
      context: () => ({ first: !second, base: second ? a : null, cursor: useCommand.getState().cursor, rectangle: false, angle: useCommand.getState().angle }),
      apply: (c) => {
        if (c.kind !== 'point') return c.kind === 'empty'
        placeEnd(c.point)
        return true
      },
      cancel: () => (a ? useRuler.getState().clear() : letGo()),
    })
  })
  useEffect(() => () => useCommand.getState().register(null), [])
  // Escape clears the measurement (and, without one, turns the ruler off); heard first, so the plan keeps its selection
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // an open menu's Escape is its own: it closes the menu and leaves the measurement
      if (e.key !== 'Escape' || menuOpen()) return
      const r = useRuler.getState()
      if (r.a) r.clear()
      else letGo()
      e.stopPropagation()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

  const end = b ?? (a ? cursor : null)
  const length = a && end ? Math.hypot(end.x - a.x, end.y - a.y) : 0
  const angle = a && end ? (Math.atan2(end.y - a.y, end.x - a.x) * 180) / Math.PI : 0

  return (
    <g data-tool="ruler">
      <Capture
        camera={camera}
        onPointerDown={(e) => {
          if (e.button !== 0) return
          e.stopPropagation()
          beginDrag(e)
          setPressed(true)
          placeEnd(at(e))
        }}
        onPointerMove={(e) => setCursor(at(e))}
        onPointerUp={(e) => {
          setPressed(false)
          const r = useRuler.getState()
          // press and drag: the second end lands where it was released
          if (pressed && r.a && !r.b) {
            const q = at(e)
            if (Math.hypot(q.x - r.a.x, q.y - r.a.y) * camera.scale > 4) useRuler.setState({ b: q })
          }
        }}
        onPointerLeave={() => {
          setCursor(null)
          setMark(null)
        }}
      />
      {a && end && (
        <g pointerEvents="none" data-ruler="">
          <line x1={a.x} y1={-a.y} x2={end.x} y2={-end.y} stroke="var(--ink)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
          {[a, end].map((q, i) => (
            <circle key={i} cx={q.x} cy={-q.y} r={3 * px} fill="var(--panel)" stroke="var(--ink)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
          ))}
          <Label q={{ x: (a.x + end.x) / 2, y: (a.y + end.y) / 2 }} px={px} dy={-14} text={`${lengthText(length)} · ${Math.round(((angle % 180) + 180) % 180)}°`} />
        </g>
      )}
      {cursor && <SnapMark mark={mark} px={px} />}
    </g>
  )
}
