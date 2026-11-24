// What the optimizer's tools do (Decision "Plugin tools"; their specs in index.ts), in the tab, as the tabs do it:
// a run starts as ▶ Run (the run's store, its worker, Specimens opened) and a specimen is kept as *Keep as option*
// (views/specimens/keep.ts), logged as the agent's. A tool that waits listens to the run's store until the run ends
// or its time is up; the run goes on after the answer.
import type { Id, Project } from '../../../model/schema.ts'
import { actions, apply, currentOption, currentProject, pluginData, showTabs, ToolError } from '../../host.ts'
import { activeOf, OPTIMIZER, OptimizerDataSchema, turnOn, withTypology, type OptimizerData } from '../data.ts'
import { measureCatalog, paramKind } from '../../../modules/catalog.ts'
import type { Measure } from '../../../modules/types.ts'
import type { Specimen } from '../engine/nsga2.ts'
import { summaryOf } from '../engine/problem.ts'
import { withFixedRules, type Template } from '../engine/template.ts'
import { asRead, progressOf, useRun, type Run } from '../run/store.ts'
import { keep, keptAs, optionName } from '../views/specimens/keep.ts'

const round = (v: number) => Math.round(v * 10) / 10

/** By id, else by name (a model often says "Option 1"), else why not and what there is. */
export function find<T extends { id: Id; name: string }>(list: T[], key: string, what: string): T {
  const named = key.trim().toLowerCase()
  const found = list.find((x) => x.id === key) ?? list.find((x) => x.name.trim().toLowerCase() === named)
  if (!found) throw new ToolError(`No ${what} "${key}". There are: ${list.map((x) => `${x.id} (${x.name})`).join(', ')}.`)
  return found
}

/** The project's optimizer data, with the templates its typology gained since (as the Optimize tab reads it). */
export function dataOf(p: Project): OptimizerData | null {
  const saved = pluginData(p, OPTIMIZER, OptimizerDataSchema)
  return saved ? withTypology(saved, p.typology) : null
}

/** A template as the agent reads it: its ids with their labels and units, the budget with what it costs. */
export function described(t: Template, measures: Measure[]) {
  const measure = (id: string) => measures.find((m) => m.id === id)
  const label = (id: string) => measure(id)?.label ?? `${id} (missing)`
  return {
    id: t.id,
    name: t.name,
    changes: t.variables.map((v) => ({
      kind: v.kind,
      label: paramKind(v.kind)?.label ?? `${v.kind} (missing)`,
      step: v.step,
      unit: paramKind(v.kind)?.unit,
      ...(v.range !== undefined ? { range: v.range } : {}),
    })),
    aims: t.objectives.map((o) => ({ measure: o.measure, label: label(o.measure), unit: measure(o.measure)?.unit, sense: o.sense })),
    // what a run holds: the stored constraints with the fixed rules and a strict COS (Decision "Fixed constraints")
    mustHold: withFixedRules(t).constraints.map((c) => ({ measure: c.measure, label: label(c.measure), unit: measure(c.measure)?.unit, max: c.max })),
    budget: { ...t.budget, specimens: t.budget.population * t.budget.generations },
  }
}

/** Where a run stands. */
export function headOf(p: Project, run: Run) {
  return {
    status: run.status,
    progress: `${Math.round(progressOf(run) * 100)} %`,
    evaluated: run.specimens.length,
    onFront: run.front.length,
    seconds: round(run.elapsed / 1000),
    template: run.template.name,
    option: optionName(p, run) ?? `${run.optionId} (no longer in the project)`,
    budget: run.template.budget,
    ...(run.error ? { error: run.error } : {}),
  }
}

export function getOptimizer() {
  const p = currentProject()
  const data = dataOf(p)
  // not turned on: the templates turning it on gives
  const shown = data ?? turnOn(p.typology, null)
  const measures = measureCatalog(p)
  const run = useRun.getState().run
  return {
    on: data?.on ?? false,
    active: activeOf(shown).id,
    templates: shown.templates.map((t) => described(t, measures)),
    run: run ? headOf(p, run) : null,
  }
}

/** Until the run is no longer running, or `seconds` have gone by. */
export function until(seconds: number): Promise<void> {
  return new Promise((done) => {
    if (seconds <= 0 || useRun.getState().run?.status !== 'running') return done()
    const end = () => {
      clearTimeout(timer)
      off()
      done()
    }
    const timer = setTimeout(end, seconds * 1000)
    const off = useRun.subscribe((s) => {
      if (s.run?.status !== 'running') end()
    })
  })
}

