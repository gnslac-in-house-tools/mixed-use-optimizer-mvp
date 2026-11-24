// Lanes on the plan (Phase PE.2 task 3, Decision "Path engine"): every street and existing street shown has its lane lines (one dashed path, `--road-lane`, under
// the axes); the picked one has a lane pill on each stretch that is long enough (`data-path-lanes`, buttons `data-lane-take` and `data-lane-add`): a click adds a lane
// or takes one (one undo step), Shift the same on every stretch. Task 4: a lane line of the picked street dragged (a hit stroke `data-path-line`, `data-line`: the lane on
// each side of it grows and shrinks, 0.25 m steps, Ctrl free, Shift every stretch that has the line) or typed (the lane the press was beside); the side pill reads the edge lane;
// *Equal lanes* in the menu. jsdom has no layout: the plan uses UNMEASURED_SIZE (1.62 px per metre here, so 80 px is about 50 m).
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Point } from '../../../../model/schema.ts'
import { App } from '../../../../App.tsx'
import { derive } from '../../../../engine/derive.ts'
import { CORE_KINDS } from '../../../../kinds/core.ts'
import { demoProject } from '../../../../state/demo.ts'
import { emptyHistory } from '../../../../state/history.ts'
import { NO_SELECTION, useApp } from '../../../../state/store.ts'
import { useGraph } from '../../../graph/graphState.ts'
import { EXISTING_ROADS, STREETS } from '../../../layers/keys.ts'
import { useLayerView } from '../../../layers/layerView.ts'
import { useToast } from '../../../layout/toast.ts'
import { useUi } from '../../../layout/ui.ts'
import { useAccess } from '../../../plan/access/accessState.ts'
import { useRoads } from '../../../plan/circulation/roadState.ts'
import { fit, UNMEASURED_SIZE } from '../../../plan/camera.ts'
import { useCommand } from '../../../plan/command/commandState.ts'
import { pickedRefs, pickRefs } from '../../../plan/mix.ts'
import { letGo } from '../../../tools/hand.ts'
import { enterTyped, resetTyped, setTyped, useTyped } from '../../dimension/typed.ts'
import { menuFor } from '../../menu/build.ts'
import { leaf } from '../../menu/__tests__/helpers.ts'

vi.mock('../../../scene/Scene.tsx', () => ({ Scene: () => <div data-testid="scene" /> }))
// the plan's unmeasured size, one object the tests can resize: the lane lines take presses only where a lane is wide enough on the screen (LANE_LINE_PX)
const screen = vi.hoisted(() => ({ size: { w: 800, h: 600 } }))
vi.mock('../../../plan/camera.ts', async (original) => ({ ...(await original<typeof import('../../../plan/camera.ts')>()), UNMEASURED_SIZE: screen.size }))
const ZOOMED = { w: 8000, h: 6000 } // 16 px per metre: a 3.5 m lane is 56 px
const zoomed = () => Object.assign(screen.size, ZOOMED)

const s = () => useApp.getState()

type Seg = { left: number; right: number; lanes?: number[]; locked?: boolean }
/** A street along y 235 from x 40, one stretch per length (m), each with the given sides and lanes: ids n1…, s1…; the existing street er1 lies along y 60. */
function load(lengths: number[], seg: Seg, existing: Seg[] = [{ left: 4, right: 4 }]) {
  const xs = lengths.reduce<number[]>((all, l) => [...all, all[all.length - 1] + l], [40])
  const nodes = xs.map((x, i) => ({ id: `n${i + 1}`, x, y: 235 }))
  const segments = lengths.map((_, i) => ({ id: `s${i + 1}`, a: `n${i + 1}`, b: `n${i + 2}`, type: 'trucks', ...seg }))
  const p = demoProject({ streets: false })
  const q = {
    ...p,
    site: { ...p.site, existingRoads: [{ id: 'er1', points: [{ x: 60, y: 60 }, { x: 200, y: 60 }], stretches: existing }, ...(p.site.existingRoads ?? [])] },
    options: [{ ...p.options[0], streets: { nodes, segments } }, ...p.options.slice(1)],
  }
  useApp.setState({ project: q, derived: derive(q, 'o1'), history: emptyHistory(), dragStart: null, selection: NO_SELECTION, level: 'l1', showAll: false, option: 'o1' })
  useRoads.setState({ picked: null, node: null, also: [] })
  useAccess.setState({ picked: null, alsoGates: [], alsoSite: [] })
}

