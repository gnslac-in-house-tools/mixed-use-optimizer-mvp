// What the Program window does for a Warehouse program (Decisions "Warehouse layout", "Program rule set layout"), through `actions` and the store: one undo step each.
// And the site's block tools as commands (Project C, AS.1; `COMMANDS`, below): Dock K, Door J, Pattern N and Court Y, the
// warehouse module's, which Tools › Elements lists while a typology offers the module (views/commands/index.ts); and the
// block editor's bottom-bar keys as commands (`BLOCK_EDITOR_COMMANDS`): Dimension D, Ruler T, Snap F3, Ortho F8, Grid F9,
// answered in the Program window alone (`where: ['block-editor']`), that window's own (`window: 'block-editor'`: in no menu,
// the window covers the menu bar) and listed in the shortcuts window under *Block editor*.
import type { Ref } from '../../../kinds/types.ts'
import { WAREHOUSE_STEPS, type HallElement, type HallZone, type Id, type Point, type Project, type WarehouseOverrides, type WarehouseStep, type WarehouseType } from '../../../model/schema.ts'
import { stepNumber, stepStatus, type StepPatch } from '../engine/steps.ts'
import { hallRuns } from '../engine/generate.ts'
import { zonesOf } from '../engine/zones.ts'
import { circled, STEP_NAMES } from './summary.ts'
import { mergedOf, type ShapeEdit } from '../engine/shape.ts'
import { actions } from '../../../state/actions/index.ts'
import { useApp } from '../../../state/store.ts'
import { useWarehouse, type Picked } from './warehouseState.ts'
import { draggedBlock, libraryBlock } from './blockLibrary.ts'
import { gridOf } from '../../../engine/grid/index.ts'
import { centroid } from '../../../engine/geom/polygon.ts'
import { useUi } from '../../../views/layout/ui.ts'
import { useToast } from '../../../views/layout/toast.ts'
import { keyOrMenu } from '../../../views/commands/shortcuts.ts'
import type { Command } from '../../../views/commands/types.ts'
import { useSnapSettings, type SnapSwitch } from '../../../views/plan/snap/settings.ts'
import { inHand, toggle } from '../../../views/tools/hand.ts'
import { PLAN_OFF } from '../../../views/tools/pickTool.ts'
import { blockBarShown, toggleBlockDimension, toggleBlockRuler } from './blockBar.ts'
import { ELEMENT_TOOLS, siteBlockOf } from './siteBlockState.ts'

function applyReturning<T>(f: (p: Project) => { project: Project; value: T } | null): T | undefined {
  const out: { value?: T } = {}
  useApp.getState().apply((p) => {
    const r = f(p)
    if (!r) return p
    out.value = r.value
    return r.project
  })
  return out.value
}

/** A new type, picked. */
export function newType() {
  const id = applyReturning((p) => {
    const r = actions.addWarehouseType(p)
    return { project: r.project, value: r.id }
  })
  if (id) useWarehouse.getState().pick(id)
}

/** A copy of the type, picked. */
export function duplicateType(id: Id) {
  const copy = applyReturning((p) => {
    const r = actions.duplicateWarehouseType(p, id)
    return r && { project: r.project, value: r.id }
  })
  if (copy) useWarehouse.getState().pick(copy)
}

export function removeType(id: Id) {
  useApp.getState().apply((p) => actions.removeWarehouseType(p, id))
  useWarehouse.getState().pick(null)
}

/** A copy of each of these types (the Blocks tab's Duplicate, one undo step), the last one picked in the Program window; their ids. */
export function duplicateTypes(ids: Id[]): Id[] {
  const made: Id[] = []
  useApp.getState().apply((p) =>
    ids.reduce((q, id) => {
      const r = actions.duplicateWarehouseType(q, id)
      if (!r) return q
      made.push(r.id)
      return r.project
    }, p),
  )
  if (made.length > 0) useWarehouse.getState().pick(made[made.length - 1])
  return made
}

