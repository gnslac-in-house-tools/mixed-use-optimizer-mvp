// Los KPIs de uso mixto (Decision "Catalog" de GIM): las cifras de GFit sumadas sobre los edificios de la opción en
// vista, leídas de `derivar`. Los ids no cambian: los proyectos guardados conservan los que eligieron.
import type { KpiDef } from '../../engine/kpis.ts'
import type { Derived } from '../../engine/types.ts'
import type { Project } from '../../model/schema.ts'
import { derivar } from './engine/derivar.ts'
import type { Totals } from './engine/gfit/src/model/calc.ts'

type Campo = 'gfa' | 'nsa' | 'units' | 'req' | 'revenue' | 'cost'

/** La suma de un campo de los totales de GFit sobre los edificios de la opción; null si ninguno tiene vivienda o comercio. */
function suma(p: Project, d: Derived, campos: Campo[]): Record<Campo, number> | null {
  const o = p.options.find((x) => x.id === d.option) ?? p.options[0]
  const ts: Totals[] = (o?.buildingIds ?? []).flatMap((b) => derivar(p, b, o?.id)?.totals ?? [])
  if (!ts.length) return null
  const out = {} as Record<Campo, number>
  for (const c of campos) out[c] = ts.reduce((a, t) => a + t[c], 0)
  return out
}
const campo = (c: Campo) => (p: Project, d: Derived) => suma(p, d, [c])?.[c] ?? null

export const RESIDENTIAL_KPIS: KpiDef[] = [
  { id: 'res-gfa', label: 'Área construida', unit: 'm2', area: 'massing', help: 'GFA de los niveles de vivienda y comercio que deriva GFit', read: campo('gfa') },
  { id: 'res-vendible', label: 'Área vendible', unit: 'm2', area: 'massing', help: 'Área neta vendible o rentable de GFit', read: campo('nsa') },
  { id: 'res-unidades', label: 'Departamentos', unit: 'count', area: 'massing', help: 'Departamentos que acomoda GFit sobre los módulos de la retícula', read: campo('units') },
  { id: 'res-cajones', label: 'Cajones requeridos', unit: 'count', area: 'massing', help: 'Cajones que pide el programa (vivienda por unidad, comercio por m²)', read: campo('req') },
  {
    id: 'res-margen', label: 'Margen', unit: 'pct', area: 'massing', help: 'Ingreso menos costo (con terreno) entre el ingreso',
    read: (p, d) => {
      const s = suma(p, d, ['revenue', 'cost'])
      // el costo de GFit ya trae el terreno (calcOption: r.cost += r.land)
      return s && s.revenue ? ((s.revenue - s.cost) / s.revenue) * 100 : null
    },
  },
]

export const RESIDENTIAL_KPI_IDS = RESIDENTIAL_KPIS.map((k) => k.id)
