// Los datos con los que arranca un proyecto de uso mixto, y los parámetros de un edificio que aún no tiene los suyos.
import type { Id, Project } from '../../../model/schema.ts'
import { UNIT_TEMPLATES } from './gfit/src/model/program.ts'
import type { ParamsEdificio, Residential } from './schema.ts'

/** Los colores de tipo de la pieza 1, y sus nombres en español («rec.» es recámara). */
const TIPOS: Record<string, { name: string; color: string }> = {
  studio: { name: 'Estudio', color: '#F4C3C5' },
  br1: { name: '1 rec.', color: '#5BB58C' },
  br2: { name: '2 rec.', color: '#A99BE6' },
  br3: { name: '3 rec.', color: '#EE9362' },
}

export const ENTREPISO_VIVIENDA = 3.0
export const ENTREPISO_COMERCIO = 4.5

export function RESIDENTIAL0(programIds: { vivienda: Id; comercio: Id; nucleo: Id }): Residential {
  return {
    usos: {
      [programIds.vivienda]: { uso: 'vivienda', entrepiso: ENTREPISO_VIVIENDA },
      [programIds.comercio]: { uso: 'comercio', entrepiso: ENTREPISO_COMERCIO },
      [programIds.nucleo]: { uso: 'nucleo', entrepiso: ENTREPISO_VIVIENDA },
    },
    tipos: UNIT_TEMPLATES().map((t) => ({ ...t, ...(TIPOS[t.id] ?? {}) })),
    edificios: {},
  }
}

/** Los de GFit (`blankBuilding`), salvo el pasillo, que va a 1.8 m, y la semilla. */
export const PARAMS0: ParamsResueltos = { fondo: 8.1, pasillo: 1.8, mezcla: { studio: 30, br1: 45, br2: 25 }, semilla: 1, sotanos: null, tope: 250000 }
/** los parámetros con los opcionales resueltos */
export type ParamsResueltos = Omit<ParamsEdificio, 'sotanos' | 'tope'> & { sotanos: number | null; tope: number }

export function paramsDe(p: Project, buildingId: Id): ParamsResueltos {
  const own = p.residential?.edificios[buildingId]
  return own ? { ...own, mezcla: { ...own.mezcla }, sotanos: own.sotanos ?? null, tope: own.tope ?? PARAMS0.tope } : { ...PARAMS0, mezcla: { ...PARAMS0.mezcla } }
}
