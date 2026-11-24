// Phase AS.5 task 5: Mirror (I), Array (A) and Align (Shift+A), the three tools beside Move, Copy and Rotate, driven as
// `transform.test.tsx` drives Move: a press on the tool's capture surface, the command line, the keys. The verbs they call
// (`mirrorPicked`, `arrayPicked`, `alignPicked`) are tested in `state/actions/__tests__/selectionTools.test.ts`; here is what the
// views add: the previews that stand between two clicks, the one undo step, the guards, the General group's ▾ and the typed count.
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Point } from '../../../../model/schema.ts'
import { App } from '../../../../App.tsx'
import { derive } from '../../../../engine/derive.ts'
import { addWarehouseType, placeWarehouse } from '../../../../modules/warehouse/actions.ts'
import { demoProject } from '../../../../state/demo.ts'
import { emptyHistory } from '../../../../state/history.ts'
import { useApp } from '../../../../state/store.ts'
import { NOTHING_PICKED } from '../../../../model/picked.ts'
import { pickMenu, closeMenus } from '../../../__tests__/pickMenu.ts'
import { closeMenu } from '../../../editing/menu/open.tsx'
import { commandForKey, keysOf } from '../../../commands/shortcuts.ts'
import { commandOf, commands } from '../../../commands/registry.ts'
import { useToast } from '../../../layout/toast.ts'
import { useUi } from '../../../layout/ui.ts'
import { letGo } from '../../../tools/hand.ts'
import { fit, UNMEASURED_SIZE } from '../../camera.ts'
import { useClipboard } from '../../clipboard.ts'
import { useCommand } from '../../command/commandState.ts'
import { useRoads } from '../../circulation/roadState.ts'
import { pickedNow, setPicked } from '../../mix.ts'
import { DEFAULT_SNAP } from '../../snap/kinds.ts'
import { useSnapSettings } from '../../snap/settings.ts'
import { GENERAL_KEY, MAX_COPIES, MAX_COUNT, MAX_ROWS, readSaved, useGeneralTools } from '../generalSettings.ts'
import { useDimensions, useTool } from '../toolState.ts'

vi.mock('../../../scene/Scene.tsx', () => ({ Scene: () => <div data-testid="scene" /> }))

// the demo's site and its 15 m south street, as the plan fits it
const v = fit({ minX: 0, minY: -15, maxX: 440, maxY: 280 }, UNMEASURED_SIZE)
const at = (q: Point, extra: object = {}) => ({
  clientX: (q.x - v.cx) * v.scale + UNMEASURED_SIZE.w / 2,
  clientY: UNMEASURED_SIZE.h / 2 - (q.y - v.cy) * v.scale,
  button: 0,
  pointerId: 1,
  ...extra,
})
const free = { shiftKey: true }
const capture = () => document.querySelector('[data-tool] > [data-capture]')!
const move = (q: Point, extra: object = {}) => fireEvent.pointerMove(capture(), at(q, extra))
const click = (q: Point, extra: object = {}) => {
  fireEvent.pointerMove(capture(), at(q, extra))
  fireEvent.pointerDown(capture(), at(q, extra))
  fireEvent.pointerUp(capture(), at(q, extra))
}
const key = (k: string, extra: object = {}) => fireEvent.keyDown(window, { key: k, ...extra })
const steps = () => useApp.getState().history.past.length
const masses = () => useApp.getState().project.masses
const mass = (id: string) => masses().find((m) => m.id === id)!
/** The centre of a mass drawn as a rectangle (the demo's office, m3: 40 × 20 m at (120, 200)). */
const centre = (id: string): Point => {
  const f = mass(id).footprint
  if (f.kind !== 'rect') throw new Error('not a rect')
  return f.center
}
const prompt = () => screen.getByRole('group', { name: 'Command' })
const strip = () => screen.getByRole('toolbar', { name: 'Tools' })
const line = () => screen.getByRole('textbox', { name: 'Command line' }) as HTMLInputElement
const type = (text: string) => {
  fireEvent.change(line(), { target: { value: text } })
  fireEvent.keyDown(line(), { key: 'Enter' })
}
const near = (a: Point, b: Point) => {
  expect(a.x).toBeCloseTo(b.x, 6)
  expect(a.y).toBeCloseTo(b.y, 6)
}
const pickOffice = () => act(() => useApp.getState().select('m3'))
const toast = () => useToast.getState().toast?.text

