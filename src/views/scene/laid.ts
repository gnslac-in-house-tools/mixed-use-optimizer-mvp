// How the 3D lays the ground and what stands on it (Decisions "Terrain in 3D", "Platforms in 3D"): while Show's
// Terrain is on and the site has a surface, the ground round the site's mean height (`base`: the scene's 0), graded
// under the option's platforms and courts; each mass stands at its platform's level over the base (`lift`). Off, or
// with no surface, the 3D is flat and nothing is lifted. The design roads lie on their graded profiles (Decision "Graded
// roads"). A Compare pane (`option`) lays its own option's platforms and roads. Heights over the base are drawn `k`
// times (Decision "Vertical exaggeration": the ground, the platforms' levels and what lies on them; never a mass's
// own height nor the dock height), `up(z)` in the scene.
import { useMemo } from 'react'
import type { Id, Point } from '../../model/schema.ts'
import { standardsOf } from '../../engine/circulation/standards.ts'
import { gradedSurfaceOf, meanHeight, platformOfMass, surfaceOf, type Surface } from '../../modules/terrain/engine/index.ts'
import type { Earthwork, RoadGrading } from '../../engine/types.ts'
import { useApp } from '../../state/store.ts'
import { useTerrainView, type TerrainShow } from '../../modules/terrain/views/terrainView.ts'
import { useShown } from '../viewport/look.ts'

export interface Laid {
  /** The ground as it is. */
  surface: Surface
  /** The ground graded under the platforms and their courts (the ground as it is without them). */
  ground: Surface
  /** The site's mean ground height: the scene's 0. */
  base: number
  earthwork: Earthwork | null
  show: TerrainShow
  /** How far a court stands below its platform (m). */
  dockHeight: number
  /** The vertical exaggeration (1: as it is). */
  k: number
  /** A height (m, the terrain's) in the scene: over the base, k times. */
  up(z: number): number
}

/** The scene's ground; null: flat (no surface, or Show's Terrain off). Pure. */
export function laidOf(
  terrain: Parameters<typeof surfaceOf>[0] | undefined,
  show: TerrainShow,
  site: Point[] | null,
  earthwork: Earthwork | null,
  dockHeight: number,
  roads: RoadGrading | null = null,
  k = 1,
): Laid | null {
  const surface = terrain && show !== 'off' ? surfaceOf(terrain) : null
  if (!surface) return null
  // the masses with no platform stand at 0: the ground round the site's mean height
  const base = (site ? meanHeight(surface, site) : null) ?? (surface.min + surface.max) / 2
  const ground = (earthwork && gradedSurfaceOf(surface, earthwork, roads)) ?? surface
  return { surface, ground, base, earthwork, show, dockHeight, k, up: (z) => (z - base) * k }
}

/** The scene's ground for the viewport (what it shows: the design or a look), or a Compare pane's `option`. */
export function useLaid(option?: Id): Laid | null {
  const shownTerrain = useShown((s) => s.project.site.terrain)
  const shownStandards = useShown((s) => s.project.standards)
  const shownSite = useShown((s) => s.derived.site.polygon)
  const shownEarth = useShown((s) => s.derived.earthwork)
  const paneEarth = useApp((s) => (option === undefined ? null : (s.derived.options[option]?.earthwork ?? null)))
  const shownRoads = useShown((s) => s.derived.roadGrading)
  const paneRoads = useApp((s) => (option === undefined ? null : (s.derived.options[option]?.roadGrading ?? null)))
  const show = useTerrainView((s) => s.show)
  const k = useTerrainView((s) => s.exaggeration)
  const earthwork = option === undefined ? shownEarth : paneEarth
  const roads = option === undefined ? shownRoads : paneRoads
  return useMemo(
    () => laidOf(shownTerrain, show, shownSite, earthwork, standardsOf({ standards: shownStandards }).dockHeight, roads, k),
    [shownTerrain, show, shownSite, earthwork, shownStandards, roads, k],
  )
}

/** How high a mass stands over the scene's 0: its platform's level over the base (0 when flat or with none). */
export function liftOf(laid: Laid | null, massId: Id): number {
  const level = laid ? platformOfMass(laid.earthwork, massId)?.level : null
  return laid && level !== null && level !== undefined ? laid.up(level) : 0
}

/** How high a building stands: its own platform's level over the base (not a step's; 0 when flat or with none). */
export function buildingLift(laid: Laid | null, buildingId: Id): number {
  const level = laid?.earthwork?.platforms.find((x) => !x.step && x.buildingIds.includes(buildingId))?.level
  return laid && level !== null && level !== undefined ? laid.up(level) : 0
}
