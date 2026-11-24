// The Program window on a Warehouse program (W.2, Decisions "Warehouse layout", "Program rule set layout": was the
// Warehouse workspace): its left column the type's steps, the type alone in plan in the middle, its figures on the
// right. A program's rule set begun from its general level; only the open step's fields are typed; Lock opens the next;
// Reopen sends the later locked ones to lock again.
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../../../App.tsx'
import { derive } from '../../../../engine/derive.ts'
import { demoProject } from '../../../../state/demo.ts'
import { emptyHistory } from '../../../../state/history.ts'
import { useApp } from '../../../../state/store.ts'
import { actions } from '../../../../state/actions/index.ts'
import { useToast } from '../../../../views/layout/toast.ts'
import { useUi } from '../../../../views/layout/ui.ts'
import { useDetail } from '../../../../views/detail.ts'
import { useWarehouse } from '../warehouseState.ts'

vi.mock('../../../../views/scene/Scene.tsx', () => ({ Scene: () => <div data-testid="scene" /> }))
vi.mock('../WarehouseScene.tsx', () => ({ WarehouseScene: () => <div data-testid="warehouse-scene" /> }))

beforeEach(() => {
  localStorage.clear()
  const p = demoProject()
  useApp.setState({ project: p, derived: derive(p), history: emptyHistory(), dragStart: null, selection: { massId: null, vertex: null, massIds: [] } })
  useUi.setState({ dialog: null, view: 'plan', rail: 'layers', summaryTab: 'overview', panels: { left: true, right: true }, sheet: null, help: false })
  useWarehouse.setState({ programId: null, typeId: null, shown: null })
  useDetail.setState({ detail: 'presentation' })
})

const steps = () => within(screen.getByRole('list', { name: 'Steps' }))
const row = (name: string) => steps().getByRole('button', { name: new RegExp(`^${name}`) })
const field = (label: string) => screen.getByRole('textbox', { name: new RegExp(`^${label}(?! from)`) }) as HTMLInputElement
const type = (label: string, value: string) => {
  fireEvent.change(field(label), { target: { value } })
  fireEvent.keyDown(field(label), { key: 'Enter' })
}

