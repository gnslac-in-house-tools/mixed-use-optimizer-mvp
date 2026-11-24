// A side panel's container: Layers and properties on the left, Summary on the right (Decision "Side panels"). Adapted from
// Plaza-Practiko `vistas/paneles/HojaLateral.tsx` (IZA's ThemeSheet pattern), which had one panel on the right.
//   wide (≥ 880 px) → a column of the grid; hidden with View › Panels, it stays mounted (display: none),
//                     so its tab and any half-typed field are there when it comes back. Its inner edge drags to
//                     change its width (Decision "Workspace layout"); a double-click gives the default back
//   narrow          → a sheet over the viewport, from its own side, with a dimmed background; on a phone it comes up
//                     from below and closes by dragging its handle down. Escape or a click outside closes it.
// The Summary's `rail` (its tabs, Decision "Summary tabs") runs down its outer edge, the whole height, as the side tabs
// of Rhino's panels; the header then names what is open (`title`) instead of the panel. The left panel has `tabs`
// instead (Phase AS.3, Decision "Panel tabs": Layers · Blocks · Properties, then a plugin's): a row under the header
// and, on a phone, a row at the sheet's top, over the header.
import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { Icon } from '../controls/Icon.tsx'
import { usePhone, useWide } from './media.ts'
import { MAX_PANEL_PX, MIN_PANEL_PX, PANEL_NAMES, useUi, type Side } from './ui.ts'
import { beginDrag } from '../controls/beginDrag.ts'

const DISMISS_PX = 80
/** The arrow keys on a panel's edge move it by this much. */
const KEY_PX = 16

export function PanelColumn({ side, title, rail, tabs, children }: { side: Side; title?: string; rail?: ReactNode; tabs?: ReactNode; children: ReactNode }) {
  const wide = useWide()
  // on a phone the left panel's tabs are a row over the sheet's header
  const tabsOnTop = usePhone()
  const shown = useUi((s) => s.panels[side])
  const sheet = useUi((s) => s.sheet === side)
  const setPanel = useUi((s) => s.setPanel)
  const setSheet = useUi((s) => s.setSheet)
  const [dragY, setDragY] = useState<number | null>(null)
  const dragFrom = useRef(0)
  const closeRef = useRef<HTMLButtonElement>(null)
  const asideRef = useRef<HTMLElement>(null)
  const name = PANEL_NAMES[side]
  const open = wide ? shown : sheet
  const close = () => (wide ? setPanel(side, false) : setSheet(null))

  useEffect(() => {
    if (wide || !sheet) return
    closeRef.current?.focus()
    // an Escape something else used (a field dropping its draft, a menu) is not the sheet's
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !e.defaultPrevented && setSheet(null)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      // the focus goes back to the menu that opened the sheet (View › Panels; a phone's ☰)
      document.querySelector<HTMLElement>('[data-tour="menu-view"], [data-tour="menu"]')?.focus()
    }
  }, [wide, sheet, side, setSheet])

  const sheetClass = [
    'sheet-bottom absolute inset-y-gutter z-10 w-[min(27.5rem,calc(100%-2rem))] shadow-sheet',
    side === 'left' ? 'sheet-in-left left-gutter' : 'sheet-in right-gutter',
    'phone:fixed phone:inset-x-0 phone:bottom-0 phone:top-auto phone:h-[80dvh] phone:w-auto',
    'phone:rounded-b-none phone:pb-[env(safe-area-inset-bottom)] phone:pt-5',
  ].join(' ')

  return (
    <>
      {!wide && sheet && <div className="fixed inset-0 z-10 bg-black/20" onClick={() => setSheet(null)} aria-hidden />}

      <aside
        ref={asideRef}
        aria-label={name}
        data-tour={`panel-${side}`}
        className={`min-h-0 flex-col rounded-panel bg-panel ${wide ? 'relative shadow-panel' : sheetClass} ${open ? 'flex' : 'hidden'}`}
        style={dragY ? { transform: `translateY(${dragY}px)` } : undefined}
      >
        {!wide && (
          <div
            aria-hidden
            className="absolute inset-x-0 top-0 hidden h-7 touch-none place-items-center phone:grid"
            onPointerDown={(e) => {
              if (e.button !== 0) return
              beginDrag(e)
              dragFrom.current = e.clientY
              setDragY(0)
            }}
            onPointerMove={(e) => {
              if (dragY === null) return
              setDragY(Math.max(0, e.clientY - dragFrom.current))
            }}
            onPointerUp={() => {
              if (dragY !== null && dragY > DISMISS_PX) setSheet(null)
              setDragY(null)
            }}
            onPointerCancel={() => setDragY(null)}
          >
            <span className="h-[0.3125rem] w-10 rounded-pill bg-fill" />
          </div>
        )}
        {wide && <EdgeHandle side={side} panel={asideRef} />}
        <div className={`flex min-h-0 flex-1 ${rail ? 'flex-row' : 'flex-col'}`}>
          {side === 'left' && rail}
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            {tabsOnTop && tabs}
            <div className="flex shrink-0 items-center justify-between gap-3 px-panel-pad pt-3">
              <h2 className="text-headline">{title ?? name}</h2>
              <button
                ref={closeRef}
                type="button"
                aria-label={wide ? `Hide ${name}` : `Close ${name}`}
                title={wide ? `Hide ${name} (View › Panels brings it back as it was)` : `Close ${name}`}
                className="pressable -mr-1 grid h-6 w-6 place-items-center rounded-pill text-ink-segment hover:bg-hover hover:text-ink phone:h-11 phone:w-11"
                onClick={close}
              >
                <Icon name={wide ? (side === 'left' ? 'panelLeft' : 'panelRight') : 'close'} className={wide ? 'h-4 w-4' : 'h-3.5 w-3.5'} />
              </button>
            </div>
            {!tabsOnTop && tabs}
            <div className="flex min-h-0 flex-1 flex-col">{children}</div>
          </div>
          {side === 'right' && rail}
        </div>
      </aside>
    </>
  )
}

