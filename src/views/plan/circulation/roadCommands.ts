// What the roads do on the Flow plan and in Properties (Decision "Exterior circulation"), through the verbs in
// `actions`: name a road; a street (Decision "Streets layout"; since ST.4 every road of the design is one) is dragged
// whole or by a node (its segments follow), Alt+drag copies it (Decision "Alt+drag copies"), a double click on it adds
// a node, Delete removes the picked node or the street (a node of it picked on a crossing takes only that street's segment); its nodes, stretches and sides are pulled by the path handles (`views/editing/path/`, Decision "Path engine"). A drag snaps (Decision "Road snap") to the masses, the site,
// the setback line, the other roads, the streets' nodes and the gates, as the snap settings say; Shift is free. An existing street (Phase PE.2 task 12) is pressed, dragged and Alt+dragged
// the same way (`existingDrag`): it moves and copies by its points, through `movePicked` and `copyExistingRoads`, its linked street ends and its gates following in `settle`.
// The padlock (Phase AS.4, Decision "Padlocks by kind"): a street with all its segments locked is not dragged at all (the plan's press on it is the
// background's: `plan/lockedAt.ts`); one with only some locked is *mixed*: its free segments and the nodes only they hold move, the locked segments and
// their two nodes stay, and the handle of a locked stretch, a node it holds or one of its sides starts no drag and says it is locked.
import { NOTHING_PICKED } from '../../../model/picked.ts'
import type { Contour, Id, Point } from '../../../model/schema.ts'
import type { DerivedRoad } from '../../../engine/types.ts'
import { actions } from '../../../state/actions/index.ts'
import { useApp } from '../../../state/store.ts'
import { snapLevels } from '../reference.ts'
import { snapMove, targetsOf, tolerances, type Shape } from '../snap/move.ts'
import { snapPointsOf } from '../snap/points.ts'
import { useSnapSettings } from '../snap/settings.ts'
import { roadSources, sourcesFor } from '../snap/sources.ts'
import { straightWalls } from '../snap/walls.ts'
import type { Mover, Start } from '../useDrag.ts'
import { closestOnSegment } from '../../../engine/circulation/route.ts'
import { STREETS } from '../../layers/keys.ts'
import { showLayers } from '../../layers/layerView.ts'
import { lockedNodeIds } from '../../../kinds/locked.ts'
import { tellLockedPick } from '../../layers/locks.ts'
import { insertPathNode } from '../../editing/path/drags.ts'
import { removePathNode } from '../../editing/path/pathState.ts'
import { gatesOnSegments, tellGatesWent } from '../access/accessCommands.ts'
import { addToMix, pickRefs } from '../mix.ts'
import { wholeDrag } from '../pickedDrag.ts'
import { pickedRoad, runsOf, streetIdOf, streetOfSegment, useRoads, useStreetSide, useStreetType } from './roadState.ts'

/** What attracts a road dragged: the masses and the site as for a mass, and the roads and gates but itself (null: all). */
function roadTargets(id: string | ReadonlySet<string> | null, node: number | null = null) {
  const { project, derived } = useApp.getState()
  return targetsOf([...sourcesFor(project, derived, null, snapLevels()), ...roadSources(derived, id, node)])
}

/** A road's centreline as a shape that snaps when it moves: its points and the middles of its segments, its segments. */
export function roadShape(points: Point[]): Shape {
  const contour: Contour = { vertices: points.map((q) => ({ x: q.x, y: q.y, r: 0 })) }
  return {
    points: snapPointsOf([{ contour, label: '', open: true }]).filter((q) => q.kind === 'endpoint' || q.kind === 'midpoint'),
    walls: straightWalls(contour, true),
    anchor: points[0],
  }
}

/** The nodes the option's locked segments hold: they stay where they are, whoever drags the street. */
const heldNodes = (): Set<Id> => lockedNodeIds(useApp.getState().project, useApp.getState().option)

/** A road's name, for Properties and its tooltip. */
export function roadName(r: DerivedRoad): string {
  return r.kind === 'existing' ? 'Existing road' : 'Street'
}

/** *Delete* a street (one undo step). False when it cannot (an existing road is the Site step's). */
export function removeRoad(r: DerivedRoad): boolean {
  return r.kind === 'street' ? removeStreet(r) : false
}

/** Whether a node of a street is what is picked (Delete then removes that node alone, not the street). */
export function streetPartPicked(): boolean {
  return useRoads.getState().node !== null
}

/** Delete: the picked road goes. False when none is picked. */
export function removePickedRoad(): boolean {
  const r = pickedRoad()
  return r ? removeRoad(r) : false
}

/**
 * A press on a road: it is picked; dragged, it moves, a street by its nodes and an existing street by its points. Alt+drag leaves
 * it where it is and draws a copy where it is dropped, picked then (Decision "Alt+drag copies"). One undo step per drag.
 */
