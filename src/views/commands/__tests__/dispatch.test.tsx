// The one dispatcher for the keys (Project C, AS.1 task 4; plan Review Focus items 2 and 5): a key pressed is looked up
// in the registry for the place the user is in and runs its command when it is enabled. Each default runs its command
// in a project; in a field only the commands that answer while typing (Save, Load); on Home only Home's; in the Rules
// window and the block editor only theirs plus Undo, Redo and Save; in another dialog or with a menu open only Undo,
// Redo, Save and Load; a disabled command's key does nothing and says why (a short info notice), a key no command has
// is left alone, a held key runs nothing again but Undo and Redo; a tool that is drawing keeps its Enter, Escape,
// Delete and letters (they are heard first, in the capture phase); the digits and `# @ < . - +` belong to the command
// line. The guards: no two commands share a default key in one place, no default is reserved, and no view listens to
// `keydown` outside the dispatcher and the files `LOCAL_KEYS` names.
import { act, render, screen } from '@testing-library/react'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../../App.tsx'
import { derive } from '../../../engine/derive.ts'
import { actions } from '../../../state/actions/index.ts'
import { demoProject } from '../../../state/demo.ts'
import { emptyHistory } from '../../../state/history.ts'
import { NO_SELECTION, useApp } from '../../../state/store.ts'
import { useGraph } from '../../graph/graphState.ts'
import { useScreen } from '../../home/screen.ts'
import { useToast } from '../../layout/toast.ts'
import { useUi, VIEWS } from '../../layout/ui.ts'
import { useAccess } from '../../plan/access/accessState.ts'
import { useCommand } from '../../plan/command/commandState.ts'
import { editsProject } from '../../plan/tools/standingPreview.ts'
import { useDrawingKeys } from '../../plan/tools/common.tsx'
import { DEFAULT_SNAP } from '../../plan/snap/kinds.ts'
import { useSnapSettings } from '../../plan/snap/settings.ts'
import { TOOLS, useTool } from '../../plan/tools/toolState.ts'
import { handleKey, useShortcuts } from '../../useShortcuts.ts'
import { dispatch, placeNow } from '../dispatch.ts'
import { registerAll } from '../index.ts'
import { LOCAL_KEYS, reservedReason } from '../keys.ts'
import { commandOf, commands, everyCommand } from '../registry.ts'
import { commandForKey, keysOf, resetKeys, setKeys } from '../shortcuts.ts'
import type { Place } from '../types.ts'
import { letGo } from '../../tools/hand.ts'

vi.mock('../../scene/Scene.tsx', () => ({ Scene: () => <div data-testid="scene" /> }))

const s = () => useApp.getState()
const ui = () => useUi.getState()
const toast = () => useToast.getState().toast?.text ?? null

/** The event a chord is: 'Ctrl+Shift+S', 'M', 'Del', 'Alt+1'. */
function eventOf(chord: string, init: KeyboardEventInit = {}): KeyboardEvent {
  const parts = chord.split('+')
  const name = parts.pop()!
  const shiftKey = parts.includes('Shift')
  const key = name === 'Del' ? 'Delete' : name.length === 1 && shiftKey ? name.toUpperCase() : name.length === 1 ? name.toLowerCase() : name
  return new KeyboardEvent('keydown', { key, shiftKey, ctrlKey: parts.includes('Ctrl'), altKey: parts.includes('Alt'), bubbles: true, cancelable: true, ...init })
}
/** A key pressed on `target` (it bubbles to the window, where the dispatcher listens). */
function press(chord: string, init: KeyboardEventInit = {}, target: Element = document.body): KeyboardEvent {
  const e = eventOf(chord, init)
  act(() => void target.dispatchEvent(e))
  return e
}

function Keys() {
  useShortcuts()
  return null
}

const MASS = 'm1'
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

