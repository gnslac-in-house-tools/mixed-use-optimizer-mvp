// The imported drawings picked on the plan (Phase DM.3, Decision "Drawing pick"): which parts of which drawings are
// picked, a view store as each kind's (`mix.ts` lets them clear each other), and the pure helpers the plan uses:
//   drawingAt   the hit test of a click on the plan's background: the nearest line or parcel edge shown within reach
//   partsShown  a picked part as the verbs take it, without what the eye hides (hidden is the viewer's, not the verbs')
//   keysOf      the layer and parcel keys of what parts carry (not their locked ones), for Move and Rotate's snap to
//               leave out and for the plan to mark picked
// A drawing is picked whole, or (separated, `split`) layer by layer; its parcels are one more layer, *Parcels*. A part
// locked is not picked: the click says where to unlock it.
import { create } from 'zustand'
import { contourToPolygon } from '../../../engine/geom/contour.ts'
import { distancePointSegment } from '../../../engine/geom/polygon.ts'
import { isLayerLocked, parcelsLocked } from '../../../model/drawings.ts'
import type { DrawingPart } from '../../../model/picked.ts'
import type { Point, Project, Site } from '../../../model/schema.ts'
import { useApp } from '../../../state/store.ts'
import { together } from '../mixing.ts'
import { drawingLayer, parcel as parcelKey } from '../../layers/keys.ts'

/** Whether two parts name the same thing (a layer's name wins over `parcels`, as in the verbs). */
export function samePart(a: DrawingPart, b: DrawingPart): boolean {
  if (a.file !== b.file) return false
  if (a.layer !== undefined || b.layer !== undefined) return a.layer === b.layer
  return !!a.parcels === !!b.parcels
}

const uniqueParts = (parts: DrawingPart[]): DrawingPart[] => parts.filter((p, i) => parts.findIndex((q) => samePart(p, q)) === i)

interface DrawingPick {
  picked: DrawingPart[]
  /** This part alone, or nothing. */
  pick(part: DrawingPart | null): void
  /** Adds the part, or takes it out (Shift+click). */
  toggle(part: DrawingPart): void
  set(parts: DrawingPart[]): void
}

export const useDrawingPick = create<DrawingPick>()((set, get) => ({
  picked: [],
  pick: (part) => set({ picked: part ? [part] : [] }),
  toggle(part) {
    const now = get().picked
    set({ picked: now.some((p) => samePart(p, part)) ? now.filter((p) => !samePart(p, part)) : [...now, part] })
  },
  set: (parts) => set({ picked: uniqueParts(parts) }),
}))

/** The file's parts there are on the project: its drawing's layers, its parcels. */
function partExists(p: Project, part: DrawingPart): boolean {
  const drawing = p.site.drawings?.find((d) => d.file === part.file)
  const parcels = (p.site.parcels ?? []).some((x) => x.file === part.file)
  if (part.layer !== undefined) return drawing?.layers.some((l) => l.name === part.layer) ?? false
  if (part.parcels) return parcels
  return drawing !== undefined || parcels
}

/** The files whose drawing is separated now and was not (or the other way round) before. */
function splitChanged(now: Project, before: Project): Set<string> {
  const was = (file: string) => before.site.drawings?.find((d) => d.file === file)?.split === true
  const changed = new Set<string>()
  for (const d of now.site.drawings ?? []) if ((d.split === true) !== was(d.file)) changed.add(d.file)
  return changed
}

// a drawing gone (removed, imported again without that layer, undone) is let go, and so are the parts of a file just
// separated or joined (what was picked whole or layer by layer no longer shows in the list); `together`: the rest of a
// mixed selection stays picked (a plain drawing pick lets every other kind go, `mix.ts`)
useApp.subscribe((s, before) => {
  if (s.project.site === before.project.site) return
  const { picked } = useDrawingPick.getState()
  const changed = splitChanged(s.project, before.project)
  const kept = picked.filter((part) => partExists(s.project, part) && !changed.has(part.file))
  if (kept.length !== picked.length) together(() => useDrawingPick.setState({ picked: kept }))
})

/** The shortest distance from q to a polyline (closed: back to its first point too). */
function distanceToLine(q: Point, points: Point[], closed: boolean): number {
  let best = Infinity
  const n = points.length
  for (let i = 0; i + 1 < n; i++) best = Math.min(best, distancePointSegment(q, points[i], points[i + 1]))
  if (closed && n > 2) best = Math.min(best, distancePointSegment(q, points[n - 1], points[0]))
  return best
}

export type DrawingHit = { part: DrawingPart } | { locked: DrawingPart }

/** How much nearer (m) a locked line must be to win over an unlocked one: coincident lines are a tie, by a hair. */
const TIE = 1e-6

