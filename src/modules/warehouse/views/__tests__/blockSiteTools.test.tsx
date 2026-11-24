// The block tools on the site (Phase GT.8, Decision "Blocks on the site"): Dock, Door, Pattern and Court on a placed
// block, with the block editor's presses, on that copy alone; in the Tools strip's Elements group (the Blocks panel's chips went with AS.4 task 6:
// the strip is their only place). And the block editor's header in the strip's look.
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Id, Point, Project } from '../../../../model/schema.ts'
import { App } from '../../../../App.tsx'
import { derive } from '../../../../engine/derive.ts'
import { actions } from '../../../../state/actions/index.ts'
import { emptyHistory } from '../../../../state/history.ts'
import { sampleProject } from '../../../../state/sample.ts'
import { NO_SELECTION, useApp } from '../../../../state/store.ts'
import { useUi } from '../../../../views/layout/ui.ts'
import { useToast } from '../../../../views/layout/toast.ts'
import { useAccess } from '../../../../views/plan/access/accessState.ts'
import { fit, UNMEASURED_SIZE } from '../../../../views/plan/camera.ts'
import { contentBounds, PlanSvg } from '../../../../views/plan/PlanSvg.tsx'
import { useTool } from '../../../../views/plan/tools/toolState.ts'
import { copyGenerated, copyOnPlan, onPlace } from '../../engine/copies.ts'
import { outwardOf, type ShapeEdge } from '../../engine/shape.ts'
import { bayModules, dockMask, onDockRule } from '../../engine/dockRule.ts'
import { BAY_REACH_PX, edgeAt, faceLine, moduleBand } from '../handleMath.ts'
import { useSiteBlock } from '../siteBlockState.ts'
import { WarehouseTools } from '../WarehouseTools.tsx'
import { useWarehouse } from '../warehouseState.ts'
import { letGo, take, toggle } from '../../../../views/tools/hand.ts'

vi.mock('../../../../views/scene/Scene.tsx', () => ({ Scene: () => <div data-testid="scene" /> }))

/** The sample's first placed block: its building and its hall. */
function sample() {
  const { project: p, option } = useApp.getState()
  const ids = p.options.find((o) => o.id === option)!.buildingIds
  const b = p.buildings.find((x) => x.warehouse && ids.includes(x.id))!
  const levels = new Set(b.levels.map((l) => l.id))
  const hall = p.masses.find((m) => m.part === 'hall' && levels.has(m.levelId))!
  return { b, hall }
}

/** The copy as it stands on the plan, and what it makes. */
function copyNow(p: Project, buildingId: Id) {
  const b = p.buildings.find((x) => x.id === buildingId)!
  const t = p.warehouseTypes!.find((x) => x.id === b.warehouse!.type)!
  const levels = new Set(b.levels.map((l) => l.id))
  const hall = p.masses.find((m) => m.part === 'hall' && levels.has(m.levelId))!
  const w = copyOnPlan(t, b.warehouse!, hall.footprint)
  return { w, g: copyGenerated(t, w) }
}

const pickBlock = () => act(() => useApp.getState().select(sample().hall.id))

/** A screen point of the plan as PlanSvg frames it in jsdom (no measured size). */
const at = (q: Point) => {
  const v = fit(contentBounds(useApp.getState().derived), UNMEASURED_SIZE)
  return { clientX: (q.x - v.cx) * v.scale + UNMEASURED_SIZE.w / 2, clientY: UNMEASURED_SIZE.h / 2 - (q.y - v.cy) * v.scale, button: 0, pointerId: 1 }
}
const capture = () => document.querySelector('[data-tool="block-site"] > [data-capture]')!
const press = (site: Point) => {
  fireEvent.pointerMove(capture(), at(site))
  fireEvent.pointerDown(capture(), at(site))
  fireEvent.pointerUp(capture(), at(site))
}

/** A point of the copy's frame `out` m out of an edge's face (inside: negative), in the middle of module k. */
function byFace(e: ShapeEdge, g: ReturnType<typeof copyNow>['g'], k: number, out: number): Point {
  const r = moduleBand(g.runs, e, k, 0.01)
  const along = e.horizontal ? r.x + r.w / 2 : r.y + r.h / 2
  const n = outwardOf(e.side)
  const across = faceLine(e) + (e.horizontal ? n.y : n.x) * out
  return e.horizontal ? { x: along, y: across } : { x: across, y: along }
}

