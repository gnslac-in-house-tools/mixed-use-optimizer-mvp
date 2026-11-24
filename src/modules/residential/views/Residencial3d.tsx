// El 3D de uso mixto (en la escena de GIM): por edificio de la opción en vista, una losa de 0.2 m en cada nivel que
// deriva GFit, del color de su programa, y las columnas como prismas de 0.5 × 0.5 m de la losa más baja al tope.
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import type { Point } from '../../../model/schema.ts'
import { gridOf } from '../../../engine/grid/index.ts'
import { extrude } from '../../../views/scene/geometry3d.ts'
import { useShown } from '../../../views/viewport/look.ts'
import { columnas, LADO_COLUMNA } from '../engine/columnas.ts'
import { inside, signedArea } from '../engine/gfit/src/model/geom.ts'
import type { Shape } from '../engine/gfit/src/model/geom.ts'
import { solidosDe, useDerivados } from './useDerivado.ts'
import { usePiso } from './piso.ts'
import { seeThrough, useDetail } from '../../../views/detail.ts'
import { detalleSotano } from './sotano3d.ts'
import type { PlanCatalogo } from '../engine/catalogo.ts'
import { interiorDe } from '../engine/pieza4.ts'
import { useInteriors } from '../../../views/show/interiors.ts'
import { Unidad3d } from './Unidad3d.tsx'

const LOSA = 0.2
const COLUMNA = '#6b6e72'
const SOTANO = '#9EA2A8'
const CAJON = '#F2F2F2'
const RAMPA = '#E8B04B'
const NUCLEO = '#8C8C8C'
/** m que cada departamento se mete de su contorno, para que sus muros se lean */
const MURO = 0.3

/** Un Shape de GFit en polígonos con sus huecos: cada hueco con el contorno que lo contiene. */
function piezas(s: Shape): { outer: Point[]; holes: Point[][] }[] {
  const pt = (r: Shape[number]) => r.map(([x, y]) => ({ x, y }))
  const outers = s.filter((r) => r.length >= 3 && signedArea(r) > 0)
  const holes = s.filter((r) => r.length >= 3 && signedArea(r) < 0)
  return outers.map((o) => ({ outer: pt(o), holes: holes.filter((h) => inside([o], h[0])).map(pt) }))
}

function Pieza({ geometry, color, opacity = 1 }: { geometry: THREE.BufferGeometry; color: string; opacity?: number }) {
  useEffect(() => () => geometry.dispose(), [geometry])
  return (
    <mesh geometry={geometry} castShadow={opacity === 1} receiveShadow>
      {/* cede en profundidad ante las caras de la masa de GIM (sin z-fighting en Presentation) */}
      <meshStandardMaterial color={color} roughness={0.9} transparent={opacity < 1} opacity={opacity} depthWrite={opacity === 1} polygonOffset polygonOffsetFactor={2} polygonOffsetUnits={2} />
    </mesh>
  )
}

