// What the stages' tools do (Decision "Stage tools"; their specs in index.ts): the Stages panel's buttons as an agent
// presses them (views/stage/commands.ts), each edit one undo step, logged as the agent's.
//   getStages      an option's plan: each stage, its status, who works it, what it may change, aims at and must hold,
//                  its margins over earlier stages, its attempts, what it approved
//   runStage       ▶ Run: a new attempt and its run (as runOptimizer answers); a stage the agent works may instead be
//                  worked by editing a copy of its input with the other tools (how 'edit', as *Start by hand*)
//   evaluateStage  the stage's review (engine/review.ts): a specimen of its run, or the option worked or approved,
//                  against its input
//   approveStage   Approve: the specimen kept as the stage's option, or the option worked as it is; the later approved ones to review again
import { actions, apply, currentOption, currentProject, ToolError, type Project } from '../../host.ts'
import { measureCatalog, paramKind } from '../../../modules/catalog.ts'
import { OPTIMIZER, planIn, turnOn } from '../data.ts'
import { summaryOf } from '../engine/problem.ts'
import { reviewOf, type Figure, type Review, type Side } from '../engine/review.ts'
import { currentOf, inputOf, lastAttempt, marginsOf, massesStageBefore, runTemplateOf, statusOf, type Plan, type Stage } from '../engine/stages.ts'
import type { Template } from '../engine/template.ts'
import { restoreStageRun } from '../run/lastRun.ts'
import { progressOf, useRun } from '../run/store.ts'
import { projectOf } from '../views/specimens/decode.ts'
import { approveByHand, approveSpecimen, circled, pastBeforeRun, pastText, runOf, runStage as run, startByHand, useStages } from '../views/stage/commands.ts'
import { dataOf, described, find, headOf, specimensOf, until } from './run.ts'

const two = (v: number) => Math.round(v * 100) / 100
const nameOf = (p: Project, id: string | null | undefined) => (id ? (p.options.find((o) => o.id === id)?.name ?? `${id} (no longer in the project)`) : null)

/** The option asked for (id or name), else the one in view. */
function optionAsked(p: Project, key: string | undefined): string {
  if (key) return find(p.options, key, 'option').id
  return p.options.some((o) => o.id === currentOption()) ? currentOption() : p.options[0].id
}

/** The plan an option is in: its own, or the one whose stage made it; the typology's if none. */
function planAsked(p: Project, key: string | undefined): { option: string; plan: Plan } {
  const option = optionAsked(p, key)
  return { option, plan: planIn(dataOf(p) ?? turnOn(p.typology, null), option, p) }
}

/** By id, by name, or by its number (2, or ②). */
function stageAsked(plan: Plan, key: string): Stage {
  const k = key.trim().toLowerCase()
  const n = /^\d+$/.test(k) ? Number(k) : plan.stages.findIndex((_, i) => circled(i + 1) === k) + 1
  const found = plan.stages.find((s) => s.id === key) ?? plan.stages.find((s) => s.name.trim().toLowerCase() === k) ?? (n >= 1 ? plan.stages[n - 1] : undefined)
  if (!found) throw new ToolError(`No stage "${key}". There are: ${plan.stages.map((s, i) => `${i + 1} ${s.id} (${s.name})`).join(', ')}.`)
  return found
}

const label = (plan: Plan, s: Stage) => `${circled(plan.stages.indexOf(s) + 1)} ${s.name}`

/** Turned on for the project, one undo step (the agent's), if it was not: the panel shows what the agent works. */
function turnedOn() {
  const d = dataOf(currentProject())
  if (!d?.on) apply((q) => actions.setPluginData(q, OPTIMIZER, turnOn(q.typology, dataOf(q))), 'agent')
}

/** A stage as the agent reads it. */
function stageRead(p: Project, plan: Plan, s: Stage, i: number) {
  const measures = measureCatalog(p)
  const status = statusOf(plan, s.id)
  const own = runOf(plan, s)
  const last = s.attempts.at(-1)
  const input = inputOf(plan, s.id)
  return {
    id: s.id,
    number: i + 1,
    name: s.name,
    by: s.by,
    status: own?.status === 'running' ? 'running' : status,
    ...(s.aim ? { aim: s.aim } : {}),
    input: nameOf(p, input ?? plan.option),
    template: described(s.template, measures),
    margins: marginsOf(plan, s.id).map((m) => ({ kind: m.kind, label: paramKind(m.kind)?.label ?? m.kind, steps: m.margin })),
    attempts: s.attempts.length,
    ...(last?.worked ? { worked: nameOf(p, last.worked) } : {}),
    ...(own ? { run: headOf(p, own) } : {}),
    ...(s.approved ? { approved: { option: nameOf(p, s.approved.option), ...(s.approved.specimen !== undefined ? { specimen: s.approved.specimen } : {}) } } : {}),
  }
}

