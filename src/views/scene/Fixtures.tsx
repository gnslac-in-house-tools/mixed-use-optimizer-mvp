// What the docks and the gates show in the 3D (Decision "Fixtures in 3D"; the user: "Presentation and Ghosted show the
// docks, the platforms, the roads, the stalls and the accesses"), drawn with the paving (detail.ts `drawsAll`): each dock
// door a dark panel on its wall, at its mass's floor; on the laid ground, each dock wall's face, the dock height its
// platform stands over its court; each gate its two posts and its guard house (if it has one), on the ground (a gate the
// eyes hide, Gates or its own key in views/layers, is not in the scene; nor are the doors and dock faces of a building
// whose eye is off: `massDrawn`, views/buildingView.ts, the 3D's rule with no exception). Never answers the pointer.
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { Id, Point } from '../../model/schema.ts'
import { platformOfMass } from '../../modules/terrain/engine/index.ts'
import { isObjectHidden } from '../layers/keys.ts'
import { massDrawn } from '../buildingView.ts'
import { useHiddenSet } from '../layers/layerView.ts'
import type { Circulation, DerivedMass } from '../../engine/types.ts'
import type { SceneColors } from './colors.ts'
import { extrude } from './geometry3d.ts'
import { liftOf, useLaid, type Laid } from './laid.ts'

/** A dock door (m): its width, its height, how far it stands off its wall. */
export const DOOR = { width: 3, height: 3, off: 0.08 }
/** A gate's post (m): its side and its height; a guard house's height. */
export const POST = { side: 0.3, height: 1.5 }
export const GUARD_HEIGHT = 3

/** Each door's centre and the way it faces, in the scene (y up). */
export function doorsOf(c: Circulation, masses: Record<Id, DerivedMass>, lift: (id: Id) => number): { at: THREE.Vector3; angle: number }[] {
  return c.docks.flatMap((d) => {
    const m = masses[d.massId]
    if (!m) return []
    const y = m.span[0] + lift(d.massId) + DOOR.height / 2
    // the panel's thin side along the wall's normal; three's y turn of a plan direction (x, y) is atan2(y, x)
    const angle = Math.atan2(d.out.y, d.out.x)
    return d.doors.map((p) => ({ at: new THREE.Vector3(p.x + d.out.x * DOOR.off, y, -(p.y + d.out.y * DOOR.off)), angle }))
  })
}

/** Each dock wall's face from its court up to its platform (laid ground only), as triangles. */
export function dockFaces(c: Circulation, laid: Laid): Float32Array {
  const out: number[] = []
  for (const d of c.docks) {
    const level = platformOfMass(laid.earthwork, d.massId)?.level
    if (level === null || level === undefined || laid.dockHeight <= 0) continue
    const top = laid.up(level)
    const bottom = top - laid.dockHeight
    const a = { x: d.a.x + d.out.x * 0.01, y: d.a.y + d.out.y * 0.01 }
    const b = { x: d.b.x + d.out.x * 0.01, y: d.b.y + d.out.y * 0.01 }
    const v = (p: Point, z: number) => [p.x, z, -p.y]
    out.push(...v(a, bottom), ...v(b, bottom), ...v(b, top), ...v(a, bottom), ...v(b, top), ...v(a, top))
  }
  return new Float32Array(out)
}

function Doors({ doors, color }: { doors: { at: THREE.Vector3; angle: number }[]; color: string }) {
  const ref = useRef<THREE.InstancedMesh>(null)
  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const scale = new THREE.Vector3(0.1, DOOR.height, DOOR.width)
    doors.forEach((d, i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), d.angle)
      m.compose(d.at, q, scale)
      mesh.setMatrixAt(i, m)
    })
    mesh.instanceMatrix.needsUpdate = true
  }, [doors])
  if (doors.length === 0) return null
  return (
    <instancedMesh key={doors.length} ref={ref} name="dock-doors" args={[undefined, undefined, doors.length]} raycast={() => null}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color={color} roughness={0.7} />
    </instancedMesh>
  )
}

function Faces({ positions, color }: { positions: Float32Array; color: string }) {
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    g.computeVertexNormals()
    return g
  }, [positions])
  useEffect(() => () => geometry.dispose(), [geometry])
  if (positions.length === 0) return null
  return (
    <mesh name="dock-faces" geometry={geometry} castShadow receiveShadow raycast={() => null}>
      <meshStandardMaterial color={color} roughness={0.9} side={THREE.DoubleSide} />
    </mesh>
  )
}

function Gates({ circulation, laid, colors }: { circulation: Circulation; laid: Laid | null; colors: SceneColors }) {
  const off = useHiddenSet()
  const shown = circulation.gates.filter((g) => !isObjectHidden(off, 'gate', g.id))
  const onGround = (p: Point) => (laid ? laid.up(laid.ground.elevation(p) ?? laid.base) : 0)
  return (
    <group name="gates">
      {shown.map((g) => (
        <group key={g.id} name={`gate:${g.id}`}>
          {[g.a, g.b].map((p, i) => (
            <mesh key={i} position={[p.x, onGround(p) + POST.height / 2, -p.y]} castShadow raycast={() => null}>
              <boxGeometry args={[POST.side, POST.height, POST.side]} />
              <meshStandardMaterial color={colors.door} roughness={0.8} />
            </mesh>
          ))}
          {g.guardHouse && <Guard polygon={g.guardHouse} z0={onGround(g.guardHouse[0])} color={colors.context} edge={colors.edge} />}
        </group>
      ))}
    </group>
  )
}

function Guard({ polygon, z0, color, edge }: { polygon: Point[]; z0: number; color: string; edge: string }) {
  const geometry = useMemo(() => extrude(polygon, z0, GUARD_HEIGHT), [polygon, z0])
  useEffect(() => () => geometry.dispose(), [geometry])
  return (
    <mesh geometry={geometry} castShadow receiveShadow raycast={() => null} name="guard-house">
      <meshStandardMaterial color={color} roughness={0.9} />
      <lineSegments raycast={() => null}>
        <edgesGeometry args={[geometry]} />
        <lineBasicMaterial color={edge} transparent opacity={0.35} />
      </lineSegments>
    </mesh>
  )
}

/** `option`: a Compare pane's (its platforms); `masses`: the derived masses the doors stand on. */
export function Fixtures({ circulation, masses, colors, option }: { circulation: Circulation; masses: Record<Id, DerivedMass>; colors: SceneColors; option?: Id }) {
  const laid = useLaid(option)
  const off = useHiddenSet()
  // the docks of a building whose eye is off are not in the scene: no door, no face
  const docked = useMemo(() => ({ ...circulation, docks: circulation.docks.filter((d) => massDrawn(masses, d.massId, off)) }), [circulation, masses, off])
  const doors = useMemo(() => doorsOf(docked, masses, (id) => liftOf(laid, id)), [docked, masses, laid])
  const faces = useMemo(() => (laid ? dockFaces(docked, laid) : new Float32Array(0)), [docked, laid])
  return (
    <group name="fixtures">
      <Doors doors={doors} color={colors.door} />
      <Faces positions={faces} color={colors.context} />
      <Gates circulation={circulation} laid={laid} colors={colors} />
    </group>
  )
}