beforeEach(() => {
  localStorage.clear()
  const p = demoProject()
  useApp.setState({ project: p, derived: derive(p), history: emptyHistory(), dragStart: null, selection: { massId: null, vertex: null, massIds: [] } })
  useUi.setState({ dialog: null, view: 'plan', rail: 'layers', panels: { left: true, right: true }, sheet: null, help: true })
  letGo()
  useDimensions.setState({ selected: null, also: [] })
  // no grid: a point off every target stays where the pointer is
  useSnapSettings.setState({ settings: { ...DEFAULT_SNAP, grid: false } })
  useClipboard.setState({ masses: [], roads: [] })
  useCommand.setState({ registration: null, angle: null, cursor: null })
  useToast.setState({ toast: null, confirmation: null })
  useRoads.setState({ picked: null, also: [] })
  useGeneralTools.setState({ keep: true, count: 3, rows: 1, how: 'edges' })
  // the menu is app state: one a test left open is not the next test’s
  closeMenu()
  letGo()
})

/** The three tools, each with what its first click and its pointer do, and how its preview shows (the demo has 3 masses; `previewed(3)`). */
const CASES = [
  { tool: 'mirror', label: 'Mirror', press: () => key('i'), a: { x: 230, y: 100 }, b: { x: 230, y: 300 }, first: 'First point of the mirror line', previewed: (n: number) => masses().length === n + 1 },
  { tool: 'array', label: 'Array', press: () => key('a'), a: { x: 100, y: 190 }, b: { x: 100, y: 240 }, first: 'Base point', previewed: (n: number) => masses().length === n + 2 },
  { tool: 'align', label: 'Align', press: () => key('A', { shiftKey: true }), a: { x: 50, y: 250 }, b: { x: 400, y: 250 }, first: 'First point of the line', previewed: () => Math.abs(centre('m3').y - 240) < 1e-6 },
] as const

/** The office picked, the tool on, its first click made and the pointer previewing. */
function previewing(c: (typeof CASES)[number]) {
  pickOffice()
  c.press()
  expect(useTool.getState().tool).toBe(c.tool)
  click(c.a, free)
  move(c.b, free)
  expect(c.previewed(3)).toBe(true)
}