/** These types deleted (the Blocks tab's Delete, one undo step): their copies stay, unlinked. */
export function removeTypes(ids: Id[]) {
  useApp.getState().apply((p) => ids.reduce((q, id) => actions.removeWarehouseType(q, id), p))
  useWarehouse.getState().pick(null)
}

export const renameType = (id: Id, name: string) => useApp.getState().apply((p) => actions.renameWarehouseType(p, id, name))

export function updateStep<S extends WarehouseStep>(id: Id, step: S, patch: StepPatch[S]) {
  const before = typeNamed(id)
  useApp.getState().apply((p) => actions.updateWarehouseStep(p, id, step, patch))
  const after = typeNamed(id)
  told(before, after, step, noteOf(id, step, before, after))
}

/** Step 1 typed by the bay or by the module (Decision "Grid by line"); the grid stays as it is. */
export const setGridBy = (id: Id, by: 'bay' | 'module') => useApp.getState().apply((p) => actions.setGridBy(p, id, by))

/** A grid line moved by hand to the module line nearest `to` (m along its axis; Decision "Grid by line", GR.3). */
export function moveLine(id: Id, axis: 'x' | 'y', line: number, to: number) {
  const before = typeNamed(id)
  useApp.getState().apply((p) => actions.moveGridLine(p, id, axis, line, to))
  told(before, typeNamed(id), 'grid')
}

/** Several grid lines picked, dragged together by `by` modules (BE.9): all or none, none past a neighbour not picked. */
export function moveLines(id: Id, axis: 'x' | 'y', lines: number[], by: number) {
  const before = typeNamed(id)
  useApp.getState().apply((p) => actions.moveGridLines(p, id, axis, lines, by))
  told(before, typeNamed(id), 'grid')
}

/** A grid line deleted by hand (GR.3): the bays either side one. */
export function removeLine(id: Id, axis: 'x' | 'y', line: number) {
  const before = typeNamed(id)
  useApp.getState().apply((p) => actions.removeGridLine(p, id, axis, line))
  told(before, typeNamed(id), 'grid')
}

/** Step 1's *Regular grid again* (GR.3). */
export function regularGridAgain(id: Id) {
  const before = typeNamed(id)
  useApp.getState().apply((p) => actions.regularGrid(p, id))
  told(before, typeNamed(id), 'grid')
}

/** Step 1's *Set end bays automatically* (BE.6): the end bays laid once, the grid's own lines cleared. */
export function endsAutomatically(id: Id) {
  const before = typeNamed(id)
  useApp.getState().apply((p) => actions.setEndsAutomatically(p, id))
  const after = typeNamed(id)
  told(before, after, 'grid', merged(before, after))
}

/** The short end bays (Decision "Grid by line"; step 1's field): joined under `under` m; null: two thirds of a bay. */
export function setJoin(id: Id, under: number | null) {
  const before = typeNamed(id)
  useApp.getState().apply((p) => actions.setHallJoin(p, id, under))
  told(before, typeNamed(id), 'grid')
}

/**
 * What an edit of a step opened, told (Decision "Free steps"): the step itself, when it was locked, and the later ones
 * it sent to lock again; Ctrl+Z undoes it. Nothing opened: nothing said.
 */
function told(before: WarehouseType | undefined, after: WarehouseType | undefined, step: WarehouseStep, note: string | null = null) {
  if (!before || !after || after === before) return
  const reopened = stepStatus(before, step) === 'locked'
  const later = WAREHOUSE_STEPS.slice(WAREHOUSE_STEPS.indexOf(step) + 1).filter((s) => before.locks?.[s] === 'locked' && after.locks?.[s] === 'again')
  if (!reopened && !later.length && !note) return
  const again = later.length ? `${later.map((s) => circled(stepNumber(s))).join(' ')} to lock again` : ''
  const what = reopened ? `${circled(stepNumber(step))} ${STEP_NAMES[step]} reopened${again ? `; ${again}` : ''}` : again
  useToast.getState().show('info', `${[note, what].filter(Boolean).join('; ')}. ${keyOrMenu('edit.undo', 'Edit › Undo')} undoes it.`)
}

