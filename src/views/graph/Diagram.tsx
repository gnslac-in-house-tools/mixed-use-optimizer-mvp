// The Rules step's diagram (Decisions "Graph mode, abstract" and "Steps"): no rectangles, no site; a bubble per
// program (its size: the brief's target area, or what it has; "n of N placed" under its name, its ring dashed while
// the brief still asks for masses of it) and a line per rule, coloured by how its masses stand (green: all of them
// meet it; red: some do not; grey: no masses to apply it to yet). With *Draw rule*, a drag from one bubble to another
// adds a rule of the chosen kind (it lands in the list under the diagram too). A bubble drags to where it reads best
// (the diagram's place, never a mass's); Alt+dragged, it stays and a copy of its program lands there (Decision
// "Alt+drag copies"); a double-click on empty space lets them all go. A click on a line picks its
// rule (its row is marked, Properties edits it); a click on empty space lets go. The masses' own relations are drawn
// over the geometry, in Massing's graph (Decision "Graph in Massing").
// It is laid out in the room it has, in screen pixels (diagram.ts), so its names keep their size and never pile up;
// what does not fit is shown whole, smaller. Lines are drawn as the bar says (curved, straight, orthogonal) and by
// kind as the legend says; each label finds a free place along its line.
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { Id, Point, Rule } from '../../model/schema.ts'
import { actions } from '../../state/actions/index.ts'
import { useApp } from '../../state/store.ts'
import { bends, bubbleBox, edgePath, labelSpot, layoutDiagram, LINE_LOOK, NAME_H, type Box, type DiagramEdge, type DiagramNode } from './diagram.ts'
import { copyProgram } from '../panels/programCommands.ts'
import { useGraph } from './graphState.ts'
import { beginDrag } from '../controls/beginDrag.ts'
import { t as tr } from '../../i18n/idioma.ts' // mixed-use-mvp

const STATUS = { met: 'var(--status-within)', broken: 'var(--status-over)', none: 'var(--ink-tertiary)' }
const LEGEND_H = 44 // px: the legend's strip, and its gap

/** A bubble's radius for an area (m²): wide enough to read, never a field. */
const radiusOf = (area: number, min: number, max: number) => Math.max(min, Math.min(max, Math.sqrt(Math.max(area, 0)) * 0.3))

/** About how wide a text is, px (the diagram's fonts: 12 px names, 10 px under them, 11 px labels). */
const textWidth = (text: string, size: number) => text.length * size * 0.56

/** What a rule's line says: its kind and its measure. */
export function ruleShort(r: Pick<Rule, 'kind'> & Partial<{ max: number; min: number; minShared: number }>): string {
  if (r.kind === 'near') return `≤ ${r.max} m`
  if (r.kind === 'apart') return `≥ ${r.min} m`
  if (r.kind === 'adjacent') return r.minShared ? `adjacent ${r.minShared} m` : 'adjacent'
  return 'moves with'
}

interface Bubble extends DiagramNode {
  name: string
  sub: string
  color: string
  /** The brief still asks for masses of it: its ring is dashed. */
  missing: boolean
}

interface Line extends DiagramEdge {
  id: string
  color: string
  label: string
}

/** A bubble per program, a line per rule. */
function useGraphData(): { bubbles: Bubble[]; lines: Line[] } {
  const project = useApp((s) => s.project)
  const derived = useApp((s) => s.derived)
  return useMemo(() => {
    const n = project.programs.length
    const bubbles: Bubble[] = project.programs.map((g, i) => {
      const area = g.target?.area ?? derived.metrics.areaByProgram[g.id] ?? 0
      const count = derived.metrics.massesByProgram[g.id] ?? 0
      const want = g.target?.count
      const angle = (i / Math.max(n, 1)) * Math.PI * 2 - Math.PI / 2
      const sub = want ? `${count} of ${want} placed` : count === 1 ? '1 mass' : `${count} masses`
      return {
        id: g.id,
        r: radiusOf(area, 16, 44),
        seed: { x: Math.round(Math.cos(angle) * 240), y: Math.round(Math.sin(angle) * 240) },
        label: Math.max(textWidth(g.name, 12), textWidth(sub, 10)),
        name: g.name,
        sub,
        color: g.color,
        missing: want !== undefined && want !== null && count < want,
      }
    })
    const lines: Line[] = (project.rules ?? []).map((r) => {
      const own = derived.relations.filter((x) => x.rule === r.id)
      const broken = own.filter((x) => !x.met).length
      const status = own.length === 0 ? STATUS.none : broken ? STATUS.broken : STATUS.met
      return { id: r.id, a: r.a, b: r.b, kind: r.kind, color: status, label: `${ruleShort(r)}${own.length ? ` · ${own.length - broken}/${own.length}` : ''}` }
    })
    return { bubbles, lines }
  }, [project, derived])
}

