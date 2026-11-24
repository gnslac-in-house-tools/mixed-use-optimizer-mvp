// A template on a project's option, as a problem for the engine (Decision "Optimizer plugin"):
//   genome ── decode: each parameter kind writes its values, through the verbs, on a copy; settled ──▶ Project
//   Project ── derive(), the option alone ──▶ the template's measures ──▶ objectives (max ones negated) + violation
// The kinds and the measures are the catalog's (Decision "Catalog": each module declares its own; on or off, a saved id
// resolves), written in the kinds' order; a kind reads what only it needs once (`prepare`), after what they all share.
// A template none of whose measures reads the roads (`Measure.flow`) derives the masses and the access alone (Phase C.1).
// Settled as an edit on the plan is (state/settle.ts): the dimensions follow their corners, and a genome that would
// break a lock (a locked dimension's length, a locked mass) is refused: the worst there is, never measured.
// The violation sums each constraint's excess, in metres (an area by its square root), so a broken specimen can be less
// broken than another. The project is never changed: decode returns a new one, which *Keep* (O.6) applies.
// Seeds: the design as it is, and Arrange's answer from it (Decision "Solve"), both on the template's steps.
import { optionOf } from '../../../engine/buildings.ts'
import { derive, deriveMassing, withCirculation } from '../../../engine/derive.ts'
import { deriveSite } from '../../../engine/massing/site.ts'
import type { Id, Project } from '../../../model/schema.ts'
import { arrange } from '../../../state/actions/graph.ts'
import { settle, type Settled } from '../../../state/settle.ts'
import { contextOf, gridOf, inMetres, measureCatalog, paramKind, paramKinds } from '../../../modules/catalog.ts'
import type { Context, Evaluated, Measure, MeasureContext, Variable } from '../../../modules/types.ts'
import { repair, within, type Genome } from './genes.ts'
import type { Evaluation, Problem } from './nsga2.ts'
import { withFixedRules, type Template } from './template.ts'

export interface TemplateProblem {
  problem: Problem
  variables: Variable[]
  objectives: { measure: Measure; sense: 'min' | 'max' }[]
  constraints: { measure: Measure; max: number }[]
  /** The ids the template names that the catalog no longer has. */
  missing: string[]
  seeds: Genome[]
  /** The whole project with this genome written into the option, settled (as written when a lock refuses it). */
  decode(genome: Genome): Project
  /** Every measure of the template on a project (the design as it is: Specimens' ◇), not through genes. */
  measure(p: Project): { objectives: number[]; constraints: number[] }
}

/** What a stage's window shows of a template on an option, without its seeds (Arrange) or a run: its genes, what it
 *  measures, the names the catalog lacks, what the kinds read (the masses, the fixed ones) and the design's figures. */
export interface TemplateSummary {
  variables: Variable[]
  objectives: { measure: Measure; sense: 'min' | 'max' }[]
  constraints: { measure: Measure; max: number }[]
  missing: string[]
  ctx: Context
  design: { objectives: number[]; constraints: number[] }
}

export function summaryOf(project: Project, optionId: Id, template: Template): TemplateSummary {
  const s = setup(project, optionId, template)
  return { variables: s.variables, objectives: s.objectives, constraints: s.constraints, missing: s.missing, ctx: s.ctx, design: s.measure(project) }
}

/** Writes a genome into the project, by each kind, then settles it. */
function writerOf(project: Project, s: ReturnType<typeof setup>) {
  const written = (genome: Genome): { project: Project; settled: Settled } => {
    const values = new Map(s.variables.map((v, i) => [v.key, genome[i]]))
    const q = s.kinds.reduce((p, k) => k.write(p, values, s.ctx, s.own.get(k.id)), project)
    return { project: q, settled: settle(project, q) }
  }
  const decode = (genome: Genome): Project => {
    const w = written(genome)
    return 'project' in w.settled ? w.settled.project : w.project
  }
  return { written, decode }
}

