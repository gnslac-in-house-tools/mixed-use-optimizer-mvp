// Mixed selection on the plan (Decision "Mixed selection"): Shift+click and the selection window pick every kind at
// once, masses, streets, existing streets (Phase PE.2), lots, gates, dimensions, reference lines and notes, and Shift+click the imported drawings (Decision "Drawing pick": the
// window does not pick them). Each kind keeps its own store (`useApp` selection, `useRoads`, `useLots`, `useAccess`,
// `useDimensions`, `useAnnotations` (the reference lines and the notes, Phase AS.5), `useDrawingPick`); a plain click still picks one thing alone, and the stores clear each other
// as they did (the drawings' and the annotations' here). Here a pick is made `together`: while it runs the stores' "one kind at a time"
// subscriptions stand aside.
//   addToMix      Shift+click: adds the thing to what is picked (any kind), or takes it out
//   pickedNow     everything picked, by kind, as the verbs take it (`Picked`: a street as its nodes)
//   selectBox     the window's pick: every kind the box picks, on this level
//   setPicked     picks exactly this (after Copy the originals, after Move the moved)
//   letGoAll      nothing picked, of any kind (Escape)
//   pickedRefs    everything picked as `Ref`s (kinds/types.ts), whichever store holds it; a building or a level (a row of Layers) only when no object is picked: a building
//                 marked beside the masses selected (its right-click, for *Assign selection to*) is not what the commands' keys and the objects' menus act on;
//                 usePickedRefs follows the stores; pickRefs picks exactly some Refs, or adds them; drawingRef is a part of a drawing as one (Phase AS.4)
// What an eye hides (views/layers) the window skips, and what is picked and then hidden is let go (layers/letGo.ts, loaded here).
// A group of any kind (Phase AS.5 task 6, Decision "Groups of any kind") is picked as one whatever its kinds, through the functions below (`groupOnPlan`, `pickGroup`, and the
// group branches of `addToMix`, `selectBox` and `pickRefForMenu`): a click on a member picks the whole group, Shift adds or takes it out whole, the window takes whole groups, Alt picks
// one member alone; what is locked or hidden, or not shown (another level's note, a mass of a building the option does not show), is left out of it, and a click moves the plan to another level only
// when the thing clicked is a mass (the store's `joinable` is the rule for the masses). A group of masses alone is `massCommands.ts`'s, as ever.
// A locked mass is not picked by a Shift+click or the window either, nor is a locked member of a group that is (the padlock is CAD's);
// nor is a member the plan does not draw (its building's eye is off): a group that spans buildings never brings back an unseen mass.
import { useMemo } from 'react'
import { groupMembers, refGroupMembers, withGroups, withRefGroups, type Member } from '../../engine/groups.ts'
import type { Ref } from '../../kinds/types.ts'
import { existingRoadLocked, gateLocked, lockedNodeIds, lotLocked, massIsLocked, noteLocked, referenceLineLocked, streetLockState } from '../../kinds/locked.ts'
import type { Id } from '../../model/schema.ts'
import { NOTHING_PICKED, type DrawingPart, type Picked } from '../../model/picked.ts'
import { pickedLotIds, useLots } from '../../modules/parking/views/lotState.ts'
import { joinable, useApp } from '../../state/store.ts'
import { massEyeOff, massHiddenOnPlan, otherMasses } from '../buildingView.ts'
import { isObjectHidden, isStreetHidden, roadHidden } from '../layers/keys.ts'
import { plainRow } from '../layers/gone.ts'
import { isMassLocked, isRefLocked, tellLockedPick } from '../layers/locks.ts'
import '../layers/letGo.ts'
import { hiddenNow, useLayerView } from '../layers/layerView.ts'
import { useLayerPick } from '../layers/layerPick.ts'
import { pickedGateIds, pickedSiteItems, useAccess } from './access/accessState.ts'
import { useAnnotations } from './annotations/annotationState.ts'
import { pickedIds, runsOf, streetIdOf, useRoads } from './circulation/roadState.ts'
import { mixing, together } from './mixing.ts'
import { partsShown, samePart, useDrawingPick } from './site/drawingPick.ts'
import { selectedDimensionIds, useDimensions } from './tools/toolState.ts'
import { noteBox } from './annotations/noteLook.ts'
import { massesInBox, picks, picksLine, pointInBox, type Box } from './windowSelect.ts'

