// The shortcuts window (Project C, AS.1 task 6; plan Review Focus item 3): Edit › Keyboard shortcuts… lists every command by
// its menu with its key, searches by label, menu path and key, and gives a command another key: a row's Change waits for
// the next key; a key another command has in a place both answer in asks to move it (Move / Cancel), a reserved one is
// refused with its reason, anything else becomes the command's only key. The menu bar and the tools' titles show the change
// at once, a reload keeps it, Back to the default undoes it for one row and for all, Remove the key leaves none. While the
// window waits for a key, and while it is open at all, the keys of the project behind it run nothing. The store keeps only
// what differs from the defaults and never throws on a broken or blocked storage.
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../../App.tsx'
import { derive } from '../../../engine/derive.ts'
import { demoProject } from '../../../state/demo.ts'
import { emptyHistory } from '../../../state/history.ts'
import { NO_SELECTION, useApp } from '../../../state/store.ts'
import { useGraph } from '../../graph/graphState.ts'
import { useScreen } from '../../home/screen.ts'
import { useToast } from '../../layout/toast.ts'
import { useUi } from '../../layout/ui.ts'
import { useAccess } from '../../plan/access/accessState.ts'
import { useCommand } from '../../plan/command/commandState.ts'
import { DEFAULT_SNAP } from '../../plan/snap/kinds.ts'
import { useSnapSettings } from '../../plan/snap/settings.ts'
import { TOOLS, useTool } from '../../plan/tools/toolState.ts'
import { pickMenu, openMenu, rowOf as menuRow, closeMenus } from '../../__tests__/pickMenu.ts'
import { placeNow } from '../dispatch.ts'
import { registerAll } from '../index.ts'
import { commandOf, commands, menuEntries } from '../registry.ts'
import { commandForKey, keysOf, loadShortcuts, resetKeys, setKeys, SHORTCUTS_KEY, useShortcutsStore } from '../shortcuts.ts'
import { useShortcutsWindow } from '../shortcutsWindowState.ts'
import { letGo } from '../../tools/hand.ts'

vi.mock('../../scene/Scene.tsx', () => ({ Scene: () => <div data-testid="scene" /> }))

const MASS = 'm1'
const s = () => useApp.getState()

function reset() {
  localStorage.clear()
  registerAll()
  resetKeys()
  const p = demoProject()
  useApp.setState({ project: p, derived: derive(p, 'o1'), history: emptyHistory(), dragStart: null, selection: NO_SELECTION, level: 'l1', showAll: false, option: 'o1' })
  useUi.setState({ dialog: null, view: 'plan', rail: 'layers', panels: { left: true, right: true }, sheet: null, help: false, show: { kpis: true, drafting: true, tools: true } })
  useScreen.setState({ home: false, homeView: 'projects' })
  useToast.setState({ toast: null, confirmation: null })
  letGo()
  useAccess.setState({ picked: null, alsoGates: [] })
  useSnapSettings.setState({ settings: structuredClone(DEFAULT_SNAP) })
  useGraph.setState({ graph: false, tool: 'select', rule: null, relation: null })
  useCommand.getState().register(null)
  useShortcutsWindow.setState({ open: false })
}

beforeEach(reset)
afterEach(() => {
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

/** A key pressed on the page: it bubbles to the window like a real one (a letter is typed as the key itself). */
function press(key: string, init: KeyboardEventInit = {}): KeyboardEvent {
  const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init })
  act(() => void document.body.dispatchEvent(e))
  return e
}

function openWindow() {
  render(<App />)
  pickMenu('Edit', 'Keyboard shortcuts…')
  closeMenus()
  return screen.getByRole('dialog', { name: 'Keyboard shortcuts' })
}
const dialog = () => screen.getByRole('dialog', { name: 'Keyboard shortcuts' })
const row = (id: string): HTMLElement => {
  const r = dialog().querySelector<HTMLElement>(`[data-command="${id}"]`)
  if (!r) throw new Error(`No row for ${id}`)
  return r
}
const hasRow = (id: string) => !!dialog().querySelector(`[data-command="${id}"]`)
const chips = (id: string) => Array.from(row(id).querySelectorAll('kbd')).map((k) => k.textContent)
const change = (id: string) => fireEvent.click(within(row(id)).getByRole('button', { name: 'Change' }))
const search = (text: string) => fireEvent.change(within(dialog()).getByRole('searchbox'), { target: { value: text } })

