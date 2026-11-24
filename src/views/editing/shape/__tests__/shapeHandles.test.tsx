// D.1 task 5 (the spec's *D.1*, *A block before D.2*): one set of shape handles on the site for a mass, a mass's hole and a placed
// block, through <App />. A chamfer shows its two ends and each is dragged along its own wall; a hole's wall, edge and corner are typed
// drags; a placed block's double click picks its bay, its face pill makes a bump (a variant), its end pills make the stretch longer, its
// corner dot picks and removes and does not drag, its label says modules and metres; a locked mass shows none. Every handle's press
// is cancelled (`beginDrag`), so the browser selects no text by it.
// jsdom has no layout: the plan uses UNMEASURED_SIZE and `at` turns world metres into screen pixels.
import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Contour, Id, Point, Project } from '../../../../model/schema.ts'
import { App } from '../../../../App.tsx'
import { derive } from '../../../../engine/derive.ts'
import { contourFromPolygon } from '../../../../engine/geom/contour.ts'
import { footprintContour } from '../../../../engine/geom/footprint.ts'
import { placeCopy } from '../../../../modules/warehouse/views/commands.ts'
import { actions } from '../../../../state/actions/index.ts'
import { demoProject } from '../../../../state/demo.ts'
import { emptyHistory } from '../../../../state/history.ts'
import { NO_SELECTION, useApp } from '../../../../state/store.ts'
import { useToast } from '../../../layout/toast.ts'
import { useUi } from '../../../layout/ui.ts'
import { fit, UNMEASURED_SIZE } from '../../../plan/camera.ts'
import { useHoles } from '../../../plan/holeState.ts'
import { contentBounds } from '../../../plan/PlanSvg.tsx'
import { DEFAULT_SNAP } from '../../../plan/snap/kinds.ts'
import { useSnapSettings } from '../../../plan/snap/settings.ts'
import { letGo } from '../../../tools/hand.ts'
import { resetTyped, useTyped } from '../../dimension/typed.ts'
import { useStretch } from '../shapeState.ts'

vi.mock('../../../scene/Scene.tsx', () => ({ Scene: () => <div data-testid="scene" /> }))
vi.mock('../../../../modules/warehouse/views/WarehouseScene.tsx', () => ({ WarehouseScene: () => <div data-testid="warehouse-scene" /> }))

const s = () => useApp.getState()
const key = (k: string, extra: object = {}) => fireEvent.keyDown(window, { key: k, ...extra })
const typeKeys = (text: string) => [...text].forEach((c) => key(c))
const handle = (k: string) => document.querySelector(`[data-handle="${k}"]`)!
const mass = (id: string) => s().project.masses.find((m) => m.id === id)!

/** A world point as a pointer at the camera that frames `p` (jsdom has no layout). */
function camera(p: Project) {
  const v = fit(contentBounds(derive(p, 'o1')), UNMEASURED_SIZE)
  return (q: Point, extra: object = {}) => ({
    clientX: (q.x - v.cx) * v.scale + UNMEASURED_SIZE.w / 2,
    clientY: UNMEASURED_SIZE.h / 2 - (q.y - v.cy) * v.scale,
    button: 0,
    pointerId: 1,
    ...extra,
  })
}
let at = camera(demoProject())

/** A press, a move and (unless `hold`) the release on an element: the pointer goes from `a` to `b`, with Shift (no snap). */
function drag(el: Element, a: Point, b: Point, { hold = false, ...extra }: { hold?: boolean; altKey?: boolean; ctrlKey?: boolean } = {}) {
  fireEvent.pointerDown(el, at(a, extra))
  fireEvent.pointerMove(el, at(b, { shiftKey: true, ...extra }))
  if (!hold) fireEvent.pointerUp(el, at(b, extra))
}

const square = (x0: number, y0: number, x1: number, y1: number): Contour =>
  contourFromPolygon([
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ])

function load(p: Project) {
  at = camera(p)
  useApp.setState({ project: p, derived: derive(p, 'o1'), history: emptyHistory(), dragStart: null, selection: NO_SELECTION, level: 'l1', showAll: false, option: 'o1' })
}

beforeEach(() => {
  localStorage.clear()
  load(demoProject())
  useUi.setState({ dialog: null, view: 'plan', rail: 'layers', panels: { left: true, right: true }, sheet: null, help: true })
  useSnapSettings.setState({ settings: { ...DEFAULT_SNAP, on: false, grid: false } })
  useToast.setState({ toast: null, confirmation: null })
  useHoles.setState({ pick: null })
  useStretch.setState({ stretch: null })
  letGo()
  resetTyped()
})

