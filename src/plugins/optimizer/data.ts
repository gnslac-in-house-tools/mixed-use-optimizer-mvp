// The optimizer's data in a project (Decision "Optimize tab"): `Project.plugins.optimizer`, read through its own schema,
// saved in the .gft, one undo step a change. Absent: the project has not turned it on (the tab first says what it
// does). Its templates are the project's own copies: its typology's to start with (`from: 'typology'`, kept), then the
// designer's (Duplicate, New: `from: 'user'`, which can be removed). A typology's one, once changed, reads "edited" and
// can go back to how it came (Decision "Template back to the typology's"). A run is not here: it lives in the run's store.
// Its stage plans (Decision "Stages layout"): one per option it started from, stored once one changes; until then an
// option's plan is the typology's (Decision "Plan template drop-down"; a typology without one: one stage from the
// active template, a single run being a plan of one stage). Plan templates (Decision "Plan templates"): the
// typology's, given, then the ones the designer saved from a plan.
// The typology's templates and stage plans are the typology's data (`Typology.plugins.optimizer`, Decision "Catalog":
// they name the modules' kinds and measures), read here with the templates' schema; a typology without them gives no
// templates (a project turned on starts from a blank one) and no plan. Which plan a project starts from, the data says
// too: a module's own (`byModule`), once that module is on for the project, else the typology's.
import { z } from 'zod'
import { isOn } from '../../modules/catalog.ts'
import { typologyData, type Project } from '../host.ts'
import { oneStagePlan, planFrom, PlanSchema, PlanTemplateSchema, planOf, planTemplateOf, typologyPlanTemplate, withPlan, type Plan, type PlanTemplate } from './engine/stages.ts'
import { TemplateSchema, type Template } from './engine/template.ts'

export const OPTIMIZER = 'optimizer'

/** What a typology gives the optimizer: its templates, its plan's stages, and a module's own plan for a project where
 *  that module is on (the first that is). */
const TypologyPlansSchema = z.object({
  templates: z.array(TemplateSchema).optional(),
  stages: z.array(TemplateSchema).optional(),
  byModule: z.array(z.object({ module: z.string(), stages: z.array(TemplateSchema) })).optional(),
})
type TypologyPlans = z.infer<typeof TypologyPlansSchema>

/** Each typology's data, read once (the same templates every call, as when they were constants). */
const read = new WeakMap<object, TypologyPlans>()
function plansOf(typology: string): TypologyPlans {
  const raw = typologyData(OPTIMIZER, typology)
  if (raw === null || typeof raw !== 'object') return {}
  let plans = read.get(raw)
  if (!plans) {
    const parsed = TypologyPlansSchema.safeParse(raw)
    plans = parsed.success ? parsed.data : {}
    read.set(raw, plans)
  }
  return plans
}

/** The templates a project of this typology starts with. */
export const templatesFor = (typology: string): Template[] => plansOf(typology).templates ?? []

/** The stages of the plan a project starts from, seed to leaf: its typology's, or the module's own plan the typology
 *  gives for the first of its modules that is on (from the warehouse type, once the project has one). */
export function stagesFor(p: Project): Template[] {
  const plans = plansOf(p.typology)
  return (plans.byModule?.find((x) => isOn(p, x.module))?.stages ?? plans.stages) ?? []
}

/** The usual must-holds and budget of a new template of the designer's (the industrial Masses template's). */
const USUAL: Pick<Template, 'constraints' | 'budget'> = {
  constraints: [
    { measure: 'outside-buildable', max: 0 },
    { measure: 'overlap', max: 0 },
    { measure: 'required-gap', max: 0 },
    { measure: 'coverage-over', max: 0 },
    { measure: 'court-clash', max: 0 },
  ],
  budget: { population: 60, generations: 80, seed: 1 },
}

export const OptimizerDataSchema = z.object({
  /** Turned on for this project. Off, its templates stay. */
  on: z.boolean(),
  /** The template the tab shows and ▶ Run runs. */
  active: z.string(),
  templates: z.array(TemplateSchema).min(1),
  /** The stage plans, by the option each started from. */
  plans: z.array(PlanSchema).optional(),
  /** The plan templates the designer saved (the typology's is given, never stored). */
  planTemplates: z.array(PlanTemplateSchema).optional(),
})
export type OptimizerData = z.infer<typeof OptimizerDataSchema>

/** The plan an option is in (its own, or the one that approved it), else the typology's (Decision "Plan template
 *  drop-down"), not stored until it changes; a typology that gives none: one stage from the active template. */
export function planIn(d: OptimizerData, optionId: string, p: Project): Plan {
  return planOf(d.plans ?? [], optionId, () => {
    const stages = stagesFor(p)
    return stages.length ? planFrom(optionId, typologyPlanTemplate(stages)) : oneStagePlan(optionId, activeOf(d))
  })
}

