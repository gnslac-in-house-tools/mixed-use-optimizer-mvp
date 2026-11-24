// 2.4 through the UI: the tools rail and its keys, drawing a mass (rectangle, polygon, typed), rounding a corner, a
// hand-drawn dimension, the ruler, copy / paste / duplicate and the programs as a palette; with 2.5, the drafting bar. Adapted from Plaza-Practiko's
// `vistas/planta/iman/__tests__/dibujar.test.tsx`, `herramientas.test.tsx` and `paneles/__tests__/pantalla.test.tsx`.
// jsdom has no layout: the plan uses UNMEASURED_SIZE and `at` turns world metres into screen pixels.
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import type { PointerEvent } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Point } from '../../../../model/schema.ts'
import { App } from '../../../../App.tsx'
import { derive } from '../../../../engine/derive.ts'
import { footprintContour } from '../../../../engine/geom/footprint.ts'
import { demoProject } from '../../../../state/demo.ts'
import { emptyHistory } from '../../../../state/history.ts'
import { actions } from '../../../../state/actions/index.ts'
import { overlayEnabled, toggleOverlay } from '../../../__tests__/overlays.ts'
import { useApp } from '../../../../state/store.ts'
import { useUi } from '../../../layout/ui.ts'
import { useToast } from '../../../layout/toast.ts'
import { fit, UNMEASURED_SIZE } from '../../camera.ts'
import { useClipboard } from '../../clipboard.ts'
import { startMassDrag } from '../../editing.ts'
import { startPush } from '../../../editing/shape/drags.ts'
import { endTyped, resetTyped } from '../../../editing/dimension/typed.ts'
import { useCommand } from '../../command/commandState.ts'
import { moveCornerTo } from '../../command/editCommand.ts'
import { DEFAULT_SNAP } from '../../snap/kinds.ts'
import { useSnapSettings } from '../../snap/settings.ts'
import { planPointer, useDimensions, useMassProgram, useRuler, useTool } from '../toolState.ts'
import { letGo, take } from '../../../tools/hand.ts'

vi.mock('../../../scene/Scene.tsx', () => ({ Scene: () => <div data-testid="scene" /> }))

/** Massing's Properties group, open (Decision "Compact panel"). */
const openProperties = () => act(() => useUi.setState({ rail: 'properties' }))

// the site and its 15 m south street (Decision "Exterior circulation")
const v = fit({ minX: 0, minY: -15, maxX: 440, maxY: 280 }, UNMEASURED_SIZE)
const at = (q: Point, extra: object = {}) => ({
  clientX: (q.x - v.cx) * v.scale + UNMEASURED_SIZE.w / 2,
  clientY: UNMEASURED_SIZE.h / 2 - (q.y - v.cy) * v.scale,
  button: 0,
  pointerId: 1,
  ...extra,
})
const capture = () => document.querySelector('[data-capture]')!
const click = (q: Point, extra: object = {}) => {
  fireEvent.pointerDown(capture(), at(q, extra))
  fireEvent.pointerUp(capture(), at(q, extra))
}
const masses = () => useApp.getState().project.masses
/**
 * The demo on a grid of 1 m modules from the plan's origin: the plan's snap is the grid's modules (Decision "Grid
 * always"), so a drawn or measured point lands on whole metres (the demo's own 3 m modules are onGrid.test.tsx's).
 */
const onWholeMetres = () => {
  const p = actions.setGrid(useApp.getState().project, { x: 12, y: 12, modules: 12, origin: { x: 0, y: 0 }, angle: 0 })
  useApp.setState({ project: p, derived: derive(p) })
}
const key =(k: string, extra: object = {}) => fireEvent.keyDown(window, { key: k, ...extra })

beforeEach(() => {
  localStorage.clear()
  const p = demoProject()
  // the level too: a block drawn goes to a building of its own, and the plan to its level
  useApp.setState({ project: p, derived: derive(p), history: emptyHistory(), dragStart: null, selection: { massId: null, vertex: null, massIds: [] }, level: 'l1', showAll: false })
  useUi.setState({ dialog: null, view: 'plan', rail: 'layers', panels: { left: true, right: true }, sheet: null, help: true }) // the command line's keys are a note
  letGo()
  useMassProgram.setState({ programId: undefined })
  letGo()
  useDimensions.setState({ selected: null })
  useSnapSettings.setState({ settings: DEFAULT_SNAP })
  useClipboard.setState({ masses: [], roads: [] })
  useCommand.setState({ registration: null, angle: null, cursor: null })
  resetTyped()
  useToast.setState({ toast: null, confirmation: null })
  planPointer.point = null
})

