// The stage plan (Decisions "Stages", "Stages layout", "Free steps"): the optimization in stages, seed to leaf, any of
// them worked at any time, in any order. A single run is a plan of one stage. Pure: plans in, plans out; the views keep them in
// `Project.plugins.optimizer.plans` (data.ts), one undo step a change.
//   plan    the option it started from and its stages, in order; one plan per option (a stage's approved option
//           belongs to the plan that made it)
//   stage   its name, who works it (the optimizer, the agent, the designer by hand), its own copy of a template (what
//           the window shows is what runs), the agent's aim, its margin over earlier stages, its attempts, what was
//           approved
//   attempt one ▶ Run (a Redo is a new one): the template as it ran, margins and all, and the option it ran on
// A stage's input is the option the nearest earlier approved stage kept (none: the plan's own). Its run template is its own
// with every kind an earlier stage varied and it does not, each within its margin (± steps; one by default; 0 = frozen).
// Approve keeps a pick as an option (the views make it) and records it, and marks the later approved stages to review
// again (their input changed); Reopen takes an approval back and does the same, as reordering or removing a stage does
// to the ones after it. A plan template
// is a plan's stages with nothing run (the typology's, or one the designer saved): a new plan starts from it.
import { z } from 'zod'
import { paramKinds } from '../../../modules/catalog.ts'
import { TemplateSchema, type Template } from './template.ts'

/** How many steps an earlier stage's kind may move by default. */
export const DEFAULT_MARGIN = 1

export const AttemptSchema = z.object({
  /** The template as it ran: the stage's own, with the earlier stages' kinds within their margins. */
  template: TemplateSchema,
  /** The option it ran on. */
  input: z.string(),
  /** The specimen picked to review (its number in the run). */
  pick: z.number().int().optional(),
  /** By hand: the copy of its input the designer works on. */
  worked: z.string().optional(),
})
export type Attempt = z.infer<typeof AttemptSchema>

export const StageSchema = z.object({
  id: z.string(),
  name: z.string(),
  by: z.enum(['optimizer', 'agent', 'hand']),
  /** Its own copy of a template: its id and name say which it came from. */
  template: TemplateSchema,
  /** What the agent is asked for, typed (a stage the agent works). */
  aim: z.string().optional(),
  /** Per kind an earlier stage varied: how many of its steps it may move (absent: DEFAULT_MARGIN; 0: frozen). */
  margin: z.record(z.string(), z.number().int().min(0)).optional(),
  attempts: z.array(AttemptSchema),
  /** The attempt approved and the option its pick was kept as. */
  approved: z.object({ attempt: z.number().int().min(0), option: z.string(), specimen: z.number().int().optional() }).optional(),
  /** Approved before an earlier stage changed: to review again. */
  again: z.boolean().optional(),
})
export type Stage = z.infer<typeof StageSchema>

export const PlanSchema = z.object({
  id: z.string(),
  /** The option the plan started from: the first stage's input. */
  option: z.string(),
  stages: z.array(StageSchema).min(1),
  /** The plan template it started from (its id), kept through its edits: the one the panel's drop-down shows. */
  from: z.string().optional(),
})
export type Plan = z.infer<typeof PlanSchema>

/** Running is the run store's: an attempt whose run goes is shown so by the views. */
export type StageStatus = 'todo' | 'review' | 'approved' | 'again'

/** A new stage from a template: its own copy, worked by the optimizer, nothing run. */
export function stageFrom(t: Template, id: string, by: Stage['by'] = 'optimizer'): Stage {
  return { id, name: t.name, by, template: structuredClone(t), attempts: [] }
}

/** The plan an option is in: the one it started, or the one whose stage approved it or works it by hand; else the
 *  fresh one given (the typology's: data.ts `planIn`), not stored until it changes. */
