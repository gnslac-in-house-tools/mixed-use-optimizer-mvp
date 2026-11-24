// A reflection about a line (Phase AS.5, Mirror): a point, a rect, a contour with arcs and rounded corners, holes.
import { describe, expect, it } from 'vitest'
import type { Contour, Footprint, Point } from '../../../model/schema.ts'
import { arcOfEdge, bulgeAt, contourToPolygon } from '../contour.ts'
import { footprintPolygon, rotate } from '../footprint.ts'
import { signedArea } from '../polygon.ts'
import { reflectAngle, reflectContour, reflectFootprint, reflectHoles, reflectPoint, reflectVector } from '../reflect.ts'

const O = { x: 0, y: 0 }
/** A line through the origin at `degrees`: two points on it. */
const line = (degrees: number, through: Point = O): [Point, Point] => {
  const r = (degrees * Math.PI) / 180
  return [through, { x: through.x + 10 * Math.cos(r), y: through.y + 10 * Math.sin(r) }]
}
const near = (a: Point, b: Point, digits = 9) => {
  expect(a.x).toBeCloseTo(b.x, digits)
  expect(a.y).toBeCloseTo(b.y, digits)
}

/** Two polygons are the same shape: the same vertices in the same cyclic order, from whichever vertex. */
function sameShape(a: Point[], b: Point[]) {
  expect(a.length).toBe(b.length)
  const k = b.findIndex((q) => Math.hypot(q.x - a[0].x, q.y - a[0].y) < 1e-6)
  expect(k).toBeGreaterThanOrEqual(0)
  a.forEach((q, i) => near(q, b[(i + k) % b.length], 6))
}

