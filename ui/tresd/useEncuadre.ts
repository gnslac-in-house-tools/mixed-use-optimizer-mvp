// De Plaza Praktico@258a5b4 (app/src/vistas/tresd/useEncuadre.ts), sin cambios.
// Encuadre en vista 3/4 de todas las masas (IZA, useFit.ts). Las cotas del modelo son absolutas (decenas de metros),
// así que el encuadre parte de la caja real y no del origen.
import { useThree } from '@react-three/fiber'
import { useCallback, useEffect } from 'react'
import * as THREE from 'three'

interface Controles {
  object: THREE.Camera
  target: THREE.Vector3
  update: () => void
}

/** Planos de recorte para una cámara a esta distancia de lo que mira. */
export function recortar(camera: THREE.PerspectiveCamera, distancia: number): void {
  camera.near = Math.max(distancia / 1000, 0.1)
  camera.far = distancia * 10
  camera.updateProjectionMatrix()
}

/** Distancia de la cámara a la que cabe toda la caja. */
export function distanciaEncuadre(camera: THREE.PerspectiveCamera, caja: THREE.Box3, margen = 1.35): number {
  const tam = caja.getSize(new THREE.Vector3())
  const fovV = (camera.fov * Math.PI) / 180
  const fovH = 2 * Math.atan(Math.tan(fovV / 2) * camera.aspect)
  const diagonal = Math.hypot(tam.x, tam.z)
  return Math.max(tam.y / 2 / Math.tan(fovV / 2), diagonal / 2 / Math.tan(fovH / 2), 10) * margen
}

/**
 * Coloca `camera` (con su `aspect` ya puesto) mirando en `direccion` de modo que el modelo llene el cuadro: proyecta
 * `puntos` (los vértices de las masas; sin ellos, las esquinas de la caja), centra y acerca o aleja hasta que el más
 * lejano quede a `relleno` de la orilla. Tres pasadas bastan.
 */
export function encuadreAjustado(
  camera: THREE.PerspectiveCamera,
  caja: THREE.Box3,
  direccion: THREE.Vector3,
  relleno = 0.86,
  puntos: THREE.Vector3[] = [],
): void {
  const dir = direccion.clone().normalize()
  const objetivo = caja.getCenter(new THREE.Vector3())
  let d = distanciaEncuadre(camera, caja, 1)
  const { min, max } = caja
  const esquinas =
    puntos.length > 0
      ? puntos
      : [0, 1, 2, 3, 4, 5, 6, 7].map(
          (i) => new THREE.Vector3(i & 1 ? max.x : min.x, i & 2 ? max.y : min.y, i & 4 ? max.z : min.z),
        )
  const colocar = () => {
    camera.position.copy(objetivo).addScaledVector(dir, -d)
    camera.lookAt(objetivo)
    recortar(camera, d)
    camera.updateMatrixWorld()
  }
  for (let paso = 0; paso < 3; paso++) {
    colocar()
    let x0 = Infinity
    let x1 = -Infinity
    let y0 = Infinity
    let y1 = -Infinity
    for (const e of esquinas) {
      const p = e.clone().project(camera)
      x0 = Math.min(x0, p.x)
      x1 = Math.max(x1, p.x)
      y0 = Math.min(y0, p.y)
      y1 = Math.max(y1, p.y)
    }
    const medioAlto = Math.tan(((camera.fov * Math.PI) / 180) / 2) * d
    const derecha = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0)
    const arriba = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1)
    objetivo
      .addScaledVector(derecha, ((x0 + x1) / 2) * medioAlto * camera.aspect)
      .addScaledVector(arriba, ((y0 + y1) / 2) * medioAlto)
    d *= Math.max((x1 - x0) / 2, (y1 - y0) / 2, 1e-3) / relleno
  }
  colocar()
}

export function encuadrar(camera: THREE.PerspectiveCamera, controles: Controles, caja: THREE.Box3, margen = 1.35): void {
  const centro = caja.getCenter(new THREE.Vector3())
  const tam = caja.getSize(new THREE.Vector3())
  const distancia = distanciaEncuadre(camera, caja, margen)
  const direccion = new THREE.Vector3(0.62, 0.45, 0.62).normalize()
  camera.position
    .copy(centro)
    .add(new THREE.Vector3(0, tam.y * 0.06, 0))
    .addScaledVector(direccion, distancia)
  recortar(camera, distancia)
  controles.target.copy(centro).add(new THREE.Vector3(0, tam.y * 0.06, 0))
  controles.update()
}

/**
 * Devuelve una función que reencuadra la caja. Encuadra solo al montar y cuando cambia `clave` (por ejemplo,
 * cuántas masas hay o qué proyecto se abrió): editar una masa no debe mover la cámara.
 */
export function useEncuadre(caja: THREE.Box3 | null, clave: string): () => void {
  const camera = useThree((s) => s.camera)
  const controles = useThree((s) => s.controls) as Controles | null

  const ir = useCallback(() => {
    if (caja && controles) encuadrar(camera as THREE.PerspectiveCamera, controles, caja)
  }, [caja, camera, controles])

  // Solo la clave dispara el encuadre automático; `ir` cambia con cada edición de la caja.
  useEffect(() => {
    ir()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave, controles])

  return ir
}
