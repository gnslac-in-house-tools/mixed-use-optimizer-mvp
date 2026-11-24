// What a model export carries (Decision "Model export"), pure: the asked option's buildings, the ground or both, in one
// set of coordinates the .3dm (export3dm.ts) and the IFC (exportIfc.ts) write as they are, in metres. The plan's x, y;
// z the terrain's own heights while the site has a ground (each mass on its platform's level, or on the site's mean
// height as the 3D lays it, Decision "Terrain in 3D", without the vertical exaggeration), else the levels' elevations:
// a Geometry export and a Terrain export of the same project land on each other.
//   masses     each mass of the option: its footprint (exact arcs for Rhino; the polygon and its holes for IFC), its
//              program, building and level, its height and the z of each floor of its ×N level; a smart block's,
//              the m² a floor of it its zones give other programs (Decision "Block shape": information, one mass)
//   site       the boundary and the buildable line (Geometry)
//   roads      the option's streets and existing roads (Geometry; Decision "Streets", ST.9): each one's centreline, at
//              the heights its grading gives it on a terrain (else the site's mean ground), its paving's outline in
//              plan, its width, for whom and its street type
//   courts     each docked wall's truck court (Geometry; Decision "Truck court"): its outline, its depth, at its level
//              (its building's platform less the standards' dock height on a terrain, else 0)
//   grounds    the ground as it is and, while platforms grade it, as graded: triangles facing up (Terrain)
//   contours   the terrain's contours whose height is known, at it (Terrain)
import type { Contour, Geo, Id, Point, Project } from '../model/schema.ts'
import { buildingOf, massesOfOption, optionBuildings, optionOf } from '../engine/buildings.ts'
import { footprintContour } from '../engine/geom/footprint.ts'
import { counterClockwise } from '../engine/geom/segments.ts'
import { levelOf, massHeight } from '../engine/levels.ts'
import { courtShapes, type Derived } from '../engine/types.ts'
import { standardsOf } from '../engine/circulation/standards.ts'
import { lanesOf } from '../engine/path/lanes.ts'
import { stripOutlines } from '../engine/path/strip.ts'
import { streetTypesOf } from '../engine/circulation/streets.ts'
import { gradedSurfaceOf, heightsOf, meanHeight, platformOfMass, surfaceOf, type Surface } from '../modules/terrain/engine/index.ts'

/** What a model export takes: the buildings and the site, the terrain, or both. */
export const MODEL_PARTS = ['geometry', 'terrain', 'all'] as const
export type ModelPart = (typeof MODEL_PARTS)[number]

/** How thick a mass whose program is not built is written (as the 3D view draws it). */
export const SLAB = 0.15

export interface ModelMass {
  id: Id
  name: string
  buildingId: Id
  levelId: Id
  programId: Id | null
  /** Its program's name, or "No program". */
  program: string
  built: boolean
  /** The footprint as drawn, counter-clockwise (arcs kept). */
  contour: Contour
  /** The footprint as a polygon and its holes (Derived's: arcs as chords). */
  polygon: Point[]
  holes: Point[][]
  /** m²: the polygon's less its holes. */
  area: number
  /** m: floor to top (a thin slab when its program is not built). */
  height: number
  /** m: where each floor of its level stands (once per floor of a ×N level). */
  floors: number[]
  /** A smart block's zones of other programs: m² of a floor each (Mass.zones), their program named; none: empty. */
  zones: { programId: Id | null; program: string; area: number }[]
}

export interface ModelLevel {
  id: Id
  name: string
  /** m: where each of its floors stands, on its building's base. */
  floors: number[]
}

export interface ModelBuilding {
  id: Id
  name: string
  /** m: the z its levels' elevations are measured from (its platform's level, the site's mean ground, or 0). */
  base: number
  levels: ModelLevel[]
}

/** m, to the millimetre: a lane's width as the exports state it (float noise out). */
const mm = (v: number) => Math.round(v * 1000) / 1000

/** A road's lanes as text, `sep` between them: `3.5,3.5,3.5` (Rhino's User Text), `3.5 3.5 3.5` (IFC). */
export const lanesText = (lanes: number[], sep: string) => lanes.join(sep)

