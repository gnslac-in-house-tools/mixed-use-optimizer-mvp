// The warehouse type alone in plan (Decision "Warehouse layout"), in its own frame, without the site: its column lines
// with their bubbles (A, B, C… along the length, 1, 2, 3… along the width), the module lines between them, its one
// mass (Decision "Block shape") and its holes, its zones in their programs' colours, and the bays dimensioned along the
// front and the left (the end bays' lengths marked), with the whole length and width outside them; with zones, each
// named with its program and its level; the elements (a dock a bar out of its wall, a level door its opening, a pattern
// a dot); the columns and the walls by the app's detail (views/detail.ts): points and the outline's line in Schematic,
// the columns' squares and the walls' bands otherwise (Decision "Warehouse type"). Its camera is the main plan's
// (views/plan/usePlanCamera.ts, BE.9): the wheel zooms round the pointer, the middle button, Space + drag or a finger
// pans, a double click on empty ground frames it; a left drag on empty ground (Select) draws a window (left → right:
// what is fully inside) or a crossing (right → left: what it touches), Shift adding to what is picked (Decision
// "Multi-selection"; blockSelect.ts), and Shift + click adds or removes one.
// Edited by hand (Decisions "Warehouse by hand", "Block shape"; the shape handles, views/editing/shape/ through blockShapeHost.ts,
// in ghost mode: the result dashed, applied on release): each edge's wall dragged free, onto a module line when it is near one (Shift: free; the
// box's stretches the box), a corner dot dragged and Alt + double click on a wall adding one, a double click on a wall picks the bay pressed to pull out or push in, a double click
// on a corner removes it; a click picks a zone, an edge (its row lit in Shape), a hole, a truck court or an element
// (its row lit in Elements, its module lit; Delete removes everything picked that goes, one undo step, Escape lets go);
// the Split tool splits the zone under it on the module line nearest, the Hole tool drags a free rectangle, its corners onto the module nodes when they are near;
// a right-click opens their menu (the one builder, from their kinds: partsMenu.ts), a program dragged onto a zone is its; Dock, Door and Pattern (Decision
// "Elements by module", BE.4): a press inside the block on a wall's module puts one there or takes it away, a press
// outside in front of a bay fills it or (full) empties it, a drag along the wall the modules it passes, as its press
// decided, one undo step; Court (Decision "Truck court"): a press on a wall without docks puts its court or takes it
// away, a docked wall always has its own; the courts drawn in front of their walls, a pill on each dragged for its depth
// (Courts.tsx). Elements picked, one of them pressed and dragged: all of them slide along their walls by whole
// modules, all or none. The figures are also typed in the steps (StepsPanel.tsx). After a hand edit the camera stays
// where it was (no framing again), moved with what stays still when the box's low walls moved the type's origin; until
// it is zoomed, panned or held so, it frames the block again as the block changes. A column line's bubble (Decision
// "Grid by line", GR.3) picks it: its chip (GridLineChip.tsx) types its distances or deletes it, Delete too; dragged by
// its bubble it moves module by module, between the lines either side; several picked move together, none past a
// neighbour not picked; the box's first and last stay.
// The bottom bar's Dimension and Ruler (BE.10; BlockDraftingBar.tsx) are the main plan's tools on this camera, snapping
// to the block's columns, wall corners, module-line nodes and door points (blockSnap.ts, through SnapSourceContext) and
// reading in the block editor's unit; a dimension drawn is the type's (BlockDimensions.tsx).
import { useEffect, useMemo, useRef, useState, type DragEvent, type MouseEvent, type PointerEvent as ReactPointerEvent } from 'react'
import type { Point, WarehouseType } from '../../../model/schema.ts'
import type { Ref } from '../../../kinds/types.ts'
import { area, centroid, pointInPolygon } from '../../../engine/geom/polygon.ts'
import { lineModules, moduleAt, movedLines, nearestLine, type Run } from '../engine/bays.ts'
import { ANGLED_COURT, outwardOf } from '../engine/shape.ts'
import { splitZone, zonesOf } from '../engine/zones.ts'
import { columnOutline, wallOutline, type Generated } from '../engine/generate.ts'
import { lineName } from '../../../engine/grid/index.ts'
import { openMenu } from '../../../views/editing/menu/open.tsx'
import { droppedProgram, isProgramDrag } from '../../../views/panels/programCommands.ts'
import { SelectionWindow } from '../../../views/plan/SelectionWindow.tsx'
import { usePlanCamera } from '../../../views/plan/usePlanCamera.ts'
import { SnapSourceContext, type SnapSource } from '../../../views/plan/snap/SnapSourceContext.tsx'
import type { ToolCamera } from '../../../views/plan/tools/common.tsx'
import { DrawDimension } from '../../../views/plan/tools/DrawDimension.tsx'
import { Ruler } from '../../../views/plan/tools/Ruler.tsx'
import { useSnapSettings } from '../../../views/plan/snap/settings.ts'
import { SnapMark } from '../../../views/plan/snap/SnapMark.tsx'
import { tolerances } from '../../../views/plan/snap/move.ts'
import { useRuler, useTool } from '../../../views/plan/tools/toolState.ts'
import type { Box } from '../../../views/plan/windowSelect.ts'
import { useApp } from '../../../state/store.ts'
import { useDetail } from '../../../views/detail.ts'
import { standardsOf } from '../../../engine/circulation/standards.ts'
import { useToast } from '../../../views/layout/toast.ts'
import { splitCourts } from '../../../views/editing/shape/splitCourts.ts'
import { EdgeHandles, type EdgeControls } from '../../../views/editing/edge/EdgeHandles.tsx'
import { blockEdgeHost } from './blockEdgeHost.ts'
import { bubblesOf, courtPolygons, pickedInBox } from './blockSelect.ts'
import { BlockDimensions } from './BlockDimensions.tsx'
import { blockTargets, moduleNode } from './blockSnap.ts'
import { DimensionField } from '../../../views/editing/dimension/DimensionField.tsx'
import { ShapeHandles } from '../../../views/editing/shape/ShapeHandles.tsx'
import { useDrag } from '../../../views/plan/useDrag.ts'
import { addBlockDimension, addFreeHole, byTools, giveProgram, mayReshape, moveLine, moveLines, removePicked, setEdgeCourt, setZones } from './commands.ts'
import { GridLineChip } from './GridLineChip.tsx'
import { angledAt, BAY_REACH_PX, courtsOf, EDGE_REACH_PX, edgeAt, edgeName, elementAt, faceLine, holeAt, moduleBand, spanOf, splitAt } from './handleMath.ts'
import { courtRefId } from './BlockCourtHandles.tsx'
import { Courts } from './Courts.tsx'
import { useBlockShapeHost } from './blockShapeHost.ts'
import { partRef } from './partsMenu.ts'
import { useModule } from '../../../views/modules.ts'
import { fromShown, lengthText, useLengths } from './units.ts'
import { joined, samePick, useWarehouse, type Picked } from './warehouseState.ts'
import { beginDrag } from '../../../views/controls/beginDrag.ts'

