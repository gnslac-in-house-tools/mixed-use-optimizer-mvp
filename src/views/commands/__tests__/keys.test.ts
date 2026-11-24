// The keys, pure (Project C, AS.1 task 4): a chord from an event (modifiers, Cmd as Ctrl, letters in upper case whatever
// Shift or CapsLock do, F-keys, `?`, Delete, AltGr characters, Alt+digit by its code), how a chord reads on the screen,
// the keys no command may take (RESERVED), and the user's keys: `keysOf`, `commandForKey`, `setKeys`, `resetKeys` and
// what `gfit.shortcuts` keeps (only what differs from the defaults; an empty list is no key; unknown ids are ignored; a
// blocked or broken storage is the defaults for the session).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { chordLabel, chordOf, normalizeChord, reservedReason, RESERVED } from '../keys.ts'
import { commandForKey, keysOf, loadShortcuts, resetKeys, setKeys, useShortcutsStore } from '../shortcuts.ts'
import { register, resetRegistry } from '../registry.ts'
import type { Command } from '../types.ts'

const ev = (init: KeyboardEventInit & { key: string }) => new KeyboardEvent('keydown', init)
const chord = (init: KeyboardEventInit & { key: string }) => chordOf(ev(init))

describe('chordOf', () => {
  it('a letter is upper case whatever Shift or CapsLock do; Shift is in the chord', () => {
    expect(chord({ key: 'm' })).toBe('M')
    expect(chord({ key: 'M' })).toBe('M') // CapsLock
    expect(chord({ key: 'R', shiftKey: true })).toBe('Shift+R')
    expect(chord({ key: 'r', shiftKey: true })).toBe('Shift+R')
  })

  it('modifiers come in one order: Ctrl, Alt, Shift', () => {
    expect(chord({ key: 's', ctrlKey: true })).toBe('Ctrl+S')
    expect(chord({ key: 'S', ctrlKey: true, shiftKey: true })).toBe('Ctrl+Shift+S')
    expect(chord({ key: 'z', ctrlKey: true, altKey: true, shiftKey: true })).toBe('Ctrl+Alt+Shift+Z')
  })

  it('Cmd counts as Ctrl', () => {
    expect(chord({ key: 'z', metaKey: true })).toBe('Ctrl+Z')
    expect(chord({ key: 'z', metaKey: true, ctrlKey: true })).toBe('Ctrl+Z')
  })

  it('F-keys, Delete, Backspace, Enter and Escape', () => {
    expect(chord({ key: 'F3' })).toBe('F3')
    expect(chord({ key: 'F9', shiftKey: true })).toBe('Shift+F9')
    expect(chord({ key: 'Delete' })).toBe('Del')
    expect(chord({ key: 'Backspace' })).toBe('Backspace')
    expect(chord({ key: 'Enter', ctrlKey: true })).toBe('Ctrl+Enter')
    expect(chord({ key: 'Escape' })).toBe('Esc')
    expect(chord({ key: 'Tab', shiftKey: true })).toBe('Shift+Tab')
    expect(chord({ key: ' ' })).toBe('Space')
    expect(chord({ key: 'ArrowLeft' })).toBe('Left')
  })

  it('`?` is the chord "?" (its key is ?, Shift is how it is typed), and so is any symbol', () => {
    expect(chord({ key: '?', shiftKey: true })).toBe('?')
    expect(chord({ key: '#', shiftKey: true })).toBe('#')
    expect(chord({ key: '1' })).toBe('1')
  })

  it('a modifier alone is null', () => {
    for (const key of ['Shift', 'Control', 'Alt', 'Meta', 'AltGraph', 'CapsLock']) expect(chord({ key }), key).toBeNull()
  })

  it('AltGr (Ctrl and Alt together, or the AltGraph state) giving a printable character is that character', () => {
    // a Spanish keyboard: AltGr+2 is @, AltGr+3 is #
    expect(chord({ key: '@', ctrlKey: true, altKey: true })).toBe('@')
    expect(chord({ key: '#', ctrlKey: true, altKey: true })).toBe('#')
    const gr = ev({ key: '@', ctrlKey: true, altKey: true })
    gr.getModifierState = (m: string) => m === 'AltGraph'
    expect(chordOf(gr)).toBe('@')
    // Ctrl+Alt on a letter is no AltGr character
    expect(chord({ key: 'a', ctrlKey: true, altKey: true })).toBe('Ctrl+Alt+A')
  })

  it('Alt+digit and Alt+letter go by the physical key (a Mac types ¡ or å there)', () => {
    expect(chordOf(ev({ key: '1', altKey: true, code: 'Digit1' }))).toBe('Alt+1')
    expect(chordOf(ev({ key: '¡', altKey: true, code: 'Digit1' }))).toBe('Alt+1')
    expect(chordOf(ev({ key: 'å', altKey: true, code: 'KeyA' }))).toBe('Alt+A')
    expect(chord({ key: '2', altKey: true })).toBe('Alt+2')
  })
})

