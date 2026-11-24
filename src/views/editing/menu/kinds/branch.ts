// The branch rows' menu (Phase AS.4 task 5, Decision "One menu"): Streets, Gates, Lots, Existing roads, Dimensions, Notes and Buildings are not objects but the rows that hold
// them, so a right-click on one has no kind's menu, only: Select all <kind> · Hide (or Show) · Unlock all (when some of them are locked)  │  Properties. A branch row is asked as the `Ref`
// `{ kind: 'branch', id: <the row's id> }` (`menuFor` hands it to `branchMenu`); it is never picked, so nothing else in the app knows it. *Select all* is the kind's own (the
// plan's: every one that is neither locked nor hidden; Buildings: every building), *Hide* / *Show* is the row's eye (`layers/eyes.ts`: all hidden, show all; else hide all), *Unlock all*
// frees every one through the same verb the row's padlock runs, and *Properties* shows the row's settings (the row is picked by the right-click first).
import { optionBuildings, optionOf } from '../../../../engine/buildings.ts'
import { kindOf } from '../../../../kinds/index.ts'
import type { Note, Project } from '../../../../model/schema.ts'
import { streetLockState, gateLocked, lotLocked, buildingLocked } from '../../../../kinds/locked.ts'
import { actions } from '../../../../state/actions/index.ts'
import { useApp } from '../../../../state/store.ts'
import type { MenuEntry } from '../../../controls/Menu.tsx'
import { rowEyeNow, toggleRowEye } from '../../../layers/eyes.ts'
import { hiddenNow } from '../../../layers/layerView.ts'
import { flatRows, layerTree } from '../../../layers/tree.ts'
import { showProperties } from '../../../plan/massCommands.ts'
import { allOfKind, selectAllOfKind } from '../../selectAll.ts'
import { selectAllRunner } from './common.ts'

/** The `kind` of a `Ref` that asks for a branch row's menu. */
export const BRANCH = 'branch'

/** What a branch row holds: its kind, and (where the kind has a padlock) whether some are locked and how to free them all. */
interface Branch {
  kind: string
  locked?: () => boolean
  unlock?: () => void
}

const state = () => useApp.getState()
const apply = (f: Parameters<ReturnType<typeof state>['apply']>[0]) => state().apply(f)
/** The notes the Notes row holds: those of the levels of the option's buildings, as the row counts them (Layers) and its padlock locks them. */
const rowNotes = (p: Project = state().project): Note[] => {
  const levels = new Set(optionBuildings(p, optionOf(p, state().option)).flatMap((b) => b.levels.map((l) => l.id)))
  return (p.notes ?? []).filter((n) => levels.has(n.levelId))
}
const streetSegments = (): string[] => state().derived.circulation.roads.filter((r) => r.kind === 'street').flatMap((r) => r.segments ?? [])

const BRANCHES: Record<string, Branch> = {
  streets: {
    kind: 'street',
    locked: () => streetLockState(state().project, state().option, streetSegments()) !== 'unlocked',
    unlock: () => apply((p) => actions.lockStreets(p, streetSegments(), false, state().option)),
  },
  gates: {
    kind: 'gate',
    locked: () => state().derived.circulation.gates.some((g) => gateLocked(state().project, state().option, g.id)),
    unlock: () => apply((p) => actions.lockGates(p, state().derived.circulation.gates.map((g) => g.id), false, state().option)),
  },
  lots: {
    kind: 'lot',
    locked: () => state().derived.circulation.lots.some((l) => lotLocked(state().project, state().option, l.id)),
    unlock: () => apply((p) => actions.lockLots(p, state().derived.circulation.lots.map((l) => l.id), false)),
  },
  'existing-roads': {
    kind: 'existing-road',
    locked: () => (state().project.site.existingRoads ?? []).some((r) => r.locked === true),
    unlock: () => apply((p) => actions.lockExistingRoads(p, (p.site.existingRoads ?? []).map((r) => r.id), false)),
  },
  dimensions: { kind: 'dimension' },
  notes: {
    kind: 'note',
    locked: () => rowNotes().some((n) => n.locked === true),
    unlock: () => apply((p) => actions.lockNotes(p, rowNotes(p).map((n) => n.id), false)),
  },
  'reference-lines': {
    kind: 'reference-line',
    locked: () => (state().project.referenceLines ?? []).some((r) => r.locked === true),
    unlock: () => apply((p) => actions.lockReferenceLines(p, (p.referenceLines ?? []).map((r) => r.id), false)),
  },
  buildings: {
    kind: 'building',
    // a building is locked by its flag, or holds masses locked one by one (the row reads mixed): both are freed
    locked: () => {
      const { project, option } = state()
      const mine = optionBuildings(project, optionOf(project, option))
      const levels = new Set(mine.flatMap((b) => b.levels.map((l) => l.id)))
      return mine.some((b) => buildingLocked(project, b.id)) || project.masses.some((m) => m.locked === true && levels.has(m.levelId))
    },
    unlock: () => {
      const { project, option } = state()
      const ids = optionBuildings(project, optionOf(project, option)).map((b) => b.id)
      apply((p) => actions.lockBuildings(p, ids, false))
    },
  },
}

/** Whether this is a branch row that has a menu. */
export const isBranch = (id: string): boolean => id in BRANCHES

/** What the branch row is called in the menu's name: its kind's plural (Streets, Gates…). */
export const branchName = (id: string): string | undefined => (BRANCHES[id] ? kindOf(BRANCHES[id].kind)?.plural : undefined)

/** The menu of a branch row; none when the row is not in the tree (the typology offers no parking: no Lots row). */
export function branchMenu(id: string): MenuEntry[] {
  const b = BRANCHES[id]
  if (!b) return []
  const { project, derived, option } = state()
  // the tree as Layers draws it, with what is hidden on its own: the row's eye holds those keys too, so Hide and Show do what the eye does
  const row = flatRows(layerTree(project, option, derived, { terrain: false, parking: true }, hiddenNow())).find((r) => r.id === id)
  if (!row) return []
  const kind = kindOf(b.kind)
  const plural = (kind?.plural ?? 'objects').toLowerCase()

  // Select all: the kind's own (the plan's, but Buildings'), greyed when there is nothing to take
  const all = b.kind === 'building' ? { title: () => 'Every building of the option', enabled: () => (allOfKind('building').length > 0 ? true : 'No buildings to select') } : selectAllRunner(b.kind)
  const why = all.enabled?.([]) ?? true
  const select: MenuEntry = { key: 'select-all', label: `Select all ${plural}`, title: why === true ? all.title?.([]) : why, disabled: why !== true, onSelect: () => selectAllOfKind(b.kind) }

  const hidden = rowEyeNow(row) === 'hidden'
  const hide: MenuEntry = {
    key: 'hide',
    label: hidden ? 'Show' : 'Hide',
    title: hidden ? `The ${plural} are drawn in the plan and the 3D again` : `The ${plural} are not drawn in the plan or the 3D, not picked; they still count`,
    onSelect: () => toggleRowEye(row),
  }
  const unlock: MenuEntry[] = b.unlock && b.locked?.() ? [{ key: 'unlock-all', label: 'Unlock all', title: `Every ${kind?.label.toLowerCase() ?? 'one'} is free to move and delete again`, onSelect: b.unlock }] : []
  const properties: MenuEntry = { key: 'properties', label: 'Properties', title: 'Its settings in the Properties tab', onSelect: () => showProperties() }
  return [select, hide, ...unlock, 'separator', properties]
}
