// The reference lines in Layers (Phase AS.5 task 2, Decision "Reference lines"): one row, *Reference lines*, under *Reference* beside the Grid, with its count, its eye
// (`reference-lines`; one line's own is `reference-line:<id>`), its padlock (locked, mixed or free from the lines, as the Streets row) and *On top*; a line that is locked or
// hidden is a child row under it (a row only for the exceptions), with its own padlock and eye, and the row goes when the exception does. The Reference branch has no
// eye of its own beyond what it holds: its eye reads the lines' key alone (the Grid's switch is never flipped by a branch). Properties of the row and of a line picked.
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../../App.tsx'
import { derive } from '../../../engine/derive.ts'
import { actions } from '../../../state/actions/index.ts'
import { fixture, s, start } from '../../editing/__tests__/kindsFixture.ts'
import { useUi } from '../../layout/ui.ts'
import { pickedRefs, pickRefs } from '../../plan/mix.ts'
import { useSnapSettings } from '../../plan/snap/settings.ts'
import { referenceLine, REFERENCE_LINES } from '../keys.ts'
import { useLayerView } from '../layerView.ts'
import { flatRows, layerTree, type LayerRow } from '../tree.ts'

vi.mock('../../scene/Scene.tsx', () => ({ Scene: () => <div data-testid="scene" /> }))

const R1 = [{ x: 30, y: 170 }, { x: 180, y: 170 }]
const R2 = [{ x: 225, y: 40 }, { x: 225, y: 160 }]

const tree = () => screen.getByRole('tree', { name: 'Layers' })
const items = (name: string) => within(tree()).queryAllByRole('treeitem', { name })
const item = (name: string): HTMLElement => {
  const all = items(name)
  if (!all[0]) throw new Error(`No row "${name}" (rows: ${within(tree()).queryAllByRole('treeitem').map((r) => r.getAttribute('aria-label')).join(', ')})`)
  return all[0]
}
const unfold = (name: string) => fireEvent.click(within(item(name)).getByRole('button', { name: `Unfold ${name}` }))
const padlock = (name: string) => within(item(name)).getByRole('button', { name: `Lock ${name}` })
/** A row's eye: *Show <name>*, pressed while it is shown. */
const eye = (name: string) => within(item(name)).getByRole('button', { name: `Show ${name}` })
const top = (name: string) => within(item(name)).getByRole('button', { name: `On top ${name}` })
const pressed = (b: HTMLElement) => b.getAttribute('aria-pressed')
const nameOf = (name: string) => item(name).querySelector<HTMLElement>('[data-row-pick]')!
const lines = () => s().project.referenceLines ?? []

beforeEach(() => {
  const a = actions.addReferenceLine(fixture().project, R1)!
  const b = actions.addReferenceLine(a.project, R2)!
  start(b.project)
  useSnapSettings.setState((st) => ({ settings: { ...st.settings, grid: true } }))
})

const rowsOf = (off: string[] = [], project = s().project): LayerRow[] =>
  flatRows(layerTree(project, 'o1', derive(project, 'o1'), { terrain: false, parking: true }, new Set(off)))
const find = (rows: LayerRow[], id: string) => rows.find((r) => r.id === id)

describe('the tree’s rows (pure)', () => {
  it('Reference holds the Grid and the Reference lines row, counted; with no line there is no row', () => {
    const rows = rowsOf()
    expect(find(rows, 'reference')!.children!.map((r) => r.id)).toEqual(['grid', 'reference-lines'])
    expect(find(rows, 'reference-lines')).toMatchObject({ kind: 'reference-lines', label: 'Reference lines', count: 2, eyes: [{ key: REFERENCE_LINES }], top: [REFERENCE_LINES], lock: 'unlocked' })
    const none = rowsOf([], actions.removeReferenceLine(actions.removeReferenceLine(s().project, 'r1'), 'r2'))
    expect(find(none, 'reference-lines')).toBeUndefined()
    expect(find(none, 'reference')!.children!.map((r) => r.id)).toEqual(['grid'])
  })

  it('a project with lines and no grid has the branch too', () => {
    const p = { ...s().project, grid: undefined, options: s().project.options.map((o) => ({ ...o, grid: undefined })) }
    expect(find(rowsOf([], p), 'reference')!.children!.map((r) => r.id)).toEqual(['reference-lines'])
  })

  it('the row reads free, mixed or locked from its lines; its ref holds every line', () => {
    expect(find(rowsOf(), 'reference-lines')!.ref).toMatchObject({ objects: ['r1', 'r2'] })
    const some = actions.lockReferenceLines(s().project, ['r1'], true)
    expect(find(rowsOf([], some), 'reference-lines')!.lock).toBe('mixed')
    const all = actions.lockReferenceLines(s().project, ['r1', 'r2'], true)
    expect(find(rowsOf([], all), 'reference-lines')!.lock).toBe('locked')
  })

  it('a line that is locked or hidden is a child row, named by its place; a free and shown one is not', () => {
    expect(find(rowsOf(), 'reference-lines')!.children).toBeUndefined()
    const locked = actions.lockReferenceLines(s().project, ['r2'], true)
    expect(find(rowsOf([], locked), 'reference-lines')!.children!.map((r) => r.id)).toEqual(['reference-line:r2'])
    expect(find(rowsOf([], locked), 'reference-line:r2')).toMatchObject({ kind: 'reference-line', label: 'Reference line 2', lock: 'locked', ref: { object: 'r2' }, detail: '120 m' })
    const hidden = rowsOf([referenceLine('r1')])
    expect(find(hidden, 'reference-line:r1')).toMatchObject({ label: 'Reference line 1', eyes: [{ key: referenceLine('r1'), via: REFERENCE_LINES }], lock: 'unlocked' })
    // the whole kind hidden is the row's eye, not an exception
    expect(find(rowsOf([REFERENCE_LINES]), 'reference-lines')!.children).toBeUndefined()
  })

  it('the Reference branch’s eye reads the lines’ key alone: the Grid’s switch is its own row’s', () => {
    const branch = find(rowsOf(), 'reference')!
    expect(branch.eyes).toEqual([{ key: REFERENCE_LINES }])
    expect(find(rowsOf(), 'grid')!.eyes).toEqual([{ switch: 'grid' }])
  })
})