describe('the place the user is in', () => {
  it('a project, Home, the Rules window, the block editor (the Program window), another window, an open menu', () => {
    expect(placeNow()).toBe('project')
    act(PLACE_STATE.rules)
    expect(placeNow()).toBe('rules')
    act(PLACE_STATE['block-editor'])
    expect(placeNow()).toBe('block-editor')
    act(PLACE_STATE.dialog)
    expect(placeNow()).toBe('dialog')
    act(() => useUi.setState({ dialog: null }))
    const menu = document.body.appendChild(document.createElement('div'))
    menu.setAttribute('role', 'menu')
    expect(placeNow()).toBe('dialog')
    menu.remove()
    // Home covers all of it, a window behind it included
    act(() => useUi.setState({ dialog: 'rules' }))
    act(PLACE_STATE.home)
    expect(placeNow()).toBe('home')
  })
})

describe('every default key runs its command, in each place the command answers in', () => {
  const pairs = () =>
    commands().flatMap((c) => keysOf(c.id).flatMap((chord) => (c.where ?? ['project']).map((place) => ({ c, chord, place }))))

  it('there is a key for most of the app, in the places said', () => {
    expect(pairs().length).toBeGreaterThan(70)
  })

  it('pressing it runs the command once and prevents the browser’s own', () => {
    render(<Keys />)
    const failed: string[] = []
    for (const { c: listed, chord, place } of pairs()) {
      reset()
      // registerAll builds some definitions again: the command of this registry, by its id
      const c = commandOf(listed.id)!
      act(PLACE_STATE[place])
      const run = vi.spyOn(c, 'run').mockImplementation(() => {})
      const enabled = c.enabled
      c.enabled = () => true
      const e = press(chord)
      if (run.mock.calls.length !== 1 || !e.defaultPrevented) failed.push(`${c.id} ${chord} in ${place}`)
      run.mockRestore()
      c.enabled = enabled
    }
    expect(failed).toEqual([])
  })
})

