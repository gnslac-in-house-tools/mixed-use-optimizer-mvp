// El sótano en 3D con el detalle de Praktico: losa, pasillos más oscuros, las rayas de cada cajón, una flecha de sentido
// por pasillo pintada en el piso, la rampa y, con Furniture, un auto en cada cajón. Todo en pocas geometrías (una por
// color), para que cientos de cajones no pesen.
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { extrude } from '../../../views/scene/geometry3d.ts'
import type { Estacionamiento } from '../engine/derivar.ts'
import type { Ring } from '../engine/gfit/src/host/protocol.ts'

const LOSA = '#B9BCC0', PASILLO = '#8E9196', RAYA = '#FFFFFF', RAMPA = '#E8B04B', CABINA = '#2F3338'
const AUTOS = ['#C8CCD2', '#3D5A80', '#9E2A2B', '#2B2D2F', '#E0E1DD']
const pts = (r: Ring) => r.map(([x, y]) => ({ x, y }))

/** Un rectángulo de largo × ancho centrado en c, girado al ángulo a (rad), en puntos del plano. */
function rect(c: [number, number], a: number, largo: number, ancho: number) {
  const u = [Math.cos(a), Math.sin(a)], v = [-u[1], u[0]], l = largo / 2, w = ancho / 2
  return [[-l, -w], [l, -w], [l, w], [-l, w]].map(([s, t]) => ({ x: c[0] + u[0] * s + v[0] * t, y: c[1] + u[1] * s + v[1] * t }))
}
/** La tira de ancho w a lo largo del segmento ab. */
function tira(a: [number, number], b: [number, number], w: number) {
  const l = Math.hypot(b[0] - a[0], b[1] - a[1])
  return rect([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], Math.atan2(b[1] - a[1], b[0] - a[0]), l + w, w)
}
/** El centro y el rumbo del lado largo de un cajón. */
function eje(r: Ring): { c: [number, number]; a: number } {
  let best = 0, a = 0
  for (let i = 0; i < r.length; i++) {
    const p = r[i], q = r[(i + 1) % r.length], l = Math.hypot(q[0] - p[0], q[1] - p[1])
    if (l > best) { best = l; a = Math.atan2(q[1] - p[1], q[0] - p[0]) }
  }
  return { c: [r.reduce((s, q) => s + q[0], 0) / r.length, r.reduce((s, q) => s + q[1], 0) / r.length], a }
}

/** m: entrepiso de sótano y grueso de la losa de la rampa */
const ENTREPISO = 3.3, GRUESO = 0.06

/**
 * Las rampas apiladas: en cada sótano k (1..n) la huella inclinada, de su piso (`z0s − 3.3·k`) en el extremo bajo al
 * del de arriba en el alto, y su boca alta plana en ese nivel (la del S1, a nivel de calle).
 */
export function rampas3d(plano: Estacionamiento['plano'], z0s: number, sotanos: number): { key: string; geometry: THREE.BufferGeometry; color: string }[] {
  const rp = plano.rampa
  if (!rp || sotanos < 1) return []
  const out: { key: string; geometry: THREE.BufferGeometry; color: string }[] = []
  for (let k = 1; k <= sotanos; k++) {
    const piso = z0s - ENTREPISO * k
    // la losa recta, y cada vértice sube lo que su esquina (la escena es x, z, −y)
    const g = extrude(pts(rp.huella), 0, GRUESO)
    const pos = g.getAttribute('position')
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = -pos.getZ(i)
      let j = 0, d = Infinity
      rp.huella.forEach((q, n) => { const e = Math.hypot(q[0] - x, q[1] - y); if (e < d) { d = e; j = n } })
      pos.setY(i, pos.getY(i) + piso + (rp.alto[j] ?? 0) * ENTREPISO)
    }
    pos.needsUpdate = true
    g.computeVertexNormals()
    out.push({ key: `rampa-s${k}`, geometry: g, color: RAMPA })
    const bocas = rp.bocaAlta.map((r) => extrude(pts(r), piso + ENTREPISO, 0.05))
    if (bocas.length) out.push({ key: `boca-s${k}`, geometry: mergeGeometries(bocas, false) ?? new THREE.BufferGeometry(), color: RAMPA })
  }
  return out
}

export function detalleSotano(plano: Estacionamiento['plano'], z: number, autos: boolean): { key: string; geometry: THREE.BufferGeometry; color: string }[] {
  const grupos = new Map<string, THREE.BufferGeometry[]>()
  const add = (color: string, g: THREE.BufferGeometry) => grupos.set(color, [...(grupos.get(color) ?? []), g])
  for (const r of plano.contorno) if (r.length >= 3) add(LOSA, extrude(pts(r), z - 0.15, 0.15))
  for (const r of plano.pasillos) add(PASILLO, extrude(pts(r), z, 0.01))
  for (const r of plano.cajones) for (let i = 0; i < r.length; i++) add(RAYA, extrude(tira(r[i], r[(i + 1) % r.length], 0.1), z + 0.012, 0.006))
  for (const r of plano.flechas) add(RAYA, extrude(pts(r), z + 0.012, 0.006))
  // las bocas, planas; la rampa misma va inclinada (rampas3d)
  for (const r of plano.rampas) if (r !== plano.rampa?.huella) add(RAMPA, extrude(pts(r), z, 0.05))
  if (autos) {
    plano.cajones.forEach((r, i) => {
      const { c, a } = eje(r)
      add(AUTOS[(i * 7 + 3) % AUTOS.length], extrude(rect(c, a, 4.3, 1.8), z + 0.15, 0.75))
      add(CABINA, extrude(rect([c[0] - Math.cos(a) * 0.2, c[1] - Math.sin(a) * 0.2], a, 2.2, 1.6), z + 0.9, 0.5))
    })
  }
  return [...grupos].map(([color, gs], k) => ({ key: 'sot-' + k + color, geometry: mergeGeometries(gs, false) ?? new THREE.BufferGeometry(), color }))
}
