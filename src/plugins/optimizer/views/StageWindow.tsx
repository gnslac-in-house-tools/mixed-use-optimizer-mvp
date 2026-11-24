// A stage's window (Decision "Stages layout"), over the app as the Brief and Rules: its parameters need no viewport.
// It edits a draft of the stage; *Save* writes it (one undo step), *Cancel*, ✕ or Escape let it go.
//   head   its name, who works it (the optimizer, the agent, by hand), the template it came from
//   left   What may change
//   right  Objectives (the agent: its aim, typed), Must hold
//   foot   ⋯ · Save · ▶ Run (by hand: Start by hand; the agent: Ask the agent, its request in the Agent tab, to send)
//   ⋯      a disclosure inside the window, above the foot, closed whenever the window opens: Margin over earlier stages,
//          Budget (the optimizer's), Save as template and Cancel (Escape and ✕ cancel too). It is not a popup menu:
//          Margin and Budget hold fields (Decision "Stage window footer")
import { useMemo, useState } from 'react'
import { CellField } from '../../../views/controls/fields.tsx'
import { Icon } from '../../../views/controls/Icon.tsx'
import { closeWindow, notify, useProject } from '../../host.ts'
import { OPTIMIZER, OptimizerDataSchema, planIn } from '../data.ts'
import { editStage, inputOf, marginsOf, runTemplateOf, type Stage } from '../engine/stages.ts'
import { usePluginData } from '../../host.ts'
import { useRun } from '../run/store.ts'
import { MainButton } from './button.tsx'
import { selectClass } from './kit.ts'
import { askAgentFor, circled, editPlan, runStage, saveAsTemplate, startByHand, useStages } from './stage/commands.ts'
import { Budget, Margin, MayChange, MustHold, Objectives, Small, useSummary, type Edit } from './stage/sections.tsx'
import { t as tr } from '../../../i18n/idioma.ts' // mixed-use-mvp

type Draft = Pick<Stage, 'name' | 'by' | 'aim' | 'template' | 'margin'>

const BY: { key: Stage['by']; label: string }[] = [
  { key: 'optimizer', label: 'Optimizer' },
  { key: 'agent', label: 'Agent' },
  { key: 'hand', label: 'By hand' },
]

export default function StageWindow() {
  const editing = useStages((s) => s.editing)
  const data = usePluginData(OPTIMIZER, OptimizerDataSchema)
  const project = useProject()
  const plan = data && editing ? planIn(data, editing.option, project) : null
  const stage = plan?.stages.find((s) => s.id === editing?.stage)
  if (!editing || !plan || !stage) return <p className="panel h-full p-panel-pad text-caption text-ink-secondary">{tr("This stage is not in the plan any more.")}</p>
  return <Window key={`${plan.id}/${stage.id}`} option={editing.option} plan={plan} stage={stage} />
}

