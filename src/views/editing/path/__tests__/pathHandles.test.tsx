// One set of path handles for streets and existing streets (Phase PE.1 task 10, Decision "Path engine"): a picked street or existing
// street shows a dot per node (`data-path-node`) and a diamond per stretch (`data-path-stretch`, `data-x`, `data-y` at its middle).
// A node dragged follows the street; a stretch dragged moves, its neighbours stretching; a number typed after either sets it exactly,
// one undo step; a click on a node picks it, Delete or a double click removes it; a double click on a stretch adds a node.
// jsdom has no layout: the plan uses UNMEASURED_SIZE and `at` turns world metres into screen pixels.
import { act, fireEvent, render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Point } from '../../../../model/schema.ts'
import { App } from '../../../../App.tsx'
import { derive } from '../../../../engine/derive.ts'
import { demoProject } from '../../../../state/demo.ts'
import { emptyHistory } from '../../../../state/history.ts'
import { NO_SELECTION, useApp } from '../../../../state/store.ts'
import { actions } from '../../../../state/actions/index.ts'
import { useGraph } from '../../../graph/graphState.ts'
import { useUi } from '../../../layout/ui.ts'
import { useRoads } from '../../../plan/circulation/roadState.ts'
import { useAccess } from '../../../plan/access/accessState.ts'
import { fit, UNMEASURED_SIZE } from '../../../plan/camera.ts'
import { useCommand } from '../../../plan/command/commandState.ts'
import { letGo } from '../../../tools/hand.ts'
import { EXISTING_ROADS, STREETS, existingRoad } from '../../../layers/keys.ts'
import { useLayerView } from '../../../layers/layerView.ts'
import { usePathPick } from '../pathState.ts'
import { enterTyped, resetTyped, setTyped } from '../../dimension/typed.ts'

vi.mock('../../../scene/Scene.tsx', () => ({ Scene: () => <div data-testid="scene" /> }))

const s = () => useApp.getState()

// three segments in an L-bend: n1 → n2 → n3 → n4, away from the demo's buildings
const nodes = [
  { id: 'n1', x: 40, y: 235 },
  { id: 'n2', x: 80, y: 235 },
  { id: 'n3', x: 120, y: 235 },
  { id: 'n4', x: 120, y: 260 },
]
const segments = [
  { id: 's1', a: 'n1', b: 'n2', type: 'trucks', left: 4, right: 4 },
  { id: 's2', a: 'n2', b: 'n3', type: 'trucks', left: 4, right: 4 },
  { id: 's3', a: 'n3', b: 'n4', type: 'trucks', left: 4, right: 4 },
]
const road = { id: 'er1', points: [{ x: 300, y: 60 }, { x: 340, y: 60 }, { x: 380, y: 60 }], stretches: [{ left: 4, right: 4 }, { left: 4, right: 4 }] }

