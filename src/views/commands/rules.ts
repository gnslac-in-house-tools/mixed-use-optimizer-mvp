// The Rules window's keys as commands (Project C, AS.1; Decisions "Brief and Rules as windows"): R draws a rule (and again
// lets it go), S solves, Delete and Backspace remove the picked rule. They answer in the Rules window alone
// (`where: ['rules']`) and are that window's own (`window: 'rules'`): they stand in no menu, because the window covers the
// menu bar and a row there would always be grey; the shortcuts window lists them under *Rules window*. They are
// disabled with "Open the Rules window first" outside it, for a caller that asks. They are that window's own: the plan's R (Rotate) and S-less keys
// do not reach it. What the window does with Escape (a pick, the relation or the rule tool first, then it closes) stays
// useShortcuts.ts's, as every Escape.
import { actions } from '../../state/actions/index.ts'
import { useApp } from '../../state/store.ts'
import { solveOption } from '../graph/GraphTools.tsx'
import { toggleRuleTool, useGraph } from '../graph/graphState.ts'
import { useUi } from '../layout/ui.ts'
import { register } from './registry.ts'
import type { Command } from './types.ts'

const RULES = ['Design', 'Rules window']
const inRules = (): true | string => (useUi.getState().dialog === 'rules' ? true : 'Open the Rules window first')

export const RULES_COMMANDS: Command[] = [
  {
    id: 'rules.rule',
    label: 'Draw rule',
    menu: RULES,
    separatorBefore: true,
    key: 'R',
    where: ['rules'],
    window: 'rules',
    run: toggleRuleTool,
    enabled: inRules,
    checked: () => useUi.getState().dialog === 'rules' && useGraph.getState().tool === 'rule',
  },
  { id: 'rules.solve', label: 'Solve', menu: RULES, key: 'S', where: ['rules'], window: 'rules', run: solveOption, enabled: inRules },
  {
    id: 'rules.delete',
    label: 'Delete rule',
    menu: RULES,
    key: ['Del', 'Backspace'],
    where: ['rules'],
    window: 'rules',
    run: () => {
      const g = useGraph.getState()
      if (!g.rule) return
      const rule = g.rule
      useApp.getState().apply((p) => actions.removeRule(p, rule))
      g.selectRule(null)
    },
    enabled: () => (inRules() !== true ? inRules() : useGraph.getState().rule ? true : 'Pick a rule first'),
  },
]

export function registerRules(): void {
  register(RULES_COMMANDS)
}
