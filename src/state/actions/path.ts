// The path verbs (Phase PE.1, Decision "Path engine"): one pair for anything that is a drawn line with paving each side of every
// stretch. `pathOf(p, ref, optionId)` reads it (what its handles draw), `editPath(p, ref, op, optionId)` runs one op of the path engine
// (`engine/path/pathOp.ts`) on it, with one adapter a kind (`PATH_ADAPTERS`, checked against the kinds that declare `path`): a street's
// is in `streets.ts` (its chain between crossings), an existing road's here. The option is an argument because an option's copy repeats
// its segment ids (Decision "Padlocks by kind"). Order of refusals: the kind's (`width: 'none'` refuses `side` and `width`), then a
// locked stretch the op touches, then the adapter's; a refusal is the SAME project and its reason, so it is no undo step.
import type { Id, Project } from '../../model/schema.ts'
import { kindOf, type Ref } from '../../kinds/index.ts'
import { standardsOf } from '../../engine/circulation/standards.ts'
import { streetChains } from '../../engine/circulation/streets.ts'
import { JOIN } from '../../engine/path/ends.ts'
import { runPathOp } from '../../engine/path/pathOp.ts'
import type { Path, PathOp } from '../../engine/path/types.ts'
import { streetPath } from './streets.ts'

/** A path as the handles read it. `nodes`: its nodes' ids (an existing road's: their indexes as strings); `held`: by stretch, locked; `shared`: by node, met by another street. */
export interface PathRead {
  path: Path
  nodes: Id[]
  held: boolean[]
  shared: boolean[]
}

/** What an edit did: the project after it (the same one when refused, or when nothing changed), why it was refused, and what it clamped. */
export interface PathWrite {
  project: Project
  reason?: string
  notes?: string[]
}

export interface PathAdapter {
  read(p: Project, ref: Ref, optionId: Id): PathRead | null
  write(p: Project, ref: Ref, optionId: Id, op: PathOp): PathWrite
}

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y)

// ---- The adapter of an existing road ----

/** The road a ref names: its id, or its derived road's (`existing:<id>`, `existing:<id>:<k>`). */
function roadOf(p: Project, id: Id) {
  const list = p.site.existingRoads ?? []
  const exact = list.find((r) => r.id === id)
  if (exact) return exact
  const named = id.startsWith('existing:') ? id.slice('existing:'.length) : null
  if (named === null) return undefined
  return list.find((r) => r.id === named) ?? list.find((r) => named.startsWith(`${r.id}:`))
}

const existingRoad: PathAdapter = {
  read(p, ref) {
    const r = roadOf(p, ref.id)
    if (!r) return null
    return {
      path: { points: r.points, stretches: r.stretches },
      nodes: r.points.map((_, i) => String(i)),
      // a locked road holds every stretch of it (its padlock is the road's: Phase PE.2)
      held: r.stretches.map(() => r.locked === true),
      shared: r.points.map(() => false),
    }
  },
  write(p, ref, _optionId, op) {
    const r = roadOf(p, ref.id)
    if (!r) return { project: p, reason: 'That existing road is not there' }
    const run = runPathOp({ points: r.points, stretches: r.stretches }, op)
    if (!run.ok) return { project: p, reason: run.reason }
    let { points, stretches } = run.path
    // a node dropped on its neighbour: the stretch between them has no length, and goes (their two nodes one)
    if (op.op === 'node') {
      const j = [op.i - 1, op.i + 1].find((x) => x >= 0 && x < points.length && dist(points[op.i], points[x]) <= JOIN)
      if (j !== undefined) {
        if (points.length <= 2) return { project: p, reason: 'A street has two nodes at least' }
        const gone = Math.min(op.i, j)
        points = points.filter((_, i) => i !== op.i)
        stretches = stretches.filter((_, k) => k !== gone)
      }
    }
    const notes = run.notes.length ? { notes: run.notes } : {}
    const site = { ...p.site, existingRoads: (p.site.existingRoads ?? []).map((x) => (x === r ? { ...x, points, stretches } : x)) }
    return { project: { ...p, site }, ...notes }
  },
}

/** How each kind with a `path` is read and written, by the kind's id (`__tests__/pathEngine.test.ts` checks it against the registry). */
export const PATH_ADAPTERS: Record<string, PathAdapter> = {
  street: streetPath,
  'existing-road': existingRoad,
}

/** The path of a street or an existing road, as its handles draw it; null for what is not there or a kind with no path. */
export function pathOf(p: Project, ref: Ref, optionId: Id): PathRead | null {
  if (!kindOf(ref.kind, p)?.path) return null
  return PATH_ADAPTERS[ref.kind]?.read(p, ref, optionId) ?? null
}

