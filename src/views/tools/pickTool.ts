// Why the plan's tools rest (Project C, AS.1; AS.2): the 3D alone shows no plan, Compare has its own. Taking a tool is
// `tools/hand.ts` (`take`, `toggle`, `letGo`); the buttons, the keys and the commands all call it.
//   PLAN_OFF             the reason of the 3D alone
//   planToolsRefusal     `true`, or why the plan's drawing tools rest now
import { useCompare } from '../compare/compareView.ts'
import { useUi } from '../layout/ui.ts'

/** Why a tool of the plan cannot be used in the 3D view alone. */
export const PLAN_OFF = 'The plan is not on screen'

/** `true`, or why the plan's drawing tools rest now: the 3D alone, or Compare open (the strip’s buttons and the commands rest so). */
export function planToolsRefusal(): true | string {
  if (useUi.getState().view === '3d') return PLAN_OFF
  if (useCompare.getState().open) return 'Close Compare first'
  return true
}
