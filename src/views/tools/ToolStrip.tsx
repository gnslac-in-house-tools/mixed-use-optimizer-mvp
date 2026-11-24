// The Tools strip (Project C, AS.2; spec "The Tools strip"): every command that carries `tool`, by group, as an icon button. It
// defines nothing: a button reads its command (label, key, `enabled()`, `checked()`, `tool.hint`) and runs it
// (`runCommand`), as the top bar's Undo and Redo do; a tool added to the registry stands here by its group (tools/strip.ts).
//   title      the hint with the command's key (`titleWith`), or, while the command cannot run, the reason, and the button
//              is disabled: the same sentence its menu row and its key say
//   pressed    the tool is in hand (`checked()`); Union, Connect and Group do something once (`once`): no `aria-pressed`
//   anchor     `data-tour="tool-<id without 'tool.'>"` (Group: tool-group), the tours' anchors
// It renders again when what the commands read changes: the hand, the view, Compare, the site's boundary, what is picked, the
// placed block picked, the project's typology and a key the user gave.
// A group with options (tools/GroupOptions.tsx: Massing, Streets) ends with one small ▾ that opens its panel beside it; one is open at a
// time (state here), and it closes when the strip lies down, stands up, moves to another dock, changes its columns or scrolls.
// Upright it is one column `--tool-strip-w` wide; short of height it goes to two columns (the one-column height is
// remembered, so it goes back when that fits again), and still short it scrolls. `flat` (below 880 px, or docked above or
// below the viewport): one row that scrolls sideways.
// Where it stands is the layout's `stripDock`, above the viewport by default (App.tsx and viewport/DockArea.tsx place it; below 880 px it lies flat under the
// viewport whatever the dock). It moves three ways, as a bar does (viewport/DockedBar.tsx):
//   its grip         the first item, on a wide screen: dragged past a few pixels, `useStripDrag` says where it would land (`dockAt`,
//                    tools/stripDock.ts) and the frame draws a line there; with the focus on it ← → walk left · panel · right,
//                    ↑ goes above the viewport and ↓ below it (the grip where the strip lands takes the focus); only the pointer
//                    that pressed it drags, and a lost capture cancels
//   its right-click  the five places, the current one ticked, then *Hide the tools* (View › Panels › Tools brings it back): its own short list, shown by the app's
//                    one menu (`openEntries`, editing/menu/open.tsx); the strip is not a kind
//   the View menu    Bars › Tools strip ▸ (commands/view.ts)
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { create } from 'zustand'
import { useSiteBlockOf } from '../../modules/warehouse/views/siteBlockState.ts'
import { useApp } from '../../state/store.ts'
import { runCommand } from '../commands/index.ts'
import { titleWith, useShortcutsStore } from '../commands/shortcuts.ts'
import type { Command, ToolGroup } from '../commands/types.ts'
import { useCompare } from '../compare/compareView.ts'
import { IconButton } from '../controls/BarButtons.tsx'
import { Icon } from '../controls/Icon.tsx'
import { openEntries } from '../editing/menu/open.tsx'
import { useWide } from '../layout/media.ts'
import { STRIP_DOCKS, useUi, type StripDock } from '../layout/ui.ts'
import { usePickedAny } from '../plan/mix.ts'
import { GROUP_OPTIONS, GroupOptions } from './GroupOptions.tsx'
import { useHand } from './hand.ts'
import { stripGroups } from './strip.ts'
import { dockAt, stepDock } from './stripDock.ts'
import { beginDrag } from '../controls/beginDrag.ts'

/** The strip being dragged by its grip, and where it would land (null: not dragging). */
export const useStripDrag = create<{ to: StripDock | null }>()(() => ({ to: null }))

/** How far the pointer moves before a press on the grip becomes a drag. */
const DRAG_PX = 4
const ARROWS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'] as const
type Arrow = (typeof ARROWS)[number]
const isArrow = (key: string): key is Arrow => (ARROWS as readonly string[]).includes(key)

/** One or two columns for the upright strip: two while its content is taller than its room (measured as `useOverflow` does for
 *  width, here for height), back to one once the one-column height fits again. */
