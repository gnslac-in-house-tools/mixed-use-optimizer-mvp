// The menu bar and the top bar without its loose buttons (Project C, AS.1 task 5; spec "The frame", "The top menu"): the
// seven menus in the top bar, each opening what the registry says (label, key, tick, reason), a mouse that toggles and
// hovers along the bar, a keyboard that walks it (Alt or F10 in, arrows, Enter, Escape), the buttons that went into the
// menu gone from the bar, Undo and Redo reading their commands, a phone's ☰ and its sheet (every command the old ⋯
// offered is in it), Home without a bar, and the tutorials' anchors that moved to the menus.
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../../App.tsx'
import { derive } from '../../../engine/derive.ts'
import { demoProject } from '../../../state/demo.ts'
import { emptyHistory } from '../../../state/history.ts'
import { NO_SELECTION, useApp } from '../../../state/store.ts'
import { TYPOLOGIES } from '../../../typologies/index.ts'
import { MENUS, commandOf, commands, menuEntries, registerAll } from '../../commands/index.ts'
import { placeNow } from '../../commands/dispatch.ts'
import { menusFor } from '../../commands/registry.ts'
import { resetKeys, setKeys } from '../../commands/shortcuts.ts'
import { useScreen } from '../../home/screen.ts'
import { stepsOf } from '../../tour/tour.ts'
import { openMenu, pickMenu, rowOf } from '../../__tests__/pickMenu.ts'
import { useSaving } from '../saving.ts'
import { useToast } from '../toast.ts'
import { useUi } from '../ui.ts'
import type { MenuEntry } from '../../controls/Menu.tsx'

vi.mock('../../scene/Scene.tsx', () => ({ Scene: () => <div data-testid="scene" /> }))

