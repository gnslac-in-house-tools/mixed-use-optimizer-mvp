// Las reglas de la calificación por palancas: esquema, reglas de inicio y validación de una variable.
// Solo importa zod en ejecución (`engine/schema.ts` lo importa): sin ciclos.
import { z } from 'zod'
import type { Project } from '../../../../model/schema.ts'

export type Palanca = 'm2_vendibles' | 'precio_producto' | 'velocidad_venta' | 'costo_obra' | 'plazo_riesgo'
export const PALANCAS: Palanca[] = ['m2_vendibles', 'precio_producto', 'velocidad_venta', 'costo_obra', 'plazo_riesgo']
export const PALANCA_ES: Record<Palanca, string> = {
  m2_vendibles: 'm² vendibles',
  precio_producto: 'Precio de producto',
  velocidad_venta: 'Velocidad de venta',
  costo_obra: 'Costo de obra',
  plazo_riesgo: 'Plazo / riesgo',
}

export type Modo = 'higher' | 'lower' | 'vsMedianHigher' | 'vsMedianLower'
export const MODO_ES: Record<Modo, string> = {
  higher: 'Mayor es mejor',
  lower: 'Menor es mejor',
  vsMedianHigher: 'Sobre la mediana',
  vsMedianLower: 'Bajo la mediana',
}

const PalancaSchema = z.enum(['m2_vendibles', 'precio_producto', 'velocidad_venta', 'costo_obra', 'plazo_riesgo'])
const Umbral = z.number().nullable()

export const VariableSchema = z.object({
  id: z.string().min(1),
  label: z.string(),
  lever: PalancaSchema,
  formula: z.string(),
  mode: z.enum(['higher', 'lower', 'vsMedianHigher', 'vsMedianLower']),
  /** umbrales de +2, +1, 0 y −1; uno en `null` se salta */
  steps: z.tuple([Umbral, Umbral, Umbral, Umbral]),
  unit: z.string(),
  legalRef: z.string(),
})
export type Variable = z.infer<typeof VariableSchema>

const Peso = z.number().nonnegative()
export const CalificacionSchema = z.object({
  provisional: z.boolean(),
  source: z.string(),
  weights: z.object({
    m2_vendibles: Peso,
    precio_producto: Peso,
    velocidad_venta: Peso,
    costo_obra: Peso,
    plazo_riesgo: Peso,
  }),
  variables: z.array(VariableSchema),
})
export type Reglas = z.infer<typeof CalificacionSchema>

export const REGLAS_INICIO: Reglas = {
  provisional: true,
  source: 'SPEC_DEMO §5 · umbrales provisionales hasta recibir Variables_Herramienta_Optimizacion_Residencial.xlsx',
  weights: { m2_vendibles: 1, precio_producto: 1, velocidad_venta: 1, costo_obra: 1, plazo_riesgo: 1 },
  variables: [
    { id: 'uso_indice', label: 'Uso del índice de edificabilidad', lever: 'm2_vendibles', formula: 'indice_usado / indice_permitido', mode: 'higher', steps: [0.95, 0.85, 0.75, 0.6], unit: 'ratio', legalRef: 'POT · índice de edificabilidad' },
    { id: 'eficiencia', label: 'Eficiencia vendible / bruta', lever: 'm2_vendibles', formula: 'm2_vendibles / m2_brutos', mode: 'higher', steps: [0.75, 0.7, 0.65, 0.6], unit: 'ratio', legalRef: 'NRD-2 · núcleo y circulación' },
    { id: 'precio_m2', label: 'Ingreso por m² vendible', lever: 'precio_producto', formula: 'ingreso / m2_vendibles', mode: 'vsMedianHigher', steps: [0.05, 0.02, -0.02, -0.05], unit: 'USD/m²', legalRef: 'FAPRIVI · topes de precio' },
    { id: 'ajuste_mezcla', label: 'Ajuste a la mezcla objetivo', lever: 'precio_producto', formula: 'ajuste_mezcla', mode: 'higher', steps: [0.9, 0.8, 0.7, 0.6], unit: 'ratio', legalRef: 'Estudio de mercado · mezcla objetivo' },
    { id: 'ticket', label: 'Unidades bajo el tope FAPRIVI', lever: 'velocidad_venta', formula: 'unidades_bajo_tope / unidades', mode: 'higher', steps: [0.6, 0.4, 0.2, 0.1], unit: '%', legalRef: 'FAPRIVI · ticket máximo' },
    { id: 'costo_m2', label: 'Costo por m² vendible', lever: 'costo_obra', formula: 'costo / m2_vendibles', mode: 'vsMedianLower', steps: [-0.05, -0.02, 0.02, 0.05], unit: 'USD/m²', legalRef: 'AGIES · estructura' },
    { id: 'parking_unidad', label: 'Costo de parking por unidad', lever: 'costo_obra', formula: 'costo_parking / unidades', mode: 'vsMedianLower', steps: [-0.05, -0.02, 0.02, 0.05], unit: 'USD/unidad', legalRef: 'POT · dotación de estacionamientos' },
    { id: 'sotanos', label: 'Número de sótanos', lever: 'plazo_riesgo', formula: 'sotanos', mode: 'lower', steps: [null, null, 1, 2], unit: 'niveles', legalRef: 'AGIES · NRD-2' },
  ],
}

/** Las reglas del proyecto, o las de inicio si no definió las suyas. */
export function reglasDe(p: Project): Reglas {
  return p.residential?.calificacion ?? REGLAS_INICIO
}

/** Por qué una variable no está bien definida (umbrales), o `null` si lo está. */
export function validarVariable(v: Variable): string | null {
  const s = v.steps.filter((x): x is number => x != null)
  if (s.length < 1) return 'pon al menos un umbral'
  const desc = v.mode === 'higher' || v.mode === 'vsMedianHigher'
  for (let i = 1; i < s.length; i++) {
    const ok = desc ? s[i] <= s[i - 1] : s[i] >= s[i - 1]
    if (!ok) return desc ? 'los umbrales deben ir de mayor a menor (+2 → −1)' : 'los umbrales deben ir de menor a mayor (+2 → −1)'
  }
  return null
}