export { mixing, together }

export type MixKind = 'mass' | 'road' | 'existing' | 'lot' | 'gate' | 'dimension' | 'reference-line' | 'note' | 'drawing'

/** A mass added to the masses picked, or taken out, with its group but for its locked and its hidden members (`alone`: that mass only; Alt+click). */
function toggleMass(id: Id, alone: boolean): void {
  const s = useApp.getState()
  if (isMassLocked(id)) return
  const off = hiddenNow()
  const group = (alone ? [id] : groupMembers(s.project, id)).filter((x) => !isMassLocked(x) && !massHiddenOnPlan(s.project, s.level, x, off))
  if (group.length === 1) return s.toggleSelect(id)
  const sel = s.selection.massIds
  const all = group.every((x) => sel.includes(x))
  s.selectMany(all ? sel.filter((x) => !group.includes(x)) : [...sel, ...group])
}

const MIX_KIND: Record<string, string> = { road: 'street', existing: 'existing-road' }
const refOf = (kind: Exclude<MixKind, 'drawing'>, id: string): Ref => ({ kind: MIX_KIND[kind] ?? kind, id })
const sameRef = (a: Member, b: Member): boolean => a.kind === b.kind && a.id === b.id

/**
 * Whether the plan shows this thing and it may be picked: not hidden by an eye, not locked (the padlock is CAD's), on the level in view (a note, a dimension), a mass
 * of that level or of a building of the option the plan shows as context (the store's own rule for what can be picked together, `joinable`). `view`: the level the plan is
 * on, and whether it shows every level; the one in the store by default.
 */
function pickableOnPlan(ref: Member, view?: { level: Id; showAll: boolean }): boolean {
  const { project, derived, option } = useApp.getState()
  const { level, showAll } = view ?? useApp.getState()
  if (isRefLocked(ref)) return false
  const off = hiddenNow()
  // the level's things, in the level: none in All levels (the plan answers nothing there)
  switch (ref.kind) {
    case 'mass': {
      const m = project.masses.find((x) => x.id === ref.id)
      return m !== undefined && !massHiddenOnPlan(project, level, ref.id, off) && joinable(project, level, option, showAll, m)
    }
    case 'street': {
      const runs = runsOf(derived.circulation.roads, ref.id)
      return !showAll && runs.length > 0 && !isStreetHidden(off, runs.flatMap((x) => x.segments ?? []))
    }
    case 'existing-road':
      return !showAll && (project.site.existingRoads ?? []).some((r) => r.id === ref.id) && !isObjectHidden(off, 'existing-road', ref.id)
    case 'lot':
      return !showAll && derived.circulation.lots.some((l) => l.id === ref.id) && !isObjectHidden(off, 'lot', ref.id)
    case 'gate':
      return !showAll && derived.circulation.gates.some((g) => g.id === ref.id) && !isObjectHidden(off, 'gate', ref.id)
    case 'dimension':
      return !showAll && project.dimensions?.some((d) => d.id === ref.id && d.levelId === level) === true && !isObjectHidden(off, 'dimension', ref.id)
    case 'reference-line':
      return !showAll && project.referenceLines?.some((r) => r.id === ref.id) === true && !isObjectHidden(off, 'reference-line', ref.id)
    case 'note':
      return !showAll && project.notes?.some((n) => n.id === ref.id && n.levelId === level) === true && !isObjectHidden(off, 'note', ref.id)
    default:
      return false
  }
}

/**
 * What a click on this thing picks with it: its group's members that the plan shows and the padlock leaves free, itself among them. Null when the click
 * picks the thing alone: `alone` (Alt), no group, only itself left to pick, or a group of masses alone (`pickOnPlan` in `massCommands.ts` picks those).
 * The one rule of a group's pick: every layer's click, Shift+click, right-click and the window ask it. What the plan can pick is the level in view and the buildings the
 * option shows (`pickableOnPlan`). `goTo`: the thing is a mass, and the click will take the plan to its level (`pickGroup`), so that level is the one in view.
 */
