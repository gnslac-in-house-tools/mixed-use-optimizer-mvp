// What the plan's other kinds' menus share (Phase AS.4 task 4): the runner of *Select all <kind>* (every object of the kind in the option in view, neither locked nor
// hidden: `editing/selectAll.ts`), greyed in All levels (the plan shows no layer then) and with the kind's own plural in its title, and the Lock row's title.
import { standardsOf } from '../../../../engine/circulation/standards.ts'
import { lanesOf } from '../../../../engine/path/lanes.ts'
import { kindOf } from '../../../../kinds/index.ts'
import { actions } from '../../../../state/actions/index.ts'
import { useApp } from '../../../../state/store.ts'
import type { Ref } from '../../../../kinds/types.ts'
import { selectAllRefusal } from '../../../plan/massCommands.ts'
import { allOfKind, selectAllOfKind } from '../../selectAll.ts'
import type { Runner } from '../verbs.ts'

/** The `select-all` base runner of a kind. */
export const selectAllRunner = (kind: string): Runner => ({
  title: () => `Every ${(kindOf(kind)?.label ?? 'object').toLowerCase()} of this option, but the locked and the hidden`,
  enabled: () => selectAllRefusal() ?? (allOfKind(kind).length > 0 ? true : `No ${(kindOf(kind)?.plural ?? 'objects').toLowerCase()} to select: they are locked, hidden or none`),
  run: () => selectAllOfKind(kind),
})

/** How many of what is picked, as a title says it: "2 lots", "3 things" when the kinds differ. */
function countOf(refs: Ref[]): string {
  const kinds = [...new Set(refs.map((r) => r.kind))]
  const one = kinds.length === 1 ? kindOf(kinds[0]) : undefined
  return one ? `${refs.length} ${(refs.length === 1 ? one.label : one.plural).toLowerCase()}` : `${refs.length} things`
}

/**
 * The runners of the own verbs *Group* and *Ungroup* of every kind that can be grouped (Phase AS.5 task 6, Decision "Groups of any kind"): the two
 * commands, `Ctrl+G` and `Ctrl+Shift+G`, which act on everything picked (the mass's own say it with masses: `kinds/mass.ts`). The menu of several
 * kinds shows these two first, when every kind picked has them (`menu/build.ts`).
 */
export const groupRunners = (): { group: Runner; ungroup: Runner } => ({
  group: { group: 'edit', command: 'edit.group', title: (refs) => `${countOf(refs)} become one group: picked, moved and turned as one` },
  ungroup: { group: 'edit', command: 'edit.ungroup', title: () => 'Their group comes apart: each one on its own' },
})

/**
 * The own verb *Equal sides* of a street and an existing street (Phase PE.1 task 11, Decision "Width by hand"): the drawn line goes to the middle of the paving, the paving stays
 * (the Path engine's `equal` op, one undo step for all picked). Greyed with its reason when every picked path is equal already, or a stretch it would change is locked.
 */
export const equalSidesRunner = (): Runner => {
  const each = (refs: Ref[]) => {
    const { project, option } = useApp.getState()
    return refs.map((r) => ({ ref: r, w: actions.editPath(project, r, { op: 'equal' }, option) }))
  }
  return {
    title: () => 'Its drawn line goes to the middle of its paving, which stays where it is',
    enabled: (refs) => {
      const all = each(refs)
      const refused = all.find((x) => x.w.reason)
      if (refused) return refused.w.reason!
      return all.some((x) => x.w.project !== useApp.getState().project) ? true : 'Its sides are equal already'
    },
    run: (refs) => {
      const option = useApp.getState().option
      useApp.getState().apply((p) => refs.reduce((q, r) => actions.editPath(q, r, { op: 'equal' }, option).project, p))
    },
  }
}

/**
 * The own verb *Equal lanes* of a street and an existing street (Phase PE.2 task 4, Decision "Path engine"): every stretch's lanes become equal, the same number of them, the width
 * staying (the Path engine's `equal-lanes` op, one undo step for all picked). Greyed with its reason when every lane is equal already (stored or not) or a stretch it would change is locked.
 */
export const equalLanesRunner = (): Runner => {
  /** Does stretch lanes differ? (1 mm) */
  const unequal = (lanes: number[]) => lanes.some((x) => Math.abs(x - lanes[0]) > 1e-3)
  const each = (refs: Ref[]) => {
    const { project, option } = useApp.getState()
    const laneWidth = standardsOf(project, project.options.find((o) => o.id === option)).laneWidth
    return refs.map((r) => ({
      ref: r,
      w: actions.editPath(project, r, { op: 'equal-lanes', k: 'all' }, option),
      changes: (actions.pathOf(project, r, option)?.path.stretches ?? []).some((s) => unequal(lanesOf(s, laneWidth))),
    }))
  }
  return {
    title: () => 'Its lanes in every stretch become as wide as each other, its width staying',
    enabled: (refs) => {
      const all = each(refs)
      const refused = all.find((x) => x.w.reason)
      if (refused) return refused.w.reason!
      return all.some((x) => x.changes) ? true : 'Its lanes are equal already'
    },
    run: (refs) => {
      const option = useApp.getState().option
      const todo = each(refs).filter((x) => x.changes)
      useApp.getState().apply((p) => todo.reduce((q, x) => actions.editPath(q, x.ref, { op: 'equal-lanes', k: 'all' }, option).project, p))
    },
  }
}