/** px: a press that moves less than this is a click, not a drag. */
const CLICK_PX = 4

/** px: a bubble's radius, a name's and a dimension's text size, the gap between dimension rows. */
const BUBBLE = 9
const TEXT = 11
const ROW = 22
/** px kept clear round the block when it is framed: its bubbles and its rows of dimensions. */
const FRAME_PAD = BUBBLE * 2 + ROW * 3 + 24

/** What Delete takes away; zones and edges stay. */
const GOES = new Set<Picked['kind']>(['element', 'court', 'hole', 'line'])

/** A chain of dimensions along one way: each bay's length, the end bays marked, at `at` across. */
function Chain({ run, axis, at, px }: { run: Run; axis: 'x' | 'y'; at: number; px: number }) {
  const { num } = useLengths()
  const P = (u: number, v: number): Point => (axis === 'x' ? { x: u, y: v } : { x: v, y: u })
  const tick = 4 * px
  return (
    <g data-chain={axis} pointerEvents="none">
      {run.bays.map((b, i) => {
        const a = P(b.lo, at)
        const c = P(b.hi, at)
        const mid = P((b.lo + b.hi) / 2, at)
        return (
          <g key={i} data-bay={b.end ? 'end' : 'bay'}>
            <line x1={a.x} y1={-a.y} x2={c.x} y2={-c.y} stroke="var(--ink-tertiary)" vectorEffect="non-scaling-stroke" />
            <text
              x={mid.x}
              y={-mid.y}
              dy={axis === 'x' ? -4 * px : 0}
              dx={axis === 'y' ? -4 * px : 0}
              fontSize={TEXT * px}
              textAnchor={axis === 'x' ? 'middle' : 'end'}
              dominantBaseline={axis === 'x' ? 'auto' : 'middle'}
              className={b.end ? 'fill-status-over font-semibold' : 'fill-ink-secondary'}
            >
              {num(b.hi - b.lo)}
            </text>
          </g>
        )
      })}
      {run.lines.map((l, i) => {
        const p = P(l, at)
        const [dx, dy] = axis === 'x' ? [0, tick] : [tick, 0]
        return <line key={i} x1={p.x - dx} y1={-p.y - dy} x2={p.x + dx} y2={-p.y + dy} stroke="var(--ink-tertiary)" vectorEffect="non-scaling-stroke" />
      })}
    </g>
  )
}

/** A rectangle between two corners as a path, y drawn down. */
const cornersRect = (a: Point, b: Point) => `M${a.x} ${-a.y}H${b.x}V${-b.y}H${a.x}Z`

