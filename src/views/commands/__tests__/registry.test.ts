// The commands' registry (Project C, AS.1 task 2): a command is defined once; the menu, the keys and the buttons read it.
// The rules of `register` and `registerList`, the tree `menuEntries` gives a menu, what `runCommand` refuses, and the
// guards over the commands that are registered for real (every menu one of the seven, no menu holds two commands of
// one name, the registry builds again without throwing; the list of every command the app has, by menu, so one dropped
// by mistake fails here; every command stands in its menu exactly once).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PLUGINS } from '../../../plugins/index.ts'
import { derive } from '../../../engine/derive.ts'
import { demoProject } from '../../../state/demo.ts'
import { useApp } from '../../../state/store.ts'
import type { MenuEntry } from '../../controls/Menu.tsx'
import { registerAll } from '../index.ts'
import { commandOf, commands, MENUS, menuEntries, register, registerList, resetRegistry, runCommand } from '../registry.ts'
import type { Command } from '../types.ts'

const cmd = (id: string, menu: string[], extra: Partial<Command> = {}): Command => ({ id, label: id.toUpperCase(), menu, run: () => {}, ...extra })

describe('register', () => {
  beforeEach(resetRegistry)
  afterEach(() => vi.unstubAllEnvs())

  it('refuses a second command with an id that comes from another definition', () => {
    register([cmd('a.one', ['File'])])
    expect(() => register([cmd('a.one', ['Edit'])])).toThrow(/a\.one/)
    expect(commands()).toHaveLength(1)
  })

  it('the very same definition again is a no-op, so a hot reload does not crash', () => {
    const one = cmd('a.one', ['File'])
    register([one])
    expect(() => register([one])).not.toThrow()
    expect(commands()).toEqual([one])
  })

  it('refuses a duplicate inside one list of definitions; a list that repeats an id of the registry never throws at a render: it is left out and said once (review fix, finding 12)', () => {
    expect(() => register([cmd('x', ['File']), cmd('x', ['File'])])).toThrow(/x/)
    resetRegistry()
    const said = vi.spyOn(console, 'error').mockImplementation(() => {})
    register([cmd('y', ['File'])])
    registerList(['File'], () => [cmd('y', ['File'])])
    expect(() => commands()).not.toThrow()
    expect(commands().map((c) => c.id)).toEqual(['y'])
    expect(said).toHaveBeenCalledTimes(1)
    said.mockRestore()
  })

  it('commands() keeps registration order; commandOf finds one by its id; resetRegistry empties it', () => {
    register([cmd('a', ['File']), cmd('b', ['Edit'])])
    register([cmd('c', ['File'])])
    expect(commands().map((c) => c.id)).toEqual(['a', 'b', 'c'])
    expect(commandOf('b')?.menu).toEqual(['Edit'])
    expect(commandOf('nope')).toBeUndefined()
    resetRegistry()
    expect(commands()).toEqual([])
  })

  it('dev commands exist in development only', () => {
    register([cmd('g', ['Help'], { dev: true }), cmd('h', ['Help'])])
    expect(commands().map((c) => c.id)).toEqual(['g', 'h'])
    vi.stubEnv('DEV', false)
    expect(commands().map((c) => c.id)).toEqual(['h'])
    expect(commandOf('g')).toBeUndefined()
    expect(runCommand('g')).toBe(false)
    expect(menuEntries(['Help']).map((e) => (e === 'separator' ? e : e.key))).toEqual(['h'])
  })
})

describe('registerList (a menu that depends on the project)', () => {
  beforeEach(resetRegistry)

  it('is called whenever the registry is read, and stands where it was registered', () => {
    let names = ['one', 'two']
    register([cmd('first', ['File'])])
    registerList(['File'], () => names.map((n) => cmd(`new.${n}`, ['File'])))
    register([cmd('last', ['File'])])
    const keys = () => menuEntries(['File']).map((e) => (e === 'separator' ? e : e.key))
    expect(keys()).toEqual(['first', 'new.one', 'new.two', 'last'])
    names = ['three']
    expect(keys()).toEqual(['first', 'new.three', 'last'])
    expect(commandOf('new.three')?.menu).toEqual(['File'])
    expect(commandOf('new.one')).toBeUndefined()
  })

  it('its commands run through runCommand like any other', () => {
    const run = vi.fn()
    registerList(['File'], () => [cmd('new.x', ['File'], { run })])
    expect(runCommand('new.x')).toBe(true)
    expect(run).toHaveBeenCalledTimes(1)
  })
})

