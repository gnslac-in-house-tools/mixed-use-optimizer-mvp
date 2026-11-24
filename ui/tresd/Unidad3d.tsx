// Un plano del catálogo en 3D, como casa de muñecas: losa por recinto en su color, muros extruidos con el motor de
// Praktico (`extruir`), muebles como bloques a su altura y la fachada (y = 0) en vidrio. Marco del plano: x a lo
// largo de la fachada, y hacia adentro; en three, (x, z, −y).
import { Edges } from '@react-three/drei'
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import type { PlanCatalogo, Ring } from '../../engine/catalogo'
import { CATALOGO, ROOM_FILL, huella } from '../../engine/catalogo'
import { offset } from '../../engine/gfit/src/model/geom'
import { extruir, type Punto } from './geometria3d'
import { MAT_ARISTA, MAT_MUEBLE, modeloMueble } from './muebles3d'

export const ALTO_MURO = 2.6
const MEDIO_MURO = 0.06 // m: cada recinto pone la mitad de su muro, 12 cm entre dos recintos
const LOSA = 0.08
const CONTORNO = '#141412' // --outline-3d de Praktico

/** m: la altura de cada mueble */
const ALTO_MUEBLE: Record<string, number> = {
  'cama-matrimonial': 0.5, 'cama-queen': 0.5, 'cama-king': 0.5, 'cama-individual': 0.5, buro: 0.55, closet: 2.2,
  sofa: 0.8, 'mesa-centro': 0.4, sillon: 0.8, tv: 0.55, 'comedor-4': 0.75, 'comedor-6': 0.75, silla: 0.9,
  cocina: 0.9, refri: 1.8, wc: 0.75, lavabo: 0.85, regadera: 0.04, lavadora: 0.85, escritorio: 0.75, estante: 1.8,
  'mesa-terraza': 0.75,
}

const pts = (r: Ring): Punto[] => r.map(([x, y]) => ({ x, y }))

/** La caja que encuadra la cámara: la unidad completa a la altura de sus muros. */
export function cajaDePlan(p: PlanCatalogo | null, alto = ALTO_MURO): THREE.Box3 | null {
  if (!p) return null
  return new THREE.Box3(new THREE.Vector3(0, 0, -p.d), new THREE.Vector3(p.w, alto, 0))
}

function Geo({ g, color, opacidad = 1, bordes = true, sombra = true }: { g: THREE.BufferGeometry; color: string; opacidad?: number; bordes?: boolean; sombra?: boolean }) {
  useEffect(() => () => g.dispose(), [g])
  return (
    <mesh geometry={g} castShadow={sombra} receiveShadow>
      <meshStandardMaterial color={color} roughness={0.92} transparent={opacidad < 1} opacity={opacidad} depthWrite={opacidad >= 1} />
      {bordes && <Edges threshold={20} color={CONTORNO} lineWidth={1} transparent opacity={0.45} />}
    </mesh>
  )
}

/** `detalle`: muebles modelados (Presentación y Muros completos); si no, cajas a su altura (Esquema). */
export function Unidad3d({ plan, alto = ALTO_MURO, muebles = true, detalle = true }: { plan: PlanCatalogo; alto?: number; muebles?: boolean; detalle?: boolean }) {
  const losas = useMemo(() => plan.rooms.map((r) => ({ kind: r.kind, g: extruir(pts(r.shape), 0, LOSA) })), [plan])
  // muros: el recinto menos su contorno hacia adentro; la fachada (y = 0) va aparte, en vidrio
  const muros = useMemo(
    () =>
      plan.rooms.map((r) => {
        const dentro = offset([r.shape], -MEDIO_MURO)
        return extruir(pts(r.shape), LOSA, alto - LOSA, dentro.map(pts))
      }),
    [plan, alto],
  )
  const vidrio = useMemo(() => extruir([{ x: 0, y: -0.02 }, { x: plan.w, y: -0.02 }, { x: plan.w, y: 0.02 }, { x: 0, y: 0.02 }], LOSA, Math.max(alto, 2.4) - LOSA), [plan.w, alto])

  return (
    <group>
      {losas.map((l, i) => <Geo key={'l' + i} g={l.g} color={ROOM_FILL[l.kind] ?? '#eeeeee'} bordes={false} sombra={false} />)}
      {muros.map((g, i) => <Geo key={'m' + i} g={g} color="#fbfbfa" />)}
      <Geo g={vidrio} color="#9ec5e8" opacidad={0.28} bordes={false} sombra={false} />
      {muebles &&
        !detalle &&
        plan.muebles.map((m) => {
          const c = CATALOGO[m.kind] ?? { w: 0.5, d: 0.5 }
          const h = ALTO_MUEBLE[m.kind] ?? 0.6
          return (
            <mesh key={m.id} position={[m.x, LOSA + h / 2, -m.y]} rotation={[0, (m.rot * Math.PI) / 180, 0]} castShadow receiveShadow>
              <boxGeometry args={[c.w, h, c.d]} />
              <meshStandardMaterial color={m.kind === 'regadera' ? '#cfe3ea' : '#d9d9d6'} roughness={0.85} />
              <Edges color={CONTORNO} transparent opacity={0.35} />
            </mesh>
          )
        })}
      {muebles && detalle && <MueblesDetalle plan={plan} />}
    </group>
  )
}

