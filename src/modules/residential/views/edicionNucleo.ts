// El elemento de un núcleo elegido en la planta (spec 2026-11-26-blocks-residenciales): sus propiedades lo resaltan.
// Estado de vista.
import { create } from 'zustand'

export const useEdicionNucleo = create<{ elegido: string | null; elegir: (id: string | null) => void }>((set) => ({
  elegido: null,
  elegir: (elegido) => set({ elegido }),
}))
