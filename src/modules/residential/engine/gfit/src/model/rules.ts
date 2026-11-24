// Sentence rules (spec 2026-11-04-program-wfc §6): the sentence with its parameter chips, the status a rule has
// against the solved layouts, and the price factor the price rules give a unit.
import { area, intersection, offset } from './geom'
import type { LevelLayout, PlacedUnit } from '../layout/level'
import type { RuleKind, SRule, UnitType } from './program'

export type Chip = { k: 'types' | 'a' | 'b' | 'n' | 'p' | 'dir' | 'type'; v: string }
export interface RuleStatus { ok: boolean | null; text: string }

const TYPED: RuleKind[] = ['levels-only', 'levels-never', 'corners', 'at-least', 'never-next', 'core-face']
const name = (id: string | undefined, types: UnitType[]) => types.find((t) => t.id === id)?.name ?? '?'
const names = (ids: string[], types: UnitType[]) => ids.map((i) => name(i, types)).join(', ') || '?'
const num = (v: number | undefined) => String(v ?? 0)

export function ruleText(r: SRule, types: UnitType[]): { parts: (string | Chip)[] } {
  const T: Chip = { k: 'types', v: names(r.types, types) }
  const parts: (string | Chip)[] = (() => {
    switch (r.kind) {
      case 'levels-only': return ['Levels ', { k: 'a', v: num(r.a) }, '–', { k: 'b', v: num(r.b) }, ' only ', T]
      case 'levels-never': return ['Levels ', { k: 'a', v: num(r.a) }, '–', { k: 'b', v: num(r.b) }, ' never ', T]
      case 'corners': return ['Corners prefer ', T]
      case 'at-least': return ['At least ', { k: 'n', v: num(r.n) }, ' ', T, ' per level']
      case 'never-next': return ['Never ', { k: 'type', v: name(r.types[0], types) }, ' next to ', { k: 'type', v: name(r.types[1] ?? r.types[0], types) }]
      case 'stack': return ['Same type over the level below']
      case 'core-face': return [T, ' never face the core']
      case 'price-levels': return ['Levels ≥ ', { k: 'n', v: num(r.n) }, ' sell at +', { k: 'p', v: num(r.p) }, '%']
      case 'price-corner': return ['Corner units sell at +', { k: 'p', v: num(r.p) }, '%']
      case 'price-facing': return ['Units facing ', { k: 'dir', v: r.dir ?? 'N' }, ' sell at +', { k: 'p', v: num(r.p) }, '%']
    }
  })()
  return { parts }
}

/** the price rules a unit on level `levelNum` matches, multiplied: Π (1 + p/100) */
export function priceFactor(u: PlacedUnit, levelNum: number, rules: SRule[]): number {
  let f = 1
  for (const r of rules) {
    if (!r.on) continue
    const p = 1 + (r.p ?? 0) / 100
    if (r.kind === 'price-levels' && levelNum >= (r.n ?? Infinity)) f *= p
    if (r.kind === 'price-corner' && u.corner) f *= p
    if (r.kind === 'price-facing' && r.dir && u.facing.includes(r.dir)) f *= p
  }
  return f
}

const plural = (n: number, one: string, many: string) => n + ' ' + (n === 1 ? one : many)

/** pairs of units side by side (sharing more than a few cm of wall), per layout object */
const pairMemo = new WeakMap<LevelLayout, [string, string][]>()
function sideBySide(L: LevelLayout): [string, string][] {
  let out = pairMemo.get(L)
  if (out) return out
  out = []
  const box = L.units.map((u) => {
    const ps = u.shape.flat()
    return [Math.min(...ps.map((p) => p[0])), Math.min(...ps.map((p) => p[1])), Math.max(...ps.map((p) => p[0])), Math.max(...ps.map((p) => p[1]))]
  })
  const grown = L.units.map((u) => offset(u.shape, 0.05))
  for (let i = 0; i < L.units.length; i++) {
    for (let j = i + 1; j < L.units.length; j++) {
      const a = box[i], b = box[j]
      if (a[0] > b[2] + 0.1 || b[0] > a[2] + 0.1 || a[1] > b[3] + 0.1 || b[1] > a[3] + 0.1) continue
      if (area(intersection(grown[i], L.units[j].shape)) > 0.02) out.push([L.units[i].type, L.units[j].type])
    }
  }
  pairMemo.set(L, out)
  return out
}

