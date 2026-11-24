// The warehouse type alone in 3D (Decisions "Warehouse layout", "Warehouse type": "schematic in the schematic view,
// ghosted or presentation low-poly"), in its own frame, without the site. Low-poly: each wall a box along its stretch,
// its thickness inwards; each column a box; nothing round. By the app's detail (views/detail.ts):
//   schematic     lines: the mass's outline and its holes at its floor and its top, each column a vertical line
//   ghosted       the zones' volumes see-through, each in its program's colour, the walls half so, the columns solid
//   presentation  the walls and the columns solid, a roof slab over each zone in its program's colour, faint, so the
//                 inside shows
// The zones are information inside the one mass (Decision "Block shape"): their volumes stand on the mass's floor
// raised by their level, the holes left open.
// Loaded lazily (WarehouseViewport.tsx): three.js stays out of the first download. The camera orbits round the hall.
import { OrbitControls } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { useMemo } from 'react'
import * as THREE from 'three'
import type { Polygon } from '../../../model/schema.ts'
import { columnOutline, wallOutline, type Generated } from '../engine/generate.ts'
import { outwardOf } from '../engine/shape.ts'
import { POST_SIDE } from './blockFixtures.ts'
import { useApp } from '../../../state/store.ts'
import { useDetail } from '../../../views/detail.ts'
import { useSceneColors } from '../../../views/scene/colors.ts'
import { extrude, ringSegments } from '../../../views/scene/geometry3d.ts'
import { Lights } from '../../../views/scene/Lights.tsx'

/** m: the roof slab's thickness; how far a door's panel stands out of its wall, and a dock door's and a level door's height. */
const ROOF = 0.3
const DOOR_OUT = 0.08
const DOCK_H = 3
const DOOR_H = 4.5

function Solid({ polygon, holes, z0, height, color, opacity = 1 }: { polygon: Polygon; holes?: Polygon[]; z0: number; height: number; color: string; opacity?: number }) {
  const geometry = useMemo(() => extrude(polygon, z0, height, holes), [polygon, holes, z0, height])
  return (
    <mesh geometry={geometry} castShadow={opacity === 1} receiveShadow>
      <meshStandardMaterial color={color} roughness={0.9} transparent={opacity < 1} opacity={opacity} depthWrite={opacity === 1} />
    </mesh>
  )
}

function Lines({ positions, color }: { positions: Float32Array; color: string }) {
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    return g
  }, [positions])
  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial color={color} />
    </lineSegments>
  )
}

