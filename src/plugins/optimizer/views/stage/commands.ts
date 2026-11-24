// What the Stages panel and a stage's window do (Decisions "Stages layout", "Stage plan"), each one undo step through
// the host, the plan written in the project's data with what it changes:
//   ▶ Run          a new attempt on the stage's input, its run template; Specimens shows it, on the right. A run
//                  that varies the blocks' boxes asks first when a copy is past its range (Decision "Past the range by
//                  hand"): Run brings it back, in the same undo step as the attempt; Cancel runs nothing
//   Approve #23    the run's specimen kept as an option, "② Buildings · #23", the plan's; the app goes to it
//   Start by hand  a copy of the input (not linked), "② Buildings · by hand", to edit; Approve takes it as it is
//   Reopen         the approval goes, the approved stages after it to review again
//   Ask the agent  the stage's request in the Agent tab's message, for the designer to send
// The stages' tools (tools/stages.ts) press the same buttons, logged as the agent's. A stage picked shows its option:
// the one it approved, else its input.
import { create } from 'zustand'
import { actions, apply, askAgent, confirm, currentProject, pluginData, setActiveOption, showTabs, type LogBy, type Project } from '../../../host.ts'
import { OPTIMIZER, OptimizerDataSchema, planIn, savePlan, type OptimizerData } from '../../data.ts'
import { approve, inputOf, lastAttempt, reopen, runTemplateOf, startAttempt, statusOf, type Plan, type Stage } from '../../engine/stages.ts'
import type { Template } from '../../engine/template.ts'
import { useRun, type Run } from '../../run/store.ts'
import { projectOf } from '../specimens/decode.ts'
import { useSpecimenView } from '../specimens/viewState.ts'

/** What the Stages panel looks at: the stage picked (null: the plan's current one) and the stage the window edits. */
export const useStages = create<{ picked: string | null; editing: { plan: string; option: string; stage: string } | null }>()(() => ({
  picked: null,
  editing: null,
}))

/** ①, ②… a stage's number as the panel and its options name it. */
export const circled = (n: number) => (n >= 1 && n <= 20 ? String.fromCodePoint(0x2460 + n - 1) : `(${n})`)

export const dataOf = (p: Project): OptimizerData | null => pluginData(p, OPTIMIZER, OptimizerDataSchema)

/** The plan in a project now, by an option of it. */
const planNow = (p: Project, option: string): Plan | null => {
  const d = dataOf(p)
  return d ? planIn(d, option, p) : null
}

/** The project with this plan written, its other data kept. */
function withPlan(p: Project, plan: Plan): Project {
  const d = dataOf(p)
  return d ? actions.setPluginData(p, OPTIMIZER, savePlan(d, plan)) : p
}

/** A change of the plan (its stages, a stage's settings), one undo step. */
export function editPlan(option: string, f: (plan: Plan) => Plan) {
  apply((p) => {
    const plan = planNow(p, option)
    return plan ? withPlan(p, f(plan)) : p
  })
}

const numberOf = (plan: Plan, id: string) => plan.stages.findIndex((s) => s.id === id) + 1

/** The group a plan's options fold into, under the option it started from (Decision "Stage options"). */
export const STAGES_GROUP = 'Stages'

/** An option a stage made: named, and folded under the plan's option. */
const stageOption = (p: Project, id: string, plan: Plan, name: string) =>
  actions.setOptionGroup(actions.renameOption(p, id, name), id, { under: plan.option, name: STAGES_GROUP })

/** The run in the store, if it is this stage's last attempt. */
export function runOf(plan: Plan, stage: Stage): Run | null {
  const run = useRun.getState().run
  const at = stage.attempts.length - 1
  return run?.stage && run.stage.plan === plan.id && run.stage.stage === stage.id && run.stage.attempt === at ? run : null
}

/** The kind that varies the blocks' boxes (modules/warehouse/params.ts), and how far it searches one without a range. */
const HALL = 'warehouse.hall'

