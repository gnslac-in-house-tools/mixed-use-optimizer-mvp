// The type's plan by hand (Decisions "Warehouse by hand", "Block shape"): a box's wall dragged by whole modules (the
// left and the front ones moving the origin), an inner one alone; a hand edit on a locked step reopens it (the later
// locked ones to lock again), on a step still to do it says which step comes first. A double click on a wall picks
// its bay, a stretch, whose face pulled out makes a bump; a zone picked, split, given a program by its menu and by a
// program's chip. Dock, Door and Pattern by module (Decision "Elements by module", BE.4): a press on a module puts or
// takes one, a press outside in front of a bay fills or empties it, a drag along the wall the modules it passes; Court
// on a wall and its pill; an element picked on its wall or by its row, its module lit, its menu, Delete.
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../../../App.tsx'
import { derive } from '../../../../engine/derive.ts'
import { generate } from '../../engine/generate.ts'
import { newWarehouseType } from '../../engine/defaults.ts'
import { demoProject } from '../../../../state/demo.ts'
import { emptyHistory } from '../../../../state/history.ts'
import { useApp } from '../../../../state/store.ts'
import { actions } from '../../../../state/actions/index.ts'
import { useToast } from '../../../../views/layout/toast.ts'
import { useUi } from '../../../../views/layout/ui.ts'
import { bayModules } from '../../engine/dockRule.ts'
import { edgeAt, elementAt, holeFrom, splitAt, stretchAt } from '../handleMath.ts'
import { useWarehouse } from '../warehouseState.ts'
import { pxFor, screenAt } from './planScreen.ts'
import type { Point } from '../../../../model/schema.ts'

vi.mock('../../../../views/scene/Scene.tsx', () => ({ Scene: () => <div data-testid="scene" /> }))
vi.mock('../WarehouseScene.tsx', () => ({ WarehouseScene: () => <div data-testid="warehouse-scene" /> }))

const t0 = newWarehouseType('wt1', 'Warehouse A', { program: 'warehouse' })

// (a wall by whole modules, a stretch pulled out or pushed in, its ends: the shape engine's now, checked in shapeBlock.test.ts and shapeHandles.test.tsx)
describe('what is under a press, in numbers', () => {
  it('an edge under the pointer; a double click’s stretch (the bay pressed, on the module lines); a hole on the module lines', () => {
    const g = generate(t0)
    const front = edgeAt(g, { x: 50, y: -0.5 }, 2)!
    expect(front.id).toBe('e1')
    expect(edgeAt(g, { x: 50, y: 50 }, 2)).toBeNull()
    // at 50 m: the fifth bay (46–58 m), after the end bay's 3 modules
    const s = stretchAt(g.runs, front, 50)!
    expect(s).toEqual({ from: 15, to: 19 })
    expect(holeFrom(g.runs, { x: 31, y: 13 }, { x: 44, y: 23 })).toEqual({ x: [10, 14], y: [4, 8] })
  })
})

describe('a hand edit and the locks', () => {
  it('editWarehouseStep: any step (Decision "Free steps"), a locked one reopened; nothing changed: the same project', () => {
    let p = actions.addWarehouseType(demoProject()).project
    // the hall before the grid is locked
    expect(actions.editWarehouseStep(p, 'wt1', 'hall', { length: 206 }).warehouseTypes![0].hall.length).toBe(206)
    expect(actions.editWarehouseStep(p, 'wt1', 'hall', { length: 200 })).toBe(p)
    p = actions.editWarehouseStep(p, 'wt1', 'grid', { x: 10 })
    expect(p.warehouseTypes![0].grid.x).toBe(10)
    for (const s of ['grid', 'hall', 'columns'] as const) p = actions.lockWarehouseStep(p, 'wt1', s)
    p = actions.editWarehouseStep(p, 'wt1', 'hall', { length: 206 })
    expect(p.warehouseTypes![0]).toMatchObject({ hall: { length: 206 }, locks: { grid: 'locked', columns: 'again' } })
  })
})

beforeEach(() => {
  localStorage.clear()
  const p = actions.addWarehouseType(demoProject()).project
  useApp.setState({ project: p, derived: derive(p), history: emptyHistory(), dragStart: null, selection: { massId: null, vertex: null, massIds: [] }, option: p.options[0].id })
  useUi.setState({ dialog: 'program', view: 'plan', panels: { left: true, right: true }, sheet: null })
  useWarehouse.setState({ programId: null, typeId: null, shown: null, tool: 'select', picked: [] })
  useToast.setState({ toast: null })
})
const type = () => useApp.getState().project.warehouseTypes![0]