/** how a rule did on the layouts of every building (one Map of level → layout per building) */
/** `layouts`: per building, (level number, layout) pairs — several plates can share a level number */
export function ruleStatus(r: SRule, byBuilding: ([number, LevelLayout][] | Map<number, LevelLayout>)[], types: UnitType[]): RuleStatus {
  const layouts = byBuilding.map((m) => (m instanceof Map ? [...m.entries()] : m))
  if (!r.on) return { ok: null, text: 'off' }
  if (TYPED.includes(r.kind)) {
    if (!r.types.length) return { ok: null, text: 'n/a · no unit type' }
    if (r.types.some((id) => !types.some((t) => t.id === id))) return { ok: null, text: 'n/a · its unit type was deleted' }
  }
  const levels: [number, LevelLayout][] = layouts.flat()
  if (!levels.length) return { ok: null, text: 'n/a · no residential levels' }
  const T = names(r.types, types)
  const has = (u: PlacedUnit) => r.types.includes(u.type)
  const inRange = (n: number) => n >= (r.a ?? 1) && n <= (r.b ?? 999)
  const units = (pick: (u: PlacedUnit, n: number) => boolean) => levels.reduce((a, [n, L]) => a + L.units.filter((u) => pick(u, n)).length, 0)
  switch (r.kind) {
    case 'at-least': {
      const need = r.n ?? 1
      const bad = levels.filter(([, L]) => L.units.filter(has).length < need).length
      if (!bad) return { ok: true, text: '✓ ' + levels.length + ' / ' + plural(levels.length, 'level', 'levels') }
      return { ok: false, text: '✕ ' + plural(bad, 'level has', 'levels have') + (need === 1 ? ' no ' : ' fewer than ' + need + ' ') + T }
    }
    case 'levels-only':
    case 'levels-never': {
      const span = levels.filter(([n]) => inRange(n))
      if (!span.length) return { ok: null, text: 'n/a · no levels ' + (r.a ?? 1) + '–' + (r.b ?? 999) }
      const only = r.kind === 'levels-only'
      const bad = span.filter(([, L]) => L.units.some((u) => (only ? !has(u) : has(u)))).length
      if (!bad) return { ok: true, text: '✓ ' + span.length + ' / ' + plural(span.length, 'level', 'levels') }
      return { ok: false, text: '✕ ' + plural(bad, 'level has', 'levels have') + (only ? ' other types' : ' ' + T) }
    }
    case 'corners': {
      const total = units((u) => u.corner)
      if (!total) return { ok: null, text: 'n/a · no corners' }
      const got = units((u) => u.corner && has(u))
      const ok = got >= (r.strength === 'required' ? total : total / 2)
      return { ok, text: (ok ? '✓ ' : '✕ ') + got + ' / ' + plural(total, 'corner', 'corners') }
    }
    case 'never-next': {
      const [x, y] = [r.types[0], r.types[1] ?? r.types[0]]
      const bad = levels.reduce((a, [, L]) => a + sideBySide(L).filter(([p, q]) => (p === x && q === y) || (p === y && q === x)).length, 0)
      return bad ? { ok: false, text: '✕ ' + plural(bad, 'pair', 'pairs') + ' side by side' } : { ok: true, text: '✓ never side by side' }
    }
    case 'stack': {
      let same = 0, total = 0
      for (const m of layouts) {
        const ls = m.slice().sort((p, q) => p[0] - q[0])
        ls.forEach(([, L], i) => { if (i) { total++; if (L === ls[i - 1][1]) same++ } })
      }
      return { ok: true, text: '✓ ' + same + ' / ' + plural(total, 'level repeats', 'levels repeat') + ' the one below' }
    }
    case 'core-face': return { ok: null, text: 'a weight in the layout' }
    case 'price-levels': {
      const n = units((_, lv) => lv >= (r.n ?? Infinity))
      return n ? { ok: true, text: '+' + (r.p ?? 0) + '% on ' + plural(n, 'unit', 'units') } : { ok: null, text: 'n/a · no levels ≥ ' + (r.n ?? 0) }
    }
    case 'price-corner': {
      const n = units((u) => u.corner)
      return n ? { ok: true, text: '+' + (r.p ?? 0) + '% on ' + plural(n, 'unit', 'units') } : { ok: null, text: 'n/a · no corner units' }
    }
    case 'price-facing': {
      const n = units((u) => !!r.dir && u.facing.includes(r.dir))
      return n ? { ok: true, text: '+' + (r.p ?? 0) + '% on ' + plural(n, 'unit', 'units') } : { ok: null, text: 'n/a · no units face ' + (r.dir ?? 'N') }
    }
  }
}

