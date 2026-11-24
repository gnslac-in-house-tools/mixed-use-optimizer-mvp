// The handles of any outline the shape engine edits (Phase D.1 task 5, Decision "Shape engine"; the mass's port of Plaza-Practiko
// `vistas/planta/edicion/Manijas.tsx`, the hole's of `ManijasHuecos.tsx`): one component for a mass, a mass's hole and a block's footprint.
// It reads each object through `actions.shapeOf` and edits it through `actions.editShape` (`drags.ts`); the viewport's own parts come in
// through its host (`host.ts`). What an object refuses is not drawn, or is refused with its reason.
// - a pill at the middle of each wall (on the arc for an arc edge): drag = move the wall along its normal, square (a corner added on the
//   wall stays and a step goes out from it; Ctrl: its corners slide freely, Decision "Square pull"); the wall's line does the same, and a
//   double click on it adds a corner there (a rect becomes a free shape);
// - a dot on each corner: drag = move it (a rect resizes, the opposite corner stays); click = pick it; Delete or a double click removes it;
// - rounded corners: their arc and radius; a chamfered corner: its cut, and a dot on each of its two ends, dragged along their walls;
// - a hole: its edge moves it (Alt+drag copies it, a click picks it, Delete removes it), its walls move by 0.1 m (Shift freely);
// - a block (Decisions "Smart blocks", "Block shape"; free since D.2): a pill on every wall, the box's (in the grid's blue) within its
//   range, shown while dragged as two dashed lines where its length or width would be shortest and longest; an inner one (in ink) without a
//   limit. A wall, a bump's face and a stretch's end land on the module lines when near one (Shift: free). A double click on a wall picks its
//   bay, a stretch: its face's pill pulls it out (a bump) or pushes it in (a notch), its end pills make it longer or shorter; Alt + double click
//   adds a corner. A corner dot drags (the walls turn angled), picks and removes (the step it makes filled in or cut away).
// - a truck court (Phase D.3, kinds `court` and `block-court`): its wall side is `fixed` (no pill, no line drag), the far edge of a rectangle carries a `value` (its depth: a pill that says it, typed
//   as the number itself), and its corners on the wall are `onLine` (dragged along it). `just` draws only those value pills: what a block shows of its courts before one is picked.
// In the block editor (`host.mode === 'ghost'`, Phase D.1 task 6) the same handles stand on the type's face polygon: a wall's line drags too (a block's
// walls and bays on its module lines), the result is drawn dashed (`useShapeGhost`) and applied on release, the picked stretch is the host's.
// Hit areas are 44 screen px at any zoom (28 for a hole's). A handle turns red when its last edit was rejected or limited. Geometry is drawn in
// world coordinates inside a y-flipped group; text is drawn outside it (flipped text mirrors).
import { useMemo, useRef, useState, type MouseEvent } from 'react'
import { massIsLocked } from '../../../kinds/locked.ts'
import type { Contour, Point } from '../../../model/schema.ts'
import { arcOfEdge, bulgeAt, chamferOf, contourToPolygon, cornerArc, cornerCut, turnAt } from '../../../engine/geom/contour.ts'
import { distancePointSegment } from '../../../engine/geom/polygon.ts'
import type { ShapeOpName, ShapeRead } from '../../../engine/geom/shapeOp.ts'
import type { Ref } from '../../../kinds/index.ts'
import { actions } from '../../../state/actions/index.ts'
import { useApp } from '../../../state/store.ts'
import { pathOf } from '../../plan/camera.ts'
import { useHoles } from '../../plan/holeState.ts'
import { wallAt } from '../../plan/snap/walls.ts'
import type { Drag, Start } from '../../plan/useDrag.ts'
import { useTyped } from '../dimension/typed.ts'
import { dockPressUnder } from '../edge/edgePick.ts'
import { followStretchEnd, startBump, startChamferEnd, startCorner, startHoleMove, startPush } from './drags.ts'
import { holeOfRef, siteHost, type ShapeHost, type ShapePart } from './host.ts'
import { chamferText, fmt, METRES, pastRange, stretchText, wallText } from './labels.ts'
import { canTake, removeShapeCorner, siteStretch, useShapeGhost, useStretch, type Stretch } from './shapeState.ts'
import { t as tr } from '../../../i18n/idioma.ts' // mixed-use-mvp

