// What the drawing tools share (port of Plaza-Practiko `vistas/planta/edicion/comunes.tsx` and `useTeclasDibujo.ts`):
// the capture surface, a label on a halo, the snap of a tool's point, and the keys of a tool that places points.
// Coordinates: the plan's world (metres, y up), drawn in the SVG as (x, −y).
import { useEffect, useMemo, useRef, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import type { Point } from '../../../model/schema.ts'
import { useApp } from '../../../state/store.ts'
import { chordOf } from '../../commands/keys.ts'
import { keysOf } from '../../commands/shortcuts.ts'
import { GRID_STEP, planStep } from '../snap/grid.ts'
import { targetsOf, tolerances, type Targets } from '../snap/move.ts'
import { resolveSnap, type Resolved } from '../snap/resolve.ts'
import { useSnapSettings } from '../snap/settings.ts'
import { roadSources, sourcesFor } from '../snap/sources.ts'
import { useSnapSource } from '../snap/SnapSourceContext.tsx'
import { otherLevels } from '../../buildingView.ts'
import { useLayerView } from '../../layers/layerView.ts'
import { referenceLevels, useReference } from '../reference.ts'

/** The tool's camera: screen px per metre, the view box, and the world point under a pointer event. */
export interface ToolCamera {
  scale: number
  viewBox: string | undefined
  toWorld(ev: { clientX: number; clientY: number }): Point
}

/** A transparent rectangle over the whole view: while a tool is active it takes the presses (not the masses). */
export function Capture({
  camera,
  children,
  ...handlers
}: {
  camera: ToolCamera
  children?: ReactNode
  onPointerDown?(e: ReactPointerEvent<SVGRectElement>): void
  onPointerMove?(e: ReactPointerEvent<SVGRectElement>): void
  onPointerUp?(e: ReactPointerEvent<SVGRectElement>): void
  onPointerCancel?(e: ReactPointerEvent<SVGRectElement>): void
  onPointerLeave?(e: ReactPointerEvent<SVGRectElement>): void
  onDoubleClick?(e: ReactMouseEvent<SVGRectElement>): void
}) {
  const [x, y, w, h] = (camera.viewBox ?? '-1e5 -1e5 2e5 2e5').split(' ').map(Number)
  return (
    <>
      <rect data-capture="" x={x} y={y} width={w} height={h} fill="transparent" style={{ cursor: 'crosshair', touchAction: 'none' }} {...handlers} />
      {children}
    </>
  )
}

/** A label on a white halo at world point q, `dy` screen px below it (negative: above). */
export function Label({ q, text, px, dy = 0 }: { q: Point; text: string; px: number; dy?: number }) {
  return (
    <text
      x={q.x}
      y={-q.y + dy * px}
      textAnchor="middle"
      dominantBaseline="middle"
      fontSize={12 * px}
      fill="var(--ink)"
      stroke="var(--panel)"
      strokeWidth={4 * px}
      paintOrder="stroke"
      pointerEvents="none"
    >
      {text}
    </text>
  )
}

/** A small cross at the cursor (world point q). */
export function Crosshair({ q, px }: { q: Point; px: number }) {
  const s = 6 * px
  return <path d={`M${q.x - s} ${-q.y}H${q.x + s}M${q.x} ${-q.y - s}V${-q.y + s}`} stroke="var(--ink)" strokeWidth={1} vectorEffect="non-scaling-stroke" pointerEvents="none" />
}

/**
 * The snap of a tool's point: what attracts is the masses of the active level, of the reference and of the option's
 * other buildings (as the plan shows them), the site and the setback line, and with `roads` the roads and the gates
 * (Decision "Road snap") (built once per project, level and reference). Its grid is the structural grid's modules while
 * the option stands on one (Phase G.2b), but for the roads, which keep whole metres. A plan that provides its own
 * source (SnapSourceContext, the block editor's: BE.10) gives what attracts and its grid instead.
 * `base` is the previous point (perpendicular and ortho start from it). Shift = free. `frozen`: what attracts instead,
 * built by the tool (Move and Copy: the plan as their target step started, without what they move).
 */
export function useToolSnap(scale: number, roads = false, frozen: Targets | null = null) {
  const project = useApp((s) => s.project)
  const option = useApp((s) => s.option)
  const source = useSnapSource()
  const own = useSnapTargets(roads)
  const targets = frozen ?? own
  return (q: Point, e: { shiftKey: boolean }, base: Point | null = null): Resolved => {
    if (e.shiftKey) return { point: q, how: 'free', mark: null }
    const tol = tolerances(scale)
    const settings = useSnapSettings.getState().settings
    // a source's grid is its own (nodes that need not be evenly spaced): where nothing else attracts
    const step = source ? 0 : roads ? GRID_STEP : planStep(project, option)
    const r = resolveSnap(q, { targets, settings, tolPoint: tol.point, tolLine: tol.line, step, base, orthoFrom: base })
    if (!source?.grid || !settings.grid) return r
    if (r.how === 'free') {
      const node = source.grid(q, tol.point)
      return node ? { point: node, how: 'grid', mark: null } : r
    }
    if (r.how === 'ortho' && base) {
      // along the ortho line: its foot on the nearest module line across it
      const node = source.grid(r.point, tol.point)
      if (!node) return r
      const along = Math.abs(r.point.y - base.y) <= Math.abs(r.point.x - base.x)
      return { ...r, point: along ? { x: node.x, y: r.point.y } : { x: r.point.x, y: node.y } }
    }
    return r
  }
}

/** What attracts a tool's point or shape (`useToolSnap`'s, built once per project, level and reference; or the
 *  source's, once per source). */
export function useSnapTargets(roads = false): Targets {
  const source = useSnapSource()
  const project = useApp((s) => s.project)
  const derived = useApp((s) => s.derived)
  const level = useApp((s) => s.level)
  const option = useApp((s) => s.option)
  const hidden = useLayerView((s) => s.hidden)
  const refOn = useReference((s) => s.on)
  const reach = useReference((s) => s.reach)
  const to = useSnapSettings((s) => s.settings.to)
  const own = useMemo(() => source?.targets() ?? null, [source])
  const site = useMemo(
    () =>
      source
        ? null
        : targetsOf([
            ...sourcesFor(project, derived, null, {
              level,
              reference: referenceLevels(project, level, { on: refOn, reach }).map((r) => r.id),
              others: otherLevels(project, level, option, hidden),
              drawn: { to, hidden },
            }),
            ...(roads ? roadSources(derived) : []),
          ]),
    [source, project, derived, level, refOn, reach, option, hidden, roads, to],
  )
  return (own ?? site)!
}

/** Is the user typing in a field (the command line, a panel's input)? Then a key is the field's. */
export function typingIn(target: EventTarget | null): boolean {
  const t = target as HTMLElement | null
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA' || t.isContentEditable)
}

export interface DrawingKeys {
  /** Enter: finishes the stroke; false when there is nothing to finish (the key goes on to the app). */
  enter(): boolean
  /** Escape: cancels the stroke (or leaves the tool). */
  escape(): void
  /** The keys of Delete (Delete and Backspace by default): removes the last point. */
  back(): void
  /** The keys of Undo (Ctrl+Z by default): removes the last point; false without a stroke (the key goes on to the app: it undoes the project). */
  undo?(): boolean
  /** Tab: the tool's own (the Street tool's side, Decision "Street side when drawing"); `back` with Shift. Without
   *  it, Tab goes on to the page. */
  tab?(back: boolean): void
  /** Space tapped: the tool's own (the Street tool's side, before the first point too); `back` with Shift. It answers when
   *  the key comes up, and not when the pointer was pressed while it was held: Space held with a drag pans the plan (the key
   *  is not stopped). Not while typing in a field; the keydown and its keyup are refused, so a focused button is not
   *  pressed. Without it, Space is the page's. */
  space?(back: boolean): void
}

/**
 * The keys of a tool that places points, heard in the capture phase so they do not reach the app's shortcuts: Delete
 * and Backspace remove the last point (never the selected mass), Escape is the tool's, Ctrl+Z undoes its last point;
 * Space and Tab are the tool's own where it takes them (the Street's side). Delete and Undo are the commands' keys as they are now (`commands/shortcuts.ts`), so a key the user gave them acts the same.
 * While a modal window is open the keys are the window's, unless the topmost one holds the plan the tool is on (one
 * that lends its own source with its element, SnapSourceContext: the block editor's, inside the Program window), so
 * it is that window's tool; another window stacked over it (a prompt) takes them.
 */
export function useDrawingKeys({ enter, escape, back, undo, tab, space }: DrawingKeys): void {
  const root = useSnapSource()?.root
  // a Space keydown the tool took, until its keyup: with Shift or not, and whether the pointer was pressed meanwhile (the
  // plan pans with Space held and a drag: that is no turn). Its keyup is refused too: a browser clicks a focused button on it
  const heldSpace = useRef<{ back: boolean; panned: boolean } | null>(null)
  useEffect(() => {
    const isSpace = (e: KeyboardEvent) => e.key === ' ' || e.code === 'Space'
    const onKey = (e: KeyboardEvent) => {
      if (typingIn(e.target) || behindModal(root?.() ?? null)) return
      if (space && isSpace(e) && !(e.ctrlKey || e.metaKey || e.altKey)) {
        if (!e.repeat) heldSpace.current = { back: e.shiftKey, panned: false }
        e.preventDefault()
        return
      }
      const chord = chordOf(e)
      const has = (id: string) => !!chord && keysOf(id).includes(chord)
      const mod = e.ctrlKey || e.metaKey
      const key = e.key.toLowerCase()
      if (has('edit.undo')) {
        if (undo?.()) {
          e.preventDefault()
          e.stopPropagation()
        }
        return
      }
      if (has('edit.delete')) back()
      else if (mod || e.altKey) return
      else if (key === 'enter') {
        if (!enter()) return
      } else if (key === 'escape') escape()
      else if (key === 'tab' && tab) tab(e.shiftKey)
      else return
      e.preventDefault()
      e.stopPropagation()
    }
    const onUp = (e: KeyboardEvent) => {
      const held = heldSpace.current
      if (!held || !isSpace(e)) return
      heldSpace.current = null
      e.preventDefault()
      // a tap turns the side; held while the plan was dragged, it panned
      if (!held.panned) space?.(held.back)
    }
    const onPress = () => {
      if (heldSpace.current) heldSpace.current.panned = true
    }
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('keyup', onUp, true)
    window.addEventListener('pointerdown', onPress, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('keyup', onUp, true)
      window.removeEventListener('pointerdown', onPress, true)
    }
  }, [enter, escape, back, undo, tab, space, root])
}

/** Whether a menu is open (the menu bar's, a right-click menu, a ⋯): its keys (Enter on a row, Escape) are its own. */
export const menuOpen = (): boolean => document.querySelector('[role="menu"]') !== null

/** Whether a modal window is open that does not hold `plan` (null: the site's plan, which none holds): the topmost, the
 *  last in the page (a window opened over another comes after it); an open menu is a modal too: it has the keys. */
export function behindModal(plan: Element | null): boolean {
  if (menuOpen()) return true
  const modals = document.querySelectorAll('[role="dialog"][aria-modal="true"]')
  const top = modals[modals.length - 1]
  return !!top && !(plan && top.contains(plan))
}
