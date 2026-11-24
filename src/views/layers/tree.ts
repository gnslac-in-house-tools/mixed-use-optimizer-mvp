// The Layers tree's rows (Phase AS.3, Decision "Layers"): a pure builder, no store, no React, no DOM. From the project, the
// option in view and what the engine derived for it, it makes the rows the panel draws, branch by branch:
//   Site         Boundary · Buildable area · Terrain · Map · Drawings ▸ a file ▸ its layers, its Parcels ▸ each parcel
//   Reference    Grid · Reference lines ▸ the ones that are locked or hidden (Phase AS.5)
//   Buildings    a building ▸ its levels ▸ the masses on each
//   Circulation  Streets · Existing roads ▸ each · Gates ▸ each · Truck courts
//   Parking      Lots ▸ each · Street parking
// (Gates stands whenever the site has a boundary, and Street parking whenever the typology offers the parking module, even with
// a count of 0: their settings, *Own gates / Use the site's*, + Gate and *Other streets*, live in their Properties, so the rows
// that open them are always there.)
//   Annotations  Dimensions · Labels · Issues · Rules · Program graph
// A row with nothing to show is left out (no terrain, no map, no existing roads…), and a branch with no row with it (but
// Buildings, which stays: its ＋ makes the first building, and Drawings with a boundary: its ＋ brings the first one); the
// Parking branch is there where the typology offers the parking module (`has`), the Terrain row only with the
// terrain module on. `has` is read by the view with `useModule` (Decision "What is not there is not shown"), so this file
// imports no module.
//
// A row says a little more in its quiet `detail` (a gate its width, an existing road its length and width, a lot its
// wall and rows or "Free" with its stalls as its count, a level its elevation) and, for a building, its `marks` (linked, context).
// A row carries what the view needs and nothing it could read twice: its `id` (unique in the tree; what folds and what is
// picked are named by it, never a key of the layer store), its name, its `kind` (how it is picked, which menu it has),
// its `eyes` (its own and every key under it: a branch's eye acts on those keys alone, and never on the three switches, which keep the eye of their own row; a mass has its own
// key, `mass:<id>`, which reads hidden while its building is (`via`); a level's holds its masses', a building's its own and theirs, and the building's press hides the whole building), its `top` (the keys of the drawing layers and parcels
// in or under it that can be drawn over the model: a layer, a file's Parcels, a file, Drawings; the others have none), its `lock` where its kind has a padlock
// (a mass, a building: its own flag, *mixed* while the flag is off and some of its masses are locked, a level, a gate, a lot, the Streets row: from its segments, a drawing layer, a file's
// parcels, a file: the aggregates read *mixed*), and a `ref` with the project's ids it stands for.
// Streets, Dimensions, Reference lines and Notes are one row each, and a row only for the exceptions (Phase AS.4, Decision "A row only for the exceptions"): a street that is locked (or mixed) or hidden
// (all its segments' keys), a dimension that is hidden, a reference line or a note that is locked or hidden, is a child row under it, with its padlock and its eye, and it goes when the exception does. The hidden keys are the viewer's,
// so the tree takes them (`off`) as it takes the project: it is rebuilt when they change, never on a pointer move. The eyes are keys of the layer store (keys.ts), or one of three switches that exist
// already (the snap's Grid, the terrain's look, the program graph) and are not in that store.
import { optionBuildings, optionOf } from '../../engine/buildings.ts'
import { contourToPolygon } from '../../engine/geom/contour.ts'
import { noteName, referenceLineName } from '../../engine/annotations.ts'
import { area } from '../../engine/geom/polygon.ts'
import { gatesOf } from '../../engine/circulation/gates.ts'
import { courtShapes, type Derived, type DerivedRoad } from '../../engine/types.ts'
import { existingRoadLocked, gateLocked, lotLocked, massIsLocked, streetLockState } from '../../kinds/locked.ts'
import type { LayerGroup } from '../../kinds/types.ts'
import { isLayerLocked } from '../../model/drawings.ts'
import type { Id, Note, Project, ReferenceLine } from '../../model/schema.ts'
import { m2 } from '../format.ts'
import { aciColor } from '../plan/site/aci.ts'
import {
  BOUNDARY,
  BUILDABLE,
  building as buildingKey,
  COURTS,
  DIMENSIONS,
  dimension as dimensionKey,
  drawingLayer,
  EXISTING_ROADS,
  existingRoad,
  gate as gateKey,
  GATES,
  ISSUES,
  LABELS,
  lot as lotKey,
  LOTS,
  mass as massKey,
  MAP,
  note as noteKey,
  NOTES,
  parcel as parcelKey,
  REFERENCE_LINES,
  referenceLine as referenceLineKey,
  RULES,
  STREET_PARKING,
  STREETS,
  street as streetKey,
} from './keys.ts'

