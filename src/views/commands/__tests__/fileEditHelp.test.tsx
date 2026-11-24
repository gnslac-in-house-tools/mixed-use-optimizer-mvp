// The File, Edit and Help commands (Project C, AS.1 task 2): each one, run through the registry, does what the control it
// stands for does today (the top bar's ⋯ and Export, the plan's right-click menu, the keys, the Help button and the
// Tour button), and is disabled with a reason exactly where that control is. The App is rendered as the other view
// tests do (the 3D scene is mocked); nothing here presses a button: `runCommand` is the one door.
// Demo masses: m1 x 40…200 y 70…150 and m2 x 250…390 y 70…150 (warehouses, they do not touch); m3 (office).
import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../../App.tsx'
import { derive } from '../../../engine/derive.ts'
import { dxfFileName } from '../../../io/exportDxf.ts'
import { actions } from '../../../state/actions/index.ts'
import { demoProject } from '../../../state/demo.ts'
import { emptyHistory } from '../../../state/history.ts'
import { SAMPLE_ID } from '../../../state/sample.ts'
import { NO_SELECTION, useApp } from '../../../state/store.ts'
import { useScreen } from '../../home/screen.ts'
import { EXPORT_LABELS, useCadPlan } from '../../layout/exporting.ts'
import { useModelExport } from '../../layout/ModelExportDialog.tsx'
import { useSaving } from '../../layout/saving.ts'
import { useToast } from '../../layout/toast.ts'
import { useUi } from '../../layout/ui.ts'
import { useClipboard } from '../../plan/clipboard.ts'
import { planMenu, rowKeyed } from '../../editing/menu/__tests__/helpers.ts'
import { pickedRefs } from '../../plan/mix.ts'
import { useSceneRef } from '../../scene/sceneRef.ts'
import { useTour } from '../../tour/tour.ts'
import { startZero } from '../../tour/zero/run.ts'
import { registerAll } from '../index.ts'
import { commandOf, commands, menuEntries, runCommand } from '../registry.ts'

vi.mock('../../scene/Scene.tsx', () => ({ Scene: () => <div data-testid="scene" /> }))
vi.mock('../../tour/zero/run.ts', async (orig) => ({ ...(await orig<typeof import('../../tour/zero/run.ts')>()), startZero: vi.fn() }))

let names: string[] = []
beforeEach(() => {
  localStorage.clear()
  registerAll()
  names = []
  URL.createObjectURL = vi.fn(() => 'blob:x')
  URL.revokeObjectURL = vi.fn()
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    names.push(this.download)
  })
  const p = demoProject()
  useApp.setState({ project: p, derived: derive(p, 'o1'), history: emptyHistory(), dragStart: null, selection: NO_SELECTION, level: 'l1', showAll: false, option: 'o1' })
  useUi.setState({ dialog: null, view: 'plan', rail: 'layers', panels: { left: true, right: true }, sheet: null, help: false })
  useScreen.setState({ home: false, homeView: 'projects' })
  useToast.setState({ toast: null, confirmation: null })
  useSaving.setState({ autosave: true, kept: null, savedAt: null, failed: false })
  useClipboard.setState({ masses: [], roads: [] })
  useCadPlan.setState({ threeD: false })
  useModelExport.setState({ open: false })
  useSceneRef.setState({ capturePng: null })
  vi.mocked(startZero).mockClear()
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  useTour.getState().exit()
})

const s = () => useApp.getState()
const run = (id: string) => act(async () => void runCommand(id))
const reason = (id: string) => commandOf(id)!.enabled?.() ?? true
const pick = (...ids: string[]) => act(() => (ids.length === 1 ? s().select(ids[0]) : s().selectMany(ids)))
const edit = () => act(() => s().apply((p) => actions.removeMass(p, 'm3')))
const toast = () => useToast.getState().toast?.text
const masses = () => s().project.masses.length

