// A parking lot's entrance attracts a street (Phase SE.6, Decision "Streets follow their lots"): each laid lot's
// entrance is a point among `roadSources`, so the Street tool and a node dragged snap onto it (and there the end
// connects); a lot a general tool moves does not attract with its own.
import { describe, expect, it } from 'vitest'
import type { Point } from '../../../../model/schema.ts'
import { derive } from '../../../../engine/derive.ts'
import { addLot } from '../../../../modules/parking/actions.ts'
import { demoProject } from '../../../../state/demo.ts'
import { DEFAULT_SNAP } from '../kinds.ts'
import { targetsOf } from '../move.ts'
import { resolveSnap } from '../resolve.ts'
import { roadSources } from '../sources.ts'

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)

function withLot() {
  const r = addLot(demoProject({ streets: false }), 'o1', { rect: { center: { x: 200, y: 200 }, width: 30, depth: 20, rotation: 0 } })!
  const derived = derive(r.project, 'o1')
  return { derived, id: r.id, at: derived.circulation.lots.find((l) => l.id === r.id)!.entrance.at }
}

describe('a lot’s entrance as a snap point', () => {
  it('is among the roads’ sources, and a point near it snaps onto it', () => {
    const w = withLot()
    const targets = targetsOf(roadSources(w.derived))
    expect(targets.points.some((q) => dist(q.p, w.at) < 1e-9)).toBe(true)
    const s = resolveSnap({ x: w.at.x + 0.4, y: w.at.y + 0.3 }, { targets, settings: DEFAULT_SNAP, tolPoint: 1.2, tolLine: 0.8, step: 0 })
    expect(dist(s.point, w.at)).toBeLessThan(1e-9)
  })

  it('a lot moved by a general tool does not attract with its own', () => {
    const w = withLot()
    const targets = targetsOf(roadSources(w.derived, new Set([w.id])))
    expect(targets.points.some((q) => dist(q.p, w.at) < 1e-9)).toBe(false)
  })
})