/** A road of the option: a street or an existing road (Decision "Streets"). */
export interface ModelRoad {
  id: string
  name: 'Street' | 'Existing road'
  /** Its street type's name (a street's), else null. */
  type: string | null
  width: number
  /** m of paving each side of its drawn line, walking it (a street's, an existing road's: its run's); `width` is their sum. */
  left: number
  right: number
  vehicles: 'trucks' | 'cars' | 'all'
  /** m: its lanes, left to right walking it (Phase PE.2): the stored ones, else equal lanes from its width; they add up to `width` (each to the millimetre). */
  lanes: number[]
  /** Its centreline, at the heights its grading gives it (on a terrain), else at the site's mean ground. */
  centre: { x: number; y: number; z: number }[]
  /** Its paving in plan: the outline of its strip, each a closed polygon, at `z`. */
  paving: Point[][]
  /** m: where its paving's outline is written (the site's mean ground, or 0). */
  z: number
}

/**
 * A docked wall's truck court (Decision "Truck court"). A wall whose courts have shapes of their own (Phase D.3) has one of these for each court,
 * numbered by `part` (from 1, in the order the circulation has them); a wall without a shape has one, with no `part`.
 */
export interface ModelCourt {
  massId: Id
  wall: number
  /** From 1: which court of the wall, when its courts have shapes of their own; absent: its one rectangle. */
  part?: number
  name: string
  outline: Point[]
  /** m: its depth, as asked (a shared court's outline may stop short of it at the other wall). */
  depth: number
  /** m: its level: its building's platform less the dock height on a terrain, else 0. */
  z: number
}

export interface ModelGround {
  name: 'Existing' | 'Graded'
  x: Float64Array
  y: Float64Array
  z: Float64Array
  /** Three corners a triangle, counter-clockwise seen from above: each faces up. */
  triangles: Uint32Array
}

export interface ExportModel {
  name: string
  part: ModelPart
  geo: Geo | null
  buildings: ModelBuilding[]
  masses: ModelMass[]
  /** The site's lines, at the site's mean ground (0 without one). */
  site: { boundary: Contour; buildable: Point[][]; z: number } | null
  roads: ModelRoad[]
  courts: ModelCourt[]
  grounds: ModelGround[]
  contours: { points: Point[]; closed: boolean; z: number }[]
}

/** Whether the project has a ground to export (a terrain that triangulates). */
export const hasGround = (p: Project): boolean => !!(p.site.terrain && surfaceOf(p.site.terrain))

const faceUp = (t: Uint32Array): Uint32Array => {
  const out = new Uint32Array(t.length)
  for (let k = 0; k < t.length; k += 3) out.set([t[k], t[k + 2], t[k + 1]], k)
  return out
}
const groundOf = (name: ModelGround['name'], s: Surface): ModelGround => ({ name, x: s.x, y: s.y, z: s.z, triangles: faceUp(s.triangles) })

