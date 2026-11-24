// One menu with sub-menus: the top menu bar's menus and the app's one right-click menu (`editing/menu/open.tsx`: the plan's, the 3D's, Layers',
// the Blocks tab's and the bars') draw it (Project C, part 1; the old right-click component went in Phase AS.4). A portal on the body (`fixed`, above the dialogs), rows 32 px, a tick for a checked row, the key at the right, ▸ for a
// sub-menu, a disabled row greyed with its reason as the title. The top menu goes at `at` and flips to the far side
// (`flip`: the coordinate its right / bottom edge takes) when it does not fit; a sub-menu opens beside its row (after a
// short delay on hover, at once on → / Enter / a click), to the left of the row when there is no room on the right, and
// never leaves the window. Each menu is as tall as the window at most and scrolls inside itself (its own scroll does
// not close it; a scroll or a resize of the window does). Keyboard: ↑ ↓ move (skipping the disabled rows, wrapping),
// Home / End, Enter / Space pick, → opens a sub-menu, ← or Escape closes the sub-menu you are in (the focus back on its
// row), Escape at the top closes the whole menu, and it is the menu's (the plan keeps its selection). A pick closes
// everything first and then runs `onSelect`. `onLeft` / `onRight` tell the menu bar to move to the next menu: ← at a
// top-level row, → at a top-level row without a sub-menu. `onClose` says how the menu closed (`CloseHow`), for a host that gives the focus back only after a pick or Escape.
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { placeInWindow } from './place.ts'
import { t as tr } from '../../i18n/idioma.ts' // mixed-use-mvp

/** How a menu closed: a row picked, Escape, or away from it (a press outside, a scroll, a resize). A pick and Escape are the keyboard's paths: the focus goes back to where it was; away is not. */
export type CloseHow = 'pick' | 'escape' | 'away'

export type MenuEntry =
  | { key: string; label: string; detail?: string; title?: string; disabled?: boolean; checked?: boolean; onSelect(): void }
  | { key: string; label: string; title?: string; disabled?: boolean; items: MenuEntry[] } // a sub-menu
  | 'separator'

type SubEntry = Extract<MenuEntry, { items: MenuEntry[] }>
type LeafEntry = Exclude<MenuEntry, 'separator' | SubEntry>
type RowEntry = LeafEntry | SubEntry

const isSub = (e: MenuEntry): e is SubEntry => e !== 'separator' && 'items' in e
const isRow = (e: MenuEntry): e is RowEntry => e !== 'separator'

/** How long the pointer rests on a sub-menu's row before it opens. */
const HOVER_MS = 150
const ENABLED_ROW = '[role^="menuitem"]:not(:disabled)'

/** A sub-menu that is open: the row it hangs from, and whether the focus goes into it. */
interface Open {
  key: string
  row: HTMLElement
  focus: boolean
}

