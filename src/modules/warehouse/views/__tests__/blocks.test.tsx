// The Blocks panel (Phase B.1, Decision "Smart blocks"): Blocks, the panel's second tab since Phase AS.3 (it was on the left rail, under Levels), where the typology
// offers a warehouse; a card per warehouse type with its plan and its copies; a click picks it (a copy is placed by a drag, by Place in
// its menu, or by the tutorial's verb: blockPick.test.tsx), ✎ opens the type in the Program window, + New block begins one there; no tool or tab changes.
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../../../App.tsx'
import { derive } from '../../../../engine/derive.ts'
import { demoProject } from '../../../../state/demo.ts'
import { emptyHistory } from '../../../../state/history.ts'
import { useApp } from '../../../../state/store.ts'
import { blank } from '../../../../typologies/blank.ts'
import { TYPOLOGIES } from '../../../../typologies/index.ts'
import { actions } from '../../../../state/actions/index.ts'
import { useUi } from '../../../../views/layout/ui.ts'
import { useWarehouse } from '../warehouseState.ts'
import { useBlocksFilter } from '../BlocksPanel.tsx'

vi.mock('../../../../views/scene/Scene.tsx', () => ({ Scene: () => <div data-testid="scene" /> }))
vi.mock('../WarehouseScene.tsx', () => ({ WarehouseScene: () => <div data-testid="warehouse-scene" /> }))

beforeEach(() => {
  localStorage.clear()
  const p = actions.addWarehouseType(demoProject()).project
  useApp.setState({ project: p, derived: derive(p), history: emptyHistory(), dragStart: null, selection: { massId: null, vertex: null, massIds: [] }, option: p.options[0].id })
  useUi.setState({ dialog: null, view: 'plan', rail: 'layers', summaryTab: 'overview', panels: { left: true, right: true }, sheet: null })
  useWarehouse.setState({ programId: null, typeId: null, shown: null })
  useBlocksFilter.setState({ show: 'all', program: null })
})

const rail = () => screen.getByRole('tablist', { name: 'Panel tabs' })

describe('the Blocks panel', { timeout: 15000 }, () => {
  it('Blocks is the panel’s second tab; its cards pick (Place, from the menu, puts a copy), ✎ edits the block, + New block begins one', () => {
    render(<App />)
    expect(within(rail()).getAllByRole('tab').map((t) => t.getAttribute('aria-label') ?? t.textContent)).toEqual(['Layers', 'Blocks', 'Properties', 'Optimize', 'Agent'])
    fireEvent.click(within(rail()).getByRole('tab', { name: /Blocks/ }))
    expect(useUi.getState()).toMatchObject({ rail: 'blocks' })
    const panel = () => screen.getByRole('tabpanel', { name: 'Blocks' })
    const card = within(panel()).getByRole('option', { name: 'Warehouse A' })
    expect(card.querySelector('svg polygon')).not.toBeNull()
    expect(card).toHaveAttribute('draggable', 'true')
    expect(card.textContent).toContain('×0')

    // a click picks the block and places nothing
    fireEvent.click(card)
    expect(useApp.getState().project.buildings.at(-1)!.warehouse).toBeUndefined()
    expect(card).toHaveAttribute('aria-selected', 'true')
    fireEvent.contextMenu(card)
    fireEvent.click(screen.getByRole('menuitem', { name: /^Place/ }))
    const copy = useApp.getState().project.buildings.at(-1)!
    expect(copy.warehouse?.type).toBe('wt1')
    expect(within(panel()).getByRole('option', { name: 'Warehouse A' }).textContent).toContain('×1')

    fireEvent.click(within(panel()).getByRole('button', { name: 'Edit Warehouse A' }))
    expect(useUi.getState().dialog).toBe('program')
    expect(useWarehouse.getState().typeId).toBe('wt1')
    act(() => useUi.getState().closeDialog())

    fireEvent.click(within(panel()).getByRole('button', { name: '+ New block' }))
    expect(useApp.getState().project.warehouseTypes).toHaveLength(2)
    expect(useUi.getState().dialog).toBe('program')
  })

  it('where the typology offers no warehouse, there is no Blocks (every typology that is known offers it since Phase D.2)', () => {
    TYPOLOGIES.push({ ...blank, id: 'bare', name: 'Bare', modules: ['terrain'] })
    try {
      const p = { ...useApp.getState().project, typology: 'bare', warehouseTypes: undefined }
      act(() => useApp.setState({ project: p, derived: derive(p) }))
      render(<App />)
      expect(within(rail()).queryByRole('tab', { name: /Blocks/ })).toBeNull()
    } finally {
      TYPOLOGIES.pop()
    }
  })

  it('the library beside the project’s (Phase BL.2): All by default, This project, Library, by program; a library block clicked comes in linked with a copy, one undo step', () => {
    render(<App />)
    fireEvent.click(within(rail()).getByRole('tab', { name: /Blocks/ }))
    const panel = () => screen.getByRole('tabpanel', { name: 'Blocks' })
    const cards = () => within(within(panel()).getByRole('listbox', { name: 'Blocks' })).getAllByRole('option').map((li) => li.getAttribute('data-block') ?? li.getAttribute('data-library-block'))
    expect(cards()).toEqual(['wt1', 'gfit-cross-dock', 'gfit-rear-load'])
    fireEvent.click(within(panel()).getByRole('button', { name: 'This project' }))
    expect(cards()).toEqual(['wt1'])
    fireEvent.click(within(panel()).getByRole('button', { name: 'Library' }))
    expect(cards()).toEqual(['gfit-cross-dock', 'gfit-rear-load'])
    fireEvent.change(within(panel()).getByRole('combobox', { name: 'Program' }), { target: { value: 'Rear-load' } })
    expect(cards()).toEqual(['gfit-rear-load'])

    const before = useApp.getState().project
    // a click on a library block picks it; Place brings it into the project with a copy of it
    fireEvent.contextMenu(within(within(panel()).getByRole('listbox', { name: 'Blocks' })).getByRole('option', { name: 'Rear-load' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /^Place/ }))
    const p = useApp.getState().project
    const t = p.warehouseTypes!.find((x) => x.library?.id === 'gfit-rear-load')!
    expect(p.buildings.at(-1)!.warehouse?.type).toBe(t.id)
    expect(within(within(panel()).getByRole('listbox', { name: 'Blocks' })).getByRole('option', { name: 'Rear-load' }).textContent).toContain('In project')
    act(() => useApp.getState().undo())
    expect(useApp.getState().project.warehouseTypes).toEqual(before.warehouseTypes)
    expect(useApp.getState().project.masses).toEqual(before.masses)
  })
})