// the App stands behind the window, drawn too: these take longer than the default 5 s under a full run's load
describe('the Program window on a Warehouse program', { timeout: 15000 }, () => {
  it('the Program window (the Blocks’ ✎ and + New block open it); a Warehouse program without its type, its general level and Start its rule set; then its steps, the type alone, its figures', () => {
    render(<App />)
    act(() => useUi.getState().openDialog('program'))
    const win = within(screen.getByRole('dialog', { name: 'Program' }))
    // the brief's first program: Warehouse, no type yet
    expect((win.getByRole('combobox', { name: 'Program to edit' }) as HTMLSelectElement).value).toBe('warehouse')
    expect(win.getByRole('region', { name: 'General level' })).toBeInTheDocument()
    fireEvent.click(win.getByRole('button', { name: 'Start its rule set' }))
    expect(useApp.getState().project.warehouseTypes).toMatchObject([{ id: 'wt1', program: 'warehouse' }])
    expect(win.getByRole('region', { name: 'Warehouse type' })).toBeInTheDocument()
    expect(win.getByRole('region', { name: 'Warehouse figures' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'The warehouse type in plan' })).toBeInTheDocument()
    // the tools' New: a Warehouse program of its own
    fireEvent.click(within(win.getByRole('group', { name: 'Type' })).getByRole('button', { name: 'New' }))
    expect(useApp.getState().project.warehouseTypes).toHaveLength(2)
    expect((win.getByRole('combobox', { name: 'Program to edit' }) as HTMLSelectElement).value).toBe(useApp.getState().project.warehouseTypes![1].program)
    act(() => useWarehouse.getState().pickProgram('warehouse'))
    // six rows, the grid open, its summary
    expect(steps().getAllByRole('button').filter((b) => b.hasAttribute('aria-expanded')).map((b) => b.textContent)).toEqual([
      '1Grid12 × 12 / 4',
      '2Hall200 × 96 m · 15 × 8 bays',
      '3Columns162 columns · 0.5 m',
      '4Envelope0.3 m · 12 m tall',
      '5ShapeThe box',
      '6Elements60 docks',
    ])
    expect(within(row('Grid')).getByRole('img', { name: 'Open' })).toBeInTheDocument()
    expect(within(row('Hall')).getByRole('img', { name: 'Open' })).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Warehouse figures' })).getByText('15 × 8')).toBeInTheDocument()
    // an office: its general level
    fireEvent.change(win.getByRole('combobox', { name: 'Program to edit' }), { target: { value: 'office' } })
    expect(win.queryByRole('region', { name: 'Warehouse type' })).toBeNull()
    expect(win.getByRole('region', { name: 'General level' })).toBeInTheDocument()
    // Escape closes it
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(useUi.getState().dialog).toBeNull()
  })

  it('free steps (Decision "Free steps"): any step typed in any order; Lock marks it, the next not locked shows; an edit of a locked one opens it, the later ones to lock again', () => {
    act(() => useUi.setState({ dialog: 'program', help: true }))
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Start its rule set' }))
    // the hall typed before the grid is locked
    fireEvent.click(row('Hall'))
    type('Length', '150')
    expect(useApp.getState().project.warehouseTypes![0].hall.length).toBe(150)
    fireEvent.click(row('Grid'))
    type('Bay along the length', '10')
    expect(useApp.getState().project.warehouseTypes![0].grid.x).toBe(10)
    expect(row('Grid').textContent).toContain('10 × 12 / 4')
    fireEvent.click(screen.getByRole('button', { name: 'Lock ① Grid' }))
    // the grid locked; the first not locked shows
    expect(within(row('Grid')).getByRole('img', { name: 'Locked' })).toBeInTheDocument()
    expect(row('Hall')).toHaveAttribute('aria-expanded', 'true')
    type('Length', '155')
    expect(row('Hall').textContent).toContain('155 × 96 m · 14 × 8 bays')
    // in the figures alone: step 2 no longer repeats it (step 1 says it with Help; final review, Minor 7)
    expect(screen.getAllByText(/Along the length: 14 bays of 10 m, end bays 7.5 \+ 7.5 m/)).toHaveLength(1)
    expect(within(screen.getByRole('region', { name: 'Warehouse figures' })).getByText(/Along the length: 14 bays/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Lock ② Hall' }))
    // a locked step's fields are typed too: the grid opened, the hall to lock again, a toast says so
    fireEvent.click(row('Grid'))
    expect(field('Bay along the length')).toBeEnabled()
    type('Bay along the length', '12')
    expect(within(row('Grid')).getByRole('img', { name: 'Open' })).toBeInTheDocument()
    expect(within(row('Hall')).getByRole('img', { name: 'To lock again' })).toBeInTheDocument()
    expect(useToast.getState().toast?.text).toBe('① Grid reopened; ② to lock again. Ctrl+Z undoes it.')
    fireEvent.click(row('Hall'))
    expect(field('Length')).toBeEnabled()
    expect(screen.getByText('An earlier step changed: check it and lock it again.')).toBeInTheDocument()
    // Unlock takes a lock away by hand
    fireEvent.click(screen.getByRole('button', { name: 'Lock ② Hall' }))
    fireEvent.click(row('Hall'))
    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }))
    expect(within(row('Hall')).getByRole('img', { name: 'Open' })).toBeInTheDocument()
    // one undo step each
    act(() => useApp.getState().undo())
    expect(useApp.getState().project.warehouseTypes![0].locks).toEqual({ hall: 'locked' })
  })

  it('step 1 set by the module (Decision "Grid by line", GR.2): the module typed, the bay its product; a count keeps the module; the grid the same either way', () => {
    act(() => useUi.setState({ dialog: 'program', help: true }))
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Start its rule set' }))
    const grid = () => useApp.getState().project.warehouseTypes![0].grid
    fireEvent.click(row('Grid'))
    fireEvent.click(screen.getByRole('button', { name: 'Module' }))
    // only how it is typed: the same grid, nothing reopened
    expect(grid()).toEqual({ x: 12, y: 12, modules: 4, by: 'module' })
    expect(field('Module along the length').value).toBe('3')
    expect(row('Grid').textContent).toContain('3 × 3 m modules / 4')
    type('Module along the length', '3.5')
    expect(grid()).toMatchObject({ x: 14, y: 12, modules: 4 })
    expect(screen.getByText('A bay: 14 × 12 m, the module times the modules a bay.')).toBeInTheDocument()
    type('Modules a bay', '3')
    expect(grid()).toMatchObject({ x: 10.5, y: 9, modules: 3 })
    // by the bay again: the bays as they are, a count keeps the bay
    fireEvent.click(screen.getByRole('button', { name: 'Bay' }))
    expect(field('Bay along the length').value).toBe('10.5')
    type('Modules a bay', '7')
    expect(grid()).toEqual({ x: 10.5, y: 9, modules: 7 })
  })

  it('step 1’s end bays (GR.1, BE.6): two thirds of a bay shown; a rule typed joins under it; Two thirds of a bay takes it away; the button lays them once', () => {
    act(() => useUi.setState({ dialog: 'program', help: true }))
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Start its rule set' }))
    const hall = () => useApp.getState().project.warehouseTypes![0].hall
    // step 2 has no End bays and no join field any more: both are step 1's
    fireEvent.click(row('Hall'))
    expect(screen.queryByText('End bays')).toBeNull()
    expect(screen.queryByRole('combobox', { name: /^End bays/ })).toBeNull()
    expect(screen.queryByRole('textbox', { name: /^Join end bays under/ })).toBeNull()
    type('Length', '218')
    fireEvent.click(row('Grid'))
    expect(field('Join end bays under').value).toBe('8')
    expect(screen.getByRole('button', { name: 'Set end bays automatically' })).toBeInTheDocument()
    expect(screen.getAllByText(/Along the length: 15 bays of 12 m, end bays 19 \+ 19 m/).length).toBeGreaterThan(0)
    type('Join end bays under', '6')
    expect(hall().joinUnder).toBe(6)
    expect(screen.getAllByText(/Along the length: 17 bays of 12 m, end bays 7 \+ 7 m/).length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: 'Two thirds of a bay' }))
    expect(hall().joinUnder).toBeUndefined()
    // the button: the stored layout at both ends, the width's own and the short ones gone
    act(() => useApp.getState().apply((p) => actions.updateWarehouseStep(p, 'wt1', 'hall', { ends: 'start', endsWidth: 'end', shortEnds: { x: true } })))
    fireEvent.click(screen.getByRole('button', { name: 'Set end bays automatically' }))
    expect(hall().ends).toBe('both')
    expect(hall().endsWidth).toBeUndefined()
    expect(hall().shortEnds).toBeUndefined()
  })

  it('the along-the-length line of step 1 shows only with Help', () => {
    act(() => useUi.setState({ dialog: 'program', help: false }))
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Start its rule set' }))
    fireEvent.click(row('Grid'))
    expect(screen.getByRole('button', { name: 'Set end bays automatically' })).toBeInTheDocument()
    expect(document.querySelector('[data-note]')).toBeNull()
    act(() => useUi.setState({ help: true }))
    expect(screen.getAllByText(/Along the length: /).length).toBeGreaterThan(0)
  })

  it('columns and envelope: drawn by the detail (squares and bands, points and lines in Schematic), in 3D as the View says', async () => {
    act(() => useUi.setState({ dialog: 'program' }))
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Start its rule set' }))
    fireEvent.click(screen.getByRole('button', { name: 'Lock ① Grid' }))
    fireEvent.click(screen.getByRole('button', { name: 'Lock ② Hall' }))
    type('On every nth line along the length', '2')
    expect(row('Columns').textContent).toContain('90 columns')
    const plan = screen.getByRole('img', { name: 'The warehouse type in plan' })
    expect(plan.querySelector('[data-columns]')).toHaveAttribute('data-columns', '90')
    expect(plan.querySelector('[data-walls]')).toHaveAttribute('data-walls', '4')
    fireEvent.click(screen.getByRole('button', { name: 'Lock ③ Columns' }))
    type('Wall thickness', '0.5')
    expect(useApp.getState().project.warehouseTypes![0].envelope.thickness).toBe(0.5)
    expect(row('Envelope').textContent).toContain('0.5 m · 12 m tall')
    // Schematic: the outline's line, no bands
    act(() => useDetail.setState({ detail: 'schematic' }))
    expect(plan.querySelector('[data-walls]')).toBeNull()
    // the top bar's 3D: the type's own scene
    act(() => useUi.setState({ view: 'split' }))
    expect(await screen.findByTestId('warehouse-scene')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'The warehouse type in plan' })).toBeInTheDocument()
  })

  it('shape (Decision "Block shape"): a row per edge, picked with its edge on the plan, its own wall; zones with their programs and levels, drawn and named', () => {
    act(() => useUi.setState({ dialog: 'program' }))
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Start its rule set' }))
    for (const s of ['① Grid', '② Hall', '③ Columns', '④ Envelope']) fireEvent.click(screen.getByRole('button', { name: `Lock ${s}` }))
    const edges = within(screen.getByRole('list', { name: 'Edges' }))
    expect(edges.getAllByRole('listitem').map((li) => li.getAttribute('data-edge'))).toEqual(['e1', 'e2', 'e3', 'e4'])
    const plan = screen.getByRole('img', { name: 'The warehouse type in plan' })
    // a row picked: its edge lit on the plan, its wall typed
    fireEvent.click(edges.getAllByRole('button')[1])
    expect(useWarehouse.getState().picked).toEqual([{ kind: 'edge', id: 'e2' }])
    expect(plan.querySelector('[data-picked="edge:e2"]')).not.toBeNull()
    type('Wall', '0.6')
    expect(useApp.getState().project.warehouseTypes![0].morphology.outline.find((c) => c.id === 'e2')!.thickness).toBe(0.6)
    expect(row('Shape').textContent).toContain('own walls')
    // the block in two zones, the second an office 1.2 m down; merged again
    fireEvent.click(steps().getByRole('button', { name: 'Split' }))
    expect(row('Shape').textContent).toContain('2 zones')
    expect(useApp.getState().project.warehouseTypes![0].morphology.zones!.map((z) => [z.id, z.x, z.y])).toEqual([
      ['1', [0, 33], [0, 32]],
      ['z1', [33, 66], [0, 32]],
    ])
    fireEvent.change(screen.getAllByRole('combobox', { name: 'Zone program' })[1], { target: { value: 'office' } })
    fireEvent.change(screen.getAllByRole('textbox', { name: /^Zone level/ })[1], { target: { value: '-1.2' } })
    fireEvent.keyDown(screen.getAllByRole('textbox', { name: /^Zone level/ })[1], { key: 'Enter' })
    const labels = within(plan.querySelector('[data-part-labels]') as HTMLElement)
    expect(labels.getByText('Office · Level −1.2 m')).toBeInTheDocument()
    expect(labels.getByText('Warehouse')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Merge with Zone 2' }))
    expect(useApp.getState().project.warehouseTypes![0].morphology.zones).toEqual([{ id: '1', x: [0, 66], y: [0, 32] }])
  })

  it('elements: one a module, listed by kind with their count and width (parameters only); a level door, a named pattern; drawn on the plan, counted', () => {
    act(() => useUi.setState({ dialog: 'program' }))
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Start its rule set' }))
    for (const s of ['① Grid', '② Hall', '③ Columns', '④ Envelope', '⑤ Shape']) fireEvent.click(screen.getByRole('button', { name: `Lock ${s}` }))
    expect(screen.getByText('Docks · 60')).toBeInTheDocument()
    // no bays, no count, no pitch: a width for all the docks, and no button that places them
    expect(screen.queryByRole('textbox', { name: /^In each bay/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /^Add / })).toBeNull()
    type('Width', '4')
    expect(useApp.getState().project.warehouseTypes![0].elements.every((e) => e.width === 4)).toBe(true)
    expect(row('Elements').textContent).toContain('60 docks')
    // the tools place them (Door and Pattern on the plan: BE.4)
    act(() => useApp.getState().apply((p) => actions.putElements(p, 'wt1', 'door', 'e1', [10], true)))
    act(() => useApp.getState().apply((p) => actions.putElements(p, 'wt1', 'pattern', 'e1', [20], true)))
    expect(row('Elements').textContent).toContain('60 docks · 1 door · 1 mark')
    const plan = screen.getByRole('img', { name: 'The warehouse type in plan' })
    expect(plan.querySelector('[data-doors]')).toHaveAttribute('data-doors', '62')
    expect(plan.querySelectorAll('[data-kind="pattern"]')).toHaveLength(1)
    // the pattern's name
    expect(screen.getByRole('group', { name: 'Downpipe' })).toHaveTextContent('Downpipe · 1')
    type('Name', 'Skylight')
    expect(useApp.getState().project.warehouseTypes![0].elements.find((e) => e.kind === 'pattern')!.name).toBe('Skylight')
    fireEvent.click(screen.getByRole('button', { name: 'Lock ⑥ Elements' }))
    expect(within(row('Elements')).getByRole('img', { name: 'Locked' })).toBeInTheDocument()
  })

  it('the truck court (Decision "Truck court"): the standards’ until typed; a depth and its range; *Standard depth* back', () => {
    act(() => useUi.setState({ dialog: 'program' }))
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Start its rule set' }))
    for (const s of ['① Grid', '② Hall', '③ Columns', '④ Envelope', '⑤ Shape']) fireEvent.click(screen.getByRole('button', { name: `Lock ${s}` }))
    const t = () => useApp.getState().project.warehouseTypes![0]
    expect(field('Block depth').value).toBe('40')
    act(() => useUi.setState({ help: true }))
    expect(screen.getByText("The project’s standard (40 m) until one is typed.")).toBeInTheDocument()
    type('Block depth', '35')
    expect(t().court).toEqual({ depth: 35 })
    type('Range from', '30')
    expect(t().court).toEqual({ depth: 35, range: [30, 35] })
    type('to', '40')
    expect(t().court).toEqual({ depth: 35, range: [30, 40] })
    // a depth out of the range drops it
    type('Block depth', '45')
    expect(t().court).toEqual({ depth: 45 })
    fireEvent.click(screen.getByRole('button', { name: 'Standard depth' }))
    expect(t().court).toBeUndefined()
  })
})