let seq = 0
const newId = (kind: RuleKind) => (kind + '-' + Date.now().toString(36) + (seq++).toString(36)).slice(0, 64)

/** the ten kinds, each with a rule made from the project's first types */
export const RULE_CATALOG: { kind: RuleKind; label: string; make: (types: UnitType[]) => SRule }[] = [
  { kind: 'levels-only', label: 'Levels a–b only …', make: (t) => ({ id: newId('levels-only'), kind: 'levels-only', on: true, strength: 'preferred', types: t.slice(0, 1).map((x) => x.id), a: 2, b: 5 }) },
  { kind: 'levels-never', label: 'Levels a–b never …', make: (t) => ({ id: newId('levels-never'), kind: 'levels-never', on: true, strength: 'preferred', types: t.slice(0, 1).map((x) => x.id), a: 2, b: 5 }) },
  { kind: 'corners', label: 'Corners prefer …', make: (t) => ({ id: newId('corners'), kind: 'corners', on: true, strength: 'preferred', types: t.slice(-1).map((x) => x.id) }) },
  { kind: 'at-least', label: 'At least n … per level', make: (t) => ({ id: newId('at-least'), kind: 'at-least', on: true, strength: 'preferred', types: t.slice(-1).map((x) => x.id), n: 1 }) },
  { kind: 'never-next', label: 'Never … next to …', make: (t) => ({ id: newId('never-next'), kind: 'never-next', on: true, strength: 'preferred', types: [t[0], t[t.length - 1]].filter(Boolean).map((x) => x.id) }) },
  { kind: 'stack', label: 'Same type over the level below', make: () => ({ id: newId('stack'), kind: 'stack', on: true, strength: 'preferred', types: [] }) },
  { kind: 'core-face', label: '… never face the core', make: (t) => ({ id: newId('core-face'), kind: 'core-face', on: true, strength: 'preferred', types: t.slice(0, 1).map((x) => x.id) }) },
  { kind: 'price-levels', label: 'Levels ≥ n sell at +p%', make: () => ({ id: newId('price-levels'), kind: 'price-levels', on: true, strength: 'preferred', types: [], n: 15, p: 8 }) },
  { kind: 'price-corner', label: 'Corner units sell at +p%', make: () => ({ id: newId('price-corner'), kind: 'price-corner', on: true, strength: 'preferred', types: [], p: 5 }) },
  { kind: 'price-facing', label: 'Units facing … sell at +p%', make: () => ({ id: newId('price-facing'), kind: 'price-facing', on: true, strength: 'preferred', types: [], dir: 'N', p: 3 }) },
]
