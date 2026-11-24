// What of the project's objects is still there, for what the viewer keeps about them (Phase AS.3, Decision "Layers"). The
// hidden keys, the ones on top and the folded rows (layerView.ts), and the rows picked in Layers (layerPick.ts), name objects
// by their ids, and ids come back: the first free id is given to a new building, gate or lot (`newId`), so an entry left
// behind by a deleted object would make the next one be born hidden, on top or folded. `aliveIn(project)` says which keys and
// which rows of an object stand in the project: an object counts while it is in **any** option (the keys are per project, not
// per option), and `isObjectKey` / `isObjectRow` say which names are an object's at all (a kind's key, 'streets' or 'map', a
// branch's row and the like never go). Pure: the project in, sets out; the stores decide when to ask.
import type { Project } from '../../model/schema.ts'
import { building, dimension, drawingLayer, existingRoad, gate, lot, mass, note, parcel, referenceLine, street } from './keys.ts'

/** What stands in a project: the keys of its objects, and the ids of their rows in the tree (tree.ts). */
export interface Alive {
  keys: ReadonlySet<string>
  rows: ReadonlySet<string>
}

// `frontage:` is a name an older session may have stored: no object has it since Phase PE.2 (a frontage is an existing street), so it is let go
const KEY_PREFIXES = ['building:', 'mass:', 'gate:', 'existing-road:', 'frontage:', 'lot:', 'parcel:', 'street:', 'dimension:', 'reference-line:', 'note:']
const ROW_PREFIXES = ['building:', 'level:', 'gate:', 'existing-road:', 'frontage:', 'lot:', 'reference-line:', 'note:', 'file:', 'layer:', 'parcels:', 'parcel:']

/** Is this key one object's own (a building, a mass, a gate, an existing road, a lot, a street segment, a dimension, a drawing's layer or a parcel; or the stored `frontage` kind of an older session, which nothing holds)? */
export const isObjectKey = (key: string): boolean => key === 'frontage' || KEY_PREFIXES.some((p) => key.startsWith(p)) || key.includes('/')

/** Is this row an object's (the group of parcels with no file, `parcels:`, is not: it holds whatever is loose)? A row of a kind or a branch is not. */
export const isObjectRow = (id: string): boolean => id !== 'parcels:' && ROW_PREFIXES.some((p) => id.startsWith(p))

/** A row id as the tree makes it, without the `#2` it adds to tell two of the same name apart. */
export const plainRow = (id: string): string => id.replace(/#\d+$/, '')

/** The objects the project holds, in any of its options. */
export function aliveIn(p: Project): Alive {
  const keys = new Set<string>()
  const rows = new Set<string>()
  for (const b of p.buildings) {
    keys.add(building(b.id))
    rows.add(`building:${b.id}`)
    for (const l of b.levels) rows.add(`level:${l.id}`)
  }
  for (const m of p.masses) keys.add(mass(m.id))
  const gates = [...(p.site.gates ?? []), ...p.options.flatMap((o) => o.gates ?? [])]
  for (const g of gates) {
    keys.add(gate(g.id))
    rows.add(`gate:${g.id}`)
  }
  for (const r of p.site.existingRoads ?? []) {
    keys.add(existingRoad(r.id))
    rows.add(`existing-road:${r.id}`)
  }
  for (const l of p.options.flatMap((o) => o.lots ?? [])) {
    keys.add(lot(l.id))
    rows.add(`lot:${l.id}`)
  }
  // a street's eye is its segments' (in any option), a dimension's its own
  for (const o of p.options) for (const g of o.streets?.segments ?? []) keys.add(street(g.id))
  for (const d of p.dimensions ?? []) keys.add(dimension(d.id))
  for (const r of p.referenceLines ?? []) {
    keys.add(referenceLine(r.id))
    rows.add(`reference-line:${r.id}`)
  }
  for (const n of p.notes ?? []) {
    keys.add(note(n.id))
    rows.add(`note:${n.id}`)
  }
  for (const d of p.site.drawings ?? []) {
    rows.add(`file:${d.file}`)
    for (const l of d.layers) {
      keys.add(drawingLayer(d.file, l.name))
      rows.add(`layer:${d.file}/${l.name}`)
    }
  }
  for (const x of p.site.parcels ?? []) {
    keys.add(parcel(x.name, x.file))
    rows.add(`parcel:${x.file ?? ''}/${x.name}`)
    if (x.file !== undefined) {
      rows.add(`parcels:${x.file}`)
      rows.add(`file:${x.file}`)
    }
  }
  return { keys, rows }
}

/** These keys but for the objects' that are gone; the same list when nothing is. */
export function keysAlive(list: string[], alive: Alive): string[] {
  const kept = list.filter((k) => !isObjectKey(k) || alive.keys.has(k))
  return kept.length === list.length ? list : kept
}

/** These rows but for the objects' that are gone; the same list when nothing is. */
export function rowsAlive(list: string[], alive: Alive): string[] {
  const kept = list.filter((r) => !isObjectRow(r) || alive.rows.has(plainRow(r)))
  return kept.length === list.length ? list : kept
}
