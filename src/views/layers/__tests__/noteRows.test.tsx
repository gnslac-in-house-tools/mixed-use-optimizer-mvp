// The notes in Layers (Phase AS.5 task 3, Decision "Notes"): one row, *Notes*, under *Annotations* after *Labels*, with its count (the notes of the levels of the option's buildings, as the
// Dimensions row counts) and its eye (`notes`; one note's own is `note:<id>`) and, as the reference lines' row has, a padlock read from its notes; a note that is locked or hidden is a child
// row under it named by its first words (a row only for the exceptions), with its own padlock and eye, and the row goes when the exception does. Picking a note's row picks the note and,
// when it is on another level, brings the plan to that level (as a dimension's row does). Properties of the row and of a note picked.
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../../App.tsx'
import { derive } from '../../../engine/derive.ts'
import { actions } from '../../../state/actions/index.ts'
import { fixture, s, start } from '../../editing/__tests__/kindsFixture.ts'
import { useUi } from '../../layout/ui.ts'
import { pickedRefs } from '../../plan/mix.ts'
import { note as noteKey, NOTES } from '../keys.ts'
import { useLayerView } from '../layerView.ts'
import { flatRows, layerTree, type LayerRow } from '../tree.ts'

vi.mock('../../scene/Scene.tsx', () => ({ Scene: () => <div data-testid="scene" /> }))

const tree = () => screen.getByRole('tree', { name: 'Layers' })
const items = (name: string) => within(tree()).queryAllByRole('treeitem', { name })
const item = (name: string): HTMLElement => {
  const all = items(name)
  if (!all[0]) throw new Error(`No row "${name}" (rows: ${within(tree()).queryAllByRole('treeitem').map((r) => r.getAttribute('aria-label')).join(', ')})`)
  return all[0]
}
const unfold = (name: string) => fireEvent.click(within(item(name)).getByRole('button', { name: `Unfold ${name}` }))
const padlock = (name: string) => within(item(name)).getByRole('button', { name: `Lock ${name}` })
const eye = (name: string) => within(item(name)).getByRole('button', { name: `Show ${name}` })
const pressed = (b: HTMLElement) => b.getAttribute('aria-pressed')
const nameOf = (name: string) => item(name).querySelector<HTMLElement>('[data-row-pick]')!
const notes = () => s().project.notes ?? []

beforeEach(() => {
  const a = actions.addNote(fixture().project, { x: 30, y: 175 }, 'Loading dock for the trucks, north', 'l1')!
  const b = actions.addNote(a.project, { x: 225, y: 100 }, 'Fire exit', 'l1')!
  start(b.project)
})

const rowsOf = (off: string[] = [], project = s().project): LayerRow[] =>
  flatRows(layerTree(project, 'o1', derive(project, 'o1'), { terrain: false, parking: true }, new Set(off)))
const find = (rows: LayerRow[], id: string) => rows.find((r) => r.id === id)

describe('the tree’s rows (pure)', () => {
  it('Annotations: Dimensions, Labels, Notes, Issues, Rules, Program graph', () => {
    expect(find(rowsOf(), 'annotations')!.children!.map((r) => r.label)).toEqual(['Dimensions', 'Labels', 'Notes', 'Issues', 'Rules', 'Program graph'])
  })

  it('the row counts the notes of the levels of the option’s buildings, with the kind’s eye and its padlock from them', () => {
    expect(find(rowsOf(), 'notes')).toMatchObject({ kind: 'notes', label: 'Notes', count: 2, eyes: [{ key: NOTES }], lock: 'unlocked', ref: { objects: ['t1', 't2'] } })
    expect(find(rowsOf(), 'notes')!.top).toBeUndefined()
    // a note on the level of a building the option does not hold is not counted, nor is its lock
    const other = actions.addBuilding(s().project, {})
    const on = actions.addNote(other.project, { x: 0, y: 0 }, 'Elsewhere', other.levelId)!
    expect(find(rowsOf([], on.project), 'notes')!.count).toBe(2)
    expect(find(rowsOf(), 'notes')!.count).toBe(2)
  })

  it('with no note there is the row all the same, as the Dimensions’ is', () => {
    const none = actions.removeNote(actions.removeNote(s().project, 't1'), 't2')
    expect(find(rowsOf([], none), 'notes')).toMatchObject({ count: 0 })
  })

  it('the row reads free, mixed or locked from its notes', () => {
    const some = actions.lockNotes(s().project, ['t1'], true)
    expect(find(rowsOf([], some), 'notes')!.lock).toBe('mixed')
    const all = actions.lockNotes(s().project, ['t1', 't2'], true)
    expect(find(rowsOf([], all), 'notes')!.lock).toBe('locked')
  })

  it('a note that is locked or hidden is a child row named by its first words; a free and shown one is not', () => {
    expect(find(rowsOf(), 'notes')!.children).toBeUndefined()
    const locked = actions.lockNotes(s().project, ['t1'], true)
    expect(find(rowsOf([], locked), 'notes')!.children!.map((r) => r.id)).toEqual(['note:t1'])
    expect(find(rowsOf([], locked), 'note:t1')).toMatchObject({ kind: 'note', label: 'Loading dock for the…', lock: 'locked', ref: { object: 't1', level: 'l1' } })
    const hidden = rowsOf([noteKey('t2')])
    expect(find(hidden, 'note:t2')).toMatchObject({ label: 'Fire exit', eyes: [{ key: noteKey('t2'), via: NOTES }], lock: 'unlocked' })
    // the whole kind hidden is the row’s eye, not an exception
    expect(find(rowsOf([NOTES]), 'notes')!.children).toBeUndefined()
  })
})

