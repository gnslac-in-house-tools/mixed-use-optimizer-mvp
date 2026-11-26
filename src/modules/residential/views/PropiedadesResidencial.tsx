// Los parámetros de GFit de un edificio en sus Properties (BuildingProperties de GIM): fondo de unidad, ancho de
// pasillo, mezcla objetivo por tipo (debe sumar 100) y semilla. Cada cambio es un paso de deshacer (actions.setParams).
import type { Id } from '../../../model/schema.ts'
import { actions } from '../../../state/actions/index.ts'
import { useApp } from '../../../state/store.ts'
import { NumberField, SelectField } from '../../../views/controls/fields.tsx'
import { useModule } from '../../../views/modules.ts'
import { paramsDe } from '../engine/defaults.ts'
import type { ParamsEdificio } from '../engine/schema.ts'
import { PotResidencial } from './PotResidencial.tsx'

const cambia = (b: Id, parcial: Partial<ParamsEdificio>) => useApp.getState().apply((p) => actions.setParams(p, b, parcial))

export function PropiedadesResidencial({ buildingId }: { buildingId: Id }) {
  const { offered } = useModule('residential')
  const project = useApp((s) => s.project)
  const level = useApp((s) => s.level)
  if (!offered || !project.residential) return null
  const pr = paramsDe(project, buildingId)
  const nivel = project.buildings.find((b) => b.id === buildingId)?.levels.find((l) => l.id === level)
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
      <SelectField
        label="Sótanos"
        value={pr.sotanos === null ? 'auto' : String(pr.sotanos)}
        options={[{ value: 'auto', label: 'Los que pide' }, ...[0, 1, 2, 3, 4, 5, 6].map((n) => ({ value: String(n), label: String(n) }))]}
        onCommit={(v) => cambia(buildingId, { sotanos: v === 'auto' ? null : Number(v) })}
      />
      <NumberField key={`${buildingId}-tope`} label="Precio tope" unit="$" min={0} decimals={0} value={pr.tope} onCommit={(v) => cambia(buildingId, { tope: v })} />
      <NumberField key={`${buildingId}-terreno`} label="Terreno" unit="$" min={0} decimals={0} value={pr.terreno} onCommit={(v) => cambia(buildingId, { terreno: v })} />
      <NumberField key={`${buildingId}-semilla`} label="Semilla" min={0} decimals={0} value={pr.semilla} onCommit={(v) => cambia(buildingId, { semilla: Math.round(v) })} />
      {/* los departamentos de GFit del nivel activo pasan a ser masas que se editan (spec 2026-11-26-blocks-residenciales) */}
      {nivel && (
        <button
          type="button"
          className="pressable self-start rounded-control bg-fill px-2 py-1 text-label text-ink hover:bg-hover"
          title="Los departamentos que GFit acomoda en la vivienda de este nivel pasan a ser masas que se mueven y editan"
          onClick={() => useApp.getState().apply((p) => actions.fijarAcomodo(p, buildingId, nivel.id))}
        >
          Fijar acomodo de {nivel.name}
        </button>
      )}
      {/* el POT es del proyecto; aquí también, junto a lo demás de Uso mixto */}
      <PotResidencial />
    </section>
  )
}