// BE.7 (Goals 9-11): the block editor's header, its Help switch and Approve without Rules
describe('the block editor’s header, Help and Approve (BE.7)', { timeout: 15000 }, () => {
  it('the header reads Block editor for a Warehouse program, with a Program label beside the drop-down and no kind caption; an Office program keeps Program', () => {
    act(() => useUi.setState({ dialog: 'program' }))
    render(<App />)
    const win = within(screen.getByRole('dialog', { name: 'Program' }))
    expect(win.getByRole('heading', { name: 'Block editor' })).toBeInTheDocument()
    expect(win.getByText('Program')).toBeInTheDocument()
    // the drop-down's own option is the only "Warehouse": no duplicate caption beside it
    expect(win.queryByText('Warehouse', { selector: 'span' })).toBeNull()
    fireEvent.change(win.getByRole('combobox', { name: 'Program to edit' }), { target: { value: 'office' } })
    expect(win.getByRole('heading', { name: 'Program' })).toBeInTheDocument()
    expect(win.queryByRole('heading', { name: 'Block editor' })).toBeNull()
    expect(win.getByText('Office', { selector: 'span' })).toBeInTheDocument()
  })

  it('a Help button (aria-pressed) toggles the app’s Help; the long texts show only with it on', () => {
    act(() => useUi.setState({ dialog: 'program', help: false }))
    render(<App />)
    const win = within(screen.getByRole('dialog', { name: 'Program' }))
    fireEvent.click(win.getByRole('button', { name: 'Start its rule set' }))
    const help = win.getByRole('button', { name: 'Help' })
    expect(help).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByText(/Along the length:/)).toBeNull()
    fireEvent.click(help)
    expect(useUi.getState().help).toBe(true)
    expect(help).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getAllByText(/Along the length:/).length).toBeGreaterThan(0)
    fireEvent.click(help)
    expect(useUi.getState().help).toBe(false)
    expect(screen.queryByText(/Along the length:/)).toBeNull()
  })

  it('Approve programs closes the window and never opens Rules; the note about Rules stays behind Help', () => {
    act(() => useUi.setState({ dialog: 'program', help: false }))
    render(<App />)
    const win = within(screen.getByRole('dialog', { name: 'Program' }))
    expect(win.queryByText(/Next, Rules/)).toBeNull()
    act(() => useUi.setState({ help: true }))
    expect(win.getByText(/Next, Rules/)).toBeInTheDocument()
    fireEvent.click(win.getByRole('button', { name: 'Approve programs' }))
    expect(useUi.getState().dialog).toBeNull()
    expect(screen.queryByRole('dialog', { name: 'Rules' })).toBeNull()
  })
})