describe.each(CASES)('$label: what the three tools share', (c) => {
  it('its key takes it and a second press gives it back; with nothing picked it is refused', () => {
    render(<App />)
    c.press()
    expect(useTool.getState().tool).toBe('select')
    const chip = within(strip()).getByRole('button', { name: c.label }) as HTMLButtonElement
    expect(chip.disabled).toBe(true)
    expect(chip).toHaveAttribute('title', 'Pick something first')
    expect(commandOf(`tool.${c.tool}`)!.enabled!()).toBe('Pick something first')
    pickOffice()
    expect(chip.disabled).toBe(false)
    c.press()
    expect(useTool.getState().tool).toBe(c.tool)
    expect(chip).toHaveAttribute('aria-pressed', 'true')
    expect(prompt()).toHaveTextContent(c.first)
    c.press()
    expect(useTool.getState().tool).toBe('select')
    fireEvent.click(chip)
    expect(useTool.getState().tool).toBe(c.tool)
  })

  it('the first click previews from there: Escape steps back (the project as it was), then lets go', () => {
    render(<App />)
    const project = useApp.getState().project
    const history = useApp.getState().history
    previewing(c)
    key('Escape')
    expect(useApp.getState().project).toBe(project)
    expect(useApp.getState().dragStart).toBeNull()
    expect(useTool.getState().tool).toBe(c.tool)
    expect(prompt()).toHaveTextContent(c.first)
    key('Escape')
    expect(useTool.getState().tool).toBe('select')
    expect(useApp.getState().project).toBe(project)
    expect(useApp.getState().history).toBe(history)
    expect(useApp.getState().selection.massIds).toEqual(['m3'])
  })

  it('Backspace and Ctrl+Z step back as Escape does', () => {
    render(<App />)
    const project = useApp.getState().project
    previewing(c)
    key('Backspace')
    expect(useApp.getState().project).toBe(project)
    expect(prompt()).toHaveTextContent(c.first)
    click(c.a, free)
    move(c.b, free)
    expect(c.previewed(3)).toBe(true)
    key('z', { ctrlKey: true })
    expect(useApp.getState().project).toBe(project)
    expect(prompt()).toHaveTextContent(c.first)
    expect(useTool.getState().tool).toBe(c.tool)
  })

  it('a right-click lets go, drops the preview and opens the menu of what is picked', () => {
    render(<App />)
    const project = useApp.getState().project
    previewing(c)
    fireEvent.contextMenu(capture(), at(c.b))
    expect(useTool.getState().tool).toBe('select')
    expect(useApp.getState().project).toBe(project)
    expect(useApp.getState().dragStart).toBeNull()
    expect(screen.getByRole('menu')).toBeInTheDocument()
    expect(useApp.getState().selection.massIds).toEqual(['m3'])
  })

  it('the keys that edit the project do nothing while the preview stands', () => {
    render(<App />)
    const project = useApp.getState().project
    const history = useApp.getState().history
    previewing(c)
    key('d', { ctrlKey: true })
    key('R', { shiftKey: true })
    key('g', { ctrlKey: true })
    expect(c.previewed(3)).toBe(true)
    expect(masses()).toHaveLength(c.tool === 'mirror' ? 4 : c.tool === 'array' ? 5 : 3)
    key('Escape')
    expect(useApp.getState().project).toBe(project)
    expect(useApp.getState().history).toBe(history)
  })

  it('an undo from elsewhere while the preview stands drops it first, and the history stays true', () => {
    render(<App />)
    act(() => useApp.getState().apply((p) => ({ ...p, name: 'Renamed project' })))
    const project = useApp.getState().project
    previewing(c)
    act(() => useApp.getState().undo())
    expect(useApp.getState().dragStart).toBeNull()
    expect(useApp.getState().project.name).not.toBe('Renamed project')
    expect(useApp.getState().history.future.at(-1)).toBe(project)
    expect(prompt()).toHaveTextContent(c.first)
    // the pointer previews again from nothing: no half-made step is left
    move(c.b, free)
    expect(useApp.getState().history.future).toHaveLength(1)
  })

  it('the pointer leaving the plan drops the preview; back on it, it previews again from the same first click', () => {
    render(<App />)
    const project = useApp.getState().project
    previewing(c)
    fireEvent.pointerLeave(capture())
    expect(useApp.getState().project).toBe(project)
    expect(useApp.getState().dragStart).toBeNull()
    move(c.b, free)
    expect(c.previewed(3)).toBe(true)
  })

  it('its tool group carries data-tool', () => {
    render(<App />)
    pickOffice()
    c.press()
    expect(document.querySelector(`[data-tool="${c.tool}"] > [data-capture]`)).not.toBeNull()
  })
})

