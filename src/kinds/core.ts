// The core's kinds (Phase AS.4, Decision "Kinds"): what the plan, the 3D and Layers hold whatever the typology: a mass, a building,
// a level, a street, an existing road, a gate, a lot, a dimension, a drawing, its layers and parcels, the grid, a reference line, a note. Each with
// its branch of the Layers tree and the base verbs it takes: the table *Base verbs by kind* of the AS.4 plan, where a cell that
// AS.4 builds counts as taken (this says what the kind takes when AS.4 is whole), and the docs' *Kinds* table says the same
// (`__tests__/registry.test.ts` reads it). The block type and the parts of a block are the warehouse module's. A kind's own verbs
// are today's menus', moved, in the order the mass's menu lists them: their ids and labels here, their runners in `views/editing/menu/`.
import type { Kind } from './types.ts'

export const CORE_KINDS: Kind[] = [
  {
    id: 'mass',
    label: 'Block',
    plural: 'Blocks',
    group: 'buildings',
    base: ['rename', 'duplicate', 'copy', 'delete', 'select-all', 'lock', 'hide', 'properties'],
    own: [
      // the warehouse module's: a mass that is a block (Decisions "Warehouse type", "Block library")
      { id: 'edit-block', label: 'Edit in the block editor', module: 'warehouse' },
      { id: 'save-block', label: 'Save to the library', module: 'warehouse' },
      { id: 'group', label: 'Group', shared: true },
      { id: 'ungroup', label: 'Ungroup', shared: true },
      { id: 'union', label: 'Union' },
      { id: 'rotate90', label: 'Rotate 90°' },
      // the platform's (the terrain module's: not offered where the typology has no terrain) and the grid's (Decisions "Platforms", "Grid layout")
      { id: 'own-platform', label: 'Own platform', module: 'terrain' },
      { id: 'back-to-building', label: 'Back to the building’s', module: 'terrain' },
      { id: 'split-at-line', label: 'Split at line' },
      // sub-menus: the buildings of the option, the programs of the brief
      { id: 'to-building', label: 'To building' },
      { id: 'program', label: 'Program' },
    ],
    // all of the engine's operations but a move (a block moves by Transform) and a split (only a truck court takes it: Phase D.3)
    shape: { without: ['move', 'split'] },
  },
  // a hole of a mass (Phase D.1; `Ref.id` is `<massId>/<k>`): in every typology, so a core kind, where the warehouse's `hole` is the block editor's.
  // It moves and has its walls and corners edited; it has no bump, radius or chamfer (a block's hole, the block editor's `hole`, is the same engine)
  { id: 'mass-hole', label: 'Hole', plural: 'Holes', group: null, base: [], own: [], shape: { without: ['bump', 'radius', 'chamfer', 'split'] } },
  {
    id: 'building',
    label: 'Building',
    plural: 'Buildings',
    group: 'buildings',
    base: ['rename', 'delete', 'select-all', 'lock', 'hide', 'properties'],
    own: [
      { id: 'assign', label: 'Assign the selection' },
      { id: 'select-masses', label: 'Select its masses' },
      { id: 'context', label: 'Context' },
      { id: 'join-platform', label: 'Join platform with', module: 'terrain' },
      { id: 'own-platform', label: 'Own platform', module: 'terrain' },
      { id: 'in-another-option', label: 'In another option' },
      { id: 'make-unique', label: 'Make unique' },
      { id: 'remove-from-option', label: 'Remove from the option' },
    ],
  },
  { id: 'level', label: 'Level', plural: 'Levels', group: 'buildings', base: ['rename', 'delete', 'lock', 'properties'], own: [{ id: 'go-to', label: 'Go to' }] },
  {
    id: 'street',
    label: 'Street',
    plural: 'Streets',
    group: 'circulation',
    base: ['copy', 'delete', 'select-all', 'lock', 'hide', 'properties'],
    path: { width: 'free', lanes: true },
    own: [
      { id: 'group', label: 'Group', shared: true },
      { id: 'ungroup', label: 'Ungroup', shared: true },
      { id: 'equal-sides', label: 'Equal sides' },
      { id: 'equal-lanes', label: 'Equal lanes' },
    ],
  },
  {
    id: 'existing-road',
    label: 'Existing road',
    plural: 'Existing roads',
    group: 'site',
    // Phase PE.2: it is picked on the plan and transformed like any object, so it copies, locks and groups
    base: ['rename', 'copy', 'delete', 'select-all', 'lock', 'hide', 'properties'],
    own: [
      { id: 'group', label: 'Group', shared: true },
      { id: 'ungroup', label: 'Ungroup', shared: true },
      { id: 'equal-sides', label: 'Equal sides' },
      { id: 'equal-lanes', label: 'Equal lanes' },
    ],
    path: { width: 'free', lanes: true },
  },
  {
    id: 'gate',
    label: 'Gate',
    plural: 'Gates',
    group: 'circulation',
    base: ['delete', 'select-all', 'lock', 'hide', 'properties'],
    own: [
      { id: 'group', label: 'Group', shared: true },
      { id: 'ungroup', label: 'Ungroup', shared: true },
    ],
    // Phase PE.2 (Decision "On edge engine"): it stands on a side of a street, of an existing street, or on the site's boundary (`Gate.on` / `Gate.t`)
    onEdge: { hosts: ['street', 'existing-road', 'boundary'] },
  },
  {
    id: 'lot',
    label: 'Lot',
    plural: 'Lots',
    group: 'parking',
    base: ['rename', 'delete', 'select-all', 'lock', 'hide', 'properties'],
    own: [
      { id: 'group', label: 'Group', shared: true },
      { id: 'ungroup', label: 'Ungroup', shared: true },
    ],
  },
  {
    id: 'dimension',
    label: 'Dimension',
    plural: 'Dimensions',
    group: 'annotations',
    base: ['delete', 'select-all', 'hide', 'properties'],
    own: [
      { id: 'fixed-length', label: 'Fixed length' },
      { id: 'group', label: 'Group', shared: true },
      { id: 'ungroup', label: 'Ungroup', shared: true },
    ],
  },
  {
    id: 'drawing',
    label: 'Drawing file',
    plural: 'Drawing files',
    group: 'site',
    // *Delete* is the file's *Remove*
    base: ['delete', 'lock', 'hide', 'properties'],
    own: [
      { id: 'split-layers', label: 'Separate / Join layers' },
      { id: 'on-top', label: 'On top' },
    ],
  },
  { id: 'drawing-layer', label: 'Drawing layer', plural: 'Drawing layers', group: 'site', base: ['lock', 'hide', 'properties'], own: [] },
  { id: 'parcels', label: 'Parcels', plural: 'Parcels', group: 'site', base: ['lock', 'hide', 'properties'], own: [] },
  // its eye is the snap's *Grid* switch
  { id: 'grid', label: 'Grid', plural: 'Grids', group: 'reference', base: ['hide', 'properties'], own: [{ id: 'restore-original', label: 'Restore original' }] },
  // Phase AS.5: the guide the other tools snap to (the project's: no level), and a text placed on a level. Their *Group* and *Ungroup* are shared
  // (`shared`), as the mass's, the street's, the lot's, the gate's and the dimension's are (Decision "Groups of any kind")
  {
    id: 'reference-line',
    label: 'Reference line',
    plural: 'Reference lines',
    group: 'reference',
    base: ['delete', 'select-all', 'lock', 'hide', 'properties'],
    own: [
      { id: 'on-top', label: 'On top' },
      { id: 'group', label: 'Group', shared: true },
      { id: 'ungroup', label: 'Ungroup', shared: true },
    ],
  },
  {
    id: 'note',
    label: 'Note',
    plural: 'Notes',
    group: 'annotations',
    base: ['rename', 'delete', 'select-all', 'lock', 'hide', 'properties'],
    own: [
      { id: 'group', label: 'Group', shared: true },
      { id: 'ungroup', label: 'Ungroup', shared: true },
    ],
  },
  // Phase PE.2: the site's outline as a host a gate stands on (no verbs, no branch of Layers: a host, as the block editor's `edge` is)
  { id: 'boundary', label: 'Site boundary', plural: 'Site boundaries', group: null, base: [], own: [] },
]
