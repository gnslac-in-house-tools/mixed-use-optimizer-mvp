// The block editor's bottom bar (Phase BE.10, spec Goal 8): the main drafting bar's part that applies to a block alone
// (Snap and its kinds, Align, Ortho, Grid, Dimension, Ruler, Plan · 3D · Split, Detail), the same components, without
// Terrain, Map, Graph, Levels, Issues, Rules or *Snap to*. The Ruler and the Dimension tool on the block plan snap to
// what the block has (its columns, wall corners, module-line nodes, door points: views/plan/snap/SnapSourceContext.tsx)
// and read in the block editor's unit (BE.8); a dimension drawn there is the type's, saved in the block file.
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../../../App.tsx'
import { derive } from '../../../../engine/derive.ts'
import { readBlockFile, writeBlockFile } from '../../../../io/blocks.ts'
import type { Point } from '../../../../model/schema.ts'
import { actions } from '../../../../state/actions/index.ts'
import { demoProject } from '../../../../state/demo.ts'
import { emptyHistory } from '../../../../state/history.ts'
import { useApp } from '../../../../state/store.ts'
import { useToast } from '../../../../views/layout/toast.ts'
import { useUi } from '../../../../views/layout/ui.ts'
import { DEFAULT_SNAP } from '../../../../views/plan/snap/kinds.ts'
import { useCommand } from '../../../../views/plan/command/commandState.ts'
import { useSnapSettings } from '../../../../views/plan/snap/settings.ts'
import { useRuler, useTool } from '../../../../views/plan/tools/toolState.ts'
import { generate } from '../../engine/generate.ts'
import { blockOf } from '../../engine/library.ts'
import { BlockDraftingBar } from '../BlockDraftingBar.tsx'
import { blockTargets, moduleNode } from '../blockSnap.ts'
import { lengthText, useUnits } from '../units.ts'
import { useWarehouse } from '../warehouseState.ts'
import { pxFor, screenAt } from './planScreen.ts'
import { letGo, take } from '../../../../views/tools/hand.ts'

vi.mock('../../../../views/scene/Scene.tsx', () => ({ Scene: () => <div data-testid="scene" /> }))
vi.mock('../WarehouseScene.tsx', () => ({ WarehouseScene: () => <div data-testid="warehouse-scene" /> }))

beforeEach(() => {
  localStorage.clear()
  const p = actions.addWarehouseType(demoProject()).project
  useApp.setState({ project: p, derived: derive(p), history: emptyHistory(), dragStart: null, selection: { massId: null, vertex: null, massIds: [] }, option: p.options[0].id })
  useUi.setState({ dialog: 'program', view: 'plan', panels: { left: true, right: true }, sheet: null })
  useWarehouse.setState({ programId: null, typeId: null, shown: null, tool: 'select', picked: [] })
  useToast.setState({ toast: null })
  useUnits.setState({ unit: 'm' })
  letGo()
  useSnapSettings.setState({ settings: structuredClone(DEFAULT_SNAP) })
})

const type = () => useApp.getState().project.warehouseTypes![0]
const bar = () => screen.getByRole('region', { name: 'Block drafting' })
const plan = () => document.querySelector('[data-warehouse-plan]')!
const capture = () => plan().querySelector('[data-capture]')!
/** A world point a couple of screen px off `q` (inwards, away from the front's docks): inside the snap's reach, not on it. */
const near = (q: Point): Point => ({ x: q.x - 1.5 / pxFor(1), y: q.y + 1 / pxFor(1) })
const press = (q: Point) => fireEvent.pointerDown(capture(), { ...screenAt(q), pointerId: 1, button: 0 })
const lift = (q: Point) => fireEvent.pointerUp(capture(), { ...screenAt(q), pointerId: 1, button: 0 })
/** Two columns on one row: the first and the next along the length. */
function twoColumns(): [Point, Point] {
  const cs = generate(type()).columns
  const a = cs.reduce((m, c) => (c.y < m.y || (c.y === m.y && c.x < m.x) ? c : m))
  const b = cs.filter((c) => Math.abs(c.y - a.y) < 1e-9 && c.x > a.x).reduce((m, c) => (c.x < m.x ? c : m))
  return [a, b]
}