beforeEach(() => {
  localStorage.clear()
  registerAll()
  resetKeys()
  const p = demoProject()
  useApp.setState({ project: p, derived: derive(p, 'o1'), history: emptyHistory(), dragStart: null, selection: NO_SELECTION, level: 'l1', showAll: false, option: 'o1' })
  useUi.setState({ dialog: null, view: 'plan', rail: 'layers', panels: { left: true, right: true }, sheet: null, help: false })
  useScreen.setState({ home: false, homeView: 'projects' })
  useToast.setState({ toast: null, confirmation: null })
  useSaving.setState({ autosave: true, kept: null, savedAt: null, failed: false })
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const bar = () => screen.getByRole('menubar')
const button = (name: string) => within(bar()).getByRole('menuitem', { name })
const banner = () => screen.getByRole('banner', { name: 'Top bar' })

describe('the menu bar', () => {
  it('has the seven menus, in order, each a menu button with its anchor; Home has no bar', () => {
    render(<App />)
    expect(bar()).toHaveAttribute('role', 'menubar')
    const buttons = within(bar()).getAllByRole('menuitem')
    expect(buttons.map((b) => b.textContent)).toEqual([...MENUS])
    for (const b of buttons) {
      expect(b).toHaveAttribute('aria-haspopup', 'menu')
      expect(b).toHaveAttribute('aria-expanded', 'false')
      expect(b).toHaveAttribute('data-tour', `menu-${b.textContent!.toLowerCase()}`)
    }
    // a bar that is closed is not a menu that is open: the letters still reach the commands
    expect(placeNow()).toBe('project')
  })

  it('shows only the menus that have a command where the user is: all seven in a project; Home has no bar of its own', () => {
    expect(menusFor('project')).toEqual([...MENUS])
    // what answers on Home: New and Load (File), Full screen (View), Help
    expect(menusFor('home')).toEqual(['File', 'View', 'Help'])
    act(() => useScreen.setState({ home: true }))
    render(<App />)
    expect(screen.queryByRole('menubar')).toBeNull()
    expect(screen.queryByRole('banner', { name: 'Top bar' })).toBeNull()
  })

  it('each menu opens its tree as the registry reads it: label, key, tick and the reason of a disabled row', () => {
    render(<App />)
    for (const name of MENUS) {
      fireEvent.click(button(name))
      expect(button(name)).toHaveAttribute('aria-expanded', 'true')
      const menu = screen.getByRole('menu', { name })
      const leaves = menuEntries([name]).filter((e): e is Exclude<MenuEntry, 'separator'> => e !== 'separator')
      expect(leaves.length).toBeGreaterThan(0)
      for (const e of leaves) {
        const row = rowOf(menu, e.label)
        expect(row, `${name} › ${e.label}`).toHaveAttribute('data-menu-key', e.key)
        if ('items' in e) expect(row).toHaveAttribute('aria-haspopup', 'menu')
        else if (e.detail) expect(row.textContent).toContain(e.detail)
        if (e.disabled) {
          expect(row).toBeDisabled()
          expect(row).toHaveAttribute('title', e.title)
        }
      }
      fireEvent.click(button(name))
      expect(openMenu()).toBeNull()
    }
  })

  it('spot checks: Save with Ctrl+S, Undo disabled saying why, Autosave ticked, Plan ticked with Alt+1, Solve all with its key', () => {
    render(<App />)
    fireEvent.click(button('File'))
    expect(rowOf(openMenu()!, 'Save').textContent).toContain('Ctrl+S')
    expect(rowOf(openMenu()!, 'Autosave')).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(button('Edit'))
    expect(rowOf(openMenu()!, 'Undo')).toBeDisabled()
    expect(rowOf(openMenu()!, 'Undo')).toHaveAttribute('title', 'Nothing to undo')
    fireEvent.click(button('View'))
    expect(rowOf(openMenu()!, 'Plan')).toHaveAttribute('aria-checked', 'true')
    expect(rowOf(openMenu()!, 'Plan').textContent).toContain('Alt+1')
    fireEvent.click(button('Design'))
    expect(rowOf(openMenu()!, 'Solve all').textContent).toContain('Ctrl+Enter')
  })

  it('reads the registry each time a menu opens: the user’s key, a label that changed and a list that grew', () => {
    render(<App />)
    fireEvent.click(button('File'))
    expect(rowOf(openMenu()!, 'Save').textContent).toContain('Ctrl+S')
    fireEvent.click(button('File'))
    act(() => setKeys('file.save', ['Ctrl+Alt+S']))
    fireEvent.click(button('File'))
    expect(rowOf(openMenu()!, 'Save').textContent).toContain('Ctrl+Alt+S')
    fireEvent.click(button('File'))
    // Design › Options: a new option is in the list the next time
    pickMenu('Design', 'Options', 'New')
    expect(useApp.getState().project.options.length).toBe(demoProject().options.length + 1)
    fireEvent.click(button('Design'))
    fireEvent.click(rowOf(openMenu()!, 'Options'))
    const names = useApp.getState().project.options.map((o) => o.name)
    for (const n of names) expect(rowOf(openMenu()!, n)).toBeInTheDocument()
  })

  it('a click opens a menu under its button, a second click on the same button closes it, a press then click does not reopen it', () => {
    render(<App />)
    fireEvent.click(button('Edit'))
    expect(screen.getByRole('menu', { name: 'Edit' })).toBeInTheDocument()
    fireEvent.click(button('Edit'))
    expect(openMenu()).toBeNull()
    expect(button('Edit')).toHaveAttribute('aria-expanded', 'false')
    // as a mouse does it: the press closes it (outside the menu), the click that follows must not open it again
    fireEvent.click(button('Edit'))
    fireEvent.pointerDown(button('Edit'))
    fireEvent.click(button('Edit'))
    expect(openMenu()).toBeNull()
    // and the next click opens it
    fireEvent.pointerDown(button('Edit'))
    fireEvent.click(button('Edit'))
    expect(screen.getByRole('menu', { name: 'Edit' })).toBeInTheDocument()
  })

  it('with a menu open, hovering another button opens that one; with none open, hovering does nothing', () => {
    render(<App />)
    fireEvent.mouseEnter(button('Edit'))
    expect(openMenu()).toBeNull()
    fireEvent.click(button('File'))
    fireEvent.mouseEnter(button('View'))
    expect(screen.queryByRole('menu', { name: 'File' })).toBeNull()
    expect(screen.getByRole('menu', { name: 'View' })).toBeInTheDocument()
    expect(button('View')).toHaveAttribute('aria-expanded', 'true')
    expect(button('File')).toHaveAttribute('aria-expanded', 'false')
  })

  it('← and → in an open menu go to the previous and the next menu, wrapping, and open it', () => {
    render(<App />)
    fireEvent.click(button('File'))
    // → on a row without a sub-menu: the next menu
    fireEvent.keyDown(document.activeElement ?? window, { key: 'ArrowRight' })
    expect(screen.getByRole('menu', { name: 'Edit' })).toBeInTheDocument()
    // ← at a top-level row: the previous, and from the first the last
    fireEvent.keyDown(document.activeElement ?? window, { key: 'ArrowLeft' })
    fireEvent.keyDown(document.activeElement ?? window, { key: 'ArrowLeft' })
    expect(screen.getByRole('menu', { name: 'Help' })).toBeInTheDocument()
    fireEvent.keyDown(document.activeElement ?? window, { key: 'ArrowRight' })
    expect(screen.getByRole('menu', { name: 'File' })).toBeInTheDocument()
    expect(screen.getAllByRole('menu')).toHaveLength(1)
  })

  it('Alt pressed and released alone, or F10, puts the focus on the first button; Alt with another key does not', () => {
    render(<App />)
    fireEvent.keyDown(window, { key: 'Alt', altKey: true })
    fireEvent.keyUp(window, { key: 'Alt' })
    expect(button('File')).toHaveFocus()
    ;(document.activeElement as HTMLElement).blur()
    // Alt+1 is the Plan view's key: the bar does not take it
    fireEvent.keyDown(window, { key: 'Alt', altKey: true })
    fireEvent.keyDown(window, { key: '1', altKey: true })
    fireEvent.keyUp(window, { key: 'Alt' })
    expect(button('File')).not.toHaveFocus()
    // F10 is prevented, and goes in
    const notPrevented = fireEvent.keyDown(window, { key: 'F10' })
    expect(notPrevented).toBe(false)
    expect(button('File')).toHaveFocus()
  })

  it('on the bar: → ← move along it (wrapping), ↓ and Enter open the menu, Escape gives the focus back to where it was', () => {
    render(<App />)
    const field = document.body.appendChild(document.createElement('input'))
    field.focus()
    fireEvent.keyDown(window, { key: 'F10' })
    expect(button('File')).toHaveFocus()
    fireEvent.keyDown(button('File'), { key: 'ArrowRight' })
    expect(button('Edit')).toHaveFocus()
    fireEvent.keyDown(button('Edit'), { key: 'ArrowLeft' })
    fireEvent.keyDown(button('File'), { key: 'ArrowLeft' })
    expect(button('Help')).toHaveFocus()
    fireEvent.keyDown(button('Help'), { key: 'ArrowRight' })
    expect(button('File')).toHaveFocus()
    fireEvent.keyDown(button('File'), { key: 'ArrowDown' })
    expect(screen.getByRole('menu', { name: 'File' })).toBeInTheDocument()
    // Escape closes the menu, the focus on its button; Escape again leaves the bar
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    expect(openMenu()).toBeNull()
    expect(button('File')).toHaveFocus()
    fireEvent.keyDown(button('File'), { key: 'ArrowRight' })
    fireEvent.keyDown(button('Edit'), { key: 'Enter' })
    expect(screen.getByRole('menu', { name: 'Edit' })).toBeInTheDocument()
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    fireEvent.keyDown(button('Edit'), { key: 'Escape' })
    expect(field).toHaveFocus()
    field.remove()
  })

  it('a pick runs its command and closes the menu; Escape and a press outside close it; so does the window losing focus', () => {
    render(<App />)
    pickMenu('File', 'Autosave')
    expect(openMenu()).toBeNull()
    expect(useSaving.getState().autosave).toBe(false)
    fireEvent.click(button('Edit'))
    fireEvent.keyDown(document.activeElement ?? window, { key: 'Escape' })
    expect(openMenu()).toBeNull()
    fireEvent.click(button('Edit'))
    fireEvent.pointerDown(document.body)
    expect(openMenu()).toBeNull()
    fireEvent.click(button('Edit'))
    fireEvent.blur(window)
    expect(openMenu()).toBeNull()
    expect(button('Edit')).toHaveAttribute('aria-expanded', 'false')
  })

  it('a disabled item does nothing and keeps the menu open', () => {
    render(<App />)
    fireEvent.click(button('Edit'))
    const undo = rowOf(openMenu()!, 'Undo')
    fireEvent.click(undo)
    expect(openMenu()).not.toBeNull()
  })
})

describe('the top bar', () => {
  it('is GFit, the menu bar, Undo and Redo, the project’s name with the save indicator, the option switch: in that order', () => {
    render(<App />)
    const home = within(banner()).getByRole('button', { name: /^GFit$/ })
    const undo = within(banner()).getByRole('button', { name: 'Undo' })
    const redo = within(banner()).getByRole('button', { name: 'Redo' })
    const name = within(banner()).getByRole('button', { name: /^Demo site$/ })
    const save = banner().querySelector('[data-tour="save"]')!
    const options = banner().querySelector('[data-tour="options"]')!
    const order = [home, bar(), undo, redo, name, save, options]
    for (let i = 0; i < order.length - 1; i++) expect(order[i].compareDocumentPosition(order[i + 1]) & Node.DOCUMENT_POSITION_FOLLOWING, `${i}`).toBeTruthy()
  })

  it('has no ⋯, View, Export, theme, Help, Tour, full screen, panel or Compare button: those are in the menus', () => {
    render(<App />)
    for (const name of ['More actions', 'View', 'Export', 'Dark mode', 'Light mode', 'Help', 'Tour', 'Full screen', 'Exit full screen', 'Layers and properties panel', 'Summary panel', 'Compare', 'Compare and export']) {
      expect(within(banner()).queryByRole('button', { name }), name).toBeNull()
    }
    expect(banner().querySelector('[data-panel-toggle]')).toBeNull()
    expect(banner().querySelector('[data-tour="compare"], [data-tour="export"], [data-tour="tour"]')).toBeNull()
    // the buttons that stand are the bar's: GFit, Undo, Redo, the name, the save indicator, the option switch
    const names = within(banner())
      .getAllByRole('button')
      .map((b) => b.getAttribute('aria-label') ?? b.textContent)
    expect(names).toEqual(['GFit', 'Undo', 'Redo', 'Demo site', 'Autosave on', expect.stringMatching(/Option/)])
  })

  it('Undo and Redo read their commands: disabled with nothing to undo saying why, then the label and the key', () => {
    render(<App />)
    const undo = within(banner()).getByRole('button', { name: 'Undo' })
    const redo = within(banner()).getByRole('button', { name: 'Redo' })
    expect(undo).toBeDisabled()
    expect(undo).toHaveAttribute('title', 'Nothing to undo')
    expect(redo).toBeDisabled()
    expect(redo).toHaveAttribute('title', 'Nothing to redo')
    act(() => useApp.getState().apply((p) => ({ ...p, name: 'Moved' })))
    expect(undo).toBeEnabled()
    expect(undo).toHaveAttribute('title', `Undo (${commandOf('edit.undo')!.key})`)
    fireEvent.click(undo)
    expect(useApp.getState().project.name).toBe('Demo site')
    expect(redo).toBeEnabled()
    expect(redo).toHaveAttribute('title', 'Redo (Ctrl+Y)')
    // a key the user gave shows in the title at once
    act(() => setKeys('edit.undo', ['Ctrl+Alt+Z']))
    act(() => useApp.getState().apply((p) => ({ ...p, name: 'Moved again' })))
    expect(undo).toHaveAttribute('title', 'Undo (Ctrl+Alt+Z)')
    fireEvent.click(redo)
  })

  it('keeps the menus on one line and gives way in the project’s name when there is no room', () => {
    render(<App />)
    expect(bar()).toHaveClass('shrink-0')
    expect(bar().className).toMatch(/whitespace-nowrap|flex-nowrap|shrink-0/)
    const name = within(banner()).getByRole('button', { name: /^Demo site$/ })
    expect(name.className).toMatch(/truncate/)
    expect(name.closest('h1')!.parentElement!.className).toMatch(/min-w-0/)
  })

  it('the bar’s menu does the same as the buttons that went: Export, panels, theme, full screen, Compare, Help', () => {
    render(<App />)
    // View › Panels › Summary panel hides the column, as its toggle did
    pickMenu('View', 'Panels', 'Summary panel')
    expect(useUi.getState().panels.right).toBe(false)
    pickMenu('View', 'Theme', 'Dark')
    expect(useUi.getState().theme).toBe('dark')
    pickMenu('View', 'Theme', 'Light')
    expect(useUi.getState().theme).toBe('light')
    pickMenu('Help', 'Help')
    expect(useUi.getState().help).toBe(true)
    // Design › Options › Compare… is the Compare switch's, off while there is one option alone
    fireEvent.click(button('Design'))
    fireEvent.click(rowOf(openMenu()!, 'Options'))
    expect(rowOf(openMenu()!, 'Compare…')).toHaveProperty('disabled', useApp.getState().project.options.length < 2)
  })
})

describe('a phone', () => {
  const stubPhone = () =>
    vi.stubGlobal(
      'matchMedia',
      vi.fn((media: string) => ({ media, matches: media.includes('max-width: 767'), addEventListener: vi.fn(), removeEventListener: vi.fn() })),
    )
  const sheet = () => screen.getByRole('dialog', { name: 'Menu' })
  /** The control of `path` in the sheet: the sections and sub-menus along it unfold, the last is the row. */
  const rowIn = (...path: string[]) => {
    let at: HTMLElement = sheet()
    for (const [i, label] of path.entries()) {
      const hit = within(at)
        .getAllByRole('button')
        .find((b) => b.getAttribute('data-sheet-label') === label)
      if (!hit) throw new Error(`No "${label}" in ${path.slice(0, i).join(' › ') || 'the sheet'}`)
      if (i < path.length - 1) {
        if (hit.getAttribute('aria-expanded') === 'false') fireEvent.click(hit)
        at = hit.parentElement!
      } else return hit
    }
    throw new Error('empty path')
  }

  it('has one ☰ button in place of the menu bar, and no bar, ⋯, Undo or Export button in the top bar', () => {
    stubPhone()
    render(<App />)
    expect(screen.queryByRole('menubar')).toBeNull()
    const menu = within(banner()).getByRole('button', { name: 'Menu' })
    expect(menu).toHaveAttribute('data-tour', 'menu')
    expect(menu).toHaveAttribute('aria-haspopup', 'dialog')
    expect(within(banner()).queryByRole('button', { name: 'More actions' })).toBeNull()
    expect(within(banner()).queryByRole('button', { name: 'Compare' })).toBeNull()
    // the view switch stays under the name
    expect(within(banner()).getByRole('tablist', { name: 'View' })).toBeInTheDocument()
  })

  it('☰ opens the seven menus as foldable sections; a pick runs the command and closes the sheet', () => {
    stubPhone()
    render(<App />)
    fireEvent.click(within(banner()).getByRole('button', { name: 'Menu' }))
    const sections = within(sheet()).getAllByRole('button', { expanded: false }).map((b) => b.getAttribute('data-sheet-label'))
    expect(sections).toEqual([...MENUS])
    fireEvent.click(rowIn('File', 'Autosave'))
    expect(useSaving.getState().autosave).toBe(false)
    expect(screen.queryByRole('dialog', { name: 'Menu' })).toBeNull()
    // a disabled row shows its reason and does nothing
    fireEvent.click(within(banner()).getByRole('button', { name: 'Menu' }))
    const undo = rowIn('Edit', 'Undo')
    expect(undo).toBeDisabled()
    expect(undo).toHaveAttribute('title', 'Nothing to undo')
    // a tick shows
    expect(rowIn('File', 'Autosave')).toHaveAttribute('aria-pressed', 'false')
    expect(rowIn('View', 'Plan')).toHaveAttribute('aria-pressed', 'true')
    // Escape and the press outside close it
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'Menu' })).toBeNull()
  })

  it('everything the old ⋯ offered is in the sheet: the two panels, New and Load, Save, Project data, the demo, the five exports, Undo, Redo, the theme, Default layout, Full screen, State graph', () => {
    stubPhone()
    Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, value: true })
    render(<App />)
    fireEvent.click(within(banner()).getByRole('button', { name: 'Menu' }))
    const old: string[][] = [
      ['View', 'Panels', 'Layers and properties panel'],
      ['View', 'Panels', 'Summary panel'],
      ...TYPOLOGIES.map((t) => ['File', `New ${t.name.toLowerCase()} project`]),
      ['File', 'Load project…'],
      ['File', 'Save'],
      ['File', 'Project data…'],
      ['File', 'Open the demo project'],
      ['File', 'Export', 'Project (.gft)'],
      ['File', 'Export', '3D model…'],
      ['File', 'Export', 'CAD plan (.dxf)'],
      ['File', 'Export', 'Image of the 3D view (.png)'],
      ['File', 'Export', 'Decision log (.csv)'],
      ['Edit', 'Undo'],
      ['Edit', 'Redo'],
      ['View', 'Theme', 'Light'],
      ['View', 'Theme', 'Dark'],
      ['View', 'Default layout'],
      ['View', 'Full screen'],
      ['Help', 'State graph'],
    ]
    for (const path of old) expect(rowIn(...path), path.join(' › ')).toBeInTheDocument()
    // every command of the registry that stands in a menu is in the sheet once, with its reason when it is off
    for (let again = true; again; ) {
      const folded = Array.from(sheet().querySelectorAll<HTMLElement>('[aria-expanded="false"]'))
      again = folded.length > 0
      for (const f of folded) fireEvent.click(f)
    }
    const shown = Array.from(sheet().querySelectorAll('[data-sheet-key]')).map((b) => b.getAttribute('data-sheet-key'))
    // a window's own command (the Rules window's and the block editor's keys) stands in no menu, the sheet's included
    for (const c of commands()) expect(shown.filter((k) => k === c.id), c.id).toHaveLength(c.window ? 0 : 1)
    Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, value: false })
  })

  it('View › Panels opens the phone’s Parameters and Summary sheets as the old rows did', () => {
    stubPhone()
    render(<App />)
    fireEvent.click(within(banner()).getByRole('button', { name: 'Menu' }))
    fireEvent.click(rowIn('View', 'Panels', 'Layers and properties panel'))
    expect(useUi.getState().sheet).toBe('left')
    fireEvent.click(within(banner()).getByRole('button', { name: 'Menu' }))
    fireEvent.click(rowIn('View', 'Panels', 'Summary panel'))
    expect(useUi.getState().sheet).toBe('right')
    expect(screen.queryByRole('dialog', { name: 'Menu' })).toBeNull()
  })
})

