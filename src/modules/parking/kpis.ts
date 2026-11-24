// The parking module's KPI definitions (Decisions "Circulation demand", "Catalog"): the stalls along the roads and what the programs ask, as
// data like the core's (engine/kpis.ts has the type and the rest). Ids never change: saved projects keep the ones they chose.
import type { KpiDef } from '../../engine/kpis.ts'
import type { Derived } from '../../engine/types.ts'
import type { Project } from '../../model/schema.ts'
import { demandOf, stallsShort } from './engine/demand.ts'

/** What the programs ask of the parking in the option (Phase K.4). */
const demand = (p: Project, d: Derived) => demandOf(p, d.metrics.areaByProgram, d.circulation.docks)

/** The parking module's: stalls along the roads and what the programs ask. */
export const PARKING_KPIS: KpiDef[] = [
  {
    id: 'stalls',
    area: 'flow',
    label: 'Car stalls',
    unit: 'count',
    help: 'Car stalls along the roads cars use, as Parking says in Layers (one side, both, none).',
    read: (_p, d) => d.circulation.totals.stalls,
    flow: true,
    step: 'flow',
  },
  {
    id: 'stalls-asked',
    area: 'flow',
    label: 'Car stalls asked',
    unit: 'count',
    help: 'The car stalls the programs ask: one per so many m² of each one’s floor (Brief › Circulation, Demand).',
    read: (p, d) => demand(p, d).carStalls,
  },
  {
    id: 'stalls-short',
    area: 'flow',
    label: 'Car stalls short',
    unit: 'count',
    help: 'The car stalls the programs ask that the roads do not give; 0 meets the demand (Brief › Circulation).',
    read: (p, d) => stallsShort(demand(p, d), d.circulation.totals.stalls),
    status: (p, d) => {
      const s = stallsShort(demand(p, d), d.circulation.totals.stalls)
      return s === null ? null : s === 0 ? 'within' : 'over'
    },
    flow: true,
    step: 'flow',
  },
  {
    id: 'trailer-stalls',
    area: 'flow',
    label: 'Trailer stalls asked',
    unit: 'count',
    help: 'The trailer stalls the programs ask: so many per dock door of each one’s masses (Brief › Circulation, Demand). Where they stand comes later.',
    read: (p, d) => demand(p, d).trailerStalls,
  },
]