describe('the command', () => {
  it('is Edit’s last item, after a separator, with no key', () => {
    registerAll()
    const edit = menuEntries(['Edit'])
    const last = edit[edit.length - 1]
    expect(last).toMatchObject({ key: 'edit.shortcuts', label: 'Keyboard shortcuts…' })
    expect(edit[edit.length - 2]).toBe('separator')
    expect(commandOf('edit.shortcuts')!.key).toBeUndefined()
    expect(keysOf('edit.shortcuts')).toEqual([])
  })

  it('opens the window from the menu: a modal dialog labelled Keyboard shortcuts', () => {
    const d = openWindow()
    expect(d).toHaveAttribute('aria-modal', 'true')
    expect(useShortcutsWindow.getState().open).toBe(true)
  })
})

describe('the list', () => {
  it('groups the commands by their menu path, in the registry’s order, each row its label and keys as chips', () => {
    openWindow()
    const titles = within(dialog()).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)
    for (const t of ['File', 'File › Export', 'Edit', 'View', 'Site', 'Design', 'Tools', 'Tools › Massing', 'Help']) expect(titles, t).toContain(t)
    expect(titles.indexOf('File')).toBeLessThan(titles.indexOf('File › Export'))
    expect(titles.indexOf('File › Export')).toBeLessThan(titles.indexOf('Edit'))
    expect(titles.indexOf('Edit')).toBeLessThan(titles.indexOf('Tools'))
    expect(row('file.save')).toHaveTextContent('Save')
    expect(chips('file.save')).toEqual(['Ctrl+S', 'Ctrl+Shift+S'])
    expect(chips('tool.move')).toEqual(['M'])
    // a command without a key says so
    expect(chips('view.overlay.graph')).toEqual([])
    expect(row('view.overlay.graph')).toHaveTextContent('—')
    // a function label is called
    expect(row('edit.lock')).toHaveTextContent('Lock')
  })

  it('Phase AS.4’s verbs are rows: Rename F2, Lock Ctrl+Shift+L, Hide Ctrl+H, and Properties with no key (F3 is the snap’s)', () => {
    openWindow()
    expect(chips('edit.rename')).toEqual(['F2'])
    expect(chips('edit.lock')).toEqual(['Ctrl+Shift+L'])
    expect(chips('edit.hide')).toEqual(['Ctrl+H'])
    expect(row('edit.hide')).toHaveTextContent('Hide')
    expect(chips('edit.properties')).toEqual([])
    expect(row('edit.properties')).toHaveTextContent('—')
    // each is under Edit, so a search by the key finds it
    search('F2')
    expect(hasRow('edit.rename')).toBe(true)
  })

  it('lists every command of the registry but the per-option rows, whose ids change with the project', () => {
    openWindow()
    const perOption = (id: string) => id.startsWith('design.option.go.')
    expect(commands().some((c) => perOption(c.id))).toBe(true)
    for (const c of commands()) expect(hasRow(c.id), c.id).toBe(!perOption(c.id))
    expect(hasRow('edit.shortcuts')).toBe(true)
    expect(hasRow('design.option.new')).toBe(true)
  })

  it('the Rules window’s and the block editor’s keys are rows too, under their own menus', () => {
    openWindow()
    expect(chips('rules.rule')).toEqual(['R'])
    expect(chips('block.ruler')).toEqual(['T'])
  })
})