const KIND_NAMES: Record<HallElement['kind'], [string, string]> = { dock: ['dock', 'docks'], door: ['level door', 'level doors'], pattern: ['pattern', 'patterns'] }

/** A relay or a regrid that merged elements (Decision "Elements by module": a displaced one moves to a free neighbour
 *  only), told once: "2 docks and 1 level door merged where modules joined". None merged: null. */
function merged(before: WarehouseType | undefined, after: WarehouseType | undefined): string | null {
  if (!before || !after || after === before) return null
  const m = mergedOf(before.elements, after.elements)
  const parts = (Object.keys(m) as HallElement['kind'][]).map((k) => `${m[k]} ${KIND_NAMES[k][m[k] === 1 ? 0 : 1]}`)
  return parts.length ? `${parts.join(' and ')} merged where modules joined` : null
}

/**
 * A hand edit on the type's plan (Decisions "Warehouse by hand", "Free steps"): any step, at any time; a locked one
 * opened (a toast says so, and the later ones it sends to lock again, and that Ctrl+Z undoes it). Whether it may be
 * edited (a drag asks before it starts): whenever the type is there.
 */
export function mayReshape(id: Id, _step?: WarehouseStep): boolean {
  return !!useApp.getState().project.warehouseTypes?.some((x) => x.id === id)
}

export function reshape<S extends WarehouseStep>(id: Id, step: S, patch: StepPatch[S]) {
  if (!mayReshape(id)) return
  const before = typeNamed(id)
  useApp.getState().apply((p) => actions.editWarehouseStep(p, id, step, patch))
  const after = typeNamed(id)
  told(before, after, step, noteOf(id, step, before, after))
}

/** What a step's edit says besides (Decision "Blocks on the site": never silent): the elements a regrid merged; the
 *  copies a shape or element edit does not reach, counted. */
function noteOf(id: Id, step: WarehouseStep, before: WarehouseType | undefined, after: WarehouseType | undefined): string | null {
  if (step === 'grid') return merged(before, after)
  if (step === 'morphology') return kept(id, 'shape')
  if (step === 'elements') return kept(id, 'docks')
  return null
}

/**
 * Step 6 changed by the plan's tools, as `reshape` (a locked step opened, a toast says so); one undo step. Never silent
 * (Decision "Blocks on the site"): the copies with their own docks (or courts, for a court edit) it does not reach,
 * counted.
 */
export function byTools(id: Id, f: (p: Project) => Project, what: Kept = 'docks') {
  if (!mayReshape(id)) return
  const before = typeNamed(id)
  useApp.getState().apply(f)
  told(before, typeNamed(id), 'elements', kept(id, what))
}

/** What a site-edited copy keeps of its own, which its type's edits no longer reach (Decision "Blocks on the site"). */
export type Kept = 'docks' | 'shape' | 'courts'
const KEEPS: Record<Kept, (o: WarehouseOverrides) => boolean> = {
  docks: (o) => !!o.elements,
  shape: (o) => !!o.morphology?.outline,
  courts: (o) => !!o.courts,
}

/** "2 copies keep their own docks" ("1 copy keeps its own docks"; shape, courts too): a type's copies with their own;
 *  none: null. */
function kept(id: Id, what: Kept): string | null {
  const n = useApp.getState().project.buildings.filter((b) => b.warehouse?.type === id && b.warehouse.overrides && KEEPS[what](b.warehouse.overrides)).length
  return n === 0 ? null : n === 1 ? `1 copy keeps its own ${what}` : `${n} copies keep their own ${what}`
}

/** Several notes as one ("…; …"); none: null. */
const notes = (...xs: (string | null)[]): string | null => xs.filter(Boolean).join('; ') || null

