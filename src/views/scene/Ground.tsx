// The ground: a quiet grid and a plane that only receives shadows (IZA's Ground.tsx; port of Plaza-Practiko
// `vistas/tresd/Suelo.tsx`), the map under the site (Phase 5.4: where the georeference puts it, at the viewer's
// opacity, while the viewer has it on), plus the site boundary and the buildable line drawn on it. With a terrain and
// Show's Terrain on (Phase E.2c), the ground's surface takes the grid's, the shadows' and the map's place
// (TerrainGround.tsx), laid round the site's mean height and graded under the platforms (E.3c, laid.ts), and the
// site's lines lie on it. A Compare pane (`option`) grades its own option's. The site's drawings (Decision "Drawing
// layers": its drawing lines and parcels, those shown) lie with them; those the layer tree puts *On top* (layers/layerView.ts) are
// drawn through the model: no depth test and a render order over the masses' (`ON_TOP_RENDER_ORDER`), as the program graph's arcs are. So are the project's reference lines (Phase AS.5):
// dashed in the guide's colour on the ground, through the model when the Reference lines row is *On top*, and not in the scene when hidden; none is picked there. The boundary's and the buildable line's outlines have
// an eye each (views/layers): hidden, the ring is not in the scene (the ground under it stays).
import { Grid } from '@react-three/drei'
import { memo, useEffect, useMemo } from 'react'
import * as THREE from 'three'
import type { DrawingLayer, Id, Point } from '../../model/schema.ts'
import { mapOnPlan } from '../../engine/geo/local.ts'
import { useApp } from '../../state/store.ts'
import { contourToPolygon } from '../../engine/geom/contour.ts'
import { aciRgb } from '../plan/site/aci.ts'
import { BOUNDARY, BUILDABLE, drawingLayer, isObjectHidden, MAP, parcel, REFERENCE_LINES } from '../layers/keys.ts'
import { useHidden, useLayerView } from '../layers/layerView.ts'
import { useMapView } from '../plan/site/mapView.ts'
import type { SceneColors } from './colors.ts'
import { ringSegments } from './geometry3d.ts'
import { useLaid, type Laid } from './laid.ts'
import { drapedSegments } from './terrain3d.ts'
import { TerrainGround } from '../../modules/terrain/views/TerrainGround.tsx'

/** The render order of what is drawn through the model (a drawing layer On top): over the masses', under the graph's arcs (10). */
export const ON_TOP_RENDER_ORDER = 8

/** Closed rings lying on the ground (a hair above it, so the grid does not hide them), or on its surface. `onTop`: through the model. */
function Rings({
  name,
  rings,
  color,
  dashed = false,
  laid,
  onTop = false,
}: {
  name: string
  rings: Point[][]
  color: string
  dashed?: boolean
  laid: Laid | null
  onTop?: boolean
}) {
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(laid ? drapedSegments(rings, laid.ground.elevation, laid.base, 2, laid.k) : ringSegments(rings, 0.05), 3))
    return g
  }, [rings, laid])
  useEffect(() => () => geometry.dispose(), [geometry])
  return (
    <lineSegments
      name={name}
      geometry={geometry}
      raycast={() => null}
      renderOrder={onTop ? ON_TOP_RENDER_ORDER : 0}
      onUpdate={(l) => {
        if (dashed) l.computeLineDistances()
      }}
    >
      {dashed ? <lineDashedMaterial color={color} dashSize={3} gapSize={2} depthTest={!onTop} /> : <lineBasicMaterial color={color} depthTest={!onTop} />}
    </lineSegments>
  )
}

/** A line's pieces lying flat a hair above the ground (an open line's last corner not drawn back to its first). */
function flatSegments(lines: { points: Point[]; closed?: boolean }[], z: number): Float32Array {
  const out: number[] = []
  for (const l of lines)
    for (let i = 0; i < (l.closed ? l.points.length : l.points.length - 1); i++) {
      const a = l.points[i]
      const b = l.points[(i + 1) % l.points.length]
      out.push(a.x, z, -a.y, b.x, z, -b.y)
    }
  return new Float32Array(out)
}

