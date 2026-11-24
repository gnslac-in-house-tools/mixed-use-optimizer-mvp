// Moving, turning and locking an imported drawing (Phase DM.1, Decision "Drawings move"): its layers and its parcels,
// baked into the points; the boundary, the ground and the roads stay where they are.
import { describe, expect, it } from 'vitest'
import type { Contour, Parcel, Project, SiteDrawing } from '../../model/schema.ts'
import { LOCKED, moveDrawings, setDrawingLayerLocked, setDrawingSplit, setParcelsLocked, stayedLocked, turnDrawings } from '../actions/drawings.ts'
import { callTool } from '../../api/tools/index.ts'
import { importSiteFile } from '../actions/site.ts'
import { demoProject } from '../demo.ts'

const sq = (x: number, y: number, s: number): Contour => ({
  vertices: [
    { x, y, r: 0 },
    { x: x + s, y, r: 0 },
    { x: x + s, y: y + s, r: 0 },
    { x, y: y + s, r: 0 },
  ],
  arcs: { '1': 0.25 },
})
const line = (...xy: number[]) => ({ points: xy.map((v, i) => (i % 2 === 0 ? { x: v, y: xy[i + 1] } : null)).filter((q) => q !== null) })
const drawing: SiteDrawing = {
  file: 'a.dxf',
  layers: [
    { name: 'Walls', color: 3, lines: [line(1, 0, 5, 0), { points: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }], closed: true }] },
    { name: 'Axes', lines: [line(0, 2, 8, 2)] },
  ],
}
const parcels: Parcel[] = [
  { name: 'P1', contour: sq(10, 10, 5), file: 'a.dxf' },
  { name: 'P2', contour: sq(20, 10, 5), file: 'a.dxf' },
  { name: 'P1', contour: sq(30, 30, 5), file: 'b.dxf' },
]
const base = (): Project => {
  const p = demoProject()
  return { ...p, site: { ...p.site, drawings: [drawing], parcels } }
}
const D = { x: 10, y: 5 }
const layer = (p: Project, name: string) => p.site.drawings![0].layers.find((l) => l.name === name)!
const parcel = (p: Project, file: string, name: string) => p.site.parcels!.find((x) => x.file === file && x.name === name)!
const ground = (p: Project) => [p.site.boundary, p.site.terrain, p.site.existingRoads]