export function startRoadDrag(id: string, scale: number): Start {
  return (e) => {
    const r = useApp.getState().derived.circulation.roads.find((x) => x.id === id)
    if (!r) return null
    if (r.kind === 'existing') return existingDrag(r, scale, e)
    if (r.kind !== 'street') return null
    // in a group of other things, or picked beside other kinds: the whole pick moves (Phase AS.5 task 6)
    const runs = runsOf(useApp.getState().derived.circulation.roads, streetIdOf(r))
    const whole = wholeDrag({ kind: 'street', id: streetIdOf(r) }, () => roadShape(runs.flatMap((x) => x.nodePoints ?? x.points)), scale, e)
    if (whole) return whole
    return e.altKey ? copyStreetDrag(runs, scale) : streetDrag(runs, scale, e.shiftKey)
  }
}

// ---- Existing streets (Phase PE.2 task 12) ---------------------------------------------------------------------------

/** The existing street's own id (the site's road: its derived runs are `existing:<id>[:<k>]`). */
const siteIdOf = (r: DerivedRoad): Id => r.sourceId ?? r.id

/**
 * An existing street pressed: in a group, or picked beside other kinds, the whole pick moves; else it is picked alone (Shift adds it, a click picks it) and moves by
 * its points (`movePicked`: its linked street ends and its gates follow), or, with Alt, stays and a copy is drawn where it is dropped. Locked, it is not pressed at all
 * (`RoadsLayer`: the background says so).
 */
function existingDrag(r: DerivedRoad, scale: number, e: { shiftKey: boolean; altKey: boolean }): Mover | null {
  const { project, derived, option } = useApp.getState()
  const id = siteIdOf(r)
  const road = project.site.existingRoads?.find((x) => x.id === id)
  if (!road) return null
  const runs = derived.circulation.roads.filter((x) => x.kind === 'existing' && siteIdOf(x) === id)
  const shape = roadShape(road.points)
  const whole = wholeDrag({ kind: 'existing-road', id }, () => shape, scale, e)
  if (whole) return whole
  const targets = roadTargets(new Set(runs.map((x) => x.id)))
  // picked through the bridge (the access store holds it): picks it alone, as a plain click does
  const pickIt = () => pickRefs([{ kind: 'existing-road', id }])
  if (e.altKey) {
    let made: Id | undefined
    const mover: Mover = (raw, ev) => {
      const { delta, mark } = ev.shiftKey ? { delta: raw, mark: null } : snapMove(raw, shape, targets, useSnapSettings.getState().settings, tolerances(scale))
      useApp.getState().preview((p) => {
        const c = actions.copyExistingRoads(p, [id], delta)
        made = c.ids[0]
        return made === undefined ? null : c.project
      })
      return { ok: made !== undefined, mark }
    }
    mover.copy = true
    mover.click = pickIt
    mover.done = () => made !== undefined && pickRefs([{ kind: 'existing-road', id: made }])
    return mover
  }
  if (!e.shiftKey) pickIt()
  const picked = { ...NOTHING_PICKED, existing: [id] }
  const mover: Mover = (raw, ev) => {
    const snapped = ev.shiftKey ? { delta: raw, mark: null } : snapMove(raw, shape, targets, useSnapSettings.getState().settings, tolerances(scale))
    useApp.getState().preview((p) => actions.movePicked(p, option, picked, snapped.delta).project)
    return { ok: true, mark: snapped.mark }
  }
  mover.click = () => (e.shiftKey ? addToMix('existing', id) : pickIt())
  // dragged with Shift (no snap), it is the street picked, as any dragged
  if (e.shiftKey) mover.done = pickIt
  return mover
}

// ---- Streets (Decision "Streets layout") -------------------------------------------------------------------------

/** The street that runs along `segId` picked (after an edit its id may be another segment's: a street is a run). */
export function pickStreet(segId: Id | undefined): void {
  const r = segId ? streetOfSegment(segId) : null
  if (r) useRoads.getState().pick(streetIdOf(r))
}

/**
 * A street drawn with the Street tool: of the drafting bar's type, its own width when typed (w 10), by the side chosen
 * (each segment that would run over a mass by the one that keeps it outside: Decision "Street side when drawing"); it
 * is picked.
 */
export function addStreet(points: Point[], width?: number): boolean {
  let made: Id | undefined
  const side = useStreetSide.getState().side
  useApp.getState().apply((p) => {
    const r = actions.drawStreet(p, useApp.getState().option, points, useStreetType.getState().type ?? undefined, width, undefined, { side, outside: true })
    made = r?.segments[0]
    return r?.project ?? p
  })
  // a street drawn is a street seen: Streets shows again if an eye had hidden it
  if (made !== undefined) showLayers(STREETS)
  pickStreet(made)
  return made !== undefined
}