describe('the keys that did something before, now', () => {
  it('Move is M, with something picked: the tool is in hand', () => {
    render(<Keys />)
    act(() => s().select(MASS))
    expect(press('M').defaultPrevented).toBe(true)
    expect(useTool.getState().tool).toBe('move')
  })

  it('Rotate 90° is Shift+R, and Rotate is R', () => {
    render(<Keys />)
    act(() => s().select(MASS))
    const before = JSON.stringify(s().project.masses.find((m) => m.id === MASS)!.footprint)
    press('Shift+R')
    expect(JSON.stringify(s().project.masses.find((m) => m.id === MASS)!.footprint)).not.toBe(before)
    expect(useTool.getState().tool).toBe('select')
    press('R')
    expect(useTool.getState().tool).toBe('rotate')
  })

  it('Alt+1 and Alt+2 are Plan and 3D; the browser does not act on Alt', () => {
    render(<Keys />)
    expect(press('Alt+2', { code: 'Digit2' }).defaultPrevented).toBe(true)
    expect(ui().view).toBe('3d')
    expect(press('Alt+1', { code: 'Digit1' }).defaultPrevented).toBe(true)
    expect(ui().view).toBe('plan')
    // the old keys are gone
    press('P')
    press('3')
    expect(ui().view).toBe('plan')
  })

  it('F1 is Help and the browser’s help does not open; ? too', () => {
    render(<Keys />)
    expect(press('F1').defaultPrevented).toBe(true)
    expect(ui().help).toBe(true)
    press('?', { shiftKey: true })
    expect(ui().help).toBe(false)
  })

  it('F3, F8 and F9 are Snap, Ortho and Grid', () => {
    render(<Keys />)
    const was = structuredClone(useSnapSettings.getState().settings)
    press('F3')
    press('F8')
    press('F9')
    const now = useSnapSettings.getState().settings
    expect([now.on, now.ortho, now.grid]).toEqual([!was.on, !was.ortho, !was.grid])
  })

  it('Ctrl+Z undoes and Ctrl+Y and Ctrl+Shift+Z redo, and a held one runs again', () => {
    render(<Keys />)
    act(() => s().apply((p) => actions.rotateMass(p, MASS, 90)))
    act(() => s().apply((p) => actions.rotateMass(p, MASS, 90)))
    const undo = vi.spyOn(s(), 'undo')
    expect(s().history.past.length).toBe(2)
    press('Ctrl+Z')
    expect(s().history.past.length).toBe(1)
    press('Ctrl+Z', { repeat: true })
    expect(s().history.past.length).toBe(0)
    expect(undo).toBeDefined()
    press('Ctrl+Y', { repeat: true })
    press('Ctrl+Shift+Z')
    expect(s().history.future.length).toBe(0)
  })

  it('a held key does not run a command again, but says nothing either', () => {
    render(<Keys />)
    act(() => s().select(MASS))
    const lock = vi.spyOn(commandOf('edit.lock')!, 'run').mockImplementation(() => {})
    press('Ctrl+Shift+L', { repeat: true })
    expect(lock).not.toHaveBeenCalled()
    press('Ctrl+Shift+L')
    expect(lock).toHaveBeenCalledTimes(1)
  })

  it('the old keys do nothing: Corner Q, Full screen F is Corner now, Merge Ctrl+J; G is the Gate, not the graph', () => {
    render(<Keys />)
    act(() => s().select(MASS))
    for (const chord of ['Q', 'Ctrl+J']) expect(press(chord).defaultPrevented, chord).toBe(false)
    expect(useTool.getState().tool).toBe('select')
    // L was the Lot's; since Phase AS.5 it is the Reference line's, and the Lot is P
    press('L')
    expect(useTool.getState().tool).toBe('referenceLine')
    press('L')
    expect(useTool.getState().tool).toBe('select')
    // T is the Ruler and Shift+T the Note's (Phase AS.5); Ctrl+Shift+T is the browser's
    press('Shift+T')
    expect(useTool.getState().tool).toBe('note')
    press('Shift+T')
    expect(useTool.getState().tool).toBe('select')
    expect(press('Ctrl+Shift+T').defaultPrevented).toBe(false)
    expect(useTool.getState().tool).toBe('select')
    press('G')
    expect(useGraph.getState().graph).toBe(false)
    press('F')
    expect(useTool.getState().tool).toBe('corner')
    // Shift+F is the Chamfer, beside Corner (Phase D.1)
    press('Shift+F')
    expect(useTool.getState().tool).toBe('chamfer')
    press('Shift+F')
    expect(useTool.getState().tool).toBe('select')
  })
})

describe('a chord no command has is left alone', () => {
  it('it is not prevented and nothing is said', () => {
    render(<Keys />)
    for (const chord of ['Q', 'X', 'Ctrl+J', 'Ctrl+Alt+K', 'F7', '3']) {
      const e = press(chord)
      expect(e.defaultPrevented, chord).toBe(false)
    }
    expect(toast()).toBeNull()
  })

  it('the digits and # @ < . - + are the command line’s: no command has them, with or without AltGr', () => {
    for (const key of ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '#', '@', '<', '.', '-', '+']) {
      for (const place of ['project', 'home', 'rules', 'block-editor', 'dialog'] as const) expect(commandForKey(key, place), `${key} in ${place}`).toBeUndefined()
    }
    const at = new KeyboardEvent('keydown', { key: '@', ctrlKey: true, altKey: true, cancelable: true })
    expect(dispatch(at)).toBe(false)
    expect(at.defaultPrevented).toBe(false)
  })

  it('a digit reaches the command line while a tool is registered, and the view does not change (the old 3)', () => {
    useCommand.getState().register({
      tool: 'Test',
      prompt: 'First point',
      help: 'x,y',
      context: () => ({ first: true, base: null, cursor: null, rectangle: false, angle: null }),
      apply: () => true,
      cancel: () => {},
    })
    render(<App />)
    press('3')
    expect(ui().view).toBe('plan')
    expect((screen.getByRole('textbox', { name: /command/i }) as HTMLInputElement).value).toBe('3')
  })
})