/** The run and its front for the agent: the best specimen for each objective first, then the rest of the front. */
export function specimensOf(p: Project, run: Run, limit: number) {
  const head = headOf(p, run)
  const problem = run.problem
  if (!problem) return { ...head, note: 'The run is starting: ask again in a moment.' }
  const named = (values: number[]) => Object.fromEntries(problem.objectives.map((o, k) => [o.id, round(values[k])]))
  const holds = (s: Specimen) => s.violation === 0
  // among those that hold every must-hold, if any do (the engine minimizes every objective: a max one comes negated)
  const pool = run.front.some(holds) ? run.front.filter(holds) : run.front
  const best = pool.length ? problem.objectives.map((_, k) => pool.reduce((a, b) => (b.objectives[k] < a.objectives[k] ? b : a))) : []
  const rest = [...run.front].sort((a, b) => a.violation - b.violation || a.objectives[0] - b.objectives[0])
  const listed = [...new Map([...best, ...rest].map((s) => [s.id, s])).values()].slice(0, limit)
  return {
    ...head,
    objectives: problem.objectives.map((o) => ({ id: o.id, label: o.label, unit: o.unit, sense: o.sense })),
    mustHold: problem.constraints.map((c) => ({ id: c.id, label: c.label, unit: c.unit, max: c.max })),
    ...(problem.missing.length ? { missing: problem.missing } : {}),
    design: { objectives: named(problem.design.objectives), holds: problem.design.constraints.every((v, k) => v <= problem.constraints[k].max) },
    best: Object.fromEntries(problem.objectives.flatMap((o, k) => (best[k] ? [[o.id, best[k].id]] : []))),
    specimens: listed.map((s) => {
      const kept = keptAs(p, run, s.id)
      return {
        id: s.id,
        holds: holds(s),
        ...(holds(s) ? {} : { violation: round(s.violation) }),
        objectives: named(asRead(problem, s)),
        generation: s.generation,
        ...(kept ? { keptAs: p.options.find((o) => o.id === kept)?.name } : {}),
      }
    }),
  }
}

export async function runOptimizer(i: { template?: string; option?: string; population?: number; generations?: number; seed?: number; wait?: number }) {
  const going = useRun.getState().run
  if (going?.status === 'running')
    throw new ToolError(`A run is going (${Math.round(progressOf(going) * 100)} %): getSpecimens follows it; the designer can stop it in Optimize.`)
  const p = currentProject()
  const option = i.option ? find(p.options, i.option, 'option') : (p.options.find((o) => o.id === currentOption()) ?? p.options[0])
  const data = dataOf(p)
  const on = data?.on ? data : turnOn(p.typology, data)
  const template = i.template ? find(on.templates, i.template, 'template') : activeOf(on)
  const budget = {
    ...template.budget,
    ...(i.population !== undefined ? { population: i.population } : {}),
    ...(i.generations !== undefined ? { generations: i.generations } : {}),
    ...(i.seed !== undefined ? { seed: i.seed } : {}),
  }
  const run: Template = { ...template, budget }
  if (summaryOf(p, option.id, run).variables.length === 0)
    throw new ToolError(`Nothing may change with ${template.name} on ${option.name}: no mass it may move (none, or all locked).`)
  // turned on, the template active, so the Optimize tab shows what runs: one undo step, the agent's
  if (!(data?.on && data.active === template.id)) apply((q) => actions.setPluginData(q, OPTIMIZER, { ...on, active: template.id }), 'agent')
  useRun.getState().start(currentProject(), option.id, run)
  showTabs(OPTIMIZER, { right: 'specimens' })
  await until(i.wait ?? 20)
  return specimensOf(currentProject(), useRun.getState().run!, 10)
}

export async function getSpecimens(i: { wait?: number; limit?: number }) {
  if (!useRun.getState().run) throw new ToolError('No run: runOptimizer starts one.')
  await until(i.wait ?? 0)
  const run = useRun.getState().run
  if (!run) throw new ToolError('The run was discarded.')
  return specimensOf(currentProject(), run, i.limit ?? 10)
}

export async function keepSpecimen(i: { specimen: number }) {
  const run = useRun.getState().run
  if (!run) throw new ToolError('No run: runOptimizer starts one.')
  if (!run.specimens.some((s) => s.id === i.specimen)) throw new ToolError(`No specimen #${i.specimen} in the run: getSpecimens lists the best.`)
  const made = await keep(i.specimen, 'agent')
  if (!made) throw new ToolError(`Specimen #${i.specimen} could not be kept: the option it came from is no longer in the project.`)
  return {
    option: { id: made, name: currentProject().options.find((o) => o.id === made)?.name },
    note: 'It is the option in view now; the one it came from stays as it was.',
  }
}