function useColumns(on: boolean): [React.RefObject<HTMLDivElement | null>, 1 | 2] {
  const ref = useRef<HTMLDivElement | null>(null)
  const [cols, setCols] = useState<1 | 2>(1)
  const full = useRef(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!on || !el || typeof ResizeObserver === 'undefined') return
    const check = () => {
      if (cols === 1 && el.scrollHeight > el.clientHeight + 1) {
        full.current = el.scrollHeight
        setCols(2)
      } else if (cols === 2 && el.clientHeight >= full.current) setCols(1)
    }
    check()
    const ro = new ResizeObserver(check)
    ro.observe(el)
    return () => ro.disconnect()
  })
  return [ref, on ? cols : 1]
}

const labelOf = (c: Command): string => (typeof c.label === 'function' ? c.label() : c.label)

/** A tool's button: its command's label, key and state. */
function StripButton({ c }: { c: Command }) {
  const tool = c.tool!
  const why = c.enabled?.() ?? true
  return (
    <IconButton
      icon={tool.icon}
      label={labelOf(c)}
      title={why === true ? titleWith(tool.hint, c.id) : why}
      pressed={tool.once ? undefined : (c.checked?.() ?? false)}
      disabled={why !== true}
      tour={c.id === 'edit.group' ? 'tool-group' : c.id.replace(/^tool\./, 'tool-')}
      onClick={() => runCommand(c.id)}
    />
  )
}

/** Set by the grip's arrow keys just before the strip moves: the strip is drawn again in its new place (another parent, or its
 *  node moved) and the grip that stands there takes the focus, so the next arrow key still reaches it. */
let focusGrip = false

/** The strip's handle, its first item: drag it past a few pixels (a line shows where it lands), or the arrow keys on it. */
function Grip({ flat }: { flat: boolean }) {
  const dock = useUi((s) => s.stripDock)
  const setStripDock = useUi((s) => s.setStripDock)
  const [from, setFrom] = useState<{ x: number; y: number } | null>(null)
  // the pointer that started the drag: another pointer's moves and releases are not this drag's
  const pointer = useRef<number | null>(null)
  const ref = useRef<HTMLButtonElement>(null)
  // a grip that goes while dragging (the strip hidden) leaves no line behind
  useEffect(() => () => useStripDrag.setState({ to: null }), [])
  // mounted or moved by a key: it takes the focus the key had
  useLayoutEffect(() => {
    if (!focusGrip) return
    focusGrip = false
    ref.current?.focus()
  }, [dock])
  const endDrag = () => {
    pointer.current = null
    setFrom(null)
    useStripDrag.setState({ to: null })
  }
  return (
    <button
      ref={ref}
      type="button"
      aria-label="Move the tools"
      title="Drag to the window's left, beside the panel, to the viewport's right, above or below it (or the arrow keys)"
      className={`pressable grid shrink-0 cursor-grab touch-none place-items-center rounded-control text-ink-tertiary hover:bg-hover hover:text-ink active:cursor-grabbing ${flat ? '-mr-1.5 h-6 w-4' : 'mx-auto h-4 w-[2rem]'}`}
      onKeyDown={(e) => {
        if (!isArrow(e.key)) return
        e.preventDefault()
        const to = stepDock(dock, e.key)
        if (to === dock) return
        focusGrip = true
        setStripDock(to)
        // nothing drew a grip (the window changed under it): the next one that mounts does not take the focus
        setTimeout(() => (focusGrip = false), 0)
      }}
      onPointerDown={(e) => {
        if (e.button !== 0) return
        beginDrag(e)
        pointer.current = e.pointerId
        setFrom({ x: e.clientX, y: e.clientY })
      }}
      onPointerMove={(e) => {
        if (e.pointerId !== pointer.current || !from || Math.hypot(e.clientX - from.x, e.clientY - from.y) < DRAG_PX) return
        const main = e.currentTarget.closest('main')
        const viewport = main?.querySelector('[data-dock-area]')
        if (!main || !viewport) return
        useStripDrag.setState({ to: dockAt({ x: e.clientX, y: e.clientY }, { main: main.getBoundingClientRect(), viewport: viewport.getBoundingClientRect() }) })
      }}
      onPointerUp={(e) => {
        if (e.pointerId !== pointer.current) return
        const { to } = useStripDrag.getState()
        if (to) setStripDock(to)
        endDrag()
      }}
      onPointerCancel={(e) => {
        if (e.pointerId === pointer.current) endDrag()
      }}
      // the capture lost (the element went, the browser took the pointer): the drag is over, as if cancelled
      onLostPointerCapture={endDrag}
    >
      <Icon name="grip" className={`h-4 w-4 ${flat ? '' : 'rotate-90'}`} />
    </button>
  )
}