describe('normalizeChord and chordLabel', () => {
  it('writes a chord as chordOf does', () => {
    expect(normalizeChord('ctrl+shift+s')).toBe('Ctrl+Shift+S')
    expect(normalizeChord('Shift+Ctrl+S')).toBe('Ctrl+Shift+S')
    expect(normalizeChord('m')).toBe('M')
    expect(normalizeChord('delete')).toBe('Del')
    expect(normalizeChord('f3')).toBe('F3')
    expect(normalizeChord('?')).toBe('?')
  })

  it('the label is what the screen shows; no chord, no label', () => {
    expect(chordLabel('Ctrl+Shift+S')).toBe('Ctrl+Shift+S')
    expect(chordLabel('Del')).toBe('Del')
    expect(chordLabel('?')).toBe('?')
    expect(chordLabel(undefined)).toBe('')
    expect(chordLabel('')).toBe('')
  })
})

describe('the key + (review fix: Ctrl++ became "Ctrl")', () => {
  it('chordOf writes Plus after a modifier and + alone; Shift is how a symbol is typed', () => {
    expect(chord({ key: '+' })).toBe('+')
    expect(chord({ key: '+', shiftKey: true })).toBe('+')
    expect(chord({ key: '+', ctrlKey: true })).toBe('Ctrl+Plus')
    expect(chord({ key: '+', ctrlKey: true, shiftKey: true })).toBe('Ctrl+Plus')
    expect(chord({ key: '+', altKey: true })).toBe('Alt+Plus')
  })

  it('normalizeChord reads what a person types: Ctrl++, +, Shift++, Plus', () => {
    expect(normalizeChord('Ctrl++')).toBe('Ctrl+Plus')
    expect(normalizeChord('ctrl+plus')).toBe('Ctrl+Plus')
    expect(normalizeChord('+')).toBe('+')
    expect(normalizeChord('Plus')).toBe('+')
    expect(normalizeChord('Shift++')).toBe('+')
    expect(normalizeChord('Ctrl+Shift++')).toBe('Ctrl+Plus')
    expect(normalizeChord('Alt++')).toBe('Alt+Plus')
    // the rest is as it was
    expect(normalizeChord('Ctrl+Shift+S')).toBe('Ctrl+Shift+S')
    expect(normalizeChord('-')).toBe('-')
  })

  it('what chordOf gives, normalizeChord gives back, and the screen labels it with the + the person typed', () => {
    for (const init of [{ key: '+' }, { key: '+', ctrlKey: true }, { key: '+', altKey: true }, { key: '+', shiftKey: true }]) {
      const c = chord(init)!
      expect(normalizeChord(c), c).toBe(c)
    }
    expect(chordLabel('Ctrl+Plus')).toBe('Ctrl++')
    expect(chordLabel('+')).toBe('+')
    expect(chordLabel('Plus')).toBe('Plus')
  })

  it('Ctrl++ is the browser’s zoom: reserved, whichever way it is spelt', () => {
    for (const c of ['Ctrl++', 'Ctrl+Plus', 'Ctrl+=', 'Ctrl+-', 'Ctrl+0']) expect(reservedReason(c), c).toMatch(/zoom/)
  })
})

describe('RESERVED', () => {
  it('the browser’s and the system’s keys the page never receives or should not take: tabs, the zoom, clearing the data, closing the window (review fix)', () => {
    for (const c of ['Ctrl+1', 'Ctrl+5', 'Ctrl+9', 'Ctrl+PageUp', 'Ctrl+PageDown', 'Ctrl+Shift+PageUp', 'Ctrl+Shift+N', 'Ctrl+Shift+T', 'Ctrl+Shift+Delete', 'Ctrl+shift+del', 'Alt+F4', 'Ctrl+Plus', 'Ctrl+-', 'Ctrl+0']) {
      expect(reservedReason(c), c).toEqual(expect.any(String))
    }
    expect(reservedReason('Ctrl+Shift+Del')).toMatch(/browsing data/)
    expect(reservedReason('Alt+F4')).toMatch(/window/)
    // not these: Alt+digit is a command’s (the views), Ctrl+Shift+F is Full screen
    for (const c of ['Alt+1', 'Alt+2', 'Alt+3', 'Ctrl+Shift+F', 'Ctrl+Enter']) expect(reservedReason(c), c).toBeNull()
  })


  it('Escape, Enter, Tab, Space, the arrows, the digits, # @ < . - + and the browser’s own are reserved, with a reason', () => {
    for (const c of ['Esc', 'Enter', 'Tab', 'Shift+Tab', 'Space', 'Up', 'Down', 'Left', 'Right', '0', '3', '9', '#', '@', '<', '.', '-', '+', 'Ctrl+N', 'Ctrl+T', 'Ctrl+W', 'Ctrl+Tab', 'F5', 'F11', 'F12']) {
      expect(reservedReason(c), c).toEqual(expect.any(String))
      expect(reservedReason(c)!.length, c).toBeGreaterThan(5)
    }
    expect(RESERVED.length).toBeGreaterThan(5)
  })

  it('what the commands use is not reserved', () => {
    for (const c of ['Ctrl+S', 'Ctrl+Shift+S', 'Del', 'Backspace', 'M', 'Shift+R', 'F1', 'F3', '?', 'Alt+1', 'Ctrl+Enter', 'Ctrl+Shift+F']) expect(reservedReason(c), c).toBeNull()
  })
})

