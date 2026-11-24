// The ⋯ button (IZA's MoreMenu pattern): file actions on the desktop, every tool on a phone. Port of Plaza-Practiko
// `vistas/paneles/MenuMas.tsx`. Each row is 44 px tall, for the finger. It closes on a pick, on Escape or on a
// press outside, a scroll elsewhere or a resize, and gives the focus back to the ⋯. The menu is drawn over the whole page (a
// portal on the body, `fixed`, as the right-click menu) and placed from the ⋯'s rect: it flips above the button
// when it does not fit below and never leaves the window, so a panel's edge does not clip it; taller than the window
// (a phone's ⋯ has many rows), it scrolls inside itself.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { placeInWindow } from './place.ts'
import { Icon, type IconName } from './Icon.tsx'
import { t as tr } from '../../i18n/idioma.ts' // mixed-use-mvp

export type MenuItem = {
  key: string
  /** Without an icon the row keeps the gap, so the names stay aligned. */
  icon?: IconName
  label: string
  /** Something drawn right of the name (a shortcut, a state). */
  detail?: ReactNode
  disabled?: boolean
  onSelect: () => void
}

/** `align`: the side of the ⋯ the menu lines up with (right: near a panel's right edge). */
export function MoreMenu({ items, compact = false, align = 'left' }: { items: MenuItem[]; compact?: boolean; align?: 'left' | 'right' }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [at, setAt] = useState<{ x: number; y: number } | null>(null)

  // inside the window: under the ⋯ (or above it), lined up with its left or right side
  useLayoutEffect(() => {
    const button = buttonRef.current
    const menu = menuRef.current
    if (!open || !button || !menu) return
    const b = button.getBoundingClientRect()
    const m = menu.getBoundingClientRect()
    const x = align === 'right' ? b.right - m.width : b.left
    setAt(placeInWindow({ x, y: b.bottom + 4 }, m, { width: window.innerWidth, height: window.innerHeight }, { y: b.top - 4 - m.height }))
  }, [open, align])

  useEffect(() => {
    if (!open) return
    const close = () => {
      setOpen(false)
      buttonRef.current?.focus()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      // the Escape is the menu's: the plan does not also clear the selection
      e.preventDefault()
      e.stopPropagation()
      close()
    }
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node
      if (!rootRef.current?.contains(t) && !menuRef.current?.contains(t)) setOpen(false)
    }
    const onAway = () => setOpen(false)
    // the menu scrolls inside a short window: its own scrolling is not a reason to close it
    const onScroll = (e: Event) => {
      if (e.target instanceof Node && menuRef.current?.contains(e.target)) return
      setOpen(false)
    }
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('pointerdown', onDown)
    window.addEventListener('resize', onAway)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('resize', onAway)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [open])

  useEffect(() => {
    if (!open) setAt(null)
  }, [open])

  // the focus goes to the first row once the menu is placed: hidden (before that) it would not take it
  const placed = at !== null
  useEffect(() => {
    if (placed) menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')?.focus()
  }, [placed])

  if (items.length === 0) return null

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="More actions"
        title="More actions"
        className={`pressable grid place-items-center rounded-pill hover:bg-hover ${compact ? 'h-[2rem] w-[2rem]' : 'h-11 w-11'}`}
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name="more" className="h-5 w-5" />
      </button>
      {open &&
        createPortal(
        <div
          ref={menuRef}
          role="menu"
          aria-label="More actions"
          className="panel fixed z-[90] max-h-[calc(100dvh-0.5rem)] w-max min-w-[14rem] max-w-[min(22rem,calc(100vw-0.5rem))] overflow-y-auto p-1.5 shadow-sheet"
          style={{ position: 'fixed', left: at?.x ?? 0, top: at?.y ?? 0, visibility: at ? 'visible' : 'hidden' }}
        >
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              className="pressable flex min-h-11 w-full items-center gap-3 rounded-control px-3 text-left text-body hover:bg-hover disabled:opacity-40"
              onClick={() => {
                setOpen(false)
                item.onSelect()
              }}
            >
              {item.icon ? (
                <Icon name={item.icon} className="h-[1.125rem] w-[1.125rem] shrink-0 text-ink-secondary" />
              ) : (
                <span aria-hidden className="h-[1.125rem] w-[1.125rem] shrink-0" />
              )}
              <span className="flex-1">{tr(item.label)}</span>
              {item.detail && <span className="ml-4 text-label text-ink-secondary">{item.detail}</span>}
            </button>
          ))}
        </div>,
        document.body,
        )}
    </div>
  )
}
