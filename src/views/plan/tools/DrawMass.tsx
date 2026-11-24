// The Draw tool (the Mass tool: simplified port of Plaza-Practiko `vistas/planta/edicion/DibujarMasa.tsx`): a drag makes a
// rectangle; successive clicks make a polygon, closed with a double click or Enter. Backspace (or Ctrl+Z) removes the
// last point; Escape cancels the stroke, and without one leaves the tool. Every point goes through the snap (from the
// previous point: perpendicular, ortho); Shift = free. The command line takes typed points and "LxW".
// A drawn rectangle is a `rect` footprint (five numbers, easy to optimize); a polygon is a `contour`. The stroke is the OUTER FACE of a
// block (Phase D.2, Decision "Draw makes a block"; `actions.drawBlock`): of the program picked in the Massing group's ▾ (Decision "Mass
// with its program"; the brief's first by default), its type made on the first stroke, a building of its own; the block stays selected.
// Left out from Plaza: following curves, the
// self-crossing cleanup (a crossing outline is refused with a notice). While the option stands on a structural grid
// (Phase G.2b), a dragged rectangle runs along the grid's axes, turned with it.
// `hole` (the Hole tool, H; Phase H.3, Practiko's `DibujarMasa hueco`): the same strokes cut a hole in the mass they
// fall on (holeState.ts `holeHost`: at least 1 m² inside it; a block's hole is its own, a variant), which stays selected with the new hole picked.
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Footprint, Point } from '../../../model/schema.ts'
import { polygonFootprint, rectFootprint } from '../../../engine/geom/draw.ts'
import { footprintContour, footprintPolygon } from '../../../engine/geom/footprint.ts'
import { gridOf, gridRect, gridRectCorners } from '../../../engine/grid/index.ts'
import { actions } from '../../../state/actions/index.ts'
import { useApp } from '../../../state/store.ts'
import { useToast } from '../../layout/toast.ts'
import { useCommand } from '../command/commandState.ts'
import { holeHost, useHoles } from '../holeState.ts'
import type { SnapMark as Mark } from '../snap/move.ts'
import { SnapMark } from '../snap/SnapMark.tsx'
import { Capture, Crosshair, Label, useDrawingKeys, useToolSnap, type ToolCamera } from './common.tsx'
import { letGo } from '../../tools/hand.ts'
import { newMassProgram } from './toolState.ts'
import { beginDrag } from '../../controls/beginDrag.ts'

/** Two clicks closer than this (m) are one: a double click sends two. */
const SAME_POINT = 1e-6
/** A press that moves this far (px) before the first point is a rectangle, not a click. */
const DRAG_PX = 4

interface Press {
  id: number
  x: number
  y: number
  a: Point
  rect: boolean
}

