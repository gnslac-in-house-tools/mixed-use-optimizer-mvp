// Count and width by pills on the plan (Phase D.3 task 11, the user's Q3): on the docks picked, a pill at each end of their run adds or takes modules, a pill at the side of the first sets
// the width of all of them; both dragged and typed, one undo step, through `actions.editEdge`. The block editor's side (the site's: modules/warehouse/views/__tests__/siteEdgePills.test.tsx).
import { act, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../../../App.tsx'
import { derive } from '../../../../engine/derive.ts'
import type { Id, Project } from '../../../../model/schema.ts'
import { actions } from '../../../../state/actions/index.ts'
import { demoProject } from '../../../../state/demo.ts'
import { emptyHistory } from '../../../../state/history.ts'
import { useApp } from '../../../../state/store.ts'
import { screenAt } from '../../../../modules/warehouse/views/__tests__/planScreen.ts'
import { useWarehouse } from '../../../../modules/warehouse/views/warehouseState.ts'
import { useToast } from '../../../layout/toast.ts'
import { useUi } from '../../../layout/ui.ts'
import { resetTyped, useTyped } from '../../dimension/typed.ts'
import { useTool } from '../../../plan/tools/toolState.ts'
import { useUnits } from '../../../../modules/warehouse/views/units.ts'

vi.mock('../../../scene/Scene.tsx', () => ({ Scene: () => <div data-testid="scene" /> }))
vi.mock('../../../../modules/warehouse/views/WarehouseScene.tsx', () => ({ WarehouseScene: () => <div data-testid="warehouse-scene" /> }))

const KEEP = [20, 21, 22, 23]

/** The demo's type with four docks on its first wall (modules 20 to 23), nothing else on it. */
function four(): { p: Project; ref: { kind: 'block-type'; id: Id }; ids: Id[] } {
  let p = actions.addWarehouseType(demoProject()).project
  const ref = { kind: 'block-type' as const, id: p.warehouseTypes![0].id }
  const edge = actions.edgeOf(p, ref)!.edges.find((e) => e.id === 'e1')!
  p = actions.editEdge(p, ref, { op: 'take', edge: 'e1', slots: edge.slots.map((s) => s.k).filter((k) => !KEEP.includes(k)), kind: 'dock' }).project
  const ids = p.warehouseTypes![0].elements.filter((e) => e.kind === 'dock' && e.edge === 'e1').map((e) => e.id)
  return { p, ref, ids }
}

beforeEach(() => {
  localStorage.clear()
  const { p } = four()
  useApp.setState({ project: p, derived: derive(p), history: emptyHistory(), dragStart: null, selection: { massId: null, vertex: null, massIds: [] }, option: p.options[0].id })
  useUi.setState({ dialog: 'program', view: 'plan', panels: { left: true, right: true }, sheet: null })
  useWarehouse.setState({ programId: null, typeId: null, shown: null, tool: 'select', picked: [] })
  useToast.setState({ toast: null })
  resetTyped()
})

const type = () => useApp.getState().project.warehouseTypes![0]
const docks = (edge = 'e1') => type().elements.filter((e) => e.kind === 'dock' && e.edge === edge)
const plan = () => document.querySelector('[data-warehouse-plan]')!
const pill = (name: string) => document.querySelector(`[data-edge-pill="${name}"]`)
const at = (x: number, y: number) => ({ ...screenAt({ x, y }), pointerId: 1 })
const steps = () => useApp.getState().history.past.length
const pick = (ids: Id[]) => act(() => useWarehouse.setState({ picked: ids.map((id) => ({ kind: 'element' as const, id })) }))

/** The point of the middle of module `k` of the first wall, on its line. */
function mid(k: number) {
  const e = actions.edgeOf(useApp.getState().project, { kind: 'block-type', id: type().id })!.edges.find((x) => x.id === 'e1')!
  const s = e.slots.find((x) => x.k === k)!
  const along = (s.from + s.to) / 2
  return { x: e.origin.x + e.dir.x * along, y: e.origin.y + e.dir.y * along, along, edge: e }
}

/** The pill pressed (anywhere: the drag is measured from where it is let go) and dragged to a point of the wall. */
function drag(name: string, to: { x: number; y: number }) {
  fireEvent.pointerDown(pill(name)!, { clientX: 10, clientY: 10, pointerId: 1, button: 0 })
  fireEvent.pointerMove(plan(), at(to.x, to.y))
  fireEvent.pointerUp(plan(), { ...at(to.x, to.y), button: 0 })
}
const typeNumber = (s: string) =>
  act(() => {
    for (const c of s) fireEvent.keyDown(window, { key: c })
    fireEvent.keyDown(window, { key: 'Enter' })
  })

describe('the count pills at the ends of a run', () => {
  it('four docks of one wall picked: a pill at each end of their run, and one at the side for the width', () => {
    render(<App />)
    pick(docks().map((d) => d.id))
    expect(pill('count-start')).not.toBeNull()
    expect(pill('count-end')).not.toBeNull()
    expect(pill('width')).not.toBeNull()
  })

  it('nothing picked, or a tool in hand: no pills', () => {
    render(<App />)
    expect(pill('count-end')).toBeNull()
    pick(docks().map((d) => d.id))
    act(() => useWarehouse.setState({ tool: 'dock' }))
    expect(pill('count-end')).toBeNull()
    expect(pill('width')).toBeNull()
  })

  it('the end pill dragged 3 modules on adds 3 docks by the dock rule, one undo step; dragged back, they are taken', () => {
    render(<App />)
    pick(docks().map((d) => d.id))
    const before = steps()
    drag('count-end', mid(26))
    expect(docks().length).toBe(7)
    expect(steps()).toBe(before + 1)
    pick(docks().map((d) => d.id))
    drag('count-end', mid(24))
    expect(docks().length).toBe(5)
    expect(steps()).toBe(before + 2)
  })

  it('the start pill dragged 2 modules out adds 2 docks before the run', () => {
    render(<App />)
    pick(docks().map((d) => d.id))
    drag('count-start', mid(18))
    // by the dock rule: two more, none of them inside the run
    expect(docks().length).toBe(6)
    expect(docks().filter((d) => d.module < 20).length).toBe(2)
  })

  it('a number typed after the drag is the count of the run: 8 docks, the same one undo step', () => {
    render(<App />)
    pick(docks().map((d) => d.id))
    const before = steps()
    drag('count-end', mid(26))
    typeNumber('8')
    expect(docks().length).toBe(8)
    expect(steps()).toBe(before + 1)
  })

  it('a count that does not all fit says so', () => {
    render(<App />)
    pick(docks().map((d) => d.id))
    drag('count-end', mid(26))
    typeNumber('900')
    expect(useToast.getState().toast?.text ?? '').toMatch(/Only \d+ fit on that wall/)
  })

  it('elements of two walls picked: no count pills, the width pill stays', () => {
    const { p } = four()
    const ref = { kind: 'block-type' as const, id: p.warehouseTypes![0].id }
    const other = actions.edgeOf(p, ref)!.edges.find((e) => e.id !== 'e1' && e.slots.length > 6)!
    const q = actions.editEdge(p, ref, { op: 'put', edge: other.id, slots: [other.slots[3].k], kind: 'dock' }).project
    act(() => useApp.setState({ project: q, derived: derive(q) }))
    render(<App />)
    const ids = [docks()[0].id, q.warehouseTypes![0].elements.find((e) => e.edge === other.id)!.id]
    pick(ids)
    expect(pill('count-end')).toBeNull()
    expect(pill('count-start')).toBeNull()
    expect(pill('width')).not.toBeNull()
  })
})

describe('the width pill at the side of the picked', () => {
  it('dragged to 4.2 m: every dock picked is 4.2 m wide, one undo step', () => {
    render(<App />)
    pick(docks().map((d) => d.id))
    const first = mid(20)
    const before = steps()
    const to = { x: first.x + first.edge.dir.x * 2.1, y: first.y + first.edge.dir.y * 2.1 }
    drag('width', to)
    expect(docks().map((d) => d.width)).toEqual([4.2, 4.2, 4.2, 4.2])
    expect(steps()).toBe(before + 1)
  })

  it('a number typed after the drag is the width: 3.5 m, the same one undo step', () => {
    render(<App />)
    pick(docks().map((d) => d.id))
    const first = mid(20)
    const before = steps()
    drag('width', { x: first.x + first.edge.dir.x * 2.1, y: first.y + first.edge.dir.y * 2.1 })
    typeNumber('3.5')
    expect(docks().map((d) => d.width)).toEqual([3.5, 3.5, 3.5, 3.5])
    expect(steps()).toBe(before + 1)
  })
})

describe('the pills only with Select (review S1)', () => {
  it.each(['split', 'hole', 'court', 'door', 'pattern'] as const)('docks picked, the %s tool in hand: no pills', (tool) => {
    render(<App />)
    pick(docks().map((d) => d.id))
    expect(pill('width')).not.toBeNull()
    act(() => useWarehouse.setState({ tool }))
    expect(pill('width')).toBeNull()
    expect(pill('count-end')).toBeNull()
  })
})

describe('the pills and the Dimension tool (review S1)', () => {
  it('docks picked, Dimension in hand: no pills', () => {
    render(<App />)
    pick(docks().map((d) => d.id))
    act(() => useTool.setState({ tool: 'dimension' }))
    expect(pill('width')).toBeNull()
    act(() => useTool.setState({ tool: 'select' }))
  })
})

describe('the width pill in the editor’s unit (review S2, S3)', () => {
  const widthDrag = () => {
    const first = mid(20)
    drag('width', { x: first.x + first.edge.dir.x * 2.1, y: first.y + first.edge.dir.y * 2.1 })
  }
  afterEach(() => act(() => useUnits.getState().setUnit('m')))

  it('in feet the pill says feet, and the number typed is feet (10 ft = 3.048 m)', () => {
    act(() => useUnits.getState().setUnit('ft'))
    render(<App />)
    pick(docks().map((d) => d.id))
    expect(pill('width')!.querySelector('text')!.textContent).toMatch(/ft$/)
    widthDrag()
    typeNumber('10')
    expect(docks().map((d) => d.width)).toEqual([3.048, 3.048, 3.048, 3.048])
  })

  it('a width typed past 20 m is held to 20 m, and said beside the field', () => {
    render(<App />)
    pick(docks().map((d) => d.id))
    widthDrag()
    typeNumber('300')
    expect(docks().map((d) => d.width)).toEqual([20, 20, 20, 20])
    expect(useTyped.getState().cur?.note ?? '').toMatch(/20/)
  })

  it('the pills are sliders with their value and range', () => {
    render(<App />)
    pick(docks().map((d) => d.id))
    for (const name of ['count-start', 'count-end', 'width']) {
      const el = pill(name)!
      expect(el.getAttribute('aria-valuenow'), name).not.toBeNull()
      expect(el.getAttribute('aria-valuemin'), name).not.toBeNull()
      expect(el.getAttribute('aria-valuemax'), name).not.toBeNull()
    }
  })
})
