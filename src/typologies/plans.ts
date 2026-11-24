// The optimizer's plans a typology gives (Decisions "Optimization pipeline", "Stage plan", "Warehouse type" and
// "Catalog"): its templates and its stage plans, as plain data (`Typology.plugins.optimizer`). They name the modules'
// kinds and measures, so they are the typology's, not the optimizer's; the core never reads them (opaque to it), the
// optimizer reads them with its own schema (TemplateSchema) and runs whatever plan it is given. Ids, never code: a kind
// or measure that no longer exists is reported as missing. Industrial and Blank give these for now.

/** A template as the optimizer reads it (its TemplateSchema checks it): what may change, the aims, the must-holds, the budget. */
interface OptimizerTemplate {
  id: string
  name: string
  from: 'typology' | 'user'
  variables: { kind: string; step: number; range?: number; margin?: number }[]
  objectives: { measure: string; sense: 'min' | 'max' }[]
  constraints: { measure: string; max: number }[]
  budget: { population: number; generations: number; seed: number }
}

/**
 * The masses' template (Decision "Optimization pipeline"): steps of 1 m and 15°, the four objectives agreed. Every mass is a block
 * (Phase D.2), so its shape is its box: `warehouse.hall`, each copy's length and width within its range, in place of a free rect's proportion.
 */
export const MASSES: OptimizerTemplate = {
  id: 'masses',
  name: 'Masses',
  from: 'typology',
  variables: [
    { kind: 'mass.position', step: 1 },
    { kind: 'mass.rotation', step: 15 },
    { kind: 'warehouse.hall', step: 1 },
  ],
  objectives: [
    { measure: 'brief-gap', sense: 'min' },
    { measure: 'rules-gap', sense: 'min' },
    { measure: 'dock-to-gate', sense: 'min' },
    { measure: 'free-ground', sense: 'max' },
  ],
  constraints: [
    { measure: 'outside-buildable', max: 0 },
    { measure: 'overlap', max: 0 },
    { measure: 'required-gap', max: 0 },
    { measure: 'coverage-over', max: 0 },
    { measure: 'court-clash', max: 0 },
  ],
  budget: { population: 60, generations: 80, seed: 1 },
}

/**
 * Masses and circulation in one genome (Decision "Masses + Circulation"): the masses' variables, each gate along its
 * boundary side every 5 m; the brief, the trucks' way, the paving and what the circulation warns about; the masses'
 * must-holds. It reads the streets the option has (since ST.4 none is derived; the plan's Streets stage draws them).
 */
export const MASSES_CIRCULATION: OptimizerTemplate = {
  ...MASSES,
  id: 'masses-circulation',
  name: 'Masses + Circulation',
  variables: [...MASSES.variables, { kind: 'gate.position', step: 5 }],
  objectives: [
    { measure: 'brief-gap', sense: 'min' },
    { measure: 'dock-to-gate', sense: 'min' },
    { measure: 'road-area', sense: 'min' },
    { measure: 'circulation-issues', sense: 'min' },
  ],
}

/**
 * The circulation alone, the masses frozen (Decision "Circulation optimization", 7.4): each gate along its boundary side and
 * for whom, the parking (the option's side). The stalls against the paving, the trucks' way and what the circulation
 * warns about; the masses' must-holds stay.
 */
export const CIRCULATION: OptimizerTemplate = {
  ...MASSES,
  id: 'circulation',
  name: 'Circulation',
  variables: [
    { kind: 'gate.position', step: 5 },
    { kind: 'gate.vehicles', step: 1 },
    { kind: 'parking.side', step: 1 },
  ],
  objectives: [
    { measure: 'stalls', sense: 'max' },
    { measure: 'road-area', sense: 'min' },
    { measure: 'dock-to-gate', sense: 'min' },
    { measure: 'circulation-issues', sense: 'min' },
  ],
  budget: { population: 40, generations: 40, seed: 1 },
}

// The typology's stage plan (Decision "Inside-out rules"; Decision "Streets": Buildings → Streets → Parking): the grid
// sets the buildings, the buildings the docks, the docks the streets, the streets the parking (Decision "Circulation
// optimization"). The streets never shape the placement: the masses' stages read the masses and their courts alone
// (no room kept for a road between them), and the Streets stage draws the ways after. Each stage's template; a later
// stage moves an earlier one's kinds within its margin. With no grid on the option, the Grid stage moves the masses
// alone.

/**
 * The grid: its angle and origin, the masses carried onto it. A placement guide (Decision "Program rule set"): its bays
 * and modules are each program's, not the stage's to vary.
 */