describe('the row in the tab', () => {
  it('is under Annotations after Labels, with its count; its exceptions’ rows are open by default', () => {
    act(() => s().apply((p) => actions.lockNotes(p, ['t2'], true)))
    render(<App />)
    unfold('Annotations')
    const rows = within(tree()).getAllByRole('treeitem').map((r) => r.getAttribute('aria-label'))
    expect(rows.indexOf('Notes')).toBe(rows.indexOf('Labels') + 1)
    expect(item('Notes').textContent).toContain('2')
    expect(item('Fire exit')).toBeInTheDocument()
  })

  it('the eye hides every note (the plan loses them) and shows them again', () => {
    render(<App />)
    unfold('Annotations')
    expect(pressed(eye('Notes'))).toBe('true')
    fireEvent.click(eye('Notes'))
    expect(useLayerView.getState().hidden).toEqual([NOTES])
    expect(document.querySelector('[data-note]')).toBeNull()
    fireEvent.click(eye('Notes'))
    expect(useLayerView.getState().hidden).toEqual([])
    expect(document.querySelector('[data-note="t1"]')).not.toBeNull()
  })

  it('a note hidden on its own is a child row named by its first words, with its eye; showing it takes the row away', () => {
    act(() => useLayerView.getState().setHidden([noteKey('t1')], true))
    render(<App />)
    unfold('Annotations')
    expect(pressed(eye('Loading dock for the…'))).toBe('false')
    expect(document.querySelector('[data-note="t1"]')).toBeNull()
    fireEvent.click(eye('Loading dock for the…'))
    expect(useLayerView.getState().hidden).toEqual([])
    expect(items('Loading dock for the…')).toHaveLength(0)
    expect(document.querySelector('[data-note="t1"]')).not.toBeNull()
  })

  it('the padlock locks and frees every note, one undo step each; mixed reads mixed and a click locks all', () => {
    render(<App />)
    unfold('Annotations')
    const before = s().history.past.length
    fireEvent.click(padlock('Notes'))
    expect(notes().every((n) => n.locked === true)).toBe(true)
    expect(s().history.past).toHaveLength(before + 1)
    expect(pressed(padlock('Notes'))).toBe('true')
    fireEvent.click(padlock('Notes'))
    expect(notes().some((n) => n.locked)).toBe(false)
    act(() => s().apply((p) => actions.lockNotes(p, ['t1'], true)))
    expect(pressed(padlock('Notes'))).toBe('mixed')
    fireEvent.click(padlock('Notes'))
    expect(notes().every((n) => n.locked === true)).toBe(true)
    act(() => s().undo())
    expect(notes().filter((n) => n.locked)).toHaveLength(1)
  })

  it('a locked note’s own row has its padlock: it frees that note alone, and the row goes', () => {
    act(() => s().apply((p) => actions.lockNotes(p, ['t1', 't2'], true)))
    render(<App />)
    unfold('Annotations')
    expect(pressed(padlock('Fire exit'))).toBe('true')
    fireEvent.click(padlock('Fire exit'))
    expect(notes().find((n) => n.id === 't2')!.locked).toBeUndefined()
    expect(notes().find((n) => n.id === 't1')!.locked).toBe(true)
    expect(items('Fire exit')).toHaveLength(0)
    expect(pressed(padlock('Notes'))).toBe('mixed')
  })

  it('a locked note is picked from its row (the one place that reaches it), and the row reads picked', () => {
    act(() => s().apply((p) => actions.lockNotes(p, ['t2'], true)))
    render(<App />)
    unfold('Annotations')
    fireEvent.click(nameOf('Fire exit'))
    expect(pickedRefs()).toEqual([{ kind: 'note', id: 't2' }])
    expect(item('Fire exit')).toHaveAttribute('aria-selected', 'true')
  })

  it('a note on another level, hidden, is picked from its row and the plan goes to its level', () => {
    const up = actions.addLevelAtEnd(s().project, 'above')
    const mass = { programId: 'warehouse', footprint: { kind: 'rect' as const, center: { x: 225, y: 130 }, width: 30, depth: 40, rotation: 0 }, name: 'Roof', height: 14, levelId: up.id }
    const roof = up.id
    act(() => s().apply(() => actions.addNote(actions.addMass(up.project, mass).project, { x: 100, y: 100 }, 'Upstairs', roof)!.project))
    act(() => useLayerView.getState().setHidden([noteKey('t3')], true))
    render(<App />)
    unfold('Annotations')
    expect(s().level).toBe('l1')
    fireEvent.click(nameOf('Upstairs'))
    expect(s().level).toBe(roof)
    expect(pickedRefs()).toEqual([{ kind: 'note', id: 't3' }])
  })

  it('a note picked on the plan marks its row when it is one; the kind’s row is picked as a row', () => {
    render(<App />)
    unfold('Annotations')
    fireEvent.click(nameOf('Notes'))
    expect(pickedRefs()).toEqual([])
    expect(item('Notes')).toHaveAttribute('aria-selected', 'true')
  })

  it('the row’s right-click is the branch menu: Select all notes · Hide · Unlock all (when some are locked) · Properties', () => {
    act(() => s().apply((p) => actions.lockNotes(p, ['t1'], true)))
    render(<App />)
    unfold('Annotations')
    fireEvent.contextMenu(nameOf('Notes'))
    const menu = screen.getByRole('menu', { name: 'Notes' })
    expect(within(menu).getAllByRole('menuitem').map((m) => m.textContent)).toEqual(expect.arrayContaining(['Select all notes', 'Hide', 'Unlock all', 'Properties']))
    fireEvent.click(within(menu).getByRole('menuitem', { name: /Unlock all/ }))
    expect(notes().some((n) => n.locked)).toBe(false)
  })

  // a note on the level of a building another option holds: the project's, not on this option's Notes row
  const farNote = () => {
    const d = actions.duplicateOption(s().project, 'o1')!
    const b = actions.addBuilding(d.project, { optionId: d.id })
    const m = actions.addMass(b.project, { programId: 'warehouse', footprint: { kind: 'rect', center: { x: 100, y: 280 }, width: 30, depth: 20, rotation: 0 }, name: 'Other', height: 14, levelId: b.levelId })
    return actions.addNote(m.project, { x: 0, y: 0 }, 'Elsewhere', b.levelId)!
  }

  it('Unlock all is of the row’s own notes: a locked note of another option’s building does not offer it, and is not unlocked', () => {
    const far = farNote()
    act(() => s().apply(() => actions.lockNotes(far.project, [far.id], true)))
    render(<App />)
    unfold('Annotations')
    fireEvent.contextMenu(nameOf('Notes'))
    expect(within(screen.getByRole('menu', { name: 'Notes' })).queryByRole('menuitem', { name: /Unlock all/ })).toBeNull()
    fireEvent.keyDown(document.body, { key: 'Escape' })
    // with one of its own locked too, Unlock all frees that one and leaves the other
    act(() => s().apply((p) => actions.lockNotes(p, ['t1'], true)))
    fireEvent.contextMenu(nameOf('Notes'))
    fireEvent.click(within(screen.getByRole('menu', { name: 'Notes' })).getByRole('menuitem', { name: /Unlock all/ }))
    expect(notes().find((n) => n.id === 't1')!.locked).toBeFalsy()
    expect(notes().find((n) => n.id === far.id)!.locked).toBe(true)
  })

  it('a note’s own row, locked, has its menu: Delete · Rename · Select all notes · Unlock · Hide · Properties', () => {
    act(() => s().apply((p) => actions.lockNotes(p, ['t2'], true)))
    render(<App />)
    unfold('Annotations')
    fireEvent.contextMenu(nameOf('Fire exit'))
    const menu = screen.getByRole('menu', { name: 'Fire exit' })
    // each row's label, then its key (Delete Del, Rename F2…)
    const rows = within(menu).getAllByRole('menuitem').map((m) => m.textContent ?? '')
    expect(['Delete', 'Rename', 'Select all notes', 'Unlock', 'Hide', 'Properties'].map((label) => rows.some((r) => r.startsWith(label)))).toEqual([true, true, true, true, true, true])
  })
})

describe('Properties', () => {
  const props = () => within(screen.getByRole('complementary', { name: 'Layers and properties' })).getByRole('region', { name: 'Properties' })

  it('the row’s: a line of what it is, and its count', () => {
    render(<App />)
    unfold('Annotations')
    fireEvent.click(nameOf('Notes'))
    act(() => useUi.setState({ rail: 'properties' }))
    expect(within(props()).getByText(/text placed on the plan/i)).toBeInTheDocument()
    expect(within(props()).getByText('Count')).toBeInTheDocument()
    expect(within(props()).getByText('2')).toBeInTheDocument()
  })

  it('a note’s own row opens its card: its text, its size and Delete', () => {
    act(() => s().apply((p) => actions.lockNotes(p, ['t2'], true)))
    render(<App />)
    unfold('Annotations')
    fireEvent.click(nameOf('Fire exit'))
    act(() => useUi.setState({ rail: 'properties' }))
    expect(within(props()).getByRole('textbox', { name: 'Text' })).toHaveValue('Fire exit')
    expect(within(props()).getByRole('group', { name: 'Size' })).toBeInTheDocument()
  })
})
