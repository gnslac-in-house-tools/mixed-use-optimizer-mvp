// 2.1b through the UI: the ⋯ menu opens, saves and starts projects; replacing one with changes asks first; a bad
// file changes nothing and says why; the project's name opens its data. Adapted from Plaza-Practiko's
// `vistas/paneles/__tests__/ficha.test.tsx` and its archivos tests.
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../../App.tsx'
import { derive } from '../../../engine/derive.ts'
import { writeGft } from '../../../io/gft.ts'
import { actions } from '../../../state/actions/index.ts'
import { demoProject } from '../../../state/demo.ts'
import { emptyHistory } from '../../../state/history.ts'
import { useApp } from '../../../state/store.ts'
import { newProject } from '../../../typologies/index.ts'
import { readBrowserCopy } from '../../../io/browserCopy.ts'
import { handleKey } from '../../useShortcuts.ts'
import { announceOpenedCopy, useSaving } from '../saving.ts'
import { openKept, openSample } from '../files.ts'
import { useToast } from '../toast.ts'
import { useUi } from '../ui.ts'

beforeEach(() => {
  localStorage.clear()
  const p = demoProject()
  useApp.setState({ project: p, derived: derive(p), history: emptyHistory(), dragStart: null, selection: { massId: null, vertex: null, massIds: [] } })
  useUi.setState({ dialog: null, view: 'plan', rail: 'layers', panels: { left: true, right: true }, sheet: null })
  useToast.setState({ toast: null, confirmation: null })
  useSaving.setState({ autosave: true, kept: null })
})

afterEach(() => vi.restoreAllMocks())

/** The top menu's File, then one of its rows (it was the top bar's ⋯). */
const menu = (item: RegExp | string) => {
  fireEvent.click(screen.getByRole('menuitem', { name: 'File' }))
  fireEvent.click(screen.getByRole('menuitem', { name: item }))
}

const pick = (text: string, name = 'project.gft') =>
  act(async () => {
    fireEvent.change(screen.getByLabelText('Open .gft'), { target: { files: [new File([text], name)] } })
  })