beforeEach(() => {
  Object.assign(screen.size, { w: 800, h: 600 })
  localStorage.clear()
  useUi.setState({ view: 'plan', rail: 'layers', panels: { left: true, right: true }, sheet: null, help: false })
  useGraph.setState({ graph: false, rule: null, relation: null })
  useLayerView.setState({ hidden: [], onTop: [] })
  useToast.setState({ toast: null })
  letGo()
  resetTyped()
  useCommand.setState({ registration: null, angle: null, cursor: null })
})

const street = CORE_KINDS.find((k) => k.id === 'street')!
const original = street.path
afterEach(() => {
  street.path = original
})

const THREE = { left: 0, right: 10.5, lanes: [3.5, 3.5, 3.5] }
const pickStreet = () => act(() => useRoads.getState().pick('street:s1'))
const pickExisting = () => act(() => useAccess.getState().pick({ kind: 'existing', id: 'er1' }))
const streets = () => s().project.options[0].streets!
const seg = (id: string) => streets().segments.find((g) => g.id === id)!
const pills = () => [...document.querySelectorAll('[data-path-lanes]')]
const pill = (k: number) => document.querySelector(`[data-path-lanes="${k}"]`)!
const add = (k: number, extra: object = {}) => fireEvent.click(pill(k).querySelector('[data-lane-add]')!, extra)
const take = (k: number, extra: object = {}) => fireEvent.click(pill(k).querySelector('[data-lane-take]')!, extra)
/** The y (world) of each point of a path's d (the plan negates y). */
const ysOf = (el: Element) => (el.getAttribute('d')!.match(/-?[\d.]+/g) ?? []).map(Number).filter((_, i) => i % 2 === 1).map((y) => -y)
const lines = (id: string) => [...document.querySelectorAll(`[data-lane-lines="${id}"]`)]

