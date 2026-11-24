// The Corner tool (fillet; port of Plaza-Practiko `vistas/planta/edicion/RedondearEsquina.tsx`): click a corner of a
// mass of the active level and moving the pointer gives the radius live (to 0.1 m; Shift free); another click or
// Enter sets it. The radius can also be typed on the command line ("3"). Escape lets the corner go and, without one,
// leaves the tool. One undo step per corner. Rounding a rect's corner turns it into a free contour (Decision "Shape editing").
// Through the shape engine (Phase D.1: `actions.editShape`, op `radius`): an object that refuses it says why when its
// corner is clicked, and its corner shows no mark (a block takes it: its corners are the face's).
import { useEffect, useMemo, useState } from 'react'
import { contourToPolygon } from '../../../engine/geom/contour.ts'
import { runShapeOp } from '../../../engine/geom/shapeOp.ts'
import { actions } from '../../../state/actions/index.ts'
import { useApp } from '../../../state/store.ts'
import { useToast } from '../../layout/toast.ts'
import { pathOf } from '../camera.ts'
import { useCommand } from '../command/commandState.ts'
import { Capture, Label, useDrawingKeys, type ToolCamera } from './common.tsx'
import { bisector, nearestCorner, radiusFromPointer, refusedBy, type PickedCorner } from './cornerRadius.ts'
import { letGo as leaveTool } from '../../tools/hand.ts'
import { outlinesOf } from './massContour.ts'
import { useCourtRefs } from '../../../modules/warehouse/views/BlockCourtHandles.tsx'
import { useCourtPick } from '../../editing/shape/shapeState.ts'

/** How close (px) to a vertex a corner is picked. */
const PICK_PX = 16
/** The pointer's radius is rounded to this (m); Shift: free. */
const RADIUS_STEP = 0.1