export type RowKind =
  | 'branch'
  | 'boundary'
  | 'buildable'
  | 'terrain'
  | 'map'
  | 'drawings'
  | 'file'
  | 'layer'
  | 'parcels'
  | 'parcel'
  | 'grid'
  | 'reference-lines'
  | 'reference-line'
  | 'buildings'
  | 'building'
  | 'level'
  | 'mass'
  | 'streets'
  | 'street'
  | 'existing-roads'
  | 'existing-road'
  | 'gates'
  | 'gate'
  | 'courts'
  | 'lots'
  | 'lot'
  | 'street-parking'
  | 'dimensions'
  | 'dimension'
  | 'labels'
  | 'notes'
  | 'note'
  | 'issues'
  | 'rules'
  | 'graph'

/** The three eyes that run a switch that exists, not a key: the snap's Grid, the terrain's look, the program graph. */
export type SwitchName = 'grid' | 'terrain' | 'graph'

/** One eye: a key of the layer store (`via`: its kind's key, which hides it too), or a switch. */
export type Eye = { key: string; via?: string } | { switch: SwitchName }

export type LockState = 'locked' | 'unlocked' | 'mixed'

/** A mark after a building's name: *linked* (the same building in several options) or *context* (drawn, left out of the KPIs). */
export interface RowMark {
  label: 'linked' | 'context'
  title: string
}

/** The project's ids a row stands for. `masses`: the masses in or under it (a padlock acts on all of them). */
export interface RowRef {
  option?: Id
  building?: Id
  level?: Id
  masses?: Id[]
  /** A drawing's file (a file row, its layers, its parcels). Absent on the group of parcels with no file. */
  file?: string
  layer?: string
  /** The Drawings row: every file. */
  files?: string[]
  /** A gate, an existing road, a lot, a street (the derived road's id), a dimension, a reference line or a note. */
  object?: Id
  /** The Reference lines row: every line of the project; the Notes row: every note of the option's levels (the padlock acts on all of them, the ones that have a row of their own or not). */
  objects?: Id[]
  /** A street's segments (its padlock and eye are theirs), or every street's on the Streets row. */
  segments?: Id[]
}

export interface LayerRow {
  id: string
  label: string
  /** What the row's name field holds, when it is not the label (a level: its name, without `×N`). */
  name?: string
  kind: RowKind
  count?: number
  /** A quiet word after the name: a parcel's area, a level's elevation, a gate's width, an existing road's
   *  length and width, a lot's wall and rows ("Rear wall · 2 rows", or "Free"). */
  detail?: string
  /** What a building's row says besides its name: linked to other options, context. */
  marks?: RowMark[]
  /** A colour: a building's, a drawing layer's. */
  swatch?: string
  /** The eyes of this row and the keys under it (never a switch under it: a branch has no say over those). A level or a mass has none (its building's hides it: `underBuilding`). */
  eyes: Eye[]
  /** The keys *On top* (layerView.ts) puts over the model: a drawing layer's, a file's parcels'; a file and Drawings hold their children's. */
  top?: string[]
  lock?: LockState
  /** The building whose eye hides this level or mass (the row reads dimmed with it). */
  underBuilding?: Id
  ref?: RowRef
  children?: LayerRow[]
}