/** Dock, Door or Pattern (Decision "Elements by module", BE.4): one put on each of an edge's modules, or taken away. */
export const putElements = (id: Id, kind: HallElement['kind'], edge: Id, modules: number[], on: boolean, name?: string) =>
  byTools(id, (p) => actions.putElements(p, id, kind, edge, modules, on, name))

/** Elements taken away by id (Select's Delete, the plan's menu). */
export const removeElements = (id: Id, ids: Id[]) => byTools(id, (p) => actions.removeElements(p, id, ids))

/**
 * Delete on the plan (BE.9): everything picked that goes (docks, doors, patterns, truck courts, holes, column lines),
 * one undo step; a locked step it opens says so, as any hand edit.
 */
export function removePicked(id: Id, picked: readonly Picked[]) {
  if (!mayReshape(id)) return
  const before = typeNamed(id)
  useApp.getState().apply((p) => actions.removePicked(p, id, picked))
  const step: WarehouseStep = picked.some((x) => x.kind === 'element' || x.kind === 'court') ? 'elements' : picked.some((x) => x.kind === 'hole') ? 'morphology' : 'grid'
  const note = notes(
    picked.some((x) => x.kind === 'element') ? kept(id, 'docks') : null,
    picked.some((x) => x.kind === 'court') ? kept(id, 'courts') : null,
    picked.some((x) => x.kind === 'hole') ? kept(id, 'shape') : null,
  )
  told(before, typeNamed(id), step, note)
}

/** Step 6's Width: some elements (every one of a kind, or the ones picked) as wide as `width` m. */
export const setElementsWidth = (id: Id, ids: Id[], width: number) => byTools(id, (p) => actions.setElementsWidth(p, id, ids, width))

/** Step 6's Name: some patterns (every one of a name, or the ones picked) named `name`. */
export const renameElements = (id: Id, ids: Id[], name: string) => byTools(id, (p) => actions.renameElements(p, id, ids, name))

/**
 * *Back to a rectangle* (Phase D.3 task 7): a truck court's shape gone, its depth its deepest point's, through the courts' door (a locked step opened and said, the copies that keep their
 * own courts counted), one undo step. `ref` is the court's (`court`: the block editor's, `block-court`: a placed block's); what the writer says besides (a depth held, a wall with several
 * courts) is said as a toast. Nothing to change: no step.
 */
export function courtToRectangle(typeId: Id | null, ref: Ref): void {
  const r = actions.courtToRectangle(useApp.getState().project, ref)
  if (r.reason) useToast.getState().show('info', `${r.reason}.`)
  else if (r.notes?.length) useToast.getState().show('info', `${r.notes[0]}.`)
  if (r.project === useApp.getState().project) return
  const done = (p: Project) => actions.courtToRectangle(p, ref).project
  if (typeId) byTools(typeId, done, 'courts')
  else useApp.getState().apply(done)
}

/** The Court tool and a court's pill (Decision "Truck court", BE.4): an edge's court put, its own depth, or taken away. */
export const setEdgeCourt = (id: Id, edge: Id, court: { depth?: number } | null) => byTools(id, (p) => actions.setEdgeCourt(p, id, edge, court), 'courts')

// ---- The shape and the zones by hand (W.12, Decision "Block shape") -----------------------------------------------

const typeNamed = (id: Id) => useApp.getState().project.warehouseTypes?.find((x) => x.id === id)

/**
 * A hand edit of the shape (step 5): as `reshape` (a locked step opened, a toast says so), through
 * `actions.shapeWarehouse`. How far what stays still moved in the type's frame (m; the box grown or shrunk at its low
 * walls moves its column line A / 1), for the camera.
 */
