// Masses on the grid (Phase G.2b, Decision "Grid layout"): the plan's snap is the grid's modules, on its axes, while
// the option stands on one (a mass moved, a wall dragged, a corner); a building's bays in Properties, typed → its
// masses on that end stretch (one undo step); the plan menu's *Split at line …* splits a mass at the bay line nearest
// the click, the part after it picked. The demo on a 10 × 10 m grid in 4 (2.5 m modules) from Warehouse 1's corner
// (40, 70): every mass on it; Building 1 runs 35 bays (u 0–350) by 14 (v 0–140), its first lines E and 8 (the site
// starts four bays west and seven south).
import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { gridRect, toGrid, toPlan } from '../../../../engine/grid/index.ts'
import type { Footprint, Grid } from '../../../../model/schema.ts'
import { actions } from '../../../../state/actions/index.ts'
import { splitAtGridLine, stretchBuilding } from '../../../../state/actions/grid.ts'
import { demoProject } from '../../../../state/demo.ts'
import { useApp } from '../../../../state/store.ts'
import { BuildingGridSection } from '../../../panels/BuildingGridSection.tsx'
import { splitItems } from '../../../panels/gridCommands.ts'
import { DEFAULT_SNAP } from '../../snap/kinds.ts'
import { snapWallOffset } from '../../snap/handles.ts'
import { planStep, snapToGrid } from '../../snap/grid.ts'
import { targetsOf } from '../../snap/move.ts'
import { resolveSnap } from '../../snap/resolve.ts'

const grid: Grid = { x: 10, y: 10, modules: 4, origin: { x: 40, y: 70 }, angle: 0 }
const project = () => useApp.getState().project
const rect = (id: string) => project().masses.find((m) => m.id === id)!.footprint as Extract<Footprint, { kind: 'rect' }>

beforeEach(() => {
  useApp.getState().open(demoProject())
  act(() => useApp.getState().apply((p) => actions.setGrid(p, grid)))
})

describe('the snap on the modules', () => {
  it('the step is always the grid’s (whole metres only on a project read without one): a point onto a module node, on a turned grid too', () => {
    // every project stands on a grid (Decision "Grid always"), the demo on its typology's
    expect(planStep(demoProject(), 'o1')).toEqual(demoProject().grid)
    const { grid: _, ...bare } = demoProject()
    expect(planStep(bare, 'o1')).toBe(1)
    expect(planStep(project(), 'o1')).toEqual(grid)
    expect(snapToGrid({ x: 41.4, y: 73.9 }, grid)).toEqual({ x: 42.5, y: 75 })
    const turned = { ...grid, angle: 30 }
    const q = toGrid(turned, snapToGrid(toPlan(turned, { x: 6.1, y: 3.6 }), turned))
    expect([q.x, q.y].map((v) => Math.round(v * 1e9) / 1e9)).toEqual([5, 2.5])
  })

  it('a wall along the turned grid lands on its module lines; whole metres without one', () => {
    const turned = { ...grid, angle: 30 }
    // a wall along the grid's x at v 5, its normal the grid's y: dragged 3.4 m out, it goes to v 7.5
    const a = toPlan(turned, { x: 0, y: 5 })
    const b = toPlan(turned, { x: 20, y: 5 })
    const n = { x: -Math.sin(Math.PI / 6), y: Math.cos(Math.PI / 6) }
    const wall = { a, b, n } as Parameters<typeof snapWallOffset>[0]
    const s = { ...DEFAULT_SNAP, on: false }
    const { d } = snapWallOffset(wall, { x: n.x * 3.4, y: n.y * 3.4 }, [], s, 0.1, turned)
    expect(d).toBeCloseTo(2.5, 9)
    expect(snapWallOffset({ a: { x: 0, y: 0 }, b: { x: 10, y: 0 }, n: { x: 0, y: 1 } } as Parameters<typeof snapWallOffset>[0], { x: 0, y: 3.4 }, [], s, 0.1).d).toBe(3)
  })

  it('a corner or a drawn point goes onto the line of a nearby wall, along it onto a module line; away from walls, a module node', () => {
    // a mass whose south wall's line runs 0.4 m from the pointer, its corners far from it (Decision "Snap first to
    // what is drawn": the grid's nodes no longer hide it)
    const wall = { contour: { vertices: [{ x: 100, y: 75.3, r: 0 }, { x: 110, y: 75.3, r: 0 }, { x: 110, y: 80, r: 0 }, { x: 100, y: 80, r: 0 }] }, label: 'mass' }
    const input = { targets: targetsOf([wall]), settings: DEFAULT_SNAP, tolPoint: 2, tolLine: 1 }
    const on = resolveSnap({ x: 41.3, y: 74.9 }, { ...input, step: grid })
    expect(on).toMatchObject({ how: 'tracking' })
    expect(on.point.x).toBeCloseTo(42.5, 9)
    expect(on.point.y).toBeCloseTo(75.3, 9)
    expect(on.mark?.lines?.map((l) => l.label)).toEqual(['wall of mass'])
    // on whole metres, whole metres along it
    expect(resolveSnap({ x: 41.3, y: 74.9 }, { ...input, step: 1 }).point).toEqual({ x: 41, y: 75.3 })
    // far from the wall's line, the module node
    expect(resolveSnap({ x: 41.3, y: 72.6 }, { ...input, step: grid })).toMatchObject({ point: { x: 42.5, y: 72.5 }, how: 'grid' })
  })

  it('a rectangle drawn on a turned grid runs along it', () => {
    const turned = { ...grid, angle: 30 }
    const f = gridRect(turned, toPlan(turned, { x: 0, y: 0 }), toPlan(turned, { x: 20, y: 7.5 }))!
    expect(f.rotation).toBe(30)
    expect([f.width, f.depth].map((v) => Math.round(v * 1e9) / 1e9)).toEqual([20, 7.5])
    expect(gridRect(turned, toPlan(turned, { x: 0, y: 0 }), toPlan(turned, { x: 0.5, y: 3 }))).toBeNull()
  })
})

