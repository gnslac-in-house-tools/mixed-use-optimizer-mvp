// De Plaza Praktico@258a5b4 (app/src/vistas/tresd/Suelo.tsx), sin el mapa de fondo: retícula discreta y un plano
// que solo recibe sombra (IZA, Ground.tsx), a la cota del terreno.
import { Grid } from '@react-three/drei'

export function Suelo({ size, center, cota = 0 }: { size: number; center: [number, number, number]; cota?: number }) {
  return (
    <group position={[0, cota, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[center[0], -0.001, center[2]]} receiveShadow raycast={() => null}>
        <planeGeometry args={[size * 6, size * 6]} />
        <shadowMaterial opacity={0.22} />
      </mesh>
      <Grid
        position={[center[0], -0.002, center[2]]}
        cellSize={size / 20}
        sectionSize={size / 4}
        cellColor="#d8d8dc"
        sectionColor="#c7c7cc"
        cellThickness={0.6}
        sectionThickness={1}
        fadeDistance={size * 3}
        fadeStrength={1.5}
        infiniteGrid
        followCamera={false}
      />
    </group>
  )
}