describe('the bar', () => {
  it('under the block plan: Snap, its kinds, Align, Ortho, Grid, Dimension, Ruler, Plan · 3D · Split and Detail', () => {
    render(<App />)
    const b = within(bar())
    for (const name of ['Snap', 'Align', 'Ortho', 'Grid', 'Dimension', 'Ruler', 'Snap kinds']) expect(b.getByRole('button', { name })).toBeInTheDocument()
    // one Grid: the chip, with no grid menu beside it (its grid is step 1 of the block)
    expect(b.getAllByRole('button', { name: 'Grid' })).toHaveLength(1)
    for (const name of ['Plan', '3D', 'Split']) expect(b.getByRole('tab', { name })).toBeInTheDocument()
    expect(b.getByRole('combobox', { name: 'Detail' })).toBeInTheDocument()
    // the Grid is the block's own module
    expect(b.getByRole('button', { name: 'Grid' }).getAttribute('title')).toMatch(/block’s .* module/)
  })

  it('without Terrain, Map, Graph, Levels, Issues, Rules, Overlays, the grid’s menu, or Snap to reference lines and contours', () => {
    render(<App />)
    const b = within(bar())
    for (const name of [/terrain/i, /^map$/i, /^graph$/i, /^levels$/i, /^issues$/i, /^rules$/i, /^overlays$/i, /grid look/i, /move pivot/i]) expect(b.queryByRole('button', { name })).toBeNull()
    fireEvent.click(b.getByRole('button', { name: 'Snap kinds' }))
    expect(screen.getByRole('group', { name: 'Snap kinds' })).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Snap to' })).toBeNull()
    expect(screen.queryByRole('menuitemcheckbox', { name: /reference lines/i })).toBeNull()
    expect(screen.queryByRole('menuitemcheckbox', { name: /contours/i })).toBeNull()
  })

  it('Plan · 3D · Split switch the block’s view; in 3D the measures are off', () => {
    render(<App />)
    fireEvent.click(within(bar()).getByRole('tab', { name: '3D' }))
    expect(useUi.getState().view).toBe('3d')
    expect(within(bar()).getByRole('button', { name: 'Ruler' })).toBeDisabled()
  })

  it('a measure gives the block’s tool way to Select, and a block tool turns the measure off', () => {
    render(<App />)
    act(() => useWarehouse.getState().setTool('dock'))
    fireEvent.click(within(bar()).getByRole('button', { name: 'Dimension' }))
    expect(useTool.getState().tool).toBe('dimension')
    expect(useWarehouse.getState().tool).toBe('select')
    act(() => useWarehouse.getState().setTool('hole'))
    expect(useTool.getState().tool).toBe('select')
    fireEvent.click(within(bar()).getByRole('button', { name: 'Ruler' }))
    expect(useRuler.getState().active).toBe(true)
    act(() => useWarehouse.getState().setTool('split'))
    expect(useRuler.getState().active).toBe(false)
  })
})

describe('the Ruler on the block plan', () => {
  it('snaps to a column and reads in feet when the toggle says ft', () => {
    useUnits.setState({ unit: 'ft' })
    render(<App />)
    fireEvent.click(within(bar()).getByRole('button', { name: 'Ruler' }))
    const [a, b] = twoColumns()
    press(near(a))
    lift(near(a))
    press(near(b))
    lift(near(b))
    expect(useRuler.getState().a).toEqual({ x: a.x, y: a.y })
    expect(useRuler.getState().b).toEqual({ x: b.x, y: b.y })
    const label = plan().querySelector('[data-ruler] text')!.textContent
    expect(label).toBe(`${lengthText(b.x - a.x, 'ft')} · 0°`)
    expect(label).toMatch(/ ft · /)
  })
})