describe('the search', () => {
  it('finds by label, by menu path and by key; it ignores case', () => {
    openWindow()
    search('MOVE')
    expect(hasRow('tool.move')).toBe(true)
    expect(hasRow('file.save')).toBe(false)
    search('export')
    expect(hasRow('file.export.cad')).toBe(true)
    expect(hasRow('edit.undo')).toBe(false)
    search('ctrl+s')
    expect(hasRow('file.save')).toBe(true)
    expect(hasRow('edit.undo')).toBe(false)
    search('f3')
    expect(hasRow('view.snap')).toBe(true)
    expect(hasRow('view.ortho')).toBe(false)
    search('no command is called this')
    expect(within(dialog()).getByText(/nothing matches/i)).toBeInTheDocument()
  })

  it('a group with no match loses its title, and clearing the search brings everything back', () => {
    openWindow()
    search('zoom to the model')
    search('Undo')
    const titles = within(dialog()).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)
    expect(titles).toEqual(['Edit'])
    search('')
    expect(hasRow('file.save')).toBe(true)
  })

  it('follows the user’s keys, not only the defaults', () => {
    openWindow()
    act(() => setKeys('tool.move', ['Ctrl+Alt+K']))
    search('ctrl+alt+k')
    expect(hasRow('tool.move')).toBe(true)
  })
})