export function ToolStrip({ flat }: { flat: boolean }) {
  // what the commands read: each of these renders the strip again when it changes
  useHand((s) => s.tool)
  useUi((s) => s.view)
  useCompare((s) => s.open)
  useApp((s) => s.derived.site.polygon !== null)
  useApp((s) => s.project.typology)
  usePickedAny()
  useSiteBlockOf()
  useShortcutsStore((s) => s.user)
  const wide = useWide()
  const dock = useUi((s) => s.stripDock)
  const setStripDock = useUi((s) => s.setStripDock)
  const setShow = useUi((s) => s.setShow)
  const dragging = useStripDrag((s) => s.to !== null)
  const [ref, cols] = useColumns(!flat)
  const groups = stripGroups()
  // the group whose ▾ is open, in which layout, dock and column count: the strip lying down, standing up, moving or changing its
  // columns closes it (the panel is placed beside its ▾ once, so a ▾ that moved would leave it behind), and so does a scroll
  const [opened, setOpened] = useState<{ key: ToolGroup; flat: boolean; dock: StripDock; cols: 1 | 2 } | null>(null)
  const open = opened && opened.flat === flat && opened.dock === dock && opened.cols === cols ? opened.key : null
  // closed for good: the strip coming back to where it was does not open it again
  useEffect(() => {
    if (opened && !open) setOpened(null)
  }, [opened, open])

  return (
    <div
      ref={ref}
      role="toolbar"
      aria-label="Tools"
      aria-orientation={flat ? 'horizontal' : 'vertical'}
      data-tool-strip
      data-cols={flat ? undefined : cols}
      data-dock={wide ? dock : undefined}
      className={`${
        flat
          ? 'panel flex min-w-0 shrink-0 items-center gap-2 overflow-x-auto px-2 py-1'
          : `panel flex min-h-0 flex-col gap-1 overflow-y-auto py-1 ${cols === 2 ? 'w-[calc(var(--tool-strip-w)*2)]' : 'w-tool-strip'}`
      } ${dragging ? 'opacity-60' : ''}`}
      onScroll={() => open && setOpened(null)}
      onContextMenu={(e) => {
        // not what stands in a ▾'s panel (a portal: its events bubble here through React), nor a field; the open menu's own stay in it
        if (e.defaultPrevented || !e.currentTarget.contains(e.target as Node) || (e.target as HTMLElement).closest('input, textarea')) return
        e.preventDefault()
        // the strip's own short list, not of a kind: the app's one menu shows it (editing/menu/open.tsx)
        openEntries(e, 'Tools strip', [
          // below 880 px the strip lies flat under the viewport whatever the dock: there is nowhere to move it to
          ...(wide ? [...STRIP_DOCKS.map((d) => ({ key: d.key, label: d.label, checked: dock === d.key, onSelect: () => setStripDock(d.key) })), 'separator' as const] : []),
          { key: 'hide', label: 'Hide the tools', title: 'View › Panels › Tools brings it back', onSelect: () => setShow('tools', false) },
        ])
      }}
    >
      {wide && <Grip flat={flat} />}
      {groups.map((g, i) => (
        <div key={g.key} className={flat ? 'flex shrink-0 items-center gap-2' : 'flex flex-col gap-1'}>
          {i > 0 && <span aria-hidden data-separator="" className={flat ? 'h-5 w-px shrink-0 bg-separator' : 'mx-2 h-px shrink-0 bg-separator'} />}
          <div role="group" aria-label={g.label} className={flat ? 'flex shrink-0 items-center' : `grid justify-items-center ${cols === 2 ? 'grid-cols-2' : 'grid-cols-1'}`}>
            {g.commands.map((c) => (
              <StripButton key={c.id} c={c} />
            ))}
          </div>
          {GROUP_OPTIONS[g.key] && (
            <GroupOptions
              group={g.key}
              name={g.label}
              open={open === g.key}
              flat={flat}
              onToggle={() => setOpened((cur) => (cur && cur.key === g.key && open === g.key ? null : { key: g.key, flat, dock, cols }))}
            />
          )}
        </div>
      ))}
    </div>
  )
}
