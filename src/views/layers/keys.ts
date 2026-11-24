// The keys of what the viewer can hide (layerView.ts, Phase AS.3): one string for each thing with an eye. A kind that
// is one thing has a constant ('map', 'labels'…); a kind with many has one maker (`building(id)`, `drawingLayer(file,
// layer)`, `parcel(name, file?)`), and nobody builds a key by hand: readers, eyes and tests all come through here.
// A key is not an id of the project and never leaves the browser: it is in no .gft.
// A kind of the circulation or the parking (`GATES`, `LOTS`…) hides all it holds; the kinds that will have a row each in
// the tree (gates, existing roads, lots) also have a maker for an object's own key, and `isObjectHidden` is the
// one place that says whether such an object is hidden: its kind's key, or its own. Hide for one object (Phase AS.4, Decision "Hide for
// one object") gives a dimension its own key too, and a street its segments': a street as a person sees it is the derived road, whose id
// changes when it is split, so its eye hangs on the segments (`street:<segment id>`); a street is hidden when all its segments are
// (`isStreetHidden`, `roadHidden`), and the stalls along a hidden street go with it (`shownStalls`).
import type { Circulation, DerivedRoad } from '../../engine/types.ts'
import type { Id } from '../../model/schema.ts'

/** The site's boundary and its buildable area (their outlines: the site's paper under them stays). */
export const BOUNDARY = 'boundary'
export const BUILDABLE = 'buildable'

/** The map under the plan. */
export const MAP = 'map'
/** The masses' names and areas on the plan. */
export const LABELS = 'labels'
/** The dimensions on the plan. */
export const DIMENSIONS = 'dimensions'
/** The project's reference lines (Phase AS.5): the guides the other tools snap to. */
export const REFERENCE_LINES = 'reference-lines'
/** The project's notes (Phase AS.5): a text placed on a level of the plan. */
export const NOTES = 'notes'
/** The warnings beside the masses on the plan (their chips). */
export const ISSUES = 'issues'
/** The brief's rules as arcs on the plan. */
export const RULES = 'rules'

/** The option's streets: their paving, centrelines, handles and picks. */
export const STREETS = 'streets'
/** The site's existing roads (the context's). */
export const EXISTING_ROADS = 'existing-roads'
/** The gates: their lane, posts, guard house, arrow and handle. */
export const GATES = 'gates'
/** The truck courts and their approaches (derived: no row of their own). */
export const COURTS = 'courts'
/** The option's parking lots. */
export const LOTS = 'lots'
/** The car stalls along the streets (derived: no row of their own). */
export const STREET_PARKING = 'street-parking'

/** A building of the option: hidden, it is not drawn (it still counts in every figure). */
export const building = (id: Id) => `building:${id}`
/** A mass of the project: its own eye (Phase AS.4: Hide for one object); the building's hides the whole building. */
export const mass = (id: Id) => `mass:${id}`
/** A reference layer of a drawing: its file and its name. */
export const drawingLayer = (file: string, layer: string) => `${file}/${layer}`
/** A parcel: its file (when it has one) and its name, so two files' same-named parcels are told apart. */
export const parcel = (name: string, file?: string) => (file === undefined ? `parcel:${name}` : `parcel:${file}/${name}`)
/** A gate of the option. */
export const gate = (id: Id) => `gate:${id}`
/** An existing road of the site: its id in the project (`DerivedRoad.sourceId`). */
export const existingRoad = (id: Id) => `existing-road:${id}`
/** A parking lot of the option. */
export const lot = (id: Id) => `lot:${id}`
/** A street segment of the option (a street's eye is its segments': it is hidden when all are). */
export const street = (segmentId: Id) => `street:${segmentId}`
/** A hand-drawn dimension. */
export const dimension = (id: Id) => `dimension:${id}`
/** A reference line (Phase AS.5). */
export const referenceLine = (id: Id) => `reference-line:${id}`
/** A note (Phase AS.5). */
export const note = (id: Id) => `note:${id}`

/** What has a key of its own beside its kind's. */
export type ObjectKind = 'gate' | 'existing-road' | 'lot' | 'street' | 'dimension' | 'reference-line' | 'note'

const OBJECTS: Record<ObjectKind, { kind: string; own(id: Id): string }> = {
  gate: { kind: GATES, own: gate },
  'existing-road': { kind: EXISTING_ROADS, own: existingRoad },
  lot: { kind: LOTS, own: lot },
  // a street's id here is a segment's
  street: { kind: STREETS, own: street },
  dimension: { kind: DIMENSIONS, own: dimension },
  'reference-line': { kind: REFERENCE_LINES, own: referenceLine },
  note: { kind: NOTES, own: note },
}

/** Is this gate, existing road, lot, street segment, dimension, reference line or note hidden: its kind's key is, or its own? The rule, written once. */
export function isObjectHidden(off: ReadonlySet<string>, kind: ObjectKind, id: Id): boolean {
  const o = OBJECTS[kind]
  return off.has(o.kind) || off.has(o.own(id))
}

/** Is a street hidden: Streets is, or every one of its segments is (a street with none hidden, or only some, is drawn; one with no segments is not a street's). */
export const isStreetHidden = (off: ReadonlySet<string>, segments: readonly Id[] | undefined): boolean =>
  off.has(STREETS) || (segments !== undefined && segments.length > 0 && segments.every((id) => off.has(street(id))))

/** Is this derived road hidden: a street by `isStreetHidden`, an existing road by its kind's key or its own (`DerivedRoad.sourceId`). */
export const roadHidden = (off: ReadonlySet<string>, r: Pick<DerivedRoad, 'id' | 'kind' | 'segments' | 'sourceId'>): boolean =>
  r.kind === 'street' ? isStreetHidden(off, r.segments) : isObjectHidden(off, 'existing-road', r.sourceId ?? r.id)

/** The car stalls along the roads that are drawn: those along a hidden street are left out (each stall says its street: `Circulation.stallRoads`). */
export function shownStalls(c: Pick<Circulation, 'roads' | 'stalls' | 'stallRoads'>, off: ReadonlySet<string>): Circulation['stalls'] {
  if (off.has(STREET_PARKING)) return []
  const owners = c.stallRoads
  if (!owners) return off.has(STREETS) ? [] : c.stalls
  const gone = new Set(c.roads.filter((r) => roadHidden(off, r)).map((r) => r.id))
  return gone.size === 0 ? c.stalls : c.stalls.filter((_, i) => !gone.has(owners[i]))
}
