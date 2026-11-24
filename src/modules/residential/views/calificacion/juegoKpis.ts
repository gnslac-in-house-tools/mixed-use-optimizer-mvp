// El juego de KPIs de la barra (spec §4): «Calificación» (por defecto: el puntaje, las 5 palancas e Issues) o «Proyecto»
// (los KPIs del proyecto con el puntaje como una celda más). Es estado de vista: se guarda en el navegador, no en el
// proyecto. Solo cuenta en un proyecto cuya tipología ofrece el módulo residencial; en los demás la barra es la de GIM.
import { create } from 'zustand'
import { chosenKpis, isOffered } from '../../../catalog.ts'
import type { Project } from '../../../../model/schema.ts'
import { JUEGO_CALIFICACION } from '../../kpisCalificacion.ts'

export type Juego = 'calificacion' | 'proyecto'
export const JUEGO_KEY = 'muo.kpiJuego'
const PUNTAJE = JUEGO_CALIFICACION[0]

// la barra (views/stats) solo puede importar las vistas de un módulo: de aquí lee qué celda es de la calificación
export { esKpiCalificacion } from '../../kpisCalificacion.ts'

const leer = (): Juego => {
  try {
    return localStorage.getItem(JUEGO_KEY) === 'proyecto' ? 'proyecto' : 'calificacion'
  } catch {
    return 'calificacion'
  }
}

interface JuegoKpis {
  juego: Juego
  setJuego(j: Juego): void
}

export const useJuegoKpis = create<JuegoKpis>()((set) => ({
  juego: leer(),
  setJuego: (juego) => {
    try {
      localStorage.setItem(JUEGO_KEY, juego)
    } catch {
      // sin almacenamiento (modo privado): la elección dura la sesión
    }
    set({ juego })
  },
}))

/** El proyecto tiene interruptor de juego: su tipología ofrece el módulo residencial. */
export const conJuego = (p: Project): boolean => isOffered(p, 'residential')

/** Los ids que muestra la barra: los del juego, o los del proyecto (los de GIM) sin el módulo. */
export function idsDeLaBarra(p: Project, juego: Juego): string[] {
  const propios = chosenKpis(p)
  if (!conJuego(p)) return propios
  if (juego === 'calificacion') return JUEGO_CALIFICACION
  if (propios.includes(PUNTAJE)) return propios
  // el puntaje, una celda más: antes de Issues si está, al final si no
  const i = propios.indexOf('issues')
  return i < 0 ? [...propios, PUNTAJE] : [...propios.slice(0, i), PUNTAJE, ...propios.slice(i)]
}
