// What a kind is (Phase AS.4, Decision "Kinds"; the native engines' master design, *A kind definition*): a kind of thing a person
// picks, the plan, the 3D, Layers and the Blocks tab alike: its id, its names, its branch of the Layers tree, the base verbs it takes
// and the names of its own. Pure data, no function that touches a store, and types only: a module's manifest brings its kinds in
// this shape (`Module.kinds`), so the modules import this file and nothing else of `src/kinds/`. The runners of the verbs (what a
// verb does) are the menu's, in `views/editing/menu/`; here is only what the kind takes.

import type { ShapeOpName } from '../engine/geom/shapeOp.ts'

/** A branch of the Layers tree (`views/layers/tree.ts`), and the group of a kind in it. */
export type LayerGroup = 'site' | 'reference' | 'buildings' | 'circulation' | 'parking' | 'annotations'

/** The verbs every kind may take: the menu's second and third parts, and Properties, last and alone (Decision "One menu"). */
export type BaseVerb = 'rename' | 'duplicate' | 'copy' | 'delete' | 'select-all' | 'lock' | 'hide' | 'properties'

/** A verb of the kind's own, by id and the label its menu gives it (a label may be a sub-menu's title: *To building*, *Program*). */
export interface OwnVerb {
  id: string
  label: string
  /** The module whose code runs it: the verb is listed only while the project's typology offers that module. Absent: the core's. */
  module?: string
  /**
   * A verb several kinds have by one name (*Group*, *Ungroup*; Phase AS.5): the menu of several kinds picked at once lists the shared own
   * verbs that every picked kind has, first. Absent: the verb is the kind's alone.
   */
  shared?: true
}

export interface Kind {
  /** `mass`, `street`, `lot`… unique in the registry; what a `Ref` names. */
  id: string
  /** What one is called: *Mass*, *Existing road*. */
  label: string
  /** What several are called, for *Select all masses*, *Delete 3 blocks*. */
  plural: string
  /** Its branch of the Layers tree; null for what stands in no branch (a block of the Blocks tab, the parts of a block in its editor). */
  group: LayerGroup | null
  /**
   * The base verbs it takes, in the menu's order. A verb a kind cannot take is not here (a gate has no name: no *rename*); one that
   * cannot run now is greyed by the menu, with its reason (the kind says what it takes when AS.4 is whole, not what each build did).
   */
  base: BaseVerb[]
  /** Its own verbs, first in its menu. */
  own: OwnVerb[]
  /**
   * It has an outline the shape engine edits (Phase D.1, Decision "Shape engine"): a wall pushed, a bump, a corner, a radius, a chamfer, a cut by a line.
   * `without`: the operations it refuses (`engine/geom/shapeOp.ts`); absent: it takes them all. Data only: how it is read and written is
   * its adapter's (`state/actions/shape.ts`), because a kind may not import a verb.
   */
  shape?: { without?: ShapeOpName[] }
  /**
   * It stands on the edges of a host (Phase D.3, Decision "On edge engine"): docks, doors and patterns on a block's walls. `hosts`: the kinds it
   * stands on, each with an adapter in `state/actions/onEdge.ts` (a test checks both ways). Data only, as `shape` is.
   */
  onEdge?: { hosts: string[] }
  /**
   * It is a path (Phase PE.1, Decision "Path engine"): a drawn line with the paving each side of every stretch, read and edited by
   * `pathOf` and `editPath` (`state/actions/path.ts`), one adapter a kind (a test checks both ways). `width`: `free` when each side
   * can be pulled, `none` for a path with no paving to size (it refuses `side` and `width`); `lanes`: whether it has lanes (PE.2). Data only.
   */
  path?: { width: 'free' | 'none'; lanes: boolean }
}

/**
 * Anything picked, in one way: its kind and its id. A street's id is the derived road's, as the stores hold it; a drawing layer and
 * a file's parcels carry their `file` (`id`: the layer's name, the file's name); a row of Layers that is not an object (a building,
 * a level) is its id too.
 */
export interface Ref {
  kind: string
  id: string
  file?: string
}