describe('on the plan', () => {
  const handle = (k: string) => document.querySelector(`[data-handle="${k}"]`)!
  const drag = (k: string, dx: number, dy: number) => {
    fireEvent.pointerDown(handle(k), { clientX: 0, clientY: 0, pointerId: 1, button: 0 })
    fireEvent.pointerMove(handle(k), { clientX: dx, clientY: dy, pointerId: 1 })
    fireEvent.pointerUp(handle(k), { clientX: dx, clientY: dy, pointerId: 1 })
  }

  it('no step waits for another (Decision "Free steps"): the right wall dragged with nothing locked, no toast', () => {
    render(<App />)
    // 201 m right: 67 modules of 3 m
    drag('edge-e2', pxFor(201), 0)
    expect(type().hall.length).toBe(401)
    expect(type().locks).toBeUndefined()
    expect(useToast.getState().toast).toBeNull()
  })

  it('the right wall dragged: the hall longer by whole modules, its step reopened, one undo step', () => {
    act(() => {
      for (const s of ['grid', 'hall', 'columns'] as const) useApp.getState().apply((p) => actions.lockWarehouseStep(p, 'wt1', s))
    })
    render(<App />)
    // 201 m right: 67 modules of 3 m
    drag('edge-e2', pxFor(201), 0)
    expect(type().hall.length).toBe(401)
    expect(type().locks).toEqual({ grid: 'locked', columns: 'again' })
    expect(useToast.getState().toast?.text).toBe('② Hall reopened; ③ to lock again. Ctrl+Z undoes it.')
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(type().hall.length).toBe(200)
  })
})

describe('the shape and the zones by hand (W.12, Decision "Block shape")', () => {
  it('in numbers: where Split splits', () => {
    const runs = generate(t0).runs
    expect(splitAt([{ id: '1', x: [0, 66], y: [0, 32] }], runs, { x: 101, y: 50 })).toMatchObject({ zone: '1', axis: 'x', k: 33 })
    expect(splitAt([{ id: '1', x: [0, 66], y: [0, 32] }], runs, { x: 101.5, y: 50.8 })).toMatchObject({ axis: 'y', k: 17 })
  })

  const lockTo = (n: number) =>
    act(() => {
      for (const s of (['grid', 'hall', 'columns', 'envelope', 'morphology'] as const).slice(0, n)) useApp.getState().apply((p) => actions.lockWarehouseStep(p, 'wt1', s))
    })
  const plan = () => screen.getByRole('img', { name: 'The warehouse type in plan' })
  const click = (el: Element, at = screenAt({ x: 100, y: 48 })) => {
    fireEvent.pointerDown(el, { ...at, pointerId: 1, button: 0 })
    fireEvent.pointerUp(el, { ...at, pointerId: 1, button: 0 })
  }

  it('a click picks the zone under it; Split splits it; its menu gives a program, and a chip of the palette', () => {
    lockTo(4)
    render(<App />)
    // the hall's middle (100, 48): zone 1
    click(plan())
    expect(useWarehouse.getState().picked).toEqual([{ kind: 'zone', id: '1' }])
    expect(plan().querySelector('[data-picked="zone:1"]')).not.toBeNull()
    fireEvent.click(within(screen.getByRole('group', { name: 'Edit' })).getByRole('button', { name: 'Split' }))
    click(plan())
    expect(type().morphology.zones!.map((z) => z.x)).toEqual([
      [0, 33],
      [33, 66],
    ])
    fireEvent.keyDown(window, { key: 'Escape' })
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(useWarehouse.getState()).toMatchObject({ picked: [], tool: 'select' })
    // the right-click menu on the zone there (the second, from the middle on)
    fireEvent.contextMenu(plan(), screenAt({ x: 120, y: 48 }))
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: 'Office' }))
    expect(type().morphology.zones![1].program).toBe('office')
    // the first picked, a program's chip clicked (jsdom's drags have no place: the drop is checked in the browser)
    click(plan(), screenAt({ x: 60, y: 48 }))
    fireEvent.click(within(screen.getByRole('list', { name: 'Programs' })).getByRole('button', { name: 'Guard house' }))
    expect(type().morphology.zones![0].program).toBe('guardhouse')
  })

  it('a double click on a wall: its bay picked, a stretch; its face pulled down the plan, a bump, the box with it', () => {
    lockTo(4)
    render(<App />)
    fireEvent.doubleClick(document.querySelector('[data-handle="edge-line-e1"]')!, screenAt({ x: 100, y: 0 }))
    // at 100 m: the bay of 94–106 m, module lines 31 to 35
    expect(useWarehouse.getState().picked).toEqual([{ kind: 'stretch', id: 'e1', from: 31, to: 35 }])
    expect(document.querySelector('[data-stretch="e1:31-35"]')).not.toBeNull()
    // 9 m down the plan, three modules out of the front
    const face = document.querySelector('[data-handle="stretch-face"]')!
    fireEvent.pointerDown(face, { clientX: 0, clientY: 0, pointerId: 1, button: 0 })
    fireEvent.pointerMove(face, { clientX: 0, clientY: pxFor(9), pointerId: 1 })
    fireEvent.pointerUp(face, { clientX: 0, clientY: pxFor(9), pointerId: 1 })
    expect(type().morphology.outline).toHaveLength(8)
    expect(type().hall.width).toBe(105)
    expect(useWarehouse.getState().picked).toEqual([{ kind: 'edge', id: 'e1' }])
  })
})

