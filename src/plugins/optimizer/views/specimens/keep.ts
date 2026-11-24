// What a specimen may become (Decision "Keep a specimen"), each one undo step through the actions:
// - *Keep as option*: a new option, "<option> · #23", of copies of the run's option's buildings as the specimen has them
//   (not linked), its circulation too; the design stays as it is, and the app goes to the new option to edit it.
// - *Replace <option>*, after a question: the option shows the specimen's copies instead, and what it was stays as
//   "<option> · before optimization" (its buildings, linked as they were).
// - *Discard run*, after a question: the run goes, and the options kept from it (with the buildings no other option
//   shows); a replace is not undone by it (Ctrl+Z is).
import type { Id, LogBy, Project } from '../../../../model/schema.ts'
import { actions, apply, confirm, endPreview, setActiveOption } from '../../../host.ts'
import { OPTIMIZER } from '../../data.ts'
import { useRun, type Run } from '../../run/store.ts'
import { projectOf } from './decode.ts'
import { useSpecimenView } from './viewState.ts'

/** The specimen's project, as its preview shows it. */
async function specimenOf(id: number): Promise<{ run: Run; project: Project } | null> {
  const run = useRun.getState().run
  const s = run?.specimens.find((x) => x.id === id)
  if (!run || !s) return null
  const project = await projectOf(run, id, s.genome)
  return project ? { run, project } : null
}

/** The option a specimen was kept as, if the project still has it. */
export function keptAs(project: Project, run: Run, id: number): Id | null {
  const k = run.kept.findLast((x) => x.specimen === id && project.options.some((o) => o.id === x.optionId))
  return k?.optionId ?? null
}

/** The option it made (null: no such specimen, or its option is gone); `by`: the agent's tool says it decided. */
export async function keep(id: number, by: LogBy = 'optimizer'): Promise<Id | null> {
  const found = await specimenOf(id)
  if (!found) return null
  let made: Id | null = null
  apply((p) => {
    const r = actions.importOption(p, found.project, found.run.optionId, `#${id}`)
    if (!r) return p
    made = r.id
    return r.project
  }, by)
  if (made === null) return null
  useRun.getState().keep(id, made)
  setActiveOption(made)
  return made
}

/** The option the run optimized, by its name in the project now. */
export const optionName = (project: Project, run: Run) => project.options.find((o) => o.id === run.optionId)?.name ?? null

export async function replace(id: number, project: Project) {
  const found = await specimenOf(id)
  const name = found && optionName(project, found.run)
  if (!found || !name) return
  const { optionId } = found.run
  const before = `${name} · before optimization`
  confirm(`Replace ${name} with specimen #${id}? What it is now stays as “${before}”.`, () => {
    apply((p) => {
      const kept = actions.duplicateOption(p, optionId)
      if (!kept) return p
      const r = actions.importOption(actions.renameOption(kept.project, kept.id, before), found.project, optionId, `#${id}`, optionId)
      return r ? r.project : p
    }, 'optimizer')
    setActiveOption(optionId)
  })
}

export function discard(project: Project) {
  const run = useRun.getState().run
  if (!run) return
  const kept = [...new Set(run.kept.map((k) => k.optionId))].filter((o) => project.options.some((x) => x.id === o))
  const n = kept.length
  const also = n === 0 ? '' : n === 1 ? ', and the option kept from it (Ctrl+Z brings it back)' : `, and the ${n} options kept from it (Ctrl+Z brings them back)`
  confirm(`Discard this run? Its specimens go${also}.`, () => {
    if (n) apply((p) => withoutOptions(p, kept))
    useSpecimenView.getState().set({ picked: null })
    endPreview(OPTIMIZER)
    useRun.getState().clear()
  })
}

/** The options go, and their buildings no other option shows (removeOption's rule: Decision "No loose buildings"). */
function withoutOptions(p: Project, ids: Id[]): Project {
  return ids.reduce((r, id) => actions.removeOption(r, id), p)
}