/** px: the sizes of a mass's handles, and of a hole's (smaller: it stands inside). */
const SIZES = {
  mass: { hit: 44, line: 16, dot: 5, long: 22, short: 7 },
  hole: { hit: 28, line: 12, dot: 4.5, long: 18, short: 6 },
}
/** px: how far past its wall's ends a box's range guide runs. */
const GUIDE_PAST_PX = 12
/** px: how far out of its wall a picked stretch's face pill stands, clear of its end pills. */
const FACE_OUT_PX = 16
/** px: a chamfer's end dot. */
const END_PX = 4

/** Edge i as an SVG path in world coordinates (for the y-flipped group): a line or an arc. */
function edgePath(c: Contour, i: number): string {
  const w = wallAt(c, i)
  const b = bulgeAt(c, i)
  if (b === 0) return `M${w.a.x} ${w.a.y}L${w.b.x} ${w.b.y}`
  const { radius, sweep } = arcOfEdge(w.a, w.b, b)
  return `M${w.a.x} ${w.a.y}A${radius} ${radius} 0 ${Math.abs(sweep) > Math.PI ? 1 : 0} ${sweep > 0 ? 1 : 0} ${w.b.x} ${w.b.y}`
}

/** A contour as a closed path of its corners, in world coordinates (for the y-flipped group). */
function pathFlipped(c: Contour): string {
  let ring: Point[]
  try {
    ring = contourToPolygon(c)
  } catch {
    ring = c.vertices
  }
  return ring.length ? `M${ring.map((q) => `${q.x} ${q.y}`).join('L')}Z` : ''
}

/** The middle of edge i on the edge itself: on an arc edge, the middle of the arc (not of the chord). */
function edgeMid(c: Contour, i: number): Point {
  const w = wallAt(c, i)
  const f = (bulgeAt(c, i) * w.length) / 2 // signed sagitta, positive to the left of a → b
  return { x: (w.a.x + w.b.x) / 2 - w.n.x * f, y: (w.a.y + w.b.y) / 2 - w.n.y * f }
}

/** The length of edge i: its chord if straight, its arc if curved. */
function edgeLength(c: Contour, i: number): number {
  const w = wallAt(c, i)
  const b = bulgeAt(c, i)
  if (b === 0 || w.length < 1e-12) return w.length
  const { radius, sweep } = arcOfEdge(w.a, w.b, b)
  return radius * Math.abs(sweep)
}

/** The wall of `c` nearest to q (where a double click on a hole's edge adds a corner). */
function nearestWall(c: Contour, q: Point): number {
  let best = 0
  let d = Infinity
  c.vertices.forEach((a, i) => {
    const e = distancePointSegment(q, a, c.vertices[(i + 1) % c.vertices.length])
    if (e < d) [best, d] = [i, e]
  })
  return best
}

/** A label in screen-sized text with a halo, at world point q shifted (dx, dy) screen px. */
function Label(props: { q: Point; text: string; px: number; dx?: number; dy?: number; anchor?: 'start' | 'middle' | 'end'; warn?: boolean }) {
  const { q, text, px, dx = 0, dy = 0, anchor = 'middle', warn = false } = props
  return (
    <text
      x={q.x + dx * px}
      y={-q.y + dy * px}
      textAnchor={anchor}
      dominantBaseline="middle"
      fontSize={11 * px}
      fill={warn ? 'var(--status-over)' : 'var(--ink)'}
      fontWeight={warn ? 600 : undefined}
      data-warn={warn || undefined}
      stroke="var(--panel)"
      strokeWidth={3 * px}
      paintOrder="stroke"
      pointerEvents="none"
    >
      {text}
    </text>
  )
}

/** Where a label stands beside a wall: out of it, on its side. */
const beside = (mid: Point, n: Point, off: number, px: number) => ({
  q: mid,
  dx: n.x * off,
  dy: -n.y * off,
  anchor: (Math.abs(n.x) > 0.7 ? (n.x > 0 ? 'start' : 'end') : 'middle') as 'start' | 'middle' | 'end',
  px,
})

/** The bay of a wall (its module lines from `stops`) that `along` (m from the wall's start) falls in: the stretch a double click picks. */
export function bayAt(wall: { stops?: number[]; bays?: number[] }, length: number, along: number): { from: number; to: number } | null {
  const stops = wall.stops
  if (!stops || stops.length < 2) return null
  const lines = [0, ...(wall.bays ?? []), length].sort((a, b) => a - b).filter((v, k, all) => k === 0 || v - all[k - 1] > 1e-6)
  const k = lines.findIndex((v, j) => j < lines.length - 1 && along >= v - 1e-6 && along <= lines[j + 1] + 1e-6)
  if (k < 0) return null
  const near = (v: number) => stops.reduce((best, s) => (Math.abs(s - v) < Math.abs(best - v) ? s : best), stops[0])
  const from = near(lines[k])
  const to = near(lines[k + 1])
  return to > from + 1e-6 ? { from, to } : null
}

