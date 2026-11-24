// The dock rule and the bays' groups of a block's walls (Decisions "Dock rule", "Elements by module"), pure: which modules of a wall a bay,
// a drag or a count gives to docks, doors and patterns. They are the On edge engine's rule for a block (Phase D.3, task 9): the warehouse's
// adapters apply them to `byRule` ops and to a count; the views' `handleMath.ts` re-exports them until the On edge views (task 10).
import type { HallElement } from '../../../model/schema.ts'
import { moduleAt as lineAt, nearestLine, type HallRuns, type Run } from './bays.ts'
import { edgeBays, edgeModules, type ShapeEdge } from './shape.ts'

/** What the rule reads of a block: its walls, its grid's runs and the elements it has now (only each one's kind, edge and module). */
export interface RuleHost {
  edges: readonly ShapeEdge[]
  runs: HallRuns
  doors: readonly Pick<HallElement, 'kind' | 'edge' | 'module'>[]
}

/** The run an edge's places count along. */
export const runAlongEdge = (runs: HallRuns, e: Pick<ShapeEdge, 'horizontal'>): Run => (e.horizontal ? runs.x : runs.y)


/** The modules of bay `bay` of an edge (each from module line k to k + 1), counted on the box now. */
export function bayModules(runs: HallRuns, e: ShapeEdge, bay: number): number[] {
  const b = edgeBays(runs, e)[bay]
  if (!b) return []
  const r = runAlongEdge(runs, e)
  const lo = nearestLine(r, b.lo)
  return Array.from({ length: nearestLine(r, b.hi) - lo }, (_, i) => lo + i)
}

/** The module of an edge under `along` (m along its line), held to the edge's span. */
export function moduleOn(runs: HallRuns, e: ShapeEdge, along: number): number {
  const r = runAlongEdge(runs, e)
  const { lo, hi } = edgeModules(e)
  for (let k = lo; k < hi - 1; k++) if (along < lineAt(r, k + 1)) return k
  return hi - 1
}


/** A drag along a wall from the modules first pressed: those and every module on to the one under `along`. */
export function dragModules(runs: HallRuns, e: ShapeEdge, first: number[], along: number): number[] {
  const k = moduleOn(runs, e, along)
  const lo = Math.min(k, ...first)
  const hi = Math.max(k, ...first)
  return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i)
}

/** Each bay of an edge, as its modules. */
export const baysOf = (runs: HallRuns, e: ShapeEdge): number[][] => edgeBays(runs, e).map((_, i) => bayModules(runs, e, i))

/**
 * The dock rule (the user, 2026-11-10: docks put in a row "respect the pattern" of the block's): which modules of a bay
 * `n` modules long hold a dock, by position in the bay — the positions the block's docked bays as long hold most often
 * (the sample's: the two middle ones of four), else, no bay as long docked, the middle one (odd) or two (even).
 */
export function dockMask(g: RuleHost): (n: number) => ReadonlySet<number> {
  const counts = new Map<number, Map<string, number>>()
  for (const e of g.edges) {
    const held = new Set(g.doors.filter((d) => d.kind === 'dock' && d.edge === e.id).map((d) => d.module))
    if (held.size === 0) continue
    for (const bay of baysOf(g.runs, e)) {
      const at = bay.flatMap((k, i) => (held.has(k) ? [i] : []))
      if (at.length === 0) continue
      const by = counts.get(bay.length) ?? new Map<string, number>()
      by.set(at.join(','), (by.get(at.join(',')) ?? 0) + 1)
      counts.set(bay.length, by)
    }
  }
  return (n) => {
    const by = counts.get(n)
    if (by) return new Set([...by].reduce((best, x) => (x[1] > best[1] ? x : best))[0].split(',').map(Number))
    return new Set(n % 2 === 0 ? [n / 2 - 1, n / 2] : [(n - 1) / 2])
  }
}

/** Of some modules of an edge, those the dock rule gives a dock (a module in no bay stays). */
export function onDockRule(g: RuleHost, e: ShapeEdge, modules: number[]): number[] {
  const mask = dockMask(g)
  const bays = baysOf(g.runs, e)
  return modules.filter((k) => {
    const bay = bays.find((b) => b.includes(k))
    return !bay || mask(bay.length).has(k - bay[0])
  })
}

/**
 * The modules a drag of an element tool paints (`dragModules`): docks put over more than one module, by the dock rule
 * (`onDockRule`); taken away, and doors and patterns, every module it passes.
 */
export function paintModules(g: RuleHost, kind: HallElement['kind'], e: ShapeEdge, first: number[], along: number, on: boolean): number[] {
  const all = dragModules(g.runs, e, first, along)
  return kind === 'dock' && on && all.length > 1 ? onDockRule(g, e, all) : all
}

