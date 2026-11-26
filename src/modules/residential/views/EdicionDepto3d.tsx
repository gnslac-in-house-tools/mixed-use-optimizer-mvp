// Editar un departamento dibujado en el 3D (spec 2026-11-26-blocks-residenciales, fase 4): con uno elegido, sobre su
// piso (el elegido en la barra de pisos si lo cruza, si no el primero), según el modo de sus Properties: Muros (cada
// muro interior movible, una franja que se arrastra sobre el piso) o Muebles (cada uno se arrastra; doble clic lo
// gira). Al soltar, un paso de deshacer que va al tipo o a la unidad, como en la planta (engine/edicionDepto.ts).
// Mientras se arrastra, la cámara no gira. Las manijas se ven a través de la masa.
import { useThree, type ThreeEvent } from '@react-three/fiber'
import { useEffect, useMemo, useState } from 'react'
import * as THREE from 'three'
import { useApp } from '../../../state/store.ts'
import { extrude } from '../../../views/scene/geometry3d.ts'
import { useLooking, useShown } from '../../../views/viewport/look.ts'
import type { PlanCatalogo } from '../engine/catalogo.ts'
import { deptoColocado } from '../engine/deptos.ts'
import { manijasMuebles, manijasMuros, pasoDesde } from '../engine/edicion3d.ts'
import { editarDepto } from '../engine/edicionDepto.ts'
import { girarMueble, moverEje, moverMueble, type Eje } from '../engine/editor.ts'
import { useEdicionDepto } from './edicionDepto.ts'
import { usePiso } from './piso.ts'
import { useDerivados } from './useDerivado.ts'

const ACENTO = '#2F6FED'
const LOSA = 0.2
/** m: alto de la franja de un muro y de la caja de un mueble sobre el piso */
const ALTO_MURO = 2.4
const ALTO_MUEBLE = 0.5

type Arrastre =
  | { tipo: 'muro'; eje: Eje; de: number; a: number; pointerId: number }
  | { tipo: 'mueble'; id: string; x0: number; y0: number; px: number; py: number; x: number; y: number; pointerId: number }

type Controles = { enabled: boolean } | null

