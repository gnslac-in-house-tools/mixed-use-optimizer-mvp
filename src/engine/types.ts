// Shapes the engine PRODUCES. Unlike model/schema.ts, nothing here is saved: Derived is rebuilt from the
// Project on every change, so it never needs validation, versioning or migration.
import type { Gate, Id, Point, Polygon, StreetParking, Vehicles } from '../model/schema.ts'
import type { Region } from './geom/boolean.ts'
import type { Corridor } from './geom/holes.ts'
import type { Relation } from './graph/relations.ts'
import type { DerivedLot } from '../modules/parking/engine/lots.ts'

export interface DerivedSite {
  polygon: Polygon | null // the boundary as a polygon (arcs as chords); null = no site yet
  area: number // m²
  buildable: Region[] // the boundary minus the setback: where built masses may stand
}

export interface DerivedMass {
  id: Id
  name: string
  levelId: Id
  buildingId: Id // its level's building
  context: boolean // its building is context: drawn, never counted (Decision "Buildings and options")
  span: [number, number] // m: where its stack starts and ends (its level's floor → the top of its last copy)
  polygon: Polygon // empty when the footprint could not be built
  holes: Polygon[] // its holes cut out of polygon, merged, clipped to it, clockwise (engine/geom/holes.ts)
  corridors: Corridor[] // round the holes that have one (Phase H.4), part of its area
  area: number // m²: the polygon's less its holes
  built: boolean // from its program; decides coverage and overlap rules
}

export interface Metrics {
  siteArea: number
  buildableArea: number
  // The ground the built masses cover: the union of the levels above ground, as seen from above (an overlap, or a mass
  // over another one, is not counted twice). Basements do not cover the site.
  builtFootprint: number
  coverage: number | null // builtFootprint / siteArea; null without a site
  footprintByProgram: Record<Id, number> // m² per program id ('none' = no program), the same projection
  // m² per program id: on each level the union of its masses × the level's ×N (GFA for a built program, ground for an
  // open one). What the brief's target area is compared with (Decision "Brief").
  areaByProgram: Record<Id, number>
  massesByProgram: Record<Id, number> // how many masses per program id, built or not (a typical floor counts once)
  floorAreaByLevel: Record<Id, number> // m², one floor of each level: the union of its built masses
  gfa: number // gross floor area: each level's floor area × its ×N, basements included
  builtVolume: number // m³: footprint × height of every built mass × its level's ×N
  builtMasses: number // how many built masses
  corridorArea: number // m²: the corridors round the holes of built masses (Phase H.4), × their level's ×N
  buildings: number // how many buildings have a built mass
}

/** One building's own figures, whatever option shows it (context ones too: they are the building's, not counted). */
export interface BuildingFigures {
  footprint: number // m², its levels above ground seen from above
  floorAreaByLevel: Record<Id, number> // m², one floor of each of its levels that has masses
  gfa: number // m²
  builtVolume: number // m³
}

// ---- Exterior circulation (Decision "Exterior circulation") ----------------------------------------------------

/** A gate on the plan: its opening (a → b) on the boundary at `at`, the lane in, its guard house, its arrow. */
export interface DerivedGate {
  id: Id
  /** On the boundary: where on its perimeter. */
  t?: number
  /** On a street or an existing street (Phase PE.2): its host's side and the place along it. */
  on?: Gate['on']
  at: Point
  dir: Point // along its side (the boundary's counter-clockwise run)
  inward: Point // the way its lane runs: into the site from the boundary, away from a street's paving
  a: Point
  b: Point
  lane: Polygon
  guardHouse: Polygon | null
  arrow: { from: Point; to: Point }
  end: Point // the lane's inner end: where the roads meet the gate
  width: number
  flow: Gate['flow']
  vehicles: Vehicles
}

/**
 * A road of the option's network: `existing` (in the parcel) or `street` (a run of the option's streets, Decision
 * "Streets"; since ST.4 no road is derived). Its id: `existing:<id>`, `street:<its first segment>`.
 */