/** What the modules say (the view reads it with `useModule`): the terrain is on, the typology offers parking. */
export interface Has {
  terrain: boolean
  parking: boolean
}

export type EyeState = 'shown' | 'hidden' | 'mixed'

/** Whether some keys are on top: on, off or (some of each) mixed; null when the row has nothing that can be. */
export function topState(keys: readonly string[] | undefined, on: ReadonlySet<string>): 'on' | 'off' | 'mixed' | null {
  if (!keys || keys.length === 0) return null
  const n = keys.filter((k) => on.has(k)).length
  return n === 0 ? 'off' : n === keys.length ? 'on' : 'mixed'
}

/** The keys among some eyes. */
export const eyeKeys = (eyes: readonly Eye[]): string[] => eyes.flatMap((e) => ('key' in e ? [e.key] : []))
/** The switches among some eyes. */
export const eyeSwitches = (eyes: readonly Eye[]): SwitchName[] => eyes.flatMap((e) => ('switch' in e ? [e.switch] : []))

/** Whether some eyes show: shown, hidden or (some of each) mixed; null when there is no eye at all. `on`: the three switches. */
export function eyeState(eyes: readonly Eye[], off: ReadonlySet<string>, on: Record<SwitchName, boolean>): EyeState | null {
  if (eyes.length === 0) return null
  const hidden = eyes.filter((e) => ('key' in e ? off.has(e.key) || (e.via !== undefined && off.has(e.via)) : !on[e.switch])).length
  return hidden === 0 ? 'shown' : hidden === eyes.length ? 'hidden' : 'mixed'
}

/** The padlock of some flags: undefined when there is nothing to lock; locked when all are; mixed when some are. */
export function lockOf(flags: readonly boolean[]): LockState | undefined {
  if (flags.length === 0) return undefined
  const n = flags.filter(Boolean).length
  return n === 0 ? 'unlocked' : n === flags.length ? 'locked' : 'mixed'
}

/** The padlock of some states (a row's children): locked when all are, free when none is, else mixed; undefined when there is nothing to lock. */
export function combineLocks(states: readonly (LockState | undefined)[]): LockState | undefined {
  const known = states.filter((s): s is LockState => s !== undefined)
  if (known.length === 0) return undefined
  return known.every((s) => s === 'locked') ? 'locked' : known.every((s) => s === 'unlocked') ? 'unlocked' : 'mixed'
}

/** Every row of the tree, depth first (a row, then its children). */
export function flatRows(rows: readonly LayerRow[]): LayerRow[] {
  return rows.flatMap((r) => [r, ...flatRows(r.children ?? [])])
}

/** The rows that start open when they have something under them: Buildings, and Streets, Dimensions, Reference lines and Notes, whose children are the exceptions (they are there to be seen). */
const OPEN_BY_DEFAULT = new Set(['buildings', 'streets', 'dimensions', 'reference-lines', 'notes'])

/** The fold a row has before anyone changes it: every row with something under it is folded, but Buildings and the two that hold the exceptions. */
export const foldedByDefault = (row: LayerRow): boolean => (row.children?.length ?? 0) > 0 && !OPEN_BY_DEFAULT.has(row.id)

/**
 * The Notes row (one, with its count) and, under it, the notes that are exceptions: locked, or hidden by their own key (the kind's eye hides them all and makes no exceptions). The count is
 * the notes of the levels of the option's buildings, as the Dimensions row's is; the row reads from them all: locked, mixed or free. A child row's label is the note's first words
 * (`noteName`), its detail the level it is on (a note on another level is picked from its row, and the plan goes there).
 */
