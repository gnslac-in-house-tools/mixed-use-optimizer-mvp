// What every edit goes through before the store keeps it (`apply` and `preview`), so each verb gets it without
// knowing: anchored dimensions follow their corners and locked ones hold (dimensionAnchors.ts), a locked object keeps every field
// it has but `locked` itself (Decisions "One padlock", "Padlocks by kind": the padlock is CAD's, so a view, a verb, a tool of the
// agent's and the optimizer are held by this one rule, for a mass, a building, a street's segment, a lot, a gate, a reference line and a note), and the levels
// are the ones the masses make: one per elevation, none empty (tidyLevels, Decision "Levels follow the masses"), and a building
// whose masses all went goes with them (withoutEmptyBuildings, Decision "No empty buildings"), and a street end connected to a
// parking lot follows it (followLots, Decision "Streets follow their lots"). Pure: `{ project }` to keep, or `{ refused }` with the
// reason to tell the user.
import type { DesignOption, Gate, Id, Project, StreetSegment } from '../model/schema.ts'
import { standardsOf } from '../engine/circulation/standards.ts'
import { streetRoads, streetTypesOf } from '../engine/circulation/streets.ts'
import { noteName, referenceLineName } from '../engine/annotations.ts'
import { withoutLoneGroups } from '../engine/groups.ts'
import { tidyLevels } from '../engine/levels.ts'
import { massIsLocked } from '../kinds/locked.ts'
import { adjustDimensions } from './dimensionAnchors.ts'
import { withoutEmptyBuildings } from './actions/buildings.ts'
import { followGates } from './actions/circulation.ts'
import { followLots, followRoads } from './actions/streets.ts'

export type Settled = { project: Project } | { refused: string }

/** Structural equality of two JSON values (a rebuilt object that says the same is the same; the key order does not matter). */
function same(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => same(x, b[i]))
  const ka = Object.keys(a as object).filter((k) => (a as Record<string, unknown>)[k] !== undefined)
  const kb = Object.keys(b as object).filter((k) => (b as Record<string, unknown>)[k] !== undefined)
  return ka.length === kb.length && ka.every((k) => same((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]))
}

/**
 * What a locked mass may lose without anyone editing it: its `group` when its partners go (a group left with one mass is
 * none) and its `part` when its warehouse copy loses its hall. Nothing may be set or changed there: only taken away.
 */
const MAY_GO = new Set(['group', 'part'])

/** What a locked street segment, lot, gate, reference line or note may lose: its `group`, when its partners go (Phase AS.5 task 6); only taken away, never set or changed. */
const GROUP_MAY_GO: ReadonlySet<string> = new Set(['group'])

/** The fields of the mass that make "its shape" for the notice: the rest are said as "it". */
const SHAPE = new Set(['footprint', 'holes', 'height'])

/** The fields of two records that differ, but `locked` itself (and what `may` lose: only taken away). */
function changedFields(a: object, b: object, may: ReadonlySet<string> = new Set()): string[] {
  const rec = a as Record<string, unknown>
  const next = b as Record<string, unknown>
  return [...new Set([...Object.keys(rec), ...Object.keys(next)])].filter((k) => k !== 'locked' && !same(rec[k], next[k]) && !(may.has(k) && next[k] === undefined))
}

const toDelete = (name: string) => `${name} is locked: unlock it to delete it.`
const toChange = (name: string, what = 'it') => `${name} is locked: unlock it to change ${what}.`

/** The locked ones of a list kept by id: still there, every field but `locked` the same. The reason, or null. */
function listChange<T extends { id: Id; locked?: boolean }>(was: T[], now: T[], name: (x: T, i: number) => string, may: ReadonlySet<string> = GROUP_MAY_GO): string | null {
  if (was === now) return null
  const by = new Map(now.map((x) => [x.id, x]))
  for (const [i, x] of was.entries()) {
    if (x.locked !== true) continue
    const a = by.get(x.id)
    if (!a) return toDelete(name(x, i))
    if (a !== x && changedFields(x, a, may).length > 0) return toChange(name(x, i))
  }
  return null
}

/** What a person calls a street segment: Street <n>, the place of its street among the option's (a street widened in places counts once). */
function streetName(before: Project, o: DesignOption, seg: StreetSegment): string {
  const roads = streetRoads(o.streets, streetTypesOf(before, o), standardsOf(before, o).laneWidth)
  // numbered by street, as Layers does: a street widened in places is several runs but one street
  const streets = [...new Set(roads.filter((r) => r.kind === 'street').map((r) => r.street ?? r.id))]
  const road = roads.find((r) => r.segments?.includes(seg.id))
  const i = road ? streets.indexOf(road.street ?? road.id) : -1
  return `Street ${i + 1 || 1}`
}