beforeEach(() => {
  localStorage.clear()
  const p = sampleProject()
  const option = p.options.find((o) => p.buildings.some((b) => o.buildingIds.includes(b.id) && b.warehouse))!
  const copy = p.buildings.find((b) => option.buildingIds.includes(b.id) && b.warehouse)!
  useApp.setState({ project: p, derived: derive(p, option.id), history: emptyHistory(), dragStart: null, selection: NO_SELECTION, option: option.id, level: copy.levels[0].id, showAll: false })
  useUi.setState({
    dialog: null,
    view: 'plan',
    rail: 'blocks',
    panels: { left: true, right: true },
    sheet: null,
    docks: { drafting: 'bottom' },
    show: { kpis: true, drafting: true, tools: true },
  })
  letGo()
  useAccess.setState({ picked: null })
  letGo()
  useToast.setState({ toast: null, confirmation: null })
})

describe('the block tools, where they are', () => {
  it('the block tools are the strip’s Elements group: greyed until a placed block is picked, and no tools bar holds them', () => {
    render(<App />)
    expect(document.querySelector('[data-bar="tools"]')).toBeNull()
    const elements = () => within(screen.getByRole('toolbar', { name: 'Tools' })).getByRole('group', { name: 'Elements' })
    const chips = () => within(elements()).getAllByRole('button')
    expect(chips().map((b) => b.getAttribute('aria-label'))).toEqual(['Dock', 'Door', 'Pattern', 'Court'])
    for (const b of chips()) expect(b).toBeDisabled()
    pickBlock()
    for (const b of chips()) expect(b).not.toBeDisabled()
    act(() => useApp.getState().select(null))
    for (const b of chips()) expect(b).toBeDisabled()
  })
})

