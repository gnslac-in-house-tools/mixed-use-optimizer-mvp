// Estado de la app: qué biblioteca se ve, qué plano está elegido, el filtro por tipo y Mi biblioteca (guardada en
// el navegador). La Biblioteca GFit se genera con el motor; no se guarda.
import { create } from 'zustand'
import type { PlanCatalogo } from '../engine/catalogo'
import { FONDO0, TIPOS, bibliotecaGFit, copiaDe, planNuevo } from '../engine/catalogo'

const CLAVE = 'muo-mvp.catalogo.v1'

function leer(): PlanCatalogo[] {
  try {
    const raw = localStorage.getItem(CLAVE)
    const v = raw ? JSON.parse(raw) : []
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

export type Lib = 'gfit' | 'mia'

interface App {
  lib: Lib
  mia: PlanCatalogo[]
  gfit: PlanCatalogo[]
  sel: string | null
  filtro: string | null
  aviso: string | null
  setLib: (l: Lib) => void
  setSel: (id: string | null) => void
  setFiltro: (t: string | null) => void
  setAviso: (t: string | null) => void
  /** genera un plano con el motor (o vacío) y lo agrega a Mi biblioteca; null si las medidas no sirven */
  crear: (typeId: string, w: number, d: number, vacio: boolean) => string | null
  /** copia un plano (de cualquier biblioteca) a Mi biblioteca */
  copiar: (id: string) => string | null
  borrar: (id: string) => void
  renombrar: (id: string, name: string) => void
}

const guardar = (mia: PlanCatalogo[]) => {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(mia))
  } catch {
    /* sin almacenamiento: Mi biblioteca vive solo en esta sesión */
  }
}

export const planDe = (s: Pick<App, 'mia' | 'gfit'>, id: string | null) => (id ? s.mia.find((p) => p.id === id) ?? s.gfit.find((p) => p.id === id) ?? null : null)

const gfit0 = bibliotecaGFit(TIPOS, FONDO0)

export const useApp = create<App>((set, get) => ({
  lib: 'gfit',
  mia: leer(),
  gfit: gfit0,
  sel: gfit0.find((p) => p.id === 'G-br2-estandar')?.id ?? gfit0[0]?.id ?? null,
  filtro: null,
  aviso: null,
  setLib: (lib) => set({ lib }),
  setSel: (sel) => set({ sel }),
  setFiltro: (filtro) => set({ filtro }),
  setAviso: (aviso) => set({ aviso }),
  crear: (typeId, w, d, vacio) => {
    const t = TIPOS.find((x) => x.id === typeId)
    if (!t || !(w >= 2 && d >= 2) || w > 30 || d > 30) return null
    const p = planNuevo(t, w, d, get().mia, vacio)
    const mia = [...get().mia, p]
    guardar(mia)
    set({ mia, sel: p.id, lib: 'mia' })
    return p.id
  },
  copiar: (id) => {
    const p = planDe(get(), id)
    if (!p) return null
    const mia = get().mia
    const c = copiaDe(p, mia, p.id.startsWith('G-') ? p.name : p.name + ' (copia)')
    const next = [...mia, c]
    guardar(next)
    set({ mia: next, sel: c.id })
    return c.id
  },
  borrar: (id) => {
    const mia = get().mia.filter((p) => p.id !== id)
    guardar(mia)
    set((s) => ({ mia, sel: s.sel === id ? (mia[0]?.id ?? s.gfit[0]?.id ?? null) : s.sel }))
  },
  renombrar: (id, name) => {
    const mia = get().mia.map((p) => (p.id === id ? { ...p, name: name.trim() || p.name } : p))
    guardar(mia)
    set({ mia })
  },
}))