export function planOf(plans: Plan[], optionId: string, fresh: () => Plan): Plan {
  const made = (s: Stage) => s.approved?.option === optionId || s.attempts.some((a) => a.worked === optionId)
  return plans.find((p) => p.option === optionId) ?? plans.find((p) => p.stages.some(made)) ?? fresh()
}

/** A plan of one stage from a template (a single run): an option's when its typology gives no plan. */
export const oneStagePlan = (optionId: string, t: Template): Plan => ({ id: `plan-${optionId}`, option: optionId, stages: [stageFrom(t, 'stage-1')] })

/** The plans with this one in its place (or added). */
export const withPlan = (plans: Plan[], plan: Plan): Plan[] =>
  plans.some((p) => p.id === plan.id) ? plans.map((p) => (p.id === plan.id ? plan : p)) : [...plans, plan]

/** A plan as a template (P.4, Decision "Plan templates"): its stages' settings, in order, nothing run. */
export const PlanTemplateSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** The typology's (given, never stored) or the designer's (saved in the project). */
  from: z.enum(['typology', 'user']),
  stages: z.array(StageSchema.pick({ name: true, by: true, template: true, aim: true, margin: true })).min(1),
})
export type PlanTemplate = z.infer<typeof PlanTemplateSchema>

/** The typology's plan as a template: a stage per template, worked by the optimizer. */
export const typologyPlanTemplate = (templates: Template[]): PlanTemplate => ({
  id: 'typology',
  name: 'The typology’s plan',
  from: 'typology',
  stages: templates.map((t) => ({ name: t.name, by: 'optimizer', template: structuredClone(t) })),
})

/** A plan's stages as a template of the designer's: their names, who works them, their parameters, aims and margins. */
export function planTemplateOf(plan: Plan, id: string, name: string): PlanTemplate {
  const stages = plan.stages.map((s) => ({
    name: s.name,
    by: s.by,
    template: structuredClone(s.template),
    ...(s.aim !== undefined && { aim: s.aim }),
    ...(s.margin && { margin: { ...s.margin } }),
  }))
  return { id, name, from: 'user', stages }
}

/** A plan on an option from a template: its stages fresh, nothing run; it says which template it came from. */
export function planFrom(optionId: string, t: PlanTemplate): Plan {
  return {
    id: `plan-${optionId}`,
    option: optionId,
    from: t.id,
    stages: t.stages.map((s, i) => ({ ...stageFrom(s.template, `stage-${i + 1}`, s.by), name: s.name, ...(s.aim !== undefined && { aim: s.aim }), ...(s.margin && { margin: { ...s.margin } }) })),
  }
}

/** The typology's plan on an option, seed to leaf: a stage per template. */
export const typologyPlan = (optionId: string, templates: Template[]): Plan => planFrom(optionId, typologyPlanTemplate(templates))

const indexOf = (plan: Plan, id: string) => plan.stages.findIndex((s) => s.id === id)

function freshId(plan: Plan): string {
  let n = plan.stages.length + 1
  while (plan.stages.some((s) => s.id === `stage-${n}`)) n++
  return `stage-${n}`
}

/** The stages from `from` on that were approved go to review again. */
function staleFrom(stages: Stage[], from: number): Stage[] {
  return stages.map((s, i) => (i >= from && s.approved ? { ...s, again: true } : s))
}

export function statusOf(plan: Plan, id: string): StageStatus {
  const s = plan.stages[indexOf(plan, id)]
  if (!s) return 'todo'
  if (s.approved) return s.again ? 'again' : 'approved'
  return s.attempts.length ? 'review' : 'todo'
}

/** The stage being worked: the first not approved, or approved but to review again; none when all are approved. */
export function currentOf(plan: Plan): Stage | null {
  return plan.stages.find((s) => !s.approved || s.again) ?? null
}

/** The stage whose approval a stage runs on: the nearest earlier one approved; null when none is (it runs on the
 *  plan's own option). */
export function feederOf(plan: Plan, id: string): Stage | null {
  const i = indexOf(plan, id)
  return (i > 0 && plan.stages.slice(0, i).findLast((s) => s.approved)) || null
}

