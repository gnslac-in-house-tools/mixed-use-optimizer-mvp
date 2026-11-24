// Step 6, parameters only (Decision "Elements by module", BE.5): the elements the tools placed, by kind (docks, level
// doors, patterns by name, truck courts) with their counts and parameters; no field says which bays or how many. A
// width or a name typed applies to every element of its kind with nothing picked on the plan; with some picked (BE.9,
// Decision "Multi-selection"), to those only, the kinds with none picked waiting (their fields off);
// an element wider than its module says so; the court group shows the block's depth and range and each edge's own.
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
import { useUnits } from '../units.ts'
import { useWarehouse } from '../warehouseState.ts'

vi.mock('../../../../views/scene/Scene.tsx', () => ({ Scene: () => <div data-testid="scene" /> }))
vi.mock('../WarehouseScene.tsx', () => ({ WarehouseScene: () => <div data-testid="warehouse-scene" /> }))

const type = () => useApp.getState().project.warehouseTypes![0]
const apply = (f: (p: ReturnType<typeof useApp.getState>['project']) => ReturnType<typeof useApp.getState>['project']) => act(() => useApp.getState().apply(f))

beforeEach(() => {
  localStorage.clear()
  let p = actions.addWarehouseType(demoProject()).project
  // the new block: 60 docks on the front's interior bays (e1, modules 3–62); step 6 open
  for (const s of ['grid', 'hall', 'columns', 'envelope', 'morphology'] as const) p = actions.lockWarehouseStep(p, 'wt1', s)
  useApp.setState({ project: p, derived: derive(p), history: emptyHistory(), dragStart: null, selection: { massId: null, vertex: null, massIds: [] }, option: p.options[0].id })
  useUi.setState({ dialog: 'program', view: 'plan', panels: { left: true, right: true }, sheet: null })
  useWarehouse.setState({ programId: null, typeId: null, shown: null, tool: 'select', picked: [] })
  useToast.setState({ toast: null })
  useUnits.setState({ unit: 'm' })
})

const panel = () => document.querySelector('[data-step-fields="elements"]') as HTMLElement
const group = (name: string) => within(panel()).getByRole('group', { name })
const field = (g: HTMLElement, label: string) => within(g).getByRole('textbox', { name: new RegExp(`^${label}`) }) as HTMLInputElement
const typeIn = (el: HTMLInputElement, v: string) => {
  fireEvent.change(el, { target: { value: v } })
  fireEvent.keyDown(el, { key: 'Enter' })
}

