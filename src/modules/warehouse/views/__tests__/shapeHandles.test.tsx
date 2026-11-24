// D.1 task 6 (the spec's *D.1*): the block editor's walls, bays and corners on the one set of shape handles
// (`views/editing/shape/`), in ghost mode: a wall dragged shows a dashed ghost and changes nothing until release; a value typed during
// the drag of an inner wall moves it by exactly that many metres (one undo step); a corner picked and Delete removes it; a locked step is opened
// and said; a press on a picked element still slides the elements; the camera holds still when the box grows at its low wall; every
// handle's press is cancelled (`beginDrag`). Today's tests (byHand, multiSelect, typedCourt) drive the same keys.
import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../../../App.tsx'
import { derive } from '../../../../engine/derive.ts'
import { demoProject } from '../../../../state/demo.ts'
import { emptyHistory } from '../../../../state/history.ts'
import { useApp } from '../../../../state/store.ts'
import { actions } from '../../../../state/actions/index.ts'
import { resetTyped, useTyped } from '../../../../views/editing/dimension/typed.ts'
import { useShapeGhost, useStretch } from '../../../../views/editing/shape/shapeState.ts'
import { useToast } from '../../../../views/layout/toast.ts'
import { useUi } from '../../../../views/layout/ui.ts'
import { generate } from '../../engine/generate.ts'
import { useUnits } from '../units.ts'
import { useWarehouse } from '../warehouseState.ts'
import { pxFor, screenAt } from './planScreen.ts'

vi.mock('../../../../views/scene/Scene.tsx', () => ({ Scene: () => <div data-testid="scene" /> }))
vi.mock('../WarehouseScene.tsx', () => ({ WarehouseScene: () => <div data-testid="warehouse-scene" /> }))

beforeEach(() => {
  localStorage.clear()
  const p = actions.addWarehouseType(demoProject()).project
  load(p)
  useUi.setState({ dialog: 'program', view: 'plan', panels: { left: true, right: true }, sheet: null })
  useWarehouse.setState({ programId: null, typeId: null, shown: null, tool: 'select', picked: [] })
  useStretch.setState({ stretch: null })
  useToast.setState({ toast: null })
  resetTyped()
})

function load(p: ReturnType<typeof demoProject>) {
  useApp.setState({ project: p, derived: derive(p), history: emptyHistory(), dragStart: null, selection: { massId: null, vertex: null, massIds: [] }, option: p.options[0].id })
}

const type = () => useApp.getState().project.warehouseTypes![0]
const steps = () => useApp.getState().history.past.length
const plan = () => document.querySelector('[data-warehouse-plan]')!
const viewBox = () => plan().getAttribute('viewBox')!.split(' ').map(Number)
const handle = (k: string) => document.querySelector(`[data-handle="${k}"]`)!
const key = (k: string) => fireEvent.keyDown(window, { key: k })
const keys = (text: string) => [...text].forEach((c) => key(c))
const ghost = () => plan().querySelector('[data-ghost]')
const press = (k: string) => fireEvent.pointerDown(handle(k), { clientX: 0, clientY: 0, pointerId: 1, button: 0 })
const pull = (k: string, dx: number, dy: number) => fireEvent.pointerMove(handle(k), { clientX: dx, clientY: dy, pointerId: 1 })
const release = (k: string, dx: number, dy: number) => fireEvent.pointerUp(handle(k), { clientX: dx, clientY: dy, pointerId: 1 })
const refOf = () => ({ kind: 'block-type', id: 'wt1' })

/** A notch cut into the front, nine metres deep (three modules), between module lines 31 and 35: it makes inner walls. */
function withNotch() {
  const p = useApp.getState().project
  const r = actions.shapeWarehouse(p, 'wt1', { kind: 'pull', edge: 'e1', from: 31, to: 35, by: -3 })
  expect(r.project).not.toBe(p)
  load(r.project)
}

/** The inner walls (not on the box), by their edge ids. */
const inner = () => generate(type()).edges.filter((e) => !e.outer)

