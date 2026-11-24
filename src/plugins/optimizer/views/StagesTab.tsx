// The Stages panel (Decisions "Stages layout", "Plugins' sides"): the plan, where you are in it, and the decision. Left
// of the viewport while the optimizer is open, Specimens right of it (⤢: wide under it). A single run is a plan of one stage.
//   off         what the optimizer does, Turn on for this project
//   the plan    the active option's, seed to leaf: each stage its number, name, status (○ to do · running · ● to review ·
//               ✓ approved · ! to review again) and who works it; a click picks it, and the viewport goes to its option
//   picked      its attempts, its run or its pick (its last run back from this browser), its review (the pick, the
//               option worked by hand or the one approved, against its input: stage/Review.tsx), and by its status
//               ▶ Run · Ask the agent (its request in the Agent tab) · Approve · Redo · Reopen · Edit… (its window); an
//               attempt worked by editing (by hand, or by the agent) is reviewed as the option it made; its menu: duplicate, move up or down, remove; a
//               stage dragged onto another takes its place
//   head        the plan template the plan comes from, a drop-down (the typology's by default, or one saved; another
//               starts the plan over from it, asking first when a stage ran); + saves the plan as a template of your
//               own (its stages, nothing run); × beside a saved one removes it (Decision "Plan template drop-down")
//   + Stage     from a template (the project's, the typology's stages)
import { useEffect, useMemo, useState } from 'react'
import { MoreMenu, type MenuItem } from '../../../views/controls/MoreMenu.tsx'
import { whole } from '../../../views/format.ts'
import { confirm, currentProject, notify, setActiveOption, setPluginData, showTabs, showWindow, useActiveOption, usePluginData, useProject, useWideScreen } from '../../host.ts'
import { OPTIMIZER, OptimizerDataSchema, planIn, planTemplatesOf, removePlanTemplate, savePlan, savePlanTemplate, stagesFor, turnOn, withTypology, type OptimizerData } from '../data.ts'
import { addStage, currentOf, duplicateStage, feederOf, inputOf, massesStageBefore, moveStage, planFrom, removeStage, statusOf, type Plan, type PlanTemplate, type Stage, type StageStatus } from '../engine/stages.ts'
import type { Template } from '../engine/template.ts'
import { restoreStageRun } from '../run/lastRun.ts'
import { progressOf, useRun } from '../run/store.ts'
import { MainButton } from './button.tsx'
import { selectClass } from './kit.ts'
import { useSpecimenView } from './specimens/viewState.ts'
import { approveByHand, approveSpecimen, askAgentFor, circled, editPlan, optionOfStage, reopenStage, replacePlan, runOf, runStage, startByHand, useStages } from './stage/commands.ts'
import { Review, useSpecimenProject, type Back } from './stage/Review.tsx'
import { Small } from './stage/sections.tsx'

export default function StagesTab() {
  const saved = usePluginData(OPTIMIZER, OptimizerDataSchema)
  const typology = useProject().typology
  // a template the typology gained since the project turned it on is offered too (written with the next change)
  const data = useMemo(() => (saved ? withTypology(saved, typology) : null), [saved, typology])
  return data?.on ? <Stages data={data} /> : <About data={data} />
}

function About({ data }: { data: OptimizerData | null }) {
  const project = useProject()
  return (
    <section aria-label="About the optimizer" className="flex flex-col gap-3 rounded-control bg-panel-sunken p-3">
      <h2 className="text-headline text-ink">Search layouts of your masses</h2>
      <p className="text-body text-ink">Tries thousands of arrangements within your brief and rules, and keeps the best, one stage at a time.</p>
      <p className="text-caption text-ink-secondary">
        Your design never changes: each specimen you keep becomes a new option, and yours stays as it is. A run goes on in
        the background while you work.
      </p>
      <span data-tour="optimizer-on" className="contents">
        <MainButton onClick={() => setPluginData(OPTIMIZER, turnOn(project.typology, data))}>Turn on for this project</MainButton>
      </span>
    </section>
  )
}

const GLYPH: Record<StageStatus | 'running', string> = { todo: '○', running: '◐', review: '●', approved: '✓', again: '!' }
const STATUS: Record<StageStatus | 'running', string> = { todo: 'to do', running: 'running', review: 'to review', approved: 'approved', again: 'to review again' }
const BY: Record<Stage['by'], string> = { optimizer: 'Optimizer', agent: 'Agent', hand: 'By hand' }

/** The stage being dragged (HTML drag data cannot be read during dragover in every browser). */
let dragging: string | null = null

