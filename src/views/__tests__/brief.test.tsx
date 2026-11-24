// The Brief workspace (Decision "Brief"): in the viewport's place, a row per program with what the client asks; how
// the active option stands against it is the Summary's *Against the brief* tab, which the Brief opens (Decision
// "Summary tabs"); a new mass's size in the swatch's box (Decision "New mass size"); Approve brief → Rules (Decision
// "Rules under the graph": the rules are the Graph's now).
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../App.tsx'
import { pickMenu } from './pickMenu.ts'
import { derive } from '../../engine/derive.ts'
import { demoProject } from '../../state/demo.ts'
import { emptyHistory } from '../../state/history.ts'
import { NO_SELECTION, useApp } from '../../state/store.ts'
import { useToast } from '../layout/toast.ts'
import { useUi } from '../layout/ui.ts'
import { addWarehouseType } from '../../modules/warehouse/actions.ts'

const addType = (p: Parameters<typeof addWarehouseType>[0]) => addWarehouseType(p).project

vi.mock('../scene/Scene.tsx', () => ({ Scene: () => <div data-testid="scene" /> }))

beforeEach(() => {
  localStorage.clear()
  const p = demoProject()
  useApp.setState({ project: p, derived: derive(p, 'o1'), history: emptyHistory(), dragStart: null, selection: NO_SELECTION, level: 'l1', showAll: false, option: 'o1' })
  useUi.setState({ dialog: null, view: 'plan', rail: 'layers', summaryTab: 'overview', panels: { left: true, right: true }, sheet: null, help: false })
})

const s = () => useApp.getState()
const program = (id: string) => s().project.programs.find((g) => g.id === id)!
const row = (id: string) => document.querySelector<HTMLElement>(`[data-program-row="${id}"]`)!
/** The Summary's table of the option against the brief, and a program's row in it. */
const against = () => screen.getByRole('table', { name: 'The option against the brief' })
const stands = (id: string) => against().querySelector<HTMLElement>(`[data-brief-row="${id}"]`)!
const type = (field: HTMLElement, v: string) => {
  fireEvent.change(field, { target: { value: v } })
  fireEvent.blur(field)
}

/** The Brief window over the app (Decision "Brief and Rules as windows"), from Design › Brief… (the Brief tab's tile and the
 *  ribbon's Brief went: Phases Q.8 and AS.3). */
function openBrief() {
  pickMenu('Design', 'Brief…')
  return screen.getByRole('region', { name: 'Brief' })
}

