// What the plan's right-click menu and its keys do to the selected masses (Decisions "Plan menu" and "Groups"). Each
// one is a verb through `actions` (one undo step) or a selection; the menu greys out what the selection cannot do.
//   pickOnPlan      a click on the plan or the 3D: the mass with its group (Alt: that mass alone); Shift adds or takes them
//                   out. A locked mass is not picked (the padlock is CAD's): the notice says where it comes off. A tree's
//                   row picks it (`pickFromRow`, panels/buildingCommands.ts): the one way to reach a locked mass.
//   pickForMenu     a right-click on a mass: it is picked first unless it is; a locked one not picked opens no menu (false)
//   lockedMassAt    the locked mass under a point of the plan, if any (a click that lands on one only says it is locked)
//   massAtPoint     the mass drawn on top under a point of the plan: a right-click with a tool in hand finds it so (the masses let the pointer through to the tool)
//   groupSelection  Ctrl+G: two or more things (masses, streets, lots, gates, dimensions, reference lines, notes: Phase AS.5 task 6) become one group
//   ungroupSelection  Ctrl+Shift+G: their groups come apart
//   mergeSelection  U (Tools › Massing › Union; it was Ctrl+J): masses that touch become one mass (Phase H.2)
//   rotateSelection · deleteSelection · selectAllHere · showProperties
// and the reasons the selection cannot do them (`groupRefusal`, `ungroupRefusal`, `mergeRefusal`, `lockedRefusal`…): null
// when it can. The plan's menu greys a row with its reason and the commands (commands/edit.ts) are disabled with it:
// one wording, one rule.
// A group of masses alone is picked here as it always was; a group that holds other kinds is picked through the bridge (`pickGroup` in `mix.ts`).
import { pointInPolygon } from '../../engine/geom/polygon.ts'
import { groupMembers, isGroupable, isGrouped, oneGroup, oneRefGroup, refGroupMembers } from '../../engine/groups.ts'
import { kindOf } from '../../kinds/index.ts'
import { actions } from '../../state/actions/index.ts'
import { useApp } from '../../state/store.ts'
import { massEyeOff, massHiddenOnPlan, otherMasses } from '../buildingView.ts'
import { useLayerPick } from '../layers/layerPick.ts'
import { isMassLocked, tellLockedPick } from '../layers/locks.ts'
import { hiddenNow, useLayerView } from '../layers/layerView.ts'
import { useToast } from '../layout/toast.ts'
import { showPanel, useUi } from '../layout/ui.ts'
import type { Ref } from '../../kinds/types.ts'
import { addToMix, pickedNow, pickedRefs, pickGroup, pickRefs } from './mix.ts'
import { massIsLocked } from '../../kinds/locked.ts'
import type { Id, Mass, Point } from '../../model/schema.ts'

/**
 * Picks a mass as a click on the plan or the 3D does: with its group, or alone (`alone`, Alt); `add`: Shift. A locked mass
 * is not picked, nor are the locked members of its group: a click on a locked mass picks nothing and says where it
 * comes off (false). A row of a tree is the one way to a locked mass (`pickFromRow`).
 */
export function pickOnPlan(id: Id, add = false, alone = false): boolean {
  if (isMassLocked(id)) {
    tellLockedPick()
    return false
  }
  // Shift: it joins what is picked, of any kind (Decision "Mixed selection")
  if (add) {
    addToMix('mass', id, alone)
    return true
  }
  // a group that holds other kinds: the whole group, whatever its kinds (Alt: the mass alone)
  if (pickGroup({ kind: 'mass', id }, alone)) return true
  const s = useApp.getState()
  // its group but for the members that are locked or that the plan does not draw (their building's eye is off)
  const off = hiddenNow()
  const group = (alone ? [id] : groupMembers(s.project, id)).filter((x) => !isMassLocked(x) && !massHiddenOnPlan(s.project, s.level, x, off))
  if (group.length === 1) s.select(id)
  else {
    s.select(id) // its level first
    s.selectMany(group)
  }
  return true
}

