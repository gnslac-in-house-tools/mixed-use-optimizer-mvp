// Las tipologías del proyecto de referencia (spec 2026-11-26-blocks-residenciales): Tipología 85 m², 105 m² y 150 m²
// en esquina, medidas de la lámina del compañero (56.7 px/m en la lámina ampliada; las tres dan la misma escala). En el
// marco de un plano de Mi biblioteca: x a lo largo de la fachada, y de la fachada (y = 0) hacia la entrada. Los muros
// interiores van a su eje. La de 150 es una L: su contorno se guarda (`PlanCatalogo.contorno`). Puro.
import type { Project } from '../../../model/schema.ts'
import { amueblar, REGLAS0, type PlanCatalogo, type PlanRecinto, type Puerta, type Ring, type Ventana } from './catalogo.ts'
import type { Tipo } from './schema.ts'

/** El contorno de un plano en su marco: el suyo, o el rectángulo w × d. */
export const contornoDe = (p: { w: number; d: number; contorno?: Ring }): Ring =>
  p.contorno ?? [[0, 0], [p.w, 0], [p.w, p.d], [0, p.d]]

const areaAnillo = (r: Ring) => Math.abs(r.reduce((s, q, i) => { const n = r[(i + 1) % r.length]; return s + q[0] * n[1] - n[0] * q[1] }, 0) / 2)

/** m²: el área del contorno del plano. */
export const areaPlan = (p: { w: number; d: number; contorno?: Ring }) => areaAnillo(contornoDe(p))

const rect = (x0: number, y0: number, x1: number, y1: number): Ring => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]
const R = (kind: string, name: string, shape: Ring): PlanRecinto => ({ kind, name, shape })
const px = (eje: 'x' | 'y', x: number, y: number, ancho = 0.9): Puerta => ({ eje, x, y, ancho })
const vn = (x: number, ancho: number): Ventana => ({ x, ancho })

/** Los tipos de departamento de las tres tipologías (para GFit: sus recintos de plantilla, su ancho, su precio). */
export const TIPOS_REFERENCIA: Tipo[] = [
  { id: 't85', name: 'Tipología 85 m²', color: '#A8C6E8', rooms: ['R-01', 'R-07', 'R-05', 'R-09'], wMin: 10.6, wMax: 11.2, price: 3800, stalls: 1 },
  { id: 't105', name: 'Tipología 105 m²', color: '#E8B86B', rooms: ['R-01', 'R-08', 'R-07', 'R-05', 'R-05', 'R-09'], wMin: 13.0, wMax: 13.6, price: 3700, stalls: 1.5 },
  { id: 't150', name: 'Tipología 150 m² esquina', color: '#C58BC9', rooms: ['R-02', 'R-08', 'R-08', 'R-07', 'R-05', 'R-05', 'R-05', 'R-05', 'R-09'], wMin: 12.6, wMax: 13.2, price: 3900, stalls: 2 },
]

function plan(id: string, typeId: string, name: string, w: number, d: number, rooms: PlanRecinto[], puertas: Puerta[], ventanas: Ventana[], contorno?: Ring): PlanCatalogo {
  return {
    id, name, origen: 'manual', typeId, w, d, rooms, muebles: amueblar(rooms, REGLAS0).muebles, reglas: REGLAS0, puertas, ventanas,
    ...(contorno ? { contorno } : {}),
  }
}

