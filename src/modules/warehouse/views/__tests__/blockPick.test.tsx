// The Blocks tab's pick (Phase AS.4 task 6, Decision "One menu"): a click on a card picks the block and places nothing (a drag places, as ever);
// Shift picks a run and Ctrl one more; a double-click and Enter open the Program window; while the list has the focus Delete, F2 and Ctrl+D act on
// what is picked and not while a name is being typed; Escape lets go. The list is a `listbox` with `aria-multiselectable`, each card an `option` with
// `aria-selected`. The right-click opens the one menu, from the kind `block-type`: a project's block, a library's, several, each row doing what its button
// did (Place, Edit, Rename, Duplicate, Delete, Save to the library, Download .gfb, Remove from the library); *Select its copies on the site* picks the masses of
// the buildings that are copies of it, in the option in view, the locked and the hidden left out.
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../../../App.tsx'
import { derive } from '../../../../engine/derive.ts'
import { actions } from '../../../../state/actions/index.ts'
import { demoProject } from '../../../../state/demo.ts'
import { emptyHistory } from '../../../../state/history.ts'
import { NO_SELECTION, useApp } from '../../../../state/store.ts'
import { browserBlocks } from '../../../../io/blocks.ts'
import { download } from '../../../../views/layout/browserIo.ts'
import { useToast } from '../../../../views/layout/toast.ts'
import { useUi } from '../../../../views/layout/ui.ts'
import { useLayerView } from '../../../../views/layers/layerView.ts'
import { closeMenu } from '../../../../views/editing/menu/open.tsx'
import { useRename } from '../../../../views/editing/rename.ts'
import { loadShortcuts } from '../../../../views/commands/shortcuts.ts'
import { useBlocksFilter } from '../BlocksPanel.tsx'
import { useBlockPick } from '../blockPick.ts'
import { placeCopy } from '../commands.ts'
import { TYPE_MIME } from '../TypePalette.tsx'
import { useWarehouse } from '../warehouseState.ts'

vi.mock('../../../../views/scene/Scene.tsx', () => ({ Scene: () => <div data-testid="scene" /> }))
vi.mock('../WarehouseScene.tsx', () => ({ WarehouseScene: () => <div data-testid="warehouse-scene" /> }))
vi.mock('../../../../views/layout/browserIo.ts', async (orig) => ({ ...(await orig<typeof import('../../../../views/layout/browserIo.ts')>()), download: vi.fn() }))

const s = () => useApp.getState()
const types = () => s().project.warehouseTypes ?? []
const panel = () => screen.getByRole('tabpanel', { name: 'Blocks' })
// the listbox's own options (the Program filter's <select> has options too, named after programs)
const list = () => within(panel()).getByRole('listbox', { name: 'Blocks' })
const card = (name: string) => within(list()).getByRole('option', { name })
const picked = () => useBlockPick.getState().ids
// the menu is named after what it is of (a block's name, "2 blocks"), not the tab
const menu = () => screen.getByRole('menu')
/** The menu's rows and separators, in the order the user sees them. */
const shape = () => Array.from(menu().querySelectorAll('[role="menuitem"], [role="menuitemcheckbox"], [role="separator"]')).map((e) => (e.getAttribute('role') === 'separator' ? '|' : e.querySelector('span')!.textContent))
const row = (label: string) => within(menu()).getByRole('menuitem', { name: new RegExp(`^${label}`) })

beforeEach(() => {
  localStorage.clear()
  // two types of the project: Warehouse A and Warehouse B
  const p = actions.addWarehouseType(actions.addWarehouseType(demoProject()).project).project
  useApp.setState({ project: p, derived: derive(p), history: emptyHistory(), dragStart: null, selection: NO_SELECTION, option: p.options[0].id })
  useUi.setState({ dialog: null, view: 'plan', rail: 'blocks', summaryTab: 'overview', panels: { left: true, right: true }, sheet: null })
  useWarehouse.setState({ programId: null, typeId: null, shown: null })
  useBlocksFilter.setState({ show: 'all', program: null })
  useBlockPick.getState().clear()
  useBlockPick.getState().rename(null)
  useLayerView.getState().setHidden([...useLayerView.getState().hidden], false)
  useToast.setState({ toast: null, confirmation: null })
  vi.mocked(download).mockClear()
  closeMenu()
})

