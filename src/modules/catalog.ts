// The catalog (Decisions "Catalog" and "What is not there is not shown"): the one door the rest of the app reads to know
// what the core and the modules bring, and which of them a project shows. Nobody else keeps a list of KPIs, of the
// optimizer's measures, of its kinds of *What may change* (the optimizer reads them here and names no module) or of the kinds of
// thing the modules bring (`moduleKinds`: the kinds' registry, `src/kinds/`, reads them here).
//   offered   the project's typology lists the module (the core always; a typology this code does not know, every one):
//             what creates something (a tool's entry, the Brief's docks column) follows this
//   on        offered, and the project has something the module acts on (`present`): what adjusts or measures (a KPI in
//             the picker, a tab, a kind of variable) follows this
// A KPI the project chose stays in `project.kpis` while its module is off (nothing is deleted), unseen; it returns with
// the module; so does a kind or a measure a saved template names (its id still resolves). Pure, like the engine: no
// React, no store, no DOM, so MCP and the optimizer's worker read it.
import { DEFAULT_KPIS, type Area, type KpiDef, type KpiValue } from '../engine/kpis.ts'
import type { Derived } from '../engine/types.ts'
import type { Kind } from '../kinds/types.ts'
import type { Project } from '../model/schema.ts'
import { TYPOLOGIES } from '../typologies/index.ts'
import { MODULES } from './index.ts'
import type { Measure } from './measure.ts'
import type { Module } from './types.ts'
import type { ParamKind } from './vary.ts'

/** The areas, in the order the stage window lists them (Decision "Areas"). */
export const AREAS: Area[] = ['site', 'massing', 'flow']
export type { Area }

// what the optimizer reads besides the lists: the context its kinds share, the free-ground grid, a measure in metres
export { contextOf } from './vary.ts'
export { gridOf, inMetres } from './measure.ts'

/** The modules a typology offers beyond the core (Decision "Modules"); one this code does not know offers them all. */
export function modulesOf(typologyId: string): string[] {
  return TYPOLOGIES.find((t) => t.id === typologyId)?.modules ?? MODULES.map((m) => m.id).filter((id) => id !== 'core')
}

/** The project's typology offers the module (the core always does). */
export function isOffered(p: Project, id: string): boolean {
  return id === 'core' || modulesOf(p.typology).includes(id)
}

/** The module is offered and the project has something it acts on (the core is always on). */
export function isOn(p: Project, id: string): boolean {
  if (id === 'core') return true
  const m = MODULES.find((x) => x.id === id)
  return !!m && isOffered(p, id) && m.present(p)
}

/** Every KPI of every module, on or off: to resolve a saved id (a strip, a template, a stage). */
export function kpiCatalog(p: Project): KpiDef[] {
  return MODULES.flatMap((m) => m.kpis(p))
}

/** The KPIs of the modules that are on: what a list offers. */
export function kpisOn(p: Project): KpiDef[] {
  return MODULES.filter((m) => isOn(p, m.id)).flatMap((m) => m.kpis(p))
}

/** The module that declares a KPI; null when no module does (a program that was removed). */
export function kpiOwner(p: Project, id: string): string | null {
  return MODULES.find((m) => m.kpis(p).some((k) => k.id === id))?.id ?? null
}

/** The ids the strip shows, in order: the project's choice (or the default) without the unknown ids and those of a module that is off. */
export function chosenKpis(p: Project): string[] {
  const on = new Set(kpisOn(p).map((k) => k.id))
  return (p.kpis ?? DEFAULT_KPIS).filter((id) => on.has(id))
}

/** One KPI read by id, whether its module is on or off; null when this project has no such KPI (a program that was removed). */
export function readKpi(id: string, p: Project, d: Derived): KpiValue | null {
  const k = kpiCatalog(p).find((x) => x.id === id)
  if (!k) return null
  return { id: k.id, label: k.label, unit: k.unit, value: k.read(p, d), limit: k.limit?.(p) ?? null, status: k.status?.(p, d) ?? null }
}

/** The strip's figures, in its order. */
export function readKpis(p: Project, d: Derived): KpiValue[] {
  return chosenKpis(p).flatMap((id) => readKpi(id, p, d) ?? [])
}

/** The modules that are on for a project (the core first). */
const modulesOn = (p: Project): Module[] => MODULES.filter((m) => isOn(p, m.id))

const byOrder = (kinds: ParamKind[]) => kinds.sort((a, b) => a.order - b.order)
const byRank = <T extends { rank?: number }>(xs: T[]) => xs.sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity))

/** Every kind of every module, on or off, in the order a genome is written: to resolve a saved template. */
export function paramKinds(): ParamKind[] {
  return byOrder(MODULES.flatMap((m) => m.params))
}

/** A kind by its id, whether its module is on or off. */
export const paramKind = (id: string): ParamKind | undefined => paramKinds().find((k) => k.id === id)

/** The kinds of the modules that are on, by their rank: what *What may change* offers, in its order. */
export function paramKindsOn(p: Project): ParamKind[] {
  return byRank(modulesOn(p).flatMap((m) => m.params))
}

/** A KPI as a measure: its figure, 0 when the project has none. */
const asMeasure = (k: KpiDef): Measure => ({ id: k.id, label: k.label, unit: k.unit, help: k.help, read: (e) => k.read(e.project, e.derived) ?? 0, area: k.area, ...(k.aim === false ? { aim: false as const } : {}), ...(k.flow ? { flow: true } : {}) })

/** The modules' measures by their rank, then their KPIs as measures, by module; a measure's id wins over a KPI's. */
function measuresOf(modules: Module[], p: Project): Measure[] {
  const own = byRank(modules.flatMap((m) => m.measures))
  const kpis = modules.flatMap((m) => m.kpis(p)).map(asMeasure)
  return [...own, ...kpis.filter((k) => !own.some((m) => m.id === k.id))]
}

/** Every measure of every module, on or off: to resolve a saved objective or constraint, and to measure a design. */
export const measureCatalog = (p: Project): Measure[] => measuresOf(MODULES, p)

/** The measures of the modules that are on: what *+ Objective* and *Must hold* offer. */
export const measuresOn = (p: Project): Measure[] => measuresOf(modulesOn(p), p)

/** The measures *+ Objective* offers: those of the modules that are on, without what is never an objective (`aim: false`), in the same order. */
export const objectivesOn = (p: Project): Measure[] => measuresOn(p).filter((m) => m.aim !== false)

/** The kinds the modules bring (Phase AS.4, Decision "Kinds"): those of the modules the project's typology offers; with no project, every module's (to resolve a saved reference). The core's kinds are `kinds/core.ts`, read by `kinds/index.ts`. */
export const moduleKinds = (p?: Project): Kind[] => MODULES.filter((m) => p === undefined || isOffered(p, m.id)).flatMap((m) => m.kinds ?? [])