describe('a wall dragged: a dashed ghost, applied on release', () => {
  it('shows a ghost of the result and changes nothing until the pointer is let go; one undo step', () => {
    render(<App />)
    const before = steps()
    expect(fireEvent.pointerDown(handle('edge-e2'), { clientX: 0, clientY: 0, pointerId: 1, button: 0 })).toBe(false)
    expect(ghost()).toBeNull()
    pull('edge-e2', pxFor(7), 0)
    // 7 m right: two modules of 3 m, drawn dashed, the project as it was
    expect(ghost()).not.toBeNull()
    expect(type().hall.length).toBe(200)
    expect(steps()).toBe(before)
    release('edge-e2', pxFor(7), 0)
    expect(ghost()).toBeNull()
    expect(type().hall.length).toBe(206)
    expect(steps()).toBe(before + 1)
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(type().hall.length).toBe(200)
  })

  it('Escape lets the ghost go and applies nothing', () => {
    render(<App />)
    const before = steps()
    press('edge-e2')
    pull('edge-e2', pxFor(7), 0)
    expect(ghost()).not.toBeNull()
    key('Escape')
    expect(ghost()).toBeNull()
    release('edge-e2', pxFor(7), 0)
    expect(type().hall.length).toBe(200)
    expect(steps()).toBe(before)
    expect(useTyped.getState().cur).toBeNull()
  })

  it('after Escape the pointer going on brings the ghost back no more: the drag is over', () => {
    render(<App />)
    const before = steps()
    press('edge-e2')
    pull('edge-e2', pxFor(7), 0)
    key('Escape')
    pull('edge-e2', pxFor(10), 0)
    expect(ghost()).toBeNull()
    release('edge-e2', pxFor(10), 0)
    expect(type().hall.length).toBe(200)
    expect(steps()).toBe(before)
    expect(useTyped.getState().cur).toBeNull()
  })

  it('its label says the new length in the block editor’s unit (feet too)', () => {
    render(<App />)
    press('edge-e2')
    pull('edge-e2', pxFor(7), 0)
    expect(screen.getByText('Length 206 m (176–224) · +6 m')).toBeInTheDocument()
    release('edge-e2', pxFor(7), 0)
    act(() => useUnits.setState({ unit: 'ft' }))
    press('edge-e2')
    pull('edge-e2', pxFor(7), 0)
    expect(screen.getByText(/^Length [\d.]+ ft \(.*\) · \+[\d.]+ ft$/)).toBeInTheDocument()
    key('Escape')
    release('edge-e2', pxFor(7), 0)
    act(() => useUnits.setState({ unit: 'm' }))
  })

  it('a press that moves no wall is a click: the edge picked', () => {
    render(<App />)
    press('edge-e2')
    release('edge-e2', 0, 0)
    expect(useWarehouse.getState().picked).toEqual([{ kind: 'edge', id: 'e2' }])
  })
})

