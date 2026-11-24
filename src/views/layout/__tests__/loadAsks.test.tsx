// A .gft keeps its project id: loading one this browser already keeps, as a different version, asks before it writes
// over it (review fix C1, Decision "Save in the app"). The three ways in (Home's and the menu's Load project, Ctrl+O,
// a dropped file) go through openGft, so each is covered.
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../../App.tsx'
import { derive } from '../../../engine/derive.ts'
import { writeGft } from '../../../io/gft.ts'
import { library } from '../../../io/library.ts'
import { actions } from '../../../state/actions/index.ts'
import { demoProject } from '../../../state/demo.ts'
import { emptyHistory } from '../../../state/history.ts'
import { useApp } from '../../../state/store.ts'
import { newProject } from '../../../typologies/index.ts'
import { handleKey } from '../../useShortcuts.ts'
import { forgetKept, useSaving } from '../saving.ts'
import { useToast } from '../toast.ts'
import { useUi } from '../ui.ts'

beforeEach(() => {
  localStorage.clear()
  const p = demoProject()
  useApp.setState({ project: p, derived: derive(p), history: emptyHistory(), dragStart: null, selection: { massId: null, vertex: null, massIds: [] } })
  useUi.setState({ dialog: null, view: 'plan', rail: 'layers', panels: { left: true, right: true }, sheet: null })
  useToast.setState({ toast: null, confirmation: null })
  forgetKept()
  useSaving.setState({ autosave: true, savedAt: null })
})

afterEach(() => {
  vi.restoreAllMocks()
  delete (window as { showOpenFilePicker?: unknown }).showOpenFilePicker
})

/** Monday's file of "Planta", and Tuesday's version this browser keeps under the same id. */
function mondayAndTuesday() {
  const monday = { ...newProject('blank', 'Planta'), id: 'p-planta' }
  const tuesday = actions.renameProject(monday, 'Planta, later')
  library.write(tuesday, tuesday.options[0].id, 1)
  return { monday, tuesday, file: writeGft(monday) }
}

const pick = (text: string) =>
  act(async () => {
    fireEvent.change(screen.getByLabelText('Open .gft'), { target: { files: [new File([text], 'planta.gft')] } })
  })
const drop = (text: string) =>
  act(async () => {
    fireEvent.drop(window, { dataTransfer: { types: ['Files'], files: [new File([text], 'planta.gft')], items: [], dropEffect: 'none' } })
  })
const ctrlO = (text: string) => {
  ;(window as { showOpenFilePicker?: unknown }).showOpenFilePicker = vi.fn(async () => [{ name: 'planta.gft', getFile: async () => new File([text], 'planta.gft') }])
  return act(async () => handleKey(new KeyboardEvent('keydown', { key: 'o', ctrlKey: true, cancelable: true })))
}
const ways: [string, (t: string) => Promise<void>][] = [
  ['Load project (the file input)', pick],
  ['a dropped file', drop],
  ['Ctrl+O', ctrlO],
]

describe.each(ways)('a file whose project this browser keeps differently: %s', (_name, load) => {
  it('asks; Cancel opens nothing and keeps what this browser has', async () => {
    render(<App />)
    const { tuesday, file } = mondayAndTuesday()
    await load(file)
    const ask = await screen.findByRole('alertdialog', { name: 'Confirm' })
    expect(ask).toHaveTextContent('keeps a different “Planta”')
    fireEvent.click(within(ask).getByRole('button', { name: 'Cancel' }))
    expect(useApp.getState().project.name).toBe('Demo site')
    expect(library.read('p-planta')!.project).toEqual(tuesday)
  })

  it('Replace it with the file writes the file over it', async () => {
    render(<App />)
    const { file } = mondayAndTuesday()
    await load(file)
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Replace it with the file' }))
    expect(useApp.getState().project.name).toBe('Planta')
    expect(library.read('p-planta')!.project.name).toBe('Planta')
  })

  it('Open the file as a copy leaves what this browser keeps and opens a new project named as a copy', async () => {
    render(<App />)
    const { tuesday, file } = mondayAndTuesday()
    await load(file)
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Open the file as a copy' }))
    const open = useApp.getState().project
    expect(open.name).toBe('Planta (copy)')
    expect(open.id).not.toBe('p-planta')
    expect(library.read('p-planta')!.project).toEqual(tuesday)
    expect(library.read(open.id)!.project.name).toBe('Planta (copy)')
  })

  it('the same data as the file, or none kept: opens at once, no question', async () => {
    render(<App />)
    const monday = { ...newProject('blank', 'Planta'), id: 'p-planta' }
    await load(writeGft(monday))
    await waitFor(() => expect(useApp.getState().project.name).toBe('Planta'))
    expect(screen.queryByRole('alertdialog')).toBeNull()
    // now kept, equal to the file: loaded again, no question either
    await load(writeGft(monday))
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(useApp.getState().project.id).toBe('p-planta')
  })
})

it('comes after the question about unkept changes in the open project, not instead of it', async () => {
  render(<App />)
  useSaving.getState().setAutosave(false)
  act(() => useApp.getState().apply((p) => actions.renameProject(p, 'Edited demo')))
  const { file } = mondayAndTuesday()
  await pick(file)
  const first = await screen.findByRole('alertdialog')
  expect(first).toHaveTextContent('has changes this browser has not kept')
  fireEvent.click(within(first).getByRole('button', { name: 'Continue' }))
  const second = await screen.findByRole('alertdialog')
  expect(second).toHaveTextContent('keeps a different “Planta”')
  expect(useApp.getState().project.name).toBe('Edited demo')
  fireEvent.click(within(second).getByRole('button', { name: 'Replace it with the file' }))
  expect(useApp.getState().project.name).toBe('Planta')
})
