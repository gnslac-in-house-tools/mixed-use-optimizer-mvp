// The review of AS.1's commands, the registry's share (findings 6, 7 and 12): one pass over the commands for a key, the
// keys of every command the registry was given (offered now or not), and a list's bad item never throwing at render.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { derive } from '../../../engine/derive.ts'
import { demoProject } from '../../../state/demo.ts'
import { useApp } from '../../../state/store.ts'
import { registerAll } from '../index.ts'
import { commandOf, commands, everyCommand, register, registerList, resetRegistry } from '../registry.ts'
import { commandForKey, conflictsOf, giveKey, keysOf, resetKeys, useShortcutsStore } from '../shortcuts.ts'
import type { Command } from '../types.ts'

const cmd = (id: string, menu: string[], extra: Partial<Command> = {}): Command => ({ id, label: id.toUpperCase(), menu, run: () => {}, ...extra })

/** The open project as another typology: a typology with no warehouse offers no Dock. */
function openAs(typology: string) {
  const p = { ...demoProject(), typology }
  useApp.setState({ project: p, derived: derive(p, 'o1'), option: 'o1' })
}

afterEach(() => {
  vi.restoreAllMocks()
  resetRegistry()
})

describe('one pass over the registry for a key (finding 6)', () => {
  beforeEach(() => {
    localStorage.clear()
    registerAll()
    resetKeys()
  })

  /** A list that counts how many times the registry reads it. */
  function counter(): { reads(): number } {
    let n = 0
    registerList(['Help'], () => {
      n++
      return []
    })
    return { reads: () => n }
  }

  it('commandForKey reads the registry once, not once per command', () => {
    const c = counter()
    expect(commandForKey('M', 'project')?.id).toBe('tool.move')
    expect(c.reads()).toBeLessThanOrEqual(1)
  })

  it('conflictsOf reads it once too', () => {
    const c = counter()
    expect(conflictsOf('view.frame', 'M').map((x) => x.id)).toEqual(['tool.move'])
    expect(c.reads()).toBeLessThanOrEqual(1)
  })

  it('keysOf for one command reads it a bounded number of times', () => {
    const c = counter()
    for (let i = 0; i < 10; i++) keysOf('tool.move')
    expect(c.reads()).toBeLessThanOrEqual(10)
  })

  it('registry.ts has no copy of keysFor: a menu row’s key comes from shortcuts.ts', async () => {
    const src = await import('node:fs').then((fs) => fs.readFileSync('src/views/commands/registry.ts', 'utf8'))
    expect(src).not.toMatch(/Array\.isArray\(c\.key\)/)
  })
})

describe('the keys of every command the registry was given, offered or not (finding 7)', () => {
  beforeEach(() => {
    localStorage.clear()
    registerAll()
    resetKeys()
  })

  it('a list can say every command it could give: everyCommand has them, commands() only what is offered', () => {
    resetRegistry()
    let on = false
    const dock = cmd('tool.dock', ['Tools', 'Elements'], { key: 'K' })
    registerList(['Tools', 'Elements'], () => (on ? [dock] : []), () => [dock])
    expect(commands().map((c) => c.id)).toEqual([])
    expect(everyCommand().map((c) => c.id)).toEqual(['tool.dock'])
    on = true
    expect(commands().map((c) => c.id)).toEqual(['tool.dock'])
  })

  it('a key given to Frame in a project with no docks collides with Dock, which another project offers', () => {
    openAs('blank')
    expect(commandOf('tool.dock')).toBeUndefined()
    expect(conflictsOf('view.frame', 'K').map((c) => c.id)).toEqual(['tool.dock'])
    // the keys of a command not offered are still its own
    expect(keysOf('tool.dock')).toEqual(['K'])
  })

  it('moving the key takes it from the command that is not offered, which keeps its other keys', () => {
    openAs('blank')
    giveKey('view.frame', 'K', true)
    expect(keysOf('view.frame')).toEqual(['K'])
    expect(keysOf('tool.dock')).toEqual([])
    expect(useShortcutsStore.getState().user['tool.dock']).toEqual([])
    openAs('industrial')
    registerAll()
    // in the project that offers Dock, K is Frame's alone: no hidden second owner
    expect(commandForKey('K', 'project')?.id).toBe('view.frame')
  })

  it('without the move, the two collide in the project that offers both: the dispatcher still finds one', () => {
    openAs('blank')
    useShortcutsStore.setState({ user: { 'view.frame': ['K'] } })
    expect(commandForKey('K', 'project')?.id).toBe('view.frame')
    openAs('industrial')
    expect(conflictsOf('view.frame', 'K').map((c) => c.id)).toEqual(['tool.dock'])
  })

  it('the terrain’s looks and Terrain… are in the keys’ registry even in a project with no ground', () => {
    openAs('blank')
    expect(everyCommand().map((c) => c.id)).toEqual(expect.arrayContaining(['view.terrain.contours', 'site.terrain', 'tool.dock', 'tool.lot', 'block.ruler']))
  })

  it('every default key is unique in a place across every command, not only those offered', () => {
    openAs('blank')
    const seen = new Map<string, string>()
    for (const c of everyCommand()) {
      for (const chord of keysOf(c.id)) {
        for (const place of c.where ?? ['project']) {
          const at = `${chord} in ${place}`
          expect(seen.get(at), `${c.id} and ${seen.get(at)} both have ${at}`).toBeUndefined()
          seen.set(at, c.id)
        }
      }
    }
  })
})

describe('a list’s bad item never throws at render (finding 12)', () => {
  beforeEach(() => {
    resetRegistry()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('an item that repeats the id of a registered command is skipped and said once', () => {
    register([cmd('y', ['File'])])
    registerList(['File'], () => [cmd('y', ['File']), cmd('z', ['File'])])
    expect(() => commands()).not.toThrow()
    expect(commands().map((c) => c.id)).toEqual(['y', 'z'])
    commands()
    commands()
    expect(console.error).toHaveBeenCalledTimes(1)
    expect(String(vi.mocked(console.error).mock.calls[0][0])).toMatch(/"y"/)
  })

  it('an item outside the menu its list stands in is skipped, and the rest is listed', () => {
    registerList(['File'], () => [cmd('wrong', ['Edit']), cmd('right', ['File'])])
    expect(commands().map((c) => c.id)).toEqual(['right'])
    expect(console.error).toHaveBeenCalledTimes(1)
  })

  it('two items of one list with one id: the first stays', () => {
    registerList(['File'], () => [cmd('a', ['File'], { label: 'first' }), cmd('a', ['File'], { label: 'second' })])
    expect(commands().map((c) => c.label)).toEqual(['first'])
  })

  it('a project whose option is called "new" or "delete" or "compare" renders: the per-option rows have an id of their own', () => {
    vi.mocked(console.error).mockRestore()
    localStorage.clear()
    const p = demoProject()
    const options = ['new', 'delete', 'compare', 'rename', 'duplicate'].map((id) => ({ ...p.options[0], id, name: id }))
    useApp.setState({ project: { ...p, options }, derived: derive(p, 'o1'), option: 'new' })
    registerAll()
    expect(() => commands()).not.toThrow()
    const ids = commands().map((c) => c.id)
    for (const id of ['new', 'delete', 'compare', 'rename', 'duplicate']) expect(ids).toContain(`design.option.go.${id}`)
    for (const id of ['new', 'duplicate', 'rename', 'delete', 'compare']) expect(ids.filter((x) => x === `design.option.${id}`)).toHaveLength(1)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
