// What the optimizer shows in the viewport (Decisions "Specimen preview" and "Following a run"), through the host:
// - the picked specimen, read only: a pick in the scatter, the lines or the list; ‹ › step through the list as the
//   tab shows it (its Show, its ranges, its sort), the bar saying where in it; Back to my design (Escape, an edit of the
//   design) lets the pick go;
// - while a run goes and nothing is picked, the run itself, as the tab's *While running* says (Galapagos' display
//   modes): *Best* the front's most balanced (★), each generation; *All* the specimen tried last, about ten a second;
//   *None* the design. A quiet look: in a step that draws no masses it waits, it never moves the designer. Back to my
//   design (or an edit) stops following this run; picking a mode again follows it again. When the run ends or stops,
//   the ★ stays, picked.
// A specimen's project is its genome written into the project as it was at ▶ Run (decode.ts). The bar keeps a picked
// one as an option (keep.ts, Decision "Keep a specimen").
import { currentProject, endPreview, isPreviewing, showPreview } from '../../../host.ts'
import { OPTIMIZER } from '../../data.ts'
import { useRun, type Run } from '../../run/store.ts'
import { approveSpecimen, circled, dataOf } from '../stage/commands.ts'
import { projectOf } from './decode.ts'
import { keep, keptAs } from './keep.ts'
import { kneeOf, listed, rowsOf, sortOf } from './rows.ts'
import { useSpecimenView } from './viewState.ts'

/** The list as the tab shows it: what ‹ › step through. */
function order(run: Run): number[] {
  if (!run.problem) return []
  const v = useSpecimenView.getState()
  return listed(rowsOf(run.problem, run.specimens, run.front), { show: v.show, sort: sortOf(v.sort, run.problem), filters: v.filters }).map((r) => r.s.id)
}

/** The front's most balanced: the ★. */
const kneeIn = (run: Run) => (run.problem ? kneeOf(rowsOf(run.problem, run.front, run.front)) : null)

const pick = (id: number) => () => useSpecimenView.getState().set({ picked: id })
const better = (run: Run) => Object.fromEntries(run.problem!.objectives.map((o) => [o.id, o.sense]))

/** A later call wins: a pick made while the engine loads is not undone by the one before it. */
let calls = 0

export async function preview(id: number | null) {
  const call = ++calls
  const run = useRun.getState().run
  const s = id === null ? undefined : run?.specimens.find((x) => x.id === id)
  if (!run?.problem || !s) {
    if (following()) return follow()
    return endPreview(OPTIMIZER)
  }
  const project = await projectOf(run, s.id, s.genome)
  if (call !== calls) return
  // a genome its problem cannot write: nothing to show
  if (!project) return endPreview(OPTIMIZER)
  const ids = order(run)
  const at = ids.indexOf(s.id)
  showPreview(OPTIMIZER, {
    title: at >= 0 ? `Specimen #${s.id} · ${at + 1} of ${ids.length}` : `Specimen #${s.id} · not in the list`,
    project,
    option: run.optionId,
    // the KPIs that are the run's objectives say better or worse
    better: better(run),
    prev: at > 0 ? pick(ids[at - 1]) : undefined,
    next: at >= 0 ? (at < ids.length - 1 ? pick(ids[at + 1]) : undefined) : ids.length ? pick(ids[0]) : undefined,
    actions: [...approveAction(run, s.id), keepAction(run, s.id)],
    // the bar, an edit, another option: the pick goes with it, and the run is not followed again
    onEnd: () => useSpecimenView.getState().set({ picked: null, held: true }),
  })
}

