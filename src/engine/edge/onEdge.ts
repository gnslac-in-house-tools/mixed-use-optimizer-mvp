// One set of operations for anything standing on the edges of a host (Phase D.3, Decision "On edge engine"): docks, doors and patterns on
// a block's walls first (the later hosts: a street's sides, a lot's perimeter, projects E and F). The types here are what the adapters
// and the controls speak, as `geom/shapeOp.ts` is for the Shape engine: the engine's alone, pure (no React, no store, no DOM).
// How a host is read and written is its adapter's (`state/actions/onEdge.ts`, the warehouse's `actions.ts`), and which kinds stand on which
// hosts is data (`Kind.onEdge`). Slots are whole slots (a block's: its modules); a later host's may be metres.
import type { Ref } from '../../kinds/types.ts'
import type { Id, Point, Project } from '../../model/schema.ts'

/** What a person does to the elements on a host's edges. Slots are numbered along each edge from its start, as `EdgeInfo.slots` gives them. */
export type EdgeOp =
  /** One of a kind on each of these slots of an edge (the ones holding it already stay); `byRule`: only the slots the host's rule gives (a block: the dock rule, a bay filled, a drag along a wall). */
  | { op: 'put'; edge: Id; slots: number[]; kind: string; name?: string; byRule?: true }
  /** The ones of a kind on these slots taken away; `byRule` as `put`. */
  | { op: 'take'; edge: Id; slots: number[]; kind: string; name?: string; byRule?: true }
  /** The elements `ids` moved `by` whole slots along their edges, all or none. */
  | { op: 'slide'; ids: Id[]; by: number }
  /** The elements `ids` as wide as `width` m. */
  | { op: 'width'; ids: Id[]; width: number }
  /** `n` of a kind on the edge's run: added or taken at that end of it by the host's rule. */
  | { op: 'count'; edge: Id; kind: string; name?: string; n: number; end: 'start' | 'end' }

export type EdgeOpName = EdgeOp['op']

/** One slot of an edge: its number, where it lies (m from the edge's origin along its direction) and the group it belongs to (a block: its bay; -1: none). */
export interface EdgeSlot {
  k: number
  from: number
  to: number
  group: number
}

/** An edge of a host, in the viewport's frame: the line `origin` + `dir` × m carries its slots; `a`–`b` is the edge itself, `out` its outward unit vector. */
export interface EdgeInfo {
  id: Id
  name: string
  a: Point
  b: Point
  out: Point
  origin: Point
  dir: Point
  slots: EdgeSlot[]
  /** Why nothing stands on it (a wall not along the grid); its slots are then none. */
  refused?: string
}

/** An element on an edge: its slot, and how wide it is (m). */
export interface EdgeElement {
  id: Id
  kind: string
  name?: string
  edge: Id
  slot: number
  width: number
}

export interface EdgeRead {
  edges: EdgeInfo[]
  elements: EdgeElement[]
}

/** The same project and `reason` when refused; `notes` say what the edit did beyond what was asked (a count that did not all fit). */
export interface EdgeWrite {
  project: Project
  reason?: string
  notes?: string[]
}

/** How the host of a kind's `onEdge` is read and written; the kind says which hosts it stands on, the adapter applies the host's rules. */
export interface EdgeAdapter {
  /** `optionId`: the option whose gates and streets are read (Phase PE.2: a gate's host is a street of an option); a block's host has no use for it. */
  read(p: Project, host: Ref, optionId?: Id): EdgeRead | null
  write(p: Project, host: Ref, op: EdgeOp, optionId?: Id): EdgeWrite
}
