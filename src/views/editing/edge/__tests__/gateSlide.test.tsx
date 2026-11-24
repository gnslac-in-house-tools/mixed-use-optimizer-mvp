// The Gate tool and a gate's slide on any street or the boundary (Phase PE.2 task 10, Decisions "On edge engine" and "Exterior circulation"): the Gate tool puts a gate on the
// side of the street a click lies on (left or right of its drawn line), on an existing street, or on the site's boundary; the gate's square slides along its side, stops at its
// end, takes a number typed (m along the side, one undo step), copies with Alt, and starts nothing when it is locked; the width field goes through the engine; a street deleted
// under a gate takes it along and says so.
// jsdom has no layout: the plan uses UNMEASURED_SIZE and `at` turns world metres into screen pixels.
// The street runs along y 235 from x 40 to x 200 (8 m, 4 + 4, drawn left to right: its left side is y 239, its right y 231).
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Point, Project } from '../../../../model/schema.ts'
import { App } from '../../../../App.tsx'
import { derive } from '../../../../engine/derive.ts'
import { gatesOf } from '../../../../engine/circulation/gates.ts'
import { perimeter, pointAt } from '../../../../engine/geom/perimeter.ts'
import { contourToPolygon } from '../../../../engine/geom/contour.ts'
import { LOCKED } from '../../../../model/picked.ts'
import { addGate, addGateOn, updateGate } from '../../../../state/actions/circulation.ts'
import { drawStreet } from '../../../../state/actions/streets.ts'
import { demoProject } from '../../../../state/demo.ts'
import { emptyHistory } from '../../../../state/history.ts'
import { NO_SELECTION, useApp } from '../../../../state/store.ts'
import { useGraph } from '../../../graph/graphState.ts'
import { useToast } from '../../../layout/toast.ts'
import { useUi } from '../../../layout/ui.ts'
import { ACCESS_TOOLS, useAccess } from '../../../plan/access/accessState.ts'
import { fit, UNMEASURED_SIZE } from '../../../plan/camera.ts'
import { useRoads } from '../../../plan/circulation/roadState.ts'
import { useCommand } from '../../../plan/command/commandState.ts'
import { contentBounds } from '../../../plan/PlanSvg.tsx'
import { letGo, take } from '../../../tools/hand.ts'
import { enterTyped, resetTyped, setTyped } from '../../dimension/typed.ts'
import { startGateSlide } from '../gateSlide.ts'

vi.mock('../../../scene/Scene.tsx', () => ({ Scene: () => <div data-testid="scene" /> }))

const s = () => useApp.getState()

/** The demo without its south street and gate, with a street along y 235 from x 40 to x 200. */
function load(extra: (p: Project, seg: string) => Project = (p) => p) {
  const base = demoProject({ streets: false, southStreet: false })
  const bare: Project = { ...base, site: { ...base.site, gates: undefined } }
  const drawn = drawStreet(bare, 'o1', [{ x: 40, y: 235 }, { x: 200, y: 235 }], undefined, 8)!
  const seg = drawn.segments[0]
  const p = extra(drawn.project, seg)
  useApp.setState({ project: p, derived: derive(p, 'o1'), history: emptyHistory(), dragStart: null, selection: NO_SELECTION, level: 'l1', showAll: false, option: 'o1' })
  useRoads.setState({ picked: null, node: null, also: [] })
  useAccess.setState({ picked: null, alsoGates: [], alsoSite: [] })
  return seg
}

/** A gate named `sg` on the street's `side`, `at` m along its drawn line (the left side's 40 m is x 80, y 239). */
const withGate = (side: 'left' | 'right' = 'left', at = 40) => (p: Project, seg: string) => renameGate(addGateOn(p, 'o1', { kind: 'street', id: seg, side, at }), 'sg')
const renameGate = (made: { project: Project; id: string }, id: string): Project => {
  const o = made.project.options[0]
  return { ...made.project, options: [{ ...o, gates: o.gates!.map((g) => (g.id === made.id ? { ...g, id } : g)) }, ...made.project.options.slice(1)] }
}

let v = fit({ minX: 0, minY: 0, maxX: 440, maxY: 280 }, UNMEASURED_SIZE)
const view = () => {
  v = fit(contentBounds(s().derived), UNMEASURED_SIZE)
}
const at = (q: Point, extra: object = {}) => ({
  clientX: (q.x - v.cx) * v.scale + UNMEASURED_SIZE.w / 2,
  clientY: UNMEASURED_SIZE.h / 2 - (q.y - v.cy) * v.scale,
  button: 0,
  pointerId: 1,
  ...extra,
})

beforeEach(() => {
  localStorage.clear()
  useUi.setState({ view: 'plan', rail: 'layers', panels: { left: true, right: true }, sheet: null, help: false })
  useGraph.setState({ graph: false, rule: null, relation: null })
  useToast.setState({ toast: null, confirmation: null })
  letGo()
  resetTyped()
  useCommand.setState({ registration: null, angle: null, cursor: null })
})

