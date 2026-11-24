// The viewport the On edge views stand in (Phase D.3 task 10, Decision "On edge engine"): `EdgeHandles` draws the previews of a press and starts its drags, and everything that is the
// viewport's own, or the host's own (where a press lands, what a slot's band is), comes in through an `EdgeHost`. The block editor's is `modules/warehouse/views/blockEdgeHost.ts`
// (a type's walls), the site's is made from the same code on a placed block. The host never writes: an edit goes through `actions.editEdge` and `commit` says how it reaches the project.
import type { Id, Point, Polygon, Project } from '../../../model/schema.ts'
import type { Ref } from '../../../kinds/index.ts'

/** What a press of an element tool lands on, in a host's own maths: the wall, the slots (a bay's by the host's rule) and whether they are put (`on`) or taken away. `refused`: why nothing stands on that wall. */
export interface EdgePress {
  edge: Id
  slots: number[]
  on: boolean
  bay: boolean
  /** The first and last module the press's bay spans (a bay press: all of it, though only `slots` change); the preview's outline. */
  span?: [number, number]
  refused?: string
}

export interface EdgeHost {
  /** The host the engine reads and writes (`block-type` in the block editor, `mass` on the site). */
  ref: Ref
  /** `ghost`: the block editor's (its typed field), `live`: the site's. */
  mode: 'live' | 'ghost'
  /** What a press of `kind` (a pattern of `name`) at `q` (the viewport's frame, m) lands on, `scale` px per metre; null when there is no wall near. */
  press(q: Point, kind: string, name: string | undefined, scale: number): EdgePress | null
  /** The slots a drag along the wall passes, from the press's `first` to the pointer's `q`, put (`on`) or taken away. */
  paint(edge: Id, kind: string, first: number[], q: Point, on: boolean): number[]
  /** The element whose piece is under `q`, if any. */
  elementAt(q: Point, scale: number): Id | null
  /** The band of a slot of an edge, as a polygon of the viewport's frame (m, y up). */
  band(edge: Id, slot: number): Polygon
  /** The name a pattern put by the tool takes (the host's last pattern's, else none). */
  patternName(): string | undefined
  /** How an edit reaches the project: one undo step (the block editor's also tells the copies that keep their own). */
  commit(f: (p: Project) => Project): void
  /** How a length is written and typed here (absent: metres): the block editor's unit, feet too (review S2). `text`: a length in m as it is shown, `fromShown`: a number typed, in m. */
  lengths?: { unit: string; text(m: number): string; fromShown(v: number): number }
  /** A press on an element that moved nothing picks it alone (the viewport's pick: the block editor's plan, the site's `edgePick.ts`). */
  pick?(id: Id): void
}

/** The tool in hand: the kind it puts (a pattern's name is the host's). */
export type ElementTool = 'dock' | 'door' | 'pattern'
