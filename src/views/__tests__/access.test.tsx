// The site's access (Decision "Exterior circulation", 4.2): the Tools strip's Gate · Existing road, drawing them on the
// plan, the gates in Properties (the Gates row of Layers: + Gate, whose gates; a gate picked: its fields, Delete: Phase AS.3 took the
// Site tab's Access section away), a gate's handle that slides along the boundary, Delete and Escape, and the access drawn
// whatever tab the panel shows.
// jsdom has no layout: the plan uses UNMEASURED_SIZE and `at` turns world metres into screen pixels.
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Point, Project } from '../../model/schema.ts'
import { App } from '../../App.tsx'
import { derive } from '../../engine/derive.ts'
import { gatesOf } from '../../engine/circulation/gates.ts'
import { perimeter, pointAt } from '../../engine/geom/perimeter.ts'
import { addExistingRoad, addGate } from '../../state/actions/circulation.ts'
import { demoProject } from '../../state/demo.ts'

/** The demo without its access (no frontage, no gates): each test marks its own. */
const bareDemo = () => {
  const p = demoProject()
  return { ...p, site: { boundary: p.site.boundary, rules: p.site.rules } }
}
import { emptyHistory } from '../../state/history.ts'
import { NO_SELECTION, useApp } from '../../state/store.ts'
import { useGraph } from '../graph/graphState.ts'
import { useUi } from '../layout/ui.ts'
import { useToast } from '../layout/toast.ts'
import { showLayer } from '../layers/show.ts'
import { useAccess } from '../plan/access/accessState.ts'
import { fit, UNMEASURED_SIZE } from '../plan/camera.ts'
import { letGo, take } from '../tools/hand.ts'

vi.mock('../scene/Scene.tsx', () => ({ Scene: () => <div data-testid="scene" /> }))

const POLY = [
  { x: 0, y: 0 },
  { x: 420, y: 0 },
  { x: 440, y: 240 },
  { x: 20, y: 280 },
]
const P = perimeter(POLY)
const t = (along: number) => along / P // a point `along` m from (0,0) on the bottom side

const v = fit({ minX: 0, minY: 0, maxX: 440, maxY: 280 }, UNMEASURED_SIZE)
const at = (q: Point, extra: object = {}) => ({
  clientX: (q.x - v.cx) * v.scale + UNMEASURED_SIZE.w / 2,
  clientY: UNMEASURED_SIZE.h / 2 - (q.y - v.cy) * v.scale,
  button: 0,
  pointerId: 1,
  ...extra,
})
const capture = () => document.querySelector('[data-capture]')!
const key = (k: string) => fireEvent.keyDown(window, { key: k })
const s = () => useApp.getState()

function start(p: Project = bareDemo(), tab: 'layers' | 'properties' = 'layers') {
  useApp.setState({ project: p, derived: derive(p, 'o1'), history: emptyHistory(), dragStart: null, selection: NO_SELECTION, level: 'l1', showAll: false, option: 'o1' })
  // Layers open, or Properties: a tool works on either
  useUi.setState({ view: 'plan', rail: tab, panels: { left: true, right: true }, sheet: null, help: false })
  render(<App />)
}

beforeEach(() => {
  localStorage.clear()
  useGraph.setState({ graph: false, rule: null, relation: null })
  letGo()
  useAccess.setState({ picked: null })
  useToast.setState({ toast: null, confirmation: null })
})

const props = () => screen.getByRole('tabpanel', { name: 'Properties' })
// the access tools stand in the Tools strip's Streets group
const accessTools = () => screen.getByRole('toolbar', { name: 'Tools' })