/** The data with this plan stored. */
export const savePlan = (d: OptimizerData, plan: Plan): OptimizerData => ({ ...d, plans: withPlan(d.plans ?? [], plan) })

/** The plan templates to start a plan from: the typology's first (`stagesFor` the project; none when it gives no
 *  stages), then the designer's. */
export function planTemplatesOf(d: OptimizerData, p: Project): PlanTemplate[] {
  const stages = stagesFor(p)
  return [...(stages.length ? [typologyPlanTemplate(stages)] : []), ...(d.planTemplates ?? [])]
}

/** A plan saved as a template of the designer's, named after its stages (Grid → Buildings → Docks), a number added
 *  when that name is taken. */
export function savePlanTemplate(d: OptimizerData, plan: Plan): OptimizerData {
  const saved = d.planTemplates ?? []
  let n = 1
  while (saved.some((t) => t.id === `plan-template-${n}`)) n++
  const base = plan.stages.map((s) => s.name).join(' → ')
  let name = base
  for (let k = 2; saved.some((t) => t.name === name); k++) name = `${base} ${k}`
  return { ...d, planTemplates: [...saved, planTemplateOf(plan, `plan-template-${n}`, name)] }
}

/** Without a plan template of the designer's. */
export const removePlanTemplate = (d: OptimizerData, id: string): OptimizerData => ({ ...d, planTemplates: (d.planTemplates ?? []).filter((t) => t.id !== id) })

/** The data of a project turned on: what it had, else its typology's templates (a typology without any: a blank one). */
export function turnOn(typology: string, data: OptimizerData | null): OptimizerData {
  if (data) return { ...data, on: true }
  const templates = structuredClone(templatesFor(typology))
  return templates.length ? { on: true, active: templates[0].id, templates } : blank({ on: true, active: '', templates: [] })
}

/** The data with the typology's templates it lacks (one a later version added), after its own; the same when none. */
export function withTypology(d: OptimizerData, typology: string): OptimizerData {
  const missing = templatesFor(typology).filter((t) => !d.templates.some((x) => x.id === t.id))
  return missing.length ? { ...d, templates: [...d.templates, ...structuredClone(missing)] } : d
}

/** The typology's own of a template that came from it (null: one of the designer's, or one it no longer gives). */
export function originalOf(t: Template, typology: string): Template | null {
  return t.from === 'typology' ? (templatesFor(typology).find((x) => x.id === t.id) ?? null) : null
}

/** Its keys sorted, so two templates compare by what they say, not by the order their fields were written in. */
const canonical = (v: unknown): unknown =>
  Array.isArray(v) ? v.map(canonical) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, canonical(x)])) : v

/** A typology's template the designer has changed (its variables, objectives, must-holds or budget). */
export function isEdited(t: Template, typology: string): boolean {
  const o = originalOf(t, typology)
  return o !== null && JSON.stringify(canonical(t)) !== JSON.stringify(canonical(o))
}

/** The active template back to how its typology gives it. */
export function restoreActive(d: OptimizerData, typology: string): OptimizerData {
  const o = originalOf(activeOf(d), typology)
  return o ? withActive(d, () => structuredClone(o)) : d
}

export const activeOf = (d: OptimizerData): Template => d.templates.find((t) => t.id === d.active) ?? d.templates[0]

/** The data with its active template changed. */
export function withActive(d: OptimizerData, f: (t: Template) => Template): OptimizerData {
  const id = activeOf(d).id
  return { ...d, templates: d.templates.map((t) => (t.id === id ? f(t) : t)) }
}

function freshId(d: OptimizerData): string {
  let n = 1
  while (d.templates.some((t) => t.id === `user-${n}`)) n++
  return `user-${n}`
}

/** A copy of the active template, the designer's, made active. */
export function duplicate(d: OptimizerData): OptimizerData {
  const t = activeOf(d)
  const id = freshId(d)
  return { ...d, active: id, templates: [...d.templates, { ...structuredClone(t), id, name: `${t.name} copy`, from: 'user' }] }
}

/** A new template, the designer's, made active: the masses may move, the brief is its aim, the usual must-holds. */
export function blank(d: OptimizerData): OptimizerData {
  const id = freshId(d)
  const name = `Template ${d.templates.length + 1}`
  const t: Template = {
    id,
    name,
    from: 'user',
    variables: [{ kind: 'mass.position', step: 1 }],
    objectives: [{ measure: 'brief-gap', sense: 'min' }],
    constraints: structuredClone(USUAL.constraints),
    budget: { ...USUAL.budget },
  }
  return { ...d, active: id, templates: [...d.templates, t] }
}

/** Without a template of the designer's (a typology's stays); the active one falls to the first. */
export function remove(d: OptimizerData, id: string): OptimizerData {
  const t = d.templates.find((x) => x.id === id)
  if (!t || t.from !== 'user' || d.templates.length < 2) return d
  const templates = d.templates.filter((x) => x.id !== id)
  return { ...d, templates, active: d.active === id ? templates[0].id : d.active }
}