export function groupOnPlan(ref: Ref, alone = false, goTo = false): Ref[] | null {
  if (alone) return null
  const { project, option } = useApp.getState()
  const members = refGroupMembers(project, option, ref)
  if (members.length < 2 || members.every((m) => m.kind === 'mass')) return null
  const mass = goTo && ref.kind === 'mass' ? project.masses.find((m) => m.id === ref.id) : undefined
  const view = mass ? { level: mass.levelId, showAll: false } : undefined
  const free = members.filter((m) => pickableOnPlan(m, view))
  return free.length > 1 && free.some((m) => sameRef(m, ref)) ? free : null
}

/**
 * Whether these things are one whole group as far as the plan can pick it: every member the plan shows and the padlock leaves free, no more and no less (a group with a locked
 * lot is whole when all the rest of it is picked). The frame a group shows asks it.
 */
export function oneGroupOnPlan(refs: Ref[]): boolean {
  if (refs.length < 2) return false
  const group = groupOnPlan(refs[0])
  return group !== null && group.length === refs.length && refs.every((r) => group.some((m) => sameRef(m, r)))
}

/**
 * A click on the thing picks its group whole, of any kind (false when it picks the thing alone: the layer's own pick does that). The plan goes to the level of the thing
 * clicked when it is a mass, as a click on it does (`goTo`; false for a pick that stays where the plan is: Ctrl+G); a click on any other thing leaves the level as it is.
 */
export function pickGroup(ref: Ref, alone = false, goTo = true): boolean {
  const group = groupOnPlan(ref, alone, goTo)
  if (!group) return false
  together(() => {
    if (goTo && ref.kind === 'mass') useApp.getState().select(ref.id)
    pickRefs(group)
  })
  return true
}

/** Shift+click on a member of a group of any kind: the whole group joins what is picked, or, when it is all picked, goes out of it. */
function toggleGroup(group: Ref[]): void {
  const have = pickedRefs()
  const all = group.every((g) => have.some((h) => sameRef(g, h)))
  const next = all ? have.filter((h) => !group.some((g) => sameRef(g, h))) : [...have, ...group]
  pickRefs(next)
}

/** Shift+click: adds it to what is picked (any kind), or takes it out. `alone`: a mass without its group. */
export function addToMix(kind: 'drawing', part: DrawingPart): void
export function addToMix(kind: Exclude<MixKind, 'drawing'>, id: string, alone?: boolean): void
export function addToMix(kind: MixKind, id: string | DrawingPart, alone = false): void {
  together(() => {
    const group = typeof id === 'string' && kind !== 'drawing' && !isRefLocked(refOf(kind, id)) ? groupOnPlan(refOf(kind, id), alone) : null
    if (group) toggleGroup(group)
    else if (typeof id !== 'string') useDrawingPick.getState().toggle(id)
    else if (kind === 'mass') toggleMass(id, alone)
    // a locked street, lot or gate is not picked by a Shift+click either (the plan's own press never gets here: it is the background's)
    else if (kind === 'road') {
      if (!isRefLocked({ kind: 'street', id })) useRoads.getState().toggle(id)
    } else if (kind === 'existing') {
      if (!isRefLocked({ kind: 'existing-road', id })) useAccess.getState().toggleSite(id)
    } else if (kind === 'lot') {
      if (!isRefLocked({ kind: 'lot', id })) useLots.getState().toggle(id)
    } else if (kind === 'gate') {
      if (!isRefLocked({ kind: 'gate', id })) useAccess.getState().toggleGate(id)
    } else if (kind === 'reference-line') {
      if (!isRefLocked({ kind: 'reference-line', id })) useAnnotations.getState().toggleLine(id)
    } else if (kind === 'note') {
      if (!isRefLocked({ kind: 'note', id })) useAnnotations.getState().toggleNote(id)
    } else useDimensions.getState().toggleSelect(id)
  })
}

const unique = <T,>(xs: T[]): T[] => [...new Set(xs)]

/**
 * Everything picked now, by kind, as the verbs take it (a street road as its nodes; only kind `street` roads). Every node of the street is there,
 * the ones a locked segment holds too: a copy changes nothing locked, so it is of the whole street (`withoutHeld` leaves them out for moving and turning).
 */