/**
 * A right-click on a mass (the plan's, the 3D's): one not picked is picked first, with its group; false when it is locked
 * and not picked, so no menu opens (the notice alone says where the lock comes off). One picked from its row, locked or
 * not, opens the menu of what is picked.
 */
export function pickForMenu(id: Id, alone = false): boolean {
  if (useApp.getState().selection.massIds.includes(id)) {
    // a building marked beside the selected masses (its right-click) lets go: the menu is of the masses alone
    useLayerPick.getState().clear()
    return true
  }
  return pickOnPlan(id, false, alone)
}

/** The masses the plan draws: the level's and the option's other buildings', but for those whose own eye is off. */
function drawnMasses(): Mass[] {
  const { project, level, option, showAll } = useApp.getState()
  if (showAll) return []
  const hidden = useLayerView.getState().hidden
  return [...project.masses.filter((m) => m.levelId === level && !massEyeOff(hidden, m.id)), ...otherMasses(project, level, option, hidden)]
}

/** Whether the point is on the mass as the plan draws it (inside its outline, not in one of its holes). */
function onMass(q: Point, id: Id): boolean {
  const d = useApp.getState().derived.masses[id]
  return d !== undefined && d.polygon.length >= 3 && pointInPolygon(q, d.polygon) && !d.holes.some((h) => pointInPolygon(q, h))
}

/** The locked mass under a point of the plan (the masses it draws: the level's and the option's other buildings'), if any. */
export function lockedMassAt(q: Point): Mass | null {
  const { project } = useApp.getState()
  return drawnMasses().find((m) => massIsLocked(project, m) && onMass(q, m.id)) ?? null
}

/** The mass under a point of the plan, the one drawn on top; null when none. A right-click with a tool in hand asks it: the masses let the pointer through to the tool. */
export function massAtPoint(q: Point): Id | null {
  return drawnMasses().findLast((m) => onMass(q, m.id))?.id ?? null
}

/** What the masses' own verbs say when no mass is picked. */
export const PICK_A_MASS = 'Select a mass first'

/** A kind as a reason says it, with its article: *A street*, *An existing road*. */
function aKind(kind: string): string {
  const name = (kindOf(kind)?.label ?? 'thing').toLowerCase()
  return `${/^[aeiou]/.test(name) ? 'An' : 'A'} ${name}`
}

/**
 * Whether what is picked is masses alone (or nothing) and none of their groups holds another kind: the words of Group and Ungroup are the masses' own then, as they always were.
 * A mass whose group holds a lot, a note… acts with the whole group (`groupRefs`, `ungroupRefs`): the masses alone would leave the rest of it behind.
 */
function massesAlone(refs: { kind: string; id: Id }[]): boolean {
  if (!refs.every((r) => r.kind === 'mass')) return false
  const { project, option } = useApp.getState()
  return refs.every((r) => refGroupMembers(project, option, r).every((m) => m.kind === 'mass'))
}

/** Why the selection cannot be grouped; null when it can. */
export function groupRefusal(): string | null {
  const s = useApp.getState()
  const refs = pickedRefs()
  if (massesAlone(refs)) {
    const ids = s.selection.massIds
    if (ids.length < 2) return 'Select two or more masses to group them'
    if (actions.groupMasses(s.project, ids) === null) return GROUP_LOCKED
    return oneGroup(s.project, ids) ? 'They are one group already' : null
  }
  // things of every kind (Phase AS.5 task 6): what cannot be in a group is named
  const stray = refs.find((r) => !isGroupable(r.kind))
  if (stray) return `${aKind(stray.kind)} cannot be in a group`
  if (refs.length < 2) return 'Select two or more things to group them'
  if (actions.groupRefs(s.project, s.option, refs) === null) return GROUP_LOCKED_THING
  return oneRefGroup(s.project, s.option, refs) ? 'They are one group already' : null
}

/** Why a locked mass stops Group and Ungroup: it keeps its group. */
export const GROUP_LOCKED = 'A locked mass keeps its group: unlock it first'

