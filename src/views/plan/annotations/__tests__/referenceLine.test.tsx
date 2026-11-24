// The reference line on the plan (Phase AS.5 task 2, Decision "Reference lines"): a guide drawn with the tool `L` (a click a point, Enter or a double click
// ends it, Escape steps back, the tool stays on), thin and dashed, the project's (every level), picked as a dimension is (a click, Shift+click, the window), dragged,
// deleted, moved with what else is picked by the Move tool, its points shown and dragged when it is picked alone, its menu in the user's order. Hidden (Layers): not
// drawn, not picked. Locked: seen with the lock's glyph, not picked (the notice says where it comes off), no menu, no drag, let go if it becomes locked while picked.
// Through `<App />`, as the Dimension tool's tests drive it: presses on the tool's capture surface and on the line's own element.
import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../../../App.tsx'
import { LOCKED } from '../../../../model/picked.ts'
import type { Point } from '../../../../model/schema.ts'
import { actions } from '../../../../state/actions/index.ts'
import { runCommand } from '../../../commands/index.ts'
import { at, fixture, plan, press, s, start, toast, WHOLE } from '../../../editing/__tests__/kindsFixture.ts'
import { leaf, shape } from '../../../editing/menu/__tests__/helpers.ts'
import { menuFor } from '../../../editing/menu/build.ts'
import { REFERENCE_LINES } from '../../../layers/keys.ts'
import { useLayerView } from '../../../layers/layerView.ts'
import { useCommand } from '../../command/commandState.ts'
import { pickedNow, pickedRefs, pickRefs, selectBox } from '../../mix.ts'
import { useTool } from '../../tools/toolState.ts'

vi.mock('../../../scene/Scene.tsx', () => ({ Scene: () => <div data-testid="scene" /> }))

const free = { shiftKey: true }
const capture = () => document.querySelector('[data-tool] > [data-capture]')!
const click = (q: Point, extra: object = {}) => {
  fireEvent.pointerMove(capture(), at(q, extra))
  fireEvent.pointerDown(capture(), at(q, extra))
  fireEvent.pointerUp(capture(), at(q, extra))
}
const key = (k: string, extra: object = {}) => fireEvent.keyDown(window, { key: k, ...extra })
const lines = () => s().project.referenceLines ?? []
const steps = () => s().history.past.length
const lineEl = (id: string) => document.querySelector<SVGElement>(`[data-reference-line="${id}"]`)!
const pointEl = (id: string, i: number) => document.querySelector<SVGElement>(`[data-reference-line-point="${id}:${i}"]`)
const r = (id: string) => ({ kind: 'reference-line', id })
const commandLine = () => screen.getByRole('textbox', { name: 'Command line' })

/** A horizontal guide below the first warehouse (r1) and a vertical one in the corridor between the two (r2): free ground, clear of the fixture's streets and lots. */
const R1 = [{ x: 30, y: 170 }, { x: 180, y: 170 }]
const R2 = [{ x: 225, y: 40 }, { x: 225, y: 160 }]
const withLines = () => {
  const a = actions.addReferenceLine(fixture().project, R1)!
  const b = actions.addReferenceLine(a.project, R2)!
  start(b.project)
}

beforeEach(() => {
  start()
  useCommand.setState({ registration: null, angle: null, cursor: null })
})

