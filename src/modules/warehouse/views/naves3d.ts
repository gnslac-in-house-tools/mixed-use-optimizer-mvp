// mixed-use-mvp: los racks de una nave en 3D (Furniture), en una sola geometría: una nave grande lleva cientos.
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { Polygon } from '../../../model/schema.ts'
import { extrude } from '../../../views/scene/geometry3d.ts'

/** m: lo más alto que llega un rack, y lo que deja libre bajo el techo de la nave */
export const RACK_ALTO = 10, LIBRE_TECHO = 1.5

/** Los racks de pie sobre el piso `z0` de una nave de `alto` m. */
export function racks3d(racks: Polygon[], z0: number, alto: number): THREE.BufferGeometry {
  const h = Math.min(RACK_ALTO, alto - LIBRE_TECHO)
  if (!racks.length || !(h > 0)) {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute([], 3))
    return g
  }
  return mergeGeometries(racks.map((r) => extrude(r, z0, h)), false) ?? new THREE.BufferGeometry()
}