describe('tools strip', () => {
  it('Draw, Hole, Corner (Massing) and Dimension, Ruler (Annotations); their keys switch, the same key again goes back to Select; off in 3D', () => {
    render(<App />)
    const strip = screen.getByRole('toolbar', { name: 'Tools' })
    const rail = within(strip).getByRole('group', { name: 'Massing' })
    expect(within(rail).getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual(['Draw', 'Hole', 'Corner', 'Chamfer', 'Split', 'Union'])
    const measure = within(strip).getByRole('group', { name: 'Annotations' })
    fireEvent.click(within(measure).getByRole('button', { name: 'Dimension' }))
    expect(useTool.getState().tool).toBe('dimension')
    expect(within(measure).getByRole('button', { name: 'Dimension' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(within(measure).getByRole('button', { name: 'Dimension' }))
    expect(useTool.getState().tool).toBe('select')
    key('b')
    expect(useTool.getState().tool).toBe('mass')
    key('h')
    expect(useTool.getState().tool).toBe('hole')
    key('d')
    expect(useTool.getState().tool).toBe('dimension')
    key('d')
    expect(useTool.getState().tool).toBe('select')
    fireEvent.click(within(rail).getByRole('button', { name: 'Corner' }))
    expect(useTool.getState().tool).toBe('corner')
    act(() => useUi.getState().setView('3d'))
    // the bar keeps its tools, so it does not jump; they draw on the plan only
    const off = ['Draw', 'Hole', 'Corner', 'Chamfer', 'Dimension', 'Ruler', 'Street'].map((name) => within(strip).getByRole('button', { name }))
    expect(off.every((b) => (b as HTMLButtonElement).disabled)).toBe(true)
    expect(off[0]).toHaveAttribute('title', 'The plan is not on screen')
    // a tool's key is tied to no tab (AS.2 task 4): W takes the Street and the panel stays as it was
    act(() => useUi.getState().setView('plan'))
    const tab = useUi.getState().rail
    key('w')
    expect(useTool.getState().tool).toBe('street')
    expect(useUi.getState().rail).toBe(tab)
    key('w')
    expect(useTool.getState().tool).toBe('select')
  })
})

/** The program Draw makes, in the Massing group's ▾ of the Tools strip: opened when it is not (a press on the plan closes the panel). */
const pick = () => {
  if (!screen.queryByRole('dialog', { name: 'Draw makes' })) fireEvent.click(within(screen.getByRole('toolbar', { name: 'Tools' })).getByRole('button', { name: 'Massing options' }))
  return screen.getByRole('combobox', { name: 'New block’s program' })
}

describe('Mass tool', () => {
  const drawRect = () => {
    fireEvent.pointerDown(capture(), at({ x: 270, y: 20 }))
    fireEvent.pointerMove(capture(), at({ x: 300, y: 35 }))
    fireEvent.pointerMove(capture(), at({ x: 330, y: 50 }))
    fireEvent.pointerUp(capture(), at({ x: 330, y: 50 }))
    return masses().at(-1)!
  }

  it('a drag makes a block with the brief’s first program, its stroke the outer face, selected; the tool goes back to Select', () => {
    onWholeMetres()
    render(<App />)
    key('b')
    const m = drawRect()
    const first = useApp.getState().project.programs[0]
    expect(m).toMatchObject({ programId: first.id, footprint: { kind: 'rect', center: { x: 300, y: 35 }, width: 60, depth: 30, rotation: 0 } })
    expect(useApp.getState().selection.massId).toBe(m.id)
    expect(useTool.getState().tool).toBe('select')
    expect(useApp.getState().history.past).toHaveLength(1)
  })

  it('the program picked in the Massing group’s ▾ before drawing is the new block’s; No program, none (Decision "Mass with its program")', () => {
    render(<App />)
    expect(pick()).toHaveValue(useApp.getState().project.programs[0].id)
    // picking one takes the Mass tool
    fireEvent.change(pick(), { target: { value: 'office' } })
    expect(useTool.getState().tool).toBe('mass')
    expect(drawRect().programId).toBe('office')
    fireEvent.change(pick(), { target: { value: '' } })
    expect(drawRect().programId).toBeNull()
  })

  it('clicks make a polygon; Backspace removes the last point; Enter closes it into a contour', () => {
    onWholeMetres()
    render(<App />)
    // the snap off but the grid: what is drawn attracts first (Decision "Snap first to what is drawn"), and the demo's
    // courts, streets and oblique setback are all near at this zoom; the strokes are what this checks
    useSnapSettings.setState({ settings: { ...DEFAULT_SNAP, on: false } })
    key('b')
    click({ x: 280, y: 25 })
    click({ x: 330, y: 25 })
    click({ x: 330, y: 55 }) // removed
    key('Backspace')
    click({ x: 305, y: 50 })
    key('Enter')
    const f = masses().at(-1)!.footprint
    expect(f.kind).toBe('contour')
    // the block's face, read back from its walls' reference line at the millimetre (a slanted wall: Decision "Draw makes a block")
    const corners = footprintContour(f).vertices.map((q) => [q.x, q.y])
    expect(corners).toHaveLength(3)
    ;[[280, 25], [330, 25], [305, 50]].forEach(([x, y], i) => {
      expect(corners[i][0]).toBeCloseTo(x, 2)
      expect(corners[i][1]).toBeCloseTo(y, 2)
    })
  })

  it('with a block’s level in view, the block drawn goes to a building of its own, the plan to its level; it says so (Decisions "A copy without its hall", "Draw makes a block")', () => {
    const added = actions.addWarehouseType(useApp.getState().project)
    const placed = actions.placeWarehouse(added.project, added.id, { x: 200, y: 150 }, 0, 'o1')!
    const level = placed.project.buildings.find((b) => b.id === placed.id)!.levels[0].id
    act(() => {
      useApp.getState().open(placed.project)
      useApp.getState().setLevel(level)
    })
    render(<App />)
    // no program: the shared Block type
    act(() => useMassProgram.getState().setProgram(null))
    key('b')
    click({ x: 280, y: 25 })
    click({ x: 330, y: 25 })
    click({ x: 305, y: 50 })
    key('Enter')
    const made = masses().at(-1)!
    expect(made.levelId).not.toBe(level)
    expect(useApp.getState().level).toBe(made.levelId)
    expect(useApp.getState().project.buildings.find((b) => b.levels.some((l) => l.id === made.levelId))!.warehouse).toBeDefined()
    expect(useToast.getState().toast?.text).toMatch(/the first block of Block/)
  })

  it('Escape cancels the stroke, and a second Escape leaves the tool; a crossing outline is refused', () => {
    render(<App />)
    key('b')
    click({ x: 280, y: 25 })
    key('Escape')
    expect(useTool.getState().tool).toBe('mass')
    key('Escape')
    expect(useTool.getState().tool).toBe('select')
    key('b')
    for (const q of [{ x: 280, y: 20 }, { x: 330, y: 50 }, { x: 330, y: 20 }, { x: 280, y: 50 }]) click(q)
    key('Enter')
    expect(masses()).toHaveLength(3)
    expect(screen.getByRole('alert')).toHaveTextContent('crosses itself')
  })

  it('the command line: a typed first point, then "60x30" makes the rectangle', () => {
    render(<App />)
    key('b')
    expect(screen.getByRole('group', { name: 'Command' })).toHaveTextContent('BlockFirst point')
    const line = screen.getByRole('textbox', { name: 'Command line' })
    fireEvent.change(line, { target: { value: '270,20' } })
    fireEvent.keyDown(line, { key: 'Enter' })
    fireEvent.change(line, { target: { value: '60x30' } })
    fireEvent.keyDown(line, { key: 'Enter' })
    expect(masses().at(-1)!.footprint).toMatchObject({ kind: 'rect', width: 60, depth: 30 })
  })

  it('a digit typed while drawing goes to the command line (and does not switch to 3D)', () => {
    render(<App />)
    key('b')
    key('3')
    expect(screen.getByRole('textbox', { name: 'Command line' })).toHaveValue('3')
    expect(useUi.getState().view).toBe('plan')
  })
})

describe('Corner tool', () => {
  it('a click on a corner picks it; another click sets the radius (one undo step); the rect becomes a contour', () => {
    render(<App />)
    key('f')
    click({ x: 40.5, y: 149.5 }) // Warehouse 1's top-left corner
    expect(useApp.getState().selection).toEqual({ massId: 'm1', vertex: 3, massIds: ['m1'] })
    fireEvent.pointerMove(capture(), at({ x: 50, y: 140 }))
    expect(screen.getByText('r 10.00 m')).toBeInTheDocument()
    fireEvent.pointerUp(capture(), at({ x: 50, y: 140 }))
    const c = footprintContour(masses()[0].footprint)
    expect(masses()[0].footprint.kind).toBe('contour')
    expect(c.vertices[3].r).toBeCloseTo(10, 6)
    expect(useApp.getState().history.past).toHaveLength(1)
  })
})

describe('Dimension tool and Dims', () => {
  it('two points and the offset make a dimension in the Project; Select picks it and Delete removes it; Dims hides them', () => {
    onWholeMetres()
    const { container } = render(<App />)
    key('d')
    click({ x: 250, y: 30 })
    click({ x: 390, y: 30 })
    click({ x: 320, y: 20 })
    expect(useApp.getState().project.dimensions).toEqual([{ id: 'd1', levelId: 'l1', a: { x: 250, y: 30 }, b: { x: 390, y: 30 }, offset: -10 }])
    expect(screen.getByText('140.00')).toBeInTheDocument()
    key('Escape')
    expect(useTool.getState().tool).toBe('select')
    fireEvent.pointerDown(container.querySelector('[data-dimension="d1"]')!, at({ x: 320, y: 20 }))
    expect(useDimensions.getState().selected).toBe('d1')
    key('Delete')
    expect(useApp.getState().project.dimensions).toEqual([])
    act(() => useApp.getState().undo())
    toggleOverlay('dims')
    expect(container.querySelector('[data-dimension]')).toBeNull()
  })

  it('drawn on two corners it is anchored: dragging a mass changes it while dragging; Esc puts it back', () => {
    render(<App />)
    key('d')
    click({ x: 200, y: 70 }) // Warehouse 1's bottom-right corner
    click({ x: 250, y: 70 }) // Warehouse 2's bottom-left corner (it is turned round: its third)
    click({ x: 225, y: 60 })
    expect(useApp.getState().project.dimensions![0]).toMatchObject({ anchorA: { massId: 'm1', vertex: 1 }, anchorB: { massId: 'm2', vertex: 2 } })
    expect(screen.getByText('50.00')).toBeInTheDocument()
    key('Escape')
    const move = startMassDrag('m2', v.scale)({} as PointerEvent<SVGElement>, { x: 320, y: 110 })!
    act(() => void move({ x: 12, y: 0 }, { shiftKey: true }))
    expect(screen.getByText('62.00')).toBeInTheDocument()
    act(() => useApp.getState().cancel())
    expect(screen.getByText('50.00')).toBeInTheDocument()
  })
})

describe('Ruler', () => {
  it('is in the strip’s Annotations: it shows pressed instead of Select; Select or a drawing tool turns it off', () => {
    render(<App />)
    const strip = screen.getByRole('toolbar', { name: 'Tools' })
    const rail = strip
    const measure = within(strip).getByRole('group', { name: 'Annotations' })
    const select = within(strip).getByRole('button', { name: 'Select' })
    fireEvent.click(within(measure).getByRole('button', { name: 'Ruler' }))
    expect(useRuler.getState().active).toBe(true)
    expect(within(measure).getByRole('button', { name: 'Ruler' })).toHaveAttribute('aria-pressed', 'true')
    expect(select).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(select)
    expect(useRuler.getState().active).toBe(false)
    expect(select).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(within(measure).getByRole('button', { name: 'Ruler' }))
    fireEvent.click(within(rail).getByRole('button', { name: 'Draw' }))
    expect(useRuler.getState().active).toBe(false)
    expect(useTool.getState().tool).toBe('mass')
  })

  it('T turns it on; click and click measure; Escape clears it, a second Escape turns it off', () => {
    onWholeMetres()
    render(<App />)
    key('t')
    expect(within(screen.getByRole('toolbar', { name: 'Tools' })).getByRole('button', { name: 'Ruler' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.pointerDown(capture(), at({ x: 250, y: 30 }))
    fireEvent.pointerUp(capture(), at({ x: 250, y: 30 }))
    fireEvent.pointerDown(capture(), at({ x: 290, y: 30 }))
    fireEvent.pointerUp(capture(), at({ x: 290, y: 30 }))
    expect(screen.getByText('40.0 m · 0°')).toBeInTheDocument()
    key('Escape')
    expect(useRuler.getState()).toMatchObject({ active: true, a: null })
    key('Escape')
    expect(useRuler.getState().active).toBe(false)
  })
})

describe('copy, paste, duplicate', () => {
  it('Ctrl+D puts a copy next to the original, 5 m beside it', () => {
    render(<App />)
    act(() => useApp.getState().select('m3')) // Office 1: 40 m wide, centre (120, 200)
    key('d', { ctrlKey: true })
    const copy = masses().at(-1)!
    expect(copy).toMatchObject({ name: 'Office 2', programId: 'office', height: 8, footprint: { center: { x: 165, y: 200 } } })
    expect(useApp.getState().selection.massId).toBe(copy.id)
  })

  it('Ctrl+C keeps it; Ctrl+V pastes it in place; Ctrl+Shift+V centred on the pointer, on whole metres (Decision "Paste in place")', () => {
    render(<App />)
    act(() => useApp.getState().select('m3'))
    key('c', { ctrlKey: true })
    expect(useClipboard.getState().masses.map((m) => m.id)).toEqual(['m3'])
    planPointer.point = { x: 300.4, y: 220.6 }
    key('v', { ctrlKey: true })
    expect(masses().at(-1)!.footprint).toMatchObject({ center: { x: 120, y: 200 } })
    key('V', { ctrlKey: true, shiftKey: true })
    expect(masses().at(-1)!.footprint).toMatchObject({ center: { x: 300, y: 221 } })
  })

  it('without a selection Ctrl+C is the browser’s', () => {
    render(<App />)
    const e = key('c', { ctrlKey: true })
    expect(e).toBe(true) // not prevented
    expect(useClipboard.getState().masses).toEqual([])
  })
})

describe('drafting bar', () => {
  const bar = () => screen.getByRole('region', { name: 'Drafting' })

  it('under the viewport: the command line, the snap with its kinds in a drop-down, and the Detail; no Overlays ▾ (an eye of Layers now); nothing black', () => {
    render(<App />)
    expect(within(screen.getByRole('region', { name: 'Viewport' })).queryByRole('region', { name: 'Drafting' })).toBeNull()
    expect(within(bar()).getByRole('group', { name: 'Command' })).toHaveTextContent('B draws a block')
    const snap = within(bar()).getByRole('toolbar', { name: 'Snap' })
    // the kinds are not chips in the bar: Snap kinds ▾ holds them (Decision "Bottom bar")
    expect(within(snap).queryByRole('button', { name: 'Endpoint' })).toBeNull()
    fireEvent.click(within(snap).getByRole('button', { name: 'Snap kinds' }))
    // drawn on the body, over the viewport (a portal: inside the bar it stayed behind it)
    const kinds = screen.getByRole('dialog', { name: 'Snap kinds' })
    expect(snap.contains(kinds)).toBe(false)
    expect(within(kinds).getByRole('menuitemcheckbox', { name: 'Endpoint' })).toHaveAttribute('aria-checked', 'true')
    expect(within(kinds).getByRole('menuitemcheckbox', { name: 'Quadrant' })).toHaveAttribute('aria-checked', 'false')
    fireEvent.click(within(kinds).getByRole('menuitemcheckbox', { name: 'Quadrant' }))
    expect(useSnapSettings.getState().settings.kinds.quadrant).toBe(true)
    expect(within(kinds).getByRole('menuitemcheckbox', { name: 'Quadrant' })).toHaveAttribute('aria-checked', 'true')
    // Escape closes it
    key('Escape')
    expect(within(snap).queryByRole('dialog', { name: 'Snap kinds' })).toBeNull()
    // the view's end: the Detail; Overlays ▾ went (Phase AS.3)
    expect(within(bar()).getByRole('combobox', { name: 'Detail' })).toBeInTheDocument()
    expect(within(bar()).queryByRole('button', { name: 'Overlays' })).toBeNull()
    expect(bar().querySelector('.bg-ink')).toBeNull()
    key('b')
    expect(within(bar()).getByRole('group', { name: 'Command' })).toHaveTextContent('BlockFirst point')
  })

  it('in 3D what only the plan uses is disabled; Frame is the viewport’s, not the bar’s (Decision "One Frame")', () => {
    render(<App />)
    expect(within(bar()).queryByRole('button', { name: 'Fit' })).toBeNull()
    const frame = () => within(screen.getByRole('region', { name: 'Viewport' })).getByRole('button', { name: 'Frame the model' })
    expect(frame()).toBeEnabled()
    act(() => useUi.getState().setView('3d'))
    expect(overlayEnabled('dims')).toBe(false)
    expect(within(bar()).getByRole('button', { name: 'Snap' })).toBeDisabled()
    expect(within(bar()).getByRole('button', { name: 'Snap kinds' })).toBeDisabled()
    expect(within(bar()).getByRole('group', { name: 'Command' })).toHaveTextContent('The tools draw on the plan')
    act(() => useUi.getState().setView('plan'))
    expect(frame()).toBeEnabled()
  })
})

describe('locks and typed length (2.7)', () => {
  /** A dimension from Warehouse 1's bottom-right corner to Warehouse 2's bottom-left one (50 m), selected. */
  const gap = () => {
    key('d')
    click({ x: 200, y: 70 })
    click({ x: 250, y: 70 })
    click({ x: 225, y: 60 })
    key('Escape')
    act(() => useDimensions.getState().select('d1'))
  }
  const left = (id: string) => {
    const f = useApp.getState().project.masses.find((m) => m.id === id)!.footprint
    return f.kind === 'rect' ? f.center.x - f.width / 2 : NaN
  }
  const props = () => screen.getByRole('region', { name: 'Properties' })

  it('a selected dimension shows in Properties: typing its length moves the mass at its end', () => {
    render(<App />)
    openProperties()
    gap()
    const length = within(props()).getByRole('textbox', { name: /^Length/ })
    expect(length).toHaveValue('50')
    expect(props()).toHaveTextContent('Warehouse 1 · corner 2')
    fireEvent.change(length, { target: { value: '60' } })
    fireEvent.keyDown(length, { key: 'Enter' })
    expect(left('m2')).toBeCloseTo(260)
    expect(screen.getByText('60.00')).toBeInTheDocument()
  })

  it('a click on the selected dimension’s number opens a field: Enter types the length, Escape leaves it as it was', () => {
    const { container } = render(<App />)
    gap()
    // not prevented, the press's mousedown would take the focus from the new field (and close it)
    expect(fireEvent.pointerDown(container.querySelector('[data-dimension="d1"] text')!, { button: 0 })).toBe(false)
    const field = screen.getByRole('textbox', { name: 'Dimension length' })
    fireEvent.change(field, { target: { value: '45,5' } })
    fireEvent.keyDown(field, { key: 'Enter' })
    expect(left('m2')).toBeCloseTo(245.5)
    expect(screen.queryByRole('textbox', { name: 'Dimension length' })).toBeNull()
    fireEvent.doubleClick(container.querySelector('[data-dimension="d1"]')!)
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Dimension length' }), { key: 'Escape' })
    expect(left('m2')).toBeCloseTo(245.5)
  })

  it('the lock on the line: locked, the length cannot be typed and moving one mass drags the other along', () => {
    const { container } = render(<App />)
    openProperties()
    gap()
    fireEvent.click(container.querySelector('[data-dimension-lock]')!)
    expect(useApp.getState().project.dimensions![0].locked).toBe(true)
    expect(within(props()).getByRole('button', { name: 'Fixed length' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(props()).getByRole('textbox', { name: /^Length/ })).toBeDisabled()
    const move = startMassDrag('m2', v.scale)({} as PointerEvent<SVGElement>, { x: 320, y: 110 })!
    act(() => void move({ x: 12, y: 0 }, { shiftKey: true }))
    act(() => useApp.getState().commit())
    expect([left('m1'), left('m2')]).toEqual([52, 262])
    expect(screen.getByText('50.00')).toBeInTheDocument()
  })

  it('a locked mass: no handles, its measures read-only, and deleting it is refused with the reason', () => {
    const { container } = render(<App />)
    openProperties()
    act(() => useApp.getState().select('m1'))
    const handles = () => container.querySelectorAll('[data-handle^="vertex-"],[data-handle^="wall-"]')
    expect(handles().length).toBeGreaterThan(0)
    fireEvent.click(within(props()).getByRole('button', { name: 'Lock mass' }))
    expect(useApp.getState().project.masses[0].locked).toBe(true)
    // locking lets it go: a locked mass is picked from its row in a tree alone (the padlock is CAD's)
    expect(useApp.getState().selection.massIds).toEqual([])
    act(() => useApp.getState().select('m1'))
    expect(handles()).toHaveLength(0)
    expect(within(props()).getByRole('textbox', { name: /^Width/ })).toBeDisabled()
    key('Delete')
    expect(useApp.getState().project.masses).toHaveLength(3)
    expect(screen.getByRole('status')).toHaveTextContent('A locked mass: unlock first') // the command's reason (Edit › Delete is greyed with it too)
    fireEvent.click(within(props()).getByRole('button', { name: 'Lock mass' }))
    key('Delete')
    expect(useApp.getState().project.masses).toHaveLength(2)
  })
})

describe('typing a measure while editing (2.8)', () => {
  const press = {} as PointerEvent<SVGElement>
  const command = () => screen.getByRole('group', { name: 'Command' })
  const line = () => screen.getByRole('textbox', { name: 'Command line' })
  const type = (text: string) => {
    fireEvent.change(line(), { target: { value: text } })
    fireEvent.keyDown(line(), { key: 'Enter' })
  }
  const rectOf = (id: string) => {
    const f = masses().find((m) => m.id === id)!.footprint
    if (f.kind !== 'rect') throw new Error('not a rect')
    return { left: f.center.x - f.width / 2, bottom: f.center.y - f.depth / 2, width: f.width, depth: f.depth }
  }
  /** A drag released: the store keeps it and the command line hears it ended (useDrag does both on release). */
  const release = () =>
    act(() => {
      useApp.getState().commit()
      endTyped(false)
    })

  it('a selected mass: the command line is its Move; a digit goes there, not to 3D; @x,y moves it exactly', () => {
    render(<App />)
    act(() => useApp.getState().select('m2'))
    expect(command()).toHaveTextContent('MoveWarehouse 2')
    key('3')
    expect(line()).toHaveValue('3')
    expect(useUi.getState().view).toBe('plan')
    type('@10,-5')
    expect(rectOf('m2')).toMatchObject({ left: 260, bottom: 65 })
    // applied, the field lets go of the focus: Ctrl+Z is the app's again
    expect(document.activeElement).not.toBe(line())
    key('z', { ctrlKey: true })
    expect(rectOf('m2').left).toBe(250)
  })

  it('just after a drag, a typed distance replaces it along the same direction: one undo step', () => {
    render(<App />)
    const move = startMassDrag('m2', v.scale)(press, { x: 320, y: 110 })!
    act(() => void move({ x: 12, y: 0 }, { shiftKey: true }))
    release()
    expect(rectOf('m2').left).toBe(262)
    type('20')
    expect(rectOf('m2').left).toBeCloseTo(270)
    type('5') // corrected again
    expect(rectOf('m2').left).toBeCloseTo(255)
    act(() => useApp.getState().undo())
    expect(rectOf('m2').left).toBe(250)
  })

  it('with Ortho, a typed distance goes along the axis the drag mostly followed', () => {
    useSnapSettings.setState({ settings: { ...DEFAULT_SNAP, ortho: true } })
    render(<App />)
    const move = startMassDrag('m2', v.scale)(press, { x: 320, y: 110 })!
    act(() => void move({ x: 30, y: -3 }, { shiftKey: true }))
    release()
    type('20')
    expect(rectOf('m2')).toMatchObject({ left: 270, bottom: 70 })
  })

  it('typed during the drag: it replaces the drag, and the pointer no longer moves it', () => {
    render(<App />)
    const move = startMassDrag('m2', v.scale)(press, { x: 320, y: 110 })!
    act(() => void move({ x: 7, y: 0 }, { shiftKey: true }))
    type('10')
    expect(rectOf('m2').left).toBeCloseTo(260)
    act(() => void move({ x: 30, y: 0 }, { shiftKey: true }))
    release()
    expect(rectOf('m2').left).toBeCloseTo(260)
    act(() => useApp.getState().undo())
    expect(rectOf('m2').left).toBe(250)
  })

  it('a wall just dragged: a number is how far it moves along its normal, towards where it was dragged', () => {
    render(<App />)
    // Warehouse 2's right wall (it is turned round: wall 4, from corner 4 to corner 1)
    const move = startPush({ kind: 'mass', id: 'm2' }, 3, v.scale, () => {})(press, { x: 390, y: 110 })!
    act(() => void move({ x: 3, y: 0 }, { shiftKey: true }))
    release()
    expect(command()).toHaveTextContent('Move wallWarehouse 2 · wall 4')
    type('5')
    expect(rectOf('m2')).toMatchObject({ left: 250, width: 145 })
    act(() => useApp.getState().undo())
    expect(rectOf('m2').width).toBe(140)
  })

  it('a selected corner: #x,y puts it there (a rect resizes from the opposite corner)', () => {
    render(<App />)
    act(() => useApp.getState().select('m3', 2)) // Office 1's top-right corner, (140, 210)
    expect(command()).toHaveTextContent('Move cornerOffice 1 · corner 3')
    type('#150,215')
    expect(rectOf('m3')).toMatchObject({ left: 100, bottom: 190, width: 50, depth: 25 })
  })

  it('a block’s corner has a typed move now (its outline is free, D.2): the verb takes it, and the whole block keeps its Move', () => {
    const added = actions.addWarehouseType(useApp.getState().project)
    const placed = actions.placeWarehouse(added.project, added.id, { x: 300, y: 100 }, 0, useApp.getState().project.options[0].id)!
    act(() => useApp.getState().open(placed.project))
    const levels = new Set(useApp.getState().project.buildings.find((b) => b.id === placed.id)!.levels.map((l) => l.id))
    const hall = useApp.getState().project.masses.find((m) => levels.has(m.levelId) && m.part === 'hall')!
    const was = footprintContour(hall.footprint).vertices[0]
    const to = { x: was.x + 1.3, y: was.y + 0.7 }
    expect(moveCornerTo(useApp.getState().project, hall.id, 0, to)).not.toBe(useApp.getState().project)
    render(<App />)
    act(() => useApp.getState().select(hall.id, 0))
    expect(command()).toHaveTextContent('Move corner')
    // the whole block selected: its Move stays
    act(() => useApp.getState().select(hall.id))
    expect(command()).toHaveTextContent('Move')
  })

  it('a plain corner the shape refuses: the reason shows, and the mass stays', () => {
    act(() => useApp.getState().apply((p) => actions.toContour(p, 'm3')))
    render(<App />)
    act(() => useApp.getState().select('m3', 2))
    const before = useApp.getState().project
    type('#60,150')
    expect(useApp.getState().project).toBe(before)
    expect(screen.getByRole('status')).toHaveTextContent('That corner cannot go there')
  })

  it('a selected dimension: a number is its length', () => {
    render(<App />)
    act(() => {
      useApp.getState().apply((p) => ({ ...p, dimensions: [{ id: 'd1', levelId: 'l1', a: { x: 200, y: 70 }, b: { x: 250, y: 70 }, offset: -10, anchorB: { massId: 'm2', vertex: 2 } }] }))
      useDimensions.getState().select('d1')
    })
    expect(command()).toHaveTextContent('DimensionLength')
    type('60')
    expect(rectOf('m2').left).toBeCloseTo(260)
  })

  it('a locked mass: the typed move is refused, and says why', () => {
    render(<App />)
    act(() => {
      useApp.getState().apply((p) => ({ ...p, masses: p.masses.map((m) => (m.id === 'm2' ? { ...m, locked: true } : m)) }))
      useApp.getState().select('m2')
    })
    type('@10,0')
    expect(rectOf('m2').left).toBe(250)
    expect(screen.getByRole('status')).toHaveTextContent('Warehouse 2 is locked')
  })
})

describe('the site’s tool layer behind a window (late review of BE.10)', () => {
  /** The site plan's own capture (none of the block editor's plan). */
  const siteCapture = () => [...document.querySelectorAll('[data-capture]')].filter((c) => !c.closest('[data-warehouse-plan]'))

  it('the Program window hides it (the block plan has the measures then); another window leaves it', () => {
    take('dimension')
    render(<App />)
    expect(siteCapture()).toHaveLength(1)
    act(() => useUi.setState({ dialog: 'brief' }))
    expect(siteCapture()).toHaveLength(1)
    act(() => useUi.setState({ dialog: 'program' }))
    expect(siteCapture()).toHaveLength(0)
    act(() => useUi.setState({ dialog: null }))
    expect(siteCapture()).toHaveLength(1)
  })
})