describe('the Dimension tool on the block plan', () => {
  it('a dimension drawn is the type’s (one undo step), shown in the unit, and survives a reload of the block file', () => {
    render(<App />)
    fireEvent.click(within(bar()).getByRole('button', { name: 'Dimension' }))
    const [a, b] = twoColumns()
    const off = { x: (a.x + b.x) / 2, y: a.y - 5 }
    const steps = useApp.getState().history.past.length
    for (const q of [near(a), near(b), off]) lift(q)
    const dims = type().dimensions!
    expect(dims).toHaveLength(1)
    expect(dims[0]).toMatchObject({ a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y } })
    expect(dims[0].offset).toBeCloseTo(-5, 3)
    // the site's dimensions are not touched
    expect(useApp.getState().project.dimensions ?? []).toHaveLength(0)
    expect(useApp.getState().history.past.length).toBe(steps + 1)
    // on the block plan, in the unit of the toggle
    expect(plan().querySelector(`[data-block-dimension="${dims[0].id}"] text`)!.textContent).toBe(lengthText(b.x - a.x, 'm'))
    act(() => useUnits.setState({ unit: 'ft' }))
    expect(plan().querySelector(`[data-block-dimension="${dims[0].id}"] text`)!.textContent).toBe(lengthText(b.x - a.x, 'ft'))
    // saved in the block file and read back
    const block = blockOf(useApp.getState().project, type().id, 'b-test', 1, 0)!
    const read = readBlockFile(writeBlockFile(block))
    expect(read.ok).toBe(true)
    if (read.ok) expect(read.block.type.dimensions).toEqual(dims)
  })

  it('with Select, a click on a block dimension picks it and Delete removes it', () => {
    render(<App />)
    const [a, b] = twoColumns()
    act(() => useApp.getState().apply((p) => actions.addDimension(p, a, b, -5, undefined, { type: type().id })!.project))
    const id = type().dimensions![0].id
    fireEvent.pointerDown(plan().querySelector(`[data-block-dimension="${id}"]`)!, { pointerId: 1, button: 0 })
    expect(plan().querySelector(`[data-block-dimension="${id}"]`)!.getAttribute('data-picked-dimension')).toBe('true')
    fireEvent.keyDown(window, { key: 'Delete' })
    expect(type().dimensions ?? []).toHaveLength(0)
  })
})