/** The handles of the outlines `refs` (a mass, its holes, a block), in the viewport `host`. */
export function ShapeHandles(props: { refs: Ref[]; host: ShapeHost; just?: boolean }) {
  const { refs, host, just = false } = props
  return (
    <>
      {refs.map((r) => (
        <Handles key={`${r.kind}:${r.id}`} target={r} host={host} just={just} />
      ))}
    </>
  )
}

/** The site's: the picked mass and, when it is the only one, its holes. A locked mass shows none. */
export function SiteShapeHandles(props: { drag: Drag; scale: number; toWorld: ShapeHost['toWorld'] }) {
  const { drag, scale, toWorld } = props
  const id = useApp((s) => s.selection.massId)
  const single = useApp((s) => s.selection.massIds.length === 1)
  const vertex = useApp((s) => s.selection.vertex)
  const mass = useApp((s) => s.project.masses.find((m) => m.id === s.selection.massId))
  const locked = useApp((s) => {
    const m = s.project.masses.find((x) => x.id === s.selection.massId)
    return m !== undefined && massIsLocked(s.project, m)
  })
  const hole = useHoles((s) => s.pick)
  if (!id || !mass || locked) return null
  const refs: Ref[] = [{ kind: 'mass', id }]
  if (single) mass.holes?.forEach((_, k) => refs.push({ kind: 'mass-hole', id: `${id}/${k}` }))
  return <ShapeHandles refs={refs} host={siteHost(drag, scale, toWorld, { vertex, hole })} />
}

