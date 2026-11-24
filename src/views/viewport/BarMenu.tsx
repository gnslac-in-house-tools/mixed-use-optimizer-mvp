// A drafting bar's drop-down (Decision "Bottom bar"): a button with ▾ that opens what it holds in a box beside the bar,
// above it when the bar is docked below the viewport and under it when docked above, so it opens over the viewport. A
// click outside or Escape closes it. `align`: the box's edge that lines up with the button's. The box is drawn on the
// body (a portal, fixed where the button is): inside the bar it stayed behind the viewport, which paints over it.
import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '../controls/Icon.tsx'
import { useCloseOutside } from '../controls/useCloseOutside.ts'
import { useUi } from '../layout/ui.ts'

export function BarMenu(props: { label: ReactNode; name: string; title: string; disabled?: boolean; align?: 'left' | 'right'; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])
  const root = useRef<HTMLDivElement>(null)
  const box = useRef<HTMLDivElement>(null)
  useCloseOutside(open, close, root, box)
  const below = useUi((s) => s.docks.drafting) === 'top'
  const [at, setAt] = useState<CSSProperties>({})
  useEffect(() => {
    if (!open) return
    // where the button is: the box's edge on its edge, a 4 px gap from the bar
    const place = () => {
      const r = root.current?.getBoundingClientRect()
      if (!r) return
      const x = props.align === 'left' ? { left: r.left } : { right: window.innerWidth - r.right }
      setAt(below ? { ...x, top: r.bottom + 4 } : { ...x, bottom: window.innerHeight - r.top + 4 })
    }
    place()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    window.addEventListener('keydown', onKey)
    window.addEventListener('resize', place)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', place)
    }
  }, [open, close, below, props.align])
  return (
    <div ref={root} className="relative flex shrink-0">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={props.name}
        title={props.title}
        disabled={props.disabled}
        onClick={() => setOpen(!open)}
        className={`pressable flex h-[1.75rem] items-center gap-1 rounded-control px-2 text-label ${
          open ? 'bg-fill text-ink shadow-control' : 'text-ink-segment hover:bg-hover hover:text-ink'
        } disabled:opacity-50 disabled:hover:bg-transparent`}
      >
        {props.label}
        {/* towards where it opens; the other way while open */}
        <Icon name={open !== below ? 'chevronDown' : 'chevronUp'} className="h-3 w-3" />
      </button>
      {open &&
        createPortal(
          <div ref={box} role="dialog" aria-label={props.name} className="glass fixed z-50 w-max rounded-glass p-2" style={at}>
            {props.children}
          </div>,
          document.body,
        )}
    </div>
  )
}