describe('the block tools on the site plan', () => {
  it('Dock on the site: a press on a module of a placed block’s wall puts one dock there, on that copy alone', () => {
    render(<PlanSvg />)
    pickBlock()
    const { b } = sample()
    const types = JSON.stringify(useApp.getState().project.warehouseTypes)
    const { w, g } = copyNow(useApp.getState().project, b.id)
    // a wall's module with no dock yet
    const e = g.edges.find((x) => !g.doors.some((d) => d.kind === 'dock' && d.edge === x.id))!
    const k = bayModules(g.runs, e, 0)[0]
    const docksBefore = g.doors.filter((d) => d.kind === 'dock').length
    act(() => take('dock'))
    const steps = useApp.getState().history.past.length
    press(onPlace(w.place, byFace(e, g, k, -0.3)))
    const p = useApp.getState().project
    const own = p.buildings.find((x) => x.id === b.id)!.warehouse!.overrides?.elements
    expect(own).toBeDefined()
    const after = copyNow(p, b.id).g
    const docks = after.doors.filter((d) => d.kind === 'dock')
    expect(docks.length).toBe(docksBefore + 1)
    expect(docks.some((d) => d.edge === e.id && d.module === k)).toBe(true)
    expect(JSON.stringify(p.warehouseTypes)).toBe(types)
    expect(useApp.getState().history.past.length).toBe(steps + 1)
    expect(useSiteBlock.getState().tool).toBe('dock')
  })

  it('a press past the dock band fills the bay by the dock rule: the modules the block’s docked bays hold', () => {
    render(<PlanSvg />)
    pickBlock()
    const { b } = sample()
    const { w, g } = copyNow(useApp.getState().project, b.id)
    const e = g.edges.find((x) => !g.doors.some((d) => d.kind === 'dock' && d.edge === x.id) && bayModules(g.runs, x, 0).length > 1)!
    const bay = bayModules(g.runs, e, 0)
    const mask = dockMask(g)(bay.length)
    act(() => take('dock'))
    press(onPlace(w.place, byFace(e, g, bay[0], 2.5)))
    const docks = copyNow(useApp.getState().project, b.id).g.doors.filter((d) => d.kind === 'dock' && d.edge === e.id)
    expect(docks.map((d) => d.module).sort((x, y) => x - y)).toEqual(bay.filter((k) => mask.has(k - bay[0])))
    // the sample's blocks: the two middle modules of each bay of four, not every module
    expect(docks.length).toBeLessThan(bay.length)
  })

  it('a drag putting docks along a wall follows the dock rule, bay by bay', () => {
    render(<PlanSvg />)
    pickBlock()
    const { b } = sample()
    const { w, g } = copyNow(useApp.getState().project, b.id)
    const e = g.edges.find((x) => !g.doors.some((d) => d.kind === 'dock' && d.edge === x.id) && bayModules(g.runs, x, 2).length > 1)!
    const from = bayModules(g.runs, e, 0)[0]
    const to = bayModules(g.runs, e, 2).at(-1)!
    act(() => take('dock'))
    fireEvent.pointerDown(capture(), at(onPlace(w.place, byFace(e, g, from, -0.3))))
    fireEvent.pointerMove(capture(), at(onPlace(w.place, byFace(e, g, to, -0.3))))
    fireEvent.pointerUp(capture(), at(onPlace(w.place, byFace(e, g, to, -0.3))))
    const passed = Array.from({ length: to - from + 1 }, (_, i) => from + i)
    const docks = copyNow(useApp.getState().project, b.id).g.doors.filter((d) => d.kind === 'dock' && d.edge === e.id)
    expect(docks.map((d) => d.module).sort((x, y) => x - y)).toEqual(onDockRule(g, e, passed))
    expect(docks.length).toBeLessThan(passed.length)
  })

  it('a drag along the wall fills the modules it passes', () => {
    render(<PlanSvg />)
    pickBlock()
    const { b } = sample()
    const { w, g } = copyNow(useApp.getState().project, b.id)
    const e = g.edges.find((x) => !g.doors.some((d) => d.kind === 'dock' && d.edge === x.id) && bayModules(g.runs, x, 0).length > 1)!
    const [k0, k1] = bayModules(g.runs, e, 0)
    act(() => take('door'))
    const from = onPlace(w.place, byFace(e, g, k0, -0.3))
    const to = onPlace(w.place, byFace(e, g, k1, -0.3))
    fireEvent.pointerDown(capture(), at(from))
    fireEvent.pointerMove(capture(), at(to))
    expect(document.querySelector('[data-modules-shown]')).toHaveAttribute('data-modules-shown', '2')
    fireEvent.pointerUp(capture(), at(to))
    const doors = copyNow(useApp.getState().project, b.id).g.doors.filter((d) => d.kind === 'door' && d.edge === e.id)
    expect(doors.map((d) => d.module).sort((x, y) => x - y)).toEqual([k0, k1])
  })

  it('docks taken away by a drag come back by the dock rule with the same drag', () => {
    render(<PlanSvg />)
    pickBlock()
    const { b } = sample()
    const { w, g } = copyNow(useApp.getState().project, b.id)
    const e = g.edges.find((x) => g.doors.filter((d) => d.kind === 'dock' && d.edge === x.id).length > 20)!
    const before = g.doors.filter((d) => d.kind === 'dock' && d.edge === e.id).map((d) => d.module).sort((x, y) => x - y)
    const from = bayModules(g.runs, e, 1)[1]
    const to = bayModules(g.runs, e, 8)[2]
    const drag = () => {
      const steps = Array.from({ length: 12 }, (_, i) => from + ((to - from) * (i + 1)) / 12)
      fireEvent.pointerDown(capture(), at(onPlace(w.place, byFace(e, g, from, -0.3))))
      for (const k of steps) fireEvent.pointerMove(capture(), at(onPlace(w.place, byFace(e, g, Math.round(k), -0.3))))
      fireEvent.pointerUp(capture(), at(onPlace(w.place, byFace(e, g, to, -0.3))))
    }
    act(() => take('dock'))
    drag()
    const off = copyNow(useApp.getState().project, b.id).g.doors.filter((d) => d.kind === 'dock' && d.edge === e.id)
    expect(off.length).toBeLessThan(before.length)
    drag()
    const back = copyNow(useApp.getState().project, b.id).g.doors.filter((d) => d.kind === 'dock' && d.edge === e.id).map((d) => d.module).sort((x, y) => x - y)
    expect(back).toEqual(before)
  })

  it('Dock on a docked wall: a press on a module takes that module’s dock only, the same press puts it back', () => {
    render(<PlanSvg />)
    pickBlock()
    const { b } = sample()
    const { w, g } = copyNow(useApp.getState().project, b.id)
    const e = g.edges.find((x) => g.doors.filter((d) => d.kind === 'dock' && d.edge === x.id).length > 20)!
    const docks = () => copyNow(useApp.getState().project, b.id).g.doors.filter((d) => d.kind === 'dock' && d.edge === e.id).map((d) => d.module).sort((x, y) => x - y)
    const before = docks()
    const k = before[5]
    act(() => take('dock'))
    const steps = useApp.getState().history.past.length
    // inside the wall's face: the module's own band
    press(onPlace(w.place, byFace(e, g, k, -0.3)))
    expect(docks()).toEqual(before.filter((x) => x !== k))
    expect(useApp.getState().history.past.length).toBe(steps + 1)
    press(onPlace(w.place, byFace(e, g, k, -0.3)))
    expect(docks()).toEqual(before)
  })

  it('Dock on a docked wall: a press on the bar takes that dock only', () => {
    render(<PlanSvg />)
    pickBlock()
    const { b } = sample()
    const { w, g } = copyNow(useApp.getState().project, b.id)
    const e = g.edges.find((x) => g.doors.filter((d) => d.kind === 'dock' && d.edge === x.id).length > 20)!
    const docks = () => copyNow(useApp.getState().project, b.id).g.doors.filter((d) => d.kind === 'dock' && d.edge === e.id).map((d) => d.module).sort((x, y) => x - y)
    const before = docks()
    const bar = g.doors.find((d) => d.kind === 'dock' && d.edge === e.id && d.module === before[7])!
    const n = outwardOf(bar.side)
    act(() => take('dock'))
    press(onPlace(w.place, { x: bar.at.x + n.x * 0.8, y: bar.at.y + n.y * 0.8 }))
    expect(docks()).toEqual(before.filter((x) => x !== before[7]))
  })

  it('Dock on a docked wall: a press on its bay (past the bars) empties that bay’s docks and no other wall’s; the same press fills it again', () => {
    render(<PlanSvg />)
    pickBlock()
    const { b } = sample()
    const { w, g } = copyNow(useApp.getState().project, b.id)
    const e = g.edges.find((x) => g.doors.filter((d) => d.kind === 'dock' && d.edge === x.id).length > 20)!
    const all = () => copyNow(useApp.getState().project, b.id).g.doors.filter((d) => d.kind === 'dock').map((d) => `${d.edge}:${d.module}`).sort()
    const before = all()
    const bay = bayModules(g.runs, e, 3)
    const heldHere = onDockRule(g, e, bay)
    expect(heldHere.length).toBeGreaterThan(0)
    act(() => take('dock'))
    const steps = useApp.getState().history.past.length
    press(onPlace(w.place, byFace(e, g, bay[0], 3)))
    // the bay's docks are gone; every other dock of every wall stays
    expect(all()).toEqual(before.filter((x) => !heldHere.map((k) => `${e.id}:${k}`).includes(x)))
    expect(useApp.getState().history.past.length).toBe(steps + 1)
    press(onPlace(w.place, byFace(e, g, bay[0], 3)))
    expect(all()).toEqual(before)
    expect(useApp.getState().history.past.length).toBe(steps + 2)
  })

  it('Dock hover: a bay outline at a press on the bay, the module alone on a module, none on leave, and the press changes what was shown', () => {
    render(<PlanSvg />)
    pickBlock()
    const { b } = sample()
    const { w, g } = copyNow(useApp.getState().project, b.id)
    const e = g.edges.find((x) => g.doors.filter((d) => d.kind === 'dock' && d.edge === x.id).length > 20)!
    const all = () => copyNow(useApp.getState().project, b.id).g.doors.filter((d) => d.kind === 'dock').map((d) => `${d.edge}:${d.module}`).sort()
    const bay = bayModules(g.runs, e, 3)
    const shown = () => Number(document.querySelector('[data-modules-shown]')!.getAttribute('data-modules-shown'))
    act(() => take('dock'))
    // a module: its own band, no bay outline
    fireEvent.pointerMove(capture(), at(onPlace(w.place, byFace(e, g, bay[1], -0.3))))
    expect(shown()).toBe(1)
    expect(document.querySelector('[data-bay-preview]')).toBeNull()
    // the bay: every module of it the press changes, and one outline over the whole bay
    fireEvent.pointerMove(capture(), at(onPlace(w.place, byFace(e, g, bay[0], 3))))
    const heldHere = onDockRule(g, e, bay)
    expect(shown()).toBe(heldHere.length)
    expect(document.querySelector('[data-bay-preview]')).not.toBeNull()
    // the outline spans the whole bay along the wall, not only the modules the press changes
    const nums = (document.querySelector('[data-bay-preview]')!.getAttribute('d') ?? '').match(/-?\d+(\.\d+)?/g)!.map(Number)
    const xs = nums.filter((_, i) => i % 2 === 0)
    const ys = nums.filter((_, i) => i % 2 === 1)
    const along = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys))
    expect(along).toBeGreaterThanOrEqual(bay.length * 3 - 0.5)
    const before = all()
    fireEvent.pointerDown(capture(), at(onPlace(w.place, byFace(e, g, bay[0], 3))))
    fireEvent.pointerUp(capture(), at(onPlace(w.place, byFace(e, g, bay[0], 3))))
    expect(all()).toEqual(before.filter((x) => !heldHere.map((k) => `${e.id}:${k}`).includes(x)))
    // leaving the plan clears it
    fireEvent.pointerLeave(capture())
    expect(shown()).toBe(0)
    expect(document.querySelector('[data-bay-preview]')).toBeNull()
  })

  it('a pointer cancelled mid-drag drops the paint: the next release commits nothing', () => {
    render(<PlanSvg />)
    pickBlock()
    const { b } = sample()
    const { w, g } = copyNow(useApp.getState().project, b.id)
    const e = g.edges.find((x) => !g.doors.some((d) => d.kind === 'dock' && d.edge === x.id) && bayModules(g.runs, x, 0).length > 1)!
    const [k0, k1] = bayModules(g.runs, e, 0)
    act(() => take('door'))
    const from = onPlace(w.place, byFace(e, g, k0, -0.3))
    const to = onPlace(w.place, byFace(e, g, k1, -0.3))
    const before = useApp.getState().project
    fireEvent.pointerDown(capture(), at(from))
    fireEvent.pointerMove(capture(), at(to))
    expect(document.querySelector('[data-modules-shown]')).toHaveAttribute('data-modules-shown', '2')
    fireEvent.pointerCancel(capture(), at(to))
    fireEvent.pointerUp(capture(), at(to))
    expect(useApp.getState().project).toBe(before)
  })

  it('Court on the site: a press on a wall without docks gives the copy its own court', () => {
    render(<PlanSvg />)
    pickBlock()
    const { b } = sample()
    const types = JSON.stringify(useApp.getState().project.warehouseTypes)
    const { w, g } = copyNow(useApp.getState().project, b.id)
    const t = useApp.getState().project.warehouseTypes!.find((x) => x.id === b.warehouse!.type)!
    const e = g.edges.find((x) => !g.doors.some((d) => d.kind === 'dock' && d.edge === x.id) && !(t.courts ?? []).some((c) => c.edge === x.id))!
    act(() => take('court'))
    press(onPlace(w.place, byFace(e, g, bayModules(g.runs, e, 0)[0], 0.5)))
    const p = useApp.getState().project
    expect(p.buildings.find((x) => x.id === b.id)!.warehouse!.overrides?.courts?.some((c) => c.edge === e.id)).toBe(true)
    expect(JSON.stringify(p.warehouseTypes)).toBe(types)
  })

  it('Court finds a wall as far as the block editor does (28 px), not only at 10 px', () => {
    render(<PlanSvg />)
    pickBlock()
    const { b } = sample()
    const { w, g } = copyNow(useApp.getState().project, b.id)
    const t = useApp.getState().project.warehouseTypes!.find((x) => x.id === b.warehouse!.type)!
    const scale = fit(contentBounds(useApp.getState().derived), UNMEASURED_SIZE).scale
    // 15 px out of a wall's face: past the old 10 px reach, inside the block editor's 28 (and that wall the nearest)
    const at15 = (x: ShapeEdge) => byFace(x, g, bayModules(g.runs, x, 0)[0], 15 / scale)
    const e = g.edges.find(
      (x) =>
        !g.doors.some((d) => d.kind === 'dock' && d.edge === x.id) &&
        !(t.courts ?? []).some((c) => c.edge === x.id) &&
        edgeAt(g, at15(x), BAY_REACH_PX / scale)?.id === x.id &&
        edgeAt(g, at15(x), 10 / scale) === null,
    )!
    expect(e).toBeDefined()
    act(() => take('court'))
    press(onPlace(w.place, at15(e)))
    expect(useApp.getState().project.buildings.find((x) => x.id === b.id)!.warehouse!.overrides?.courts?.some((c) => c.edge === e.id)).toBe(true)
  })

  it('with Court on, a court’s pill still drags its depth; a press on a wall without docks still toggles the court', () => {
    render(<PlanSvg />)
    pickBlock()
    const { b, hall } = sample()
    act(() => take('court'))
    const dock = useApp.getState().derived.circulation.docks.find((d) => d.massId === hall.id)!
    // the pill is the shape handles' (D.3 task 7): the far edge of the block's court, named by its wall
    const pill = document.querySelector<SVGElement>(`[data-court-pill^="${hall.id}/"]`)!
    expect(pill).not.toBeNull()
    // drawn over the press layer, so a press on it is the pill's
    const layer = document.querySelector('[data-tool="block-site"]')!
    expect(layer.compareDocumentPosition(pill) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    const c = { x: (dock.a.x + dock.b.x) / 2 + dock.out.x * dock.depth, y: (dock.a.y + dock.b.y) / 2 + dock.out.y * dock.depth }
    const out = (k: number) => ({ x: c.x + dock.out.x * k, y: c.y + dock.out.y * k })
    const steps = useApp.getState().history.past.length
    fireEvent.pointerDown(pill, at(c))
    fireEvent.pointerMove(pill, at(out(2)))
    fireEvent.pointerMove(pill, at(out(5)))
    fireEvent.pointerUp(pill, at(out(5)))
    const hallNow = useApp.getState().project.masses.find((m) => m.id === hall.id)!
    expect(hallNow.courts).toEqual([{ t: dock.t, depth: dock.depth + 5 }])
    expect(useApp.getState().history.past.length).toBe(steps + 1)
    expect(useSiteBlock.getState().tool).toBe('court')
    // and the tool's own press, elsewhere
    const { w, g } = copyNow(useApp.getState().project, b.id)
    const t = useApp.getState().project.warehouseTypes!.find((x) => x.id === b.warehouse!.type)!
    const e = g.edges.find((x) => !g.doors.some((d) => d.kind === 'dock' && d.edge === x.id) && !(t.courts ?? []).some((c) => c.edge === x.id))!
    press(onPlace(w.place, byFace(e, g, bayModules(g.runs, e, 0)[0], 0.5)))
    expect(useApp.getState().project.buildings.find((x) => x.id === b.id)!.warehouse!.overrides?.courts?.some((c) => c.edge === e.id)).toBe(true)
  })

  it('Court on a docked wall tells why, and changes nothing', () => {
    render(<PlanSvg />)
    pickBlock()
    const { b } = sample()
    const { w, g } = copyNow(useApp.getState().project, b.id)
    const dock = g.doors.find((d) => d.kind === 'dock')!
    const e = g.edges.find((x) => x.id === dock.edge)!
    const before = useApp.getState().project
    act(() => take('court'))
    press(onPlace(w.place, byFace(e, g, dock.module, 0.5)))
    expect(useApp.getState().project).toBe(before)
    expect(useToast.getState().toast?.text).toMatch(/has docks: a docked wall always has its truck court/)
  })

  it('a press off the picked block does nothing, the tool stays; Escape leaves it', () => {
    render(<PlanSvg />)
    pickBlock()
    const before = useApp.getState().project
    act(() => take('dock'))
    const { b } = sample()
    const { w } = copyNow(before, b.id)
    press(onPlace(w.place, { x: -500, y: -500 }))
    expect(useApp.getState().project).toBe(before)
    expect(useSiteBlock.getState().tool).toBe('dock')
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(useSiteBlock.getState().tool).toBeNull()
  })
})

