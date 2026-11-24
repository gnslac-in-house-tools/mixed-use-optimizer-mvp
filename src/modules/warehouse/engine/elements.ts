// What stands on the edges when the outline changes (Decisions "Block shape", "Elements by module"), pure: an element
// stays on its module, where it stands along its edge's line; it follows its edge's id; an edge that went (two made one)
// hands its elements to the edge kept; an edge split (a stretch pulled out of it) hands each to the piece it stands on.
// A module the edge no longer spans takes its element with it. A truck court by edge (BE.2) follows its edge the same
// way: to the edge kept where its went, staying with the original on a split. A court with a shape of its own (Phase D.3) keeps its place on the plan
// along its wall's line instead: see `courtsFollowed`.
import type { Contour, CourtByEdge, HallElement, Id, Point } from '../../../model/schema.ts'
import { nearestModule, type HallRuns } from './bays.ts'
import { clipToWall, courtRule, faceSpan, freeCourtId, wallFrame } from './courts.ts'
import { ANGLED_COURT, ANGLED_ELEMENTS, elementKey, edgeModules, moduleSpot, type ShapeEdge } from './shape.ts'

/** The first element id "e1", "e2"… not taken. */
export function freeElementId(taken: { id: Id }[]): Id {
  let n = 1
  while (taken.some((e) => e.id === `e${n}`)) n++
  return `e${n}`
}

/** m: a new element's width when none of its kind is there yet: a dock 3 m, a level door 4 m, a pattern's mark 0.3 m. */
export const ELEMENT_WIDTH: Record<HallElement['kind'], number> = { dock: 3, door: 4, pattern: 0.3 }

/** The name a pattern put by the tools takes: the last pattern's, else Downpipe. */
export const patternName = (elements: Pick<HallElement, 'kind' | 'name'>[]): string => elements.findLast((e) => e.kind === 'pattern')?.name ?? 'Downpipe'

/** Whether an element is of a kind on an edge (a pattern: of that name). */
export const isOf = (el: Pick<HallElement, 'kind' | 'name' | 'edge'>, kind: HallElement['kind'], edge: Id, name?: string): boolean =>
  el.kind === kind && el.edge === edge && (kind !== 'pattern' || (el.name ?? '') === (name ?? ''))

/**
 * The elements after an outline's edit, on their modules counted on the box after it: each where it stood along its
 * edge's line (`shift`: where the box's column line A / 1 went, m in the frame before), on the edge kept where theirs
 * went (`renamed`), on an edge split (`split`: the edge and the new edge past the stretch) on the piece that spans its
 * module; none on a module its edge no longer spans, two of one kind on one module one. `elements`: on their modules
 * counted on the box before (`elementsOn`); `before` and `after`: the edges and runs either side of the edit. `pieces`
 * (a free edit, Phase D.2): the edges each old edge became, in order along it; an element goes to the piece that spans its
 * place, none to an angled one (nothing stands on it).
 */
export function followEdges(
  elements: HallElement[],
  renamed: ReadonlyMap<Id, Id>,
  split: { edge: Id; rest: Id } | null,
  before: { runs: HallRuns; edges: ShapeEdge[] },
  after: { runs: HallRuns; edges: ShapeEdge[] },
  shift: Point = { x: 0, y: 0 },
  pieces?: ReadonlyMap<Id, readonly Id[]>,
): HallElement[] {
  const out: HallElement[] = []
  const seen = new Set<string>()
  for (const el of elements) {
    const edge = renamed.get(el.edge) ?? el.edge
    const was = before.edges.find((e) => e.id === el.edge)
    if (!was) {
      out.push(edge === el.edge ? el : { ...el, edge })
      continue
    }
    const s = moduleSpot(before.runs, was, el.module) - (was.horizontal ? shift.x : shift.y)
    const own = pieces?.get(el.edge)
    const candidates = own ?? (split && el.edge === split.edge ? [edge, renamed.get(split.rest) ?? split.rest] : [edge])
    for (const id of candidates) {
      const e = after.edges.find((x) => x.id === id)
      if (!e || e.horizontal !== was.horizontal) continue
      const module = nearestModule(e.horizontal ? after.runs.x : after.runs.y, s)
      const span = edgeModules(e)
      if (module < span.lo || module + 1 > span.hi) continue
      const key = elementKey({ ...el, edge: id }, module)
      if (!seen.has(key)) out.push(id === el.edge && module === el.module ? el : { ...el, edge: id, module })
      seen.add(key)
      break
    }
  }
  return out
}