/** The same for a group that holds other things than masses: a locked street, lot, gate, reference line or note keeps its group too. */
export const GROUP_LOCKED_THING = 'A locked thing keeps its group: unlock it first'

/** Why the selection cannot be ungrouped; null when it can. */
export function ungroupRefusal(): string | null {
  const s = useApp.getState()
  const refs = pickedRefs()
  if (massesAlone(refs)) {
    const ids = s.selection.massIds
    if (ids.length === 0) return PICK_A_MASS
    if (!ids.some((id) => isGrouped(s.project, id))) return 'None of them is in a group'
    return actions.ungroupMasses(s.project, ids) === s.project ? GROUP_LOCKED : null
  }
  if (actions.ungroupRefs(s.project, s.option, refs) !== s.project) return null
  const anyGrouped = refs.some((r) => isGroupable(r.kind) && refGroupMembers(s.project, s.option, r).length > 1)
  return anyGrouped ? GROUP_LOCKED_THING : 'None of them is in a group'
}

/** How many of the selected masses are locked. */
export function lockedCount(): number {
  const s = useApp.getState()
  return s.project.masses.filter((m) => s.selection.massIds.includes(m.id) && massIsLocked(s.project, m)).length
}

/** Why a locked mass in the selection stops Delete and Rotate; null when none is locked. */
export function lockedRefusal(): string | null {
  const locked = lockedCount()
  return locked > 0 ? `${locked === 1 ? 'A locked mass' : `${locked} locked masses`}: unlock first` : null
}

/** Why Rotate 90° cannot turn the selection: nothing picked, or a locked mass in it; null when it can. */
export const rotateRefusal = (): string | null => (useApp.getState().selection.massIds.length === 0 ? PICK_A_MASS : lockedRefusal())

export function groupSelection(): boolean {
  const s = useApp.getState()
  const refs = pickedRefs()
  if (!massesAlone(refs)) return groupThings(refs)
  const ids = s.selection.massIds
  if (ids.length < 2) return false
  let made = false
  s.apply((p) => {
    const r = actions.groupMasses(p, ids)
    made = r !== null
    return r ? r.project : p
  })
  if (!made) return false
  // the groups they were in joined: all of them stay picked
  const now = useApp.getState()
  const off = hiddenNow()
  s.selectMany(groupMembers(now.project, ids[0]).filter((id) => !massHiddenOnPlan(now.project, now.level, id, off)))
  const n = useApp.getState().selection.massIds.length
  useToast.getState().show('info', `${n} masses grouped: a click picks them all, Alt+click one alone.`)
  return true
}

/** Ctrl+G on things of several kinds (or of one that is not the masses): one group, and the whole group, the ones it joined too, stays picked. */
function groupThings(refs: Ref[]): boolean {
  if (groupRefusal() !== null) return false
  let made = false
  useApp.getState().apply((p) => {
    const r = actions.groupRefs(p, useApp.getState().option, refs)
    made = r !== null
    return r ? r.project : p
  })
  if (!made) return false
  // the plan stays where it is: the group is picked from what was picked, which a click would take to the first mass's level
  pickGroup(refs[0], false, false)
  const n = pickedRefs().length
  useToast.getState().show('info', `${n} things grouped: a click picks them all, Alt+click one alone.`)
  return true
}

export function ungroupSelection(): boolean {
  const s = useApp.getState()
  const refs = pickedRefs()
  const was = s.project
  // asked before it comes apart: afterwards the masses are in no group
  const alone = massesAlone(refs)
  if (alone) {
    const ids = s.selection.massIds
    s.apply((p) => actions.ungroupMasses(p, ids))
  } else s.apply((p) => actions.ungroupRefs(p, useApp.getState().option, refs))
  if (useApp.getState().project === was) return false
  useToast.getState().show('info', alone ? 'Ungrouped: each mass on its own.' : 'Ungrouped: each one on its own.')
  return true
}

