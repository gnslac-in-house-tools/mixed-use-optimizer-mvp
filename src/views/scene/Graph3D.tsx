// The graph in 3D (Decision "Graph mode": the Graph workspace's 3D view): a sphere in the middle of each mass of the
// active option, at the height of its first floor's middle, in its program's colour, and an arc between the two
// masses of each relation the rules make, green when met, red when broken, grey for *moves with*; thicker for
// adjacent. The masses around them are ghosts (Masses `ghost`). Drawn as tubes, not lines (WebGL lines are one pixel
// wide), and over everything (no depth test), as MELI floats its graph over the walls, so a relation between levels
// reads at once. A building whose eye is off has no bubble, and so no arc to it (the masses it hides are not there).
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { centroid } from '../../engine/geom/polygon.ts'
import { massDrawn } from '../buildingView.ts'
import { useHiddenSet } from '../layers/layerView.ts'
import { useShown } from '../viewport/look.ts'
import type { SceneColors } from './colors.ts'
import { massBody } from './geometry3d.ts'
import { liftOf, useLaid } from './laid.ts'

export function Graph3D({ colors }: { colors: SceneColors }) {
  const project = useShown((s) => s.project)
  const derived = useShown((s) => s.derived)
  // on the ground's surface, each mass on its platform (Decision "Platforms in 3D")
  const laid = useLaid()
  const off = useHiddenSet()

  const parts = useMemo(() => {
    const own = new Map(project.masses.map((m) => [m.id, m]))
    // where each mass's sphere sits, in the scene's axes (x, up, −y)
    const at = new Map<string, { p: THREE.Vector3; r: number; color: string }>()
    const ids = new Set(derived.relations.flatMap((x) => [x.a, x.b]))
    for (const [id, m] of own) {
      const d = derived.masses[id]
      // a building whose eye is off has no bubble (the 3D's rule: no exception)
      if (!d || d.polygon.length < 3 || d.context || !massDrawn(derived.masses, id, off)) continue
      if (!ids.has(id) && !d.built) continue
      const c = centroid(d.polygon)
      const body = massBody(project, m)
      at.set(id, {
        p: new THREE.Vector3(c.x, body.z0 + liftOf(laid, id) + Math.max(body.height, 0.5) / 2, -c.y),
        r: Math.max(2, Math.min(9, Math.sqrt(d.area) * 0.09)),
        color: project.programs.find((g) => g.id === m.programId)?.color ?? colors.noProgram,
      })
    }
    const arcs = derived.relations.flatMap((x) => {
      const a = at.get(x.a)
      const b = at.get(x.b)
      if (!a || !b) return []
      const mid = a.p.clone().add(b.p).multiplyScalar(0.5)
      // the arc rises with its length, so it clears the masses between
      mid.y += Math.max(6, a.p.distanceTo(b.p) * 0.3)
      const curve = new THREE.QuadraticBezierCurve3(a.p, mid, b.p)
      const radius = x.kind === 'adjacent' ? 1.1 : x.kind === 'apart' ? 0.45 : 0.7
      const geometry = new THREE.TubeGeometry(curve, 32, radius, 8, false)
      const color = x.kind === 'attached' ? colors.link : x.met ? colors.met : colors.error
      return [{ id: x.id, geometry, color, met: x.met }]
    })
    const spheres = [...at.entries()].map(([id, s]) => ({ id, ...s, geometry: new THREE.SphereGeometry(s.r, 24, 16) }))
    return { arcs, spheres }
  }, [project, derived, colors, laid, off])

  useEffect(
    () => () => {
      for (const a of parts.arcs) a.geometry.dispose()
      for (const s of parts.spheres) s.geometry.dispose()
    },
    [parts],
  )

  return (
    <group renderOrder={10}>
      {parts.arcs.map((a) => (
        <mesh key={a.id} geometry={a.geometry} renderOrder={10} userData={{ relation: a.id }}>
          <meshBasicMaterial color={a.color} depthTest={false} transparent opacity={a.met ? 0.8 : 0.95} />
        </mesh>
      ))}
      {parts.spheres.map((s) => (
        <mesh key={s.id} geometry={s.geometry} position={s.p} renderOrder={11} userData={{ massId: s.id }}>
          <meshBasicMaterial color={s.color} depthTest={false} />
        </mesh>
      ))}
    </group>
  )
}
