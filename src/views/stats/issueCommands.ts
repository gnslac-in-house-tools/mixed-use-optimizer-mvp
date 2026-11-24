// What the issues' controls do (Decision "Issues, one list"; the user: "maybe the only source of information about
// issues should be the Issues tab, and the ! with their own messages"):
//   showIssues(key)   the Summary on its Issues tab (the column shown, or its sheet on a narrow screen), that place's
//                     issues picked: a marker's click, the KPI's Issues
//   canSolve(issue)   whether its own ▶ Solve can do something: fewer masses than the brief asks for, a broken rule,
//                     an overlap, a mass outside the buildable area
//   solveOne(issue)   that Solve (actions.solveIssue, one undo step) and a notice of how it went
//   briefFor(issue)   *Update brief* for its program alone
//   editRule(issue)   a broken rule's: the Rules step, the rule picked in its list
//   solveAllRefusal() why ▶ Solve all has nothing to do (no issue its own Solve can settle), or true: the Issues tab's
//                     button is greyed by it, and so is Design › Solve all
// ▶ Solve all is solveOption (graph/GraphTools.tsx), which S and Design › Solve all run too.
import type { Issue } from '../../engine/types.ts'
import { actions } from '../../state/actions/index.ts'
import { useApp } from '../../state/store.ts'
import { useGraph } from '../graph/graphState.ts'
import { isWide } from '../layout/media.ts'
import { useToast } from '../layout/toast.ts'
import { useUi } from '../layout/ui.ts'
import { pickIssues } from '../plan/issueMarkers.ts'

export function showIssues(key: string | null) {
  const ui = useUi.getState()
  ui.setSummaryTab('issues')
  if (isWide()) ui.setPanel('right', true)
  else ui.setSheet('right')
  pickIssues(key)
}

export function canSolve(issue: Issue): boolean {
  if (issue.code === 'brief') return issue.program !== undefined && issue.massIds.length === 0
  if (issue.code === 'relation') return issue.rule !== undefined && issue.massIds.length === 2
  return (issue.code === 'overlap' || issue.code === 'outside-buildable') && issue.massIds.length > 0
}

/** Why ▶ Solve all can do nothing now: no issue of the option has a Solve of its own that can act. */
export const NOTHING_TO_SOLVE = 'Nothing here Solve can settle'

/** `true` while some issue can be settled by Solve, else why not. */
export const solveAllRefusal = (): true | string => (useApp.getState().derived.issues.some(canSolve) ? true : NOTHING_TO_SOLVE)

/** The same issue after a change: its code, its masses and its rule. */
const same = (a: Issue, b: Issue) => a.code === b.code && a.rule === b.rule && a.program === b.program && a.massIds.join() === b.massIds.join()

export function solveOne(issue: Issue) {
  const { option, level, apply } = useApp.getState()
  const was = useApp.getState().project
  let result = { added: 0, missing: 0 }
  apply((p) => {
    const r = actions.solveIssue(p, option, level, issue)
    result = { added: r.added.length, missing: r.missing }
    return r.project
  })
  const toast = useToast.getState()
  const left = useApp.getState().derived.issues.some((i) => same(i, issue))
  const masses = (n: number) => (n === 1 ? '1 mass' : `${n} masses`)
  if (issue.code === 'brief') {
    const name = useApp.getState().project.programs.find((g) => g.id === issue.program)?.name ?? 'the program'
    if (result.added === 0) toast.show('error', `No room for ${name}'s ${masses(result.missing)} the brief asks for.`)
    else toast.show(result.missing ? 'error' : 'info', `${masses(result.added)} of ${name} placed by its rules${result.missing ? `; no room for ${result.missing} more` : ''}.`)
  } else if (useApp.getState().project === was) toast.show('error', 'Nothing could move: its masses are locked or context, or there is no room.')
  else toast.show(left ? 'error' : 'info', left ? 'Moved, but it is not solved yet: try again, or move them by hand.' : 'Solved: its masses moved, the rest stayed.')
}

export function briefFor(issue: Issue) {
  const { option, apply, project } = useApp.getState()
  apply((p) => actions.updateBriefFromDesign(p, option, issue.program))
  const name = project.programs.find((g) => g.id === issue.program)?.name ?? 'The program'
  const has = useApp.getState().derived.metrics.massesByProgram[issue.program ?? ''] ?? 0
  useToast.getState().show('info', has ? `The brief now asks for ${has} ${name} ${has === 1 ? 'mass' : 'masses'}.` : `The brief no longer counts ${name}.`)
}

/** An issue of the masses, not the circulation's: changing a road cannot settle it. */
export function editRule(issue: Issue) {
  if (!issue.rule) return
  useUi.getState().openDialog('rules')
  useGraph.getState().selectRule(issue.rule)
}