describe('elements by the tools, module by module (BE.4)', () => {
  it('in numbers: a bay’s modules on the box now', () => {
    const g = generate(t0)
    const front = g.edges.find((e) => e.id === 'e1')!
    // the default docks: one on every module of the front's interior bays (modules 3–62; bay 3 its modules 11–14)
    expect(t0.elements).toHaveLength(60)
    expect(bayModules(g.runs, front, 3)).toEqual([11, 12, 13, 14])
  })

  const plan = () => screen.getByRole('img', { name: 'The warehouse type in plan' })
  // the block editor's own Elements group (the Tools strip has an Elements group too)
  const tool = (name: string) => fireEvent.click(within(within(screen.getByRole('dialog', { name: 'Program' })).getByRole('group', { name: 'Elements' })).getByRole('button', { name }))
  /** A press on the plan at a point of the block's frame (m), let go at `to`: y = −0.14 m is inside the front wall,
   *  −4.2 m out of it; x = 102 m is module 33 (in bay 8: 94–106 m, modules 31–34), 114 m module 37. */
  const press = (at: Point, to: Point = at) => {
    fireEvent.pointerDown(plan(), { ...screenAt(at), pointerId: 1, button: 0 })
    if (to.x !== at.x || to.y !== at.y) fireEvent.pointerMove(plan(), { ...screenAt(to), pointerId: 1 })
    fireEvent.pointerUp(plan(), { ...screenAt(to), pointerId: 1, button: 0 })
  }
  const inWall = { x: 102, y: -0.14 }
  const outside = { x: 102, y: -4.2 }
  const docks = () =>
    type()
      .elements.filter((e) => e.kind === 'dock')
      .map((e) => e.module)
      .sort((a, b) => a - b)

  it('Dock: a press on a module takes its dock away alone; again, puts it back; one undo step each', () => {
    render(<App />)
    tool('Dock')
    press(inWall)
    expect(docks()).toHaveLength(59)
    expect(docks()).not.toContain(33)
    expect(docks()).toContain(32)
    expect(docks()).toContain(34)
    press(inWall)
    expect(docks()).toHaveLength(60)
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(docks()).toHaveLength(59)
  })

  it('Dock: a press outside the block in front of a full bay empties it; again, fills it', () => {
    render(<App />)
    tool('Dock')
    press(outside)
    expect(docks()).toHaveLength(56)
    expect(docks().some((k) => k >= 31 && k <= 34)).toBe(false)
    press(outside)
    expect(docks()).toHaveLength(60)
    // a bay with some: filled
    press(inWall)
    press(outside)
    expect(docks()).toHaveLength(60)
  })

  it('Dock: a press on a dock’s drawn bar (out of the wall) takes that dock alone, not the bay', () => {
    render(<App />)
    tool('Dock')
    // the bar stands 1.5 m out of the face (y = −0.3 to −1.8 m)
    press({ x: 102, y: -1 })
    expect(docks()).toHaveLength(59)
    expect(docks()).not.toContain(33)
    expect(docks()).toContain(32)
    expect(docks()).toContain(34)
  })

  it('Dock: a drag along the wall from a module takes away every module it passes, as its press decided, in one undo step', () => {
    render(<App />)
    tool('Dock')
    press(inWall, { x: 114, y: -0.14 })
    expect(docks()).toHaveLength(55)
    expect(docks().some((k) => k >= 33 && k <= 37)).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(docks()).toHaveLength(60)
  })

  it('Door and Pattern: one on the module pressed, the dock there kept; a pattern named Downpipe', () => {
    render(<App />)
    tool('Door')
    press(inWall)
    expect(type().elements.filter((e) => e.kind === 'door').map((e) => [e.edge, e.module, e.width])).toEqual([['e1', 33, 4]])
    tool('Pattern')
    press(inWall)
    expect(type().elements.filter((e) => e.kind === 'pattern').map((e) => [e.name, e.module])).toEqual([['Downpipe', 33]])
    expect(docks()).toHaveLength(60)
  })

  it('Select: a press on a dock picks it alone; Delete removes it alone', () => {
    render(<App />)
    const line = document.querySelector('[data-handle="edge-line-e1"]')!
    fireEvent.pointerDown(line, { ...screenAt({ x: 100, y: -0.14 }), pointerId: 1, button: 0 })
    fireEvent.pointerUp(line, { ...screenAt({ x: 100, y: -0.14 }), pointerId: 1, button: 0 })
    expect(useWarehouse.getState().picked).toEqual([{ kind: 'element', id: 'e30' }])
    fireEvent.keyDown(window, { key: 'Delete' })
    expect(type().elements).toHaveLength(59)
    expect(type().elements.some((e) => e.id === 'e30')).toBe(false)
    expect(useWarehouse.getState().picked).toEqual([])
  })

  it('Court: a press by a wall without docks puts its court, again takes it away; a docked wall keeps its own (a toast)', () => {
    render(<App />)
    // the front's court (its docks) drawn, a court-only one none yet
    expect(document.querySelector('[data-court="e1"]')).not.toBeNull()
    expect(document.querySelector('[data-court="e3"]')).toBeNull()
    tool('Court')
    // inside the back wall (y = 96.14 m)
    press({ x: 102, y: 96.14 })
    expect(type().courts).toEqual([{ edge: 'e3' }])
    expect(document.querySelector('[data-court="e3"]')).not.toBeNull()
    press({ x: 102, y: 96.14 })
    expect(type().courts).toBeUndefined()
    press(inWall)
    expect(type().courts).toBeUndefined()
    expect(useToast.getState().toast?.text).toBe('E1 has docks: a docked wall always has its truck court. Drag its pill for a depth of its own.')
  })

  it('the rows of dimensions never take a press: a pill under one is still dragged', () => {
    render(<App />)
    const chains = [...document.querySelectorAll('[data-chain]')]
    expect(chains.length).toBeGreaterThan(0)
    for (const c of chains) expect(c.getAttribute('pointer-events')).toBe('none')
  })

  it('a court’s pill dragged out: the wall’s own depth, by the half metre, one undo step', () => {
    render(<App />)
    // the pill is the shape handles' (D.3 task 7): the far edge of the court, a value wall
    const pill = document.querySelector('[data-court-pill="wt1/e1"]')!
    expect(pill.getAttribute('aria-valuenow')).toBe('40')
    // 10 m down the plan, out of the front
    fireEvent.pointerDown(pill, { clientX: 0, clientY: 0, pointerId: 1, button: 0 })
    fireEvent.pointerMove(pill, { clientX: 0, clientY: pxFor(10), pointerId: 1 })
    // the ghost: the pill says the depth it would make, the court itself stays as it is until the release
    expect(pill.getAttribute('aria-valuenow')).toBe('50')
    expect(document.querySelector('[data-court="e1"]')!.getAttribute('data-court-depth')).toBe('40')
    fireEvent.pointerUp(pill, { clientX: 0, clientY: pxFor(10), pointerId: 1 })
    expect(type().courts).toEqual([{ edge: 'e1', depth: 50 }])
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(type().courts).toBeUndefined()
  })
})


