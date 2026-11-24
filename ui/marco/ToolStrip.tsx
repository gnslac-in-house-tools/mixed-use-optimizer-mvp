// La barra de herramientas sobre el viewport (GIM `views/tools/ToolStrip.tsx`, acostada): el asa, y cada grupo de
// herramientas como íconos con su ▾ de opciones, separados por líneas. Son los mismos grupos y herramientas de GIM;
// aquí solo Seleccionar funciona hasta decidir cuáles aplican.
import { Icon, IconButton } from './Icon'
import type { NombreIcono } from './iconos'

const GRUPOS: { name: string; tools: [NombreIcono, string][] }[] = [
  { name: 'General', tools: [['select', 'Seleccionar'], ['move', 'Mover'], ['copy', 'Copiar'], ['rotate', 'Girar'], ['mirror', 'Reflejar'], ['array', 'Arreglo'], ['align', 'Alinear'], ['group', 'Agrupar']] },
  { name: 'Volumen', tools: [['draw', 'Dibujar'], ['hole', 'Hueco'], ['corner', 'Esquina'], ['chamfer', 'Chaflán'], ['split', 'Dividir'], ['union', 'Unir']] },
  { name: 'Elementos', tools: [['dock', 'Andén'], ['door', 'Puerta'], ['pattern', 'Patrón'], ['court', 'Patio']] },
  { name: 'Calles', tools: [['street', 'Calle'], ['gate', 'Acceso'], ['existingRoad', 'Calle existente'], ['connect', 'Conectar']] },
  { name: 'Estacionamiento', tools: [['lot', 'Lote']] },
  { name: 'Anotaciones', tools: [['dimension', 'Cota'], ['ruler', 'Regla'], ['referenceLine', 'Línea de referencia'], ['note', 'Nota']] },
]
const CON_OPCIONES = new Set(['General', 'Volumen', 'Elementos', 'Calles'])

export function ToolStrip() {
  return (
    <div role="toolbar" aria-label="Herramientas" aria-orientation="horizontal" data-tool-strip className="panel flex min-w-0 shrink-0 items-center gap-2 overflow-x-auto px-2 py-1 no-scrollbar">
      <button type="button" aria-label="Mover las herramientas" title="Mover las herramientas (por decidir)" className="pressable -mr-1.5 grid h-6 w-4 shrink-0 cursor-grab place-items-center rounded-control text-ink-tertiary hover:bg-hover hover:text-ink">
        <Icon name="grip" />
      </button>
      {GRUPOS.map((g, i) => (
        <div key={g.name} className="flex shrink-0 items-center gap-2">
          {i > 0 && <span aria-hidden data-separator className="h-5 w-px shrink-0 bg-separator" />}
          <div role="group" aria-label={g.name} className="flex shrink-0 items-center">
            {g.tools.map(([icon, label]) =>
              icon === 'select'
                ? <IconButton key={icon} icon={icon} label={label} title={`${label} (V)`} pressed />
                : <IconButton key={icon} icon={icon} label={label} title={`${label}: por decidir si aplica`} disabled />,
            )}
          </div>
          {CON_OPCIONES.has(g.name) && (
            <span className="flex shrink-0">
              <button type="button" aria-label={`Opciones de ${g.name}`} disabled className="pressable grid h-[2rem] w-4 shrink-0 place-items-center rounded-control text-ink-tertiary hover:bg-hover hover:text-ink disabled:opacity-40">
                <Icon name="opts" className="h-3 w-3" />
              </button>
            </span>
          )}
        </div>
      ))}
    </div>
  )
}