/**
 * Delete on a street: its picked node (the street goes on past it, where it can); else the whole street, every run of it.
 */
function removeStreet(r: DerivedRoad): boolean {
  const { option, derived } = useApp.getState()
  const { node } = useRoads.getState()
  // the runs of the street (a street is several runs where its width changes)
  const mine = runsOf(derived.circulation.roads, streetIdOf(r))
  if (node && mine.some((m) => m.nodes?.includes(node))) {
    removePathNode({ kind: 'street', id: streetIdOf(r) }, node)
    return true
  }
  const segments = mine.flatMap((m) => m.segments ?? [])
  const onStreet = gatesOnSegments(useApp.getState().project, option, segments)
  useApp.getState().apply((p) => segments.reduce((q, id) => actions.removeStreetSegment(q, option, id), p))
  tellGatesWent(onStreet)
  useRoads.getState().pick(null)
  return true
}

/**
 * A street dragged by its body: its nodes move together, snapped as a shape (what meets them follows). Shift+click
 * adds it to the streets picked, or takes it away (Decision "Street parking by side").
 */
function streetDrag(runs: DerivedRoad[], scale: number, shift = false): Mover | null {
  const { option } = useApp.getState()
  const held = heldNodes()
  const id = streetIdOf(runs[0])
  const allNodes = [...new Set(runs.flatMap((r) => r.nodes ?? []))]
  // the nodes a locked segment holds stay: the free ones move
  const moving = allNodes.filter((n) => !held.has(n))
  if (moving.length === 0 && allNodes.length > 0) {
    tellLockedPick()
    return null
  }
  if (!shift) useRoads.getState().pick(id)
  const corners = runs.flatMap((r) => r.nodePoints ?? r.points)
  const names = runs.flatMap((r) => r.nodes ?? [])
  const targets = roadTargets(new Set(runs.map((x) => x.id)))
  const shape = roadShape(names.length === corners.length && held.size > 0 ? corners.filter((_, i) => !held.has(names[i])) : corners)
  const mover: Mover = (raw, e) => {
    const snapped = e.shiftKey ? { delta: raw, mark: null } : snapMove(raw, shape, targets, useSnapSettings.getState().settings, tolerances(scale))
    useApp.getState().preview((p) => actions.moveStreetNodes(p, option, moving, snapped.delta))
    return { ok: true, mark: snapped.mark }
  }
  mover.click = () => (shift ? addToMix('road', id) : useRoads.getState().pick(id))
  // dragged with Shift (no snap), it is the street picked, as any dragged
  if (shift) mover.done = () => useRoads.getState().pick(id)
  return mover
}

/** Alt+drag on a street: a copy drawn where it is dropped, of its type, width and side; picked then. */
function copyStreetDrag(runs: DerivedRoad[], scale: number): Mover {
  const { option } = useApp.getState()
  const targets = roadTargets(null)
  const shape = roadShape(runs.flatMap((r) => r.nodePoints ?? r.points))
  let made: Id | undefined
  const id = streetIdOf(runs[0])
  const mover: Mover = (raw, e) => {
    const { delta, mark } = e.shiftKey ? { delta: raw, mark: null } : snapMove(raw, shape, targets, useSnapSettings.getState().settings, tolerances(scale))
    useApp.getState().preview((p) => {
      // each run drawn on its own, with its own sides: they meet at the nodes they share
      let q: typeof p | null = p
      made = undefined
      for (const r of runs) {
        const corners = r.nodePoints ?? r.points
        const c = actions.drawStreet(q!, option, corners.map((x) => ({ x: x.x + delta.x, y: x.y + delta.y })), r.streetType, undefined, undefined, { edges: { left: r.left ?? r.width / 2, right: r.right ?? r.width / 2 } })
        if (!c) return null
        made ??= c.segments[0]
        q = c.project
      }
      return q
    })
    return { ok: made !== undefined, mark }
  }
  mover.copy = true
  mover.click = () => useRoads.getState().pick(id)
  mover.done = () => pickStreet(made)
  return mover
}

/** A double click on a street: a node there, on its nearest stretch (picked, to drag or delete). */
export function splitStreetAt(r: DerivedRoad, at: Point): boolean {
  const { project, option } = useApp.getState()
  const ref = { kind: 'street', id: streetIdOf(r) }
  const read = actions.pathOf(project, ref, option)
  if (!read) return false
  let best = { k: -1, d: Infinity }
  for (let k = 0; k + 1 < read.path.points.length; k++) {
    const c = closestOnSegment(at, read.path.points[k], read.path.points[k + 1])
    const d = Math.hypot(c.x - at.x, c.y - at.y)
    if (d < best.d) best = { k, d }
  }
  return best.k >= 0 && insertPathNode(ref, best.k, at)
}
