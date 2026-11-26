// La sección «Uso mixto» del Resumen (Overview de GIM): por edificio de la opción en vista, los niveles por uso, las
// unidades por tipo, la mezcla real contra la objetivo, el cálculo de GFit y sus avisos.
import type { Id } from '../../../model/schema.ts'
import { useShown } from '../../../views/viewport/look.ts'
import { paramsDe } from '../engine/defaults.ts'
import type { Derivado } from '../engine/derivar.ts'
import { nivelesPorUso } from '../engine/niveles.ts'
import { useDerivados } from './useDerivado.ts'

const n0 = (v: number) => Math.round(v).toLocaleString('es-MX')
const m2 = (v: number) => `${n0(v)} m²`
const dinero = (v: number) => `$${(v / 1e6).toLocaleString('es-MX', { maximumFractionDigits: 1 })} M`

function Fila({ k, v, color }: { k: string; v: string; color?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="flex items-center gap-1.5 text-label text-ink-secondary">
        {color && <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-pill" style={{ background: color }} />}
        {k}
      </span>
      <span className="text-body tabular-nums text-ink">{v}</span>
    </div>
  )
}

function Edificio({ buildingId, d, titulo }: { buildingId: Id; d: Derivado; titulo: string | null }) {
  const project = useShown((s) => s.project)
  const tipos = project.residential!.tipos
  const objetivo = paramsDe(project, buildingId).mezcla
  const t = d.totals
  const { vivienda: viv, lobby, comercio: com } = nivelesPorUso(d)
  const total = t.units || 1
  const sumaObj = Object.values(objetivo).reduce((a, b) => a + b, 0) || 1
  const margen = t.revenue ? ((t.revenue - t.cost) / t.revenue) * 100 : null
  return (
    <div className="flex flex-col gap-2">
      {titulo && <h3 className="text-label text-ink">{titulo}</h3>}
      <Fila k="Niveles de Vivienda" v={`${viv}${lobby ? ` + ${lobby} lobby` : ''}`} />
      <Fila k="Niveles de Comercio" v={String(com)} />
      {tipos.map((ty, i) => (
        <Fila key={ty.id} k={ty.name} color={ty.color} v={String(t.counts[i] ?? 0)} />
      ))}
      <Fila k="Departamentos" v={String(t.units)} />
      <div className="flex flex-col gap-1">
        <span className="text-label text-ink-secondary">Mezcla (real · objetivo)</span>
        {tipos.map((ty, i) => (
          <Fila key={ty.id} k={ty.name} color={ty.color} v={`${Math.round(((t.counts[i] ?? 0) / total) * 100)} % · ${Math.round(((objetivo[ty.id] ?? 0) / sumaObj) * 100)} %`} />
        ))}
      </div>
      <Fila k="Área construida" v={m2(t.gfa)} />
      <Fila k="Área vendible" v={m2(t.nsa)} />
      <Fila k="Cajones requeridos" v={n0(t.req)} />
      <Fila k="Sótanos" v={d.estacionamiento.sotanos ? `${d.estacionamiento.sotanos} × ${d.estacionamiento.porSotano} cajones` : '—'} />
      <Fila k="Cajones en sótanos" v={`${n0(d.estacionamiento.cajones)} de ${n0(d.estacionamiento.requeridos)}`} />
      <Fila k="Costo del estacionamiento" v={dinero(d.estacionamiento.costo)} />
      <Fila k="Ingreso" v={dinero(t.revenue)} />
      <Fila k="Costo" v={dinero(t.cost)} />
      <Fila k="Margen" v={margen === null ? '—' : `${margen.toFixed(1)} %`} />
      {d.avisos.length > 0 && (
        <ul className="flex flex-col gap-0.5 text-caption text-ink-secondary">
          {d.avisos.map((a) => (
            <li key={a}>· {a}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function ResumenResidencial() {
  const project = useShown((s) => s.project)
  const todos = useDerivados()
  if (!todos.length) return null
  const nombre = (id: Id) => project.buildings.find((b) => b.id === id)?.name ?? id
  return (
    <section aria-label="Uso mixto" className="flex flex-col gap-3">
      <h2 className="text-label text-ink-secondary">Uso mixto</h2>
      {todos.map(({ buildingId, d }) => (
        <Edificio key={buildingId} buildingId={buildingId} d={d} titulo={todos.length > 1 ? nombre(buildingId) : null} />
      ))}
    </section>
  )
}