/** The option a stage runs on (Decision "Free steps"): what the nearest earlier approved stage kept, else the plan's
 *  own; null for a stage not in the plan. */
export function inputOf(plan: Plan, id: string): string | null {
  if (indexOf(plan, id) < 0) return null
  return feederOf(plan, id)?.approved?.option ?? plan.option
}

/** The kinds earlier stages varied that this one does not, each with the latest earlier settings and its margin. */
export function marginsOf(plan: Plan, id: string): { kind: string; step: number; range?: number; margin: number }[] {
  const i = indexOf(plan, id)
  if (i < 0) return []
  const s = plan.stages[i]
  const own = new Set(s.template.variables.map((v) => v.kind))
  const earlier = new Map<string, Template['variables'][number]>()
  for (const e of plan.stages.slice(0, i)) for (const v of e.template.variables) if (!own.has(v.kind)) earlier.set(v.kind, v)
  return [...earlier.values()].map((v) => ({ kind: v.kind, step: v.step, ...(v.range !== undefined && { range: v.range }), margin: s.margin?.[v.kind] ?? DEFAULT_MARGIN }))
}

/** What a stage's ▶ Run runs: its own template and the earlier kinds within their margins (a frozen one left out). */
export function runTemplateOf(plan: Plan, id: string): Template {
  const s = plan.stages[indexOf(plan, id)]
  const margins = marginsOf(plan, id)
    .filter((m) => m.margin > 0)
    .map((m) => ({ kind: m.kind, step: m.step, ...(m.range !== undefined && { range: m.range }), margin: m.margin }))
  return { ...structuredClone(s.template), variables: [...structuredClone(s.template.variables), ...margins] }
}

function withStage(plan: Plan, id: string, f: (s: Stage) => Stage): Plan {
  return { ...plan, stages: plan.stages.map((s) => (s.id === id ? f(s) : s)) }
}

/** A stage put at an index; the approved ones after it go to review again (their input changed). */
function insert(plan: Plan, s: Stage, at: number): Plan {
  const stages = [...plan.stages]
  stages.splice(at, 0, s)
  return { ...plan, stages: staleFrom(stages, at + 1) }
}

/** A new stage from a template, at an index (the end by default). */
export const addStage = (plan: Plan, t: Template, at = plan.stages.length): Plan => insert(plan, stageFrom(t, freshId(plan)), at)

/** Without a stage (the last one stays); the ones after it go to review again. */
export function removeStage(plan: Plan, id: string): Plan {
  const i = indexOf(plan, id)
  if (i < 0 || plan.stages.length < 2) return plan
  return { ...plan, stages: staleFrom(plan.stages.filter((s) => s.id !== id), i) }
}

/** A stage moved to an index; the approved ones from the first that moved on go to review again. */
export function moveStage(plan: Plan, id: string, to: number): Plan {
  const i = indexOf(plan, id)
  const at = Math.max(0, Math.min(plan.stages.length - 1, to))
  if (i < 0 || i === at) return plan
  const stages = [...plan.stages]
  const [s] = stages.splice(i, 1)
  stages.splice(at, 0, s)
  return { ...plan, stages: staleFrom(stages, Math.min(i, at)) }
}

/** A copy of a stage after it: its parameters, nothing run. */
export function duplicateStage(plan: Plan, id: string): Plan {
  const i = indexOf(plan, id)
  if (i < 0) return plan
  const s = plan.stages[i]
  const copy: Stage = { ...stageFrom(s.template, freshId(plan), s.by), name: `${s.name} copy`, ...(s.aim !== undefined && { aim: s.aim }), ...(s.margin && { margin: { ...s.margin } }) }
  return insert(plan, copy, i + 1)
}

/** A stage's name, who works it, its aim, its parameters or its margin changed (what ran before stays in its attempts). */
export function editStage(plan: Plan, id: string, patch: Partial<Pick<Stage, 'name' | 'by' | 'aim' | 'template' | 'margin'>>): Plan {
  return withStage(plan, id, (s) => ({ ...s, ...structuredClone(patch) }))
}