export function getStages(i: { option?: string }) {
  const p = currentProject()
  const { option, plan } = planAsked(p, i.option)
  const current = currentOf(plan)
  return {
    on: dataOf(p)?.on ?? false,
    plan: { id: plan.id, option: nameOf(p, plan.option), asked: nameOf(p, option) },
    current: current ? current.id : null,
    stages: plan.stages.map((s, k) => stageRead(p, plan, s, k)),
  }
}

/** Why a stage cannot be worked now, or null. */
function refused(p: Project, plan: Plan, s: Stage): string | null {
  const status = statusOf(plan, s.id)
  if (s.by === 'hand') return `${label(plan, s)} is the designer’s (by hand): they work it in Stages.`
  if (status === 'approved' || status === 'again')
    return `${label(plan, s)} is approved (as ${nameOf(p, s.approved?.option)})${status === 'again' ? ', and an earlier stage changed since' : ''}: the designer reopens it in Stages.`
  return null
}

export async function runStage(i: { stage: string; option?: string; how?: 'run' | 'edit'; population?: number; generations?: number; seed?: number; wait?: number; backToRange?: boolean }) {
  const p = currentProject()
  const { option, plan } = planAsked(p, i.option)
  const s = stageAsked(plan, i.stage)
  const why = refused(p, plan, s)
  if (why) throw new ToolError(why)
  if (i.how === 'edit') {
    if (s.by !== 'agent') throw new ToolError(`${label(plan, s)} is the optimizer’s: runStage without how 'edit' runs it.`)
    turnedOn()
    const made = startByHand(option, s.id, 'agent')
    if (!made) throw new ToolError(`${label(plan, s)} could not start: its input is no longer in the project.`)
    useStages.setState({ picked: s.id })
    return {
      stage: label(plan, s),
      worked: { id: made, name: nameOf(currentProject(), made) },
      note: 'A copy of its input, the option in view now: edit it with the other tools, then evaluateStage checks it and approveStage approves it as it is.',
    }
  }
  const going = useRun.getState().run
  if (going?.status === 'running')
    throw new ToolError(`A run is going (${Math.round(progressOf(going) * 100)} %): getSpecimens follows it; the designer can stop it in Stages.`)
  const input = inputOf(plan, s.id)!
  if (summaryOf(p, input, runTemplateOf(plan, s.id)).variables.length === 0)
    throw new ToolError(`Nothing may change in ${label(plan, s)} on ${nameOf(p, input)}: no variable it may move (none, or all locked).`)
  const budget = {
    ...(i.population !== undefined ? { population: i.population } : {}),
    ...(i.generations !== undefined ? { generations: i.generations } : {}),
    ...(i.seed !== undefined ? { seed: i.seed } : {}),
  }
  // a copy past its range (Decision "Past the range by hand"): the agent asks the designer, then runs with backToRange
  const past = pastBeforeRun(p, option, s.id)
  if (past.length && !i.backToRange)
    throw new ToolError(`${pastText(past)} Ask the designer first; with their yes, runStage again with backToRange: true (or they change those copies by hand).`)
  turnedOn()
  if (!run(option, s.id, { budget, by: 'agent', backToRange: i.backToRange })) throw new ToolError(`${label(plan, s)} could not run.`)
  useStages.setState({ picked: s.id })
  await until(i.wait ?? 20)
  return { stage: label(plan, s), attempt: s.attempts.length + 1, ...specimensOf(currentProject(), useRun.getState().run!, 10) }
}

/** What it made against its input: a specimen of its run, or the option worked or approved. */
async function sidesOf(p: Project, plan: Plan, s: Stage, specimen: number | undefined): Promise<{ before: Side; after: Side; template: Template; of: string }> {
  const status = statusOf(plan, s.id)
  const last = lastAttempt(plan, s.id)
  if (status === 'todo' || !last) throw new ToolError(`${label(plan, s)} has not run: runStage runs it.`)
  if (status === 'review' && !last.worked) {
    let own = runOf(plan, s)
    if (!own && useRun.getState().run?.status !== 'running') {
      await restoreStageRun({ plan: plan.id, stage: s.id, attempt: s.attempts.length - 1 })
      own = runOf(plan, s)
    }
    if (!own) throw new ToolError(`The run of ${label(plan, s)} is not in this browser: runStage runs it again (its seed repeats it).`)
    const id = specimen ?? last.pick
    if (id === undefined) throw new ToolError(`Which specimen of ${label(plan, s)}? getSpecimens lists the best of its run.`)
    const genome = own.specimens.find((x) => x.id === id)?.genome
    if (!genome) throw new ToolError(`No specimen #${id} in the run of ${label(plan, s)}: getSpecimens lists the best.`)
    const made = await projectOf(own, id, genome)
    if (!made) throw new ToolError(`Specimen #${id} could not be made: the option it came from is no longer in the project.`)
    return { before: { project: own.base, option: own.optionId }, after: { project: made, option: own.optionId }, template: own.template, of: `#${id}` }
  }
  const input = inputOf(plan, s.id)
  const kept = s.approved ? s.approved.option : last.worked!
  const there = (id: string | null) => !!id && p.options.some((o) => o.id === id)
  if (!there(input) || !there(kept)) throw new ToolError(`${label(plan, s)}: the option it made or its input is no longer in the project.`)
  const template = (s.approved ? s.attempts[s.approved.attempt] : last)?.template ?? s.template
  return { before: { project: p, option: input! }, after: { project: p, option: kept }, template, of: nameOf(p, kept)! }
}