describe('typing in a field', () => {
  function field() {
    const input = document.body.appendChild(document.createElement('input'))
    input.focus()
    return input
  }

  it('only the commands that answer while typing run: Save and Load; M and Delete are the field’s', () => {
    render(<Keys />)
    act(() => s().select(MASS))
    const input = field()
    const save = vi.spyOn(commandOf('file.save')!, 'run').mockImplementation(() => {})
    const load = vi.spyOn(commandOf('file.load')!, 'run').mockImplementation(() => {})
    expect(press('M', {}, input).defaultPrevented).toBe(false)
    expect(useTool.getState().tool).toBe('select')
    expect(press('Del', {}, input).defaultPrevented).toBe(false)
    expect(press('Ctrl+Z', {}, input).defaultPrevented).toBe(false)
    expect(s().selection.massIds).toEqual([MASS])
    expect(press('Ctrl+S', {}, input).defaultPrevented).toBe(true)
    expect(press('Ctrl+Shift+S', {}, input).defaultPrevented).toBe(true)
    expect(save).toHaveBeenCalledTimes(2)
    expect(press('Ctrl+O', {}, input).defaultPrevented).toBe(true)
    expect(load).toHaveBeenCalledTimes(1)
  })
})

describe('Home', () => {
  it('answers only Home’s commands: Load, New, Help; Ctrl+Z, S, Delete and the tools do not reach the project behind it', () => {
    render(<Keys />)
    act(() => s().apply((p) => actions.rotateMass(p, MASS, 90)))
    act(() => s().select(MASS))
    act(PLACE_STATE.home)
    const undo = vi.spyOn(s(), 'undo')
    const load = vi.spyOn(commandOf('file.load')!, 'run').mockImplementation(() => {})
    for (const chord of ['Ctrl+Z', 'Ctrl+Y', 'M', 'Del', 'Backspace', 'Ctrl+D', 'Alt+2', 'B']) expect(press(chord).defaultPrevented, chord).toBe(false)
    // Ctrl+S is prevented (no browser Save page), saves nothing and says why
    const save = vi.spyOn(commandOf('file.save')!, 'run').mockImplementation(() => {})
    expect(press('Ctrl+S').defaultPrevented).toBe(true)
    expect(press('Ctrl+Shift+S').defaultPrevented).toBe(true)
    expect(save).not.toHaveBeenCalled()
    expect(toast()).toBe('Open a project first')
    expect(undo).not.toHaveBeenCalled()
    expect(s().history.past.length).toBe(1)
    expect(s().project.masses.some((m) => m.id === MASS)).toBe(true)
    expect(useTool.getState().tool).toBe('select')
    expect(ui().view).toBe('plan')
    expect(press('Ctrl+O').defaultPrevented).toBe(true)
    expect(load).toHaveBeenCalledTimes(1)
    expect(press('F1').defaultPrevented).toBe(true)
    expect(ui().help).toBe(true)
  })
})

