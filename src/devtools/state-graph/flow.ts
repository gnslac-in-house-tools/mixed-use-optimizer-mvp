// What one trace event lights up on the map: the round trip of a store call.
//
//   origin (the view that called) ─call─▶ store ─call─▶ verb modules ─▶ (engine they load)
//                                          store ─engine─▶ engine/derive ─▶ (engine it loads)
//                                          store ─data─▶ views that read a slice that changed (they re-render)
import type { TraceEvent } from '../../state/trace/tracer.ts'
import { isEngine, reachable, type ModuleMap } from './map.ts'

export const STORE = 'state/store.ts'

/** Strongest first: a node keeps the strongest role it gets. */
export const ROLES = ['origin', 'store', 'verb', 'engine', 'reader', 'reach'] as const
export type Role = (typeof ROLES)[number]

export type FlowKind = 'call' | 'engine' | 'data' | 'reject'

export interface Activity {
  roles: Map<string, Role>
  /** Verbs that ran, per module, in call order (no repeats). */
  verbs: Map<string, string[]>
  flows: { from: string; to: string; kind: FlowKind }[]
}

/** A trace label ('state/actions/masses') → its node id ('state/actions/masses.ts'). */
export function nodeOf(map: ModuleMap, module: string): string | null {
  return [`${module}.ts`, `${module}.tsx`, module].find((id) => map.nodes.some((n) => n.id === id)) ?? null
}

// one activity per (map, event): the log re-reads thousands of events per frame for the heat counts
const cache = new WeakMap<ModuleMap, WeakMap<TraceEvent, Activity>>()
const reachCache = new WeakMap<ModuleMap, Map<string, Set<string>>>()

function engineReach(map: ModuleMap, id: string): Set<string> {
  let byId = reachCache.get(map)
  if (!byId) reachCache.set(map, (byId = new Map()))
  let r = byId.get(id)
  if (!r) byId.set(id, (r = reachable(map, id, 'engine')))
  return r
}

export function activity(e: TraceEvent, map: ModuleMap): Activity {
  let byEvent = cache.get(map)
  if (!byEvent) cache.set(map, (byEvent = new WeakMap()))
  let a = byEvent.get(e)
  if (!a) byEvent.set(e, (a = compute(e, map)))
  return a
}

function compute(e: TraceEvent, map: ModuleMap): Activity {
  const roles = new Map<string, Role>()
  const verbs = new Map<string, string[]>()
  const flows: Activity['flows'] = []
  const ids = new Set(map.nodes.map((n) => n.id))
  const mark = (id: string, role: Role) => {
    const now = roles.get(id)
    if (!now || ROLES.indexOf(role) < ROLES.indexOf(now)) roles.set(id, role)
  }
  const flow = (from: string, to: string, kind: FlowKind) => {
    if (from !== to && !flows.some((f) => f.from === from && f.to === to)) flows.push({ from, to, kind })
  }

  if (ids.has(STORE)) mark(STORE, 'store')
  const origin = e.origin && ids.has(e.origin) ? e.origin : null
  if (origin) {
    mark(origin, 'origin')
    flow(origin, STORE, e.rejected ? 'reject' : 'call')
  }
  for (const c of e.calls) {
    const id = nodeOf(map, c.module)
    if (!id) continue
    const engine = isEngine(id)
    mark(id, engine ? 'engine' : 'verb')
    flow(STORE, id, engine ? 'engine' : 'call')
    const list = verbs.get(id) ?? []
    if (!list.includes(c.name)) verbs.set(id, [...list, c.name])
    for (const r of engineReach(map, id)) mark(r, 'reach')
  }
  for (const n of map.nodes) {
    if (n.reads.some((s) => e.slices.includes(s))) {
      mark(n.id, 'reader')
      flow(STORE, n.id, 'data')
    }
  }
  return { roles, verbs, flows }
}

/** How many events touched each module (any role but `reach`): where the app spends its calls. */
export function heat(events: TraceEvent[], map: ModuleMap): Map<string, number> {
  const out = new Map<string, number>()
  for (const e of events) {
    for (const [id, role] of activity(e, map).roles) if (role !== 'reach') out.set(id, (out.get(id) ?? 0) + 1)
  }
  return out
}
