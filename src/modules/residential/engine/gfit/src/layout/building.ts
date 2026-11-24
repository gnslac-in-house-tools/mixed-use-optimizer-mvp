// Every residential level of a building laid out (spec 2026-11-04-program-wfc §5): a level whose plate, cores and
// level rules equal the level below takes the below layout as is (typical floors), and solved levels are memoised
// so an edit that leaves a plate alone does not solve it again.
import type { Shape } from '../model/geom'
import type { Massed } from '../model/massing'
import type { SRule } from '../model/program'
import type { Building, State } from '../model/state'
import { layoutLevel } from './level'
import type { LevelLayout } from './level'

const MAX = 400
const cache = new Map<string, LevelLayout>()
let stats = { solved: 0, reused: 0 }
let computed = 0

// mixed-use-optimizer patch (VENDOR.md): a host may lay a level out itself (a plan edited by hand). While set, a
// residential level the function answers takes that layout instead of the WFC's; nothing else changes.
type LevelOverride = (lv: Massed['levels'][number], i: number) => LevelLayout | undefined
let override: LevelOverride | null = null
export function setLevelOverride(f: LevelOverride | null) { override = f }

/** levels solved and levels that took the layout of the level below, in the last layoutBuilding */
export const layoutStats = () => ({ ...stats })
/** levels actually laid out (cache misses) since the panel started */
export const layoutComputed = () => computed

/** rules that only price units: they never change where units go */
const PRICE: SRule['kind'][] = ['price-levels', 'price-corner', 'price-facing']

const LEVEL_RULES: SRule['kind'][] = ['levels-only', 'levels-never']
const shapeKey = (s: Shape) => JSON.stringify(s.map((r) => r.map((p) => [Math.round(p[0] * 100), Math.round(p[1] * 100)])))

/** FNV-1a over the key, twice with different seeds: a short Map key for a long description */
function hash(s: string): string {
  let a = 0x811c9dc5, b = 0x01000193 ^ s.length
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    a = Math.imul(a ^ c, 0x01000193)
    b = Math.imul(b ^ c, 0x5bd1e995)
  }
  return (a >>> 0).toString(36) + '.' + (b >>> 0).toString(36) + '.' + s.length
}

/** layouts keyed by the plate's index in `m.levels` (several plates can share a level number) */
/** layouts keyed by the plate's index in `m.levels` (several plates can share a level number) */
/** layouts keyed by the plate's index in `m.levels` (several plates can share a level number) */
export function layoutBuilding(m: Massed, b: Building, s: State): Map<number, LevelLayout> {
  stats = { solved: 0, reused: 0 }
  const out = new Map<number, LevelLayout>()
  const live = s.rules.filter((r) => r.on)
  const stack = live.some((r) => r.kind === 'stack')
  // only what moves units: a price, a stall count or a colour must not lay a 30-level tower out again
  const types = s.unitTypes.map((t) => [t.id, t.name, t.rooms, t.wMin, t.wMax])
  const fixed = JSON.stringify([b.unitDepth, b.corridor, b.seed, types, s.rooms, live.filter((r) => !PRICE.includes(r.kind)), b.mix])
  // a typical floor repeats the plate below it in the same block
  const prevBy = new Map<string, { plate: string; cores: string; levelRules: string; key: string; L: LevelLayout }>()
  m.levels.forEach((lv, i) => {
    const blk = lv.block ?? ''
    if (lv.lobby || lv.num < 1 || lv.prog !== 'res' || !lv.plateA) { prevBy.delete(blk); return }
    const own = override?.(lv, i)
    if (own) { out.set(i, own); prevBy.delete(blk); return }
    const plate = shapeKey(lv.shape), cores = shapeKey(lv.cores)
    const levelRules = live.filter((r) => LEVEL_RULES.includes(r.kind) && lv.num >= (r.a ?? 1) && lv.num <= (r.b ?? 999)).map((r) => r.id).sort().join(',')
    const prev = prevBy.get(blk)
    if (prev && prev.plate === plate && prev.cores === cores && prev.levelRules === levelRules) {
      out.set(i, prev.L)
      stats.reused++
      return
    }
    // the stack rule reads the level below, so it is part of what this level depends on
    const key = hash(fixed + '|' + plate + '|' + cores + '|' + levelRules + (stack && prev ? '|' + prev.key : ''))
    let L = cache.get(key)
    if (!L) {
      computed++
      L = layoutLevel({
        plate: lv.shape, cores: lv.cores, d: b.unitDepth, cw: b.corridor, num: lv.num, seed: b.seed,
        types: s.unitTypes, rooms: s.rooms, rules: s.rules, mix: b.mix, ...(stack && prev ? { below: prev.L } : {}),
      })
      if (cache.size >= MAX) cache.delete(cache.keys().next().value!)
      cache.set(key, L)
    }
    stats.solved++
    out.set(i, L)
    prevBy.set(blk, { plate, cores, levelRules, key, L })
  })
  return out
}