const capture = () => document.querySelector('[data-capture]')!
const click = (q: Point) => {
  fireEvent.pointerDown(capture(), at(q))
  fireEvent.pointerUp(capture(), at(q))
}
const gates = () => gatesOf(s().project, 'o1')
const handle = (id: string) => document.querySelector(`[data-handle="gate-${id}"]`)!
const along = (id: string) => gates().find((g) => g.id === id)!.on!.at
const typed = (text: string) =>
  act(() => {
    setTyped(text)
    expect(enterTyped()).toBe(true)
  })
const drag = (el: Element, from: Point, to: Point, extra: object = {}) => {
  fireEvent.pointerDown(el, at(from, extra))
  fireEvent.pointerMove(el, at(to, extra))
  fireEvent.pointerUp(el, at(to, extra))
}

describe('the Gate tool', () => {
  it('a click on a street’s left paving puts a gate on its left side, on the right half on the right, near the boundary on the boundary', () => {
    const seg = load()
    view()
    render(<App />)
    act(() => take('gate'))
    click({ x: 120, y: 238 }) // the left half of the paving (y above the drawn line)
    click({ x: 160, y: 232 }) // the right half
    const [left, right] = gates()
    expect(left.on).toEqual({ kind: 'street', id: seg, side: 'left', at: 80.25 })
    expect(right.on).toEqual({ kind: 'street', id: seg, side: 'right', at: 120.25 })
    expect(left.t).toBeUndefined()
    // a street's gate goes into the option's own gates; the site's are the same as before (none)
    expect(s().project.options[0].gates).toHaveLength(2)
    expect(s().project.site.gates ?? []).toHaveLength(0)
    click({ x: 380, y: 0 })
    const boundary = gates().find((g) => g.t !== undefined)!
    expect(boundary.on).toBeUndefined()
    expect(pointAt(contourToPolygon(s().project.site.boundary!), boundary.t!).x).toBeCloseTo(380, 0)
    expect(useAccess.getState().tool).toBe('gate') // stays on for another
  })

  it('a click just off a street’s side (outside its paving) takes that side; far from every side it says where gates go', () => {
    const seg = load()
    view()
    render(<App />)
    act(() => take('gate'))
    click({ x: 120, y: 240.5 }) // 1.5 m past the left side
    expect(gates()[0].on).toMatchObject({ kind: 'street', id: seg, side: 'left' })
    click({ x: 300, y: 150 })
    expect(gates()).toHaveLength(1)
    expect(useToast.getState().toast?.text).toMatch(/street’s side or the site’s boundary/)
  })

  it('a click on an existing street’s paving puts a gate on its side', () => {
    load((p) => {
      const road = { id: 'er1', points: [{ x: 250, y: 150 }, { x: 350, y: 150 }], stretches: [{ left: 5, right: 5 }] }
      return { ...p, site: { ...p.site, existingRoads: [road] } }
    })
    view()
    render(<App />)
    act(() => take('gate'))
    click({ x: 300, y: 147 }) // below the drawn line: its right side
    expect(gates()[0].on).toEqual({ kind: 'existing-road', id: 'er1', side: 'right', at: 50.25 })
    // an existing street's gate goes into the gates the option uses (the site's)
    expect(s().project.site.gates).toHaveLength(1)
  })

  it('its hint names a street’s side and the boundary', () => {
    load()
    view()
    render(<App />)
    act(() => take('gate'))
    expect(useAccess.getState().tool).toBe('gate')
    expect(ACCESS_TOOLS.find((t) => t.key === 'gate')!.title).toMatch(/click a street’s side or the site’s boundary/i)
  })
})