/**
 * The copies a stage's run would bring back to their range (Decision "Past the range by hand", RB.2): those its input
 * shows past their block's range, when its run varies the blocks' boxes; else none.
 */
export function pastBeforeRun(p: Project, option: string, stageId: string): ReturnType<typeof actions.pastRanges> {
  const plan = planNow(p, option)
  const input = plan && inputOf(plan, stageId)
  const v = plan && runTemplateOf(plan, stageId).variables.find((x) => x.kind === HALL)
  return input && v ? actions.pastRanges(p, input, v.range) : []
}

/** What the confirmation says: "2 copies are past their range: the optimizer brings them back to it (…)". */
export function pastText(past: { says: string }[]): string {
  const one = past.length === 1
  return `${one ? '1 copy is' : `${past.length} copies are`} past ${one ? 'its' : 'their'} range: the optimizer brings ${one ? 'it' : 'them'} back to it (${past.map((x) => x.says).join('; ')}).`
}

/**
 * ▶ Run: a new attempt, its run started on the stage's input; Specimens on the right. An agent's may run a budget of
 * its own (this attempt only). A copy past its range (`pastBeforeRun`) is asked about first, *Run* or *Cancel*; with
 * `backToRange` (Run picked, or the agent's) it is brought back to it in the attempt's undo step. Whether it started
 * now (false while it asks: Run starts it).
 */
export function runStage(option: string, stageId: string, { budget, by, backToRange = false }: { budget?: Partial<Template['budget']>; by?: LogBy; backToRange?: boolean } = {}): boolean {
  const past = pastBeforeRun(currentProject(), option, stageId)
  if (past.length && !backToRange) {
    if (by !== 'agent') confirm(pastText(past), () => void runStage(option, stageId, { budget, by, backToRange: true }), 'Run')
    return false
  }
  let started: { plan: Plan; input: string; template: Template } | null = null
  apply((p) => {
    const plan = planNow(p, option)
    const next = plan && startAttempt(plan, stageId, undefined, budget)
    if (!next) return p
    const input = inputOf(next, stageId)!
    const template = lastAttempt(next, stageId)!.template
    started = { plan: next, input, template }
    const v = template.variables.find((x) => x.kind === HALL)
    const back = backToRange && v ? actions.bringToRange(p, input, v.range) : p
    return withPlan(back, next)
  }, by)
  if (!started) return false
  const { plan, input, template } = started as { plan: Plan; input: string; template: Template }
  const attempt = plan.stages.find((s) => s.id === stageId)!.attempts.length - 1
  useSpecimenView.getState().set({ picked: null, held: false })
  useRun.getState().start(currentProject(), input, template, { plan: plan.id, stage: stageId, attempt })
  showTabs(OPTIMIZER, { right: 'specimens' })
  return true
}

/** Approve the run's specimen: kept as an option of the plan (the later approved stages to review again); the app goes to it. */
export async function approveSpecimen(option: string, stageId: string, specimen: number, by: LogBy = 'optimizer'): Promise<string | null> {
  const run = useRun.getState().run
  const s = run?.specimens.find((x) => x.id === specimen)
  if (!run || !s) return null
  const from = await projectOf(run, specimen, s.genome)
  if (!from) return null
  let made: string | null = null
  apply((p) => {
    const plan = planNow(p, option)
    const stage = plan?.stages.find((x) => x.id === stageId)
    const r = plan && stage ? actions.importOption(p, from, run.optionId, `#${specimen}`) : null
    if (!r || !plan || !stage) return p
    made = r.id
    const named = stageOption(r.project, r.id, plan, `${circled(numberOf(plan, stageId))} ${stage.name} · #${specimen}`)
    return withPlan(named, approve(plan, stageId, r.id, specimen))
  }, by)
  if (made === null) return null
  useRun.getState().keep(specimen, made)
  setActiveOption(made)
  return made
}

