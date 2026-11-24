// La calificación de la opción en vista y las palancas desplegadas en la pestaña «Calificación». Las palancas abiertas
// son estado de vista de la sesión (como el Brief de GIM): ni en el proyecto ni en el historial.
import { create } from 'zustand'
import type { Id, Project } from '../../../../model/schema.ts'
import { useLooking, useShown } from '../../../../views/viewport/look.ts'
import { showPanel, useUi } from '../../../../views/layout/ui.ts'
import { isolatedProject, useIsolate, type Isolated } from '../../../../views/stats/isolate.ts'
import type { Calificacion } from '../../engine/calificacion/calificar.ts'
import { calificacionDe } from '../../engine/calificacion/datos.ts'
import type { Palanca } from '../../engine/calificacion/reglas.ts'

// el proyecto aislado, uno por proyecto y aislamiento: estable, para que la memoria de `calificacionDe` sirva
const aislados = new WeakMap<Project, Map<string, Project>>()
function aislar(p: Project, isolated: Isolated): Project {
  if (!isolated) return p
  const clave = `${isolated.kind}:${isolated.id}`
  let porClave = aislados.get(p)
  if (!porClave) aislados.set(p, (porClave = new Map()))
  let q = porClave.get(clave)
  if (!q) porClave.set(clave, (q = isolatedProject(p, isolated)))
  return q
}

/**
 * El proyecto y la opción que lee la barra de KPIs (views/stats/KpiStrip.tsx): lo que se mira, si no lo aislado en el
 * Overview, si no el diseño. La celda y la pestaña leen de aquí, así dicen lo mismo que la cifra de la barra.
 */
export function useEnVista(): { project: Project; option: Id } {
  const project = useShown((s) => s.project)
  const option = useShown((s) => s.derived.option)
  const mirando = useLooking()
  const isolated = useIsolate((s) => s.isolated)
  return { project: mirando ? project : aislar(project, isolated), option }
}

/** La calificación de lo que la barra muestra (lo que se mira, lo aislado o el diseño), memoizada en `calificacionDe`. */
export function useCalificacion(): Calificacion {
  const { project, option } = useEnVista()
  return calificacionDe(project, option)
}

interface Abiertas {
  abiertas: Palanca[]
  alternar(p: Palanca): void
}

export const usePalancasAbiertas = create<Abiertas>()((set, get) => ({
  abiertas: [],
  alternar: (p) => set({ abiertas: get().abiertas.includes(p) ? get().abiertas.filter((x) => x !== p) : [...get().abiertas, p] }),
}))

/** Abre la pestaña «Calificación» con la palanca desplegada (y el panel a la vista): lo que hace la celda de la barra. */
export function abrirPalanca(p: Palanca): void {
  const { abiertas } = usePalancasAbiertas.getState()
  if (!abiertas.includes(p)) usePalancasAbiertas.setState({ abiertas: [...abiertas, p] })
  useUi.getState().setSummaryTab('calificacion')
  showPanel('right')
}
