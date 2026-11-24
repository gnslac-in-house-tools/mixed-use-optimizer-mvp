// A warehouse type's copies on the site (W.6, Decision "Warehouse copies"): the Blocks tab's cards of types (the Brief tab's palette until Phase AS.3); a click
// places a copy (a building of its own, its masses selected); Properties says Copy of / Variant of, its overrides,
// Back to type and Open type; its shape is its type's (no handles, no size fields).
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../../../App.tsx'
import { derive } from '../../../../engine/derive.ts'
import { demoProject } from '../../../../state/demo.ts'
import { emptyHistory } from '../../../../state/history.ts'
import { useApp } from '../../../../state/store.ts'
import { actions } from '../../../../state/actions/index.ts'
import { useUi } from '../../../../views/layout/ui.ts'
import { useWarehouse } from '../warehouseState.ts'
import { placeCopy } from '../commands.ts'
import type { PointerEvent } from 'react'
import { footprintContour } from '../../../../engine/geom/footprint.ts'
import { endTyped } from '../../../../views/editing/dimension/typed.ts'
import { startPush } from '../../../../views/editing/shape/drags.ts'

vi.mock('../../../../views/scene/Scene.tsx', () => ({ Scene: () => <div data-testid="scene" /> }))
vi.mock('../WarehouseScene.tsx', () => ({ WarehouseScene: () => <div data-testid="warehouse-scene" /> }))

beforeEach(() => {
  localStorage.clear()
  const p = actions.addWarehouseType(demoProject()).project
  useApp.setState({ project: p, derived: derive(p), history: emptyHistory(), dragStart: null, selection: { massId: null, vertex: null, massIds: [] }, option: p.options[0].id })
  useUi.setState({ dialog: null, view: 'plan', rail: 'blocks', summaryTab: 'overview', panels: { left: true, right: true }, sheet: null })
  useWarehouse.setState({ programId: null, typeId: null, shown: null })
})

const field = (label: string) => screen.getByRole('textbox', { name: new RegExp(`^${label}`) }) as HTMLInputElement
const type = (label: string, value: string) => {
  fireEvent.change(field(label), { target: { value } })
  fireEvent.keyDown(field(label), { key: 'Enter' })
}