describe('the tutorials: the steps that pointed at a button that went point at its menu', () => {
  const step = (tutorial: 'tour' | 'zero', id: string) => stepsOf(tutorial).find((s) => s.id === id)!

  it('Compare → Design, Tour → Help, Export → File, each saying where the command is now', () => {
    expect(step('tour', 'compare').anchor).toBe('menu-design')
    expect(step('tour', 'compare').body.join(' ')).toMatch(/Design › Options › Compare/)
    expect(step('tour', 'end').anchor).toBe('menu-help')
    expect(step('tour', 'end').body.join(' ')).toMatch(/Help › Sample tour/)
    expect(step('zero', 'zero-export').anchor).toBe('menu-file')
    expect(step('zero', 'zero-export').body.join(' ')).toMatch(/File › Export › CAD plan \(\.dxf\)/)
  })

  it('no step of either tutorial anchors on an element the top bar no longer has', () => {
    const gone = new Set(['export', 'tour', 'compare', 'theme', 'help', 'view', 'fullscreen', 'more'])
    for (const t of ['tour', 'zero'] as const) for (const s of stepsOf(t)) expect(gone.has(s.anchor ?? ''), `${t}: ${s.id}`).toBe(false)
  })
})

describe('the review’s fixes in the bar (findings 11 and 13)', () => {
  it('Alt pressed, the window lost and found again, Alt released: the focus does not go to File', () => {
    render(<App />)
    fireEvent.keyDown(window, { key: 'Alt', altKey: true })
    // Alt+Tab away and back: the key is released after the window comes back
    act(() => void window.dispatchEvent(new Event('blur')))
    fireEvent.keyUp(window, { key: 'Alt' })
    expect(button('File')).not.toHaveFocus()
    // and Alt alone still goes in afterwards
    fireEvent.keyDown(window, { key: 'Alt', altKey: true })
    fireEvent.keyUp(window, { key: 'Alt' })
    expect(button('File')).toHaveFocus()
  })

  it('a click with no press before it (a screen reader, element.click()) opens the menu, and a second one closes it', () => {
    render(<App />)
    act(() => button('File').click())
    expect(button('File')).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('menu', { name: 'File' })).toBeInTheDocument()
    act(() => button('File').click())
    expect(button('File')).toHaveAttribute('aria-expanded', 'false')
    expect(openMenu()).toBeNull()
    act(() => button('Edit').click())
    expect(screen.getByRole('menu', { name: 'Edit' })).toBeInTheDocument()
  })

  it('a press on the open button that ended elsewhere (no click) does not swallow the next assistive click', async () => {
    render(<App />)
    act(() => button('File').click())
    expect(openMenu()).not.toBeNull()
    // pressed on the open button (it closes), the pointer dragged away and released: no click follows
    fireEvent.pointerDown(button('File'))
    fireEvent.pointerUp(document.body)
    expect(openMenu()).toBeNull()
    // a later turn: no click came with the release
    await act(async () => void (await new Promise((r) => setTimeout(r, 0))))
    act(() => button('File').click())
    expect(button('File')).toHaveAttribute('aria-expanded', 'true')
  })

  it('a real press then its click on the open button closes it and does not reopen it', () => {
    render(<App />)
    act(() => button('File').click())
    fireEvent.pointerDown(button('File'))
    fireEvent.pointerUp(button('File'))
    fireEvent.click(button('File'))
    expect(openMenu()).toBeNull()
    expect(button('File')).toHaveAttribute('aria-expanded', 'false')
  })
})
