// The graph's commands (Decisions "Graph mode", "Solve" and "Steps"; the Rules window's tools are its own, Graph is
// Show's, behind Layers at the left panel's foot):
//   solveOption  ▶ Solve all, the step from the brief and its rules to geometry: it places the masses the brief still
//                asks for and slides the option's masses to meet the rules (the smaller of two moves, the dominant one
//                stays). One undo step; a notice says what it did. Its button is the Summary's Issues tab's (Decision
//                "Issues, one list": no tools have one); S runs it too, and from the Rules window it closes it, to see
//                what it made.
// New masses come from the brief (its counts) through Solve, never from a node of their own (the user: "the program
// is added from the brief").
import type { Id } from '../../model/schema.ts'
import { actions } from '../../state/actions/index.ts'
import { useApp } from '../../state/store.ts'
import { useToast } from '../layout/toast.ts'
import { useUi } from '../layout/ui.ts'

/** How the option's relations stand: met, and all of them (moves with is a link, never broken: not counted). */
function standing() {
  const rel = useApp.getState().derived.relations.filter((r) => r.kind !== 'attached')
  return { met: rel.filter((r) => r.met).length, all: rel.length }
}

/**
 * ▶ Solve: the masses the brief still asks for, placed by their rules, then every mass slides to meet them. The
 * notice says what was placed, how the rules stand now, and what found no room. From the Rules window it closes it, to
 * see what it made.
 */
export function solveOption() {
  const { option, level } = useApp.getState()
  const was = useApp.getState().project
  let result: { added: Id[]; missing: number } = { added: [], missing: 0 }
  useApp.getState().apply((p) => {
    const r = actions.solve(p, option, level)
    result = r
    return r.project
  })
  const { added, missing } = result
  const after = standing()
  const changed = useApp.getState().project !== was
  const toast = useToast.getState()
  const placed = added.length === 0 ? '' : `${added.length === 1 ? '1 mass' : `${added.length} masses`} placed from the brief · `
  const rules = after.all === 0 ? 'no rules apply yet' : `${after.met} of ${after.all} relations met`
  const room = missing ? ` · no room for ${missing} more` : ''
  if (!changed && missing === 0)
    toast.show('info', after.all === 0 ? 'Nothing to solve: add rules between the programs (the Rules step).' : after.met === after.all ? 'Nothing to solve: the brief’s masses are placed and every rule is met.' : 'Nothing could move (locked or context masses, or no room).')
  else toast.show(after.met === after.all && missing === 0 ? 'info' : 'error', `Solved: ${placed}${rules}${room}.`)
  if (useUi.getState().dialog === 'rules') useUi.getState().closeDialog()
}