const figure = (f: Figure) => ({ id: f.id, label: f.label, unit: f.unit, before: two(f.before), after: two(f.after) })

/** The review as the agent reads it: better or worse for each objective, every must-hold, what else changed. */
function reviewRead(r: Review) {
  return {
    holds: r.constraints.every((c) => c.held),
    objectives: r.objectives.map((f) => ({ ...figure(f), sense: f.sense, way: f.better === null ? 'same' : f.better ? 'better' : 'worse' })),
    mustHold: r.constraints.map((c) => ({ id: c.id, label: c.label, unit: c.unit, max: c.max, value: two(c.after), held: c.held })),
    changed: r.changed.map(figure),
    unchanged: r.same.length,
    ...(r.moved ? { movedOfEarlierStages: r.moved.map((m) => ({ ...m, before: two(m.before), after: two(m.after) })) } : {}),
    ...(r.massesOnly.length ? { onlyTheMassesCanFix: r.massesOnly.map((i) => ({ code: i.code, message: i.message, massIds: i.massIds })) } : {}),
  }
}

export async function evaluateStage(i: { stage: string; option?: string; specimen?: number }) {
  const p = currentProject()
  const { plan } = planAsked(p, i.option)
  const s = stageAsked(plan, i.stage)
  const { before, after, template, of } = await sidesOf(p, plan, s, i.specimen)
  const index = plan.stages.indexOf(s)
  const review = reviewOf(before, after, template)
  // the way back to Massing (7.5): the stage that moved the masses, for the designer to reopen
  const masses = review.massesOnly.length ? massesStageBefore(plan, s.id) : null
  return {
    stage: label(plan, s),
    of,
    against: index > 0 ? label(plan, plan.stages[index - 1]) : nameOf(p, plan.option),
    ...reviewRead(review),
    ...(masses ? { backToMassing: `${label(plan, masses)} moved the masses: the designer reopens it in Stages to settle what only they can fix.` } : {}),
  }
}

export async function approveStage(i: { stage: string; option?: string; specimen?: number }) {
  const p = currentProject()
  const { option, plan } = planAsked(p, i.option)
  const s = stageAsked(plan, i.stage)
  const status = statusOf(plan, s.id)
  const last = lastAttempt(plan, s.id)
  if (status === 'todo' || !last) throw new ToolError(`${label(plan, s)} has not run: runStage runs it.`)
  if (status !== 'review') throw new ToolError(`${label(plan, s)} is approved (as ${nameOf(p, s.approved?.option)}): the designer reopens it in Stages.`)
  let made: string | null
  if (last.worked) made = approveByHand(option, s.id, 'agent')
  else {
    const own = runOf(plan, s)
    if (!own) throw new ToolError(`The run of ${label(plan, s)} is not in this browser: runStage runs it again (its seed repeats it).`)
    if (own.status === 'running') throw new ToolError(`${label(plan, s)} is still running: getSpecimens waits for it.`)
    const id = i.specimen ?? last.pick
    if (id === undefined) throw new ToolError(`Which specimen of ${label(plan, s)}? getSpecimens lists the best of its run.`)
    if (!own.specimens.some((x) => x.id === id)) throw new ToolError(`No specimen #${id} in the run of ${label(plan, s)}: getSpecimens lists the best.`)
    made = await approveSpecimen(option, s.id, id, 'agent')
  }
  if (!made) throw new ToolError(`${label(plan, s)} could not be approved: the option it made or its input is no longer in the project.`)
  const q = currentProject()
  const after = planIn(dataOf(q)!, made, q)
  const next = currentOf(after)
  return {
    stage: label(plan, s),
    approved: { id: made, name: nameOf(q, made) },
    next: next ? { id: next.id, name: label(after, next), by: next.by } : null,
    note: next ? `It is the option in view now, and the input of ${label(after, next)}.` : 'Every stage of the plan is approved.',
  }
}
