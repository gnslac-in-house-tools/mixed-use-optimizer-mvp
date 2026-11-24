// Select all <kind> (Phase AS.4, Decision "One menu"): every object of that kind in the option in view that is neither locked nor hidden, as `Ref`s, and picking
// them through the bridge (`pickRefs`). The menu's own row (a kind registers it as its `select-all` base verb: `editing/menu/kinds/common.ts`); `edit.select-all`
// (Ctrl+A) stays the level's masses. A street with only some segments locked is mixed, so it is picked; hidden is the eye's (a street hidden when all its segments are).
// Nothing in All levels (the plan shows no layer of these then). A building is a row of Layers, not on the plan: every building of the option, locked and hidden too (the row
// reaches them), picked as rows. Selection is not on Undo.
import { optionBuildings, optionOf } from '../../engine/buildings.ts'
import { existingRoadLocked, gateLocked, lotLocked, noteLocked, referenceLineLocked, streetLockState } from '../../kinds/locked.ts'
import type { Ref } from '../../kinds/types.ts'
import { useApp } from '../../state/store.ts'
import { isObjectHidden, roadHidden } from '../layers/keys.ts'
import { hiddenNow } from '../layers/layerView.ts'
import { pickRefs } from '../plan/mix.ts'

/** The objects of the kind in the option in view that Select all takes. */
export function allOfKind(kind: string): Ref[] {
  const { project, derived, level, option, showAll } = useApp.getState()
  if (kind === 'building') return optionBuildings(project, optionOf(project, option)).map((b) => ({ kind, id: b.id }))
  if (showAll) return []
  const off = hiddenNow()
  const refs = (ids: string[]): Ref[] => ids.map((id) => ({ kind, id }))
  switch (kind) {
    case 'street':
      return refs(derived.circulation.roads.filter((r) => r.kind === 'street' && !roadHidden(off, r) && streetLockState(project, option, r.segments ?? []) !== 'locked').map((r) => r.street ?? r.id).filter((id, i, all) => all.indexOf(id) === i))
    case 'existing-road':
      return refs((project.site.existingRoads ?? []).filter((r) => !isObjectHidden(off, 'existing-road', r.id) && !existingRoadLocked(project, r.id)).map((r) => r.id))
    case 'gate':
      return refs(derived.circulation.gates.filter((g) => !isObjectHidden(off, 'gate', g.id) && !gateLocked(project, option, g.id)).map((g) => g.id))
    case 'lot':
      return refs(derived.circulation.lots.filter((l) => !isObjectHidden(off, 'lot', l.id) && !lotLocked(project, option, l.id)).map((l) => l.id))
    case 'dimension':
      return refs((project.dimensions ?? []).filter((d) => d.levelId === level && !isObjectHidden(off, 'dimension', d.id)).map((d) => d.id))
    case 'note':
      return refs((project.notes ?? []).filter((n) => n.levelId === level && !isObjectHidden(off, 'note', n.id) && !noteLocked(project, n.id)).map((n) => n.id))
    case 'reference-line':
      return refs((project.referenceLines ?? []).filter((r) => !isObjectHidden(off, 'reference-line', r.id) && !referenceLineLocked(project, r.id)).map((r) => r.id))
    default:
      return []
  }
}

/** Picks every object of the kind that Select all takes (what was picked goes). */
export const selectAllOfKind = (kind: string): void => pickRefs(allOfKind(kind))
