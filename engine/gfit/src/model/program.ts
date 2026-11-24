// The Program phase (spec 2026-11-04-program-wfc §2, §6, §8): room types, unit types built from them, and the
// sentence rules the layout and the calculator follow. All of it is project-wide, like programs and assumptions.
import type { State } from './state'

export type RoomKind = 'living' | 'dining' | 'kitchen' | 'bath' | 'halfbath' | 'master' | 'bed' | 'study' | 'laundry' | 'storage' | 'hall' | 'terrace'
export const ROOM_KINDS: RoomKind[] = ['living', 'dining', 'kitchen', 'bath', 'halfbath', 'master', 'bed', 'study', 'laundry', 'storage', 'hall', 'terrace']

export interface RoomType {
  id: string
  name: string
  kind: RoomKind
  /** m² range the room may take */
  area: [number, number]
  minWidth: number
  /** daylight: must sit on the facade, may, or must not */
  facade: 'required' | 'preferred' | 'no'
  wet: boolean
  /** kinds it likes to sit next to */
  near: RoomKind[]
  /** template size, m (the room WFC uses it for the facade depth it aims at) */
  w: number
  d: number
}

export interface UnitType {
  id: string
  name: string
  color: string
  /** RoomType ids; a room may repeat (two baths) */
  rooms: string[]
  /** facade width range, m */
  wMin: number
  wMax: number
  /** $/m² */
  price: number
  /** stalls per unit */
  stalls: number
}

export type RuleKind = 'levels-only' | 'levels-never' | 'corners' | 'at-least' | 'never-next' | 'stack' | 'core-face' | 'price-levels' | 'price-corner' | 'price-facing'
export const RULE_KINDS: RuleKind[] = ['levels-only', 'levels-never', 'corners', 'at-least', 'never-next', 'stack', 'core-face', 'price-levels', 'price-corner', 'price-facing']

export interface SRule {
  id: string
  kind: RuleKind
  on: boolean
  strength: 'required' | 'preferred'
  /** unit type ids the rule names */
  types: string[]
  /** level range a–b */
  a?: number
  b?: number
  /** count, or the first level of a price rule */
  n?: number
  /** % for price rules */
  p?: number
  dir?: 'N' | 'S' | 'E' | 'W'
}

const R = (id: string, name: string, kind: RoomKind, w: number, d: number, area: [number, number], minWidth: number, facade: RoomType['facade'], wet: boolean, near: RoomKind[]): RoomType =>
  ({ id, name, kind, w, d, area, minWidth, facade, wet, near })

/** the ten room templates of the room WFC (without furniture) */
export function ROOMS0(): RoomType[] {
  return [
    R('R-01', 'Living', 'living', 4.2, 4.5, [14, 24], 3.3, 'required', false, ['kitchen', 'dining']),
    R('R-02', 'Living + dining', 'living', 4.8, 6.0, [22, 34], 3.6, 'required', false, ['kitchen']),
    R('R-03', 'Kitchen · L run', 'kitchen', 3.0, 3.0, [7, 12], 2.4, 'preferred', true, ['living', 'dining']),
    R('R-04', 'Kitchen · galley', 'kitchen', 2.4, 3.6, [7, 10], 2.1, 'preferred', true, ['living']),
    R('R-05', 'Bath', 'bath', 2.1, 2.4, [4, 7], 1.6, 'no', true, ['master', 'bed']),
    R('R-06', 'Half bath', 'halfbath', 1.5, 1.8, [2.5, 4], 1.2, 'no', true, []),
    R('R-07', 'Master bedroom', 'master', 3.6, 3.9, [11, 16], 3.0, 'required', false, ['bath']),
    R('R-08', 'Bedroom', 'bed', 3.0, 3.3, [9, 12], 2.7, 'required', false, ['bath']),
    R('R-09', 'Laundry', 'laundry', 1.8, 2.1, [3, 5], 1.5, 'no', true, ['kitchen']),
    R('R-10', 'Hall', 'hall', 1.5, 3.0, [3, 6], 1.2, 'no', false, ['living']),
  ]
}

