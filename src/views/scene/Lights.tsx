// A three-quarter key light over a hemisphere fill (IZA's Lighting.tsx). Port of Plaza-Practiko
// `vistas/tresd/Luces.tsx`. The target is the model's centre, not the origin: site coordinates can be far from (0, 0).
import { useMemo } from 'react'
import * as THREE from 'three'
import type { SceneColors } from './colors.ts'

/** `shadows`: the key light casts them (Detail: Presentation, Phase S.4). */
export function Lights({ size, center, colors, shadows = true }: { size: number; center: [number, number, number]; colors: SceneColors; shadows?: boolean }) {
  const target = useMemo(() => new THREE.Object3D(), [])
  const [cx, cy, cz] = center

  return (
    <>
      <hemisphereLight intensity={1.5} groundColor={colors.groundLight} color={colors.sky} />
      <primitive object={target} position={[cx, cy, cz]} />
      <directionalLight
        castShadow={shadows}
        intensity={2.4}
        target={target}
        position={[cx - size * 0.55, cy + size * 1.25, cz + size * 0.38]}
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.6}
        shadow-radius={6}
      >
        <orthographicCamera attach="shadow-camera" args={[-size * 1.1, size * 1.1, size * 1.1, -size * 1.1, 0.1, size * 4]} />
      </directionalLight>
    </>
  )
}
