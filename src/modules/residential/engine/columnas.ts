// Las columnas de un edificio de uso mixto: un cuadro en cada cruce de crujía de la retícula (cada `x` por cada `y`, sin
// los módulos) que cae dentro de la huella de alguna de sus masas (el borde cuenta), fuera de sus huecos y de sus núcleos.
import type { Grid, Point, Polygon } from '../../../model/schema.ts'
import type { DerivedMass } from '../../../engine/types.ts'
import { gridLines, ON_LINE, toPlan } from '../../../engine/grid/index.ts'
import { distancePointSegment, pointInPolygon } from '../../../engine/geom/polygon.ts'

/** El lado de una columna, m. */
export const LADO_COLUMNA = 0.5

const enBorde = (q: Point, poly: Polygon) => poly.some((a, i) => distancePointSegment(q, a, poly[(i + 1) % poly.length]) <= ON_LINE)
const dentroOBorde = (q: Point, poly: Polygon) => poly.length >= 3 && (pointInPolygon(q, poly) || enBorde(q, poly))
const estrictamenteDentro = (q: Point, poly: Polygon) => poly.length >= 3 && pointInPolygon(q, poly) && !enBorde(q, poly)

/** El centro de cada columna, sin repetir, en coordenadas de plano. */
export function columnas(g: Grid, masas: DerivedMass[], nucleos: Polygon[]): Point[] {
  const vistas = new Set<string>()
  const out: Point[] = []
  for (const m of masas) {
    if (m.polygon.length < 3) continue
    const lineas = gridLines(g, m.polygon, { x: 0, y: 0 }, { modules: false })
    const ks = (axis: 'x' | 'y') => lineas.filter((l) => l.axis === axis).map((l) => l.k)
    for (const i of ks('x')) {
      for (const j of ks('y')) {
        const key = `${i},${j}`
        if (vistas.has(key)) continue
        const q = toPlan(g, { x: i * g.x, y: j * g.y })
        if (!dentroOBorde(q, m.polygon)) continue
        if (m.holes.some((h) => estrictamenteDentro(q, h))) continue
        if (nucleos.some((n) => estrictamenteDentro(q, n))) continue
        vistas.add(key)
        out.push(q)
      }
    }
  }
  return out
}