function noteRows(notes: readonly Note[], levels: ReadonlyMap<Id, string>, off: ReadonlySet<string>): LayerRow {
  const children = notes.flatMap((n) => {
    const locked = n.locked === true
    if (!locked && !off.has(noteKey(n.id))) return []
    return [
      leaf({
        id: `note:${n.id}`,
        label: noteName(n.text),
        kind: 'note',
        detail: levels.get(n.levelId),
        eyes: [{ key: noteKey(n.id), via: NOTES }],
        lock: locked ? 'locked' : 'unlocked',
        ref: { object: n.id, level: n.levelId },
      }),
    ]
  })
  return withChildren(
    { id: 'notes', label: 'Notes', kind: 'notes', count: notes.length, eyes: [{ key: NOTES }], ref: { objects: notes.map((n) => n.id) } },
    children,
    lockOf(notes.map((n) => n.locked === true)),
  )
}

/** A row with its eyes and, where it has children, theirs too, its `top` and its children; the padlock is the one given (the caller reads it from the flags it holds). */
function withChildren(row: Omit<LayerRow, 'eyes'> & { eyes?: Eye[] }, children: LayerRow[], lock?: LockState): LayerRow {
  const top = [...(row.top ?? []), ...children.flatMap((c) => c.top ?? [])]
  return {
    ...row,
    ...(lock !== undefined && { lock }),
    ...(top.length > 0 && { top }),
    // a row with children reads and flips the keys under it alone: the three switches keep their own rows' eyes
    eyes: [...(row.eyes ?? []), ...children.flatMap((c) => c.eyes.filter((e) => 'key' in e))],
    ...(children.length > 0 && { children }),
  }
}

/** A branch of the tree: no eye of its own, the eyes of what it holds. Its id is a kind's group (`kinds/types.ts`, Phase AS.4). */
const branch = (id: LayerGroup, label: string, children: LayerRow[]): LayerRow[] => {
  if (children.length === 0) return []
  const row = withChildren({ id, label, kind: 'branch' }, children)
  delete row.top // a branch is not put on top: its Drawings row is
  return [row]
}

const leaf = (row: Omit<LayerRow, 'eyes'> & { eyes?: Eye[] }): LayerRow => ({ ...row, eyes: row.eyes ?? [] })

/** A length in metres, as the lists said it ("4 m", "12.5 m"). */
const metres = (v: number): string => `${Math.round(v * 100) / 100} m`

/** The lock of every layer and parcel of a file, as flags (a file's padlock is all of them). */
function fileFlags(p: Project, file: string): boolean[] {
  const layers = p.site.drawings?.find((d) => d.file === file)?.layers ?? []
  const mine = (p.site.parcels ?? []).filter((x) => x.file === file)
  return [...layers.map(isLayerLocked), ...mine.map((x) => !x.unlocked)]
}

/** The Site branch's Drawings: a file ▸ its layers and its Parcels ▸ each parcel; the parcels with no file in a group of their own. */
function drawingRows(p: Project, ids: Set<string>): LayerRow | null {
  const drawings = p.site.drawings ?? []
  const parcels = p.site.parcels ?? []
  // the files: those with a drawing, then those that brought parcels alone (a group each, as the old Drawing layers had)
  const files = [...new Set([...drawings.map((d) => d.file), ...parcels.flatMap((x) => (x.file === undefined ? [] : [x.file]))])]
  const loose = parcels.filter((x) => x.file === undefined)
  if (!p.site.boundary && files.length === 0 && loose.length === 0) return null

  const unique = (id: string): string => {
    let out = id
    for (let n = 2; ids.has(out); n++) out = `${id}#${n}`
    ids.add(out)
    return out
  }
  const parcelRows = (list: typeof parcels): LayerRow[] =>
    list.map((x) =>
      leaf({
        id: unique(`parcel:${x.file ?? ''}/${x.name}`),
        label: x.name,
        kind: 'parcel',
        detail: m2(area(contourToPolygon(x.contour))),
        eyes: [{ key: parcelKey(x.name, x.file) }],
        ...(x.file !== undefined && { ref: { file: x.file } }),
      }),
    )

  const fileRows = files.map((file) => {
    const d = drawings.find((x) => x.file === file)
    const mine = parcels.filter((x) => x.file === file)
    const layers = (d?.layers ?? []).map((l) =>
      leaf({
        id: unique(`layer:${file}/${l.name}`),
        label: l.name,
        kind: 'layer',
        count: l.lines.length,
        swatch: aciColor(l.color),
        eyes: [{ key: drawingLayer(file, l.name) }],
        top: [drawingLayer(file, l.name)],
        lock: isLayerLocked(l) ? 'locked' : 'unlocked',
        ref: { file, layer: l.name },
      }),
    )
    const group =
      mine.length > 0
        ? [
            withChildren(
              { id: unique(`parcels:${file}`), label: 'Parcels', kind: 'parcels', count: mine.length, top: mine.map((x) => parcelKey(x.name, x.file)), ref: { file } },
              parcelRows(mine),
              lockOf(mine.map((x) => !x.unlocked)),
            ),
          ]
        : []
    return withChildren({ id: unique(`file:${file}`), label: file, kind: 'file', ref: { file } }, [...layers, ...group], lockOf(fileFlags(p, file)))
  })
  const looseGroup =
    loose.length > 0 ? [withChildren({ id: unique('parcels:'), label: 'Parcels', kind: 'parcels', count: loose.length, top: loose.map((x) => parcelKey(x.name)) }, parcelRows(loose))] : []
  const children = [...fileRows, ...looseGroup]
  const flags = files.flatMap((f) => fileFlags(p, f))
  return withChildren({ id: 'drawings', label: 'Drawings', kind: 'drawings', count: files.length, ref: { files } }, children, lockOf(flags))
}