/** Why the selection cannot be merged; null when it can (the plan menu greys Merge out with it). */
export function mergeRefusal(): string | null {
  const s = useApp.getState()
  const ids = s.selection.massIds
  if (ids.length < 2) return 'Select two or more blocks that touch to merge them'
  const masses = s.project.masses.filter((m) => ids.includes(m.id))
  if (masses.some((m) => massIsLocked(s.project, m))) return 'A locked block keeps its shape: unlock it first'
  // blocks join as the warehouse's Union does (blocks of one type; each is a building of its own, so no one level)
  const blocks = actions.mergeBlocks(s.project, ids)
  if (blocks) return 'reason' in blocks ? blocks.reason : null
  if (masses.some((m) => m.levelId !== masses[0].levelId)) return 'They stand on different levels'
  return actions.mergeMasses(s.project, ids) ? null : 'They do not all touch: merge masses that share a wall or overlap'
}

/**
 * What greys Union's button, its row and its key: `mergeRefusal` but for blocks of two types, which stays pressable so the press says why in a
 * toast (a greyed button says nothing when pressed; Phase D.3). `true`: it can be pressed.
 */
export function unionGreyed(): string | true {
  const why = mergeRefusal()
  return why === null || why.startsWith('Blocks of different types') ? true : why
}

export function mergeSelection(): boolean {
  const s = useApp.getState()
  const refused = mergeRefusal()
  if (refused) {
    useToast.getState().show('info', `${refused}.`)
    return false
  }
  const n = s.selection.massIds.length
  let id: Id | null = null
  s.apply((p) => {
    const r = actions.mergeMasses(p, s.selection.massIds)
    id = r?.id ?? null
    return r ? r.project : p
  })
  if (id === null) return false
  useApp.getState().select(id)
  useToast.getState().show('info', `${n} blocks merged into one.`)
  return true
}

export function rotateSelection(degrees: number) {
  const s = useApp.getState()
  s.apply((p) => actions.rotateMasses(p, s.selection.massIds, degrees))
}

/** What Delete says of a drawing picked with the rest (Decision "Drawings move": a drawing is removed from its row in Layers). */
export const DRAWING_STAYS = 'Remove a drawing from its row in Layers'

export function deleteSelection() {
  const s = useApp.getState()
  // a smart block's part picked alone goes from its copy, not from its type (B.3)
  if (s.selection.massIds.length) s.apply((p) => actions.removeMassesWithBlocks(p, s.selection.massIds))
  tellDrawingsStay()
}

/** Whether a drawing is picked (Decision "Drawing pick"). */
export const drawingsPicked = (): boolean => pickedNow().drawings.length > 0

/** Shows `text`, unless it shows already (a key held repeats its press). */
export function tellOnce(text: string): void {
  const toast = useToast.getState()
  if (toast.toast?.text !== text) toast.show('info', text)
}

/** Delete leaves the drawings picked where they are, and says where to remove one (once while the key is held). */
export function tellDrawingsStay(): void {
  if (drawingsPicked()) tellOnce(DRAWING_STAYS)
}

/** Why Select all does nothing: with every level shown nothing is selected (the store's `showAll`); null otherwise. */
export const selectAllRefusal = (): string | null => (useApp.getState().showAll ? 'Not while every level is shown' : null)

/** Every mass of the active level but the locked ones (the padlock is CAD's) and those whose eye is off, as Ctrl+A. */
export function selectAllHere() {
  const s = useApp.getState()
  const off = hiddenNow()
  const ids = s.project.masses.filter((m) => m.levelId === s.level && !massIsLocked(s.project, m) && !massEyeOff(off, m.id)).map((m) => m.id)
  // the masses, and nothing else (a dimension picked goes): through the bridge; with none, the selection is emptied as ever
  if (ids.length > 0) pickRefs(ids.map((id) => ({ kind: 'mass', id })))
  else s.selectMany([])
}

/** The panel's Properties tab, shown on every width (the panel opens, a sheet below 880 px; the selection's card over the viewport stands as well). */
export function showProperties() {
  useUi.getState().setRail('properties')
  showPanel('left')
}
