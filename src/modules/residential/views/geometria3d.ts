// De Plaza Praktico@258a5b4 (app/src/vistas/tresd/geometria3d.ts): solo `extruir` y sus ayudas. El plano (x, y, z) se
// dibuja en three como (x, z, −y): Y arriba. La transformación es una rotación, así que un contorno antihorario visto
// desde arriba conserva su orientación y las normales de la extrusión salen hacia afuera.
import * as THREE from 'three'

export interface Punto { x: number; y: number }

function areaConSigno(p: Punto[]): number {
  let a = 0
  for (let i = 0; i < p.length; i++) {
    const q = p[(i + 1) % p.length]
    a += p[i].x * q.y - q.x * p[i].y
  }
  return a / 2
}

/** Quita un cierre repetido (último = primero) y los vértices consecutivos iguales. */
function limpio(p: Punto[]): Punto[] {
  const r: Punto[] = []
  for (const q of p) {
    const u = r[r.length - 1]
    if (!u || u.x !== q.x || u.y !== q.y) r.push(q)
  }
  if (r.length > 1 && r[0].x === r[r.length - 1].x && r[0].y === r[r.length - 1].y) r.pop()
  return r
}

/**
 * Prisma recto sobre un polígono: de la cota z0 a z0 + alto (en metros, sin escalar).
 * Geometría sin índice con normales planas; vacía si el polígono tiene menos de 3 puntos o el alto no es positivo.
 */
export function extruir(poligono: Punto[], z0: number, alto: number, huecos: Punto[][] = []): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry()
  let p = limpio(poligono)
  if (p.length < 3 || !(alto > 0) || areaConSigno(p) === 0) {
    g.setAttribute('position', new THREE.Float32BufferAttribute([], 3))
    return g
  }
  if (areaConSigno(p) < 0) p = p.slice().reverse()
  const z1 = z0 + alto
  const pos: number[] = []
  const v = (x: number, y: number, z: number): void => {
    pos.push(x, z, -y)
  }

  // Los huecos (spec interacción §8) van en sentido horario: así sus costados también miran hacia afuera del sólido.
  const hs = huecos
    .map((h) => limpio(h))
    .filter((h) => h.length >= 3 && areaConSigno(h) !== 0)
    .map((h) => (areaConSigno(h) > 0 ? h.slice().reverse() : h))
  // Tapas: triangulación que respeta polígonos cóncavos y huecos (los índices recorren el contorno y luego los huecos).
  const todos = [...p, ...hs.flat()]
  const tri = THREE.ShapeUtils.triangulateShape(
    p.map((q) => new THREE.Vector2(q.x, q.y)),
    hs.map((h) => h.map((q) => new THREE.Vector2(q.x, q.y))),
  )
  for (const [i, j, k] of tri) {
    let [a, b, c] = [todos[i], todos[j], todos[k]]
    if ((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x) < 0) [b, c] = [c, b] // antihoraria
    v(a.x, a.y, z1)
    v(b.x, b.y, z1)
    v(c.x, c.y, z1)
    v(a.x, a.y, z0)
    v(c.x, c.y, z0)
    v(b.x, b.y, z0)
  }
  // Costados: el lado a→b de un contorno antihorario (o de un hueco horario) mira hacia afuera.
  for (const anillo of [p, ...hs]) {
    for (let i = 0; i < anillo.length; i++) {
      const a = anillo[i]
      const b = anillo[(i + 1) % anillo.length]
      v(a.x, a.y, z0)
      v(b.x, b.y, z0)
      v(b.x, b.y, z1)
      v(a.x, a.y, z0)
      v(b.x, b.y, z1)
      v(a.x, a.y, z1)
    }
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.computeVertexNormals()
  return g
}