describe('lane lines', () => {
  it('a street of 10.5 m with three stored lanes: one dashed path with two lines, at the lane edges, in the lane token, under the axes', () => {
    load([80], THREE)
    render(<App />)
    const [el] = lines('street:s1')
    expect(lines('street:s1')).toHaveLength(1)
    expect(el.getAttribute('stroke')).toBe('var(--road-lane)')
    expect(el.getAttribute('stroke-dasharray')).toBe('6 6')
    expect(el.getAttribute('stroke-width')).toBe('1')
    expect(el.getAttribute('vector-effect')).toBe('non-scaling-stroke')
    // walking east the paving lies south of the drawn line (y 235): its centre is 229.75, the lines 1.75 m either side of it
    const ys = ysOf(el)
    expect(el.getAttribute('d')!.split('M').length - 1).toBe(2)
    expect([...new Set(ys.map((y) => Math.round(y * 100) / 100))].sort()).toEqual([228, 231.5])
    const axis = document.querySelector('[data-axis="street:s1"]')!
    expect(el.compareDocumentPosition(axis) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('a street of 8 m with no stored lanes shows two equal lanes: one line, on its axis; a 4 m one shows one lane: none', () => {
    load([80], { left: 4, right: 4 })
    render(<App />)
    expect(lines('street:s1')).toHaveLength(1)
    for (const y of ysOf(lines('street:s1')[0])) expect(y).toBeCloseTo(235, 6)
    act(() => {
      load([80], { left: 2, right: 2 })
    })
    expect(lines('street:s1')).toHaveLength(0)
  })

  it('an existing street’s lines are drawn too', () => {
    load([80], { left: 4, right: 4 })
    render(<App />)
    expect(lines('existing:er1')).toHaveLength(1)
    for (const y of ysOf(lines('existing:er1')[0])) expect(y).toBeCloseTo(60, 6)
  })

  it('a hidden road’s lines go with it', () => {
    load([80], THREE)
    render(<App />)
    expect(lines('street:s1')).toHaveLength(1)
    act(() => useLayerView.getState().setHidden([STREETS], true))
    expect(lines('street:s1')).toHaveLength(0)
    expect(lines('existing:er1')).toHaveLength(1)
    act(() => useLayerView.getState().setHidden([EXISTING_ROADS], true))
    expect(lines('existing:er1')).toHaveLength(0)
  })

  it('a street that follows its own lanes (stored [3, 4], 7 m): the line stands 1 m off the centre', () => {
    load([80], { left: 3, right: 4, lanes: [3, 4] })
    render(<App />)
    // walking east the left edge is at y 238 and the right at 231: the line between a 3 m and a 4 m lane is 3 m in from the left, y 235
    for (const y of ysOf(lines('street:s1')[0])) expect(y).toBeCloseTo(235, 6)
  })
})

describe('the lane pill', () => {
  it('one on each stretch long enough, reading its lane count, at 0.7 along on the paving’s centre; none when the street is not picked', () => {
    load([80, 80], THREE)
    render(<App />)
    expect(pills()).toHaveLength(0)
    pickStreet()
    expect(pills().map((e) => e.getAttribute('data-path-lanes'))).toEqual(['0', '1'])
    expect(pill(0).textContent).toContain('3 lanes')
    expect(Number(pill(0).getAttribute('data-x'))).toBeCloseTo(96, 6)
    expect(Number(pill(0).getAttribute('data-y'))).toBeCloseTo(229.75, 6)
    expect(Number(pill(1).getAttribute('data-x'))).toBeCloseTo(176, 6)
  })

  it('a stretch shorter than 80 px has none; when none is long enough, the longest has it', () => {
    load([80, 20, 80], THREE)
    render(<App />)
    pickStreet()
    expect(pills().map((e) => e.getAttribute('data-path-lanes'))).toEqual(['0', '2'])
    act(() => {
      load([40, 30, 20], THREE)
      useRoads.getState().pick('street:s1')
    })
    expect(pills().map((e) => e.getAttribute('data-path-lanes'))).toEqual(['0'])
  })

  it('reads one lane in the singular, and an unstored width in lanes of the standard', () => {
    load([80], { left: 0, right: 3.5 })
    render(<App />)
    pickStreet()
    expect(pill(0).textContent).toContain('1 lane')
    expect(pill(0).textContent).not.toContain('1 lanes')
    act(() => {
      load([80], { left: 0, right: 7 })
      useRoads.getState().pick('street:s1')
    })
    expect(pill(0).textContent).toContain('2 lanes')
  })

  it('none on a hidden street, none on a locked one, none on a locked stretch; a kind with no lanes has none', () => {
    load([80], THREE)
    render(<App />)
    pickStreet()
    expect(pills()).toHaveLength(1)
    act(() => useLayerView.getState().setHidden([STREETS], true))
    expect(pills()).toHaveLength(0)
    act(() => useLayerView.setState({ hidden: [] }))
    act(() => useRoads.getState().pick(null))
    pickStreet()
    expect(pills()).toHaveLength(1)
    street.path = { width: 'free', lanes: false }
    act(() => useRoads.getState().pick(null))
    pickStreet()
    expect(pills()).toHaveLength(0)
    street.path = original
    act(() => useRoads.getState().pick(null))
    pickStreet()
    expect(pills()).toHaveLength(1)
    act(() => {
      load([80, 80], { ...THREE, locked: true })
      useRoads.getState().pick('street:s1')
    })
    expect(pills()).toHaveLength(0)
    act(() => {
      load([80, 80], THREE)
      useApp.setState((st) => ({
        project: { ...st.project, options: st.project.options.map((o, i) => (i === 0 ? { ...o, streets: { ...o.streets!, segments: o.streets!.segments.map((g) => (g.id === 's2' ? { ...g, locked: true } : g)) } } : o)) },
      }))
      useApp.setState((st) => ({ derived: derive(st.project, 'o1') }))
      useRoads.getState().pick('street:s1')
    })
    expect(pills().map((e) => e.getAttribute('data-path-lanes'))).toEqual(['0'])
  })

  it('an existing street has a pill too', () => {
    load([80], THREE, [{ left: 4, right: 4 }])
    render(<App />)
    pickExisting()
    expect(pills()).toHaveLength(1)
    expect(pill(0).textContent).toContain('2 lanes')
  })
})

describe('a lane added or taken', () => {
  it('+ on {0, 7}: {0, 10.5}, three lanes, the drawn line where it was; one undo step; − takes it back', () => {
    load([80], { left: 0, right: 7 })
    render(<App />)
    pickStreet()
    const nodes = streets().nodes
    const steps = s().history.past.length
    add(0)
    expect(seg('s1')).toMatchObject({ left: 0, right: 10.5, lanes: [3.5, 3.5, 3.5] })
    expect(streets().nodes).toEqual(nodes)
    expect(s().history.past).toHaveLength(steps + 1)
    expect(pill(0).textContent).toContain('3 lanes')
    take(0)
    expect(seg('s1')).toMatchObject({ left: 0, right: 7 })
    expect(s().history.past).toHaveLength(steps + 2)
    s().undo()
    expect(seg('s1')).toMatchObject({ left: 0, right: 10.5 })
  })

  it('− on one lane: the notice “A street has one lane at least”, nothing changes, no undo step', () => {
    load([80], { left: 0, right: 3.5 })
    render(<App />)
    pickStreet()
    const before = s().project
    take(0)
    expect(s().project).toBe(before)
    expect(useToast.getState().toast?.text).toBe('A street has one lane at least')
  })

  it('Shift+click: every stretch of the street', () => {
    load([80, 80, 80], { left: 0, right: 7 })
    render(<App />)
    pickStreet()
    const steps = s().history.past.length
    add(1, { shiftKey: true })
    expect(['s1', 's2', 's3'].map((id) => seg(id).right)).toEqual([10.5, 10.5, 10.5])
    expect(s().history.past).toHaveLength(steps + 1)
    take(2, { shiftKey: true })
    expect(['s1', 's2', 's3'].map((id) => seg(id).right)).toEqual([7, 7, 7])
  })

  it('without Shift, only that stretch', () => {
    load([80, 80, 80], { left: 0, right: 7 })
    render(<App />)
    pickStreet()
    add(1)
    expect(['s1', 's2', 's3'].map((id) => seg(id).right)).toEqual([7, 10.5, 7])
  })

  it('a locked stretch among them: Shift refuses the whole, with the locked notice; the free stretch alone still takes a lane', () => {
    load([80, 80], { left: 0, right: 7 })
    act(() => {
      useApp.setState((st) => ({
        project: { ...st.project, options: st.project.options.map((o, i) => (i === 0 ? { ...o, streets: { ...o.streets!, segments: o.streets!.segments.map((g) => (g.id === 's2' ? { ...g, locked: true } : g)) } } : o)) },
      }))
      useApp.setState((st) => ({ derived: derive(st.project, 'o1') }))
    })
    render(<App />)
    pickStreet()
    const before = s().project
    add(0, { shiftKey: true })
    expect(s().project).toBe(before)
    expect(useToast.getState().toast?.text).toMatch(/ocked/)
    add(0)
    expect(seg('s1').right).toBe(10.5)
    expect(seg('s2').right).toBe(7)
  })

  it('an existing street: + and − on it', () => {
    load([80], THREE, [{ left: 4, right: 4 }])
    render(<App />)
    pickExisting()
    const steps = s().history.past.length
    add(0)
    const [r] = s().project.site.existingRoads!
    expect(r.stretches[0]).toMatchObject({ left: 5.75, right: 5.75, lanes: [4, 4, 3.5] })
    expect(s().history.past).toHaveLength(steps + 1)
    take(0)
    expect(s().project.site.existingRoads![0].stretches[0]).toMatchObject({ left: 4, right: 4 })
  })

  it('the buttons are clicks, not drags: a press on one starts no drag and picks nothing else', () => {
    load([80], THREE)
    render(<App />)
    pickStreet()
    const btn = pill(0).querySelector('[data-lane-add]')!
    fireEvent.pointerDown(btn, { button: 0, pointerId: 1, clientX: 10, clientY: 10 })
    fireEvent.pointerUp(btn, { button: 0, pointerId: 1, clientX: 10, clientY: 10 })
    expect(useRoads.getState().picked).toBe('street:s1')
  })
})

// ---- Phase PE.2 task 4 ----
const view = () => fit({ minX: 0, minY: -15, maxX: 440, maxY: 280 }, UNMEASURED_SIZE)
const at = (q: Point, extra: object = {}) => ({
  clientX: (q.x - view().cx) * view().scale + UNMEASURED_SIZE.w / 2,
  clientY: UNMEASURED_SIZE.h / 2 - (q.y - view().cy) * view().scale,
  button: 0,
  pointerId: 1,
  ...extra,
})
const where = (el: Element): Point => ({ x: Number(el.getAttribute('data-x')), y: Number(el.getAttribute('data-y')) })
const hit = (k: number, line: number) => document.querySelector(`[data-path-line="${k}"][data-line="${line}"]`)!
const lanesOfSeg = (id: string) => seg(id).lanes
/** A lane line pulled by `out` m to the right of a street that runs east (south, y down in the world), pressed `beside` m off the line (north = its left). */
const pullLine = (el: Element, out: number, extra: object = {}, beside = 0) => {
  const from = where(el)
  const down = { x: from.x, y: from.y + beside }
  const to = { x: from.x, y: down.y - out }
  fireEvent.pointerDown(el, at(down, extra))
  fireEvent.pointerMove(el, at({ x: to.x + 8, y: to.y }, extra))
  fireEvent.pointerMove(el, at(to, extra))
  fireEvent.pointerUp(el, at(to, extra))
}
const typed = (text: string) => {
  act(() => setTyped(text))
  let ok = false
  act(() => {
    ok = enterTyped()
  })
  return ok
}

describe('the lane lines of the picked street', () => {
  it('one hit stroke on each lane line of each stretch, none when it is not picked or a stretch has one lane; a locked one has them too (they start nothing)', () => {
    zoomed()
    load([80, 80], THREE)
    render(<App />)
    expect(document.querySelector('[data-path-line]')).toBeNull()
    pickStreet()
    expect([...document.querySelectorAll('[data-path-line]')].map((e) => [e.getAttribute('data-path-line'), e.getAttribute('data-line')])).toEqual([['0', '0'], ['0', '1'], ['1', '0'], ['1', '1']])
    // walking east the paving lies south of y 235: the lines are 3.5 and 7 m south of it, in the middle of stretch 0 (x 80)
    expect(where(hit(0, 0))).toEqual({ x: 80, y: 231.5 })
    expect(where(hit(0, 1))).toEqual({ x: 80, y: 228 })
    expect(hit(0, 0).getAttribute('stroke')).toBe('transparent')
    // a narrow strip: it takes a press only on the line, and the body between two lines is the street's
    expect(hit(0, 0).getAttribute('stroke-width')).toBe('8')
    act(() => {
      load([80, 80], { left: 0, right: 3.5 })
      useRoads.getState().pick('street:s1')
    })
    expect(document.querySelector('[data-path-line]')).toBeNull()
  })

  it('an existing street has them too', () => {
    zoomed()
    load([80], THREE, [{ left: 4, right: 4 }])
    render(<App />)
    pickExisting()
    expect(where(hit(0, 0))).toEqual({ x: 130, y: 60 })
  })

  it('at the plan zoom (a lane under 24 px on the screen) a street has none: its body drags the street; zoomed in they come back', () => {
    // 1.62 px per metre here: a 3.5 m lane is under 6 px
    load([80], THREE)
    render(<App />)
    pickStreet()
    expect(document.querySelector('[data-path-line]')).toBeNull()
    // the pill still edits the lanes
    expect(pill(0).querySelector('[data-lane-add]')).not.toBeNull()
    // 24 px / 3.5 m = 6.86 px per metre: 8 px per metre is enough, 6 is not
    cleanup()
    Object.assign(screen.size, { w: 800 * 5, h: 600 * 5 }) // 8.1 px per metre
    load([80], THREE)
    render(<App />)
    pickStreet()
    expect(document.querySelectorAll('[data-path-line]')).toHaveLength(2)
    cleanup()
    Object.assign(screen.size, { w: 800 * 3.5, h: 600 * 3.5 }) // 5.7 px per metre
    load([80], THREE)
    render(<App />)
    pickStreet()
    expect(document.querySelector('[data-path-line]')).toBeNull()
  })

  it('the narrowest lane of a stretch decides, for a street and an existing street', () => {
    // 4.5 + 2 + 2: the 2 m lanes are 32 px at 16 px per metre, 16 px at 8.1
    zoomed()
    load([80], { left: 0, right: 8.5, lanes: [4.5, 2, 2] })
    render(<App />)
    pickStreet()
    expect(document.querySelectorAll('[data-path-line]')).toHaveLength(2)
    cleanup()
    Object.assign(screen.size, { w: 800 * 5, h: 600 * 5 })
    load([80], { left: 0, right: 8.5, lanes: [4.5, 2, 2] })
    render(<App />)
    pickStreet()
    expect(document.querySelector('[data-path-line]')).toBeNull()
    cleanup()
    // an existing street of 2.5 + 2.5 + 3 m lanes: 20 px at 8.1 px per metre, 40 px at 16
    load([80], THREE, [{ left: 4, right: 4, lanes: [2.5, 2.5, 3] }])
    render(<App />)
    pickExisting()
    expect(document.querySelector('[data-path-line]')).toBeNull()
    cleanup()
    zoomed()
    load([80], THREE, [{ left: 4, right: 4, lanes: [2.5, 2.5, 3] }])
    render(<App />)
    pickExisting()
    expect(document.querySelectorAll('[data-path-line]')).toHaveLength(2)
  })
})

describe('a lane line dragged', () => {
  beforeEach(zoomed)
  it('line 0 dragged 1.1 m right: [4.5, 2.5, 3.5] (0.25 m steps); the width and the drawn line stay; one undo step', () => {
    load([80], THREE)
    render(<App />)
    pickStreet()
    const nodes = streets().nodes
    const steps = s().history.past.length
    pullLine(hit(0, 0), 1.1)
    expect(lanesOfSeg('s1')).toEqual([4.5, 2.5, 3.5])
    expect(seg('s1')).toMatchObject({ left: 0, right: 10.5 })
    expect(streets().nodes).toEqual(nodes)
    expect(s().history.past).toHaveLength(steps + 1)
    s().undo()
    expect(lanesOfSeg('s1')).toEqual([3.5, 3.5, 3.5])
  })

  it('dragged left it shrinks the lane on its left: line 1 by 1 m left, [3.5, 2.5, 4.5]', () => {
    load([80], THREE)
    render(<App />)
    pickStreet()
    pullLine(hit(0, 1), -1)
    expect(lanesOfSeg('s1')).toEqual([3.5, 2.5, 4.5])
  })

  it('with Ctrl the lane is free: [4.6, 2.4, 3.5]', () => {
    load([80], THREE)
    render(<App />)
    pickStreet()
    pullLine(hit(0, 0), 1.1, { ctrlKey: true })
    const [a, b, c] = lanesOfSeg('s1')!
    expect(a).toBeCloseTo(4.6, 6)
    expect(b).toBeCloseTo(2.4, 6)
    expect(c).toBe(3.5)
  })

  it('past 2 m the lane is held at 2, and the notice is said once', () => {
    load([80], THREE)
    render(<App />)
    pickStreet()
    const show = vi.spyOn(useToast.getState(), 'show')
    pullLine(hit(0, 0), 3)
    expect(lanesOfSeg('s1')).toEqual([5, 2, 3.5])
    expect(show.mock.calls.filter((c) => c[1] === 'A lane is 2 m wide at least')).toHaveLength(1)
    show.mockRestore()
  })

  it('an unstored street shows its lanes and drags them: 8 m, line 0 by 1 m: [5, 3] stored', () => {
    load([80], { left: 4, right: 4 })
    render(<App />)
    pickStreet()
    pullLine(hit(0, 0), 1)
    expect(lanesOfSeg('s1')).toEqual([5, 3])
  })

  it('Shift: every stretch that has that line moves; a stretch with one lane has none and stays', () => {
    load([80, 80, 80], THREE)
    act(() => {
      useApp.setState((st) => ({
        project: { ...st.project, options: st.project.options.map((o, i) => (i === 0 ? { ...o, streets: { ...o.streets!, segments: o.streets!.segments.map((g) => (g.id === 's2' ? { ...g, left: 0, right: 3.5, lanes: [3.5] } : g)) } } : o)) },
      }))
      useApp.setState((st) => ({ derived: derive(st.project, 'o1') }))
    })
    render(<App />)
    pickStreet()
    const steps = s().history.past.length
    pullLine(hit(0, 0), 1, { shiftKey: true })
    expect(lanesOfSeg('s1')).toEqual([4.5, 2.5, 3.5])
    expect(lanesOfSeg('s2')).toEqual([3.5])
    expect(lanesOfSeg('s3')).toEqual([4.5, 2.5, 3.5])
    expect(s().history.past).toHaveLength(steps + 1)
  })

  it('without Shift only its own stretch', () => {
    load([80, 80], THREE)
    render(<App />)
    pickStreet()
    pullLine(hit(0, 0), 1)
    expect(lanesOfSeg('s1')).toEqual([4.5, 2.5, 3.5])
    expect(lanesOfSeg('s2')).toEqual([3.5, 3.5, 3.5])
  })

  it('a locked stretch’s line starts nothing and says it is locked', () => {
    load([80, 80], THREE)
    act(() => {
      useApp.setState((st) => ({
        project: { ...st.project, options: st.project.options.map((o, i) => (i === 0 ? { ...o, streets: { ...o.streets!, segments: o.streets!.segments.map((g) => (g.id === 's2' ? { ...g, locked: true } : g)) } } : o)) },
      }))
      useApp.setState((st) => ({ derived: derive(st.project, 'o1') }))
    })
    render(<App />)
    pickStreet()
    const before = s().project
    fireEvent.pointerDown(hit(1, 0), at(where(hit(1, 0))))
    expect(useTyped.getState().cur).toBeNull()
    expect(useToast.getState().toast?.text).toMatch(/ocked/)
    expect(s().project).toBe(before)
  })

  it('an existing street’s line: the same', () => {
    load([80], THREE, [{ left: 4, right: 4 }])
    render(<App />)
    pickExisting()
    pullLine(hit(0, 0), 1)
    expect(s().project.site.existingRoads![0].stretches[0].lanes).toEqual([5, 3])
  })
})

describe('a number typed after a lane line', () => {
  beforeEach(zoomed)
  it('3 after a press on its left: that lane is 3 and the other takes the rest: [3, 4, 3.5]; one undo step', () => {
    load([80], THREE)
    render(<App />)
    pickStreet()
    const steps = s().history.past.length
    pullLine(hit(0, 0), 1.1, {}, 0.6)
    expect(typed('3')).toBe(true)
    expect(lanesOfSeg('s1')).toEqual([3, 4, 3.5])
    expect(s().history.past).toHaveLength(steps + 1)
  })

  it('3 after a press on its right: the lane on its right is 3: [4, 3, 3.5]', () => {
    load([80], THREE)
    render(<App />)
    pickStreet()
    pullLine(hit(0, 0), 1.1, {}, -0.6)
    expect(typed('3')).toBe(true)
    expect(lanesOfSeg('s1')).toEqual([4, 3, 3.5])
  })

  it('1.5 is refused, said, and the field stays', () => {
    load([80], THREE)
    render(<App />)
    pickStreet()
    pullLine(hit(0, 0), 1.1, {}, 0.6)
    expect(typed('1.5')).toBe(false)
    expect(useTyped.getState().cur?.error).toBe('A lane is 2 m wide at least')
    expect(useTyped.getState().cur).not.toBeNull()
    expect(lanesOfSeg('s1')).toEqual([4.5, 2.5, 3.5])
  })

  it('Shift: the typed lane is set on every stretch that has the line', () => {
    load([80, 80], THREE)
    render(<App />)
    pickStreet()
    pullLine(hit(0, 0), 1.1, { shiftKey: true }, 0.6)
    expect(typed('3')).toBe(true)
    expect(lanesOfSeg('s1')).toEqual([3, 4, 3.5])
    expect(lanesOfSeg('s2')).toEqual([3, 4, 3.5])
  })

  it('the command line names it: Street · stretch 1 · lane line 1', () => {
    load([80], THREE)
    render(<App />)
    pickStreet()
    fireEvent.pointerDown(hit(0, 0), at(where(hit(0, 0))))
    expect(useTyped.getState().cur).toMatchObject({ name: 'Street · stretch 1 · lane line 1', phase: 'dragging' })
    fireEvent.pointerUp(hit(0, 0), at(where(hit(0, 0))))
  })
})

describe('the side pill on a street with lanes', () => {
  const sidePill = (k: number, side: 'left' | 'right') => document.querySelector(`[data-path-side="${k}"][data-side="${side}"]`)!
  const pullSide = (el: Element, out: number, north: boolean) => {
    const from = where(el)
    const to = { x: from.x, y: from.y + (north ? out : -out) }
    fireEvent.pointerDown(el, at(from))
    fireEvent.pointerMove(el, at({ x: to.x + 8, y: to.y }))
    fireEvent.pointerMove(el, at(to))
    return () => fireEvent.pointerUp(el, at(to))
  }

  it('pulled out 1 m, the edge lane grows, and it reads Lane 4.5 m · 11.5 m', () => {
    load([80], THREE)
    render(<App />)
    pickStreet()
    const up = pullSide(sidePill(0, 'right'), 1, false)
    expect(useTyped.getState().cur?.shown).toBe('Lane 4.5 m · 11.5 m')
    up()
    expect(seg('s1')).toMatchObject({ left: 0, right: 11.5, lanes: [3.5, 3.5, 4.5] })
  })

  it('pulled in past the edge lane, the lane goes (the rest of the cut off the next), said once', () => {
    load([80], THREE)
    render(<App />)
    pickStreet()
    const up = pullSide(sidePill(0, 'right'), 5, true)
    expect(useTyped.getState().cur?.shown).toBe('Lane 2 m · 5.5 m')
    up()
    expect(seg('s1')).toMatchObject({ left: 0, right: 5.5, lanes: [3.5, 2] })
    expect(useToast.getState().toast?.text).toBe('The lane on that edge went')
  })

  it('a street with no stored lanes reads its width alone, as before', () => {
    load([80], { left: 4, right: 4 })
    render(<App />)
    pickStreet()
    pullSide(sidePill(0, 'left'), 1, true)
    expect(useTyped.getState().cur?.shown).toBe('9 m')
  })
})

describe('Equal lanes', () => {
  const equalRow = () => leaf(menuFor(pickedRefs(), 'plan', null), 'equal-lanes')

  it('on [3, 3.5, 4]: three of 3.5, one undo step', () => {
    load([80], { left: 0, right: 10.5, lanes: [3, 3.5, 4] })
    act(() => pickRefs([{ kind: 'street', id: 'street:s1' }]))
    const steps = s().history.past.length
    expect(equalRow()).toMatchObject({ label: 'Equal lanes' })
    expect(equalRow().disabled).toBeFalsy()
    act(() => equalRow().onSelect())
    expect(lanesOfSeg('s1')).toEqual([3.5, 3.5, 3.5])
    expect(s().history.past).toHaveLength(steps + 1)
    s().undo()
    expect(lanesOfSeg('s1')).toEqual([3, 3.5, 4])
  })

  it('greyed when they are equal already: stored or not', () => {
    load([80], THREE)
    act(() => pickRefs([{ kind: 'street', id: 'street:s1' }]))
    expect(equalRow()).toMatchObject({ disabled: true, title: 'Its lanes are equal already' })
    load([80], { left: 4, right: 4 })
    act(() => pickRefs([{ kind: 'street', id: 'street:s1' }]))
    expect(equalRow()).toMatchObject({ disabled: true, title: 'Its lanes are equal already' })
  })

  it('on an existing street: the same', () => {
    load([80], THREE, [{ left: 5, right: 5, lanes: [2, 3, 5] }])
    act(() => pickRefs([{ kind: 'existing-road', id: 'er1' }]))
    act(() => equalRow().onSelect())
    const [r] = s().project.site.existingRoads!
    expect(r.stretches[0].lanes!.map((x) => Math.round(x * 1e6) / 1e6)).toEqual([3.333333, 3.333333, 3.333333])
  })

  it('a locked stretch refuses it, with its reason', () => {
    load([80], { left: 0, right: 10.5, lanes: [3, 3.5, 4], locked: true })
    act(() => pickRefs([{ kind: 'street', id: 'street:s1' }]))
    expect(equalRow()).toMatchObject({ disabled: true, title: 'That stretch is locked' })
  })
})