export function pickedNow(): Picked {
  const { project, derived, level, showAll, selection } = useApp.getState()
  const roads = derived.circulation.roads
  const streets = pickedIds(useRoads.getState()).flatMap((id) => runsOf(roads, id))
  const nodes = unique(streets.flatMap((r) => r.nodes ?? []))
  const lots = pickedLotIds(useLots.getState()).filter((id) => derived.circulation.lots.some((l) => l.id === id))
  const gates = pickedGateIds(useAccess.getState()).filter((id) => derived.circulation.gates.some((g) => g.id === id))
  const dimensions = showAll
    ? []
    : selectedDimensionIds(useDimensions.getState()).filter((id) => project.dimensions?.some((d) => d.id === id && d.levelId === level))
  // a drawing picked whole, without the layers the eye hides (hidden is the viewer's: the verbs never read it)
  const hidden = useLayerView.getState().hidden
  const shown = useDrawingPick.getState().picked.flatMap((part) => partsShown(project, part, hidden))
  const drawings = shown.filter((p, i) => shown.findIndex((q) => samePart(p, q)) === i)
  // the reference lines (the project's: no level) and the notes (on a level, as a dimension is) that are still there: one a verb took away is not picked
  const lines = useAnnotations.getState().lines.filter((id) => project.referenceLines?.some((r) => r.id === id))
  const notes = showAll ? [] : useAnnotations.getState().notes.filter((id) => project.notes?.some((n) => n.id === id && n.levelId === level))
  // the existing streets picked that are still there (the access store holds them beside the gates)
  const existing = pickedSiteItems(useAccess.getState()).map((x) => x.id).filter((id) => project.site.existingRoads?.some((r) => r.id === id))
  return { masses: selection.massIds, nodes, existing, lots, gates, dimensions, lines, notes, drawings }
}

/**
 * What Move and Rotate take of what is picked: the nodes a locked segment holds are left out (a street with only some segments locked moves and turns by
 * its free ones, and the locked segments stay where they are). A copy takes `pickedNow()` whole.
 */
export function withoutHeld(picked: Picked): Picked {
  const { project, option } = useApp.getState()
  const held = lockedNodeIds(project, option)
  return held.size === 0 ? picked : { ...picked, nodes: picked.nodes.filter((id) => !held.has(id)) }
}

export function nothingPicked(): boolean {
  const p = pickedNow()
  return (Object.keys(NOTHING_PICKED) as (keyof Picked)[]).every((k) => p[k].length === 0)
}

/** Every thing of every kind but the drawings let go (the masses too, the reference lines and the notes). */
function clearDesign(): void {
  useAnnotations.getState().clear()
  useApp.getState().select(null)
  useDimensions.getState().select(null)
  useAccess.getState().pick(null)
  useRoads.getState().pick(null)
  useLots.getState().pick(null)
}

/** Every thing of every kind let go (the masses and the drawings too). */
function clearAll(): void {
  clearDesign()
  useDrawingPick.getState().pick(null)
}

/** Everything picked let go, of every kind, lots too (Escape with nothing else to cancel). */
export function letGoAll(): void {
  together(clearAll)
}

/** The streets, lots, gates, dimensions, reference lines, notes and existing streets set as picked (the first is the one, the rest its `also`; a gate is the access store's first). */
function setOthers(roads: string[], lots: Id[], gates: Id[], dimensions: Id[], lines: Id[] = [], notes: Id[] = [], existing: Id[] = []): void {
  useRoads.setState({ picked: roads[0] ?? null, node: null, also: roads.slice(1) })
  useLots.setState({ picked: lots[0] ?? null, also: lots.slice(1) })
  useAccess.getState().set(gates, existing)
  useDimensions.setState({ selected: dimensions[0] ?? null, also: dimensions.slice(1) })
  useAnnotations.getState().set(lines, notes)
}

/**
 * The window's pick: every kind the box picks, shown on this level. `add`: keeps what was picked. `px`: one screen pixel in metres (`1 / camera.scale`), which a note's extent
 * is measured by (its text is the same size on screen at any zoom: `annotations/noteLook.ts`); without it the plan cannot say how big a note is, and a note is its point.
 */
