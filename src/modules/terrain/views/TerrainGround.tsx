// The ground's surface in the 3D (Phase E.2c, Decision "Terrain layout"), while Show's Terrain is on and the site has
// one: laid round the site's mean height (terrain3d.ts, laid.ts), graded under the platforms and their courts (E.3c,
// Decision "Platforms in 3D"). Contours: a matte warm grey, the map's image on it while the map shows, the major
// contours drawn on it where the ground is as it was; Slope: each triangle in its class's colour, as the plan's; Cut &
// fill: each triangle by how far it is cut or filled, the plan's classes, the ground as it was grey. It receives the
// masses' shadows; the site's lines lie on it (Ground.tsx).
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import type { Surface } from '../engine/index.ts'
import type { EarthGrid } from '../../../engine/types.ts'
import { mapOnPlan } from '../../../engine/geo/local.ts'
import type { Terrain } from '../../../model/schema.ts'
import { useApp } from '../../../state/store.ts'
import { useMapView } from '../../../views/plan/site/mapView.ts'
import { MAP } from '../../../views/layers/keys.ts'
import { useHidden } from '../../../views/layers/layerView.ts'
import { contoursOf } from './terrainDraw.ts'
import type { SceneColors } from '../../../views/scene/colors.ts'
import type { Laid } from '../../../views/scene/laid.ts'
import { contourSegments, earthMesh, mapUvs, offGraded, slopeMesh, surfacePositions, upward } from '../../../views/scene/terrain3d.ts'

const useDisposed = <T extends { dispose(): void }>(x: T | null) => useEffect(() => () => x?.dispose(), [x])

/** The map's image as a texture, while the map shows; null otherwise. */
function useMapTexture(): { texture: THREE.Texture; place: ReturnType<typeof mapOnPlan> } | null {
  const map = useApp((s) => s.project.site.map)
  const geo = useApp((s) => s.project.site.geo)
  const visible = !useHidden(MAP)
  const image = visible ? map?.image : undefined
  const texture = useMemo(() => {
    if (!image) return null
    const t = new THREE.TextureLoader().load(image)
    t.colorSpace = THREE.SRGBColorSpace
    return t
  }, [image])
  useDisposed(texture)
  return texture && map && geo ? { texture, place: mapOnPlan(geo, map) } : null
}

function Plain({ surface, base, k, terrain, grid, colors }: { surface: Surface; base: number; k: number; terrain: Terrain; grid: EarthGrid | null; colors: SceneColors }) {
  const map = useMapTexture()
  const opacity = useMapView((s) => s.opacity)
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(surfacePositions(surface, base, k), 3))
    g.setIndex(new THREE.BufferAttribute(upward(surface.triangles), 1))
    if (map) {
      const { center, rotation, width, height } = map.place
      g.setAttribute('uv', new THREE.BufferAttribute(mapUvs(surface, center, rotation, width, height), 2))
    }
    g.computeVertexNormals()
    return g
  }, [surface, base, k, map])
  useDisposed(geometry)
  const lines = useMemo(() => {
    const majors = contoursOf(terrain).filter((c) => c.major && c.z !== null)
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(contourSegments(offGraded(majors.map((c) => ({ points: c.points, z: c.z! })), grid), base, k), 3))
    return g
  }, [terrain, base, k, grid])
  useDisposed(lines)
  return (
    <group name="terrain-ground:contours">
      <mesh geometry={geometry} receiveShadow raycast={() => null}>
        {map ? (
          <meshStandardMaterial key="map" map={map.texture} roughness={1} metalness={0} transparent opacity={Math.max(opacity, 0.35)} />
        ) : (
          <meshStandardMaterial key="plain" color={colors.terrain} roughness={1} metalness={0} />
        )}
      </mesh>
      <lineSegments geometry={lines} raycast={() => null}>
        <lineBasicMaterial color={colors.contour} />
      </lineSegments>
    </group>
  )
}

/** Each triangle on its own, coloured by its class (`colorOf`: null, the ground's grey). */
function Classed({ mesh, colorOf, name }: { mesh: { positions: Float32Array; classes: Int8Array }; colorOf: (k: number) => string | null; name: string }) {
  const terrain = useMemo(() => new THREE.Color(), [])
  const geometry = useMemo(() => {
    const { positions, classes } = mesh
    const cache = new Map<number, THREE.Color>()
    const color = new Float32Array(positions.length)
    for (let k = 0; k < classes.length; k++) {
      let c = cache.get(classes[k])
      if (!c) {
        const css = colorOf(classes[k])
        c = css ? new THREE.Color(css) : terrain
        cache.set(classes[k], c)
      }
      for (let j = 0; j < 3; j++) color.set([c.r, c.g, c.b], 9 * k + 3 * j)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    g.setAttribute('color', new THREE.BufferAttribute(color, 3))
    g.computeVertexNormals()
    return g
  }, [mesh, colorOf, terrain])
  useDisposed(geometry)
  return (
    <mesh geometry={geometry} receiveShadow raycast={() => null} name={`terrain-ground:${name}`}>
      <meshStandardMaterial vertexColors roughness={1} metalness={0} />
    </mesh>
  )
}

export function TerrainGround({ laid, terrain, colors }: { laid: Laid; terrain: Terrain; colors: SceneColors }) {
  const { ground, surface, base, show, k } = laid
  const slope = useMemo(() => (show === 'slope' ? slopeMesh(ground, base, k) : null), [show, ground, base, k])
  const earth = useMemo(() => (show === 'earthwork' ? earthMesh(ground, surface, base, k) : null), [show, ground, surface, base, k])
  const slopeColor = useMemo(() => (k: number) => (k >= 0 ? colors.slope[k] : colors.terrain), [colors])
  const earthColor = useMemo(() => (k: number) => (k < 0 ? colors.cut[-k - 1] : k > 0 ? colors.fill[k - 1] : colors.terrain), [colors])
  if (slope) return <Classed key="slope" mesh={slope} colorOf={slopeColor} name="slope" />
  if (earth) return <Classed key="earthwork" mesh={earth} colorOf={earthColor} name="earthwork" />
  return <Plain surface={ground} base={base} k={k} terrain={terrain} grid={laid.earthwork?.grid ?? null} colors={colors} />
}