describe('a chamfer shows its two ends', () => {
  // Warehouse 1 is x 40…200, y 70…150; its corner 1 is (200, 70): incoming wall along +x, outgoing along +y
  const chamfered = (a: number, b: number) => actions.editShape(demoProject(), { kind: 'mass', id: 'm1' }, { op: 'chamfer', vertex: 1, a, b }).project
  const chamfer = () => footprintContour(mass('m1').footprint).vertices[1].chamfer

  it('one dot on each end of the cut, on its own wall; a corner with none has none', () => {
    load(chamfered(3, 3))
    render(<App />)
    act(() => s().select('m1'))
    expect(document.querySelectorAll('[data-chamfer-end]')).toHaveLength(2)
    expect(handle('chamfer-1-a')).not.toBeNull()
    expect(handle('chamfer-1-b')).not.toBeNull()
  })

  it('an end dragged along its wall changes only its own set-back; typed 2.5 sets it exactly, one undo step', () => {
    load(chamfered(3, 3))
    render(<App />)
    act(() => s().select('m1'))
    const steps = s().history.past.length
    // the first end stands 3 m back from the corner, on the bottom wall: (197, 70); pulled to 15 m back
    drag(handle('chamfer-1-a'), { x: 197, y: 70 }, { x: 185, y: 70 })
    expect(chamfer()).toEqual([15, 3])
    expect(s().history.past).toHaveLength(steps + 1)
    // right after the release: typed 2.5
    typeKeys('2.5')
    key('Enter')
    expect(chamfer()).toEqual([2.5, 3])
    expect(s().history.past).toHaveLength(steps + 1)
    act(() => s().undo())
    expect(chamfer()).toEqual([3, 3])
  })

  it('a chamfer cut shorter than its dots leaves the corner’s own dot to the pointer: the end’s catch stays inside half the set-back', () => {
    load(chamfered(0.2, 0.2))
    render(<App />)
    act(() => s().select('m1'))
    for (const end of ['1-a', '1-b']) {
      const [catches, dot] = Array.from(document.querySelector(`[data-chamfer-end="${end}"]`)!.querySelectorAll('circle'))
      const r = Number(catches.getAttribute('r'))
      // the corner is 0.2 m from each end
      expect(r, end).toBeLessThanOrEqual(Math.max(0.1, Number(dot.getAttribute('r'))) + 1e-9)
    }
  })

  it('typed during the drag it replaces the drag; the second end is its own', () => {
    load(chamfered(3, 3))
    render(<App />)
    act(() => s().select('m1'))
    drag(handle('chamfer-1-b'), { x: 200, y: 73 }, { x: 200, y: 75 }, { hold: true })
    expect(useTyped.getState().cur?.measure).toBe('value')
    typeKeys('2.5')
    key('Enter')
    fireEvent.pointerUp(handle('chamfer-1-b'), at({ x: 200, y: 80 }))
    expect(chamfer()).toEqual([3, 2.5])
  })
})

describe('a Ctrl push, typed', () => {
  it('a number typed after a free (Ctrl) push is a free push too: the corner on the wall’s line slides, no step', () => {
    // a corner (320, 200) on the bottom wall's line: a square push keeps it and steps out from it, a free one slides it
    const outline = [
      { x: 300, y: 200 },
      { x: 320, y: 200 },
      { x: 340, y: 200 },
      { x: 340, y: 220 },
      { x: 300, y: 220 },
    ]
    const added = actions.addMass(demoProject(), { programId: 'warehouse', footprint: { kind: 'contour', contour: contourFromPolygon(outline) }, levelId: 'l1' })
    const id = added.id
    load(added.project)
    render(<App />)
    act(() => s().select(id))
    const base = s().project
    const ref = { kind: 'mass', id }
    // wall 0 runs (300,200) → (320,200), out is down: pulled 10 m, then 5 typed
    drag(handle('wall-0'), { x: 310, y: 200 }, { x: 310, y: 190 }, { ctrlKey: true })
    expect(useTyped.getState().cur?.phase).toBe('kept')
    typeKeys('5')
    key('Enter')
    const footprint = (p: Project) => p.masses.find((m) => m.id === id)!.footprint
    const free = actions.editShape(base, ref, { op: 'push', wall: 0, by: 5, free: true }).project
    const square = actions.editShape(base, ref, { op: 'push', wall: 0, by: 5, free: false }).project
    expect(footprint(free)).not.toEqual(footprint(square))
    expect(mass(id).footprint).toEqual(footprint(free))
  })
})