describe('typed, in the block editor', () => {
  it('an inner wall: the number typed during the drag moves it by exactly that, one undo step', () => {
    withNotch()
    render(<App />)
    const w = inner().find((e) => e.horizontal)!
    const read = actions.shapeOf(useApp.getState().project, refOf())!
    const i = generate(type()).edges.findIndex((e) => e.id === w.id)
    const module = read.walls![i].module!
    const before = steps()
    const was = type().morphology
    const wasAt = generate(type()).edges.find((e) => e.id === w.id)!.a.y
    // pulled a little towards where the face looks, then 2 modules' worth of metres typed
    press(`edge-${w.id}`)
    pull(`edge-${w.id}`, 0, pxFor(module))
    expect(ghost()).not.toBeNull()
    keys(String(2 * module))
    key('Enter')
    expect(type().morphology).not.toEqual(was)
    // the wall went exactly the metres typed, whichever way the pull said
    expect(Math.abs(generate(type()).edges.find((e) => e.id === w.id)!.a.y - wasAt)).toBeCloseTo(2 * module, 6)
    expect(steps()).toBe(before + 1)
    // the pointer goes on and lets go: it changes nothing
    pull(`edge-${w.id}`, 0, pxFor(30))
    release(`edge-${w.id}`, 0, pxFor(30))
    expect(steps()).toBe(before + 1)
    expect(ghost()).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(type().morphology).toEqual(was)
  })

  it('a box wall typed right after the release corrects it, one undo step; its camera follows the origin', () => {
    render(<App />)
    const before = steps()
    const view = viewBox()
    press('edge-e4')
    pull('edge-e4', -pxFor(7), 0)
    release('edge-e4', -pxFor(7), 0)
    expect(type().hall.length).toBe(206)
    keys('3')
    key('Enter')
    expect(type().hall.length).toBe(203)
    expect(steps()).toBe(before + 1)
    // the left wall out 3 m: line A went 3 m, the camera with it, not framed again
    const after = viewBox()
    expect(after[0]).toBeCloseTo(view[0] + 3)
    expect(after[2]).toBeCloseTo(view[2])
  })

  it('a locked step is opened and said, as today, when a number is typed', () => {
    act(() => {
      for (const s of ['grid', 'hall', 'columns'] as const) useApp.getState().apply((p) => actions.lockWarehouseStep(p, 'wt1', s))
    })
    render(<App />)
    press('edge-e2')
    pull('edge-e2', pxFor(7), 0)
    keys('6')
    key('Enter')
    expect(type().hall.length).toBe(206)
    expect(type().locks).toEqual({ grid: 'locked', columns: 'again' })
    expect(useToast.getState().toast?.text).toBe('② Hall reopened; ③ to lock again. Ctrl+Z undoes it.')
  })
})

describe('a kept correction goes with its viewport', () => {
  it('closing the block editor lets it go: no digits swallowed afterwards', () => {
    render(<App />)
    press('edge-e4')
    pull('edge-e4', -pxFor(7), 0)
    release('edge-e4', -pxFor(7), 0)
    expect(useTyped.getState().cur?.phase).toBe('kept')
    act(() => useUi.setState({ dialog: null }))
    expect(useTyped.getState().cur).toBeNull()
  })

  it('unmounting the viewport lets it go too', () => {
    const { unmount } = render(<App />)
    press('edge-e4')
    pull('edge-e4', -pxFor(7), 0)
    release('edge-e4', -pxFor(7), 0)
    expect(useTyped.getState().cur?.mode).toBe('ghost')
    unmount()
    expect(useTyped.getState().cur).toBeNull()
  })
})

describe('the camera holds still', () => {
  it('when the box grows at its low wall (the left one, dragged): the plan moves with the origin, same zoom', () => {
    render(<App />)
    const view = viewBox()
    press('edge-e4')
    pull('edge-e4', -pxFor(7), 0)
    // the ghost is the result in the frame as it stands: nothing moved yet
    expect(viewBox()).toEqual(view)
    release('edge-e4', -pxFor(7), 0)
    const after = viewBox()
    expect(after[0]).toBeCloseTo(view[0] + 6)
    expect(after[1]).toBeCloseTo(view[1])
    expect(after[2]).toBeCloseTo(view[2])
  })
})

describe('a corner', () => {
  it('picked by a click, removed by Delete (its step filled in), one undo step', () => {
    withNotch()
    render(<App />)
    const w = inner().find((e) => e.horizontal)!
    const before = steps()
    const outline = type().morphology.outline!.length
    const dot = handle(`corner-${w.id}`)
    fireEvent.click(dot)
    // picked: the corner's dot is filled
    expect(useWarehouse.getState().picked).toEqual([])
    key('Delete')
    expect(type().morphology.outline?.length ?? 4).toBeLessThan(outline)
    expect(steps()).toBe(before + 1)
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(type().morphology.outline).toHaveLength(outline)
  })

  it('Shift+F chamfers the corner picked, as the Chamfer tool’s key does on the site: one undo step; with no corner picked it says so (Phase D.3, task 1)', () => {
    render(<App />)
    const before = steps()
    fireEvent.keyDown(window, { key: 'F', shiftKey: true })
    expect(useToast.getState().toast?.text).toMatch(/pick a corner/i)
    expect(steps()).toBe(before)
    fireEvent.click(handle('corner-e1'))
    fireEvent.keyDown(window, { key: 'F', shiftKey: true })
    expect(type().morphology.outline.some((c) => c.chamfer && c.chamfer[0] > 0 && c.chamfer[1] > 0)).toBe(true)
    expect(steps()).toBe(before + 1)
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(type().morphology.outline.some((c) => c.chamfer)).toBe(false)
  })

  it('a double click on it removes it too', () => {
    withNotch()
    render(<App />)
    const w = inner().find((e) => e.horizontal)!
    const outline = type().morphology.outline!.length
    fireEvent.doubleClick(handle(`corner-${w.id}`))
    expect(type().morphology.outline?.length ?? 4).toBeLessThan(outline)
  })
})

