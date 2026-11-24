// The block's zones (Decisions "Warehouse by hand", "Block shape"), pure: rectangles of its box's module grid that
// cover it without overlapping, each with its program and its level: information inside the one mass. Split on a
// module line, two neighbours merged. Kept as module lines, so a new grid or size re-applies them.
import type { HallZone, Id, WarehouseType } from '../../../model/schema.ts'
import type { HallRuns, Run } from './bays.ts'
import { zonesOn } from './shape.ts'

/** A zone's axis: along the hall's length (x) or its width (y). */
export type ZoneAxis = 'x' | 'y'

/** The module line a column line falls on. */
export function lineModule(r: Run, k: number): number {
  return r.bays.slice(0, Math.max(0, k)).reduce((n, b) => n + b.modules, 0)
}

/** The modules a run has. */
export const modulesOf = (r: Run): number => r.modules.length - 1

/** The type's zones on its box's runs (shape.ts `zonesOn`: each line kept from its nearer wall); none: one zone, the
 *  whole box. */
export function zonesOf(t: Pick<WarehouseType, 'morphology' | 'grid' | 'hall'>, runs: HallRuns): HallZone[] {
  const nx = modulesOf(runs.x)
  const ny = modulesOf(runs.y)
  const own = zonesOn(t, runs)
  return own.length ? own : [{ id: '1', x: [0, nx], y: [0, ny] }]
}

/** The first zone id "z1", "z2"… not taken. */
export function nextZoneId(zones: { id: Id }[]): Id {
  let n = 1
  while (zones.some((z) => z.id === `z${n}`)) n++
  return `z${n}`
}

/** A zone split on the module line `k` along `axis`: it keeps the part before, a new one (its program and level) the
 *  part after. Null when the line does not cross it. */
export function splitZone(zones: HallZone[], id: Id, axis: ZoneAxis, k: number): HallZone[] | null {
  const z = zones.find((x) => x.id === id)
  if (!z || !(z[axis][0] < k && k < z[axis][1])) return null
  const before: HallZone = { ...z, [axis]: [z[axis][0], k] }
  const { name: _, ...rest } = z
  const after: HallZone = { ...rest, id: nextZoneId(zones), [axis]: [k, z[axis][1]] }
  return zones.flatMap((x) => (x.id === id ? [before, after] : [x]))
}

/** Two zones that share a whole side made one (the first's id, program and level); null when they do not. */
export function mergeZones(zones: HallZone[], a: Id, b: Id): HallZone[] | null {
  const za = zones.find((z) => z.id === a)
  const zb = zones.find((z) => z.id === b)
  if (!za || !zb || a === b) return null
  const same = (u: [number, number], v: [number, number]) => u[0] === v[0] && u[1] === v[1]
  const touch = (u: [number, number], v: [number, number]) => u[1] === v[0] || v[1] === u[0]
  const join = (u: [number, number], v: [number, number]): [number, number] => [Math.min(u[0], v[0]), Math.max(u[1], v[1])]
  let merged: HallZone | null = null
  if (same(za.y, zb.y) && touch(za.x, zb.x)) merged = { ...za, x: join(za.x, zb.x) }
  else if (same(za.x, zb.x) && touch(za.y, zb.y)) merged = { ...za, y: join(za.y, zb.y) }
  if (!merged) return null
  return zones.flatMap((z) => (z.id === a ? [merged] : z.id === b ? [] : [z]))
}

/** The zones that share a whole side with this one: those it merges with. */
export function neighbours(zones: HallZone[], id: Id): HallZone[] {
  return zones.filter((z) => z.id !== id && mergeZones(zones, id, z.id) !== null)
}
