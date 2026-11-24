// El marco de GIM (`src/App.tsx`): barra superior, barra de KPIs y, abajo, la rejilla de tres columnas — panel
// izquierdo (catálogo), el viewport con su barra de herramientas arriba y la de dibujo abajo, y el panel de resumen.
// Un panel oculto deja la rejilla: el viewport nunca cede su lugar. Ver › Paneles y Ver › Barras los muestran.
import { useEffect } from 'react'
import { useApp } from './store'
import { DraftingBar } from './marco/DraftingBar'
import { KpiStrip } from './marco/KpiStrip'
import { PanelDerecho } from './marco/PanelDerecho'
import { PanelIzquierdo } from './marco/PanelIzquierdo'
import { ToolStrip } from './marco/ToolStrip'
import { TopBar } from './marco/TopBar'
import { useUi } from './marco/ui'
import { Viewport } from './marco/Viewport'

function Toast() {
  const aviso = useApp((s) => s.aviso)
  const setAviso = useApp((s) => s.setAviso)
  useEffect(() => {
    if (!aviso) return
    const t = setTimeout(() => setAviso(null), 3200)
    return () => clearTimeout(t)
  }, [aviso, setAviso])
  if (!aviso) return null
  return <div role="status" aria-live="polite" className="glass fixed bottom-6 left-1/2 z-40 -translate-x-1/2 px-3 py-2 text-label">{aviso}</div>
}

export function App() {
  const panels = useUi((s) => s.panels)
  const widths = useUi((s) => s.widths)
  const show = useUi((s) => s.show)
  const left = widths.left === null ? 'var(--side-panel-w)' : `${widths.left}px`
  const right = widths.right === null ? 'calc(var(--side-panel-w) + var(--side-rail-w))' : `${widths.right}px`
  const columns = [panels.left && left, 'minmax(0, 1fr)', panels.right && right].filter(Boolean).join(' ')

  return (
    <div className={`grid h-app grid-cols-1 bg-canvas font-sans text-ink ${show.kpis ? 'grid-rows-[auto_auto_1fr]' : 'grid-rows-[auto_1fr]'}`}>
      <TopBar />
      {show.kpis && <KpiStrip />}
      <main className="relative grid min-h-0 gap-gutter px-gutter pb-gutter" style={{ gridTemplateColumns: columns }}>
        <PanelIzquierdo />
        <div className="flex min-h-0 min-w-0 flex-col gap-2">
          {show.tools && <ToolStrip />}
          <div className="flex min-h-0 flex-1 flex-col"><Viewport /></div>
          {show.drafting && <DraftingBar />}
        </div>
        <PanelDerecho />
      </main>
      <Toast />
    </div>
  )
}