describe('moving a drawing', () => {
  it('a whole drawing moves its layers; its parcels stay while locked, and it says so', () => {
    const p = base()
    const r = moveDrawings(p, [{ file: 'a.dxf' }], D)
    expect(layer(r.project, 'Walls').lines[0].points).toEqual([{ x: 11, y: 5 }, { x: 15, y: 5 }])
    expect(layer(r.project, 'Walls').lines[1]).toEqual({ points: [{ x: 10, y: 5 }, { x: 14, y: 5 }, { x: 14, y: 9 }], closed: true })
    expect(layer(r.project, 'Axes').lines[0].points).toEqual([{ x: 10, y: 7 }, { x: 18, y: 7 }])
    expect(layer(r.project, 'Walls').color).toBe(3)
    expect(r.project.site.parcels).toEqual(p.site.parcels)
    expect(r.skipped).toEqual(['1 layer stayed: locked'])
    expect(ground(r.project)).toEqual(ground(p))
  })

  it('unlocked parcels move with their file, and only theirs', () => {
    const p = setParcelsLocked(base(), 'a.dxf', false)
    const r = moveDrawings(p, [{ file: 'a.dxf' }], D)
    expect(r.skipped).toEqual([])
    const p1 = parcel(r.project, 'a.dxf', 'P1')
    expect(p1.contour.vertices.map((v) => [v.x, v.y])).toEqual([[20, 15], [25, 15], [25, 20], [20, 20]])
    expect(p1.contour.arcs).toEqual({ '1': 0.25 })
    expect(parcel(r.project, 'a.dxf', 'P2').contour.vertices.map((v) => [v.x, v.y])).toEqual([[30, 15], [35, 15], [35, 20], [30, 20]])
    expect(parcel(r.project, 'b.dxf', 'P1')).toEqual(parcel(p, 'b.dxf', 'P1'))
  })

  it('a locked layer stays, and the whole move counts it with the parcels', () => {
    const p = setDrawingLayerLocked(base(), 'a.dxf', 'Axes', true)
    const r = moveDrawings(p, [{ file: 'a.dxf' }], D)
    expect(layer(r.project, 'Axes')).toEqual(layer(p, 'Axes'))
    expect(layer(r.project, 'Walls').lines[0].points[0]).toEqual({ x: 11, y: 5 })
    expect(r.skipped).toEqual([stayedLocked(2)])
    expect(stayedLocked(1)).toBe('1 layer stayed: locked')
    expect(stayedLocked(2)).toBe('2 layers stayed: locked')
  })

  it('a locked layer asked for by name does not move and says to unlock it', () => {
    const p = setDrawingLayerLocked(base(), 'a.dxf', 'Axes', true)
    const r = moveDrawings(p, [{ file: 'a.dxf', layer: 'Axes' }], D)
    expect(r.project).toBe(p)
    expect(r.skipped).toEqual([LOCKED])
    expect(LOCKED).toBe('Locked: unlock it in Layers')
    const parcelsAsked = moveDrawings(base(), [{ file: 'a.dxf', parcels: true }], D)
    expect(parcelsAsked.skipped).toEqual([LOCKED])
  })

  it('a layer named inside a whole drawing moves once', () => {
    const r = moveDrawings(base(), [{ file: 'a.dxf' }, { file: 'a.dxf', layer: 'Walls' }], D)
    expect(layer(r.project, 'Walls').lines[0].points[0]).toEqual({ x: 11, y: 5 })
  })

  it('one layer, by itself, leaves the others', () => {
    const p = base()
    const r = moveDrawings(p, [{ file: 'a.dxf', layer: 'Axes' }, { file: 'a.dxf', parcels: true }], D)
    expect(layer(r.project, 'Axes').lines[0].points[0]).toEqual({ x: 10, y: 7 })
    expect(layer(r.project, 'Walls')).toEqual(layer(p, 'Walls'))
    expect(r.skipped).toEqual([LOCKED])
  })

  it('by nothing, or by what is no number, leaves the project itself', () => {
    const p = setParcelsLocked(base(), 'a.dxf', false)
    expect(moveDrawings(p, [{ file: 'a.dxf' }], { x: 0, y: 0 })).toEqual({ project: p, skipped: [] })
    expect(moveDrawings(p, [{ file: 'a.dxf' }], { x: 0, y: 0 }).project).toBe(p)
    expect(moveDrawings(p, [{ file: 'a.dxf' }], { x: NaN, y: 1 }).project).toBe(p)
  })

  it('a layer or a file that is not there changes nothing', () => {
    const p = base()
    expect(moveDrawings(p, [{ file: 'a.dxf', layer: 'Nope' }, { file: 'c.dxf' }], D)).toEqual({ project: p, skipped: [] })
  })
})

describe('turning a drawing', () => {
  it('turns about the pivot, a quarter turn takes (1, 0) to (0, 1)', () => {
    const r = turnDrawings(base(), [{ file: 'a.dxf' }], { x: 0, y: 0 }, 90)
    const q = layer(r.project, 'Walls').lines[0].points[0]
    expect(q.x).toBeCloseTo(0, 9)
    expect(q.y).toBeCloseTo(1, 9)
    expect(r.skipped).toEqual([stayedLocked(1)])
  })

  it('by no degrees, or by what is no number, leaves the project itself', () => {
    const p = base()
    expect(turnDrawings(p, [{ file: 'a.dxf' }], { x: 0, y: 0 }, 0)).toEqual({ project: p, skipped: [] })
    expect(turnDrawings(p, [{ file: 'a.dxf' }], { x: 0, y: 0 }, 0).project).toBe(p)
    expect(turnDrawings(p, [{ file: 'a.dxf' }], { x: 0, y: 0 }, NaN).project).toBe(p)
  })

  it('turns the unlocked parcels about it, the arcs as they were', () => {
    const p = setParcelsLocked(base(), 'a.dxf', false)
    const r = turnDrawings(p, [{ file: 'a.dxf' }], { x: 0, y: 0 }, 90)
    const v = parcel(r.project, 'a.dxf', 'P1').contour
    expect(v.vertices[0].x).toBeCloseTo(-10, 9)
    expect(v.vertices[0].y).toBeCloseTo(10, 9)
    expect(v.arcs).toEqual({ '1': 0.25 })
    expect(parcel(r.project, 'b.dxf', 'P1')).toEqual(parcel(p, 'b.dxf', 'P1'))
  })
})

