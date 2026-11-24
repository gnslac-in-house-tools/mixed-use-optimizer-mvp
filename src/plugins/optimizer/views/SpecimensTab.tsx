// The Specimens tab (Decisions "Optimizer layout" and "Specimens tab"): the run, how far it is, Stop / Resume and ⤢;
// the scatter of two objectives; the parallel coordinates (a range dragged on an axis filters); the list. One click
// picks a specimen in all three. In the panel they stand one under the other; ⤢ puts them side by side under the
// viewport, as the Rules list, and the panel only says where they went (Escape, or ⤡, brings them back). The one
// picked stands in the viewport, read only; while the run goes, what *While running* says (specimens/preview.ts).
// A specimen kept becomes an option; *Discard run*, last, lets the run go (specimens/keep.ts).
import { useMemo } from 'react'
import { Icon } from '../../../views/controls/Icon.tsx'
import { Segmented } from '../../../views/controls/Segmented.tsx'
import { whole } from '../../../views/format.ts'
import type { PluginTabProps } from '../../types.ts'
import { showTabs, usePluginData, useProject, useWideScreen } from '../../host.ts'
import { OPTIMIZER, OptimizerDataSchema } from '../data.ts'
import { circled } from './stage/commands.ts'
import '../run/lastRun.ts'
import { progressOf, useRun, type Run, type RunStatus } from '../run/store.ts'
import { clock } from './kit.ts'
import { Lines } from './specimens/Lines.tsx'
import { discard } from './specimens/keep.ts'
import { axisOf, defaultAxes, kneeOf, rowsOf, shownOf } from './specimens/rows.ts'
import { Scatter } from './specimens/Scatter.tsx'
import { SpecimenList } from './specimens/SpecimenList.tsx'
import { useSpecimenView, type Follow } from './specimens/viewState.ts'
// a pick shows the specimen in the viewport (Decision "Specimen preview")
import './specimens/preview.ts'
import { t as tr } from '../../../i18n/idioma.ts' // mixed-use-mvp

/** What the viewport shows while a run goes (Galapagos' display modes; Decision "Following a run"). */
const FOLLOW: { key: Follow; label: string; title: string }[] = [
  { key: 'all', label: 'All', title: 'Every specimen as it is tried, about ten a second' },
  { key: 'best', label: 'Best', title: 'The front’s most balanced (★), each generation' },
  { key: 'none', label: 'None', title: 'Your design: pick a specimen to see it' },
]

const STATUS: Record<RunStatus, string> = { running: 'Running', stopped: 'Stopped', done: 'Done', error: 'Stopped by an error' }

// ⤢ and ⤡ on the 16 × 16 grid
const WIDEN = 'M9.75 2.75h3.5v3.5M13.25 2.75 9 7M6.25 13.25h-3.5v-3.5M2.75 13.25 7 9'
const NARROW = 'M12.75 7.25h-3.5v-3.5M9.25 7.25l4-4M3.25 8.75h3.5v3.5M6.75 8.75l-4 4'

export default function SpecimensTab({ wide, away, setWide, folded, setFolded }: PluginTabProps) {
  const run = useRun((s) => s.run)
  if (away)
    return (
      <section aria-label="Specimens" className="flex flex-col items-start gap-2">
        <p className="text-caption text-ink-secondary">{tr("The specimens stand under the viewport, wide.")}</p>
        <button type="button" onClick={() => setWide?.(false)} className="pressable h-row rounded-control bg-fill px-3 text-label text-ink hover:bg-hover">
          {tr("Back to this panel")}
        </button>
      </section>
    )
  if (!run)
    return (
      <section aria-label="Specimens" className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          {!wide && <BackToStages />}
          <p className="min-w-0 flex-1 text-caption text-ink-secondary">
            No run yet: ▶ Run a stage in Stages. Its specimens show here as they are found: the best on its front, each one against the stage’s input.
          </p>
          <Fold folded={folded} setFolded={setFolded} />
        </div>
      </section>
    )
  if (folded) return <Status run={run} wide={wide} setWide={setWide} folded setFolded={setFolded} />
  return <Specimens run={run} wide={wide} setWide={setWide} setFolded={setFolded} />
}