export function shapeEdit(id: Id, edit: ShapeEdit): Point {
  const none = { x: 0, y: 0 }
  if (!mayReshape(id)) return none
  const before = typeNamed(id)
  const shift = applyReturning((p) => {
    const r = actions.shapeWarehouse(p, id, edit)
    return r.project === p ? null : { project: r.project, value: r.shift }
  })
  if (!shift) return none
  told(before, typeNamed(id), 'morphology', kept(id, 'shape'))
  return { x: -shift.x, y: -shift.y }
}

/**
 * A hole cut by the Hole tool: a rectangle between two corners, in metres, free (the module lines are the pointer's snap). As the shape handles' edits:
 * a locked step opened and said, one undo step. A hole that does not fit says why and cuts nothing.
 */
export function addFreeHole(id: Id, a: Point, b: Point): boolean {
  // a click, not a drag: no area to cut
  if (Math.abs(a.x - b.x) < 1e-6 || Math.abs(a.y - b.y) < 1e-6) {
    useToast.getState().show('info', 'Drag a rectangle to cut a hole.')
    return false
  }
  if (!mayReshape(id)) return false
  const r = actions.addTypeHole(useApp.getState().project, id, a, b)
  if (r.reason) {
    useToast.getState().show('info', `${r.reason}.`)
    return false
  }
  byShape(id, (p) => actions.addTypeHole(p, id, a, b).project)
  return true
}

/**
 * A hand edit of the outline made by the shape handles (D.1 task 6: `f` runs the engine's `editShape` on the type, whole modules): as
 * `reshape` (a locked step opened, a toast says so, and the later ones it sends to lock again; Ctrl+Z undoes it), one undo step. The step
 * is the shape's (5) when the outline changed, the box's (2) when only a box wall stretched; the copies that keep their own shape are
 * counted. Nothing changed: no step.
 */
export function byShape(id: Id, f: (p: Project) => Project) {
  if (!mayReshape(id)) return
  const before = typeNamed(id)
  useApp.getState().apply(f)
  const after = typeNamed(id)
  const step: WarehouseStep = before && after && JSON.stringify(before.morphology) === JSON.stringify(after.morphology) ? 'hall' : 'morphology'
  told(before, after, step, noteOf(id, step, before, after))
}

/** The block's zones as they are. */
export const zonesNow = (t: WarehouseType): HallZone[] => zonesOf(t, hallRuns(t))

/** The zones written, by hand. */
export function setZones(id: Id, zones: HallZone[] | null) {
  if (zones) reshape(id, 'morphology', { zones })
}

export function setZone(id: Id, zoneId: Id, patch: Partial<HallZone>) {
  const t = typeNamed(id)
  if (t) setZones(id, zonesNow(t).map((z) => (z.id === zoneId ? { ...z, ...patch } : z)))
}

/** A program given to a zone (undefined: the block's, null: none). */
export function giveProgram(id: Id, zoneId: Id, program: Id | null | undefined) {
  setZone(id, zoneId, { program })
}

/** A program given to several zones at once (the zones picked), one undo step. */
export function givePrograms(id: Id, zoneIds: Id[], program: Id | null | undefined) {
  const t = typeNamed(id)
  if (t) setZones(id, zonesNow(t).map((z) => (zoneIds.includes(z.id) ? { ...z, program } : z)))
}

/** A step locked (checked), in any order: the first one not locked shows. */
export function lockStep(id: Id, step: WarehouseStep) {
  useApp.getState().apply((p) => actions.lockWarehouseStep(p, id, step))
  useWarehouse.getState().show(null)
}

/** A locked step's lock taken away (its fields were editable already): the later locked ones to lock again. */
export function reopenStep(id: Id, step: WarehouseStep) {
  useApp.getState().apply((p) => actions.reopenWarehouseStep(p, id, step))
}

// ---- Copies on the site (W.6) --------------------------------------------------------------------------------------

/** The masses of a building, in the project's order. */
const massesOf = (p: Project, buildingId: Id) => {
  const levels = new Set(p.buildings.find((b) => b.id === buildingId)?.levels.map((l) => l.id) ?? [])
  return p.masses.filter((m) => levels.has(m.levelId)).map((m) => m.id)
}