describe('the row in the tab', () => {
  it('is under Reference, with its count; its exceptions’ rows are open by default', () => {
    act(() => s().apply((p) => actions.lockReferenceLines(p, ['r2'], true)))
    render(<App />)
    unfold('Reference')
    expect(item('Reference lines')).toBeInTheDocument()
    expect(item('Reference lines').textContent).toContain('2')
    expect(item('Reference line 2')).toBeInTheDocument()
  })

  it('the eye hides every line (the plan loses them) and the branch’s eye does the same; the Grid stays on', () => {
    render(<App />)
    unfold('Reference')
    const grid = useSnapSettings.getState().settings.grid
    expect(pressed(eye('Reference lines'))).toBe('true')
    fireEvent.click(eye('Reference lines'))
    expect(useLayerView.getState().hidden).toEqual([REFERENCE_LINES])
    expect(pressed(eye('Reference lines'))).toBe('false')
    expect(document.querySelector('[data-reference-line]')).toBeNull()
    fireEvent.click(eye('Reference lines'))
    expect(useLayerView.getState().hidden).toEqual([])
    fireEvent.click(eye('Reference'))
    expect(useLayerView.getState().hidden).toEqual([REFERENCE_LINES])
    expect(useSnapSettings.getState().settings.grid).toBe(grid)
  })

  it('a line hidden on its own is a child row with its eye; showing it takes the row away', () => {
    act(() => useLayerView.getState().setHidden([referenceLine('r1')], true))
    render(<App />)
    unfold('Reference')
    expect(pressed(eye('Reference line 1'))).toBe('false')
    expect(document.querySelector('[data-reference-line="r1"]')).toBeNull()
    fireEvent.click(eye('Reference line 1'))
    expect(useLayerView.getState().hidden).toEqual([])
    expect(items('Reference line 1')).toHaveLength(0)
    expect(document.querySelector('[data-reference-line="r1"]')).not.toBeNull()
  })

  it('the padlock locks and frees every line, one undo step each; mixed reads mixed and a click locks all', () => {
    render(<App />)
    unfold('Reference')
    const before = s().history.past.length
    fireEvent.click(padlock('Reference lines'))
    expect(lines().every((l) => l.locked === true)).toBe(true)
    expect(s().history.past).toHaveLength(before + 1)
    expect(pressed(padlock('Reference lines'))).toBe('true')
    fireEvent.click(padlock('Reference lines'))
    expect(lines().some((l) => l.locked)).toBe(false)
    act(() => s().apply((p) => actions.lockReferenceLines(p, ['r1'], true)))
    expect(pressed(padlock('Reference lines'))).toBe('mixed')
    fireEvent.click(padlock('Reference lines'))
    expect(lines().every((l) => l.locked === true)).toBe(true)
    act(() => s().undo())
    expect(lines().filter((l) => l.locked)).toHaveLength(1)
  })

  it('a locked line’s own row has its padlock: it frees that line alone, and the row goes', () => {
    act(() => s().apply((p) => actions.lockReferenceLines(p, ['r1', 'r2'], true)))
    render(<App />)
    unfold('Reference')
    expect(pressed(padlock('Reference line 1'))).toBe('true')
    fireEvent.click(padlock('Reference line 1'))
    expect(lines().find((l) => l.id === 'r1')!.locked).toBeUndefined()
    expect(lines().find((l) => l.id === 'r2')!.locked).toBe(true)
    expect(items('Reference line 1')).toHaveLength(0)
    expect(pressed(padlock('Reference lines'))).toBe('mixed')
  })

  it('On top is the row’s: the guides go over the model, kept per project', () => {
    render(<App />)
    unfold('Reference')
    expect(pressed(top('Reference lines'))).toBe('false')
    fireEvent.click(top('Reference lines'))
    expect(useLayerView.getState().onTop).toEqual([REFERENCE_LINES])
    expect(pressed(top('Reference lines'))).toBe('true')
    // the Reference branch and the Grid have none
    expect(within(item('Reference')).queryByRole('button', { name: /^On top/ })).toBeNull()
    expect(within(item('Grid')).queryByRole('button', { name: /^On top/ })).toBeNull()
  })

  it('On top is one key for the kind: a child row (a locked or hidden line) has none of its own', () => {
    act(() => s().apply((p) => actions.lockReferenceLines(p, ['r1'], true)))
    render(<App />)
    unfold('Reference')
    expect(within(item('Reference line 1')).queryByRole('button', { name: /^On top/ })).toBeNull()
    expect(find(rowsOf(), 'reference-line:r1')?.top).toBeUndefined()
    expect(find(rowsOf(), 'reference-lines')!.top).toEqual([REFERENCE_LINES])
  })

  it('a locked line is picked from its row (the one place that reaches it), and the row reads picked', () => {
    act(() => s().apply((p) => actions.lockReferenceLines(p, ['r1'], true)))
    render(<App />)
    unfold('Reference')
    fireEvent.click(nameOf('Reference line 1'))
    expect(pickedRefs()).toEqual([{ kind: 'reference-line', id: 'r1' }])
    expect(item('Reference line 1')).toHaveAttribute('aria-selected', 'true')
  })

  it('a line picked on the plan marks its row when it is one; the kind’s row is picked as a row', () => {
    render(<App />)
    unfold('Reference')
    fireEvent.click(nameOf('Reference lines'))
    expect(pickedRefs()).toEqual([])
    expect(item('Reference lines')).toHaveAttribute('aria-selected', 'true')
  })

  it('the row’s right-click is the branch menu: Select all reference lines · Hide · Unlock all (when some are locked) · Properties', () => {
    act(() => s().apply((p) => actions.lockReferenceLines(p, ['r1'], true)))
    render(<App />)
    unfold('Reference')
    fireEvent.contextMenu(nameOf('Reference lines'))
    const menu = screen.getByRole('menu', { name: 'Reference lines' })
    expect(within(menu).getAllByRole('menuitem').map((m) => m.textContent)).toEqual(expect.arrayContaining(['Select all reference lines', 'Hide', 'Unlock all', 'Properties']))
    fireEvent.click(within(menu).getByRole('menuitem', { name: /Unlock all/ }))
    expect(lines().some((l) => l.locked)).toBe(false)
  })
})

