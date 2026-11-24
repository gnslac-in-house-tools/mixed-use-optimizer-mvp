// Copy, paste and duplicate the selected masses (port of Plaza-Practiko `vistas/paneles/operacionesMasa.ts` and
// `estado/portapapeles.ts`), the picked road (a street once pasted, ST.3) or the picked existing streets (Phase PE.2 task 12): what Ctrl+C, Ctrl+V, Ctrl+Shift+V and Ctrl+D do. One mass or several
// (Decision "Multi-selection"): a group keeps its layout, and the copies come out selected; the copies of a group's
// masses are a group of their own (Decision "Groups").
//   copy       keeps the selected masses, or the picked street (every run of it), or the picked existing streets, in this tab's clipboard (not the system's: a mass is not
//              text)
//   paste      (Ctrl+V) in place: where they were copied from, on the active level (Decision "Paste in place")
//   paste at   (Ctrl+Shift+V) centred on the pointer when it is over the plan (moved by whole metres, so it stays on the
//              grid), else next to the original
//   duplicate  a copy next to the original, to its right 5 m away, so it does not start as an overlap; selected
import { create } from 'zustand'
import type { ExistingRoad, Id, Mass, Point, Vehicles } from '../../model/schema.ts'
import { footprintPolygon } from '../../engine/geom/footprint.ts'
import { bounds, centroid } from '../../engine/geom/polygon.ts'
import { actions } from '../../state/actions/index.ts'
import { useApp } from '../../state/store.ts'
import { keyOrMenu } from '../commands/shortcuts.ts'
import { useToast } from '../layout/toast.ts'
import { streetTypesOf, typeForVehicles } from '../../engine/circulation/streets.ts'
import { pickStreet } from './circulation/roadCommands.ts'
import { pickedNow, pickRefs } from './mix.ts'
import { pickedRoad, runsOf, streetIdOf } from './circulation/roadState.ts'
import { planPointer } from './tools/toolState.ts'
import { NOT_COPIED } from '../../model/picked.ts'
import { drawingsPicked, tellOnce } from './massCommands.ts'

/** A run of a street as copied: its corners (a street's nodes, not its rounded line) and what it is like; `type` and `edges` (the
 *  paving each side of its corners, walking them: project 19): a street's. */
export interface CopiedRoad {
  points: Point[]
  width: number
  vehicles: Vehicles
  type?: Id
  edges?: { left: number; right: number }
}

/**
 * What was copied last: masses, or a street, or existing streets (the others empty): a street's runs, each with its own sides (a street whose width changes is several);
 * an existing street whole (its points, its stretches with their lanes, its name), without its padlock and its group.
 */
export const useClipboard = create<{ masses: Mass[]; roads: CopiedRoad[]; existing: ExistingRoad[] }>()(() => ({ masses: [], roads: [], existing: [] }))

/** How many things the clipboard holds, and what they are called, for the menu: "2 masses", "a road". */
export function clipboardHolds(): string | null {
  const { masses, roads, existing } = useClipboard.getState()
  if (masses.length) return masses.length === 1 ? '1 block' : `${masses.length} blocks`
  if (existing.length) return existing.length === 1 ? 'an existing street' : `${existing.length} existing streets`
  return roads.length ? 'a road' : null
}

function selected(): Mass[] {
  const { project, selection } = useApp.getState()
  return project.masses.filter((m) => selection.massIds.includes(m.id))
}

const boundsOf = (ms: Mass[]) => bounds(ms.flatMap((m) => footprintPolygon(m.footprint)))

/** The gap a copy leaves beside what it copies (m). */
const COPY_GAP = 5

/** How far right a copy goes to stand next to `ms`: their width plus COPY_GAP. */
function beside(ms: Mass[]): Point {
  const b = boundsOf(ms)
  return { x: Math.ceil(b.maxX - b.minX + COPY_GAP), y: 0 }
}

function place(sources: Mass[], d: Point): void {
  const s = useApp.getState()
  let ids: Id[] = []
  s.apply((p) => {
    // a smart block's masses come as a copy of their block (Decision "Smart blocks")
    const r = actions.copyWithBlocks(p, sources, d, s.option, useApp.getState().level)
    ids = r.ids
    return r.project
  })
  if (ids.length === 1) s.select(ids[0])
  else s.selectMany(ids)
}