export function selectBox(box: Box, add: boolean, px?: number): void {
  const { project, derived, level, option, showAll } = useApp.getState()
  // the active level's masses and the option's other buildings, as the plan shows them
  const shown = showAll ? [] : [...project.masses.filter((m) => m.levelId === level && !massEyeOff(useLayerView.getState().hidden, m.id)), ...otherMasses(project, level, option, useLayerView.getState().hidden)].filter((m) => !massIsLocked(project, m))
  const masses = massesInBox(
    shown.map((m) => ({ id: m.id, polygon: derived.masses[m.id]?.polygon ?? [] })),
    box,
  )
  // what the eyes hide is not on the plan: the window skips it (the figures and the project still hold it)
  const off = hiddenNow()
  // nor does it take what is locked (a street with all its segments locked, a lot, a gate: the padlock is CAD's; a street with only some is mixed, and is picked)
  const roads = derived.circulation.roads.filter((r) => r.kind === 'street' && !roadHidden(off, r) && streetLockState(project, option, r.segments ?? []) !== 'locked' && picksLine(r.points, box)).map(streetIdOf).filter((id, i, all) => all.indexOf(id) === i)
  const lots = derived.circulation.lots.filter((l) => !isObjectHidden(off, 'lot', l.id) && !lotLocked(project, option, l.id) && picks(l.polygon, box)).map((l) => l.id)
  const gates = derived.circulation.gates.filter((g) => !isObjectHidden(off, 'gate', g.id) && !gateLocked(project, option, g.id) && pointInBox(g.at, box)).map((g) => g.id)
  // an existing street (one per road, not per run): by its centre line, the padlock leaving a locked one out
  const sites = derived.circulation.roads
    .filter((r) => r.kind === 'existing' && !roadHidden(off, r) && !existingRoadLocked(project, r.sourceId ?? r.id) && picksLine(r.points, box))
    .map((r) => r.sourceId ?? r.id)
    .filter((id, i, all) => all.indexOf(id) === i)
  const dims = !showAll ? (project.dimensions ?? []).filter((d) => d.levelId === level && !isObjectHidden(off, 'dimension', d.id) && picksLine([d.a, d.b], box)).map((d) => d.id) : []
  // the project's reference lines, on every level, but not in All levels (the plan answers nothing there), not a hidden one, not a locked one (the padlock is CAD's)
  const guides = !showAll ? (project.referenceLines ?? []).filter((r) => !isObjectHidden(off, 'reference-line', r.id) && !referenceLineLocked(project, r.id) && picksLine(r.points, box)).map((r) => r.id) : []
  // the notes of this level (none in All levels, as the dimensions), not a hidden one, not a locked one: by the extent of their text, or by their point
  const texts = !showAll
    ? (project.notes ?? [])
        .filter((n) => n.levelId === level && !isObjectHidden(off, 'note', n.id) && !noteLocked(project, n.id) && (px === undefined ? pointInBox(n.at, box) : picks(noteBox(n, px).polygon, box)))
        .map((n) => n.id)
    : []
  // what a group has beside what the box took comes with it, whatever its kinds (a locked, hidden or unseen member is left out, as it is for one the box touches)
  const found: Member[] = [
    ...masses.map((id): Member => ({ kind: 'mass', id })),
    ...roads.map((id): Member => ({ kind: 'street', id })),
    ...sites.map((id): Member => ({ kind: 'existing-road', id })),
    ...lots.map((id): Member => ({ kind: 'lot', id })),
    ...gates.map((id): Member => ({ kind: 'gate', id })),
    ...dims.map((id): Member => ({ kind: 'dimension', id })),
    ...guides.map((id): Member => ({ kind: 'reference-line', id })),
    ...texts.map((id): Member => ({ kind: 'note', id })),
  ]
  const more = withRefGroups(project, option, found).filter((m) => !found.some((f) => sameRef(f, m)) && pickableOnPlan(m))
  const plus = (kind: string): Id[] => more.filter((m) => m.kind === kind).map((m) => m.id)
  together(() => {
    const kept = {
      roads: add ? pickedIds(useRoads.getState()) : [],
      lots: add ? pickedLotIds(useLots.getState()) : [],
      gates: add ? pickedGateIds(useAccess.getState()) : [],
      sites: add ? pickedSiteItems(useAccess.getState()).map((x) => x.id) : [],
      dimensions: add ? selectedDimensionIds(useDimensions.getState()) : [],
      lines: add ? useAnnotations.getState().lines : [],
      notes: add ? useAnnotations.getState().notes : [],
    }
    if (!add) clearAll()
    // a mass of a group brings its group (Decision "Groups")
    // a locked member of a group the window picks is left out, as a locked mass the window touches is; so is a hidden one
    // (a group that spans buildings would bring back a mass the plan does not draw)
    useApp.getState().selectMany(unique([...withGroups(project, masses).filter((id) => !isMassLocked(id) && !massHiddenOnPlan(project, level, id, off)), ...plus('mass')]), add)
    setOthers(
      unique([...kept.roads, ...roads, ...plus('street')]),
      unique([...kept.lots, ...lots, ...plus('lot')]),
      unique([...kept.gates, ...gates, ...plus('gate')]),
      unique([...kept.dimensions, ...dims, ...plus('dimension')]),
      unique([...kept.lines, ...guides, ...plus('reference-line')]),
      unique([...kept.notes, ...texts, ...plus('note')]),
      unique([...kept.sites, ...sites, ...plus('existing-road')]),
    )
  })
}

