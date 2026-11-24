// Un plano del catálogo en 3D, como casa de muñecas: losa por recinto en su color, muros extruidos con el motor de
// Praktico (`extruir`), muebles como bloques a su altura y la fachada (y = 0) en vidrio. Marco del plano: x a lo
// largo de la fachada, y hacia adentro; en three, (x, z, −y).
import { Edges } from '@react-three/drei'
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import type { PlanCatalogo, Ring } from '../../engine/catalogo'
import { CATALOGO, ROOM_FILL } from '../../engine/catalogo'
import { offset } from '../../engine/gfit/src/model/geom'
import { extruir, type Punto } from './geometria3d'

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

export function Unidad3d({ plan, alto = ALTO_MURO, muebles = true }: { plan: PlanCatalogo; alto?: number; muebles?: boolean }) {
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
    </group>
  )
}