describe('the elements', () => {
  it('a press on a picked element is the plan’s: the picked ones slide along their wall, one undo step', () => {
    render(<App />)
    // two docks picked by their ids, the wall's line pressed on one of them
    act(() => useWarehouse.getState().setPicked([{ kind: 'element', id: 'e59' }, { kind: 'element', id: 'e60' }]))
    const before = steps()
    const modules = () => type().elements.filter((e) => e.id === 'e59' || e.id === 'e60').map((e) => e.module)
    const first = modules()
    fireEvent.pointerDown(handle('edge-line-e1'), { ...screenAt({ x: 188.5, y: -0.3 }), pointerId: 1, button: 0 })
    fireEvent.pointerMove(plan(), { ...screenAt({ x: 197.5, y: -0.3 }), pointerId: 1 })
    expect(document.querySelectorAll('[data-slide-preview] path')).toHaveLength(2)
    fireEvent.pointerUp(plan(), { ...screenAt({ x: 197.5, y: -0.3 }), pointerId: 1, button: 0 })
    expect(modules()).toEqual(first.map((k) => k + 3))
    expect(steps()).toBe(before + 1)
    // the walls did not move
    expect(type().hall.width).toBe(96)
  })
})

describe('the bay and its stretch', () => {
  it('its end pill makes the stretch longer, on the module lines; the face pill makes a bump', () => {
    render(<App />)
    fireEvent.doubleClick(handle('edge-line-e1'), screenAt({ x: 100, y: 0 }))
    expect(useWarehouse.getState().picked).toEqual([{ kind: 'stretch', id: 'e1', from: 31, to: 35 }])
    // the end pill 12 m to the right: the stretch to the module line there
    const to = handle('stretch-to')
    fireEvent.pointerDown(to, { ...screenAt({ x: 106, y: 0 }), pointerId: 1, button: 0 })
    fireEvent.pointerMove(to, { ...screenAt({ x: 118, y: 0 }), pointerId: 1 })
    fireEvent.pointerUp(to, { ...screenAt({ x: 118, y: 0 }), pointerId: 1, button: 0 })
    const s = useWarehouse.getState().picked[0]
    expect(s).toMatchObject({ kind: 'stretch', id: 'e1', from: 31 })
    expect((s as { to: number }).to).toBeGreaterThan(35)
    // the face pill 6 m down the plan: two modules out of the front, a bump (the box grows with it); the dashed ghost first
    const face = handle('stretch-face')
    const before = steps()
    fireEvent.pointerDown(face, { clientX: 0, clientY: 0, pointerId: 1, button: 0 })
    fireEvent.pointerMove(face, { clientX: 0, clientY: pxFor(6), pointerId: 1 })
    expect(ghost()).not.toBeNull()
    expect(steps()).toBe(before)
    fireEvent.pointerUp(face, { clientX: 0, clientY: pxFor(6), pointerId: 1 })
    expect(steps()).toBe(before + 1)
    expect(type().hall.width).toBe(102)
  })
})

// ---- D.2 task 6: the outline free, the module lines a snap, the grid drawn clipped -------------------------------------------

/** The type's face with its first corner dragged off its lines: an angled wall, and bays cut by it. */
function withAngle() {
  const p = useApp.getState().project
  const t = p.warehouseTypes![0]
  const g = generate(t)
  const v = g.face.vertices[2]
  const w = actions.editShape(p, refOf(), { op: 'vertex', vertex: 2, to: { x: v.x - 30, y: v.y + 24 } })
  expect(w.reason).toBeUndefined()
  load(w.project)
}

