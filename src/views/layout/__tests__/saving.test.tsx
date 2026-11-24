// Saving (Decision "Save in the app"; QF.4): autosave keeps the project in this browser a moment after each change (on
// by default, a click on the cloud turns it off); Ctrl+S, Ctrl+Shift+S and File › Save keep it too, read the copy back,
// compare it with the project and only then say "Project saved". Nothing is downloaded and no picker opens. The
// indicator beside the project's name says what this browser has. The complete check (guarantees 2 to 4): a full or
// blocked storage and a copy that reads back different are never "saved"; a reload opens what was saved; autosave and
// Save agree. (Guarantee 1, nothing lost on the way: io/__tests__/persistence.test.ts.)
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../../App.tsx'
import { derive } from '../../../engine/derive.ts'
import { COPY_KEY, readBrowserCopy, writeBrowserCopy } from '../../../io/browserCopy.ts'
import { library, projectKey } from '../../../io/library.ts'
import { libraryBlock } from '../../../modules/warehouse/views/blockLibrary.ts'
import { actions } from '../../../state/actions/index.ts'
import { demoProject } from '../../../state/demo.ts'
import { emptyHistory } from '../../../state/history.ts'
import { sampleProject } from '../../../state/sample.ts'
import { createAppStore, NO_SELECTION, useApp } from '../../../state/store.ts'
import { newProject } from '../../../typologies/index.ts'
import { blockUnsaved, openBlockEditor, useBlockEditor } from '../../home/blockEditor.ts'
import { libraryTerrain } from '../../home/terrainLibrary.ts'
import { terrainUnsaved, TERRAIN_EDITOR_ID, useTerrainEditor } from '../../home/terrainEditor.ts'
import { handleKey } from '../../useShortcuts.ts'
import { AUTOSAVE_DELAY, AUTOSAVE_KEY, forgetKept, keep, SAVE_FAILED, unkept, useSaving } from '../saving.ts'
import { useToast } from '../toast.ts'
import { useUi } from '../ui.ts'

vi.mock('../../scene/Scene.tsx', () => ({ Scene: () => <div data-testid="scene" /> }))
vi.mock('../../../modules/warehouse/views/WarehouseScene.tsx', () => ({ WarehouseScene: () => <div data-testid="warehouse-scene" /> }))

beforeEach(() => {
  localStorage.clear()
  const p = demoProject()
  useApp.setState({ project: p, derived: derive(p, 'o1'), history: emptyHistory(), dragStart: null, selection: NO_SELECTION, option: 'o1' })
  useUi.setState({ dialog: null, view: 'plan', rail: 'layers', panels: { left: true, right: true }, sheet: null })
  forgetKept()
  useSaving.setState({ autosave: true, savedAt: null })
  useToast.setState({ toast: null, confirmation: null })
  useBlockEditor.setState({ open: false, typeId: null, saved: null, back: null })
  useTerrainEditor.setState({ open: false, name: '', id: null, saved: null, back: null })
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  delete (window as { showSaveFilePicker?: unknown }).showSaveFilePicker
})

const ctrlS = (shift = false) => act(async () => handleKey(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, shiftKey: shift, cancelable: true })))
const toast = () => useToast.getState().toast
const edit = () => act(() => useApp.getState().apply((p) => actions.removeMass(p, 'm3')))
/** The indicator beside the project's name. */
const indicator = () => document.querySelector<HTMLElement>('[data-tour="save"]')!
const TIME = /^Saved \d{1,2}:\d{2}/

/** What Save must never do now: a download, or a file picker. */
function noFiles() {
  const objectUrl = vi.fn(() => 'blob:x')
  URL.createObjectURL = objectUrl
  URL.revokeObjectURL = vi.fn()
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  const picker = vi.fn()
  ;(window as { showSaveFilePicker?: unknown }).showSaveFilePicker = picker
  return { objectUrl, click, picker, none: () => expect([objectUrl.mock.calls.length, click.mock.calls.length, picker.mock.calls.length]).toEqual([0, 0, 0]) }
}

/** The browser would not keep anything. */
const storageFull = () =>
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new DOMException('full', 'QuotaExceededError')
  })