/**
 * A specimen's project from its genome (its preview, Keep), without what only a run needs (the seeds: Arrange); null
 * for a genome that is not this problem's (another template, the project's masses since).
 */
export function decoderOf(project: Project, optionId: Id, template: Template): (genome: Genome) => Project | null {
  const s = setup(project, optionId, template)
  const { decode } = writerOf(project, s)
  return (genome) => (genome.length === s.variables.length ? decode(genome) : null)
}

export function problemOf(project: Project, optionId: Id, template: Template): TemplateProblem {
  const s = setup(project, optionId, template)
  const { option, variables, objectives, constraints, missing, measure } = s
  const genes = variables.map((v) => v.gene)
  const { written, decode } = writerOf(project, s)
  const evaluate = (genome: Genome): Evaluation => {
    const { settled } = written(genome)
    if ('refused' in settled) return { objectives: objectives.map(() => Infinity), violation: Infinity }
    const m = measure(settled.project)
    return {
      objectives: m.objectives.map((v, i) => (objectives[i].sense === 'max' ? -v : v)),
      violation: m.constraints.reduce((s, v, i) => s + inMetres(constraints[i].measure.unit, v - constraints[i].max), 0),
    }
  }
  const read = (p: Project) => repair(genes, variables.map((v) => v.read(p)))
  const seeds = [read(project), read(arrange(project, option.id))]

  return { problem: { genes, evaluate }, variables, objectives, constraints, missing, seeds, decode, measure }
}

/** What a problem and its summary share: the kinds and what they read, the genes, the measures, measuring. */
function setup(project: Project, optionId: Id, stored: Template) {
  const template = withFixedRules(stored) // the fixed rules hold in every run; the stored template is left as it is
  const option = optionOf(project, optionId)
  const kinds = paramKinds().filter((k) => template.variables.some((v) => v.kind === k.id))
  const ctx = contextOf(project, option.id, kinds.map((k) => k.id))
  // what only one kind needs, read once (its module's: the warehouse types, the platforms, the dock patterns)
  const own = new Map(kinds.map((k) => [k.id, k.prepare?.(project, ctx)]))
  const measures = measureCatalog(project)
  const missing: string[] = []
  const found = (id: string) => {
    const m = measures.find((x) => x.id === id)
    if (!m) missing.push(id)
    return m
  }
  const objectives = template.objectives.flatMap((o) => {
    const measure = found(o.measure)
    return measure ? [{ measure, sense: o.sense }] : []
  })
  const constraints = template.constraints.flatMap((c) => {
    const measure = found(c.measure)
    return measure ? [{ measure, max: c.max }] : []
  })
  const settings = new Map(template.variables.map((v) => [v.kind, v]))
  for (const v of template.variables) if (!paramKind(v.kind)) missing.push(v.kind)
  const variables = kinds.flatMap((k) => {
    const s = settings.get(k.id)!
    const vs = k.variables(ctx, { step: s.step, range: s.range ?? k.range ?? 0 }, own.get(k.id))
    // an earlier stage's kind: within its margin of the value it has
    return s.margin === undefined ? vs : vs.map((v) => ({ ...v, gene: within(v.gene, v.read(project), s.margin!) }))
  })
  const mctx: MeasureContext = { option, grid: gridOf(deriveSite(project.site).buildable, ctx.axis) }
  const roads = [...objectives, ...constraints].some((x) => x.measure.flow)
  const measure = (p: Project) => {
    // only this option: derive() measures every option, and the others do not change
    const alone: Project = { ...p, options: p.options.filter((o) => o.id === option.id) }
    const derived = roads ? derive(alone, option.id) : withCirculation(alone, deriveMassing(alone, option.id), { network: false })
    const e: Evaluated = { project: alone, derived, ctx: mctx }
    return { objectives: objectives.map((o) => o.measure.read(e)), constraints: constraints.map((c) => c.measure.read(e)) }
  }
  return { option, kinds, ctx, own, variables, objectives, constraints, missing, measure }
}
