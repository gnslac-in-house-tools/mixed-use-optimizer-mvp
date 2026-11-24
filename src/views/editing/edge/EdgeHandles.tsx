// The On edge views (Phase D.3 task 10, Decision "On edge engine"): the one set of presses for what stands on a host's edges — docks, doors and patterns on a block's walls — in the block
// editor and on the site. It reads the host through `actions.edgeOf` and writes through `actions.editEdge` (put, take, slide), nothing else; where a press lands is the host's maths (`host.ts`).
//   a tool in hand (Dock, Door, Pattern)  a press on a module puts one or takes it away, past a wall in front of a bay fills it by the host's rule (full: empties it), a drag along
//                                         the wall paints the modules it passes, one undo step on release; a wall that takes none says why. The module or bay under the pointer is
//                                         drawn, those being taken away in red.
//   Select, elements picked               one of them pressed (`grab`, asked first by the plan) and dragged: all slide along their walls by whole modules, the preview the engine's
//                                         (none when it would refuse); the number of modules is typed during the drag or right after it (`startTyped`), exactly, one undo step.
//   Select, elements picked               pills on the plan (Phase D.3 task 11, the user's Q3): at each end of a run of one kind on one wall, one that adds modules or takes them (dragged
//                                         along the wall; the number typed is the count of the run); at the side of the first, one that sets the width of all picked (dragged
//                                         across; the number typed is the width). A preview is the engine's dry run; one undo step each, a refusal a toast, "Only N fit" too.
// The drags are `beginDrag`'d (no text selected) and follow the window's pointer, so they need no element of their own. The site gives a `capture` layer; the block editor's plan gives the
// presses it hears through `controls`.
import { useEffect, useMemo, useRef, useState, type MutableRefObject, type PointerEvent as ReactPointerEvent } from 'react'
import type { EdgeOp } from '../../../engine/edge/onEdge.ts'
import type { Id, Point, Polygon } from '../../../model/schema.ts'
import { convexHull } from '../../../engine/geom/rectangle.ts'
import { actions } from '../../../state/actions/index.ts'
import { useApp } from '../../../state/store.ts'
import { beginDrag } from '../../controls/beginDrag.ts'
import { useToast } from '../../layout/toast.ts'
import { Capture, type ToolCamera } from '../../plan/tools/common.tsx'
import { endTyped, moveTyped, startTyped, typedEnded, type Told } from '../dimension/typed.ts'
import { alongEdge, CLICK_PX, countAtSlot, countLabel, onEdgeAt, pillsOf, slideLabel, slotAt, slotMid, widthAt, widthLabel, type PillRun } from './edgeState.ts'
import type { EdgeHost, ElementTool } from './host.ts'
import { COUNT_HELP, COUNT_WHAT, SLIDE_HELP, SLIDE_WHAT, WIDTH_HELP, WIDTH_WHAT, sentence, slideName } from './labels.ts'

/** What the plan that holds these views calls: a press with a tool in hand (true: taken), a press on a picked element (true: its slide begun). */
export interface EdgeControls {
  press(e: ReactPointerEvent<Element>): boolean
  grab(e: ReactPointerEvent<Element>): boolean
}

interface Paint {
  edge: Id
  on: boolean
  first: number[]
  slots: number[]
}

interface Slide {
  el: Id
  ids: Id[]
  edge: Id
  from: number
  x: number
  y: number
  by: number
  moved: boolean
}

/** A pill pressed: the count at one end of a run (`value`: how many the run would hold), or the width of the picked (`value`: m). */
interface PillDrag {
  type: 'count' | 'width'
  end?: 'start' | 'end'
  run?: PillRun
  edge: Id
  ids: Id[]
  slot: number
  now: number
  value: number
  x: number
  y: number
  moved: boolean
}

type Camera = ToolCamera & { svgRef?: { current: Element | null } }

/** m: the widths a pill's drag holds to (`widthAt`), and a typed width with them. */
const WIDTH_MIN = 0.1
const WIDTH_MAX = 20

const path = (poly: Polygon): string => `M${poly.map((q) => `${q.x} ${-q.y}`).join('L')}Z`