describe('the browser copy', () => {
  it('reads back as written, with its option, by its id or as the current one; nothing is null', () => {
    const p = demoProject()
    expect(readBrowserCopy()).toBeNull()
    expect(writeBrowserCopy(p, 'o1', 1234)).toBe(true)
    expect(readBrowserCopy()).toEqual({ project: p, option: 'o1', savedAt: 1234 })
    expect(readBrowserCopy(p.id)).toEqual({ project: p, option: 'o1', savedAt: 1234 })
    expect(readBrowserCopy('nope')).toBeNull()
    // Home lists it, newest first
    const q = { ...demoProject(), name: 'Other' }
    writeBrowserCopy(q, 'o1', 2000)
    expect(library.list().map((e) => [e.name, e.options])).toEqual([['Other', 1], ['Demo site', 1]])
    library.remove(q.id)
    expect(library.list().map((e) => e.id)).toEqual([p.id])
  })

  it('the one copy of before the library moves into it once; garbage stays where it was; an old one is migrated', () => {
    const p = demoProject()
    localStorage.setItem(COPY_KEY, '{broken')
    expect(readBrowserCopy()).toBeNull()
    localStorage.setItem(COPY_KEY, JSON.stringify({ project: { format: 'other' } }))
    expect(readBrowserCopy()).toBeNull()
    const { massArea: _a, ...old } = p.programs[0]
    localStorage.setItem(COPY_KEY, JSON.stringify({ savedAt: 1, option: 'o1', project: { format: 'gfit', ...p, version: 3, programs: [{ ...old, size: { width: 10, depth: 20 } }, ...p.programs.slice(1)] } }))
    const moved = readBrowserCopy()!.project
    expect(moved.programs[0].massArea).toBe(200)
    expect(localStorage.getItem(COPY_KEY)).toBeNull()
    expect(library.list().map((e) => e.id)).toEqual([moved.id])
  })

  it('a store opens in the option given (one that does not exist: the first)', () => {
    const p = actions.addOption(demoProject()).project
    expect(createAppStore(p, p.options[1].id).getState().option).toBe(p.options[1].id)
    expect(createAppStore(p, 'nope').getState().option).toBe('o1')
  })
})

describe('autosave', () => {
  it('on by default: a change is kept a moment later, with the option in view; the indicator says Unsaved, then Saved', () => {
    vi.useFakeTimers()
    render(<App />)
    expect(screen.getByRole('button', { name: 'Autosave on' })).toHaveAttribute('aria-pressed', 'true')
    expect(indicator()).toHaveTextContent('Not saved yet')
    edit()
    expect(readBrowserCopy()).toBeNull() // not yet: a burst of edits is kept once
    expect(indicator()).toHaveTextContent('Unsaved changes')
    act(() => vi.advanceTimersByTime(AUTOSAVE_DELAY))
    expect(readBrowserCopy()!.project).toEqual(useApp.getState().project)
    expect(indicator()).toHaveTextContent(TIME)
    // a drag's preview is not kept; its release is
    act(() => useApp.getState().preview((p) => actions.moveMasses(p, ['m1'], { x: 5, y: 0 })))
    act(() => vi.advanceTimersByTime(AUTOSAVE_DELAY))
    expect(readBrowserCopy()!.project.masses.find((m) => m.id === 'm1')).toEqual(demoProject().masses.find((m) => m.id === 'm1'))
    act(() => useApp.getState().commit())
    act(() => vi.advanceTimersByTime(AUTOSAVE_DELAY))
    expect(readBrowserCopy()!.project).toEqual(useApp.getState().project)
    expect(indicator()).toHaveTextContent(TIME)
  })

  it('a click turns it off (remembered): changes are not kept, a dot says so, leaving asks; on again keeps them at once', () => {
    vi.useFakeTimers()
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Autosave on' }))
    expect(localStorage.getItem(AUTOSAVE_KEY)).toBe('off')
    edit()
    act(() => vi.advanceTimersByTime(AUTOSAVE_DELAY))
    expect(readBrowserCopy()).toBeNull()
    const cloud = screen.getByRole('button', { name: 'Autosave off, changes not kept' })
    expect(cloud.querySelector('[data-unsaved]')).not.toBeNull()
    const leave = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(leave)
    expect(leave.defaultPrevented).toBe(true)
    fireEvent.click(cloud)
    expect(readBrowserCopy()!.project).toEqual(useApp.getState().project)
    expect(screen.getByRole('button', { name: 'Autosave on' })).toBeInTheDocument()
    const again = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(again)
    expect(again.defaultPrevented).toBe(false)
  })

  it('a browser that will not keep it: said once, pointing to File › Export › Project (.gft); leaving asks while the change is not kept', () => {
    vi.useFakeTimers()
    render(<App />)
    storageFull()
    edit()
    act(() => vi.advanceTimersByTime(AUTOSAVE_DELAY))
    expect(toast()).toMatchObject({ kind: 'error', text: expect.stringContaining('File › Export › Project (.gft) keeps a copy') })
    expect(indicator()).toHaveTextContent('Not saved')
    expect(indicator()).not.toHaveTextContent(TIME)
    useToast.setState({ toast: null })
    act(() => useApp.getState().apply((p) => actions.renameProject(p, 'Again')))
    act(() => vi.advanceTimersByTime(AUTOSAVE_DELAY))
    expect(toast()).toBeNull() // once
    const leave = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(leave)
    expect(leave.defaultPrevented).toBe(true)
  })
})

