// The street ends on an existing street, in a project built fresh (Phase PE.2, Chrome C1): the sample and the demo link them as the migration
// (step 19) and settle (rule 4) do, so the first edit of the street carries them along and not only after some edit has linked them.
import { describe, expect, it } from 'vitest'
import { JOIN } from '../../engine/path/ends.ts'
import { distancePointSegment } from '../../engine/geom/polygon.ts'
import type { Point, Project, StreetNode } from '../../model/schema.ts'
import { demoProject } from '../demo.ts'
import { actions } from '../actions/index.ts'
import { sampleProject } from '../sample.ts'
import { settle } from '../settle.ts'

const onLine = (n: Point, pts: Point[]): boolean => pts.slice(1).some((b, k) => distancePointSegment(n, pts[k], b) <= JOIN)
/** Every option's street ends (a node of one segment, linked to no lot) that lie on an existing street's drawn line. */
function ends(p: Project): { option: string; node: StreetNode; road: string }[] {
  const out: { option: string; node: StreetNode; road: string }[] = []
  for (const o of p.options) {
    const s = o.streets
    if (!s) continue
    const degree = new Map<string, number>()
    for (const g of s.segments) for (const n of [g.a, g.b]) degree.set(n, (degree.get(n) ?? 0) + 1)
    for (const n of s.nodes) {
      if (n.lot || degree.get(n.id) !== 1) continue
      const r = (p.site.existingRoads ?? []).find((x) => onLine(n, x.points))
      if (r) out.push({ option: o.id, node: n, road: r.id })
    }
  }
  return out
}
const moved = (p: Project, ids: string[], d: Point): Project => {
  const r = settle(p, actions.moveExistingRoads(p, ids, d))
  if (!('project' in r)) throw new Error(r.refused)
  return r.project
}

describe.each([
  ['the sample', sampleProject],
  ['the demo', () => demoProject()],
])('%s, fresh', (_name, build) => {
  const p = build()
  const on = ends(p)

  it('has street ends on its existing street, and each is linked to it', () => {
    expect(on.length).toBeGreaterThan(0)
    for (const e of on) expect(e.node.road, `${e.option} ${e.node.id}`).toBe(e.road)
  })

  it('moving the existing street carries those ends', () => {
    const q = moved(p, [...new Set(on.map((e) => e.road))], { x: 0, y: 10 })
    for (const e of on) {
      const n = q.options.find((o) => o.id === e.option)!.streets!.nodes.find((x) => x.id === e.node.id)!
      expect(n.y, `${e.option} ${e.node.id}`).toBeCloseTo(e.node.y + 10, 6)
      expect(n.road).toBe(e.road)
    }
  })
})
