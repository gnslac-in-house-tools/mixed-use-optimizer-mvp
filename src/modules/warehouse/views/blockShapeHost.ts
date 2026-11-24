// The block editor's host for the one set of shape handles (Phase D.1 task 6, Decisions "Shape engine", "Block shape"; the site's is
// `views/editing/shape/host.ts`): the type's plan is a viewport like the site's, in ghost mode.
//   - A drag previews nothing in the store: what it would make is drawn dashed (`useShapeGhost`, the engine's read of the edited project, moved
//     back by its frame `shift`; the handles draw it, this plan does not render on every pointer move) and applied on release through `byShape` (a locked step opened and said, one undo step) with `onShift`,
//     because the type's frame moves when its box grows at a low wall (the camera holds still).
//   - The keys the handles carry are today's: `edge-<id>`, `edge-line-<id>`, `corner-<id>`, `stretch-face|from|to`.
//   - A wall pressed and let go is a click: the element under it picked, else its edge (Shift adds or takes away); the press on an
//     element already picked is the plan's first (`grab`: the picked ones slid along their walls).
//   - The picked stretch is the plan's own pick (`useWarehouse.picked`: its edge and module lines), the handles' in metres along the wall;
//     a corner picked (a click on its dot) is kept here, one thing picked at a time, and Delete removes it.
//   - A wall moves by the metres asked (the box's range past by hand): the module lines are a snap (`withModuleLines`, Shift free), no rule.
//   - A truck court (Phase D.3, kind `court`) is another outline on the same plan: `courtHost(ref)` is this host for it. Its keys are `court-<ref id>-<part>-<at>`, it commits through the
//     courts' door (`byTools`, "copies keep their own courts") and nothing of it is a click on an element or an edge; a corner of it can be picked too, one corner of one outline at a time.
import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import type { Point, Project, WarehouseType } from '../../../model/schema.ts'
import type { Ref } from '../../../kinds/types.ts'
import { actions } from '../../../state/actions/index.ts'
import { useApp } from '../../../state/store.ts'
import { typedEnded, type Told } from '../../../views/editing/dimension/typed.ts'
import { courtKey, isCourtRef, withModuleLines, type ShapeHost, type ShapePart, type ShapeSnapper } from '../../../views/editing/shape/host.ts'
import { chamferShapeCorner, KEY_CHAMFER, removeShapeCorner, useShapeGhost, type Stretch } from '../../../views/editing/shape/shapeState.ts'
import { useToast } from '../../../views/layout/toast.ts'
import type { Wall } from '../../../views/plan/snap/walls.ts'
import type { Drag } from '../../../views/plan/useDrag.ts'
import { moduleAt, nearestLine } from '../engine/bays.ts'
import type { Generated } from '../engine/generate.ts'
import { byShape, byTools, mayReshape } from './commands.ts'
import { elementAt } from './handleMath.ts'
import { useLengths } from './units.ts'
import { useWarehouse, type Picked } from './warehouseState.ts'

/** px: how near the pointer a click on a wall finds the element under it (half the wall line's width). */
const CLICK_REACH_PX = 8
const ZERO: Point = { x: 0, y: 0 }
const mm3 = (v: number) => Math.round(v * 1000) / 1000

/** What attracts to a block's handles besides its module lines (`withModuleLines`): nothing. */
const FREE: ShapeSnapper = {
  wall: (wall: Wall, delta) => ({ d: delta.x * wall.n.x + delta.y * wall.n.y, mark: null }),
  point: (_i, q) => ({ point: q, mark: null }),
  move: (delta) => ({ delta, mark: null }),
}

/** A ghost drag's session: the last valid edit of it, and whether Escape let it go. */
interface Session {
  f: ((p: Project, told: Told) => Project | null) | null
  dead: boolean
  /** How far the camera was moved for this drag's edit so far (m): a value typed after it corrects by the difference. */
  applied: Point
}

/**
 * The block editor's host: the handles of the type `t` (its `g` generated) on the plan whose camera is `scale` px per metre, `drag` the
 * plan's `useDrag`. `onShift` moves the camera with the type's frame; `grab` is the plan's first look at a press (the picked elements slid).
 */