describe('Mirror', () => {
  /** The office reflected about the line through `a` at `degrees`. */
  const reflected = (c: Point, a: Point, degrees: number): Point => {
    const t = (2 * degrees * Math.PI) / 180
    const dx = c.x - a.x
    const dy = c.y - a.y
    return { x: a.x + dx * Math.cos(t) + dy * Math.sin(t), y: a.y + dx * Math.sin(t) - dy * Math.cos(t) }
  }

  it('two clicks give the line: the mirror image is previewed from the first click on and set by the second, one undo step', () => {
    render(<App />)
    pickOffice()
    const n = masses().length
    const before = steps()
    key('i')
    click({ x: 230, y: 100 }, free)
    expect(prompt()).toHaveTextContent('Second point of the mirror line')
    move({ x: 230, y: 300 }, free)
    expect(masses()).toHaveLength(n + 1)
    near(centre(masses().at(-1)!.id), { x: 340, y: 200 })
    expect(steps()).toBe(before)
    click({ x: 230, y: 300 }, free)
    expect(masses()).toHaveLength(n + 1)
    expect(steps()).toBe(before + 1)
    // it kept the original; the tool lets go; the originals stay picked
    near(centre('m3'), { x: 120, y: 200 })
    expect(useTool.getState().tool).toBe('select')
    expect(useApp.getState().selection.massIds).toEqual(['m3'])
    act(() => useApp.getState().undo())
    expect(masses()).toHaveLength(n)
  })

  it('without the original kept (the ▾) the thing itself is reflected', () => {
    render(<App />)
    pickOffice()
    act(() => useGeneralTools.getState().setKeep(false))
    const n = masses().length
    const before = steps()
    key('i')
    click({ x: 230, y: 100 }, free)
    click({ x: 230, y: 300 }, free)
    expect(masses()).toHaveLength(n)
    near(centre('m3'), { x: 340, y: 200 })
    expect(steps()).toBe(before + 1)
    expect(useApp.getState().selection.massIds).toEqual(['m3'])
    act(() => useApp.getState().undo())
    near(centre('m3'), { x: 120, y: 200 })
  })

  it('Ortho steps the line’s angle by 15° (Shift is free), as Rotate steps its turn', () => {
    render(<App />)
    pickOffice()
    act(() => useSnapSettings.setState({ settings: { ...useSnapSettings.getState().settings, ortho: true } }))
    // open ground east of the office, so nothing attracts the pointer
    const a = { x: 230, y: 200 }
    key('i')
    click(a, free)
    const at37 = { x: a.x + 25 * Math.cos((37 * Math.PI) / 180), y: a.y + 25 * Math.sin((37 * Math.PI) / 180) }
    move(at37)
    near(centre(masses().at(-1)!.id), reflected({ x: 120, y: 200 }, a, 30))
    move(at37, free)
    near(centre(masses().at(-1)!.id), reflected({ x: 120, y: 200 }, a, 37))
  })

  it('a typed angle sets the line’s angle from the first point', () => {
    render(<App />)
    pickOffice()
    const n = masses().length
    const before = steps()
    key('i')
    click({ x: 100, y: 190 }, free)
    expect(prompt()).toHaveTextContent('click, or type the angle')
    move({ x: 160, y: 190 }, free)
    type('90')
    expect(masses()).toHaveLength(n + 1)
    near(centre(masses().at(-1)!.id), { x: 80, y: 190 + 10 })
    expect(steps()).toBe(before + 1)
    expect(useTool.getState().tool).toBe('select')
  })

  it('a block’s copy is not mirrored and is not copied; what is left alone is said once', () => {
    render(<App />)
    const withType = addWarehouseType(useApp.getState().project)
    const placed = placeWarehouse(withType.project, withType.id, { x: 300, y: 230 }, 0, 'o1')!
    const levels = new Set(placed.project.buildings.find((b) => b.id === placed.id)!.levels.map((l) => l.id))
    const hall = placed.project.masses.find((m) => m.part === 'hall' && levels.has(m.levelId))!
    act(() => useApp.setState({ project: placed.project, derived: derive(placed.project, 'o1') }))
    act(() => setPicked([], { ...NOTHING_PICKED, masses: ['m3', hall.id] }))
    const n = masses().length
    const before = steps()
    key('i')
    click({ x: 230, y: 100 }, free)
    click({ x: 230, y: 300 }, free)
    // the office has its mirror image; the block is where it was, once
    expect(masses()).toHaveLength(n + 1)
    expect(mass(hall.id)).toBe(hall)
    expect(steps()).toBe(before + 1)
    expect(toast()).toBe('A block is not mirrored: its type has one hand')
  })
})