export function modelOf(p: Project, d: Pick<Derived, 'site' | 'masses' | 'earthwork'> & Partial<Pick<Derived, 'option' | 'roadGrading' | 'circulation'>>, part: ModelPart): ExportModel {
  const option = optionOf(p, d.option)
  const surface = p.site.terrain ? surfaceOf(p.site.terrain) : null
  // the masses with no platform stand on the site's mean ground (laid.ts), or at 0 when there is none
  const base = surface ? ((d.site.polygon ? meanHeight(surface, d.site.polygon) : null) ?? (surface.min + surface.max) / 2) : 0
  const platformLevel = (level: number | null | undefined) => (surface && level !== null && level !== undefined ? level : base)
  const geometry = part !== 'terrain'
  const terrain = part !== 'geometry'

  const buildings: ModelBuilding[] = geometry
    ? optionBuildings(p, option).map((b) => {
        const own = platformLevel(d.earthwork?.platforms.find((x) => !x.step && x.buildingIds.includes(b.id))?.level)
        return {
          id: b.id,
          name: b.name,
          base: own,
          levels: [...b.levels]
            .sort((a, c) => a.elevation - c.elevation)
            .map((l) => ({ id: l.id, name: l.name, floors: Array.from({ length: l.repeat }, (_, k) => own + l.elevation + k * l.height) })),
        }
      })
    : []

  const programs = new Map(p.programs.map((g) => [g.id, g]))
  const masses: ModelMass[] = geometry
    ? massesOfOption(p, option).flatMap((m) => {
        const dm = d.masses[m.id]
        if (!dm || dm.polygon.length < 3) return []
        const program = m.programId ? programs.get(m.programId) : undefined
        const built = !program || program.built
        const level = levelOf(p, m)
        const lift = platformLevel(platformOfMass(d.earthwork, m.id)?.level)
        return [
          {
            id: m.id,
            name: m.name,
            buildingId: buildingOf(p, m).id,
            levelId: level.id,
            programId: m.programId ?? null,
            program: program?.name ?? 'No program',
            built,
            contour: counterClockwise(footprintContour(m.footprint)),
            polygon: dm.polygon,
            holes: dm.holes,
            area: dm.area,
            height: built ? massHeight(p, m) : SLAB,
            floors: Array.from({ length: level.repeat }, (_, k) => lift + level.elevation + k * level.height),
            zones: (m.zones ?? []).map((z) => ({ programId: z.programId, program: (z.programId && programs.get(z.programId)?.name) || 'No program', area: z.area })),
          },
        ]
      })
    : []

  // the streets and courts (Decision "Streets", ST.9): what the plan paves, where it stands
  const circulation = geometry ? d.circulation : undefined
  const types = streetTypesOf(p, option)
  const laneWidth = standardsOf(p, option).laneWidth
  const roads: ModelRoad[] = (circulation?.roads ?? []).flatMap((r) => {
    if (r.points.length < 2) return []
    const graded = d.roadGrading?.roads.find((x) => x.roadId === r.id)
    const centre = graded && graded.stations.length >= 2 ? graded.stations.map((st) => ({ x: st.p.x, y: st.p.y, z: st.z })) : r.points.map((q) => ({ ...q, z: base }))
    const left = r.left ?? r.width / 2
    const right = r.right ?? r.width / 2
    return [
      {
        id: r.id,
        name: r.kind === 'existing' ? ('Existing road' as const) : ('Street' as const),
        type: (r.streetType && types.find((t) => t.id === r.streetType)?.name) || null,
        width: r.width,
        left,
        right,
        vehicles: r.vehicles,
        lanes: (r.lanes ?? lanesOf({ left, right }, laneWidth)).map(mm),
        centre,
        paving: stripOutlines(r.points, r.width).filter((x) => x.length >= 3),
        z: base,
      },
    ]
  })
  const dockHeight = standardsOf(p, option).dockHeight
  const massNames = new Map(Object.values(d.masses).map((m) => [m.id, m.name]))
  // a court for each shape a wall's courts have (the paving they are), its depth its own: how far its farthest corner stands out of the wall
  const courts: ModelCourt[] = (circulation?.docks ?? []).flatMap((c): ModelCourt[] => {
    const level = platformOfMass(d.earthwork, c.massId)?.level
    const z = surface && level !== null && level !== undefined ? level - dockHeight : 0
    const name = `${massNames.get(c.massId) ?? c.massId} · court ${c.wall + 1}`
    if (!c.shapes) return [{ massId: c.massId, wall: c.wall, name, outline: c.court, depth: c.depth, z }]
    return courtShapes(c).map((outline, k) => ({
      massId: c.massId,
      wall: c.wall,
      part: k + 1,
      name: c.shapes!.length > 1 ? `${name} · part ${k + 1}` : name,
      outline,
      depth: Math.max(...outline.map((q) => (q.x - c.a.x) * c.out.x + (q.y - c.a.y) * c.out.y)),
      z,
    }))
  })

  const grounds: ModelGround[] = []
  const contours: ExportModel['contours'] = []
  if (terrain && surface && p.site.terrain) {
    grounds.push(groundOf('Existing', surface))
    const graded = d.earthwork ? gradedSurfaceOf(surface, d.earthwork, d.roadGrading ?? null) : null
    if (graded && graded !== surface) grounds.push(groundOf('Graded', graded))
    const heights = heightsOf(p.site.terrain)
    p.site.terrain.contours.forEach((c, k) => {
      const z = heights.z[k]
      if (z !== null) contours.push({ points: c.points, closed: !!c.closed, z })
    })
  }

  return {
    name: p.name,
    part,
    geo: p.site.geo ?? null,
    buildings,
    masses,
    site: geometry && p.site.boundary ? { boundary: p.site.boundary, buildable: (d.site.buildable ?? []).flat().filter((r) => r.length >= 3), z: base } : null,
    roads,
    courts,
    grounds,
    contours,
  }
}