describe('a hole’s handles are typed drags', () => {
  const holes = () => mass('m1').holes ?? []
  const withHole = () => {
    act(() => {
      s().apply((p) => actions.addHole(p, 'm1', square(100, 100, 120, 120))!.project)
      s().select('m1')
    })
  }

  it('its wall: a number typed during the drag is how far the wall moves, in one undo step', () => {
    render(<App />)
    withHole()
    const steps = s().history.past.length
    // the hole's right wall is x = 120, its normal +x
    drag(handle('hole-0-wall-1'), { x: 120, y: 110 }, { x: 124, y: 110 }, { hold: true })
    expect(useTyped.getState().cur).toMatchObject({ what: 'Move wall', measure: 'distance' })
    typeKeys('2')
    key('Enter')
    fireEvent.pointerUp(handle('hole-0-wall-1'), at({ x: 130, y: 110 }))
    expect(holes()[0].vertices[1].x).toBeCloseTo(122, 6)
    expect(s().history.past).toHaveLength(steps + 1)
    act(() => s().undo())
    expect(holes()[0].vertices[1].x).toBeCloseTo(120, 6)
  })

  it('its corner takes @x,y; its edge moves it and takes a distance along the drag', () => {
    render(<App />)
    withHole()
    drag(handle('hole-0-vertex-2'), { x: 120, y: 120 }, { x: 124, y: 126 })
    typeKeys('@2,0')
    key('Enter')
    expect(holes()[0].vertices[2]).toMatchObject({ x: 122, y: 120 })
    const edge = screen.getAllByRole('button', { name: 'Hole 1' })[0]
    drag(edge, { x: 110, y: 100 }, { x: 115, y: 100 }, { hold: true })
    expect(useTyped.getState().cur).toMatchObject({ what: 'Move', measure: 'point' })
    typeKeys('8')
    key('Enter')
    fireEvent.pointerUp(edge, at({ x: 150, y: 100 }))
    // the middle of the hole went 8 m along the drag (+x)
    expect(holes()[0].vertices[0].x).toBeCloseTo(108, 6)
  })

  it('Alt+drag copies it and the copy is the pick', () => {
    render(<App />)
    withHole()
    drag(screen.getAllByRole('button', { name: 'Hole 1' })[0], { x: 110, y: 100 }, { x: 110, y: 80 }, { altKey: true })
    expect(holes()).toHaveLength(2)
    expect(useHoles.getState().pick).toMatchObject({ massId: 'm1', k: 1 })
  })
})

describe('what is locked or refused shows no handle', () => {
  it('a locked mass shows no shape handles', () => {
    render(<App />)
    act(() => s().select('m1'))
    expect(document.querySelectorAll('[data-handle^="wall-"]')).toHaveLength(4)
    act(() => s().apply((p) => actions.lockMasses(p, ['m1'], true)))
    expect(document.querySelector('[data-handle^="wall-"], [data-handle^="line-"], [data-handle^="vertex-"], [data-handle^="chamfer-"]')).toBeNull()
    expect(document.querySelector('[data-layer="shape-handles"]')).toBeNull()
  })

  it('every press that starts a drag is cancelled: the wall, the corner, a hole’s wall and a chamfer’s end', () => {
    load(actions.editShape(demoProject(), { kind: 'mass', id: 'm1' }, { op: 'chamfer', vertex: 1, a: 3, b: 3 }).project)
    render(<App />)
    act(() => {
      s().apply((p) => actions.addHole(p, 'm1', square(100, 100, 120, 120))!.project)
      s().select('m1')
    })
    for (const k of ['wall-0', 'line-0', 'vertex-0', 'chamfer-1-a', 'hole-0-wall-1', 'hole-0-vertex-0']) {
      expect(fireEvent.pointerDown(handle(k), at({ x: 100, y: 100 })), k).toBe(false)
      fireEvent.pointerUp(handle(k), at({ x: 100, y: 100 }))
    }
  })
})

