// A centreline drawn point by point (Decision "Exterior circulation"): the Existing road tool; `closed`,
// an outline instead (Phase 5.5: the Site menu's Draw boundary): three corners at
// least, a click on the first one closes it, no paving. Each click places a point through the snap (from the previous one: ortho, perpendicular), the
// other roads' centrelines and the gates included (Decision "Road snap"); Shift is free. Enter or a double click ends it (two points at least); Backspace (or Ctrl+Z) removes the last
// point; Escape cancels the line and, without one, leaves the tool. The paving is previewed at its width. The command
// line takes typed points (x,y · @x,y · d<a…) like the Mass tool's, and `w 10` for the width. The Street tool's paving
// is previewed by its side, each segment as it will be made (Decision "Street side when drawing"); Space (or Tab, once a point
// is placed) cycles the side. Before the first point the pointer carries a ghost of a street there (a stub of paving at the
// street's width, up the screen, the line drawn through the pointer its left edge, its centre or its right edge: `stretchStrip`,
// as the street will be made); the side's name stays beside the pointer while drawing. `bare`: a line with no width (the reference line, Phase AS.5):
// the same points, keys and command line, but no paving, no `w 10`, and the preview is the guide itself, thin and dashed.
import { useCallback, useEffect, useState } from 'react'
import { sideReach } from '../../../engine/circulation/streets.ts'
import { stretchStrip } from '../../../engine/path/strip.ts'
import type { Point, StreetSide } from '../../../model/schema.ts'
import { SIDE_NAMES } from '../circulation/roadState.ts'
import { useCommand } from '../command/commandState.ts'
import type { SnapMark as Mark } from '../snap/move.ts'
import { SnapMark } from '../snap/SnapMark.tsx'
import { Capture, Crosshair, Label, useDrawingKeys, useToolSnap, type ToolCamera } from './common.tsx'

/** Two clicks closer than this (m) are one: a double click sends two. */
const SAME_POINT = 1e-6
/** px: a click this near an outline's first corner closes it. */
const CLOSE_PX = 8

const line = (pts: Point[]) => pts.map((q, i) => `${i ? 'L' : 'M'}${q.x} ${-q.y}`).join('')

/**
 * What a street would be at the pointer, before its first point: a stub of paving at the street's width (world metres, so it
 * scales with the zoom), one width long each way from the pointer and pointing up the screen, the line about to be drawn
 * through the pointer as its left edge, its centre or its right edge, as `stretchStrip` has it for the street made, in the
 * manner of the paving preview; the dashed line is the one drawn.
 */
function SideGhost({ at, width, side }: { at: Point; width: number; side: StreetSide }) {
  const a = { x: at.x, y: at.y - width }
  const b = { x: at.x, y: at.y + width }
  const reach = sideReach(side, width)
  const strip = stretchStrip(a, b, reach.left, reach.right)
  if (!strip) return null
  return (
    <g pointerEvents="none">
      {/* outlined in ink: the paving's own colour is lost over a street or the dark ground */}
      <path data-street-side-ghost={side} d={`${line(strip)}Z`} fill="var(--road)" fillOpacity={0.7} stroke="var(--ink)" strokeWidth={1} strokeOpacity={0.7} vectorEffect="non-scaling-stroke" />
      <path d={line([a, b])} fill="none" stroke="var(--ink)" strokeWidth={1} strokeDasharray="6 3" vectorEffect="non-scaling-stroke" />
    </g>
  )
}