describe('Ctrl+S', () => {
  it('keeps the project in this browser and says so; nothing is downloaded and no picker opens; the indicator reads Saved', async () => {
    const files = noFiles()
    render(<App />)
    edit()
    expect(unkept()).toBe(true)
    await ctrlS()
    expect(readBrowserCopy()!.project).toEqual(useApp.getState().project)
    expect(toast()).toMatchObject({ kind: 'info', text: 'Project saved' })
    expect(indicator()).toHaveTextContent(TIME)
    expect(unkept()).toBe(false)
    expect(useSaving.getState()).toMatchObject({ kept: useApp.getState().project, failed: false })
    files.none()
  })

  it('Ctrl+Shift+S and File › Save do the same: kept, "Project saved", no file', async () => {
    const files = noFiles()
    render(<App />)
    edit()
    await ctrlS(true)
    expect(toast()?.text).toBe('Project saved')
    expect(readBrowserCopy()!.project).toEqual(useApp.getState().project)
    useToast.setState({ toast: null })
    act(() => useApp.getState().apply((p) => actions.renameProject(p, 'Planta Sur')))
    fireEvent.click(screen.getByRole('menuitem', { name: 'File' }))
    await act(async () => fireEvent.click(screen.getByRole('menuitem', { name: /^Save\s*Ctrl\+S$/ })))
    expect(toast()?.text).toBe('Project saved')
    expect(readBrowserCopy()!.project.name).toBe('Planta Sur')
    files.none()
  })

  it('the indicator: Not saved yet (the demo just opened), Unsaved changes (autosave off, a change), Saved <time> (Ctrl+S)', async () => {
    render(<App />)
    useSaving.getState().setAutosave(false)
    expect(indicator()).toHaveTextContent('Not saved yet')
    edit()
    expect(indicator()).toHaveTextContent('Unsaved changes')
    await ctrlS()
    expect(indicator()).toHaveTextContent(TIME)
    act(() => useApp.getState().apply((p) => actions.renameProject(p, 'Planta Sur')))
    expect(indicator()).toHaveTextContent('Unsaved changes')
  })

  it('the storage will not take it (setItem throws): the error, "Not saved", never "Project saved"; nothing counts as kept', async () => {
    render(<App />)
    useSaving.getState().setAutosave(false)
    edit()
    storageFull()
    await ctrlS()
    expect(toast()).toMatchObject({ kind: 'error', text: SAVE_FAILED })
    expect(SAVE_FAILED).toBe('Could not save: this browser’s storage is full or blocked. File › Export › Project (.gft) keeps a copy.')
    expect(indicator()).toHaveTextContent('Not saved')
    expect(indicator()).not.toHaveTextContent(TIME)
    expect(useSaving.getState()).toMatchObject({ failed: true, kept: null })
    expect(unkept()).toBe(true)
  })

  it('a copy that reads back different, or not at all, is not saved either', async () => {
    render(<App />)
    useSaving.getState().setAutosave(false)
    edit()
    const wrote = useApp.getState().project
    const read = vi.spyOn(library, 'read')
    read.mockReturnValue({ project: { ...wrote, name: 'Not what was written' }, option: 'o1', savedAt: 1 })
    await ctrlS()
    expect(toast()).toMatchObject({ kind: 'error', text: SAVE_FAILED })
    expect(indicator()).toHaveTextContent('Not saved')
    // one option short, or in another option than the one in view
    useToast.setState({ toast: null })
    read.mockReturnValue({ project: wrote, option: 'elsewhere', savedAt: 1 })
    await ctrlS()
    expect(toast()).toMatchObject({ kind: 'error', text: SAVE_FAILED })
    useToast.setState({ toast: null })
    read.mockReturnValue(null)
    await ctrlS()
    expect(toast()).toMatchObject({ kind: 'error', text: SAVE_FAILED })
    expect(useSaving.getState().failed).toBe(true)
    // the browser well again: saved, and the indicator says so
    read.mockRestore()
    await ctrlS()
    expect(toast()?.text).toBe('Project saved')
    expect(useSaving.getState().failed).toBe(false)
    expect(indicator()).toHaveTextContent(TIME)
  })

  it('a project the reading normalises (a building left without masses) is still saved: what is read back is the project as it opens', async () => {
    useSaving.getState().setAutosave(false)
    const p = useApp.getState().project
    // a second building no mass stands in, as a verb or an old session may leave
    const empty = { ...p, buildings: [...p.buildings, { ...p.buildings[0], id: 'b-empty', levels: p.buildings[0].levels.map((l) => ({ ...l, id: `${l.id}-empty` })) }], options: p.options.map((o) => ({ ...o, buildingIds: [...o.buildingIds, 'b-empty'] })) }
    act(() => useApp.getState().open(empty))
    await ctrlS()
    expect(toast()?.text).toBe('Project saved')
    expect(readBrowserCopy()!.project.buildings.some((b) => b.id === 'b-empty')).toBe(false)
  })

  it('while typing: the field’s number goes in first and is what is kept; the browser’s Save page never opens', async () => {
    const files = noFiles()
    useUi.setState({ dialog: 'brief' })
    render(<App />)
    useSaving.getState().setAutosave(false)
    const field = screen.getByRole('textbox', { name: 'Target area of Office' })
    field.focus()
    fireEvent.change(field, { target: { value: '1500' } })
    const e = new KeyboardEvent('keydown', { key: 's', ctrlKey: true, cancelable: true })
    Object.defineProperty(e, 'target', { value: field })
    await act(async () => handleKey(e))
    expect(e.defaultPrevented).toBe(true)
    expect(useApp.getState().project.programs.find((g) => g.id === 'office')!.target!.area).toBe(1500)
    expect(readBrowserCopy()!.project.programs.find((g) => g.id === 'office')!.target!.area).toBe(1500)
    expect(toast()?.text).toBe('Project saved')
    files.none()
  })

  it('what is saved is the project: a reload (the store started again from the browser’s copy) opens it, in the option that was in view', async () => {
    render(<App />)
    useSaving.getState().setAutosave(false)
    act(() => useApp.getState().apply((p) => actions.addOption(p).project))
    act(() => useApp.getState().apply((p) => actions.renameProject(p, 'Planta Norte')))
    const second = useApp.getState().project.options[1].id
    act(() => useApp.getState().setOption(second))
    edit()
    await ctrlS()
    const copy = readBrowserCopy()!
    const reloaded = createAppStore(copy.project, copy.option ?? undefined).getState()
    expect(reloaded.project).toEqual(useApp.getState().project)
    expect(reloaded.option).toBe(second)
    expect(reloaded.project.name).toBe('Planta Norte')
    expect(reloaded.project.options).toHaveLength(2)
    expect(reloaded.derived.issues).toEqual(useApp.getState().derived.issues)
  })

  it('autosave and Save agree: after either the indicator reads Saved and the copy is the project, the same copy', async () => {
    vi.useFakeTimers()
    render(<App />)
    edit()
    act(() => vi.advanceTimersByTime(AUTOSAVE_DELAY))
    const byAutosave = localStorage.getItem(projectKey(useApp.getState().project.id))
    expect(indicator()).toHaveTextContent(TIME)
    expect(readBrowserCopy()!.project).toEqual(useApp.getState().project)
    // the same project saved with Ctrl+S: what is kept is the same (only the time of keeping differs)
    await ctrlS()
    const bySave = localStorage.getItem(projectKey(useApp.getState().project.id))
    expect(JSON.parse(bySave!).project).toEqual(JSON.parse(byAutosave!).project)
    expect(JSON.parse(bySave!).option).toBe(JSON.parse(byAutosave!).option)
    expect(indicator()).toHaveTextContent(TIME)
    // a change and a Ctrl+S before autosave's moment passed: kept at once, and autosave finds nothing left to do
    act(() => useApp.getState().apply((p) => actions.renameProject(p, 'Planta Este')))
    await ctrlS()
    expect(readBrowserCopy()!.project.name).toBe('Planta Este')
    act(() => vi.advanceTimersByTime(AUTOSAVE_DELAY))
    expect(readBrowserCopy()!.project.name).toBe('Planta Este')
    expect(indicator()).toHaveTextContent(TIME)
    expect(unkept()).toBe(false)
  })

  it('the check is cheap enough for autosave: keep() on the demo, written and read back, takes a few milliseconds', () => {
    const t = Array.from({ length: 7 }, () => {
      const t0 = performance.now()
      expect(keep()).toBe(true)
      return performance.now() - t0
    }).sort((a, b) => a - b)
    // the median of seven keeps. Typically a few milliseconds; the bound is loose on purpose (a loaded machine, a parallel
    // suite, made 30 ms flaky) and only catches an accidental blow-up: a change every 600 ms must not notice a keep
    expect(t[3]).toBeLessThan(250)
  })
})