describe('files', () => {
  it('Save keeps the project in this browser and says so: no file is downloaded, no picker opens; Ctrl+Shift+S does what Ctrl+S does', async () => {
    const createObjectURL = vi.fn(() => 'blob:x')
    URL.createObjectURL = createObjectURL
    URL.revokeObjectURL = vi.fn()
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const show = vi.fn()
    ;(window as { showSaveFilePicker?: unknown }).showSaveFilePicker = show
    try {
      render(<App />)
      act(() => useApp.getState().apply((p) => actions.removeMass(p, 'm1')))
      fireEvent.click(screen.getByRole('menuitem', { name: 'File' }))
      expect(screen.queryByRole('menuitem', { name: /Save as/ })).toBeNull()
      expect(screen.queryByRole('menuitem', { name: /Open \.gft/ })).toBeNull()
      expect(screen.getByRole('menuitem', { name: /^Load project…\s*Ctrl\+O$/ })).toBeInTheDocument()
      await act(async () => fireEvent.click(screen.getByRole('menuitem', { name: /^Save\s*Ctrl\+S$/ })))
      expect(useToast.getState().toast?.text).toBe('Project saved')
      expect(readBrowserCopy()!.project).toEqual(useApp.getState().project)
      act(() => useApp.getState().apply((p) => actions.renameProject(p, 'Planta Sur')))
      await act(async () => handleKey(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, shiftKey: true, cancelable: true })))
      expect(readBrowserCopy()!.project.name).toBe('Planta Sur')
      expect([createObjectURL.mock.calls.length, click.mock.calls.length, show.mock.calls.length]).toEqual([0, 0, 0])
    } finally {
      delete (window as { showSaveFilePicker?: unknown }).showSaveFilePicker
    }
  })

  it('a file opened through the picker is not adopted: a later Ctrl+S writes no file, only this browser’s copy', async () => {
    const writes: string[] = []
    const handle = {
      name: 'mine.gft',
      getFile: async () => new File([writeGft(newProject('blank', 'Planta Norte'))], 'mine.gft'),
      createWritable: async () => ({ write: async (d: string) => void writes.push(d), close: async () => {} }),
    }
    ;(window as { showOpenFilePicker?: unknown }).showOpenFilePicker = vi.fn(async () => [handle])
    const show = vi.fn()
    ;(window as { showSaveFilePicker?: unknown }).showSaveFilePicker = show
    try {
      render(<App />)
      await act(async () => handleKey(new KeyboardEvent('keydown', { key: 'o', ctrlKey: true, cancelable: true })))
      await waitFor(() => expect(useApp.getState().project.name).toBe('Planta Norte'))
      act(() => useApp.getState().apply((p) => actions.renameProject(p, 'Planta Norte 2')))
      await act(async () => handleKey(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, cancelable: true })))
      expect(writes).toEqual([])
      expect(show).not.toHaveBeenCalled()
      expect(readBrowserCopy()!.project.name).toBe('Planta Norte 2')
    } finally {
      delete (window as { showOpenFilePicker?: unknown }).showOpenFilePicker
      delete (window as { showSaveFilePicker?: unknown }).showSaveFilePicker
    }
  })

  it('opening a .gft replaces an unchanged project at once, with a fresh history and a notice', async () => {
    render(<App />)
    await pick(writeGft(newProject('blank', 'Planta Norte')))
    await waitFor(() => expect(useApp.getState().project.name).toBe('Planta Norte'))
    expect(useApp.getState().history.past).toHaveLength(0)
    expect(screen.getByRole('status')).toHaveTextContent('Opened “Planta Norte”.')
    expect(screen.getByRole('button', { name: 'Planta Norte' })).toBeInTheDocument()
  })

  it('a file from an older GFit whose masses became blocks opens with the report, once (Phase D.2)', async () => {
    render(<App />)
    const v16 = JSON.stringify({ ...JSON.parse(writeGft(demoProject())), version: 16, name: 'Park A', id: 'p-park-a' })
    await pick(v16)
    await waitFor(() => expect(useApp.getState().project.name).toBe('Park A'))
    expect(useApp.getState().project.masses.every((m) => m.part === 'hall')).toBe(true)
    expect(screen.getAllByRole('status')).toHaveLength(1)
    expect(screen.getByRole('status')).toHaveTextContent('Opened “Park A” from an older GFit: 3 masses are blocks now (2 new block types: Warehouse, Office).')
  })

  it('a project this browser kept before the blocks opens with the report too, and is kept as blocks', async () => {
    const old = JSON.parse(writeGft(demoProject()))
    localStorage.setItem('gfit.project:p-old', JSON.stringify({ savedAt: 1, option: 'o1', project: { ...old, version: 16, id: 'p-old', name: 'Old Park' } }))
    render(<App />)
    act(() => {
      expect(openKept('p-old')).toBe(true)
    })
    await waitFor(() => expect(useApp.getState().project.name).toBe('Old Park'))
    expect(useApp.getState().project.masses.every((m) => m.part === 'hall')).toBe(true)
    expect(screen.getByRole('status')).toHaveTextContent(/^Opened “Old Park” from an older GFit: 3 masses are blocks now/)
    expect(JSON.parse(localStorage.getItem('gfit.project:p-old')!).project.version).toBe(20)
  })

  it('a project with changes is kept in this browser before another opens (Decision "Library"); autosave off, it asks first: Cancel keeps it, Continue replaces it', async () => {
    render(<App />)
    act(() => useApp.getState().apply((p) => actions.removeMass(p, 'm1')))
    const edited = useApp.getState().project
    await pick(writeGft(newProject('blank', 'Planta Norte')))
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(useApp.getState().project.name).toBe('Planta Norte')
    expect(readBrowserCopy(edited.id)!.project).toEqual(edited)

    useSaving.getState().setAutosave(false)
    act(() => useApp.getState().apply((p) => actions.renameProject(p, 'Planta Sur')))
    await pick(writeGft(newProject('blank', 'Planta Este')))
    const ask = await screen.findByRole('alertdialog', { name: 'Confirm' })
    fireEvent.click(within(ask).getByRole('button', { name: 'Cancel' }))
    expect(useApp.getState().project.name).toBe('Planta Sur')
    await pick(writeGft(newProject('blank', 'Planta Este')))
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Continue' }))
    expect(useApp.getState().project.name).toBe('Planta Este')
  })

  it('autosave off, the changes saved with Ctrl+S: replacing asks nothing (this browser has them)', async () => {
    render(<App />)
    useSaving.getState().setAutosave(false)
    act(() => useApp.getState().apply((p) => actions.renameProject(p, 'Planta Sur')))
    await act(async () => handleKey(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, cancelable: true })))
    await pick(writeGft(newProject('blank', 'Planta Este')))
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(useApp.getState().project.name).toBe('Planta Este')
  })

  it('a file that is not a GFit project changes nothing and says why', async () => {
    render(<App />)
    const before = useApp.getState().project
    await pick(JSON.stringify(demoProject()), 'old.json')
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Could not open old.json: the file is not a GFit project')
    expect(useApp.getState().project).toBe(before)
  })

  it('one New project per typology; New industrial project: its programs and rules, no masses, no site yet', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('menuitem', { name: 'File' }))
    expect(screen.getByRole('menuitem', { name: 'New blank project' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('menuitem', { name: 'New industrial project' }))
    const p = useApp.getState().project
    expect(p).toMatchObject({ name: 'New industrial project', typology: 'industrial', masses: [], site: { boundary: null } })
    expect(p.programs.map((x) => x.name)).toContain('Warehouse')
    expect(screen.getByRole('status')).toHaveTextContent('no site yet')
    // it starts on the Site tab, whose settings come next
    expect(useUi.getState().rail).toBe('layers')
  })

  it('Open the demo project brings the demo back', () => {
    useApp.getState().open(newProject('blank', 'Empty'))
    render(<App />)
    menu('Open the demo project')
    expect(useApp.getState().project.name).toBe('Demo site')
  })
})