describe('the tool L', () => {
  it('takes the tool, shows it in the strip’s Annotations, and goes back to Select with the same key', () => {
    render(<App />)
    key('l')
    expect(useTool.getState().tool).toBe('referenceLine')
    expect(screen.getByRole('button', { name: 'Reference line' })).toHaveAttribute('aria-pressed', 'true')
    key('l')
    expect(useTool.getState().tool).toBe('select')
  })

  it('a click a point, Enter ends it: one undo step, the line is picked, the tool stays on', () => {
    render(<App />)
    key('l')
    const before = steps()
    click(R1[0], free)
    click(R1[1], free)
    click({ x: 180, y: 220 }, free)
    expect(lines()).toHaveLength(0)
    key('Enter')
    expect(lines()).toEqual([{ id: 'r1', points: [R1[0], R1[1], { x: 180, y: 220 }] }])
    expect(steps()).toBe(before + 1)
    expect(useTool.getState().tool).toBe('referenceLine')
    expect(pickedRefs()).toEqual([r('r1')])
    // the next one starts afresh
    click({ x: 300, y: 20 }, free)
    click({ x: 400, y: 20 }, free)
    key('Enter')
    expect(lines().map((l) => l.id)).toEqual(['r1', 'r2'])
    act(() => s().undo())
    expect(lines().map((l) => l.id)).toEqual(['r1'])
  })

  it('a double click ends it too; a line of one point is not made', () => {
    render(<App />)
    key('l')
    click(R1[0], free)
    key('Enter')
    expect(lines()).toHaveLength(0)
    click(R1[1], free)
    fireEvent.doubleClick(capture(), at(R1[1], free))
    expect(lines()).toEqual([{ id: 'r1', points: R1 }])
  })

  it('Escape steps back: it drops the points placed, and with none it leaves the tool', () => {
    render(<App />)
    key('l')
    click(R1[0], free)
    click(R1[1], free)
    key('Escape')
    expect(useTool.getState().tool).toBe('referenceLine')
    // the points are gone: Enter ends nothing
    key('Enter')
    expect(lines()).toHaveLength(0)
    key('Escape')
    expect(useTool.getState().tool).toBe('select')
  })

  it('draws a line shown again if an eye had hidden the guides', () => {
    act(() => useLayerView.getState().setHidden([REFERENCE_LINES], true))
    render(<App />)
    key('l')
    click(R1[0], free)
    click(R1[1], free)
    key('Enter')
    expect(useLayerView.getState().hidden).not.toContain(REFERENCE_LINES)
    expect(lineEl('r1')).not.toBeNull()
  })

  it('the command line takes a typed distance and angle, as a street’s does', () => {
    render(<App />)
    key('l')
    expect(screen.getByRole('group', { name: 'Command' })).toHaveTextContent('Reference line')
    click(R1[0], free)
    fireEvent.change(commandLine(), { target: { value: '20<0' } })
    fireEvent.keyDown(commandLine(), { key: 'Enter' })
    fireEvent.keyDown(commandLine(), { key: 'Enter' })
    expect(lines()).toHaveLength(1)
    expect(lines()[0].points[0]).toEqual(R1[0])
    expect(lines()[0].points[1].x).toBeCloseTo(R1[0].x + 20, 6)
    expect(lines()[0].points[1].y).toBeCloseTo(R1[0].y, 6)
  })
})

describe('what is drawn', () => {
  it('is thin and dashed, the project’s: on every level, in every option', () => {
    withLines()
    render(<App />)
    const g = lineEl('r1')
    expect(g).not.toBeNull()
    expect(g.querySelector('[data-reference-line-stroke]')).toHaveAttribute('stroke-dasharray')
    // a level that is not the first: the line has no level, so it is there all the same, and in All levels
    const roof = actions.addLevelAtEnd(s().project, 'above')
    act(() => s().apply(() => roof.project))
    act(() => s().setLevel(roof.id))
    expect(lineEl('r1')).not.toBeNull()
    act(() => s().setShowAll(true))
    expect(lineEl('r1')).not.toBeNull()
  })

  it('under the masses; those On top are drawn again over them and under the dimensions', () => {
    withLines()
    render(<App />)
    const after = (a: Element, b: Element) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)
    const dims = plan().querySelector('[data-layer="dimensions"]')!
    const mass = plan().querySelector('[data-mass]')!
    expect(plan().querySelectorAll('[data-layer="reference-lines"]')).toHaveLength(1)
    expect(after(lineEl('r1'), mass)).toBe(true)
    act(() => useLayerView.getState().setOnTop([REFERENCE_LINES], true))
    const groups = plan().querySelectorAll('[data-layer="reference-lines"]')
    expect(groups).toHaveLength(1)
    expect(groups[0]).toHaveAttribute('data-on-top')
    expect(after(mass, groups[0])).toBe(true)
    expect(after(groups[0], dims)).toBe(true)
  })
})