describe('Array', () => {
  it('two clicks: a base point and the first copy; the copies go along it, count 3 by default, one undo step', () => {
    render(<App />)
    pickOffice()
    const n = masses().length
    const before = steps()
    key('a')
    expect(prompt()).toHaveTextContent('Base point')
    click({ x: 100, y: 190 }, free)
    expect(prompt()).toHaveTextContent('First copy')
    move({ x: 100, y: 240 }, free)
    expect(masses()).toHaveLength(n + 2) // previewed from the first click on
    expect(steps()).toBe(before)
    click({ x: 100, y: 240 }, free)
    expect(masses()).toHaveLength(n + 2)
    expect(masses().slice(n).map((m) => centre(m.id))).toEqual([{ x: 120, y: 250 }, { x: 120, y: 300 }])
    near(centre('m3'), { x: 120, y: 200 })
    expect(steps()).toBe(before + 1)
    // the tool lets go; the originals stay picked
    expect(useTool.getState().tool).toBe('select')
    expect(useApp.getState().selection.massIds).toEqual(['m3'])
    act(() => useApp.getState().undo())
    expect(masses()).toHaveLength(n)
  })

  it('the count comes from the ▾’s store, the original counted', () => {
    render(<App />)
    pickOffice()
    act(() => void useGeneralTools.getState().setCount(5))
    const n = masses().length
    key('a')
    click({ x: 100, y: 190 }, free)
    click({ x: 100, y: 215 }, free)
    expect(masses()).toHaveLength(n + 4)
    expect(steps()).toBe(1)
  })

  it('a count of 1 changes nothing: no step', () => {
    render(<App />)
    pickOffice()
    act(() => void useGeneralTools.getState().setCount(1))
    const project = useApp.getState().project
    key('a')
    click({ x: 100, y: 190 }, free)
    click({ x: 100, y: 230 }, free)
    expect(useApp.getState().project).toBe(project)
    expect(steps()).toBe(0)
  })

  it('x5 typed while the tool is on sets the count and the ▾ shows it; X5 and ×5 do too', () => {
    render(<App />)
    pickOffice()
    key('a')
    // the characters go to the command line, not to the app
    key('x')
    key('5')
    expect(line()).toHaveValue('x5')
    fireEvent.keyDown(line(), { key: 'Enter' })
    expect(useGeneralTools.getState().count).toBe(5)
    expect(line()).toHaveValue('')
    type('X7')
    expect(useGeneralTools.getState().count).toBe(7)
    type('×4')
    expect(useGeneralTools.getState().count).toBe(4)
    // nothing was placed by it
    expect(prompt()).toHaveTextContent('Base point')
    expect(steps()).toBe(0)
    fireEvent.click(within(strip()).getByRole('button', { name: 'General options' }))
    expect(within(screen.getByRole('dialog', { name: 'Mirror, Array and Align' })).getByLabelText('Count')).toHaveValue('4')
  })

  it('a typed count updates the preview that stands', () => {
    render(<App />)
    pickOffice()
    const n = masses().length
    key('a')
    click({ x: 100, y: 190 }, free)
    move({ x: 100, y: 230 }, free)
    expect(masses()).toHaveLength(n + 2)
    type('x4')
    expect(masses()).toHaveLength(n + 3)
    key('Escape')
  })

  it('x is the command line’s only while Array is on: Move leaves it alone', () => {
    render(<App />)
    pickOffice()
    key('m')
    key('x')
    expect(line()).toHaveValue('')
    key('Escape')
    key('a')
    key('x')
    expect(line()).toHaveValue('x')
  })

  it('a count the tool cannot take is held to its cap and said', () => {
    render(<App />)
    pickOffice()
    key('a')
    type('x500')
    expect(useGeneralTools.getState().count).toBe(MAX_COUNT)
    expect(toast()).toMatch(/at most 50/)
    type('x0')
    expect(prompt()).toHaveTextContent('A whole count from 1')
    expect(useGeneralTools.getState().count).toBe(MAX_COUNT)
  })

  it('a typed number is the spacing, along the pointer’s direction from the base', () => {
    render(<App />)
    pickOffice()
    const n = masses().length
    key('a')
    click({ x: 100, y: 190 }, free)
    move({ x: 100, y: 240 }, free) // straight up
    type('40')
    expect(masses()).toHaveLength(n + 2)
    expect(masses().slice(n).map((m) => centre(m.id))).toEqual([{ x: 120, y: 240 }, { x: 120, y: 280 }])
    expect(steps()).toBe(1)
    expect(useTool.getState().tool).toBe('select')
  })

  it('rows: a third click gives the place of the second row; the whole grid is one undo step', () => {
    render(<App />)
    pickOffice()
    act(() => {
      useGeneralTools.getState().setCount(2)
      useGeneralTools.getState().setRows(2)
    })
    const n = masses().length
    key('a')
    click({ x: 100, y: 190 }, free)
    click({ x: 100, y: 230 }, free)
    // not set yet: the second row is asked for, the row previewed
    expect(useTool.getState().tool).toBe('array')
    expect(prompt()).toHaveTextContent('Second row')
    expect(steps()).toBe(0)
    move({ x: 160, y: 190 }, free)
    expect(masses()).toHaveLength(n + 3)
    click({ x: 160, y: 190 }, free)
    expect(masses()).toHaveLength(n + 3)
    const grid = masses().slice(n).map((m) => centre(m.id)).sort((p, q) => p.x - q.x || p.y - q.y)
    const want = [{ x: 120, y: 240 }, { x: 180, y: 200 }, { x: 180, y: 240 }]
    grid.forEach((q, i) => near(q, want[i]))
    expect(steps()).toBe(1)
    expect(useTool.getState().tool).toBe('select')
    act(() => useApp.getState().undo())
    expect(masses()).toHaveLength(n)
  })

  it('Escape steps back from the second row to the first copy, then to the base, then lets go', () => {
    render(<App />)
    pickOffice()
    act(() => useGeneralTools.getState().setRows(2))
    key('a')
    click({ x: 100, y: 190 }, free)
    click({ x: 100, y: 230 }, free)
    expect(prompt()).toHaveTextContent('Second row')
    key('Escape')
    expect(prompt()).toHaveTextContent('First copy')
    key('Escape')
    expect(prompt()).toHaveTextContent('Base point')
    key('Escape')
    expect(useTool.getState().tool).toBe('select')
    expect(steps()).toBe(0)
  })
})