export function RoundCorner({ camera }: { camera: ToolCamera }) {
  // the corners of the active level's masses
  const all = useApp((s) => s.project.masses)
  const level = useApp((s) => s.level)
  const masses = useMemo(() => all.filter((m) => m.levelId === level), [all, level])
  const project = useApp((s) => s.project)
  // the masses of the level and the truck courts of the placed block picked (Phase D.3 task 7): one thing to pick a corner of
  const courts = useCourtRefs()
  const outlines = useMemo(() => outlinesOf(project, masses, courts), [project, masses, courts])
  const apply = useApp((s) => s.apply)
  const select = useApp((s) => s.select)
  const [picked, setPicked] = useState<PickedCorner | null>(null)
  const [near, setNear] = useState<PickedCorner | null>(null)
  const [radius, setRadius] = useState(0)
  const px = 1 / camera.scale

  // the picked mass may disappear (undo): then there is no corner
  const outline = picked ? outlines.find((o) => o.id === picked.massId) : undefined
  const contour = outline?.contour ?? null
  const corner = picked && contour && picked.i < contour.vertices.length ? picked : null

  const letGo = () => {
    setPicked(null)
    setRadius(0)
  }

  /** Why the corner's object refuses a radius (what a kind says it refuses: a hole), or null. */
  const refusal = (c: PickedCorner | null): string | null => {
    const o = c ? outlines.find((x) => x.id === c.massId) : undefined
    return o ? refusedBy(actions.shapeOf(useApp.getState().project, o.ref), 'radius') : null
  }

  /** The corner set is the pick: a mass's through the selection, a court's through the court's own pick. */
  const pickIt = (c: PickedCorner) => {
    const o = outlines.find((x) => x.id === c.massId)
    if (o?.ref.kind === 'mass') select(c.massId, c.i)
    else if (o) useCourtPick.getState().setPick({ ref: o.ref, vertex: c.i })
  }

  /** Sets the radius on the picked corner. False if the geometry refuses it (with a notice). */
  const fix = (r: number): boolean => {
    if (!corner || !contour) return false
    if (Math.abs(r - contour.vertices[corner.i].r) < 1e-9) {
      letGo()
      return true
    }
    const ref = outline?.ref
    if (!ref) return false
    const test = actions.editShape(useApp.getState().project, ref, { op: 'radius', vertex: corner.i, r })
    if (test.reason) {
      useToast.getState().show('error', test.reason.charAt(0).toUpperCase() + test.reason.slice(1))
      return false
    }
    apply((p) => actions.editShape(p, ref, { op: 'radius', vertex: corner.i, r }).project)
    pickIt(corner)
    letGo()
    return true
  }

  const escape = () => (corner ? letGo() : leaveTool())
  useDrawingKeys({ enter: () => (corner ? fix(radius) || true : false), escape, back: letGo })

  const vertex = corner && contour ? contour.vertices[corner.i] : null
  const b = corner && contour ? bisector(contour, corner.i) : null
  // the command line, registered again after every render (it reads this render's corner and radius)
  useEffect(() => {
    useCommand.getState().register({
      tool: 'Corner',
      prompt: corner ? 'Radius' : 'Pick a corner',
      help: corner ? 'move · click sets · type the radius: 3' : 'click a corner of a mass',
      context: () => ({
        first: !corner,
        base: vertex ? { x: vertex.x, y: vertex.y } : null,
        // a bare number goes along the bisector: its distance from the vertex is the radius
        cursor: vertex && b ? { x: vertex.x + b.u.x, y: vertex.y + b.u.y } : useCommand.getState().cursor,
        rectangle: false,
      }),
      apply: (c) => {
        if (c.kind === 'empty') return corner ? fix(radius) : true
        if (c.kind !== 'point' || !corner || !vertex) return false
        return fix(Math.hypot(c.point.x - vertex.x, c.point.y - vertex.y))
      },
      cancel: escape,
      back: letGo,
    })
  })
  useEffect(() => () => useCommand.getState().register(null), [])

  const previewContour = corner && contour ? runShapeOp(contour, { op: 'radius', vertex: corner.i, r: radius }) : null
  const marked = corner ?? near
  const markedOutline = marked ? outlines.find((o) => o.id === marked.massId) : undefined
  const markedPoint = marked && markedOutline ? markedOutline.contour.vertices[marked.i] : null

  return (
    <g data-tool="corner">
      <Capture
        camera={camera}
        onPointerDown={(e) => {
          if (e.button === 0) e.stopPropagation()
        }}
        onPointerMove={(e) => {
          const q = camera.toWorld(e)
          useCommand.getState().setCursor(q)
          if (corner && contour) setRadius(radiusFromPointer(contour, corner.i, q, e.shiftKey ? 0 : RADIUS_STEP))
          else {
            const c = nearestCorner(outlines, q, PICK_PX * px, undefined, (o) => o.contour)
            setNear(refusal(c) ? null : c)
          }
        }}
        onPointerUp={(e) => {
          if (e.button !== 0) return
          const q = camera.toWorld(e)
          if (corner && contour) {
            fix(radiusFromPointer(contour, corner.i, q, e.shiftKey ? 0 : RADIUS_STEP))
            return
          }
          const c = nearestCorner(outlines, q, PICK_PX * px, undefined, (o) => o.contour)
          if (!c) return
          const why = refusal(c)
          if (why) {
            useToast.getState().show('error', why)
            return
          }
          const o = outlines.find((x) => x.id === c.massId)
          setPicked(c)
          setRadius(o ? o.contour.vertices[c.i].r : 0)
          pickIt(c)
        }}
        onPointerLeave={() => setNear(null)}
      />
      <g pointerEvents="none" aria-hidden="true">
        {previewContour?.ok && (
          <path data-corner-preview="" d={pathOf([contourToPolygon(previewContour.contour)])} fill="none" stroke="var(--ink)" strokeWidth={2} strokeDasharray="6 4" vectorEffect="non-scaling-stroke" />
        )}
        {markedPoint && (
          <circle data-corner-mark="" cx={markedPoint.x} cy={-markedPoint.y} r={6 * px} fill={corner ? 'var(--ink)' : 'var(--panel)'} stroke="var(--ink)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
        )}
        {vertex && b && <Label q={{ x: vertex.x + b.u.x * 36 * px, y: vertex.y + b.u.y * 36 * px }} px={px} text={`r ${radius.toFixed(2)} m`} />}
      </g>
    </g>
  )
}