/**
 * Picks exactly this (after Copy, the originals stay picked; after Move, the moved). `roads`: the streets' derived ids,
 * `picked.nodes` are theirs; `picked.drawings`: the drawings' parts, as the store held them.
 */
export function setPicked(roads: string[], picked: Picked): void {
  together(() => {
    clearAll()
    if (picked.masses.length) useApp.getState().selectMany(picked.masses)
    setOthers(roads, picked.lots, picked.gates, picked.dimensions, picked.lines, picked.notes, picked.existing)
    useDrawingPick.getState().set(picked.drawings)
  })
}

// ---- The bridge's reference (Phase AS.4, Decision "Kinds"): what is picked as `Ref`s, whatever store holds it ----

const refKey = (r: Ref): string => `${r.kind}/${r.file ?? ''}/${r.id}`
const uniqueRefs = (refs: Ref[]): Ref[] => refs.filter((r, i) => refs.findIndex((q) => refKey(q) === refKey(r)) === i)

/** A part of a drawing as a `Ref`: a layer and a file's parcels carry their file (the layer's name, the file's name as the id). */
export function drawingRef(part: DrawingPart): Ref {
  if (part.layer !== undefined) return { kind: 'drawing-layer', id: part.layer, file: part.file }
  return { kind: part.parcels ? 'parcels' : 'drawing', id: part.file, file: part.file }
}

/** The `Ref` of a row of Layers that is not an object (a building, a level, a file, a layer, a file's Parcels); null for the rest (a branch, a kind's row, an object's own row, which its store holds). */
function rowRef(row: string): Ref | null {
  const [head, ...rest] = plainRow(row).split(':')
  const name = rest.join(':')
  if (name === '') return null
  if (head === 'building' || head === 'level') return { kind: head, id: name }
  if (head === 'file') return { kind: 'drawing', id: name, file: name }
  if (head === 'parcels') return { kind: 'parcels', id: name, file: name }
  if (head === 'layer') {
    const slash = name.indexOf('/')
    return slash < 0 ? null : { kind: 'drawing-layer', id: name.slice(slash + 1), file: name.slice(0, slash) }
  }
  return null
}

/**
 * Everything picked now, as `Ref`s: the masses, the streets (the derived road's id, as the stores hold it), the existing road
 * the access store holds, the lots, the gates, the dimensions, the reference lines, the notes, the parts of drawings (without the layers the eye
 * hides), and the rows of Layers that are not objects (a building, a level, a file…) when no object is picked. In that order, each kind in the order it was
 * picked. A kind that has no `Ref` (a branch's row, a hole or a rule of the graph) is not given.
 *
 * The rows are left out beside objects: a building's right-click marks it and leaves the masses selected, which its *Assign selection to* acts on, but what is
 * picked, for Lock, Hide, Delete and the objects' menus, is the masses (the building's own menu is asked with its own refs).
 */