describe('reflectPoint', () => {
  it('goes across the axes and a slanted line, and leaves a point of the line where it is', () => {
    expect(reflectPoint({ x: 3, y: 4 }, { x: 5, y: 0 }, { x: 5, y: 10 })).toEqual({ x: 7, y: 4 })
    expect(reflectPoint({ x: 3, y: 4 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toEqual({ x: 3, y: -4 })
    near(reflectPoint({ x: 3, y: 0 }, ...line(45)), { x: 0, y: 3 })
    const [a, b] = line(30, { x: 2, y: -1 })
    near(reflectPoint(a, a, b), a)
    near(reflectPoint({ x: 4, y: 4 }, a, b), reflectPoint(reflectPoint(reflectPoint({ x: 4, y: 4 }, a, b), a, b), a, b))
  })

  it('twice about one line is the point itself', () => {
    const [a, b] = line(37, { x: 5, y: -3 })
    const q = { x: -8.5, y: 12.25 }
    near(reflectPoint(reflectPoint(q, a, b), a, b), q)
  })

  it('leaves no negative zero', () => {
    expect(Object.is(reflectPoint({ x: 3, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 }).y, 0)).toBe(true)
  })
})

describe('reflectVector and reflectAngle', () => {
  it('a direction is reflected about the line’s direction, without its place', () => {
    near(reflectVector({ x: 1, y: 0 }, ...line(90, { x: 50, y: 50 })), { x: -1, y: 0 })
    near(reflectVector({ x: 1, y: 0 }, ...line(45)), { x: 0, y: 1 })
  })

  it('an angle becomes 2α − angle, kept in 0 … 360', () => {
    expect(reflectAngle(30, ...line(0))).toBeCloseTo(330, 9)
    expect(reflectAngle(30, ...line(90))).toBeCloseTo(150, 9)
    expect(reflectAngle(0, ...line(45))).toBeCloseTo(90, 9)
    expect(reflectAngle(300, ...line(10))).toBeCloseTo(80, 9)
  })
})

describe('reflectFootprint: a rect', () => {
  const rect: Footprint = { kind: 'rect', center: { x: 30, y: 10 }, width: 20, depth: 8, rotation: 25 }
  const tall: Footprint = { kind: 'rect', center: { x: 30, y: 10 }, width: 8, depth: 20, rotation: 25 }
  /** The middle of each side of a rect by its local name: bottom (local y = −depth/2), right, top, left. */
  const sides = (f: Footprint) => {
    if (f.kind !== 'rect') throw new Error('a rect was expected')
    const local = (x: number, y: number) => rotate({ x: f.center.x + x, y: f.center.y + y }, f.center, f.rotation)
    return { bottom: local(0, -f.depth / 2), right: local(f.width / 2, 0), top: local(0, f.depth / 2), left: local(-f.width / 2, 0) }
  }

  it.each([0, 30, 45, 90, 135, 200])('its centre is reflected, its size kept, its rotation 2α − rotation + 180 for a wide one (line at %i°)', (alpha) => {
    const [a, b] = line(alpha, { x: 4, y: 7 })
    const r = reflectFootprint(rect, a, b)
    if (r.kind !== 'rect' || rect.kind !== 'rect') throw new Error('a rect was expected')
    near(r.center, reflectPoint(rect.center, a, b))
    expect(r.width).toBe(20)
    expect(r.depth).toBe(8)
    expect(r.rotation).toBeCloseTo((((2 * alpha - 25 + 180) % 360) + 360) % 360, 9)
  })

  it.each([0, 30, 45, 90, 135, 200])('a wide rect keeps its bottom and its top: left and right swap (line at %i°)', (alpha) => {
    const [a, b] = line(alpha, { x: 4, y: 7 })
    const was = sides(rect)
    const now = sides(reflectFootprint(rect, a, b))
    near(now.bottom, reflectPoint(was.bottom, a, b))
    near(now.top, reflectPoint(was.top, a, b))
    near(now.right, reflectPoint(was.left, a, b))
    near(now.left, reflectPoint(was.right, a, b))
  })

  it.each([0, 30, 45, 90, 135, 200])('a tall rect keeps its right and its left, where its front is: bottom and top swap (line at %i°)', (alpha) => {
    const [a, b] = line(alpha, { x: 4, y: 7 })
    const was = sides(tall)
    const now = sides(reflectFootprint(tall, a, b))
    near(now.right, reflectPoint(was.right, a, b))
    near(now.left, reflectPoint(was.left, a, b))
    near(now.bottom, reflectPoint(was.top, a, b))
    near(now.top, reflectPoint(was.bottom, a, b))
  })

  it('its corners are the reflection of the corners, as a set', () => {
    const [a, b] = line(33, { x: 4, y: 7 })
    for (const f of [rect, tall]) {
      const was = footprintPolygon(f)
      const now = footprintPolygon(reflectFootprint(f, a, b))
      expect(signedArea(now)).toBeGreaterThan(0)
      sameShape(now, was.map((q) => reflectPoint(q, a, b)).reverse())
    }
  })

  it('twice about one line is what it was', () => {
    const [a, b] = line(33, { x: 4, y: 7 })
    for (const f of [rect, tall]) {
      const back = reflectFootprint(reflectFootprint(f, a, b), a, b)
      if (back.kind !== 'rect') throw new Error('a rect was expected')
      near(back.center, { x: 30, y: 10 })
      expect(back.rotation).toBeCloseTo(25, 9)
      sameShape(footprintPolygon(back), footprintPolygon(f))
    }
  })
})

/** An L with a rounded corner and an outward arc on its lower edge, and a hollow arc on the right. */
const curved: Contour = {
  vertices: [
    { x: 0, y: 0, r: 0 },
    { x: 20, y: 0, r: 0 },
    { x: 20, y: 10, r: 2 },
    { x: 10, y: 10, r: 0 },
    { x: 10, y: 20, r: 0 },
    { x: 0, y: 20, r: 0 },
  ],
  arcs: { '0': -0.5, '4': 0.3 },
}

describe('reflectContour', () => {
  const [a, b] = line(20, { x: 3, y: -2 })
  const was = curved
  const now = reflectContour(curved, a, b)

  it('is counter-clockwise after, with the same number of vertices and each corner radius on its own corner', () => {
    expect(signedArea(contourToPolygon(now))).toBeGreaterThan(0)
    expect(now.vertices).toHaveLength(6)
    const at = (c: Contour, p: Point) => c.vertices.find((v) => Math.hypot(v.x - p.x, v.y - p.y) < 1e-9)
    for (const v of was.vertices) expect(at(now, reflectPoint(v, a, b))?.r).toBe(v.r)
  })

  it('the arcs bulge the same way seen in the mirror: a point on each arc is the reflection of a point on the old one', () => {
    const polyWas = contourToPolygon(was, 0.001)
    const polyNow = contourToPolygon(now, 0.001)
    // every point of the old outline, reflected, is on the new outline (within the chord tolerance)
    const dist = (q: Point, poly: Point[]) =>
      Math.min(
        ...poly.map((p, i) => {
          const r = poly[(i + 1) % poly.length]
          const dx = r.x - p.x
          const dy = r.y - p.y
          const t = Math.max(0, Math.min(1, ((q.x - p.x) * dx + (q.y - p.y) * dy) / (dx * dx + dy * dy || 1)))
          return Math.hypot(p.x + t * dx - q.x, p.y + t * dy - q.y)
        }),
      )
    for (const q of polyWas) expect(dist(reflectPoint(q, a, b), polyNow)).toBeLessThan(2e-3)
    expect(Math.abs(signedArea(polyNow))).toBeCloseTo(Math.abs(signedArea(polyWas)), 2)
  })

  it('an arc’s bulge is re-indexed to its edge in the new order, its value kept (the sign changes with the hand and again with the order)', () => {
    // old edge 0 (vertex 0 → 1) is now the edge between the reflections of vertices 1 and 0: the last-but-one, n − 2 − 0 = 4
    expect(bulgeAt(now, 4)).toBeCloseTo(-0.5, 12)
    // old edge 4 (vertex 4 → 5) is now edge 6 − 2 − 4 = 0
    expect(bulgeAt(now, 0)).toBeCloseTo(0.3, 12)
    // the arc of the old edge 0 bulged outwards; the new one does too: its middle is outside the chord's side the shape is not on
    const mid = (c: Contour, i: number) => {
      const p = c.vertices[i]
      const q = c.vertices[(i + 1) % c.vertices.length]
      const { center, radius, sweep } = arcOfEdge(p, q, bulgeAt(c, i))
      const a0 = Math.atan2(p.y - center.y, p.x - center.x)
      return { x: center.x + radius * Math.cos(a0 + sweep / 2), y: center.y + radius * Math.sin(a0 + sweep / 2) }
    }
    near(mid(now, 4), reflectPoint(mid(was, 0), a, b), 7)
    near(mid(now, 0), reflectPoint(mid(was, 4), a, b), 7)
  })

  it('twice about one line is what it was (the vertex order too)', () => {
    const back = reflectContour(now, a, b)
    expect(back.vertices).toHaveLength(6)
    back.vertices.forEach((v, i) => {
      near(v, was.vertices[i], 9)
      expect(v.r).toBe(was.vertices[i].r)
    })
    expect(bulgeAt(back, 0)).toBeCloseTo(-0.5, 12)
    expect(bulgeAt(back, 4)).toBeCloseTo(0.3, 12)
    sameShape(contourToPolygon(back), contourToPolygon(was))
  })

  it.each([0, 1, 2, 3, 4, 5])('started at old edge %i: it is the new first edge, and the arcs and radii stay on their edges and corners', (k) => {
    const r = reflectContour(was, a, b, k)
    const n = was.vertices.length
    const image = (i: number) => reflectPoint(was.vertices[((i % n) + n) % n], a, b)
    expect(r.vertices).toHaveLength(n)
    expect(signedArea(contourToPolygon(r))).toBeGreaterThan(0)
    // the edges come in the mirror of their old order: the old edge k first, then k − 1, k − 2 …
    r.vertices.forEach((v, j) => {
      near(v, image(k + 1 - j), 9)
      expect(v.r).toBe(was.vertices[(((k + 1 - j) % n) + n) % n].r)
    })
    // an arc: edge i of the old outline is the new edge j whose ends are the images of vertices i + 1 and i; the bulge's value kept, its middle the reflection of the old middle
    const mid = (c: Contour, i: number) => {
      const p = c.vertices[i]
      const q = c.vertices[(i + 1) % n]
      const { center, radius, sweep } = arcOfEdge(p, q, bulgeAt(c, i))
      const a0 = Math.atan2(p.y - center.y, p.x - center.x)
      return { x: center.x + radius * Math.cos(a0 + sweep / 2), y: center.y + radius * Math.sin(a0 + sweep / 2) }
    }
    for (const i of [0, 4]) {
      const j = (((k - i) % n) + n) % n
      expect(bulgeAt(r, j)).toBeCloseTo(bulgeAt(was, i), 12)
      near(mid(r, j), reflectPoint(mid(was, i), a, b), 7)
    }
    // no other edge is an arc
    expect(r.vertices.filter((_, j) => bulgeAt(r, j) !== 0)).toHaveLength(2)
  })

  it('started or not, the outline is the same shape; twice about one line with the start of the first edge it is the same shape again', () => {
    const [p, q] = [reflectContour(was, a, b), reflectContour(was, a, b, 3)]
    sameShape(contourToPolygon(p), contourToPolygon(q))
    const back = reflectContour(q, a, b, 2)
    sameShape(contourToPolygon(back), contourToPolygon(was))
    expect(back.vertices.filter((_, j) => bulgeAt(back, j) !== 0)).toHaveLength(2)
  })

  it('a start that is no edge of the outline is the plain reflection', () => {
    expect(reflectContour(was, a, b, 6)).toEqual(now)
    expect(reflectContour(was, a, b, -1)).toEqual(now)
    expect(reflectContour(was, a, b, 1.5)).toEqual(now)
  })

  it('a straight contour has no arcs after', () => {
    const square: Contour = { vertices: [{ x: 0, y: 0, r: 0 }, { x: 4, y: 0, r: 0 }, { x: 4, y: 4, r: 0 }, { x: 0, y: 4, r: 0 }] }
    expect(reflectContour(square, ...line(90, { x: 10, y: 0 })).arcs).toBeUndefined()
  })

  it('a contour footprint reflects the same way', () => {
    const r = reflectFootprint({ kind: 'contour', contour: curved }, a, b)
    expect(r).toEqual({ kind: 'contour', contour: now })
  })
})

describe('reflectHoles', () => {
  it('reflects each hole, counter-clockwise like any contour, keeping what else it carries', () => {
    const hole = { vertices: [{ x: 2, y: 2, r: 0 }, { x: 6, y: 2, r: 0 }, { x: 6, y: 5, r: 0 }, { x: 2, y: 5, r: 0 }], arcs: { '0': -0.2 }, corridor: 3 }
    const [a, b] = line(90, { x: 0, y: 0 })
    const [r] = reflectHoles([hole], a, b)
    expect(r.corridor).toBe(3)
    expect(signedArea(contourToPolygon(r))).toBeGreaterThan(0)
    expect(Math.abs(signedArea(contourToPolygon(r)))).toBeCloseTo(Math.abs(signedArea(contourToPolygon(hole))), 6)
    const back = reflectHoles([r], a, b)[0]
    sameShape(contourToPolygon(back), contourToPolygon(hole))
    expect(back.corridor).toBe(3)
  })

  it('no holes, none', () => {
    expect(reflectHoles([], ...line(0))).toEqual([])
  })
})
