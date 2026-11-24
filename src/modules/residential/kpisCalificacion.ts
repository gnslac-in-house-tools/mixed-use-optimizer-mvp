// Los KPIs de la calificación por palancas: el puntaje y el rating (-2 a 2) de cada palanca de la opción en vista,
// leídos de `calificacionDe`. Se registran para que la barra de KPIs de GIM los pueda mostrar.
import type { KpiDef } from '../../engine/kpis.ts'
import type { Derived } from '../../engine/types.ts'
import type { Project } from '../../model/schema.ts'
import { calificacionDe } from './engine/calificacion/datos.ts'
import { PALANCAS, PALANCA_ES, REGLAS_INICIO, reglasDe } from './engine/calificacion/reglas.ts'
import type { Palanca } from './engine/calificacion/reglas.ts'

const PREFIJO = 'calif-'

/** Los KPIs de la calificación; `help` trae la fuente de las reglas del proyecto (o las de inicio sin proyecto). */
function armar(ayuda: string): KpiDef[] {
  const base = { unit: 'count' as const, area: 'massing' as const, aim: false as const }
  const opcion = (d: Derived) => d.option
  const puntaje = (p: Project, d: Derived) => calificacionDe(p, opcion(d)).puntaje
  const puntajeKpi: KpiDef = {
    ...base, id: PREFIJO + 'puntaje', label: 'Calificación', help: ayuda,
    read: puntaje,
    status: (p, d) => {
      const v = puntaje(p, d)
      return v === null || v === 0 ? null : v > 0 ? 'within' : 'over'
    },
  }
  const palancas = PALANCAS.map((x: Palanca): KpiDef => ({
    ...base, id: PREFIJO + x, label: PALANCA_ES[x], help: ayuda,
    read: (p, d) => calificacionDe(p, opcion(d)).palancas.find((l) => l.palanca === x)?.rating ?? null,
  }))
  return [puntajeKpi, ...palancas]
}
/** Los KPIs con la ayuda de las reglas de inicio (el catálogo estático). */
export const KPIS_CALIFICACION: KpiDef[] = armar(REGLAS_INICIO.source)

/** Los KPIs con la fuente de las reglas del proyecto. */
export function kpisCalificacion(p: Project): KpiDef[] {
  const fuente = reglasDe(p).source
  return KPIS_CALIFICACION.map((k) => ({ ...k, help: fuente }))
}

/** El juego de KPIs de la calificación para la barra: puntaje, las 5 palancas y los avisos. */
export const JUEGO_CALIFICACION: string[] = [PREFIJO + 'puntaje', ...PALANCAS.map((x) => PREFIJO + x), 'issues']

export const esKpiCalificacion = (id: string): boolean => id.startsWith(PREFIJO)
