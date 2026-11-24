import { OPTIMIZER_PLANS } from './plans.ts'
import type { Typology } from './types.ts'

/** Start from scratch: no programs, no limits. */
export const blank: Typology = {
  id: 'blank',
  name: 'Blank',
  description: 'No preset programs or rules.',
  programs: [],
  siteRules: { setback: 0, maxCoverage: null },
  kpis: ['built-footprint', 'coverage', 'site-area', 'issues'],
  levelHeight: 4,
  // every typology offers the warehouse module: its buildings are blocks too (Phase D.2, Decision "Draw makes a block"); its docks are
  // industrial's, so a blank project's blocks have none (Decision "Modules")
  modules: ['warehouse', 'terrain', 'parking'],
  // the optimizer's templates and stage plan, industrial's for now
  plugins: { optimizer: { templates: OPTIMIZER_PLANS.templates, stages: OPTIMIZER_PLANS.stages } },
}
