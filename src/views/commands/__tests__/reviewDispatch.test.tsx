// The review of AS.1's keys, the dispatcher's share (findings 1, 2, 3, 5 and 8): a field keeps its plain letters, Ctrl+S and
// Ctrl+O never reach the browser in any place, a window that is not `useUi.dialog` is a window, a disabled key does not talk
// over a question and a stray Delete says nothing, and a remapped Undo, Redo or Delete is guarded mid-stroke and mid-drag.
import { act, render, screen, within } from '@testing-library/react'
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
import { swallowedMidDrag } from '../../plan/useDrag.ts'
import { useDrawingKeys } from '../../plan/tools/common.tsx'
import { DEFAULT_SNAP } from '../../plan/snap/kinds.ts'
import { useSnapSettings } from '../../plan/snap/settings.ts'
import { useTool } from '../../plan/tools/toolState.ts'
import { useShortcuts } from '../../useShortcuts.ts'
import { placeNow } from '../dispatch.ts'
import { registerAll } from '../index.ts'
import { commandOf, registerList, runCommand } from '../registry.ts'
import { commandForKey, keysOf, resetKeys, setKeys } from '../shortcuts.ts'
import type { Place } from '../types.ts'
import { letGo } from '../../tools/hand.ts'

vi.mock('../../scene/Scene.tsx', () => ({ Scene: () => <div data-testid="scene" /> }))

const s = () => useApp.getState()
const toast = () => useToast.getState().toast?.text ?? null
const MASS = 'm1'

/** The event a chord is: 'Ctrl+Shift+S', 'M', 'Del'. */
function eventOf(chord: string, init: KeyboardEventInit = {}): KeyboardEvent {
  const parts = chord.split('+')
  const name = parts.pop()!
  const shiftKey = parts.includes('Shift')
  const key = name === 'Del' ? 'Delete' : name.length === 1 && shiftKey ? name.toUpperCase() : name.length === 1 ? name.toLowerCase() : name
  return new KeyboardEvent('keydown', { key, shiftKey, ctrlKey: parts.includes('Ctrl'), altKey: parts.includes('Alt'), bubbles: true, cancelable: true, ...init })
}
function press(chord: string, init: KeyboardEventInit = {}, target: Element = document.body): KeyboardEvent {
  const e = eventOf(chord, init)
  act(() => void target.dispatchEvent(e))
  return e
}

function Keys() {
  useShortcuts()
  return null
}

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
}

