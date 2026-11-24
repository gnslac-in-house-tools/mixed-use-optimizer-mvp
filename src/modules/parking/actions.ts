// The parking module's verbs (Decisions "Circulation optimization" and "Catalog"): the option's car parking along its
// roads, and its parking lots (Decision "Lot tool": addLot · setLot · removeLots). Pure, Project → Project, like every
// action; state/actions/index.ts brings them into `actions`.
import { LotSchema, type DesignOption, type Id, type Lot, type ParkingSide, type Point, type Project, type StreetParking } from '../../model/schema.ts'
import { buildingOf } from '../../engine/buildings.ts'
import { standardsOf } from '../../engine/circulation/standards.ts'
import { existingRoads, streetRoads, streetTypesOf } from '../../engine/circulation/streets.ts'
import { footprintPolygon } from '../../engine/geom/footprint.ts'
import { massSpan } from '../../engine/levels.ts'
import type { DerivedMass, DerivedRoad } from '../../engine/types.ts'
import { newId } from '../../state/actions/masses.ts'
import { deriveLots } from './engine/lots.ts'

function withOption(p: Project, optionId: Id, f: (o: DesignOption) => DesignOption): Project {
  if (!p.options.some((o) => o.id === optionId)) return p
  return { ...p, options: p.options.map((o) => (o.id === optionId ? f(o) : o)) }
}

/**
 * The option's car parking along its roads (Decision "Circulation optimization"), over the standard's. Null clears
 * it: back to the standard's. (A ring road's own went with the rings, ST.4.)
 */
export function setParking(p: Project, optionId: Id, side: ParkingSide | null): Project {
  const o = p.options.find((x) => x.id === optionId)
  if (!o || (o.parking ?? null) === side) return p
  return withOption(p, optionId, (x) => {
    const next = { ...x }
    if (side) next.parking = side
    else delete next.parking
    return next
  })
}

/**
 * Street segments' own car stalls (Decision "Street parking by side"), each walked a → b: left, right, both or none,
 * over the option's; null clears a segment's, back to the option's. Every segment named in one step; an unknown one
 * is left alone.
 */
export function setStreetParking(p: Project, optionId: Id, sides: Record<Id, StreetParking | null>): Project {
  const o = p.options.find((x) => x.id === optionId)
  if (!o?.streets) return p
  let changed = false
  const segments = o.streets.segments.map((s) => {
    if (!(s.id in sides) || (s.parking ?? null) === sides[s.id]) return s
    changed = true
    const next = { ...s }
    const side = sides[s.id]
    if (side) next.parking = side
    else delete next.parking
    return next
  })
  return changed ? withOption(p, optionId, (x) => ({ ...x, streets: { ...x.streets!, segments } })) : p
}

// ---- Parking lots (Decision "Lot tool") --------------------------------------------------------------------------

/** What a lot is made of, without its id; its name absent: the next Lot n. */
export type LotFields = Omit<Lot, 'id' | 'name'> & { name?: string }

/** The option with these lots (none left: the field goes, as every empty list in the Project). */
function withLots(p: Project, optionId: Id, lots: Lot[]): Project {
  return withOption(p, optionId, (o) => {
    const { lots: _, ...rest } = o
    return lots.length ? { ...rest, lots } : rest
  })
}

/** Lot 1, Lot 2…: the first name no lot of the option has. */
function lotName(lots: Lot[]): string {
  const names = new Set(lots.map((l) => l.name))
  let n = lots.length + 1
  for (let k = 1; k <= n; k++) if (!names.has(`Lot ${k}`)) return `Lot ${k}`
  while (names.has(`Lot ${n}`)) n++
  return `Lot ${n}`
}

/**
 * A parking lot in the option: anchored to a side of a mass (`anchor`) or free (`rect`). Its id, and the project;
 * null when the option is not there or the lot is not one (anchored and free at once, a size not positive…).
 */
export function addLot(p: Project, optionId: Id, fields: LotFields): { project: Project; id: Id } | null {
  const o = p.options.find((x) => x.id === optionId)
  if (!o) return null
  const lots = o.lots ?? []
  const id = newId('lot', p.options.flatMap((x) => (x.lots ?? []).map((l) => l.id)))
  const lot = LotSchema.safeParse({ ...fields, id, name: fields.name?.trim() || lotName(lots) })
  if (!lot.success) return null
  return { project: withLots(p, optionId, [...lots, lot.data]), id }
}