export function DrawPolyline(props: {
  camera: ToolCamera
  /** Its name on the command line and the tool layer's `data-tool`. */
  tool: string
  /** The paving's width a line starts with, in m. */
  width: number
  /** The finished line (two points or more) and its width; false keeps it (nothing was made). */
  onDone(points: Point[], width: number): boolean
  /** Escape without a line: leave the tool. */
  onExit(): void
  /** An outline, not a centreline. */
  closed?: boolean
  /** A line with no width (a reference line): no paving or width on the command line, previewed as the guide it will be. */
  bare?: boolean
  /** The centre lines the paving preview is drawn along, from the points and the width (the Street tool's: each
   *  segment by its side, Decision "Street side when drawing"); absent, the points themselves. */
  paving?(points: Point[], width: number): Point[][]
  /** The side the line is drawn by (the Street tool's): Space turns it, before the first point too (`back`: Shift), Tab
   *  once a point is placed; the pointer carries its ghost and its name. */
  side?: { value: StreetSide; cycle(back: boolean): void }
}) {
  const { camera, tool, onDone, onExit, closed = false, bare = false, paving, side } = props
  const cycle = side?.cycle
  const least = closed ? 3 : 2
  const [width, setWidth] = useState(props.width)
  const snap = useToolSnap(camera.scale, true)
  const [points, setPoints] = useState<Point[]>([])
  const [cursor, setCursor] = useState<Point | null>(null)
  const [mark, setMark] = useState<Mark | null>(null)
  const px = 1 / camera.scale
  const last = points[points.length - 1] ?? null

  const at = (e: { clientX: number; clientY: number; shiftKey: boolean }) => {
    const r = snap(camera.toWorld(e), e, last)
    setMark(r.mark)
    useCommand.getState().setCursor(r.point)
    return r.point
  }

  const addPoint = useCallback((q: Point) => {
    setPoints((ps) => {
      const u = ps[ps.length - 1]
      return u && Math.hypot(u.x - q.x, u.y - q.y) < SAME_POINT ? ps : [...ps, q]
    })
    useCommand.getState().fixAngle(null)
  }, [])
  const finish = useCallback((): boolean => {
    if (points.length < least) return false
    if (onDone(points, width)) setPoints([])
    return true
  }, [points, width, onDone, least])
  const back = useCallback(() => setPoints((ps) => ps.slice(0, -1)), [])
  const escape = useCallback(() => (points.length > 0 ? setPoints([]) : onExit()), [points.length, onExit])
  const undo = useCallback(() => {
    if (points.length === 0) return false
    back()
    return true
  }, [points.length, back])
  // Space is the tool's whenever it is in hand; Tab only while a line is being drawn: before its first point, it moves the focus as ever
  useDrawingKeys({ enter: finish, escape, back, undo, tab: points.length > 0 ? cycle : undefined, space: cycle })

  useEffect(() => {
    const n = points.length
    useCommand.getState().register({
      tool,
      prompt: closed ? (n === 0 ? 'First corner' : 'Next corner') : bare ? (n === 0 ? 'First point' : 'Next point') : `${n === 0 ? 'First point' : 'Next point'} · ${width} m wide`,
      help: bare
        ? n === 0
          ? 'click or type x,y'
          : '12 · 12<30 · 5,3 · @5,3 · Enter ends · Backspace removes'
        : closed
        ? n === 0
          ? 'click or type x,y'
          : '12 · 12<30 · 5,3 · @5,3 · Enter or a click on the first corner closes it · Backspace removes'
        : n === 0
          ? `click or type x,y · w 10 for the width${cycle ? ' · Space: side' : ''}`
          : `12 · 12<30 · 5,3 · @5,3 · w 10 · Enter ends · Backspace removes${cycle ? ' · Space: side' : ''}`,
      context: () => ({ first: n === 0, base: points[n - 1] ?? null, cursor: useCommand.getState().cursor, rectangle: false, width: !closed && !bare, angle: useCommand.getState().angle }),
      apply: (c) => {
        if (c.kind === 'point') {
          addPoint(c.point)
          return true
        }
        if (c.kind === 'width' && !closed && !bare) {
          setWidth(c.value)
          return true
        }
        if (c.kind === 'empty') return finish()
        return false
      },
      cancel: escape,
      back,
    })
  }, [tool, points, width, addPoint, finish, escape, back, closed, bare, cycle])
  useEffect(() => () => useCommand.getState().register(null), [])

  const preview = cursor && last ? [...points, cursor] : points
  return (
    <g data-tool={tool}>
      <Capture
        camera={camera}
        onPointerDown={(e) => {
          if (e.button === 0) e.stopPropagation()
        }}
        onPointerUp={(e) => {
          if (e.button !== 0) return
          const q = at(e)
          // an outline closes with a click on its first corner
          if (closed && points.length >= least && Math.hypot(q.x - points[0].x, q.y - points[0].y) <= CLOSE_PX * px) finish()
          else addPoint(q)
        }}
        onPointerMove={(e) => setCursor(at(e))}
        onPointerLeave={() => {
          setCursor(null)
          setMark(null)
        }}
        onDoubleClick={(e) => {
          e.stopPropagation()
          finish()
        }}
      />
      {closed && preview.length >= 2 && (
        <path d={`${line(preview)}Z`} fill="var(--hover)" stroke="var(--ink)" strokeWidth={1.5} strokeDasharray="6 3" vectorEffect="non-scaling-stroke" pointerEvents="none" />
      )}
      {bare && preview.length >= 2 && (
        <path data-preview-guide d={line(preview)} fill="none" stroke="var(--guide)" strokeWidth={1.25} strokeDasharray="6 4" vectorEffect="non-scaling-stroke" pointerEvents="none" />
      )}
      {!closed && !bare && preview.length >= 2 && (
        <g pointerEvents="none">
          {/* one opacity for the whole paving: two pieces of it overlapping at a node do not read darker */}
          <g opacity={0.7}>
            {(paving ? paving(preview, width) : [preview]).map((c, i) => (
              <path key={i} data-preview-paving d={line(c)} fill="none" stroke="var(--road)" strokeWidth={width} strokeLinejoin="round" />
            ))}
          </g>
          <path d={line(preview)} fill="none" stroke="var(--ink)" strokeWidth={1} strokeDasharray="6 3" vectorEffect="non-scaling-stroke" />
        </g>
      )}
      {side && !closed && cursor && points.length === 0 && <SideGhost at={cursor} width={width} side={side.value} />}
      {side && !closed && cursor && (
        <g data-street-side-label="">
          <Label q={cursor} text={SIDE_NAMES[side.value]} px={px} dy={-22} />
        </g>
      )}
      {points.map((q, i) => (
        <circle key={i} cx={q.x} cy={-q.y} r={3 * px} fill="var(--panel)" stroke="var(--ink)" strokeWidth={1} vectorEffect="non-scaling-stroke" pointerEvents="none" />
      ))}
      {cursor && <Crosshair q={cursor} px={px} />}
      {cursor && <SnapMark mark={mark} px={px} />}
    </g>
  )
}