export function EdgeHandles({
  host,
  camera,
  tool,
  picked,
  controls,
  capture,
}: {
  host: EdgeHost
  camera: Camera
  /** The element tool in hand (a pattern's name is the host's): null with Select. */
  tool: ElementTool | null
  /** The elements picked, which a press on one of them slides. */
  picked: readonly Id[]
  controls?: MutableRefObject<EdgeControls | null>
  /** The site's: a layer over the plan that takes the presses. */
  capture?: boolean
}) {
  const project = useApp((s) => s.project)
  // read again only when the project or the host changes (it generates the block): a hover or a drag redraws without reading
  const read = useMemo(() => actions.edgeOf(project, host.ref), [project, host.ref])
  const [hover, setHover] = useState<Point | null>(null)
  const [paint, setPaint] = useState<Paint | null>(null)
  const [slide, setSlide] = useState<Slide | null>(null)
  const [pill, setPill] = useState<PillDrag | null>(null)
  const live = useRef({ host, camera, tool, picked, read, paint, slide, pill })
  live.current = { host, camera, tool, picked, read, paint, slide, pill }
  const pills = useMemo(() => pillsOf(read, picked), [read, picked])
  // a width as the host's viewport says it (the block editor's unit, ft too); typed in that unit, held in metres
  const L = host.lengths
  const wText = (w: number): string => (L ? L.text(w) : widthLabel(w))
  const wUnit = ` ${L?.unit ?? 'm'}`

  /** An op through the engine: a refusal says why and changes nothing; else it is one undo step, and what it did beyond what was asked is said. */
  const write = (op: EdgeOp): boolean => {
    const { host: h } = live.current
    const p = useApp.getState().project
    const w = actions.editEdge(p, h.ref, op)
    if (w.reason) {
      useToast.getState().show('info', sentence(w.reason))
      return false
    }
    if (w.project === p) return false
    h.commit((q) => actions.editEdge(q, h.ref, op).project)
    if (w.notes?.length) useToast.getState().show('info', sentence(w.notes.join('; ')))
    return true
  }

  /** A press with a tool in hand: a paint begins on the module or bay it lands on; a wall that takes none says why. */
  const press = (e: ReactPointerEvent<Element>): boolean => {
    const { host: h, camera: c, tool: t } = live.current
    if (!t || e.button !== 0) return false
    const hit = h.press(c.toWorld(e), t, t === 'pattern' ? h.patternName() : undefined, c.scale)
    if (!hit) return false
    if (hit.refused) {
      useToast.getState().show('info', sentence(hit.refused))
      return true
    }
    beginDrag(e)
    setPaint({ edge: hit.edge, on: hit.on, first: hit.slots, slots: hit.slots })
    return true
  }

  /** Select: a press on a picked element begins a slide of the picked ones. */
  const grab = (e: ReactPointerEvent<Element>): boolean => {
    const { host: h, camera: c, picked: ids, read: r } = live.current
    if (live.current.tool || e.button !== 0 || e.shiftKey || !r) return false
    const q = c.toWorld(e)
    const el = h.elementAt(q, c.scale)
    const info = el && ids.includes(el) ? r.elements.find((x) => x.id === el) : undefined
    const edge = info && r.edges.find((x) => x.id === info.edge)
    const from = edge ? slotAt(edge, q) : null
    if (!el || !info || !edge || from === null) return false
    e.stopPropagation()
    beginDrag(e, c.svgRef?.current ?? e.currentTarget)
    const mine = ids.filter((id) => r.elements.some((x) => x.id === id))
    const kind = info.kind
    startTyped({
      what: SLIDE_WHAT,
      name: slideName(mine.length, kind),
      measure: 'distance',
      shown: '',
      at: q,
      way: 0,
      unit: mine.length === 1 ? ' module' : ' modules',
      help: SLIDE_HELP,
      mode: h.mode,
      commit: (f) => h.commit(f),
      cancel: () => setSlide(null),
      apply: (v) => (p, told: Told) => {
        const w = actions.editEdge(p, h.ref, { op: 'slide', ids: mine, by: Math.round(v as number) })
        if (w.reason) told.why = sentence(w.reason)
        return w.reason || w.project === p ? null : w.project
      },
    })
    setSlide({ el, ids: mine, edge: info.edge, from, x: e.clientX, y: e.clientY, by: 0, moved: false })
    return true
  }

  /** The op a pill drag makes at value `v`. */
  const pillOp = (d: Pick<PillDrag, 'type' | 'end' | 'run' | 'ids'>, v: number): EdgeOp =>
    d.type === 'count' && d.run
      ? { op: 'count', edge: d.run.edge.id, kind: d.run.kind, ...(d.run.name !== undefined ? { name: d.run.name } : {}), n: Math.round(v), end: d.end ?? 'end' }
      : { op: 'width', ids: d.ids, width: v }

  /** The value a pill's drag makes at the pointer `q`: the run's count (its end moved by the modules the pointer passed), or the width. */
  const pillValue = (d: PillDrag, q: Point, free: boolean): number | null => {
    const r = live.current.read
    if (d.type === 'width') {
      const e = r?.edges.find((x) => x.id === d.edge)
      return e ? widthAt(e, d.slot, q, free) : null
    }
    const run = d.run
    const k = run ? slotAt(run.edge, q) : null
    if (!run || k === null) return null
    return Math.max(0, countAtSlot(run, d.end ?? 'end', k))
  }

  /** A press on a pill: its drag begins, typed (the number is the count of the run, or the width in m). */
  const startPill = (e: ReactPointerEvent<Element>, type: 'count' | 'width', end?: 'start' | 'end') => {
    const { host: h, camera: c, read: r } = live.current
    if (e.button !== 0 || !pills || !r) return
    e.stopPropagation()
    const run = type === 'count' ? (pills.count ?? undefined) : undefined
    const w = pills.width
    const d: PillDrag = { type, ...(end ? { end } : {}), ...(run ? { run } : {}), edge: w.edge.id, ids: w.ids, slot: w.slot, now: type === 'count' ? (run?.held ?? 0) : w.now, value: type === 'count' ? (run?.held ?? 0) : w.now, x: e.clientX, y: e.clientY, moved: false }
    beginDrag(e, c.svgRef?.current ?? e.currentTarget)
    const kind = run?.kind ?? r.elements.find((x) => x.id === w.ids[0])?.kind ?? 'dock'
    startTyped({
      what: type === 'count' ? COUNT_WHAT : WIDTH_WHAT,
      name: type === 'count' ? `${kind}s on ${w.edge.name}` : slideName(w.ids.length, kind),
      measure: 'value',
      shown: '',
      at: c.toWorld(e),
      way: 0,
      unit: type === 'count' ? '' : wUnit,
      help: type === 'count' ? COUNT_HELP : WIDTH_HELP,
      mode: h.mode,
      commit: (f) => h.commit(f),
      cancel: () => setPill(null),
      apply: (v) => (p, told: Told) => {
        // a typed width is held to the drag's range, in metres (review S3), and said
        let typed = type === 'width' ? (L ? L.fromShown(v as number) : (v as number)) : (v as number)
        let held: string | null = null
        if (type === 'width' && typed > WIDTH_MAX) {
          typed = WIDTH_MAX
          held = `Held to ${wText(WIDTH_MAX)}`
        }
        const out = actions.editEdge(p, h.ref, pillOp(d, typed))
        if (held && !out.reason) told.note = held
        if (out.reason) told.why = sentence(out.reason)
        else if (out.notes?.length) {
          // what it did beyond what was typed (a count that did not all fit): beside the field, and as a toast (the probe and the edit say it once)
          told.note = [held, ...out.notes].filter(Boolean).join('; ')
          const said = sentence(told.note)
          if (useToast.getState().toast?.text !== said) useToast.getState().show('info', said)
        }
        return out.reason || out.project === p ? null : out.project
      },
    })
    setPill(d)
  }

  // another tool, or none: the hover of the last one goes
  useEffect(() => setHover(null), [tool])

  useEffect(() => {
    if (!controls) return
    controls.current = { press, grab }
    return () => {
      controls.current = null
    }
  })

  // the block editor's plan has no capture layer of its own (the site's has `onPointerLeave`): leaving the plan clears the hover there too
  useEffect(() => {
    const svgEl = camera.svgRef?.current
    if (capture || !svgEl) return
    const leave = () => setHover(null)
    svgEl.addEventListener('pointerleave', leave)
    return () => svgEl.removeEventListener('pointerleave', leave)
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [capture])

  // the pointer, wherever it is: the hover, the paint and the slide follow it, and let go where it is released
  useEffect(() => {
    const at = (ev: PointerEvent): Point => live.current.camera.toWorld(ev)
    const onMove = (ev: PointerEvent) => {
      const { host: h, tool: t, paint: pa, slide: sl, read: r, pill: pl } = live.current
      const q = at(ev)
      // the hover is only drawn with a tool in hand: Select redraws nothing as the pointer moves (review N4)
      // ... and only over the plan itself: a move over an overlay above it (HTML) leaves it undone
      const svg = live.current.camera.svgRef?.current
      if (t) setHover(!svg || (ev.target instanceof Node && svg.contains(ev.target)) ? q : null)
      if (pl) {
        if (!pl.moved && Math.hypot(ev.clientX - pl.x, ev.clientY - pl.y) < CLICK_PX) return
        const v = pillValue(pl, q, ev.shiftKey)
        if (v === null) return
        setPill({ ...pl, moved: true, value: v })
        if (!typedEnded()) moveTyped(pl.type === 'count' ? countLabel(v, pl.run?.kind ?? 'dock') : wText(v), v, q)
      }
      if (pa && t) setPaint({ ...pa, slots: h.paint(pa.edge, t, pa.first, q, pa.on) })
      if (sl && r) {
        const edge = r.edges.find((x) => x.id === sl.edge)
        const k = edge ? slotAt(edge, q) : null
        if (k === null) return
        if (!sl.moved && Math.hypot(ev.clientX - sl.x, ev.clientY - sl.y) < CLICK_PX) return
        const by = k - sl.from
        setSlide({ ...sl, moved: true, by })
        if (!typedEnded()) moveTyped(slideLabel(by), by, q)
      }
    }
    const onUp = (ev: PointerEvent) => {
      const { host: h, tool: t, paint: pa, slide: sl, read: r, pill: pl } = live.current
      if (pl) {
        setPill(null)
        // a number typed during the drag applied it already
        if (typedEnded()) return
        // read again where the pointer is let go: the last move may not have been drawn yet (a fast drag)
        const v = pl.moved ? pillValue(pl, at(ev), ev.shiftKey) : null
        if (v !== null && v !== pl.now && write(pillOp(pl, v))) endTyped(false)
        else endTyped(true)
        return
      }
      if (pa && t) {
        setPaint(null)
        // read again where the pointer is let go: the last move may not have been drawn yet (a fast drag)
        const slots = h.paint(pa.edge, t, pa.first, at(ev), pa.on)
        const name = t === 'pattern' ? h.patternName() : undefined
        write({ op: pa.on ? 'put' : 'take', edge: pa.edge, slots, kind: t, ...(name !== undefined ? { name } : {}) })
        return
      }
      if (sl) {
        setSlide(null)
        // a number typed during the drag applied it already
        if (typedEnded()) return
        if (sl.by !== 0) {
          write({ op: 'slide', ids: sl.ids, by: sl.by })
          endTyped(false)
        } else {
          endTyped(true)
          // pressed and let go where it began: it alone
          if (!sl.moved && r) h.pick?.(sl.el)
        }
      }
    }
    const onCancel = () => {
      const { paint: pa, slide: sl, pill: pl } = live.current
      if (pa) setPaint(null)
      if (pl) {
        setPill(null)
        endTyped(true)
      }
      if (sl) {
        setSlide(null)
        endTyped(true)
      }
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
      // unmounted mid drag (Escape lets go of the block, the pick goes): its typed field goes with it, never a number that edits what is no longer picked (review B2)
      if (live.current.slide || live.current.pill) endTyped(true)
    }
    // the handlers read what is current from `live`
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // what is drawn: the module (or the bay) under the pointer, or those being painted (taken off: in red)
  const hit = tool && hover && !paint ? host.press(hover, tool, tool === 'pattern' ? host.patternName() : undefined, camera.scale) : null
  const shown = paint ? { edge: paint.edge, slots: paint.slots, on: paint.on } : hit && !hit.refused ? hit : null
  const off = shown && !shown.on
  // a bay press changes every module of a bay, each under a pixel at the default zoom: one outline over the whole bay (its hull) says so, 3 px across whatever the zoom
  const bayOutline =
    tool && !paint && hit && !hit.refused && hit.bay && hit.slots.length > 0
      ? path(convexHull((hit.span ? [hit.span[0], hit.span[1]] : [Math.min(...hit.slots), Math.max(...hit.slots)]).flatMap((k) => host.band(hit.edge, k))))
      : null
  // the elements slid: the modules they would go to, when the engine would make it
  const sliding = slide?.moved && slide.by !== 0 ? actions.editEdge(project, host.ref, { op: 'slide', ids: slide.ids, by: slide.by }) : null
  const slidable = sliding !== null && !sliding.reason && sliding.project !== project

  // the pill dragged: what it would do, as the engine says (the modules a count adds, in grey, or takes, in red; the width of each picked)
  const pilled = pill?.moved && pill.value !== pill.now ? actions.editEdge(project, host.ref, pillOp(pill, pill.value)) : null
  const pilledRead = pilled && !pilled.reason && pilled.project !== project && pill?.type === 'count' ? actions.edgeOf(pilled.project, host.ref) : null
  const ofRun = (r: typeof read, run: PillRun) => new Set((r?.elements ?? []).filter((x) => x.edge === run.edge.id && x.kind === run.kind && x.name === run.name).map((x) => x.slot))
  const counted = pill?.run && pilledRead ? { was: ofRun(read, pill.run), now: ofRun(pilledRead, pill.run), run: pill.run } : null
  const px = 1 / camera.scale
  const pillAt = (name: string, at: Point, text: string, title: string, now: number, range: [number, number], down: (e: ReactPointerEvent<Element>) => void) => {
    const w = (text.length * 6.5 + 10) * px
    const h = 16 * px
    return (
      <g key={name} data-edge-pill={name} role="slider" aria-label={title} aria-valuenow={now} aria-valuemin={range[0]} aria-valuemax={range[1]} aria-valuetext={text} onPointerDown={down} style={{ cursor: 'ew-resize', touchAction: 'none' }}>
        <title>{title}</title>
        <rect x={at.x - w / 2} y={-at.y - h / 2} width={w} height={h} rx={h / 2} fill="var(--panel)" stroke="var(--ink)" strokeWidth={1.25} vectorEffect="non-scaling-stroke" />
        <text x={at.x} y={-at.y} textAnchor="middle" dominantBaseline="central" fontSize={11 * px} fill="var(--ink)" pointerEvents="none" className="tabular-nums">
          {text}
        </text>
      </g>
    )
  }
  const pillsShown = !tool && !slide && pills ? pills : null
  const shownWidth = pill?.type === 'width' ? pill.value : (pillsShown?.width.now ?? 0)

  const layer = (
    <>
      <g data-modules-shown={tool ? (shown?.slots.length ?? 0) : 0} pointerEvents="none">
        {tool &&
          shown?.slots.map((k) => (
            <path key={`${shown.edge}:${k}`} d={path(host.band(shown.edge, k))} fill={off ? 'var(--status-over)' : 'var(--ink)'} fillOpacity={0.35} stroke={off ? 'var(--status-over)' : 'var(--ink)'} vectorEffect="non-scaling-stroke" />
          ))}
        {bayOutline && <path data-bay-preview d={bayOutline} fill="none" stroke={off ? 'var(--status-over)' : 'var(--ink)'} strokeWidth={3} vectorEffect="non-scaling-stroke" />}
      </g>
      {counted && (
        <g data-count-preview pointerEvents="none">
          {[...counted.now].filter((k) => !counted.was.has(k)).map((k) => <path key={`+${k}`} d={path(host.band(counted.run.edge.id, k))} fill="var(--ink)" fillOpacity={0.3} stroke="var(--ink)" strokeDasharray="7 4" vectorEffect="non-scaling-stroke" />)}
          {[...counted.was].filter((k) => !counted.now.has(k)).map((k) => <path key={`-${k}`} d={path(host.band(counted.run.edge.id, k))} fill="var(--status-over)" fillOpacity={0.35} stroke="var(--status-over)" vectorEffect="non-scaling-stroke" />)}
        </g>
      )}
      {pill?.type === 'width' && pill.moved && pilled && !pilled.reason && pilled.project !== project && read && (
        <g data-width-preview pointerEvents="none">
          {pill.ids.map((id) => {
            const el = read.elements.find((x) => x.id === id)
            const e = el && read.edges.find((x) => x.id === el.edge)
            if (!el || !e) return null
            const c = slotMid(e, el.slot) ?? 0
            // the module's band narrowed (or widened) about its middle to the width asked
            const band = host.band(el.edge, el.slot).map((q) => {
              const a = alongEdge(e, q)
              const to = c + (a >= c ? pill.value : -pill.value) / 2
              return { x: q.x + e.dir.x * (to - a), y: q.y + e.dir.y * (to - a) }
            })
            return <path key={id} d={path(band)} fill="var(--ink)" fillOpacity={0.3} stroke="var(--ink)" strokeDasharray="7 4" vectorEffect="non-scaling-stroke" />
          })}
        </g>
      )}
      {pillsShown && (
        <g data-edge-pills>
          {pillsShown.count && (
            <>
              {pillAt('count-start', onEdgeAt(pillsShown.count.edge, (pillsShown.count.edge.slots.find((x) => x.k === pillsShown.count!.lo)?.from ?? 0) - 12 * px, 14 * px), `◂ ${pill?.type === 'count' && pill.end === 'start' ? pill.value : pillsShown.count.held}`, `Drag along the wall to add ${pillsShown.count.kind}s before this run or take them away; type the count`, pill?.type === 'count' && pill.end === 'start' ? pill.value : pillsShown.count.held, [0, pillsShown.count.edge.slots.length], (e) => startPill(e, 'count', 'start'))}
              {pillAt('count-end', onEdgeAt(pillsShown.count.edge, (pillsShown.count.edge.slots.find((x) => x.k === pillsShown.count!.hi)?.to ?? 0) + 12 * px, 14 * px), `${pill?.type === 'count' && pill.end === 'end' ? pill.value : pillsShown.count.held} ▸`, `Drag along the wall to add ${pillsShown.count.kind}s after this run or take them away; type the count`, pill?.type === 'count' && pill.end === 'end' ? pill.value : pillsShown.count.held, [0, pillsShown.count.edge.slots.length], (e) => startPill(e, 'count', 'end'))}
            </>
          )}
          {pillAt('width', onEdgeAt(pillsShown.width.edge, (slotMid(pillsShown.width.edge, pillsShown.width.slot) ?? 0) + shownWidth / 2, 34 * px), wText(shownWidth), 'Drag across to set the width of all picked; type the width', shownWidth, [WIDTH_MIN, WIDTH_MAX], (e) => startPill(e, 'width'))}
        </g>
      )}
      {slide && slidable && slide.moved && (
        <g data-slide-preview pointerEvents="none">
          {slide.ids.map((id) => {
            const el = read?.elements.find((x) => x.id === id)
            return el ? <path key={id} d={path(host.band(el.edge, el.slot + slide.by))} fill="var(--ink)" fillOpacity={0.3} stroke="var(--ink)" strokeDasharray="7 4" vectorEffect="non-scaling-stroke" /> : null
          })}
        </g>
      )}
    </>
  )
  if (!capture) return layer
  return (
    <g data-tool="block-site" data-block-tool={tool ?? ''}>
      {/* a cancelled pointer (touch) drops the paint, so its next release commits nothing */}
      <Capture
        camera={camera}
        onPointerDown={(e) => {
          if (e.button !== 0) return
          e.stopPropagation()
          press(e)
        }}
        onPointerLeave={() => setHover(null)}
      />
      {layer}
    </g>
  )
}
