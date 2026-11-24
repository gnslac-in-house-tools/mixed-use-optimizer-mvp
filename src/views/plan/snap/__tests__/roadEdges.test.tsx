// A street's edges attract (Decisions "Road snap", "Street edges snap"; the user, 2026-11-05: "A street's edges snap
// too, not only its centre line and its start/end points"): each road's two sides at its width, from the same centreline
// and width the plan strokes, are open lines among `roadSources`: a point slides onto them (nearest, perpendicular)
// and their ends and middles are points. The road dragged attracts with neither its centreline nor its edges. At a bend
// the plan's round join is the paving, so an edge never stands farther than half the width from the centreline: the
// outer side bevelled through the round join, no mitre past it.
import { beforeEach, describe, expect, it } from 'vitest'
import type { Point } from '../../../../model/schema.ts'
import { derive } from '../../../../engine/derive.ts'
import type { Derived, DerivedRoad } from '../../../../engine/types.ts'
import { demoProject } from '../../../../state/demo.ts'
import { emptyHistory } from '../../../../state/history.ts'
import { useApp } from '../../../../state/store.ts'
import { DEFAULT_SNAP } from '../kinds.ts'
import { targetsOf } from '../move.ts'
import { resolveSnap } from '../resolve.ts'
import { useSnapSettings } from '../settings.ts'
import { roadSources } from '../sources.ts'

beforeEach(() => {
  localStorage.clear()
  const p = demoProject()
  useApp.setState({ project: p, derived: derive(p), history: emptyHistory(), level: p.masses[0].levelId, option: p.options[0].id })
  useSnapSettings.setState({ settings: structuredClone(DEFAULT_SNAP) })
})

const roads = () => useApp.getState().derived.circulation.roads.filter((r) => r.points.length >= 2)
const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)

/** A road's longest straight piece: its ends, its unit direction and its left normal. */
function longest(points: Point[]) {
  let best = 0
  for (let i = 1; i < points.length - 1; i++) if (dist(points[i], points[i + 1]) > dist(points[best], points[best + 1])) best = i
  const [a, b] = [points[best], points[best + 1]]
  const l = dist(a, b)
  const u = { x: (b.x - a.x) / l, y: (b.y - a.y) / l }
  return { a, b, l, u, n: { x: -u.y, y: u.x } }
}

describe('a street’s edges', () => {
  it('each road has two among its sources, at half its width either side of its centreline, open and no tracking lines', () => {
    expect(roads().length).toBeGreaterThan(0)
    const sources = roadSources(useApp.getState().derived)
    for (const r of roads()) {
      const { a, n } = longest(r.points)
      const i = r.points.indexOf(a)
      const h = r.width / 2
      // how far a vertex stands left of the piece's line
      const off = (q: Point) => (q.x - a.x) * n.x + (q.y - a.y) * n.y
      for (const side of [1, -1]) {
        // the edge has a piece along it, half the width to that side, within the piece's ends
        const along = (q: Point) => (q.x - a.x) * longest(r.points).u.x + (q.y - a.y) * longest(r.points).u.y
        const within = (q: Point) => along(q) > -1e-6 && along(q) < longest(r.points).l + 1e-6
        const on = (s: (typeof sources)[number]) =>
          s.contour.vertices.some((q, k) => {
            const next = s.contour.vertices[k + 1]
            return !!next && [q, next].every((x) => Math.abs(off(x) - side * h) < 1e-6 && within(x)) && dist(q, next) > 1e-3
          })
        const edge = sources.find((s) => s.label.endsWith('edge') && on(s))
        expect(i).toBeGreaterThanOrEqual(0)
        expect(edge, `${r.id}: its ${side > 0 ? 'left' : 'right'} edge`).toBeDefined()
        expect(edge).toMatchObject({ open: true, track: false })
      }
    }
  })

  it('their ends are points to snap to: the corners of the street’s end', () => {
    const r = roads()[0]
    const [p0, p1] = r.points
    const l = dist(p0, p1)
    const n = { x: -(p1.y - p0.y) / l, y: (p1.x - p0.x) / l }
    const corner = { x: p0.x + (n.x * r.width) / 2, y: p0.y + (n.y * r.width) / 2 }
    const points = targetsOf(roadSources(useApp.getState().derived)).points
    expect(points.some((q) => q.kind === 'endpoint' && dist(q.p, corner) < 1e-6)).toBe(true)
  })

  it('a point near an edge, in the middle of a straight piece, slides onto it', () => {
    const r = roads().reduce((x, y) => (longest(y.points).l > longest(x.points).l ? y : x))
    const { a, l, u, n } = longest(r.points)
    // a third of the way along, 0.3 m outside its left edge (no point of it near)
    const along = l / 3
    const q = { x: a.x + u.x * along + n.x * (r.width / 2 + 0.3), y: a.y + u.y * along + n.y * (r.width / 2 + 0.3) }
    // the roads alone attract: the demo's streets run along the site's edge and its masses' walls
    const targets = targetsOf(roadSources(useApp.getState().derived))
    const s = resolveSnap(q, { targets, settings: DEFAULT_SNAP, tolPoint: 1.2, tolLine: 0.8, step: 0 })
    // on the edge: half the width from the centreline
    const off = (s.point.x - a.x) * n.x + (s.point.y - a.y) * n.y
    expect(off).toBeCloseTo(r.width / 2, 6)
    expect(['nearest', 'perpendicular']).toContain(s.how)
  })

  it('at a bend, a right angle or a sharp one (20° between its pieces), no edge point stands past half the width', () => {
    const h = 3
    const sharp = (20 * Math.PI) / 180
    const bent: Pick<DerivedRoad, 'id' | 'kind' | 'points' | 'width'>[] = [
      { id: 'right', kind: 'street', width: 2 * h, points: [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 50 }] },
      { id: 'sharp', kind: 'existing', width: 2 * h, points: [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50 - 50 * Math.cos(sharp), y: 50 * Math.sin(sharp) }] },
    ]
    for (const r of bent) {
      const derived = { circulation: { roads: [r], gates: [] } } as unknown as Derived
      const edges = roadSources(derived).filter((s) => s.label.endsWith('edge'))
      expect(edges).toHaveLength(2)
      // the nearest point of the centreline
      const fromLine = (q: Point) =>
        Math.min(
          ...r.points.slice(1).map((b, k) => {
            const a = r.points[k]
            const l2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2
            const t = Math.max(0, Math.min(1, ((q.x - a.x) * (b.x - a.x) + (q.y - a.y) * (b.y - a.y)) / l2))
            return dist(q, { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
          }),
        )
      for (const p of targetsOf(edges).points) expect(fromLine(p.p), `${r.id}: ${p.kind} at ${p.p.x}, ${p.p.y}`).toBeLessThanOrEqual(h + 0.001)
      // the outer side still reaches the round join: its bevel's ends half the width from the bend
      const bend = r.points[1]
      expect(edges.some((s) => s.contour.vertices.some((q) => Math.abs(dist(q, bend) - h) < 1e-6))).toBe(true)
    }
  })

  it('the road dragged attracts with neither its centreline nor its edges', () => {
    const r = roads()[0]
    const all = roadSources(useApp.getState().derived)
    const without = roadSources(useApp.getState().derived, r.id)
    expect(all.filter((s) => s.label.endsWith('edge')).length - without.filter((s) => s.label.endsWith('edge')).length).toBe(2)
  })
})