export function Menu({
  label,
  items,
  at,
  flip,
  onClose,
  onLeft,
  onRight,
}: {
  label: string
  items: MenuEntry[]
  at: { x: number; y: number }
  /** Where the top menu's right edge (x) and bottom edge (y) go when it does not fit at `at`: a context menu gives the pointer. */
  flip?: { x?: number; y?: number }
  onClose(how?: CloseHow): void
  onLeft?(): void
  onRight?(): void
}) {
  const id = useId()
  const sel = `[data-menu-root="${id}"]`
  // the open sub-menus, outermost first: path[0] hangs from a row of the top menu
  const [path, setPath] = useState<Open[]>([])
  const timer = useRef<number | undefined>(undefined)
  const clearTimer = () => {
    window.clearTimeout(timer.current)
    timer.current = undefined
  }
  useEffect(() => clearTimer, [])

  /** The entries shown by the menu at `depth` (0: the top menu). */
  const entriesAt = (depth: number): MenuEntry[] => {
    let cur = items
    for (let d = 0; d < depth; d++) {
      const sub = cur.find((e): e is SubEntry => isSub(e) && e.key === path[d]?.key)
      if (!sub) return []
      cur = sub.items
    }
    return cur
  }
  const panelAt = (depth: number) => document.querySelector<HTMLElement>(`${sel}[data-depth="${depth}"]`)
  const focusFirst = (depth: number) => panelAt(depth)?.querySelector<HTMLElement>(ENABLED_ROW)?.focus()

  const openSub = (depth: number, entry: SubEntry, row: HTMLElement, focus: boolean) => {
    clearTimer()
    if (entry.disabled) return
    if (path[depth]?.key === entry.key) {
      if (focus) focusFirst(depth + 1)
      return
    }
    setPath((p) => [...p.slice(0, depth), { key: entry.key, row, focus }])
  }
  /** Closes the sub-menu at `depth` and the ones inside it, the focus back on the row it hung from. */
  const closeSub = (depth: number) => {
    clearTimer()
    path[depth - 1]?.row.focus()
    setPath((p) => p.slice(0, depth - 1))
  }
  const activate = (depth: number, entry: RowEntry, row: HTMLElement) => {
    if (entry.disabled) return
    if (isSub(entry)) {
      openSub(depth, entry, row, true)
      return
    }
    // everything closes first: what onSelect opens (a dialog) is not under a menu
    clearTimer()
    onClose('pick')
    entry.onSelect()
  }

  const onRowEnter = (depth: number, entry: RowEntry, row: HTMLElement) => {
    clearTimer()
    if (!entry.disabled) row.focus({ preventScroll: true })
    if (isSub(entry) && !entry.disabled) {
      if (path[depth]?.key === entry.key) return
      timer.current = window.setTimeout(() => openSub(depth, entry, row, false), HOVER_MS)
    } else if (path.length > depth) {
      setPath((p) => p.slice(0, depth))
    }
  }

  useEffect(() => {
    const inside = (t: EventTarget | null) => t instanceof Element && t.closest(sel) !== null
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const active = document.activeElement
      const panel = active instanceof Element ? active.closest<HTMLElement>(sel) : null
      const focusDepth = panel ? Number(panel.dataset.depth) : -1
      const handled = () => {
        e.preventDefault()
        e.stopPropagation()
      }
      // the keys that go to the focused row
      const rowEl = panel && active instanceof Element ? active.closest<HTMLElement>('[data-menu-key]') : null
      const rowEntry = rowEl ? entriesAt(focusDepth).find((x): x is RowEntry => isRow(x) && x.key === rowEl.dataset.menuKey) : undefined

      switch (e.key) {
        case 'Escape': {
          // the Escape is the menu's: the plan keeps its selection
          handled()
          const target = focusDepth > 0 ? focusDepth : path.length
          if (target > 0) closeSub(target)
          else onClose('escape')
          return
        }
        case 'ArrowDown':
        case 'ArrowUp':
        case 'Home':
        case 'End': {
          handled()
          const rows = Array.from(panelAt(focusDepth >= 0 ? focusDepth : path.length)?.querySelectorAll<HTMLElement>(ENABLED_ROW) ?? [])
          if (rows.length === 0) return
          const i = rows.indexOf(active as HTMLElement)
          let next: number
          if (e.key === 'Home') next = 0
          else if (e.key === 'End') next = rows.length - 1
          else if (e.key === 'ArrowDown') next = (i + 1) % rows.length
          else next = i < 0 ? rows.length - 1 : (i - 1 + rows.length) % rows.length
          rows[next]?.focus()
          return
        }
        case 'ArrowRight': {
          if (rowEntry && isSub(rowEntry) && rowEl) {
            handled()
            openSub(focusDepth, rowEntry, rowEl, true)
          } else if (focusDepth <= 0 && onRight) {
            handled()
            onRight()
          }
          return
        }
        case 'ArrowLeft': {
          if (focusDepth > 0) {
            handled()
            closeSub(focusDepth)
          } else if (onLeft) {
            handled()
            onLeft()
          }
          return
        }
        case 'Enter':
        case ' ': {
          if (!rowEntry || !rowEl) return
          // not the browser's click as well: the pick is made here; a key held down (its repeat) picks nothing again, and
          // not the first row the menu just put the focus on, if Enter was what opened it
          handled()
          if (e.repeat) return
          activate(focusDepth, rowEntry, rowEl)
          return
        }
      }
    }
    const onDown = (e: PointerEvent) => {
      if (!inside(e.target)) onClose('away')
    }
    // a menu scrolls inside a short window: its own scrolling is not a reason to close it
    const onScroll = (e: Event) => {
      if (!inside(e.target)) onClose('away')
    }
    const onResize = () => onClose('away')
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('pointerdown', onDown, true)
    window.addEventListener('resize', onResize)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('resize', onResize)
      window.removeEventListener('scroll', onScroll, true)
    }
    // the handlers read the current path and items, so they are rebuilt with them
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, items, onClose, onLeft, onRight, id])

  const panels = []
  let cur = items
  let curLabel = label
  for (let depth = 0; ; depth++) {
    const open = path[depth]
    const sub = open ? cur.find((e): e is SubEntry => isSub(e) && e.key === open.key) : undefined
    panels.push(
      <Panel
        key={depth === 0 ? 'top' : `${depth}:${path[depth - 1].key}`}
        rootId={id}
        depth={depth}
        label={curLabel}
        items={cur}
        openKey={sub?.key}
        anchor={depth === 0 ? undefined : path[depth - 1].row}
        at={at}
        flip={flip}
        autoFocus={depth === 0 ? true : path[depth - 1].focus}
        onEnterRow={(entry, row) => onRowEnter(depth, entry, row)}
        onActivate={(entry, row) => activate(depth, entry, row)}
      />,
    )
    if (!sub) break
    cur = sub.items
    curLabel = sub.label
  }
  return <>{panels}</>
}