describe('menuEntries', () => {
  beforeEach(resetRegistry)

  it('gives the items of a path in registration order, with sub-menus and separators', () => {
    register([
      cmd('f.new', ['File'], { key: 'Ctrl+N' }),
      cmd('f.save', ['File'], { key: ['Ctrl+S', 'Ctrl+Shift+S'], separatorBefore: true }),
      cmd('f.export.a', ['File', 'Export'], { label: 'Project' }),
      cmd('f.export.b', ['File', 'Export'], { label: 'Model', separatorBefore: true }),
      cmd('f.home', ['File']),
      cmd('e.undo', ['Edit']),
    ])
    const file = menuEntries(['File'])
    expect(file.map((e) => (e === 'separator' ? e : e.key))).toEqual(['f.new', 'separator', 'f.save', 'Export', 'f.home'])
    const [first, , save, exportMenu] = file
    expect(first).toMatchObject({ key: 'f.new', label: 'F.NEW', detail: 'Ctrl+N' })
    // the first of several keys is the one shown
    expect(save).toMatchObject({ key: 'f.save', detail: 'Ctrl+S' })
    expect(exportMenu).toMatchObject({ key: 'Export', label: 'Export' })
    const sub = (exportMenu as { items: unknown[] }).items
    expect(sub).toEqual([expect.objectContaining({ key: 'f.export.a', label: 'Project' }), 'separator', expect.objectContaining({ key: 'f.export.b', label: 'Model' })])
    // the sub-menu's own path gives the same rows
    expect(menuEntries(['File', 'Export']).map((e) => (e === 'separator' ? e : e.key))).toEqual(['f.export.a', 'separator', 'f.export.b'])
    expect(menuEntries(['Edit']).map((e) => (e === 'separator' ? e : e.key))).toEqual(['e.undo'])
    expect(menuEntries(['View'])).toEqual([])
  })

  it('a separator is never first, last or doubled', () => {
    register([cmd('a', ['File'], { separatorBefore: true }), cmd('b', ['File'], { separatorBefore: true })])
    expect(menuEntries(['File']).map((e) => (e === 'separator' ? e : e.key))).toEqual(['a', 'separator', 'b'])
  })

  it('a label that is a function is read again each time; a checked command carries its tick, the others none', () => {
    let locked = false
    let on = true
    register([cmd('lock', ['Edit'], { label: () => (locked ? 'Unlock' : 'Lock') }), cmd('snap', ['Edit'], { checked: () => on })])
    const rows = () => menuEntries(['Edit']) as Extract<ReturnType<typeof menuEntries>[number], { onSelect(): void }>[]
    expect(rows()[0].label).toBe('Lock')
    expect('checked' in rows()[0]).toBe(false)
    expect(rows()[1].checked).toBe(true)
    locked = true
    on = false
    expect(rows()[0].label).toBe('Unlock')
    expect(rows()[1].checked).toBe(false)
  })

  it('a command whose enabled() is a string is a disabled entry with that title, and runCommand refuses it', () => {
    const run = vi.fn()
    register([cmd('undo', ['Edit'], { run, enabled: () => 'Nothing to undo' }), cmd('redo', ['Edit'], { run, enabled: () => true })])
    const [undo, redo] = menuEntries(['Edit']) as { disabled?: boolean; title?: string }[]
    expect(undo).toMatchObject({ disabled: true, title: 'Nothing to undo' })
    expect(redo.disabled).toBeFalsy()
    expect(runCommand('undo')).toBe(false)
    expect(run).not.toHaveBeenCalled()
    expect(runCommand('redo')).toBe(true)
    expect(run).toHaveBeenCalledTimes(1)
    expect(runCommand('missing')).toBe(false)
  })

  it('picking an entry runs the command', () => {
    const run = vi.fn()
    register([cmd('x', ['File'], { run })])
    ;(menuEntries(['File'])[0] as { onSelect(): void }).onSelect()
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('a sub-menu with nothing to show is left out', () => {
    register([cmd('g', ['Help', 'Dev'], { dev: true }), cmd('h', ['Help'])])
    vi.stubEnv('DEV', false)
    try {
      expect(menuEntries(['Help']).map((e) => (e === 'separator' ? e : e.key))).toEqual(['h'])
    } finally {
      vi.unstubAllEnvs()
    }
  })
})

/** Every command of the app by menu (the inventory of the controls the commands stand for), for a project of the
 *  industrial typology whose site has ground, so each module's commands are listed. A list that depends on the project
 *  (the typologies' New, the options, the plugins) is written out for it. */
const EXPECTED: Record<string, string[]> = {
  File: [
    ...['industrial', 'blank'].map((t) => `file.new.${t}`),
    'file.load',
    'file.save',
    ...['project', 'model', 'cad', 'cad3d', 'image', 'log'].map((x) => `file.export.${x}`),
    'file.data',
    'file.autosave',
    'file.demo',
    'file.home',
  ],
  Edit: ['undo', 'redo', 'copy', 'paste', 'paste-here', 'duplicate', 'delete', 'select-all', 'group', 'ungroup', 'rename', 'lock', 'hide', 'rotate90', 'properties', 'shortcuts'].map((x) => `edit.${x}`),
  View: [
    ...['plan', '3d', 'split', 'frame'].map((x) => `view.${x}`),
    'view.panel.tools',
    'view.panel.left',
    'view.panel.right',
    ...['drafting', 'kpis'].map((x) => `view.bar.${x}`),
    ...['full', 'medium', 'compact'].map((x) => `view.kpi-size.${x}`),
    'view.dock.drafting',
    ...['left', 'panel', 'right', 'top', 'bottom'].map((x) => `view.strip.${x}`),
    ...['graph', 'map', 'planes', 'labels', 'dims', 'issues', 'rules', 'issue-count'].map((x) => `view.overlay.${x}`),
    'view.colour.program',
    'view.colour.building',
    ...['off', 'contours', 'slope', 'earthwork'].map((x) => `view.terrain.${x}`),
    ...['schematic', 'ghosted', 'presentation'].map((x) => `view.detail.${x}`),
    'view.snap',
    ...['endpoint', 'midpoint', 'intersection', 'perpendicular', 'center', 'quadrant', 'nearest'].map((x) => `view.snap-kind.${x}`),
    ...['references', 'referenceLines', 'contours'].map((x) => `view.snap-to.${x}`),
    'view.align',
    'view.ortho',
    'view.grid',
    ...PLUGINS.flatMap((p) => [`view.plugin.${p.id}.tabs`, `view.plugin.${p.id}.power`]),
    ...['system', 'light', 'dark'].map((x) => `view.theme.${x}`),
    'view.fullscreen',
    'view.default-layout',
  ],
  Site: ['import', 'draw', 'place-map', 'location', 'rules', 'terrain', 'grid-pivot', 'restore-grid'].map((x) => `site.${x}`),
  Design: [
    ...['option.go.o1', 'option.new', 'option.duplicate', 'option.rename', 'option.delete', 'option.compare', 'brief', 'rules', 'levels', 'building.new', 'solve'].map((x) => `design.${x}`),
    // the Rules window's own keys (AS.1 task 4): commands of its place
    ...['rule', 'solve', 'delete'].map((x) => `rules.${x}`),
  ],
  Tools: [
    'select', 'move', 'copy', 'rotate', 'mirror', 'array', 'align',
    'mass', 'hole', 'corner', 'chamfer', 'split', 'union',
    'dock', 'door', 'pattern', 'court',
    'street', 'gate', 'existing-road', 'connect',
    'lot',
    'dimension', 'ruler', 'referenceLine', 'note',
  ].map((x) => `tool.${x}`).concat(['dimension', 'ruler', 'split', 'snap', 'ortho', 'grid'].map((x) => `block.${x}`)),
  Help: ['help', 'zero', 'tour', 'about', 'state-graph'].map((x) => `help.${x}`),
}

/** Every command a menu holds, deep: the leaves of `menuEntries`. */
const leaves = (entries: MenuEntry[]): string[] => entries.flatMap((e) => (e === 'separator' ? [] : 'items' in e ? leaves(e.items) : [e.key]))

describe('the commands registered for real (the guards)', () => {
  beforeEach(() => {
    const p = demoProject()
    useApp.setState({ project: { ...p, site: { ...p.site, terrain: { contours: [], points: [] } } as typeof p.site }, derived: derive(p, 'o1'), option: 'o1' })
    registerAll()
  })

  it('every command the app has is there, by menu (a command dropped by mistake fails here)', () => {
    for (const menu of MENUS) {
      const have = commands().filter((c) => c.menu[0] === menu).map((c) => c.id)
      expect(EXPECTED[menu].filter((id) => !have.includes(id)), `${menu}: missing`).toEqual([])
      expect(have.filter((id) => !EXPECTED[menu].includes(id)), `${menu}: not in the list`).toEqual([])
    }
  })

  it('every command stands in its menu exactly once, however deep, except a window’s own, which stands in none (review fix, finding 14)', () => {
    const seen = MENUS.flatMap((m) => leaves(menuEntries([m])))
    const menuCommands = commands().filter((c) => !c.window)
    expect(seen.length).toBe(menuCommands.length)
    expect(new Set(seen).size).toBe(seen.length)
    expect([...seen].sort()).toEqual(menuCommands.map((c) => c.id).sort())
    // the Rules window’s and the block editor’s keys: commands of their window, in no menu
    expect(commands().filter((c) => c.window).map((c) => c.id).sort()).toEqual(['block.dimension', 'block.grid', 'block.ortho', 'block.ruler', 'block.snap', 'block.split', 'rules.delete', 'rules.rule', 'rules.solve'])
    for (const id of seen) expect(commandOf(id)!.window, id).toBeUndefined()
  })

  it('every command stands in one of the seven menus', () => {
    for (const c of commands()) expect(MENUS as readonly string[], c.id).toContain(c.menu[0])
  })

  it('no menu holds two commands of one name', () => {
    const seen = new Map<string, string>()
    for (const c of commands()) {
      const at = `${c.menu.join(' > ')} > ${typeof c.label === 'function' ? c.label() : c.label}`
      expect(seen.get(at), `${c.id} and ${seen.get(at)} are both "${at}"`).toBeUndefined()
      seen.set(at, c.id)
    }
  })

  it('every command has an id of its menu (file.save in File) and says where it answers only with known places', () => {
    for (const c of commands()) {
      // the Tools menu's ids say "tool" (tool.street), as the strip will read them; the Rules window's keys are `rules.*` and
      // the block editor's `block.*`, commands of their own place (AS.1 task 4)
      const own = c.where?.length === 1 && (c.where[0] === 'rules' || c.where[0] === 'block-editor') ? (c.where[0] === 'rules' ? 'rules.' : 'block.') : null
      expect(c.id.startsWith(own ?? (c.menu[0] === 'Tools' ? 'tool.' : `${c.menu[0].toLowerCase()}.`)), c.id).toBe(true)
      for (const w of c.where ?? ['project']) expect(['project', 'home', 'rules', 'block-editor', 'dialog']).toContain(w)
    }
  })

  it('registering everything again rebuilds the same registry (a hot reload), and registerAll is the one door', () => {
    const before = commands().map((c) => c.id)
    expect(() => registerAll()).not.toThrow()
    expect(commands().map((c) => c.id)).toEqual(before)
  })

  it('every default key is a string or a list of them, and a command with a list shows the first', () => {
    for (const c of commands()) {
      if (c.key === undefined) continue
      const keys = Array.isArray(c.key) ? c.key : [c.key]
      expect(keys.length, c.id).toBeGreaterThan(0)
      for (const k of keys) expect(k, c.id).toMatch(/^(Ctrl\+)?(Alt\+)?(Shift\+)?[A-Za-z0-9?]+$/)
    }
  })
})