describe('one tool at a time', () => {
  it('a block tool and a plan tool are one at a time', () => {
    pickBlock()
    act(() => take('dock'))
    expect(useTool.getState().tool).toBe('select')
    act(() => toggle('move'))
    expect(useTool.getState().tool).toBe('move')
    expect(useSiteBlock.getState().tool).toBeNull()
    act(() => take('court'))
    expect(useSiteBlock.getState().tool).toBe('court')
    expect(useTool.getState().tool).toBe('select')
    // the ruler on, or an access tool: the block tool lets go too
    act(() => toggle('ruler'))
    expect(useSiteBlock.getState().tool).toBeNull()
  })

  it('the block tool lets go when the picked block goes, or in the 3D view', () => {
    pickBlock()
    act(() => take('dock'))
    act(() => useApp.getState().select(null))
    expect(useSiteBlock.getState().tool).toBeNull()
    pickBlock()
    act(() => take('door'))
    act(() => useUi.getState().setView('3d'))
    expect(useSiteBlock.getState().tool).toBeNull()
  })
})

describe('the block editor’s header', () => {
  it('the block editor’s tools sit in the strip’s frame', () => {
    const t = useApp.getState().project.warehouseTypes![0]
    useWarehouse.setState({ typeId: t.id, programId: t.program })
    render(<WarehouseTools />)
    const header = screen.getByRole('group', { name: 'Warehouse tools' })
    expect(header).toHaveClass('panel', 'px-2', 'py-1')
    expect(header.querySelectorAll('[data-separator]').length).toBe(3)
    for (const name of ['Type', 'Edit', 'Elements', 'Units']) expect(within(header).getByRole('group', { name })).toBeInTheDocument()
  })
})

