// The review of AS.1, second half (findings 14 to 20): a window's own commands stand in no menu, the controls that stand for a
// command read it (the plan's right-click menu, Properties, the Rules window's button), an open menu's keys are its own, a held
// Enter picks nothing, a phone's menu, the top bar on a narrow window, and no key typed by hand in a notice or a title.
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../../App.tsx'
import { derive } from '../../../engine/derive.ts'
import { demoProject } from '../../../state/demo.ts'
import { emptyHistory } from '../../../state/history.ts'
import { NO_SELECTION, useApp } from '../../../state/store.ts'
import { useGraph, toggleRuleTool } from '../../graph/graphState.ts'
import { useScreen } from '../../home/screen.ts'
import { replaceText } from '../../layout/files.ts'
import { useSaving } from '../../layout/saving.ts'
import { useToast } from '../../layout/toast.ts'
import { useUi } from '../../layout/ui.ts'
import { copySelection } from '../../plan/clipboard.ts'
import { planMenu, rowsIn, type Row } from '../../editing/menu/__tests__/helpers.ts'
import { Ruler } from '../../plan/tools/Ruler.tsx'
import { behindModal, useDrawingKeys } from '../../plan/tools/common.tsx'
import { useRuler } from '../../plan/tools/toolState.ts'
import { anchorElement } from '../../tour/TourCard.tsx'
import { openMenu } from '../../__tests__/pickMenu.ts'
import { registerAll } from '../index.ts'
import { commandOf, commands, menuEntries } from '../registry.ts'
import { keyHint, keyOrMenu, resetKeys, setKeys } from '../shortcuts.ts'
import { useShortcutsWindow } from '../shortcutsWindowState.ts'
import { useShortcuts } from '../../useShortcuts.ts'
import { letGo, take } from '../../tools/hand.ts'

vi.mock('../../scene/Scene.tsx', () => ({ Scene: () => <div data-testid="scene" /> }))

