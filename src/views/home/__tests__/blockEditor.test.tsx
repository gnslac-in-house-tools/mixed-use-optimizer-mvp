// Home's Blocks and the block editor (Phase BL.4, Decision "Block library"): the library in the table's place, search
// and Program narrow it; Open edits a block in the Program window on a project of its own, never kept; Save asks
// Overwrite or a copy; closing goes back to Home's Blocks and to the project the store held, asking first when the
// block changed since it was saved; + New block begins one.
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../../App.tsx'
import { derive } from '../../../engine/derive.ts'
import { library } from '../../../io/library.ts'
import { libraryBlock } from '../../../modules/warehouse/views/blockLibrary.ts'
import { demoProject } from '../../../state/demo.ts'
import { emptyHistory } from '../../../state/history.ts'
import { useApp } from '../../../state/store.ts'
import { startProject } from '../../layout/files.ts'
import { useToast } from '../../layout/toast.ts'
import { useUi } from '../../layout/ui.ts'
import { BLOCK_EDITOR_ID, followBlockEditor, UNSAVED_BLOCK, useBlockEditor } from '../blockEditor.ts'
import { useScreen } from '../screen.ts'

vi.mock('../../scene/Scene.tsx', () => ({ Scene: () => <div data-testid="scene" /> }))
vi.mock('../../../modules/warehouse/views/WarehouseScene.tsx', () => ({ WarehouseScene: () => <div data-testid="warehouse-scene" /> }))

let stop: () => void
beforeAll(() => {
  stop = followBlockEditor()
})
afterAll(() => stop())

beforeEach(() => {
  localStorage.clear()
  const p = demoProject()
  useApp.setState({ project: p, derived: derive(p), history: emptyHistory(), dragStart: null, selection: { massId: null, vertex: null, massIds: [] }, option: 'o1' })
  useUi.setState({ dialog: null, view: 'plan' })
  useScreen.setState({ home: true, homeView: 'projects' })
  useToast.setState({ toast: null, confirmation: null })
  useBlockEditor.setState({ open: false, typeId: null, saved: null, back: null })
})

const blocksView = () => screen.getByRole('region', { name: 'Block library' })
const tiles = () => within(within(blocksView()).getByRole('list', { name: 'Blocks' })).getAllByRole('listitem').map((li) => li.getAttribute('data-library-block'))

function openBlocks() {
  render(<App />)
  fireEvent.click(within(screen.getByRole('navigation', { name: 'Home' })).getByRole('button', { name: 'Blocks' }))
}

describe('Home’s Blocks', { timeout: 15000 }, () => {
  it('the library in the table’s place: GFit’s blocks; search and Program narrow it; Projects goes back', () => {
    openBlocks()
    expect(tiles()).toEqual(['gfit-cross-dock', 'gfit-rear-load'])
    fireEvent.change(within(blocksView()).getByRole('textbox', { name: 'Search blocks' }), { target: { value: 'rear' } })
    expect(tiles()).toEqual(['gfit-rear-load'])
    fireEvent.change(within(blocksView()).getByRole('textbox', { name: 'Search blocks' }), { target: { value: '' } })
    fireEvent.change(within(blocksView()).getByRole('combobox', { name: 'Program' }), { target: { value: 'Warehouse' } })
    expect(tiles()).toEqual(['gfit-cross-dock'])
    fireEvent.click(within(blocksView()).getByRole('button', { name: 'Projects' }))
    expect(screen.getByRole('region', { name: 'Your projects' })).toBeInTheDocument()
  })
})