const U = (id: string, name: string, color: string, rooms: string[], wMin: number, wMax: number, price: number, stalls: number): UnitType => ({ id, name, color, rooms, wMin, wMax, price, stalls })

/** the unit types a new project starts with (v0.1's three, now built from rooms) */
export function UNITS0(): UnitType[] {
  return [
    U('studio', 'Studio', '#9cc0e6', ['R-01', 'R-04', 'R-05'], 4.2, 6.0, 4200, 0.5),
    U('br1', '1BR', '#5b8fd0', ['R-01', 'R-03', 'R-08', 'R-05'], 6.0, 8.4, 4000, 0.8),
    U('br2', '2BR', '#2f5f9e', ['R-02', 'R-03', 'R-07', 'R-08', 'R-05', 'R-05'], 9.6, 11.4, 3800, 1.2),
  ]
}

/** + Unit type offers these */
export function UNIT_TEMPLATES(): UnitType[] {
  return [...UNITS0(), U('br3', '3BR', '#1d3f6e', ['R-02', 'R-03', 'R-07', 'R-08', 'R-08', 'R-05', 'R-05'], 12.0, 14.4, 2700, 1.5)]
}

export function RULES0(): SRule[] {
  return [
    { id: 'corner2br', kind: 'corners', on: true, strength: 'preferred', types: ['br2'] },
    { id: 'one2br', kind: 'at-least', on: true, strength: 'preferred', types: ['br2'], n: 1 },
    { id: 'studiocore', kind: 'core-face', on: true, strength: 'preferred', types: ['studio'] },
    { id: 'premium', kind: 'price-levels', on: true, strength: 'preferred', types: [], n: 15, p: 8 },
  ]
}

/** INTERIM (removed in Task 8): v0.1's average unit areas, so the calculator keeps its numbers until units come from the layout */

/** shares in % over the known types: non-negative, summing to 100 (all zero → the first type takes 100) */
export function normMix(mix: Record<string, number>, types: UnitType[]): Record<string, number> {
  const raw = types.map((t) => { const v = mix[t.id]; return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0 })
  const sum = raw.reduce((a, b) => a + b, 0)
  const out: Record<string, number> = {}
  if (!sum) { types.forEach((t, i) => (out[t.id] = i === 0 ? 100 : 0)); return out }
  const pct = raw.map((v) => Math.floor((v / sum) * 100))
  let rest = 100 - pct.reduce((a, b) => a + b, 0)
  // the remainder goes to the largest fractions first
  const order = raw.map((v, i) => ({ i, f: (v / sum) * 100 - pct[i] })).sort((a, b) => b.f - a.f || a.i - b.i)
  for (let k = 0; rest > 0; k = (k + 1) % order.length, rest--) pct[order[k].i]++
  types.forEach((t, i) => (out[t.id] = pct[i]))
  return out
}

/** false when it is the last type; otherwise mixes renormalise and rules forget it */
export function removeUnitType(s: State, id: string): boolean {
  if (s.unitTypes.length < 2 || !s.unitTypes.some((t) => t.id === id)) return false
  s.unitTypes = s.unitTypes.filter((t) => t.id !== id)
  for (const o of s.options) for (const b of o.buildings) { const m = { ...b.mix }; delete m[id]; b.mix = normMix(m, s.unitTypes) }
  for (const r of s.rules) r.types = r.types.filter((t) => t !== id)
  return true
}

/** removes the room type and its uses in programmes; returns how many programmes changed */
export function removeRoomType(s: State, id: string): number {
  s.rooms = s.rooms.filter((r) => r.id !== id)
  let n = 0
  for (const t of s.unitTypes) if (t.rooms.includes(id)) { t.rooms = t.rooms.filter((x) => x !== id); n++ }
  return n
}
