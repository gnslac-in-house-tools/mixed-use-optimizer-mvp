// El módulo residencial (pieza 1 del MVP de uso mixto): niveles, plantas tipo y departamentos que el motor de GFit
// deriva de las masas de Vivienda y Comercio, con los muros sobre los módulos de la retícula. Presente cuando el
// proyecto tiene alguna masa de Vivienda o Comercio.
import type { Project } from '../../model/schema.ts'
import type { Module } from '../types.ts'
import { RESIDENTIAL_KPIS } from './kpis.ts'
import { kpisCalificacion } from './kpisCalificacion.ts'

/** El proyecto tiene alguna masa cuyo programa es de vivienda o de comercio. */
export function tieneResidencial(p: Project): boolean {
  const usos = p.residential?.usos
  if (!usos) return false
  return p.masses.some((m) => {
    const u = m.programId ? usos[m.programId]?.uso : undefined
    return u === 'vivienda' || u === 'comercio'
  })
}

export const residential: Module = {
  id: 'residential',
  label: 'Uso mixto',
  present: tieneResidencial,
  kpis: (p) => [...RESIDENTIAL_KPIS, ...kpisCalificacion(p)],
  measures: [],
  params: [],
}