const isLaneOp = (op: PathOp): op is Extract<PathOp, { op: 'lanes' | 'line' | 'lane' | 'equal-lanes' | 'lane-widths' }> =>
  op.op === 'lanes' || op.op === 'line' || op.op === 'lane' || op.op === 'equal-lanes' || op.op === 'lane-widths'

/** The stretches an op touches (a locked one refuses it): the ones at the nodes it moves, the one it splits, the ones it sizes. */
function touched(op: PathOp, stretches: number, closed: boolean): number[] {
  const at = (i: number): number[] => {
    const around = closed && (i === 0 || i === stretches) ? [stretches - 1, 0] : [i - 1, i]
    return around.filter((k) => k >= 0 && k < stretches)
  }
  switch (op.op) {
    case 'node':
    case 'remove':
      return at(op.i)
    case 'insert':
      return [op.k]
    case 'stretch':
      return [...at(op.k), ...at(op.k + 1)]
    case 'side':
    case 'width':
    case 'lanes':
    case 'line':
    case 'lane':
    case 'equal-lanes':
    case 'lane-widths':
      return op.k === 'all' ? Array.from({ length: stretches }, (_, k) => k) : [op.k]
    case 'equal':
      return Array.from({ length: stretches }, (_, k) => k)
  }
}

/**
 * One op of the path engine on a street or an existing road, in one option. A kind that is no path, a width it does not take, a locked
 * stretch the op touches, or what the adapter or the engine refuses: the SAME project and its reason. `notes`: what was clamped.
 */
export function editPath(p: Project, ref: Ref, op: PathOp, optionId: Id): PathWrite {
  const kind = kindOf(ref.kind, p)
  if (!kind?.path) return { project: p, reason: kind ? `A ${kind.label.toLowerCase()} is no path` : 'That is no path' }
  if (kind.path.width === 'none' && (op.op === 'side' || op.op === 'width')) return { project: p, reason: `A ${kind.label} has no width` }
  const lane = isLaneOp(op)
  if (lane && !kind.path.lanes) return { project: p, reason: `A ${kind.label} has no lanes` }
  const adapter = PATH_ADAPTERS[ref.kind]
  const read = adapter?.read(p, ref, optionId)
  if (!adapter || !read) return { project: p, reason: `That ${kind.label.toLowerCase()} is not there` }
  const closed = read.nodes.length > 2 && read.nodes[0] === read.nodes[read.nodes.length - 1]
  if (touched(op, read.held.length, closed).some((k) => read.held[k])) return { project: p, reason: 'That stretch is locked' }
  // a lane op without its own width takes the standard's (the new lane's, and the lanes an unstored stretch shows)
  const given = lane && op.op !== 'lane-widths' && op.laneWidth === undefined ? { ...op, laneWidth: standardsOf(p, p.options.find((o) => o.id === optionId)).laneWidth } : op
  return adapter.write(p, ref, optionId, given)
}

/** How many lanes, or each lane's width (left to right, walking the path), for `setLanes`. */
export type LanesSpec = { count: number } | { widths: number[] }

/**
 * A street's or an existing street's lanes set on every stretch (Phase PE.2, task 13, the agent's `setStreetLanes`): `count` equal lanes of each stretch's
 * width, or `widths` that add up to it, through `editPath`. A locked stretch is left out and named in the notes (a street's: its segment id); one that
 * refuses (a lane under 2 m, widths that do not add up) refuses the whole edit, the SAME project and its reason.
 */
export function setLanes(p: Project, ref: Ref, spec: LanesSpec, optionId: Id): PathWrite {
  const op = (k: number | 'all'): PathOp => ('count' in spec ? { op: 'equal-lanes', k, n: spec.count } : { op: 'lane-widths', k, widths: spec.widths })
  const read = pathOf(p, ref, optionId)
  const held = read?.held ?? []
  const free = held.map((h, k) => (h ? -1 : k)).filter((k) => k >= 0)
  // nothing is locked, or nothing is free, or it is no path: the engine's own answer on every stretch
  if (!read || held.every((h) => !h) || free.length === 0) return editPath(p, ref, op('all'), optionId)
  let q = p
  const notes: string[] = []
  for (const k of free) {
    const r = editPath(q, ref, op(k), optionId)
    if (r.reason) return { project: p, reason: r.reason }
    q = r.project
    notes.push(...(r.notes ?? []))
  }
  const streets = p.options.find((o) => o.id === optionId)?.streets
  const seg = ref.id.startsWith('street:') ? ref.id.slice('street:'.length) : ref.id
  const segs = ref.kind === 'street' && streets ? streetChains(streets).find((c) => c.segs.includes(seg))?.segs : undefined
  const named = held.flatMap((h, k) => (h ? [segs?.[k] ?? `stretch ${k + 1}`] : []))
  return { project: q, notes: [...notes, `Left out, locked: ${named.join(', ')}`] }
}