const MESAS = new Set(['comedor-4', 'comedor-6', 'mesa-terraza', 'escritorio', 'mesa-centro'])

/** El giro (rad, en three) de cada mueble: el de su regla, volteado si su frente quedó contra el muro (la tele, el
 *  escritorio, el clóset del lado derecho), y las sillas mirando a la mesa más cercana de su recinto. */
function giros(plan: PlanCatalogo): number[] {
  return plan.muebles.map((m) => {
    const base = (m.rot * Math.PI) / 180
    if (m.kind === 'silla') {
      let mejor: { dx: number; dy: number; d2: number } | null = null
      for (const t of plan.muebles) {
        if (t.room !== m.room || !MESAS.has(t.kind)) continue
        const dx = t.x - m.x, dy = t.y - m.y, d2 = dx * dx + dy * dy
        if (!mejor || d2 < mejor.d2) mejor = { dx, dy, d2 }
      }
      if (!mejor) return base
      // frente local +z = −y del plano; θ tal que (sin θ, cos θ) apunte a (dx, −dy) en three, a múltiplos de 90°
      const th = Math.atan2(mejor.dx, -mejor.dy)
      return Math.round(th / (Math.PI / 2)) * (Math.PI / 2)
    }
    if (MESAS.has(m.kind) && m.kind !== 'escritorio') return base
    const room = plan.rooms[m.room]
    if (!room) return base
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
    for (const [x, y] of room.shape) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y) }
    const c = CATALOGO[m.kind] ?? { w: 0.5, d: 0.5 }
    const h = c.d / 2
    // el respaldo mira a +y del plano girado por rot: 0 → +y, 90 → −x, 180 → −y, 270 → +x
    const lado = (dir: number) => (dir === 0 ? y1 - (m.y + h) : dir === 90 ? m.x - h - x0 : dir === 180 ? m.y - h - y0 : x1 - (m.x + h))
    const atras = lado(m.rot), frente = lado((m.rot + 180) % 360)
    return frente < atras - 0.01 ? base + Math.PI : base
  })
}

/** m: lo que debe quedar entre un mueble y el borde de su recinto: el medio muro más lo que sobresalen la cabecera
 *  o el edredón, con un respiro */
const HOLGURA = MEDIO_MURO + 0.03

/** Las reglas ponen los muebles contra el borde del recinto, pero el muro come MEDIO_MURO hacia adentro: en 3D se
 *  recorre cada mueble lo que le falte para no meterse al muro (si el recinto da para ello). Devuelve (x, y) del plano. */
function centros(plan: PlanCatalogo): [number, number][] {
  return plan.muebles.map((m) => {
    const room = plan.rooms[m.room]
    if (!room) return [m.x, m.y]
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
    for (const [x, y] of room.shape) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y) }
    const [bx0, by0, bx1, by1] = huella(m)
    const empuje = (bajo: number, alto: number, lo: number, hi: number) => {
      const a = Math.max(0, HOLGURA - (bajo - lo)), b = Math.max(0, HOLGURA - (hi - alto))
      if (a > 0 && b > 0) return 0 // no cabe con holgura de los dos lados: se deja
      return a - b
    }
    return [m.x + empuje(bx0, bx1, x0, x1), m.y + empuje(by0, by1, y0, y1)]
  })
}

function MueblesDetalle({ plan }: { plan: PlanCatalogo }) {
  const rot = useMemo(() => giros(plan), [plan])
  const pos = useMemo(() => centros(plan), [plan])
  return (
    <>
      {plan.muebles.map((m, i) => {
        const mod = modeloMueble(m.kind)
        return (
          <group key={m.id} position={[pos[i][0], LOSA, -pos[i][1]]} rotation={[0, rot[i], 0]}>
            <mesh geometry={mod.geo} material={MAT_MUEBLE} castShadow receiveShadow />
            <lineSegments geometry={mod.aristas} material={MAT_ARISTA} />
          </group>
        )
      })}
    </>
  )
}