describe('a wall is free; the module lines are a snap', () => {
  it('pulled with Shift it lands where the pointer is: 7.3 m, not whole modules', () => {
    render(<App />)
    press('edge-e2')
    fireEvent.pointerMove(handle('edge-e2'), { clientX: pxFor(7.3), clientY: 0, pointerId: 1, shiftKey: true })
    expect(screen.getByText('Length 207.3 m (176–224) · +7.3 m')).toBeInTheDocument()
    fireEvent.pointerUp(handle('edge-e2'), { clientX: pxFor(7.3), clientY: 0, pointerId: 1 })
    expect(type().hall.length).toBeCloseTo(207.3, 6)
  })

  it('pulled near a module line it lands on it, and the plan shows the mark', () => {
    render(<App />)
    press('edge-e2')
    // 6.1 m: the module line 6 m out is within 8 px
    pull('edge-e2', pxFor(6.1), 0)
    expect(plan().querySelector('[data-snap]')).not.toBeNull()
    release('edge-e2', pxFor(6.1), 0)
    expect(type().hall.length).toBe(206)
  })

  it('its mark is on the module line the wall’s reference stands on, not on its face (0.3 m out of it)', () => {
    render(<App />)
    press('edge-e2')
    pull('edge-e2', pxFor(6.1), 0)
    const line = plan().querySelector('[data-snap] line')!
    // the right wall's reference line is at 200 m; 6 m out is 206, its face 206.3
    expect(Number(line.getAttribute('x1'))).toBeCloseTo(206, 6)
    release('edge-e2', pxFor(6.1), 0)
  })

  it('typed during the drag it is exact: 7.3 sets 7.3 m, one undo step', () => {
    render(<App />)
    const before = steps()
    press('edge-e2')
    pull('edge-e2', pxFor(4), 0)
    keys('7.3')
    key('Enter')
    expect(type().hall.length).toBeCloseTo(207.3, 6)
    expect(steps()).toBe(before + 1)
    release('edge-e2', pxFor(30), 0)
    expect(steps()).toBe(before + 1)
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(type().hall.length).toBe(200)
  })

  it('a corner dot dragged makes an angled wall: the ghost dashed, applied on release, the camera still', () => {
    render(<App />)
    const before = steps()
    const view = viewBox()
    const g = generate(type())
    const v = g.face.vertices[2]
    // the corner where edge e2 ends, by its dot; 30 m in, 24 m up
    fireEvent.pointerDown(handle(`corner-${g.edges[2].id}`), { ...screenAt(v), pointerId: 1, button: 0 })
    fireEvent.pointerMove(handle(`corner-${g.edges[2].id}`), { ...screenAt({ x: v.x - 30, y: v.y + 24 }), pointerId: 1, shiftKey: true })
    expect(ghost()).not.toBeNull()
    expect(steps()).toBe(before)
    expect(viewBox()).toEqual(view)
    fireEvent.pointerUp(handle(`corner-${g.edges[2].id}`), { ...screenAt({ x: v.x - 30, y: v.y + 24 }), pointerId: 1 })
    expect(steps()).toBe(before + 1)
    expect(generate(type()).edges.some((e) => e.axis === null)).toBe(true)
    // the same zoom
    expect(viewBox().slice(2)).toEqual(view.slice(2))
  })

  it('a corner dragged out of the block lands its reference corner on the module nodes there (the lines go on past the box)', () => {
    render(<App />)
    const g = generate(type())
    const v = g.face.vertices[0]
    // the face corner is 0.3 m out of the reference corner (0, 0): the node 6 m out of the box is (−6, −6), its face corner (−6.3, −6.3)
    fireEvent.pointerDown(handle(`corner-${g.edges[0].id}`), { ...screenAt(v), pointerId: 1, button: 0 })
    const to = screenAt({ x: -6.3 + 0.05, y: -6.3 - 0.05 })
    fireEvent.pointerMove(handle(`corner-${g.edges[0].id}`), { ...to, pointerId: 1 })
    // the ghost's corner is there (to the millimetre the outline is stored at: Phase D.3), the pointer 0.05 m off it
    const ghost = useShapeGhost.getState().ghost?.read.contour.vertices[0]
    expect(ghost!.x).toBeCloseTo(-6.3, 3)
    expect(ghost!.y).toBeCloseTo(-6.3, 3)
    fireEvent.pointerUp(handle(`corner-${g.edges[0].id}`), { ...to, pointerId: 1 })
  })

  it('Alt + double click on a wall adds a corner there, and picks no bay', () => {
    render(<App />)
    const n = generate(type()).edges.length
    fireEvent.doubleClick(handle('edge-line-e1'), { ...screenAt({ x: 100, y: 0 }), altKey: true })
    expect(generate(type()).edges.length).toBe(n + 1)
    expect(useWarehouse.getState().picked).toEqual([])
  })

  it('a plain double click on a wall picks its bay and adds no corner', () => {
    render(<App />)
    const n = generate(type()).edges.length
    const before = useApp.getState().project
    fireEvent.doubleClick(handle('edge-line-e1'), screenAt({ x: 100, y: 0 }))
    expect(generate(type()).edges.length).toBe(n)
    expect(useApp.getState().project).toBe(before)
    expect(useWarehouse.getState().picked).toEqual([{ kind: 'stretch', id: 'e1', from: 31, to: 35 }])
  })
})

