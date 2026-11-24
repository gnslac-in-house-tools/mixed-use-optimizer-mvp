// The outline a corner tool picks its corners on (Phase D.2 task 6): a plain mass's footprint; a block's mass, its face as the shape engine reads it
// (`actions.shapeOf`), whose corner `i` is where wall `i` starts. The footprint of a block with a chamfer or a curve has points of its own, so its
// numbers run ahead of the face's, and the engine's ops are given the face's. Besides the masses of the level, the truck courts of the placed block picked (Phase D.3 task 7: `block-court`,
// each a shape of its own), read the same way: an outline is a thing with a ref, whose corners the tools pick.
import type { Contour, Id, Mass, Project } from '../../../model/schema.ts'
import type { Ref } from '../../../kinds/types.ts'
import { footprintContour } from '../../../engine/geom/footprint.ts'
import { actions } from '../../../state/actions/index.ts'

/** What a corner tool picks a corner of: a mass of the level or a court of the block picked, the ref the shape engine edits it by and its contour as the engine reads it. */
export interface Outline {
  /** The mass's id, or the court's ref id (`<hallMassId>/<edgeId>[/<courtId>]`). */
  id: Id
  ref: Ref
  contour: Contour
}

/** The outlines of `masses` and of these truck courts (refs of kind `block-court`, in the project `p`). */
export function outlinesOf(p: Project, masses: Mass[], courts: Ref[]): Outline[] {
  // the courts first: a court's corner on its wall stands where its block's own corner does, and of two as near the later one is picked, so the block's wins
  return [
    ...courts.flatMap((ref): Outline[] => {
      const read = actions.shapeOf(p, ref)
      return read ? [{ id: ref.id, ref, contour: read.contour }] : []
    }),
    ...masses.map((m): Outline => ({ id: m.id, ref: { kind: 'mass', id: m.id }, contour: massContour(p, m) })),
  ]
}

/** The contour of `m` the Corner and Chamfer tools read and edit. */
export function massContour(p: Project, m: Mass): Contour {
  return actions.shapeOf(p, { kind: 'mass', id: m.id })?.contour ?? footprintContour(m.footprint)
}