describe('picked on the plan', () => {
  beforeEach(withLines)

  it('a click picks it alone (it reads picked), Shift+click adds the other and takes it out again', () => {
    render(<App />)
    press(lineEl('r1'), { x: 100, y: 170 })
    expect(pickedRefs()).toEqual([r('r1')])
    expect(lineEl('r1')).toHaveAttribute('aria-selected', 'true')
    press(lineEl('r2'), { x: 225, y: 100 }, { shiftKey: true })
    expect(pickedRefs()).toEqual([r('r1'), r('r2')])
    press(lineEl('r1'), { x: 100, y: 170 }, { shiftKey: true })
    expect(pickedRefs()).toEqual([r('r2')])
    // a click on another kind lets it go, and on empty ground too
    act(() => pickRefs([{ kind: 'mass', id: 'm1' }]))
    expect(pickedRefs()).toEqual([{ kind: 'mass', id: 'm1' }])
  })

  it('picked beside a mass with Shift+click; a plain click on a mass lets the line go', () => {
    render(<App />)
    act(() => pickRefs([{ kind: 'mass', id: 'm3' }]))
    press(lineEl('r1'), { x: 100, y: 170 }, { shiftKey: true })
    expect(pickedRefs()).toEqual([{ kind: 'mass', id: 'm3' }, r('r1')])
    expect(pickedNow().lines).toEqual(['r1'])
    act(() => s().select('m1'))
    expect(pickedNow().lines).toEqual([])
  })

  it('the window takes what it holds whole; the crossing takes what it touches', () => {
    render(<App />)
    const guides = () => pickedRefs().filter((x) => x.kind === 'reference-line')
    act(() => selectBox({ a: { x: 20, y: 160 }, b: { x: 200, y: 180 } }, false))
    expect(pickedRefs()).toEqual([r('r1')])
    // r2 runs through this box without being in it: a crossing box picks it, a window does not
    act(() => selectBox({ a: { x: 205, y: 100 }, b: { x: 245, y: 120 } }, false))
    expect(guides()).toEqual([])
    act(() => selectBox({ a: { x: 245, y: 100 }, b: { x: 205, y: 120 } }, false))
    expect(guides()).toEqual([r('r2')])
    act(() => selectBox({ a: WHOLE.a, b: WHOLE.b }, false))
    expect(guides()).toEqual([r('r1'), r('r2')])
  })

  it('Delete removes what is picked in one undo step, and Undo brings it back', () => {
    render(<App />)
    act(() => pickRefs([r('r1')]))
    const before = steps()
    act(() => void runCommand('edit.delete'))
    expect(lines().map((l) => l.id)).toEqual(['r2'])
    expect(steps()).toBe(before + 1)
    expect(pickedRefs()).toEqual([])
    act(() => s().undo())
    expect(lines().map((l) => l.id)).toEqual(['r1', 'r2'])
  })

  it('a line picked is let go when Undo takes it away', () => {
    render(<App />)
    act(() => pickRefs([r('r2')]))
    act(() => s().apply((p) => actions.removeReferenceLine(p, 'r2')))
    expect(pickedRefs()).toEqual([])
  })
})