export const GRID_STAGE: OptimizerTemplate = {
  ...MASSES,
  id: 'stage-grid',
  name: 'Grid',
  variables: [
    { kind: 'grid.angle', step: 5 },
    { kind: 'grid.origin', step: 1 },
    { kind: 'mass.position', step: 1 },
  ],
  objectives: [
    { measure: 'brief-gap', sense: 'min' },
    { measure: 'free-ground', sense: 'max' },
  ],
}

/** The buildings on the grid: where, turned, their proportion, their platforms. */
export const BUILDINGS_STAGE: OptimizerTemplate = {
  ...MASSES,
  id: 'stage-buildings',
  name: 'Buildings',
  variables: [...MASSES.variables, { kind: 'platform.level', step: 0.5 }],
}

/** The docks: each docking program's door pattern. */
export const DOCKS_STAGE: OptimizerTemplate = {
  ...MASSES,
  id: 'stage-docks',
  name: 'Docks',
  variables: [{ kind: 'dock.pattern', step: 1 }],
  objectives: [
    { measure: 'doors-short', sense: 'min' },
    { measure: 'dock-to-gate', sense: 'min' },
  ],
}

/**
 * The streets (ST.8): the gates along their boundary side and for whom, the road widths, then Connect on each specimen (the
 * ways its courts lack, from its own gates, as streets of the trucks' type): the trucks' way, the paving and what the
 * circulation warns about. Connect runs on every specimen, so its budget is smaller.
 */
export const STREETS_STAGE: OptimizerTemplate = {
  ...MASSES_CIRCULATION,
  id: 'stage-streets',
  name: 'Streets',
  variables: [
    { kind: 'gate.position', step: 5 },
    { kind: 'gate.vehicles', step: 1 },
    { kind: 'road.width', step: 0.5 },
    { kind: 'streets.connect', step: 1 },
  ],
  objectives: [
    { measure: 'dock-to-gate', sense: 'min' },
    { measure: 'road-area', sense: 'min' },
    { measure: 'circulation-issues', sense: 'min' },
  ],
  budget: { population: 30, generations: 30, seed: 1 },
}

/** The parking: the option's side; the roads' kinds within their margin. Its target (Phase K.4): the car stalls the programs ask (Brief › Circulation, Demand), none short. */
export const PARKING_STAGE: OptimizerTemplate = {
  ...CIRCULATION,
  id: 'stage-parking',
  name: 'Parking',
  variables: [{ kind: 'parking.side', step: 1 }],
  constraints: [...CIRCULATION.constraints, { measure: 'stalls-short', max: 0 }],
  objectives: [
    { measure: 'stalls', sense: 'max' },
    { measure: 'road-area', sense: 'min' },
    { measure: 'circulation-issues', sense: 'min' },
  ],
}

// With warehouse types (Decision "Warehouse type"), the plan starts from the type: its hall's size within its ranges
// and its courts' depth, then where its copies stand, then the streets and the parking.

/** The warehouse type: each copy's box's length and width (its shape following, Decision "Block shape"), its courts' depth within the block's range (Decision "Truck court"); the copies' variants, its docks the designer's. */
export const WAREHOUSE_STAGE: OptimizerTemplate = {
  ...MASSES,
  id: 'stage-warehouse',
  name: 'Warehouse type',
  variables: [
    { kind: 'warehouse.hall', step: 1 },
    { kind: 'court.depth', step: 1 },
  ],
  objectives: [
    { measure: 'brief-gap', sense: 'min' },
    { measure: 'dock-to-gate', sense: 'min' },
    { measure: 'free-ground', sense: 'max' },
  ],
}

/** The copies' placement: where each stands and how it turns, its platform; their shape is their type's. */
export const PLACEMENT_STAGE: OptimizerTemplate = {
  ...MASSES,
  id: 'stage-placement',
  name: 'Placement',
  variables: [
    { kind: 'mass.position', step: 1 },
    { kind: 'mass.rotation', step: 15 },
    { kind: 'platform.level', step: 0.5 },
  ],
}

/**
 * The optimizer's defaults for a typology (`Typology.plugins.optimizer`): the templates a project starts with, and the
 * stages of its plan, seed to leaf: from the grid, or the plan of the first module in `byModule` that is on for the
 * project (the warehouse: once the project has a warehouse type, from the type).
 */
export const OPTIMIZER_PLANS = {
  templates: [MASSES, MASSES_CIRCULATION, CIRCULATION],
  stages: [GRID_STAGE, BUILDINGS_STAGE, DOCKS_STAGE, STREETS_STAGE, PARKING_STAGE],
  byModule: [{ module: 'warehouse', stages: [WAREHOUSE_STAGE, PLACEMENT_STAGE, STREETS_STAGE, PARKING_STAGE] }],
}