/** The lock of the gates a row holds: locked when all are, mixed when some are. */
function gatesLock(p: Project, optionId: Id, gates: readonly { id: Id }[]): LockState | undefined {
  return combineLocks(gates.map((g) => (gateLocked(p, optionId, g.id) ? 'locked' : 'unlocked')))
}

/** An existing road's width from its stretches' sums: one number, or the narrowest to the widest. */
function widthRead(stretches: readonly { left: number; right: number }[]): string {
  const sums = stretches.map((x) => x.left + x.right)
  const [min, max] = [Math.min(...sums), Math.max(...sums)]
  return Math.abs(max - min) < 1e-9 ? `${metres(min)} wide` : `${metres(min)} – ${metres(max)} wide`
}

/** A road's length in metres, along its points. */
const roadLength = (points: readonly { x: number; y: number }[]): number => points.slice(1).reduce((n, q, i) => n + Math.hypot(q.x - points[i].x, q.y - points[i].y), 0)

/**
 * The Streets row (one, with its count) and, under it, the streets that are exceptions: locked, or mixed (some of their segments are), or hidden (all their segments' keys are). A
 * street's padlock and eye are its segments' (`StreetSegment.locked`, `street:<segment id>`), because the street a person sees is the derived road, whose id changes when it is split.
 * The Streets row reads from all the segments: locked, mixed or free. A child row's label numbers the street among the option's, as the plan's notices do (`Street 2`).
 */
function streetRows(p: Project, optionId: Id, roads: readonly DerivedRoad[], off: ReadonlySet<string>): LayerRow {
  const every = roads.flatMap((r) => r.segments ?? [])
  // a street whose width changes is several runs (`DerivedRoad.street` names the street): one row, its segments every run's
  const streets = new Map<string, DerivedRoad[]>()
  for (const r of roads) streets.set(r.street ?? r.id, [...(streets.get(r.street ?? r.id) ?? []), r])
  const children = [...streets].flatMap(([id, runs], i) => {
    const segments = runs.flatMap((r) => r.segments ?? [])
    const lock = streetLockState(p, optionId, segments)
    const hidden = segments.length > 0 && segments.every((id) => off.has(streetKey(id)))
    if (lock === 'unlocked' && !hidden) return []
    return [
      leaf({
        id,
        label: `Street ${i + 1}`,
        kind: 'street',
        detail: metres(runs.reduce((n, r) => n + roadLength(r.points), 0)),
        eyes: segments.map((id) => ({ key: streetKey(id), via: STREETS })),
        lock,
        ref: { object: id, segments },
      }),
    ]
  })
  const row = withChildren({ id: 'streets', label: 'Streets', kind: 'streets', count: streets.size, eyes: [{ key: STREETS }], ref: { segments: every } }, children, streetLockState(p, optionId, every))
  return row
}

