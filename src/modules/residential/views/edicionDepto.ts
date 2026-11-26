// Cómo se edita un departamento dibujado en la planta y el 3D (spec 2026-11-26-blocks-residenciales): a quién va el
// cambio (su tipo o solo esa unidad) y qué se edita. Estado de vista.
import { create } from 'zustand'
import type { Destino } from '../engine/edicionDepto.ts'

export type ModoDepto = 'muros' | 'muebles' | 'puerta' | 'ventana'

export const useEdicionDepto = create<{ destino: Destino; modo: ModoDepto; poner: (x: Partial<{ destino: Destino; modo: ModoDepto }>) => void }>((set) => ({
  destino: 'tipo',
  modo: 'muros',
  poner: (x) => set(x),
}))