// ---- D.2 task 6: nothing stands on an angled wall; Dock and Court follow the docks' offer -----------------------------------

describe('a wall that is not along the grid', () => {
  /** The sample's hall with a corner a quarter of the way to its middle: two angled walls. */
  function angled() {
    const { b, hall } = sample()
    const p = useApp.getState().project
    const ref = { kind: 'mass', id: hall.id }
    const vs = actions.shapeOf(p, ref)!.contour.vertices
    const v = vs[2]
    const mid = { x: vs.reduce((s, q) => s + q.x, 0) / vs.length, y: vs.reduce((s, q) => s + q.y, 0) / vs.length }
    const w = actions.editShape(p, ref, { op: 'vertex', vertex: 2, to: { x: v.x + (mid.x - v.x) / 4, y: v.y + (mid.y - v.y) / 4 } })
    expect(w.reason).toBeUndefined()
    act(() => useApp.setState({ project: w.project, derived: derive(w.project, useApp.getState().option) }))
    const { w: place, g } = copyNow(useApp.getState().project, b.id)
    const e = g.edges.find((x) => x.axis === null)!
    return { place, e, b }
  }
  const middleOf = (e: ShapeEdge) => ({ x: (e.a.x + e.b.x) / 2, y: (e.a.y + e.b.y) / 2 })

  it.each([
    ['dock', 'Docks, doors and patterns go on walls along the grid.'],
    ['door', 'Docks, doors and patterns go on walls along the grid.'],
    ['pattern', 'Docks, doors and patterns go on walls along the grid.'],
    ['court', 'A truck court goes on a wall along the grid.'],
  ] as const)('%s pressed on an angled wall says why and changes nothing', (tool, text) => {
    render(<PlanSvg />)
    const { place, e } = angled()
    pickBlock()
    const before = useApp.getState().project
    act(() => take(tool))
    press(onPlace(place.place, middleOf(e)))
    expect(useToast.getState().toast?.text).toBe(text)
    expect(useApp.getState().project).toBe(before)
  })
})