export function pickedRefs(): Ref[] {
  const { derived } = useApp.getState()
  const now = pickedNow()
  const streets = pickedIds(useRoads.getState()).filter((id) => runsOf(derived.circulation.roads, id).length > 0)
  const rows = useLayerPick.getState().keys.flatMap((k) => rowRef(k) ?? [])
  const objects: Ref[] = [
    ...now.masses.map((id) => ({ kind: 'mass', id })),
    ...streets.map((id) => ({ kind: 'street', id })),
    ...now.existing.map((id) => ({ kind: 'existing-road', id })),
    ...now.lots.map((id) => ({ kind: 'lot', id })),
    ...now.gates.map((id) => ({ kind: 'gate', id })),
    ...now.dimensions.map((id) => ({ kind: 'dimension', id })),
    ...now.lines.map((id) => ({ kind: 'reference-line', id })),
    ...now.notes.map((id) => ({ kind: 'note', id })),
    ...now.drawings.map(drawingRef),
  ]
  return uniqueRefs(objects.length > 0 ? objects : rows)
}

/** `pickedRefs()` as the stores change (a view that menus or verbs read what is picked from). */
export function usePickedRefs(): Ref[] {
  const selection = useApp((s) => s.selection)
  const project = useApp((s) => s.project)
  const derived = useApp((s) => s.derived)
  const level = useApp((s) => s.level)
  const showAll = useApp((s) => s.showAll)
  const road = useRoads((s) => s.picked)
  const roads = useRoads((s) => s.also)
  const lot = useLots((s) => s.picked)
  const lots = useLots((s) => s.also)
  const access = useAccess((s) => s.picked)
  const alsoSite = useAccess((s) => s.alsoSite)
  const gates = useAccess((s) => s.alsoGates)
  const dimension = useDimensions((s) => s.selected)
  const dimensions = useDimensions((s) => s.also)
  const guides = useAnnotations((s) => s.lines)
  const notes = useAnnotations((s) => s.notes)
  const drawings = useDrawingPick((s) => s.picked)
  const hidden = useLayerView((s) => s.hidden)
  const rows = useLayerPick((s) => s.keys)
  return useMemo(pickedRefs, [selection, project, derived, level, showAll, road, roads, lot, lots, access, alsoSite, gates, dimension, dimensions, guides, notes, drawings, hidden, rows])
}

/**
 * Picks exactly these, of any kind (`add`: keeps what is picked, the same thing never twice): the masses, streets, existing streets, lots, gates,
 * dimensions, reference lines and notes, the parts of drawings, and a building or a level
 * as the row of Layers it is. Nothing is filtered here (a locked or hidden object is the caller's to leave out, as each pick
 * site does); a kind it does not know is left. An empty list lets everything go.
 */
export function pickRefs(refs: Ref[], add = false): void {
  const all = uniqueRefs(add ? [...pickedRefs(), ...refs] : refs)
  const ids = (kind: string) => all.filter((r) => r.kind === kind).map((r) => r.id)
  const parts = all.flatMap((r): DrawingPart[] => {
    if (r.kind === 'drawing') return [{ file: r.file ?? r.id }]
    if (r.kind === 'drawing-layer') return r.file === undefined ? [] : [{ file: r.file, layer: r.id }]
    if (r.kind === 'parcels') return [{ file: r.file ?? r.id, parcels: true }]
    return []
  })
  const rows = all.filter((r) => r.kind === 'building' || r.kind === 'level').map((r) => `${r.kind}:${r.id}`)
  const gates = ids('gate')
  const objects = ['mass', 'street', 'existing-road', 'lot', 'gate', 'dimension', 'reference-line', 'note', 'drawing', 'drawing-layer', 'parcels'].some((k) => all.some((r) => r.kind === k))
  together(() => {
    if (objects || rows.length === 0) {
      setPicked(ids('street'), { ...NOTHING_PICKED, masses: ids('mass'), existing: ids('existing-road'), lots: ids('lot'), gates, dimensions: ids('dimension'), lines: ids('reference-line'), notes: ids('note'), drawings: parts })
    }
    // a row of Layers: alone, it lets every object go; beside objects, it leaves them (Layers' own right-click on a building)
    if (rows.length > 0) useLayerPick.getState().set(rows, objects)
    else useLayerPick.getState().clear()
  })
}

/**
 * Whether anything is picked, of any kind (`nothingPicked`), as the stores that hold a pick change: a command that reads it (Move, Copy and Rotate: "Pick
 * something first"; Group, Union) stands in a view that renders again with it. The tools bar and the Tools strip use it.
 */