/** Los planos de las tres tipologías, como Mi biblioteca los guarda. */
export function planesReferencia(): PlanCatalogo[] {
  return [
    plan('ref-85', 't85', 'Tipología 85 m²', 10.86, 7.88, [
      R('living', 'Salón', rect(0, 0, 5.37, 7.88)),
      R('master', 'Habitación principal', rect(5.37, 0, 10.86, 5.14)),
      R('storage', 'Walk-in closet', rect(5.37, 5.14, 10.86, 6.17)),
      R('laundry', 'Cuarto de lavado', rect(5.37, 6.17, 7.46, 7.88)),
      R('bath', 'Baño', rect(7.46, 6.17, 10.86, 7.88)),
    ], [px('x', 5.37, 4.4), px('y', 9.6, 5.14), px('y', 9.0, 6.17, 0.8), px('x', 5.37, 7.0, 0.8)], [vn(2.7, 3.0), vn(8.1, 2.4)]),

    plan('ref-105', 't105', 'Tipología 105 m²', 13.3, 7.9, [
      R('living', 'Salón', rect(0, 0, 4.89, 7.9)),
      R('bed', 'Habitación', rect(4.89, 0, 8.63, 5.14)),
      R('master', 'Habitación principal', rect(8.63, 0, 13.3, 4.54)),
      R('hall', 'Vestíbulo', [[4.89, 5.14], [8.63, 5.14], [8.63, 4.54], [9.74, 4.54], [9.74, 6.17], [4.89, 6.17]]),
      R('storage', 'Walk-in closet', rect(9.74, 4.54, 13.3, 6.17)),
      R('laundry', 'Cuarto de lavado', rect(4.89, 6.17, 6.38, 7.9)),
      R('bath', 'Baño', rect(6.38, 6.17, 8.81, 7.9)),
      R('bath', 'Baño', rect(8.81, 6.17, 13.3, 7.9)),
    ], [
      px('x', 4.89, 5.65), px('y', 6.8, 5.14), px('y', 9.2, 4.54, 0.8), px('x', 9.74, 5.35, 0.8),
      px('y', 5.6, 6.17, 0.7), px('y', 7.6, 6.17, 0.8), px('y', 11.5, 6.17, 0.8),
    ], [vn(2.45, 3.0), vn(6.76, 2.0), vn(10.97, 2.4)]),

    plan('ref-150', 't150', 'Tipología 150 m² esquina', 12.87, 13.97, [
      R('living', 'Salón', [[4.14, 0], [12.87, 0], [12.87, 5.59], [6.93, 5.59], [6.93, 5.22], [4.14, 5.22]]),
      R('bed', 'Habitación', [[0, 1.16], [4.14, 1.16], [4.14, 5.22], [2.43, 5.22], [2.43, 6.27], [0, 6.27]]),
      R('hall', 'Vestíbulo', [[2.43, 5.22], [6.93, 5.22], [6.93, 5.59], [8.08, 5.59], [8.08, 9.02], [7.01, 9.02], [7.01, 7.35], [5.45, 7.35], [5.45, 9.01], [3.85, 9.01], [3.85, 6.27], [2.43, 6.27]]),
      R('bath', 'Baño', rect(0, 6.27, 2.43, 9.01)),
      R('laundry', 'Cuarto de lavado', rect(2.43, 6.27, 3.85, 7.25)),
      R('bath', 'Baño', rect(2.43, 7.25, 3.85, 9.01)),
      R('bed', 'Habitación', rect(8.08, 5.59, 12.87, 9.02)),
      R('bath', 'Baño', rect(5.45, 7.35, 7.01, 9.85)),
      R('bath', 'Baño', rect(5.45, 9.85, 7.01, 13.97)),
      R('master', 'Habitación principal', [[7.01, 9.02], [12.87, 9.02], [12.87, 13.97], [8.65, 13.97], [8.65, 10.47], [7.01, 10.47]]),
      R('storage', 'Walk-in closet', rect(8.65 - 1.64, 10.47, 8.65, 13.97)),
    ], [
      px('y', 5.5, 5.22), px('y', 3.3, 5.22, 0.8), px('y', 1.2, 6.27, 0.8), px('x', 3.85, 6.75, 0.7), px('x', 3.85, 8.1, 0.7),
      px('x', 8.08, 7.5), px('y', 6.2, 7.35, 0.8), px('y', 7.55, 9.02), px('x', 8.65, 12.2, 0.8), px('x', 7.01, 12.5, 0.8),
    ], [vn(8.5, 4.0)], [[4.14, 0], [12.87, 0], [12.87, 13.97], [5.45, 13.97], [5.45, 9.01], [0, 9.01], [0, 1.16], [4.14, 1.16]]),
  ]
}

/** El proyecto con las tres tipologías: sus tipos y sus planos en Mi biblioteca (los que ya tiene no se repiten). */
export function agregarTipologias(p: Project): Project {
  const r = p.residential
  if (!r) return p
  const tipos = [...r.tipos, ...TIPOS_REFERENCIA.filter((t) => !r.tipos.some((x) => x.id === t.id))]
  const cat = r.catalogo ?? []
  const catalogo = [...cat, ...planesReferencia().filter((c) => !cat.some((x) => x.id === c.id))]
  return { ...p, residential: { ...r, tipos, catalogo } }
}

/** Dónde está la fachada (y = 0) a lo largo de x: de la orilla del contorno que la toca. */
export function fachadaDe(p: { w: number; d: number; contorno?: Ring }): [number, number] {
  const xs = contornoDe(p).filter(([, y]) => Math.abs(y) < 1e-6).map(([x]) => x)
  return xs.length >= 2 ? [Math.min(...xs), Math.max(...xs)] : [0, p.w]
}