describe('the locks and the separation', () => {
  it('split is set and taken away', () => {
    const p = base()
    const s = setDrawingSplit(p, 'a.dxf', true)
    expect(s.site.drawings![0].split).toBe(true)
    expect(setDrawingSplit(s, 'a.dxf', true)).toBe(s)
    const j = setDrawingSplit(s, 'a.dxf', false)
    expect('split' in j.site.drawings![0]).toBe(false)
    expect(setDrawingSplit(p, 'a.dxf', false)).toBe(p)
    expect(setDrawingSplit(p, 'c.dxf', true)).toBe(p)
  })

  it('a layer’s lock is written and removed; no change returns the project', () => {
    const p = base()
    const l = setDrawingLayerLocked(p, 'a.dxf', 'Axes', true)
    expect(layer(l, 'Axes').locked).toBe(true)
    expect(layer(l, 'Walls').locked).toBeUndefined()
    expect(setDrawingLayerLocked(l, 'a.dxf', 'Axes', true)).toBe(l)
    const u = setDrawingLayerLocked(l, 'a.dxf', 'Axes', false)
    expect('locked' in layer(u, 'Axes')).toBe(false)
    expect(setDrawingLayerLocked(p, 'a.dxf', 'Axes', false)).toBe(p)
    expect(setDrawingLayerLocked(p, 'a.dxf', 'Nope', true)).toBe(p)
  })

  it('the parcels’ lock is that file’s alone: unlocked is written, locking takes it away', () => {
    const p = base()
    const u = setParcelsLocked(p, 'a.dxf', false)
    expect(u.site.parcels!.filter((x) => x.unlocked).map((x) => [x.file, x.name])).toEqual([['a.dxf', 'P1'], ['a.dxf', 'P2']])
    expect(setParcelsLocked(u, 'a.dxf', false)).toBe(u)
    const l = setParcelsLocked(u, 'a.dxf', true)
    expect(l.site.parcels!.some((x) => 'unlocked' in x)).toBe(false)
    expect(setParcelsLocked(p, 'a.dxf', true)).toBe(p)
    expect(setParcelsLocked(p, 'c.dxf', false)).toBe(p)
  })
})

describe('importing a moved drawing again', () => {
  it('brings the file’s points back, with the fields of the imported drawing', () => {
    let p = setDrawingSplit(setDrawingLayerLocked(setParcelsLocked(base(), 'a.dxf', false), 'a.dxf', 'Axes', true), 'a.dxf', true)
    p = moveDrawings(p, [{ file: 'a.dxf' }], D).project
    const again = importSiteFile(p, { name: 'a.dxf', drawing, parcels: parcels.filter((x) => x.file === 'a.dxf') })
    expect(again.site.drawings).toEqual([drawing])
    expect(again.site.drawings![0].split).toBeUndefined()
    expect(layer(again, 'Axes').locked).toBeUndefined()
    expect(again.site.parcels!.some((x) => x.unlocked)).toBe(false)
  })
})

describe('a project without drawings', () => {
  it('every verb returns it as it is', () => {
    const p = demoProject()
    expect(moveDrawings(p, [{ file: 'a.dxf' }], D)).toEqual({ project: p, skipped: [] })
    expect(turnDrawings(p, [{ file: 'a.dxf' }], { x: 0, y: 0 }, 45)).toEqual({ project: p, skipped: [] })
    expect(setDrawingLayerLocked(p, 'a.dxf', 'Axes', true)).toBe(p)
    expect(setParcelsLocked(p, 'a.dxf', false)).toBe(p)
    expect(setDrawingSplit(p, 'a.dxf', true)).toBe(p)
  })
})