describe('Brief workspace', () => {
  it('a window over the app: the viewport, the panels and the KPI strip stay behind it; the Summary on Against the brief; ✕ or Escape close it (Decision "Brief and Rules as windows")', () => {
    render(<App />)
    const brief = openBrief()
    const dialog = screen.getByRole('dialog', { name: 'Brief' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toContainElement(brief)
    expect(screen.getByRole('region', { name: 'Viewport' })).toBeInTheDocument()
    expect(screen.getByRole('complementary', { name: 'Layers and properties' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Project figures' })).toBeInTheDocument()
    expect(screen.getByRole('tabpanel', { name: 'Against the brief' })).toBeInTheDocument()
    expect(within(within(brief).getByRole('table')).getAllByRole('row')).toHaveLength(1 + 4 + 1) // head, programs, total
    expect(useUi.getState().dialog).toBe('brief')
    // the design's keys do not reach behind it: Escape closes the window, nothing else
    act(() => useApp.getState().select('m1'))
    fireEvent.keyDown(window, { key: 'Delete' })
    expect(useApp.getState().project.masses.some((m) => m.id === 'm1')).toBe(true)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(useApp.getState().selection.massId).toBe('m1')
    openBrief()
    fireEvent.click(screen.getByRole('button', { name: 'Close the Brief' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('its link shows the Summary on Against the brief, hidden or not', () => {
    render(<App />)
    const brief = openBrief()
    act(() => useUi.setState({ summaryTab: 'issues', panels: { left: true, right: false } }))
    expect(within(brief).getByText(/How Option 1 stands against it/)).toBeInTheDocument()
    fireEvent.click(within(brief).getByRole('button', { name: 'Summary › Against the brief' }))
    expect(useUi.getState()).toMatchObject({ summaryTab: 'brief', panels: { right: true } })
    expect(screen.getByRole('tabpanel', { name: 'Against the brief' })).toBeInTheDocument()
  })

  it('no rules in it (they are the next steps); Edit programs goes on to Program, Approve programs closes it, Rules opens on its own', () => {
    render(<App />)
    const brief = openBrief()
    expect(within(brief).queryByRole('region', { name: 'Rules' })).toBeNull()
    fireEvent.click(within(brief).getByRole('button', { name: 'Edit programs → Program' }))
    expect(useUi.getState().dialog).toBe('program')
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Program' })).getByRole('button', { name: 'Approve programs' }))
    // Approve never opens Rules (Phase BE.7)
    expect(useUi.getState().dialog).toBeNull()
    act(() => useUi.getState().openDialog('rules'))
    expect(screen.getByRole('dialog', { name: 'Rules' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Rules' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Graph of programs' })).toBeInTheDocument()
    // Rules has its own: Approve rules → Plan closes the window (Decision "Approve rules")
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Rules' })).getByRole('button', { name: 'Approve rules → Plan' }))
    expect(useUi.getState().dialog).toBeNull()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('a row: what is asked and the area per mass; the Summary, what the option has, coloured as it stands', () => {
    render(<App />)
    const brief = openBrief()
    const w = row('warehouse')
    expect(within(w).getByRole('textbox', { name: 'Target area of Warehouse' })).toHaveValue('24000')
    expect(within(w).getByRole('textbox', { name: 'Target masses of Warehouse' })).toHaveValue('2')
    // the area per mass, in the row's rule set (▸)
    fireEvent.click(within(w).getByRole('button', { name: "Warehouse's rule set" }))
    expect(document.querySelector('[data-program-rules="warehouse"]')).toHaveTextContent('Per mass 12,000 m²')
    // no columns of the option in the Brief
    expect(within(brief).queryByText('Option')).toBeNull()
    expect(within(brief).queryByText('Δ')).toBeNull()
    expect(within(brief).getByRole('rowheader', { name: 'Total' }).closest('tr')).toHaveTextContent('25,224 m²')
    // the Summary: the warehouses meet it (±0, 0 %), the office is 400 m² short (−33 %), the guard house not there
    expect(within(stands('warehouse')).getByText('24,000')).toHaveClass('text-status-within')
    expect(stands('warehouse')).toHaveTextContent('of 24,000±0±0 %2 / 2')
    expect(within(stands('office')).getByText('800')).toHaveClass('text-status-over')
    expect(stands('office')).toHaveTextContent('−400−33 %')
    expect(within(stands('guardhouse')).getByText('0 / 1')).toHaveClass('text-status-over')
    expect(against().querySelector('[data-brief-row="outdoor-storage"]')).toBeNull() // no target, none in the option
    const total = within(against()).getByRole('rowheader', { name: 'Total' }).closest('tr')!
    expect(total).toHaveTextContent('24,800of 25,224−424−2 %')
    expect(within(total).getByText('24,800')).toHaveClass('text-status-within')
  })

  it('typing a target is one undo step; emptying it takes it away', () => {
    render(<App />)
    openBrief()
    type(within(row('office')).getByRole('textbox', { name: 'Target area of Office' }), '800')
    expect(program('office').target).toEqual({ area: 800, count: 1 })
    expect(stands('office').querySelector('[title="800 m²: meets the target"]')).toHaveTextContent('800of 800')
    expect(within(stands('office')).getAllByText('800')[0]).toHaveClass('text-status-within')
    expect(s().history.past).toHaveLength(1)
    type(within(row('office')).getByRole('textbox', { name: 'Target masses of Office' }), '')
    type(within(row('office')).getByRole('textbox', { name: 'Target area of Office' }), '')
    expect('target' in program('office')).toBe(false)
    // not a whole number: nothing changes
    type(within(row('office')).getByRole('textbox', { name: 'Target masses of Office' }), '1.5')
    expect('target' in program('office')).toBe(false)
  })

  it('name and built; + Program; the bin deletes, asking first when masses use it', () => {
    render(<App />)
    const brief = openBrief()
    type(within(row('office')).getByRole('textbox', { name: 'Name of Office' }), 'HQ')
    expect(program('office').name).toBe('HQ')
    fireEvent.click(within(row('outdoor-storage')).getByRole('button', { name: "Outdoor storage's rule set" }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Outdoor storage is built' }))
    expect(program('outdoor-storage').built).toBe(true)
    const bin = within(row('warehouse')).getByRole('button', { name: 'Delete Warehouse' })
    expect(bin).toHaveAttribute('title', 'Delete Warehouse, its rules and its 2 masses (asks first)')
    fireEvent.click(bin)
    expect(useToast.getState().confirmation?.text).toBe('Delete Warehouse and its 2 masses? Its rules go too.')
    expect(s().project.programs.some((g) => g.id === 'warehouse')).toBe(true) // not until it is confirmed
    act(() => useToast.getState().closeConfirmation())
    fireEvent.click(within(brief).getByRole('button', { name: '+ Program' }))
    expect(within(row('p1')).getByRole('textbox', { name: 'Target area of Program 1' })).toHaveValue('')
    fireEvent.click(within(row('p1')).getByRole('button', { name: 'Delete Program 1' }))
    expect(s().project.programs.some((g) => g.id === 'p1')).toBe(false)
  })
})

describe('the brief’s numbers step (Decision "Brief steppers")', () => {
  it('Masses: ▲▼ commit a step at once (Shift: ten, never below 0); an empty one steps up from 0 and not down', () => {
    render(<App />)
    openBrief()
    const w = row('warehouse')
    fireEvent.click(within(w).getByRole('button', { name: 'Up: Target masses of Warehouse' }))
    expect(program('warehouse').target).toEqual({ area: 24000, count: 3 })
    fireEvent.click(within(w).getByRole('button', { name: 'Down: Target masses of Warehouse' }), { shiftKey: true })
    expect(program('warehouse').target!.count).toBe(0)
    const storage = row('outdoor-storage')
    fireEvent.click(within(storage).getByRole('button', { name: 'Down: Target masses of Outdoor storage' }))
    expect(program('outdoor-storage').target).toBeUndefined()
    fireEvent.click(within(storage).getByRole('button', { name: 'Up: Target masses of Outdoor storage' }))
    expect(program('outdoor-storage').target).toEqual({ area: null, count: 1 })
  })

  it('the arrow keys step while typing (area by 100 m²), committed on leaving like a typed number', () => {
    render(<App />)
    openBrief()
    const area = within(row('warehouse')).getByRole('textbox', { name: 'Target area of Warehouse' })
    fireEvent.keyDown(area, { key: 'ArrowUp' })
    expect(area).toHaveValue('24100')
    expect(program('warehouse').target!.area).toBe(24000)
    fireEvent.keyDown(area, { key: 'ArrowUp', shiftKey: true })
    fireEvent.blur(area)
    expect(program('warehouse').target!.area).toBe(25100)
  })
})

describe('the brief’s order (Decision "Program order")', () => {
  it('a row’s grip drags it up or down (a line shows where it lands); ↑ ↓ on the grip move it; one undo step each', () => {
    render(<App />)
    openBrief()
    const order = () => s().project.programs.map((g) => g.id)
    const grip = (id: string) => within(row(id)).getByRole('button', { name: `Move ${program(id).name}` })
    fireEvent.dragStart(grip('guardhouse'))
    fireEvent.dragOver(row('warehouse'))
    // dragged up: the line on top of the row it lands on
    expect(row('warehouse').querySelector('td')!.className).toContain('inset_0_2px')
    fireEvent.drop(row('warehouse'))
    expect(order()).toEqual(['guardhouse', 'warehouse', 'office', 'outdoor-storage'])
    expect(s().history.past).toHaveLength(1)
    expect(row('warehouse').querySelector('td')!.className).not.toContain('inset')
    // dragged down: under it
    fireEvent.dragStart(grip('guardhouse'))
    fireEvent.dragOver(row('office'))
    expect(row('office').querySelector('td')!.className).toContain('inset_0_-2px')
    fireEvent.drop(row('office'))
    expect(order()).toEqual(['warehouse', 'office', 'guardhouse', 'outdoor-storage'])
    // the keyboard
    fireEvent.keyDown(grip('outdoor-storage'), { key: 'ArrowUp' })
    expect(order()).toEqual(['warehouse', 'office', 'outdoor-storage', 'guardhouse'])
    fireEvent.keyDown(grip('warehouse'), { key: 'ArrowUp' })
    expect(order()).toEqual(['warehouse', 'office', 'outdoor-storage', 'guardhouse'])
  })
})

describe('a new mass’s size (Decision "New mass size")', () => {
  it('in the table: its area per mass at 2:1, in grey; typed on hover, its own (in ink), with 2:1 to go back', () => {
    render(<App />)
    openBrief()
    const cell = (id: string) => row(id).querySelector<HTMLElement>('[data-new-mass]')!
    expect(cell('guardhouse')).toHaveAttribute('data-new-mass', 'default')
    expect(cell('guardhouse')).toHaveTextContent('2:1 · 7 × 3.5 m')
    expect(within(cell('guardhouse')).getByText('2:1 · 7 × 3.5 m')).toHaveClass('text-ink-tertiary')
    // no target: its typical area
    expect(cell('outdoor-storage')).toHaveTextContent('2:1 · 69 × 34.5 m')
    type(within(cell('guardhouse')).getByRole('textbox', { name: 'New Guard house width' }), '8')
    expect(program('guardhouse').size).toEqual({ width: 8, depth: 3.5 })
    expect(cell('guardhouse')).toHaveAttribute('data-new-mass', 'own')
    expect(within(cell('guardhouse')).getByText('8 × 3.5 m')).toHaveClass('text-ink')
    // the arrow keys step it by a metre
    const depth = within(cell('guardhouse')).getByRole('textbox', { name: 'New Guard house depth' })
    fireEvent.keyDown(depth, { key: 'ArrowUp' })
    fireEvent.blur(depth)
    expect(program('guardhouse').size).toEqual({ width: 8, depth: 4.5 })
    fireEvent.click(within(cell('guardhouse')).getByRole('button', { name: 'Guard house: back to 2:1' }))
    expect(program('guardhouse').size).toBeUndefined()
    expect(cell('guardhouse')).toHaveTextContent('2:1 · 7 × 3.5 m')
  })

  it('its lock fixes the size the optimizer keeps; a free one says how elongated it may become (Decision "Fixed size")', () => {
    render(<App />)
    openBrief()
    const cell = () => row('office').querySelector<HTMLElement>('[data-new-mass]')!
    // fixing the default fixes its numbers: 1,200 m² at 2:1
    expect(program('office').size).toBeUndefined()
    fireEvent.click(within(cell()).getByRole('button', { name: 'Fix the size of Office' }))
    expect(program('office').size).toEqual({ width: 49, depth: 24.5, fixed: true })
    expect(cell()).toHaveAttribute('data-new-mass', 'fixed')
    expect(within(cell()).getByRole('button', { name: 'Unfix the size of Office' })).toHaveAttribute('aria-pressed', 'true')
    // fixed: no 2:1 and no limit to type; a typed side keeps it fixed
    expect(within(cell()).queryByRole('button', { name: 'Office: back to 2:1' })).toBeNull()
    expect(within(cell()).queryByRole('textbox', { name: 'Office: the most elongated a mass may be' })).toBeNull()
    type(within(cell()).getByRole('textbox', { name: 'New Office width' }), '30')
    expect(program('office').size).toEqual({ width: 30, depth: 24.5, fixed: true })
    // unfixed, the numbers stay its own
    fireEvent.click(within(cell()).getByRole('button', { name: 'Unfix the size of Office' }))
    expect(program('office').size).toEqual({ width: 30, depth: 24.5 })
    expect(cell()).toHaveAttribute('data-new-mass', 'own')
    const limit = within(cell()).getByRole('textbox', { name: 'Office: the most elongated a mass may be' })
    expect(limit).toHaveAttribute('placeholder', '3')
    type(limit, '2.5')
    expect(program('office').maxAspect).toBe(2.5)
    expect(cell()).toHaveTextContent('up to 2.5:1')
    type(limit, '')
    expect(program('office').maxAspect).toBeUndefined()
  })

  it('the bin is the last column, at the table’s end', () => {
    render(<App />)
    const brief = openBrief()
    const head = within(brief).getAllByRole('columnheader')
    expect(head.map((h) => h.textContent)).toEqual(['', 'Program', 'Kind', 'Target aream²', 'Masses#', 'SizeW × D m', '', ''])
    expect(within(brief).getByRole('table')).not.toHaveClass('max-w-[52rem]')
  })
})

describe('a program’s rule set (Decision "Program rule set", K.2)', () => {
  const kind = (id: string) => within(row(id)).getByRole('combobox', { name: /^Kind of / })
  const rules = (name: string) => {
    fireEvent.click(screen.getByRole('button', { name: `${name}'s rule set` }))
    return within(screen.getByRole('group', { name: `${name}'s rule set` }))
  }

  it('its kind: Warehouse, Office or Free; one undo step', () => {
    render(<App />)
    openBrief()
    expect([kind('warehouse'), kind('office'), kind('guardhouse')].map((k) => (k as HTMLSelectElement).value)).toEqual(['warehouse', 'office', 'free'])
    fireEvent.change(kind('guardhouse'), { target: { value: 'office' } })
    expect(program('guardhouse').kind).toBe('office')
    expect(s().history.past).toHaveLength(1)
    // Edit…: the Program window on it, an office's general level (K.3)
    fireEvent.click(within(row('office')).getByRole('button', { name: 'Edit Office' }))
    const win = within(screen.getByRole('dialog', { name: 'Program' }))
    expect((win.getByRole('combobox', { name: 'Program to edit' }) as HTMLSelectElement).value).toBe('office')
    expect(win.getByRole('region', { name: 'General level' })).toHaveTextContent('Kind')
  })

  it('its own grid and range while it has no type: typed, emptied', () => {
    render(<App />)
    openBrief()
    const r = rules('Office')
    type(r.getByRole('textbox', { name: 'Office grid bay x' }), '8')
    expect(program('office').grid).toEqual({ x: 8, y: 12, modules: 4 })
    type(r.getByRole('textbox', { name: 'Office width from' }), '30')
    type(r.getByRole('textbox', { name: 'Office width to' }), '40')
    expect(program('office').range).toEqual({ width: [30, 40] })
    type(r.getByRole('textbox', { name: 'Office grid bay x' }), '')
    expect(program('office').grid).toBeUndefined()
  })

  it('Edit… opens the Program window on it; Start its rule set gives it its type; its grid, range and hall are then the type’s, edited either side', () => {
    render(<App />)
    openBrief()
    fireEvent.click(within(row('warehouse')).getByRole('button', { name: 'Edit Warehouse' }))
    expect(useUi.getState().dialog).toBe('program')
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Program' })).getByRole('button', { name: 'Start its rule set' }))
    const t = () => s().project.warehouseTypes!.find((x) => x.program === 'warehouse')!
    expect(t()).toBeDefined()
    expect(screen.getByRole('list', { name: 'Steps' })).toBeInTheDocument()
    act(() => useUi.getState().closeDialog())
    openBrief()
    // the Size column: the hall, length × width
    expect(within(row('warehouse')).getByRole('textbox', { name: 'Warehouse hall length' })).toHaveValue('200')
    type(within(row('warehouse')).getByRole('textbox', { name: 'Warehouse hall width' }), '108')
    expect(t().hall.width).toBe(108)
    const r = rules('Warehouse')
    expect(r.getByRole('textbox', { name: 'Warehouse grid bay x' })).toHaveValue('12')
    type(r.getByRole('textbox', { name: 'Warehouse grid modules' }), '3')
    expect(t().grid.modules).toBe(3)
    type(r.getByRole('textbox', { name: 'Warehouse length from' }), '180')
    expect(t().hall.range).toEqual({ length: [180, 180] })
    expect(program('warehouse').grid).toBeUndefined()
  })

  it('a Warehouse program that stops being one loses its type, after a confirmation', () => {
    render(<App />)
    openBrief()
    act(() => s().apply((p) => ({ ...p, ...addType(p) })))
    fireEvent.change(kind('warehouse'), { target: { value: 'free' } })
    expect(useToast.getState().confirmation?.text).toMatch(/^Warehouse as Free: its warehouse type Warehouse A goes\./)
    expect(program('warehouse').kind).toBe('warehouse')
    act(() => useToast.getState().confirmation!.onContinue())
    expect([program('warehouse').kind, s().project.warehouseTypes]).toEqual(['free', undefined])
  })
})

describe('around the brief', () => {
  it('the Summary’s tab shows each program with a target or masses against it; with no targets, a link to the Brief', () => {
    render(<App />)
    expect(screen.queryByRole('region', { name: 'Against the brief' })).toBeNull() // on Overview
    fireEvent.click(within(screen.getByRole('tablist', { name: 'Summary' })).getByRole('tab', { name: 'Against the brief' }))
    expect(screen.getByRole('heading', { name: 'Against the brief' })).toBeInTheDocument() // the panel's header
    expect(stands('warehouse')).toHaveTextContent('of 24,000')
    expect(stands('office')).toHaveTextContent('−33 %')
    expect(within(screen.getByRole('region', { name: 'Against the brief' })).getByRole('button', { name: 'Brief' })).toBeInTheDocument()
    act(() => {
      for (const g of s().project.programs) s().apply((p) => ({ ...p, programs: p.programs.map((x) => (x.id === g.id ? { ...x, target: undefined } : x)) }))
    })
    fireEvent.click(within(screen.getByRole('region', { name: 'Against the brief' })).getByRole('button', { name: 'Brief' }))
    expect(useUi.getState().dialog).toBe('brief')
  })
})
