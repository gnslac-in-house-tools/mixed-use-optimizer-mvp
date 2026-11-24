// A bar docked to the viewport (Decision "Workspace layout"; DockArea.tsx places it): its grip (⋮⋮) drags it above
// or below the viewport (a line shows where it lands; ↑ ↓ on the focused grip do the same), and a right-click on it
// offers Dock above / below the viewport and Hide (the View menu brings it back): its own short list, shown by the app's one menu (`openEntries`, editing/menu/open.tsx). A field inside keeps the browser's
// own menu. A bar that does not fit its room goes compact (`useCompactBar`): its tools show their icons only (the name
// stays in the title), so nothing is cut off; it goes back once its full width fits again.
import { createContext, useContext, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { create } from 'zustand'
import { Icon } from '../controls/Icon.tsx'
import { openEntries } from '../editing/menu/open.tsx'
import { BARS, useUi, type Bar, type Dock } from '../layout/ui.ts'
import { beginDrag } from '../controls/beginDrag.ts'

/** A bar being dragged by its grip, and where it would land. */
export const useDockDrag = create<{ bar: Bar | null; to: Dock | null }>()(() => ({ bar: null, to: null }))

/** How far the pointer moves before a press on the grip becomes a drag. */
const DRAG_PX = 4

const Compact = createContext(false)
/** Whether the bar this is in is short of room: its tools show their icons only. */
export const useCompactBar = () => useContext(Compact)

/** True while the element's content is wider than it; it remembers the full width, so it goes back once that fits. */
export function useOverflow(): [React.RefObject<HTMLElement | null>, boolean] {
  const ref = useRef<HTMLElement | null>(null)
  const [compact, setCompact] = useState(false)
  const full = useRef(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const check = () => {
      if (!compact && el.scrollWidth > el.clientWidth + 1) {
        full.current = el.scrollWidth
        setCompact(true)
      } else if (compact && el.clientWidth >= full.current) setCompact(false)
    }
    check()
    const ro = new ResizeObserver(check)
    ro.observe(el)
    return () => ro.disconnect()
  })
  return [ref, compact]
}

/** A bar's frame: the grip that drags it, its right-click menu, then what it holds. */
export function DockedBar({ bar, label, className = '', children }: { bar: Bar; label: string; className?: string; children: ReactNode }) {
  const where = useUi((s) => s.docks[bar])
  const setDock = useUi((s) => s.setDock)
  const setShow = useUi((s) => s.setShow)
  const dragging = useDockDrag((s) => s.bar === bar)
  const [from, setFrom] = useState<number | null>(null)
  const name = BARS.find((b) => b.key === bar)!.label
  const [fitRef, compact] = useOverflow()

  return (
    <section
      ref={fitRef}
      aria-label={label}
      data-bar={bar}
      data-dock={where}
      className={`panel flex min-w-0 shrink-0 items-center gap-3 overflow-hidden px-2 py-1 ${dragging ? 'opacity-60' : ''} ${className}`}
      onContextMenu={(e) => {
        // a field keeps the browser's own menu (copy, paste); the open menu's own right-clicks stay in it
        if (e.defaultPrevented || (e.target as HTMLElement).closest('input, textarea')) return
        e.preventDefault()
        // the bar's own short list, not of a kind: the app's one menu shows it (editing/menu/open.tsx)
        openEntries(e, name, [
          { key: 'top', label: 'Dock above the viewport', checked: where === 'top', onSelect: () => setDock(bar, 'top') },
          { key: 'bottom', label: 'Dock below the viewport', checked: where === 'bottom', onSelect: () => setDock(bar, 'bottom') },
          'separator',
          { key: 'hide', label: `Hide the ${name.toLowerCase()}`, title: 'The View menu brings it back', onSelect: () => setShow(bar, false) },
        ])
      }}
    >
      <button
        type="button"
        aria-label={`Move the ${name.toLowerCase()}`}
        title={`Drag above or below the viewport (or ↑ ↓); docked ${where === 'top' ? 'above' : 'below'}`}
        className="pressable -mr-1.5 grid h-6 w-4 shrink-0 cursor-grab touch-none place-items-center rounded-control text-ink-tertiary hover:bg-hover hover:text-ink active:cursor-grabbing"
        onKeyDown={(e) => {
          if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
          e.preventDefault()
          setDock(bar, e.key === 'ArrowUp' ? 'top' : 'bottom')
        }}
        onPointerDown={(e) => {
          if (e.button !== 0) return
          beginDrag(e)
          setFrom(e.clientY)
        }}
        onPointerMove={(e) => {
          if (from === null || Math.abs(e.clientY - from) < DRAG_PX) return
          const area = e.currentTarget.closest('[data-dock-area]')?.getBoundingClientRect()
          if (!area) return
          useDockDrag.setState({ bar, to: e.clientY < area.top + area.height / 2 ? 'top' : 'bottom' })
        }}
        onPointerUp={() => {
          const { to } = useDockDrag.getState()
          if (to) setDock(bar, to)
          setFrom(null)
          useDockDrag.setState({ bar: null, to: null })
        }}
        onPointerCancel={() => {
          setFrom(null)
          useDockDrag.setState({ bar: null, to: null })
        }}
      >
        <Icon name="grip" className="h-4 w-4" />
      </button>
      <Compact.Provider value={compact}>{children}</Compact.Provider>
    </section>
  )
}