/**
 * A lot changed: each field given replaces its own, null takes it away (`rows: null`: to the limit again; `anchor:
 * null` with a `rect`: freed from its wall). The same project when nothing changes or what it would be is not a lot.
 */
export function setLot(p: Project, optionId: Id, lotId: Id, patch: { [K in keyof LotFields]?: LotFields[K] | null }): Project {
  const o = p.options.find((x) => x.id === optionId)
  const was = o?.lots?.find((l) => l.id === lotId)
  if (!o || !was) return p
  const next: Record<string, unknown> = { ...was }
  for (const [k, v] of Object.entries(patch)) {
    if (k === 'id') continue
    if (v === null) delete next[k]
    else if (v !== undefined) next[k] = v
  }
  const lot = LotSchema.safeParse(next)
  if (!lot.success || JSON.stringify(lot.data) === JSON.stringify(was)) return p
  return withLots(p, optionId, o.lots!.map((l) => (l.id === lotId ? lot.data : l)))
}

/** Lots taken away (an unknown one is left alone). */
export function removeLots(p: Project, optionId: Id, lotIds: Id[]): Project {
  const o = p.options.find((x) => x.id === optionId)
  const lots = o?.lots ?? []
  const kept = lots.filter((l) => !lotIds.includes(l.id))
  return o && kept.length !== lots.length ? withLots(p, optionId, kept) : p
}

/**
 * Each laid lot's entrance (Decision "Streets follow their lots"): the end of its first aisle and which end, as the
 * circulation derives it (`deriveLots`). Where its first aisle is depends on the lot, the wall it stands against and
 * its sizes; which end, on its `entry` or (absent) the roads cars may use. So it is laid against those alone: its
 * mass, and the roads only when a lot has no `entry` (the courts, the gates, the other masses and the site only take
 * stalls away). A lot not laid (its mass gone) has none. Pure: what the settle step reads on every edit of an option
 * with lots.
 */
export function lotEntrances(p: Project, optionId: Id): Map<Id, { at: Point; end: 'start' | 'end' }> {
  const out = new Map<Id, { at: Point; end: 'start' | 'end' }>()
  const o = p.options.find((x) => x.id === optionId)
  if (!o?.lots?.length) return out
  const walls = new Set(o.lots.flatMap((l) => (l.anchor ? [l.anchor.massId] : [])))
  const programs = new Map(p.programs.map((g) => [g.id, g]))
  const shown: DerivedMass[] = []
  for (const m of p.masses) {
    if (!walls.has(m.id)) continue
    const b = buildingOf(p, m)
    if (!o.buildingIds.includes(b.id)) continue
    let polygon: Point[] = []
    try {
      polygon = footprintPolygon(m.footprint)
    } catch {
      // a footprint that cannot be built: no wall to stand against
    }
    const built = (m.programId ? programs.get(m.programId)?.built : undefined) ?? true
    shown.push({ id: m.id, name: m.name, levelId: m.levelId, buildingId: b.id, context: b.context === true, span: massSpan(p, m), polygon, holes: [], corridors: [], area: 0, built })
  }
  const roads: DerivedRoad[] = o.lots.every((l) => l.entry)
    ? []
    : [
        ...existingRoads(p.site, standardsOf(p, o).laneWidth),
        ...streetRoads(o.streets, streetTypesOf(p, o), standardsOf(p, o).laneWidth),
      ]
  const laid = deriveLots({ lots: o.lots, shown, docks: [], gates: [], roads, site: { polygon: null, buildable: [] }, standards: standardsOf(p, o) })
  for (const l of laid) out.set(l.id, { at: l.entrance.at, end: l.entrance.end })
  return out
}

/** The lot with its padlock on (`locked: true`) or off (no `locked`). */
function padlock(l: Lot, on: boolean): Lot {
  if (on) return { ...l, locked: true }
  const { locked: _, ...free } = l
  return free
}

/**
 * Locks or frees parking lots (Decision "Padlocks by kind"; the lot ids are the project's, so no option is named): a locked lot keeps
 * every field and is not deleted, whoever asks (state/settle.ts). Nothing to change: the project as it was.
 */
export function lockLots(p: Project, ids: Id[], on: boolean): Project {
  const these = new Set(ids)
  const changes = (l: Lot) => these.has(l.id) && (l.locked === true) !== on
  if (!p.options.some((o) => o.lots?.some(changes))) return p
  return { ...p, options: p.options.map((o): DesignOption => (o.lots?.some(changes) ? { ...o, lots: o.lots.map((l) => (changes(l) ? padlock(l, on) : l)) } : o)) }
}
