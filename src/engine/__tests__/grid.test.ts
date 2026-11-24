// The structural grid (Phase G.1, Decisions "Structural grid", "Grid layout"): the grid an option stands on (its own,
// else the project's), its frame, its lines and their names (A, B… without I or O; 1, 2…; end bays A1, E1 and 1.1),
// counted from the first line over the site; a mass on its modules; a building's bays and end bays, derived from its
// masses; a new grid fitted to the site; always one (Decision "Grid always"); the verbs.
import { describe, expect, it } from 'vitest'
import { ProjectSchema, type Grid, type Polygon, type Project } from '../../model/schema.ts'
import { readGft, writeGft } from '../../io/gft.ts'
import { ownGrid, setGrid, sharedGrid, updateGrid } from '../../state/actions/grid.ts'
import { addOption } from '../../state/actions/buildings.ts'
import { setBoundary } from '../../state/actions/site.ts'
import { demoProject } from '../../state/demo.ts'
import { ensureGrid, gridSizeOf, newProject } from '../../typologies/index.ts'
import { buildingBays, endName, fitGrid, gridLines, gridOf, lineName, moduleOf, nameBase, onGrid, refitGrids, snapToModules, toGrid, toPlan, withGrid } from '../grid/index.ts'

const grid = (patch: Partial<Grid> = {}): Grid => ({ x: 12, y: 12, modules: 4, origin: { x: 0, y: 0 }, angle: 0, ...patch })
const box = (x0: number, y0: number, x1: number, y1: number): Polygon => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
]

describe('the grid', () => {
  it('its frame: a point there and back, at an angle', () => {
    const g = grid({ origin: { x: 100, y: 50 }, angle: 30 })
    const q = toGrid(g, { x: 130, y: 90 })
    const p = toPlan(g, q)
    expect(p.x).toBeCloseTo(130, 9)
    expect(p.y).toBeCloseTo(90, 9)
    // 12 m along its x lands 12 m away at 30°
    const a = toPlan(g, { x: 12, y: 0 })
    expect([a.x, a.y].map((v) => Math.round(v * 1e6) / 1e6)).toEqual([100 + 12 * Math.cos(Math.PI / 6), 56].map((v) => Math.round(v * 1e6) / 1e6))
    expect(moduleOf(g)).toEqual({ x: 3, y: 3 })
  })

  it('names: letters along x without I or O, then AA; numbers along y; the end bays as the user writes them', () => {
    expect([0, 7, 8, 12, 13, 23, 24, 25].map((k) => lineName('x', k))).toEqual(['A', 'H', 'J', 'N', 'P', 'Z', 'AA', 'AB'])
    expect([0, 1, 9].map((k) => lineName('y', k))).toEqual(['1', '2', '10'])
    expect([endName('x', 0), endName('x', 4), endName('y', 0), endName('y', 4)]).toEqual(['A1', 'E1', '1.1', '5.1'])
  })

  it('its lines across the site, named from the first one over it; the modules between them', () => {
    const site = box(-5, -5, 50, 26)
    const g = grid()
    const base = nameBase(g, site)
    // the line at 0 is the first over the site: A, 1
    expect(base).toEqual({ x: 0, y: 0 })
    const lines = gridLines(g, site, base)
    expect(lines.filter((l) => l.axis === 'x').map((l) => l.name)).toEqual(['A', 'B', 'C', 'D', 'E'])
    expect(lines.filter((l) => l.axis === 'y').map((l) => l.name)).toEqual(['1', '2', '3'])
    // the origin moved a little: the same names
    const moved = grid({ origin: { x: 2, y: 1 } })
    expect(gridLines(moved, site, nameBase(moved, site)).filter((l) => l.axis === 'x')[0].name).toBe('A')
    // a module every 3 m between the bay lines: 3 per bay, from −3 to 48 along x
    const modules = gridLines(g, site, base, { modules: true }).filter((l) => !l.name)
    expect(modules.filter((l) => l.axis === 'x').map((l) => l.k)).toEqual([-1, 1, 2, 3, 5, 6, 7, 9, 10, 11, 13, 14, 15])
  })

  it('a mass on the grid: along its axes, every corner on a module line; snapped to the nearest module node', () => {
    const g = grid()
    expect(onGrid(g, box(-6, 0, 48, 30))).toBe(true)
    expect(onGrid(g, box(-5, 0, 48, 30))).toBe(false)
    // turned with the grid, still on it
    const t = grid({ origin: { x: 100, y: 50 }, angle: 30 })
    expect(onGrid(t, box(0, 0, 24, 9).map((p) => toPlan(t, p)))).toBe(true)
    expect(onGrid(t, box(100, 50, 124, 59))).toBe(false)
    const s = snapToModules(t, toPlan(t, { x: 4.4, y: 7.6 }))
    const q = toGrid(t, s)
    expect([q.x, q.y].map((v) => Math.round(v * 1e9) / 1e9)).toEqual([3, 9])
  })

  it('a building’s bays and end bays, from its masses; those off the grid named', () => {
    const g = grid()
    const b = buildingBays(g, { x: 0, y: 0 }, [
      { id: 'w', polygon: box(-6, 0, 48, 30) },
      { id: 'o', polygon: box(10, 30, 20, 34) },
    ])!
    expect(b.x).toMatchObject({ first: 0, last: 4, bays: 4, start: 6, end: 0, from: 'A1', to: 'E' })
    expect(b.y).toMatchObject({ first: 0, last: 2, bays: 2, start: 0, end: 10, from: '1', to: '3.1' })
    // the office's corners at 10 and 20 are off the 3 m modules
    expect(b.off).toEqual(['o'])
    // named from the site's first line: one bay before, so the first line inside is B
    expect(buildingBays(g, { x: -1, y: 0 }, [{ id: 'w', polygon: box(-6, 0, 48, 30) }])!.x).toMatchObject({ from: 'B1', to: 'F' })
    // narrower than a bay, no line inside
    expect(buildingBays(g, { x: 0, y: 0 }, [{ id: 'k', polygon: box(3, 3, 9, 9) }])!.x).toMatchObject({ first: null, bays: 0, start: 6, from: '—' })
    expect(buildingBays(g, { x: 0, y: 0 }, [])).toBeNull()
  })

  it('a new grid fitted to the site: along its main axis, its first lines on the setback', () => {
    const p = demoProject()
    const g = fitGrid(p, { x: 12, y: 12, modules: 4 })
    // the demo faces its street along the south side: the grid is square to the plan
    expect(g.angle).toBe(0)
    expect(g.origin.y).toBeCloseTo(10, 1)
    expect(g.origin.x).toBeGreaterThan(10)
    expect(g.origin.x).toBeLessThan(12)
    expect(fitGrid({ ...p, site: { ...p.site, boundary: null } }, { x: 9, y: 9, modules: 3 })).toEqual({ x: 9, y: 9, modules: 3, origin: { x: 0, y: 0 }, angle: 0 })
  })
})