describe('the verbs', () => {
  it('a building stretched along the grid: the masses on that end follow; a locked one refuses it', () => {
    const p = project()
    // Warehouse 2 (turned round) ends Building 1 east, at u 350: one module further
    const q = stretchBuilding(p, 'o1', 'b1', 'x', 'end', 352.5)
    expect(q.masses.find((m) => m.id === 'm2')!.footprint).toMatchObject({ width: 142.5, center: { x: 321.25, y: 110 }, rotation: 180 })
    expect(q.masses.find((m) => m.id === 'm1')).toBe(p.masses.find((m) => m.id === 'm1'))
    // Warehouse 1 and the office? Only those on the end: the south end is the warehouses'
    const south = stretchBuilding(p, 'o1', 'b1', 'y', 'start', -5)
    expect(south.masses.filter((m) => (m.footprint as { depth: number }).depth === 85).map((m) => m.id)).toEqual(['m1', 'm2'])
    const locked = actions.toggleMassLock(p, 'm2')
    expect(stretchBuilding(locked, 'o1', 'b1', 'x', 'end', 352.5)).toBe(locked)
    expect(stretchBuilding(p, 'o1', 'b1', 'x', 'end', 211)).not.toBe(p)
    expect(stretchBuilding(p, 'o1', 'b1', 'x', 'end', 210.5)).toBe(p)
  })

  it('a mass split at a bay line: it keeps the part before, a copy the part after; refused off the grid', () => {
    const r = splitAtGridLine(project(), 'o1', 'm1', 'x', 8)!
    const [a, b] = ['m1', r.id].map((id) => r.project.masses.find((m) => m.id === id)!)
    expect(a.footprint).toMatchObject({ width: 80, center: { x: 80, y: 110 } })
    expect(b).toMatchObject({ programId: 'warehouse', name: 'Warehouse 3', footprint: { width: 80, center: { x: 160, y: 110 } } })
    expect(splitAtGridLine(project(), 'o1', 'm1', 'x', 0)).toBeNull()
    expect(splitAtGridLine(project(), 'o1', 'm1', 'x', 16)).toBeNull()
    expect(splitAtGridLine(actions.rotateMass(project(), 'm1', 10), 'o1', 'm1', 'x', 8)).toBeNull()
  })
})

describe('the views', () => {
  it('a building’s bays in Properties: where it runs, each way its bays and end bays; typed, the masses follow', () => {
    const b1 = () => project().buildings[0]
    const view = render(<BuildingGridSection building={b1()} />)
    expect(document.querySelector('[data-building-grid]')!.textContent).toBe('E–AR × 8–22 · 35 × 14 bays')
    expect(document.querySelector('[data-off-grid]')).toBeNull()
    const type = (name: RegExp, value: string) => {
      const field = screen.getByRole('textbox', { name })
      fireEvent.change(field, { target: { value } })
      fireEvent.keyDown(field, { key: 'Enter' })
    }
    type(/^End bay after AR/, '5')
    expect(rect('m2').width).toBe(145)
    view.rerender(<BuildingGridSection building={b1()} />)
    expect(document.querySelector('[data-building-grid]')!.textContent).toBe('E–AR1 × 8–22 · 35 × 14 bays')
    // one bay fewer at the far end, the end bay kept
    type(/^Bays x/, '34')
    expect(rect('m2').width).toBe(135)
    act(() => useApp.getState().undo())
    expect(rect('m2').width).toBe(145)
    // the office a little off the modules: named
    act(() => useApp.getState().apply((p) => actions.moveMass(p, 'm3', { x: 1, y: 0 })))
    view.rerender(<BuildingGridSection building={b1()} />)
    expect(document.querySelector('[data-off-grid]')!.textContent).toMatch(/^Off the grid: Office 1/)
  })

  it('the plan menu’s Split at line: the bay line nearest the click, the part after it picked; greyed with why', () => {
    act(() => useApp.getState().select('m1'))
    const [item] = splitItems(['m1'], { x: 121, y: 95 })
    expect(item).toMatchObject({ label: 'Split at line N' })
    act(() => (item as { onSelect(): void }).onSelect())
    expect(project().masses).toHaveLength(4)
    const picked = useApp.getState().selection.massId!
    expect(rect(picked).center).toEqual({ x: 160, y: 110 })
    expect(splitItems(['m1', 'm2'], null)[0]).toMatchObject({ disabled: true, title: 'Select one mass on the grid to split it at a grid line' })
  })
})
