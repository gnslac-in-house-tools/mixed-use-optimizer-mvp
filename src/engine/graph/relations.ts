// The graph's relations (Decisions "Rules" and "Program graph"): the brief's rules between programs, applied to the
// masses of an option. The graph is derived, never stored: every change of the massing finds the pairs again.
//   pairing   each mass of `a` with its nearest mass of `b` (adjacent, near, attached); with every mass of `b` (apart).
//             Nearest = the smallest gap between footprints, then the closest centres, then the project's order.
//   measured  in plan, on the footprints: the shared wall (edges on one line, within 5 cm, overlapping) or the gap
//             (0 when they touch or overlap)
//   met       adjacent: shared ≥ minShared (0: ≥ 1 m) · near: gap ≤ max · apart: gap ≥ min · attached: always (a link)
// A broken rule is an Issue about both masses (an error when it is required, else a warning). Pure: derive(), the move
// verbs (links.ts), arrange and placement call it.
import type { Id, Point, Polygon, Project, Rule } from '../../model/schema.ts'
import { centroid, distancePointSegment, pointInPolygon, segmentsTouch } from '../geom/polygon.ts'
import type { Issue } from '../types.ts'

/** m: two walls closer than this, and parallel, are one shared wall. */
const WALL_TOL = 0.05
/** m: "share a wall" with no length asked means at least this much of one. */
export const TOUCH = 1

/** A new rule's parameters when none are given: share a wall, within 50 m, at least 30 m apart. */
export const RULE_DEFAULTS = { minShared: 0, max: 50, min: 30 } as const

/** A mass as the graph sees it: its program and its footprint. */
export interface Node {
  id: Id
  programId: Id | null
  polygon: Polygon
}

/** One rule applied to two masses: `a` is the mass the rule speaks of, `b` its partner (for attached, its leader). */
export interface Relation {
  /** `<rule>|<a>|<b>`: the same pair of the same rule keeps its id while the massing changes. */
  id: string
  rule: Id
  kind: Rule['kind']
  a: Id
  b: Id
  weight: number
  met: boolean
  /** What was measured: the shared wall (adjacent) or the gap (near, apart), in m; 0 for attached. */
  value: number
  /** How far from met, in m (0 when met). */
  gap: number
}

/** The distance between two footprints: 0 when they touch, overlap or one is inside the other. */
export function polygonDistance(a: Polygon, b: Polygon): number {
  if (a.length < 3 || b.length < 3) return Infinity
  if (pointInPolygon(a[0], b) || pointInPolygon(b[0], a)) return 0
  let d = Infinity
  for (let i = 0; i < a.length; i++) {
    const p = a[i]
    const q = a[(i + 1) % a.length]
    for (let j = 0; j < b.length; j++) {
      const r = b[j]
      const s = b[(j + 1) % b.length]
      if (segmentsTouch(p, q, r, s)) return 0
      d = Math.min(d, distancePointSegment(p, r, s), distancePointSegment(r, p, q))
    }
  }
  return d
}

/** The length of wall two footprints share: their edges that lie on one line (within 5 cm) and overlap. */
export function sharedWall(a: Polygon, b: Polygon): number {
  let total = 0
  for (let i = 0; i < a.length; i++) {
    const p = a[i]
    const q = a[(i + 1) % a.length]
    const len = Math.hypot(q.x - p.x, q.y - p.y)
    if (len < 1e-9) continue
    const ux = (q.x - p.x) / len
    const uy = (q.y - p.y) / len
    for (let j = 0; j < b.length; j++) {
      const r = b[j]
      const s = b[(j + 1) % b.length]
      const l2 = Math.hypot(s.x - r.x, s.y - r.y)
      if (l2 < 1e-9) continue
      // parallel, and on the same line
      if (Math.abs(ux * (s.y - r.y) - uy * (s.x - r.x)) / l2 > 1e-3) continue
      if (Math.abs(ux * (r.y - p.y) - uy * (r.x - p.x)) > WALL_TOL) continue
      const t1 = (r.x - p.x) * ux + (r.y - p.y) * uy
      const t2 = (s.x - p.x) * ux + (s.y - p.y) * uy
      total += Math.max(0, Math.min(len, Math.max(t1, t2)) - Math.max(0, Math.min(t1, t2)))
    }
  }
  return total
}

