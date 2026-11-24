// The paving in 3D (Phase S.4, Decision "Stress test views"; the stress test: "in 3D I also need to see the streets,
// everything as in 2D"): the roads (existing and the streets, at their width), the truck courts with their
// approaches, and the car stalls, flat on the ground, each layer a few centimetres over the one under it so they do
// not flicker. Drawn from Design on (detail.ts); it never answers the pointer. On the ground's surface (Show's
// Terrain on, E.3c, Decision "Platforms in 3D") each court lies flat at its platform's level less the dock height,
// and the roads, the approaches and the stalls lie on the ground, graded where the platforms grade it, their outlines
// cut every few metres so they follow it. What an eye hides (views/layers: Streets, Existing roads, Truck courts,
// Street parking, or an existing road's own key) is left out: its paving is not in the scene; nor are the
// courts of a building whose eye is off (`massDrawn`, views/buildingView.ts).
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import type { Id, Point, Polygon } from '../../model/schema.ts'
import { joinedPaving } from '../../engine/path/join.ts'
import type { Region } from '../../engine/geom/boolean.ts'
import { platformOfMass } from '../../modules/terrain/engine/index.ts'
import { courtShapes, type Circulation, type DerivedMass, type DerivedRoad } from '../../engine/types.ts'
import { massDrawn } from '../buildingView.ts'
import { COURTS, roadHidden, shownStalls } from '../layers/keys.ts'
import { useHiddenSet } from '../layers/layerView.ts'
import type { SceneColors } from './colors.ts'
import { useLaid, type Laid } from './laid.ts'
import { LIFT as OVER_GROUND } from './terrain3d.ts'

/** m: how far each layer stands over the ground (and over the one before it). */
const LIFT = { court: 0.02, road: 0.04, stall: 0.06 }

/** Regions (an outline and its holes) as one flat geometry in the plan's x, y. */
function flat(regions: Region[]): THREE.BufferGeometry {
  const shapes = regions
    .filter((r) => r[0] && r[0].length >= 3)
    .map(([outer, ...holes]) => {
      const s = new THREE.Shape(outer.map((q) => new THREE.Vector2(q.x, q.y)))
      for (const h of holes) if (h.length >= 3) s.holes.push(new THREE.Path(h.map((q) => new THREE.Vector2(q.x, q.y))))
      return s
    })
  return new THREE.ShapeGeometry(shapes)
}

const each = (polygons: Polygon[]): Region[] => polygons.map((p) => [p])

/** A ring's corners and points between them, none farther apart than `step`. */
function cut(ring: Polygon, step: number): THREE.Vector2[] {
  const out: THREE.Vector2[] = []
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]
    const b = ring[(i + 1) % ring.length]
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / step))
    for (let k = 0; k < n; k++) out.push(new THREE.Vector2(a.x + ((b.x - a.x) * k) / n, a.y + ((b.y - a.y) * k) / n))
  }
  return out
}

/** A region and the height (m over the scene's 0) of each point of it. */
export interface Lying {
  region: Region
  height(p: Point): number
}

/** Regions lying on their heights: each ring cut every `step` m and triangulated facing up, each corner at its height. */
export function drapedRegions(items: Lying[], step = 3): Float32Array {
  const out: number[] = []
  for (const { region, height } of items) {
    const [outer, ...holes] = region
    if (!outer || outer.length < 3) continue
    const contour = cut(outer, step)
    const hs = holes.filter((h) => h.length >= 3).map((h) => cut(h, step))
    const all = [...contour, ...hs.flat()]
    for (const face of THREE.ShapeUtils.triangulateShape(contour, hs)) {
      // counter-clockwise with y up faces up in the scene (plan y is its −z)
      const [a, b, c] = face.map((i) => all[i])
      const ccw = (b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y) > 0
      for (const v of ccw ? [a, b, c] : [a, c, b]) out.push(v.x, height({ x: v.x, y: v.y }), -v.y)
    }
  }
  return new Float32Array(out)
}

