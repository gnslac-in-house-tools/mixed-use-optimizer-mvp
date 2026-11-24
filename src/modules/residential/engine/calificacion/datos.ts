// Los datos del proyecto para las fórmulas de la calificación: los números con nombre (`m2_vendibles`, `ingreso`, …) que
// salen de `derivar` sumado sobre los edificios de la opción. Puro; `calificacionDe` se memoiza por proyecto y opción.
import type { Id, Project } from '../../../../model/schema.ts'
import { paramsDe } from '../defaults.ts'
import { derivar, predioDe } from '../derivar.ts'
import { calificar, type Calificacion } from './calificar.ts'
import type { Datos } from './formula.ts'
import { reglasDe } from './reglas.ts'

/** Los nombres que las fórmulas pueden usar, en orden; `pieza` es la pieza de trabajo que los llena (2: aún sin dato). */
export const DATOS_CALIFICACION: { k: string; label: string; pieza: 1 | 2 }[] = [
  { k: 'm2_vendibles', label: 'm² vendibles', pieza: 1 },
  { k: 'm2_brutos', label: 'm² brutos', pieza: 1 },
  { k: 'indice_usado', label: 'Índice usado', pieza: 1 },
  { k: 'indice_permitido', label: 'Índice permitido', pieza: 1 },
  { k: 'ajuste_mezcla', label: 'Ajuste a la mezcla', pieza: 1 },
  { k: 'unidades', label: 'Unidades', pieza: 1 },
  { k: 'cajones', label: 'Cajones', pieza: 1 },
  { k: 'ingreso', label: 'Ingreso', pieza: 1 },
  { k: 'costo', label: 'Costo', pieza: 1 },
  { k: 'unidades_bajo_tope', label: 'Unidades bajo el tope', pieza: 2 },
  { k: 'costo_parking', label: 'Costo del estacionamiento', pieza: 2 },
  { k: 'sotanos', label: 'Sótanos', pieza: 2 },
]

/** 1 − la mitad de la distancia L1 entre la mezcla objetivo (%) y la real (partes de 1): 1 exacta, 0 ajena. */
export function mixFit(objetivo: Record<string, number>, real: Record<string, number>): number {
  const ids = new Set([...Object.keys(objetivo), ...Object.keys(real)])
  let d = 0
  for (const id of ids) d += Math.abs((objetivo[id] ?? 0) / 100 - (real[id] ?? 0))
  return 1 - d / 2
}

const vacios = (): Datos => Object.fromEntries(DATOS_CALIFICACION.map((d) => [d.k, null]))

/** Los datos de una opción; todo `null` si ningún edificio suyo tiene vivienda o comercio. */
export function datosCalificacion(p: Project, optionId: Id): Datos {
  const o = p.options.find((x) => x.id === optionId)
  const ds = (o?.buildingIds ?? []).flatMap((b) => {
    const d = derivar(p, b, o!.id)
    return d ? [{ b, d }] : []
  })
  const out = vacios()
  if (!ds.length) return out
  const sum = (c: 'nsa' | 'gfa' | 'units' | 'req' | 'revenue' | 'cost') => ds.reduce((a, { d }) => a + d.totals[c], 0)
  out.m2_vendibles = sum('nsa')
  out.m2_brutos = sum('gfa')
  out.unidades = sum('units')
  out.cajones = sum('req')
  out.ingreso = sum('revenue')
  out.costo = sum('cost')
  // el estacionamiento (sótanos con el motor de cajones) y los departamentos bajo el tope de precio de su edificio
  out.sotanos = ds.reduce((x, { d }) => x + d.estacionamiento.sotanos, 0)
  out.costo_parking = ds.reduce((x, { d }) => x + d.estacionamiento.costo, 0)
  out.unidades_bajo_tope = ds.reduce((x, { b, d }) => { const tope = paramsDe(p, b).tope; return x + d.unidades.filter((u) => u.precio <= tope).length }, 0)
  out.indice_permitido = ds[0].d.zoning.far
  // el área del predio: la del sitio de GIM (`derivar` corre sin predio, así que `totals.siteA` no la trae)
  const predio = predioDe(p, o!.id)
  out.indice_usado = predio ? out.m2_brutos / predio : null
  // la mezcla objetivo (%) de los edificios, ponderada por sus unidades, contra la real por tipo
  const tipos = p.residential?.tipos ?? []
  if (out.unidades > 0) {
    const objetivo: Record<string, number> = {}
    const real: Record<string, number> = {}
    for (const { b, d } of ds) {
      const m = paramsDe(p, b).mezcla
      const tot = Object.values(m).reduce((a, x) => a + x, 0) || 1
      for (const [id, x] of Object.entries(m)) objetivo[id] = (objetivo[id] ?? 0) + ((x / tot) * 100 * d.totals.units) / out.unidades
      tipos.forEach((t, k) => { real[t.id] = (real[t.id] ?? 0) + (d.totals.counts[k] ?? 0) / out.unidades! })
    }
    out.ajuste_mezcla = mixFit(objetivo, real)
  }
  return out
}

// ---- memo ------------------------------------------------------------------------------------------------------
const memo = new WeakMap<Project, Map<string, Calificacion>>()

/** Las opciones del proyecto con edificios de vivienda o comercio, para la mediana. */
const conMasas = (p: Project): Id[] =>
  p.options.filter((o) => o.buildingIds.some((b) => derivar(p, b, o.id) != null)).map((o) => o.id)

/** La calificación de la opción en vista (o la dada) frente a las demás opciones con masas residenciales. */
export function calificacionDe(p: Project, optionId?: Id): Calificacion {
  const id = optionId ?? p.options[0]?.id ?? ''
  let porOpcion = memo.get(p)
  if (!porOpcion) memo.set(p, (porOpcion = new Map()))
  let c = porOpcion.get(id)
  if (!c) {
    const { enUso, otras } = datosDeOpcion(p, id)
    porOpcion.set(id, (c = calificar(reglasDe(p), enUso, otras)))
  }
  return c
}

/** Los datos de la opción y los de las demás con masas residenciales (la mediana): lo que `calificar` lee. */
export function datosDeOpcion(p: Project, id: Id): { enUso: Datos; otras: Datos[] } {
  return { enUso: datosCalificacion(p, id), otras: conMasas(p).filter((x) => x !== id).map((x) => datosCalificacion(p, x)) }
}

