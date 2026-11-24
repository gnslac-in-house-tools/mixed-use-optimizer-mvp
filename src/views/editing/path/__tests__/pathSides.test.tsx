// Width by hand (Phase PE.1 task 11, Decision "Path engine"): a picked street or existing street shows a pill on each side of every stretch
// (`data-path-side`, `data-side`, `data-x`, `data-y`; a side at 0 has one too, on the drawn line). A pill dragged moves only that side, the other
// side and the drawn line stay, the width snapped to 0.5 m (Ctrl frees it); Shift moves that side of the whole street by the same amount (a side at
// 0 stays); a number typed during or after the drag is the stretch's width by that side (Shift: every stretch's), exactly, one undo step; a locked
// stretch's pill starts nothing, and Shift on another refuses the whole. *Equal sides* (the menu) puts the drawn line in the middle again.
// jsdom has no layout: the plan uses UNMEASURED_SIZE and `at` turns world metres into screen pixels.
import { act, fireEvent, render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Point } from '../../../../model/schema.ts'
import { App } from '../../../../App.tsx'
import { derive } from '../../../../engine/derive.ts'
import { demoProject } from '../../../../state/demo.ts'
import { emptyHistory } from '../../../../state/history.ts'
import { NO_SELECTION, useApp } from '../../../../state/store.ts'
import { useGraph } from '../../../graph/graphState.ts'
import { useUi } from '../../../layout/ui.ts'
import { useRoads } from '../../../plan/circulation/roadState.ts'
import { useAccess } from '../../../plan/access/accessState.ts'
import { pickedRefs, pickRefs } from '../../../plan/mix.ts'
import { fit, UNMEASURED_SIZE } from '../../../plan/camera.ts'
import { useCommand } from '../../../plan/command/commandState.ts'
import { letGo } from '../../../tools/hand.ts'
import { enterTyped, resetTyped, setTyped, useTyped } from '../../dimension/typed.ts'
import { menuFor } from '../../menu/build.ts'
import { leaf } from '../../menu/__tests__/helpers.ts'

vi.mock('../../../scene/Scene.tsx', () => ({ Scene: () => <div data-testid="scene" /> }))

const s = () => useApp.getState()

// three stretches in an L-bend: n1 → n2 → n3 → n4, away from the demo's buildings
const nodes = [
  { id: 'n1', x: 40, y: 235 },
  { id: 'n2', x: 80, y: 235 },
  { id: 'n3', x: 120, y: 235 },
  { id: 'n4', x: 120, y: 260 },
]
type Sides = { left: number; right: number }
const sides = (a: Sides, b: Sides, c: Sides) => [
  { id: 's1', a: 'n1', b: 'n2', type: 'trucks', ...a },
  { id: 's2', a: 'n2', b: 'n3', type: 'trucks', ...b },
  { id: 's3', a: 'n3', b: 'n4', type: 'trucks', ...c },
]
const EQ = { left: 4, right: 4 }
const roadOf = (stretches: Sides[]) => ({ id: 'er1', points: [{ x: 300, y: 60 }, { x: 340, y: 60 }, { x: 380, y: 60 }], stretches })

function load(segments = sides(EQ, EQ, EQ), existing: Sides[] = [EQ, EQ]) {
  const p = demoProject({ streets: false })
  const q = {
    ...p,
    site: { ...p.site, existingRoads: [roadOf(existing)] },
    options: [{ ...p.options[0], streets: { nodes, segments } }, ...p.options.slice(1)],
  }
  useApp.setState({ project: q, derived: derive(q, 'o1'), history: emptyHistory(), dragStart: null, selection: NO_SELECTION, level: 'l1', showAll: false, option: 'o1' })
  useRoads.setState({ picked: null, node: null, also: [] })
  useAccess.setState({ picked: null, alsoGates: [], alsoSite: [] })
}

beforeEach(() => {
  localStorage.clear()
  load()
  useUi.setState({ view: 'plan', rail: 'layers', panels: { left: true, right: true }, sheet: null, help: false })
  useGraph.setState({ graph: false, rule: null, relation: null })
  letGo()
  resetTyped()
  useCommand.setState({ registration: null, angle: null, cursor: null })
})

