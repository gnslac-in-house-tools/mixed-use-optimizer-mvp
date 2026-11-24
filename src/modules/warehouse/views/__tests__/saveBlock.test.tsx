// Save to library (Phase BL.3, Decision "Block library"): a type not linked becomes a new block at once; a linked one
// asks Overwrite (its next version) or Save a copy (a block of its own); either links the type to it; Unlink keeps it
// as it is. Opening a project brings its linked types up to their blocks' newest, and says so.
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../../../App.tsx'
import { derive } from '../../../../engine/derive.ts'
import { library } from '../../../../io/library.ts'
import type { Project } from '../../../../model/schema.ts'
import { actions } from '../../../../state/actions/index.ts'
import { demoProject } from '../../../../state/demo.ts'
import { emptyHistory } from '../../../../state/history.ts'
import { useApp } from '../../../../state/store.ts'
import { openKept } from '../../../../views/layout/files.ts'
import { useToast } from '../../../../views/layout/toast.ts'
import { useUi } from '../../../../views/layout/ui.ts'
import { gfitBlocks, libraryBlock, saveBlock } from '../blockLibrary.ts'
import { useWarehouse } from '../warehouseState.ts'

vi.mock('../../../../views/scene/Scene.tsx', () => ({ Scene: () => <div data-testid="scene" /> }))
vi.mock('../WarehouseScene.tsx', () => ({ WarehouseScene: () => <div data-testid="warehouse-scene" /> }))

function start(p: Project, typeId: string) {
  useApp.setState({ project: p, derived: derive(p), history: emptyHistory(), dragStart: null, selection: { massId: null, vertex: null, massIds: [] }, option: p.options[0].id })
  useUi.setState({ dialog: 'program', view: 'plan', rail: 'layers', panels: { left: true, right: true }, sheet: null })
  useWarehouse.setState({ programId: null, typeId, shown: null })
  useWarehouse.getState().pick(typeId)
}

const typeOf = (id: string) => useApp.getState().project.warehouseTypes!.find((t) => t.id === id)!

beforeEach(() => {
  localStorage.clear()
  useToast.setState({ toast: null, confirmation: null })
})

describe('Save to library', { timeout: 15000 }, () => {
  it('a type not linked: a new block at once, the type linked to it at version 1', () => {
    const made = actions.addWarehouseType(demoProject())
    start(made.project, made.id)
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Save to library' }))
    const link = typeOf(made.id).library!
    expect(link.version).toBe(1)
    expect(libraryBlock(link.id)).toMatchObject({ shelf: 'browser', block: { type: { name: 'Warehouse A' } } })
    expect(useToast.getState().toast?.text).toMatch(/a new block/)
  })

  it('a linked one asks: Overwrite gives the block its next version; Save a copy a block of its own; Unlink lets go', () => {
    const brought = actions.bringBlock(demoProject(), gfitBlocks()[0])
    start(brought.project, brought.id)
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Save to library' }))
    const ask = () => screen.getByRole('group', { name: 'Save to library' })
    expect(ask().textContent).toContain('GFit')
    fireEvent.click(within(ask()).getByRole('button', { name: 'Overwrite' }))
    expect(typeOf(brought.id).library).toEqual({ id: 'gfit-cross-dock', version: 2 })
    expect(libraryBlock('gfit-cross-dock')).toMatchObject({ shelf: 'browser', block: { version: 2 } })

    fireEvent.click(screen.getByRole('button', { name: 'Save to library' }))
    fireEvent.click(within(ask()).getByRole('button', { name: 'Save a copy' }))
    const copy = typeOf(brought.id).library!
    expect(copy.id).not.toBe('gfit-cross-dock')
    expect(libraryBlock(copy.id)!.block.type.name).toBe('Cross-dock copy')

    fireEvent.click(screen.getByRole('button', { name: 'Unlink' }))
    expect(typeOf(brought.id).library).toBeUndefined()
    expect(screen.queryByRole('button', { name: 'Unlink' })).toBeNull()
  })
})

describe('opening a project brings its linked blocks up to date', { timeout: 15000 }, () => {
  it('a newer version of its block: its type takes it, a notice says which; the same version, nothing', () => {
    const brought = actions.bringBlock(demoProject(), gfitBlocks()[0])
    const p = { ...brought.project, id: 'p-linked', name: 'Linked' }
    library.write(p, 'o1', 1)
    const gfit = gfitBlocks()[0]
    saveBlock({ ...gfit, version: 2, type: { ...gfit.type, hall: { ...gfit.type.hall, length: 192 } } })
    start(demoProject(), 'none')
    useUi.setState({ dialog: null })
    render(<App />)
    act(() => {
      openKept('p-linked')
    })
    const t = useApp.getState().project.warehouseTypes!.find((x) => x.id === brought.id)!
    expect(t.hall.length).toBe(192)
    expect(t.library!.version).toBe(2)
    expect(useToast.getState().toast?.text).toMatch(/Brought up to date from the block library: Cross-dock/)
    expect(library.read('p-linked')!.project.warehouseTypes!.find((x) => x.id === brought.id)!.library!.version).toBe(2)
  })
})