describe('a .gft dragged onto the app (Decision "Saving")', () => {
  const files = (list: File[]) => ({ dataTransfer: { types: ['Files'], files: list, items: [], dropEffect: 'none' } })

  it('a sheet says where it goes while it is over the window; dropped, it opens', async () => {
    render(<App />)
    const file = new File([writeGft(newProject('blank', 'Planta Sur'))], 'sur.gft')
    fireEvent.dragEnter(window, files([file]))
    expect(screen.getByRole('status', { name: 'Open a project' })).toHaveTextContent('Drop the .gft to open it')
    const over = fireEvent.dragOver(window, files([file]))
    expect(over).toBe(false) // its default (the browser opening the file itself) prevented
    await act(async () => {
      fireEvent.drop(window, files([file]))
    })
    await waitFor(() => expect(useApp.getState().project.name).toBe('Planta Sur'))
    expect(screen.queryByRole('status', { name: 'Open a project' })).toBeNull()
  })

  it('left without dropping, the sheet goes; a drag that carries no file (a program onto a mass) is not this', () => {
    render(<App />)
    fireEvent.dragEnter(window, files([]))
    fireEvent.dragLeave(window, files([]))
    expect(screen.queryByRole('status', { name: 'Open a project' })).toBeNull()
    fireEvent.dragEnter(window, { dataTransfer: { types: ['application/x-gfit-program'], files: [], items: [] } })
    expect(screen.queryByRole('status', { name: 'Open a project' })).toBeNull()
  })

  it('Ctrl+O opens the file input here (no picker in this browser), never the browser’s Open', async () => {
    render(<App />)
    const click = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {})
    const e = new KeyboardEvent('keydown', { key: 'o', ctrlKey: true, cancelable: true })
    window.dispatchEvent(e)
    expect(e.defaultPrevented).toBe(true)
    await waitFor(() => expect(click).toHaveBeenCalledTimes(1))
  })
})

describe('project data', () => {
  it('the name opens the dialog; Save renames (one undo step); the typology is shown, not edited', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Demo site' }))
    const dialog = screen.getByRole('dialog', { name: 'Project data' })
    expect(within(dialog).getByText('Industrial')).toBeInTheDocument()
    fireEvent.change(within(dialog).getByLabelText('Project name'), { target: { value: 'Planta Querétaro' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(useApp.getState().project.name).toBe('Planta Querétaro')
    act(() => useApp.getState().undo())
    expect(useApp.getState().project.name).toBe('Demo site')
  })

  it('the units: pick ft, Save sets them (one undo step); Cancel leaves them', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Demo site' }))
    let dialog = screen.getByRole('dialog', { name: 'Project data' })
    expect(within(dialog).getByText('Used by CAD exports')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'm' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(within(dialog).getByRole('button', { name: 'ft' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(useApp.getState().project.units).toBeUndefined()
    fireEvent.click(screen.getByRole('button', { name: 'Demo site' }))
    dialog = screen.getByRole('dialog', { name: 'Project data' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'ft' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    expect(useApp.getState().project.units).toBe('ft')
    act(() => useApp.getState().undo())
    expect(useApp.getState().project.units).toBeUndefined()
  })

  it('Escape closes it without changes, and does not reach the plan', () => {
    act(() => useApp.getState().select('m1'))
    render(<App />)
    menu('Project data…')
    const input = within(screen.getByRole('dialog')).getByLabelText('Project name')
    fireEvent.change(input, { target: { value: 'Nope' } })
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(useApp.getState().project.name).toBe('Demo site')
    expect(useApp.getState().selection.massId).toBe('m1')
  })
})

describe('what migrating said is said whichever way the project opens (Phase D.2 review)', () => {
  const kept = (id: string, name: string) => {
    const old = JSON.parse(writeGft(demoProject()))
    localStorage.setItem(`gfit.project:${id}`, JSON.stringify({ savedAt: 1, option: 'o1', project: { ...old, version: 16, id, name } }))
  }

  it('the project this browser kept when the app opened: the report once, and the copy kept as blocks', () => {
    kept('p-start', 'Start Park')
    const copy = readBrowserCopy('p-start')!
    expect(copy.notes?.length).toBeGreaterThan(0)
    act(() => useApp.getState().open(copy.project))
    announceOpenedCopy(copy)
    expect(useToast.getState().toast?.text).toMatch(/^Opened “Start Park” from an older GFit: 3 masses are blocks now/)
    expect(JSON.parse(localStorage.getItem('gfit.project:p-start')!).project.version).toBe(20)
    // the next load has nothing to say
    expect(readBrowserCopy('p-start')!.notes).toBeUndefined()
    // a copy with nothing to report says nothing
    useToast.setState({ toast: null, confirmation: null })
    announceOpenedCopy(readBrowserCopy('p-start'))
    expect(useToast.getState().toast).toBeNull()
  })

  it('the sample kept before the blocks: the report once, and kept as blocks', () => {
    kept('sample', 'Sample')
    render(<App />)
    act(() => openSample())
    expect(useToast.getState().toast?.text).toMatch(/from an older GFit: 3 masses are blocks now/)
    expect(JSON.parse(localStorage.getItem('gfit.project:sample')!).project.version).toBe(20)
  })
})