describe('step 6: parameters only', () => {
  it('lists docks, level doors, patterns by name and truck courts, each with its count; no bays, every or offset field', () => {
    apply((p) => actions.putElements(p, 'wt1', 'door', 'e1', [10, 11], true))
    apply((p) => actions.putElements(p, 'wt1', 'pattern', 'e1', [20, 21, 22], true, 'Downpipe'))
    apply((p) => actions.putElements(p, 'wt1', 'pattern', 'e1', [30], true, 'Skylight'))
    render(<App />)
    expect(group('Docks')).toHaveTextContent('Docks · 60')
    expect(group('Level doors')).toHaveTextContent('Level doors · 2')
    expect(group('Patterns')).toHaveTextContent('Patterns')
    expect(group('Downpipe')).toHaveTextContent('Downpipe · 3')
    expect(group('Skylight')).toHaveTextContent('Skylight · 1')
    expect(group('Truck courts')).toHaveTextContent('Truck courts · 1')
    // nothing says which bays, how many, or at what offset
    expect(within(panel()).queryAllByRole('textbox').every((i) => !/bays|every|offset|count|pitch/i.test(i.getAttribute('aria-label') ?? ''))).toBe(true)
    expect(panel().textContent).not.toMatch(/\bbays\b|\bevery\b|\boffset\b/i)
    expect(screen.queryByRole('button', { name: /^Add / })).toBeNull()
  })

  it('a group of nothing is not listed; with no element at all it says where they come from', () => {
    apply((p) => actions.removeElements(p, 'wt1', type().elements.map((e) => e.id)))
    render(<App />)
    expect(within(panel()).queryByRole('group')).toBeNull()
    expect(panel()).toHaveTextContent('Dock, Door and Pattern')
  })

  it('a width typed with nothing picked changes every dock, and only the docks', () => {
    apply((p) => actions.putElements(p, 'wt1', 'door', 'e1', [10], true))
    render(<App />)
    typeIn(field(group('Docks'), 'Width'), '3.5')
    expect(type().elements.filter((e) => e.kind === 'dock').every((e) => e.width === 3.5)).toBe(true)
    expect(type().elements.find((e) => e.kind === 'door')!.width).toBe(4)
  })

  it('with a dock picked, a width typed changes that dock alone; the kinds with none picked wait', () => {
    apply((p) => actions.putElements(p, 'wt1', 'door', 'e1', [10], true))
    render(<App />)
    act(() => useWarehouse.getState().setPicked([{ kind: 'element', id: 'e30' }]))
    expect(panel()).toHaveTextContent('1 picked: changes apply to it only')
    expect(field(group('Level doors'), 'Width').disabled).toBe(true)
    expect(field(group('Truck courts'), 'Block depth').disabled).toBe(true)
    typeIn(field(group('Docks'), 'Width'), '2.5')
    expect(type().elements.filter((e) => e.width === 2.5).map((e) => e.id)).toEqual(['e30'])
    // the door picked: the docks have none picked, so they wait
    const door = type().elements.find((e) => e.kind === 'door')!
    act(() => useWarehouse.getState().setPicked([{ kind: 'element', id: door.id }]))
    expect(field(group('Docks'), 'Width').disabled).toBe(true)
    expect(field(group('Level doors'), 'Width').disabled).toBe(false)
  })

  it('two picked, of two kinds: changes apply to those only; nothing picked: every kind to all of its kind', () => {
    apply((p) => actions.putElements(p, 'wt1', 'door', 'e1', [10, 11], true))
    render(<App />)
    const doors = type().elements.filter((e) => e.kind === 'door')
    act(() => useWarehouse.getState().setPicked([{ kind: 'element', id: 'e30' }, { kind: 'element', id: doors[0].id }]))
    expect(panel()).toHaveTextContent('2 picked: changes apply to those only')
    typeIn(field(group('Docks'), 'Width'), '2.5')
    typeIn(field(group('Level doors'), 'Width'), '3.5')
    expect(type().elements.filter((e) => e.width === 2.5).map((e) => e.id)).toEqual(['e30'])
    expect(type().elements.filter((e) => e.width === 3.5).map((e) => e.id)).toEqual([doors[0].id])
    act(() => useWarehouse.getState().setPicked([]))
    expect(panel()).not.toHaveTextContent('picked')
    expect(field(group('Docks'), 'Width').disabled).toBe(false)
    expect(field(group('Level doors'), 'Width').disabled).toBe(false)
    typeIn(field(group('Level doors'), 'Width'), '3')
    expect(type().elements.filter((e) => e.kind === 'door').every((e) => e.width === 3)).toBe(true)
  })

  it('a width the elements of a kind differ in shows —; one typed makes them equal', () => {
    apply((p) => actions.setElementsWidth(p, 'wt1', ['e1'], 2))
    render(<App />)
    const w = field(group('Docks'), 'Width')
    expect(w.value).toBe('')
    expect(w.placeholder).toBe('—')
    typeIn(w, '3')
    expect(type().elements.every((e) => e.width === 3)).toBe(true)
  })

  it('a pattern’s name typed renames every pattern of that name, and its width is its own', () => {
    apply((p) => actions.putElements(p, 'wt1', 'pattern', 'e1', [20, 21], true, 'Downpipe'))
    apply((p) => actions.putElements(p, 'wt1', 'pattern', 'e1', [30], true, 'Skylight'))
    render(<App />)
    typeIn(field(group('Downpipe'), 'Name'), 'Gutter')
    expect(type().elements.filter((e) => e.kind === 'pattern').map((e) => e.name)).toEqual(['Gutter', 'Gutter', 'Skylight'])
    typeIn(field(group('Gutter'), 'Width'), '0.5')
    expect(type().elements.filter((e) => e.kind === 'pattern').map((e) => e.width)).toEqual([0.5, 0.5, 0.3])
  })

  it('an element wider than its module says so', () => {
    apply((p) => actions.putElements(p, 'wt1', 'door', 'e1', [10], true))
    render(<App />)
    // modules are 3 m: a door of 4 m is wider than its module, the docks of 3 m are not
    expect(group('Level doors')).toHaveTextContent('wider than its module')
    expect(group('Docks')).not.toHaveTextContent('wider than its module')
    typeIn(field(group('Level doors'), 'Width'), '3')
    expect(group('Level doors')).not.toHaveTextContent('wider than its module')
    typeIn(field(group('Docks'), 'Width'), '3.5')
    expect(group('Docks')).toHaveTextContent('wider than its module')
  })

  it('the court group: the block’s depth and range, each edge’s own depth, a court without docks marked', () => {
    apply((p) => actions.setEdgeCourt(p, 'wt1', 'e1', { depth: 50 }))
    apply((p) => actions.setEdgeCourt(p, 'wt1', 'e3', {}))
    render(<App />)
    const c = group('Truck courts')
    expect(c).toHaveTextContent('Truck courts · 2')
    expect(field(c, 'Block depth').value).toBe('40')
    typeIn(field(c, 'Block depth'), '35')
    expect(type().court).toEqual({ depth: 35 })
    typeIn(field(c, 'Range from'), '30')
    typeIn(field(c, 'to'), '45')
    expect(type().court).toEqual({ depth: 35, range: [30, 45] })
    const e1 = c.querySelector('[data-court-edge="e1"]') as HTMLElement
    expect(e1).toHaveTextContent('E1 front')
    expect(field(e1, 'Own depth').value).toBe('50')
    const e3 = c.querySelector('[data-court-edge="e3"]') as HTMLElement
    expect(e3).toHaveTextContent('E3 back')
    expect(e3).toHaveTextContent('court without docks')
    expect(field(e3, 'Own depth').value).toBe('')
    typeIn(field(e3, 'Own depth'), '25')
    expect(type().courts).toEqual([{ edge: 'e1', depth: 50 }, { edge: 'e3', depth: 25 }])
  })
})

describe('units (BE.8): the toggle beside Elements', () => {
  it('feet: the width shows in ft and a typed width is stored in metres; back to m shows the stored value', () => {
    render(<App />)
    const toggle = screen.getByRole('group', { name: 'Length unit' })
    fireEvent.click(within(toggle).getByRole('button', { name: 'ft' }))
    expect(field(group('Docks'), 'Width').value).toBe('9.84')
    typeIn(field(group('Docks'), 'Width'), '10')
    expect(type().elements.filter((e) => e.kind === 'dock').every((e) => e.width === 3.048)).toBe(true)
    fireEvent.click(within(toggle).getByRole('button', { name: 'm' }))
    expect(field(group('Docks'), 'Width').value).toBe('3.05')
    expect(type().elements.find((e) => e.kind === 'dock')!.width).toBe(3.048)
  })
})
