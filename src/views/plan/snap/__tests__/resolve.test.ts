// Ported from Plaza-Practiko `vistas/planta/iman/__tests__/motor.test.ts` (resolverIman), on the world axes and
// without acquired points or the fixed angle.
import { describe, expect, it } from 'vitest'
import type { Contour, Point } from '../../../../model/schema.ts'
import { contourFromPolygon } from '../../../../engine/geom/contour.ts'
import { DEFAULT_SNAP, type SnapKind, type SnapSettings } from '../kinds.ts'
import { targetsOf } from '../move.ts'
import type { Source } from '../points.ts'
import { resolveSnap, type ResolveInput } from '../resolve.ts'

const p = (x: number, y: number): Point => ({ x, y })
const rectC = (x0: number, y0: number, x1: number, y1: number): Contour =>
  contourFromPolygon([p(x0, y0), p(x1, y0), p(x1, y1), p(x0, y1)])
const box = (x0: number, y0: number, x1: number, y1: number, label: string, centroid = false): Source => ({
  contour: rectC(x0, y0, x1, y1),
  label,
  centroid,
})
const A = box(0, 0, 20, 10, 'A')
const B = box(30, 0, 40, 10, 'B')

function withS(changes: Partial<SnapSettings> = {}, kinds: Partial<Record<SnapKind, boolean>> = {}): SnapSettings {
  return { ...DEFAULT_SNAP, ...changes, kinds: { ...DEFAULT_SNAP.kinds, ...kinds } }
}

function input(sources: Source[], extra: Partial<ResolveInput> = {}): ResolveInput {
  return { targets: targetsOf(sources), settings: DEFAULT_SNAP, tolPoint: 0.6, tolLine: 0.4, step: 1, ...extra }
}

describe('point references', () => {
  it('endpoint: sticks to the corner and says whose it is', () => {
    expect(resolveSnap(p(20.3, 10.2), input([A, B]))).toMatchObject({ point: p(20, 10), how: 'endpoint', mark: { label: 'Endpoint · A' } })
  })

  it('intersection: where the edges of two masses cross', () => {
    const r = resolveSnap(p(15.2, 10.1), input([A, box(15, 4, 25, 14, 'C')]))
    expect(r.how).toBe('intersection')
    expect(r.point.x).toBeCloseTo(15, 9)
    expect(r.point.y).toBeCloseTo(10, 9)
    expect(r.mark?.label).toBe('Intersection · A × C')
  })

  it('a kind switched off does not stick', () => {
    expect(resolveSnap(p(20.3, 10.2), input([A], { settings: withS({}, { endpoint: false }) })).how).not.toBe('endpoint')
  })
})

describe('perpendicular, ortho and tracking', () => {
  it('perpendicular: the foot from the previous corner onto a wall', () => {
    const r = resolveSnap(p(30.2, 4.3), input([B], { base: p(25, 4) }))
    expect(r.how).toBe('perpendicular')
    expect(r.point.x).toBeCloseTo(30, 9)
    expect(r.point.y).toBeCloseTo(4, 9)
  })

  it('ortho: the edge stays horizontal and, along it, the grid decides', () => {
    const r = resolveSnap(p(7.3, 0.6), input([], { base: p(0, 0), settings: withS({ ortho: true }) }))
    expect(r).toMatchObject({ point: p(7, 0), how: 'ortho' })
    expect(r.mark?.lines).toHaveLength(1)
  })

  it('ortho from the corner’s own start: a corner level with its previous corner can still go up', () => {
    // previous corner (0, 0) is level with the dragged one, which starts at (160, 0) and is pulled up 20 m
    const from = { base: p(0, 0), settings: withS({ ortho: true }) }
    expect(resolveSnap(p(163, 20), input([], from)).point).toEqual(p(163, 0)) // from the previous corner: stuck on y = 0
    expect(resolveSnap(p(163, 20), input([], { ...from, orthoFrom: p(160, 0) }))).toMatchObject({ point: p(160, 20), how: 'ortho' })
  })

  it('ortho without a previous corner does nothing', () => {
    expect(resolveSnap(p(7.3, 0.6), input([], { settings: withS({ ortho: true }) })).how).toBe('grid')
  })

  it('ortho meets a tracking line: the extension of B’s wall', () => {
    const r = resolveSnap(p(30.3, 20.4), input([A, B], { base: p(0, 20), settings: withS({ ortho: true }) }))
    expect(r.how).toBe('tracking')
    expect(r.point.x).toBeCloseTo(30, 9)
    expect(r.point.y).toBeCloseTo(20, 9)
    expect(r.mark?.label).toBe('Ortho · wall of B')
  })

  it('tracking: the extension of a wall', () => {
    const r = resolveSnap(p(26.3, 10.2), input([A]))
    expect(r.how).toBe('tracking')
    expect(r.point).toEqual(p(26, 10))
    expect(r.mark?.label).toBe('wall of A')
  })
})