const cmd = (id: string, extra: Partial<Command> = {}): Command => ({ id, label: id, menu: ['Edit'], run: () => {}, ...extra })

describe('the user’s keys', () => {
  beforeEach(() => {
    localStorage.clear()
    resetRegistry()
    register([
      cmd('edit.undo', { key: 'Ctrl+Z', where: ['project', 'rules'] }),
      cmd('edit.redo', { key: ['Ctrl+Y', 'Ctrl+Shift+Z'] }),
      cmd('tool.move', { key: 'M' }),
      cmd('tool.copy', { key: 'C' }),
      cmd('home.only', { key: 'F1', where: ['home'] }),
      cmd('edit.lock'),
    ])
    useShortcutsStore.setState({ user: {} })
  })
  afterEach(() => {
    vi.restoreAllMocks()
    resetRegistry()
  })

  it('keysOf: the defaults, as a list, in the chords’ own spelling', () => {
    expect(keysOf('edit.undo')).toEqual(['Ctrl+Z'])
    expect(keysOf('edit.redo')).toEqual(['Ctrl+Y', 'Ctrl+Shift+Z'])
    expect(keysOf('edit.lock')).toEqual([])
    expect(keysOf('nope')).toEqual([])
  })

  it('commandForKey: the command with that chord in that place; a chord nobody has gives none', () => {
    expect(commandForKey('M', 'project')?.id).toBe('tool.move')
    expect(commandForKey('Ctrl+Shift+Z', 'project')?.id).toBe('edit.redo')
    expect(commandForKey('M', 'home')).toBeUndefined()
    expect(commandForKey('F1', 'project')).toBeUndefined()
    expect(commandForKey('F1', 'home')?.id).toBe('home.only')
    expect(commandForKey('Ctrl+Z', 'rules')?.id).toBe('edit.undo')
    expect(commandForKey('Ctrl+Z', 'block-editor')).toBeUndefined()
    expect(commandForKey('Q', 'project')).toBeUndefined()
  })

  it('setKeys gives a command its own keys; the old ones stop answering; only a difference is kept', () => {
    setKeys('tool.move', ['X'])
    expect(keysOf('tool.move')).toEqual(['X'])
    expect(commandForKey('X', 'project')?.id).toBe('tool.move')
    expect(commandForKey('M', 'project')).toBeUndefined()
    expect(JSON.parse(localStorage.getItem('gfit.shortcuts')!)).toEqual({ 'tool.move': ['X'] })
    // back to what the default is: nothing kept
    setKeys('tool.move', ['M'])
    expect(JSON.parse(localStorage.getItem('gfit.shortcuts')!)).toEqual({})
  })

  it('an empty list is no key at all', () => {
    setKeys('edit.undo', [])
    expect(keysOf('edit.undo')).toEqual([])
    expect(commandForKey('Ctrl+Z', 'project')).toBeUndefined()
    expect(JSON.parse(localStorage.getItem('gfit.shortcuts')!)).toEqual({ 'edit.undo': [] })
  })

  it('a key given to a command with no default works the same', () => {
    setKeys('edit.lock', ['Ctrl+L'])
    expect(commandForKey('Ctrl+L', 'project')?.id).toBe('edit.lock')
  })

  it('resetKeys(id) goes back to the default of one; resetKeys() of all', () => {
    setKeys('tool.move', ['X'])
    setKeys('tool.copy', [])
    resetKeys('tool.move')
    expect(keysOf('tool.move')).toEqual(['M'])
    expect(keysOf('tool.copy')).toEqual([])
    resetKeys()
    expect(keysOf('tool.copy')).toEqual(['C'])
    expect(JSON.parse(localStorage.getItem('gfit.shortcuts')!)).toEqual({})
  })

  it('what is kept is read again: a reload keeps the change; an id that no longer exists is ignored', () => {
    localStorage.setItem('gfit.shortcuts', JSON.stringify({ 'tool.move': ['X'], 'gone.command': ['Q'], 'tool.copy': 'not a list', 'edit.undo': [1, 'Ctrl+U'] }))
    loadShortcuts()
    expect(keysOf('tool.move')).toEqual(['X'])
    expect(commandForKey('Q', 'project')).toBeUndefined()
    // a malformed entry is dropped, the rest stands
    expect(keysOf('tool.copy')).toEqual(['C'])
    expect(keysOf('edit.undo')).toEqual(['Ctrl+Z'])
  })

  it('a broken storage is the defaults; a blocked one keeps the change for the session', () => {
    localStorage.setItem('gfit.shortcuts', '{not json')
    loadShortcuts()
    expect(keysOf('tool.move')).toEqual(['M'])
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(() => setKeys('tool.move', ['X'])).not.toThrow()
    expect(keysOf('tool.move')).toEqual(['X'])
    vi.restoreAllMocks()
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(() => loadShortcuts()).not.toThrow()
    expect(keysOf('tool.move')).toEqual(['M'])
  })
})