export function WarehousePlan({ t, g }: { t: WarehouseType; g: Generated }) {
  const { text: lenText, unit } = useLengths()
  const programs = useApp((s) => s.project.programs)
  const schematic = useDetail((s) => s.detail === 'schematic')
  // the main plan's camera, the block framed with room for its bubbles and dimensions
  const camera = usePlanCamera(() => ({ minX: g.box.x0, minY: g.box.y0, maxX: g.box.x1, maxY: g.box.y1, pad: FRAME_PAD }))
  const { fitContent, untouched } = camera
  // another block, or this one changed while the camera is as it was framed: framed again
  const framedType = useRef(t.id)
  const frame = `${t.id}|${g.box.x0}|${g.box.y0}|${g.box.x1}|${g.box.y1}`
  useEffect(() => {
    const other = framedType.current !== t.id
    framedType.current = t.id
    if (other || untouched) fitContent()
    // only when the block or its box changes, not when the camera does
  }, [frame]) // eslint-disable-line react-hooks/exhaustive-deps
  /** m per screen px. */
  const px = 1 / camera.scale
  const toWorld = camera.toWorld
  const { x: X, y: Y } = g.runs
  const { x0: outerX, y0: outerY, x1: rightX, y1: topY } = g.box
  const pad = (BUBBLE * 2 + 6) * px
  const r = BUBBLE * px
  const zoned = g.zones.length > 1
  const tool = useWarehouse((s) => s.tool)
  const { offered: docksOffered } = useModule('docks')
  const picked = useWarehouse((s) => s.picked)
  const setPicked = useWarehouse((s) => s.setPicked)
  const togglePicked = useWarehouse((s) => s.togglePicked)
  const [hover, setHover] = useState<Point | null>(null)
  /** The Split tool's line begun outside every zone: its first point (Phase D.3 task 8: the second splits the truck courts it crosses). */
  const [splitFrom, setSplitFrom] = useState<Point | null>(null)
  const splitFromRef = useRef<Point | null>(null)
  splitFromRef.current = splitFrom
  useEffect(() => setSplitFrom(null), [tool, t.id])
  /** Delete's first look: a corner picked on the shape handles (set below, where the host is made). */
  const removeCornerRef = useRef<() => boolean>(() => false)
  /** Shift+F's: the corner picked on the shape handles chamfered. */
  const chamferCornerRef = useRef<() => boolean>(() => false)
  /** The On edge views' presses (Phase D.3 task 10): Dock, Door and Pattern pressed and dragged, the picked elements slid. */
  const edgeRef = useRef<EdgeControls | null>(null)
  /** The Hole tool's drag: from one corner to the pointer. */
  const [hole, setHole] = useState<{ from: Point; at: Point } | null>(null)
  /** The selection window being drawn (Select, a left drag on empty ground). */
  const [box, setBox] = useState<Box | null>(null)
  /** A column line dragged by its bubble (GR.3): pressed at (x, y) on the screen; alone, `at` the module line it would
   *  go to (m); with others picked of its axis (`lines`), `by` the modules they would all move (BE.9). */
  const [lineDrag, setLineDrag] = useState<{ axis: 'x' | 'y'; line: number; x: number; y: number; at: number | null; lines: number[]; by: number; moved: boolean } | null>(null)
  const zones = useMemo(() => zonesOf(t, g.runs), [t, g])
  // the bottom bar's measures (the main plan's Dimension and Ruler) on this camera, snapping to the block
  const dimensioning = useTool((s) => s.tool === 'dimension')
  const ruler = useRuler((s) => s.active)
  const measuring = dimensioning || ruler
  const svgRef = camera.svgRef
  // the module nodes attract only with Grid on (late review of BE.10)
  const gridOn = useSnapSettings((s) => s.settings.grid)
  const snapSource = useMemo<SnapSource>(
    () => ({ targets: () => blockTargets(g, gridOn), format: (m) => lengthText(m, unit), grid: (q, tol) => moduleNode(g.runs, q, tol), root: () => svgRef.current }),
    [g, unit, svgRef, gridOn],
  )
  /** A corner of the Hole tool's rectangle: where the pointer is, onto a module node within the snap's aperture (Snap on; Shift: free). */
  const snapOn = useSnapSettings((s) => s.settings.on)
  const holeCorner = (q: Point, shift: boolean): Point => {
    if (shift || !snapOn) return q
    const tol = tolerances(camera.scale).point
    const node = moduleNode(g.runs, q, tol)
    return node && Math.hypot(node.x - q.x, node.y - q.y) <= tol ? node : q
  }
  const toolCamera: ToolCamera = { scale: camera.scale, viewBox: camera.viewBox, toWorld: camera.toWorld }
  const standard = useApp((s) => standardsOf(s.project).courtDepth)
  /** Where a line dragged to `v` (m along its axis) would stand: the module line nearest, a module from either neighbour. */
  const snapLine = (axis: 'x' | 'y', line: number, v: number) => {
    const run = g.runs[axis]
    const idx = lineModules(run)
    return run.modules[Math.max(idx[line - 1] + 1, Math.min(idx[line + 1] - 1, nearestLine(run, v)))]
  }
  /** A column line's bubble pressed (Select): picked on a click, moved on a drag (with the others of its axis picked,
   *  when it is one of them); the box's first and last only picked. */
  const onBubble = (axis: 'x' | 'y', line: number) => (e: ReactPointerEvent<SVGGElement>) => {
    if (tool !== 'select' || e.button !== 0) return
    e.stopPropagation()
    beginDrag(e, camera.svgRef.current)
    const mine = picked.filter((x) => x.kind === 'line' && x.axis === axis).map((x) => (x.kind === 'line' ? x.line : -1))
    const lines = mine.length > 1 && mine.includes(line) ? mine : [line]
    setLineDrag({ axis, line, x: e.clientX, y: e.clientY, at: null, lines, by: 0, moved: false })
  }

  /** The zone under a point (its piece of the mass). */
  const zoneAt = (q: Point): Picked | null => {
    const z = g.zones.find((x) => x.pieces.some((p) => pointInPolygon(q, p)))
    return z ? { kind: 'zone', id: z.id } : null
  }
  // never more than an eighth of the box's short side: zoomed far out, the zones are still there to pick
  const near = Math.min(EDGE_REACH_PX * px, Math.min(g.box.x1 - g.box.x0, g.box.y1 - g.box.y0) / 8)
  /** What is under a point: an element's piece, else an edge's wall, else a hole, else a truck court, else the zone there. */
  const hitTarget = (q: Point): Picked | null => {
    const el = elementAt(g, q, near / 2)
    if (el) return { kind: 'element', id: el }
    const e = edgeAt(g, q, near)
    if (e) return { kind: 'edge', id: e.id }
    const hl = holeAt(g, q)
    if (hl) return { kind: 'hole', id: hl }
    const c = courtPolygons(t, g, standard).find((x) => pointInPolygon(q, x.polygon))
    if (c) return { kind: 'court', id: c.edge }
    return zoneAt(q)
  }

  // Shift+F chamfers a picked corner; Delete removes a picked corner, else everything picked that goes, one undo step (Escape, letting go of it, then of the tool, is the
  // Program window's: useShortcuts.ts); never while a measure is on (its keys are its own)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      if (el && (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return
      // Escape drops a line the Split tool has begun (the window's Escape then lets go as it always does)
      if (e.key === 'Escape' && splitFromRef.current) setSplitFrom(null)
      // Backspace steps a line back, as on the site, and is not Delete of what is picked (review S5)
      if (e.key === 'Backspace' && splitFromRef.current) {
        e.preventDefault()
        setSplitFrom(null)
        return
      }
      const chamfer = e.key.toLowerCase() === 'f' && e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey
      if (e.key !== 'Delete' && e.key !== 'Backspace' && !chamfer) return
      if (useTool.getState().tool === 'dimension' || useRuler.getState().active) return
      // Shift+F: the Chamfer tool's key, here on the corner picked on the shape handles
      if (chamfer) {
        e.preventDefault()
        chamferCornerRef.current()
        return
      }
      // a corner picked on the shape handles goes first (D.1 task 6)
      if (removeCornerRef.current()) return
      const { picked: now } = useWarehouse.getState()
      if (!now.some((x) => GOES.has(x.kind))) return
      removePicked(t.id, now)
      useWarehouse.getState().setPicked([])
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [t.id])
  /** Something picked on the plan alone (null: nothing); an element shows its step's fields, its row lit. */
  const pickOnPlan = (target: Picked | null) => {
    setPicked(target ? [target] : [])
    if (target?.kind === 'element') useWarehouse.getState().show('elements')
  }

  /** A hand edit: the camera held where it is, moved with the origin. */
  const onShift = (d: Point) => {
    const v = camera.view
    if (v) camera.centerOn({ x: v.cx + d.x, y: v.cy + d.y })
  }

  /** Select: a press on an element picked (on its wall or off it) slides the picked ones along their walls. */
  const grab = (e: ReactPointerEvent<SVGElement>, _q: Point): boolean => (tool === 'select' ? (edgeRef.current?.grab(e) ?? false) : false)

  // the type's walls, bays and corners on the one set of shape handles (ghost mode: a dashed result, applied on release)
  const drag = useDrag(toWorld)
  const { host: shapeHost, ref: shapeRef, courtHost, removeCorner, chamferCorner } = useBlockShapeHost({ t, g, drag, scale: camera.scale, toWorld, onShift, grab })
  // the block's truck courts on the same handles (Phase D.3 task 7): each court is a shape of its own, a ref `<typeId>/<edgeId>[/<courtId>]`; the walls picked show all of theirs, the rest the depth's pill
  const courts = useMemo(() => courtsOf(t, g, standard), [t, g, standard])
  removeCornerRef.current = removeCorner
  chamferCornerRef.current = chamferCorner

  const element = tool === 'dock' || tool === 'door' || tool === 'pattern' ? tool : null
  // the block's walls as the On edge views' host: an edit is the type's (its copies that keep their own told), a press that moved nothing picks the element
  const edgeHost = useMemo(
    () => ({ ...blockEdgeHost(t, g, (f) => byTools(t.id, f), (id) => pickOnPlan({ kind: 'element', id })), lengths: { unit, text: (m: number) => lenText(m), fromShown: (v: number) => fromShown(v, unit) } }),
    // pickOnPlan only reads the store
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    [t, g, unit],
  )
  const reach = BAY_REACH_PX * px
  /** Court: a press on a wall without docks puts its court or takes it away; on a docked wall, its own depth cleared,
   *  else nothing (it always has its court). */
  const pressCourt = (q: Point) => {
    const e = edgeAt(g, q, reach)
    // a wall that is not along the grid has no court: it says why
    if (!e || e.axis === null) {
      if (angledAt(g, q, reach)) useToast.getState().show('info', `${ANGLED_COURT}.`)
      return
    }
    const entry = t.courts?.find((c) => c.edge === e.id)
    const docked = g.doors.some((d) => d.kind === 'dock' && d.edge === e.id)
    if (entry && (entry.depth !== undefined || !docked)) setEdgeCourt(t.id, e.id, null)
    else if (!docked) setEdgeCourt(t.id, e.id, {})
    else useToast.getState().show('info', `${edgeName(g.outline, e.id)} has docks: a docked wall always has its truck court. Drag its pill for a depth of its own.`)
  }
  // the background (the main plan's): a click picks (Select), splits (Split) or puts a court (Court); a drag pans, or
  // with Select draws a window
  const background = camera.backgroundHandlers(
    (e) => {
      const q = toWorld(e)
      if (tool === 'split') {
        // a line already begun: its second point splits the truck courts it crosses (one undo step); else a press on a zone splits the zone, as before, and one outside every zone begins a line
        if (splitFrom) {
          if (Math.hypot(q.x - splitFrom.x, q.y - splitFrom.y) < 1e-3) return
          const refs = courts.flatMap((c) => c.parts.map((part): Ref => ({ kind: 'court', id: courtRefId(t.id, c.edge.id, c.parts.length > 1 ? part.id : undefined) })))
          const r = splitCourts(useApp.getState().project, refs, splitFrom, q)
          if (r.count === 0) useToast.getState().show('error', r.reason ?? '')
          else {
            byTools(t.id, (p) => splitCourts(p, refs, splitFrom, q).project, 'courts')
            if (r.notes.length) useToast.getState().show('info', r.notes.join('; '))
          }
          setSplitFrom(null)
          return
        }
        const s = splitAt(zones, g.runs, q)
        if (s) setZones(t.id, splitZone(zones, s.zone, s.axis, s.k))
        // a line is for the truck courts, which the docks module owns: without it only a zone is split (review S7)
        else if (docksOffered) setSplitFrom(q)
      } else if (tool === 'court') pressCourt(q)
      else if (tool === 'select') {
        const target = hitTarget(q)
        // Shift + click adds or takes away one; on empty ground it keeps what is picked, as in AutoCAD
        if (e.shiftKey) {
          if (target) togglePicked(target)
        } else pickOnPlan(target)
      }
    },
    tool === 'select'
      ? {
          move: setBox,
          end(b, e) {
            setBox(null)
            const found = pickedInBox(g, b, bubblesOf(g, pad), courtPolygons(t, g, standard))
            setPicked(e.shiftKey ? joined(useWarehouse.getState().picked, found) : found)
            if (found.some((x) => x.kind === 'element')) useWarehouse.getState().show('elements')
          },
          cancel: () => setBox(null),
        }
      : undefined,
  )
  const onDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (e.button !== 0 && e.button !== 1) return
    // Dock, Door, Pattern: a press on a wall's module puts one or takes it away, outside in front of a bay fills it or
    // (full) empties it; dragged, along the wall (Decision "Elements by module")
    // (the On edge views take it: a module or bay pressed, a wall that takes none says why)
    if (element && e.button === 0 && edgeRef.current?.press(e)) return
    // Hole: a drag from one corner to the other, on the module lines
    if (tool === 'hole' && e.button === 0) {
      if (!mayReshape(t.id, 'morphology')) return
      beginDrag(e)
      const q = toWorld(e)
      const from = holeCorner(q, e.shiftKey)
      setHole({ from, at: from })
      return
    }
    if (grab(e, toWorld(e))) return
    background.onPointerDown(e)
  }
  const onMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    const q = toWorld(e)
    if (lineDrag) {
      const { axis, line } = lineDrag
      if (!lineDrag.moved && Math.hypot(e.clientX - lineDrag.x, e.clientY - lineDrag.y) < CLICK_PX) return
      const run = g.runs[axis]
      const v = axis === 'x' ? q.x : q.y
      const inner = line > 0 && line < run.lines.length - 1
      if (lineDrag.lines.length > 1) setLineDrag({ ...lineDrag, moved: true, by: nearestLine(run, v) - lineModules(run)[line] })
      else setLineDrag({ ...lineDrag, moved: true, at: inner ? snapLine(axis, line, v) : null })
      return
    }
    if (tool !== 'select') setHover(q)
    if (hole) {
      setHole({ ...hole, at: holeCorner(q, e.shiftKey) })
      return
    }
    background.onPointerMove(e)
  }
  const onUp = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (lineDrag) {
      const { axis, line, at, lines, by, moved } = lineDrag
      setLineDrag(null)
      const it: Picked = { kind: 'line', id: `${axis}${line}`, axis, line }
      // several dragged: they move, still picked
      if (lines.length > 1 && moved) {
        if (by !== 0) moveLines(t.id, axis, lines, by)
        return
      }
      if (at !== null) moveLine(t.id, axis, line, at)
      if (e.shiftKey && !moved) togglePicked(it)
      else pickOnPlan(it)
      return
    }
    if (hole) {
      setHole(null)
      addFreeHole(t.id, hole.from, holeCorner(toWorld(e), e.shiftKey))
      return
    }
    background.onPointerUp(e)
  }
  const onContextMenu = (e: MouseEvent<SVGSVGElement>) => {
    e.preventDefault()
    const q = toWorld(e)
    const target = hitTarget(q)
    if (!target) return
    // one not picked is picked first, alone
    if (!picked.some((x) => samePick(x, target))) pickOnPlan(target)
    // the one menu, from the kind of the part (partsMenu.ts): its rows are the hand edits the plan always had
    const ref = partRef(target)
    if (ref) openMenu(e, [ref], 'plan', q)
  }
  // a program dragged from the block editor's Programs list onto a zone
  const onDragOver = (e: DragEvent<SVGSVGElement>) => {
    if (isProgramDrag(e) && zoneAt(toWorld(e))) e.preventDefault()
  }
  const onDrop = (e: DragEvent<SVGSVGElement>) => {
    const id = droppedProgram(e)
    const target = zoneAt(toWorld(e))
    if (!id || !target) return
    e.preventDefault()
    giveProgram(t.id, target.id, id)
    setPicked([target])
  }

  /** The column line picked, or dragged (with the others picked of its axis). */
  const isLine = (axis: 'x' | 'y', i: number) => picked.some((x) => x.kind === 'line' && x.axis === axis && x.line === i) || (lineDrag?.axis === axis && lineDrag.lines.includes(i))
  // the grid clipped by the outline (D.2): the module lines as the segments left inside the face less its holes, the bays it cut as partial bays
  const partial = g.cells.filter((c) => !c.whole)
  const ring = (p: Point[]) => `M${p.map((q) => `${q.x} ${-q.y}`).join('L')}Z`
  const oneLine = picked.length === 1 && picked[0].kind === 'line' ? picked[0] : null

  return (
    <div className="relative h-full w-full">
      <svg
        ref={camera.svgRef}
        role="img"
        aria-label="The warehouse type in plan"
        data-warehouse-plan
        data-tool={tool}
        className={`absolute inset-0 h-full w-full touch-none select-none ${tool === 'select' ? '' : 'cursor-crosshair'}`}
        viewBox={camera.viewBox}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerLeave={() => setHover(null)}
        // a double click on empty ground frames the block (the handles' and bubbles' own are theirs)
        onDoubleClick={(e) => {
          if (e.target instanceof Element && e.target.closest('[data-handle],[data-grid-line]')) return
          fitContent()
        }}
        onContextMenu={onContextMenu}
        onDragOver={onDragOver}
        onDrop={onDrop}
      >
        {camera.view && (
          <SnapSourceContext.Provider value={snapSource}>
            {/* its zones, in their programs' colours; the one mass's outline and its holes over them */}
            {g.zones.map((z) => {
              const color = programs.find((x) => x.id === z.program)?.color
              return (
                <path
                  key={z.id}
                  data-zone={z.id}
                  d={z.pieces.map(ring).join('')}
                  fill={color ?? 'var(--fill)'}
                  fillOpacity={0.22}
                  stroke={zoned ? 'var(--ink-tertiary)' : 'none'}
                  strokeWidth={1}
                  vectorEffect="non-scaling-stroke"
                />
              )
            })}
            {g.parts.map((p) => (
              <path key={p.part} data-part={p.part} data-holes={p.holes.length} d={[p.polygon, ...p.holes].map(ring).join('')} fill="none" stroke="var(--ink)" strokeWidth={1.25} vectorEffect="non-scaling-stroke" />
            ))}
            {/* the bays the outline cut, partial bays: a faint floor under the lines, each drawn as it is left */}
            {partial.map((c) => (
              <path key={`${c.x[0]}-${c.y[0]}`} data-partial-bay={`${c.x[0]}-${c.y[0]}`} d={c.regions.map((r) => r.map(ring).join('')).join('')} fill="var(--fill)" fillOpacity={0.5} fillRule="evenodd" stroke="none" pointerEvents="none" />
            ))}
            {/* the module lines, faint, inside the outline: clipped, they stop at its walls and round its holes */}
            <path
              data-modules={g.lines.modules.length}
              d={g.lines.modules.map(([a, b]) => `M${a.x} ${-a.y}L${b.x} ${-b.y}`).join('')}
              stroke="var(--grid-module)"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
            {/* the column lines, dash-dot, past the warehouse, a bubble with its name at each end */}
            <g data-column-lines={X.lines.length + Y.lines.length}>
              {X.lines.map((x, i) => (
                <g key={`x${i}`}>
                  <line x1={x} y1={-(outerY - pad + r)} x2={x} y2={-(topY + pad - r)} stroke="var(--grid-line)" strokeDasharray={isLine('x', i) ? undefined : '10 3 2 3'} strokeWidth={isLine('x', i) ? 2.5 : 1} vectorEffect="non-scaling-stroke" />
                  {[outerY - pad, topY + pad].map((y, k) => (
                    <g key={k} data-grid-line={`x${i}`} onPointerDown={onBubble('x', i)} style={{ cursor: tool === 'select' ? 'pointer' : undefined }}>
                      <title>{`Grid line ${lineName('x', i)}`}</title>
                      <circle cx={x} cy={-y} r={r} fill={isLine('x', i) ? 'var(--fill)' : 'var(--panel)'} stroke="var(--grid-line)" strokeWidth={isLine('x', i) ? 2 : 1} vectorEffect="non-scaling-stroke" />
                      <text x={x} y={-y} fontSize={TEXT * px} textAnchor="middle" dominantBaseline="central" className="fill-ink">
                        {lineName('x', i)}
                      </text>
                    </g>
                  ))}
                </g>
              ))}
              {Y.lines.map((y, i) => (
                <g key={`y${i}`}>
                  <line x1={outerX - pad + r} y1={-y} x2={rightX + pad - r} y2={-y} stroke="var(--grid-line)" strokeDasharray={isLine('y', i) ? undefined : '10 3 2 3'} strokeWidth={isLine('y', i) ? 2.5 : 1} vectorEffect="non-scaling-stroke" />
                  {[outerX - pad, rightX + pad].map((x, k) => (
                    <g key={k} data-grid-line={`y${i}`} onPointerDown={onBubble('y', i)} style={{ cursor: tool === 'select' ? 'pointer' : undefined }}>
                      <title>{`Grid line ${lineName('y', i)}`}</title>
                      <circle cx={x} cy={-y} r={r} fill={isLine('y', i) ? 'var(--fill)' : 'var(--panel)'} stroke="var(--grid-line)" strokeWidth={isLine('y', i) ? 2 : 1} vectorEffect="non-scaling-stroke" />
                      <text x={x} y={-y} fontSize={TEXT * px} textAnchor="middle" dominantBaseline="central" className="fill-ink">
                        {lineName('y', i)}
                      </text>
                    </g>
                  ))}
                </g>
              ))}
            </g>
            {/* the walls (step 4) and the columns (step 3): bands and squares, or the outline and points in Schematic */}
            {!schematic && <path data-walls={g.walls.length} d={g.walls.map((x) => ring(wallOutline(x))).join('')} fill="var(--ink-secondary)" fillOpacity={0.55} />}
            <g data-columns={g.columns.length}>
              {schematic ? (
                <path d={g.columns.map((c) => `M${c.x} ${-c.y}h0.001`).join('')} stroke="var(--ink)" strokeWidth={4} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
              ) : (
                <path d={g.columns.map((c) => ring(columnOutline(c, g.columnSize))).join('')} fill="var(--ink)" />
              )}
            </g>
            {/* the truck courts in front of their walls, a pill on each for its depth (Select, Court) */}
            <Courts t={t} g={g} standard={standard} />
            {/* the elements (step 6): a dock a bar out of its wall, a level door its opening, a pattern's mark a dot */}
            <g data-doors={g.doors.length}>
              {g.doors.map((d, i) => {
                const n = outwardOf(d.side)
                const u = { x: Math.abs(n.y), y: Math.abs(n.x) }
                const half = d.width / 2
                if (d.kind === 'pattern')
                  return <circle key={i} data-kind="pattern" cx={d.at.x - n.x * 1} cy={-(d.at.y - n.y * 1)} r={Math.max(0.4, 2 * px)} fill="var(--grid-line)" />
                const deep = d.kind === 'dock' ? 1.5 : 0.6
                const q = [
                  { x: d.at.x - u.x * half, y: d.at.y - u.y * half },
                  { x: d.at.x + u.x * half, y: d.at.y + u.y * half },
                  { x: d.at.x + u.x * half + n.x * deep, y: d.at.y + u.y * half + n.y * deep },
                  { x: d.at.x - u.x * half + n.x * deep, y: d.at.y - u.y * half + n.y * deep },
                ]
                return (
                  <polygon
                    key={i}
                    data-kind={d.kind}
                    points={q.map((p) => `${p.x},${-p.y}`).join(' ')}
                    fill={d.kind === 'dock' ? 'var(--ink)' : 'var(--panel)'}
                    stroke="var(--ink)"
                    strokeWidth={1}
                    vectorEffect="non-scaling-stroke"
                  />
                )
              })}
            </g>
            {/* with zones, each its program and its level, on its largest piece */}
            <g data-part-labels>
              {g.zones
                .filter((z) => z.level !== 0 || zoned)
                .flatMap((z) => {
                  const piece = z.pieces.reduce<Point[] | null>((best, p) => (!best || area(p) > area(best) ? p : best), null)
                  if (!piece) return []
                  const c = centroid(piece)
                  const program = programs.find((x) => x.id === z.program)?.name
                  const level = z.level !== 0 && `Level ${z.level > 0 ? '+' : '−'}${lenText(Math.abs(z.level))}`
                  return [
                    <text key={z.id} x={c.x} y={-c.y} fontSize={TEXT * px} textAnchor="middle" dominantBaseline="central" className="fill-ink font-semibold">
                      {[program ?? 'No program', level].filter(Boolean).join(' · ')}
                    </text>,
                  ]
                })}
            </g>
            {/* the bays dimensioned along the front and the left, the whole outside them */}
            <Chain run={X} axis="x" at={outerY - pad - r - ROW * px} px={px} />
            <Chain run={{ ...X, bays: [{ lo: 0, hi: X.length, end: false, modules: 1 }], lines: [0, X.length] }} axis="x" at={outerY - pad - r - 2 * ROW * px} px={px} />
            <Chain run={Y} axis="y" at={outerX - pad - r - ROW * px} px={px} />
            <Chain run={{ ...Y, bays: [{ lo: 0, hi: Y.length, end: false, modules: 1 }], lines: [0, Y.length] }} axis="y" at={outerX - pad - r - 2.6 * ROW * px} px={px} />
            {/* what is picked, outlined, each: a zone's pieces, an edge's wall, a hole, a court, an element's module */}
            {picked.map((it) => (
              <g key={`${it.kind}:${it.id}`} data-picked={`${it.kind}:${it.id}`} pointerEvents="none">
                {it.kind === 'zone' &&
                  g.zones.find((z) => z.id === it.id)?.pieces.map((p, i) => <polygon key={i} points={p.map((q) => `${q.x},${-q.y}`).join(' ')} fill="none" stroke="var(--ink)" strokeWidth={3} vectorEffect="non-scaling-stroke" />)}
                {(it.kind === 'edge' || it.kind === 'stretch') &&
                  (() => {
                    const e = g.edges.find((x) => x.id === it.id)
                    if (!e) return null
                    const [lo, hi] = spanOf(e)
                    const f = faceLine(e)
                    const [a, b] = e.horizontal ? [{ x: lo, y: f }, { x: hi, y: f }] : [{ x: f, y: lo }, { x: f, y: hi }]
                    return <line x1={a.x} y1={-a.y} x2={b.x} y2={-b.y} stroke="var(--grid-line)" strokeWidth={4} vectorEffect="non-scaling-stroke" />
                  })()}
                {it.kind === 'hole' &&
                  (() => {
                    const hl = g.holes.find((x) => x.id === it.id)
                    return hl ? <path d={`M${hl.vertices.map((q) => `${q.x} ${-q.y}`).join('L')}Z`} fill="none" stroke="var(--ink)" strokeWidth={3} vectorEffect="non-scaling-stroke" /> : null
                  })()}
                {it.kind === 'court' &&
                  (() => {
                    const c = courtsOf(t, g, standard).find((x) => x.edge.id === it.id)
                    if (!c) return null
                    // every court of the wall, each as it is drawn (a shaped one its contour)
                    return (
                      <>
                        {c.parts.map((part, k) => (
                          <path key={part.id ?? k} d={`M${part.polygon.map((q) => `${q.x},${-q.y}`).join('L')}Z`} fill="none" stroke="var(--ink)" strokeWidth={3} vectorEffect="non-scaling-stroke" />
                        ))}
                      </>
                    )
                  })()}
                {it.kind === 'element' &&
                  (() => {
                    const d = g.doors.find((x) => x.element === it.id)
                    const e = d && g.edges.find((x) => x.id === d.edge)
                    if (!d || !e) return null
                    const rr = moduleBand(g.runs, e, d.module)
                    return <rect data-element-module={d.module} x={rr.x} y={-(rr.y + rr.h)} width={rr.w} height={rr.h} fill="var(--grid-line)" fillOpacity={0.25} stroke="var(--grid-line)" vectorEffect="non-scaling-stroke" />
                  })()}
              </g>
            ))}
            {/* the Hole tool: the rectangle it would cut, on the module lines */}
            {hole &&
              (() => {
                return <path data-hole-preview d={cornersRect(hole.from, hole.at)} fill="var(--fill)" fillOpacity={0.4} stroke="var(--ink)" strokeWidth={2} strokeDasharray="7 4" vectorEffect="non-scaling-stroke" pointerEvents="none" />
              })()}
            {/* the Split tool: a line begun outside the zones, to the pointer */}
            {tool === 'split' && splitFrom && hover && <line data-split-line x1={splitFrom.x} y1={-splitFrom.y} x2={hover.x} y2={-hover.y} stroke="var(--ink)" strokeWidth={2} strokeDasharray="7 4" vectorEffect="non-scaling-stroke" pointerEvents="none" />}
            {/* the Split tool: the line it would split on, across the zone under the pointer */}
            {tool === 'split' &&
              !splitFrom &&
              hover &&
              (() => {
                const s = splitAt(zones, g.runs, hover)
                if (!s) return null
                const [a, b] = s.line
                return <line data-split-preview x1={a.x} y1={-a.y} x2={b.x} y2={-b.y} stroke="var(--ink)" strokeWidth={2} strokeDasharray="7 4" vectorEffect="non-scaling-stroke" pointerEvents="none" />
              })()}
            {/* Dock, Door, Pattern and the picked elements slid: the On edge views (Phase D.3 task 10), the block's walls as their host */}
            <EdgeHandles host={edgeHost} camera={{ ...toolCamera, svgRef }} tool={element} picked={tool === 'select' && !dimensioning ? picked.flatMap((x) => (x.kind === 'element' ? [x.id] : [])) : []} controls={edgeRef} />
            {/* a column line dragged by its bubble: where it would go, and the bays either side */}
            {lineDrag?.at != null &&
              (() => {
                const { axis, line, at } = lineDrag
                const ls = g.runs[axis].lines
                const [a, b] = axis === 'x' ? [{ x: at, y: outerY - pad }, { x: at, y: topY + pad }] : [{ x: outerX - pad, y: at }, { x: rightX + pad, y: at }]
                const text = `${lineName(axis, line - 1)} ${lenText(at - ls[line - 1])} · ${lenText(ls[line + 1] - at)} ${lineName(axis, line + 1)}`
                const label = axis === 'x' ? { x: at, y: topY + pad + 2 * r } : { x: rightX + pad + 2 * r, y: at }
                return (
                  <g data-line-preview={`${axis}${line}`} pointerEvents="none">
                    <line x1={a.x} y1={-a.y} x2={b.x} y2={-b.y} stroke="var(--ink)" strokeWidth={2} strokeDasharray="7 4" vectorEffect="non-scaling-stroke" />
                    <text x={label.x} y={-label.y} fontSize={TEXT * px} textAnchor={axis === 'x' ? 'middle' : 'start'} dominantBaseline="middle" fill="var(--ink)" stroke="var(--panel)" strokeWidth={3 * px} paintOrder="stroke">
                      {text}
                    </text>
                  </g>
                )
              })()}
            {/* several column lines dragged together: where each would go, when they all may */}
            {lineDrag &&
              lineDrag.lines.length > 1 &&
              lineDrag.by !== 0 &&
              (() => {
                const { axis, lines, by } = lineDrag
                const run = g.runs[axis]
                const next = movedLines(lineModules(run), lines, by)
                if (!next) return null
                return lines
                  .filter((l) => l > 0 && l < run.lines.length - 1)
                  .map((l) => {
                    const at = moduleAt(run, next[l])
                    const [a, b] = axis === 'x' ? [{ x: at, y: outerY - pad }, { x: at, y: topY + pad }] : [{ x: outerX - pad, y: at }, { x: rightX + pad, y: at }]
                    return <line key={l} data-line-preview={`${axis}${l}`} x1={a.x} y1={-a.y} x2={b.x} y2={-b.y} stroke="var(--ink)" strokeWidth={2} strokeDasharray="7 4" vectorEffect="non-scaling-stroke" pointerEvents="none" />
                  })
              })()}
            {/* the type's dimensions (under the handles: a wall's handle wins) */}
            <BlockDimensions t={t} px={px} pick={tool === 'select' && !measuring} />
            {tool === 'select' && <ShapeHandles refs={[shapeRef]} host={shapeHost} />}
            {/* the truck courts: a court clicked, all its handles; the others and the Court tool's, the pill that says the depth */}
            {(tool === 'select' || tool === 'court') &&
              courts.flatMap((c) =>
                c.parts.map((part) => {
                  const ref: Ref = { kind: 'court', id: courtRefId(t.id, c.edge.id, c.parts.length > 1 ? part.id : undefined) }
                  const whole = tool === 'select' && picked.some((x) => x.kind === 'court' && x.id === c.edge.id)
                  return <ShapeHandles key={ref.id} refs={[ref]} host={courtHost(ref)} just={!whole} />
                }),
              )}
            {/* what a handle snapped to (a module line a wall landed on, a node a corner went to) */}
            <SnapMark mark={drag.mark} px={px} />
            {/* a handle dragged here shows its number beside it, and a value typed sets it (D.1 task 4): this plan has no command line */}
            <DimensionField px={px} mode="ghost" />
            {/* window: a solid line; crossing (right to left): dashed, as on the main plan */}
            {box && <SelectionWindow box={box} />}
            {/* over everything, the measure on: it takes the presses */}
            {dimensioning ? <DrawDimension camera={toolCamera} onPlace={(a, b, offset) => addBlockDimension(t.id, a, b, offset)} /> : ruler && <Ruler camera={toolCamera} />}
          </SnapSourceContext.Provider>
        )}
      </svg>
      {oneLine?.kind === 'line' && <GridLineChip t={t} g={g} axis={oneLine.axis} line={oneLine.line} />}
    </div>
  )
}