describe('the Rules window', () => {
  it('R draws a rule and again lets it go; S solves; Delete removes the picked rule; Undo, Redo and Save work; the plan’s keys do not', () => {
    render(<Keys />)
    act(PLACE_STATE.rules)
    press('R')
    expect(useGraph.getState().tool).toBe('rule')
    press('R')
    expect(useGraph.getState().tool).toBe('select')
    const solve = vi.spyOn(commandOf('rules.solve')!, 'run').mockImplementation(() => {})
    expect(press('S').defaultPrevented).toBe(true)
    expect(solve).toHaveBeenCalledTimes(1)
    // Delete with no rule picked says why; with one picked it goes
    expect(press('Del').defaultPrevented).toBe(true)
    expect(toast()).toMatch(/pick a rule/i)
    const del = vi.spyOn(commandOf('rules.delete')!, 'run').mockImplementation(() => {})
    act(() => useGraph.setState({ rule: 'r1' }))
    press('Del')
    press('Backspace')
    expect(del).toHaveBeenCalledTimes(2)
    // the plan's are not heard
    act(() => s().select(MASS))
    for (const chord of ['M', 'B', 'Shift+R', 'Z', 'F3', 'Ctrl+D', 'Alt+2']) expect(press(chord).defaultPrevented, chord).toBe(false)
    expect(useTool.getState().tool).toBe('select')
    const save = vi.spyOn(commandOf('file.save')!, 'run').mockImplementation(() => {})
    expect(press('Ctrl+S').defaultPrevented).toBe(true)
    expect(save).toHaveBeenCalled()
    act(() => s().apply((p) => actions.rotateMass(p, MASS, 90)))
    press('Ctrl+Z')
    expect(s().history.past.length).toBe(0)
    press('Ctrl+Y')
    expect(s().history.past.length).toBe(1)
  })

  it('its keys say they are the Rules window’s from outside it', () => {
    render(<Keys />)
    const c = commandOf('rules.rule')!
    expect(c.enabled!()).toBe('Open the Rules window first')
    expect(commandOf('rules.solve')!.enabled!()).toBe('Open the Rules window first')
    act(PLACE_STATE.rules)
    expect(c.enabled!()).toBe(true)
  })
})

describe('the block editor (the Program window)', () => {
  it('Undo, Redo, Save and Help answer; the plan’s keys do not; its own keys, with no bar on screen, say to open it', () => {
    render(<Keys />)
    act(PLACE_STATE['block-editor'])
    for (const chord of ['M', 'B', 'Z', 'Ctrl+D', 'Alt+2', 'Del']) expect(press(chord).defaultPrevented, chord).toBe(false)
    expect(press('?', { shiftKey: true }).defaultPrevented).toBe(true)
    expect(ui().help).toBe(true)
    const e = press('D')
    expect(e.defaultPrevented).toBe(true)
    expect(toast()).toBe('Open the block editor first')
    expect(useTool.getState().tool).toBe('select')
    useToast.setState({ toast: null })
    press('T')
    expect(toast()).toBe('Open the block editor first')
    const save = vi.spyOn(commandOf('file.save')!, 'run').mockImplementation(() => {})
    press('Ctrl+S')
    expect(save).toHaveBeenCalled()
  })
})

describe('another window, or a menu open', () => {
  it('Undo, Redo, Save and Load answer and nothing else does', () => {
    render(<Keys />)
    act(() => s().select(MASS))
    act(() => s().apply((p) => actions.rotateMass(p, MASS, 90)))
    act(PLACE_STATE.dialog)
    for (const chord of ['M', 'B', 'Del', 'Ctrl+D', 'F3', 'Alt+2', '?']) expect(press(chord).defaultPrevented, chord).toBe(false)
    press('Ctrl+Z')
    expect(s().history.past.length).toBe(0)
    const save = vi.spyOn(commandOf('file.save')!, 'run').mockImplementation(() => {})
    const load = vi.spyOn(commandOf('file.load')!, 'run').mockImplementation(() => {})
    press('Ctrl+S')
    press('Ctrl+O')
    expect([save.mock.calls.length, load.mock.calls.length]).toEqual([1, 1])
  })

  it('with a menu open the letters wait for it', () => {
    render(<Keys />)
    act(() => s().select(MASS))
    document.body.appendChild(document.createElement('div')).setAttribute('role', 'menu')
    expect(press('M').defaultPrevented).toBe(false)
    expect(useTool.getState().tool).toBe('select')
  })
})