describe('arcs', () => {
  // a 10 m square whose bottom edge is a half circle outwards: centre (5, 0), radius 5
  const half: Source = { contour: { ...rectC(0, 0, 10, 10), arcs: { 0: -1 } }, label: 'Arc' }

  it('nearest: on the arc, at its radius', () => {
    const q = p(5 + 5.2 * Math.SQRT1_2, -5.2 * Math.SQRT1_2)
    const r = resolveSnap(q, input([half], { settings: withS({ align: false }) }))
    expect(r.how).toBe('nearest')
    expect(Math.hypot(r.point.x - 5, r.point.y)).toBeCloseTo(5, 9)
  })

  it('the centre of the arc and its middle', () => {
    expect(resolveSnap(p(5.1, 0.1), input([half])).how).toBe('center')
    const m = resolveSnap(p(5.1, -5.1), input([half]))
    expect(m.how).toBe('midpoint')
    expect(m.point.y).toBeCloseTo(-5, 9)
  })

  it('quadrant: the arc’s point at 0°, only when switched on', () => {
    // a triangle whose long edge bulges out: centre (1.25, 1.25), radius 8.84; its 0° point is (10.09, 1.25)
    const tri: Source = { contour: { ...contourFromPolygon([p(0, 0), p(10, 0), p(0, 10)]), arcs: { 1: -0.5 } }, label: 'T' }
    const q = p(10.1, 1.3)
    expect(resolveSnap(q, input([tri])).how).toBe('nearest')
    const r = resolveSnap(q, input([tri], { settings: withS({}, { quadrant: true }) }))
    expect(r.how).toBe('quadrant')
    expect(r.point.x).toBeCloseTo(1.25 + (14.142135623730951 * 1.25) / 2, 9)
    expect(r.point.y).toBeCloseTo(1.25, 9)
  })
})

describe('what is drawn first (Decision "Snap first to what is drawn")', () => {
  // a street's centreline along y = 0, and a warehouse whose west wall's line is x = 30
  const street = { contour: { vertices: [{ x: 0, y: 0, r: 0 }, { x: 100, y: 0, r: 0 }] }, label: 'street', open: true }
  const warehouse = { contour: { vertices: [{ x: 30, y: 40, r: 0 }, { x: 80, y: 40, r: 0 }, { x: 80, y: 90, r: 0 }, { x: 30, y: 90, r: 0 }] }, label: 'Warehouse 1' }
  const at = (q: { x: number; y: number }) => resolveSnap(q, { targets: targetsOf([street, warehouse]), settings: DEFAULT_SNAP, tolPoint: 2, tolLine: 1, step: 1 })

  it('on a street, it stays on it: a wall’s line nearby does not pull it off', () => {
    // 0.4 m off the street, 1.5 m from the wall's line: on the street
    const r = at({ x: 28.5, y: 0.4 })
    expect(r.how).toBe('nearest')
    expect(r.point.x).toBeCloseTo(28.5, 9)
    expect(r.point.y).toBeCloseTo(0, 9)
  })

  it('on a street, level with the wall: where its line crosses the street', () => {
    const r = at({ x: 30.6, y: 0.3 })
    expect(r.point.x).toBeCloseTo(30, 9)
    expect(r.point.y).toBeCloseTo(0, 9)
    expect(r.mark?.lines?.map((l) => l.label)).toEqual(['wall of Warehouse 1'])
  })
})

describe('what tracks (Decision "Snap first to what is drawn")', () => {
  it('the site’s and the setback’s edges run on as no tracking lines; a mass’s do', () => {
    const edge = { vertices: [{ x: 0, y: 0, r: 0 }, { x: 100, y: 10, r: 0 }, { x: 100, y: 200, r: 0 }, { x: 0, y: 200, r: 0 }] }
    const input = (track?: boolean) => ({ targets: targetsOf([{ contour: edge, label: 'site', ...(track === false && { track }) }]), settings: DEFAULT_SNAP, tolPoint: 2, tolLine: 1, step: 1 })
    // 0.5 m off the line of its south edge, 50 m past its end
    const q = { x: 150, y: 15.5 }
    expect(resolveSnap(q, input()).how).toBe('tracking')
    expect(resolveSnap(q, input(false))).toMatchObject({ how: 'grid', point: { x: 150, y: 16 } })
  })
})

describe('without snap', () => {
  it('snap off: only the grid; grid off too: free', () => {
    expect(resolveSnap(p(20.3, 10.2), input([A], { settings: withS({ on: false }) }))).toMatchObject({ point: p(20, 10), how: 'grid' })
    expect(resolveSnap(p(13.3, 4.6), input([A], { settings: withS({ on: false, grid: false }) }))).toMatchObject({ point: p(13.3, 4.6), how: 'free' })
  })
})
