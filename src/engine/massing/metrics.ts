// The numbers of a massing: areas, coverage and floor area. Cheap, so they are recomputed on every change.
import type { Polygon, Project } from '../../model/schema.ts'
import { regionsArea, union, type Region } from '../geom/boolean.ts'
import { corridorArea, rings } from '../geom/holes.ts'
import { allLevels } from '../buildings.ts'
import { isBasement, levelOf, massHeight } from '../levels.ts'
import type { BuildingFigures, DerivedMass, DerivedSite, Metrics } from '../types.ts'
import { buildableArea } from './site.ts'

/**
 * Union, not a sum: if two shapes overlap (an error on one level, a building's floors on several), the shared area
 * counts once. One shape at a time: within one operand a ring inside another is a hole, and a floor over a larger
 * one would be taken out of it. Each shape is its outline and its holes.
 */
function unionArea(shapes: Polygon[][]): number {
  let regions: Region[] = []
  for (const s of shapes) regions = union(regions.flat(), s)
  return regionsArea(regions)
}

/** Footprint, floor area and volume of some masses: one option's design masses, or one building's. */
function figures(masses: DerivedMass[], project: Project) {
  const shaped = masses.filter((m) => m.polygon.length >= 3)
  const levels = new Map(allLevels(project).map((l) => [l.id, l]))
  // what covers the ground: the masses of the levels above it, seen from above
  const aboveGround = shaped.filter((m) => {
    const l = levels.get(m.levelId)
    return !l || !isBasement(l)
  })
  const builtFootprint = unionArea(aboveGround.filter((m) => m.built).map(rings))

  const floorAreaByLevel: Record<string, number> = {}
  let gfa = 0
  for (const id of new Set(shaped.map((m) => m.levelId))) {
    const l = levels.get(id)
    if (!l) continue
    const a = unionArea(shaped.filter((m) => m.built && m.levelId === id).map(rings))
    floorAreaByLevel[id] = a
    gfa += a * l.repeat
  }

  const own = new Map(project.masses.map((m) => [m.id, m]))
  let builtVolume = 0
  for (const m of shaped) {
    const mass = own.get(m.id)
    if (m.built && mass) builtVolume += m.area * massHeight(project, mass) * levelOf(project, mass).repeat
  }
  return { shaped, aboveGround, builtFootprint, floorAreaByLevel, gfa, builtVolume }
}

/** One option's metrics, from its design masses (context ones are left out before). */
export function measure(site: DerivedSite, masses: DerivedMass[], project: Project): Metrics {
  const f = figures(masses, project)
  const programOf = new Map(project.masses.map((m) => [m.id, m.programId ?? 'none']))
  const byProgram = new Map<string, Polygon[][]>()
  for (const m of f.aboveGround) {
    const key = programOf.get(m.id) ?? 'none'
    byProgram.set(key, [...(byProgram.get(key) ?? []), rings(m)])
  }
  const footprintByProgram: Record<string, number> = {}
  for (const [key, polygons] of byProgram) footprintByProgram[key] = unionArea(polygons)
  const built = f.shaped.filter((m) => m.built)
  const own = new Map(project.masses.map((m) => [m.id, m]))
  // a block's zones of another program (Decision "Block shape"): their ground that program's, taken from the block's own
  for (const m of f.aboveGround) {
    const mass = own.get(m.id)
    const key = mass?.programId ?? 'none'
    for (const z of mass?.zones ?? []) {
      const a = Math.min(z.area, footprintByProgram[key] ?? 0)
      footprintByProgram[key] = (footprintByProgram[key] ?? 0) - a
      footprintByProgram[z.programId ?? 'none'] = (footprintByProgram[z.programId ?? 'none'] ?? 0) + a
    }
  }
  let corridors = 0
  for (const m of built) {
    const mass = own.get(m.id)
    if (mass && m.corridors.length > 0) corridors += corridorArea(m.corridors) * levelOf(project, mass).repeat
  }

  // the brief's figures: each program's floor area, level by level, and its masses
  const levels = new Map(allLevels(project).map((l) => [l.id, l]))
  const areaByProgram: Record<string, number> = {}
  const massesByProgram: Record<string, number> = {}
  // a warehouse copy is one of its program's masses however many zones or parts it is made of (Decision "Warehouse type")
  const copies = new Set(project.buildings.filter((b) => b.warehouse).map((b) => b.id))
  const counted = new Set<string>()
  // program → level → its shapes there
  const onLevel = new Map<string, Map<string, Polygon[][]>>()
  for (const m of masses) {
    const key = programOf.get(m.id) ?? 'none'
    const copy = copies.has(m.buildingId) ? `${m.buildingId}|${key}` : null
    if (!copy || !counted.has(copy)) massesByProgram[key] = (massesByProgram[key] ?? 0) + 1
    if (copy) counted.add(copy)
    if (m.polygon.length < 3) continue
    const byLevel = onLevel.get(key) ?? new Map<string, Polygon[][]>()
    byLevel.set(m.levelId, [...(byLevel.get(m.levelId) ?? []), rings(m)])
    onLevel.set(key, byLevel)
  }
  for (const [key, byLevel] of onLevel)
    for (const [levelId, polygons] of byLevel) areaByProgram[key] = (areaByProgram[key] ?? 0) + unionArea(polygons) * (levels.get(levelId)?.repeat ?? 1)
  // a block's zones of another program (Decision "Block shape"): their floor that program's, taken from the block's own;
  // the zone one of that program's masses, once a copy
  for (const m of masses) {
    const mass = own.get(m.id)
    if (!mass?.zones?.length || m.polygon.length < 3) continue
    const key = mass.programId ?? 'none'
    const repeat = levels.get(m.levelId)?.repeat ?? 1
    for (const z of mass.zones) {
      const to = z.programId ?? 'none'
      const a = Math.min(z.area * repeat, areaByProgram[key] ?? 0)
      areaByProgram[key] = (areaByProgram[key] ?? 0) - a
      areaByProgram[to] = (areaByProgram[to] ?? 0) + a
      const copy = copies.has(m.buildingId) ? `${m.buildingId}|${to}` : null
      if (!copy || !counted.has(copy)) massesByProgram[to] = (massesByProgram[to] ?? 0) + 1
      if (copy) counted.add(copy)
    }
  }

  return {
    siteArea: site.area,
    buildableArea: buildableArea(site),
    builtFootprint: f.builtFootprint,
    coverage: site.area > 0 ? f.builtFootprint / site.area : null,
    footprintByProgram,
    areaByProgram,
    massesByProgram,
    floorAreaByLevel: f.floorAreaByLevel,
    gfa: f.gfa,
    builtVolume: f.builtVolume,
    builtMasses: built.length,
    corridorArea: corridors,
    buildings: new Set(built.map((m) => m.buildingId)).size,
  }
}

/** A building's own figures. */
export function measureBuilding(masses: DerivedMass[], project: Project): BuildingFigures {
  const f = figures(masses, project)
  return { footprint: f.builtFootprint, floorAreaByLevel: f.floorAreaByLevel, gfa: f.gfa, builtVolume: f.builtVolume }
}
