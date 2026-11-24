// What the On edge views read of an edge, pure (Phase D.3 task 10, Decision "On edge engine"): the slot under a point, as the engine reads the edge
// (`EdgeInfo`: its origin, its direction, its slots in metres along it, in the viewport's frame), so one reading holds in the block editor, on the site and in a turned frame.
import type { EdgeInfo, EdgeRead } from '../../../engine/edge/onEdge.ts'
import type { Id, Point } from '../../../model/schema.ts'

/** The slot of an edge under a point (its number), held to the first and the last slot past the ends; null when the edge has none. */
export function slotAt(e: Pick<EdgeInfo, 'origin' | 'dir' | 'slots'>, q: Point): number | null {
  if (e.slots.length === 0) return null
  const along = (q.x - e.origin.x) * e.dir.x + (q.y - e.origin.y) * e.dir.y
  const hit = e.slots.find((s) => along >= s.from && along < s.to)
  if (hit) return hit.k
  return along < e.slots[0].from ? e.slots[0].k : e.slots[e.slots.length - 1].k
}

/** "3 modules" (a slide's number, as its field shows it). */
export const slideLabel = (by: number): string => `${by} ${Math.abs(by) === 1 ? 'module' : 'modules'}`

/** px: how far the pointer moves before a press on an element is a drag, not a click. */
export const CLICK_PX = 4

/** The run of what is picked on one wall, for the count pills: the kind (a pattern's name), the slots the picked hold from first to last, and how many of that kind the wall holds in all. */
export interface PillRun {
  edge: EdgeInfo
  kind: string
  name?: string
  lo: number
  hi: number
  held: number
  /** The slots the wall holds of that kind (and name), whoever is picked. */
  slots: number[]
}

/** What the pills of a pick show: the count pills when all picked are one kind (and name) on one wall, the width pill whenever anything is picked, at the side of the first of them. */
export interface Pills {
  count: PillRun | null
  width: { edge: EdgeInfo; ids: Id[]; slot: number; now: number }
}

export function pillsOf(read: EdgeRead | null, picked: readonly Id[]): Pills | null {
  if (!read) return null
  const mine = read.elements.filter((x) => picked.includes(x.id))
  if (mine.length === 0) return null
  const first = [...mine].sort((a, b) => a.slot - b.slot)[0]
  const edge = read.edges.find((x) => x.id === first.edge)
  if (!edge) return null
  const same = mine.every((x) => x.edge === first.edge && x.kind === first.kind && x.name === first.name)
  const slots = mine.map((x) => x.slot)
  const slotsHeld = read.elements.filter((x) => x.edge === first.edge && x.kind === first.kind && x.name === first.name).map((x) => x.slot)
  return {
    count: same ? { edge, kind: first.kind, ...(first.name !== undefined ? { name: first.name } : {}), lo: Math.min(...slots), hi: Math.max(...slots), held: slotsHeld.length, slots: slotsHeld } : null,
    width: { edge, ids: mine.map((x) => x.id), slot: first.slot, now: first.width },
  }
}

/** The point of an edge's line at `s` m along it (the viewport's frame), `out` m off it outward. */
export function onEdgeAt(e: EdgeInfo, s: number, out = 0): Point {
  const t = s - ((e.a.x - e.origin.x) * e.dir.x + (e.a.y - e.origin.y) * e.dir.y)
  return { x: e.a.x + e.dir.x * t + e.out.x * out, y: e.a.y + e.dir.y * t + e.out.y * out }
}

/** The metres of a slot along its edge: its middle. */
export function slotMid(e: Pick<EdgeInfo, 'slots'>, k: number): number | null {
  const s = e.slots.find((x) => x.k === k)
  return s ? (s.from + s.to) / 2 : null
}

/** m along an edge's line of a point (the viewport's frame). */
export const alongEdge = (e: Pick<EdgeInfo, 'origin' | 'dir'>, q: Point): number => (q.x - e.origin.x) * e.dir.x + (q.y - e.origin.y) * e.dir.y

/** The width a drag of the width pill makes: twice how far the pointer is from the middle of the first picked, to the 0.1 m (Shift: free to the mm), 0.1 to 20 m. */
export function widthAt(e: Pick<EdgeInfo, 'origin' | 'dir' | 'slots'>, slot: number, q: Point, free: boolean): number {
  const c = slotMid(e, slot) ?? 0
  const w = 2 * Math.abs(alongEdge(e, q) - c)
  const r = free ? Math.round(w * 1000) / 1000 : Math.round(w * 10) / 10
  return Math.min(20, Math.max(0.1, r))
}

/** "4.2 m", "3 m": a width as a pill says it. */
export const widthLabel = (w: number): string => `${Math.round(w * 1000) / 1000} m`

/** "7 docks": a count as its pill says it. */
export const countLabel = (n: number, kind: string): string => `${n} ${kind}${n === 1 ? '' : 's'}`

/**
 * The count a pill's end dragged to slot `k` asks for: past its run, the slots between (the dock rule may leave some out, so the engine's preview says which); back along it, what the wall holds
 * of the kind is taken from that end up to `k`, which stays.
 */
export function countAtSlot(run: Pick<PillRun, 'lo' | 'hi' | 'held' | 'slots'>, end: 'start' | 'end', k: number): number {
  if (end === 'end') return k > run.hi ? run.held + (k - run.hi) : run.held - run.slots.filter((s) => s > k).length
  return k < run.lo ? run.held + (run.lo - k) : run.held - run.slots.filter((s) => s < k).length
}