/**
 * A copy of a type on the site, in the active option: its hall's middle at `at` (absent: the buildable area's middle,
 * else the site's, else the origin), turned as the option's grid; its masses selected. `typeId` may carry a library
 * block (`blockDrag`): it comes into the project linked, then its copy stands (one undo step; Decision "Block library").
 */
export function placeCopy(typeId: Id, at?: Point, turn?: number) {
  const s = useApp.getState()
  const p = s.project
  const site = s.derived.site
  const zone = site.buildable.flat()[0]
  const where = at ?? (zone && zone.length >= 3 ? centroid(zone) : site.polygon ? centroid(site.polygon) : { x: 0, y: 0 })
  const angle = turn ?? gridOf(p, s.option)?.angle ?? 0
  const blockId = draggedBlock(typeId)
  const block = blockId ? libraryBlock(blockId)?.block : undefined
  if (blockId && !block) return
  const id = applyReturning((q) => {
    const brought = block ? actions.bringBlock(q, block) : { project: q, id: typeId }
    const r = actions.placeWarehouse(brought.project, brought.id, where, angle, s.option)
    return r && { project: r.project, value: r.id }
  })
  if (!id) return
  const after = useApp.getState()
  after.selectMany(massesOf(after.project, id))
  const name = after.project.buildings.find((b) => b.id === id)?.name
  useToast.getState().show('info', `${name}: a copy of its type. Move it and turn it on the plan; its figures are the type's.`)
}

export function setOverrides(buildingId: Id, overrides: WarehouseOverrides | null) {
  useApp.getState().apply((p) => actions.setWarehouseOverrides(p, buildingId, overrides))
}

/** Dock, Door or Pattern on a placed block (Decision "Blocks on the site"): that copy's own, its type never changed. */
export const putCopyElements = (buildingId: Id, kind: HallElement['kind'], edge: Id, modules: number[], on: boolean, name?: string) =>
  useApp.getState().apply((p) => actions.putCopyElements(p, buildingId, kind, edge, modules, on, name))

/** The Court tool on a placed block: that copy's own court, its type never changed. */
export const setCopyEdgeCourt = (buildingId: Id, edge: Id, court: { depth?: number } | null) =>
  useApp.getState().apply((p) => actions.setCopyEdgeCourt(p, buildingId, edge, court))

/** Back to type (Properties): the copy its type again, its own docks, courts and court depths gone. */
export const backToType = (buildingId: Id) => useApp.getState().apply((p) => actions.copyBackToType(p, buildingId))

/** The Program window, on this type's program. */
export function openType(typeId: Id) {
  useWarehouse.getState().pick(typeId)
  useUi.getState().openDialog('program')
}

/** The Program window, on this program (absent: as it was). */
export function openProgram(programId?: Id) {
  if (programId !== undefined) useWarehouse.getState().pickProgram(programId)
  useUi.getState().openDialog('program')
}

/** A Warehouse program's rule set begun: its warehouse type, every step open; the window on it. */
export function startType(programId: Id) {
  const id = applyReturning((p) => {
    const r = actions.addWarehouseType(p, { program: programId })
    return { project: r.project, value: r.id }
  })
  if (id) useWarehouse.getState().pickProgram(programId)
}

// ---- Dimensions on the block plan (BE.10): the type's own, saved in its block ----------------------------------------

/** A dimension drawn on the block plan, on the type: one undo step; false when there is none to draw. */
export function addBlockDimension(id: Id, a: Point, b: Point, offset: number): boolean {
  return applyReturning((p) => {
    const r = actions.addDimension(p, a, b, offset, undefined, { type: id })
    return r && { project: r.project, value: true }
  }) ?? false
}

/** A dimension of the type taken away: one undo step. */
export const removeBlockDimension = (id: Id, dimension: Id) => useApp.getState().apply((p) => actions.removeDimension(p, dimension, { type: id }))