/** ▶ Run (or *Start by hand*, with the copy worked on): a new attempt on the stage's input, with its run template (and
 *  a budget of its own for this attempt only: an agent's quick look); null while it has no input. */
export function startAttempt(plan: Plan, id: string, worked?: string, budget?: Partial<Template['budget']>): Plan | null {
  const input = inputOf(plan, id)
  if (input === null) return null
  const template = runTemplateOf(plan, id)
  if (budget) template.budget = { ...template.budget, ...budget }
  const attempt: Attempt = { template, input, ...(worked !== undefined && { worked }) }
  return withStage(plan, id, (s) => ({ ...s, attempts: [...s.attempts, attempt] }))
}

/** The stage's last attempt (null: never run). */
export const lastAttempt = (plan: Plan, id: string): Attempt | null => plan.stages[indexOf(plan, id)]?.attempts.at(-1) ?? null

/** The specimen picked to review in the last attempt. */
export const pickIn = (plan: Plan, id: string, specimen: number | undefined): Plan =>
  withLast(plan, id, (a) => {
    const { pick: _, ...rest } = a
    return specimen === undefined ? rest : { ...rest, pick: specimen }
  })

function withLast(plan: Plan, id: string, f: (a: Attempt) => Attempt): Plan {
  return withStage(plan, id, (s) => (s.attempts.length ? { ...s, attempts: [...s.attempts.slice(0, -1), f(s.attempts.at(-1)!)] } : s))
}

/** Approve: the last attempt's pick kept as `option` (by hand: the option worked); the later approved stages to
 *  review again, their input changed. */
export function approve(plan: Plan, id: string, option: string, specimen?: number): Plan {
  const done = withStage(plan, id, (stage) => {
    const { again: _, ...s } = stage
    return { ...s, approved: { attempt: Math.max(0, s.attempts.length - 1), option, ...(specimen !== undefined && { specimen }) } }
  })
  return { ...done, stages: staleFrom(done.stages, indexOf(plan, id) + 1) }
}

// The way back to Massing (Decision "Circulation optimization", 7.5): a stage of the circulation moves the masses at
// most within an earlier stage's margin, so what only the masses can fix stays; its review says so and offers the
// last earlier stage that moved them. Which kinds move the masses and which are the circulation's, each kind says
// (its `role`, in the catalog: Decision "Optimizer reads the catalog").

/** The kinds of a stage role: those that move or reshape the masses, or the circulation's. */
export const kindsOf = (role: 'masses' | 'circulation'): Set<string> => new Set(paramKinds().filter((k) => k.role === role).map((k) => k.id))

/** A template of the circulation: its own kinds (an earlier stage's, with a margin, aside) all the circulation's. */
export function ofCirculation(t: Template): boolean {
  const circulation = kindsOf('circulation')
  const own = t.variables.filter((v) => v.margin === undefined)
  return own.length > 0 && own.every((v) => circulation.has(v.kind))
}

/** The last stage before this one whose template moves the masses (null: none, or the first). */
export function massesStageBefore(plan: Plan, id: string): Stage | null {
  const masses = kindsOf('masses')
  const i = indexOf(plan, id)
  return (i > 0 && plan.stages.slice(0, i).findLast((s) => s.template.variables.some((v) => masses.has(v.kind)))) || null
}

/** Reopen an approved stage: its approval goes (its attempts stay), the approved ones after it to review again. */
export function reopen(plan: Plan, id: string): Plan {
  const i = indexOf(plan, id)
  if (i < 0 || !plan.stages[i].approved) return plan
  const stages = plan.stages.map((s, j) => {
    if (j !== i) return s
    const { approved: _, again: __, ...rest } = s
    return rest
  })
  return { ...plan, stages: staleFrom(stages, i + 1) }
}