describe('a disabled command’s key does nothing, and says why', () => {
  it('Undo with nothing to undo: the browser’s key is prevented, nothing runs, a notice says why', () => {
    render(<Keys />)
    const undo = vi.spyOn(s(), 'undo')
    const e = press('Ctrl+Z')
    expect(e.defaultPrevented).toBe(true)
    expect(undo).not.toHaveBeenCalled()
    expect(toast()).toBe('Nothing to undo')
    expect(useToast.getState().toast?.kind).toBe('info')
  })

  it('Move with nothing picked, a tool in the 3D view', () => {
    render(<Keys />)
    press('M')
    expect(toast()).toBe('Pick something first')
    expect(useTool.getState().tool).toBe('select')
    act(() => {
      s().select(MASS)
      ui().setView('3d')
    })
    useToast.setState({ toast: null })
    press('M')
    expect(toast()).toMatch(/plan is not on screen/i)
    expect(useTool.getState().tool).toBe('select')
  })

  it('a held disabled key does not say it again', () => {
    render(<Keys />)
    press('M', { repeat: true })
    expect(toast()).toBeNull()
  })

  it('the browser’s own copy, paste and select all stay the browser’s when the command has nothing to do', () => {
    render(<Keys />)
    for (const chord of ['Ctrl+C', 'Ctrl+V', 'Ctrl+Shift+V']) {
      expect(press(chord).defaultPrevented, chord).toBe(false)
    }
    expect(toast()).toBeNull()
  })
})

describe('Escape is not a command: the screen’s own handler keeps it', () => {
  it('it closes a window, lets go of the picked, and no chord of Escape is a command’s', () => {
    render(<Keys />)
    act(PLACE_STATE.dialog)
    act(() => void handleKey(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true })))
    expect(ui().dialog).toBeNull()
    act(() => s().select(MASS))
    act(() => void handleKey(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true })))
    expect(s().selection.massIds).toEqual([])
    expect(commandForKey('Esc', 'project')).toBeUndefined()
  })
})

describe('a tool that is drawing keeps its keys: heard first, in the capture phase, so the dispatcher never sees them', () => {
  function Drawing({ calls }: { calls: string[] }) {
    useShortcuts()
    useDrawingKeys({
      enter: () => (calls.push('enter'), true),
      escape: () => void calls.push('escape'),
      back: () => void calls.push('back'),
      undo: () => (calls.push('undo'), true),
    })
    return null
  }

  it('Enter, Escape, Delete, Backspace and Ctrl+Z are the tool’s; a mass picked is not deleted nor the project undone', () => {
    const calls: string[] = []
    render(<Drawing calls={calls} />)
    act(() => s().select(MASS))
    act(() => s().apply((p) => actions.rotateMass(p, MASS, 90)))
    for (const chord of ['Enter', 'Esc', 'Del', 'Backspace', 'Ctrl+Z']) press(chord === 'Esc' ? 'Escape' : chord)
    expect(calls).toEqual(['enter', 'escape', 'back', 'back', 'undo'])
    expect(s().project.masses.some((m) => m.id === MASS)).toBe(true)
    expect(s().history.past.length).toBe(1)
    expect(s().selection.massIds).toEqual([MASS])
  })

  it('what a tool does not take goes on to the dispatcher: M, and Ctrl+Z with no stroke', () => {
    const calls: string[] = []
    function NoStroke() {
      useShortcuts()
      useDrawingKeys({ enter: () => false, escape: () => {}, back: () => {}, undo: () => false })
      return null
    }
    render(<NoStroke />)
    act(() => s().select(MASS))
    act(() => s().apply((p) => actions.rotateMass(p, MASS, 90)))
    press('Ctrl+Z')
    expect(s().history.past.length).toBe(0)
    press('M')
    expect(useTool.getState().tool).toBe('move')
    expect(calls).toEqual([])
  })

  it('a preview standing between two clicks keeps the keys that edit the project: the commands’, by their keys now', () => {
    const edits = (init: KeyboardEventInit & { key: string }) => editsProject(new KeyboardEvent('keydown', init))
    expect(edits({ key: 'R', shiftKey: true })).toBe(true)
    expect(edits({ key: 'Enter', ctrlKey: true })).toBe(true)
    for (const key of ['d', 'v', 'g', 'y']) expect(edits({ key, ctrlKey: true }), key).toBe(true)
    expect(edits({ key: 'z', ctrlKey: true, shiftKey: true })).toBe(true)
    expect(edits({ key: 'v', ctrlKey: true, shiftKey: true })).toBe(true)
    expect(edits({ key: 'u' })).toBe(true)
    // the tools’ letters and the digits are not edits (a tool’s key goes to another tool); the old keys are nothing
    for (const key of ['m', 'r', 'b', 'x', '3', 's']) expect(edits({ key }), key).toBe(false)
    expect(edits({ key: 'z', ctrlKey: true })).toBe(false)
    expect(edits({ key: 'j', ctrlKey: true })).toBe(false)
  })
})