describe('the keys inside the Program window, a modal dialog (final review, Important 2)', () => {
  /** The Program window as the app shows it: the real Dialogs frame, a modal dialog. */
  const modal = () => {
    const d = screen.getByRole('dialog', { name: 'Program' })
    expect(d.getAttribute('aria-modal')).toBe('true')
    expect(d.contains(plan())).toBe(true)
    return d
  }
  const prompt = () => useCommand.getState().registration?.prompt
  const key = (k: string) => fireEvent.keyDown(window, { key: k })

  it('Escape during a dimension cancels it and the window stays open; again, back to Select, still open', () => {
    render(<App />)
    modal()
    fireEvent.click(within(bar()).getByRole('button', { name: 'Dimension' }))
    const [a] = twoColumns()
    lift(near(a))
    expect(prompt()).toBe('Second point')
    key('Escape')
    expect(prompt()).toBe('First point')
    expect(useTool.getState().tool).toBe('dimension')
    expect(useUi.getState().dialog).toBe('program')
    key('Escape')
    expect(useTool.getState().tool).toBe('select')
    expect(useUi.getState().dialog).toBe('program')
    modal()
  })

  it('a measure lets go of what is picked; Backspace during a dimension removes its last point and deletes nothing', () => {
    render(<App />)
    modal()
    const el = type().elements[0]
    act(() => useWarehouse.getState().setPicked([{ kind: 'element', id: el.id }]))
    fireEvent.click(within(bar()).getByRole('button', { name: 'Dimension' }))
    expect(useWarehouse.getState().picked).toEqual([])
    // picked anyway (from the steps' list): Backspace is the dimension's
    act(() => useWarehouse.getState().setPicked([{ kind: 'element', id: el.id }]))
    const count = type().elements.length
    const [a, b] = twoColumns()
    lift(near(a))
    lift(near(b))
    expect(prompt()).toBe('Distance of the dimension line')
    key('Backspace')
    expect(prompt()).toBe('Second point')
    key('Delete')
    expect(prompt()).toBe('First point')
    expect(type().elements).toHaveLength(count)
    expect(useUi.getState().dialog).toBe('program')
  })

  it('with the Ruler on, Delete deletes nothing picked', () => {
    render(<App />)
    fireEvent.click(within(bar()).getByRole('button', { name: 'Ruler' }))
    const el = type().elements[0]
    act(() => useWarehouse.getState().setPicked([{ kind: 'element', id: el.id }]))
    key('Delete')
    expect(type().elements.some((x) => x.id === el.id)).toBe(true)
  })

  it('Enter finishes a dimension where the pointer is', () => {
    render(<App />)
    modal()
    fireEvent.click(within(bar()).getByRole('button', { name: 'Dimension' }))
    const [a, b] = twoColumns()
    lift(near(a))
    lift(near(b))
    fireEvent.pointerMove(capture(), { ...screenAt({ x: (a.x + b.x) / 2, y: a.y - 5 }), pointerId: 1 })
    key('Enter')
    expect(type().dimensions ?? []).toHaveLength(1)
    expect(useUi.getState().dialog).toBe('program')
  })

  it('the keys the bar’s titles name: D Dimension, T Ruler, F3 snap, F8 Ortho, F9 Grid, ? Help', () => {
    render(<App />)
    modal()
    key('d')
    expect(useTool.getState().tool).toBe('dimension')
    key('d')
    expect(useTool.getState().tool).toBe('select')
    act(() => useWarehouse.getState().setTool('dock'))
    key('t')
    expect(useRuler.getState().active).toBe(true)
    expect(useWarehouse.getState().tool).toBe('select')
    key('t')
    expect(useRuler.getState().active).toBe(false)
    const s = () => useSnapSettings.getState().settings
    for (const [k, flag] of [
      ['F3', 'on'],
      ['F8', 'ortho'],
      ['F9', 'grid'],
    ] as const) {
      const was = s()[flag]
      key(k)
      expect(s()[flag]).toBe(!was)
    }
    const help = useUi.getState().help
    key('?')
    expect(useUi.getState().help).toBe(!help)
    expect(useUi.getState().dialog).toBe('program')
  })

  it('in 3D, D and T do nothing but say why (the measures are the plan’s); M is not a key of the block editor now', () => {
    render(<App />)
    act(() => useUi.getState().setView('3d'))
    key('d')
    expect(useToast.getState().toast?.text).toMatch(/plan is not on screen/i)
    useToast.setState({ toast: null })
    key('t')
    expect(useToast.getState().toast?.text).toMatch(/plan is not on screen/i)
    useToast.setState({ toast: null })
    key('m')
    expect(useToast.getState().toast).toBeNull()
    expect(useTool.getState().tool).toBe('select')
    expect(useRuler.getState().active).toBe(false)
  })
})

describe('what attracts on the block plan (blockSnap.ts, pure)', () => {
  it('its columns, the wall corners, the module-line nodes and the door points', () => {
    const g = generate(type())
    const t = blockTargets(g, true)
    const has = (q: Point, kind: string) => t.points.some((p) => p.kind === kind && Math.hypot(p.p.x - q.x, p.p.y - q.y) < 1e-9)
    expect(g.columns.every((c) => has(c, 'endpoint'))).toBe(true)
    expect(g.parts[0].polygon.every((c) => has(c, 'endpoint'))).toBe(true)
    expect(has({ x: g.runs.x.modules[1], y: g.runs.y.modules[1] }, 'intersection')).toBe(true)
    const d = g.doors[0]
    expect(has(d.at, 'midpoint')).toBe(true)
    // the Grid: the module node nearest a point
    expect(moduleNode(g.runs, { x: g.runs.x.modules[2] + 0.4, y: g.runs.y.modules[1] - 0.3 }, 1)).toEqual({ x: g.runs.x.modules[2], y: g.runs.y.modules[1] })
  })
})

