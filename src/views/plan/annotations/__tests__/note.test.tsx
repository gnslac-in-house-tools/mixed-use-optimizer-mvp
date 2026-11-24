// The note on the plan (Phase AS.5 task 3, Decision "Notes"): a text placed with the tool `Shift+T` (a click places a note reading *Note*, picks it and opens Properties with its
// text selected; the tool lets go after one), drawn as the plan's labels are (12 px at any zoom, *Small* 10, *Large* 16, ink on the panel's halo, left-aligned from its point, a
// line per line of its text, at its angle), seen on its level only, picked as a dimension is (a click, Shift+click, the window by its extent), dragged, deleted, moved, copied and
// turned by the tools. Its text is its name: F2, the menu's Rename and a double click select it in Properties, where it is saved when the field is left. Hidden: not drawn, not
// picked. Locked: seen with the lock's glyph, not picked (the notice), no menu, no drag. It attracts no snap. Through `<App />`, as the reference line's tests drive it.
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../../../App.tsx'
import { derive } from '../../../../engine/derive.ts'
import { LOCKED } from '../../../../model/picked.ts'
import type { Point } from '../../../../model/schema.ts'
import { actions } from '../../../../state/actions/index.ts'
import { runCommand } from '../../../commands/index.ts'
import { at, fixture, plan, press, s, start, toast, WHOLE } from '../../../editing/__tests__/kindsFixture.ts'
import { leaf, shape } from '../../../editing/menu/__tests__/helpers.ts'
import { menuFor } from '../../../editing/menu/build.ts'
import { NOTES } from '../../../layers/keys.ts'
import { useLayerView } from '../../../layers/layerView.ts'
import { useUi } from '../../../layout/ui.ts'
import { fit, UNMEASURED_SIZE } from '../../camera.ts'
import { useCommand } from '../../command/commandState.ts'
import { pickedNow, pickedRefs, pickRefs, selectBox } from '../../mix.ts'
import { snapLevels } from '../../reference.ts'
import { sourcesFor } from '../../snap/sources.ts'
import { useTool } from '../../tools/toolState.ts'
import { useAnnotations } from '../annotationState.ts'

vi.mock('../../../scene/Scene.tsx', () => ({ Scene: () => <div data-testid="scene" /> }))

const free = { shiftKey: true }
const SCALE = fit({ minX: 0, minY: -15, maxX: 440, maxY: 280 }, UNMEASURED_SIZE).scale
const capture = () => document.querySelector('[data-tool] > [data-capture]')!
const click = (q: Point, extra: object = {}) => {
  fireEvent.pointerMove(capture(), at(q, extra))
  fireEvent.pointerDown(capture(), at(q, extra))
  fireEvent.pointerUp(capture(), at(q, extra))
}
const key = (k: string, extra: object = {}) => fireEvent.keyDown(window, { key: k, ...extra })
const notes = () => s().project.notes ?? []
const note = (id: string) => notes().find((n) => n.id === id)!
const steps = () => s().history.past.length
const noteEl = (id: string) => document.querySelector<SVGElement>(`[data-note="${id}"]`)!
const t = (id: string) => ({ kind: 'note', id })
const commandLine = () => screen.getByRole('textbox', { name: 'Command line' })
const props = () => within(screen.getByRole('complementary', { name: 'Layers and properties' })).getByRole('region', { name: 'Properties' })
const field = () => within(props()).getByRole('textbox', { name: 'Text' }) as HTMLTextAreaElement
/** A level above the first one, in the project (a level with no mass is tidied away, so it holds one): its id. */
const addRoof = (): string => {
  const roof = actions.addLevelAtEnd(s().project, 'above')
  const mass = { programId: 'warehouse', footprint: { kind: 'rect' as const, center: { x: 225, y: 130 }, width: 30, depth: 40, rotation: 0 }, name: 'Roof', height: 14, levelId: roof.id }
  act(() => s().apply(() => actions.addMass(roof.project, mass).project))
  return roof.id
}
const lines = (id: string) => [...noteEl(id).querySelectorAll('tspan')].map((x) => x.textContent)

/** A note under the first warehouse (t1) and one in the corridor between the two, turned a quarter (t2): free ground, clear of the fixture's streets and lots. */
const N1 = { x: 30, y: 175 }
const N2 = { x: 225, y: 100 }
const withNotes = () => {
  const a = actions.addNote(fixture().project, N1, 'Loading dock', 'l1')!
  const b = actions.addNote(a.project, N2, 'Fire exit\nsecond door', 'l1', { angle: 90 })!
  start(b.project)
}