// the App stands behind the Program window, drawn too: longer than the default 5 s under a full run's load
describe('copies on the site', { timeout: 15000 }, () => {
  it('the Blocks tab places a copy; Properties says Copy of, then Variant of; Back to type; Open type', () => {
    render(<App />)
    const palette = screen.getByRole('tabpanel', { name: 'Blocks' })
    // a click picks the block (it places nothing); Place, from its menu, puts the copy
    fireEvent.click(within(palette).getByRole('option', { name: 'Warehouse A' }))
    expect(useApp.getState().project.buildings.at(-1)!.warehouse).toBeUndefined()
    fireEvent.contextMenu(within(palette).getByRole('option', { name: 'Warehouse A' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /^Place/ }))
    const p = useApp.getState().project
    const copy = p.buildings.at(-1)!
    expect(copy).toMatchObject({ name: 'Warehouse A 1', warehouse: { type: 'wt1' } })
    const hall = p.masses.find((m) => m.part === 'hall')!
    expect(useApp.getState().selection.massIds).toEqual([hall.id])
    expect(within(palette).getByRole('option', { name: 'Warehouse A' }).textContent).toContain('×1')

    act(() => useUi.setState({ rail: 'properties' }))
    expect(screen.getByText('Copy of Warehouse A')).toBeInTheDocument()
    // its shape is its type's: no size fields, no program to pick, on the plan the handle that turns it and its hall's
    // walls and corners (free, the module lines a snap: D.2)
    expect(screen.queryByRole('textbox', { name: /^Depth/ })).toBeNull()
    expect(screen.queryByRole('combobox', { name: 'Program' })).toBeNull()
    expect([...document.querySelectorAll('[data-handle]')].map((h) => h.getAttribute('data-handle')!).filter((k) => /^(wall|line|vertex)-|^rotate$/.test(k)).sort()).toEqual(['rotate', 'vertex-0', 'vertex-1', 'vertex-2', 'vertex-3', 'wall-0', 'wall-1', 'wall-2', 'wall-3'])

    type('Length', '144')
    expect(screen.getByText('Variant of Warehouse A')).toBeInTheDocument()
    expect(screen.getByText('Length: 200 m in the type')).toBeInTheDocument()
    expect(useApp.getState().project.buildings.at(-1)!.warehouse!.overrides).toEqual({ hall: { length: 144 } })
    // the type's own value takes the override away
    type('Length', '200')
    expect(useApp.getState().project.buildings.at(-1)!.warehouse!.overrides).toBeUndefined()
    // its docks are its block's (Decision "Elements by module"): no figure of them here
    expect(screen.queryByRole('textbox', { name: /^Docks/ })).toBeNull()
    type('Height', '14')
    expect(useApp.getState().project.buildings.at(-1)!.warehouse!.overrides).toEqual({ envelope: { height: 14 } })
    fireEvent.click(screen.getByRole('button', { name: 'Back to type' }))
    expect(screen.getByText('Copy of Warehouse A')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Open type' }))
    expect(useUi.getState().dialog).toBe('program')
    expect(useWarehouse.getState().typeId).toBe('wt1')
    expect(within(screen.getByRole('region', { name: 'Warehouse figures' })).getByText('Copies on the site').nextSibling?.textContent).toBe('1')
  })

  it('B.2: a hall’s wall dragged lands on its module lines (a snap; Shift: exact), past its range too (RB.1); a number typed after it is exact; one undo step', () => {
    render(<App />)
    act(() => placeCopy('wt1'))
    const p = useApp.getState().project
    const hall = p.masses.find((m) => m.part === 'hall')!
    const f = hall.footprint as { kind: 'rect'; center: { x: number; y: number }; width: number }
    // the wall at the hall's far end along its length (its rotation 0: the +x side)
    const c = footprintContour(hall.footprint).vertices
    const i = c.findIndex((v, k) => v.x > f.center.x && c[(k + 1) % c.length].x > f.center.x)
    const length = () => useApp.getState().project.buildings.at(-1)!.warehouse!.overrides?.hall?.length
    const press = {} as PointerEvent<SVGElement>
    const release = () =>
      act(() => {
        useApp.getState().commit()
        endTyped(false)
      })
    const move = startPush({ kind: 'mass', id: hall.id }, i, 1, () => {})(press, c[i])!
    // 7 m out: the module line two 3 m modules out is within the aperture (8 m at a scale of 1); Shift: the 7 m
    act(() => void move({ x: 7, y: 0 }, { shiftKey: false }))
    expect(length()).toBe(206)
    act(() => void move({ x: 7, y: 0 }, { shiftKey: true }))
    expect(length()).toBe(207)
    // far out: past its range (two 12 m bays), no limit
    act(() => void move({ x: 30, y: 0 }, { shiftKey: false }))
    expect(length()).toBe(230)
    release()
    // the masses made again from the variant: the hall 30 m longer, the other wall where it was
    const grown = useApp.getState().project.masses.find((m) => m.id === hall.id)!.footprint as typeof f
    expect(grown.width).toBeCloseTo(f.width + 30, 6)
    expect(grown.center.x).toBeCloseTo(f.center.x + 15, 6)
    // a number typed after the drag corrects it (the same step): from where it started, exactly
    const line = screen.getByRole('textbox', { name: 'Command line' })
    fireEvent.change(line, { target: { value: '4' } })
    fireEvent.keyDown(line, { key: 'Enter' })
    expect(length()).toBe(204)
    act(() => useApp.getState().undo())
    expect(length()).toBeUndefined()
  })

  it('D.2: a block’s corner picked has its Corner section in Properties: a radius (the copy a variant), a corner to take away', () => {
    render(<App />)
    act(() => placeCopy('wt1'))
    const hall = () => useApp.getState().project.masses.find((m) => m.part === 'hall')!
    const ref = () => ({ kind: 'mass', id: hall().id })
    act(() => {
      useUi.setState({ rail: 'properties' })
      useApp.getState().select(hall().id, 1)
    })
    expect(screen.getByText('Corner 2')).toBeInTheDocument()
    type('Radius', '2')
    expect(actions.shapeOf(useApp.getState().project, ref())!.contour.vertices[1].r).toBeCloseTo(2, 6)
    expect(useApp.getState().project.buildings.at(-1)!.warehouse!.overrides?.morphology?.outline).toBeDefined()
    act(() => useApp.getState().undo())
    expect(useApp.getState().project.buildings.at(-1)!.warehouse!.overrides).toBeUndefined()
    // and it can be taken out as any corner (the engine joins its walls; a rectangle's own corner fills back to a rectangle)
    expect(screen.getByRole('button', { name: 'Delete corner' })).toBeEnabled()
  })

  it('BS.5: a box’s wall pressed shows its range, dashed where it is shortest and longest; dragged past it, its label in the warning colour (RB.1)', () => {
    render(<App />)
    act(() => placeCopy('wt1'))
    const hall = () => useApp.getState().project.masses.find((m) => m.part === 'hall')!
    act(() => useApp.getState().select(hall().id))
    const f = hall().footprint as { kind: 'rect'; center: { x: number; y: number } }
    const c = footprintContour(hall().footprint).vertices
    const i = c.findIndex((v, k) => v.x > f.center.x && c[(k + 1) % c.length].x > f.center.x)
    const pill = document.querySelector(`[data-handle="wall-${i}"]`)!
    expect(pill.getAttribute('data-wall-kind')).toBe('box')
    fireEvent.pointerDown(pill, { clientX: 0, clientY: 0, pointerId: 1, button: 0 })
    expect([...document.querySelectorAll('[data-range-guide]')].map((g) => g.getAttribute('data-range-guide'))).toEqual(['176', '224'])
    expect(screen.getByText('176 m')).toBeInTheDocument()
    expect(screen.getByText('Length 200 m (176–224) · ±0.00 m')).toBeInTheDocument()
    fireEvent.pointerMove(pill, { clientX: 50, clientY: 0, pointerId: 1 })
    const label = screen.getByText('Length 233 m (past its range 176–224) · +33.00 m')
    expect(label).toHaveAttribute('data-warn', 'true')
    fireEvent.pointerUp(pill, { clientX: 50, clientY: 0, pointerId: 1 })
    expect(useApp.getState().project.buildings.at(-1)!.warehouse!.overrides).toEqual({ hall: { length: 233 } })
    expect(useApp.getState().derived.issues.filter((x) => x.code === 'range')).toHaveLength(1)
    expect(document.querySelector('[data-range-guide]')).toBeNull()
  })

  it('a placed block’s walls (Decision "Block shape"): a pill on each, the box’s and the inner ones; an inner one dragged alone, this copy’s own outline', () => {
    let p = useApp.getState().project
    for (const s of ['grid', 'hall', 'columns', 'envelope'] as const) p = actions.lockWarehouseStep(p, 'wt1', s)
    // a notch in the back: modules 20 to 32, 4 in
    p = actions.shapeWarehouse(p, 'wt1', { kind: 'pull', edge: 'e3', from: 20, to: 32, by: -4 }).project
    act(() => useApp.setState({ project: p, derived: derive(p) }))
    render(<App />)
    act(() => placeCopy('wt1'))
    const hall = () => useApp.getState().project.masses.find((m) => m.part === 'hall')!
    act(() => useApp.getState().select(hall().id))
    const kinds = [...document.querySelectorAll('[data-wall-kind]')].map((h) => h.getAttribute('data-wall-kind'))
    expect(kinds.filter((k) => k === 'box')).toHaveLength(5)
    expect(kinds.filter((k) => k === 'inner')).toHaveLength(3)
    // the notch's bottom dragged a module out of it (up the plan): this copy alone, its type as it was
    const c = footprintContour(hall().footprint).vertices
    const i = actions.blockWalls(useApp.getState().project, hall().id)!.findIndex((k, j) => k === 'inner' && Math.abs(c[j].y - c[(j + 1) % c.length].y) < 1e-6)
    const press = {} as PointerEvent<SVGElement>
    const move = startPush({ kind: 'mass', id: hall().id }, i, 1, () => {})(press, c[i])!
    act(() => void move({ x: 0, y: 3 }, { shiftKey: false }))
    act(() => {
      useApp.getState().commit()
      endTyped(false)
    })
    const own = useApp.getState().project.buildings.at(-1)!.warehouse!.overrides?.morphology?.outline
    expect(own).toHaveLength(8)
    expect(useApp.getState().project.warehouseTypes![0].morphology.outline).not.toEqual(own)
    act(() => useApp.getState().undo())
    expect(useApp.getState().project.buildings.at(-1)!.warehouse!.overrides).toBeUndefined()
  })
})
