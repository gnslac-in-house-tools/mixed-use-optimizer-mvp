// Wave Function Collapse over one band of a floor plate (port of the WFC band solver, generalised to any list of
// unit types, a reach predicate and one bias hook).
//
// A band is the strip between corridor and facade, cut into slots of Q metres. Each unit type comes in a few
// widths; a unit of k slots is k tile parts (S0…S{k-1}) with forced internal order, so a cell's domain is the set
// of (type, width, part) it could still be.
//   unary  — a part is only possible where its unit fits in the band and its entry reaches the corridor
//            (normal, or mirrored so the entry sits at the far end)
//   along  — part p is followed by p+1; a unit's last part is followed by the first part of a type `along` allows
//   bias   — corners, cores, level rules and the level below weight the choice
// Lowest Shannon entropy first, weighted roulette, propagation both ways; no backtracking: a contradiction
// returns a failure and the caller reseeds.

export const Q = 0.3

export interface BandType { id: string; widths: number[] }
export interface BandRules {
  types: BandType[]
  /** target share per type id, 0–1 */
  mix: Record<string, number>
  /** 0 = b may never follow a; otherwise a weight factor */
  along: (a: string, b: string) => number
}
export interface BandSpec {
  name: string
  /** band length, m */
  length: number
  /** can an entry door spanning band x0…x1 reach the corridor? */
  reach: (x0: number, x1: number) => boolean
  /** entry door span from the unit's own start, m */
  entry: [number, number]
  /** weight factor for a unit of `type` centred at band x */
  bias?: (type: string, xMid: number) => number
  /** 0 = core at the band start, 1 = at the end; biases the collapse order */
  coreAt?: 0 | 1
}
export interface BandUnit { t: string; x: number; w: number; flip: boolean }
/** on failure, `slot` is the first slot that broke; `slots` lists every slot no unit can serve at all (reach or width) */
export type BandResult = { ok: true; units: BandUnit[]; steps: number } | { ok: false; reason: string; slot?: number; slots?: number[]; steps: number }

interface Tile { t: string; k: number; base: number }