describe('the grid is drawn clipped by the outline', () => {
  it('a rectangle: every module line runs the box, nothing is cut', () => {
    render(<App />)
    const g = generate(type())
    expect(g.cells.every((c) => c.whole)).toBe(true)
    expect(Number(plan().querySelector('[data-modules]')!.getAttribute('data-modules'))).toBe(g.lines.modules.length)
    expect(plan().querySelectorAll('[data-partial-bay]')).toHaveLength(0)
  })

  it('an angled wall: the lines stop at it (data-modules counts the clipped segments) and a partial bay is drawn cut', () => {
    withAngle()
    render(<App />)
    const g = generate(type())
    const cut = g.cells.filter((c) => !c.whole)
    expect(cut.length).toBeGreaterThan(0)
    const shown = Number(plan().querySelector('[data-modules]')!.getAttribute('data-modules'))
    expect(shown).toBe(g.lines.modules.length)
    // drawn shorter than the box's lines would run: the angled wall takes the corner off them
    const d = plan().querySelector('[data-modules]')!.getAttribute('d')!
    const drawn = [...d.matchAll(/M([-\d.e]+) ([-\d.e]+)L([-\d.e]+) ([-\d.e]+)/g)].reduce((sum, m) => sum + Math.hypot(Number(m[3]) - Number(m[1]), Number(m[4]) - Number(m[2])), 0)
    const off = (run: typeof g.runs.x) => run.modules.filter((v) => !run.lines.some((l) => Math.abs(l - v) < 1e-6)).length
    const box = off(g.runs.x) * g.runs.y.length + off(g.runs.y) * g.runs.x.length
    expect(drawn).toBeGreaterThan(0)
    expect(drawn).toBeLessThan(box - 1)
    expect(plan().querySelectorAll('[data-partial-bay]')).toHaveLength(cut.length)
    expect(plan().querySelector('[data-column-lines]')).not.toBeNull()
  })
})

describe('nothing stands on a wall that is not along the grid (the block editor)', () => {
  it.each([
    ['dock', 'Docks, doors and patterns go on walls along the grid.'],
    ['door', 'Docks, doors and patterns go on walls along the grid.'],
    ['pattern', 'Docks, doors and patterns go on walls along the grid.'],
    ['court', 'A truck court goes on a wall along the grid.'],
  ] as const)('%s pressed on an angled wall says why and changes nothing', (tool, text) => {
    withAngle()
    render(<App />)
    act(() => useWarehouse.setState({ tool }))
    const e = generate(type()).edges.find((x) => x.axis === null)!
    const mid = { x: (e.a.x + e.b.x) / 2, y: (e.a.y + e.b.y) / 2 }
    const before = useApp.getState().project
    fireEvent.pointerDown(plan(), { ...screenAt(mid), pointerId: 1, button: 0 })
    fireEvent.pointerUp(plan(), { ...screenAt(mid), pointerId: 1, button: 0 })
    expect(useToast.getState().toast?.text).toBe(text)
    expect(useApp.getState().project).toBe(before)
  })
})

