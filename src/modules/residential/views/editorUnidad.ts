// Qué plano de Mi biblioteca está abierto en el editor de departamentos (la ventana «Departamento»). Estado de vista.
import { create } from 'zustand'

export const useEditorUnidad = create<{ id: string | null; abrir: (id: string) => void }>((set) => ({ id: null, abrir: (id) => set({ id }) }))