// ---- The site's block tools, as commands (Project C, AS.1) -------------------------------------------------------------

/** Why a block tool cannot be taken: no placed block picked, or the 3D alone (the strip's buttons and the Blocks panel's chips are greyed so). */
const blockToolRefusal = (): true | string => (siteBlockOf() === null ? 'Pick a placed block first' : useUi.getState().view === '3d' ? PLAN_OFF : true)

/** Dock, Door, Pattern and Court: the strip's *Elements* group. Each takes the tool as the chip
 *  does (the hand's `toggle`); its tick is the tool in hand while a block is picked on the plan. */
const ELEMENT_KEYS = { dock: 'K', door: 'J', pattern: 'N', court: 'Y' }
export const COMMANDS: Command[] = ELEMENT_TOOLS.map((x) => ({
  id: `tool.${x.tool}`,
  label: x.label,
  menu: ['Tools', 'Elements'],
  key: ELEMENT_KEYS[x.tool],
  tool: { group: 'elements', icon: x.icon, hint: x.title },
  run: () => toggle(x.tool),
  enabled: blockToolRefusal,
  checked: () => inHand(x.tool) && blockToolRefusal() === true,
}))

// ---- The block editor's keys, as commands (Project C, AS.1) -------------------------------------------------------------

/** Why a block editor key does nothing: no bar on screen (the Program window shows no block plan), or the 3D view alone. */
const blockBarRefusal = (): true | string => (!blockBarShown() ? 'Open the block editor first' : useUi.getState().view === '3d' ? PLAN_OFF : true)

/** A switch of the block bar's snap, as its chip toggles it. */
const blockSnap = (id: string, k: SnapSwitch, label: string, key: string): Command => ({
  id: `block.${id}`,
  label,
  menu: ['Tools', 'Block editor'],
  key,
  where: ['block-editor'],
  window: 'block-editor',
  run: () => useSnapSettings.getState().toggle(k),
  enabled: blockBarRefusal,
  checked: () => blockBarShown() && useSnapSettings.getState().settings[k],
})

/** The block editor's Split tool (Phase D.3 task 8; the site's is `tool.split`, the same key): taken, or back to Select when in hand. */
export function toggleBlockSplit() {
  const w = useWarehouse.getState()
  w.setTool(w.tool === 'split' ? 'select' : 'split')
}

/** The block editor's bottom bar: Dimension, Ruler, Snap, Ortho, Grid, the keys its titles name; and the plan's Split tool. */
export const BLOCK_EDITOR_COMMANDS: Command[] = [
  {
    id: 'block.split',
    label: 'Split',
    menu: ['Tools', 'Block editor'],
    key: 'S',
    where: ['block-editor'],
    window: 'block-editor',
    run: toggleBlockSplit,
    enabled: () => (!blockBarShown() ? 'Open the block editor first' : useUi.getState().view === '3d' ? PLAN_OFF : true),
    checked: () => blockBarShown() && useWarehouse.getState().tool === 'split',
  },
  {
    id: 'block.dimension',
    label: 'Dimension',
    menu: ['Tools', 'Block editor'],
    key: 'D',
    where: ['block-editor'],
    window: 'block-editor',
    run: toggleBlockDimension,
    enabled: blockBarRefusal,
    checked: () => blockBarShown() && inHand('dimension'),
  },
  {
    id: 'block.ruler',
    label: 'Ruler',
    menu: ['Tools', 'Block editor'],
    key: 'T',
    where: ['block-editor'],
    window: 'block-editor',
    run: toggleBlockRuler,
    enabled: blockBarRefusal,
    checked: () => blockBarShown() && inHand('ruler'),
  },
  { ...blockSnap('snap', 'on', 'Snap', 'F3'), separatorBefore: true },
  blockSnap('ortho', 'ortho', 'Ortho', 'F8'),
  blockSnap('grid', 'grid', 'Grid', 'F9'),
]