describe('File', () => {
  it('its commands, in the order of the top bar’s ⋯ and Export: one New per typology, Load, Save, Export ▸, data, Autosave, demo, Home', () => {
    const keys = menuEntries(['File']).map((e) => (e === 'separator' ? e : e.key))
    expect(keys.filter((k) => k !== 'separator')).toEqual(['file.new.industrial', 'file.new.blank', 'file.load', 'file.save', 'Export', 'file.data', 'file.autosave', 'file.demo', 'file.home'])
    expect(menuEntries(['File', 'Export']).map((e) => (e === 'separator' ? e : e.key))).toEqual([
      'file.export.project',
      'file.export.model',
      'file.export.cad',
      'file.export.cad3d',
      'file.export.image',
      'file.export.log',
    ])
    expect(commandOf('file.new.industrial')!.label).toBe('New industrial project')
    expect(commandOf('file.new.blank')!.label).toBe('New blank project')
  })

  it('New … project starts a project of its typology, as the ⋯ does', async () => {
    render(<App />)
    await run('file.new.blank')
    expect(s().project.typology).toBe('blank')
    expect(s().project.name).toBe('New blank project')
    expect(toast()).toMatch(/^New blank project: no site yet/)
  })

  it('Load project… opens the file picker (the .gft input, where the browser has no picker of its own)', async () => {
    render(<App />)
    const click = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {})
    await run('file.load')
    expect(click).toHaveBeenCalledTimes(1)
    expect((click.mock.contexts[0] as HTMLInputElement).getAttribute('aria-label')).toBe('Open .gft')
  })

  it('Save keeps the project in this browser and says “Project saved”', async () => {
    render(<App />)
    edit()
    expect(useSaving.getState().kept).toBeNull()
    await run('file.save')
    expect(toast()).toBe('Project saved')
    expect(useSaving.getState().kept).toBe(s().project)
  })

  it('File › Export › Project (.gft) downloads the project', async () => {
    render(<App />)
    await run('file.export.project')
    expect(names).toHaveLength(1)
    expect(names[0]).toMatch(/^Demo-site_\d{4}-\d{2}-\d{2}\.gft$/)
  })

  it('Export › 3D model… opens its dialog', async () => {
    render(<App />)
    await run('file.export.model')
    expect(useModelExport.getState().open).toBe(true)
  })

  it('Export › CAD plan downloads a .dxf; its 3D tick is a command of its own that follows the box and changes the file', async () => {
    render(<App />)
    const tick = commandOf('file.export.cad3d')!
    expect(tick.checked!()).toBe(false)
    await run('file.export.cad')
    expect(names).toEqual([dxfFileName('Demo site', false)])
    await run('file.export.cad3d')
    expect(tick.checked!()).toBe(true)
    expect(useCadPlan.getState().threeD).toBe(true)
    await run('file.export.cad')
    expect(names[1]).toBe(dxfFileName('Demo site', true))
    act(() => useCadPlan.getState().set(false))
    expect(tick.checked!()).toBe(false)
  })

  it('Export › Image of the 3D view waits for a scene, then downloads a .png', async () => {
    render(<App />)
    expect(reason('file.export.image')).toBe('Open the 3D or Split view first')
    expect(runCommand('file.export.image')).toBe(false)
    act(() => useSceneRef.getState().register(() => 'data:image/png;base64,iVBORw0KGgo='))
    globalThis.fetch = vi.fn(async () => ({ blob: async () => new Blob(['png']) })) as unknown as typeof fetch
    expect(reason('file.export.image')).toBe(true)
    await run('file.export.image')
    await vi.waitFor(() => expect(names[0]).toMatch(/^Demo-site_\d{4}-\d{2}-\d{2}\.png$/))
  })

  it('Export › Decision log waits for a change, then downloads a .csv', async () => {
    render(<App />)
    expect(reason('file.export.log')).toBe('No changes logged yet')
    expect(runCommand('file.export.log')).toBe(false)
    edit()
    expect(reason('file.export.log')).toBe(true)
    await run('file.export.log')
    expect(names[0]).toMatch(/^Demo-site-decision-log_\d{4}-\d{2}-\d{2}\.csv$/)
  })

  it('the Export rows are the labels of the one list (EXPORT_LABELS) that the files’ functions share: one definition of each label', () => {
    render(<App />)
    const rows = menuEntries(['File', 'Export']).filter((e): e is Exclude<typeof e, 'separator'> => e !== 'separator' && e.key !== 'file.export.cad3d')
    expect(rows.map((r) => r.label)).toEqual(Object.values(EXPORT_LABELS))
  })

  it('Project data… opens the project’s data, as its name does', async () => {
    render(<App />)
    expect(screen.queryByRole('dialog')).toBeNull()
    await run('file.data')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('Autosave is a tick that follows autosave and turns it off and on, as the cloud beside the name does', async () => {
    render(<App />)
    const c = commandOf('file.autosave')!
    expect(c.checked!()).toBe(true)
    await run('file.autosave')
    expect(useSaving.getState().autosave).toBe(false)
    expect(c.checked!()).toBe(false)
    expect(localStorage.getItem('gfit.autosave')).toBe('off')
    await run('file.autosave')
    expect(useSaving.getState().autosave).toBe(true)
  })

  it('Open the demo project and Home do what the ⋯ and the GFit button do', async () => {
    render(<App />)
    act(() => s().open({ ...demoProject(), name: 'Other' }))
    await run('file.demo')
    expect(s().project.name).toBe('Demo site')
    expect(toast()).toBe('Opened the demo project.')
    await run('file.home')
    expect(useScreen.getState().home).toBe(true)
  })

  it('New and Load answer on Home too; Save also in the Rules window and the block editor, and while typing', () => {
    expect(commandOf('file.new.industrial')!.where).toEqual(['project', 'home'])
    expect(commandOf('file.load')!.where).toEqual(['project', 'home', 'rules', 'block-editor', 'dialog'])
    expect(commandOf('file.load')!.typing).toBe(true)
    // on Home Save is disabled saying why, so Ctrl+S is prevented there and the browser's Save page does not open
    expect(commandOf('file.save')!.where).toEqual(['project', 'home', 'rules', 'block-editor', 'dialog'])
    expect(commandOf('file.save')!.typing).toBe(true)
    for (const id of ['file.data', 'file.autosave', 'file.demo', 'file.home', 'file.export.project']) expect(commandOf(id)!.where ?? ['project']).toEqual(['project'])
  })

  it('the keys the commands have today, as data', () => {
    expect(commandOf('file.load')!.key).toBe('Ctrl+O')
    expect(commandOf('file.save')!.key).toEqual(['Ctrl+S', 'Ctrl+Shift+S'])
  })
})

describe('Edit', () => {
  it('its commands, in the spec’s order (Merge moved to Tools › Massing as Union)', () => {
    expect(menuEntries(['Edit']).flatMap((e) => (e === 'separator' ? [] : [e.key]))).toEqual([
      'edit.undo',
      'edit.redo',
      'edit.copy',
      'edit.paste',
      'edit.paste-here',
      'edit.duplicate',
      'edit.delete',
      'edit.select-all',
      'edit.group',
      'edit.ungroup',
      'edit.rename',
      'edit.lock',
      'edit.hide',
      'edit.rotate90',
      'edit.properties',
      'edit.shortcuts',
    ])
  })

  it('Undo and Redo: disabled with their reason while there is nothing, then they undo and redo', async () => {
    render(<App />)
    expect(reason('edit.undo')).toBe('Nothing to undo')
    expect(reason('edit.redo')).toBe('Nothing to redo')
    expect(runCommand('edit.undo')).toBe(false)
    edit()
    expect(masses()).toBe(2)
    expect(reason('edit.undo')).toBe(true)
    await run('edit.undo')
    expect(masses()).toBe(3)
    expect(reason('edit.redo')).toBe(true)
    await run('edit.redo')
    expect(masses()).toBe(2)
  })

  it('Undo, Redo and Save also answer in the Rules window and the block editor', () => {
    for (const id of ['edit.undo', 'edit.redo']) expect(commandOf(id)!.where).toEqual(['project', 'rules', 'block-editor', 'dialog'])
  })

  it('Copy, Paste and Paste here: Copy needs something picked, Paste something copied; Paste puts it in place, Paste here beside it', async () => {
    render(<App />)
    expect(reason('edit.copy')).toBe('Pick something first')
    expect(reason('edit.paste')).toBe('Copy something first')
    expect(reason('edit.paste-here')).toBe('Copy something first')
    pick('m1')
    expect(reason('edit.copy')).toBe(true)
    await run('edit.copy')
    expect(useClipboard.getState().masses.map((m) => m.id)).toEqual(['m1'])
    expect(reason('edit.paste')).toBe(true)
    await run('edit.paste')
    expect(masses()).toBe(4)
    await run('edit.paste-here')
    expect(masses()).toBe(5)
  })

  it('Duplicate needs masses picked and puts a copy beside them, picked', async () => {
    render(<App />)
    expect(reason('edit.duplicate')).toBe('Pick something first')
    pick('m1')
    await run('edit.duplicate')
    expect(masses()).toBe(4)
    expect(s().selection.massIds).toHaveLength(1)
    expect(s().selection.massIds[0]).not.toBe('m1')
  })

  it('Delete is disabled with a reason when nothing is picked, and removes the picked mass', async () => {
    render(<App />)
    expect(reason('edit.delete')).toBe('Pick something first')
    expect(runCommand('edit.delete')).toBe(false)
    expect(masses()).toBe(3)
    pick('m1')
    expect(reason('edit.delete')).toBe(true)
    await run('edit.delete')
    expect(s().project.masses.map((m) => m.id)).toEqual(['m2', 'm3'])
  })

  it('Delete of a locked mass says to unlock it first, as the plan’s menu does', async () => {
    render(<App />)
    pick('m1')
    act(() => s().apply((p) => actions.lockMasses(p, ['m1'], true)))
    // locking lets it go (the padlock is CAD's); picked from a tree's row, it is there to say why
    expect(s().selection.massIds).toEqual([])
    act(() => s().select('m1'))
    expect(reason('edit.delete')).toBe('A locked mass: unlock first')
    expect(reason('edit.rotate90')).toBe('A locked mass: unlock first')
  })

  it('Select all picks every mass of the level', async () => {
    render(<App />)
    await run('edit.select-all')
    expect([...s().selection.massIds].sort()).toEqual(s().project.masses.filter((m) => m.levelId === 'l1').map((m) => m.id).sort())
  })

  it('Group, Ungroup and Union (Merge): disabled with their reasons, then they act', async () => {
    render(<App />)
    expect(reason('edit.group')).toBe('Select two or more masses to group them')
    expect(reason('edit.ungroup')).toBe('Select a mass first')
    expect(reason('tool.union')).toBe('Select two or more blocks that touch to merge them')
    pick('m1', 'm2')
    expect(reason('edit.group')).toBe(true)
    expect(reason('edit.ungroup')).toBe('None of them is in a group')
    expect(reason('tool.union')).toMatch(/do not all touch/)
    await run('edit.group')
    expect(s().project.masses.find((m) => m.id === 'm1')!.group).toBeTruthy()
    expect(reason('edit.group')).toBe('They are one group already')
    expect(reason('edit.ungroup')).toBe(true)
    await run('edit.ungroup')
    expect(s().project.masses.find((m) => m.id === 'm1')!.group).toBeUndefined()
  })

  it('Union (Merge) runs on masses that touch', async () => {
    render(<App />)
    act(() => {
      s().apply((p) => actions.addMass(p, { programId: 'warehouse', footprint: { kind: 'rect', center: { x: 225, y: 130 }, width: 30, depth: 40, rotation: 0 }, name: 'A', height: 14 }).project)
      s().apply((p) => actions.addMass(p, { programId: 'warehouse', footprint: { kind: 'rect', center: { x: 225, y: 100 }, width: 30, depth: 20, rotation: 0 }, name: 'B', height: 14 }).project)
    })
    const [a, b] = s().project.masses.slice(-2).map((m) => m.id)
    pick(a, b)
    expect(reason('tool.union')).toBe(true)
    const n = masses()
    await run('tool.union')
    expect(masses()).toBe(n - 1)
    expect(toast()).toBe('2 blocks merged into one.')
  })

  it('Lock reads Lock or Unlock by what is picked, and toggles it', async () => {
    render(<App />)
    expect(reason('edit.lock')).toBe('Select a mass first')
    pick('m1')
    const label = () => (typeof commandOf('edit.lock')!.label === 'function' ? (commandOf('edit.lock')!.label as () => string)() : '')
    expect(label()).toBe('Lock')
    await run('edit.lock')
    expect(s().project.masses.find((m) => m.id === 'm1')!.locked).toBe(true)
    // locked, it is let go; picked again from a tree's row, the command reads Unlock
    expect(s().selection.massIds).toEqual([])
    act(() => s().select('m1'))
    expect(label()).toBe('Unlock')
    await run('edit.lock')
    expect(s().project.masses.find((m) => m.id === 'm1')!.locked).toBeFalsy()
  })

  it('Rotate 90° turns the picked masses a quarter', async () => {
    render(<App />)
    expect(reason('edit.rotate90')).toBe('Select a mass first')
    pick('m1')
    const before = s().project.masses.find((m) => m.id === 'm1')!
    await run('edit.rotate90')
    const after = s().project.masses.find((m) => m.id === 'm1')!
    expect(after).not.toEqual(before)
  })

  it('agrees with the plan’s right-click menu: the same rows are disabled for the same selections', () => {
    render(<App />)
    const pairs: [string, string][] = [
      ['copy', 'edit.copy'],
      ['paste', 'edit.paste'],
      ['paste-here', 'edit.paste-here'],
      ['duplicate', 'edit.duplicate'],
      ['delete', 'edit.delete'],
      ['group', 'edit.group'],
      ['ungroup', 'edit.ungroup'],
      ['union', 'tool.union'],
      ['rotate90', 'edit.rotate90'],
      ['lock', 'edit.lock'],
    ]
    const check = (state: string) => {
      const menu = planMenu()
      for (const [key, id] of pairs) {
        const row = rowKeyed(menu, key) as { disabled?: boolean; title?: string } | undefined
        // with nothing picked the menu is Paste, Paste here and Select all: the verbs of a kind are not offered to nothing
        if (!row) {
          expect(pickedRefs(), `${state}: ${id} is absent`).toEqual([])
          expect(['copy', 'duplicate', 'delete', 'group', 'ungroup', 'union', 'rotate90', 'lock']).toContain(key)
          continue
        }
        const why = reason(id)
        expect(why !== true, `${state}: ${id}`).toBe(Boolean(row.disabled))
        // the reason is the row’s title for a disabled row of the masses’ own verbs (Copy, Duplicate, Delete and Paste
        // also work on a road, so they word it for anything picked)
        if (row.disabled && ['group', 'ungroup', 'union', 'rotate90', 'lock'].includes(key)) expect(why, `${state}: ${id}`).toBe(row.title)
      }
    }
    check('nothing picked')
    pick('m1')
    check('one picked')
    pick('m1', 'm2')
    check('two picked')
    act(() => s().apply((p) => actions.lockMasses(p, ['m1', 'm2'], true)))
    check('two locked, let go')
    act(() => s().selectMany(['m1', 'm2']))
    check('two locked, picked from a tree')
    act(() => useClipboard.setState({ masses: s().project.masses.slice(0, 1), roads: [] }))
    check('something copied')
  })

  it('the keys the commands have, as data (the CAD scheme of AS.1 task 4)', () => {
    const keys: Record<string, string | string[]> = {
      'edit.undo': 'Ctrl+Z',
      'edit.redo': ['Ctrl+Y', 'Ctrl+Shift+Z'],
      'edit.copy': 'Ctrl+C',
      'edit.paste': 'Ctrl+V',
      'edit.paste-here': 'Ctrl+Shift+V',
      'edit.duplicate': 'Ctrl+D',
      'edit.delete': ['Del', 'Backspace'],
      'edit.select-all': 'Ctrl+A',
      'edit.group': 'Ctrl+G',
      'edit.ungroup': 'Ctrl+Shift+G',
      'edit.rotate90': 'Shift+R',
      'edit.lock': 'Ctrl+Shift+L',
      // Rename is F2 and Hide Ctrl+H (Rhino’s); Properties has no key: F3 is the snap’s
      'edit.rename': 'F2',
      'edit.hide': 'Ctrl+H',
    }
    for (const [id, key] of Object.entries(keys)) expect(commandOf(id)!.key, id).toEqual(key)
    // the menu shows the first
    const detail = (id: string) => (menuEntries(['Edit']).find((e) => e !== 'separator' && e.key === id) as { detail?: string }).detail
    expect(detail('edit.redo')).toBe('Ctrl+Y')
    expect(detail('edit.delete')).toBe('Del')
  })
})

describe('Help', () => {
  it('its commands: Help, Learn GFit from zero, Sample tour, About, State graph (development only)', () => {
    expect(menuEntries(['Help']).flatMap((e) => (e === 'separator' ? [] : [e.label]))).toEqual(['Help', 'Learn GFit from zero', 'Sample tour', 'About', 'State graph'])
    vi.stubEnv('DEV', false)
    expect(menuEntries(['Help']).flatMap((e) => (e === 'separator' ? [] : [e.label]))).toEqual(['Help', 'Learn GFit from zero', 'Sample tour', 'About'])
    expect(commandOf('help.state-graph')).toBeUndefined()
  })

  it('Help shows and hides the notes, as the ? button does', async () => {
    render(<App />)
    await run('help.help')
    expect(useUi.getState().help).toBe(true)
    await run('help.help')
    expect(useUi.getState().help).toBe(false)
  })

  it('Learn GFit from zero starts the tutorial', async () => {
    render(<App />)
    await run('help.zero')
    expect(startZero).toHaveBeenCalledTimes(1)
  })

  it('Sample tour starts at once on the sample, and opens the sample first from anywhere else', async () => {
    render(<App />)
    await run('help.tour')
    expect(s().project.id).toBe(SAMPLE_ID)
    expect(useTour.getState().active).toBe(true)
    act(() => useTour.getState().exit())
    await run('help.tour')
    expect(s().project.id).toBe(SAMPLE_ID)
    expect(useTour.getState().active).toBe(true)
  })

  it('About shows Home on its About page', async () => {
    render(<App />)
    await run('help.about')
    expect(useScreen.getState()).toMatchObject({ home: true, homeView: 'about' })
    // on Home already: the page changes, nothing else is asked
    act(() => useScreen.setState({ homeView: 'projects' }))
    await run('help.about')
    expect(useScreen.getState()).toMatchObject({ home: true, homeView: 'about' })
  })

  it('State graph opens its tab', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    render(<App />)
    await run('help.state-graph')
    expect(open).toHaveBeenCalledWith('/state-graph', 'gfit-state-graph')
  })

  it('Help and its neighbours answer on Home; the keys they have, as data', () => {
    expect(commandOf('help.help')!.key).toEqual(['F1', '?'])
    expect(commandOf('help.help')!.where).toEqual(['project', 'home', 'block-editor'])
    for (const id of ['help.zero', 'help.tour', 'help.about', 'help.state-graph']) expect(commandOf(id)!.where, id).toEqual(['project', 'home'])
    expect(commandOf('help.state-graph')!.dev).toBe(true)
  })
})

describe('the three menus together', () => {
  it('every command of File, Edit and Help is registered once, and none of them is a copy of a control: a command is enabled or says why', () => {
    const mine = commands().filter((c) => ['File', 'Edit', 'Help'].includes(c.menu[0]))
    expect(mine.length).toBeGreaterThanOrEqual(30)
    for (const c of mine) {
      const e = c.enabled?.() ?? true
      expect(e === true || (typeof e === 'string' && e.length > 0 && e.length < 60), c.id).toBe(true)
    }
  })
})