describe('an element picked (BS.4; one on a module since Decision "Elements by module")', () => {
  it('in numbers: the element under a point', () => {
    const g = generate(t0)
    // the docks in bay 8 (94–106 m): one on each of its modules (31–34) round 100 m, each 3 m wide; of the two as
    // near, module 32's
    expect(elementAt(g, { x: 100, y: -1 }, 0.5)).toBe('e30')
    expect(elementAt(g, { x: 100, y: 50 }, 1)).toBeNull()
  })

  const lockTo5 = () =>
    act(() => {
      for (const s of ['grid', 'hall', 'columns', 'envelope', 'morphology'] as const) useApp.getState().apply((p) => actions.lockWarehouseStep(p, 'wt1', s))
    })

  it('a click on the wall where a dock stands picks it: its module lit, step 6 told', () => {
    lockTo5()
    render(<App />)
    // the front's face at 100 m, at the docks of bay 8
    const line = document.querySelector('[data-handle="edge-line-e1"]')!
    fireEvent.pointerDown(line, { ...screenAt({ x: 100, y: -0.14 }), pointerId: 1, button: 0 })
    fireEvent.pointerUp(line, { ...screenAt({ x: 100, y: -0.14 }), pointerId: 1, button: 0 })
    expect(useWarehouse.getState().picked).toEqual([{ kind: 'element', id: 'e30' }])
    expect(document.querySelector('[data-element-module="32"]')).not.toBeNull()
    // step 6 says so: changes apply to it only
    expect(document.querySelector('[data-step-fields="elements"]')).toHaveTextContent('1 picked: changes apply to it only')
  })

  it('picked; Delete removes it alone; its right-click menu removes another', () => {
    lockTo5()
    render(<App />)
    act(() => useWarehouse.getState().setPicked([{ kind: 'element', id: 'e1' }]))
    expect(useWarehouse.getState().picked).toEqual([{ kind: 'element', id: 'e1' }])
    fireEvent.keyDown(window, { key: 'Delete' })
    expect(type().elements).toHaveLength(59)
    expect(type().elements.some((e) => e.id === 'e1')).toBe(false)
    expect(useWarehouse.getState().picked).toEqual([])
    const plan = screen.getByRole('img', { name: 'The warehouse type in plan' })
    fireEvent.contextMenu(plan, screenAt({ x: 100, y: -0.14 }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Remove this dock' }))
    expect(type().elements).toHaveLength(58)
    expect(type().elements.some((e) => e.id === 'e30')).toBe(false)
  })
})

describe('a grid line by hand (Decision "Grid by line", GR.3)', () => {
  const plan = () => document.querySelector('[data-warehouse-plan]')!
  const bubble = (k: string) => document.querySelector(`[data-grid-line="${k}"]`)!
  const linesX = () => generate(type()).runs.x.lines
  const typeIn = (label: string, value: string) => {
    const input = screen.getByRole('textbox', { name: new RegExp(`^${label}`) })
    fireEvent.change(input, { target: { value } })
    fireEvent.blur(input)
  }

  it('its bubble picks it: the chip types From A to the module line nearest; Delete removes it; Regular grid again brings it back', () => {
    render(<App />)
    // 200 m of 12 m bays: end bays of 10 m, line B at 10
    expect(linesX()[1]).toBe(10)
    fireEvent.pointerDown(bubble('x1'), { clientX: 0, clientY: 0, pointerId: 1, button: 0 })
    fireEvent.pointerUp(plan(), { clientX: 0, clientY: 0, pointerId: 1, button: 0 })
    expect(useWarehouse.getState().picked).toMatchObject([{ kind: 'line', axis: 'x', line: 1 }])
    const chip = within(screen.getByRole('region', { name: 'Grid line B' }))
    expect(chip.getByRole('button', { name: 'Delete line B' })).toBeInTheDocument()
    typeIn('From A', '13')
    expect(linesX()[1]).toBe(13)
    expect(type().grid.lines).toEqual({ x: { off: [3], on: [4] } })
    // Del: B and C one bay
    fireEvent.keyDown(window, { key: 'Delete' })
    expect(linesX()[1]).toBe(22)
    expect(useWarehouse.getState().picked).toEqual([])
    act(() => useWarehouse.getState().show('grid'))
    act(() => useUi.setState({ help: true }))
    expect(screen.getByText('Lines of its own: moved or deleted on the plan, by their bubbles.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Regular grid again' }))
    expect(type().grid.lines).toBeUndefined()
    expect(linesX()[1]).toBe(10)
  })

  // a pointer far right (1000 m) takes a line as far as it goes, a module short of the next
  it('dragged by its bubble: a dashed line where it would go, then there; the box’s first line only picked', () => {
    render(<App />)
    const far = screenAt({ x: 1000, y: 0 })
    fireEvent.pointerDown(bubble('x2'), { clientX: 0, clientY: 0, pointerId: 1, button: 0 })
    fireEvent.pointerMove(plan(), { ...far, pointerId: 1 })
    expect(document.querySelector('[data-line-preview="x2"]')).not.toBeNull()
    fireEvent.pointerUp(plan(), { ...far, pointerId: 1, button: 0 })
    expect(linesX()[2]).toBeGreaterThan(22)
    expect(type().grid.lines?.x).toBeDefined()
    // the wall: picked, not moved; its chip says so
    const before = type()
    fireEvent.pointerDown(bubble('x0'), { clientX: 0, clientY: 0, pointerId: 1, button: 0 })
    fireEvent.pointerMove(plan(), { ...far, pointerId: 1 })
    fireEvent.pointerUp(plan(), { ...far, pointerId: 1, button: 0 })
    expect(type()).toBe(before)
    expect(screen.getByText('The box’s first line: its wall. Its length is step 2’s.')).toBeInTheDocument()
  })
})