export interface DerivedRoad {
  id: string
  kind: 'existing' | 'street'
  points: Point[]
  width: number
  /** A street's: the paving each side of its drawn line (`nodePoints`), walking the run (project 19); `width` is their sum. */
  left?: number
  right?: number
  /** The lanes along the run, m, left to right walking it (Phase PE.2): the stored ones when they add up, else equal lanes from the width; they add up to `width`. */
  lanes?: number[]
  vehicles: Vehicles
  /** The Project's existing road it draws; a street's: its first segment. */
  sourceId?: Id
  /** A street's: the segments it runs along and the nodes it passes, in order (Decision "Streets"), and their type. Its
   * `points` round the corners with the type's turning radius; `nodes` are where the designer put them. */
  segments?: Id[]
  nodes?: Id[]
  nodePoints?: Point[]
  /** The street a person picks, of which this road is a run: a street's (`street:<its earliest segment>`, the segments between crossings) and an existing road's (`existing:<id>`); runs differ in width. */
  street?: string
  streetType?: Id
  /** A street's: the turning radius its corners are rounded with (its segments' own, else its type's). */
  radius?: number
  /** A street's: whether each segment runs a → b along it (the run walks its `nodes` in order). */
  forward?: boolean[]
  /** A street's: each segment's own car stalls, turned to the run's way (left, right of the run walked along `nodes`),
   * null where it has none of its own (Decision "Street parking by side"); absent when none has. */
  parking?: (StreetParking | null)[]
}

/** A docked wall of a mass: its doors and the truck court in front of it (Decision "Exterior circulation", 4.3). */
export interface DerivedDock {
  massId: Id
  wall: number // the outline's edge: vertices[wall] → vertices[wall + 1]
  t: number // the wall's middle, as t on the outline (what a mass's own docks store)
  a: Point
  b: Point
  out: Point // the unit normal out of the mass, toward the court
  doors: Point[]
  /**
   * In front of the wall, `depth` deep; a shared court's stops at the other warehouse. A rectangle, its mouth at `court[3]`–`court[2]` (the network,
   * the routes, Connect and the approaches read it there). Where the wall's courts have shapes of their own (`shapes`, Phase D.3) it is the frame
   * that holds them: from their lowest x to their highest along the wall, as deep as the deepest, `court[0]` and `court[1]` on the wall's line.
   */
  court: Polygon
  /**
   * Phase D.3: the courts as they are, each a polygon on the plan (a court with a chamfer, an arc, a piece of a split one), where the wall's courts
   * have shapes; absent: `[court]`. What is paved, what a mass or the site's edge is run into by, what a stall or a road may not stand in.
   */
  shapes?: Polygon[]
  /** m: the court's depth: its wall's own (Mass.courts), the one its block gives the wall (Mass.blockCourts), its
   *  block's (WarehouseType.court), else the standards'. */
  depth: number
  /** The depth is its wall's own (set on the plan), not its block's or the standards'. */
  ownDepth?: true
  /** Another warehouse's docked wall facing this one, their courts meeting: one court between them, `gap` m deep
   *  (wall to wall; Decision "Truck court"). */
  shares?: { massId: Id; wall: number; gap: number }
  own: boolean // the mass's own docks, not its program's
  /** On the structural grid (Phase G.3): the wall's modules, each with its door or none; absent off the grid. */
  slots?: DockSlot[]
}

/**
 * A dock's courts as they are paved and stood in (Phase D.3, Decision "Courts in the circulation"): its shapes, else the one rectangle. What a reader of
 * a court takes for what is drawn, paved, counted, built over or kept clear of; the frame (`court`) is only where the trucks come in.
 */
export const courtShapes = (d: Pick<DerivedDock, 'court' | 'shapes'>): Polygon[] => d.shapes ?? [d.court]

/** A module of a docked wall on the grid: its index from the wall's start, its middle, its door, and whether that is an
 *  exception to the pattern (Decision "Structural grid"). */
export interface DockSlot {
  module: number
  at: Point
  door: boolean
  flipped: boolean
}

/** A mass whose doors its pattern places, against what the brief asks (its program's docks: per m² or every m). */
export interface DoorTarget {
  massId: Id
  doors: number
  target: number
}

/** An option's docks and their truck courts (Phase C.1): the masses' part of the circulation, drawn in Massing. */
export interface DockSet {
  docks: DerivedDock[]
  /** The masses whose program asks for docks and finds another mass against every wall they would take. */
  covered: Id[]
  doors: number
  courtArea: number // m², the courts merged
  /** The masses on the grid whose program's docks the brief counts: their doors against its target (Phase G.3). */
  targets: DoorTarget[]
  /** How many doors those masses lack against their targets, together; null with none of them. */
  short: number | null
  /** The yards between warehouses (Decision "Truck court", ST.6): each pair of docked walls facing each other with no
   *  mass between them, measured wall to wall. */
  gaps: CourtGap[]
}