describe('the keys with a window over the Program window, and the block dimensions while measuring (residual review)', () => {
  const prompt = () => useCommand.getState().registration?.prompt
  const key = (k: string) => fireEvent.keyDown(window, { key: k })

  it('a modal window stacked over the Program window takes the keys: the dimension keeps its point until it goes', () => {
    render(<App />)
    fireEvent.click(within(bar()).getByRole('button', { name: 'Dimension' }))
    const [a] = twoColumns()
    lift(near(a))
    expect(prompt()).toBe('Second point')
    // a prompt over the window (as the unsaved-changes one): the last in the page, not holding the plan
    const over = document.createElement('div')
    over.setAttribute('role', 'dialog')
    over.setAttribute('aria-modal', 'true')
    document.body.appendChild(over)
    key('Backspace')
    expect(prompt()).toBe('Second point')
    over.remove()
    key('Backspace')
    expect(prompt()).toBe('First point')
  })

  it('a block dimension picked: Delete or Backspace while a measure is on deletes nothing', () => {
    render(<App />)
    const [a, b] = twoColumns()
    act(() => useApp.getState().apply((p) => actions.addDimension(p, a, b, -5, undefined, { type: type().id })!.project))
    const id = type().dimensions![0].id
    fireEvent.pointerDown(plan().querySelector(`[data-block-dimension="${id}"]`)!, { pointerId: 1, button: 0 })
    expect(plan().querySelector(`[data-block-dimension="${id}"]`)!.getAttribute('data-picked-dimension')).toBe('true')
    act(() => take('ruler'))
    key('Delete')
    expect(type().dimensions ?? []).toHaveLength(1)
    act(() => {
      letGo()
      take('dimension')
    })
    key('Backspace')
    expect(type().dimensions ?? []).toHaveLength(1)
  })
})