describe('Align', () => {
  it('edges: two clicks give the line and the thing’s near side goes onto it, one undo step; the tool lets go', () => {
    render(<App />)
    pickOffice()
    const before = steps()
    key('A', { shiftKey: true })
    click({ x: 50, y: 250 }, free)
    expect(prompt()).toHaveTextContent('Second point of the line')
    move({ x: 400, y: 250 }, free)
    near(centre('m3'), { x: 120, y: 240 })
    expect(steps()).toBe(before)
    click({ x: 400, y: 250 }, free)
    near(centre('m3'), { x: 120, y: 240 })
    expect(steps()).toBe(before + 1)
    expect(useTool.getState().tool).toBe('select')
    expect(useApp.getState().selection.massIds).toEqual(['m3'])
    act(() => useApp.getState().undo())
    near(centre('m3'), { x: 120, y: 200 })
  })

  it('centres: the thing’s centre goes onto the line', () => {
    render(<App />)
    pickOffice()
    act(() => useGeneralTools.getState().setHow('centres'))
    key('A', { shiftKey: true })
    click({ x: 50, y: 250 }, free)
    click({ x: 400, y: 250 }, free)
    near(centre('m3'), { x: 120, y: 250 })
  })

  it('a street picked with a mass is skipped, and said once', () => {
    render(<App />)
    act(() => setPicked(['street:s1'], { ...NOTHING_PICKED, masses: ['m3'] }))
    expect(pickedNow().nodes.length).toBeGreaterThan(0)
    const streets = useApp.getState().project.options[0].streets
    key('A', { shiftKey: true })
    click({ x: 50, y: 250 }, free)
    click({ x: 400, y: 250 }, free)
    near(centre('m3'), { x: 120, y: 240 })
    expect(useApp.getState().project.options[0].streets).toEqual(streets)
    expect(toast()).toBe('Streets are not aligned: move their nodes')
  })
})