beforeEach(() => {
  start()
  useCommand.setState({ registration: null, angle: null, cursor: null })
})

describe('the tool Shift+T', () => {
  it('takes the tool, shows it in the strip’s Annotations; T alone is still the Ruler; the same key lets it go', () => {
    render(<App />)
    key('T', { shiftKey: true })
    expect(useTool.getState().tool).toBe('note')
    expect(screen.getByRole('button', { name: 'Note' })).toHaveAttribute('aria-pressed', 'true')
    key('T', { shiftKey: true })
    expect(useTool.getState().tool).toBe('select')
    key('t')
    expect(useTool.getState().tool).toBe('select')
    expect(screen.getByRole('button', { name: 'Ruler' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('a click places a note reading Note on the level in view, picks it, and the tool lets go: one undo step', () => {
    render(<App />)
    key('T', { shiftKey: true })
    const before = steps()
    click({ x: 60, y: 190 }, free)
    expect(notes()).toEqual([{ id: 't1', levelId: 'l1', at: { x: 60, y: 190 }, text: 'Note' }])
    expect(steps()).toBe(before + 1)
    expect(pickedRefs()).toEqual([t('t1')])
    expect(useTool.getState().tool).toBe('select')
    act(() => s().undo())
    expect(notes()).toHaveLength(0)
  })

  it('opens Properties with its text selected and the focus there, so typing replaces it', () => {
    render(<App />)
    key('T', { shiftKey: true })
    click({ x: 60, y: 190 }, free)
    expect(useUi.getState().rail).toBe('properties')
    expect(field()).toHaveValue('Note')
    expect(document.activeElement).toBe(field())
    expect(field().selectionStart).toBe(0)
    expect(field().selectionEnd).toBe(4)
  })

  it('is placed on the level in view, and shows the notes again if an eye had hidden them', () => {
    const roof = addRoof()
    act(() => s().setLevel(roof))
    act(() => useLayerView.getState().setHidden([NOTES], true))
    render(<App />)
    key('T', { shiftKey: true })
    click({ x: 60, y: 190 }, free)
    expect(notes()[0].levelId).toBe(roof)
    expect(useLayerView.getState().hidden).not.toContain(NOTES)
    expect(noteEl('t1')).not.toBeNull()
  })

  it('the command line takes a typed point; Escape leaves the tool without a note', () => {
    render(<App />)
    key('T', { shiftKey: true })
    expect(screen.getByRole('group', { name: 'Command' })).toHaveTextContent('Note')
    fireEvent.change(commandLine(), { target: { value: '120,190' } })
    fireEvent.keyDown(commandLine(), { key: 'Enter' })
    expect(notes().map((n) => n.at)).toEqual([{ x: 120, y: 190 }])
    expect(pickedRefs()).toEqual([t('t1')])
    expect(useTool.getState().tool).toBe('select')
    key('T', { shiftKey: true })
    key('Escape')
    expect(useTool.getState().tool).toBe('select')
    expect(notes()).toHaveLength(1)
  })

  it('does not fire while a field is typed in: Shift+T, a tool’s key and Delete are the text field’s', () => {
    render(<App />)
    key('T', { shiftKey: true })
    click({ x: 60, y: 190 }, free)
    fireEvent.keyDown(field(), { key: 'T', shiftKey: true })
    expect(useTool.getState().tool).toBe('select')
    fireEvent.keyDown(field(), { key: 'm' })
    expect(useTool.getState().tool).toBe('select')
    fireEvent.keyDown(field(), { key: 'Delete' })
    expect(notes()).toHaveLength(1)
  })
})

describe('its text, in Properties', () => {
  it('is saved when the field is left, one undo step however much was typed; Undo brings the old text back', () => {
    render(<App />)
    key('T', { shiftKey: true })
    click({ x: 60, y: 190 }, free)
    const before = steps()
    fireEvent.change(field(), { target: { value: 'L' } })
    fireEvent.change(field(), { target: { value: 'Loading' } })
    fireEvent.change(field(), { target: { value: 'Loading dock' } })
    expect(note('t1').text).toBe('Note')
    expect(steps()).toBe(before)
    fireEvent.blur(field())
    expect(note('t1').text).toBe('Loading dock')
    expect(steps()).toBe(before + 1)
    act(() => s().undo())
    expect(note('t1').text).toBe('Note')
  })

  it('Enter in the field is a new line, not a command and not a save; leaving the field saves, a line per line', () => {
    render(<App />)
    key('T', { shiftKey: true })
    click({ x: 60, y: 190 }, free)
    const project = s().project
    expect(fireEvent.keyDown(field(), { key: 'Enter' })).toBe(true)
    expect(s().project).toBe(project)
    fireEvent.change(field(), { target: { value: 'Loading\ndock' } })
    expect(s().project).toBe(project)
    fireEvent.blur(field())
    expect(note('t1').text).toBe('Loading\ndock')
    expect(lines('t1')).toEqual(['Loading', 'dock'])
  })

  it('leaving it as it was, or blank, changes nothing: a note is deleted, not blanked', () => {
    render(<App />)
    key('T', { shiftKey: true })
    click({ x: 60, y: 190 }, free)
    const before = steps()
    fireEvent.blur(field())
    fireEvent.change(field(), { target: { value: '   ' } })
    fireEvent.blur(field())
    expect(note('t1').text).toBe('Note')
    expect(steps()).toBe(before)
    expect(field()).toHaveValue('Note')
  })

  it('Escape drops what was typed', () => {
    render(<App />)
    key('T', { shiftKey: true })
    click({ x: 60, y: 190 }, free)
    const before = steps()
    fireEvent.change(field(), { target: { value: 'Never mind' } })
    fireEvent.keyDown(field(), { key: 'Escape' })
    fireEvent.blur(field())
    expect(note('t1').text).toBe('Note')
    expect(steps()).toBe(before)
  })

  it('what was typed is saved too when the pick goes before the field is left (a click on the plan)', () => {
    render(<App />)
    key('T', { shiftKey: true })
    click({ x: 60, y: 190 }, free)
    fireEvent.change(field(), { target: { value: 'Loading dock' } })
    act(() => pickRefs([]))
    expect(note('t1').text).toBe('Loading dock')
  })

  it('its size is Small, Medium or Large (Medium is no size at all); its angle is read-only; Delete removes it', () => {
    withNotes()
    render(<App />)
    act(() => pickRefs([t('t2')]))
    act(() => useUi.setState({ rail: 'properties' }))
    const size = within(props()).getByRole('group', { name: 'Size' })
    expect(within(size).getByRole('button', { name: 'Medium' })).toHaveAttribute('aria-pressed', 'true')
    const before = steps()
    fireEvent.click(within(size).getByRole('button', { name: 'Large' }))
    expect(note('t2').size).toBe('large')
    expect(steps()).toBe(before + 1)
    fireEvent.click(within(size).getByRole('button', { name: 'Small' }))
    expect(note('t2').size).toBe('small')
    fireEvent.click(within(size).getByRole('button', { name: 'Medium' }))
    expect(note('t2')).not.toHaveProperty('size')
    expect(within(props()).getByText('90°')).toBeInTheDocument()
    expect(within(props()).queryByRole('spinbutton', { name: /angle/i })).toBeNull()
    fireEvent.click(within(props()).getByRole('button', { name: 'Delete' }))
    expect(notes().map((n) => n.id)).toEqual(['t1'])
    expect(pickedRefs()).toEqual([])
  })
})

describe('what is drawn', () => {
  beforeEach(withNotes)

  it('a line per line of its text, left-aligned from its point, ink on the panel’s halo, at its angle', () => {
    render(<App />)
    expect(lines('t1')).toEqual(['Loading dock'])
    expect(lines('t2')).toEqual(['Fire exit', 'second door'])
    const text = noteEl('t1').querySelector('text')!
    expect(text).toHaveAttribute('fill', 'var(--ink)')
    expect(text).toHaveAttribute('stroke', 'var(--panel)')
    expect(text).toHaveAttribute('paint-order', 'stroke')
    expect(text).not.toHaveAttribute('text-anchor', 'middle')
    expect(text).toHaveAttribute('x', String(N1.x))
    expect(text).toHaveAttribute('y', String(-N1.y))
    expect(text).not.toHaveAttribute('transform')
    // a quarter turn counter-clockwise: the plan's y is flipped, so the SVG turns the other way
    expect(noteEl('t2').querySelector('text')!.getAttribute('transform')).toMatch(/^rotate\(-90 /)
  })

  it('is the same size on screen at any zoom: 12 px, Small 10, Large 16', () => {
    act(() => s().apply((p) => actions.setNoteSize(actions.setNoteSize(p, 't1', 'small'), 't2', 'large')))
    act(() => s().apply((p) => actions.addNote(p, { x: 100, y: 190 }, 'Middle', 'l1')!.project))
    render(<App />)
    const px = (id: string) => Number(noteEl(id).querySelector('text')!.getAttribute('font-size')) * SCALE
    expect(px('t1')).toBeCloseTo(10, 4)
    expect(px('t2')).toBeCloseTo(16, 4)
    expect(px('t3')).toBeCloseTo(12, 4)
  })

  it('is seen on its level only, and in no layer of All levels', () => {
    const roof = addRoof()
    render(<App />)
    expect(noteEl('t1')).not.toBeNull()
    act(() => s().setLevel(roof))
    expect(noteEl('t1')).toBeNull()
    act(() => s().setLevel('l1'))
    act(() => s().setShowAll(true))
    expect(noteEl('t1')).toBeNull()
    expect(pickedNow().notes).toEqual([])
  })

  it('is drawn over the masses, with the dimensions', () => {
    render(<App />)
    const after = (a: Element, b: Element) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)
    expect(after(plan().querySelector('[data-mass]')!, noteEl('t1'))).toBe(true)
  })

  it('attracts no snap: the plan’s sources are the same with or without it', () => {
    const p = s().project
    const bare = { ...p, notes: [] }
    const levels = snapLevels()
    expect(sourcesFor(p, derive(p, 'o1'), null, levels)).toEqual(sourcesFor(bare, derive(bare, 'o1'), null, levels))
  })
})

describe('picked on the plan', () => {
  beforeEach(withNotes)

  it('a click picks it alone (it reads picked), Shift+click adds the other and takes it out again', () => {
    render(<App />)
    press(noteEl('t1'), N1)
    expect(pickedRefs()).toEqual([t('t1')])
    expect(noteEl('t1')).toHaveAttribute('aria-selected', 'true')
    press(noteEl('t2'), N2, { shiftKey: true })
    expect(pickedRefs()).toEqual([t('t1'), t('t2')])
    press(noteEl('t1'), N1, { shiftKey: true })
    expect(pickedRefs()).toEqual([t('t2')])
    act(() => pickRefs([{ kind: 'mass', id: 'm1' }]))
    expect(pickedRefs()).toEqual([{ kind: 'mass', id: 'm1' }])
  })

  it('picked beside a mass with Shift+click; a plain click on a mass lets it go', () => {
    render(<App />)
    act(() => pickRefs([{ kind: 'mass', id: 'm3' }]))
    press(noteEl('t1'), N1, { shiftKey: true })
    expect(pickedRefs()).toEqual([{ kind: 'mass', id: 'm3' }, t('t1')])
    expect(pickedNow().notes).toEqual(['t1'])
    act(() => s().select('m1'))
    expect(pickedNow().notes).toEqual([])
  })

  it('the window takes it when it holds its whole text, the crossing when it touches it; unmeasured, it is its point', () => {
    render(<App />)
    const px = 1 / SCALE
    const picked = () => pickedRefs().filter((x) => x.kind === 'note')
    // the text of t1 runs right from its point: 12 characters at 12 px, 40 m or so at this zoom
    act(() => selectBox({ a: { x: N1.x - 5, y: N1.y - 15 }, b: { x: N1.x + 120, y: N1.y + 15 } }, false, px))
    expect(picked()).toEqual([t('t1')])
    // a window that holds its point and not the rest of the text takes nothing; the crossing box takes it
    act(() => selectBox({ a: { x: N1.x - 1, y: N1.y - 3 }, b: { x: N1.x + 10, y: N1.y + 3 } }, false, px))
    expect(picked()).toEqual([])
    act(() => selectBox({ a: { x: N1.x + 10, y: N1.y + 3 }, b: { x: N1.x - 1, y: N1.y - 3 } }, false, px))
    expect(picked()).toEqual([t('t1')])
    // the plan did not say its zoom: the note is its point
    act(() => selectBox({ a: { x: N1.x - 1, y: N1.y - 3 }, b: { x: N1.x + 10, y: N1.y + 3 } }, false))
    expect(picked()).toEqual([t('t1')])
    // Shift keeps what was picked, and the window brings the other
    act(() => selectBox({ a: { x: N2.x - 60, y: N2.y - 60 }, b: { x: N2.x + 60, y: N2.y + 60 } }, true, px))
    expect(picked()).toEqual([t('t1'), t('t2')])
  })

  it('Delete removes what is picked in one undo step, and Undo brings it back', () => {
    render(<App />)
    act(() => pickRefs([t('t1')]))
    const before = steps()
    act(() => void runCommand('edit.delete'))
    expect(notes().map((n) => n.id)).toEqual(['t2'])
    expect(steps()).toBe(before + 1)
    expect(pickedRefs()).toEqual([])
    act(() => s().undo())
    expect(notes().map((n) => n.id)).toEqual(['t1', 't2'])
  })

  it('a note picked is let go when Undo takes it away', () => {
    render(<App />)
    act(() => pickRefs([t('t2')]))
    act(() => s().apply((p) => actions.removeNote(p, 't2')))
    expect(pickedRefs()).toEqual([])
  })
})

describe('moved, dragged', () => {
  beforeEach(withNotes)

  it('the Move tool moves it with a mass picked beside it: one undo step, both stay picked', () => {
    render(<App />)
    act(() => pickRefs([{ kind: 'mass', id: 'm3' }, t('t1')]))
    key('m')
    expect(useTool.getState().tool).toBe('move')
    const before = steps()
    click({ x: 10, y: 10 }, free)
    click({ x: 30, y: 20 }, free)
    expect(note('t1').at).toEqual({ x: N1.x + 20, y: N1.y + 10 })
    expect(note('t2').at).toEqual(N2)
    expect(steps()).toBe(before + 1)
    expect(pickedRefs()).toEqual([{ kind: 'mass', id: 'm3' }, t('t1')])
    act(() => s().undo())
    expect(note('t1').at).toEqual(N1)
  })

  it('the Copy tool leaves it and makes a new note with its text, angle and size, unlocked', () => {
    render(<App />)
    act(() => pickRefs([t('t2')]))
    key('c')
    click({ x: 10, y: 10 }, free)
    click({ x: 40, y: 10 }, free)
    key('Enter')
    expect(notes()).toHaveLength(3)
    expect(notes()[2]).toMatchObject({ text: 'Fire exit\nsecond door', angle: 90, at: { x: N2.x + 30, y: N2.y } })
    expect(notes()[2].locked).toBeUndefined()
    expect(note('t2').at).toEqual(N2)
  })

  it('the Rotate tool turns it about the pivot, its angle following', () => {
    render(<App />)
    act(() => pickRefs([t('t1')]))
    key('r')
    click({ x: 30, y: 170 }, free) // the pivot
    click({ x: 80, y: 170 }, free) // the start of the turn
    click({ x: 30, y: 220 }, free) // 90° counter-clockwise
    expect(note('t1').at.x).toBeCloseTo(30 - 5, 6)
    expect(note('t1').at.y).toBeCloseTo(170, 6)
    expect(note('t1').angle).toBeCloseTo(90, 6)
  })

  it('a drag of its body moves it, snapped or free (Shift), as one undo step', () => {
    render(<App />)
    const before = steps()
    fireEvent.pointerDown(noteEl('t1'), at(N1))
    fireEvent.pointerMove(plan(), at({ x: 30, y: 195 }, free))
    fireEvent.pointerUp(plan(), at({ x: 30, y: 195 }, free))
    expect(note('t1').at).toEqual({ x: N1.x, y: N1.y + 20 })
    expect(steps()).toBe(before + 1)
    expect(pickedRefs()).toEqual([t('t1')])
    act(() => s().undo())
    expect(note('t1').at).toEqual(N1)
  })

  it('a press that does not move picks it and changes nothing; Escape in the middle of a drag cancels it', () => {
    render(<App />)
    const project = s().project
    press(noteEl('t1'), N1)
    expect(s().project).toBe(project)
    fireEvent.pointerDown(noteEl('t2'), at(N2))
    fireEvent.pointerMove(plan(), at({ x: 245, y: 100 }, free))
    expect(note('t2').at.x).toBe(245)
    key('Escape')
    expect(note('t2').at).toEqual(N2)
  })
})

describe('its text is its name', () => {
  beforeEach(withNotes)

  const selected = () => {
    expect(useUi.getState().rail).toBe('properties')
    expect(document.activeElement).toBe(field())
    expect(field().selectionStart).toBe(0)
    expect(field().selectionEnd).toBe(field().value.length)
  }

  it('F2 opens Properties with its text selected', () => {
    render(<App />)
    act(() => pickRefs([t('t1')]))
    expect(useUi.getState().rail).toBe('layers')
    key('F2')
    selected()
    expect(field()).toHaveValue('Loading dock')
  })

  it('the menu’s Rename does the same', () => {
    render(<App />)
    act(() => pickRefs([t('t2')]))
    expect(leaf(menuFor(pickedRefs(), 'plan', null), 'rename')).toMatchObject({ label: 'Rename', detail: 'F2', disabled: false })
    act(() => leaf(menuFor(pickedRefs(), 'plan', null), 'rename').onSelect())
    selected()
    expect(field()).toHaveValue('Fire exit\nsecond door')
  })

  it('a double click on it picks it and selects its text', () => {
    render(<App />)
    fireEvent.doubleClick(noteEl('t1'), at(N1))
    expect(pickedRefs()).toEqual([t('t1')])
    selected()
  })

  it('a locked note cannot be renamed: the row is greyed with the reason', () => {
    act(() => s().apply((p) => actions.lockNotes(p, ['t1'], true)))
    render(<App />)
    act(() => pickRefs([t('t1')]))
    expect(leaf(menuFor(pickedRefs(), 'plan', null), 'rename')).toMatchObject({ disabled: true })
  })
})

describe('its menu', () => {
  beforeEach(withNotes)

  it('is in the user’s order: Group · Ungroup · Delete · Rename · Select all notes, Lock, Hide · Properties', () => {
    act(() => pickRefs([t('t1')]))
    expect(shape(menuFor(pickedRefs(), 'plan', null))).toEqual(['Group', 'Ungroup', '|', 'Delete', '|', 'Rename', 'Select all notes', 'Lock', 'Hide', '|', 'Properties'])
  })

  it('Select all picks every note of the level in view that is neither locked nor hidden', () => {
    act(() => s().apply((p) => actions.lockNotes(p, ['t2'], true)))
    act(() => pickRefs([t('t1')]))
    act(() => leaf(menuFor(pickedRefs(), 'plan', null), 'select-all').onSelect())
    expect(pickedRefs()).toEqual([t('t1')])
    act(() => s().apply((p) => actions.lockNotes(p, ['t2'], false)))
    act(() => leaf(menuFor(pickedRefs(), 'plan', null), 'select-all').onSelect())
    expect(pickedRefs()).toEqual([t('t1'), t('t2')])
  })

  it('Lock locks it (one undo step) and lets it go; Unlock frees it; Hide hides it and lets it go, Show brings it back', () => {
    act(() => pickRefs([t('t1')]))
    const before = steps()
    act(() => leaf(menuFor(pickedRefs(), 'plan', null), 'lock').onSelect())
    expect(note('t1').locked).toBe(true)
    expect(steps()).toBe(before + 1)
    expect(pickedRefs()).toEqual([])
    act(() => pickRefs([t('t1')]))
    expect(leaf(menuFor(pickedRefs(), 'plan', null), 'lock').label).toBe('Unlock')
    act(() => leaf(menuFor(pickedRefs(), 'plan', null), 'lock').onSelect())
    expect(note('t1').locked).toBeUndefined()
    act(() => pickRefs([t('t1')]))
    act(() => leaf(menuFor(pickedRefs(), 'plan', null), 'hide').onSelect())
    expect(useLayerView.getState().hidden).toEqual(['note:t1'])
    expect(pickedRefs()).toEqual([])
    expect(leaf(menuFor([t('t1')], 'layers', null), 'hide').label).toBe('Show')
  })

  it('a right-click on it picks it first and opens its menu', () => {
    render(<App />)
    fireEvent.contextMenu(noteEl('t2'), at(N2, { button: 2 }))
    expect(pickedRefs()).toEqual([t('t2')])
    expect(screen.getByRole('menu', { name: 'Fire exit' })).toBeInTheDocument()
  })

  it('a right-click with a tool in hand finds it under the pointer by its place', () => {
    render(<App />)
    key('T', { shiftKey: true })
    fireEvent.contextMenu(capture(), at({ x: N2.x + 2, y: N2.y }, { button: 2 }))
    expect(useTool.getState().tool).toBe('select')
    expect(pickedRefs()).toEqual([t('t2')])
  })
})

describe('hidden', () => {
  beforeEach(withNotes)

  it('by its own eye or its kind’s it is not drawn, not picked by the window, and let go if it was picked', () => {
    render(<App />)
    act(() => pickRefs([t('t1'), t('t2')]))
    act(() => useLayerView.getState().setHidden(['note:t1'], true))
    expect(noteEl('t1')).toBeNull()
    expect(noteEl('t2')).not.toBeNull()
    expect(pickedRefs()).toEqual([t('t2')])
    act(() => selectBox({ a: WHOLE.a, b: WHOLE.b }, false, 1 / SCALE))
    expect(pickedRefs().filter((x) => x.kind === 'note')).toEqual([t('t2')])
    act(() => useLayerView.getState().setHidden([NOTES], true))
    expect(noteEl('t2')).toBeNull()
    expect(pickedRefs().filter((x) => x.kind === 'note')).toEqual([])
  })

  it('its key is dropped when the note goes: the next one placed is not born hidden', () => {
    act(() => useLayerView.getState().setHidden(['note:t2'], true))
    act(() => s().apply((p) => actions.removeNote(p, 't2')))
    expect(useLayerView.getState().hidden).toEqual([])
  })
})

describe('locked: seen, not picked', () => {
  beforeEach(() => {
    withNotes()
    act(() => s().apply((p) => actions.lockNotes(p, ['t1'], true)))
  })

  it('is drawn with the lock’s glyph; a free one has none', () => {
    render(<App />)
    expect(noteEl('t1')).not.toBeNull()
    expect(document.querySelector('[data-lock="note:t1"]')).not.toBeNull()
    expect(document.querySelector('[data-lock="note:t2"]')).toBeNull()
  })

  it('a click picks nothing and shows the notice; a free one is picked as ever', () => {
    render(<App />)
    press(noteEl('t1'), N1)
    expect(pickedRefs()).toEqual([])
    expect(toast()).toBe(LOCKED)
    act(() => void 0)
    press(noteEl('t2'), N2)
    expect(pickedRefs()).toEqual([t('t2')])
  })

  it('Shift+click does not add it, the window and Select all skip it, and a drag from it is not a drag of the note', () => {
    render(<App />)
    act(() => pickRefs([t('t2')]))
    press(noteEl('t1'), N1, { shiftKey: true })
    expect(pickedRefs()).toEqual([t('t2')])
    act(() => selectBox({ a: WHOLE.a, b: WHOLE.b }, false, 1 / SCALE))
    expect(pickedRefs().filter((x) => x.kind === 'note')).toEqual([t('t2')])
    const before = s().project
    fireEvent.pointerDown(noteEl('t1'), at(N1))
    fireEvent.pointerMove(plan(), at({ x: 30, y: 195 }, free))
    fireEvent.pointerUp(plan(), at({ x: 30, y: 195 }, free))
    expect(s().project).toBe(before)
  })

  it('a double click on it renames nothing', () => {
    render(<App />)
    fireEvent.doubleClick(noteEl('t1'), at(N1))
    expect(pickedRefs()).toEqual([])
    expect(useUi.getState().rail).toBe('layers')
  })

  it('a right-click on it shows the notice, picks nothing and opens no menu', () => {
    render(<App />)
    fireEvent.contextMenu(noteEl('t1'), at(N1, { button: 2 }))
    expect(pickedRefs()).toEqual([])
    expect(toast()).toBe(LOCKED)
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('becoming locked while picked lets it go', () => {
    render(<App />)
    act(() => pickRefs([t('t2')]))
    act(() => s().apply((p) => actions.lockNotes(p, ['t2'], true)))
    expect(useAnnotations.getState().notes).toEqual([])
  })

  it('its Properties are read-only and say so; Delete is greyed with the reason, and the verb refuses', () => {
    render(<App />)
    act(() => pickRefs([t('t1')]))
    act(() => useUi.setState({ rail: 'properties' }))
    expect(within(props()).getByText(/Locked/)).toBeInTheDocument()
    expect(field()).toBeDisabled()
    expect(within(props()).getByRole('button', { name: 'Delete' })).toBeDisabled()
    expect(leaf(menuFor(pickedRefs(), 'layers', null), 'delete')).toMatchObject({ disabled: true })
    act(() => void runCommand('edit.delete'))
    expect(notes()).toHaveLength(2)
  })
})
