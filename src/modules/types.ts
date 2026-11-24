// What a module is (Decisions "Modules" and "Catalog"): a part of the design some projects have, in a folder of its own
// that declares what it brings in one manifest (`module.ts`); the catalog (catalog.ts) is the only door the rest of the
// app reads. A module is core code, not a plugin: it never names a plugin, and a plugin never names a module. Pure, like
// the engine, so MCP and the optimizer's worker read it.
import type { KpiDef } from '../engine/kpis.ts'
import type { Kind } from '../kinds/types.ts'
import type { Project } from '../model/schema.ts'
import type { Measure } from './measure.ts'
import type { ParamKind } from './vary.ts'

// the shapes a reader of the catalog needs (the optimizer: its kinds, their genes, its measures)
export type { Context, Gene, KindFields, KindSettings, ParamKind, Variable } from './vary.ts'
export type { Evaluated, Measure, MeasureContext, MeasureUnit } from './measure.ts'

export interface Module {
  /** The folder's name, and what a typology lists in its `modules`. `core` is the one that is always on. */
  id: string
  label: string
  /**
   * The other modules whose code this one imports (warehouse requires docks: its copies use the dock walls). A code
   * dependency checked by the guards, not a visibility rule: each module is on by its own presence.
   */
  requires?: string[]
  /** Whether the project has something this module acts on, in any of its options (switching options never hides a control). */
  present(p: Project): boolean
  /** Its KPIs (the core's include one per program and one per building, so they depend on the project). */
  kpis(p: Project): KpiDef[]
  /** The optimizer's measures it owns, beyond its KPIs (which are measures too). */
  measures: Measure[]
  /** Its kinds of *What may change*: how each lists its variables and writes them back. */
  params: ParamKind[]
  /**
   * The kinds of thing it brings (Phase AS.4, Decision "Kinds"; the warehouse: its block type and the block's parts), in the shape of
   * `kinds/types.ts`. Listed by the catalog while the typology offers the module; the core's kinds are in `kinds/core.ts`.
   */
  kinds?: Kind[]
}