const s = () => useApp.getState()
const MASS = 'm1'

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
  useShortcutsWindow.setState({ open: false })
  letGo()
})
afterEach(() => {
  // a menu a test put on the page by hand
  document.querySelectorAll('div[role="menu"]:empty').forEach((m) => m.remove())
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const stubPhone = () =>
  vi.stubGlobal(
    'matchMedia',
    vi.fn((media: string) => ({ media, matches: media.includes('max-width: 767'), addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  )

const names = (entries: ReturnType<typeof menuEntries>): string[] => entries.flatMap((e) => (e === 'separator' ? [] : [e.label]))

describe('a window’s own commands stand in no menu (finding 14)', () => {
  it('the Rules window’s and the block editor’s keys have `window`, and Design and Tools have no sub-menu for them', () => {
    expect(['rules.rule', 'rules.solve', 'rules.delete'].map((id) => commandOf(id)!.window)).toEqual(['rules', 'rules', 'rules'])
    expect(['dimension', 'ruler', 'snap', 'ortho', 'grid'].map((x) => commandOf(`block.${x}`)!.window)).toEqual(Array(5).fill('block-editor'))
    expect(names(menuEntries(['Design']))).not.toContain('Rules window')
    expect(names(menuEntries(['Tools']))).not.toContain('Block editor')
    expect(names(menuEntries(['Design', 'Rules window']))).toEqual([])
    expect(names(menuEntries(['Tools', 'Block editor']))).toEqual([])
  })

  it('no row of the menu is always grey: every command in the menu can be enabled from the project', () => {
    for (const c of commands().filter((x) => !x.window)) expect(c.where ?? ['project'], c.id).toContain('project')
  })

  it('the shortcuts window lists them under Rules window and Block editor, and the search finds them there', () => {
    render(<App />)
    act(() => useShortcutsWindow.setState({ open: true }))
    const dialog = screen.getByRole('dialog', { name: 'Keyboard shortcuts' })
    const titles = within(dialog).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)
    expect(titles).toContain('Rules window')
    expect(titles).toContain('Block editor')
    expect(titles).not.toContain('Design › Rules window')
    expect(titles).not.toContain('Tools › Block editor')
    expect(dialog.querySelector('[data-command="rules.rule"]')).not.toBeNull()
    fireEvent.change(within(dialog).getByRole('searchbox'), { target: { value: 'block editor' } })
    expect(dialog.querySelector('[data-command="block.ruler"]')).not.toBeNull()
    expect(dialog.querySelector('[data-command="rules.rule"]')).toBeNull()
  })

  it('the phone’s sheet leaves them out too', () => {
    stubPhone()
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Menu' }))
    const sheet = screen.getByRole('dialog', { name: 'Menu' })
    for (let again = true; again; ) {
      const folded = Array.from(sheet.querySelectorAll<HTMLElement>('[aria-expanded="false"]'))
      again = folded.length > 0
      for (const f of folded) fireEvent.click(f)
    }
    const shown = Array.from(sheet.querySelectorAll('[data-sheet-key]')).map((b) => b.getAttribute('data-sheet-key'))
    expect(shown.filter((k) => k?.startsWith('rules.') || k?.startsWith('block.'))).toEqual([])
    expect(shown).toContain('design.rules')
  })
})

describe('the controls that stand for a command read it (finding 15)', () => {
  const rows = () => rowsIn(planMenu())
  // a row of the menu, as the leaf it is (the commands’ rows are all leaves)
  const row = (key: string) => rows().find((r) => r.key === key) as Extract<Row, { onSelect(): void }>

  it('the plan’s right-click menu says Union, as the command does, and each command row has the command’s label, key and reason', () => {
    render(<App />)
    const pairs: [string, string][] = [
      ['copy', 'edit.copy'],
      ['paste', 'edit.paste'],
      ['paste-here', 'edit.paste-here'],
      ['duplicate', 'edit.duplicate'],
      ['group', 'edit.group'],
      ['ungroup', 'edit.ungroup'],
      ['union', 'tool.union'],
      ['rotate90', 'edit.rotate90'],
      ['lock', 'edit.lock'],
    ]
    act(() => s().selectMany(['m1']))
    for (const [key, id] of pairs) {
      const c = commandOf(id)!
      const r = row(key)
      expect(r.label, id).toBe(typeof c.label === 'function' ? c.label() : c.label)
      expect(r.detail ?? '', id).toBe(keyHint(id))
      const why = c.enabled?.() ?? true
      expect(Boolean(r.disabled), id).toBe(why !== true)
      if (why !== true) expect(r.title, id).toBe(why)
    }
    // Select all <kind> is the menu’s own row (Select all blocks), with the command’s key
    expect(row('select-all').label).toBe('Select all blocks')
    expect(row('select-all').detail ?? '').toBe(keyHint('edit.select-all'))
    expect(row('union').label).toBe('Union')
    expect(rows().some((r) => r.label === 'Merge')).toBe(false)
  })

  it('a key the user gave shows in the row, and picking a row runs the command', () => {
    render(<App />)
    act(() => s().selectMany(['m1']))
    setKeys('edit.rotate90', ['Ctrl+Alt+R'])
    expect(row('rotate90').detail).toBe('Ctrl+Alt+R')
    const run = vi.spyOn(commandOf('edit.rotate90')!, 'run').mockImplementation(() => {})
    row('rotate90').onSelect()
    expect(run).toHaveBeenCalledTimes(1)
    const dup = vi.spyOn(commandOf('edit.duplicate')!, 'run').mockImplementation(() => {})
    row('duplicate').onSelect()
    expect(dup).toHaveBeenCalledTimes(1)
  })

  it('Delete runs its own (the selected masses) and carries no key: the Delete key removes what is picked, a corner first', () => {
    render(<App />)
    act(() => s().selectMany(['m1']))
    expect(row('delete').detail).toBeUndefined()
    // a corner picked beside the mass: the key takes the corner, the row the mass
    const picked = vi.spyOn(commandOf('edit.delete')!, 'run').mockImplementation(() => {})
    row('delete').onSelect()
    expect(picked).not.toHaveBeenCalled()
    expect(s().project.masses.some((m) => m.id === MASS)).toBe(false)
  })

  it('Paste here keeps the place where the menu was opened, with the command’s label and key', () => {
    expect(row('paste-here').detail).toBe('Ctrl+Shift+V')
    expect(row('paste-here').label).toBe(commandOf('edit.paste-here')!.label)
  })

  it('Properties’ Rotate 90° is the command, with its key; Delete keeps its own run and shows no key', () => {
    act(() => useUi.setState({ rail: 'properties' }))
    render(<App />)
    act(() => s().select(MASS))
    const rotate = screen.getAllByRole('button', { name: 'Rotate 90°' })[0]
    expect(rotate.getAttribute('title')).toContain(keyHint('edit.rotate90'))
    const run = vi.spyOn(commandOf('edit.rotate90')!, 'run').mockImplementation(() => {})
    fireEvent.click(rotate)
    expect(run).toHaveBeenCalledTimes(1)
    const del = screen.getAllByRole('button', { name: 'Delete' }).find((b) => b.getAttribute('title') === 'Delete')
    expect(del, 'a Delete button titled with no key').toBeDefined()
  })

  it('Draw rule is one function: the Rules window’s button and the command call it', () => {
    expect(commandOf('rules.rule')!.run).toBe(toggleRuleTool)
    render(<App />)
    act(() => useUi.setState({ dialog: 'rules' }))
    fireEvent.click(screen.getByRole('button', { name: /draw rule/i }))
    expect(useGraph.getState().tool).toBe('rule')
    fireEvent.click(screen.getByRole('button', { name: /draw rule/i }))
    expect(useGraph.getState().tool).toBe('select')
  })

  it('the Program window’s Help button calls toggleHelp, as the command does', () => {
    const src = readFileSync(join(process.cwd(), 'src/modules/warehouse/views/ProgramWindow.tsx'), 'utf8')
    expect(src).not.toMatch(/setHelp\(/)
    expect(src).toMatch(/onClick=\{toggleHelp\}/)
  })
})

describe('an open menu’s keys are its own (findings 16 and 17)', () => {
  function Drawing({ calls }: { calls: string[] }) {
    useShortcuts()
    useDrawingKeys({ enter: () => (calls.push('enter'), true), escape: () => void calls.push('escape'), back: () => {} })
    return null
  }
  const menu = () => document.body.appendChild(Object.assign(document.createElement('div'), { role: 'menu' })).setAttribute('role', 'menu')

  it('behindModal is true while a menu is open', () => {
    expect(behindModal(null)).toBe(false)
    menu()
    expect(behindModal(null)).toBe(true)
    document.querySelector('[role="menu"]')!.remove()
    expect(behindModal(null)).toBe(false)
  })

  it('mid-stroke, Enter and Escape with a menu open are the menu’s: the stroke is neither finished nor cancelled', () => {
    const calls: string[] = []
    render(<Drawing calls={calls} />)
    fireEvent.keyDown(window, { key: 'Enter' })
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(calls).toEqual(['enter', 'escape'])
    menu()
    fireEvent.keyDown(window, { key: 'Enter' })
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(calls).toEqual(['enter', 'escape'])
  })

  it('the ruler’s Escape with a menu open leaves the measurement', () => {
    take('ruler')
    useRuler.setState({ a: { x: 1, y: 1 }, b: null })
    render(
      <svg>
        <Ruler camera={{ scale: 1, viewBox: undefined, toWorld: () => ({ x: 0, y: 0 }) }} />
      </svg>,
    )
    menu()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(useRuler.getState().a).toEqual({ x: 1, y: 1 })
    document.querySelector('[role="menu"]')!.remove()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(useRuler.getState().a).toBeNull()
  })

  const file = () => within(screen.getByRole('menubar')).getByRole('menuitem', { name: 'File' })

  // File's first row is New … project: a pick would close the menu (and ask before leaving this project)
  it('a held Enter opens File and picks nothing: its repeat does not take the first row, which has the focus', () => {
    render(<App />)
    file().focus()
    fireEvent.keyDown(file(), { key: 'Enter' })
    expect(openMenu()).not.toBeNull()
    expect(document.activeElement?.getAttribute('data-menu-key')).toBe('file.new.industrial')
    for (let i = 0; i < 3; i++) fireEvent.keyDown(document.activeElement ?? window, { key: 'Enter', repeat: true })
    expect(openMenu()).not.toBeNull()
    expect(useToast.getState().confirmation).toBeNull()
    // the next press is a pick: the menu closes
    fireEvent.keyDown(document.activeElement ?? window, { key: 'Enter' })
    expect(openMenu()).toBeNull()
  })

  it('a held Space does the same, and a repeat on the bar’s button does not open the menu', () => {
    render(<App />)
    file().focus()
    fireEvent.keyDown(file(), { key: ' ' })
    expect(openMenu()).not.toBeNull()
    fireEvent.keyDown(document.activeElement ?? window, { key: ' ', repeat: true })
    expect(openMenu()).not.toBeNull()
    fireEvent.keyDown(document.activeElement ?? window, { key: 'Escape' })
    expect(openMenu()).toBeNull()
    file().focus()
    fireEvent.keyDown(file(), { key: 'Enter', repeat: true })
    expect(openMenu()).toBeNull()
  })
})

describe('a phone (finding 18)', () => {
  const openSheet = () => {
    fireEvent.click(screen.getByRole('button', { name: 'Menu' }))
    const sheet = screen.getByRole('dialog', { name: 'Menu' })
    for (let again = true; again; ) {
      const folded = Array.from(sheet.querySelectorAll<HTMLElement>('[aria-expanded="false"]'))
      again = folded.length > 0
      for (const f of folded) fireEvent.click(f)
    }
    return sheet
  }
  const rowOf = (sheet: HTMLElement, key: string) => sheet.querySelector<HTMLElement>(`[data-sheet-key="${key}"]`)!

  it('Split is greyed with "Not on a phone" and never ticked; Plan is ticked in its place', () => {
    stubPhone()
    act(() => useUi.setState({ view: 'split' }))
    render(<App />)
    const sheet = openSheet()
    const split = rowOf(sheet, 'view.split')
    expect(split).toBeDisabled()
    expect(split.getAttribute('aria-pressed')).not.toBe('true')
    expect(within(split).getByText('Not on a phone')).toBeInTheDocument()
    expect(rowOf(sheet, 'view.plan').getAttribute('aria-pressed')).toBe('true')
    expect(commandOf('view.split')!.enabled!()).toBe('Not on a phone')
  })

  it('on a desktop Split is a view like the others', () => {
    expect(commandOf('view.split')!.enabled!()).toBe(true)
  })

  it('a greyed row says why under its label (a touch screen shows no title)', () => {
    stubPhone()
    render(<App />)
    const sheet = openSheet()
    const undo = rowOf(sheet, 'edit.undo')
    expect(undo).toBeDisabled()
    expect(within(undo).getByText('Nothing to undo')).toBeInTheDocument()
    // an enabled row has no reason line
    expect(rowOf(sheet, 'file.save').querySelector('[data-sheet-reason]')).toBeNull()
  })

  it('a tour step that points at a menu points at the ☰ on a phone: the Compare step', () => {
    render(<App />)
    expect(anchorElement('menu-design')).toBe(document.querySelector('[data-tour="menu-design"]'))
    expect(anchorElement('options')).toBe(document.querySelector('[data-tour="options"]'))
    expect(anchorElement('nothing')).toBeNull()
    document.body.innerHTML = ''
    stubPhone()
    render(<App />)
    expect(document.querySelector('[data-tour="menu-design"]')).toBeNull()
    expect(anchorElement('menu-design')).toBe(document.querySelector('[data-tour="menu"]'))
    expect(anchorElement('menu-help')).toBe(document.querySelector('[data-tour="menu"]'))
    expect(anchorElement('menu-design')).not.toBeNull()
  })
})

describe('the top bar on a narrow desktop window, 768 to 880 px (finding 19)', () => {
  it('the menus never wrap or shrink; the right side gives way: the name truncates, the save status is an icon, the option name truncates', () => {
    render(<App />)
    const banner = screen.getByRole('banner', { name: 'Top bar' })
    const bar = within(banner).getByRole('menubar')
    expect(bar).toHaveClass('shrink-0', 'whitespace-nowrap')
    for (const b of within(bar).getAllByRole('menuitem')) expect(b).toHaveClass('shrink-0')
    // GFit and Undo / Redo keep their width
    expect(within(banner).getByRole('button', { name: /^GFit$/ })).toHaveClass('shrink-0')
    // the right side may shrink, and so may what is in it
    const name = within(banner).getByRole('button', { name: /^Demo site$/ })
    expect(name).toHaveClass('truncate')
    const right = name.closest('h1')!.parentElement!
    expect(right).toHaveClass('min-w-0')
    expect(right.parentElement).toHaveClass('min-w-0', 'shrink')
    // the save status: its icon alone below the side panels' 880 px (the phone's own rule is in JS)
    const save = banner.querySelector('[data-tour="save"]')!
    const text = save.querySelector('span.tabular-nums')!
    expect(text).toHaveClass('hidden', 'panel:inline')
    // the option switch: its name truncates and the box may shrink
    const option = banner.querySelector('[data-tour="options"]')!
    expect(option).toHaveClass('min-w-0', 'shrink')
    expect(option.querySelector('button span')).toHaveClass('truncate', 'min-w-0')
  })
})

describe('no key typed by hand in a notice or a title (finding 20)', () => {
  it('the clipboard notice names the keys Paste and Paste here have now', () => {
    act(() => s().select(MASS))
    copySelection()
    expect(useToast.getState().toast?.text).toMatch(/Ctrl\+V pastes it in place, Ctrl\+Shift\+V at the pointer/)
    setKeys('edit.paste', ['Ctrl+Alt+P'])
    setKeys('edit.paste-here', [])
    useToast.setState({ toast: null })
    copySelection()
    expect(useToast.getState().toast?.text).toMatch(/Ctrl\+Alt\+P pastes it in place, Edit › Paste here at the pointer/)
  })

  it('leaving a project with changes names Save’s key; the save indicator’s title does too', () => {
    expect(replaceText('autosave is off')).toContain('(Ctrl+S)')
    setKeys('file.save', ['Ctrl+Alt+S'])
    expect(replaceText('autosave is off')).toContain('(Ctrl+Alt+S)')
    setKeys('file.save', [])
    expect(replaceText('autosave is off')).toContain('(File › Save)')
    resetKeys()
    useSaving.setState({ autosave: false })
    render(<App />)
    expect(screen.getByRole('button', { name: /autosave off/i }).getAttribute('title')).toContain('Ctrl+S keeps the project')
    act(() => setKeys('file.save', ['Ctrl+Alt+S']))
    expect(screen.getByRole('button', { name: /autosave off/i }).getAttribute('title')).toContain('Ctrl+Alt+S keeps the project')
  })

  it('keyOrMenu: the first key, else the place in the menu', () => {
    expect(keyOrMenu('edit.undo', 'Edit › Undo')).toBe('Ctrl+Z')
    setKeys('edit.undo', [])
    expect(keyOrMenu('edit.undo', 'Edit › Undo')).toBe('Edit › Undo')
  })

  it('no source outside the commands, the plugins (held back) and the tests writes a key by hand in a string', () => {
    const src = join(process.cwd(), 'src')
    const files: string[] = []
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name)
        if (e.isDirectory()) {
          if (!['__tests__', 'node_modules', 'plugins', 'commands'].includes(e.name)) walk(p)
        } else if (/\.tsx?$/.test(e.name) && !/\.test\./.test(e.name)) files.push(p)
      }
    }
    walk(src)
    const hits: string[] = []
    for (const f of files) {
      readFileSync(f, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          if (/^\s*(\/\/|\*|\/\*)/.test(line) || /\/\*\*.*\*\/\s*$/.test(line)) return
          if (/Ctrl\+/.test(line)) hits.push(`${relative(src, f)}:${i + 1}`)
        })
    }
    expect(hits).toEqual([])
  })
})
