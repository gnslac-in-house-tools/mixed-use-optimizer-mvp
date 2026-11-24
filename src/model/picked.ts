// What the plan has picked, by kind (Decision "General tools"): the shape the Tools strip's Move, Copy and Rotate hand to
// the verbs of `state/actions/selection.ts`. Types and a constant only, so views and verbs share it (a view may not
// import an action module, not even for a type).
import type { Id } from './schema.ts'

/**
 * A part of an imported drawing (Decision "Drawings move"): the whole file (its layers and its parcels), one of its
 * layers, or its parcels (`layer` wins when a part has both). A drawing has no id: the file's name and the layer's name tell it.
 */
export interface DrawingPart {
  file: string
  layer?: string
  parcels?: true
}

/**
 * What is picked, by kind: masses, a street's nodes, existing streets (`existing`, Phase PE.2), lots, gates, the project's dimensions, its reference
 * lines (`lines`), its notes (Phase AS.5), parts of imported drawings.
 */
export interface Picked {
  masses: Id[]
  nodes: Id[]
  existing: Id[]
  lots: Id[]
  gates: Id[]
  dimensions: Id[]
  lines: Id[]
  notes: Id[]
  drawings: DrawingPart[]
}

export const NOTHING_PICKED: Picked = { masses: [], nodes: [], existing: [], lots: [], gates: [], dimensions: [], lines: [], notes: [], drawings: [] }

/**
 * What a press on a locked thing says (Decision "Drawings move"; the padlock is CAD's, AS.3): a drawing's layer or a mass,
 * seen and not picked. The plan's pick, the 3D's and the verbs alike.
 */
export const LOCKED = 'Locked: unlock it in Layers'

/** What Copy says of the drawings picked: they stay, uncopied. */
export const NOT_COPIED = 'Drawings are not copied'