describe('the block’s Grid: its module nodes inside the block only, and only with Grid on (late review, BE.10)', () => {
  const runs = () => generate(type()).runs
  /** A column of an inner row (nothing else near it), and the module lines past it along x. */
  function inner() {
    const g = generate(type())
    const ys = [...new Set(g.columns.map((c) => c.y))].sort((p, q) => p - q)
    const y = ys[Math.floor(ys.length / 2)]
    const xs = g.columns.filter((c) => c.y === y).map((c) => c.x).sort((p, q) => p - q)
    const a = { x: xs[1], y }
    const k = g.runs.x.modules.findIndex((x) => Math.abs(x - a.x) < 1e-9)
    return { a, k, xs: g.runs.x.modules, ys: g.runs.y.modules }
  }
  const dimension = (pts: Point[]) => {
    fireEvent.click(within(bar()).getByRole('button', { name: 'Dimension' }))
    for (const q of pts) lift(q)
    return type().dimensions![0]
  }

  it('Grid on: a point inside the block goes to the module node nearest it (Snap off: the Grid alone)', () => {
    useSnapSettings.setState({ settings: { ...structuredClone(DEFAULT_SNAP), on: false } })
    render(<App />)
    const { a, k, xs, ys } = inner()
    const j = ys.findIndex((y) => Math.abs(y - a.y) < 1e-9)
    // between two module lines each way, off the columns
    const q = { x: xs[k + 1] + 0.35 * (xs[k + 2] - xs[k + 1]), y: ys[j + 1] + 0.3 * (ys[j + 2] - ys[j + 1]) }
    const d = dimension([q, { x: q.x + 20, y: q.y }, { x: q.x + 10, y: q.y + 3 }])
    expect(d.a.x).toBeCloseTo(xs[k + 1], 6)
    expect(d.a.y).toBeCloseTo(ys[j + 1], 6)
  })

  it('Grid off: the module nodes do not attract, the point stays where pressed', () => {
    useSnapSettings.setState({ settings: { ...structuredClone(DEFAULT_SNAP), grid: false } })
    render(<App />)
    const { a, k, xs, ys } = inner()
    const j = ys.findIndex((y) => Math.abs(y - a.y) < 1e-9)
    // a hair off a module node in the middle of a bay, far from its columns
    const node = { x: xs[k + 2], y: ys[j + 2] }
    const q = { x: node.x + 0.2, y: node.y + 0.15 }
    const d = dimension([q, { x: q.x + 20, y: q.y }, { x: q.x + 10, y: q.y + 3 }])
    expect(d.a.x).toBeCloseTo(q.x, 1)
    expect(d.a.y).toBeCloseTo(q.y, 1)
    expect(Math.hypot(d.a.x - node.x, d.a.y - node.y)).toBeGreaterThan(0.1)
  })

  it('Ortho on, Grid on: along the ortho line the point goes to the nearest module line (Snap off: the Grid alone)', () => {
    useSnapSettings.setState({ settings: { ...structuredClone(DEFAULT_SNAP), on: false, ortho: true } })
    render(<App />)
    const { a, k, xs, ys } = inner()
    const j = ys.findIndex((y) => Math.abs(y - a.y) < 1e-9)
    // past the next module line by 0.4 of a module, half a module off the row: the foot on the row, on line k + 2
    const q = { x: xs[k + 1] + 0.6 * (xs[k + 2] - xs[k + 1]), y: a.y + 0.5 * (ys[j + 1] - ys[j]) }
    const d = dimension([a, q, { x: q.x, y: a.y + 4 }])
    expect(d.a).toMatchObject({ x: a.x, y: a.y })
    expect(d.b.x).toBeCloseTo(xs[k + 2], 6)
    expect(d.b.y).toBeCloseTo(a.y, 6)
  })

  it('pure: no module node past the block’s extent and its tolerance; the nodes among the targets only with Grid', () => {
    const r = runs()
    const g = generate(type())
    const last = { x: r.x.modules[r.x.modules.length - 1], y: r.y.modules[r.y.modules.length - 1] }
    expect(moduleNode(r, { x: r.x.modules[2] + 0.4, y: r.y.modules[1] - 0.3 }, 1)).toEqual({ x: r.x.modules[2], y: r.y.modules[1] })
    expect(moduleNode(r, { x: last.x + 0.9, y: 2 }, 1)).toEqual({ x: last.x, y: r.y.modules[nearestIndex(r.y.modules, 2)] })
    expect(moduleNode(r, { x: last.x + 1.1, y: 2 }, 1)).toBeNull()
    expect(moduleNode(r, { x: 5, y: -5 }, 1)).toBeNull()
    const node = { x: r.x.modules[1], y: r.y.modules[1] }
    const isNode = (t: ReturnType<typeof blockTargets>) => t.points.some((p) => p.label === 'Module' && p.p.x === node.x && p.p.y === node.y)
    expect(isNode(blockTargets(g, true))).toBe(true)
    expect(isNode(blockTargets(g, false))).toBe(false)
  })
})

const nearestIndex = (vs: number[], v: number) => vs.reduce((b, x, i) => (Math.abs(x - v) < Math.abs(vs[b] - v) ? i : b), 0)

describe('the bar’s Grid title (late review of BE.10, Minor 3)', () => {
  it('names the module its parent gives (no block generated for a title), and follows step 1', () => {
    render(<App />)
    const grid = () => within(bar()).getByRole('button', { name: 'Grid' }).getAttribute('title')
    const r = generate(type()).runs
    expect(grid()).toContain(lengthText(r.x.module, 'm'))
    act(() => useApp.getState().apply((p) => actions.updateWarehouseStep(p, type().id, 'grid', { modules: 3 })))
    expect(grid()).toContain(lengthText(generate(type()).runs.x.module, 'm'))
    expect(generate(type()).runs.x.module).not.toBe(r.x.module)
    render(<BlockDraftingBar module={{ x: 3, y: 4 }} />)
    expect(screen.getAllByRole('button', { name: 'Grid' }).some((b) => b.getAttribute('title')?.includes(`${lengthText(3, 'm')} × ${lengthText(4, 'm')}`))).toBe(true)
  })
})