export function EdicionDepto3d() {
  const project = useShown((s) => s.project)
  const derived = useShown((s) => s.derived)
  const massId = useApp((s) => s.selection.massId)
  const looking = useLooking()
  const { destino, modo } = useEdicionDepto()
  const piso = usePiso((s) => s.piso)
  const todos = useDerivados()
  const controls = useThree((s) => s.controls) as unknown as Controles
  const [arr, setArr] = useState<Arrastre | null>(null)
  // si el componente se va a medio arrastre, la cámara vuelve a girar
  useEffect(() => () => { if (controls) controls.enabled = true }, [controls])
  const m = massId ? project.masses.find((x) => x.id === massId) : undefined
  const dm = m ? derived.masses[m.id] : undefined
  const c = m?.depto && dm ? deptoColocado(project, m, dm.polygon) : null
  // el piso: el elegido en la barra si la masa lo cruza; si no, el de abajo
  const z = useMemo(() => {
    if (!dm) return 0
    const l = typeof piso === 'number' ? todos.map(({ d }) => d.niveles[piso]).find((x) => x) : undefined
    const z0 = l && l.z >= dm.span[0] - 1e-6 && l.z < dm.span[1] - 1e-6 ? l.z : dm.span[0]
    return z0 + LOSA + 0.01
  }, [dm, piso, todos])
  const muros = useMemo(() => (c && modo === 'muros' ? manijasMuros(c.plan, c.aMundo, arr?.tipo === 'muro' ? arr : undefined) : []), [c, modo, arr])
  const muebles = useMemo(() => (c && modo === 'muebles' ? manijasMuebles(c.plan, c.aMundo, arr?.tipo === 'mueble' ? arr : undefined) : []), [c, modo, arr])
  if (!m || !c || m.locked || looking || (modo !== 'muros' && modo !== 'muebles')) return null
  const plan = c.plan
  const piso3 = new THREE.Plane(new THREE.Vector3(0, 1, 0), -z)
  /** el punto del piso bajo el puntero, en el marco del departamento */
  const local = (e: ThreeEvent<PointerEvent>) => {
    const h = e.ray.intersectPlane(piso3, new THREE.Vector3())
    return h ? c.aLocal({ x: h.x, y: -h.z }) : null
  }
  const guarda = (editar: (pl: PlanCatalogo) => PlanCatalogo) => useApp.getState().apply((p) => editarDepto(p, m.id, destino, editar))
  const toma = (e: ThreeEvent<PointerEvent>, a: Arrastre) => {
    if (e.button !== 0) return
    e.stopPropagation()
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    if (controls) controls.enabled = false
    setArr(a)
  }
  const mueve = (e: ThreeEvent<PointerEvent>) => {
    if (!arr || e.pointerId !== arr.pointerId) return
    e.stopPropagation()
    const q = local(e)
    if (!q) return
    if (arr.tipo === 'muro') setArr({ ...arr, a: pasoDesde(arr.de, arr.eje === 'x' ? q[0] : q[1]) })
    else setArr({ ...arr, x: pasoDesde(arr.x0, arr.x0 + q[0] - arr.px), y: pasoDesde(arr.y0, arr.y0 + q[1] - arr.py) })
  }
  const suelta = (e: ThreeEvent<PointerEvent>) => {
    if (!arr) return
    e.stopPropagation()
    ;(e.target as Element).releasePointerCapture?.(e.pointerId)
    if (controls) controls.enabled = true
    const a = arr
    setArr(null)
    if (a.tipo === 'muro' && Math.abs(a.a - a.de) > 1e-3) guarda((pl) => moverEje(pl, a.eje, a.de, a.a))
    if (a.tipo === 'mueble' && Math.hypot(a.x - a.x0, a.y - a.y0) > 1e-3) guarda((pl) => moverMueble(pl, a.id, a.x, a.y))
  }
  return (
    <group name="edicion-depto-3d">
      {muros.map((h) => (
        <Manija
          key={`${h.eje}:${h.cc}`}
          pts={h.pts}
          z={z}
          alto={ALTO_MURO}
          activo={arr?.tipo === 'muro' && arr.eje === h.eje && Math.abs(arr.de - h.cc) < 1e-3}
          onPointerDown={(e) => toma(e, { tipo: 'muro', eje: h.eje, de: h.cc, a: h.cc, pointerId: e.pointerId })}
          onPointerMove={mueve}
          onPointerUp={suelta}
        />
      ))}
      {muebles.map((h) => {
        const f = plan.muebles.find((k) => k.id === h.id)!
        return (
          <Manija
            key={h.id}
            pts={h.pts}
            z={z}
            alto={ALTO_MUEBLE}
            activo={arr?.tipo === 'mueble' && arr.id === h.id}
            onPointerDown={(e) => {
              const q = local(e)
              if (q) toma(e, { tipo: 'mueble', id: f.id, x0: f.x, y0: f.y, px: q[0], py: q[1], x: f.x, y: f.y, pointerId: e.pointerId })
            }}
            onPointerMove={mueve}
            onPointerUp={suelta}
            onDoubleClick={(e) => { e.stopPropagation(); guarda((pl) => girarMueble(pl, f.id)) }}
          />
        )
      })}
    </group>
  )
}

function Manija({ pts, z, alto, activo, ...on }: {
  pts: { x: number; y: number }[]
  z: number
  alto: number
  activo: boolean
  onPointerDown: (e: ThreeEvent<PointerEvent>) => void
  onPointerMove: (e: ThreeEvent<PointerEvent>) => void
  onPointerUp: (e: ThreeEvent<PointerEvent>) => void
  onDoubleClick?: (e: ThreeEvent<MouseEvent>) => void
}) {
  const geometry = useMemo(() => extrude(pts, z, alto), [pts, z, alto])
  useEffect(() => () => geometry.dispose(), [geometry])
  return (
    <mesh
      geometry={geometry}
      renderOrder={10}
      {...on}
      onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'move' }}
      onPointerOut={() => { document.body.style.cursor = '' }}
    >
      <meshBasicMaterial color={ACENTO} transparent opacity={activo ? 0.55 : 0.28} depthTest={false} depthWrite={false} />
    </mesh>
  )
}