/**
 * The Reference lines row (one, with its count) and, under it, the lines that are exceptions: locked, or hidden by their own key (the kind's eye hides them all and makes no exceptions). The row
 * reads from all the lines: locked, mixed or free; its eye is the kind's key, and *On top* is the kind's too. A child row's label is the line's place among the project's (`Reference line 2`).
 */
function referenceLineRows(lines: readonly ReferenceLine[], off: ReadonlySet<string>): LayerRow {
  const children = lines.flatMap((r, i) => {
    const locked = r.locked === true
    if (!locked && !off.has(referenceLineKey(r.id))) return []
    return [
      leaf({
        id: `reference-line:${r.id}`,
        label: referenceLineName(i),
        kind: 'reference-line',
        detail: metres(roadLength(r.points)),
        eyes: [{ key: referenceLineKey(r.id), via: REFERENCE_LINES }],
        lock: locked ? 'locked' : 'unlocked',
        ref: { object: r.id },
      }),
    ]
  })
  return withChildren(
    { id: 'reference-lines', label: 'Reference lines', kind: 'reference-lines', count: lines.length, eyes: [{ key: REFERENCE_LINES }], top: [REFERENCE_LINES], ref: { objects: lines.map((r) => r.id) } },
    children,
    lockOf(lines.map((r) => r.locked === true)),
  )
}

/** The Buildings branch: each building of the option in its order ▸ its levels, highest first ▸ the masses on each. */
function buildingRows(p: Project, optionId: Id): LayerRow {
  const o = optionOf(p, optionId)
  const all: Id[] = []
  // the masses locked by their own flag: a building whose flag is off reads mixed when some are
  const own = new Set(p.masses.filter((m) => m.locked === true).map((m) => m.id))
  const states: LockState[] = []
  const rows = optionBuildings(p, o).map((b) => {
    const mine: Id[] = []
    const levels = [...b.levels]
      .sort((x, y) => y.elevation - x.elevation)
      .map((l) => {
        const masses = p.masses.filter((m) => m.levelId === l.id)
        mine.push(...masses.map((m) => m.id))
        const children = masses.map((m) =>
          leaf({
            id: `mass:${m.id}`,
            label: m.name,
            kind: 'mass',
            eyes: [{ key: massKey(m.id), via: buildingKey(b.id) }],
            lock: massIsLocked(p, m) ? 'locked' : 'unlocked',
            underBuilding: b.id,
            ref: { option: o.id, building: b.id, level: l.id, masses: [m.id] },
          }),
        )
        return withChildren(
          {
            id: `level:${l.id}`,
            label: l.repeat > 1 ? `${l.name} ×${l.repeat}` : l.name,
            name: l.name,
            kind: 'level',
            count: masses.length,
            detail: metres(l.elevation),
            underBuilding: b.id,
            ref: { option: o.id, building: b.id, level: l.id, masses: masses.map((m) => m.id) },
          },
          children,
          lockOf(masses.map((m) => massIsLocked(p, m))),
        )
      })
    all.push(...mine)
    const shown = p.options.filter((x) => x.buildingIds.includes(b.id))
    const marks: RowMark[] = [
      ...(shown.length > 1 ? [{ label: 'linked' as const, title: `Linked: the same building in ${shown.map((x) => x.name).join(', ')}` }] : []),
      ...(b.context ? [{ label: 'context' as const, title: 'Context: drawn, left out of the KPIs and its own checks' }] : []),
    ]
    const state: LockState = b.locked === true ? 'locked' : mine.some((id) => own.has(id)) ? 'mixed' : 'unlocked'
    states.push(state)
    return withChildren(
      {
        id: `building:${b.id}`,
        label: b.name,
        kind: 'building',
        count: mine.length,
        swatch: b.color,
        ...(marks.length > 0 && { marks }),
        eyes: [{ key: buildingKey(b.id) }],
        ref: { option: o.id, building: b.id, masses: mine },
      },
      levels,
      state,
    )
  })
  return withChildren({ id: 'buildings', label: 'Buildings', kind: 'buildings', count: rows.length, ref: { option: o.id, masses: all } }, rows, combineLocks(states))
}