describe('giving a key', () => {
  it('Change waits: the row says Press a key…, and the next key is the command’s only key', () => {
    openWindow()
    change('tool.move')
    expect(row('tool.move')).toHaveTextContent('Press a key…')
    const e = press('x')
    expect(e.defaultPrevented).toBe(true)
    expect(row('tool.move')).not.toHaveTextContent('Press a key…')
    expect(chips('tool.move')).toEqual(['X'])
    expect(keysOf('tool.move')).toEqual(['X'])
    expect(JSON.parse(localStorage.getItem(SHORTCUTS_KEY)!)).toEqual({ 'tool.move': ['X'] })
  })

  it('pressing the key chip waits too; a chord typed in another case or order is the same chord', () => {
    openWindow()
    fireEvent.click(within(row('edit.duplicate')).getByRole('button', { name: 'Ctrl+D' }))
    expect(row('edit.duplicate')).toHaveTextContent('Press a key…')
    press('E', { ctrlKey: true, shiftKey: true, altKey: true })
    expect(keysOf('edit.duplicate')).toEqual(['Ctrl+Alt+Shift+E'])
    expect(chips('edit.duplicate')).toEqual(['Ctrl+Alt+Shift+E'])
  })

  it('a modifier alone is not the key; Escape cancels the waiting and the window stays', () => {
    openWindow()
    change('tool.move')
    press('Shift', { shiftKey: true })
    expect(row('tool.move')).toHaveTextContent('Press a key…')
    const e = press('Escape')
    expect(e.defaultPrevented).toBe(true)
    expect(row('tool.move')).not.toHaveTextContent('Press a key…')
    expect(chips('tool.move')).toEqual(['M'])
    expect(keysOf('tool.move')).toEqual(['M'])
    expect(useShortcutsWindow.getState().open).toBe(true)
    // not waiting: Escape closes it
    press('Escape')
    expect(screen.queryByRole('dialog', { name: 'Keyboard shortcuts' })).toBeNull()
  })

  it('a reserved key is refused with its reason, and nothing changes', () => {
    openWindow()
    change('tool.move')
    press('5')
    expect(row('tool.move')).toHaveTextContent(/digits are typed into the command line/i)
    expect(keysOf('tool.move')).toEqual(['M'])
    expect(useShortcutsStore.getState().user).toEqual({})
    change('tool.move')
    press('n', { ctrlKey: true })
    expect(row('tool.move')).toHaveTextContent(/browser keeps this key/i)
    expect(keysOf('tool.move')).toEqual(['M'])
  })

  it('a key another command has in the same place asks: its label named, Move takes it, the other keeps nothing', () => {
    openWindow()
    change('tool.move')
    press('v')
    expect(row('tool.move')).toHaveTextContent('V is Select’s: move it here?')
    expect(keysOf('tool.move')).toEqual(['M'])
    expect(keysOf('tool.select')).toEqual(['V'])
    fireEvent.click(within(row('tool.move')).getByRole('button', { name: 'Move' }))
    expect(keysOf('tool.move')).toEqual(['V'])
    expect(keysOf('tool.select')).toEqual([])
    expect(chips('tool.select')).toEqual([])
    expect(row('tool.select')).toHaveTextContent('—')
    expect(commandForKey('V', 'project')!.id).toBe('tool.move')
    expect(row('tool.move')).not.toHaveTextContent(/move it here/)
  })

  it('Cancel leaves both as they were', () => {
    openWindow()
    change('tool.move')
    press('v')
    fireEvent.click(within(row('tool.move')).getByRole('button', { name: 'Cancel' }))
    expect(keysOf('tool.move')).toEqual(['M'])
    expect(keysOf('tool.select')).toEqual(['V'])
    expect(row('tool.move')).not.toHaveTextContent(/move it here/)
    expect(useShortcutsStore.getState().user).toEqual({})
  })

  it('taking a key from a command with two leaves it the other one', () => {
    openWindow()
    change('tool.move')
    press('y', { ctrlKey: true })
    fireEvent.click(within(row('tool.move')).getByRole('button', { name: 'Move' }))
    expect(keysOf('tool.move')).toEqual(['Ctrl+Y'])
    expect(keysOf('edit.redo')).toEqual(['Ctrl+Shift+Z'])
    expect(chips('edit.redo')).toEqual(['Ctrl+Shift+Z'])
  })

  it('a command with two defaults that is given a key has that one only, and Back to the default gives both back', () => {
    openWindow()
    change('edit.redo')
    press('q')
    expect(keysOf('edit.redo')).toEqual(['Q'])
    fireEvent.click(within(row('edit.redo')).getByRole('button', { name: 'Back to the default' }))
    expect(keysOf('edit.redo')).toEqual(['Ctrl+Y', 'Ctrl+Shift+Z'])
  })

  it('a command that never answers where the other does is no conflict: Rotate 90° may have the Rules window’s S', () => {
    openWindow()
    change('edit.rotate90')
    // S is the Split tool's on the plan (Phase D.3), so the key given is one the plan has free
    press('e')
    expect(row('edit.rotate90')).not.toHaveTextContent(/move it here/)
    expect(keysOf('edit.rotate90')).toEqual(['E'])
    expect(keysOf('rules.solve')).toEqual(['S'])
    expect(commandForKey('E', 'project')!.id).toBe('edit.rotate90')
    expect(commandForKey('S', 'rules')!.id).toBe('rules.solve')
  })

  it('a conflict also considers the user’s keys of the others, not only the defaults', () => {
    openWindow()
    // Move has X now; M is nobody’s
    act(() => setKeys('tool.move', ['X']))
    change('tool.copy')
    press('m')
    expect(row('tool.copy')).not.toHaveTextContent(/move it here/)
    expect(keysOf('tool.copy')).toEqual(['M'])
    change('tool.rotate')
    press('x')
    expect(row('tool.rotate')).toHaveTextContent('X is Move’s: move it here?')
  })

  it('a command that answers in more places conflicts with one that answers in only one of them', () => {
    openWindow()
    // Undo answers in a project, Rules, the block editor and other windows; Rule (Rules window) has R
    change('edit.undo')
    press('r')
    expect(row('edit.undo')).toHaveTextContent(/R is .+: move it here\?/)
  })

  it('the row being edited stays on screen while the search would hide it', () => {
    openWindow()
    change('tool.move')
    search('save')
    expect(hasRow('tool.move')).toBe(true)
    expect(row('tool.move')).toHaveTextContent('Press a key…')
    press('x')
    expect(keysOf('tool.move')).toEqual(['X'])
  })

  it('Remove the key leaves the command with none; it is kept so a reload does not bring the default back', () => {
    openWindow()
    fireEvent.click(within(row('tool.move')).getByRole('button', { name: 'Remove the key' }))
    expect(keysOf('tool.move')).toEqual([])
    expect(row('tool.move')).toHaveTextContent('—')
    expect(within(row('tool.move')).queryByRole('button', { name: 'Remove the key' })).toBeNull()
    expect(JSON.parse(localStorage.getItem(SHORTCUTS_KEY)!)).toEqual({ 'tool.move': [] })
    act(() => {
      useShortcutsStore.setState({ user: {} })
      loadShortcuts()
    })
    expect(keysOf('tool.move')).toEqual([])
  })

  it('Back to the default shows only on a row that differs, and a row with no key has no Remove', () => {
    openWindow()
    expect(within(row('tool.move')).queryByRole('button', { name: 'Back to the default' })).toBeNull()
    expect(within(row('view.overlay.graph')).queryByRole('button', { name: 'Remove the key' })).toBeNull()
    change('tool.move')
    press('x')
    fireEvent.click(within(row('tool.move')).getByRole('button', { name: 'Back to the default' }))
    expect(keysOf('tool.move')).toEqual(['M'])
    expect(within(row('tool.move')).queryByRole('button', { name: 'Back to the default' })).toBeNull()
    expect(localStorage.getItem(SHORTCUTS_KEY)).toBe('{}')
  })

  it('All back to the defaults asks first, and on Continue puts every key back', () => {
    openWindow()
    act(() => {
      setKeys('tool.move', ['X'])
      setKeys('edit.undo', [])
      setKeys('view.snap', ['Q'])
    })
    fireEvent.click(within(dialog()).getByRole('button', { name: 'All back to the defaults' }))
    // asked, nothing yet
    expect(useToast.getState().confirmation).not.toBeNull()
    expect(keysOf('tool.move')).toEqual(['X'])
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(keysOf('tool.move')).toEqual(['M'])
    expect(keysOf('edit.undo')).toEqual(['Ctrl+Z'])
    expect(keysOf('view.snap')).toEqual(['F3'])
    expect(chips('tool.move')).toEqual(['M'])
  })

  it('Cancel on that question changes nothing', () => {
    openWindow()
    act(() => setKeys('tool.move', ['X']))
    fireEvent.click(within(dialog()).getByRole('button', { name: 'All back to the defaults' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(keysOf('tool.move')).toEqual(['X'])
  })

  it('says the keys are kept in this browser, and which keys cannot be given', () => {
    openWindow()
    expect(within(dialog()).getByText(/kept in this browser/i)).toBeInTheDocument()
    expect(within(dialog()).getByText(/cannot be given/i)).toBeInTheDocument()
  })
})

describe('everything shows the new key at once', () => {
  it('the menu bar’s item, a tool’s title and the window’s own row', () => {
    openWindow()
    const ruler = () => screen.getAllByRole('button', { name: 'Ruler' }).map((b) => b.getAttribute('title') ?? '').join()
    expect(ruler()).toContain('(T)')
    change('tool.ruler')
    press('x')
    // the title of the button on screen, with nothing else re-rendered by hand
    expect(ruler()).toContain('(X)')
    expect(ruler()).not.toContain('(T)')
    // a tool of the strip too (a getter read as it renders)
    act(() => setKeys('tool.move', ['Q']))
    expect(TOOLS.find((t) => t.key === 'move')!.title).toMatch(/\(Q\)$/)
    // the menu bar: Tools › Annotations › Ruler says X
    fireEvent.click(within(screen.getByRole('menubar')).getByRole('menuitem', { name: 'Tools' }))
    fireEvent.click(menuRow(openMenu()!, 'Annotations'))
    expect(menuRow(openMenu()!, 'Ruler')).toHaveTextContent('X')
    closeMenus()
    // the window’s own row
    expect(chips('tool.ruler')).toEqual(['X'])
  })

  it('a key given is a key that works, once the window is closed; the old one does nothing', () => {
    openWindow()
    change('tool.move')
    press('x')
    fireEvent.click(within(dialog()).getByRole('button', { name: /close/i }))
    expect(screen.queryByRole('dialog', { name: 'Keyboard shortcuts' })).toBeNull()
    act(() => s().select(MASS))
    expect(press('m').defaultPrevented).toBe(false)
    expect(useTool.getState().tool).toBe('select')
    expect(press('x').defaultPrevented).toBe(true)
    expect(useTool.getState().tool).toBe('move')
  })

  it('a reload (the store read again from localStorage) keeps the change', () => {
    openWindow()
    change('tool.move')
    press('x')
    act(() => {
      useShortcutsStore.setState({ user: {} })
      expect(keysOf('tool.move')).toEqual(['M'])
      loadShortcuts()
    })
    expect(keysOf('tool.move')).toEqual(['X'])
    expect(chips('tool.move')).toEqual(['X'])
  })
})

describe('the commands do not act behind the window', () => {
  it('while the window waits for a key, M does not pick Move: it is the key being given', () => {
    openWindow()
    act(() => s().select(MASS))
    change('tool.copy')
    const e = press('m')
    expect(e.defaultPrevented).toBe(true)
    expect(useTool.getState().tool).toBe('select')
    expect(row('tool.copy')).toHaveTextContent('M is Move’s: move it here?')
  })

  it('while it waits, no other command’s key runs either: Undo and Save are not run, they are the key', () => {
    openWindow()
    act(() => s().apply((p) => ({ ...p })))
    const undo = vi.spyOn(s(), 'undo')
    const save = vi.spyOn(commandOf('file.save')!, 'run').mockImplementation(() => {})
    change('tool.copy')
    press('z', { ctrlKey: true })
    expect(undo).not.toHaveBeenCalled()
    change('tool.copy')
    press('s', { ctrlKey: true })
    expect(save).not.toHaveBeenCalled()
  })

  it('with the window open and not waiting, M does not pick Move either: the window is a dialog', () => {
    openWindow()
    act(() => s().select(MASS))
    expect(placeNow()).toBe('dialog')
    expect(press('m').defaultPrevented).toBe(false)
    expect(useTool.getState().tool).toBe('select')
    // and what is picked behind it is not deleted
    press('Delete')
    expect(s().project.masses.some((m) => m.id === MASS)).toBe(true)
  })

  it('closed, the place is a project again', () => {
    openWindow()
    expect(placeNow()).toBe('dialog')
    fireEvent.click(within(dialog()).getByRole('button', { name: /close/i }))
    expect(placeNow()).toBe('project')
  })
})

describe('closing, and the frame', () => {
  it('✕ closes it, a press on the backdrop closes it, a press inside does not', () => {
    openWindow()
    fireEvent.mouseDown(dialog())
    expect(screen.queryByRole('dialog', { name: 'Keyboard shortcuts' })).not.toBeNull()
    fireEvent.mouseDown(dialog().parentElement!)
    expect(screen.queryByRole('dialog', { name: 'Keyboard shortcuts' })).toBeNull()
    pickMenu('Edit', 'Keyboard shortcuts…')
    closeMenus()
    fireEvent.click(within(dialog()).getByRole('button', { name: /close/i }))
    expect(screen.queryByRole('dialog', { name: 'Keyboard shortcuts' })).toBeNull()
  })

  it('Tab stays inside', () => {
    openWindow()
    const buttons = within(dialog()).getAllByRole('button')
    const last = buttons[buttons.length - 1]
    last.focus()
    const e = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
    act(() => void last.dispatchEvent(e))
    expect(e.defaultPrevented).toBe(true)
    expect(dialog().contains(document.activeElement)).toBe(true)
  })

  it('it scrolls inside itself: the search and the foot stay in place', () => {
    openWindow()
    const list = dialog().querySelector<HTMLElement>('[data-shortcuts-list]')!
    expect(list.className).toMatch(/overflow-y-auto/)
    expect(list.contains(row('file.save'))).toBe(true)
    // the search and the foot are outside what scrolls
    expect(list.contains(within(dialog()).getByRole('searchbox'))).toBe(false)
    expect(list.contains(within(dialog()).getByRole('button', { name: 'All back to the defaults' }))).toBe(false)
  })
})

describe('the review’s fixes in the window (findings 4, 7 and 12)', () => {
  it('the waiting ends when the pointer goes down outside the row: a click on the search field, then typing, types', () => {
    openWindow()
    change('tool.move')
    expect(row('tool.move')).toHaveTextContent('Press a key…')
    const box = within(dialog()).getByRole('searchbox')
    fireEvent.pointerDown(box)
    act(() => box.focus())
    expect(row('tool.move')).not.toHaveTextContent('Press a key…')
    const e = press('q', { bubbles: true })
    expect(e.defaultPrevented).toBe(false)
    expect(keysOf('tool.move')).toEqual(['M'])
    expect(useShortcutsStore.getState().user).toEqual({})
  })

  it('the waiting ends when the focus moves to a field, with no pointer (a Tab onto the search)', () => {
    openWindow()
    change('tool.move')
    // the focus was on the button (a click, a Tab), then it goes on to the search field
    within(row('tool.move')).getAllByRole('button', { name: 'Change' })[0].focus()
    expect(row('tool.move')).toHaveTextContent('Press a key…')
    act(() => within(dialog()).getByRole('searchbox').focus())
    expect(row('tool.move')).not.toHaveTextContent('Press a key…')
    const field = within(dialog()).getByRole('searchbox')
    act(() => void field.dispatchEvent(new KeyboardEvent('keydown', { key: 'q', bubbles: true, cancelable: true })))
    expect(keysOf('tool.move')).toEqual(['M'])
  })

  it('a press on the waiting row itself keeps the waiting; a press on another row’s Change moves it', () => {
    openWindow()
    change('tool.move')
    fireEvent.pointerDown(within(row('tool.move')).getByText('Press a key…'))
    expect(row('tool.move')).toHaveTextContent('Press a key…')
    fireEvent.pointerDown(within(row('tool.copy')).getByRole('button', { name: 'Change' }))
    expect(row('tool.move')).not.toHaveTextContent('Press a key…')
  })

  it('a key that a command another project offers has asks first, naming it: K given to Frame where there are no docks', () => {
    const p = demoProject()
    useApp.setState({ project: { ...p, typology: 'blank' }, derived: derive(p, 'o1') })
    registerAll()
    openWindow()
    expect(hasRow('tool.dock')).toBe(false)
    change('view.frame')
    press('k')
    expect(row('view.frame')).toHaveTextContent('K is Dock’s: move it here?')
    expect(keysOf('view.frame')).toEqual(['Z'])
    fireEvent.click(within(row('view.frame')).getByRole('button', { name: 'Move' }))
    expect(keysOf('view.frame')).toEqual(['K'])
    expect(keysOf('tool.dock')).toEqual([])
  })

  it('the per-option rows (design.option.go.<id>) are not listed, whatever the option is called', () => {
    openWindow()
    expect(hasRow('design.option.go.o1')).toBe(false)
    expect(hasRow('design.option.new')).toBe(true)
  })
})

describe('the store', () => {
  it('keeps only what differs from the defaults: back to exactly the defaults removes the entry', () => {
    setKeys('tool.move', ['X'])
    expect(useShortcutsStore.getState().user).toEqual({ 'tool.move': ['X'] })
    setKeys('tool.move', ['m'])
    expect(useShortcutsStore.getState().user).toEqual({})
    setKeys('edit.redo', ['Ctrl+Shift+Z', 'Ctrl+Y'])
    expect(useShortcutsStore.getState().user).toEqual({ 'edit.redo': ['Ctrl+Shift+Z', 'Ctrl+Y'] })
    setKeys('edit.redo', ['ctrl+y', 'ctrl+shift+z'])
    expect(useShortcutsStore.getState().user).toEqual({})
  })

  it('an unknown id on read is ignored: no command asks for it, and a command’s own entry is not hurt', () => {
    localStorage.setItem(SHORTCUTS_KEY, JSON.stringify({ 'no.such.command': ['Q'], 'tool.move': ['x'], 'tool.copy': 'oops' }))
    loadShortcuts()
    expect(keysOf('tool.move')).toEqual(['X'])
    expect(keysOf('tool.copy')).toEqual(['C'])
    // no command is called that, so the key opens nothing (the entry stays in the storage: a module the project does not
    // offer today may be back tomorrow with its keys)
    expect(commandForKey('Q', 'project')).toBeUndefined()
    expect(commands().some((c) => c.id === 'no.such.command')).toBe(false)
  })

  it('a broken or blocked storage leaves the defaults for the session without throwing', () => {
    localStorage.setItem(SHORTCUTS_KEY, '{not json')
    expect(() => loadShortcuts()).not.toThrow()
    expect(keysOf('tool.move')).toEqual(['M'])
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(() => loadShortcuts()).not.toThrow()
    expect(keysOf('tool.move')).toEqual(['M'])
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(() => setKeys('tool.move', ['X'])).not.toThrow()
    // the change lasts the session
    expect(keysOf('tool.move')).toEqual(['X'])
  })
})
