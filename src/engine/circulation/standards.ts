// The circulation's defaults (Decision "Exterior circulation"): what a project without its own standards uses. A
// typology copies its values into the project (Project.standards); 6.0's Standards tab will edit them with the rest.
import type { DesignOption, Gate, Project, Standards, Vehicles } from '../../model/schema.ts'
import { LANE_WIDTH } from '../path/lanes.ts'

/** The standards the optimizer may search a range of (Phase K.4), an option keeping what it tried as its own. */
export const SEARCHED_STANDARDS = ['roadWidth', 'carRoadWidth'] as const
export type SearchedStandard = (typeof SEARCHED_STANDARDS)[number]

/** The standards' figures (what the circulation is made with), without the ranges the optimizer searches or the street
 * types (engine/circulation/streets.ts `streetTypesOf`). */
export type StandardFigures = Required<Omit<Standards, 'search' | 'streetTypes'>>

export const CIRCULATION_DEFAULTS: StandardFigures = {
  roadWidth: 8, // a two-way truck road
  carRoadWidth: 6, // a two-way car road: where no truck goes to a dock (Decision "Circulation optimization")
  courtDepth: 40, // from the dock wall: the apron and the room a tractor-trailer needs to back in
  ringClear: 7, // a wall without docks to the ring road's edge: a sidewalk and a row of car stalls
  gateWidth: 12,
  gateRadius: 15,
  stallWidth: 2.5,
  stallDepth: 5.5,
  aisleWidth: 6, // a parking lot's two-way aisle, stalls at right angles on both sides (Decision "Lot tool")
  parking: 'double',
  dockHeight: 1.2, // a dock's floor over a trailer's: the court below its building's platform (Decision "Platforms")
  maxStep: 1.5, // the most a building's platforms may differ: a step a ramp or a few stairs take (Decision "Terrain")
  bankRatio: 2, // 1 : 2, a bank 2 m out for each metre up or down: what most ground holds unretained (Decision "Banks")
  maxGrade: 0.08, // the steepest a road may climb: 8 %, what a loaded truck takes (Decision "Roads on the ground")
  laneWidth: LANE_WIDTH, // a street's lane: a new lane's width and the lanes an unstored street shows (Phase PE.2)
}

const set = (o: object | undefined) => Object.fromEntries(Object.entries(o ?? {}).filter(([k, v]) => v !== undefined && k !== 'search' && k !== 'streetTypes'))

/** The project's standards, each absent one the default; with an option, its own road widths over them (Phase K.4). */
export function standardsOf(p: Pick<Project, 'standards'>, option?: Pick<DesignOption, 'standards'> | null): StandardFigures {
  return { ...CIRCULATION_DEFAULTS, ...set(p.standards), ...set(option?.standards) }
}

/** The narrowest road each user can drive, in m (a road narrower than its vehicle is an Issue). */
export const MIN_ROAD_WIDTH: Record<Vehicles, number> = { trucks: 7, cars: 5.5, all: 7 }

/** A new gate, from the standards: two-way, for everyone. */
export function newGateDefaults(p: Pick<Project, 'standards'>): Omit<Gate, 'id' | 't'> {
  const s = standardsOf(p)
  return { width: s.gateWidth, radius: s.gateRadius, flow: 'both', vehicles: 'all' }
}
