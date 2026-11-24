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

const LOSA = 0.2
const COLUMNA = '#6b6e72'
const SOTANO = '#9EA2A8'
const CAJON = '#F2F2F2'
/** m que cada departamento se mete de su contorno, para que sus muros se lean */
const MURO = 0.08

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
      <meshStandardMaterial color={color} roughness={0.9} transparent={opacity < 1} opacity={opacity} depthWrite={opacity === 1} />
    </mesh>
  )
}

export function Residencial3d() {
  const project = useShown((s) => s.project)
  const derived = useShown((s) => s.derived)
  const todos = useDerivados()
  const piso = usePiso((s) => s.piso)
  const partes = useMemo(() => {
    const colorTipo = new Map((project.residential?.tipos ?? []).map((t) => [t.id, t.color]))
    const color = (prog: string) => project.programs.find((x) => project.residential?.usos[x.id]?.uso === (prog === 'ret' ? 'comercio' : 'vivienda'))?.color ?? '#ccc'
    const g = gridOf(project, derived.option)
    const out: { key: string; geometry: THREE.BufferGeometry; color: string; opacity?: number }[] = []
    for (const { buildingId, d } of todos) {
      d.niveles.forEach((l, i) => {
        piezas(l.shape).forEach((pz, k) => out.push({ key: `${buildingId}-l${i}-${k}`, geometry: extrude(pz.outer, l.z, LOSA, pz.holes), color: color(l.prog) }))
        // los departamentos de cada nivel (o solo los del piso elegido), por tipo, entre losa y losa
        if (typeof piso === 'number' && piso !== i) return
        for (const u of l.layout?.units ?? []) {
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
      for (let k = 0; k < e.sotanos; k++) {
        piezas(e.plano.contorno).forEach((pz, j) => out.push({ key: `${buildingId}-s${k}-${j}`, geometry: extrude(pz.outer, z0s - 3.3 * (k + 1), 2.9, pz.holes), color: SOTANO, opacity: 0.35 }))
      }
      if (e.sotanos > 0 && (piso === 'sotano' || piso === null)) {
        e.plano.cajones.forEach((r, j) => out.push({ key: `${buildingId}-cj${j}`, geometry: extrude(r.map(([x, y]) => ({ x, y })), z0s - 3.3 + 0.01, 0.05), color: CAJON }))
      }
      if (!g || !d.niveles.length) continue
      const z0 = Math.min(...d.niveles.map((l) => l.z))
      const z1 = Math.max(...d.niveles.map((l) => l.z + l.h))
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
    return out
  }, [todos, project, derived, piso])
  if (!partes.length) return null
  return (
    <group name="residencial-3d">
      {partes.map((x) => (
        <Pieza key={x.key} geometry={x.geometry} color={x.color} opacity={x.opacity} />
      ))}
    </group>
  )
}