/** On a narrow screen, where Specimens is a sheet of its own: back to the plan, the Parameters' (Decision "Plugins'
 *  sides"). On a wide screen Stages is in view on the left: nothing. */
function BackToStages() {
  if (useWideScreen()) return null
  return (
    <button
      type="button"
      title={tr("Back to the stages")}
      onClick={() => showTabs(OPTIMIZER, { left: 'stages' })}
      className="pressable h-row shrink-0 rounded-control bg-fill px-2 text-label text-ink hover:bg-hover"
    >
      ‹ Stages
    </button>
  )
}

/** Under the viewport: folds to the run's line (the viewport takes the height) and back. */
function Fold({ folded, setFolded }: { folded?: boolean; setFolded?(on: boolean): void }) {
  if (!setFolded) return null
  return (
    <button
      type="button"
      aria-label={folded ? 'Unfold the specimens' : 'Fold the specimens'}
      aria-expanded={!folded}
      title={folded ? 'The scatter, the lines and the list again' : 'Fold to the run’s line: the viewport takes the height'}
      onClick={() => setFolded(!folded)}
      className="pressable grid h-row w-row shrink-0 place-items-center rounded-control text-ink-secondary hover:bg-hover hover:text-ink"
    >
      <Icon name={folded ? 'chevronUp' : 'chevronDown'} className="h-4 w-4" />
    </button>
  )
}

/** The stage a run is an attempt of: "② Buildings · attempt 2" (null: not a stage's, or a plan no longer here). */
function useStageOf(run: Run): string | null {
  const data = usePluginData(OPTIMIZER, OptimizerDataSchema)
  const ref = run.stage
  const plan = ref && data?.plans?.find((p) => p.id === ref.plan)
  const at = plan ? plan.stages.findIndex((s) => s.id === ref!.stage) : -1
  return plan && at >= 0 ? `${circled(at + 1)} ${plan.stages[at].name} · attempt ${ref!.attempt + 1}` : null
}

function Specimens({ run, wide, setWide, setFolded }: { run: Run; wide: boolean; setWide?(on: boolean): void; setFolded?(on: boolean): void }) {
  const view = useSpecimenView()
  const { problem } = run
  // the rows change with a generation, not with the progress in between
  const rows = useMemo(() => (problem ? rowsOf(problem, run.specimens, run.front) : []), [problem, run.specimens, run.front])
  const knee = useMemo(() => kneeOf(rows), [rows])
  const shown = useMemo(() => shownOf(rows, view.show), [rows, view.show])
  // the scatter's own axes follow the front (they settle as it does) until the designer picks one
  const [dx, dy] = useMemo(() => (problem ? defaultAxes(rows, problem) : [0, 1]), [rows, problem])
  const status = <Status run={run} wide={wide} setWide={setWide} setFolded={setFolded} />
  if (!problem)
    return (
      <section aria-label="Specimens" className="flex flex-col gap-3">
        {status}
        <p className="text-caption text-ink-secondary">{tr("Starting…")}</p>
        <Discard />
      </section>
    )

  const x = axisOf(view.x, problem, dx)
  const y = axisOf(view.y, problem, dy)
  const scatter = <Scatter rows={rows} problem={problem} filters={view.filters} x={x} y={y} picked={view.picked} hover={view.hover} wide={wide} />
  const lines = <Lines rows={shown} problem={problem} filters={view.filters} picked={view.picked} hover={view.hover} wide={wide} />
  const list = (
    <SpecimenList
      rows={rows}
      problem={problem}
      genes={run.state?.genes ?? []}
      knee={knee}
      show={view.show}
      sort={view.sort}
      filters={view.filters}
      picked={view.picked}
      hover={view.hover}
      limit={view.rows}
      wide={wide}
    />
  )
  if (wide)
    return (
      <section aria-label="Specimens" className="flex h-full min-h-0 flex-col gap-3">
        {status}
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.25fr)] gap-5">
          {scatter}
          <div className="flex min-h-0 flex-col gap-1.5">
            <p className="text-caption text-ink-secondary">{tr("Better at the top of each axis; drag on one to keep a range")}</p>
            <div className="min-h-0 flex-1">{lines}</div>
          </div>
          {list}
        </div>
        <Discard />
      </section>
    )
  return (
    <section aria-label="Specimens" className="flex flex-col gap-4">
      {status}
      {scatter}
      {problem.objectives.length > 1 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-caption text-ink-secondary">{tr("Better at the top of each axis; drag on one to keep a range")}</p>
          {lines}
        </div>
      )}
      {list}
      <Discard />
    </section>
  )
}

