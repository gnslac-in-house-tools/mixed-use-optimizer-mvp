// The optimizer on the grid (Phase G.4, Decision "Structural grid"): while the option stands on a grid, position goes on
// its module lines (a mass's box's low corner along its axes), proportion in whole modules, rotation by quarters from its
// angle; the grid's own variables (bays, modules, angle, origin) write the option's own grid, the masses on it; the
// doors' pattern per docking program, never door by door. With no grid, none of it. The demo on a 10 × 10 m grid in 4
// (2.5 m modules) from Warehouse 1's corner (40, 70).
import { describe, expect, it } from 'vitest'
import { onGrid, toGrid } from '../../../../engine/grid/index.ts'
import { footprintPolygon } from '../../../../engine/geom/footprint.ts'
import { derive } from '../../../../engine/derive.ts'
import type { Grid, Project } from '../../../../model/schema.ts'
import { setGrid } from '../../../../state/actions/grid.ts'
import { demoProject } from '../../../../state/demo.ts'
import { problemOf } from '../problem.ts'
import type { Template } from '../template.ts'
import { MASSES } from '../../../../typologies/plans.ts'

const grid: Grid = { x: 10, y: 10, modules: 4, origin: { x: 40, y: 70 }, angle: 0 }
const onGridProject = (): Project => setGrid(demoProject(), grid)
const only = (...kinds: { kind: string; step: number; range?: number }[]): Template => ({
  ...MASSES,
  variables: kinds,
  objectives: [{ measure: 'doors-short', sense: 'min' }],
})
const footprint = (p: Project, id: string) => p.masses.find((m) => m.id === id)!.footprint

describe('the masses on the grid', () => {
  it('position: each mass’s low corner along the grid’s axes, on whole modules; decoded, the rects stay on the grid', () => {
    const t = problemOf(onGridProject(), 'o1', only({ kind: 'mass.position', step: 1 }))
    const x = t.variables.find((v) => v.key === 'm1.x')!
    expect(x.gene).toMatchObject({ kind: 'real', step: 2.5 })
    expect([x.read(onGridProject()), t.variables.find((v) => v.key === 'm1.y')!.read(onGridProject())]).toEqual([0, 0])
    // Warehouse 1 to 12.4 m along x and 7.6 m along y: on the modules, 12.5 and 7.5
    const values = t.variables.map((v) => (v.key === 'm1.x' ? 12.4 : v.key === 'm1.y' ? 7.6 : v.read(onGridProject())))
    const q = t.decode(values)
    const lo = toGrid(grid, footprintPolygon(footprint(q, 'm1'))[0])
    expect([lo.x, lo.y].map((v) => Math.round(v * 1e9) / 1e9)).toEqual([12.5, 7.5])
    expect(onGrid(grid, footprintPolygon(footprint(q, 'm1')))).toBe(true)
  })

  it('proportion in whole modules: the width as the gene says, the depth the modules nearest its area', () => {
    const t = problemOf(onGridProject(), 'o1', only({ kind: 'mass.proportion', step: 1 }))
    const w = t.variables.find((v) => v.key === 'm1.width')!
    expect(w.label).toBe('Warehouse 1 · width in modules')
    expect(w.read(onGridProject())).toBe(64)
    // 48 modules wide: 120 m; 12,800 m² over it, 106.7 m, is 43 modules, 107.5 m
    const q = t.decode(t.variables.map((v) => (v.key === 'm1.width' ? 48 : v.read(onGridProject()))))
    expect(footprint(q, 'm1')).toMatchObject({ width: 120, depth: 107.5 })
  })

  it('rotation by quarters from the grid’s angle', () => {
    const t = problemOf(setGrid(demoProject(), { ...grid, angle: 20 }), 'o1', only({ kind: 'mass.rotation', step: 15 }))
    expect(t.variables[0].gene).toMatchObject({ step: 90 })
    const q = t.decode(t.variables.map(() => 90))
    expect(footprint(q, 'm1')).toMatchObject({ rotation: 110 })
  })

  it('none of it on a project read without a grid (raw JSON: the app’s always have one, Decision "Grid always"): the plan’s own steps', () => {
    const { grid: _, ...bare } = demoProject()
    const t = problemOf(bare, 'o1', only({ kind: 'mass.position', step: 1 }, { kind: 'grid.bay', step: 1.5 }, { kind: 'dock.pattern', step: 1 }))
    expect(t.variables.map((v) => v.kind)).toEqual(['mass.position', 'mass.position', 'mass.position', 'mass.position', 'mass.position', 'mass.position'])
    expect(t.variables[0].gene).toMatchObject({ step: 1 })
  })
})

describe('the grid’s own variables', () => {
  it('bays, modules, angle and origin: into the option’s own grid, the project’s kept', () => {
    const t = problemOf(onGridProject(), 'o1', only({ kind: 'grid.bay', step: 1.5 }, { kind: 'grid.module', step: 1 }, { kind: 'grid.angle', step: 5 }, { kind: 'grid.origin', step: 1 }))
    expect(t.variables.map((v) => v.key)).toEqual(['grid.x', 'grid.y', 'grid.modules', 'grid.angle', 'grid.ox', 'grid.oy'])
    expect(t.variables[0].gene).toMatchObject({ min: 7, max: 13, step: 1.5 })
    expect(t.variables[2].gene).toMatchObject({ min: 1, max: 6 })
    expect(t.variables[4].gene).toMatchObject({ min: 0, max: 7.5, step: 2.5 })
    const q = t.decode([13, 8.5, 3, 5, 2.5, 5])
    expect(q.options[0].grid).toEqual({ x: 13, y: 8.5, modules: 3, angle: 5, origin: { x: 40 + 2.5 * Math.cos(Math.PI / 36) - 5 * Math.sin(Math.PI / 36), y: 70 + 2.5 * Math.sin(Math.PI / 36) + 5 * Math.cos(Math.PI / 36) } })
    expect(q.grid).toEqual(grid)
    expect(t.variables.map((v) => v.read(onGridProject()))).toEqual([10, 10, 4, 0, 0, 0])
  })
})

describe('the doors’ pattern', () => {
  it('per docking program: a door every 1 to N modules, from which; decoded into its masses’ own; short of the brief measured', () => {
    const t = problemOf(onGridProject(), 'o1', only({ kind: 'dock.pattern', step: 1, range: 4 }))
    expect(t.variables.map((v) => [v.key, v.label])).toEqual([
      ['warehouse.every', 'Warehouse · a door every … modules'],
      ['warehouse.offset', 'Warehouse · doors from module'],
    ])
    const q = t.decode([4, 1])
    expect(q.masses.filter((m) => m.programId === 'warehouse').map((m) => m.doorPattern)).toEqual([
      { every: 4, offset: 1, skip: 'ends' },
      { every: 4, offset: 1, skip: 'ends' },
    ])
    // every fourth module past the end bays: Warehouse 1 has 15 of the 19 the brief asks, Warehouse 2 13 of 16
    expect(derive(q).docks.short).toBe(4 + 3)
    expect(t.problem.evaluate([4, 1]).objectives[0]).toBe(7)
    expect(t.problem.evaluate([1, 0]).objectives[0]).toBe(0)
  })
})