const v = fit({ minX: 0, minY: -15, maxX: 440, maxY: 280 }, UNMEASURED_SIZE)
const at = (q: Point, extra: object = {}) => ({
  clientX: (q.x - v.cx) * v.scale + UNMEASURED_SIZE.w / 2,
  clientY: UNMEASURED_SIZE.h / 2 - (q.y - v.cy) * v.scale,
  button: 0,
  pointerId: 1,
  ...extra,
})
const streets = () => s().project.options[0].streets!
const seg = (id: string) => streets().segments.find((g) => g.id === id)!
const sidesOf = (id: string) => [seg(id).left, seg(id).right]
const pickStreet = () => {
  const el = document.querySelector('[data-road="street:s1"]')!
  fireEvent.pointerDown(el, at({ x: 60, y: 235 }))
  fireEvent.pointerUp(el, at({ x: 60, y: 235 }))
}
const pickExisting = () => act(() => useAccess.getState().pick({ kind: 'existing', id: 'er1' }))
const pill = (k: number, side: 'left' | 'right') => document.querySelector(`[data-path-side="${k}"][data-side="${side}"]`)!
const where = (el: Element): Point => ({ x: Number(el.getAttribute('data-x')), y: Number(el.getAttribute('data-y')) })
/** A pill pulled by `out` m across the stretch, to the north (y up) when `north`, else south. */
const pull = (el: Element, out: number, north: boolean, extra: object = {}) => {
  const from = where(el)
  const to = { x: from.x, y: from.y + (north ? out : -out) }
  fireEvent.pointerDown(el, at(from, extra))
  fireEvent.pointerMove(el, at({ x: to.x + 8, y: to.y + 8 }, extra))
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

describe('the pills of a street picked', () => {
  it('two on each stretch, the left one on the left of its drawn line; none when it is not picked', () => {
    render(<App />)
    expect(document.querySelector('[data-path-side]')).toBeNull()
    pickStreet()
    const all = [...document.querySelectorAll('[data-path-side]')]
    expect(all.map((e) => [e.getAttribute('data-path-side'), e.getAttribute('data-side')])).toEqual([
      ['0', 'left'], ['0', 'right'], ['1', 'left'], ['1', 'right'], ['2', 'left'], ['2', 'right'],
    ])
    // stretch 1 runs east along y 235: its left edge is 4 m north, its right 4 m south
    expect(where(pill(1, 'left')).y).toBe(239)
    expect(where(pill(1, 'right')).y).toBe(231)
    // stretch 2 runs north: its left edge is the west one
    expect(where(pill(2, 'left')).x).toBe(116)
  })

  it('a street drawn by its left edge has a pill on its drawn side too, on the drawn line', () => {
    load(sides(EQ, { left: 0, right: 8 }, EQ))
    render(<App />)
    pickStreet()
    expect(where(pill(1, 'left')).y).toBe(235)
    expect(where(pill(1, 'right')).y).toBe(227)
  })

  it('the left pill pulled 2.3 m out: left 6.5, the right and the drawn line stay (the width snaps to 10.5); one undo step', () => {
    render(<App />)
    pickStreet()
    const steps = s().history.past.length
    pull(pill(1, 'left'), 2.3, true)
    expect(sidesOf('s2')).toEqual([6.5, 4])
    expect(sidesOf('s1')).toEqual([4, 4])
    expect(sidesOf('s3')).toEqual([4, 4])
    expect(streets().nodes).toEqual(nodes)
    expect(s().history.past).toHaveLength(steps + 1)
    s().undo()
    expect(sidesOf('s2')).toEqual([4, 4])
  })

  it('the right pill pulled out is the right side that grows', () => {
    render(<App />)
    pickStreet()
    pull(pill(1, 'right'), 2, false)
    expect(sidesOf('s2')).toEqual([4, 6])
  })

  it('with Ctrl the width is free: left 6.3', () => {
    render(<App />)
    pickStreet()
    pull(pill(1, 'left'), 2.3, true, { ctrlKey: true })
    expect(sidesOf('s2')[0]).toBeCloseTo(6.3, 6)
    expect(sidesOf('s2')[1]).toBe(4)
  })

  it('pulled across its drawn line it stops there: that side is 0, the street stays 0.5 m wide at least', () => {
    render(<App />)
    pickStreet()
    pull(pill(1, 'left'), 20, false)
    expect(sidesOf('s2')).toEqual([0, 4])
    pull(pill(1, 'right'), 20, true)
    expect(seg('s2').left + seg('s2').right).toBeGreaterThanOrEqual(0.5)
  })

  it('a street drawn by its left edge, its drawn-side pill dragged: it widens to the left of the axis', () => {
    load(sides(EQ, { left: 0, right: 8 }, EQ))
    render(<App />)
    pickStreet()
    pull(pill(1, 'left'), 2, true)
    expect(sidesOf('s2')).toEqual([2, 8])
    expect(streets().nodes).toEqual(nodes)
  })
})

describe('a number typed after a pill', () => {
  it('12 is the stretch’s width by that side: left 8; still one undo step', () => {
    render(<App />)
    pickStreet()
    const steps = s().history.past.length
    pull(pill(1, 'left'), 2.3, true)
    expect(typed('12')).toBe(true)
    expect(sidesOf('s2')).toEqual([8, 4])
    expect(s().history.past).toHaveLength(steps + 1)
  })

  it('0.2 is refused, said, and the field stays; a width under the other side is refused as passing the drawn line', () => {
    render(<App />)
    pickStreet()
    pull(pill(1, 'left'), 2.3, true)
    expect(typed('0.2')).toBe(false)
    expect(useTyped.getState().cur?.error).toBe('A street is 0.5 m wide at least')
    expect(sidesOf('s2')).toEqual([6.5, 4])
    expect(typed('3')).toBe(false)
    expect(useTyped.getState().cur?.error).toBe('That side would pass the drawn line')
    expect(useTyped.getState().cur).not.toBeNull()
    expect(sidesOf('s2')).toEqual([6.5, 4])
  })
})

describe('Shift: that side of the whole street', () => {
  it('every stretch moves by the same snapped amount; a side at 0 stays at 0', () => {
    load(sides(EQ, EQ, { left: 0, right: 8 }))
    render(<App />)
    pickStreet()
    const steps = s().history.past.length
    pull(pill(1, 'left'), 2.3, true, { shiftKey: true })
    expect(sidesOf('s1')).toEqual([6.5, 4])
    expect(sidesOf('s2')).toEqual([6.5, 4])
    expect(sidesOf('s3')).toEqual([0, 8])
    expect(s().history.past).toHaveLength(steps + 1)
  })

  it('Shift on a pill whose side is 0 moves that side of every stretch, the 0 ones too (as the typed number does)', () => {
    load(sides(EQ, { left: 0, right: 8 }, { left: 0, right: 8 }))
    render(<App />)
    pickStreet()
    pull(pill(1, 'left'), 2, true, { shiftKey: true })
    expect(sidesOf('s1')).toEqual([6, 4])
    expect(sidesOf('s2')).toEqual([2, 8])
    expect(sidesOf('s3')).toEqual([2, 8])
    // the drawn line stays where it was
    expect(streets().nodes).toEqual(nodes)
  })

  it('Shift and 9 typed: each stretch 9 m wide by that side', () => {
    load(sides(EQ, EQ, { left: 0, right: 8 }))
    render(<App />)
    pickStreet()
    pull(pill(1, 'left'), 2.3, true, { shiftKey: true })
    expect(typed('9')).toBe(true)
    expect(sidesOf('s1')).toEqual([5, 4])
    expect(sidesOf('s2')).toEqual([5, 4])
    expect(sidesOf('s3')).toEqual([1, 8])
  })

  it('a locked stretch among them: refused, nothing changes; the free pill alone still works; the locked one’s pill starts nothing', () => {
    load(sides(EQ, EQ, { ...EQ, locked: true } as Sides))
    render(<App />)
    pickStreet()
    const before = s().project
    pull(pill(1, 'left'), 2.3, true, { shiftKey: true })
    expect(s().project).toBe(before)
    pull(pill(2, 'left'), 2, true)
    expect(s().project).toBe(before)
    pull(pill(1, 'left'), 2, true)
    expect(sidesOf('s2')).toEqual([6, 4])
    expect(sidesOf('s1')).toEqual([4, 4])
  })
})

describe('an existing street: the same pills', () => {
  it('two on each stretch; the left pill pulled 2 m: left 6', () => {
    render(<App />)
    pickExisting()
    expect(document.querySelectorAll('[data-path-side]')).toHaveLength(4)
    const steps = s().history.past.length
    pull(pill(0, 'left'), 2, true)
    expect(s().project.site.existingRoads![0].stretches.map((x) => [x.left, x.right])).toEqual([[6, 4], [4, 4]])
    expect(s().history.past).toHaveLength(steps + 1)
  })

  it('Shift moves that side of every stretch; 12 typed after it is each stretch’s width by that side', () => {
    render(<App />)
    pickExisting()
    pull(pill(0, 'right'), 2, false, { shiftKey: true })
    expect(s().project.site.existingRoads![0].stretches.map((x) => [x.left, x.right])).toEqual([[4, 6], [4, 6]])
    expect(typed('12')).toBe(true)
    expect(s().project.site.existingRoads![0].stretches.map((x) => [x.left, x.right])).toEqual([[4, 8], [4, 8]])
  })
})

describe('Equal sides', () => {
  const equalRow = () => leaf(menuFor(pickedRefs(), 'plan', null), 'equal-sides')

  it('on a street drawn by its left edge: the drawn line moves 4 m, its paving stays', () => {
    load(sides({ left: 0, right: 8 }, { left: 0, right: 8 }, { left: 0, right: 8 }))
    act(() => pickRefs([{ kind: 'street', id: 'street:s1' }]))
    const steps = s().history.past.length
    expect(equalRow()).toMatchObject({ label: 'Equal sides' })
    expect(equalRow().disabled).toBeFalsy()
    act(() => equalRow().onSelect())
    expect(sidesOf('s1')).toEqual([4, 4])
    // walking east, the paving lay south of the drawn line: it is the centre now
    const n1 = streets().nodes.find((n) => n.id === 'n1')!
    expect(n1.y).toBeCloseTo(231, 6)
    expect(s().history.past).toHaveLength(steps + 1)
  })

  it('greyed on equal sides, with its reason', () => {
    act(() => pickRefs([{ kind: 'street', id: 'street:s1' }]))
    expect(equalRow()).toMatchObject({ disabled: true, title: 'Its sides are equal already' })
  })

  it('on an existing street: the same', () => {
    load(sides(EQ, EQ, EQ), [{ left: 0, right: 8 }, { left: 0, right: 8 }])
    act(() => pickRefs([{ kind: 'existing-road', id: 'er1' }]))
    act(() => equalRow().onSelect())
    const road = s().project.site.existingRoads![0]
    expect(road.stretches.map((x) => [x.left, x.right])).toEqual([[4, 4], [4, 4]])
    expect(road.points.map((q) => q.y)).toEqual([56, 56, 56])
  })
})