describe('Ctrl+S in the editors saves what the editor’s own Save saves; nothing is downloaded', () => {
  it('the block editor: a new block is saved to the library at once, as its Save to library does, and the project is never kept', async () => {
    const files = noFiles()
    expect(openBlockEditor(null)).toBe(true)
    expect(useApp.getState().project.id).not.toBe(demoProject().id)
    expect(blockUnsaved()).toBe(true)
    await ctrlS()
    expect(toast()).toMatchObject({ kind: 'info', text: expect.stringMatching(/^Saved “.+”, a new block to the block library\./) })
    expect(blockUnsaved()).toBe(false)
    expect(libraryBlock(useApp.getState().project.warehouseTypes![0].library!.id)).toBeDefined()
    expect(readBrowserCopy()).toBeNull()
    expect(localStorage.getItem('gfit.current')).toBeNull()
    files.none()
  })

  it('the block editor on a library block: unchanged, Ctrl+S saves nothing and says it is saved; changed, it asks Overwrite or a copy as the button does, and writes nothing until answered', async () => {
    const files = noFiles()
    render(<App />)
    act(() => {
      expect(openBlockEditor('gfit-cross-dock')).toBe(true)
    })
    await ctrlS()
    expect(toast()).toMatchObject({ kind: 'info', text: 'This block is already saved in the library.' })
    expect(libraryBlock('gfit-cross-dock')!.block.version).toBe(1)
    useToast.setState({ toast: null })
    const id = useBlockEditor.getState().typeId!
    act(() => useApp.getState().apply((p) => ({ ...p, warehouseTypes: p.warehouseTypes!.map((t) => (t.id === id ? { ...t, name: 'Cross-dock XL' } : t)) })))
    await ctrlS()
    const ask = await screen.findByRole('group', { name: 'Save to library' })
    expect(ask).toHaveTextContent('is GFit’s: overwrite it in this browser, or save a copy?')
    expect(toast()).toBeNull()
    expect(libraryBlock('gfit-cross-dock')!.block.version).toBe(1)
    fireEvent.click(within(ask).getByRole('button', { name: 'Overwrite' }))
    expect(libraryBlock('gfit-cross-dock')!.block.version).toBe(2)
    expect(blockUnsaved()).toBe(false)
    // pressed again with nothing changed: no third version
    await ctrlS()
    expect(toast()).toMatchObject({ kind: 'info', text: 'This block is already saved in the library.' })
    expect(libraryBlock('gfit-cross-dock')!.block.version).toBe(2)
    files.none()
  })

  it('the terrain editor: the site is saved to this browser’s terrains, as its Save to library does; with nothing to save it says so', async () => {
    const files = noFiles()
    useApp.getState().open({ ...newProject('blank', 'Terrain editor'), id: TERRAIN_EDITOR_ID })
    useTerrainEditor.setState({ open: true, name: 'Lote 7', id: null, saved: null, back: null })
    await ctrlS()
    expect(toast()).toMatchObject({ kind: 'error', text: expect.stringMatching(/^Nothing to save yet/) })
    act(() => {
      const p = useApp.getState().project
      useApp.getState().open({ ...p, site: { ...p.site, boundary: sampleProject().site.boundary } })
    })
    expect(terrainUnsaved()).toBe(true)
    await ctrlS()
    expect(toast()).toMatchObject({ kind: 'info', text: 'Saved “Lote 7” to this browser’s terrains.' })
    expect(terrainUnsaved()).toBe(false)
    expect(readBrowserCopy()).toBeNull()
    // pressed again with nothing changed: no new version, and it says so; a rename is a change
    const saved = libraryTerrain(useTerrainEditor.getState().id!)!.terrain.version
    await ctrlS()
    expect(toast()).toMatchObject({ kind: 'info', text: 'This terrain is already saved in the library.' })
    expect(libraryTerrain(useTerrainEditor.getState().id!)!.terrain.version).toBe(saved)
    useTerrainEditor.setState({ name: 'Lote 8' })
    await ctrlS()
    expect(toast()?.text).toBe('Saved “Lote 8” to this browser’s terrains.')
    expect(libraryTerrain(useTerrainEditor.getState().id!)!.terrain.version).toBe(saved + 1)
    files.none()
  })
})