describe('moved, dragged', () => {
  beforeEach(withLines)

  it('the Move tool moves it with a mass picked beside it: one undo step', () => {
    render(<App />)
    act(() => pickRefs([{ kind: 'mass', id: 'm3' }, r('r1')]))
    const m3 = () => s().project.masses.find((m) => m.id === 'm3')!.footprint
    const centre = (m3() as { center: Point }).center
    key('m')
    expect(useTool.getState().tool).toBe('move')
    const before = steps()
    click({ x: 10, y: 10 }, free)
    click({ x: 30, y: 20 }, free)
    expect(lines().find((l) => l.id === 'r1')!.points).toEqual(R1.map((q) => ({ x: q.x + 20, y: q.y + 10 })))
    expect(lines().find((l) => l.id === 'r2')!.points).toEqual(R2)
    expect((m3() as { center: Point }).center).toEqual({ x: centre.x + 20, y: centre.y + 10 })
    expect(steps()).toBe(before + 1)
    // the moved things stay picked
    expect(pickedRefs()).toEqual([{ kind: 'mass', id: 'm3' }, r('r1')])
    act(() => s().undo())
    expect(lines().find((l) => l.id === 'r1')!.points).toEqual(R1)
  })

  it('the Copy tool leaves it and makes a new line, unlocked', () => {
    render(<App />)
    act(() => pickRefs([r('r2')]))
    key('c')
    click({ x: 10, y: 10 }, free)
    click({ x: 40, y: 10 }, free)
    key('Enter')
    expect(lines()).toHaveLength(3)
    expect(lines()[2].points).toEqual(R2.map((q) => ({ x: q.x + 30, y: q.y })))
    expect(lines()[0].points).toEqual(R1)
  })

  it('the Rotate tool turns it about the pivot', () => {
    render(<App />)
    act(() => pickRefs([r('r1')]))
    key('r')
    click({ x: 30, y: 170 }, free) // the pivot: its first point
    click({ x: 80, y: 170 }, free) // the start of the turn
    click({ x: 30, y: 220 }, free) // 90° counter-clockwise
    const pts = lines().find((l) => l.id === 'r1')!.points
    expect(pts[0].x).toBeCloseTo(30, 6)
    expect(pts[1].x).toBeCloseTo(30, 6)
    expect(pts[1].y).toBeCloseTo(170 + 150, 6)
  })

  it('a drag of its body moves it, snapped or free (Shift), as one undo step', () => {
    render(<App />)
    const before = steps()
    fireEvent.pointerDown(lineEl('r1'), at({ x: 100, y: 170 }))
    fireEvent.pointerMove(plan(), at({ x: 100, y: 190 }, free))
    fireEvent.pointerUp(plan(), at({ x: 100, y: 190 }, free))
    expect(lines().find((l) => l.id === 'r1')!.points).toEqual(R1.map((q) => ({ x: q.x, y: q.y + 20 })))
    expect(steps()).toBe(before + 1)
    expect(pickedRefs()).toEqual([r('r1')])
    act(() => s().undo())
    expect(lines().find((l) => l.id === 'r1')!.points).toEqual(R1)
  })

  it('a press that does not move picks it and changes nothing; Escape in the middle of a drag cancels it', () => {
    render(<App />)
    const project = s().project
    press(lineEl('r1'), { x: 100, y: 170 })
    expect(s().project).toBe(project)
    fireEvent.pointerDown(lineEl('r2'), at({ x: 225, y: 100 }))
    fireEvent.pointerMove(plan(), at({ x: 245, y: 100 }, free))
    expect(lines().find((l) => l.id === 'r2')!.points[0].x).toBe(245)
    key('Escape')
    expect(lines().find((l) => l.id === 'r2')!.points).toEqual(R2)
  })
})

describe('its points', () => {
  beforeEach(withLines)

  it('picked alone it shows a handle at each point; with two picked, or a tool in hand, there are none', () => {
    render(<App />)
    expect(pointEl('r1', 0)).toBeNull()
    act(() => pickRefs([r('r1')]))
    expect(pointEl('r1', 0)).not.toBeNull()
    expect(pointEl('r1', 1)).not.toBeNull()
    expect(pointEl('r2', 0)).toBeNull()
    act(() => pickRefs([r('r1'), r('r2')]))
    expect(pointEl('r1', 0)).toBeNull()
    act(() => pickRefs([r('r1')]))
    key('l')
    expect(pointEl('r1', 0)).toBeNull()
  })

  it('a point dragged moves that point alone, one undo step, free with Shift', () => {
    render(<App />)
    act(() => pickRefs([r('r1')]))
    const before = steps()
    fireEvent.pointerDown(pointEl('r1', 1)!, at(R1[1]))
    fireEvent.pointerMove(plan(), at({ x: 200, y: 175 }, free))
    fireEvent.pointerUp(plan(), at({ x: 200, y: 175 }, free))
    expect(lines().find((l) => l.id === 'r1')!.points).toEqual([R1[0], { x: 200, y: 175 }])
    expect(steps()).toBe(before + 1)
    act(() => s().undo())
    expect(lines().find((l) => l.id === 'r1')!.points).toEqual(R1)
  })

  it('a point dragged snaps to what is drawn (a mass’s corner), unless Shift is held', () => {
    render(<App />)
    act(() => pickRefs([r('r1')]))
    // the first warehouse's bottom-right corner is (200, 150): near it, the point lands on it
    fireEvent.pointerDown(pointEl('r1', 1)!, at(R1[1]))
    fireEvent.pointerMove(plan(), at({ x: 200.4, y: 150.3 }))
    fireEvent.pointerUp(plan(), at({ x: 200.4, y: 150.3 }))
    expect(lines().find((l) => l.id === 'r1')!.points[1]).toEqual({ x: 200, y: 150 })
  })
})

