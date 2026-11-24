// Estado del marco (GIM `views/layout/ui.ts`, recortado): qué paneles y barras se ven, el ancho arrastrado de cada
// panel, la vista del viewport (Planta · 3D · Dividida), el detalle, la pestaña de cada panel y el menú abierto.
// Se guarda en el navegador, como en GIM (`gfit.layout`).
import { create } from 'zustand'

export type Side = 'left' | 'right'
export type Vista = 'plan' | '3d' | 'split'
export type Detalle = 'esquema' | 'presentacion' | 'completo'
export type TabIzq = 'capas' | 'catalogo' | 'propiedades'
export type TabDer = 'resumen' | 'programa' | 'avisos'

export const PANEL_NAMES: Record<Side, string> = { left: 'Catálogo y propiedades', right: 'Resumen' }
export const MIN_PANEL_PX = 240
export const MAX_PANEL_PX = 640

interface Ui {
  panels: Record<Side, boolean>
  widths: Record<Side, number | null>
  show: { kpis: boolean; tools: boolean; drafting: boolean }
  vista: Vista
  detalle: Detalle
  tabIzq: TabIzq
  tabDer: TabDer
  setPanel: (s: Side, v: boolean) => void
  setWidth: (s: Side, w: number | null) => void
  setShow: (k: keyof Ui['show'], v: boolean) => void
  setVista: (v: Vista) => void
  setDetalle: (d: Detalle) => void
  setTabIzq: (t: TabIzq) => void
  setTabDer: (t: TabDer) => void
  reset: () => void
}

const CLAVE = 'muo-mvp.layout'
const BASE = {
  panels: { left: true, right: true },
  widths: { left: null, right: null },
  show: { kpis: true, tools: true, drafting: true },
  vista: '3d' as Vista,
  detalle: 'presentacion' as Detalle,
  tabIzq: 'catalogo' as TabIzq,
  tabDer: 'resumen' as TabDer,
}

function leer(): typeof BASE {
  try {
    const v = JSON.parse(localStorage.getItem(CLAVE) ?? '{}')
    return { ...BASE, ...v, panels: { ...BASE.panels, ...v.panels }, widths: { ...BASE.widths, ...v.widths }, show: { ...BASE.show, ...v.show } }
  } catch {
    return BASE
  }
}

export const useUi = create<Ui>((set) => ({
  ...leer(),
  setPanel: (s, v) => set((u) => ({ panels: { ...u.panels, [s]: v } })),
  setWidth: (s, w) => set((u) => ({ widths: { ...u.widths, [s]: w === null ? null : Math.round(Math.min(MAX_PANEL_PX, Math.max(MIN_PANEL_PX, w))) } })),
  setShow: (k, v) => set((u) => ({ show: { ...u.show, [k]: v } })),
  setVista: (vista) => set({ vista }),
  setDetalle: (detalle) => set({ detalle }),
  setTabIzq: (tabIzq) => set({ tabIzq }),
  setTabDer: (tabDer) => set({ tabDer }),
  reset: () => set(BASE),
}))

useUi.subscribe((u) => {
  try {
    const { panels, widths, show, vista, detalle, tabIzq, tabDer } = u
    localStorage.setItem(CLAVE, JSON.stringify({ panels, widths, show, vista, detalle, tabIzq, tabDer }))
  } catch {
    /* sin almacenamiento: el arreglo vive solo en esta sesión */
  }
})

/** Lo que pide reencuadrar la cámara (el botón del viewport y Ver › Encuadrar). */
export const encuadre: { ir: (() => void) | null } = { ir: null }