describe('what replacing or leaving a project asks (one notion of saved: this browser’s)', () => {
  it('unkept(): the project is not the one this browser keeps and it has changes; opening is not editing', async () => {
    // the demo just opened, a new project: nothing to lose
    expect(unkept()).toBe(false)
    edit()
    expect(unkept()).toBe(true)
    await ctrlS()
    expect(unkept()).toBe(false)
    // the app opened with a copy this browser keeps: not unkept, even with no history
    const kept = useApp.getState().project
    useSaving.setState({ kept })
    expect(unkept()).toBe(false)
    // another project opened: nothing changed yet, and this browser has not kept it
    act(() => useApp.getState().open(newProject('blank', 'Fresh')))
    forgetKept()
    expect(useSaving.getState()).toMatchObject({ kept: null, failed: false })
    expect(unkept()).toBe(false)
    act(() => useApp.getState().apply((p) => actions.renameProject(p, 'Fresh, changed')))
    expect(unkept()).toBe(true)
  })

  it('leaving the page with autosave off and changes this browser has not kept asks; after Ctrl+S it does not', async () => {
    render(<App />)
    useSaving.getState().setAutosave(false)
    const ask = () => {
      const e = new Event('beforeunload', { cancelable: true })
      window.dispatchEvent(e)
      return e.defaultPrevented
    }
    expect(ask()).toBe(false)
    edit()
    expect(ask()).toBe(true)
    await ctrlS()
    expect(ask()).toBe(false)
  })
})

describe('the indicator beside the project’s name', () => {
  it('sits right after the name; its icon and click stay autosave; its tooltip says where the copy lives and that Export is the backup', () => {
    render(<App />)
    const name = screen.getByRole('heading', { level: 1 })
    expect(name.nextElementSibling).toBe(indicator())
    const tip = indicator().getAttribute('title')!
    expect(tip).toMatch(/This browser keeps a copy of the project/)
    expect(tip).toMatch(/this address/)
    expect(tip).toMatch(/clearing the browser’s data removes it/i)
    expect(tip).toMatch(/Export › Project \(\.gft\) is the backup/)
    expect(tip).not.toMatch(/Ctrl\+S also saves a \.gft/)
    expect(indicator()).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(indicator())
    expect(indicator()).toHaveAttribute('aria-pressed', 'false')
    expect(indicator().getAttribute('title')).toMatch(/Autosave is off/)
  })
})
