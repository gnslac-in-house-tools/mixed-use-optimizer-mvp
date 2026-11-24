// A three-quarter view that frames the whole model (IZA's useFit.ts). Port of Plaza-Practiko
// `vistas/tresd/useEncuadre.ts`. Site coordinates are absolute (hundreds of metres), so framing starts from the
// real box, not from the origin.
import { useThree } from '@react-three/fiber'
import { useCallback, useEffect } from 'react'
import * as THREE from 'three'

interface Controls {
  object: THREE.Camera
  target: THREE.Vector3
  update: () => void
}

/** Clipping planes for a camera this far from what it looks at. */
export function clip(camera: THREE.PerspectiveCamera, distance: number): void {
  camera.near = Math.max(distance / 1000, 0.1)
  camera.far = distance * 10
  camera.updateProjectionMatrix()
}

/** How far the camera must be for the whole box to fit. */
export function framingDistance(camera: THREE.PerspectiveCamera, box: THREE.Box3, margin = 1.35): number {
  const size = box.getSize(new THREE.Vector3())
  const fovV = (camera.fov * Math.PI) / 180
  const fovH = 2 * Math.atan(Math.tan(fovV / 2) * camera.aspect)
  const diagonal = Math.hypot(size.x, size.z)
  return Math.max(size.y / 2 / Math.tan(fovV / 2), diagonal / 2 / Math.tan(fovH / 2), 10) * margin
}

export function frame(camera: THREE.PerspectiveCamera, controls: Controls, box: THREE.Box3, margin = 1.35): void {
  const center = box.getCenter(new THREE.Vector3())
  const size = box.getSize(new THREE.Vector3())
  const distance = framingDistance(camera, box, margin)
  const direction = new THREE.Vector3(0.62, 0.45, 0.62).normalize()
  camera.position.copy(center).add(new THREE.Vector3(0, size.y * 0.06, 0)).addScaledVector(direction, distance)
  clip(camera, distance)
  controls.target.copy(center).add(new THREE.Vector3(0, size.y * 0.06, 0))
  controls.update()
}

/**
 * Returns a function that frames the box again. It frames by itself only on mount and when `key` changes (another
 * project opened, the site changed, the first mass added): editing a mass must not move the camera.
 */
export function useFraming(box: THREE.Box3 | null, key: string): () => void {
  const camera = useThree((s) => s.camera)
  const controls = useThree((s) => s.controls) as Controls | null

  const go = useCallback(() => {
    if (box && controls) frame(camera as THREE.PerspectiveCamera, controls, box)
  }, [box, camera, controls])

  // only the key triggers the automatic framing; `go` changes with every edit of the box
  useEffect(() => {
    go()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, controls])

  return go
}