describe('the block editor from Home', { timeout: 15000 }, () => {
  it('Open: the Program window as the block editor on a project of its own; closed unchanged, Home’s Blocks and the project as they were', () => {
    const held = useApp.getState().project
    openBlocks()
    fireEvent.click(within(blocksView()).getByRole('button', { name: 'Open Cross-dock' }))
    expect(useApp.getState().project.id).toBe(BLOCK_EDITOR_ID)
    expect(useUi.getState().dialog).toBe('program')
    expect(within(screen.getByRole('dialog', { name: 'Program' })).getByRole('heading', { name: 'Block editor' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Approve programs/ })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Unlink' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(useScreen.getState()).toMatchObject({ home: true, homeView: 'blocks' })
    expect(useApp.getState().project).toBe(held)
    expect(library.read(BLOCK_EDITOR_ID)).toBeNull()
    expect(blocksView()).toBeInTheDocument()
  })

  it('changed: closing asks first; Save asks Overwrite or a copy, Overwrite saves its next version in this browser; then it closes at once', () => {
    openBlocks()
    fireEvent.click(within(blocksView()).getByRole('button', { name: 'Open Rear-load' }))
    const id = useBlockEditor.getState().typeId!
    act(() => useApp.getState().apply((p) => ({ ...p, warehouseTypes: p.warehouseTypes!.map((t) => (t.id === id ? { ...t, name: 'Rear-load XL' } : t)) })))
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(useToast.getState().confirmation?.text).toBe(UNSAVED_BLOCK)
    expect(useUi.getState().dialog).toBe('program')
    act(() => useToast.setState({ confirmation: null }))

    fireEvent.click(screen.getByRole('button', { name: 'Save to library' }))
    fireEvent.click(within(screen.getByRole('group', { name: 'Save to library' })).getByRole('button', { name: 'Overwrite' }))
    expect(libraryBlock('gfit-rear-load')).toMatchObject({ shelf: 'browser', block: { version: 2, type: { name: 'Rear-load XL' } } })
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(useToast.getState().confirmation).toBeNull()
    expect(useScreen.getState().home).toBe(true)
    expect(within(blocksView()).getByText(/Mine · v2/)).toBeInTheDocument()
  })

  it('another project opened while it is open (Back, a .gft): the editor ends first, asking when changed; its window gone', () => {
    openBlocks()
    fireEvent.click(within(blocksView()).getByRole('button', { name: 'Open Rear-load' }))
    const id = useBlockEditor.getState().typeId!
    act(() => useApp.getState().apply((p) => ({ ...p, warehouseTypes: p.warehouseTypes!.map((t) => (t.id === id ? { ...t, name: 'Rear-load XL' } : t)) })))
    act(() => startProject('industrial'))
    expect(useToast.getState().confirmation?.text).toBe(UNSAVED_BLOCK)
    expect(useApp.getState().project.id).toBe(BLOCK_EDITOR_ID)
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(useBlockEditor.getState()).toMatchObject({ open: false, back: null })
    expect(useUi.getState().dialog).toBeNull()
    expect(useApp.getState().project).toMatchObject({ name: 'New industrial project' })
    expect(useScreen.getState().home).toBe(false)
  })

  it('+ New block asks how it starts (Create new): Start blank, a new type in the editor; saved, a new block of this browser’s', () => {
    openBlocks()
    fireEvent.click(within(blocksView()).getByRole('button', { name: 'New block' }))
    const dialog = screen.getByRole('dialog', { name: 'Create new' })
    expect(within(dialog).getByRole('button', { name: /^Block/ })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Start blank' }))
    expect(screen.queryByRole('dialog', { name: 'Create new' })).toBeNull()
    expect(useApp.getState().project.warehouseTypes).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Save to library' }))
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(tiles()).toHaveLength(3)
  })

  it('Create new’s block types: the library’s under their program; one picked starts a new block as it, not linked, never saved, named as a copy', () => {
    openBlocks()
    fireEvent.click(within(blocksView()).getByRole('button', { name: 'New block' }))
    const dialog = screen.getByRole('dialog', { name: 'Create new' })
    expect(within(dialog).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['Rear-load', 'Warehouse'])
    fireEvent.click(within(dialog).getByRole('button', { name: 'New block like Cross-dock' }))
    const [t] = useApp.getState().project.warehouseTypes!
    expect(t).toMatchObject({ name: 'Cross-dock copy' })
    expect(t.library).toBeUndefined()
    expect(useBlockEditor.getState().saved).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Save to library' }))
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    // GFit's two and the new one, under a name of its own
    expect(tiles()).toHaveLength(3)
    expect(within(blocksView()).getByText('Cross-dock copy')).toBeTruthy()
  })
})
