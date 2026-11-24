// El eje de un pasillo (spec circulaciones §8 e interacción §16.5): lo usan el dibujo (ejes y flechas) y las flechas
// de sentido puestas a mano.
import type { Punto } from '../../modelo/tipos'

const resta = (a: Punto, b: Punto): Punto => ({ x: a.x - b.x, y: a.y - b.y })
const largo = (v: Punto) => Math.hypot(v.x, v.y)
const medio = (a: Punto, b: Punto): Punto => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
const unit = (v: Punto): Punto => {
  const l = largo(v) || 1
  return { x: v.x / l, y: v.y / l }
}

/** El eje largo de un cuadrilátero (pasillo, cajón): de la mitad de un lado corto a la del otro. */
export function ejeLargo(q: Punto[]): { a: Punto; b: Punto; ancho: number; largo: number } | null {
  if (q.length !== 4) return null
  const l0 = largo(resta(q[1], q[0]))
  const l1 = largo(resta(q[2], q[1]))
  const [a, b] = l0 >= l1 ? [medio(q[3], q[0]), medio(q[1], q[2])] : [medio(q[0], q[1]), medio(q[2], q[3])]
  return { a, b, ancho: Math.min(l0, l1), largo: largo(resta(b, a)) }
}

/**
 * El eje de cualquier pasillo: el de un cuadrilátero (ejeLargo) y, en una pieza recortada con más lados, el de su
 * caja orientada por su lado más largo, por la mitad de su ancho.
 */
export function ejeDePasillo(q: Punto[]): { a: Punto; b: Punto; ancho: number; largo: number } | null {
  const e = ejeLargo(q)
  if (e || q.length < 3) return e
  let u: Punto | null = null
  let lMax = 0
  q.forEach((p, i) => {
    const d = resta(q[(i + 1) % q.length], p)
    if (largo(d) > lMax) {
      lMax = largo(d)
      u = unit(d)
    }
  })
  if (!u) return null
  const w: Punto = u
  const v = { x: -w.y, y: w.x }
  const s = q.map((p) => p.x * w.x + p.y * w.y)
  const t = q.map((p) => p.x * v.x + p.y * v.y)
  const [s0, s1, t0, t1] = [Math.min(...s), Math.max(...s), Math.min(...t), Math.max(...t)]
  const tm = (t0 + t1) / 2
  const en = (si: number): Punto => ({ x: w.x * si + v.x * tm, y: w.y * si + v.y * tm })
  return { a: en(s0), b: en(s1), ancho: t1 - t0, largo: s1 - s0 }
}