/** A copy of the street moved by d, a street in the active option (each run of its type, else the one its vehicles take, and its own sides); it is
 *  picked. False when nothing was drawn (pasted in place over the street it came from). */
function placeRoad(roads: CopiedRoad[], d: Point): boolean {
  const { option, apply } = useApp.getState()
  let made: Id | undefined
  apply((p) => {
    let q = p
    for (const road of roads) {
      const type = road.type ?? typeForVehicles(streetTypesOf(q, q.options.find((o) => o.id === option)), road.vehicles).id
      const r = actions.drawStreet(q, option, road.points.map((x) => ({ x: x.x + d.x, y: x.y + d.y })), type, road.width, road.vehicles, { edges: road.edges })
      // a run that is there already: the street is (pasted in place), nothing is drawn
      if (!r) {
        made = undefined
        return p
      }
      made ??= r.segments[0]
      q = r.project
    }
    return q
  })
  pickStreet(made)
  return made !== undefined
}

/** What a command says when there is nothing to copy: the commands (commands/edit.ts) are disabled with it. */
export const PICK_SOMETHING = 'Pick something first'

/** The existing streets picked that are in the project (the access store holds them). */
function existingPicked(): ExistingRoad[] {
  const ids = pickedNow().existing
  return (useApp.getState().project.site.existingRoads ?? []).filter((r) => ids.includes(r.id))
}

/** Why Copy cannot copy what is picked (no mass, no street, no existing street; a drawing is never copied); null when it can. */
export function copyRefusal(): string | null {
  if (selected().length > 0) return null
  const road = pickedRoad()
  if (road && road.kind !== 'existing') return null
  if (existingPicked().length > 0) return null
  return drawingsPicked() ? NOT_COPIED : PICK_SOMETHING
}

/** Why Duplicate cannot act (it takes masses only); null when it can. */
export const duplicateRefusal = (): string | null => (selected().length > 0 ? null : drawingsPicked() ? NOT_COPIED : PICK_SOMETHING)

/** Copies the selected masses, else the picked road, else the picked existing streets; false if there is none (then Ctrl+C is the browser's). */
export function copySelection(): boolean {
  const ms = selected()
  const picked = ms.length === 0 ? pickedRoad() : null
  const sites = ms.length === 0 && (!picked || picked.kind === 'existing') ? existingPicked() : []
  if (sites.length > 0) return copyExisting(sites)
  if (ms.length === 0 && (!picked || picked.kind === 'existing')) return tellNotCopied()
  // every run of the street: a street whose width changes is several, each with its own sides
  const road = picked && runsOf(useApp.getState().derived.circulation.roads, streetIdOf(picked))
  useClipboard.setState(
    road
      ? { masses: [], existing: [], roads: road.map((r) => ({ points: r.nodePoints ?? r.points, width: r.width, vehicles: r.vehicles, ...(r.streetType && { type: r.streetType }), ...(r.left !== undefined && r.right !== undefined && { edges: { left: r.left, right: r.right } }) })) }
      : { masses: ms, roads: [], existing: [] },
  )
  const what = road ? 'the road' : ms.length === 1 ? `“${ms[0].name}”` : `${ms.length} blocks`
  const it = road || ms.length === 1 ? 'it' : 'them'
  // a drawing picked with them stays uncopied, said in the same notice (one notice shows at a time)
  const drawings = drawingsPicked() ? ` ${NOT_COPIED}.` : ''
  useToast.getState().show('info', `Copied ${what}. ${keyOrMenu('edit.paste', 'Edit › Paste')} pastes ${it} in place, ${keyOrMenu('edit.paste-here', 'Edit › Paste here')} at the pointer.${drawings}`)
  return true
}