/**
 * A block's truck courts by edge after an outline's edit (Decision "Truck court", BE.2): each on the edge kept where
 * its edge went (`renamed`), the kept edge's own first when it has one, the first handed to it else; an edge split
 * keeps its id, so its court stays with it, the piece past the stretch none. None on an edge the outline no longer has
 * (`edges`: after the edit), nor on one that is angled now. Nothing changed: the same list.
 */
export function followCourts(courts: CourtByEdge[], renamed: ReadonlyMap<Id, Id>, edges: { id: Id; axis?: 'x' | 'y' | null }[], via?: CourtsVia): CourtByEdge[] {
  return courtsFollowed(courts, renamed, edges, via).courts
}

/**
 * The edges either side of an edit that a court with a shape needs (Phase D.3): `before` and `after` the edit (the type's frame), `shift`: where the box's
 * column line A / 1 went (m, in the frame before: as `followEdges` has it), `split` and `pieces`: the edges an edge became, as `followEdges` has them.
 * `walls`: the generated walls after the edit, which say each wall's face from corner to corner: the span a court's wall side is held to (the block editor's and
 * the site's rule are the same, Phase D.3); absent, the reference line's own.
 */
export interface CourtsVia {
  before: readonly ShapeEdge[]
  after: readonly ShapeEdge[]
  shift?: Point
  split?: { edge: Id; rest: Id } | null
  pieces?: ReadonlyMap<Id, readonly Id[]>
  walls?: readonly { a: Point; b: Point; edge?: Id; corner?: true }[]
}

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`

/**
 * A block's truck courts after an outline's edit, and what it says (`followCourts`, with its notes): a court without a shape (or any, when `via` is
 * absent) as before. A court with a shape keeps its place on the plan along its wall's line: re-based by how far the wall's start moved along it, its
 * wall side clipped to the wall that is left (by the split engine), and on a wall cut into pieces (a bump in its middle) each piece keeps the part in
 * front of it as a court of its own (the first keeps the court's id, the others get new ones). One with no wall side left goes, and the notes say so
 * ("1 truck court left out: …"). One whose wall turned angled goes too, but `courtsOnAngled` says that.
 */
export function courtsFollowed(courts: CourtByEdge[], renamed: ReadonlyMap<Id, Id>, edges: { id: Id; axis?: 'x' | 'y' | null }[], via?: CourtsVia): { courts: CourtByEdge[]; notes: string[]; lost: number; carried: ReadonlySet<CourtByEdge> } {
  // a court goes on a wall along the grid: one on an edge that turned angled goes with it
  const ids = new Set(edges.filter((e) => e.axis !== null).map((e) => e.id))
  const taken = new Set(courts.flatMap((c) => (c.id ? [c.id] : [])))
  const lost: Lost = { n: 0, notes: [] }
  const own: CourtByEdge[] = []
  const carried = new Set<CourtByEdge>()
  for (const c of courts) {
    if (via && c.shape) {
      const made = followShaped(c, renamed, via, taken, lost)
      if (made.length) carried.add(c)
      own.push(...made)
    } else if (!renamed.has(c.edge) && ids.has(c.edge)) own.push(c)
  }
  const out = [...own]
  for (const c of courts) {
    if (via && c.shape) continue
    const edge = renamed.get(c.edge)
    if (edge === undefined || !ids.has(edge) || out.some((x) => x.edge === edge)) continue
    out.push({ ...c, edge })
    carried.add(c)
  }
  const same = out.length === courts.length && out.every((c, i) => c === courts[i])
  const notes = [...(lost.n ? [`${plural(lost.n, 'truck court')} left out: no wall left in front of ${lost.n === 1 ? 'it' : 'them'}`] : []), ...lost.notes]
  return { courts: same ? courts : out, notes, lost: lost.n, carried }
}

/** What following leaves out: courts with no wall left (`n`), and what the rule said of a piece it clipped or refused (`notes`). */
interface Lost {
  n: number
  notes: string[]
}

/** The courts a shaped court becomes on the edges its wall became (none: it has no wall side left, or its wall is angled now). */
function followShaped(c: CourtByEdge, renamed: ReadonlyMap<Id, Id>, via: CourtsVia, taken: Set<string>, lost: Lost): CourtByEdge[] {
  const shape = c.shape as Contour
  const was = via.before.find((e) => e.id === c.edge)
  const kept = (id: Id) => renamed.get(id) ?? id
  const targets = via.pieces?.get(c.edge) ?? (via.split && c.edge === via.split.edge ? [kept(c.edge), kept(via.split.rest)] : [kept(c.edge)])
  const edges = [...new Set(targets)].flatMap((id) => via.after.filter((e) => e.id === id))
  if (!was) return edges.some((e) => e.id === c.edge && e.axis !== null) ? [c] : []
  const f0 = wallFrame(was)
  const straight = edges.filter((e) => {
    const f = wallFrame(e)
    return e.axis !== null && f.along.x === f0.along.x && f.along.y === f0.along.y
  })
  if (!straight.length) {
    // a wall that is angled now is `courtsOnAngled`'s to say; one that runs another way than the old is no wall for it
    if (edges.some((e) => e.axis !== null)) lost.n++
    return []
  }
  const shift = via.shift ?? { x: 0, y: 0 }
  const made: { edge: Id; shape: Contour }[] = []
  for (const e of straight) {
    const f1 = wallFrame(e)
    // where the wall's start went along the line (m), so the court stays where it stood on the plan
    const dx = (f0.origin.x - shift.x - f1.origin.x) * f0.along.x + (f0.origin.y - shift.y - f1.origin.y) * f0.along.y
    const moved: Contour = Math.abs(dx) < 1e-9 ? shape : { ...shape, vertices: shape.vertices.map((v) => ({ ...v, x: v.x + dx })) }
    // on a wall cut into pieces each keeps the part in front of it; on one wall only what is past its ends is cut
    const span = (via.walls && faceSpan(e, via.walls)) || { lo: 0, hi: f1.length }
    const clipped = clipToWall(moved, span.hi, straight.length > 1, span.lo)
    const held = clipped && courtRule(clipped, span.hi, span.lo)
    if (held && 'contour' in held) {
      made.push({ edge: e.id, shape: held.contour })
      for (const n of held.notes) if (!lost.notes.includes(n)) lost.notes.push(n)
    } else if (held) lost.notes.push(`A piece of a truck court left out: ${held.reason.charAt(0).toLowerCase()}${held.reason.slice(1)}`)
  }
  if (!made.length) {
    lost.n++
    return []
  }
  if (made.length === 1 && made[0].edge === c.edge && made[0].shape === shape) return [c]
  const { depth: _, ...rest } = c
  const fresh = () => {
    const id = freeCourtId([...taken].map((t) => ({ id: t })))
    taken.add(id)
    return id
  }
  return made.map((m, k) => ({ ...rest, edge: m.edge, shape: m.shape, ...(made.length > 1 && (k > 0 || !c.id) ? { id: fresh() } : {}) }))
}

/**
 * The elements an edit left out because their wall is angled now (nothing stands on one): those of `before` not in `after` whose
 * edge, or every piece it became, is angled in `edges` (the edges after the edit).
 */
export function leftOnAngled(before: readonly HallElement[], after: readonly HallElement[], edges: readonly Pick<ShapeEdge, 'id' | 'axis'>[], renamed: ReadonlyMap<Id, Id>, pieces?: ReadonlyMap<Id, readonly Id[]>): HallElement[] {
  const kept = new Set(after.map((x) => x.id))
  return before.filter((el) => {
    if (kept.has(el.id)) return false
    const ids = pieces?.get(el.edge) ?? [renamed.get(el.edge) ?? el.edge]
    const es = ids.flatMap((id) => edges.filter((e) => e.id === id))
    return es.length > 0 && es.every((e) => e.axis === null)
  })
}

/** The courts of `before` that an edit left out because their edge is angled now. */
export function courtsOnAngled(before: readonly CourtByEdge[], after: readonly CourtByEdge[], edges: readonly Pick<ShapeEdge, 'id' | 'axis'>[], renamed: ReadonlyMap<Id, Id>, carried?: ReadonlySet<CourtByEdge>): CourtByEdge[] {
  return before.filter((c) => !after.includes(c) && !carried?.has(c) && edges.some((e) => e.id === (renamed.get(c.edge) ?? c.edge) && e.axis === null))
}

/** What an edit says when it leaves docks, doors, patterns and courts out because their wall turned angled ("2 docks left out: …"); none: no notes. */
export function leftOutNotes(elements: readonly HallElement[], courts: readonly CourtByEdge[]): string[] {
  const notes: string[] = []
  const kinds = (['dock', 'door', 'pattern'] as const).map((k) => [k, elements.filter((x) => x.kind === k).length] as const).filter(([, n]) => n > 0)
  if (kinds.length) {
    const said = kinds.map(([k, n]) => plural(n, k))
    notes.push(`${said.length > 1 ? `${said.slice(0, -1).join(', ')} and ${said[said.length - 1]}` : said[0]} left out: ${ANGLED_ELEMENTS.charAt(0).toLowerCase()}${ANGLED_ELEMENTS.slice(1)}`)
  }
  if (courts.length) notes.push(`${plural(courts.length, 'truck court')} left out: ${ANGLED_COURT.charAt(0).toLowerCase()}${ANGLED_COURT.slice(1)}`)
  return notes
}
