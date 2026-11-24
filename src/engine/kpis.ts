// The KPI definitions (Decision "KPI strip"): every figure the top strip, the compare table (9.3) or an optimizer can
// show, as data: an id, a label, a unit and how to read it from the Project and its Derived. Pure, like the rest of
// the engine, so MCP can list the KPIs and read them by id. Formatting (m², %, later ft² and currencies) is the
// views' job (views/format.ts): here a value is a plain number in metres.
// Who owns which (Decision "Catalog"): each module declares its own list, in its manifest (modules/<id>/module.ts),
// and the catalog (modules/catalog.ts) is the only place that lists, chooses and reads them; the arrays are in each
// module's folder (modules/<id>/kpis.ts), this file keeps the type and the core's.
//   core        site-area, buildable-area, built-footprint, coverage, open-area, gfa, corridor-area, built-volume,
//               buildings, masses, issues, brief (the programs with a target: their area over their target, Decision
//               "Brief"), road-area (the circulation's, until Phase M.8), one per program and one per building
//   warehouse   columns, wall-area (the option's warehouse copies, Decision "Warehouse type")
//   docks       dock-doors, truck-courts (Decision "Exterior circulation"), doors-short (on the structural grid, Phase
//               G.3: the doors the patterns place short of the brief), dock-gate-distance (Decision "Isolate in the
//               Overview": how far the docks are from the truck gates)
//   parking     stalls, and the programs' demand (Phase K.4): stalls-asked, stalls-short (Flow's), trailer-stalls
//   terrain     cut, fill, earth-balance, earth-moved, largest-step, steepest-ground, steepest-road (Flow's), the
//               ground's (Decision "Terrain", E.4a)
// Every figure is the active option's design buildings (Decision "Buildings and options"): context is never counted.
//   per program   program:<id> — that program's footprint (the project's programs decide which exist)
//   per building  building:<id> — that building's GFA, while the active option shows it (context buildings have none)
// Later phases add theirs here (analysis KPIs in Phase 6; money with the pro forma).
import type { Project } from '../model/schema.ts'
import { briefRows, briefTotals } from './brief.ts'
import { optionOf } from './buildings.ts'
import type { Derived } from './types.ts'

export type KpiUnit = 'm' | 'm2' | 'm3' | 'pct' | 'count'

/** The part of the design a kind, a measure or a KPI belongs to (Decision "Areas"): the stage window's groups. */
export type Area = 'site' | 'massing' | 'flow'

/** over = a limit is broken; within = a limit exists and is met; null = no limit to compare with. */
export type KpiStatus = 'over' | 'within' | null

export interface KpiDef {
  id: string
  label: string
  unit: KpiUnit
  /** One line on what it measures, for the picker and tooltips. */
  help: string
  /** null = cannot be measured yet (no site). */
  read(p: Project, d: Derived): number | null
  /** Its limit, as a short phrase ("max 60 %" is built by the view from `limit`). */
  limit?(p: Project): number | null
  status?(p: Project, d: Derived): KpiStatus
  /** It reads the circulation's roads or Issues (Flow's part, Phase C.1): the masses' part alone cannot give it. */
  flow?: true
  /** The area it belongs to (Decision "Areas"): the stage window groups its objectives by it. */
  area: Area
  /** Never an objective: the optimizer's *+ Objective* does not offer it (a figure to read, not to aim at). */
  aim?: false
  /** The step it belongs to (Decision "Flow step"): the strip shows it there only. Absent: every step. */
  step?: 'flow'
}

/** A KPI read: what the strip draws. */
export interface KpiValue {
  id: string
  label: string
  unit: KpiUnit
  value: number | null
  limit: number | null
  status: KpiStatus
}

const PROGRAM_PREFIX = 'program:'
const BUILDING_PREFIX = 'building:'