/** Copies the existing streets picked: whole, without their padlock and their group. */
function copyExisting(sites: ExistingRoad[]): boolean {
  useClipboard.setState({ masses: [], roads: [], existing: sites.map(({ locked: _locked, group: _group, ...rest }) => structuredClone(rest)) })
  const what = sites.length === 1 ? 'the existing street' : `${sites.length} existing streets`
  const it = sites.length === 1 ? 'it' : 'them'
  const drawings = drawingsPicked() ? ` ${NOT_COPIED}.` : ''
  useToast.getState().show('info', `Copied ${what}. ${keyOrMenu('edit.paste', 'Edit › Paste')} pastes ${it} in place, ${keyOrMenu('edit.paste-here', 'Edit › Paste here')} at the pointer.${drawings}`)
  return true
}

/** Copies of the existing streets copied, each moved by `d`, with a fresh id and the same name and stretches; they are picked. */
function placeExisting(roads: ExistingRoad[], d: Point): void {
  const made: Id[] = []
  useApp.getState().apply((p) => {
    let q = p
    for (const road of roads) {
      const added = actions.addExistingRoad(q, road.points.map((x) => ({ x: x.x + d.x, y: x.y + d.y })))
      if (!added) continue
      made.push(added.id)
      q = actions.updateExistingRoad(added.project, added.id, { ...(road.name !== undefined && { name: road.name }), stretches: structuredClone(road.stretches) })
    }
    return q
  })
  pickRefs(made.map((id) => ({ kind: 'existing-road', id })))
}

/**
 * Pastes what was copied. `where`: 'place' (Ctrl+V) where it was copied from, on the active level; 'pointer'
 * (Ctrl+Shift+V) centred on `at` (absent: the pointer, if it is over the plan), else next to the original.
 */
export function paste(where: 'place' | 'pointer' = 'place', at?: Point | null): boolean {
  const { masses: sources, roads, existing } = useClipboard.getState()
  if (sources.length === 0 && roads.length === 0 && existing.length === 0) return false
  const q = where === 'pointer' ? (at ?? planPointer.point) : null
  if (existing.length > 0) {
    // centred: the middle of their points' bounds on the pointer; without one, beside them (their width and the gap up)
    const b = bounds(existing.flatMap((r) => r.points))
    const widest = Math.max(...existing.flatMap((r) => r.stretches.map((st) => st.left + st.right)))
    placeExisting(existing, q ? { x: Math.round(q.x - (b.minX + b.maxX) / 2), y: Math.round(q.y - (b.minY + b.maxY) / 2) } : where === 'place' ? { x: 0, y: 0 } : { x: 0, y: Math.ceil(widest + COPY_GAP) })
    return true
  }
  if (roads.length > 0) {
    // centred: the middle of its bounds on the pointer; without one, beside it (a road's width and the gap up)
    const b = bounds(roads.flatMap((r) => r.points))
    const drawn = q
      ? placeRoad(roads, { x: Math.round(q.x - (b.minX + b.maxX) / 2), y: Math.round(q.y - (b.minY + b.maxY) / 2) })
      : placeRoad(roads, where === 'place' ? { x: 0, y: 0 } : { x: 0, y: Math.ceil(Math.max(...roads.map((r) => r.width)) + COPY_GAP) })
    if (!drawn) useToast.getState().show('info', `The street is there already: ${keyOrMenu('edit.paste-here', 'Edit › Paste here')} pastes it at the pointer.`)
    return true
  }
  if (where === 'place') place(sources, { x: 0, y: 0 })
  else if (q) {
    // one mass: its centroid; several: the centre of their bounds
    const b = boundsOf(sources)
    const c = sources.length === 1 ? centroid(footprintPolygon(sources[0].footprint)) : { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 }
    place(sources, { x: Math.round(q.x - c.x), y: Math.round(q.y - c.y) })
  } else place(sources, beside(sources))
  return true
}

/** With drawings picked, Copy and Duplicate say they are not copied (Decision "Drawing pick"); true: said. */
function tellNotCopied(): boolean {
  if (!drawingsPicked()) return false
  tellOnce(NOT_COPIED)
  return true
}

/** Duplicates the selected masses next to them (the clipboard is not touched); a drawing picked with them stays, said. */
export function duplicateSelection(): boolean {
  const ms = selected()
  if (ms.length === 0) return tellNotCopied()
  // asked before the copies are picked: picking them lets the drawings go
  const drawings = drawingsPicked()
  place(ms, beside(ms))
  if (drawings) tellOnce(NOT_COPIED)
  return true
}
