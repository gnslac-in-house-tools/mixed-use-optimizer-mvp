// The core's entry in the catalog (Decision "Catalog"): the figures of any project, always on, and the optimizer's
// measures and kinds of any project. Until Phase M.8 all of today's circulation is core: its road area and Issues, its
// gates and road widths are here, and the circulation's settings stay where they are (Properties, by the Circulation row of Layers).
import { buildingKpis, CORE_KPIS, programKpis } from '../../engine/kpis.ts'
import type { Module } from '../types.ts'
import { CORE_MEASURES } from './measures.ts'
import { CORE_PARAMS } from './params.ts'

export const core: Module = {
  id: 'core',
  label: 'Core',
  present: () => true,
  kpis: (p) => [...CORE_KPIS, ...programKpis(p), ...buildingKpis(p)],
  measures: CORE_MEASURES,
  params: CORE_PARAMS,
}