describe('titles and details read the registry: no key typed by hand in a view', () => {
  it('a tool’s title ends with its key as the registry has it, and follows the user’s', () => {
    const title = (key: string) => TOOLS.find((t) => t.key === key)!.title
    expect(title('move')).toMatch(/\(M\)$/)
    expect(title('rotate')).toMatch(/\(R\)$/)
    expect(title('corner')).toMatch(/\(F\)$/)
    expect(title('lot')).toMatch(/\(P\)$/)
    expect(title('dimension')).toMatch(/\(D\)$/)
    expect(title('mass')).toMatch(/\(B\)$/)
    setKeys('tool.move', ['X'])
    expect(title('move')).toMatch(/\(X\)$/)
    setKeys('tool.move', [])
    expect(title('move')).not.toMatch(/\(/)
  })

  it('Plan and 3D say Alt+1 and Alt+2', () => {
    expect(VIEWS.find((v) => v.key === 'plan')!.title).toBe('Plan (Alt+1)')
    expect(VIEWS.find((v) => v.key === '3d')!.title).toBe('3D view (Alt+2)')
  })

  it('the buttons on screen say the keys of their commands', () => {
    render(<App />)
    // Undo and Redo read their commands: with nothing to undo the title is the reason, so there is a step to undo and one to redo
    act(() => s().apply((p) => actions.rotateMass(p, MASS, 90)))
    act(() => s().apply((p) => actions.rotateMass(p, MASS, 90)))
    act(() => s().undo())
    const titleOf = (name: string | RegExp) => screen.getAllByRole('button', { name }).map((b) => b.getAttribute('title') ?? '')
    expect(titleOf('Undo').join()).toContain('Ctrl+Z')
    expect(titleOf('Redo').join()).toContain('Ctrl+Y')
    expect(titleOf('Snap').join()).toContain('(F3)')
    expect(titleOf('Ortho').join()).toContain('(F8)')
    expect(titleOf('Ruler').join()).toContain('(T)')
  })
})

describe('the guards', () => {
  it('no two commands share a default key in one place', () => {
    // every command the registry was given, the ones another typology offers too (review fix, finding 7)
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

  it('no default is reserved', () => {
    for (const c of commands()) for (const chord of keysOf(c.id)) expect(reservedReason(chord), `${c.id} has the reserved ${chord}`).toBeNull()
  })

  it('the new defaults are the CAD scheme', () => {
    const k = (id: string) => keysOf(id)
    expect([k('file.load'), k('file.save'), k('file.export.project'), k('file.export.cad')]).toEqual([['Ctrl+O'], ['Ctrl+S', 'Ctrl+Shift+S'], ['Ctrl+E'], ['Ctrl+Shift+E']])
    expect([k('edit.undo'), k('edit.redo'), k('edit.delete'), k('edit.rotate90'), k('edit.lock')]).toEqual([['Ctrl+Z'], ['Ctrl+Y', 'Ctrl+Shift+Z'], ['Del', 'Backspace'], ['Shift+R'], ['Ctrl+Shift+L']])
    expect([k('view.plan'), k('view.3d'), k('view.split'), k('view.frame'), k('view.snap'), k('view.ortho'), k('view.grid'), k('view.fullscreen'), k('design.solve')]).toEqual([
      ['Alt+1'], ['Alt+2'], ['Alt+3'], ['Z'], ['F3'], ['F8'], ['F9'], ['Ctrl+Shift+F'], ['Ctrl+Enter'],
    ])
    expect(['select', 'move', 'copy', 'rotate', 'mirror', 'array', 'align', 'mass', 'hole', 'corner', 'chamfer', 'union', 'dock', 'door', 'pattern', 'court', 'street', 'gate', 'lot', 'dimension', 'ruler'].map((t) => k(`tool.${t}`)[0])).toEqual([
      'V', 'M', 'C', 'R', 'I', 'A', 'Shift+A', 'B', 'H', 'F', 'Shift+F', 'U', 'K', 'J', 'N', 'Y', 'W', 'G', 'P', 'D', 'T',
    ])
    expect(k('help.help')).toEqual(['F1', '?'])
    expect([k('view.overlay.graph'), k('tool.connect')]).toEqual([[], []])
  })

  it('the Rules window’s and the block editor’s keys are commands of their own place', () => {
    expect([commandOf('rules.rule')!.where, commandOf('rules.solve')!.where, commandOf('rules.delete')!.where]).toEqual([['rules'], ['rules'], ['rules']])
    expect(keysOf('rules.rule')).toEqual(['R'])
    expect(keysOf('rules.solve')).toEqual(['S'])
    expect(keysOf('rules.delete')).toEqual(['Del', 'Backspace'])
    const block = Object.fromEntries(['dimension', 'ruler', 'snap', 'ortho', 'grid'].map((x) => [x, keysOf(`block.${x}`)[0]]))
    expect(block).toEqual({ dimension: 'D', ruler: 'T', snap: 'F3', ortho: 'F8', grid: 'F9' })
    for (const x of ['dimension', 'ruler', 'snap', 'ortho', 'grid']) expect(commandOf(`block.${x}`)!.where).toEqual(['block-editor'])
    expect(commandOf('rules.rule')!.menu).toEqual(['Design', 'Rules window'])
    expect(commandOf('block.ruler')!.menu).toEqual(['Tools', 'Block editor'])
  })

  /** Every source file of the views, the modules’ views included, that is not a test. */
  function sources(dir: string, out: string[] = []): string[] {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name)
      if (e.isDirectory()) {
        if (e.name !== '__tests__' && e.name !== 'node_modules') sources(p, out)
      } else if (/\.tsx?$/.test(e.name) && !/\.test\./.test(e.name)) out.push(p)
    }
    return out
  }

  it('no view listens to keydown outside the dispatcher’s mount and the files LOCAL_KEYS names', () => {
    const src = join(process.cwd(), 'src')
    const files = [join(src, 'views'), ...readdirSync(join(src, 'modules')).map((m) => join(src, 'modules', m, 'views'))].flatMap((d) => {
      try {
        return sources(d)
      } catch {
        return []
      }
    })
    const listening = files.filter((f) => /addEventListener\(\s*['"]keydown['"]/.test(readFileSync(f, 'utf8'))).map((f) => relative(src, f).replaceAll('\\', '/'))
    const named = LOCAL_KEYS.map((k) => k.file)
    expect(listening.filter((f) => !named.includes(f)), 'a listener LOCAL_KEYS does not name').toEqual([])
    // and the list is honest: a file it names exists and listens (or is the dispatcher’s mount)
    for (const k of LOCAL_KEYS) {
      expect(k.keys.length, k.file).toBeGreaterThan(0)
      expect(k.why.length, k.file).toBeGreaterThan(10)
      if (/\.tsx?$/.test(k.file)) expect(listening, `${k.file} is named but does not listen`).toContain(k.file)
    }
    expect(named).toContain('views/useShortcuts.ts')
    expect(commands().length).toBeGreaterThan(0)
  })

  it('an effect that mounts the dispatcher removes it on unmount', () => {
    const add = vi.spyOn(window, 'addEventListener')
    const remove = vi.spyOn(window, 'removeEventListener')
    const { unmount } = render(<Keys />)
    expect(add.mock.calls.filter((c) => c[0] === 'keydown')).toHaveLength(1)
    unmount()
    expect(remove.mock.calls.filter((c) => c[0] === 'keydown')).toHaveLength(1)
  })
})