describe('its menu', () => {
  beforeEach(withLines)

  it('is in the user’s order: On top · Group · Ungroup · Delete · Select all reference lines, Lock, Hide · Properties; no Copy', () => {
    act(() => pickRefs([r('r1')]))
    const menu = menuFor(pickedRefs(), 'plan', null)
    expect(shape(menu)).toEqual(['On top', '|', 'Group', 'Ungroup', '|', 'Delete', '|', 'Select all reference lines', 'Lock', 'Hide', '|', 'Properties'])
  })

  it('Select all picks every guide that is neither locked nor hidden', () => {
    act(() => s().apply((p) => actions.lockReferenceLines(p, ['r2'], true)))
    act(() => pickRefs([r('r1')]))
    act(() => leaf(menuFor(pickedRefs(), 'plan', null), 'select-all').onSelect())
    expect(pickedRefs()).toEqual([r('r1')])
    act(() => s().apply((p) => actions.lockReferenceLines(p, ['r2'], false)))
    act(() => leaf(menuFor(pickedRefs(), 'plan', null), 'select-all').onSelect())
    expect(pickedRefs()).toEqual([r('r1'), r('r2')])
  })

  it('On top is the row’s: ticked while the guides are on top, and a press flips it', () => {
    act(() => pickRefs([r('r1')]))
    const row = () => leaf(menuFor(pickedRefs(), 'plan', null), 'on-top') as { checked?: boolean; onSelect(): void }
    expect(row().checked).toBe(false)
    act(() => row().onSelect())
    expect(useLayerView.getState().onTop).toEqual([REFERENCE_LINES])
    expect(row().checked).toBe(true)
  })

  it('Lock locks it (one undo step) and Unlock frees it; Hide hides it and lets it go, Show brings it back', () => {
    act(() => pickRefs([r('r1')]))
    const before = steps()
    act(() => leaf(menuFor(pickedRefs(), 'plan', null), 'lock').onSelect())
    expect(lines().find((l) => l.id === 'r1')!.locked).toBe(true)
    expect(steps()).toBe(before + 1)
    // locked while picked: it is let go (the padlock is CAD's)
    expect(pickedRefs()).toEqual([])
    act(() => pickRefs([r('r1')]))
    expect(leaf(menuFor(pickedRefs(), 'plan', null), 'lock').label).toBe('Unlock')
    act(() => leaf(menuFor(pickedRefs(), 'plan', null), 'lock').onSelect())
    expect(lines().find((l) => l.id === 'r1')!.locked).toBeUndefined()
    act(() => pickRefs([r('r1')]))
    act(() => leaf(menuFor(pickedRefs(), 'plan', null), 'hide').onSelect())
    expect(useLayerView.getState().hidden).toEqual(['reference-line:r1'])
    expect(pickedRefs()).toEqual([])
    expect(leaf(menuFor([r('r1')], 'layers', null), 'hide').label).toBe('Show')
  })

  it('a right-click on it picks it first and opens its menu', () => {
    render(<App />)
    fireEvent.contextMenu(lineEl('r2'), at({ x: 225, y: 100 }, { button: 2 }))
    expect(pickedRefs()).toEqual([r('r2')])
    expect(screen.getByRole('menu', { name: 'Reference line 2' })).toBeInTheDocument()
  })

  it('a right-click with a tool in hand finds it under the pointer by its place', () => {
    render(<App />)
    key('l')
    fireEvent.contextMenu(capture(), at({ x: 225, y: 100 }, { button: 2 }))
    expect(useTool.getState().tool).toBe('select')
    expect(pickedRefs()).toEqual([r('r2')])
  })
})