export function useBlockShapeHost(a: {
  t: WarehouseType
  g: Generated
  drag: Drag
  scale: number
  toWorld(ev: { clientX: number; clientY: number }): Point
  onShift(d: Point): void
  grab(e: PointerEvent<SVGElement>, at: Point): boolean
}): { host: ShapeHost; ref: Ref; courtHost(court: Ref): ShapeHost; removeCorner(): boolean; chamferCorner(): boolean } {
  const { t, g, drag, scale, toWorld, onShift, grab } = a
  const ref = useMemo<Ref>(() => ({ kind: 'block-type', id: t.id }), [t.id])
  const picked = useWarehouse((s) => s.picked)
  // the labels in the block editor's unit (metres or feet)
  const { unit, num } = useLengths()
  const [cornerPick, setCornerPick] = useState<{ i: number; ref: Ref; picked: Picked[]; t: WarehouseType } | null>(null)
  // a corner is picked until another thing is, or the type changes: one corner of one outline (the block's or a court's)
  const corner = cornerPick && cornerPick.picked === picked && cornerPick.t === t ? cornerPick : null
  const cornerOf = (r: Ref): number | null => (corner && corner.ref.kind === r.kind && corner.ref.id === r.id ? corner.i : null)
  const session = useRef<Session>({ f: null, dead: false, applied: ZERO })
  // a typed value corrects a drag after the plan drew again: the camera moved is the one now, not the one at the press
  const shift = useRef(onShift)
  shift.current = onShift
  // the ghost is the handles': it goes when this viewport does
  useEffect(() => () => useShapeGhost.setState({ ghost: null }), [])

  /** Wall `i` of the face: the run it counts along, where it starts on it (m) and which way it goes. The face's corners (`g.face`, one a wall, as the handles and the bays read them), not its curve's points. */
  const frame = (i: number) => {
    const e = g.edges[i]
    const p = g.face.vertices[i]
    const q = g.face.vertices[(i + 1) % g.face.vertices.length]
    const run = e.horizontal ? g.runs.x : g.runs.y
    return { e, run, s0: e.horizontal ? p.x : p.y, dir: (e.horizontal ? q.x - p.x : q.y - p.y) < 0 ? -1 : 1 }
  }

  /** Draws what `project` (the edit's result, whose frame moved by `s`) would make, dashed: the engine's read of it, moved back to the frame the handles stand in. */
  const showGhost = (project: Project | null, s: Point = ZERO, of: Ref = ref) => {
    const r = project && actions.shapeOf(project, of)
    if (!r) {
      useShapeGhost.setState({ ghost: null })
      return
    }
    const read = s.x === 0 && s.y === 0 ? r : { ...r, contour: { ...r.contour, vertices: r.contour.vertices.map((v) => ({ ...v, x: v.x - s.x, y: v.y - s.y })) } }
    useShapeGhost.setState({ ghost: { ref: of, read } })
  }

  /** The host of the outline `target`: the block's own, or one of its truck courts (its keys, its door, its corner pick; no element or edge under a click). */
  const build = (target: Ref): ShapeHost => {
    const court = isCourtRef(target)
    /** How a drag released, or a value typed, reaches the project: a court through the courts' door, the block's outline through the shape's. */
    const put = (f: (p: Project) => Project) => (court ? byTools(t.id, f, 'courts') : byShape(t.id, f))
    return {
      mode: 'ghost',
      lengths: { unit, fig: num, delta: num },
      drag,
      scale,
      toWorld,
      preview(f) {
        const base = useApp.getState().project
        const told: Told = {}
        const next = f(base, told)
        if (next === null) return
        session.current.f = f
        showGhost(next === base ? null : next, told.shift, target)
      },
      snap: (r) => withModuleLines(r, scale, FREE),
      pick(_ref, vertex = null) {
        if (vertex === null) {
          setCornerPick(null)
          return
        }
        // one thing picked at a time (a court's corner leaves the court picked: its handles are what shows the corner)
        if (!court) useWarehouse.getState().setPicked([])
        setCornerPick({ i: vertex, ref: target, picked: useWarehouse.getState().picked, t })
      },
      stretch: {
        get(r) {
          const st = picked.find((x): x is Extract<Picked, { kind: 'stretch' }> => x.kind === 'stretch')
          const i = st ? g.edges.findIndex((e) => e.id === st.id) : -1
          if (!st || i < 0) return null
          const f = frame(i)
          const [from, to] = [st.from, st.to].map((k) => mm3((moduleAt(f.run, k) - f.s0) * f.dir)).sort((x, y) => x - y)
          return { target: r, wall: i, from, to, label: `${st.id}:${st.from}-${st.to}` }
        },
        set(_r, s: Stretch | null) {
          if (!s) {
            // a stretch spent (its bump made): its edge stays picked
            const cur = useWarehouse.getState().picked.find((x) => x.kind === 'stretch')
            if (cur) useWarehouse.getState().setPicked([{ kind: 'edge', id: cur.id }])
            return
          }
          if (!g.edges[s.wall]) return
          const f = frame(s.wall)
          const x = nearestLine(f.run, f.s0 + f.dir * s.from)
          const y = nearestLine(f.run, f.s0 + f.dir * s.to)
          if (x !== y) useWarehouse.getState().setPicked([{ kind: 'stretch', id: f.e.id, from: Math.min(x, y), to: Math.max(x, y) }])
        },
      },
      commit: put,
      shifted(d) {
        const s = session.current
        shift.current({ x: d.x - s.applied.x, y: d.y - s.applied.y })
        s.applied = d
      },
      ghost: {
        begin() {
          session.current = { f: null, dead: false, applied: ZERO }
          showGhost(null)
        },
        cancel() {
          session.current.dead = true
          session.current.f = null
          showGhost(null)
        },
        release() {
          const s = session.current
          const f = s.f
          s.f = null
          showGhost(null)
          // a value typed has applied it already; Escape let it go
          if (s.dead || typedEnded() || !f) return
          const base = useApp.getState().project
          const probe: Told = {}
          const next = f(base, probe)
          if (next === null || next === base) return
          // the camera first, then the project: the plan is not framed again
          if (probe.shift) {
            shift.current(probe.shift)
            s.applied = probe.shift
          }
          put((p) => f(p, {}) ?? p)
        },
      },
      keyOf(_r, part: ShapePart, at) {
        if (court) return courtKey(target, part, at)
        const id = at === undefined ? undefined : g.edges[at]?.id
        if (part === 'wall') return `edge-${id}`
        if (part === 'line') return `edge-line-${id}`
        if (part === 'vertex') return `corner-${id}`
        return part === 'face' || part === 'from' || part === 'to' ? `stretch-${part}` : part
      },
      picked: () => ({ vertex: cornerOf(target), whole: false }),
      may: () => mayReshape(t.id, court ? 'elements' : undefined),
      // a press on a picked element slides it, and a press let go picks the element or the edge under it: the block's own outline's, not a court's
      ...(court
        ? {}
        : {
            grab,
            click(_r: Ref, part: ShapePart, at: Point, wall: number | undefined, shift: boolean) {
              if ((part !== 'wall' && part !== 'line') || wall === undefined) return
              const edge = g.edges[wall]
              if (!edge) return
              // the element under the press, else the wall's edge; with Shift added or taken away
              const el = elementAt(g, at, CLICK_REACH_PX / scale)
              const it: Picked = el ? { kind: 'element', id: el } : { kind: 'edge', id: edge.id }
              if (shift) useWarehouse.getState().togglePicked(it)
              else useWarehouse.getState().setPicked([it])
              if (el) useWarehouse.getState().show('elements')
            },
          }),
    }
  }
  const host = build(ref)

  // The plan's Delete (WarehousePlan.tsx: the one keydown listener of this plan) takes a picked corner out, its step filled in or cut
  // away; false: no corner is picked, the key is the plan's for what else is picked
  const latest = useRef({ build, corner })
  latest.current = { build, corner }
  const removeCorner = useRef((): boolean => {
    const { build: b, corner: c } = latest.current
    if (c === null) return false
    setCornerPick(null)
    removeShapeCorner(c.ref, c.i, b(c.ref))
    return true
  }).current

  // Shift+F chamfers the corner picked (the Chamfer tool's key: the block editor has no tool to hold); false: no corner is picked, and it says so
  const chamferCorner = useRef((): boolean => {
    const { build: b, corner: c } = latest.current
    if (c === null) {
      useToast.getState().show('info', 'Pick a corner first: click its dot, then Shift+F chamfers it')
      return false
    }
    return chamferShapeCorner(c.ref, c.i, KEY_CHAMFER, b(c.ref))
  }).current

  return { host, ref, courtHost: build, removeCorner, chamferCorner }
}