describe('the Hole tool cuts a free rectangle; the module lines a snap', () => {
  const hole = (a: { x: number; y: number }, b: { x: number; y: number }, extra: object = {}) => {
    fireEvent.pointerDown(plan(), { ...screenAt(a), pointerId: 1, button: 0, ...extra })
    fireEvent.pointerMove(plan(), { ...screenAt(b), pointerId: 1, ...extra })
    fireEvent.pointerUp(plan(), { ...screenAt(b), pointerId: 1, button: 0, ...extra })
  }
  const box = (h: { vertices: { x: number; y: number }[] }) => {
    const xs = h.vertices.map((v) => v.x)
    const ys = h.vertices.map((v) => v.y)
    return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
  }

  it('with Shift it is exactly where it is drawn, in metres', () => {
    render(<App />)
    act(() => useWarehouse.setState({ tool: 'hole' }))
    const before = steps()
    hole({ x: 50, y: 20.1 }, { x: 80.7, y: 40.3 }, { shiftKey: true })
    const h = generate(type()).holes.at(-1)!
    expect(box(h).map((v) => Math.round(v * 1000) / 1000)).toEqual([50, 20.1, 80.7, 40.3])
    expect(steps()).toBe(before + 1)
  })

  it('without Shift its corners land on the module nodes within the aperture', () => {
    render(<App />)
    act(() => useWarehouse.setState({ tool: 'hole' }))
    const { x, y } = generate(type()).runs
    const [a, b] = [{ x: x.modules[16], y: y.modules[6] }, { x: x.modules[27], y: y.modules[13] }]
    hole({ x: a.x + 0.05, y: a.y - 0.05 }, { x: b.x - 0.05, y: b.y + 0.05 })
    expect(box(generate(type()).holes.at(-1)!).map((v) => Math.round(v * 1000) / 1000)).toEqual([a.x, a.y, b.x, b.y].map((v) => Math.round(v * 1000) / 1000))
  })

  it('a click without a drag cuts nothing and says to drag a rectangle', () => {
    render(<App />)
    act(() => useWarehouse.setState({ tool: 'hole' }))
    const before = useApp.getState().project
    hole({ x: 50, y: 20 }, { x: 50, y: 20 }, { shiftKey: true })
    expect(useApp.getState().project).toBe(before)
    expect(useToast.getState().toast?.text).toBe('Drag a rectangle to cut a hole.')
  })

  it('one that does not fit inside the block cuts nothing and says why', () => {
    render(<App />)
    act(() => useWarehouse.setState({ tool: 'hole' }))
    const before = useApp.getState().project
    hole({ x: 150, y: 20.1 }, { x: 260.7, y: 40.3 }, { shiftKey: true })
    expect(useApp.getState().project).toBe(before)
  })
})

// ---- D.2 review: a corner dragged out of the box moves the frame, and the pointer stays on the corner -----------------------