/**
 * The gap between two docked walls of different masses facing each other (Decision "Truck court"): from the middle of
 * the stretch where they stand in front of each other on `a`'s wall to `b`'s, `gap` m; `asks`: the deeper of their
 * courts' depths, which the gap is short under.
 */
export interface CourtGap {
  a: { massId: Id; wall: number }
  b: { massId: Id; wall: number }
  from: Point
  to: Point
  gap: number
  asks: number
}

/** The circulation's totals: what the Circulation tab and the KPI strip show. */
export interface CirculationTotals {
  doors: number
  courtArea: number // m², the courts merged
  roadArea: number // m², the roads drawn by hand and derived, merged (the existing ones are not counted)
  carRoadArea: number // m², of those, the car roads' (Decision "Circulation optimization"), merged
  stalls: number // car stalls along the roads and in the lots
  lotStalls: number // of those, the lots' (Decision "Lot tool")
}

/** The option's circulation: what its access, docks and roads make on the plan, and its totals. */
export interface Circulation {
  gates: DerivedGate[]
  docks: DerivedDock[]
  roads: DerivedRoad[]
  /** The car stalls along the roads (4.6), each a quadrilateral. */
  stalls: Polygon[]
  /** For each stall, the id of the road it stands along (`stallRoads[i]` is `stalls[i]`'s): Hide for one street leaves a hidden street's stalls out, still counted. */
  stallRoads?: string[]
  /** The option's parking lots (Decision "Lot tool"), laid out: their stalls, aisles and entrances. */
  lots: DerivedLot[]
  /** The way into a court served from its side (a court two dock walls share): the clearance to the road, paved. */
  approaches: Polygon[]
  /** The masses with docks a truck gate reaches (the `access` relation, met). */
  reached: Id[]
  /** The gates no road meets. */
  nowhere: Id[]
  /** The masses whose program asks for docks and finds another mass against every wall they would take. */
  covered: Id[]
  totals: CirculationTotals
}

// ---- Platforms (Decision "Platforms") ---------------------------------------------------------------------------

/**
 * A platform of an option: the flat ground some of its masses stand on (a building's, buildings joined, or a step of
 * one), at its level; its courts stand the dock height below it. Its cut and fill are an estimate: the ground it
 * grades counted cell by cell (`EarthGrid`).
 */
export interface DerivedPlatform {
  /** The building it is the platform of (joined: the one the others joined), or the step's id. */
  id: Id
  step: boolean
  /** The option's buildings that stand on it (a step: its building). */
  buildingIds: Id[]
  massIds: Id[]
  /** A context building's: it stands on the ground as it is, never counted. */
  context: boolean
  /** m, the terrain's heights; null: no ground under it, nor a level typed. */
  level: number | null
  typed: boolean
  /** The level that balances its cut and fill (shown while it is typed too); null: no ground under it. */
  balanced: number | null
  cut: number // m³, its banks' among them
  fill: number // m³, its banks' among them
  area: number // m²: the ground it grades, its masses' and its courts'
  /**
   * Its banks (E.5): their cut and fill (m³), how much of them is outside the site (m²) and where (a cell of them
   * outside, its middle; null when none is).
   */
  banks: { cut: number; fill: number; outside: number; outsideAt: Point | null }
  /** Where its level is written: the middle of its largest mass. */
  at: Point
}

/** What graded a cell of the earthwork's grid. */
export const EARTH_NONE = 0
export const EARTH_PAD = 1
export const EARTH_COURT = 2
export const EARTH_BANK = 3

/**
 * The ground the platforms grade, cell by cell: a grid anchored to the site, `depth` the platform's ground less the
 * ground's (m: > 0 fill, < 0 cut; NaN where nothing is graded), `owner` the platform's index (−1) and `kind` what
 * graded it (EARTH_NONE, EARTH_PAD: a mass's, EARTH_COURT: a court's, EARTH_BANK: a bank's).
 */
export interface EarthGrid {
  x0: number
  y0: number
  size: number
  cols: number
  rows: number
  depth: Float32Array
  owner: Int32Array
  kind: Uint8Array
}

/**
 * A flat shape the platforms grade, at its height (m): a mass's at its platform's level, a court's the dock height
 * below, with the dock wall it is in front of (`out`: away from the mass).
 */
export interface GradedShape {
  polygon: Polygon
  z: number
  wall?: { a: Point; b: Point; out: Point }
}

/** An option's platforms and the earthwork they make (context left out of the totals). */
export interface Earthwork {
  platforms: DerivedPlatform[]
  cut: number // m³
  fill: number // m³
  grid: EarthGrid
  /** What is graded flat: the design platforms' masses, then their courts. */
  shapes: GradedShape[]
  /** The platforms side by side (indices into `platforms`, the lower first): their masses' or courts' cells touch. */
  neighbours: [number, number][]
}