export function WarehouseScene({ g }: { g: Generated }) {
  const programs = useApp((s) => s.project.programs)
  const detail = useDetail((s) => s.detail)
  const colors = useSceneColors()
  const colorOf = (program: string | null) => programs.find((x) => x.id === program)?.color ?? colors.noProgram
  const { x0, y0, x1, y1 } = g.box
  const size = Math.max(x1 - x0, y1 - y0)
  const top = Math.max(...g.parts.map((p) => p.level + p.height))
  // three's (x, y up, z = −plan y)
  const center: [number, number, number] = [(x0 + x1) / 2, 0, -(y0 + y1) / 2]
  const levelOf = new Map(g.parts.map((p) => [p.part, p]))

  const schematic = useMemo(() => {
    if (detail !== 'schematic') return null
    const rings = g.parts.flatMap((p) => [ringSegments([p.polygon, ...p.holes], p.level), ringSegments([p.polygon, ...p.holes], p.level + p.height)])
    const cols = new Float32Array(g.columns.flatMap((c) => [c.x, 0, -c.y, c.x, top, -c.y]))
    return { rings, cols }
  }, [detail, g, top])

  return (
    <Canvas shadows="soft" dpr={[1, 2]} camera={{ fov: 35, position: [center[0] - size * 0.8, size * 0.9, center[2] + size * 1.3], near: 1, far: size * 20 }} style={{ background: colors.bg }} aria-label="The warehouse type in 3D">
      <Lights size={size * 2} center={center} colors={colors} shadows={detail !== 'schematic'} />
      {/* the ground under it */}
      <mesh rotation-x={-Math.PI / 2} position={[center[0], -0.01, center[2]]} receiveShadow>
        <planeGeometry args={[size * 3, size * 3]} />
        <meshStandardMaterial color={colors.site} roughness={1} />
      </mesh>
      {schematic ? (
        <>
          {schematic.rings.map((r, i) => (
            <Lines key={i} positions={r} color={colors.edge} />
          ))}
          <Lines positions={schematic.cols} color={colors.gridLine} />
        </>
      ) : (
        <>
          {g.walls.map((w, i) => {
            const p = levelOf.get(w.part)!
            return (
              <Solid
                key={`w${i}`}
                polygon={wallOutline(w)}
                z0={p.level}
                height={p.height}
                color={colorOf(p.program)}
                opacity={detail === 'ghosted' ? 0.45 : 1}
              />
            )
          })}
          {/* the docks' and the level doors' openings: a panel just out of their wall, as tall as a door */}
          {g.doors
            .filter((d) => d.kind !== 'pattern')
            .map((d, i) => {
              const n = d.side === 'front' ? { x: 0, y: -1 } : d.side === 'back' ? { x: 0, y: 1 } : d.side === 'left' ? { x: -1, y: 0 } : { x: 1, y: 0 }
              const u = { x: Math.abs(n.y) * (d.width / 2), y: Math.abs(n.x) * (d.width / 2) }
              const o = { x: n.x * DOOR_OUT, y: n.y * DOOR_OUT }
              const face = [
                { x: d.at.x - u.x, y: d.at.y - u.y },
                { x: d.at.x + u.x, y: d.at.y + u.y },
                { x: d.at.x + u.x + o.x, y: d.at.y + u.y + o.y },
                { x: d.at.x - u.x + o.x, y: d.at.y - u.y + o.y },
              ]
              return <Solid key={`d${i}`} polygon={face} z0={levelOf.get(d.part)?.level ?? 0} height={d.kind === 'dock' ? DOCK_H : DOOR_H} color={colors.door} />
            })}
          {/* the patterns (a downpipe): a thin post on its wall, as tall as its part (as the site's 3D, blockFixtures.ts) */}
          {g.doors
            .filter((d) => d.kind === 'pattern')
            .map((d, i) => {
              const n = outwardOf(d.side)
              const h = POST_SIDE / 2
              const c = { x: d.at.x + n.x * h, y: d.at.y + n.y * h }
              const post = [
                { x: c.x - h, y: c.y - h },
                { x: c.x + h, y: c.y - h },
                { x: c.x + h, y: c.y + h },
                { x: c.x - h, y: c.y + h },
              ]
              const p = levelOf.get(d.part)
              return <Solid key={`p${i}`} polygon={post} z0={p?.level ?? 0} height={p?.height ?? DOOR_H} color={colors.door} />
            })}
          {g.columns.map((c, i) => (
            <Solid key={`c${i}`} polygon={columnOutline(c, g.columnSize)} z0={0} height={top} color={colors.door} />
          ))}
          {g.parts.flatMap((p) =>
            g.zones.flatMap((z) =>
              z.regions.map(([outline, ...holes], i) =>
                detail === 'ghosted' ? (
                  <Solid key={`${p.part}-${z.id}-${i}`} polygon={outline} holes={holes} z0={p.level + z.level} height={p.height} color={colorOf(z.program)} opacity={0.12} />
                ) : (
                  <Solid key={`${p.part}-${z.id}-${i}`} polygon={outline} holes={holes} z0={p.level + z.level + p.height} height={ROOF} color={colorOf(z.program)} opacity={0.25} />
                ),
              ),
            ),
          )}
        </>
      )}
      <OrbitControls makeDefault target={center} />
    </Canvas>
  )
}