/** Lets the run go, and the options kept from it, after a question. */
function Discard() {
  const project = useProject()
  return (
    <div className="flex justify-start">
      <button
        type="button"
        title={tr("Its specimens go, and the options kept from it; your design stays")}
        onClick={() => discard(project)}
        className="pressable h-row rounded-control px-2.5 text-label text-ink-secondary hover:bg-hover hover:text-ink"
      >
        {tr("Discard run")}
      </button>
    </div>
  )
}

/** The run's state on one line (the stage it is an attempt of), its progress, Stop or Resume, and ⤢ or the fold. */
function Status(props: { run: Run; wide: boolean; setWide?(on: boolean): void; folded?: boolean; setFolded?(on: boolean): void }) {
  const { run, wide, setWide, folded, setFolded } = props
  const { generations } = run.template.budget
  const told = run.status === 'done' ? generations : (run.state?.generation ?? 0)
  const p = progressOf(run)
  const stage = useStageOf(run)
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        {!wide && <BackToStages />}
        <p className="min-w-0 flex-1 truncate text-label text-ink">
          {stage && <span className="font-semibold">{stage} · </span>}
          {STATUS[run.status]}
          <span className="tabular-nums text-ink-secondary" title={`Generation ${whole(told)} of ${whole(generations)}`}>
            {' '}
            · {clock(run.elapsed)} · {run.status === 'done' ? `${whole(generations)} generations` : `gen ${whole(told)}/${whole(generations)}`}
          </span>
        </p>
        {(run.status === 'running' || run.status === 'stopped') && (
          <button
            type="button"
            onClick={() => (run.status === 'running' ? useRun.getState().stop() : useRun.getState().resume())}
            className="pressable h-row shrink-0 rounded-control bg-fill px-2.5 text-label text-ink hover:bg-hover"
          >
            {run.status === 'running' ? '■ Stop' : '▶ Resume'}
          </button>
        )}
        {setFolded ? <Fold folded={folded} setFolded={setFolded} /> : <WideToggle wide={wide} setWide={setWide} />}
      </div>
      {folded ? null : run.status !== 'done' && (
        <div role="progressbar" aria-label="Run progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(p * 100)} className="h-1.5 overflow-hidden rounded-pill bg-fill">
          <div className="h-full rounded-pill bg-ink-secondary" style={{ width: `${p * 100}%` }} />
        </div>
      )}
      {run.status === 'error' && <p className="text-caption text-status-over">{run.error}</p>}
      {!folded && <WhileRunning />}
    </div>
  )
}

/** The viewport while the run goes: picking a mode follows this run again, after Back to my design. */
function WhileRunning() {
  const follow = useSpecimenView((s) => s.follow)
  return (
    <div className="flex items-center gap-2">
      <span className="text-caption text-ink-secondary">{tr("While running, the viewport shows")}</span>
      <Segmented kind="toggle" label="While running" options={FOLLOW} value={follow} onChange={(f) => useSpecimenView.getState().set({ follow: f, held: false })} />
    </div>
  )
}

function WideToggle({ wide, setWide }: { wide: boolean; setWide?(on: boolean): void }) {
  if (!setWide) return null
  return (
    <button
      type="button"
      aria-label={wide ? 'Back to the panel' : 'Wide, under the viewport'}
      title={wide ? 'Back to the panel (Escape)' : 'Wide, under the viewport: the scatter, the lines and the list side by side'}
      onClick={() => setWide(!wide)}
      className="pressable grid h-row w-row shrink-0 place-items-center rounded-control text-ink-secondary hover:bg-hover hover:text-ink"
    >
      <Icon path={wide ? NARROW : WIDEN} className="h-4 w-4" />
    </button>
  )
}