describe('a corner dragged out past the box’s low corner (the frame shifts)', () => {
  const dot = () => handle(`corner-${generate(type()).edges[0].id}`)
  const shown = () => useShapeGhost.getState().ghost?.read.contour.vertices[0]

  it('the ghost has the corner under the pointer and, on release, the camera follows the frame', () => {
    render(<App />)
    const view = viewBox()
    const v = generate(type()).face.vertices[0]
    const to = { x: v.x - 3, y: v.y - 3 }
    fireEvent.pointerDown(dot(), { ...screenAt(v), pointerId: 1, button: 0 })
    fireEvent.pointerMove(dot(), { ...screenAt(to), pointerId: 1, shiftKey: true })
    // the ghost is drawn in the frame as it stands: its corner is where the pointer is
    expect(shown()!.x).toBeCloseTo(to.x, 3)
    expect(shown()!.y).toBeCloseTo(to.y, 3)
    const end = screenAt(to)
    fireEvent.pointerUp(dot(), { ...end, pointerId: 1 })
    // the box grew by 3 m each way, the same size on screen, and the camera moved with the frame: the corner is still under the pointer
    const after = viewBox()
    expect(after.slice(2)).toEqual(view.slice(2))
    expect(after[0]).not.toBeCloseTo(view[0])
    const at = screenAt(generate(type()).face.vertices[0])
    // (the outline is stored to the millimetre, Phase D.3: to a fraction of a pixel)
    expect(at.clientX).toBeCloseTo(end.clientX, 2)
    expect(at.clientY).toBeCloseTo(end.clientY, 2)
  })

  it('a point typed during the drag does the same', () => {
    render(<App />)
    const view = viewBox()
    const v = generate(type()).face.vertices[0]
    fireEvent.pointerDown(dot(), { ...screenAt(v), pointerId: 1, button: 0 })
    fireEvent.pointerMove(dot(), { ...screenAt({ x: v.x - 1, y: v.y - 1 }), pointerId: 1, shiftKey: true })
    // where the corner is to be on the screen: the camera as it stands before the frame moves
    const want = screenAt({ x: v.x - 3, y: v.y - 3 })
    keys(`@-3,-3`)
    key('Enter')
    const now = generate(type()).face.vertices[0]
    expect(viewBox()[0]).not.toBeCloseTo(view[0])
    // the corner sits at the typed point in the frame the camera now shows
    const at = screenAt(now)
    // the outline is stored to the millimetre (Phase D.3): the corner is at the typed point to a fraction of a pixel
    expect(at.clientX).toBeCloseTo(want.clientX, 2)
    expect(at.clientY).toBeCloseTo(want.clientY, 2)
  })
})

describe('the bay pick on a type with a cut corner', () => {
  it('picks the same bay of a wall as on the plain type: the walls are read off the face, not off its arcs', () => {
    const pickBay = () => {
      const { unmount } = render(<App />)
      const g = generate(type())
      const e = g.edges[2]
      const y = g.face.vertices[2].y
      fireEvent.doubleClick(handle(`edge-line-${e.id}`), screenAt({ x: 100, y }))
      const got = useWarehouse.getState().picked
      unmount()
      useWarehouse.setState({ picked: [] })
      return got
    }
    const plain = pickBay()
    expect(plain).toHaveLength(1)
    const r = actions.editShape(useApp.getState().project, refOf(), { op: 'chamfer', vertex: 0, a: 30, b: 30 })
    expect(r.reason).toBeUndefined()
    load(r.project)
    expect(pickBay()).toEqual(plain)
  })
})

describe('a dock pressed on the last module before an angled wall', () => {
  it('is put: the angled wall beside it does not refuse a valid press on the wall along the grid', () => {
    // the front's right end cut off by an angled wall from the module line at 189 m, and the front's last module stands right at its foot
    const p = useApp.getState().project
    const cut = actions.editShape(p, refOf(), { op: 'insert', wall: 0, at: { x: 189, y: 0 } })
    const corner = generate(cut.project.warehouseTypes![0]).face.vertices.length
    const angled = actions.editShape(cut.project, refOf(), { op: 'vertex', vertex: 2, to: { x: 200, y: 6 } })
    expect(angled.reason).toBeUndefined()
    expect(corner).toBe(5)
    load(angled.project)
    expect(generate(type()).edges.some((e) => e.axis === null)).toBe(true)
    render(<App />)
    act(() => useWarehouse.setState({ tool: 'dock' }))
    const before = useApp.getState().project
    const at = { x: 188.9, y: -0.14 }
    fireEvent.pointerDown(plan(), { ...screenAt(at), pointerId: 1, button: 0 })
    fireEvent.pointerUp(plan(), { ...screenAt(at), pointerId: 1, button: 0 })
    expect(useToast.getState().toast).toBeNull()
    expect(useApp.getState().project).not.toBe(before)
  })
})
