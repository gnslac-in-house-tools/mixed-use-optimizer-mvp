// Polígonos simples: anillos de puntos sin repetir el primero, en metros.
import type { Punto } from '../../modelo/tipos'

export const EPS = 1e-9

export function areaConSigno(p: Punto[]): number {
  let s = 0
  for (let i = 0, n = p.length; i < n; i++) {
    const a = p[i]
    const b = p[(i + 1) % n]
    s += a.x * b.y - b.x * a.y
  }
  return s / 2
}

export function area(p: Punto[]): number {
  return Math.abs(areaConSigno(p))
}

export function centroide(p: Punto[]): Punto {
  const a = areaConSigno(p)
  if (Math.abs(a) <= EPS) {
    const n = Math.max(p.length, 1)
    return { x: p.reduce((s, q) => s + q.x, 0) / n, y: p.reduce((s, q) => s + q.y, 0) / n }
  }
  let cx = 0
  let cy = 0
  for (let i = 0, n = p.length; i < n; i++) {
    const q = p[i]
    const r = p[(i + 1) % n]
    const k = q.x * r.y - r.x * q.y
    cx += (q.x + r.x) * k
    cy += (q.y + r.y) * k
  }
  return { x: cx / (6 * a), y: cy / (6 * a) }
}

/** Regla par-impar. Los puntos sobre el borde pueden caer de cualquier lado. */
export function puntoEnPoligono(q: Punto, p: Punto[]): boolean {
  let dentro = false
  for (let i = 0, n = p.length, j = n - 1; i < n; j = i++) {
    const a = p[i]
    const b = p[j]
    if (a.y > q.y !== b.y > q.y && q.x < ((b.x - a.x) * (q.y - a.y)) / (b.y - a.y) + a.x) dentro = !dentro
  }
  return dentro
}

/** El primer anillo es el exterior; los demás, huecos. */
export function puntoEnRegion(q: Punto, anillos: Punto[][]): boolean {
  if (anillos.length === 0 || !puntoEnPoligono(q, anillos[0])) return false
  for (let k = 1; k < anillos.length; k++) if (puntoEnPoligono(q, anillos[k])) return false
  return true
}

function cruz(o: Punto, a: Punto, b: Punto): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
}

function enSegmento(q: Punto, a: Punto, b: Punto): boolean {
  return (
    Math.min(a.x, b.x) - EPS <= q.x &&
    q.x <= Math.max(a.x, b.x) + EPS &&
    Math.min(a.y, b.y) - EPS <= q.y &&
    q.y <= Math.max(a.y, b.y) + EPS
  )
}

/** Los segmentos se cruzan o se tocan (incluye colineales que se enciman). */
function segmentosSeTocan(a: Punto, b: Punto, c: Punto, d: Punto): boolean {
  const d1 = cruz(c, d, a)
  const d2 = cruz(c, d, b)
  const d3 = cruz(a, b, c)
  const d4 = cruz(a, b, d)
  if (
    ((d1 > EPS && d2 < -EPS) || (d1 < -EPS && d2 > EPS)) &&
    ((d3 > EPS && d4 < -EPS) || (d3 < -EPS && d4 > EPS))
  )
    return true
  if (Math.abs(d1) <= EPS && enSegmento(a, c, d)) return true
  if (Math.abs(d2) <= EPS && enSegmento(b, c, d)) return true
  if (Math.abs(d3) <= EPS && enSegmento(c, a, b)) return true
  if (Math.abs(d4) <= EPS && enSegmento(d, a, b)) return true
  return false
}

/** Sin autointersecciones ni puntas (lados consecutivos que regresan sobre sí mismos). */
export function esSimple(p: Punto[]): boolean {
  const q: Punto[] = []
  for (const v of p) {
    const u = q[q.length - 1]
    if (!u || Math.hypot(v.x - u.x, v.y - u.y) > EPS) q.push(v)
  }
  while (q.length > 1 && Math.hypot(q[0].x - q[q.length - 1].x, q[0].y - q[q.length - 1].y) <= EPS) q.pop()
  const n = q.length
  if (n < 3 || area(q) <= EPS) return false
  for (let i = 0; i < n; i++) {
    const a = q[i]
    const b = q[(i + 1) % n]
    // lado siguiente: no puede regresar sobre este
    const c = q[(i + 2) % n]
    if (Math.abs(cruz(a, b, c)) <= EPS && (b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y) < 0)
      return false
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue // vecinos por el cierre
      if (segmentosSeTocan(a, b, q[j], q[(j + 1) % n])) return false
    }
  }
  return true
}

export function caja(p: Punto[]): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const q of p) {
    if (q.x < minX) minX = q.x
    if (q.y < minY) minY = q.y
    if (q.x > maxX) maxX = q.x
    if (q.y > maxY) maxY = q.y
  }
  return { minX, minY, maxX, maxY }
}

export function distanciaPuntoSegmento(q: Punto, a: Punto, b: Punto): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const l2 = dx * dx + dy * dy
  const t = l2 <= EPS * EPS ? 0 : Math.max(0, Math.min(1, ((q.x - a.x) * dx + (q.y - a.y) * dy) / l2))
  return Math.hypot(q.x - (a.x + t * dx), q.y - (a.y + t * dy))
}