/**
 * What a click at `point` picks of the drawings: the nearest line of a layer shown, or edge of a parcel shown, within
 * `reach` (m). Its part is the whole drawing; on a split drawing the layer (or *Parcels*), and `locked` when that one
 * is locked (on a whole drawing a locked layer still picks it: the move says how many stayed). Where a locked part and
 * a pickable one are as near (a lot line drawn on a parcel's edge), the pickable one wins. A parcel with no file and
 * the terrain are never hit. `hidden`: the keys the eye hides (layers/layerView.ts). Null: nothing within reach.
 */
export function drawingAt(p: Project, point: Point, reach: number, hidden: readonly string[]): DrawingHit | null {
  const off = new Set(hidden)
  const split = (file: string) => p.site.drawings?.find((d) => d.file === file)?.split === true
  let best: { d: number; part: DrawingPart; locked: boolean } | null = null
  const consider = (d: number, part: DrawingPart, locked: boolean) => {
    if (d > reach) return
    const better = !best || (locked === best.locked ? d < best.d : locked ? d < best.d - TIE : d <= best.d + TIE)
    if (better) best = { d, part, locked }
  }
  for (const drawing of p.site.drawings ?? []) {
    for (const l of drawing.layers) {
      if (off.has(drawingLayer(drawing.file, l.name))) continue
      // a layer can hold thousands of lines: a loop, not a spread
      let d = Infinity
      for (const ln of l.lines) d = Math.min(d, distanceToLine(point, ln.points, ln.closed === true))
      // a lock refuses only on a split drawing: a whole one is picked whole
      consider(d, { file: drawing.file, layer: l.name }, drawing.split === true && isLayerLocked(l))
    }
  }
  for (const parcel of p.site.parcels ?? []) {
    if (parcel.file === undefined || off.has(parcelKey(parcel.name, parcel.file))) continue
    consider(distanceToLine(point, contourToPolygon(parcel.contour), true), { file: parcel.file, parcels: true }, split(parcel.file) && parcelsLocked(p.site, parcel.file))
  }
  const hit = best as { part: DrawingPart; locked: boolean } | null
  if (!hit) return null
  if (!split(hit.part.file)) return { part: { file: hit.part.file } }
  return hit.locked ? { locked: hit.part } : { part: hit.part }
}

/**
 * A picked part as the verbs take it, without what the eye hides: a whole drawing with nothing hidden stays whole (so
 * its move says how many locked layers stayed); with some hidden, it is its layers shown and its *Parcels* (unless all
 * of its parcels are hidden). Any other part is itself.
 */
export function partsShown(p: Project, part: DrawingPart, hidden: readonly string[]): DrawingPart[] {
  const off = new Set(hidden)
  // a layer or the parcels picked, then hidden by the eye, stay where they are (spec: hidden layers do not move)
  if (part.layer !== undefined) return off.has(drawingLayer(part.file, part.layer)) ? [] : [part]
  if (part.parcels) {
    const mine = (p.site.parcels ?? []).filter((x) => x.file === part.file)
    return mine.some((x) => !off.has(parcelKey(x.name, x.file))) ? [part] : []
  }
  const layers = p.site.drawings?.find((d) => d.file === part.file)?.layers ?? []
  const parcels = (p.site.parcels ?? []).filter((x) => x.file === part.file)
  const layersShown = layers.filter((l) => !off.has(drawingLayer(part.file, l.name)))
  const parcelsShown = parcels.filter((x) => !off.has(parcelKey(x.name, x.file)))
  if (layersShown.length === layers.length && parcelsShown.length === parcels.length) return [part]
  return [
    ...layersShown.map((l) => ({ file: part.file, layer: l.name })),
    ...(parcelsShown.length ? [{ file: part.file, parcels: true as const }] : []),
  ]
}

/**
 * The layer and parcel keys of what the parts carry: a whole drawing's unlocked layers and its parcels while unlocked,
 * a layer's own and the parcels' while unlocked. A locked one stays where it is, so it still attracts Move's snap and
 * is not marked picked on the plan. Takes the site's drawings and parcels only.
 */
export function keysOf(site: Pick<Site, 'drawings' | 'parcels'>, parts: DrawingPart[]): string[] {
  const keys = new Set<string>()
  for (const part of parts) {
    const whole = part.layer === undefined && !part.parcels
    const layers = site.drawings?.find((d) => d.file === part.file)?.layers ?? []
    for (const l of layers) if ((whole || l.name === part.layer) && !isLayerLocked(l)) keys.add(drawingLayer(part.file, l.name))
    if ((whole || (part.parcels && part.layer === undefined)) && !parcelsLocked(site, part.file))
      for (const x of site.parcels ?? []) if (x.file === part.file && x.unlocked) keys.add(parcelKey(x.name, x.file))
  }
  return [...keys]
}