/** The core's own: the generic figures of any project. */
export const CORE_KPIS: KpiDef[] = [
  {
    id: 'site-area',
    area: 'site',
    aim: false,
    label: 'Site area',
    unit: 'm2',
    help: 'The area inside the site boundary.',
    read: (_p, d) => (d.site.polygon ? d.metrics.siteArea : null),
  },
  {
    id: 'buildable-area',
    area: 'site',
    aim: false,
    label: 'Buildable area',
    unit: 'm2',
    help: 'The site minus the setback: where built masses may stand.',
    read: (_p, d) => (d.site.polygon ? d.metrics.buildableArea : null),
  },
  {
    id: 'built-footprint',
    area: 'massing',
    label: 'Built footprint',
    unit: 'm2',
    help: 'The ground covered by built masses, seen from above (an overlap counts once; basements do not count).',
    read: (_p, d) => d.metrics.builtFootprint,
  },
  {
    id: 'coverage',
    area: 'massing',
    label: 'Coverage',
    unit: 'pct',
    help: 'Built footprint over site area, against the site’s maximum.',
    read: (_p, d) => d.metrics.coverage,
    limit: (p) => p.site.rules.maxCoverage,
    status: (p, d) => {
      const c = d.metrics.coverage
      const max = p.site.rules.maxCoverage
      return c === null || max === null ? null : c > max + 1e-9 ? 'over' : 'within'
    },
  },
  {
    id: 'open-area',
    area: 'massing',
    label: 'Open area',
    unit: 'm2',
    help: 'Site area not covered by built masses: yards, roads, parking, landscape.',
    read: (_p, d) => (d.site.polygon ? Math.max(0, d.metrics.siteArea - d.metrics.builtFootprint) : null),
  },
  {
    id: 'gfa',
    area: 'massing',
    label: 'Floor area (GFA)',
    unit: 'm2',
    help: 'Built floor area of every level, × the level’s repeats (×N); basements included.',
    read: (_p, d) => d.metrics.gfa,
  },
  {
    id: 'corridor-area',
    area: 'massing',
    aim: false,
    label: 'Corridors',
    unit: 'm2',
    help: 'The corridors round the holes of built masses (their width in Properties), × the level’s repeats (×N).',
    read: (_p, d) => d.metrics.corridorArea,
  },
  {
    id: 'built-volume',
    area: 'massing',
    aim: false,
    label: 'Built volume',
    unit: 'm3',
    help: 'Footprint × height of every built mass, × its level’s repeats (×N).',
    read: (_p, d) => d.metrics.builtVolume,
  },
  {
    id: 'buildings',
    area: 'massing',
    aim: false,
    label: 'Buildings',
    unit: 'count',
    help: 'How many buildings of the option have a built mass (context left out).',
    read: (_p, d) => d.metrics.buildings,
  },
  {
    id: 'masses',
    area: 'massing',
    aim: false,
    label: 'Masses',
    unit: 'count',
    help: 'How many built masses the option has (context left out).',
    read: (_p, d) => d.metrics.builtMasses,
  },
  {
    id: 'brief',
    area: 'massing',
    aim: false,
    label: 'Brief area',
    unit: 'pct',
    help: 'The area of the programs that have a target, over their targets: 100 % meets the brief (±5 %).',
    read: (p, d) => {
      const t = briefTotals(briefRows(p, d))
      return t.targetArea ? t.area / t.targetArea : null
    },
    status: (p, d) => {
      const s = briefTotals(briefRows(p, d)).status
      return s === null ? null : s === 'met' ? 'within' : 'over'
    },
  },
  {
    id: 'road-area',
    area: 'flow',
    label: 'Roads',
    unit: 'm2',
    help: 'The roads derived and drawn by hand, merged (the existing ones are not counted).',
    read: (_p, d) => d.circulation.totals.roadArea,
    flow: true,
    step: 'flow',
  },
  {
    id: 'issues',
    area: 'massing',
    aim: false,
    label: 'Issues',
    unit: 'count',
    help: 'Broken rules and problems; any error makes it red.',
    read: (_p, d) => d.issues.length,
    status: (_p, d) => (d.issues.some((i) => i.severity === 'error') ? 'over' : 'within'),
    flow: true,
  },
]

/** The strip a project shows when it has not chosen (an old file, a project made by code): the core's figures alone. */
export const DEFAULT_KPIS = ['built-footprint', 'coverage', 'site-area', 'issues']

/** One KPI per program: its footprint (the core's). */
export function programKpis(p: Project): KpiDef[] {
  return p.programs.map((g) => ({
    id: `${PROGRAM_PREFIX}${g.id}`,
    label: `${g.name} footprint`,
    area: 'massing' as const,
    unit: 'm2' as const,
    help: `The ground covered by ${g.name} masses.`,
    read: (_p: Project, d: Derived) => d.metrics.footprintByProgram[g.id] ?? 0,
  }))
}

/** One KPI per design building: its GFA; null (—) while the option does not show it. Context is never counted (the core's). */
export function buildingKpis(p: Project): KpiDef[] {
  return p.buildings
    .filter((b) => !b.context)
    .map((b) => ({
      id: `${BUILDING_PREFIX}${b.id}`,
      label: `${b.name} GFA`,
      area: 'massing' as const,
      unit: 'm2' as const,
      help: `The floor area of ${b.name}, while the active option shows it.`,
      read: (q: Project, d: Derived) => (optionOf(q, d.option).buildingIds.includes(b.id) ? (d.buildings[b.id]?.gfa ?? 0) : null),
    }))
}