describe('picking a block', { timeout: 15000 }, () => {
  it('the list is a multi-selectable listbox, each card an option; a click picks it and places nothing', () => {
    render(<App />)
    expect(list()).toHaveAttribute('aria-multiselectable', 'true')
    const a = card('Warehouse A')
    expect(a).toHaveAttribute('aria-selected', 'false')
    expect(a).toHaveAttribute('draggable', 'true')
    const buildings = s().project.buildings.length
    fireEvent.click(a)
    expect(a).toHaveAttribute('aria-selected', 'true')
    expect(picked()).toEqual([types()[0].id])
    expect(s().project.buildings).toHaveLength(buildings)
    expect(useUi.getState().dialog).toBeNull()
    // another card alone
    fireEvent.click(card('Warehouse B'))
    expect(picked()).toEqual([types()[1].id])
    expect(card('Warehouse A')).toHaveAttribute('aria-selected', 'false')
  })

  it('Shift picks the run from the anchor, Ctrl one more or one less, in the list’s order (the library’s cards too)', () => {
    render(<App />)
    const [a, b] = types().map((t) => t.id)
    fireEvent.click(card('Warehouse A'))
    fireEvent.click(card('Cross-dock'), { shiftKey: true })
    expect(picked()).toEqual([a, b, 'block:gfit-cross-dock'])
    fireEvent.click(card('Warehouse A'))
    fireEvent.click(card('Rear-load'), { ctrlKey: true })
    expect(picked()).toEqual([a, 'block:gfit-rear-load'])
    fireEvent.click(card('Warehouse A'), { ctrlKey: true })
    expect(picked()).toEqual(['block:gfit-rear-load'])
  })

  it('a drag carries the block (it places where it drops, as before); a double-click and Enter open the Program window', () => {
    render(<App />)
    const a = card('Warehouse A')
    const data = new Map<string, string>()
    fireEvent.dragStart(a, { dataTransfer: { setData: (k: string, v: string) => data.set(k, v), effectAllowed: '' } })
    expect(data.get(TYPE_MIME)).toBe(types()[0].id)
    fireEvent.doubleClick(a)
    expect(useUi.getState().dialog).toBe('program')
    expect(useWarehouse.getState().typeId).toBe(types()[0].id)
    act(() => useUi.getState().closeDialog())
    fireEvent.keyDown(card('Warehouse B'), { key: 'Enter' })
    expect(useUi.getState().dialog).toBe('program')
    expect(useWarehouse.getState().typeId).toBe(types()[1].id)
  })

  it('Delete, F2 and Ctrl+D act on the pick while the list has the focus; not while a name is typed; Escape lets go', () => {
    render(<App />)
    const [a, b] = types().map((t) => t.id)
    fireEvent.click(card('Warehouse A'))
    // not in the list: the window's Delete is the site's
    fireEvent.keyDown(window, { key: 'Delete' })
    expect(types()).toHaveLength(2)
    // F2: its name becomes a field, typed in, Enter keeps it; Delete typed in it is the field's
    fireEvent.keyDown(card('Warehouse A'), { key: 'F2' })
    const field = screen.getByRole('textbox', { name: 'Rename Warehouse A' })
    fireEvent.keyDown(field, { key: 'Delete' })
    expect(types()).toHaveLength(2)
    fireEvent.change(field, { target: { value: 'Shed' } })
    fireEvent.keyDown(field, { key: 'Enter' })
    expect(types()[0].name).toBe('Shed')
    expect(screen.queryByRole('textbox', { name: /^Rename/ })).toBeNull()
    // Ctrl+D: a copy of what is picked, picked
    fireEvent.keyDown(card('Shed'), { key: 'd', ctrlKey: true })
    expect(types()).toHaveLength(3)
    expect(types().map((t) => t.name)).toContain('Shed copy')
    expect(picked()).toEqual([types()[2].id])
    // Delete: what is picked goes, in one undo step; the pick forgets it
    fireEvent.click(card('Shed copy'))
    fireEvent.click(card('Warehouse B'), { ctrlKey: true })
    const steps = s().history.past.length
    fireEvent.keyDown(card('Warehouse B'), { key: 'Delete' })
    expect(types().map((t) => t.id)).toEqual([a])
    expect(s().history.past.length).toBe(steps + 1)
    expect(picked()).toEqual([])
    expect(b).toBeDefined()
    // Escape lets go
    fireEvent.click(card('Shed'))
    expect(picked()).toHaveLength(1)
    fireEvent.keyDown(card('Shed'), { key: 'Escape' })
    expect(picked()).toEqual([])
  })

  it('a block that is gone is forgotten by the pick', () => {
    render(<App />)
    const a = types()[0].id
    fireEvent.click(card('Warehouse A'))
    expect(picked()).toEqual([a])
    act(() => s().apply((p) => actions.removeWarehouseType(p, a)))
    expect(picked()).toEqual([])
  })

  it('the Blocks tab has no On the site chips: Dock, Door, Pattern and Court are the Tools strip’s', () => {
    render(<App />)
    expect(within(panel()).queryByRole('group', { name: 'On the site' })).toBeNull()
    expect(within(screen.getByRole('toolbar', { name: 'Tools' })).getByRole('group', { name: 'Elements' })).toBeInTheDocument()
  })
})

