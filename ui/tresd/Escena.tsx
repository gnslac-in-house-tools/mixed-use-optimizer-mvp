// La escena 3D de Plaza Praktico@258a5b4 (app/src/vistas/tresd/Escena.tsx), recortada a lo que necesita un visor:
// Canvas con sombras suaves, luces de tres cuartos, suelo con retícula, órbita que no baja del horizonte, encuadre
// 3/4 automático cuando cambia `clave`; Encuadrar lo pide el marco (`encuadre.ir`). Sin soltar programas, sin capturas.
// El plano (x, y, z) se dibuja como (x, z, −y) en three (Y arriba).
import { OrbitControls } from '@react-three/drei'
import { Canvas, useThree } from '@react-three/fiber'
import { Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import * as THREE from 'three'
import { Luces } from './Luces'
import { Suelo } from './Suelo'
import { distanciaEncuadre, useEncuadre } from './useEncuadre'
import { encuadre } from '../marco/ui'

function Controles({ caja, clave }: { caja: THREE.Box3 | null; clave: string }) {
  const ir = useEncuadre(caja, clave)
  const camera = useThree((s) => s.camera)
  // Alejarse más allá de 8 veces el encuadre deja el modelo como un punto.
  const maxDistance = useMemo(
    () => (caja ? distanciaEncuadre(camera as THREE.PerspectiveCamera, caja) * 8 : undefined),
    [caja, camera],
  )
  // Un cambio de proporción de más de 25 % reencuadra; los pequeños no mueven la cámara del usuario.
  const aspecto = useThree((s) => s.size.width / Math.max(1, s.size.height))
  const aspectoEncuadrado = useRef(aspecto)
  useEffect(() => {
    if (Math.abs(aspecto / aspectoEncuadrado.current - 1) <= 0.25) return
    aspectoEncuadrado.current = aspecto
    ir()
  }, [aspecto, ir])
  // el botón Encuadrar del viewport y Ver › Encuadrar (el marco) piden esto
  useEffect(() => {
    encuadre.ir = ir
    return () => {
      encuadre.ir = null
    }
  }, [ir])
  return (
    <OrbitControls
      makeDefault
      maxDistance={maxDistance}
      enableDamping
      dampingFactor={0.08}
      // Se detiene antes del horizonte: bajo el suelo nunca se ve el modelo.
      maxPolarAngle={Math.PI / 2 - 0.02}
    />
  )
}

/** `caja`: lo que se encuadra; `clave`: cuando cambia, la cámara vuelve a encuadrar (por ejemplo, otro plano). */
export function Escena({ caja, clave, children }: { caja: THREE.Box3 | null; clave: string; children: ReactNode }) {
  const medida = useMemo(() => {
    if (!caja) return { tam: 20, centro: [0, 0, 0] as [number, number, number] }
    const s = caja.getSize(new THREE.Vector3())
    const c = caja.getCenter(new THREE.Vector3())
    // Praktico usa 50 m como mínimo (una plaza); una unidad mide ~10 m
    return { tam: Math.max(s.x, s.y, s.z, 12), centro: [c.x, c.y, c.z] as [number, number, number] }
  }, [caja])
  // Luces, sombra y suelo conservan la medida anterior mientras no cambie más de 2 m.
  const [estable, setEstable] = useState(medida)
  if (
    Math.abs(medida.tam - estable.tam) > 2 ||
    Math.hypot(...(medida.centro.map((v, i) => v - estable.centro[i]) as [number, number, number])) > 2
  )
    setEstable(medida)
  const { tam, centro } = estable

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', minHeight: 0 }}>
      <Canvas
        shadows="soft"
        dpr={[1, 2]}
        camera={{ fov: 35 }}
        gl={{ antialias: true, preserveDrawingBuffer: true }}
        style={{ background: 'transparent' }}
        data-testid="escena-3d"
      >
        <Luces size={tam} center={centro} />
        <Suelo size={tam} center={centro} />
        <Suspense fallback={null}>{children}</Suspense>
        <Controles caja={caja} clave={clave} />
      </Canvas>
    </div>
  )
}
