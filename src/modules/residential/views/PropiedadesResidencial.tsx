// Los parámetros de GFit de un edificio en sus Properties (BuildingProperties de GIM): fondo de unidad, ancho de
// pasillo, mezcla objetivo por tipo (debe sumar 100) y semilla. Cada cambio es un paso de deshacer (actions.setParams).
import type { Id } from '../../../model/schema.ts'
import { actions } from '../../../state/actions/index.ts'
import { useApp } from '../../../state/store.ts'
import { NumberField } from '../../../views/controls/fields.tsx'
import { useModule } from '../../../views/modules.ts'
import { paramsDe } from '../engine/defaults.ts'
import type { ParamsEdificio } from '../engine/schema.ts'

const cambia = (b: Id, parcial: Partial<ParamsEdificio>) => useApp.getState().apply((p) => actions.setParams(p, b, parcial))

export function PropiedadesResidencial({ buildingId }: { buildingId: Id }) {
  const { offered } = useModule('residential')
  const project = useApp((s) => s.project)
  if (!offered || !project.residential) return null
  const pr = paramsDe(project, buildingId)
  const suma = Object.values(pr.mezcla).reduce((a, b) => a + b, 0)
  return (
    <section aria-label="Uso mixto del edificio" className="flex flex-col gap-2">
      <h3 className="text-label text-ink-secondary">Uso mixto</h3>
      <NumberField key={`${buildingId}-fondo`} label="Fondo de unidad" unit="m" min={4} value={pr.fondo} onCommit={(v) => cambia(buildingId, { fondo: v })} />
      <NumberField key={`${buildingId}-pasillo`} label="Ancho de pasillo" unit="m" min={0.9} value={pr.pasillo} onCommit={(v) => cambia(buildingId, { pasillo: v })} />
      {project.residential.tipos.map((t) => (
        <NumberField key={`${buildingId}-mix-${t.id}`} label={`Mezcla ${t.name}`} unit="%" min={0} max={100} decimals={0} value={pr.mezcla[t.id] ?? 0} onCommit={(v) => cambia(buildingId, { mezcla: { [t.id]: v } })} />
      ))}
      {Math.abs(suma - 100) > 0.5 && <p className="text-caption text-status-over">La mezcla suma {Math.round(suma)} %: debe sumar 100 %.</p>}
      <NumberField key={`${buildingId}-semilla`} label="Semilla" min={0} decimals={0} value={pr.semilla} onCommit={(v) => cambia(buildingId, { semilla: Math.round(v) })} />
    </section>
  )
}