describe('Properties', () => {
  const props = () => within(screen.getByRole('complementary', { name: 'Layers and properties' })).getByRole('region', { name: 'Properties' })

  it('the row’s: a line of what it is, its count and On top', () => {
    render(<App />)
    unfold('Reference')
    fireEvent.click(nameOf('Reference lines'))
    act(() => useUi.setState({ rail: 'properties' }))
    expect(within(props()).getByText(/guides/i)).toBeInTheDocument()
    expect(within(props()).getByRole('button', { name: 'On top Reference lines' })).toBeInTheDocument()
    expect(props().textContent).not.toContain('next phase')
  })

  it('a line’s: its length, its points, On top and Delete', () => {
    render(<App />)
    act(() => pickedRefsFor('r1'))
    act(() => useUi.setState({ rail: 'properties' }))
    const p = within(props()).getByRole('region', { name: 'Reference line 1' })
    expect(within(p).getByText('150 m')).toBeInTheDocument()
    expect(within(p).getByText('2')).toBeInTheDocument()
    fireEvent.click(within(p).getByRole('button', { name: 'On top Reference lines' }))
    expect(useLayerView.getState().onTop).toEqual([REFERENCE_LINES])
    fireEvent.click(within(p).getByRole('button', { name: 'Delete' }))
    expect(lines().map((l) => l.id)).toEqual(['r2'])
  })

  it('a locked line says so, read-only: Delete is off', () => {
    act(() => s().apply((p) => actions.lockReferenceLines(p, ['r1'], true)))
    render(<App />)
    act(() => pickedRefsFor('r1'))
    act(() => useUi.setState({ rail: 'properties' }))
    const p = within(props()).getByRole('region', { name: 'Reference line 1' })
    expect(within(p).getByText(/Locked/)).toBeInTheDocument()
    expect(within(p).getByRole('button', { name: 'Delete' })).toBeDisabled()
  })
})

const pickedRefsFor = (id: string) => pickRefs([{ kind: 'reference-line', id }])