describe('the agent’s tools', () => {
  it('moves a drawing and says what stayed; a locked layer asked for alone is why nothing moved', () => {
    const r = callTool(base(), 'moveDrawings', { parts: [{ file: 'a.dxf' }], dx: 10, dy: 5 })
    expect(r.ok && r.changed).toBe(true)
    expect(r.ok && r.output).toEqual({ done: true, skipped: ['1 layer stayed: locked'] })
    const locked = callTool(base(), 'setDrawingLayerLocked', { file: 'a.dxf', layer: 'Axes', locked: true })
    const refused = locked.ok ? callTool(locked.project, 'moveDrawings', { parts: [{ file: 'a.dxf', layer: 'Axes' }], dx: 1, dy: 0 }) : locked
    expect(refused.ok).toBe(false)
    expect(!refused.ok && refused.error).toContain(LOCKED)
    expect(callTool(base(), 'turnDrawings', { parts: [{ file: 'nope.dxf' }], x: 0, y: 0, degrees: 90 }).ok).toBe(false)
  })

  it('getSite and getProject list the drawings by file: layers with their lines and lock, split, parcels with their lock', () => {
    const p = setDrawingSplit(setDrawingLayerLocked(setParcelsLocked(base(), 'a.dxf', false), 'a.dxf', 'Axes', true), 'a.dxf', true)
    const want = [
      {
        file: 'a.dxf',
        split: true,
        layers: [
          { name: 'Walls', lines: 2, locked: false },
          { name: 'Axes', lines: 1, locked: true },
        ],
        parcels: [
          { name: 'P1', locked: false },
          { name: 'P2', locked: false },
        ],
      },
      // a file that brought parcels alone
      { file: 'b.dxf', split: false, layers: [], parcels: [{ name: 'P1', locked: true }] },
    ]
    for (const name of ['getSite', 'getProject']) {
      const r = callTool(p, name, {})
      expect(r.ok && (r.output as { drawings: unknown }).drawings, name).toEqual(want)
    }
  })

  it('a part, a layer or a file’s parcels that are not there: an error that lists what there is, nothing moved', () => {
    const tried = [
      callTool(base(), 'moveDrawings', { parts: [{ file: 'a.dxf', layer: 'Nope' }], dx: 1, dy: 0 }),
      callTool(base(), 'turnDrawings', { parts: [{ file: 'a.dxf' }, { file: 'a.dxf', layer: 'Nope' }], x: 0, y: 0, degrees: 90 }),
      callTool(base(), 'setDrawingLayerLocked', { file: 'a.dxf', layer: 'Nope', locked: true }),
    ]
    for (const r of tried) {
      expect(r.ok).toBe(false)
      expect(!r.ok && r.error).toContain('No layer "Nope" in "a.dxf". There are: Walls, Axes.')
    }
    const noParcels = { ...base(), site: { ...base().site, drawings: [drawing, { file: 'c.dxf', layers: [{ name: 'Trees', lines: [line(0, 0, 1, 0)] }] }] } }
    for (const r of [
      callTool(noParcels, 'moveDrawings', { parts: [{ file: 'c.dxf', parcels: true }], dx: 1, dy: 0 }),
      callTool(noParcels, 'setParcelsLocked', { file: 'c.dxf', locked: false }),
    ]) {
      expect(r.ok).toBe(false)
      expect(!r.ok && r.error).toContain('"c.dxf" brought no parcels.')
    }
    const split = callTool(base(), 'setDrawingSplit', { file: 'b.dxf', split: true })
    expect(!split.ok && split.error).toContain('"b.dxf" has no layers, only parcels.')
    const file = callTool(base(), 'setDrawingLayerLocked', { file: 'nope.dxf', layer: 'Walls', locked: true })
    expect(!file.ok && file.error).toContain('No imported drawing "nope.dxf". There are: a.dxf, b.dxf.')
  })
})
