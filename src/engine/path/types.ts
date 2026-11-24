// The path engine's words (Decision "Path engine"): a polyline with the paving each side of every stretch. Pure.
import type { Point } from '../../model/schema.ts'

/** m from the drawn line, walking the path: the paving on each hand of one stretch. */
export interface Stretch {
  left: number
  right: number
  /** m, left to right walking the path: the lanes, when stored (they add up to `left + right`; see `lanesOf`). */
  lanes?: number[]
}

/** A drawn line and its stretches: `stretches.length === points.length - 1`. */
export interface Path {
  points: Point[]
  stretches: Stretch[]
}

export type PathOp =
  | { op: 'node'; i: number; to: Point }
  | { op: 'insert'; k: number; at: Point }
  | { op: 'remove'; i: number }
  | { op: 'stretch'; k: number; by: Point }
  /** `k: 'all'` leaves a side at 0 where it is (it is the drawn line), unless `zeros`: the 0 sides move too. */
  | { op: 'side'; k: number | 'all'; side: 'left' | 'right'; by: number; zeros?: boolean }
  | { op: 'width'; k: number | 'all'; side: 'left' | 'right'; to: number }
  | { op: 'equal'; held?: number[] }
  // Phase PE.2, lanes: a lane op acts on the stretches that have what it names (`'all'`: every one); `from` is the identity.
  /** One lane more (`+1`) or less (`-1`), on the side farther from the drawn line; a centred stretch takes half each side. */
  | { op: 'lanes'; k: number | 'all'; by: 1 | -1; laneWidth?: number }
  /** The line between lanes `line` and `line + 1` moved by `by` m (positive to the right). */
  | { op: 'line'; k: number | 'all'; line: number; by: number; laneWidth?: number }
  /** The lane on that side of the line set to `to` m, the other lane giving. */
  | { op: 'lane'; k: number | 'all'; line: number; side: 'left' | 'right'; to: number; laneWidth?: number }
  /** `n` equal lanes of the width (the number of lanes kept unless given). */
  | { op: 'equal-lanes'; k: number | 'all'; n?: number; laneWidth?: number }
  /** Every lane given, left to right; they must add up to the width. */
  | { op: 'lane-widths'; k: number | 'all'; widths: number[] }

/** What an op did: the path after it, the old stretch each new one comes from, and why it was refused or clamped. */
export interface PathRun {
  ok: boolean
  path: Path
  from: (number | null)[]
  reason?: string
  notes: string[]
}
