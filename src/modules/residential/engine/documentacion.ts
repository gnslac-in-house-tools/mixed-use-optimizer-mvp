// La vista de documentación de un departamento (estilo Finch): el plano como lámina de arquitectura, en el marco del
// plano (x a lo largo de la fachada, y de la fachada hacia la entrada).
//   muros    el poché: los de fachada de MURO_EXT hacia adentro del contorno (con esquinas llenas, también la de
//            adentro de una L) y los interiores de 12 cm (cajasMuro), todos con los vanos de puertas y ventanas;
//   puertas  la hoja abierta a 90° y su abatimiento: bisagra, punta cerrada y punta abierta (radio = su ancho);
//   ventanas tres líneas a lo largo del vano en la fachada;
//   rótulos  el nombre y el área de cada recinto, en un punto dentro de él.
// Puro.
import type { PlanCatalogo, Ring } from './catalogo.ts'
import { cajasMuro } from './muros3d.ts'
import { contornoDe } from './tipologias.ts'

/** m: el muro de fachada */
export const MURO_EXT = 0.2
const EPS = 1e-6

type P = [number, number]
export interface PuertaDoc { bisagra: P; cerrada: P; abierta: P; /** el sentido del arco de cerrada a abierta (1: ángulo creciente) */ giro: 0 | 1 }
export interface RotuloDoc { nombre: string; kind: string; area: number; x: number; y: number }
export interface Doc { muros: Ring[]; puertas: PuertaDoc[]; ventanas: [P, P][][]; rotulos: RotuloDoc[] }

const area2 = (r: Ring) => r.reduce((s, q, i) => { const n = r[(i + 1) % r.length]; return s + q[0] * n[1] - n[0] * q[1] }, 0)
const rect = (x0: number, y0: number, x1: number, y1: number): Ring => [[Math.min(x0, x1), Math.min(y0, y1)], [Math.max(x0, x1), Math.min(y0, y1)], [Math.max(x0, x1), Math.max(y0, y1)], [Math.min(x0, x1), Math.max(y0, y1)]]

/** Lo que queda de [a, b] sin los huecos. */
function resta(a: number, b: number, huecos: [number, number][]): [number, number][] {
  let out: [number, number][] = [[a, b]]
  for (const [h0, h1] of huecos)
    out = out.flatMap(([p, q]) => {
      if (h1 <= p || h0 >= q) return [[p, q] as [number, number]]
      const r: [number, number][] = []
      if (h0 > p + EPS) r.push([p, h0])
      if (h1 < q - EPS) r.push([h1, q])
      return r
    })
  return out
}

function dentro(r: Ring, x: number, y: number): boolean {
  let c = false
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i], [xj, yj] = r[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c
  }
  return c
}

/** Un punto dentro del recinto para su rótulo: el centro de su caja si cae adentro; si no, el del rectángulo más grande que cabe. */
function puntoRotulo(r: Ring): P {
  const xs = r.map((q) => q[0]), ys = r.map((q) => q[1])
  const c: P = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2]
  if (dentro(r, ...c)) return c
  // en la rejilla de sus coordenadas, la celda más grande adentro
  const X = [...new Set(xs)].sort((a, b) => a - b), Y = [...new Set(ys)].sort((a, b) => a - b)
  let mejor: P = c, area = -1
  for (let i = 0; i + 1 < X.length; i++)
    for (let j = 0; j + 1 < Y.length; j++) {
      const m: P = [(X[i] + X[i + 1]) / 2, (Y[j] + Y[j + 1]) / 2]
      const a = (X[i + 1] - X[i]) * (Y[j + 1] - Y[j])
      if (a > area && dentro(r, ...m)) [mejor, area] = [m, a]
    }
  return mejor
}

export function dibujoDoc(plan: PlanCatalogo): Doc {
  const contorno = contornoDe(plan)
  const ccw = area2(contorno) > 0
  const ventanas = plan.ventanas ?? []
  const puertas = plan.puertas ?? []
  const huecosVentana: [number, number][] = ventanas.map((v) => [v.x - v.ancho / 2, v.x + v.ancho / 2])
  const muros: Ring[] = []

  // la fachada: cada lado del contorno, de MURO_EXT hacia adentro; en y = 0, sin los vanos de las ventanas
  const normal = (a: P, b: P): P => {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1
    const [ux, uy] = [(b[0] - a[0]) / L, (b[1] - a[1]) / L]
    return ccw ? [-uy, ux] : [uy, -ux]
  }
  contorno.forEach((a, i) => {
    const b = contorno[(i + 1) % contorno.length]
    const n = normal(a, b)
    const t = MURO_EXT
    if (Math.abs(a[1] - b[1]) < EPS) {
      const [lo, hi] = [Math.min(a[0], b[0]), Math.max(a[0], b[0])]
      const tramos = Math.abs(a[1]) < EPS ? resta(lo, hi, huecosVentana) : [[lo, hi] as [number, number]]
      for (const [x0, x1] of tramos) muros.push(rect(x0, a[1], x1, a[1] + n[1] * t))
    } else if (Math.abs(a[0] - b[0]) < EPS) {
      muros.push(rect(a[0], a[1], a[0] + n[0] * t, b[1]))
    } else {
      muros.push([a, b, [b[0] + n[0] * t, b[1] + n[1] * t], [a[0] + n[0] * t, a[1] + n[1] * t]])
    }
    // la esquina: llena el cuadro entre las dos bandas (en una esquina de adentro quedaría un hueco)
    const prev = contorno[(i - 1 + contorno.length) % contorno.length]
    const m = normal(prev, a)
    muros.push(rect(a[0], a[1], a[0] + (n[0] + m[0]) * t, a[1] + (n[1] + m[1]) * t))
  })

  // los interiores: los medios muros de cada recinto (12 cm entre dos), ya con sus vanos
  for (const c of cajasMuro(plan, 1, 0).cajas) if (c.z0 < EPS) muros.push(rect(c.x0, c.y0, c.x1, c.y1))

  const docPuertas: PuertaDoc[] = puertas.map((q) => {
    const h = q.ancho / 2
    // eje 'x': el vano va a lo largo de y en x = q.x y la hoja abre hacia +x; eje 'y': a lo largo de x, hacia +y
    const [bisagra, cerrada, abierta]: P[] = q.eje === 'x'
      ? [[q.x, q.y - h], [q.x, q.y + h], [q.x + q.ancho, q.y - h]]
      : [[q.x - h, q.y], [q.x + h, q.y], [q.x - h, q.y + q.ancho]]
    const cruz = (cerrada[0] - bisagra[0]) * (abierta[1] - bisagra[1]) - (cerrada[1] - bisagra[1]) * (abierta[0] - bisagra[0])
    return { bisagra, cerrada, abierta, giro: cruz > 0 ? 1 : 0 }
  })

  const docVentanas: [P, P][][] = ventanas.map((v) => {
    const [x0, x1] = [v.x - v.ancho / 2, v.x + v.ancho / 2]
    return [0, MURO_EXT / 2, MURO_EXT].map((y) => [[x0, y], [x1, y]] as [P, P])
  })

  const rotulos: RotuloDoc[] = plan.rooms.map((r) => {
    const [x, y] = puntoRotulo(r.shape)
    return { nombre: r.name, kind: r.kind, area: Math.abs(area2(r.shape)) / 2, x, y }
  })

  return { muros, puertas: docPuertas, ventanas: docVentanas, rotulos }
}