export function Residencial3d() {
  const project = useShown((s) => s.project)
  const derived = useShown((s) => s.derived)
  const todos = useDerivados()
  const piso = usePiso((s) => s.piso)
  // los departamentos por color solo se ven si la masa se ve por dentro (Ghosted) o hay un piso elegido
  const porDentro = useDetail((s) => seeThrough(s.detail))
  const programas = useInteriors((s) => s.interiors)
  const muebles = useInteriors((s) => s.furniture)
  const partes = useMemo(() => {
    const colorTipo = new Map((project.residential?.tipos ?? []).map((t) => [t.id, t.color]))
    const color = (prog: string) => project.programs.find((x) => project.residential?.usos[x.id]?.uso === (prog === 'ret' ? 'comercio' : 'vivienda'))?.color ?? '#ccc'
    const g = gridOf(project, derived.option)
    const out: { key: string; geometry: THREE.BufferGeometry; color: string; opacity?: number }[] = []
    // pieza 4: los departamentos con plano de Mi biblioteca, la unidad del editor puesta en su marco
    const mios: { key: string; plan: PlanCatalogo; matriz: THREE.Matrix4; alto: number }[] = []
    const catalogo = (project.residential?.catalogo ?? []) as PlanCatalogo[]
    for (const { buildingId, d } of todos) {
      d.niveles.forEach((l, i) => {
        // con un piso elegido, el edificio se corta arriba de él: se ve desde arriba
        if (typeof piso === 'number' && i > piso) return
        piezas(l.shape).forEach((pz, k) => out.push({ key: `${buildingId}-l${i}-${k}`, geometry: extrude(pz.outer, l.z, LOSA, pz.holes), color: color(l.prog) }))
        // los departamentos de cada nivel (o solo los del piso elegido), por tipo, entre losa y losa
        if (typeof piso === 'number' && piso !== i) return
        if (piso === null && !porDentro) return
        for (const u of l.layout?.units ?? []) {
          // Programs o Furniture en el piso elegido: la unidad del editor (recintos, muros con huecos, muebles) en su
          // marco, con el plano de Mi biblioteca de su tipo o el de GFit
          if ((programas || muebles) && piso === i) {
            const it = interiorDe(u, catalogo)
            if (it) {
              const { o, u: e1, v } = it.marco
              // del marco de la unidad (x, altura, −y) al de la escena (X, z, −Y)
              const matriz = new THREE.Matrix4().set(e1[0], 0, -v[0], o[0], 0, 1, 0, l.z + LOSA, -e1[1], 0, v[1], -o[1], 0, 0, 0, 1)
              mios.push({ key: `${buildingId}-mio${i}-${u.id}`, plan: it.plan, matriz, alto: Math.min(2.4, l.h - LOSA - 0.3) })
              continue
            }
          }
          const c = u.shape[0]
          if (!c || c.length < 3) continue
          const cx = c.reduce((a, q) => a + q[0], 0) / c.length, cy = c.reduce((a, q) => a + q[1], 0) / c.length
          const pts = c.map(([x, y]) => { const dx = x - cx, dy = y - cy, r = Math.hypot(dx, dy) || 1; return { x: x - (dx / r) * MURO, y: y - (dy / r) * MURO } })
          out.push({ key: `${buildingId}-u${i}-${u.id}`, geometry: extrude(pts, l.z + LOSA, Math.max(0.5, l.h - LOSA - 0.3)), color: colorTipo.get(u.type) ?? '#ccc' })
        }
      })
      // los sótanos bajo el suelo, translúcidos, y los cajones del primero
      const e = d.estacionamiento
      const z0s = d.niveles.length ? Math.min(...d.niveles.map((l) => l.z)) : 0
      if (piso === 'sotano') {
        // el sótano elegido, con el detalle de Praktico (el primero; los demás, su losa)
        for (const x of detalleSotano(e.plano, z0s - 3.3, muebles)) out.push({ ...x, key: `${buildingId}-${x.key}` })
        for (let k = 1; k < e.sotanos; k++) piezas(e.plano.contorno).forEach((pz, j) => out.push({ key: `${buildingId}-sl${k}-${j}`, geometry: extrude(pz.outer, z0s - 3.3 * (k + 1) - 0.15, 0.15, pz.holes), color: SOTANO }))
      } else {
        for (let k = 0; k < e.sotanos; k++) {
          piezas(e.plano.contorno).forEach((pz, j) => out.push({ key: `${buildingId}-s${k}-${j}`, geometry: extrude(pz.outer, z0s - 3.3 * (k + 1), 2.9, pz.holes), color: SOTANO, opacity: 0.35 }))
        }
      }
      if (e.sotanos > 0) {
        // la rampa en el primer sótano y los núcleos dibujados bajando hasta el último
        if (piso !== 'sotano') e.plano.rampas.forEach((r, j) => out.push({ key: `${buildingId}-rp${j}`, geometry: extrude(r.map(([x, y]) => ({ x, y })), z0s - 3.3 + 0.02, 0.06), color: RAMPA }))
        const fondo = z0s - 3.3 * e.sotanos
        e.plano.nucleos.forEach((r, j) => out.push({ key: `${buildingId}-ns${j}`, geometry: extrude(r.map(([x, y]) => ({ x, y })), fondo, z0s - fondo), color: NUCLEO }))
      }
      if (e.sotanos > 0 && piso === null) {
        e.plano.cajones.forEach((r, j) => out.push({ key: `${buildingId}-cj${j}`, geometry: extrude(r.map(([x, y]) => ({ x, y })), z0s - 3.3 + 0.01, 0.05), color: CAJON }))
      }
      if (!g || !d.niveles.length) continue
      // las columnas bajan a todos los sótanos
      const z0 = Math.min(...d.niveles.map((l) => l.z)) - 3.3 * e.sotanos
      const z1 = typeof piso === 'number' && d.niveles[piso] ? d.niveles[piso].z + d.niveles[piso].h : Math.max(...d.niveles.map((l) => l.z + l.h))
      const h = LADO_COLUMNA / 2
      const a = (g.angle * Math.PI) / 180
      const u = { x: Math.cos(a) * h, y: Math.sin(a) * h }, v = { x: -u.y, y: u.x }
      columnas(g, solidosDe(project, derived.masses, buildingId), d.nucleos).forEach((c, k) => {
        const sq = [
          { x: c.x - u.x - v.x, y: c.y - u.y - v.y }, { x: c.x + u.x - v.x, y: c.y + u.y - v.y },
          { x: c.x + u.x + v.x, y: c.y + u.y + v.y }, { x: c.x - u.x + v.x, y: c.y - u.y + v.y },
        ]
        out.push({ key: `${buildingId}-c${k}`, geometry: extrude(sq, z0, z1 - z0), color: COLUMNA })
      })
    }
    return { out, mios }
  }, [todos, project, derived, piso, programas, muebles, porDentro])
  // Programs o Furniture con un piso elegido: la escena se corta justo bajo la losa siguiente (SectionClip de GIM)
  // en el sótano, el corte va al nivel del suelo: se ve adentro desde arriba
  const corte = (programas || muebles) && typeof piso === 'number'
    ? todos.map(({ d }) => d.niveles[piso]).find((l) => l) ?? null
    : null
  const suelo = piso === 'sotano' && todos.some(({ d }) => d.estacionamiento.sotanos > 0)
    ? Math.min(...todos.flatMap(({ d }) => d.niveles.map((l) => l.z)))
    : null
  const z = corte ? corte.z + corte.h - 0.05 : suelo !== null && Number.isFinite(suelo) ? suelo - 0.05 : null
  useEffect(() => {
    useInteriors.getState().setClip(z)
    return () => useInteriors.getState().setClip(null)
  }, [z])
  if (!partes.out.length && !partes.mios.length) return null
  return (
    <group name="residencial-3d">
      {partes.out.map((x) => (
        <Pieza key={x.key} geometry={x.geometry} color={x.color} opacity={x.opacity} />
      ))}
      {partes.mios.map((x) => (
        <group key={x.key} matrix={x.matriz} matrixAutoUpdate={false}>
          <Unidad3d plan={x.plan} alto={x.alto} muebles={muebles} />
        </group>
      ))}
    </group>
  )
}