function Panel({
  rootId,
  depth,
  label,
  items,
  openKey,
  anchor,
  at,
  flip,
  autoFocus,
  onEnterRow,
  onActivate,
}: {
  rootId: string
  depth: number
  label: string
  items: MenuEntry[]
  openKey: string | undefined
  anchor: HTMLElement | undefined
  at: { x: number; y: number }
  flip: { x?: number; y?: number } | undefined
  autoFocus: boolean
  onEnterRow(entry: RowEntry, row: HTMLElement): void
  onActivate(entry: RowEntry, row: HTMLElement): void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)

  // inside the window: the top menu at `at` (flipped to the far side), a sub-menu beside its row (left of it when
  // the right has no room); hidden until it is placed
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const m = el.getBoundingClientRect()
    const win = { width: window.innerWidth, height: window.innerHeight }
    if (anchor) {
      const r = anchor.getBoundingClientRect()
      // 4 px up: the menu's padding, so its first row lines up with the row it hangs from
      setPos(placeInWindow({ x: r.right, y: r.top - 4 }, m, win, { x: r.left - m.width }))
    } else {
      setPos(
        placeInWindow({ x: at.x, y: at.y }, m, win, {
          x: flip?.x === undefined ? undefined : flip.x - m.width,
          y: flip?.y === undefined ? undefined : flip.y - m.height,
        }),
      )
    }
  }, [anchor, at.x, at.y, flip?.x, flip?.y])

  // the focus goes to the first row once the menu is placed: hidden (before that) it would not take it
  const placed = pos !== null
  useEffect(() => {
    if (placed && autoFocus) ref.current?.querySelector<HTMLElement>(ENABLED_ROW)?.focus()
  }, [placed, autoFocus])

  return createPortal(
    <div
      ref={ref}
      role="menu"
      aria-label={label}
      data-menu-root={rootId}
      data-depth={depth}
      className="panel fixed z-[90] max-h-[calc(100dvh-0.5rem)] w-max min-w-[13rem] max-w-[min(20rem,calc(100vw-0.5rem))] overflow-y-auto p-1 shadow-sheet"
      style={{ position: 'fixed', left: pos?.x ?? 0, top: pos?.y ?? 0, visibility: pos ? 'visible' : 'hidden' }}
      onContextMenu={(e) => {
        // not the browser's, nor (through the portal) the plan's or the tree's under it
        e.preventDefault()
        e.stopPropagation()
      }}
    >
      {items.map((item, i) => {
        if (item === 'separator') return <div key={`s${i}`} role="separator" className="my-1 border-t border-separator" />
        const sub = isSub(item)
        const expanded = sub && openKey === item.key
        return (
          <button
            key={item.key}
            type="button"
            tabIndex={-1}
            role={!sub && item.checked !== undefined ? 'menuitemcheckbox' : 'menuitem'}
            aria-checked={sub ? undefined : item.checked}
            aria-haspopup={sub ? 'menu' : undefined}
            aria-expanded={sub ? expanded : undefined}
            data-menu-key={item.key}
            disabled={item.disabled}
            title={item.title}
            onMouseEnter={(e) => onEnterRow(item, e.currentTarget)}
            onClick={(e) => onActivate(item, e.currentTarget)}
            className={`pressable flex h-row w-full items-center gap-3 rounded-control px-2.5 text-left text-body hover:bg-hover focus:bg-hover focus:outline-none disabled:opacity-40 disabled:hover:bg-transparent ${expanded ? 'bg-hover' : ''}`}
          >
            <span className="flex-1 truncate">{tr(item.label)}</span>
            {!sub && item.checked && <span aria-hidden>✓</span>}
            {!sub && item.detail && <span className="text-label text-ink-secondary">{item.detail}</span>}
            {sub && <span aria-hidden>▸</span>}
          </button>
        )
      })}
    </div>,
    document.body,
  )
}