describe('always a grid (Decision "Grid always")', () => {
  it('a new project has its typology’s at the plan’s origin; the demo’s is fitted to its site', () => {
    expect(newProject('industrial').grid).toEqual({ ...gridSizeOf('industrial'), origin: { x: 0, y: 0 }, angle: 0 })
    expect(newProject('blank').grid).toMatchObject({ x: 12, y: 12, modules: 4 })
    const p = demoProject()
    expect(gridOf(p, 'o1')).toEqual(fitGrid(p, gridSizeOf('industrial')))
  })

  it('a project without one gets its typology’s, fitted to its site (withGrid, ensureGrid); one with a grid keeps it', () => {
    const { grid: _, ...bare } = demoProject()
    expect(gridOf(bare, 'o1')).toBeNull()
    const p = ensureGrid(bare)
    expect(p.grid).toEqual(fitGrid(bare, gridSizeOf('industrial')))
    expect(ensureGrid(p)).toBe(p)
    expect(withGrid(bare, { x: 9, y: 9, modules: 3 }).grid).toMatchObject({ x: 9, y: 9, modules: 3 })
  })

  it('a file read without one gets one (readGft)', () => {
    const { grid: _, ...bare } = demoProject()
    const r = readGft(writeGft(bare as Project))
    expect(r.ok && r.project.grid).toEqual(fitGrid(bare, gridSizeOf('industrial')))
  })

  it('a new site fits the project’s grid and every option’s own (their bays and modules kept); none taken away, it stays', () => {
    const p = newProject('industrial')
    const two = addOption(p, { name: 'Option 2' }).project
    const o2 = two.options[1].id
    const q = updateGrid(ownGrid(two, o2), o2, { x: 15, angle: 20 })
    const site = demoProject().site.boundary!
    const r = setBoundary(q, site, 'test')
    expect(r.grid).toEqual(fitGrid(r, { x: 12, y: 12, modules: 4 }))
    expect(gridOf(r, o2)).toEqual(fitGrid(r, { x: 15, y: 12, modules: 4 }))
    expect(setBoundary(r, null).grid).toEqual(r.grid)
    expect(refitGrids(r)).toEqual(r)
  })
})

describe('the grid verbs', () => {
  it('the project’s replaced; an option’s own, edited apart; back on the project’s', () => {
    const p = demoProject()
    const q = setGrid(p, grid())
    expect(ProjectSchema.parse(q).grid).toEqual(grid())
    expect(setGrid(q, grid())).toBe(q)
    expect(setGrid(q, grid({ modules: 0 }))).toBe(q)
    expect(setGrid(q, grid({ x: -1 }))).toBe(q)
    const two = addOption(q, { name: 'Option 2' }).project
    const o2 = two.options[1].id
    // an option's own: edited apart, the other keeps the project's
    const own = updateGrid(ownGrid(two, o2), o2, { x: 15 })
    expect(gridOf(own, o2)!.x).toBe(15)
    expect(gridOf(own, 'o1')!.x).toBe(12)
    expect(ProjectSchema.parse(own).options[1].grid!.x).toBe(15)
    // the project's, edited where an option has none
    expect(gridOf(updateGrid(own, 'o1', { origin: { x: 5 } }), 'o1')!.origin).toEqual({ x: 5, y: 0 })
    expect(gridOf(sharedGrid(own, o2), o2)!.x).toBe(12)
    expect(updateGrid(own, o2, { modules: 2.5 })).toBe(own)
  })
})