describe('the right-click menu of a block', { timeout: 15000 }, () => {
  it('a project’s block: Place · Edit · Select its copies on the site · Save to the library · Download .gfb │ Duplicate · Delete │ Rename · Select all block types', () => {
    render(<App />)
    fireEvent.contextMenu(card('Warehouse A'))
    // the right-click picked it first
    expect(picked()).toEqual([types()[0].id])
    expect(shape()).toEqual(['Place', 'Edit', 'Select its copies on the site', 'Save to the library', 'Download .gfb', '|', 'Duplicate', 'Delete', '|', 'Rename', 'Select all block types'])
  })

  it('Place puts a copy in the middle of the site; Edit opens the Program window; Duplicate, Rename and Delete are the block’s', () => {
    render(<App />)
    const a = types()[0].id
    const buildings = s().project.buildings.length
    fireEvent.contextMenu(card('Warehouse A'))
    fireEvent.click(row('Place'))
    expect(s().project.buildings).toHaveLength(buildings + 1)
    expect(s().project.buildings.at(-1)!.warehouse?.type).toBe(a)

    fireEvent.contextMenu(card('Warehouse A'))
    fireEvent.click(row('Edit'))
    expect(useUi.getState().dialog).toBe('program')
    expect(useWarehouse.getState().typeId).toBe(a)
    act(() => useUi.getState().closeDialog())

    fireEvent.contextMenu(card('Warehouse A'))
    fireEvent.click(row('Rename'))
    const field = screen.getByRole('textbox', { name: 'Rename Warehouse A' })
    expect(field).toHaveFocus()
    fireEvent.change(field, { target: { value: 'Shed' } })
    fireEvent.blur(field)
    expect(types()[0].name).toBe('Shed')

    fireEvent.contextMenu(card('Shed'))
    fireEvent.click(row('Duplicate'))
    expect(types()).toHaveLength(3)

    fireEvent.contextMenu(card('Shed'))
    fireEvent.click(row('Delete'))
    expect(types().map((t) => t.name)).not.toContain('Shed')
  })

  it('Save to the library saves the block; Download .gfb writes its file; the library’s own card then has Remove from the library', () => {
    render(<App />)
    fireEvent.contextMenu(card('Warehouse A'))
    fireEvent.click(row('Save to the library'))
    expect(browserBlocks.list().map((b) => b.type.name)).toEqual(['Warehouse A'])
    fireEvent.contextMenu(card('Warehouse A'))
    fireEvent.click(row('Download .gfb'))
    expect(download).toHaveBeenCalledTimes(1)
    expect(vi.mocked(download).mock.calls[0][1]).toBe('warehouse-a.gfb')

    // its card in the library: Place · Download .gfb │ Remove from the library
    fireEvent.click(within(panel()).getByRole('button', { name: 'Library' }))
    const mine = browserBlocks.list()[0]
    const tile = within(list()).getAllByRole('option').find((o) => o.getAttribute('data-library-block') === mine.id)!
    fireEvent.contextMenu(tile)
    expect(picked()).toEqual([`block:${mine.id}`])
    expect(shape()).toEqual(['Place', 'Download .gfb', '|', 'Remove from the library'])
    fireEvent.click(row('Remove from the library'))
    // a question first, as the library's own page asks
    expect(browserBlocks.list()).toHaveLength(1)
    act(() => useToast.getState().confirmation!.onContinue())
    expect(browserBlocks.list()).toEqual([])
  })

  it('a GFit block of the library: Place brings it into the project with a copy of it; no Remove (it is GFit’s)', () => {
    render(<App />)
    const before = types().length
    fireEvent.contextMenu(card('Rear-load'))
    expect(shape()).toEqual(['Place', 'Download .gfb'])
    fireEvent.click(row('Place'))
    expect(types()).toHaveLength(before + 1)
    expect(s().project.buildings.at(-1)!.warehouse?.type).toBe(types().at(-1)!.id)
  })

  it('Select its copies on the site: the masses of its copies in the option in view, the locked and the hidden left out', () => {
    render(<App />)
    const a = types()[0].id
    act(() => placeCopy(a))
    act(() => placeCopy(a))
    act(() => placeCopy(a))
    const copies = s().project.buildings.filter((b) => b.warehouse?.type === a)
    expect(copies).toHaveLength(3)
    const massesOf = (id: string) => {
      const levels = new Set(copies.find((b) => b.id === id)!.levels.map((l) => l.id))
      return s().project.masses.filter((m) => levels.has(m.levelId)).map((m) => m.id)
    }
    act(() => s().apply((p) => actions.lockMasses(p, massesOf(copies[1].id), true)))
    act(() => useLayerView.getState().setHidden([`building:${copies[2].id}`], true))
    act(() => s().select(null))
    fireEvent.contextMenu(card('Warehouse A'))
    fireEvent.click(row('Select its copies on the site'))
    expect([...s().selection.massIds].sort()).toEqual([...massesOf(copies[0].id)].sort())
  })

  it('several blocks: Download .gfb │ Duplicate · Delete N blocks; Duplicate and Delete act on each, in one step', () => {
    render(<App />)
    fireEvent.click(card('Warehouse A'))
    fireEvent.click(card('Warehouse B'), { ctrlKey: true })
    fireEvent.contextMenu(card('Warehouse B'))
    expect(shape()).toEqual(['Download .gfb', '|', 'Duplicate', 'Delete 2 blocks'])
    fireEvent.click(row('Download .gfb'))
    expect(download).toHaveBeenCalledTimes(2)
    fireEvent.contextMenu(card('Warehouse B'))
    const steps = s().history.past.length
    fireEvent.click(row('Duplicate'))
    expect(types()).toHaveLength(4)
    expect(s().history.past.length).toBe(steps + 1)
    fireEvent.click(card('Warehouse A'))
    fireEvent.click(card('Warehouse B'), { ctrlKey: true })
    fireEvent.contextMenu(card('Warehouse B'))
    fireEvent.click(row('Delete 2 blocks'))
    expect(types().map((t) => t.name).sort()).toEqual(['Warehouse A copy', 'Warehouse B copy'])
  })

  it('Select all blocks picks the project’s; a library block among the picked leaves Duplicate and Delete out', () => {
    render(<App />)
    fireEvent.contextMenu(card('Warehouse A'))
    fireEvent.click(row('Select all block types'))
    expect(picked()).toEqual(types().map((t) => t.id))
    fireEvent.click(card('Rear-load'), { ctrlKey: true })
    fireEvent.contextMenu(card('Rear-load'))
    expect(shape()).toEqual(['Download .gfb'])
  })
})

