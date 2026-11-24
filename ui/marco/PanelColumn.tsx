// El contenedor de un panel lateral (GIM `views/layout/PanelColumn.tsx`, solo pantalla ancha): título, botón para
// ocultarlo (Ver › Paneles lo regresa), las pestañas del izquierdo, el riel del derecho y la orilla interior que se
// arrastra para cambiar el ancho (doble clic: el predeterminado).
import { useRef, type ReactNode, type RefObject } from 'react'
import { Icon } from './Icon'
import { MAX_PANEL_PX, MIN_PANEL_PX, PANEL_NAMES, useUi, type Side } from './ui'

export function PanelColumn({ side, title, rail, tabs, children }: { side: Side; title?: string; rail?: ReactNode; tabs?: ReactNode; children: ReactNode }) {
  const shown = useUi((s) => s.panels[side])
  const setPanel = useUi((s) => s.setPanel)
  const asideRef = useRef<HTMLElement>(null)
  const name = PANEL_NAMES[side]
  return (
    <aside ref={asideRef} aria-label={name} className={`relative min-h-0 flex-col rounded-panel bg-panel shadow-panel ${shown ? 'flex' : 'hidden'}`}>
      <EdgeHandle side={side} panel={asideRef} />
      <div className={`flex min-h-0 flex-1 ${rail ? 'flex-row' : 'flex-col'}`}>
        {side === 'left' && rail}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex shrink-0 items-center justify-between gap-3 px-panel-pad pt-3">
            <h2 className="text-headline">{title ?? name}</h2>
            <button
              type="button"
              aria-label={`Ocultar ${name}`}
              title={`Ocultar ${name} (Ver › Paneles lo regresa como estaba)`}
              className="pressable -mr-1 grid h-6 w-6 place-items-center rounded-pill text-ink-segment hover:bg-hover hover:text-ink"
              onClick={() => setPanel(side, false)}
            >
              <Icon name={side === 'left' ? 'hideL' : 'hideR'} />
            </button>
          </div>
          {tabs}
          <div className="flex min-h-0 flex-1 flex-col">{children}</div>
        </div>
        {side === 'right' && rail}
      </div>
    </aside>
  )
}

function EdgeHandle({ side, panel }: { side: Side; panel: RefObject<HTMLElement | null> }) {
  const width = useUi((s) => s.widths[side])
  const setWidth = useUi((s) => s.setWidth)
  const from = useRef<{ x: number; w: number } | null>(null)
  const sign = side === 'left' ? 1 : -1
  const now = () => panel.current?.getBoundingClientRect().width ?? MIN_PANEL_PX
  const edge = 'calc(var(--gutter) / -2 - 0.25rem)'
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={`Ancho de ${PANEL_NAMES[side]}`}
      aria-valuemin={MIN_PANEL_PX}
      aria-valuemax={MAX_PANEL_PX}
      aria-valuenow={width ?? undefined}
      tabIndex={0}
      title="Arrastra para cambiar el ancho (o ← →); doble clic regresa el predeterminado"
      className="group absolute inset-y-3 z-[1] w-2 cursor-col-resize touch-none focus:outline-none"
      style={side === 'left' ? { right: edge } : { left: edge }}
      onPointerDown={(e) => {
        if (e.button !== 0) return
        ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
        from.current = { x: e.clientX, w: now() }
      }}
      onPointerMove={(e) => { if (from.current) setWidth(side, from.current.w + sign * (e.clientX - from.current.x)) }}
      onPointerUp={() => (from.current = null)}
      onPointerCancel={() => (from.current = null)}
      onDoubleClick={() => setWidth(side, null)}
      onKeyDown={(e) => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
        e.preventDefault()
        setWidth(side, now() + sign * (e.key === 'ArrowRight' ? 16 : -16))
      }}
    >
      <span aria-hidden className="mx-auto block h-full w-0.5 rounded-pill group-hover:bg-separator group-focus-visible:bg-ink" />
    </div>
  )
}