/** counts: units of each type already placed on this level (mix balancing; updated in place on success) */
export function solveBand(spec: BandSpec, rules: BandRules, r: () => number, counts: Record<string, number>): BandResult {
  const tiles: Tile[] = []
  let P = 0
  for (const ty of rules.types) {
    const ks = [...new Set(ty.widths.map((w) => Math.round(w / Q)))].filter((k) => k > 0)
    for (const k of ks) { tiles.push({ t: ty.id, k, base: P }); P += k }
  }
  if (!tiles.length) return { ok: false, reason: spec.name + ': no unit type has a width', steps: 0 }
  const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a)
  const g = tiles.reduce((a, tl) => gcd(a, tl.k), 0) || 1
  // whole steps rounded down: the scale only ever stretches units, never below a type's narrowest width
  const n = g * Math.floor(spec.length / (g * Q) + 1e-9)
  if (n <= 0) return { ok: true, units: [], steps: 0 }
  const scale = spec.length / (n * Q)
  const partTile = new Int32Array(P)
  const partP = new Int32Array(P)
  tiles.forEach((tl, j) => { for (let p = 0; p < tl.k; p++) { partTile[tl.base + p] = j; partP[tl.base + p] = p } })
  const [e0, e1] = spec.entry
  const reachN = (x: number) => spec.reach(x + e0, x + e1)
  const reachF = (x: number, w: number) => spec.reach(x + w - e1, x + w - e0)
  const startOk = (j: number, s: number) => {
    const tl = tiles[j]
    if (s < 0 || s + tl.k > n) return false
    const x = s * Q * scale
    const w = tl.k * Q * scale
    return reachN(x) || reachF(x, w)
  }
  const D = new Uint8Array(n * P)
  const size = new Int32Array(n)
  const empty: number[] = []
  for (let i = 0; i < n; i++) {
    for (let id = 0; id < P; id++) if (startOk(partTile[id], i - partP[id])) { D[i * P + id] = 1; size[i]++ }
    if (!size[i]) empty.push(i)
  }
  if (empty.length) return { ok: false, reason: `${spec.name}: no unit fits slot ${empty[0]} (entry reach or width)`, slot: empty[0], slots: empty, steps: 0 }
  const alongF = (a: string, b: string) => rules.along(a, b)

  const nxt = new Uint8Array(P)
  const revise = (from: number, to: number, dir: 1 | -1) => {
    nxt.fill(0)
    const fo = from * P
    for (let id = 0; id < P; id++) {
      if (!D[fo + id]) continue
      const tl = tiles[partTile[id]]
      const p = partP[id]
      if (dir === 1) {
        if (p < tl.k - 1) nxt[id + 1] = 1
        else for (const t2 of tiles) if (alongF(tl.t, t2.t) > 0) nxt[t2.base] = 1
      } else {
        if (p > 0) nxt[id - 1] = 1
        else for (const t2 of tiles) if (alongF(t2.t, tl.t) > 0) nxt[t2.base + t2.k - 1] = 1
      }
    }
    let changed = false
    const to0 = to * P
    for (let id = 0; id < P; id++) if (D[to0 + id] && !nxt[id]) { D[to0 + id] = 0; size[to]--; changed = true }
    return changed
  }
  const propagate = (start: number[]): { reason: string; slot: number } | null => {
    const q = [...start]
    while (q.length) {
      const c = q.pop()!
      for (const [to, dir] of [[c + 1, 1], [c - 1, -1]] as const) {
        if (to < 0 || to >= n) continue
        if (revise(c, to, dir)) {
          if (!size[to]) return { reason: `${spec.name}: contradiction at slot ${to} (along rules)`, slot: to }
          q.push(to)
        }
      }
    }
    return null
  }
  const init = propagate(Array.from({ length: n }, (_, i) => i))
  if (init) return { ok: false, ...init, steps: 0 }

  const total = () => rules.types.reduce((a, t) => a + (counts[t.id] ?? 0), 0)
  const weight = (j: number, s: number, leftType: string | null) => {
    const tl = tiles[j]
    const placed = total()
    const m = rules.mix[tl.t] ?? 0
    const share = placed ? (counts[tl.t] ?? 0) / placed : 0
    let w = Math.max(0.02, m) * (1 + Math.max(0, m - share) * 6)
    if (leftType) w *= Math.max(1e-3, alongF(leftType, tl.t))
    if (spec.bias) w *= Math.max(1e-3, spec.bias(tl.t, (s + tl.k / 2) * Q * scale))
    return w
  }
  const typeAt = (i: number): string | null => {
    if (i < 0 || size[i] !== 1) return null
    for (let id = 0; id < P; id++) if (D[i * P + id]) return tiles[partTile[id]].t
    return null
  }

  let steps = 0
  for (;;) {
    let best = -1
    let bestH = Infinity
    for (let i = 0; i < n; i++) {
      if (size[i] <= 1) continue
      let sw = 0
      let swl = 0
      for (let id = 0; id < P; id++) {
        if (!D[i * P + id]) continue
        const w = weight(partTile[id], i - partP[id], null)
        sw += w
        swl += w * Math.log(w)
      }
      const H = Math.log(sw) - swl / sw
      const pos = i / n
      const h = H + (spec.coreAt === 1 ? 1 - pos : pos) * 0.15 + r() * 1e-3
      if (h < bestH) { bestH = h; best = i }
    }
    if (best < 0) break
    steps++
    const ids: number[] = []
    const ws: number[] = []
    for (let id = 0; id < P; id++) {
      if (!D[best * P + id]) continue
      const s = best - partP[id]
      ids.push(id)
      ws.push(weight(partTile[id], s, typeAt(s - 1)))
    }
    let acc = r() * ws.reduce((a, v) => a + v, 0)
    let pick = ids[ids.length - 1]
    for (let k = 0; k < ids.length; k++) { acc -= ws[k]; if (acc <= 0) { pick = ids[k]; break } }
    const o = best * P
    for (let id = 0; id < P; id++) D[o + id] = id === pick ? 1 : 0
    size[best] = 1
    const err = propagate([best])
    if (err) return { ok: false, ...err, steps }
  }
  const units: BandUnit[] = []
  for (let i = 0; i < n;) {
    let id = -1
    for (let q = 0; q < P; q++) if (D[i * P + q]) id = q
    const tl = tiles[partTile[id]]
    if (partP[id] !== 0) return { ok: false, reason: `${spec.name}: broken chain at slot ${i}`, slot: i, steps }
    const x = i * Q * scale
    const w = tl.k * Q * scale
    units.push({ t: tl.t, x, w, flip: !reachN(x) })
    i += tl.k
  }
  // mirror alternate units where both entries reach (entries pair up across party walls)
  units.forEach((u, i) => { if (reachN(u.x) && reachF(u.x, u.w)) u.flip = i % 2 === 1 })
  for (const u of units) counts[u.t] = (counts[u.t] ?? 0) + 1
  return { ok: true, units, steps }
}