function Window({ option, plan, stage }: { option: string; plan: ReturnType<typeof planIn>; stage: Stage }) {
  const project = useProject()
  // the kinds the stage moves, as it was saved: read when the window opens, so unticking one keeps its row
  const [ownKinds] = useState(() => stage.template.variables.filter((v) => v.margin === undefined).map((v) => v.kind))
  const [more, setMore] = useState(false)
  const [draft, setDraft] = useState<Draft>(() => ({ name: stage.name, by: stage.by, aim: stage.aim, template: structuredClone(stage.template), margin: stage.margin }))
  const edit: Edit = (f) => setDraft((d) => ({ ...d, template: f(d.template) }))
  const n = plan.stages.findIndex((s) => s.id === stage.id) + 1
  // its figures on the option it runs on (the nearest earlier approved stage's, else the plan's own)
  const input = inputOf(plan, stage.id) ?? plan.option
  const drafted = useMemo(() => editStage(plan, stage.id, draft), [plan, stage.id, draft])
  const margins = marginsOf(drafted, stage.id)
  const { measures, aimable, kinds, summary } = useSummary(project, input, runTemplateOf(drafted, stage.id))
  // the areas of the kinds the stage moves: *+ Objective* offers from those first
  const first = [...new Set(kinds.filter((k) => ownKinds.includes(k.id)).map((k) => k.area))]
  const run = useRun((s) => s.run)
  const rate = run && run.specimens.length > 0 ? run.elapsed / run.specimens.length : summary.ms
  const own = summary.variables.filter((v) => draft.template.variables.some((x) => x.kind === v.kind && x.margin === undefined)).length
  const busy = run?.status === 'running'

  const save = () => editPlan(option, (p) => editStage(p, stage.id, draft))
  const close = () => closeWindow(OPTIMIZER)
  const setMargin = (kind: string, steps: number) => setDraft((d) => ({ ...d, margin: { ...d.margin, [kind]: steps } }))

  return (
    <div className="panel flex h-full min-h-0 flex-col gap-3 p-panel-pad">
      <header className="flex flex-wrap items-center gap-3 pr-10">
        <h2 className="text-headline" aria-label={`Stage ${n}`}>
          {circled(n)}
        </h2>
        <span className="w-[14rem]">
          <CellField label="Stage name" value={draft.name} onCommit={(v) => v.trim() && setDraft((d) => ({ ...d, name: v.trim() }))} />
        </span>
        <label className="flex items-center gap-1.5 text-label text-ink-secondary">
          by
          <select aria-label="Who works it" className={selectClass} value={draft.by} onChange={(e) => setDraft((d) => ({ ...d, by: e.target.value as Stage['by'] }))}>
            {BY.map((b) => (
              <option key={b.key} value={b.key}>
                {b.label}
              </option>
            ))}
          </select>
        </label>
        <span className="text-caption text-ink-tertiary">from {stage.template.name}</span>
      </header>
      <div className="grid min-h-0 flex-1 grid-cols-2 gap-6 overflow-y-auto phone:grid-cols-1">
        <div className="flex flex-col gap-5">
          {draft.by !== 'hand' ? (
            <MayChange template={draft.template} edit={edit} summary={summary} kinds={kinds} own={ownKinds} />
          ) : (
            <p className="text-caption text-ink-secondary">{tr("By hand: you edit a copy of the stage before’s option, then approve it. What it must hold and how far it may move earlier stages are still checked.")}</p>
          )}
        </div>
        <div className="flex flex-col gap-5">
          {draft.by === 'optimizer' && <Objectives template={draft.template} edit={edit} measures={measures} aimable={aimable} first={first} figures={summary.figures} />}
          {draft.by === 'agent' && (
            <section aria-label="Aim" className="flex flex-col gap-1.5">
              <h2 className="text-label text-ink-secondary">{tr("What the agent is asked for")}</h2>
              <textarea
                aria-label="The agent’s aim"
                rows={3}
                className="select-text rounded-control border border-separator bg-panel-sunken p-2 text-body text-ink outline-none focus:border-ink"
                value={draft.aim ?? ''}
                onChange={(e) => setDraft((d) => ({ ...d, aim: e.target.value }))}
              />
            </section>
          )}
          <MustHold template={draft.template} edit={edit} measures={measures} figures={summary.figures} />
        </div>
      </div>
      {more && (
        <div id="stage-more" className="flex max-h-[40%] shrink-0 flex-col gap-3 overflow-y-auto border-t border-separator pt-3">
          <div className="grid grid-cols-2 gap-6 phone:grid-cols-1">
            <Margin margins={margins} set={setMargin} />
            {draft.by === 'optimizer' && <Budget template={draft.template} edit={edit} ms={rate} />}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Small title={tr("These parameters as a template of the project’s, to start other stages from")} onClick={() => saveAsTemplate(draft.template, `${draft.name} template`)}>
              {tr("Save as template")}
            </Small>
            <Small title={tr("Close without saving (Esc)")} onClick={close}>
              {tr("Cancel")}
            </Small>
          </div>
        </div>
      )}
      <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-separator pt-3">
        <button
          type="button"
          aria-label="More"
          aria-expanded={more}
          aria-controls="stage-more"
          title={more ? 'Fold: Margin over earlier stages, Budget, Save as template, Cancel' : 'Margin over earlier stages, Budget, Save as template, Cancel'}
          onClick={() => setMore((o) => !o)}
          className="pressable grid h-row w-9 shrink-0 place-items-center rounded-control bg-fill text-ink hover:bg-hover"
        >
          <Icon name="more" className="h-5 w-5" />
        </button>
        <span className="flex-1" />
        <Small
          title={tr("Keep these parameters")}
          onClick={() => {
            save()
            close()
          }}
        >
          {tr("Save")}
        </Small>
        {draft.by === 'optimizer' && (
          <MainButton
            disabled={own === 0 || busy}
            title={own === 0 ? 'Nothing may change: tick what the search may move' : busy ? 'A run is going: stop it first' : 'Save and run this stage'}
            onClick={() => {
              save()
              close()
              runStage(option, stage.id)
            }}
          >
            <span aria-hidden>▶</span> {tr("Run")}
          </MainButton>
        )}
        {draft.by === 'hand' && (
          <MainButton
            title={tr("Save, and edit a copy of the option it runs on")}
            onClick={() => {
              save()
              close()
              startByHand(option, stage.id)
            }}
          >
            {tr("Start by hand")}
          </MainButton>
        )}
        {draft.by === 'agent' && (
          <MainButton
            title={tr("Save, and write its request in the Agent tab, to send: it works it with the stages’ tools")}
            onClick={() => {
              save()
              close()
              if (!askAgentFor(project, drafted, drafted.stages.find((s) => s.id === stage.id)!)) notify('error', 'The Agent is off in this browser: View → Plugins turns it on.')
            }}
          >
            {tr("Ask the agent")}
          </MainButton>
        )}
      </footer>
    </div>
  )
}
