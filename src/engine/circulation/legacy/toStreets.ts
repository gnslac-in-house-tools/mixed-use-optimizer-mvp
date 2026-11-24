// Old projects keep what they showed (Decision "Streets", ST.4): the roads version 10 derived for each option (its
// rings' sides, the links from courts and gates, the joins; narrowed for cars where no truck took them) drawn once as
// its streets, beside the ones it had: of the type their vehicles take, a width and vehicles of the segment's own
// where they differ from the type's (a derived road was for trucks and cars, and kept its stalls), and its corners
// sharp (a radius of its own, 0). Its ends and corners joined to the network (a link that ended on a ring's side: a
// T). The model's migration calls it (model/migrate.ts, v10 → v11). Pure.
import type { Id, Project, StreetSegment, Streets } from '../../../model/schema.ts'
import { deriveMassing } from '../../derive.ts'
import { deriveGates } from '../access.ts'
import { Draft } from '../draft.ts'
import { gatesOf } from '../gates.ts'
import { standardsOf } from '../standards.ts'
import { existingRoads, streetRoads, streetTypesOf, typeForVehicles } from '../streets.ts'
import { legacyRoads } from './network.ts'
import type { LegacyOption, LegacyRoad } from './types.ts'

const EMPTY: Streets = { nodes: [], segments: [] }

/** Each option's derived roads (as version 10 found them), by option. */
export function derivedRoadsOf(p: Project): Record<Id, LegacyRoad[]> {
  const m = deriveMassing(p)
  const out: Record<Id, LegacyRoad[]> = {}
  for (const o of p.options as LegacyOption[]) {
    const s = standardsOf(p, o)
    const shown = Object.values(m.masses).filter((x) => o.buildingIds.includes(x.buildingId))
    const docks = m.options[o.id].docks.docks
    const gates = deriveGates(m.site.polygon, gatesOf(p, o.id), {}, s.roadWidth)
    const kept = [
      ...existingRoads(p.site, s.laneWidth),
      ...streetRoads(o.streets, streetTypesOf(p, o), s.laneWidth),
    ]
    out[o.id] = legacyRoads({ option: o, shown, docks, gates, kept, site: m.site.polygon, standards: s })
  }
  return out
}

/** The project with each option's derived roads (`roads`: found already) drawn as its streets. */
export function derivedRoadsToStreets(p: Project, roads = derivedRoadsOf(p)): Project {
  let q = p
  for (const o of p.options) {
    const list = roads[o.id] ?? []
    if (!list.length) continue
    const types = streetTypesOf(q, o)
    const d = new Draft(q, o.streets ?? EMPTY)
    const made: Id[] = []
    for (const r of list) {
      const t = typeForVehicles(types, r.vehicles)
      const own: Pick<StreetSegment, 'left' | 'right' | 'vehicles' | 'radius'> = {
        left: r.width / 2,
        right: r.width / 2,
        ...(r.vehicles !== t.vehicles && { vehicles: r.vehicles }),
        // its corners sharp, as they were: rounded with the type's radius, a ring would cut into the courts it passes
        ...(t.radius > 0 && { radius: 0 }),
      }
      const nodes: Id[] = []
      for (const point of r.points) {
        const n = d.node(point)
        if (nodes[nodes.length - 1] !== n) nodes.push(n)
      }
      nodes.slice(1).forEach((n, i) => {
        const id = d.join(nodes[i], n, t.id, own)
        if (id) made.push(id)
      })
    }
    d.knit(new Set(), new Set(made))
    const streets = d.done()
    q = { ...q, options: q.options.map((x) => (x.id === o.id ? { ...x, ...(streets.segments.length && { streets }) } : x)) }
  }
  return q
}
