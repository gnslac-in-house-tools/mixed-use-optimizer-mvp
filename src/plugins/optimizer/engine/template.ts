// A template (Decision "Optimizer plugin"): what to optimize, as data, so the designer can duplicate one or make
// another and it travels in the project (`Project.plugins.optimizer`, O.4). It names a parameter kind per variable
// (with its step and, for the kinds that have one, its range: absent, the kind's own), a measure per objective (minimize or maximize) and per constraint (its value must stay at or under
// `max`), and the budget. Ids, never code: a kind or measure that no longer exists is reported as missing.
// A variable with a `margin` is a kind an earlier stage approved: its genes go only that many steps either way of the
// value they have (Decision "Stages"; a stage's run template, engine/stages.ts).
// The templates and stage plans a project starts with are its typology's (Decision "Catalog": they name the modules'
// kinds and measures): data the optimizer reads with this schema (data.ts `templatesFor`, `stagesFor`).
import { z } from 'zod'

export const TemplateSchema = z.object({
  id: z.string(),
  name: z.string(),
  from: z.enum(['typology', 'user']),
  variables: z.array(
    z.object({ kind: z.string(), step: z.number().positive(), range: z.number().positive().optional(), margin: z.number().int().positive().optional() }),
  ),
  objectives: z.array(z.object({ measure: z.string(), sense: z.enum(['min', 'max']) })).min(1),
  constraints: z.array(z.object({ measure: z.string(), max: z.number() })),
  budget: z.object({ population: z.number().int().min(4), generations: z.number().int().min(1), seed: z.number().int() }),
})
export type Template = z.infer<typeof TemplateSchema>

/** The rules every run holds at 0, whatever a stage says (Decision "Fixed constraints"). */
export const FIXED_RULES = ['outside-buildable', 'overlap', 'required-gap'] as const
/** Coverage over the allowed COS: strict unless the stage loosens it, the one rule a stage may. */
export const COS = 'coverage-over'

/**
 * The template a run uses: its constraints in their order, each fixed rule forced to `max: 0`, then the fixed rules
 * and the COS it lacks added at 0 (the COS is kept as it is when present). Applied at run time, so a stage saved before
 * keeps its stored template. Never mutates `t`.
 */
export function withFixedRules(t: Template): Template {
  const fixed = new Set<string>(FIXED_RULES)
  const own = t.constraints.map((c) => (fixed.has(c.measure) ? { ...c, max: 0 } : { ...c }))
  const has = (m: string) => own.some((c) => c.measure === m)
  const missing = [...FIXED_RULES, COS].filter((m) => !has(m)).map((measure) => ({ measure, max: 0 }))
  return { ...t, constraints: [...own, ...missing] }
}