function Layer({ regions, color, lift, name, lying }: { regions: Region[]; color: string; lift: number; name: string; lying?: Lying[] }) {
  const geometry = useMemo(() => {
    if (!lying) return flat(regions)
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(drapedRegions(lying.map((x) => ({ region: x.region, height: (p) => x.height(p) + lift }))), 3))
    g.computeVertexNormals()
    return g
  }, [regions, lying, lift])
  useEffect(() => () => geometry.dispose(), [geometry])
  if (regions.length === 0) return null
  if (lying)
    return (
      <mesh name={name} geometry={geometry} receiveShadow raycast={() => null}>
        <meshStandardMaterial color={color} roughness={1} side={THREE.DoubleSide} polygonOffset polygonOffsetFactor={-1} />
      </mesh>
    )
  return (
    // the plan's x, y lie on the ground: x east, y north (−z)
    <mesh name={name} geometry={geometry} rotation={[-Math.PI / 2, 0, 0]} position={[0, lift, 0]} receiveShadow raycast={() => null}>
      <meshStandardMaterial color={color} roughness={1} side={THREE.DoubleSide} polygonOffset polygonOffsetFactor={-1} />
    </mesh>
  )
}

/** What lies where on the laid ground: the courts at their platforms' level less the dock height, the rest on it. */
function lyingOf(c: Circulation, paved: ReturnType<typeof pavingOf>, laid: Laid, off: ReadonlySet<string>) {
  // over the ground's own triangles, which may rise between the corners a road is cut at
  const onGround = (p: Point) => laid.up(laid.ground.elevation(p) ?? laid.base) + OVER_GROUND
  const on = (regions: Region[]): Lying[] => regions.map((region) => ({ region, height: onGround }))
  // a court with a shape of its own is laid as its shapes, each at the platform's level
  const courts: Lying[] = (off.has(COURTS) ? [] : c.docks).flatMap((d) => {
    const level = platformOfMass(laid.earthwork, d.massId)?.level
    // the dock height is the building's, never exaggerated
    const z = level === null || level === undefined ? null : laid.up(level) - laid.dockHeight
    return courtShapes(d).map((shape) => ({ region: [shape], height: z === null ? onGround : () => z }))
  })
  return { byHand: on(paved.byHand), courts: [...courts, ...on(off.has(COURTS) ? [] : each(c.approaches))], stalls: on(paved.stalls) }
}

const NOTHING_OFF: ReadonlySet<string> = new Set()

/**
 * What is paved, by layer: the context's streets and the option's streets, the courts, the stalls. `off`: the keys hidden
 * (layers/keys.ts); what they hide is left out.
 */
export function pavingOf(c: Circulation, off: ReadonlySet<string> = NOTHING_OFF) {
  const { roads, docks, approaches } = c
  const drawn = (r: DerivedRoad) => !roadHidden(off, r)
  return {
    // the streets along the site (existing streets since Phase PE.2) and the existing roads are the context's
    byHand: joinedPaving(roads.filter(drawn).map((r) => ({ points: r.points, width: r.width, radius: r.radius }))),
    courts: off.has(COURTS) ? [] : [...each(docks.flatMap(courtShapes)), ...each(approaches)],
    // the stalls along a hidden street go with it (they still count)
    stalls: each(shownStalls(c, off)),
  }
}

/** `option`: a Compare pane's (its platforms); `masses`: the derived masses, to tell whose building each court is. */
export function Paving({ circulation, masses, colors, option }: { circulation: Circulation; masses: Record<Id, DerivedMass>; colors: SceneColors; option?: Id }) {
  const off = useHiddenSet()
  // the courts of a building whose eye is off are not in the scene (the 3D's rule, `massDrawn`: no exception)
  const drawn = useMemo(() => ({ ...circulation, docks: circulation.docks.filter((d) => massDrawn(masses, d.massId, off)) }), [circulation, masses, off])
  const paved = useMemo(() => pavingOf(drawn, off), [drawn, off])
  const laid = useLaid(option)
  const lying = useMemo(() => (laid ? lyingOf(drawn, paved, laid, off) : null), [drawn, paved, laid, off])
  return (
    <group name="paving">
      <Layer name="courts" regions={paved.courts} color={colors.court} lift={LIFT.court} lying={lying?.courts} />
      <Layer name="roads" regions={paved.byHand} color={colors.road} lift={LIFT.road + 0.005} lying={lying?.byHand} />
      <Layer name="stalls" regions={paved.stalls} color={colors.stall} lift={LIFT.stall} lying={lying?.stalls} />
    </group>
  )
}