describe('the tools', () => {
  it('Gate · Existing road in the strip’s Streets group, beside Street (no Frontage tool); a button again leaves its tool', () => {
    start()
    expect(within(within(accessTools()).getByRole('group', { name: 'Streets' })).getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual(['Street', 'Gate', 'Existing road', 'Connect'])
    expect(within(accessTools()).queryByRole('button', { name: 'Frontage' })).toBeNull()
    fireEvent.click(within(accessTools()).getByRole('button', { name: 'Gate' }))
    expect(useAccess.getState().tool).toBe('gate')
    fireEvent.click(within(accessTools()).getByRole('button', { name: 'Gate' }))
    expect(useAccess.getState().tool).toBeNull()
  })

  it('Gate: a click near any side of the boundary places one there; far from it and from every street, it says where gates go', () => {
    const p = bareDemo()
    start({ ...p, options: p.options.map((o) => ({ ...o, streets: undefined })) }) // the demo’s streets would take a click in its middle
    act(() => take('gate'))
    // the middle of the plan: far from the boundary
    fireEvent.pointerDown(capture(), at({ x: 200, y: 150 }))
    fireEvent.pointerUp(capture(), at({ x: 200, y: 150 }))
    expect(s().project.site.gates).toBeUndefined()
    expect(useToast.getState().toast?.text).toMatch(/street’s side or the site’s boundary/)
    // no frontage was marked: the bottom side and the top side both take one
    fireEvent.pointerDown(capture(), at({ x: 380, y: 0 }))
    fireEvent.pointerUp(capture(), at({ x: 380, y: 0 }))
    fireEvent.pointerDown(capture(), at({ x: 200, y: 262 }))
    fireEvent.pointerUp(capture(), at({ x: 200, y: 262 }))
    const [a, b] = s().project.site.gates!
    expect(a.t! * P).toBeCloseTo(380, 0)
    expect(pointAt(POLY, b.t!).y).toBeGreaterThan(250)
    expect(useAccess.getState().tool).toBe('gate') // stays on for another
    expect(document.querySelector(`[data-gate="${a.id}"]`)).not.toBeNull()
  })

  it('Existing road: point by point, Enter ends it at the standards’ width; it leaves the buildable area', () => {
    start()
    const before = s().derived.metrics.buildableArea
    fireEvent.click(within(accessTools()).getByRole('button', { name: 'Existing road' }))
    fireEvent.pointerDown(capture(), at({ x: 10, y: 140 }, { shiftKey: true }))
    fireEvent.pointerUp(capture(), at({ x: 10, y: 140 }, { shiftKey: true }))
    fireEvent.pointerDown(capture(), at({ x: 400, y: 140 }, { shiftKey: true }))
    fireEvent.pointerUp(capture(), at({ x: 400, y: 140 }, { shiftKey: true }))
    key('Enter')
    const [r] = s().project.site.existingRoads!
    expect(r.stretches).toEqual([{ left: 4, right: 4 }])
    expect(r.points).toHaveLength(2)
    expect(s().derived.metrics.buildableArea).toBeLessThan(before)
    expect(useAccess.getState().picked).toEqual({ kind: 'existing', id: r.id })
  })
})

describe('the gates in Properties', () => {
  it('with no gate: the Gates row says how to start; + Gate is there with a boundary and none without', () => {
    start()
    act(() => showLayer('gates'))
    expect(within(props()).getByText(/None yet: click a street’s side or the boundary with Gate, or \+ Gate/)).toBeInTheDocument()
    expect(within(props()).getByRole('button', { name: '+ Gate' })).toBeEnabled()
  })

  it('+ Gate with no street goes to the middle of the longest side; the new gate is picked and Properties shows its fields; an edit is one undo step', () => {
    start()
    act(() => showLayer('gates'))
    fireEvent.click(within(props()).getByRole('button', { name: '+ Gate' }))
    const [g] = s().project.site.gates!
    const q = pointAt(POLY, g.t!)
    expect(q.x).toBeCloseTo(230, 0) // the top side, from (440, 240) to (20, 280), is the longest
    expect(q.y).toBeCloseTo(260, 0)
    // the new gate is picked, and the panel stays on Properties
    expect(useUi.getState().rail).toBe('properties')
    expect(useAccess.getState().picked).toEqual({ kind: 'gate', id: g.id })
    const gate = () => within(props()).getByRole('region', { name: 'Gate 1' })
    const steps = s().history.past.length
    fireEvent.click(within(gate()).getByRole('button', { name: 'In' }))
    expect(s().project.site.gates![0].flow).toBe('in')
    expect(s().history.past).toHaveLength(steps + 1)
    fireEvent.click(within(gate()).getByRole('checkbox'))
    expect(s().project.site.gates![0].guardHouse).toBe(true)
    expect(document.querySelector('[data-guard-house]')).not.toBeNull()
    fireEvent.click(within(gate()).getByRole('button', { name: 'Delete' }))
    expect(s().project.site.gates).toBeUndefined()
  })

  it('+ Gate with an existing street goes to the middle of the side nearest it', () => {
    const p = addExistingRoad(bareDemo(), [{ x: 10, y: 20 }, { x: 10, y: 260 }], 8, 'left')!.project // along the left side
    start(p)
    act(() => showLayer('gates'))
    fireEvent.click(within(props()).getByRole('button', { name: '+ Gate' }))
    const q = pointAt(POLY, s().project.site.gates![0].t!)
    expect(q.x).toBeCloseTo(10, 0) // the left side, from (20, 280) to (0, 0)
    expect(q.y).toBeCloseTo(140, 0)
  })

  it('whose gates: the site’s, or a copy of the option’s own; *Use the site’s* drops it', () => {
    start(addGate(bareDemo(), 'o1', t(200)).project)
    act(() => showLayer('gates'))
    expect(within(props()).getByRole('heading', { name: 'Gates of the site' })).toBeInTheDocument()
    fireEvent.click(within(props()).getByRole('button', { name: 'Own gates for Option 1' }))
    expect(s().project.options[0].gates).toHaveLength(1)
    expect(within(props()).getByRole('heading', { name: 'Gates of Option 1' })).toBeInTheDocument()
    fireEvent.click(within(props()).getByRole('button', { name: "Use the site's" }))
    expect(s().project.options[0].gates).toBeUndefined()
  })
})

describe('on the plan', () => {
  it('a gate’s handle slides along its side of the boundary and stops at its end: one undo step', () => {
    start(addGate(bareDemo(), 'o1', t(200)).project)
    const handle = document.querySelector('[data-handle="gate-g1"]')!
    const steps = s().history.past.length
    fireEvent.pointerDown(handle, at({ x: 200, y: 0 }))
    fireEvent.pointerMove(handle, at({ x: 260, y: 5 }))
    expect(gatesOf(s().project, 'o1')[0].t! * P).toBeCloseTo(260, 0)
    fireEvent.pointerMove(handle, at({ x: 400, y: 5 }))
    expect(gatesOf(s().project, 'o1')[0].t! * P).toBeCloseTo(400, 0)
    // the side ends at the corner (420, 0): the gate stops half its width (6 m) before it
    fireEvent.pointerMove(handle, at({ x: 436, y: 5 }))
    expect(gatesOf(s().project, 'o1')[0].t! * P).toBeCloseTo(414, 0)
    fireEvent.pointerUp(handle, at({ x: 400, y: 5 }))
    expect(s().history.past).toHaveLength(steps + 1)
    expect(useAccess.getState().picked).toEqual({ kind: 'gate', id: 'g1' })
  })

  it('Delete removes what is picked; Escape lets it go', () => {
    const road = addExistingRoad(addGate(bareDemo(), 'o1', t(200)).project, [{ x: 10, y: 20 }, { x: 10, y: 260 }], 8, 'left')!
    start(road.project)
    act(() => useAccess.getState().pick({ kind: 'existing', id: road.id }))
    key('Escape')
    expect(useAccess.getState().picked).toBeNull()
    act(() => useAccess.getState().pick({ kind: 'gate', id: 'g1' }))
    key('Delete')
    expect(s().project.site.gates).toBeUndefined()
    expect(s().project.masses).toHaveLength(3) // the masses stay
  })

  it('with Properties open the gate is drawn and answers as with Layers (Decision "Steps change the tools")', () => {
    start(addGate(bareDemo(), 'o1', t(200)).project, 'properties')
    expect(document.querySelector('[data-gate="g1"]')).not.toBeNull()
    expect(document.querySelector('[data-handle="gate-g1"]')).not.toBeNull()
  })
})