describe('the gate’s square', () => {
  it('slides along its side, and stops at its end: one undo step', () => {
    load(withGate())
    view()
    render(<App />)
    const steps = s().history.past.length
    const el = handle('sg')
    expect(el).not.toBeNull()
    fireEvent.pointerDown(el, at({ x: 80, y: 239 }))
    fireEvent.pointerMove(el, at({ x: 110, y: 239 }))
    expect(along('sg')).toBeCloseTo(70, 3)
    // across the street does nothing: it slides along its side
    fireEvent.pointerMove(el, at({ x: 110, y: 200 }))
    expect(along('sg')).toBeCloseTo(70, 3)
    expect(gates()[0].on!.side).toBe('left')
    // past the end: half its width (6 m) from the street's end (160 m)
    fireEvent.pointerMove(el, at({ x: 400, y: 239 }))
    expect(along('sg')).toBeCloseTo(154, 3)
    fireEvent.pointerUp(el, at({ x: 400, y: 239 }))
    expect(s().history.past).toHaveLength(steps + 1)
    expect(useAccess.getState().picked).toEqual({ kind: 'gate', id: 'sg' })
    expect(s().derived.circulation.gates[0].at.x).toBeCloseTo(194, 3)
  })

  it('`12` typed after the drag: 12 m from where it started along the side, still one undo step', () => {
    load(withGate())
    view()
    render(<App />)
    const steps = s().history.past.length
    drag(handle('sg'), { x: 80, y: 239 }, { x: 110, y: 239 })
    expect(along('sg')).toBeCloseTo(70, 3)
    typed('12')
    expect(along('sg')).toBeCloseTo(52, 3)
    expect(s().history.past).toHaveLength(steps + 1)
  })

  it('a number typed past the end is refused, the gate stays where the drag left it', () => {
    load(withGate())
    view()
    render(<App />)
    drag(handle('sg'), { x: 80, y: 239 }, { x: 110, y: 239 })
    act(() => {
      setTyped('200')
      enterTyped()
    })
    expect(along('sg')).toBeCloseTo(70, 3)
  })

  it('a gate on the boundary slides along its side too, and stops at the corner', () => {
    load((p) => {
      const g = addGate(p, 'o1', 200 / perimeter(contourToPolygon(p.site.boundary!)))
      return { ...g.project, site: { ...g.project.site, gates: g.project.site.gates!.map((x) => ({ ...x, id: 'bg' })) } }
    })
    const side = s().derived.circulation.gates[0]
    view()
    render(<App />)
    const x0 = side.at.x
    drag(handle('bg'), { x: x0, y: 0 }, { x: x0 + 20, y: 0 })
    expect(s().derived.circulation.gates[0].at.x).toBeCloseTo(x0 + 20, 1)
    expect(s().derived.circulation.gates[0].at.y).toBeCloseTo(0, 3)
    drag(handle('bg'), { x: x0 + 20, y: 0 }, { x: 1000, y: 0 })
    // the bottom side ends at x 420: half the gate's width before it
    expect(s().derived.circulation.gates[0].at.x).toBeCloseTo(414, 1)
    expect(s().derived.circulation.gates[0].at.y).toBeCloseTo(0, 3)
  })

  it('Alt+drag leaves it and copies it along its side, picked once dropped', () => {
    load(withGate())
    view()
    render(<App />)
    drag(handle('sg'), { x: 80, y: 239 }, { x: 110, y: 239 }, { altKey: true })
    expect(gates()).toHaveLength(2)
    expect(gates()[0].id).toBe('sg')
    expect(along('sg')).toBe(40)
    const copy = gates()[1]
    expect(copy.on).toMatchObject({ kind: 'street', id: gates()[0].on!.id, side: 'left' })
    expect(copy.on!.at).toBeCloseTo(70, 3)
    expect(copy).toMatchObject({ width: gates()[0].width, radius: gates()[0].radius, flow: gates()[0].flow })
    expect(useAccess.getState().picked).toEqual({ kind: 'gate', id: copy.id })
  })

  it('a locked gate starts nothing', () => {
    load((p, seg) => updateGate(withGate()(p, seg), 'o1', 'sg', { locked: true }))
    view()
    render(<App />)
    expect(handle('sg')).toBeNull()
    // asked directly it says why and starts no drag
    expect(startGateSlide('sg', 1)({ shiftKey: false, altKey: false } as never, { x: 80, y: 239 })).toBeNull()
    expect(useToast.getState().toast?.text).toBe(LOCKED)
    expect(along('sg')).toBe(40)
  })

  it('Shift+click joins the gate to what is picked and slides nothing', () => {
    load(withGate())
    view()
    render(<App />)
    const steps = s().history.past.length
    drag(handle('sg'), { x: 80, y: 239 }, { x: 110, y: 239 }, { shiftKey: true })
    expect(along('sg')).toBe(40)
    expect(s().history.past).toHaveLength(steps)
  })
})

describe('the gate’s width', () => {
  const field = () => within(screen.getByRole('region', { name: 'Gate 1' })).getByRole('textbox', { name: /Width/ })
  const widthTo = (text: string) => {
    fireEvent.change(field(), { target: { value: text } })
    fireEvent.blur(field())
  }

  it('goes through the engine: a wider opening near the end moves in; a side shorter than the gate refuses and says so', () => {
    load(withGate('left', 150))
    view()
    render(<App />)
    act(() => useAccess.getState().pick({ kind: 'gate', id: 'sg' }))
    act(() => useUi.getState().setRail('properties'))
    widthTo('30')
    expect(gates()[0].width).toBe(30)
    expect(along('sg')).toBeCloseTo(145, 3) // 160 − 30 / 2
    widthTo('400')
    expect(gates()[0].width).toBe(30)
    expect(useToast.getState().toast?.text).toMatch(/shorter than the gate/)
  })
})

describe('a street deleted under a gate', () => {
  it('Delete takes its gates along, and the toast says so', () => {
    const seg = load(withGate())
    view()
    render(<App />)
    act(() => useRoads.getState().pick(`street:${seg}`))
    fireEvent.keyDown(window, { key: 'Delete' })
    expect(s().project.options[0].streets?.segments ?? []).toHaveLength(0)
    expect(gates()).toHaveLength(0)
    expect(useToast.getState().toast?.text).toBe('Its gates went with it')
  })

  it('a street with no gate on it deleted says nothing of gates', () => {
    const seg = load()
    view()
    render(<App />)
    act(() => useRoads.getState().pick(`street:${seg}`))
    fireEvent.keyDown(window, { key: 'Delete' })
    expect(useToast.getState().toast?.text ?? '').not.toMatch(/gates/)
  })
})
