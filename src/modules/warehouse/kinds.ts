// The warehouse module's kinds (Phase AS.4, Decision "Kinds"): a block of the Blocks tab (a warehouse type of the project or of the
// library) and the parts of a block in the block editor (Decisions "Warehouse by hand", "Block shape"). The block type takes Rename,
// Duplicate, Delete and Select all (its *Edit* opens the Program window, so no Properties); the parts have their own verbs only, as the
// editor's menu has today: their base verbs come with the engines (project D). Data in the shape of `kinds/types.ts`.
import type { Kind } from '../../kinds/types.ts'

export const WAREHOUSE_KINDS: Kind[] = [
  {
    id: 'block-type',
    label: 'Block type',
    plural: 'Block types',
    group: null,
    base: ['rename', 'duplicate', 'delete', 'select-all'],
    own: [
      { id: 'place', label: 'Place' },
      { id: 'edit', label: 'Edit' },
      { id: 'select-copies', label: 'Select its copies on the site' },
      { id: 'save-to-library', label: 'Save to the library' },
      { id: 'download', label: 'Download .gfb' },
      { id: 'remove-from-library', label: 'Remove from the library' },
    ],
    // its outline is free (Phase D.2, Decision "Block shape"): every op of the shape engine, the module lines a snap; it moves by Transform and takes no split (only a truck court does)
    shape: { without: ['move', 'split'] },
  },
  {
    id: 'zone',
    label: 'Zone',
    plural: 'Zones',
    group: null,
    base: [],
    own: [
      { id: 'program', label: 'Program' },
      { id: 'split', label: 'Split here' },
      { id: 'merge', label: 'Merge with' },
      { id: 'level-up', label: 'Level up' },
      { id: 'level-down', label: 'Level down' },
    ],
  },
  // a hole of the block editor (`Ref.id` is `<typeId>/<holeId>`): a free contour on the shape engine, as a mass's hole is (kind `mass-hole`): no bump, radius, chamfer or split
  { id: 'hole', label: 'Hole', plural: 'Holes', group: null, base: [], own: [{ id: 'remove', label: 'Remove the hole' }], shape: { without: ['bump', 'radius', 'chamfer', 'split'] } },
  {
    id: 'court',
    label: 'Truck court',
    plural: 'Truck courts',
    group: null,
    base: [],
    own: [
      { id: 'to-rectangle', label: 'Back to a rectangle' },
      { id: 'remove', label: 'Remove this truck court' },
      { id: 'block-depth', label: 'The block’s depth again' },
    ],
    // a truck court is a shape of its own on its wall (Phase D.3): every op but a move, a court moves with its wall; it takes a split, the only kind that does
    shape: { without: ['move'] },
  },
  // a placed block's truck court on the site (`Ref.id` is `<hallMassId>/<edgeId>[/<courtId>]`): the court of the block editor, on the plan, its shape the copy's own
  {
    id: 'block-court',
    label: 'Truck court',
    plural: 'Truck courts',
    group: null,
    base: [],
    own: [{ id: 'to-rectangle', label: 'Back to a rectangle' }],
    shape: { without: ['move'] },
  },
  // a dock, a door or a pattern on a block's wall (Phase D.3): on the On edge engine, in the block editor (`block-type`) and on the site (`mass`, a block's hall)
  { id: 'element', label: 'Element', plural: 'Elements', group: null, base: [], own: [{ id: 'remove', label: 'Remove this element' }], onEdge: { hosts: ['block-type', 'mass'] } },
  {
    id: 'edge',
    label: 'Edge',
    plural: 'Edges',
    group: null,
    base: [],
    own: [
      { id: 'pull-out', label: 'Pull out this bay' },
      { id: 'push-in', label: 'Push in this bay' },
      { id: 'corner-start', label: 'Remove the corner at its start' },
      { id: 'corner-end', label: 'Remove the corner at its end' },
    ],
  },
]