/**
 * An option that drops its own gates (*Use the site's*) takes the site's again: each locked own gate must be the same as the site's gate of
 * that id (every field but `locked`), so the gate it stands for does not change; one that differs, or that the site does not have, is lost.
 */
function droppedGates(was: Gate[], site: Gate[]): string | null {
  for (const [i, g] of was.entries()) {
    if (g.locked !== true) continue
    const s = site.find((x) => x.id === g.id)
    if (!s || changedFields(g, s, GROUP_MAY_GO).length > 0) return toDelete(`Gate ${i + 1}`)
  }
  return null
}

/** An option's own gates, its lots and its streets: a locked one stays as it was, and a locked segment's two nodes keep their places. `site`: the site's gates after the edit. */
function optionChange(before: Project, was: DesignOption, now: DesignOption, site: Gate[]): string | null {
  const gates = was.gates && (now.gates === undefined ? droppedGates(was.gates, site) : listChange(was.gates, now.gates, (_g, i) => `Gate ${i + 1}`))
  if (gates) return gates
  const lots = was.lots && listChange(was.lots, now.lots ?? [], (l) => l.name)
  if (lots) return lots
  if (!was.streets || was.streets === now.streets) return null
  const seg = listChange(was.streets.segments, now.streets?.segments ?? [], (g) => streetName(before, was, g))
  if (seg) return seg
  const nodesBefore = new Map(was.streets.nodes.map((n) => [n.id, n]))
  const nodesAfter = new Map((now.streets?.nodes ?? []).map((n) => [n.id, n]))
  for (const g of was.streets.segments) {
    if (g.locked !== true) continue
    for (const id of [g.a, g.b]) {
      const n = nodesBefore.get(id)
      const a = nodesAfter.get(id)
      if (n && (!a || changedFields(n, a).length > 0)) return toChange(streetName(before, was, g))
    }
  }
  return null
}

/**
 * The buildings that went with the option that was removed (Decision "Padlocks by kind": removing an option takes what is only its own, locked or
 * not; a building another option still shows stays, with its flag): gone from the project, and every option that showed it is gone too.
 * An option that stays and stops showing a building is not this: that deletes the building, and a locked one is refused.
 */
function goneWithOption(before: Project, after: Project): Set<Id> {
  if (after.options.length >= before.options.length) return new Set()
  const left = new Set(after.options.map((o) => o.id))
  const kept = new Set(after.buildings.map((b) => b.id))
  return new Set(
    before.buildings
      .filter((b) => !kept.has(b.id) && before.options.some((o) => o.buildingIds.includes(b.id)) && before.options.every((o) => !o.buildingIds.includes(b.id) || !left.has(o.id)))
      .map((b) => b.id),
  )
}

/** Why the edit changes a locked building (its own record, a mass in it, one added to it or taken from it, its place in an option) or deletes it. */
function buildingChange(before: Project, after: Project): string | null {
  if (before.buildings === after.buildings && before.masses === after.masses && before.options === after.options) return null
  const withOption = goneWithOption(before, after)
  for (const b of before.buildings) {
    if (b.locked !== true || withOption.has(b.id)) continue
    const a = after.buildings.find((x) => x.id === b.id)
    if (!a) return toDelete(b.name)
    if (a !== b && changedFields(b, a).length > 0) return toChange(b.name)
    const levels = new Set(b.levels.map((l) => l.id))
    const was = before.masses.filter((m) => levels.has(m.levelId)).map((m) => m.id).sort()
    const now = after.masses.filter((m) => levels.has(m.levelId)).map((m) => m.id).sort()
    if (!same(was, now)) return toChange(b.name)
    // it stays in each option that showed it (an option that is gone takes it with it: only when no other option shows it, and it goes then)
    for (const o of before.options) {
      const next = after.options.find((x) => x.id === o.id)
      if (next && o.buildingIds.includes(b.id) && !next.buildingIds.includes(b.id)) return toChange(b.name)
    }
  }
  return null
}

/**
 * Why the edit changes a locked reference line or a locked note, or deletes it (Phase AS.5): every field but `locked` the same, the object there. A note
 * is named by its first words, a line *Reference line N*. The notes of a building that went with its option go with it, locked or not (as its masses do).
 */