/**
 * One reference layer's lines in its file's colour (none, or 7: the site's), lying on the ground or on its surface. Its
 * geometry is built per layer object (Decision "Drawings move"): a move gives new objects only to the layers it moves
 * (`carry`), so a preview of one drawing rebuilds that drawing's layers alone.
 */
const LayerLines = memo(function LayerLines({ layer, laid, site, onTop }: { layer: DrawingLayer; laid: Laid | null; site: string; onTop: boolean }) {
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry()
    const open = layer.lines.filter((x) => !x.closed).map((x) => x.points)
    const closed = layer.lines.filter((x) => x.closed).map((x) => x.points)
    const at = laid
      ? [...drapedSegments(open, laid.ground.elevation, laid.base, 2, laid.k, true), ...drapedSegments(closed, laid.ground.elevation, laid.base, 2, laid.k)]
      : [...flatSegments(layer.lines, 0.05)]
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(at), 3))
    return g
  }, [layer, laid])
  useEffect(() => () => geometry.dispose(), [geometry])
  const color = useMemo(() => {
    const rgb = aciRgb(layer.color)
    return rgb ? new THREE.Color(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255) : new THREE.Color(site)
  }, [layer.color, site])
  return (
    <lineSegments name="drawing-layer" geometry={geometry} raycast={() => null} renderOrder={onTop ? ON_TOP_RENDER_ORDER : 0}>
      <lineBasicMaterial color={color} transparent opacity={0.85} depthTest={!onTop} />
    </lineSegments>
  )
})

/**
 * The site's drawings (Decision "Drawing layers"): each reference layer shown in Layers (LayerLines), and
 * each parcel, dashed, lying on the ground or on its surface.
 */
function Drawings({ laid, colors }: { laid: Laid | null; colors: SceneColors }) {
  const drawings = useApp((s) => s.project.site.drawings)
  const parcels = useApp((s) => s.project.site.parcels)
  const hidden = useLayerView((s) => s.hidden)
  const onTop = useLayerView((s) => s.onTop)
  const layers = useMemo(() => {
    const off = new Set(hidden)
    const top = new Set(onTop)
    return (drawings ?? []).flatMap((d) =>
      d.layers.filter((l) => !off.has(drawingLayer(d.file, l.name))).map((l) => ({ key: drawingLayer(d.file, l.name), layer: l, top: top.has(drawingLayer(d.file, l.name)) })),
    )
  }, [drawings, hidden, onTop])
  // the parcels shown, in two outlines: the ones through the model and the others
  const shown = useMemo(() => {
    const off = new Set(hidden)
    const top = new Set(onTop)
    const mine = (parcels ?? []).filter((p) => !off.has(parcel(p.name, p.file)))
    const polygons = (over: boolean) => mine.filter((p) => top.has(parcel(p.name, p.file)) === over).map((p) => contourToPolygon(p.contour))
    return { under: polygons(false), over: polygons(true) }
  }, [parcels, hidden, onTop])
  return (
    <group name="drawings">
      {layers.map((l) => (
        <LayerLines key={l.key} layer={l.layer} laid={laid} site={colors.site} onTop={l.top} />
      ))}
      {shown.under.length > 0 && <Rings name="parcels" rings={shown.under} color={colors.site} dashed laid={laid} />}
      {shown.over.length > 0 && <Rings name="parcels-on-top" rings={shown.over} color={colors.site} dashed laid={laid} onTop />}
    </group>
  )
}

/**
 * The project's reference lines (Phase AS.5): every line shown in Layers, dashed in the guide's colour, lying on the ground (a hair above it) or on its surface; the lot of them one
 * object, through the model (`depthTest` off, a render order over the masses') when the Reference lines row is *On top*. Not picked there (no raycast).
 */