function Stages({ data }: { data: OptimizerData }) {
  const option = useActiveOption()
  // the typology's plan, or the one it gives a module that is on (a warehouse type's: Decision "Warehouse type")
  const project = useProject()
  const plan = planIn(data, option, project)
  const pickedId = useStages((s) => s.picked)
  const picked = plan.stages.find((s) => s.id === pickedId) ?? currentOf(plan) ?? plan.stages.at(-1)!
  const run = useRun((s) => s.run)
  const running = run?.status === 'running' && run.stage?.plan === plan.id ? run.stage.stage : null
  const wide = useWideScreen()
  const templates: Template[] = [...data.templates, ...stagesFor(project)]
  // the stage a drag is over: dropped there, the dragged one takes its place
  const [over, setOver] = useState<string | null>(null)

  const pick = (s: Stage) => {
    useStages.setState({ picked: s.id })
    const to = optionOfStage(plan, s, currentProject())
    if (to && to !== option) setActiveOption(to)
  }
  const ran = plan.stages.some((s) => s.attempts.length > 0)
  const plans = planTemplatesOf(data, project)
  // the template the plan comes from (none: one stored before plans said so, or one whose template was removed)
  const from = plans.find((t) => t.id === plan.from) ?? null
  const use = (t: PlanTemplate) => {
    const go = () => replacePlan(option, (p) => planFrom(p.option, t))
    const what = t.from === 'typology' ? 'the typology’s plan' : t.name
    if (ran) confirm(`Start over with ${what}? These stages and their attempts go (Ctrl+Z brings them back).`, go)
    else go()
  }
  // saved, the plan comes from it: one undo step
  const save = () => {
    const saved = savePlanTemplate(data, plan)
    const t = saved.planTemplates!.at(-1)!
    setPluginData(OPTIMIZER, savePlan(saved, { ...plan, from: t.id }))
    notify('info', `Saved as a plan template: ${t.name}.`)
  }

  return (
    <section aria-label="Stages" className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <select
          aria-label="Plan template"
          title="The plan template this plan comes from: another starts the plan over from it"
          className={`min-w-0 flex-1 ${selectClass}`}
          value={from?.id ?? ''}
          onChange={(e) => {
            const t = plans.find((x) => x.id === e.target.value)
            if (t) use(t)
          }}
        >
          {!from && (
            <option value="" disabled>
              A plan of its own
            </option>
          )}
          {plans.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        {from?.from === 'user' && (
          <Small label="Remove plan template" title={`Remove the plan template ${from.name} (this plan stays as it is)`} onClick={() => setPluginData(OPTIMIZER, removePlanTemplate(data, from.id))}>
            ×
          </Small>
        )}
        <Small label="Save plan as template" title="Save this plan as a template of your own" onClick={save}>
          +
        </Small>
        {!wide && (
          <Small title="The run’s specimens" onClick={() => showTabs(OPTIMIZER, { right: 'specimens' })}>
            Specimens
          </Small>
        )}
      </div>
      <p className="text-caption text-ink-secondary">Seed to leaf, any stage in any order: each runs on the nearest approved one before it.</p>
      <ol aria-label="The plan" className="flex flex-col">
        {plan.stages.map((s, i) => {
          const status: StageStatus | 'running' = running === s.id ? 'running' : statusOf(plan, s.id)
          const open = s.id === picked.id
          return (
            <li
              key={s.id}
              draggable
              onDragStart={(e) => {
                dragging = s.id
                e.dataTransfer.effectAllowed = 'move'
              }}
              onDragOver={(e) => {
                if (dragging === null || dragging === s.id) return
                e.preventDefault()
                setOver(s.id)
              }}
              onDragLeave={() => setOver((o) => (o === s.id ? null : o))}
              onDrop={(e) => {
                const from = dragging
                dragging = null
                setOver(null)
                if (from === null || from === s.id) return
                e.preventDefault()
                editPlan(option, (p) => moveStage(p, from, i))
              }}
              onDragEnd={() => {
                dragging = null
                setOver(null)
              }}
              className={`flex flex-col gap-2 border-l-2 py-1.5 pl-3 ${open ? 'border-ink' : 'border-separator'} ${over === s.id ? 'rounded-control ring-2 ring-inset ring-ink' : ''}`}
            >
              <button
                type="button"
                aria-current={open ? 'step' : undefined}
                aria-label={`${circled(i + 1)} ${s.name}, ${STATUS[status]}`}
                onClick={() => pick(s)}
                className="pressable flex items-center gap-2 rounded-control px-1 py-0.5 text-left hover:bg-hover"
              >
                <span aria-hidden className={`w-4 shrink-0 text-center text-label ${status === 'again' ? 'text-status-over' : status === 'approved' ? 'text-status-within' : 'text-ink-secondary'}`}>
                  {GLYPH[status]}
                </span>
                <span className={`min-w-0 flex-1 truncate text-label ${open ? 'font-semibold text-ink' : 'text-ink'}`}>
                  {circled(i + 1)} {s.name}
                </span>
                <span className="shrink-0 text-caption text-ink-tertiary">{STATUS[status]}</span>
              </button>
              {open && <Picked option={option} plan={plan} stage={s} status={status} index={i} />}
            </li>
          )
        })}
      </ol>
      <select
        aria-label="Add a stage"
        className={selectClass}
        value=""
        onChange={(e) => {
          const t = templates.find((x) => x.id === e.target.value)
          if (t) editPlan(option, (p) => addStage(p, t))
        }}
      >
        <option value="">+ Stage</option>
        {templates.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
    </section>
  )
}

/** The picked stage, opened in place: its attempts, its run or pick, and what can be done with it now. */
function Picked({ option, plan, stage, status, index }: { option: string; plan: Plan; stage: Stage; status: StageStatus | 'running'; index: number }) {
  const project = useProject()
  const pick = useSpecimenView((s) => s.picked)
  const run = useRun((s) => s.run)
  const own = runOf(plan, stage)
  // its last run back from this browser, when another is in the tabs and none goes
  const [looked, setLooked] = useState<string | null>(null)
  const attempt = stage.attempts.length - 1
  const wanted = `${plan.id}/${stage.id}/${attempt}`
  const last = stage.attempts.at(-1)
  // worked by editing (by hand, or by the agent): reviewed as the option it made, not as a run
  const edited = !!last?.worked
  const missing = status === 'review' && !edited && stage.by !== 'hand' && !own && attempt >= 0
  useEffect(() => {
    if (!missing || useRun.getState().run?.status === 'running') return
    let live = true
    void restoreStageRun({ plan: plan.id, stage: stage.id, attempt }).then(() => live && setLooked(wanted))
    return () => {
      live = false
    }
  }, [missing, plan.id, stage.id, attempt, wanted])
  const edit = () => {
    useStages.setState({ editing: { plan: plan.id, option, stage: stage.id } })
    showWindow(OPTIMIZER, 'stage')
  }
  const worked = last?.worked && project.options.find((o) => o.id === last.worked)
  const before = index > 0 ? plan.stages[index - 1] : null
  // what it runs on (Decision "Free steps"): the nearest earlier approved stage's, else the plan's own
  const feeder = feederOf(plan, stage.id)
  const skips = before !== null && !before.approved
  const start = project.options.find((o) => o.id === plan.option)?.name ?? 'its input'
  // the review: against the input
  const against = feeder ? `${circled(plan.stages.indexOf(feeder) + 1)} ${feeder.name}` : start
  // the way back to Massing (7.5): the last stage before that moved the masses, when it is approved
  const masses = massesStageBefore(plan, stage.id)
  const back: Back | null = masses?.approved ? { label: `${circled(plan.stages.indexOf(masses) + 1)} ${masses.name}`, reopen: () => reopenStage(option, masses.id) } : null
  const picked = useSpecimenProject(own, status === 'review' ? pick : null)
  const input = inputOf(plan, stage.id)
  const has = (id: string | null | undefined): id is string => !!id && project.options.some((o) => o.id === id)
  const kept = stage.approved ? stage.approved.option : status === 'review' && edited ? last?.worked : undefined
  const keptTemplate = (stage.approved ? stage.attempts[stage.approved.attempt] : last)?.template ?? stage.template
  const keptReview = has(kept) && has(input) && (
    <Review
      before={{ project, option: input }}
      after={{ project, option: kept }}
      template={keptTemplate}
      back={back}
      title={`${project.options.find((o) => o.id === kept)!.name} against ${against}`}
    />
  )
  const items: MenuItem[] = [
    { key: 'duplicate', label: 'Duplicate', onSelect: () => editPlan(option, (p) => duplicateStage(p, stage.id)) },
    { key: 'up', label: 'Move up', disabled: index === 0, onSelect: () => editPlan(option, (p) => moveStage(p, stage.id, index - 1)) },
    { key: 'down', label: 'Move down', disabled: index === plan.stages.length - 1, onSelect: () => editPlan(option, (p) => moveStage(p, stage.id, index + 1)) },
    {
      key: 'remove',
      label: 'Remove',
      disabled: plan.stages.length < 2,
      onSelect: () => {
        const go = () => editPlan(option, (p) => removeStage(p, stage.id))
        if (stage.attempts.length) confirm(`Remove ${stage.name} and its attempts? (Ctrl+Z brings it back)`, go)
        else go()
      },
    },
  ]

  return (
    <div className="flex flex-col gap-2 pl-6">
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 truncate text-caption text-ink-secondary">
          {BY[stage.by]} · from {stage.template.name}
          {stage.attempts.length > 0 && ` · attempt ${stage.attempts.length}`}
        </p>
        <MoreMenu items={items} compact align="right" />
      </div>
      {skips && <p className="text-caption text-ink-secondary">Runs on {against}{feeder ? '’s approved option' : ''}: {circled(index)} {before!.name} is not approved yet.</p>}
      {status === 'running' && run && (
        <MainButton filled={false} progress={progressOf(run)} title="Stop after the specimens evaluated so far: Resume goes on" onClick={() => useRun.getState().stop()}>
          <span aria-hidden>■</span> Stop · <span className="tabular-nums">{Math.round(progressOf(run) * 100)} %</span>
        </MainButton>
      )}
      {status === 'review' && !edited && stage.by !== 'hand' && (
        <>
          {own ? (
            <p className="text-caption text-ink-secondary">
              {own.status === 'stopped' ? 'Stopped' : 'Done'}: {whole(own.specimens.length)} specimens, {whole(own.front.length)} on the front.{' '}
              {pick === null ? 'Pick one in Specimens to approve it.' : `Picked #${pick}.`}
            </p>
          ) : run?.status === 'running' ? (
            <p className="text-caption text-ink-secondary">Another stage is running: its run comes back here when that one ends.</p>
          ) : looked === wanted ? (
            <p className="text-caption text-ink-secondary">Its run is not in this browser: Redo runs it again (its seed repeats it).</p>
          ) : (
            <p className="text-caption text-ink-secondary">Looking for its run…</p>
          )}
          {own && pick !== null && picked && (
            <Review before={{ project: own.base, option: own.optionId }} after={{ project: picked, option: own.optionId }} template={own.template} title={`#${pick} against ${against}`} back={back} />
          )}
          <div className="flex flex-wrap gap-2">
            {own?.status === 'stopped' && (
              <Small title="Go on from where it stopped" onClick={() => useRun.getState().resume()}>
                ▶ Resume
              </Small>
            )}
            <MainButton
              disabled={!own || pick === null}
              title={!own ? 'Its run is not in this browser' : pick === null ? 'Pick a specimen in Specimens first' : 'Keep this specimen as the stage’s option; the next stage opens'}
              onClick={() => pick !== null && void approveSpecimen(option, stage.id, pick)}
            >
              {pick === null ? 'Approve' : `Approve #${pick}`}
            </MainButton>
            <Small title="Change its parameters or its seed and run it again" onClick={edit}>
              Redo
            </Small>
          </div>
        </>
      )}
      {status === 'review' && (edited || stage.by === 'hand') && (
        <>
          <p className="text-caption text-ink-secondary">
            {!worked ? 'The option worked on is not in the project any more.' : stage.by === 'agent' ? `The agent works on ${worked.name}: approve it as it is when it is ready.` : `You work on ${worked.name}: approve it as it is when it is ready.`}
          </p>
          {keptReview}
          <div className="flex flex-wrap gap-2">
            <MainButton disabled={!worked} title="Take that option as this stage’s; the later approved stages to review again" onClick={() => approveByHand(option, stage.id)}>
              Approve
            </MainButton>
            <Small title="Change its settings" onClick={edit}>
              Edit…
            </Small>
          </div>
        </>
      )}
      {status === 'todo' && (
        <div className="flex flex-wrap gap-2">
          {stage.by === 'optimizer' && (
            <MainButton
              disabled={run?.status === 'running'}
              title={run?.status === 'running' ? 'A run is going: stop it first' : 'Search with this stage’s parameters'}
              onClick={() => runStage(option, stage.id)}
            >
              <span aria-hidden>▶</span> Run
            </MainButton>
          )}
          {stage.by === 'hand' && (
            <MainButton title="Edit a copy of the option it runs on, then approve it" onClick={() => startByHand(option, stage.id)}>
              Start by hand
            </MainButton>
          )}
          {stage.by === 'agent' && (
            <MainButton
              title="Write this stage’s request in the Agent tab, to send: it works it with the stages’ tools"
              onClick={() => askAgentFor(project, plan, stage) || notify('error', 'The Agent is off in this browser: View → Plugins turns it on.')}
            >
              Ask the agent
            </MainButton>
          )}
          <Small title="Its parameters, in a window" onClick={edit}>
            Edit…
          </Small>
        </div>
      )}
      {(status === 'approved' || status === 'again') && (
        <>
          <p className={`text-caption ${status === 'again' ? 'text-status-over' : 'text-ink-secondary'}`}>
            {status === 'again' ? 'An earlier stage changed after this one was approved: reopen it to run it on the new one.' : `Approved as ${project.options.find((o) => o.id === stage.approved?.option)?.name ?? 'an option no longer here'}.`}
          </p>
          {keptReview}
          <div className="flex flex-wrap gap-2">
            <Small
              title="Take the approval back: the approved stages after it go to review again"
              onClick={() => reopenStage(option, stage.id)}
            >
              Reopen
            </Small>
            <Small title="Its parameters, in a window" onClick={edit}>
              Edit…
            </Small>
          </div>
        </>
      )}
    </div>
  )
}
