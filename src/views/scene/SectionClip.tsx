// mixed-use-mvp: the section cut of the 3D view (interiors.ts): while a module asks for one (`clipZ`) and the Detail is
// not Schematic, everything above that height is clipped away, so the storey below reads as a plan with its rooms and
// furniture. One global clipping plane on the renderer; none, as before.
import { useThree } from '@react-three/fiber'
import { useEffect } from 'react'
import * as THREE from 'three'
import { useDetail } from '../detail.ts'
import { useInteriors } from '../show/interiors.ts'

export function SectionClip() {
  const gl = useThree((s) => s.gl)
  const invalidate = useThree((s) => s.invalidate)
  const z = useInteriors((s) => s.clipZ)
  const schematic = useDetail((s) => s.detail === 'schematic')
  useEffect(() => {
    // y is up in the scene: keep what lies below z
    gl.clippingPlanes = z !== null && !schematic ? [new THREE.Plane(new THREE.Vector3(0, -1, 0), z)] : []
    invalidate()
    return () => { gl.clippingPlanes = [] }
  }, [gl, z, schematic, invalidate])
  return null
}