function ReferenceLines3D({ laid, colors }: { laid: Laid | null; colors: SceneColors }) {
  const lines = useApp((s) => s.project.referenceLines)
  const hidden = useLayerView((s) => s.hidden)
  const onTop = useLayerView((s) => s.onTop.includes(REFERENCE_LINES))
  const shown = useMemo(() => {
    const off = new Set(hidden)
    return (lines ?? []).filter((r) => !isObjectHidden(off, 'reference-line', r.id)).map((r) => ({ points: r.points }))
  }, [lines, hidden])
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry()
    const at = laid ? drapedSegments(shown.map((l) => l.points), laid.ground.elevation, laid.base, 2, laid.k, true) : [...flatSegments(shown, 0.06)]
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(at), 3))
    return g
  }, [shown, laid])
  useEffect(() => () => geometry.dispose(), [geometry])
  if (shown.length === 0) return null
  return (
    <lineSegments name="reference-lines" geometry={geometry} raycast={() => null} renderOrder={onTop ? ON_TOP_RENDER_ORDER : 0} onUpdate={(l) => l.computeLineDistances()}>
      <lineDashedMaterial color={colors.guide} dashSize={3} gapSize={2} depthTest={!onTop} />
    </lineSegments>
  )
}

/** The map's image lying on the ground, a hair under the rings; plan (x, y) is (x, ·, −y) in the scene. */
function MapGround() {
  const map = useApp((s) => s.project.site.map)
  const geo = useApp((s) => s.project.site.geo)
  const visible = !useHidden(MAP)
  const opacity = useMapView((s) => s.opacity)
  const image = map?.image
  const texture = useMemo(() => {
    if (!image) return null
    const t = new THREE.TextureLoader().load(image)
    t.colorSpace = THREE.SRGBColorSpace
    return t
  }, [image])
  useEffect(() => () => texture?.dispose(), [texture])
  if (!map || !geo || !texture || !visible) return null
  const { center, rotation, width, height } = mapOnPlan(geo, map)
  return (
    <group position={[center.x, 0.02, -center.y]} rotation={[0, (rotation * Math.PI) / 180, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} raycast={() => null} name="map-ground">
        <planeGeometry args={[width, height]} />
        <meshBasicMaterial map={texture} transparent opacity={opacity} toneMapped={false} depthWrite={false} />
      </mesh>
    </group>
  )
}

export function Ground({
  size,
  center,
  site,
  buildable,
  colors,
  option,
}: {
  size: number
  center: [number, number, number]
  site: Point[] | null
  buildable: Point[][]
  colors: SceneColors
  /** A Compare pane's option. */
  option?: Id
}) {
  const terrain = useApp((s) => s.project.site.terrain)
  const laid = useLaid(option)
  const boundaryShown = !useHidden(BOUNDARY)
  const buildableShown = !useHidden(BUILDABLE)
  if (laid && terrain)
    return (
      <group>
        <TerrainGround laid={laid} terrain={terrain} colors={colors} />
        {boundaryShown && site && <Rings name="boundary" rings={[site]} color={colors.site} laid={laid} />}
        {buildableShown && buildable.length > 0 && <Rings name="buildable" rings={buildable} color={colors.site} dashed laid={laid} />}
        <Drawings laid={laid} colors={colors} />
        <ReferenceLines3D laid={laid} colors={colors} />
      </group>
    )
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[center[0], 0, center[2]]} receiveShadow raycast={() => null}>
        <planeGeometry args={[size * 6, size * 6]} />
        <shadowMaterial opacity={0.22} />
      </mesh>
      <Grid
        position={[center[0], 0, center[2]]}
        cellSize={size / 20}
        sectionSize={size / 4}
        cellColor={colors.gridCell}
        sectionColor={colors.gridSection}
        cellThickness={0.6}
        sectionThickness={1}
        fadeDistance={size * 3}
        fadeStrength={1.5}
        infiniteGrid
        followCamera={false}
      />
      <MapGround />
      {boundaryShown && site && <Rings name="boundary" rings={[site]} color={colors.site} laid={null} />}
      {buildableShown && buildable.length > 0 && <Rings name="buildable" rings={buildable} color={colors.site} dashed laid={null} />}
      <Drawings laid={null} colors={colors} />
      <ReferenceLines3D laid={null} colors={colors} />
    </group>
  )
}
