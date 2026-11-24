import { OPTIMIZER_PLANS } from './plans.ts'
import type { Typology } from './types.ts'

/** Industrial park: warehouses and their support buildings. Site rules are EXAMPLE values — replace with the client's zoning. */
export const industrial: Typology = {
  id: 'industrial',
  name: 'Industrial',
  description: 'Warehouses, offices and support buildings on an industrial site.',
  programs: [
    // massArea: a new mass's area when the brief gives none (a typical warehouse bay block, a two-storey office, a gate
    // booth), at 2:1 (Decision "New mass size")
    // docks (on its front), a door per 700 m² of floor (about one per 7,500 sf: a distribution warehouse)
    {
      id: 'warehouse',
      name: 'Warehouse',
      color: '#7d8fa8',
      built: true,
      kind: 'warehouse',
      massArea: 12800,
      docks: { per: 'm2', every: 700 },
    },
    { id: 'office', name: 'Office', color: '#b08a5a', built: true, kind: 'office', massArea: 800 },
    { id: 'guardhouse', name: 'Guard house', color: '#8f7fb0', built: true, massArea: 24 },
    { id: 'outdoor-storage', name: 'Outdoor storage', color: '#a7b59a', built: false, massArea: 2400 },
  ],
  // ground steeper than 15 % is not built on (EXAMPLE: the client's zoning says)
  siteRules: { setback: 10, maxCoverage: 0.6, maxSlope: 0.15 },
  // a two-way truck road, a 40 m truck court, a row of car stalls between a wall without docks and its ring road; the
  // court 1.2 m below its platform (a dock's floor over a trailer's), a building's platforms 1.5 m apart at most, banks
  // at 1 : 2
  standards: {
    roadWidth: 8,
    carRoadWidth: 6,
    courtDepth: 40,
    ringClear: 7,
    gateWidth: 12,
    gateRadius: 15,
    stallWidth: 2.5,
    stallDepth: 5.5,
    aisleWidth: 6,
    parking: 'none', // no stalls along the streets until the designer gives a street its side (Decision "Street parking by side")
    dockHeight: 1.2,
    maxStep: 1.5,
    bankRatio: 2,
    maxGrade: 0.08,
    laneWidth: 3.5, // a street's lane (Phase PE.2)
  },
  // what an industrial client asks first: how much is built, how much of it is warehouse, coverage, volume
  kpis: ['built-footprint', 'program:warehouse', 'coverage', 'built-volume', 'open-area', 'issues'],
  // a warehouse and its docks are an industrial park's; ground and parking are anyone's (Decision "Modules")
  modules: ['warehouse', 'docks', 'terrain', 'parking'],
  // a new grid: 12 × 12 m bays in 4 modules of 3 m (Decision "Structural grid": the bay and module the user was given)
  grid: { x: 12, y: 12, modules: 4 },
  // a warehouse's clear height: the ground floor is one warehouse tall
  levelHeight: 12,
  // the optimizer's templates and stage plans (Decision "Catalog": they name the modules' kinds and measures)
  plugins: { optimizer: OPTIMIZER_PLANS },
  // how an industrial park's programs usually relate (EXAMPLE rules: the client's brief replaces them)
  rules: [
    { id: 'rule1', kind: 'adjacent', a: 'office', b: 'warehouse', minShared: 0, weight: 1, reason: 'The office sits against its warehouse: supervision and one entrance' },
    { id: 'rule2', kind: 'near', a: 'outdoor-storage', b: 'warehouse', max: 40, weight: 1, reason: 'Yard storage is served from the warehouse docks' },
    { id: 'rule3', kind: 'apart', a: 'guardhouse', b: 'warehouse', min: 30, weight: 1, reason: 'The guard house stands at the gate, clear of the truck courts' },
  ],
}
