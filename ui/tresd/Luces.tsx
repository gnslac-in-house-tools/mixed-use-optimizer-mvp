// De Plaza Praktico@258a5b4 (app/src/vistas/tresd/Luces.tsx), sin cambios.
// Luz de tres cuartos sobre un relleno hemisférico (IZA, Lighting.tsx). El objetivo es el centro del modelo,
// no el origen: las coordenadas de Plaza Praktico están lejos de (0, 0).
import { useMemo } from 'react'
import * as THREE from 'three'

type Props = { size: number; center: [number, number, number] }

export function Luces({ size, center }: Props) {
  const objetivo = useMemo(() => new THREE.Object3D(), [])
  const [cx, cy, cz] = center

  return (
    <>
      <hemisphereLight intensity={1.5} groundColor="#d9d9d9" color="#ffffff" />
      <primitive object={objetivo} position={[cx, cy, cz]} />
      <directionalLight
        castShadow
        intensity={2.4}
        target={objetivo}
        position={[cx - size * 0.55, cy + size * 1.25, cz + size * 0.38]}
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.6}
        shadow-radius={6}
      >
        <orthographicCamera
          attach="shadow-camera"
          args={[-size * 1.1, size * 1.1, size * 1.1, -size * 1.1, 0.1, size * 4]}
        />
      </directionalLight>
    </>
  )
}