describe('a placed block on the site', () => {
  /** A notch in the back of Warehouse A (modules 20 to 32, 4 in), its steps locked: a block with corners to take out. */
  function placed(notch = false) {
    let p = actions.addWarehouseType(demoProject()).project
    if (notch) {
      for (const st of ['grid', 'hall', 'columns', 'envelope'] as const) p = actions.lockWarehouseStep(p, 'wt1', st)
      p = actions.shapeWarehouse(p, 'wt1', { kind: 'pull', edge: 'e3', from: 20, to: 32, by: -4 }).project
    }
    load(p)
    render(<App />)
    act(() => placeCopy('wt1'))
    const hall = () => s().project.masses.find((m) => m.part === 'hall')!
    act(() => s().select(hall().id))
    return hall
  }
  const ref = (id: Id) => ({ kind: 'mass', id })
  /** The wall at the hall's far end along its length (+x side), its two corners and the point in its middle. */
  const farWall = (hall: () => { id: Id; footprint: Parameters<typeof footprintContour>[0] }) => {
    const c = footprintContour(hall().footprint).vertices
    const f = hall().footprint as { center: Point }
    const i = c.findIndex((v, k) => v.x > f.center.x && c[(k + 1) % c.length].x > f.center.x)
    const a = c[i]
    const b = c[(i + 1) % c.length]
    return { i, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } }
  }
  const overrides = () => s().project.buildings.at(-1)!.warehouse!.overrides

  it('a double click on a wall picks its bay; its face pill dragged out two modules makes a bump (a variant): one undo step; the label says modules and metres', () => {
    const hall = placed()
    const w = farWall(hall)
    expect(useStretch.getState().stretch).toBeNull()
    fireEvent.doubleClick(handle(`wall-${w.i}`), at(w.mid))
    const picked = useStretch.getState().stretch
    expect(picked).toMatchObject({ target: ref(hall().id), wall: w.i })
    expect(picked!.to).toBeGreaterThan(picked!.from)
    expect(document.querySelector('[data-stretch]')).not.toBeNull()
    expect(screen.getByText(/Drag its face out or in · \d+ modules?, [\d.]+ m/)).toBeInTheDocument()
    // the end pills and the face pill
    expect(handle('stretch-from')).not.toBeNull()
    expect(handle('stretch-to')).not.toBeNull()
    expect(handle('stretch-face')).not.toBeNull()
    const steps = s().history.past.length
    const typeBefore = structuredClone(s().project.warehouseTypes)
    // 6 m out: two 3 m modules
    drag(handle('stretch-face'), w.mid, { x: w.mid.x + 6, y: w.mid.y }, { hold: true })
    expect(screen.getByText(/Out 2 modules · \d+ modules?, [\d.]+ m/)).toBeInTheDocument()
    fireEvent.pointerUp(handle('stretch-face'), at({ x: w.mid.x + 6, y: w.mid.y }))
    expect(overrides()!.morphology!.outline!.length).toBeGreaterThan(4)
    expect(s().project.warehouseTypes).toEqual(typeBefore)
    expect(s().history.past).toHaveLength(steps + 1)
    expect(useStretch.getState().stretch).toBeNull()
    act(() => s().undo())
    expect(overrides()).toBeUndefined()
  })

  it('typed during the drag, the depth is exact on whole modules: 6 makes the same bump', () => {
    const hall = placed()
    const w = farWall(hall)
    fireEvent.doubleClick(handle(`wall-${w.i}`), at(w.mid))
    const before = Math.max(...footprintContour(hall().footprint).vertices.map((v) => v.x))
    drag(handle('stretch-face'), w.mid, { x: w.mid.x + 3, y: w.mid.y }, { hold: true })
    typeKeys('6')
    key('Enter')
    fireEvent.pointerUp(handle('stretch-face'), at({ x: w.mid.x + 30, y: w.mid.y }))
    const maxX = () => Math.max(...footprintContour(hall().footprint).vertices.map((v) => v.x))
    expect(maxX()).toBeCloseTo(before + 6, 6)
    expect(footprintContour(hall().footprint).vertices.length).toBeGreaterThan(4)
  })

  it('its end pills make the stretch longer or shorter, on the module lines (no edit of the project)', () => {
    const hall = placed()
    const w = farWall(hall)
    fireEvent.doubleClick(handle(`wall-${w.i}`), at(w.mid))
    const was = { ...useStretch.getState().stretch! }
    const steps = s().history.past.length
    // the first end pulled 3 m along the wall, towards the second: one module shorter
    const c = footprintContour(hall().footprint).vertices
    const a = c[w.i]
    const b = c[(w.i + 1) % c.length]
    const u = { x: (b.x - a.x) / Math.hypot(b.x - a.x, b.y - a.y), y: (b.y - a.y) / Math.hypot(b.x - a.x, b.y - a.y) }
    const from = { x: a.x + u.x * was.from, y: a.y + u.y * was.from }
    drag(handle('stretch-from'), from, { x: from.x + u.x * 3, y: from.y + u.y * 3 })
    const now = useStretch.getState().stretch!
    expect(now.from).toBeCloseTo(was.from + 3, 6)
    expect(now.to).toBe(was.to)
    expect(s().history.past).toHaveLength(steps)
    // longer: the second end 3 m out
    const to = { x: a.x + u.x * now.to, y: a.y + u.y * now.to }
    drag(handle('stretch-to'), to, { x: to.x + u.x * 3, y: to.y + u.y * 3 })
    expect(useStretch.getState().stretch!.to).toBeCloseTo(was.to + 3, 6)
  })

  // D.2 task 6: a block's outline is free; the module lines a snap (Snap on, Shift free), the metres exact
  const maxX = (hall: () => { footprint: Parameters<typeof footprintContour>[0] }) => Math.max(...footprintContour(hall().footprint).vertices.map((v) => v.x))
  const scaleOf = () => fit(contentBounds(derive(s().project, 'o1')), UNMEASURED_SIZE).scale

  it('a box wall dragged with Shift lands where the pointer is: 7.3 m, not whole modules; one undo step', () => {
    const hall = placed()
    const w = farWall(hall)
    const before = maxX(hall)
    const steps = s().history.past.length
    drag(handle(`wall-${w.i}`), w.mid, { x: w.mid.x + 7.3, y: w.mid.y })
    expect(maxX(hall)).toBeCloseTo(before + 7.3, 6)
    expect(s().history.past).toHaveLength(steps + 1)
    act(() => s().undo())
    expect(maxX(hall)).toBeCloseTo(before, 6)
  })

  it('without Shift it lands on a module line within the snap’s aperture, and the plan shows the mark', () => {
    useSnapSettings.setState({ settings: { ...DEFAULT_SNAP, grid: false } })
    const hall = placed()
    const w = farWall(hall)
    const before = maxX(hall)
    // 3 m is a module of Warehouse A: 9 m is three of them; the pointer a little short of it, within 8 px
    const near = 9 - 2 / scaleOf()
    fireEvent.pointerDown(handle(`wall-${w.i}`), at(w.mid))
    fireEvent.pointerMove(handle(`wall-${w.i}`), at({ x: w.mid.x + near, y: w.mid.y }))
    expect(document.querySelector('[data-snap]')).not.toBeNull()
    fireEvent.pointerUp(handle(`wall-${w.i}`), at({ x: w.mid.x + near, y: w.mid.y }))
    expect(maxX(hall)).toBeCloseTo(before + 9, 6)
  })

  it('typed during the drag, a wall’s distance is exact: 7.3 m', () => {
    const hall = placed()
    const w = farWall(hall)
    const before = maxX(hall)
    drag(handle(`wall-${w.i}`), w.mid, { x: w.mid.x + 2, y: w.mid.y }, { hold: true })
    typeKeys('7.3')
    key('Enter')
    fireEvent.pointerUp(handle(`wall-${w.i}`), at({ x: w.mid.x + 30, y: w.mid.y }))
    expect(maxX(hall)).toBeCloseTo(before + 7.3, 6)
  })

  it('a bump’s depth is exact too: typed 7.3 makes a bump 7.3 m out', () => {
    const hall = placed()
    const w = farWall(hall)
    fireEvent.doubleClick(handle(`wall-${w.i}`), at(w.mid))
    const before = maxX(hall)
    drag(handle('stretch-face'), w.mid, { x: w.mid.x + 3, y: w.mid.y }, { hold: true })
    typeKeys('7.3')
    key('Enter')
    fireEvent.pointerUp(handle('stretch-face'), at({ x: w.mid.x + 30, y: w.mid.y }))
    expect(maxX(hall)).toBeCloseTo(before + 7.3, 6)
  })

  it('a stretch’s end follows the pointer exactly (Shift), not the module lines', () => {
    const hall = placed()
    const w = farWall(hall)
    fireEvent.doubleClick(handle(`wall-${w.i}`), at(w.mid))
    const was = { ...useStretch.getState().stretch! }
    const c = footprintContour(hall().footprint).vertices
    const a = c[w.i]
    const b = c[(w.i + 1) % c.length]
    const len = Math.hypot(b.x - a.x, b.y - a.y)
    const u = { x: (b.x - a.x) / len, y: (b.y - a.y) / len }
    const from = { x: a.x + u.x * was.from, y: a.y + u.y * was.from }
    drag(handle('stretch-from'), from, { x: from.x + u.x * 5.3, y: from.y + u.y * 5.3 })
    expect(useStretch.getState().stretch!.from).toBeCloseTo(was.from + 5.3, 6)
  })

  it('its corner dot drags: an angled wall, a variant of the copy, applied live; Shift is free of the lines', () => {
    const hall = placed()
    const ref0 = ref(hall().id)
    const read = actions.shapeOf(s().project, ref0)!
    const v = read.contour.vertices[2]
    const steps = s().history.past.length
    drag(handle('vertex-2'), v, { x: v.x - 4, y: v.y + 5.5 })
    expect(overrides()!.morphology!.outline!.length).toBeGreaterThanOrEqual(4)
    const after = actions.shapeOf(s().project, ref0)!
    expect(after.walls!.some((x) => x.module === undefined)).toBe(true)
    expect(s().history.past).toHaveLength(steps + 1)
    act(() => s().undo())
    expect(overrides()).toBeUndefined()
  })

  it('a chamfered corner of a block shows its two ends, each dragged along its wall', () => {
    const hall = placed()
    act(() => s().apply((p) => actions.editShape(p, ref(hall().id), { op: 'chamfer', vertex: 1, a: 3, b: 3 }).project))
    expect(document.querySelectorAll('[data-chamfer-end]')).toHaveLength(2)
    const read = actions.shapeOf(s().project, ref(hall().id))!
    expect(read.contour.vertices.some((x) => x.chamfer)).toBe(true)
  })

  it('Alt + double click on a block’s wall adds a corner; a plain double click still picks its bay', () => {
    const hall = placed()
    const w = farWall(hall)
    const n = () => actions.shapeOf(s().project, ref(hall().id))!.contour.vertices.length
    const was = n()
    fireEvent.doubleClick(handle(`wall-${w.i}`), { ...at(w.mid), altKey: true })
    expect(n()).toBe(was + 1)
    expect(useStretch.getState().stretch).toBeNull()
  })

  it('its corner dot picks (Delete takes the corner out) and a double click does too', () => {
    const hall = placed(true)
    const ids = hall().id
    const corners = () => footprintContour(hall().footprint).vertices.length
    const n = corners()
    // a corner the engine takes out, by trying them (the notch's)
    const removable = Array.from({ length: n }, (_, i) => i).filter((i) => !actions.editShape(s().project, ref(ids), { op: 'remove', vertex: i }).reason)
    expect(removable.length).toBeGreaterThan(0)
    const i = removable[0]
    const dot = () => document.querySelector(`[data-vertex="${i}"]`)!
    expect(dot()).not.toBeNull()
    // a press picks it, Delete takes it out
    fireEvent.pointerDown(dot(), at({ x: 0, y: 0 }))
    fireEvent.pointerUp(dot(), at({ x: 0, y: 0 }))
    expect(s().selection.vertex).toBe(i)
    key('Delete')
    expect(corners()).toBeLessThan(n)
    act(() => s().undo())
    expect(corners()).toBe(n)
    // a double click does the same
    fireEvent.doubleClick(dot())
    expect(corners()).toBeLessThan(n)
  })

  it('a box wall: its label says length and range; an inner wall: its modules and metres (today’s texts)', () => {
    const hall = placed(true)
    const g = actions.shapeOf(s().project, ref(hall().id))!
    const inner = g.walls!.findIndex((w) => w.tone === 'inner')
    const k = g.walls!.findIndex((w) => w.tone === 'box')
    // hovered, a box wall says its size and range
    fireEvent.pointerEnter(handle(`wall-${k}`))
    expect(screen.getByText(/^(Length|Width) \d+ m \(\d+–\d+\)$/)).toBeInTheDocument()
    fireEvent.pointerLeave(handle(`wall-${k}`))
    // an inner wall dragged a module: its modules, and the metres
    const c = footprintContour(hall().footprint).vertices
    const a = c[inner]
    const b = c[(inner + 1) % c.length]
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
    const w = Math.hypot(b.x - a.x, b.y - a.y)
    const out = { x: (b.y - a.y) / w, y: -(b.x - a.x) / w }
    drag(handle(`wall-${inner}`), mid, { x: mid.x + out.x * 3, y: mid.y + out.y * 3 }, { hold: true })
    expect(screen.getByText(/^[+−]1 module · [+−]3\.00 m$/)).toBeInTheDocument()
    fireEvent.pointerUp(handle(`wall-${inner}`), at({ x: mid.x + out.x * 3, y: mid.y + out.y * 3 }))
  })
})
