// El piso que se ve de uso mixto: null, la planta tipo de las masas del nivel elegido (como antes); un número, ese nivel
// de GFit (índice en `niveles`); 'sotano', el sótano tipo con sus cajones. Los recintos y muebles de los departamentos
// se prenden con Programs y Furniture de la barra inferior (views/show/interiors.ts). Estado de vista, fuera del proyecto.
import { create } from 'zustand'

export type Piso = number | 'sotano' | null
export const usePiso = create<{ piso: Piso; set: (p: Piso) => void }>((set) => ({ piso: null, set: (piso) => set({ piso }) }))