/** What an option's masses measure and break (Phase C.1: Massing's part, before its roads): its design buildings,
 *  checked against each other and its context; its docks and courts. */
export interface MassingResult {
  metrics: Metrics
  /** The masses' Issues, the courts' among them; not the circulation's (`gate`, `access`, `road`). */
  issues: Issue[]
  /** The brief's rules applied to its design masses (Decision "Rules"). */
  relations: Relation[]
  docks: DockSet
  /** Its platforms and their earthwork (Decision "Platforms"); null while the site has no ground. */
  earthwork: Earthwork | null
}

/** What an option measures and breaks, its circulation too: `issues` are the masses' and the circulation's. */
export interface OptionResult extends MassingResult {
  circulation: Circulation
  /** Its design roads graded to the standards' max. grade (Decision "Graded roads"); null while the site has no ground. */
  roadGrading: RoadGrading | null
}

/** A station of a graded road: how far along it, where, the ground there and the road's own height (m). */
export interface RoadStation {
  along: number
  p: Point
  ground: number
  z: number
}

/** A design road graded (Decision "Graded roads"): its profile, its cut and fill (m³), its steepest grade and where. */
export interface RoadProfile {
  roadId: string
  width: number
  stations: RoadStation[]
  cut: number
  fill: number
  grade: number
  at: Point
}

/** An option's design roads graded, and their cut and fill together (m³). */
export interface RoadGrading {
  roads: RoadProfile[]
  cut: number
  fill: number
}

export type IssueCode =
  | 'no-site'
  | 'invalid-geometry'
  | 'outside-buildable'
  | 'overlap'
  | 'coverage-exceeded'
  | 'relation'
  | 'gate' // a gate off the street, or that leads nowhere
  | 'access' // a mass with docks no truck gate reaches (the `access` relation, broken)
  | 'court' // a truck court that runs into a mass or out of the site; docks with no free wall
  | 'road' // a dead end, a road narrower than its vehicle, a road over a mass, a road steeper than the max. grade
  | 'brief' // a program with more or fewer masses than the brief asks for (Decision "Brief issues")
  | 'hole' // a hole that goes past its mass's outline (only its part inside counts)
  | 'terrain' // a mass on ground too steep to build; a step between a building's platforms over the limit
  | 'doors' // a mass on the grid whose pattern places fewer dock doors than the brief asks (Phase G.3)
  | 'parking' // fewer car stalls along the roads than the programs' demand asks (Phase K.4)
  | 'lot' // a parking lot past the setback, over a mass, a court or a street, or no street at its entrance (Decision "Lot tool")
  | 'range' // a block's copy past its range by hand (Decision "Past the range by hand", RB.1): a warning

/** A broken rule or a problem. The UI lists them; an optimizer counts them as penalties. */
export interface Issue {
  code: IssueCode
  severity: 'error' | 'warning'
  massIds: Id[] // which masses it is about (empty = the whole project)
  message: string
  rule?: Id // a broken rule's (code `relation`): where the massing's warning sends you to edit it
  /** Where it is, for one about no mass (a gate, a road): its chip stands there. */
  at?: Point
  /** A `brief` issue's program: Solve or Update brief settle it. */
  program?: Id
}

/**
 * Everything the views draw and the optimizers score. `metrics` and `issues` are those of `option` (the one asked
 * for, the active one in the app); `options` has every option's, to compare them.
 */
export interface Derived extends MassingDerived {
  options: Record<Id, OptionResult>
  /** The asked option's circulation (Decision "Exterior circulation"). */
  circulation: Circulation
  /** The asked option's design roads graded (Decision "Graded roads"); null without ground. */
  roadGrading: RoadGrading | null
}

/** The masses' part of `Derived` (Phase C.1, `deriveMassing`): everything but the roads and the circulation's Issues. */
export interface MassingDerived {
  site: DerivedSite
  masses: Record<Id, DerivedMass>
  option: Id
  metrics: Metrics
  issues: Issue[]
  options: Record<Id, MassingResult>
  buildings: Record<Id, BuildingFigures>
  /** The brief's rules applied to the asked option's design masses, measured (Decision "Rules"): the graph's edges. */
  relations: Relation[]
  /** The asked option's docks and courts. */
  docks: DockSet
  /** The asked option's platforms and earthwork. */
  earthwork: Earthwork | null
}