export function DrawMass({ camera, hole = false }: { camera: ToolCamera; hole?: boolean }) {
  const apply = useApp((s) => s.apply)
  const select = useApp((s) => s.select)
  const snap = useToolSnap(camera.scale)
  const [points, setPoints] = useState<Point[]>([])
  const [rect, setRect] = useState<{ a: Point; b: Point } | null>(null)
  const [cursor, setCursor] = useState<Point | null>(null)
  const [mark, setMark] = useState<Mark | null>(null)
  const press = useRef<Press | null>(null)
  const px = 1 / camera.scale
  const grid = useApp((s) => gridOf(s.project, s.option))
  // a rectangle from two corners: on the plan's axes, or the grid's
  const boxOf = (a: Point, b: Point) => (grid ? gridRect(grid, a, b) : rectFootprint(a, b))
  const cornersOf = (a: Point, b: Point) => (grid ? gridRectCorners(grid, a, b) : [a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }])

  const at = (e: { clientX: number; clientY: number; shiftKey: boolean }, base: Point | null) => {
    const r = snap(camera.toWorld(e), e, base)
    setMark(r.mark)
    useCommand.getState().setCursor(r.point)
    return r.point
  }

  const create = useCallback(
    (f: Footprint | null): boolean => {
      if (!f) return false
      if (hole) {
        const host = holeHost(footprintPolygon(f))
        if (!host) {
          useToast.getState().show('info', 'A hole goes inside a block: draw it over one.')
          return true
        }
        let k: number | null = null
        apply((p) => {
          const r = actions.addHole(p, host, footprintContour(f))
          k = r?.k ?? null
          return r?.project ?? p
        })
        if (k === null) {
          // what the block refuses is said: the cut crosses its wall, or another hole
          useToast.getState().show('info', 'A hole must stay inside its block, apart from the other holes')
          setPoints([])
          setRect(null)
          letGo()
          return true
        }
        select(host)
        useHoles.getState().setPick({ massId: host, k, vertex: null })
        setPoints([])
        setRect(null)
        letGo()
        return true
      }
      let id: string | null = null
      let said = ''
      apply((p) => {
        const r = actions.drawBlock(p, { programId: newMassProgram(p), footprint: f, levelId: useApp.getState().level, optionId: useApp.getState().option })
        if (!r) return p
        id = r.id
        const type = r.project.warehouseTypes?.find((t) => t.id === r.type)
        const building = r.project.buildings.find((b) => b.id === r.building)
        said = r.fresh ? `${building?.name}: the first block of ${type?.name}, the type itself. Its walls and grid are in the block editor.` : `${building?.name}: a block of ${type?.name}, a variant drawn at its outline. Back to type in Properties.`
        return r.project
      })
      if (id === null) {
        useToast.getState().show('info', 'That outline is too small to hold the block’s walls.')
        setPoints([])
        setRect(null)
        return true
      }
      // the block is picked, and the plan goes to its building's level (a block is a building of its own)
      select(id)
      useToast.getState().show('info', said)
      setPoints([])
      setRect(null)
      letGo()
      return true
    },
    [apply, select, hole],
  )

  const close = useCallback((): boolean => {
    const f = polygonFootprint(points)
    if (f === 'crossing') {
      useToast.getState().show('error', 'The outline crosses itself: remove the last points with Backspace.')
      return true
    }
    return create(f)
  }, [points, create])

  const addPoint = useCallback((q: Point) => {
    setPoints((ps) => {
      const u = ps[ps.length - 1]
      return u && Math.hypot(u.x - q.x, u.y - q.y) < SAME_POINT ? ps : [...ps, q]
    })
    useCommand.getState().fixAngle(null)
  }, [])
  const back = useCallback(() => setPoints((ps) => ps.slice(0, -1)), [])
  const escape = useCallback(() => {
    press.current = null
    if (points.length > 0 || rect) {
      setPoints([])
      setRect(null)
    } else letGo()
  }, [points.length, rect])
  const undo = useCallback(() => {
    if (points.length === 0) return false
    back()
    return true
  }, [points.length, back])

  useDrawingKeys({ enter: () => points.length >= 3 && close(), escape, back, undo })

  // the command line: what it expects and what to do with what is typed
  useEffect(() => {
    const n = points.length
    useCommand.getState().register({
      tool: hole ? 'Hole' : 'Block',
      prompt: n === 0 ? 'First point' : 'Next point',
      help: n === 0 ? 'click, drag a rectangle, or type x,y' : n === 1 ? '12 · 12<30 · 5,3 · #5,3 · <30 · 30x20 rectangle' : '12 · 12<30 · 5,3 · Enter closes · Backspace removes',
      context: () => ({ first: n === 0, base: points[n - 1] ?? null, cursor: useCommand.getState().cursor, rectangle: n === 1, angle: useCommand.getState().angle }),
      apply: (c) => {
        if (c.kind === 'point') {
          addPoint(c.point)
          return true
        }
        if (c.kind === 'rectangle') {
          const f = polygonFootprint(c.polygon)
          return f !== 'crossing' && create(f)
        }
        if (c.kind === 'empty') return close()
        return false
      },
      cancel: escape,
      back,
    })
  }, [points, addPoint, back, close, create, escape, hole])
  useEffect(() => () => useCommand.getState().register(null), [])

  const last = points[points.length - 1] ?? null
  const preview = cursor && last ? [...points, cursor] : points
  const box = rect ? boxOf(rect.a, rect.b) : null

  return (
    <g data-tool={hole ? 'hole' : 'mass'}>
      <Capture
        camera={camera}
        onPointerDown={(e) => {
          if (e.button !== 0) return // the middle button pans
          e.stopPropagation()
          beginDrag(e)
          press.current = { id: e.pointerId, x: e.clientX, y: e.clientY, a: at(e, last), rect: false }
        }}
        onPointerMove={(e) => {
          const pr = press.current
          const mine = pr !== null && pr.id === e.pointerId
          // a rectangle's second corner does not start from the first: with ortho it would collapse into a line
          const q = at(e, mine && pr.rect ? null : last)
          setCursor(q)
          if (!pr || !mine) return
          if (!pr.rect && points.length === 0 && Math.hypot(e.clientX - pr.x, e.clientY - pr.y) >= DRAG_PX) pr.rect = true
          if (pr.rect) setRect({ a: pr.a, b: q })
        }}
        onPointerUp={(e) => {
          const pr = press.current
          if (!pr || pr.id !== e.pointerId) return
          press.current = null
          const q = at(e, pr.rect ? null : last)
          if (pr.rect) {
            setRect(null)
            if (!create(boxOf(pr.a, q))) useToast.getState().show('info', `A ${hole ? 'hole' : 'block'} needs at least 1 × 1 m.`)
            return
          }
          addPoint(q)
        }}
        onPointerLeave={() => {
          setCursor(null)
          setMark(null)
        }}
        onDoubleClick={() => close()}
      />
      <g pointerEvents="none" aria-hidden="true">
        {rect && (
          <>
            <polygon
              points={cornersOf(rect.a, rect.b).map((q) => `${q.x},${-q.y}`).join(' ')}
              fill="var(--ink)"
              fillOpacity={0.06}
              stroke="var(--ink)"
              strokeWidth={1.5}
              strokeDasharray="6 3"
              vectorEffect="non-scaling-stroke"
            />
            <Label
              q={{ x: (rect.a.x + rect.b.x) / 2, y: (rect.a.y + rect.b.y) / 2 }}
              px={px}
              text={box?.kind === 'rect' ? `${box.width.toFixed(2)} × ${box.depth.toFixed(2)} m` : `${Math.abs(rect.b.x - rect.a.x).toFixed(2)} × ${Math.abs(rect.b.y - rect.a.y).toFixed(2)} m · too small`}
            />
          </>
        )}
        {!rect && preview.length >= 3 && <polygon points={preview.map((q) => `${q.x},${-q.y}`).join(' ')} fill="var(--ink)" fillOpacity={0.06} stroke="none" />}
        {!rect && preview.length >= 2 && (
          <polyline data-stroke="" points={preview.map((q) => `${q.x},${-q.y}`).join(' ')} fill="none" stroke="var(--ink)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
        )}
        {!rect && preview.length >= 3 && (
          <line
            x1={preview[preview.length - 1].x}
            y1={-preview[preview.length - 1].y}
            x2={preview[0].x}
            y2={-preview[0].y}
            stroke="var(--ink)"
            strokeWidth={1}
            strokeDasharray="4 3"
            vectorEffect="non-scaling-stroke"
          />
        )}
        {last && cursor && !rect && <Label q={{ x: (last.x + cursor.x) / 2, y: (last.y + cursor.y) / 2 }} px={px} dy={-12} text={`${Math.hypot(cursor.x - last.x, cursor.y - last.y).toFixed(2)} m`} />}
        {points.map((q, i) => (
          <circle key={i} cx={q.x} cy={-q.y} r={3.5 * px} fill="var(--panel)" stroke="var(--ink)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
        ))}
        {cursor && <Crosshair q={cursor} px={px} />}
      </g>
      {cursor && <SnapMark mark={mark} px={px} />}
    </g>
  )
}