beforeEach(() => {
  localStorage.clear()
  const p = demoProject({ streets: false })
  const q = {
    ...p,
    site: { ...p.site, existingRoads: [road] },
    options: [{ ...p.options[0], streets: { nodes, segments } }, ...p.options.slice(1)],
  }
  useApp.setState({ project: q, derived: derive(q, 'o1'), history: emptyHistory(), dragStart: null, selection: NO_SELECTION, level: 'l1', showAll: false, option: 'o1' })
  useUi.setState({ view: 'plan', rail: 'layers', panels: { left: true, right: true }, sheet: null, help: false })
  useGraph.setState({ graph: false, rule: null, relation: null })
  letGo()
  resetTyped()
  useRoads.setState({ picked: null, node: null, also: [] })
  usePathPick.setState({ key: null, node: null })
  useLayerView.setState({ hidden: [] })
  useAccess.setState({ picked: null, alsoGates: [], alsoSite: [] })
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
const pos = (id: string) => {
  const n = streets().nodes.find((x) => x.id === id)!
  return { x: Math.round(n.x * 100) / 100, y: Math.round(n.y * 100) / 100 }
}
const pickStreet = () => {
  const el = document.querySelector('[data-road="street:s1"]')!
  fireEvent.pointerDown(el, at({ x: 60, y: 235 }))
  fireEvent.pointerUp(el, at({ x: 60, y: 235 }))
}
const pickExisting = () => act(() => useAccess.getState().pick({ kind: 'existing', id: 'er1' }))
const node = (id: string) => document.querySelector(`[data-path-node="${id}"]`)!
const stretch = (k: number) => document.querySelector(`[data-path-stretch="${k}"]`)!
const drag = (el: Element, from: Point, to: Point) => {
  fireEvent.pointerDown(el, at(from, { shiftKey: true }))
  fireEvent.pointerMove(el, at(to, { shiftKey: true }))
  fireEvent.pointerUp(el, at(to, { shiftKey: true }))
}
const typed = (text: string) =>
  act(() => {
    setTyped(text)
    expect(enterTyped()).toBe(true)
  })

describe('a street picked: its path handles', () => {
  it('a dot per node and a diamond per stretch; none when it is not picked', () => {
    render(<App />)
    expect(document.querySelector('[data-path-node],[data-path-stretch]')).toBeNull()
    pickStreet()
    expect([...document.querySelectorAll('[data-path-node]')].map((e) => e.getAttribute('data-path-node'))).toEqual(['n1', 'n2', 'n3', 'n4'])
    expect([...document.querySelectorAll('[data-path-stretch]')].map((e) => e.getAttribute('data-path-stretch'))).toEqual(['0', '1', '2'])
    expect([Number(stretch(1).getAttribute('data-x')), Number(stretch(1).getAttribute('data-y'))]).toEqual([100, 235])
  })

  it('a node dragged: the street follows; one undo step; `@10,0` typed after it moves it there, still one step', () => {
    render(<App />)
    pickStreet()
    const steps = s().history.past.length
    drag(node('n2'), { x: 80, y: 235 }, { x: 85, y: 240 })
    expect(pos('n2')).toEqual({ x: 85, y: 240 })
    expect(s().history.past).toHaveLength(steps + 1)
    typed('@10,0')
    expect(pos('n2')).toEqual({ x: 90, y: 235 })
    expect(s().history.past).toHaveLength(steps + 1)
    expect(pos('n1')).toEqual({ x: 40, y: 235 })
  })

  it('a node dragged without Shift is snapped as a drawn point (it lands on a snapped place, not where the pointer is)', () => {
    render(<App />)
    pickStreet()
    const el = node('n1')
    fireEvent.pointerDown(el, at({ x: 40, y: 235 }))
    fireEvent.pointerMove(el, at({ x: 42.37, y: 221.61 }))
    fireEvent.pointerUp(el, at({ x: 42.37, y: 221.61 }))
    const n = streets().nodes.find((x) => x.id === 'n1')!
    expect(n.y).not.toBe(235)
    expect(n.x !== 42.37 || n.y !== 221.61).toBe(true)
  })

  it('a click on a node picks it; Delete removes it, its two stretches merging', () => {
    render(<App />)
    pickStreet()
    fireEvent.pointerDown(node('n2'), at({ x: 80, y: 235 }))
    fireEvent.pointerUp(node('n2'), at({ x: 80, y: 235 }))
    expect(node('n2').getAttribute('data-picked')).toBe('true')
    fireEvent.keyDown(window, { key: 'Delete' })
    expect(streets().nodes.map((n) => n.id)).toEqual(['n1', 'n3', 'n4'])
    expect(streets().segments).toHaveLength(2)
  })

  it('a double click on a node removes it', () => {
    render(<App />)
    pickStreet()
    fireEvent.doubleClick(node('n3'))
    expect(streets().nodes.map((n) => n.id)).toEqual(['n1', 'n2', 'n4'])
  })

  it('a double click on a stretch adds a node in its middle', () => {
    render(<App />)
    pickStreet()
    fireEvent.doubleClick(stretch(1))
    expect(streets().nodes).toHaveLength(5)
    expect(streets().nodes.some((n) => n.x === 100 && n.y === 235)).toBe(true)
  })

  it('a stretch dragged by (5, 3): both its nodes move, the far ones stay; `5` typed moves it 5 m across, one step', () => {
    render(<App />)
    pickStreet()
    const steps = s().history.past.length
    drag(stretch(1), { x: 100, y: 235 }, { x: 105, y: 238 })
    expect(pos('n2')).toEqual({ x: 85, y: 238 })
    expect(pos('n3')).toEqual({ x: 125, y: 238 })
    expect(pos('n1')).toEqual({ x: 40, y: 235 })
    expect(pos('n4')).toEqual({ x: 120, y: 260 })
    expect(s().history.past).toHaveLength(steps + 1)
    typed('5')
    expect(pos('n2').y).toBe(240)
    expect(pos('n3').y).toBe(240)
    expect(s().history.past).toHaveLength(steps + 1)
  })

  it('Escape mid-drag leaves the project as it was', () => {
    render(<App />)
    pickStreet()
    const before = s().project
    fireEvent.pointerDown(node('n2'), at({ x: 80, y: 235 }, { shiftKey: true }))
    fireEvent.pointerMove(node('n2'), at({ x: 90, y: 245 }, { shiftKey: true }))
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(s().project).toBe(before)
  })
})

describe('an existing street picked: the same handles, the same edits', () => {
  const road0 = () => s().project.site.existingRoads![0]

  it('a dot per node and a diamond per stretch', () => {
    render(<App />)
    pickExisting()
    expect([...document.querySelectorAll('[data-path-node]')].map((e) => e.getAttribute('data-path-node'))).toEqual(['0', '1', '2'])
    expect(document.querySelectorAll('[data-path-stretch]')).toHaveLength(2)
  })

  it('a node dragged moves it on the site’s road; a stretch dragged moves both its nodes', () => {
    render(<App />)
    pickExisting()
    drag(node('1'), { x: 340, y: 60 }, { x: 345, y: 70 })
    expect(road0().points[1].x).toBeCloseTo(345)
    expect(road0().points[1].y).toBeCloseTo(70)
    drag(stretch(0), { x: 322, y: 65 }, { x: 322, y: 75 })
    expect(road0().points[0].y).toBeCloseTo(70)
    expect(road0().points[1].y).toBeCloseTo(80)
  })

  it('Delete removes a picked inner node, the stretches merging; a double click on a stretch adds a node', () => {
    render(<App />)
    pickExisting()
    fireEvent.pointerDown(node('1'), at({ x: 340, y: 60 }))
    fireEvent.pointerUp(node('1'), at({ x: 340, y: 60 }))
    fireEvent.keyDown(window, { key: 'Delete' })
    expect(road0().points).toHaveLength(2)
    expect(road0().stretches).toHaveLength(1)
    fireEvent.doubleClick(stretch(0))
    expect(road0().points).toHaveLength(3)
  })

  it('its linked street ends follow', () => {
    // a street end on the road's drawn line, linked to it, goes with the road's node
    const p = s().project
    const linked = actions.drawStreet(p, 'o1', [{ x: 320, y: 60 }, { x: 320, y: 120 }], undefined, undefined, undefined, undefined)
    act(() => s().apply(() => linked!.project))
    const end = s().project.options[0].streets!.nodes.find((n) => n.road === 'er1')
    expect(end).toBeTruthy()
    render(<App />)
    pickExisting()
    drag(node('0'), { x: 300, y: 60 }, { x: 300, y: 70 })
    const after = s().project.options[0].streets!.nodes.find((n) => n.id === end!.id)!
    expect(after.y).toBeGreaterThan(60)
  })
})

describe('no handles, or none that start', () => {
  it('a street with every segment locked or hidden shows none', () => {
    render(<App />)
    pickStreet()
    expect(node('n2')).not.toBeNull()
    act(() => s().apply((p) => actions.lockStreets(p, ['s1', 's2', 's3'], true, 'o1')))
    expect(document.querySelector('[data-path-node],[data-path-stretch]')).toBeNull()
  })

  it('a street or an existing street hidden, by its kind or by itself, shows none', () => {
    const none = () => document.querySelector('[data-path-node],[data-path-stretch],[data-path-side]')
    render(<App />)
    pickExisting()
    expect(node('0')).not.toBeNull()
    act(() => useLayerView.getState().setHidden([existingRoad('er1')], true))
    expect(none()).toBeNull()
    act(() => useLayerView.getState().setHidden([existingRoad('er1')], false))
    act(() => useLayerView.getState().setHidden([EXISTING_ROADS], true))
    expect(none()).toBeNull()
    act(() => useLayerView.getState().setHidden([EXISTING_ROADS], false))
    pickStreet()
    expect(node('n2')).not.toBeNull()
    act(() => useLayerView.getState().setHidden([STREETS], true))
    expect(none()).toBeNull()
  })

  it('a locked segment’s diamond and the nodes it holds start nothing', () => {
    render(<App />)
    pickStreet()
    act(() => s().apply((p) => actions.lockStreets(p, ['s2'], true, 'o1')))
    const before = s().project
    drag(stretch(1), { x: 100, y: 235 }, { x: 105, y: 238 })
    drag(node('n2'), { x: 80, y: 235 }, { x: 90, y: 245 })
    expect(s().project).toBe(before)
    // the next stretch shares n3, which s2 holds: its free end alone moves
    drag(stretch(2), { x: 120, y: 247.5 }, { x: 125, y: 247.5 })
    expect(s().project).not.toBe(before)
    expect(pos('n3')).toEqual({ x: 120, y: 235 })
    expect(pos('n4').x).toBe(125)
  })
})

describe('what is picked of a path is let go when it is no longer there', () => {
  const road0 = () => s().project.site.existingRoads![0]
  const clickNode = (id: string, q: Point) => {
    fireEvent.pointerDown(node(id), at(q))
    fireEvent.pointerUp(node(id), at(q))
  }
  const removeFirst = () => act(() => s().apply((p) => actions.editPath(p, { kind: 'existing-road', id: 'er1' }, { op: 'remove', i: 0 }, 'o1').project))

  it('an existing street’s node picked, then the street loses a node (an undo, say): the pick goes', () => {
    render(<App />)
    pickExisting()
    clickNode('2', { x: 380, y: 60 })
    expect(usePathPick.getState().node).toBe('2')
    removeFirst()
    expect(usePathPick.getState().node).toBeNull()
  })

  it('node ids of an existing street are indexes: one that stays in range but means another node is let go too', () => {
    render(<App />)
    pickExisting()
    clickNode('1', { x: 340, y: 60 })
    expect(usePathPick.getState().node).toBe('1')
    removeFirst()
    expect(usePathPick.getState().node).toBeNull()
  })

  it('a drag that keeps the nodes keeps the pick', () => {
    render(<App />)
    pickExisting()
    clickNode('1', { x: 340, y: 60 })
    drag(stretch(0), { x: 320, y: 60 }, { x: 320, y: 70 })
    expect(road0().points[0].y).toBeCloseTo(70)
    expect(usePathPick.getState().node).toBe('1')
  })
})

describe('the handles’ drawing order and names', () => {
  it('the node dots are drawn last, over the side pills', () => {
    render(<App />)
    pickStreet()
    const kids = [...document.querySelector('[data-layer="path-handles"]')!.children]
    const lastPill = Math.max(...kids.map((e, i) => (e.hasAttribute('data-path-side') ? i : -1)))
    const firstDot = Math.min(...kids.map((e, i) => (e.hasAttribute('data-path-node') ? i : Infinity)))
    expect(firstDot).toBeGreaterThan(lastPill)
  })

  it('a pill says which kind of street it widens', () => {
    render(<App />)
    pickStreet()
    expect(document.querySelector('[data-path-side="0"][data-side="left"]')!.getAttribute('aria-label')).toBe('Street width, left side')
    act(() => useRoads.getState().pick(null))
    pickExisting()
    expect(document.querySelector('[data-path-side="0"][data-side="left"]')!.getAttribute('aria-label')).toBe('Existing street width, left side')
  })
})
