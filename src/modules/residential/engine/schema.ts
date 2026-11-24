// Los datos del módulo residencial en el proyecto (`Project.residential`), como bodegas guarda `warehouseTypes`. Solo
// importa zod: `model/schema.ts` lo importa para su línea de `ProjectSchema`, y así no hay ciclo.
import { z } from 'zod'
import { CalificacionSchema } from './calificacion/reglas.ts'

const Id = z.string().min(1)

/** Qué es cada programa para el motor de GFit: vivienda o comercio (dan niveles) o núcleo; y su altura de entrepiso. */
export const UsoSchema = z.object({
  uso: z.enum(['vivienda', 'comercio', 'nucleo']),
  entrepiso: z.number().positive(),
})
export type Uso = z.infer<typeof UsoSchema>

/** Un tipo de departamento, con la forma del `UnitType` de GFit. */
export const TipoSchema = z.object({
  id: Id,
  name: z.string(),
  color: z.string(),
  rooms: z.array(z.string()),
  wMin: z.number().positive(),
  wMax: z.number().positive(),
  price: z.number().nonnegative(),
  stalls: z.number().nonnegative(),
})

/** Los parámetros de GFit de un edificio: fondo de unidad, ancho de pasillo (m), mezcla objetivo (%) y semilla. */
export const ParamsEdificioSchema = z.object({
  fondo: z.number().positive(),
  pasillo: z.number().positive(),
  mezcla: z.record(z.string(), z.number().nonnegative()),
  semilla: z.number().int(),
  /** sótanos de estacionamiento; null o ausente: los que pide el programa (hasta 5) */
  sotanos: z.number().int().min(0).max(6).nullable().optional(),
  /** precio tope de una unidad (FAPRIVI) para la velocidad de venta */
  tope: z.number().positive().optional(),
})
export type ParamsEdificio = z.infer<typeof ParamsEdificioSchema>

export const ResidentialSchema = z.object({
  /** por id de programa */
  usos: z.record(Id, UsoSchema),
  tipos: z.array(TipoSchema),
  /** por id de edificio; un edificio sin los suyos usa los de `paramsDe` */
  edificios: z.record(Id, ParamsEdificioSchema),
  /** las reglas de la calificación por palancas; sin ellas rigen `REGLAS_INICIO` */
  calificacion: CalificacionSchema.optional().catch(undefined),
})
export type Residential = z.infer<typeof ResidentialSchema>