/** A rule measured on two footprints. */
export function measureRule(r: Rule, a: Polygon, b: Polygon): { met: boolean; value: number; gap: number } {
  switch (r.kind) {
    case 'adjacent': {
      const shared = sharedWall(a, b)
      const need = r.minShared > 0 ? r.minShared : TOUCH
      const met = shared >= need - 1e-6
      return { met, value: shared, gap: met ? 0 : need - shared }
    }
    case 'near': {
      const d = polygonDistance(a, b)
      const met = d <= r.max + 1e-6
      return { met, value: d, gap: met ? 0 : d - r.max }
    }
    case 'apart': {
      const d = polygonDistance(a, b)
      const met = d >= r.min - 1e-6
      return { met, value: d, gap: met ? 0 : r.min - d }
    }
    case 'attached':
      return { met: true, value: 0, gap: 0 }
  }
}

/** The nearest of `others` to `n`: the smallest gap, then the closest centres, then the first. */
function nearest(n: Node, others: Node[]): Node | undefined {
  const c = centroid(n.polygon)
  let best: { node: Node; gap: number; centre: number } | undefined
  for (const o of others) {
    const gap = polygonDistance(n.polygon, o.polygon)
    const oc = centroid(o.polygon)
    const centre = Math.hypot(oc.x - c.x, oc.y - c.y)
    if (!best || gap < best.gap - 1e-9 || (Math.abs(gap - best.gap) <= 1e-9 && centre < best.centre - 1e-9)) best = { node: o, gap, centre }
  }
  return best?.node
}

/** The pairs a rule makes among these masses: each mass of `a` with its nearest of `b`, or with every one (apart). */
export function rulePairs(r: Rule, nodes: Node[]): [Node, Node][] {
  const valid = nodes.filter((n) => n.polygon.length >= 3)
  const as = valid.filter((n) => n.programId === r.a)
  const bs = valid.filter((n) => n.programId === r.b)
  const out: [Node, Node][] = []
  const seen = new Set<string>()
  const add = (a: Node, b: Node) => {
    // a rule of a program with itself: one relation per pair, not two
    const key = r.a === r.b ? [a.id, b.id].sort().join('|') : `${a.id}|${b.id}`
    if (seen.has(key)) return
    seen.add(key)
    out.push([a, b])
  }
  for (const a of as) {
    const others = bs.filter((b) => b.id !== a.id)
    if (r.kind === 'apart') for (const b of others) add(a, b)
    else {
      const b = nearest(a, others)
      if (b) add(a, b)
    }
  }
  return out
}

/** Every rule applied to these masses (one option's design masses, with footprints), measured. */
export function applyRules(p: Project, nodes: Node[]): Relation[] {
  return (p.rules ?? []).flatMap((r) =>
    rulePairs(r, nodes).map(([a, b]) => ({ id: `${r.id}|${a.id}|${b.id}`, rule: r.id, kind: r.kind, a: a.id, b: b.id, weight: r.weight, ...measureRule(r, a.polygon, b.polygon) })),
  )
}

export const pairKey = (a: Id, b: Id) => (a < b ? `${a}|${b}` : `${b}|${a}`)

const m = (v: number) => `${Math.round(v * 10) / 10} m`

/** A rule as a sentence, with its programs' names: "Office must be adjacent to Warehouse". */
export function ruleSentence(r: Rule, name: (programId: Id) => string): string {
  const a = name(r.a)
  const b = name(r.b)
  switch (r.kind) {
    case 'adjacent':
      return `${a} must be adjacent to ${b}${r.minShared > 0 ? ` (${m(r.minShared)} of wall)` : ''}`
    case 'near':
      return `${a} within ${m(r.max)} of ${b}`
    case 'apart':
      return `${a} at least ${m(r.min)} from ${b}`
    case 'attached':
      return `${a} moves with ${b}`
  }
}

/** The broken relations as Issues about both masses: an error when the rule is required, else a warning. */
export function ruleIssues(p: Project, relations: Relation[], names: Record<Id, string>): Issue[] {
  const rules = new Map((p.rules ?? []).map((r) => [r.id, r]))
  const program = (id: Id) => p.programs.find((g) => g.id === id)?.name ?? id
  return relations
    .filter((x) => !x.met)
    .map((x) => {
      const r = rules.get(x.rule)!
      const a = names[x.a]
      const b = names[x.b]
      const why =
        x.kind === 'adjacent' ? `they share ${m(x.value)} of wall` : x.kind === 'near' ? `they are ${m(x.value)} apart` : `they are ${m(x.value)} apart`
      return {
        code: 'relation' as const,
        severity: r.required ? ('error' as const) : ('warning' as const),
        massIds: [x.a, x.b],
        message: `${a} and ${b}: ${ruleSentence(r, program)}; ${why}.`,
        rule: r.id,
      }
    })
}

/** The middle of a footprint, for drawing the graph. */
export const nodeCentre = (n: Pick<Node, 'polygon'>): Point => centroid(n.polygon)
