// La barra de dibujo bajo el viewport (GIM `views/viewport/DraftingBar.tsx`): el asa, la línea de comando, los
// interruptores de imán (Imán · Alinear · Orto · Retícula), el terreno, el detalle y la vista (Planta · 3D · Dividida).
// Funcionan el detalle (cómo se dibuja la unidad) y la vista; el resto queda por decidir.
import { Icon, Segmented, Toggle } from './Icon'
import { useUi, type Detalle, type Vista } from './ui'

export function DraftingBar() {
  const vista = useUi((s) => s.vista)
  const setVista = useUi((s) => s.setVista)
  const detalle = useUi((s) => s.detalle)
  const setDetalle = useUi((s) => s.setDetalle)
  return (
    <section aria-label="Dibujo" data-bar="drafting" className="panel flex min-w-0 shrink-0 items-center gap-3 overflow-hidden px-2 py-1.5">
      <button type="button" aria-label="Mover la barra de dibujo" title="Mover la barra (por decidir)" className="pressable -mr-1.5 grid h-6 w-4 shrink-0 cursor-grab place-items-center rounded-control text-ink-tertiary hover:bg-hover hover:text-ink">
        <Icon name="moveTheDraftingBar" />
      </button>
      <div className="min-w-0 flex-1 overflow-hidden">
        <div role="group" aria-label="Comando" className="flex min-w-0 items-center gap-2 px-1.5">
          <span className="text-label text-ink-secondary">Comando</span>
        </div>
      </div>
      <div role="toolbar" aria-label="Imán" className="flex shrink-0 items-center gap-1.5" title="Por decidir si aplica">
        <div className="flex shrink-0 items-center gap-0.5 rounded-segment bg-fill p-0.5"><Toggle label="Imán" on disabled /></div>
        <button type="button" aria-label="Tipos de imán" disabled className="pressable flex h-[1.75rem] items-center gap-1 rounded-control px-2 text-label text-ink-segment disabled:opacity-50">
          <Icon name="snapKinds" className="h-3 w-3" />
        </button>
        <div className="flex shrink-0 items-center gap-0.5 rounded-segment bg-fill p-0.5"><Toggle label="Alinear" on disabled /></div>
        <div className="flex shrink-0 items-center gap-0.5 rounded-segment bg-fill p-0.5"><Toggle label="Orto" on={false} disabled /><Toggle label="Retícula" on disabled /></div>
        <button type="button" aria-label="Retícula" disabled className="pressable flex h-[1.75rem] items-center gap-1 rounded-control px-2 text-label text-ink-segment disabled:opacity-50">
          <Icon name="grid" className="h-3 w-3" />
        </button>
      </div>
      <span aria-hidden className="h-5 w-px shrink-0 bg-separator" />
      <select aria-label="Terreno" disabled title="Por decidir si aplica" className="h-[1.75rem] shrink-0 rounded-control bg-panel px-1.5 text-label text-ink shadow-control outline-none disabled:opacity-50">
        <option>Terreno apagado</option>
      </select>
      <select aria-label="Detalle" value={detalle} onChange={(e) => setDetalle(e.target.value as Detalle)} title="Cómo se dibuja la unidad" className="h-[1.75rem] shrink-0 rounded-control bg-panel px-1.5 text-label text-ink shadow-control outline-none">
        <option value="esquema">Esquema</option>
        <option value="presentacion">Presentación</option>
        <option value="completo">Muros completos</option>
      </select>
      <span aria-hidden className="h-5 w-px shrink-0 bg-separator" />
      <Segmented<Vista>
        label="Vista"
        value={vista}
        onChange={setVista}
        items={[{ key: 'plan', label: 'Planta' }, { key: '3d', label: '3D' }, { key: 'split', label: 'Dividida' }]}
      />
    </section>
  )
}