/** A stage's run, its stage still to review: the bar's *Approve for ② Buildings* (Decision "Stages layout"). */
function approveAction(run: Run, id: number) {
  const ref = run.stage
  const data = dataOf(currentProject())
  const plan = ref && data?.plans?.find((p) => p.id === ref.plan)
  const at = plan ? plan.stages.findIndex((x) => x.id === ref!.stage) : -1
  const stage = plan && at >= 0 ? plan.stages[at] : null
  if (!plan || !stage || stage.approved || stage.attempts.length - 1 !== ref!.attempt) return []
  return [
    {
      label: `Approve for ${circled(at + 1)} ${stage.name}`,
      title: 'Keep this specimen as the stage’s option; the next stage opens',
      onSelect: () => void approveSpecimen(plan.option, stage.id, id),
    },
  ]
}

/** The bar's *Keep as option*; once kept, it says so. */
function keepAction(run: Run, id: number) {
  const as = keptAs(currentProject(), run, id)
  const name = as && currentProject().options.find((o) => o.id === as)?.name
  return as
    ? { label: 'Kept', title: `Kept as ${name}`, disabled: true, onSelect: () => {} }
    : { label: 'Keep as option', title: 'A new option with this specimen, to edit: your design stays as it is', onSelect: () => void keep(id) }
}

/** The run is followed: it goes, the viewport's mode is not *None*, nothing is picked and the designer has not taken
 *  the viewport back. */
export function following(): boolean {
  const run = useRun.getState().run
  const v = useSpecimenView.getState()
  return !!run?.problem && run.status === 'running' && v.follow !== 'none' && !v.held && v.picked === null
}

/** The run in the viewport, as the mode says. */
async function follow() {
  const call = ++calls
  const run = useRun.getState().run!
  const best = useSpecimenView.getState().follow === 'best'
  const knee = best ? kneeIn(run) : null
  const genome = best ? run.specimens.find((s) => s.id === knee)?.genome : run.trying
  if (!genome) return
  const project = await projectOf(run, best ? knee : null, genome)
  if (call !== calls || !following() || !project) return
  // as the tab's status says: the generations told
  const gen = `gen ${run.state?.generation ?? 0}/${run.template.budget.generations}`
  showPreview(OPTIMIZER, {
    title: best ? `Following the run · ★ #${knee} · ${gen}` : `Following the run · trying · ${gen}`,
    project,
    option: run.optionId,
    better: better(run),
    quiet: true,
    // the designer takes the viewport back: this run is not followed any more
    onEnd: () => useSpecimenView.getState().set({ held: true }),
  })
}

/** The ★ the run left picked when it ended or stopped, so Resume follows it again. */
let left: number | null = null

// a pick shows it; what the list shows changes where it is in it; the mode, whether the run is followed
useSpecimenView.subscribe((v, before) => {
  if (v.picked !== before.picked || v.follow !== before.follow || v.held !== before.held) {
    if (v.follow === 'none' && before.follow !== 'none' && v.picked === null) return endPreview(OPTIMIZER)
    return void preview(v.picked)
  }
  if (v.picked !== null && (v.show !== before.show || v.sort !== before.sort || v.filters !== before.filters)) void preview(v.picked)
})
useRun.subscribe((r, before) => {
  const run = r.run
  if (!run || run.id !== before.run?.id) return
  const v = useSpecimenView.getState()
  // ended or stopped while followed (its look in view): the ★ stays, picked
  if (before.run.status === 'running' && run.status !== 'running') {
    const knee = kneeIn(run)
    if (v.picked === null && !v.held && v.follow !== 'none' && isPreviewing(OPTIMIZER) && knee !== null) {
      left = knee
      return v.set({ picked: knee })
    }
  }
  // resumed: the ★ it left lets go, and the run is followed again
  if (before.run.status !== 'running' && run.status === 'running' && v.picked !== null && v.picked === left) {
    left = null
    return v.set({ picked: null })
  }
  if (following()) {
    const best = v.follow === 'best'
    if ((best && run.front !== before.run.front) || (!best && run.trying !== before.run.trying)) void follow()
  } else if (v.picked !== null && run.front !== before.run.front) void preview(v.picked)
})
