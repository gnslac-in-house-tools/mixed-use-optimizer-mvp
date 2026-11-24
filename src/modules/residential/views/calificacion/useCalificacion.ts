// La calificación de la opción en vista y las palancas desplegadas en la pestaña «Calificación». Las palancas abiertas
// son estado de vista de la sesión (como el Brief de GIM): ni en el proyecto ni en el historial.
import { create } from 'zustand'
import { useShown } from '../../../../views/viewport/look.ts'
import { showPanel, useUi } from '../../../../views/layout/ui.ts'
import type { Calificacion } from '../../engine/calificacion/calificar.ts'
import { calificacionDe } from '../../engine/calificacion/datos.ts'
import type { Palanca } from '../../engine/calificacion/reglas.ts'

/** La calificación de la opción en vista (o la que se mira), memoizada por proyecto y opción en `calificacionDe`. */
export function useCalificacion(): Calificacion {
  const project = useShown((s) => s.project)
  const option = useShown((s) => s.derived.option)
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