function annotationChange(before: Project, after: Project): string | null {
  if (before.referenceLines !== after.referenceLines) {
    const why = listChange(before.referenceLines ?? [], after.referenceLines ?? [], (_r, i) => referenceLineName(i))
    if (why) return why
  }
  if (before.notes === after.notes) return null
  const withOption = new Set(before.buildings.filter((b) => goneWithOption(before, after).has(b.id)).flatMap((b) => b.levels.map((l) => l.id)))
  return listChange((before.notes ?? []).filter((n) => !withOption.has(n.levelId)), after.notes ?? [], (n) => noteName(n.text))
}

/**
 * Why the tidy that follows an edit (its emptied levels and buildings go, with their notes: `tidyLevels`, `withoutEmptyBuildings`) would delete a locked note:
 * the last mass of a level or a building left, and the note is locked, as it is when its level is removed directly. A note whose level only
 * changed (levels at one elevation merged) is not deleted, and one in a building that went with its option goes (as its masses do).
 */
function tidyDeletesNote(before: Project, tidied: Project): string | null {
  const withOption = new Set(before.buildings.filter((b) => goneWithOption(before, tidied).has(b.id)).flatMap((b) => b.levels.map((l) => l.id)))
  const left = new Set((tidied.notes ?? []).map((n) => n.id))
  const lost = (before.notes ?? []).find((n) => n.locked === true && !withOption.has(n.levelId) && !left.has(n.id))
  return lost ? toDelete(noteName(lost.text)) : null
}

/** Why the edit changes a locked mass (any field but its lock, or deletes it), locked by its own flag or its building's; null when it does not. */
function massChange(before: Project, after: Project): string | null {
  if (before.masses === after.masses) return null
  const now = new Map(after.masses.map((m) => [m.id, m]))
  // the masses of a building that went with its option go with it, locked or not
  const withOption = new Set(before.buildings.filter((b) => goneWithOption(before, after).has(b.id)).flatMap((b) => b.levels.map((l) => l.id)))
  for (const m of before.masses) {
    if (!massIsLocked(before, m) || withOption.has(m.levelId)) continue
    const a = now.get(m.id)
    if (!a) return toDelete(m.name)
    if (a === m) continue
    const changed = changedFields(m, a, MAY_GO)
    if (changed.length > 0) return toChange(m.name, changed.some((k) => SHAPE.has(k)) ? 'its shape' : 'it')
  }
  return null
}

/**
 * Why the edit changes something locked, or deletes it (the eight kinds, one check: a mass, a building, a street's segment, an existing street, a lot, a
 * gate, a reference line, a note): every field but `locked` is the same after as before, the object is there, a segment's two nodes keep their places, a
 * building keeps every mass in it. The reason names the object as a person knows it; null when nothing locked changes.
 */
function lockedChange(before: Project, after: Project): string | null {
  const building = buildingChange(before, after)
  if (building) return building
  const mass = massChange(before, after)
  if (mass) return mass
  if (before.options !== after.options) {
    for (const o of before.options) {
      const next = after.options.find((x) => x.id === o.id)
      // an option that is gone takes its own gates, lots and streets with it: deleting one is its own decision
      const why = next && next !== o ? optionChange(before, o, next, after.site.gates ?? []) : null
      if (why) return why
    }
  }
  if (before.site !== after.site) {
    const why = listChange(before.site.gates ?? [], after.site.gates ?? [], (_g, i) => `Gate ${i + 1}`)
    if (why) return why
    // an existing street (Phase PE.2): the site's, locked by its own flag
    const road = listChange(before.site.existingRoads ?? [], after.site.existingRoads ?? [], (r) => r.name ?? 'Existing road')
    if (road) return road
  }
  return annotationChange(before, after)
}

export function settle(before: Project, after: Project): Settled {
  if (after === before) return { project: after }
  const r = adjustDimensions(before, after)
  if ('refused' in r) return r
  // the street ends connected to a lot follow it (they never move a mass)
  // and the ones linked to an existing street follow it (followRoads)
  // and the gates on a street or an existing street stay on their side of it (followGates)
  const followed = followGates(before, followRoads(before, followLots(before, r.project)))
  // after the dimensions (a locked dimension may have dragged a locked mass along) and the lots (an end that follows one is a segment
  // moved): what is locked holds
  // a group left with one thing is none, whatever the kind (a locked thing may lose its group this way, and only this way: `GROUP_MAY_GO`)
  const cleaned = withoutLoneGroups(followed)
  const locked = lockedChange(before, cleaned)
  if (locked) return { refused: locked }
  const tidied = tidyLevels(withoutEmptyBuildings(cleaned, before))
  // what the tidy drops (a level or a building left with no masses) takes its notes: a locked one holds it
  const note = tidyDeletesNote(before, tidied)
  if (note) return { refused: note }
  return { project: tidied }
}