describe('the list consumes its keys while it has the focus: they never reach the site’s commands', { timeout: 15000 }, () => {
  const masses = () => s().project.masses
  const LIBRARY = 'Rear-load'

  /** A key on a card: false when the list took it (prevented). */
  const key = (name: string, init: KeyboardEventInit) => fireEvent.keyDown(card(name), init)

  beforeEach(() => {
    useRename.getState().take()
  })

  it('Delete with only a library block picked: the block stays, the mass selected on the site stays, a notice says why', () => {
    render(<App />)
    act(() => s().selectMany(['m1']))
    fireEvent.click(card(LIBRARY))
    const before = masses().length
    expect(key(LIBRARY, { key: 'Delete' })).toBe(false)
    expect(masses()).toHaveLength(before)
    expect(types()).toHaveLength(2)
    expect(useToast.getState().toast?.text).toMatch(/library/i)
  })

  it('Backspace does what Delete does: a project block goes, in one step, and the site’s mass stays', () => {
    render(<App />)
    act(() => s().selectMany(['m1']))
    fireEvent.click(card('Warehouse A'))
    const before = masses().length
    const steps = s().history.past.length
    expect(key('Warehouse A', { key: 'Backspace' })).toBe(false)
    expect(types().map((t) => t.name)).toEqual(['Warehouse B'])
    expect(s().history.past.length).toBe(steps + 1)
    expect(masses()).toHaveLength(before)
    expect(picked()).toEqual([])
  })

  it('Backspace with a library block picked takes nothing from the site either', () => {
    render(<App />)
    act(() => s().selectMany(['m1']))
    fireEvent.click(card(LIBRARY))
    const before = masses().length
    expect(key(LIBRARY, { key: 'Backspace' })).toBe(false)
    expect(masses()).toHaveLength(before)
  })

  it('Delete with nothing picked: the list still takes it, the site’s mass stays', () => {
    render(<App />)
    act(() => s().selectMany(['m1']))
    const before = masses().length
    expect(key('Warehouse A', { key: 'Delete' })).toBe(false)
    expect(masses()).toHaveLength(before)
  })

  it('F2 with two blocks, or a library block, picked: no rename, not the site’s either', () => {
    render(<App />)
    act(() => s().selectMany(['m1']))
    fireEvent.click(card('Warehouse A'))
    fireEvent.click(card('Warehouse B'), { ctrlKey: true })
    expect(key('Warehouse B', { key: 'F2' })).toBe(false)
    expect(screen.queryByRole('textbox', { name: /^Rename/ })).toBeNull()
    expect(useRename.getState().asked).toBeNull()
    expect(useToast.getState().toast?.text).toMatch(/one/i)
    fireEvent.click(card(LIBRARY))
    expect(key(LIBRARY, { key: 'F2' })).toBe(false)
    expect(useRename.getState().asked).toBeNull()
  })

  it('Ctrl+D with a library block among the picked: nothing is copied, not the site’s mass either', () => {
    render(<App />)
    act(() => s().selectMany(['m1']))
    fireEvent.click(card('Warehouse A'))
    fireEvent.click(card(LIBRARY), { ctrlKey: true })
    const before = masses().length
    expect(key(LIBRARY, { key: 'd', ctrlKey: true })).toBe(false)
    expect(masses()).toHaveLength(before)
    expect(types()).toHaveLength(2)
    expect(useToast.getState().toast?.text).toMatch(/library|project/i)
  })

  it('the chords are the commands’ own: a Delete given another key follows it', () => {
    render(<App />)
    act(() => s().selectMany(['m1']))
    fireEvent.click(card('Warehouse A'))
    localStorage.setItem('gfit.shortcuts', JSON.stringify({ 'edit.delete': ['X'] }))
    act(() => loadShortcuts())
    try {
      expect(key('Warehouse A', { key: 'x' })).toBe(false)
      expect(types().map((t) => t.name)).toEqual(['Warehouse B'])
    } finally {
      localStorage.clear()
      act(() => loadShortcuts())
    }
  })

  it('a name being typed keeps its keys: Backspace in the field edits the text', () => {
    render(<App />)
    act(() => s().selectMany(['m1']))
    fireEvent.click(card('Warehouse A'))
    fireEvent.keyDown(card('Warehouse A'), { key: 'F2' })
    const field = screen.getByRole('textbox', { name: 'Rename Warehouse A' })
    fireEvent.keyDown(field, { key: 'Backspace' })
    expect(types()).toHaveLength(2)
    expect(masses().some((m) => m.id === 'm1')).toBe(true)
  })
})

describe('the focus after a block’s menu closes', { timeout: 15000 }, () => {
  it('Escape gives it back to the card; a press elsewhere leaves it to the press', () => {
    render(<App />)
    const a = card('Warehouse A')
    a.focus()
    fireEvent.contextMenu(a)
    expect(menu()).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
    expect(a).toHaveFocus()

    a.focus()
    fireEvent.contextMenu(a)
    expect(menu()).toBeInTheDocument()
    // a press on the plan (nothing there takes the focus): the menu closes and the card does not get it back, so Delete would not remove the block
    fireEvent.pointerDown(screen.getByRole('img', { name: 'Site plan' }))
    expect(screen.queryByRole('menu')).toBeNull()
    expect(a).not.toHaveFocus()
  })
})