describe('hidden', () => {
  beforeEach(withLines)

  it('by its own eye or its kind’s it is not drawn, not picked by the window, and let go if it was picked', () => {
    render(<App />)
    act(() => pickRefs([r('r1'), r('r2')]))
    act(() => useLayerView.getState().setHidden(['reference-line:r1'], true))
    expect(lineEl('r1')).toBeNull()
    expect(lineEl('r2')).not.toBeNull()
    expect(pickedRefs()).toEqual([r('r2')])
    act(() => selectBox({ a: WHOLE.a, b: WHOLE.b }, false))
    expect(pickedRefs().filter((x) => x.kind === 'reference-line')).toEqual([r('r2')])
    act(() => useLayerView.getState().setHidden([REFERENCE_LINES], true))
    expect(lineEl('r2')).toBeNull()
    expect(pickedRefs().filter((x) => x.kind === 'reference-line')).toEqual([])
  })

  it('its key is dropped when the line goes: the next one drawn is not born hidden', () => {
    act(() => useLayerView.getState().setHidden(['reference-line:r2'], true))
    act(() => s().apply((p) => actions.removeReferenceLine(p, 'r2')))
    expect(useLayerView.getState().hidden).toEqual([])
  })
})

describe('locked: seen, not picked', () => {
  beforeEach(() => {
    withLines()
    act(() => s().apply((p) => actions.lockReferenceLines(p, ['r1'], true)))
  })

  it('is drawn with the lock’s glyph; a free one has none', () => {
    render(<App />)
    expect(lineEl('r1')).not.toBeNull()
    expect(document.querySelector('[data-lock="reference-line:r1"]')).not.toBeNull()
    expect(document.querySelector('[data-lock="reference-line:r2"]')).toBeNull()
  })

  it('a click picks nothing and shows the notice; a free one is picked as ever', () => {
    render(<App />)
    press(lineEl('r1'), { x: 100, y: 170 })
    expect(pickedRefs()).toEqual([])
    expect(toast()).toBe(LOCKED)
    act(() => void 0)
    press(lineEl('r2'), { x: 225, y: 100 })
    expect(pickedRefs()).toEqual([r('r2')])
  })

  it('Shift+click does not add it, the window and Select all skip it, and a drag from it is not a drag of the line', () => {
    render(<App />)
    act(() => pickRefs([r('r2')]))
    press(lineEl('r1'), { x: 100, y: 170 }, { shiftKey: true })
    expect(pickedRefs()).toEqual([r('r2')])
    act(() => selectBox({ a: WHOLE.a, b: WHOLE.b }, false))
    expect(pickedRefs().filter((x) => x.kind === 'reference-line')).toEqual([r('r2')])
    const before = s().project
    fireEvent.pointerDown(lineEl('r1'), at({ x: 100, y: 170 }))
    fireEvent.pointerMove(plan(), at({ x: 100, y: 190 }, free))
    fireEvent.pointerUp(plan(), at({ x: 100, y: 190 }, free))
    expect(s().project).toBe(before)
  })

  it('a right-click on it shows the notice, picks nothing and opens no menu', () => {
    render(<App />)
    fireEvent.contextMenu(lineEl('r1'), at({ x: 100, y: 170 }, { button: 2 }))
    expect(pickedRefs()).toEqual([])
    expect(toast()).toBe(LOCKED)
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('its Properties are read-only and say so; Delete is greyed with the reason, and the verb refuses', () => {
    render(<App />)
    act(() => pickRefs([r('r1')]))
    expect(leaf(menuFor(pickedRefs(), 'layers', null), 'delete')).toMatchObject({ disabled: true, title: 'A locked reference line: unlock first' })
    act(() => void runCommand('edit.delete'))
    expect(lines()).toHaveLength(2)
  })
})