/**
 * The tree for the option in view. `derived` is that option's result (the active option's in the app): its streets,
 * gates, lots and truck courts are counted from it, and the buildable area is there when the site has one. Ids are unique. `off`: the keys the eyes hide
 * (`layerView.ts`), which say which street and which dimension is an exception (hidden); nothing hidden when it is not given.
 */
export function layerTree(project: Project, optionId: Id, derived: Derived, has: Has, off: ReadonlySet<string> = new Set()): LayerRow[] {
  const option = optionOf(project, optionId)
  const ids = new Set<string>()
  const site = project.site
  const circ = derived.circulation

  // ---- Site
  const siteRows: LayerRow[] = []
  if (site.boundary) {
    siteRows.push(leaf({ id: 'boundary', label: 'Boundary', kind: 'boundary', eyes: [{ key: BOUNDARY }] }))
    if (derived.site.buildable.length > 0) siteRows.push(leaf({ id: 'buildable', label: 'Buildable area', kind: 'buildable', eyes: [{ key: BUILDABLE }] }))
  }
  if (has.terrain && site.terrain) siteRows.push(leaf({ id: 'terrain', label: 'Terrain', kind: 'terrain', eyes: [{ switch: 'terrain' }] }))
  if (site.map) siteRows.push(leaf({ id: 'map', label: 'Map', kind: 'map', eyes: [{ key: MAP }] }))
  const drawings = drawingRows(project, ids)
  if (drawings) siteRows.push(drawings)

  // ---- Reference
  const guides = project.referenceLines ?? []
  const reference: LayerRow[] = [
    ...(project.grid || option.grid ? [leaf({ id: 'grid', label: 'Grid', kind: 'grid', eyes: [{ switch: 'grid' }] })] : []),
    ...(guides.length > 0 ? [referenceLineRows(guides, off)] : []),
  ]

  // ---- Circulation
  const streets = circ.roads.filter((r) => r.kind === 'street').length
  const existing = site.existingRoads ?? []
  const gates = gatesOf(project, option.id)
  const courts = circ.docks.reduce((n, d) => n + courtShapes(d).filter((c) => c.length >= 3).length, 0)
  const circulation: LayerRow[] = []
  if (streets > 0) circulation.push(streetRows(project, option.id, circ.roads.filter((r) => r.kind === 'street'), off))
  if (existing.length > 0)
    circulation.push(
      withChildren(
        { id: 'existing-roads', label: 'Existing roads', kind: 'existing-roads', count: existing.length, eyes: [{ key: EXISTING_ROADS }] },
        existing.map((r, i) =>
          leaf({
            id: `existing-road:${r.id}`,
            label: r.name ?? `Existing road ${i + 1}`,
            kind: 'existing-road',
            detail: `${metres(r.points.slice(1).reduce((sum, q, k) => sum + Math.hypot(q.x - r.points[k].x, q.y - r.points[k].y), 0))} · ${widthRead(r.stretches)}`,
            eyes: [{ key: existingRoad(r.id), via: EXISTING_ROADS }],
            lock: existingRoadLocked(project, r.id) ? 'locked' : 'unlocked',
            ref: { object: r.id },
          }),
        ),
        combineLocks(existing.map((r) => (existingRoadLocked(project, r.id) ? 'locked' : 'unlocked'))),
      ),
    )
  if (gates.length > 0 || site.boundary)
    circulation.push(
      withChildren(
        { id: 'gates', label: 'Gates', kind: 'gates', count: gates.length, eyes: [{ key: GATES }] },
        gates.map((g, i) =>
          leaf({
            id: `gate:${g.id}`,
            label: `Gate ${i + 1}`,
            kind: 'gate',
            detail: metres(g.width),
            eyes: [{ key: gateKey(g.id), via: GATES }],
            lock: gateLocked(project, option.id, g.id) ? 'locked' : 'unlocked',
            ref: { object: g.id },
          }),
        ),
        gatesLock(project, option.id, gates),
      ),
    )
  if (courts > 0) circulation.push(leaf({ id: 'courts', label: 'Truck courts', kind: 'courts', count: courts, eyes: [{ key: COURTS }] }))

  // ---- Parking
  const parking: LayerRow[] = []
  if (has.parking) {
    if (circ.lots.length > 0)
      parking.push(
        withChildren(
          { id: 'lots', label: 'Lots', kind: 'lots', count: circ.lots.length, eyes: [{ key: LOTS }] },
          circ.lots.map((l) =>
            leaf({
              id: `lot:${l.id}`,
              label: l.name,
              kind: 'lot',
              count: l.stalls.length,
              detail: l.anchor ? `${l.anchor.facing[0].toUpperCase()}${l.anchor.facing.slice(1)} wall · ${l.rows} ${l.rows === 1 ? 'row' : 'rows'}` : 'Free',
              eyes: [{ key: lotKey(l.id), via: LOTS }],
              lock: lotLocked(project, option.id, l.id) ? 'locked' : 'unlocked',
              ref: { object: l.id },
            }),
          ),
          combineLocks(circ.lots.map((l) => (lotLocked(project, option.id, l.id) ? 'locked' : 'unlocked'))),
        ),
      )
    parking.push(leaf({ id: 'street-parking', label: 'Street parking', kind: 'street-parking', count: circ.stalls.length, eyes: [{ key: STREET_PARKING }] }))
  }

  // ---- Annotations: the dimensions and the notes on the levels of the option's buildings
  const levelNames = new Map(optionBuildings(project, option).flatMap((b) => b.levels.map((l): [Id, string] => [l.id, l.name])))
  const levels = new Set(levelNames.keys())
  const dimensions = (project.dimensions ?? []).filter((d) => levels.has(d.levelId))
  const notes = (project.notes ?? []).filter((n) => levels.has(n.levelId))
  const annotations: LayerRow[] = [
    // the dimensions are one row; one that is hidden is a child row under it, with its eye
    withChildren(
      { id: 'dimensions', label: 'Dimensions', kind: 'dimensions', count: dimensions.length, eyes: [{ key: DIMENSIONS }] },
      dimensions.flatMap((d, i) =>
        off.has(dimensionKey(d.id))
          ? [
              leaf({
                id: `dimension:${d.id}`,
                label: `Dimension ${i + 1}`,
                kind: 'dimension',
                detail: metres(Math.hypot(d.b.x - d.a.x, d.b.y - d.a.y)),
                eyes: [{ key: dimensionKey(d.id), via: DIMENSIONS }],
                ref: { object: d.id, level: d.levelId },
              }),
            ]
          : [],
      ),
    ),
    leaf({ id: 'labels', label: 'Labels', kind: 'labels', eyes: [{ key: LABELS }] }),
    noteRows(notes, levelNames, off),
    leaf({ id: 'issues', label: 'Issues', kind: 'issues', count: derived.issues.length, eyes: [{ key: ISSUES }] }),
    leaf({ id: 'rules', label: 'Rules', kind: 'rules', eyes: [{ key: RULES }] }),
    leaf({ id: 'graph', label: 'Program graph', kind: 'graph', eyes: [{ switch: 'graph' }] }),
  ]

  const buildings = buildingRows(project, option.id)
  return [
    ...branch('site', 'Site', siteRows),
    ...branch('reference', 'Reference', reference),
    buildings,
    ...branch('circulation', 'Circulation', circulation),
    ...branch('parking', 'Parking', parking),
    ...branch('annotations', 'Annotations', annotations),
  ]
}