/** By hand (the designer's, or the agent's): a copy of the input to edit, the stage's attempt; the app goes to it. */
export function startByHand(option: string, stageId: string, by?: LogBy): string | null {
  let made: string | null = null
  apply((p) => {
    const plan = planNow(p, option)
    const input = plan && inputOf(plan, stageId)
    const stage = plan?.stages.find((x) => x.id === stageId)
    const r = plan && input && stage ? actions.importOption(p, p, input, 'by hand') : null
    if (!r || !plan || !stage) return p
    made = r.id
    const named = stageOption(r.project, r.id, plan, `${circled(numberOf(plan, stageId))} ${stage.name} · ${by === 'agent' ? 'by the agent' : 'by hand'}`)
    return withPlan(named, startAttempt(plan, stageId, r.id)!)
  }, by)
  if (made !== null) setActiveOption(made)
  return made
}

/** Approve the option worked by hand, as it is: the one approved, or null. */
export function approveByHand(option: string, stageId: string, by?: LogBy): string | null {
  let made: string | null = null
  apply((p) => {
    const plan = planNow(p, option)
    const worked = plan && lastAttempt(plan, stageId)?.worked
    if (!plan || !worked || !p.options.some((o) => o.id === worked)) return p
    made = worked
    return withPlan(p, approve(plan, stageId, worked))
  }, by)
  return made
}

/** Reopen: the approval goes; the app goes to the stage's input (the option it approved is not the plan's any more). */
export function reopenStage(option: string, stageId: string) {
  let input: string | null = null
  apply((p) => {
    const plan = planNow(p, option)
    if (!plan) return p
    input = inputOf(plan, stageId)
    return withPlan(p, reopen(plan, stageId))
  })
  if (input !== null) setActiveOption(input)
}

/** The plan starts over (from a plan template); the app goes to the option it started from. */
export function replacePlan(option: string, f: (plan: Plan) => Plan) {
  let from: string | null = null
  apply((p) => {
    const plan = planNow(p, option)
    if (!plan) return p
    from = plan.option
    return withPlan(p, f(plan))
  })
  if (from !== null) setActiveOption(from)
}

/** The option a stage shows when picked: the one it approved, else the one it works by hand, else its input. */
export function optionOfStage(plan: Plan, stage: Stage, p: Project): string | null {
  const ids = [stage.approved?.option, statusOf(plan, stage.id) === 'review' ? lastAttempt(plan, stage.id)?.worked : undefined, inputOf(plan, stage.id)]
  return ids.find((id): id is string => !!id && p.options.some((o) => o.id === id)) ?? null
}

/** A stage's parameters as a template of the project's own, to start other stages from. */
export function saveAsTemplate(t: Template, name: string) {
  apply((p) => {
    const d = dataOf(p)
    if (!d) return p
    let n = 1
    while (d.templates.some((x) => x.id === `user-${n}`)) n++
    const copy: Template = { ...structuredClone(t), id: `user-${n}`, name, from: 'user', variables: t.variables.filter((v) => v.margin === undefined) }
    return actions.setPluginData(p, OPTIMIZER, { ...d, templates: [...d.templates, copy] })
  })
}

/** What *Ask the agent* writes in the Agent tab's message: the stage, its aim, and how (the stages' tools). */
export function agentRequest(p: Project, plan: Plan, stage: Stage): string {
  const on = p.options.find((o) => o.id === plan.option)?.name ?? plan.option
  const aim = stage.aim?.trim() || 'its objectives (getStages lists them)'
  return `Work stage ${circled(numberOf(plan, stage.id))} ${stage.name} (${stage.id}) of the plan on ${on}. Its aim: ${aim}. Read it with getStages, work it with runStage, check it with evaluateStage, and approve it with approveStage when it holds every must-hold; then tell me what you approved and why.`
}

/** *Ask the agent*: the stage's request in the Agent tab, for the designer to send; false when no agent is on. */
export const askAgentFor = (p: Project, plan: Plan, stage: Stage): boolean => askAgent(agentRequest(p, plan, stage))
