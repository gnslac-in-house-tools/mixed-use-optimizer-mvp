// Los datos del módulo residencial en el proyecto (`Project.residential`), como bodegas guarda `warehouseTypes`. Solo
// importa zod: `model/schema.ts` lo importa para su línea de `ProjectSchema`, y así no hay ciclo.
import { z } from 'zod'
import { CalificacionSchema } from './calificacion/reglas.ts'

const Id = z.string().min(1)

/** Qué es cada programa para el motor de GFit: vivienda o comercio (dan niveles) o núcleo; y su altura de entrepiso. */
export const UsoSchema = z.object({
  uso: z.enum(['vivienda', 'comercio', 'nucleo', 'depto', 'circulacion']),
  entrepiso: z.number().positive(),
})
export type Uso = z.infer<typeof UsoSchema>
export type Tipo = z.infer<typeof TipoSchema>

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
  /** precio del terreno del edificio ($); GFit lo suma al costo */
  terreno: z.number().nonnegative().optional(),
})
export type ParamsEdificio = z.infer<typeof ParamsEdificioSchema>

// ---- pieza 3: Mi biblioteca de departamentos (los planos del catálogo que se editan), con la forma de PlanCatalogo
const PuntoSchema = z.tuple([z.number(), z.number()])
export const PlanCatalogoSchema = z.object({
  id: Id,
  name: z.string(),
  origen: z.enum(['generada', 'manual']),
  typeId: z.string(),
  w: z.number().positive(),
  d: z.number().positive(),
  rooms: z.array(z.object({ kind: z.string(), name: z.string(), shape: z.array(PuntoSchema) })),
  muebles: z.array(z.object({ id: z.string(), kind: z.string(), room: z.number().int(), x: z.number(), y: z.number(), rot: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]) })),
  reglas: z.object({ cama: z.enum(['matrimonial', 'queen', 'king']), comedor: z.union([z.literal(4), z.literal(6)]), paso: z.number(), closets: z.boolean() }),
  desde: z.string().optional(),
  puertas: z.array(z.object({ eje: z.enum(['x', 'y']), x: z.number(), y: z.number(), ancho: z.number().positive() })).optional(),
  ventanas: z.array(z.object({ x: z.number(), ancho: z.number().positive() })).optional(),
  fijas: z.object({ x: z.array(z.number().int()), y: z.array(z.number().int()) }).optional(),
  /** el contorno en su marco cuando no es el rectángulo w × d (una L); sin él, el rectángulo */
  contorno: z.array(PuntoSchema).optional(),
})

export const ResidentialSchema = z.object({
  /** por id de programa */
  usos: z.record(Id, UsoSchema),
  tipos: z.array(TipoSchema),
  /** por id de edificio; un edificio sin los suyos usa los de `paramsDe` */
  edificios: z.record(Id, ParamsEdificioSchema),
  /** las reglas de la calificación por palancas; sin ellas rigen `REGLAS_INICIO` */
  calificacion: CalificacionSchema.optional().catch(undefined),
  /** el POT del proyecto: índice de edificabilidad y altura máxima (m); la ocupación es la de las reglas del sitio */
  pot: z.object({ indice: z.number().positive(), altura: z.number().positive() }).optional().catch(undefined),
  /** Mi biblioteca: los planos de departamento del proyecto (pieza 3); uno mal guardado no rompe la carga */
  catalogo: z.array(PlanCatalogoSchema).optional().catch(undefined),
})
export type Residential = z.infer<typeof ResidentialSchema>