beforeEach(reset)
afterEach(() => {
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

const PLACE_STATE: Record<Place, () => void> = {
  project: () => {},
  home: () => useScreen.setState({ home: true }),
  rules: () => useUi.setState({ dialog: 'rules' }),
  'block-editor': () => useUi.setState({ dialog: 'program' }),
  dialog: () => useUi.setState({ dialog: 'brief' }),
}

describe('typing in a field keeps its plain letters (finding 1)', () => {
  const input = () => {
    const el = document.body.appendChild(document.createElement('input'))
    el.focus()
    return el
  }

  it('a Save or Load key without Ctrl, Alt or Meta is typed: the letter appears and nothing runs', () => {
    render(<Keys />)
    setKeys('file.save', ['Q'])
    setKeys('file.load', ['Shift+W'])
    const save = vi.spyOn(commandOf('file.save')!, 'run').mockImplementation(() => {})
    const load = vi.spyOn(commandOf('file.load')!, 'run').mockImplementation(() => {})
    const field = input()
    expect(press('Q', {}, field).defaultPrevented).toBe(false)
    expect(press('Shift+W', {}, field).defaultPrevented).toBe(false)
    expect(save).not.toHaveBeenCalled()
    expect(load).not.toHaveBeenCalled()
    // outside a field they are the commands’
    press('Q')
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('with Ctrl or Alt, or an F-key, a typing command still answers in a field', () => {
    render(<Keys />)
    setKeys('file.save', ['Ctrl+Q', 'Alt+S', 'F6'])
    const save = vi.spyOn(commandOf('file.save')!, 'run').mockImplementation(() => {})
    const field = input()
    for (const chord of ['Ctrl+Q', 'Alt+S', 'F6']) expect(press(chord, chord.startsWith('Alt') ? { code: 'KeyS' } : {}, field).defaultPrevented, chord).toBe(true)
    expect(save).toHaveBeenCalledTimes(3)
  })

  it('a field is never asked the registry: nothing is looked up for a plain letter typed in it', () => {
    render(<Keys />)
    let reads = 0
    registerList(['Help'], () => {
      reads++
      return []
    })
    press('q', {}, input())
    press('Shift+Q', {}, input())
    expect(reads).toBe(0)
  })
})

describe('Ctrl+S and Ctrl+O never reach the browser, in any place (finding 2)', () => {
  const PLACES: Place[] = ['project', 'home', 'rules', 'block-editor', 'dialog']
  for (const place of PLACES) {
    it(`${place}: Ctrl+S, Ctrl+Shift+S and Ctrl+O are prevented, and Save and Load run where they can`, () => {
      render(<Keys />)
      act(PLACE_STATE[place])
      const save = vi.spyOn(commandOf('file.save')!, 'run').mockImplementation(() => {})
      const load = vi.spyOn(commandOf('file.load')!, 'run').mockImplementation(() => {})
      for (const chord of ['Ctrl+S', 'Ctrl+Shift+S', 'Ctrl+O']) expect(press(chord).defaultPrevented, `${chord} in ${place}`).toBe(true)
      // Home has no project to save: Save says so; everywhere else both run
      expect(save).toHaveBeenCalledTimes(place === 'home' ? 0 : 2)
      expect(load).toHaveBeenCalledTimes(1)
    })
  }

  it('Undo, Redo, Save and Load are the commands of those chords in the Rules window and the block editor', () => {
    render(<Keys />)
    for (const place of ['rules', 'block-editor'] as const) {
      act(PLACE_STATE[place])
      for (const id of ['edit.undo', 'edit.redo', 'file.save', 'file.load']) expect(commandForKey(keysOf(id)[0], place)?.id, `${id} in ${place}`).toBe(id)
    }
  })
})

describe('a window that is not useUi.dialog is a window (finding 3)', () => {
  it('Project data, the 3D model dialog and the toast’s confirmation each make the place a dialog', () => {
    render(<App />)
    expect(placeNow()).toBe('project')
    act(() => void runCommand('file.data'))
    const data = screen.getByRole('dialog', { name: /project/i })
    expect(placeNow()).toBe('dialog')
    act(() => void within(data).getAllByRole('button', { name: /close|cancel/i })[0].click())
    expect(placeNow()).toBe('project')
    act(() => void runCommand('file.export.model'))
    expect(placeNow()).toBe('dialog')
    act(() => void within(screen.getByRole('dialog', { name: /model/i })).getAllByRole('button', { name: /close|cancel/i })[0].click())
    expect(placeNow()).toBe('project')
    act(() => useToast.getState().confirm('Sure?', () => {}))
    expect(placeNow()).toBe('dialog')
    act(() => useToast.getState().closeConfirmation())
    expect(placeNow()).toBe('project')
  })

  it('the tour’s offer and the phone’s ☰ sheet are windows too, and every window of the app says it is modal', async () => {
    const { useTour } = await import('../../tour/tour.ts')
    render(<App />)
    act(() => useTour.getState().setOffer(true))
    expect(screen.getByRole('dialog', { name: 'Take the tour?' })).toHaveAttribute('aria-modal', 'true')
    expect(placeNow()).toBe('dialog')
    act(() => useTour.getState().setOffer(false))
    expect(placeNow()).toBe('project')
  })

  it('the phone’s ☰ sheet: with it open, a letter takes no tool', () => {
    vi.stubGlobal('matchMedia', vi.fn((media: string) => ({ media, matches: media.includes('max-width: 767'), addEventListener: vi.fn(), removeEventListener: vi.fn() })))
    const { unmount } = render(<App />)
    try {
      act(() => s().select(MASS))
      act(() => void screen.getByRole('button', { name: 'Menu' }).click())
      expect(screen.getByRole('dialog', { name: 'Menu' })).toHaveAttribute('aria-modal', 'true')
      expect(placeNow()).toBe('dialog')
      expect(press('B').defaultPrevented).toBe(false)
      expect(useTool.getState().tool).toBe('select')
    } finally {
      unmount()
      vi.unstubAllGlobals()
    }
  })

  it('behind one, Delete does not delete the masses, B and W take no tool', () => {
    render(<App />)
    act(() => s().select(MASS))
    act(() => void runCommand('file.data'))
    for (const chord of ['Del', 'Backspace', 'B', 'W', 'M', 'Ctrl+D']) expect(press(chord).defaultPrevented, chord).toBe(false)
    expect(s().project.masses.some((m) => m.id === MASS)).toBe(true)
    expect(useTool.getState().tool).toBe('select')
  })

  it('the Rules window and the block editor are windows with keys of their own, not just dialogs', () => {
    render(<App />)
    act(PLACE_STATE.rules)
    expect(placeNow()).toBe('rules')
    act(PLACE_STATE['block-editor'])
    expect(placeNow()).toBe('block-editor')
  })

  it('Alt alone and F10 do not move the focus to the menu bar behind a window', () => {
    render(<App />)
    act(() => void runCommand('file.data'))
    const bar = screen.getByRole('menubar')
    act(() => void document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'F10', bubbles: true, cancelable: true })))
    expect(bar.contains(document.activeElement)).toBe(false)
    act(() => void window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Alt', altKey: true, bubbles: true })))
    act(() => void window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Alt', bubbles: true })))
    expect(bar.contains(document.activeElement)).toBe(false)
  })
})

describe('a disabled key and what is on screen (finding 5)', () => {
  it('the reason is not shown while a confirmation is asking something, nor does it replace a notice with a question', () => {
    render(<Keys />)
    act(() => useToast.getState().confirm('Replace the project?', () => {}))
    expect(press('M').defaultPrevented).toBe(true)
    expect(useToast.getState().toast).toBeNull()
    act(() => useToast.getState().closeConfirmation())
    act(() => useToast.getState().show('info', 'Move it to another floor?', { label: 'Move', run: () => {} }))
    press('M')
    expect(toast()).toBe('Move it to another floor?')
  })

  it('a stray Delete or Backspace with nothing picked is prevented and says nothing (the command is quiet then)', () => {
    render(<Keys />)
    for (const chord of ['Del', 'Backspace']) {
      expect(press(chord).defaultPrevented, chord).toBe(true)
      expect(toast(), chord).toBeNull()
    }
    // the others still say why; so does Delete on a locked mass
    press('M')
    expect(toast()).toBe('Pick something first')
    // locked first, then picked as a tree's row picks it: the plan would not
    act(() => s().apply((p) => ({ ...p, masses: p.masses.map((m) => (m.id === MASS ? { ...m, locked: true } : m)) })))
    act(() => s().select(MASS))
    useToast.setState({ toast: null })
    expect(press('Del').defaultPrevented).toBe(true)
    expect(toast()).toMatch(/locked/i)
  })
})

describe('a remapped Undo, Redo or Delete is guarded mid-stroke and mid-drag as the defaults were (finding 8)', () => {
  function Drawing({ calls }: { calls: string[] }) {
    useShortcuts()
    useDrawingKeys({ enter: () => false, escape: () => {}, back: () => void calls.push('back'), undo: () => (calls.push('undo'), true) })
    return null
  }

  it('a tool that draws takes the user’s Undo and Delete keys, and no longer the old ones', () => {
    const calls: string[] = []
    render(<Drawing calls={calls} />)
    setKeys('edit.undo', ['Ctrl+Q'])
    setKeys('edit.delete', ['X'])
    press('Ctrl+Q')
    press('X')
    expect(calls).toEqual(['undo', 'back'])
    press('Ctrl+Z')
    press('Del')
    expect(calls).toEqual(['undo', 'back'])
  })

  it('with the default keys it is as before', () => {
    const calls: string[] = []
    render(<Drawing calls={calls} />)
    for (const chord of ['Ctrl+Z', 'Del', 'Backspace']) press(chord)
    expect(calls).toEqual(['undo', 'back', 'back'])
  })

  it('a drag swallows the keys Undo, Redo and Delete have now, so they do not act on the project under the pointer', () => {
    const swallowed = (init: KeyboardEventInit & { key: string }) => swallowedMidDrag(new KeyboardEvent('keydown', init))
    // as it was
    for (const init of [{ key: 'z', ctrlKey: true }, { key: 'y', ctrlKey: true }, { key: 'Z', ctrlKey: true, shiftKey: true }, { key: 'Delete' }, { key: 'Backspace' }, { key: 'Escape' }]) {
      expect(swallowed(init), JSON.stringify(init)).toBe(true)
    }
    expect(swallowed({ key: 'q', ctrlKey: true })).toBe(false)
    setKeys('edit.undo', ['Ctrl+Q'])
    setKeys('edit.redo', ['Ctrl+Alt+Q'])
    setKeys('edit.delete', ['X'])
    expect(swallowed({ key: 'q', ctrlKey: true })).toBe(true)
    expect(swallowed({ key: 'q', ctrlKey: true, altKey: true })).toBe(true)
    expect(swallowed({ key: 'x' })).toBe(true)
    // the old ones are the project’s now; Escape is always the drag’s
    expect(swallowed({ key: 'z', ctrlKey: true })).toBe(false)
    expect(swallowed({ key: 'Delete' })).toBe(false)
    expect(swallowed({ key: 'Escape' })).toBe(true)
  })
})