export function Diagram() {
  const tool = useGraph((s) => s.tool)
  const kind = useGraph((s) => s.kind)
  const lineStyle = useGraph((s) => s.lines)
  const picked = useGraph((s) => s.rule)
  const pinned = useGraph((s) => s.pinned)
  const { bubbles, lines } = useGraphData()
  const svgRef = useRef<SVGSVGElement>(null)
  const [size, setSize] = useState({ w: 800, h: 480 })
  // the room, in steps of 20 px: a divider's drag does not lay it out again at every pixel
  const room = useMemo(() => ({ w: Math.max(240, Math.round(size.w / 20) * 20), h: Math.max(160, Math.round(size.h / 20) * 20) }), [size.w, size.h])
  // the bubbles keep above the legend, a low strip along the bottom
  const positions = useMemo(() => layoutDiagram(bubbles, lines, pinned, { w: room.w, h: room.h - LEGEND_H }), [bubbles, lines, pinned, room])
  const [from, setFrom] = useState<string | null>(null)
  const [pointer, setPointer] = useState<Point | null>(null)
  const drag = useRef<{ id: string; x: number; y: number; at: Point; moved: boolean; copy: boolean; to: Point } | null>(null)
  // an Alt+drag: where the copy would land, drawn as a dashed bubble
  const [ghost, setGhost] = useState<{ id: string; at: Point } | null>(null)

  useEffect(() => {
    const el = svgRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth || 800, h: el.clientHeight || 480 }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // the view box: the room (one unit, one pixel), or, when the bubbles overflow it, all of them, smaller
  const box = useMemo(() => {
    let x0 = 0
    let y0 = 0
    let x1 = room.w
    let y1 = room.h
    for (const b of bubbles) {
      const q = bubbleBox(b, positions.get(b.id)!, 0)
      x0 = Math.min(x0, q.x0 - 12)
      y0 = Math.min(y0, q.y0 - 12)
      x1 = Math.max(x1, q.x1 + 12)
      y1 = Math.max(y1, q.y1 + 12)
    }
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
  }, [bubbles, positions, room])
  // diagram units per screen pixel: 1 while it fits (everything is drawn in pixels); more, and it all shows smaller
  const scale = Math.max(box.w / Math.max(size.w, 1), box.h / Math.max(size.h, 1))

  /** The diagram point under a pointer. */
  const toDiagram = (e: { clientX: number; clientY: number }): Point | null => {
    const svg = svgRef.current
    const ctm = svg?.getScreenCTM?.()
    if (!svg || !ctm) return null
    const q = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse())
    return { x: q.x, y: q.y }
  }

  // drawing a rule: a line to the pointer; a release away from a bubble lets it go
  useEffect(() => {
    if (from === null) return
    const move = (e: PointerEvent) => setPointer(toDiagram(e))
    const up = (e: PointerEvent) => {
      if (!(e.target instanceof Element && e.target.closest('[data-bubble]'))) {
        setFrom(null)
        setPointer(null)
      }
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
  }, [from])

  const drawRule = (a: string, b: string) => {
    setFrom(null)
    setPointer(null)
    let made: Id | null = null
    useApp.getState().apply((p) => {
      const r = actions.addRule(p, { kind, a, b })
      made = r?.id ?? null
      return r?.project ?? p
    })
    if (made) useGraph.getState().selectRule(made)
  }

  const drawing = tool === 'rule'
  const bubbleHandlers = (b: Bubble) => ({
    onPointerDown: (e: ReactPointerEvent<SVGGElement>) => {
      if (e.button !== 0) return
      e.stopPropagation()
      if (drawing) {
        if (from !== null && from !== b.id) drawRule(from, b.id)
        else setFrom(b.id)
        return
      }
      beginDrag(e)
      const at = positions.get(b.id)!
      drag.current = { id: b.id, x: e.clientX, y: e.clientY, at, moved: false, copy: e.altKey, to: at }
    },
    onPointerMove: (e: ReactPointerEvent<SVGGElement>) => {
      const d = drag.current
      if (!d || d.id !== b.id) return
      const dx = e.clientX - d.x
      const dy = e.clientY - d.y
      if (!d.moved && Math.hypot(dx, dy) < 4) return
      d.moved = true
      d.to = { x: d.at.x + dx * scale, y: d.at.y + dy * scale }
      if (d.copy) setGhost({ id: b.id, at: d.to })
      else useGraph.getState().pin(b.id, d.to)
    },
    onPointerUp: () => {
      if (drawing) {
        if (from !== null && from !== b.id) drawRule(from, b.id)
        return
      }
      const d = drag.current
      drag.current = null
      setGhost(null)
      if (!d?.copy || !d.moved) return
      const made = copyProgram(d.id)
      if (made) useGraph.getState().pin(made, d.to)
    },
  })

  const bend = bends(lines)
  const start = from !== null ? positions.get(from) : undefined
  // the lines' paths, and their labels where they cover no bubble, no name and no label placed before
  const taken: Box[] = bubbles.map((b) => bubbleBox(b, positions.get(b.id)!, 0))
  const drawn = lines.map((l, i) => {
    const ra = bubbles.find((x) => x.id === l.a)!.r
    const rb = bubbles.find((x) => x.id === l.b)!.r
    const path = edgePath(positions.get(l.a)!, positions.get(l.b)!, ra, rb, lineStyle, bend[i])
    const w = textWidth(l.label, 11) + 8
    const h = 14
    const spot = labelSpot(path.at, w, h, taken)
    taken.push({ x0: spot.x - w / 2, y0: spot.y - h / 2, x1: spot.x + w / 2, y1: spot.y + h / 2 })
    return { d: path.d, spot }
  })

  return (
    <div className="relative h-full w-full">
      <svg
        ref={svgRef}
        role="img"
        aria-label="Graph of programs"
        viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`}
        className={`h-full w-full touch-none select-none ${ghost ? 'copying' : ''}`}
        onPointerDown={() => useGraph.getState().selectRule(null)}
        onDoubleClick={() => useGraph.getState().unpinAll()}
      >
        {lines.map((l, i) => {
          const { d, spot } = drawn[i]
          const look = LINE_LOOK[l.kind]
          const on = picked === l.id
          return (
            <g key={l.id} data-line={l.id} data-kind={l.kind} data-color={l.color}>
              {/* a light halo, so the line reads over another */}
              <path d={d} fill="none" stroke="var(--panel-sunken)" strokeWidth={look.width + 4} strokeLinecap="round" pointerEvents="none" />
              <path
                d={d}
                fill="none"
                stroke={l.color}
                strokeWidth={on ? look.width + 2 : look.width}
                strokeDasharray={look.dash}
                strokeLinecap="round"
                pointerEvents="none"
              />
              <path
                d={d}
                fill="none"
                stroke="transparent"
                strokeWidth={16}
                className="cursor-pointer"
                aria-label={l.label}
                onPointerDown={(e) => {
                  e.stopPropagation()
                  useGraph.getState().selectRule(l.id)
                }}
              />
              <text
                x={spot.x}
                y={spot.y}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={11}
                fill={l.color}
                stroke="var(--panel-sunken)"
                strokeWidth={4}
                paintOrder="stroke"
                pointerEvents="none"
              >
                {l.label}
              </text>
            </g>
          )
        })}

        {start && pointer && (
          <line x1={start.x} y1={start.y} x2={pointer.x} y2={pointer.y} stroke="var(--ink)" strokeWidth={2} strokeDasharray={'5 4'} pointerEvents="none" data-rubber="" />
        )}

        {ghost && (
          <circle
            data-ghost={ghost.id}
            cx={ghost.at.x}
            cy={ghost.at.y}
            r={bubbles.find((b) => b.id === ghost.id)?.r ?? 16}
            fill="none"
            stroke="var(--ink)"
            strokeWidth={1.5}
            strokeDasharray="5 4"
            pointerEvents="none"
          />
        )}

        {bubbles.map((b) => {
          const p = positions.get(b.id)!
          const r = b.r
          const on = from === b.id
          return (
            <g key={b.id} data-bubble={b.id} data-missing={b.missing || undefined} className={drawing ? 'cursor-crosshair' : 'cursor-grab'} {...bubbleHandlers(b)}>
              {b.missing && <title>{`${b.name}: ${b.sub}; ▶ Solve places the rest where their rules ask`}</title>}
              {/* a white ring round the program's colour (as MELI's rooms); dashed while the brief asks for more */}
              <circle
                cx={p.x}
                cy={p.y}
                r={r}
                fill="var(--panel)"
                stroke={on ? 'var(--ink)' : b.missing ? 'var(--ink-tertiary)' : 'var(--separator)'}
                strokeWidth={on ? 3 : 1.5}
                strokeDasharray={b.missing ? '5 4' : undefined}
              />
              <circle cx={p.x} cy={p.y} r={r * 0.72} fill={b.color} />
              <text x={p.x} y={p.y + r + 14} textAnchor="middle" fontSize={12} fill="var(--ink)" pointerEvents="none">
                {b.name}
              </text>
              <text x={p.x} y={p.y + r + NAME_H - 6} textAnchor="middle" fontSize={10} fill="var(--ink-secondary)" pointerEvents="none">
                {b.sub}
              </text>
            </g>
          )
        })}
      </svg>

      <Legend />
      {bubbles.length === 0 && (
        <p className="pointer-events-none absolute inset-x-0 top-1/2 text-center text-body text-ink-secondary">{tr("No programs yet: add them in the Brief.")}</p>
      )}
      {bubbles.length > 0 && lines.length === 0 && (
        <p className="pointer-events-none absolute inset-x-0 bottom-14 text-center text-body text-ink-secondary">
          {tr("No rules yet: pick Draw rule and drag from one program to another, or + Rule in the list below.")}
        </p>
      )}
    </div>
  )
}

/** The legend, one low strip: what each line looks like (its meaning in its tooltip), and what its colour says. */
export function Legend({ masses = false }: { masses?: boolean }) {
  return (
    <div
      aria-label="Legend"
      role="group"
      className="glass absolute bottom-3 left-3 flex max-w-[calc(100%-1.5rem)] flex-wrap items-center gap-x-3 gap-y-1 px-2.5 py-1.5 text-caption text-ink-glass"
    >
      {(Object.keys(LINE_LOOK) as (keyof typeof LINE_LOOK)[]).map((k) => (
        <span key={k} title={LINE_LOOK[k].label} className="flex items-center gap-1.5">
          <svg width="22" height="8" aria-hidden>
            <line x1="2" y1="4" x2="20" y2="4" stroke="var(--ink-secondary)" strokeWidth={Math.min(LINE_LOOK[k].width, 4)} strokeDasharray={LINE_LOOK[k].dash} strokeLinecap="round" />
          </svg>
          {LINE_LOOK[k].label.split(':')[0]}
        </span>
      ))}
      <span aria-hidden className="h-3 w-px bg-separator" />
      <Swatch color="var(--status-within)" text={masses ? 'met' : 'all meet it'} />
      <Swatch color="var(--status-over)" text={masses ? 'broken' : 'some do not'} />
      {!masses && <Swatch color="var(--ink-tertiary)" text="no masses yet" />}
    </div>
  )
}

function Swatch({ color, text }: { color: string; text: string }) {
  return (
    <span className="flex items-center gap-1">
      <span aria-hidden className="h-2 w-2 rounded-pill" style={{ background: color }} />
      {text}
    </span>
  )
}
