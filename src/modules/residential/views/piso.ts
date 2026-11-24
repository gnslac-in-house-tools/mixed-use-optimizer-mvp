// El piso que se ve de uso mixto: null, la planta tipo de las masas del nivel elegido (como antes); un número, ese nivel
// de GFit (índice en `niveles`); 'sotano', el sótano tipo con sus cajones. `interiores`: los recintos de cada
// departamento (los que GFit acomoda en él) en planta y en 3D. Estado de vista, fuera del proyecto.
import { create } from 'zustand'

export type Piso = number | 'sotano' | null
export const usePiso = create<{ piso: Piso; interiores: boolean; set: (p: Piso) => void; alternarInteriores: () => void }>((set) => ({
  piso: null,
  interiores: false,
  set: (piso) => set({ piso }),
  alternarInteriores: () => set((s) => ({ interiores: !s.interiores })),
}))