describe('the General group’s ▾', () => {
  const arrow = () => within(strip()).getByRole('button', { name: 'General options' })
  const dialog = () => screen.getByRole('dialog', { name: 'Mirror, Array and Align' })

  it('General has one, with Mirror’s keep, Array’s Count and Rows and Align’s Edges / Centres', () => {
    render(<App />)
    fireEvent.click(arrow())
    const d = within(dialog())
    expect(d.getByRole('heading', { name: 'Mirror, Array and Align' })).toBeInTheDocument()
    expect(d.getByRole('checkbox', { name: 'Mirror keeps the original' })).toBeChecked()
    expect(d.getByLabelText('Count')).toHaveValue('3')
    expect(d.getByLabelText('Rows')).toHaveValue('1')
    const how = d.getByRole('group', { name: 'Align on' })
    expect(within(how).getByRole('button', { name: 'Edges' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(how).getByRole('button', { name: 'Centres' })).toHaveAttribute('aria-pressed', 'false')
    // a pick there takes no tool
    expect(useTool.getState().tool).toBe('select')
  })

  it('each setting is the store’s and is kept in the browser, never in the project', () => {
    render(<App />)
    const project = useApp.getState().project
    fireEvent.click(arrow())
    const d = within(dialog())
    fireEvent.click(d.getByRole('checkbox', { name: 'Mirror keeps the original' }))
    expect(useGeneralTools.getState().keep).toBe(false)
    fireEvent.click(within(d.getByRole('group', { name: 'Align on' })).getByRole('button', { name: 'Centres' }))
    expect(useGeneralTools.getState().how).toBe('centres')
    const count = d.getByLabelText('Count')
    fireEvent.change(count, { target: { value: '6' } })
    fireEvent.keyDown(count, { key: 'Enter' })
    expect(useGeneralTools.getState().count).toBe(6)
    const rows = d.getByLabelText('Rows')
    fireEvent.change(rows, { target: { value: '2' } })
    fireEvent.keyDown(rows, { key: 'Enter' })
    expect(useGeneralTools.getState().rows).toBe(2)
    expect(JSON.parse(localStorage.getItem(GENERAL_KEY)!)).toEqual({ keep: false, count: 6, rows: 2, how: 'centres' })
    expect(readSaved()).toEqual({ keep: false, count: 6, rows: 2, how: 'centres' })
    expect(useApp.getState().project).toBe(project)
    expect(steps()).toBe(0)
  })

  it('Count and Rows are whole numbers from 1, each held to its cap, and their product too; the field says so', () => {
    render(<App />)
    fireEvent.click(arrow())
    const d = within(dialog())
    expect(d.getByLabelText('Count').getAttribute('title')).toMatch(new RegExp(`${MAX_COUNT}.*${MAX_COPIES}`))
    expect(d.getByLabelText('Rows').getAttribute('title')).toMatch(new RegExp(`${MAX_ROWS}.*${MAX_COPIES}`))
    const set = (label: string, text: string) => {
      const f = d.getByLabelText(label)
      fireEvent.change(f, { target: { value: text } })
      fireEvent.keyDown(f, { key: 'Enter' })
    }
    set('Count', '500')
    expect(useGeneralTools.getState().count).toBe(MAX_COUNT)
    set('Rows', '40')
    // 50 × 2 is the most the product allows
    expect(useGeneralTools.getState().rows).toBe(MAX_COPIES / MAX_COUNT)
    expect(d.getByLabelText('Rows')).toHaveValue(String(MAX_COPIES / MAX_COUNT))
    set('Count', '2.4')
    expect(useGeneralTools.getState().count).toBe(2)
    set('Count', '0')
    expect(useGeneralTools.getState().count).toBe(2)
  })

  it('the store: counts from 1, the product capped, a broken saving leaves the defaults', () => {
    const s = () => useGeneralTools.getState()
    expect(s().setCount(0)).toBe(1)
    expect(s().setCount(1000)).toBe(MAX_COUNT)
    expect(s().setRows(1000)).toBe(MAX_COPIES / MAX_COUNT)
    expect(s().setCount(NaN)).toBe(MAX_COUNT)
    expect(s().setRows(1)).toBe(1)
    expect(s().setCount(1000)).toBe(MAX_COUNT)
    localStorage.setItem(GENERAL_KEY, '{not json')
    expect(readSaved()).toEqual({ keep: true, count: 3, rows: 1, how: 'edges' })
    localStorage.setItem(GENERAL_KEY, JSON.stringify({ keep: 'yes', count: 9999, rows: -2, how: 'middle' }))
    expect(readSaved()).toEqual({ keep: true, count: 3, rows: 1, how: 'edges' })
  })
})

describe('the strip, the menu, the keys', () => {
  it('the strip’s General group reads Select · Move · Copy · Rotate · Mirror · Array · Align · Group', () => {
    render(<App />)
    const g = within(strip()).getByRole('group', { name: 'General' })
    expect(within(g).getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual(['Select', 'Move', 'Copy', 'Rotate', 'Mirror', 'Array', 'Align', 'Group'])
    pickOffice()
    expect(within(g).getByRole('button', { name: 'Mirror' })).toHaveAttribute('title', expect.stringMatching(/\(I\)$/))
    expect(within(g).getByRole('button', { name: 'Array' })).toHaveAttribute('title', expect.stringMatching(/\(A\)$/))
    expect(within(g).getByRole('button', { name: 'Align' })).toHaveAttribute('title', expect.stringMatching(/\(Shift\+A\)$/))
  })

  it('the Tools menu runs them and the shortcuts window lists their keys', () => {
    render(<App />)
    pickOffice()
    pickMenu('Tools', 'Mirror')
    expect(useTool.getState().tool).toBe('mirror')
    pickMenu('Tools', 'Array')
    expect(useTool.getState().tool).toBe('array')
    pickMenu('Tools', 'Align')
    expect(useTool.getState().tool).toBe('align')
    closeMenus()
    pickMenu('Edit', 'Keyboard shortcuts…')
    closeMenus()
    const window = screen.getByRole('dialog', { name: 'Keyboard shortcuts' })
    const keys = (id: string) => Array.from(window.querySelector(`[data-command="${id}"]`)!.querySelectorAll('kbd')).map((k) => k.textContent)
    expect(keys('tool.mirror')).toEqual(['I'])
    expect(keys('tool.array')).toEqual(['A'])
    expect(keys('tool.align')).toEqual(['Shift+A'])
  })

  it('their keys collide with no other command, and none fires while typing in a field', () => {
    render(<App />)
    pickOffice()
    for (const [chord, id] of [['I', 'tool.mirror'], ['A', 'tool.array'], ['Shift+A', 'tool.align']] as const) {
      expect(keysOf(id)).toEqual([chord])
      expect(commands().filter((c) => keysOf(c.id).includes(chord)).map((c) => c.id)).toEqual([id])
      expect(commandForKey(chord, 'project')!.id).toBe(id)
    }
    const field = document.createElement('input')
    document.body.append(field)
    field.focus()
    for (const init of [{ key: 'i' }, { key: 'a' }, { key: 'A', shiftKey: true }]) fireEvent.keyDown(field, { bubbles: true, ...init })
    expect(useTool.getState().tool).toBe('select')
    field.remove()
  })
})