function Handles(props: { target: Ref; host: ShapeHost; just: boolean }) {
  const { target, host, just } = props
  const { drag, scale, toWorld } = host
  const project = useApp((s) => s.project)
  const read = useMemo(() => actions.shapeOf(project, target), [project, target.kind, target.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const live = useStretch((s) => s.stretch)
  // what a ghost drag would make: its own store, so the pointer moving draws these handles and not the viewport's whole plan; a value typed has ended the drag
  const ghosted = useShapeGhost((s) => s.ghost)
  const typedOver = useTyped((s) => s.cur?.ended === true)
  const [over, setOver] = useState<number | null>(null)
  const [moved, setMoved] = useState(0)
  // the stretch's pills stay where the face drag began: the bump it makes live moves the walls they stand on
  const frozen = useRef<{ c: Contour; read: ShapeRead } | null>(null)
  if (!read) return null
  // `just` the depth pills: a court with none (a shape of its own) has nothing to show
  if (just && !read.walls?.some((w) => w.value && !w.fixed)) return null

  const hole = target.kind === 'mass-hole'
  const holeAt = holeOfRef(target)
  const sz = hole ? SIZES.hole : SIZES.mass
  const px = 1 / scale
  const c = read.contour
  const n = c.vertices.length
  const takes = (op: ShapeOpName) => canTake(target, read, op)
  const picked = host.picked(target)
  const red = (k: string) => drag.key === k && drag.red
  const block = !!read.walls?.some((w) => w.module !== undefined)
  const ghostMode = host.mode === 'ghost'
  const lengths = host.lengths ?? METRES
  const key = (part: ShapePart, at?: number) => host.keyOf(target, part, at)
  // a truck court's walls: the one that stays on its wall has no handle, the one that is a number (its depth) has the pill that says it (Phase D.3)
  const fixedAt = (i: number) => read.walls?.[i]?.fixed === true
  const valued = (i: number) => (read.walls?.[i]?.value !== undefined && !fixedAt(i) ? i : null)

  /** A handle's pointer events: the host's first look (`grab`), then `drag.bind`, which begins the drag (`beginDrag`). */
  const bind = (part: ShapePart, at: number | undefined, op: ShapeOpName, start: Start) => {
    const guarded: Start = (e, p) => {
      if (host.may && !host.may(target, op)) return null
      host.ghost?.begin()
      const m = start(e, p)
      if (m && host.click && !m.click) {
        const shift = e.shiftKey
        m.click = () => host.click!(target, part, p, at, shift)
      }
      // a ghost drag applies its result on release (before the store and the typed dimension hear of it), or lets it go when cancelled
      if (m && host.ghost) {
        const before = m.settle
        m.settle = (cancelled) => {
          before?.(cancelled)
          if (cancelled) host.ghost!.cancel()
          else host.ghost!.release()
        }
      }
      return m
    }
    const b = drag.bind(key(part, at), guarded)
    if (!host.grab) return b
    return {
      ...b,
      onPointerDown: (e: Parameters<typeof b.onPointerDown>[0]) => {
        if (host.grab!(e, toWorld(e))) return
        b.onPointerDown(e)
      },
    }
  }

  const walls = Array.from({ length: n }, (_, i) => ({ i, wall: wallAt(c, i), mid: edgeMid(c, i) }))
  const dragged = walls.findIndex(({ i }) => drag.key === key('wall', i) || (!hole && drag.key === key('line', i)))
  const draggedWall = dragged < 0 ? null : dragged
  const active = draggedWall ?? over
  const info = active !== null && active < n ? read.walls?.[active] : undefined

  // where a double click on a wall lands: a block's bay picked as a stretch (a bump, a notch), unless Alt is held or the wall has no bays (an angled one); else a corner (an object that takes one)
  const doubleClick = (i: number | null) => (e: MouseEvent<SVGElement>) => {
    e.stopPropagation()
    const q = toWorld(e)
    const wi = i ?? nearestWall(c, q)
    // a court's wall side takes no corner: it stays on its wall
    if (fixedAt(wi)) return
    if (block && takes('bump') && !e.altKey) {
      const w = wallAt(c, wi)
      const bay = bayAt(read.walls?.[wi] ?? {}, w.length, (q.x - w.a.x) * w.u.x + (q.y - w.a.y) * w.u.y)
      if (bay) {
        ;(host.stretch ?? siteStretch).set(target, { target, wall: wi, ...bay })
        return
      }
    }
    if (takes('insert')) {
      if (host.may && !host.may(target, 'insert')) return
      ;(host.commit ?? useApp.getState().apply)((p) => actions.editShape(p, target, { op: 'insert', wall: wi, at: q }).project)
      host.pick(target, wi + 1)
    }
  }
  const dropCorner = (i: number) => (e: MouseEvent<SVGElement>) => {
    e.stopPropagation()
    removeShapeCorner(target, i, host)
    host.pick(target, null)
  }

  // a box's wall dragged: where its length or width would be shortest and longest
  const range = draggedWall !== null ? read.walls?.[draggedWall]?.range : undefined
  const guides =
    range && draggedWall !== null
      ? [range.lo, range.hi].map((v) => {
          const w = wallAt(c, draggedWall)
          const off = v - range.now
          const past = GUIDE_PAST_PX * px
          const at = (q: Point, s: number) => ({ x: q.x + w.n.x * off + w.u.x * s, y: q.y + w.n.y * off + w.u.y * s })
          return { v, a: at(w.a, -past), b: at(w.b, past), n: w.n }
        })
      : []
  // a ghost drag: what it would make (its range, its length), drawn dashed in the frame the handles stand in
  const shown = ghostMode && !typedOver && ghosted && ghosted.ref.kind === target.kind && ghosted.ref.id === target.id ? ghosted.read : null
  const shownWall = shown && draggedWall !== null && shown.contour.vertices.length === n ? shown.walls?.[draggedWall] : undefined
  // its length is the ghost's, its range the one it is dragged within
  const shownInfo = shownWall?.range && info?.range ? { ...info, range: { ...info.range, now: shownWall.range.now } } : info
  const warn = pastRange(shownInfo)

  // the stretch picked on this object
  const mine: Stretch | null = host.stretch ? host.stretch.get(target) : live && live.target.kind === target.kind && live.target.id === target.id ? live : null
  const faceDrag = drag.key === key('face')
  if (!faceDrag) frozen.current = mine ? { c, read } : null
  const st = mine && (faceDrag ? frozen.current : { c, read })
  const stretchPills =
    mine && st && mine.wall < st.c.vertices.length
      ? (() => {
          const w = wallAt(st.c, mine.wall)
          const at = (s: number): Point => ({ x: w.a.x + w.u.x * s, y: w.a.y + w.u.y * s })
          const middle = at((mine.from + mine.to) / 2)
          return {
            w,
            module: st.read.walls?.[mine.wall]?.module ?? 1,
            from: at(mine.from),
            to: at(mine.to),
            face: { x: middle.x + w.n.x * FACE_OUT_PX * px, y: middle.y + w.n.y * FACE_OUT_PX * px },
            hit: Math.max(10, Math.min(sz.hit, (mine.to - mine.from) * scale)),
            angle: (Math.atan2(w.u.y, w.u.x) * 180) / Math.PI,
          }
        })()
      : null

  const corners = c.vertices.map((v, i) => ({ i, v, arc: hole ? null : cornerArc(c, i), cut: hole ? null : cornerCut(c, i) }))
  const endDragged = (i: number) => drag.key === key('chamfer-a', i) || drag.key === key('chamfer-b', i)

  const pill = (i: number, mid: Point, angle: number, ink: string, hitPx: number, fill: string, k: string, wall: ReturnType<typeof wallAt>) => {
    // a block's wall shorter on screen than its pill draws none, its square to press no longer than it: a bump a module deep stays readable, its walls still dragged
    const bare = ghostMode && wall.length * scale < sz.long + 6
    const hit = bare ? Math.max(8, Math.min(hitPx, wall.length * scale)) : hitPx
    return (
      <g
        key={k}
        data-wall-kind={read.walls?.[i]?.tone}
        {...bind('wall', i, 'push', startPush(target, i, scale, setMoved, host))}
        transform={`translate(${mid.x} ${mid.y}) rotate(${angle})`}
        style={{ cursor: Math.abs(wall.n.x) > Math.abs(wall.n.y) ? 'ew-resize' : 'ns-resize', touchAction: 'none' }}
        onPointerEnter={() => setOver(i)}
        onPointerLeave={() => setOver((h) => (h === i ? null : h))}
        onDoubleClick={takes('insert') || takes('bump') ? doubleClick(hole ? null : i) : undefined}
      >
        {hole && <title>{tr("Drag to move this wall of the hole; a double click adds a corner")}</title>}
        <rect x={(-hit / 2) * px} y={(-hit / 2) * px} width={hit * px} height={hit * px} fill="transparent" />
        {!bare && <rect x={(-sz.long / 2) * px} y={(-sz.short / 2) * px} width={sz.long * px} height={sz.short * px} rx={(sz.short / 2) * px} fill={fill} stroke={ink} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />}
      </g>
    )
  }

  // the pill that says a court's depth: its far edge, drawn outside the flipped group (its text stands upright), the number it makes while dragged
  const valuePill = ({ i, wall, mid }: (typeof walls)[number]) => {
    const v = read.walls?.[i]?.value
    if (!v) return null
    const k = key('wall', i)
    const now = shownWall?.value?.now ?? v.now
    const text = `${lengths.fig(now)} ${lengths.unit}`
    const w = (text.length * 6.5 + 10) * px
    const h = 16 * px
    const bad = red(k)
    return (
      <g
        key={`v${k}`}
        data-court-pill={target.id}
        role="slider"
        aria-label="Truck court depth"
        aria-valuenow={now}
        aria-valuemin={v.lo}
        aria-valuemax={v.hi}
        {...bind('wall', i, 'push', startPush(target, i, scale, setMoved, host))}
        style={{ cursor: Math.abs(wall.n.x) > Math.abs(wall.n.y) ? 'ew-resize' : 'ns-resize', touchAction: 'none' }}
        onPointerEnter={() => setOver(i)}
        onPointerLeave={() => setOver((o) => (o === i ? null : o))}
        onDoubleClick={(e) => e.stopPropagation()}
      >
        <title>{`Truck court ${text} deep: drag out or in to make it deeper or shallower; type the depth`}</title>
        <rect x={mid.x - w / 2} y={-mid.y - h / 2} width={w} height={h} rx={h / 2} fill={bad ? 'var(--status-over)' : 'var(--panel)'} stroke={bad ? 'var(--status-over)' : 'var(--ink)'} strokeWidth={1.25} vectorEffect="non-scaling-stroke" />
        <text x={mid.x} y={-mid.y} textAnchor="middle" dominantBaseline="central" fontSize={11 * px} fill={bad ? 'var(--panel)' : 'var(--ink)'} pointerEvents="none" className="tabular-nums">
          {text}
        </text>
      </g>
    )
  }

  const wallPills = takes('push')
    ? walls.map(({ i, wall, mid }) => {
        if (wall.length < 1e-6 || fixedAt(i) || valued(i) !== null || just) return null
        const k = key('wall', i)
        const tone = read.walls?.[i]?.tone === 'box' ? 'var(--grid-line)' : 'var(--ink)'
        const bad = red(k) || (!hole && red(key('line', i)))
        const on = draggedWall === i || (hole && drag.key === k)
        const ink = bad ? 'var(--status-over)' : hole ? 'var(--ink)' : tone
        const fill = bad ? 'var(--status-over)' : on ? (hole ? 'var(--ink)' : tone) : 'var(--panel)'
        return pill(i, mid, (Math.atan2(wall.u.y, wall.u.x) * 180) / Math.PI, ink, sz.hit, fill, k, wall)
      })
    : null

  const dots = (just ? [] : c.vertices).map((v, i) => {
    const chosen = picked.vertex === i
    const k = key('vertex', i)
    const look = (
      <>
        <circle cx={v.x} cy={v.y} r={(sz.hit / 2) * px} fill="transparent" />
        <circle cx={v.x} cy={v.y} r={sz.dot * px} fill={red(k) ? 'var(--status-over)' : chosen ? 'var(--ink)' : 'var(--panel)'} stroke={red(k) ? 'var(--status-over)' : 'var(--ink)'} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      </>
    )
    if (takes('vertex')) {
      return (
        <g key={k} {...bind('vertex', i, 'vertex', startCorner(target, i, scale, host))} {...(hole ? { 'data-hole-vertex': i } : { 'data-vertex': i })} style={{ cursor: 'move', touchAction: 'none' }} onClick={ghostMode ? () => host.pick(target, i) : undefined} onDoubleClick={takes('remove') ? dropCorner(i) : undefined}>
          {look}
        </g>
      )
    }
    // a corner that does not drag (a block's): it picks, and a double click takes it out
    return takes('remove') ? (
      <g key={k} data-corner={i} {...(ghostMode && { 'data-handle': k })} style={{ cursor: 'pointer' }} onPointerDown={(e) => e.stopPropagation()} onClick={() => host.pick(target, i)} onDoubleClick={dropCorner(i)}>
        <title>{tr("Click: pick this corner (Delete takes it out); double click: take it out, its step filled in or cut away")}</title>
        {look}
      </g>
    ) : null
  })

  const wallLabel = active !== null && active < n ? walls[active] : null

  return (
    <g {...(hole ? { 'data-layer': 'hole-handles', 'data-mass': holeAt?.massId, 'data-hole': holeAt?.k } : { 'data-layer': 'shape-handles', 'data-mass': target.id })}>
      {hole && (() => {
        let ring: Point[]
        try {
          ring = contourToPolygon(c)
        } catch {
          ring = c.vertices
        }
        const k = key('body')
        return (
          <>
            <path
              {...bind('body', undefined, 'move', startHoleMove(target, scale, host))}
              role="button"
              aria-label={`Hole ${(holeAt?.k ?? 0) + 1}`}
              aria-pressed={picked.whole}
              d={pathOf([ring])}
              fill="none"
              // a wide invisible edge to grab; the one that shows goes over it
              stroke="transparent"
              strokeWidth={sz.line}
              pointerEvents="stroke"
              vectorEffect="non-scaling-stroke"
              style={{ cursor: drag.key === k ? 'grabbing' : 'move', touchAction: 'none' }}
              onDoubleClick={doubleClick(null)}
            />
            <path d={pathOf([ring])} fill="none" stroke={red(k) ? 'var(--status-over)' : 'var(--ink)'} strokeWidth={picked.whole ? 2 : 1} strokeDasharray={picked.whole ? undefined : '5 3'} vectorEffect="non-scaling-stroke" pointerEvents="none" />
          </>
        )
      })()}
      <g transform="scale(1 -1)">
        {/* Rounded corners: the arc, stronger when the corner is picked. */}
        {corners.map(({ i, arc }) =>
          arc ? (
            <path key={`r${i}`} d={`M${arc.t1.x} ${arc.t1.y}A${arc.r} ${arc.r} 0 0 ${turnAt(c, i) >= 0 ? 1 : 0} ${arc.t2.x} ${arc.t2.y}`} fill="none" stroke="var(--ink)" strokeWidth={2.5} strokeOpacity={picked.vertex === i ? 0.9 : 0.45} vectorEffect="non-scaling-stroke" pointerEvents="none" />
          ) : null,
        )}

        {/* Chamfered corners: the cut, stronger when the corner is picked. */}
        {corners.map(({ i, cut }) =>
          cut ? <path key={`c${i}`} data-chamfer={i} d={`M${cut.p1.x} ${cut.p1.y}L${cut.p2.x} ${cut.p2.y}`} fill="none" stroke="var(--ink)" strokeWidth={2.5} strokeOpacity={picked.vertex === i || endDragged(i) ? 0.9 : 0.45} vectorEffect="non-scaling-stroke" pointerEvents="none" /> : null,
        )}

        {/* What a ghost drag would make, dashed (the block editor's: nothing is applied until the pointer is let go). */}
        {shown && <path data-ghost d={pathFlipped(shown.contour)} fill="none" stroke="var(--ink)" strokeWidth={2} strokeDasharray="7 4" vectorEffect="non-scaling-stroke" pointerEvents="none" />}

        {/* The hovered or dragged wall, dashed. */}
        {!hole && active !== null && active < n && <path d={edgePath(c, active)} fill="none" stroke="var(--ink)" strokeWidth={2.5} strokeDasharray="7 4" vectorEffect="non-scaling-stroke" pointerEvents="none" />}

        {/* A box's wall dragged: where its length or width would be shortest and longest, dashed. */}
        {guides.map((q) => (
          <path key={`g${q.v}`} data-range-guide={q.v} d={`M${q.a.x} ${q.a.y}L${q.b.x} ${q.b.y}`} fill="none" stroke="var(--grid-line)" strokeWidth={1.5} strokeDasharray="4 4" vectorEffect="non-scaling-stroke" pointerEvents="none" />
        ))}

        {/* Each wall line: drag moves the wall, double-click adds a corner (a block's: a double click picks its bay, nothing drags). */}
        {!hole &&
          !just &&
          takes('push') &&
          (!block || ghostMode) &&
          walls.filter(({ i }) => !fixedAt(i)).map(({ i, wall }) => (
            <path
              key={`l${i}`}
              {...bind('line', i, 'push', startPush(target, i, scale, setMoved, host))}
              d={edgePath(c, i)}
              fill="none"
              stroke="transparent"
              strokeWidth={sz.line}
              vectorEffect="non-scaling-stroke"
              pointerEvents="stroke"
              style={{ cursor: block ? (Math.abs(wall.n.x) > Math.abs(wall.n.y) ? 'ew-resize' : 'ns-resize') : 'move', touchAction: 'none' }}
              onDoubleClick={takes('insert') || takes('bump') ? doubleClick(i) : undefined}
              {...(ghostMode && { onPointerEnter: () => setOver(i), onPointerLeave: () => setOver((h) => (h === i ? null : h)) })}
            />
          ))}
        {!hole &&
          !just &&
          block &&
          !ghostMode &&
          takes('bump') &&
          walls.map(({ i }) => (
            <path key={`b${i}`} data-bay-line={i} d={edgePath(c, i)} fill="none" stroke="transparent" strokeWidth={sz.line} vectorEffect="non-scaling-stroke" pointerEvents="stroke" style={{ cursor: 'default' }} onPointerDown={(e) => { e.stopPropagation(); if (e.button === 0) dockPressUnder.current?.(e) }} onDoubleClick={doubleClick(i)}>
              <title>{tr("Double click: this bay, to pull out or push in")}</title>
            </path>
          ))}

        {/* A pill at the middle of each wall. */}
        {wallPills}

        {/* A dot on each corner. */}
        {dots}

        {/* A chamfer's two ends, each dragged along its own wall. */}
        {corners.map(({ i, v, cut }) =>
          cut && takes('chamfer') && !just
            ? (['a', 'b'] as const).map((end) => {
                const k = key(end === 'a' ? 'chamfer-a' : 'chamfer-b', i)
                const p = end === 'a' ? cut.p1 : cut.p2
                // a set-back shorter than the catch would put the end's catch over the corner's dot: it stays within half of it (never under its own dot)
                const catches = Math.max(END_PX, Math.min(sz.hit / 3, (Math.hypot(p.x - v.x, p.y - v.y) * scale) / 2))
                return (
                  <g key={k} {...bind(end === 'a' ? 'chamfer-a' : 'chamfer-b', i, 'chamfer', startChamferEnd(target, i, end, scale, host))} data-chamfer-end={`${i}-${end}`} style={{ cursor: 'move', touchAction: 'none' }}>
                    <circle cx={p.x} cy={p.y} r={catches * px} fill="transparent" />
                    <circle cx={p.x} cy={p.y} r={END_PX * px} fill={red(k) ? 'var(--status-over)' : drag.key === k ? 'var(--ink)' : 'var(--panel)'} stroke={red(k) ? 'var(--status-over)' : 'var(--ink)'} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
                  </g>
                )
              })
            : null,
        )}

        {/* The stretch picked: its extent along its wall, its face pill (just out of the wall) and a pill at each end. */}
        {stretchPills && mine && (
          <g data-stretch={mine.label ?? `${mine.wall}:${mine.from}-${mine.to}`}>
            <path d={`M${stretchPills.from.x} ${stretchPills.from.y}L${stretchPills.to.x} ${stretchPills.to.y}`} fill="none" stroke="var(--ink)" strokeWidth={3} strokeDasharray="7 4" vectorEffect="non-scaling-stroke" pointerEvents="none" />
            {(['from', 'to'] as const).map((end) => {
              const at = stretchPills[end]
              return (
                <g key={end} {...bind(end, undefined, 'bump', followStretchEnd(target, mine.wall, end, host, scale))} transform={`translate(${at.x} ${at.y}) rotate(${stretchPills.angle + 90})`} style={{ cursor: 'move', touchAction: 'none' }}>
                  <title>{tr("Drag: the stretch longer or shorter, onto a module line when near one (Shift: free)")}</title>
                  <rect x={(-stretchPills.hit / 2) * px} y={(-stretchPills.hit / 2) * px} width={stretchPills.hit * px} height={stretchPills.hit * px} fill="transparent" />
                  <rect x={(-SIZES.mass.long / 2) * px} y={(-SIZES.mass.short / 2) * px} width={SIZES.mass.long * px} height={SIZES.mass.short * px} rx={(SIZES.mass.short / 2) * px} fill="var(--panel)" stroke="var(--ink)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
                </g>
              )
            })}
            <g {...bind('face', undefined, 'bump', startBump(target, mine.wall, mine.from, mine.to, scale, setMoved, host))} transform={`translate(${stretchPills.face.x} ${stretchPills.face.y}) rotate(${stretchPills.angle})`} style={{ cursor: Math.abs(stretchPills.w.n.x) > Math.abs(stretchPills.w.n.y) ? 'ew-resize' : 'ns-resize', touchAction: 'none' }}>
              <title>{tr("Drag: out of the wall (a bump) or into it (a notch), onto a module line when near one (Shift: free)")}</title>
              <rect x={(-FACE_OUT_PX * 1.5 * px) / 2} y={(-FACE_OUT_PX * 1.5 * px) / 2} width={FACE_OUT_PX * 1.5 * px} height={FACE_OUT_PX * 1.5 * px} fill="transparent" />
              <rect x={(-SIZES.mass.long / 2) * px} y={(-SIZES.mass.short / 2) * px} width={SIZES.mass.long * px} height={SIZES.mass.short * px} rx={(SIZES.mass.short / 2) * px} fill={faceDrag ? 'var(--ink)' : 'var(--panel)'} stroke="var(--ink)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
            </g>
          </g>
        )}
      </g>

      {/* A truck court's depth: the pill on its far edge (Phase D.3). */}
      {takes('push') && walls.map(valuePill)}

      {/* Radius of each rounded corner. */}
      {just ? null : corners.map(({ i, v, arc }) => (arc ? <Label key={`rl${i}`} q={arc.mid} px={px} dy={-12} text={`r ${fmt(v.r)}`} /> : null))}

      {/* A chamfered corner picked or dragged: its two set-backs. */}
      {corners.map(({ i, cut }) => {
        const k = chamferOf(c, i)
        return cut && k && (picked.vertex === i || endDragged(i)) ? <Label key={`cl${i}`} q={{ x: (cut.p1.x + cut.p2.x) / 2, y: (cut.p1.y + cut.p2.y) / 2 }} px={px} dy={-12} text={chamferText(k[0], k[1])} /> : null
      })}

      {/* Live length of the hovered or dragged wall (and how far it moved), outside the wall. */}
      {wallLabel && <Label {...beside(wallLabel.mid, wallLabel.wall.n, hole ? 30 : 20, px)} text={wallText(shownInfo, edgeLength(c, wallLabel.i), draggedWall !== null, moved, lengths)} warn={warn} />}

      {/* The range's ends, by their guides. */}
      {guides.map((q) => (
        <Label key={`gl${q.v}`} q={q.b} px={px} dx={q.n.x * 4} dy={-q.n.y * 4} anchor={Math.abs(q.n.x) > 0.7 ? (q.n.x > 0 ? 'start' : 'end') : 'start'} text={`${lengths.fig(q.v)} ${lengths.unit}`} />
      ))}

      {/* The stretch's figure: what pulling it out or in makes, and how big it is. */}
      {stretchPills && mine && (
        <Label
          {...beside({ x: (stretchPills.from.x + stretchPills.to.x) / 2, y: (stretchPills.from.y + stretchPills.to.y) / 2 }, stretchPills.w.n, 34, px)}
          text={stretchText(stretchPills.module, mine.from, mine.to, faceDrag ? moved : 0, lengths)}
        />
      )}
    </g>
  )
}