export function usePickedAny(): boolean {
  usePickedRefs() // renders again as any store that holds a pick, the eyes or the project change
  return !nothingPicked()
}

/** The dimension picked (the first), as its store changes: what the command line follows while the Select tool is on. */
export const useSelectedDimension = (): Id | null => useDimensions((s) => s.selected)

/**
 * What the general tools (Move, Copy, Rotate) hold besides `pickedNow()`: the streets picked (their street ids), and the drawings'
 * parts as their store held them (to pick them again).
 */
export function pickedHeld(): { roads: string[]; drawings: DrawingPart[] } {
  return { roads: pickedIds(useRoads.getState()), drawings: useDrawingPick.getState().picked }
}

/** Lets go of what is picked of one kind, and keeps the rest (the Properties of a dimension, its clear button). */
export function letGoKind(kind: string): void {
  pickRefs(pickedRefs().filter((r) => r.kind !== kind))
}

/** A press on the background that hits a drawing's line: that part alone is picked (a Shift+click is `addToMix('drawing', part)`). */
export function pickDrawing(part: DrawingPart): void {
  useDrawingPick.getState().pick(part)
}

/** A right-click on a drawing's line: its part is picked first, unless it is picked already. */
export function pickDrawingForMenu(part: DrawingPart): boolean {
  return pickRefForMenu(drawingRef(part))
}

/**
 * A right-click on a street, a lot, a gate or a dimension (the plan's): what is picked already, with the click on one of it, is the selection the menu is
 * of; anything else is picked alone first (as a mass is, `pickForMenu`). A locked one is not picked: the notice says where the lock comes off, and false
 * says no menu opens (it would act on what else is picked).
 */
export function pickRefForMenu(ref: Ref): boolean {
  if (pickedRefs().some((r) => refKey(r) === refKey(ref))) {
    // the right-click is on a thing of the selection: the rows marked beside it (a building's) let go, so the menu and the keys are of the things alone
    useLayerPick.getState().clear()
    return true
  }
  if (isRefLocked(ref)) {
    tellLockedPick()
    return false
  }
  if (!pickGroup(ref)) pickRefs([ref])
  return true
}

// One kind at a time, as the other stores do (Decision "Drawing pick"): a mass, a street, a lot, a gate or a dimension
// picked alone (a plain click) lets the drawings and the annotations (reference lines, notes) go, and a drawing picked alone lets every other kind go; so does
// an annotation picked alone (below). Shift+click and `setPicked` pick `together`, so these stand aside.
const letDrawingsGo = () => {
  if (mixing.on) return
  if (useDrawingPick.getState().picked.length) useDrawingPick.getState().pick(null)
  useAnnotations.getState().clear()
}
useApp.subscribe((s, before) => {
  if (s.selection.massIds.length > 0 && s.selection.massIds !== before.selection.massIds) letDrawingsGo()
})
useRoads.subscribe((s, before) => {
  if (s.picked !== null && (s.picked !== before.picked || s.also !== before.also)) letDrawingsGo()
})
useLots.subscribe((s, before) => {
  if (s.picked !== null && (s.picked !== before.picked || s.also !== before.also)) letDrawingsGo()
})
useAccess.subscribe((s, before) => {
  if (s.picked !== null && (s.picked !== before.picked || s.alsoGates !== before.alsoGates)) letDrawingsGo()
})
useDimensions.subscribe((s, before) => {
  if (s.selected !== null && (s.selected !== before.selected || s.also !== before.also)) letDrawingsGo()
})
useDrawingPick.subscribe((s, before) => {
  if (mixing.on || !s.picked.length || s.picked === before.picked) return
  together(clearDesign)
})
// a reference line or a note picked alone (a plain click) lets every other kind go, the drawings too
useAnnotations.subscribe((s, before) => {
  if (mixing.on || (s.lines === before.lines && s.notes === before.notes) || s.lines.length + s.notes.length === 0) return
  together(() => {
    useApp.getState().select(null)
    useDimensions.getState().select(null)
    useAccess.getState().pick(null)
    useRoads.getState().pick(null)
    useLots.getState().pick(null)
    useDrawingPick.getState().pick(null)
  })
})
