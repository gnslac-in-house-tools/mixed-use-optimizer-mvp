// Los muros de una unidad en 3D con sus huecos (pieza 3): cada recinto pone medio muro hacia adentro a lo largo de su
// contorno; una puerta abre los dos medios muros de su eje hasta ALTO_PUERTA (con dintel arriba) y una ventana abre la
// fachada entre ANTEPECHO y ALTO_PUERTA (antepecho abajo, dintel arriba y un vidrio). Cajas alineadas a los ejes, en el
// marco del plano (x a lo largo de la fachada, y hacia el pasillo, z hacia arriba). Puro.
import type { PlanCatalogo } from './catalogo.ts'

/** m: el medio muro de cada recinto (12 cm entre dos) */
export const MEDIO_MURO = 0.06
export const ALTO_PUERTA = 2.1
export const ANTEPECHO = 0.9
const EPS = 1e-3

export interface Caja { x0: number; y0: number; x1: number; y1: number; z0: number; z1: number }

/** Lo que queda de [a, b] sin los huecos (intervalos [h0, h1]). */
function resta(a: number, b: number, huecos: [number, number][]): [number, number][] {
  let out: [number, number][] = [[a, b]]
  for (const [h0, h1] of huecos) {
    out = out.flatMap(([p, q]) => {
      if (h1 <= p || h0 >= q) return [[p, q] as [number, number]]
      const r: [number, number][] = []
      if (h0 > p + EPS) r.push([p, h0])
      if (h1 < q - EPS) r.push([h1, q])
      return r
    })
  }
  return out
}

export function cajasMuro(p: PlanCatalogo, alto: number, losa: number): { cajas: Caja[]; vidrios: Caja[] } {
  const cajas: Caja[] = [], vidrios: Caja[] = []
  const puertas = p.puertas ?? [], ventanas = p.ventanas ?? []
  for (const r of p.rooms) {
    const s = r.shape
    let area2 = 0
    for (let i = 0; i < s.length; i++) { const a = s[i], b = s[(i + 1) % s.length]; area2 += a[0] * b[1] - b[0] * a[1] }
    const ccw = area2 > 0
    for (let i = 0; i < s.length; i++) {
      const a = s[i], b = s[(i + 1) % s.length]
      const vertical = Math.abs(a[0] - b[0]) < EPS, horizontal = Math.abs(a[1] - b[1]) < EPS
      if (!vertical && !horizontal) continue
      // hacia adentro: a la izquierda del borde en un anillo antihorario
      const dx = b[0] - a[0], dy = b[1] - a[1]
      const n = ccw ? [-Math.sign(dy), Math.sign(dx)] : [Math.sign(dy), -Math.sign(dx)]
      const lo = vertical ? Math.min(a[1], b[1]) : Math.min(a[0], b[0])
      const hi = vertical ? Math.max(a[1], b[1]) : Math.max(a[0], b[0])
      const c = vertical ? a[0] : a[1]
      const caja = (t0: number, t1: number, z0: number, z1: number): Caja => {
        const g0 = c, g1 = c + (vertical ? n[0] : n[1]) * MEDIO_MURO
        return vertical
          ? { x0: Math.min(g0, g1), x1: Math.max(g0, g1), y0: t0, y1: t1, z0, z1 }
          : { x0: t0, x1: t1, y0: Math.min(g0, g1), y1: Math.max(g0, g1), z0, z1 }
      }
      // los huecos de este borde: las puertas de su eje, y en la fachada (y = 0) las ventanas
      const huecosP: [number, number][] = puertas
        .filter((q) => (vertical ? q.eje === 'x' && Math.abs(q.x - c) < EPS && q.y > lo && q.y < hi : q.eje === 'y' && Math.abs(q.y - c) < EPS && q.x > lo && q.x < hi))
        .map((q) => { const m = vertical ? q.y : q.x; return [Math.max(lo, m - q.ancho / 2), Math.min(hi, m + q.ancho / 2)] })
      const huecosV: [number, number][] = horizontal && Math.abs(c) < EPS
        ? ventanas.filter((v) => v.x + v.ancho / 2 > lo && v.x - v.ancho / 2 < hi).map((v) => [Math.max(lo, v.x - v.ancho / 2), Math.min(hi, v.x + v.ancho / 2)])
        : []
      for (const [t0, t1] of resta(lo, hi, [...huecosP, ...huecosV])) cajas.push(caja(t0, t1, losa, alto))
      for (const [t0, t1] of huecosP) if (alto > ALTO_PUERTA) cajas.push(caja(t0, t1, ALTO_PUERTA, alto))
      for (const [t0, t1] of huecosV) {
        cajas.push(caja(t0, t1, losa, ANTEPECHO))
        if (alto > ALTO_PUERTA) cajas.push(caja(t0, t1, ALTO_PUERTA, alto))
        vidrios.push({ x0: t0, x1: t1, y0: -0.01, y1: 0.01, z0: ANTEPECHO, z1: ALTO_PUERTA })
      }
    }
  }
  return { cajas, vidrios }
}