/** A side panel's inner edge, in the gutter next to the viewport: it drags to change the panel's width. */
function EdgeHandle({ side, panel }: { side: Side; panel: RefObject<HTMLElement | null> }) {
  const width = useUi((s) => s.widths[side])
  const setWidth = useUi((s) => s.setWidth)
  const from = useRef<{ x: number; w: number } | null>(null)
  const name = PANEL_NAMES[side]
  // dragging right widens the left panel and narrows the right one
  const sign = side === 'left' ? 1 : -1
  const now = () => panel.current?.getBoundingClientRect().width ?? MIN_PANEL_PX
  const edge = 'calc(var(--gutter) / -2 - 0.25rem)'

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={`${name} width`}
      aria-valuemin={MIN_PANEL_PX}
      aria-valuemax={MAX_PANEL_PX}
      aria-valuenow={width ?? undefined}
      tabIndex={0}
      title="Drag to change the width (or ← →); double-click gives the default back"
      className="group absolute inset-y-3 z-[1] w-2 cursor-col-resize touch-none focus:outline-none"
      style={side === 'left' ? { right: edge } : { left: edge }}
      onPointerDown={(e) => {
        if (e.button !== 0) return
        beginDrag(e)
        from.current = { x: e.clientX, w: now() }
      }}
      onPointerMove={(e) => {
        if (from.current) setWidth(side, from.current.w + sign * (e.clientX - from.current.x))
      }}
      onPointerUp={() => (from.current = null)}
      onPointerCancel={() => (from.current = null)}
      onDoubleClick={() => setWidth(side, null)}
      onKeyDown={(e) => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
        e.preventDefault()
        setWidth(side, now() + sign * (e.key === 'ArrowRight' ? KEY_PX : -KEY_PX))
      }}
    >
      <span aria-hidden className="mx-auto block h-full w-0.5 rounded-pill group-hover:bg-separator group-focus-visible:bg-ink" />
    </div>
  )
}
