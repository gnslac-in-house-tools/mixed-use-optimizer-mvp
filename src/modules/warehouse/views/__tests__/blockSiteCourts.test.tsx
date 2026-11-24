// Phase D.3 task 7: a placed block's truck courts on the shape handles, on the site. The block picked, each court has the pill that says its depth (its wall's own depth,
// `Mass.courts`, the pill of before: no variant, typed); a court clicked has all its handles, live, and a side pulled in makes the copy's own courts (a variant) with a shape
// of its own; the old site pill is gone for a block (a plain mass keeps it); the Court tool keeps the pills over its press layer.
import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Point } from '../../../../model/schema.ts'
import { derive } from '../../../../engine/derive.ts'
import { actions } from '../../../../state/actions/index.ts'
import { emptyHistory } from '../../../../state/history.ts'
import { NO_SELECTION, useApp } from '../../../../state/store.ts'
import { resetTyped, useTyped } from '../../../../views/editing/dimension/typed.ts'
import { MenuHost } from '../../../../views/editing/menu/open.tsx'
import { menuFor } from '../../../../views/editing/menu/build.ts'
import type { MenuEntry } from '../../../../views/controls/Menu.tsx'
import { useCourtPick } from '../../../../views/editing/shape/shapeState.ts'
import { useToast } from '../../../../views/layout/toast.ts'
import { useUi } from '../../../../views/layout/ui.ts'
import { fit, UNMEASURED_SIZE } from '../../../../views/plan/camera.ts'
import { contentBounds, PlanSvg } from '../../../../views/plan/PlanSvg.tsx'
import { wallAt } from '../../../../views/plan/snap/walls.ts'
import { letGo, take } from '../../../../views/tools/hand.ts'
import { shapedSite } from '../../../docks/__tests__/shapedCourtFixture.ts'
import { handleKey } from '../../../../views/useShortcuts.ts'
import { useSiteBlock } from '../siteBlockState.ts'

vi.mock('../../../../views/scene/Scene.tsx', () => ({ Scene: () => <div data-testid="scene" /> }))

/** The block with no courts of its own (its front wall e1 is docked, so it has the standard court), placed on the demo site. */
function load() {
  const s = shapedSite([])
  const level = s.building.levels[0].id
  useApp.setState({ project: s.p, derived: derive(s.p, s.optionId), history: emptyHistory(), dragStart: null, selection: NO_SELECTION, option: s.optionId, level, showAll: false })
  return s
}

const at = (q: Point) => {
  const v = fit(contentBounds(useApp.getState().derived), UNMEASURED_SIZE)
  return { clientX: (q.x - v.cx) * v.scale + UNMEASURED_SIZE.w / 2, clientY: UNMEASURED_SIZE.h / 2 - (q.y - v.cy) * v.scale, button: 0, pointerId: 1 }
}
const handle = (k: string) => document.querySelector(`[data-handle="${k}"]`)!
const hallNow = (id: string) => useApp.getState().project.masses.find((m) => m.id === id)!
const building = (id: string) => useApp.getState().project.buildings.find((b) => b.id === id)!
const steps = () => useApp.getState().history.past.length
const key = (k: string) => fireEvent.keyDown(window, { key: k })

beforeEach(() => {
  localStorage.clear()
  useUi.setState({ dialog: null, view: 'plan', rail: 'blocks', panels: { left: true, right: true }, sheet: null, docks: { drafting: 'bottom' }, show: { kpis: true, drafting: true, tools: true } })
  letGo()
  useToast.setState({ toast: null, confirmation: null })
  useCourtPick.setState({ pick: null })
  resetTyped()
})

describe('the depth pill of a placed block’s court', () => {
  it('the block picked: a pill on each court, none of the old site pills; dragged out 5 m: the wall’s own depth, no variant, one undo step', () => {
    const s = load()
    render(<PlanSvg />)
    expect(document.querySelector('[data-court-pill]')).toBeNull()
    act(() => useApp.getState().select(s.hall.id))
    expect(document.querySelector('[data-layer="court-pills"]')).toBeNull()
    const dock = useApp.getState().derived.circulation.docks.find((d) => d.massId === s.hall.id)!
    const pill = document.querySelector<SVGElement>(`[data-court-pill="${s.hall.id}/e1"]`)!
    expect(pill).not.toBeNull()
    expect(pill.getAttribute('aria-valuenow')).toBe(String(dock.depth))
    const c = { x: (dock.a.x + dock.b.x) / 2 + dock.out.x * dock.depth, y: (dock.a.y + dock.b.y) / 2 + dock.out.y * dock.depth }
    const out = (k: number) => ({ x: c.x + dock.out.x * k, y: c.y + dock.out.y * k })
    const before = steps()
    fireEvent.pointerDown(pill, at(c))
    fireEvent.pointerMove(pill, at(out(2)))
    fireEvent.pointerMove(pill, at(out(5)))
    fireEvent.pointerUp(pill, at(out(5)))
    expect(hallNow(s.hall.id).courts).toEqual([{ t: dock.t, depth: dock.depth + 5 }])
    expect(building(s.building.id).warehouse!.overrides?.courts).toBeUndefined()
    expect(steps()).toBe(before + 1)
    act(() => useApp.getState().undo())
    expect(hallNow(s.hall.id).courts).toBeUndefined()
  })

  it('typed during the drag it is the depth itself, held to 200 and said; one undo step', () => {
    const s = load()
    render(<PlanSvg />)
    act(() => useApp.getState().select(s.hall.id))
    const dock = useApp.getState().derived.circulation.docks.find((d) => d.massId === s.hall.id)!
    const pill = document.querySelector<SVGElement>(`[data-court-pill="${s.hall.id}/e1"]`)!
    const c = { x: (dock.a.x + dock.b.x) / 2 + dock.out.x * dock.depth, y: (dock.a.y + dock.b.y) / 2 + dock.out.y * dock.depth }
    const before = steps()
    fireEvent.pointerDown(pill, at(c))
    fireEvent.pointerMove(pill, at({ x: c.x + dock.out.x * 3, y: c.y + dock.out.y * 3 }))
    for (const ch of '300') key(ch)
    key('Enter')
    expect(hallNow(s.hall.id).courts).toEqual([{ t: dock.t, depth: 200 }])
    expect(useTyped.getState().cur?.note).toMatch(/200/)
    expect(steps()).toBe(before + 1)
  })

  it('with Court on, the pill stays over the tool’s press layer and still drags its depth', () => {
    const s = load()
    render(<PlanSvg />)
    act(() => useApp.getState().select(s.hall.id))
    act(() => take('court'))
    expect(useSiteBlock.getState().tool).toBe('court')
    const dock = useApp.getState().derived.circulation.docks.find((d) => d.massId === s.hall.id)!
    const pill = document.querySelector<SVGElement>(`[data-court-pill="${s.hall.id}/e1"]`)!
    const layer = document.querySelector('[data-tool="block-site"]')!
    expect(layer.compareDocumentPosition(pill) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    const c = { x: (dock.a.x + dock.b.x) / 2 + dock.out.x * dock.depth, y: (dock.a.y + dock.b.y) / 2 + dock.out.y * dock.depth }
    const to = { x: c.x + dock.out.x * 5, y: c.y + dock.out.y * 5 }
    fireEvent.pointerDown(pill, at(c))
    fireEvent.pointerMove(pill, at(to))
    fireEvent.pointerUp(pill, at(to))
    expect(hallNow(s.hall.id).courts).toEqual([{ t: dock.t, depth: dock.depth + 5 }])
    expect(useSiteBlock.getState().tool).toBe('court')
    // no click on a court picks one while a tool has the plan
    expect(document.querySelector('[data-block-court]')).toBeNull()
  })
})

describe('a court clicked on the site', () => {
  const ref = (hall: string) => ({ kind: 'block-court', id: `${hall}/e1` })

  it('a click on the court picks it: all its handles, none on its wall side; the rest show only their pill', () => {
    const s = load()
    render(<PlanSvg />)
    act(() => useApp.getState().select(s.hall.id))
    const r = actions.shapeOf(useApp.getState().project, ref(s.hall.id))!
    expect(r.walls!.some((w) => w.fixed)).toBe(true)
    expect(handle(`court-${s.hall.id}/e1-vertex-0`)).toBeNull()
    const court = document.querySelector(`[data-block-court="${s.hall.id}/e1"]`)!
    expect(court).not.toBeNull()
    fireEvent.pointerDown(court, { button: 0, pointerId: 1 })
    expect(useCourtPick.getState().pick?.ref.id).toBe(`${s.hall.id}/e1`)
    r.walls!.forEach((w, i) => {
      if (w.fixed) expect(handle(`court-${s.hall.id}/e1-wall-${i}`), `wall ${i}`).toBeNull()
      else expect(handle(`court-${s.hall.id}/e1-wall-${i}`), `wall ${i}`).not.toBeNull()
    })
    r.contour.vertices.forEach((_, i) => expect(handle(`court-${s.hall.id}/e1-vertex-${i}`)).not.toBeNull())
    // another selection lets it go
    act(() => useApp.getState().select(null))
    expect(useCourtPick.getState().pick).toBeNull()
  })

  it('a side pulled in 4 m, live: the copy’s own courts (a variant) with a shape of its own, its type unchanged, one undo step; the wall’s own depth is cleared', () => {
    const s = load()
    // the wall's own depth first (the pill's), then the shape
    render(<PlanSvg />)
    act(() => useApp.getState().select(s.hall.id))
    fireEvent.pointerDown(document.querySelector(`[data-block-court="${s.hall.id}/e1"]`)!, { button: 0, pointerId: 1 })
    const r = actions.shapeOf(useApp.getState().project, ref(s.hall.id))!
    const i = r.walls!.findIndex((w, k) => !w.fixed && k !== 0)
    const wall = wallAt(r.contour, i)
    const a = { x: (wall.a.x + wall.b.x) / 2, y: (wall.a.y + wall.b.y) / 2 }
    const to = { x: a.x - wall.n.x * 4, y: a.y - wall.n.y * 4 }
    const types = JSON.stringify(useApp.getState().project.warehouseTypes)
    const before = steps()
    const k = `court-${s.hall.id}/e1-wall-${i}`
    const side = handle(k)
    fireEvent.pointerDown(side, at(a))
    fireEvent.pointerMove(side, at(to))
    fireEvent.pointerUp(side, at(to))
    const own = building(s.building.id).warehouse!.overrides?.courts
    expect(own?.[0]?.shape).toBeDefined()
    expect(own?.[0]?.id).toBe('c1')
    expect(JSON.stringify(useApp.getState().project.warehouseTypes)).toBe(types)
    expect(steps()).toBe(before + 1)
    // the court is a shape now, its id c1: its handles are the same ones, still picked
    expect(handle(k)).not.toBeNull()
    act(() => useApp.getState().undo())
    expect(building(s.building.id).warehouse!.overrides?.courts).toBeUndefined()
  })
})

describe('the site’s menu of a court (Back to a rectangle)', () => {
  it('a court with a shape of its own has the row; one without has none; the row is the copy’s own courts, one undo step', () => {
    const s = shapedSite()
    useApp.setState({ project: s.p, derived: derive(s.p, s.optionId), history: emptyHistory(), dragStart: null, selection: NO_SELECTION, option: s.optionId, level: s.building.levels[0].id, showAll: false })
    const e3 = { kind: 'block-court', id: `${s.hall.id}/e3` }
    const entries = menuFor([e3], 'plan', null)
    const row = entries.find((e): e is Extract<MenuEntry, { onSelect(): void }> => e !== 'separator' && e.label === 'Back to a rectangle')!
    expect(row).toBeDefined()
    // e1 has two courts (after a split): they are named by their ids; each has the row, but the wall's two cannot be one rectangle
    expect(menuFor([{ kind: 'block-court', id: `${s.hall.id}/e1/c1` }], 'plan', null).some((e) => e !== 'separator' && e.label === 'Back to a rectangle')).toBe(true)
    const before = steps()
    act(() => void row.onSelect())
    expect(steps()).toBe(before + 1)
    const own = building(s.building.id).warehouse!.overrides?.courts
    expect(own?.find((c) => c.edge === 'e3')).toEqual({ edge: 'e3', depth: 10 })
    expect(own?.filter((c) => c.edge === 'e1')).toHaveLength(2)
    // a rectangle now: nothing to bring back
    expect(menuFor([e3], 'plan', null).some((e) => e !== 'separator' && e.label === 'Back to a rectangle')).toBe(false)
    // the two courts of e1: said, nothing changes
    const two = menuFor([{ kind: 'block-court', id: `${s.hall.id}/e1/c1` }], 'plan', null).find((e): e is Extract<MenuEntry, { onSelect(): void }> => e !== 'separator' && e.label === 'Back to a rectangle')!
    const now = useApp.getState().project
    act(() => void two.onSelect())
    expect(useApp.getState().project).toBe(now)
    expect(useToast.getState().toast?.text).toMatch(/other/)
  })
})

describe('a right-click on a court of the picked block', () => {
  it('picks the court and opens its own menu, whose row is the only one', () => {
    const s = shapedSite()
    useApp.setState({ project: s.p, derived: derive(s.p, s.optionId), history: emptyHistory(), dragStart: null, selection: NO_SELECTION, option: s.optionId, level: s.building.levels[0].id, showAll: false })
    render(
      <>
        <PlanSvg />
        <MenuHost />
      </>,
    )
    act(() => useApp.getState().select(s.hall.id))
    fireEvent.contextMenu(document.querySelector(`[data-block-court="${s.hall.id}/e3"]`)!, { clientX: 10, clientY: 10 })
    expect(useCourtPick.getState().pick?.ref.id).toBe(`${s.hall.id}/e3`)
    expect(screen.getByRole('menu')).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Back to a rectangle' })).toBeInTheDocument()
    // the block stays picked
    expect(useApp.getState().selection.massIds).toEqual([s.hall.id])
  })
})

describe('Delete with a court of the picked block picked (review B1)', () => {
  const del = () => act(() => void handleKey(new KeyboardEvent('keydown', { key: 'Delete', cancelable: true })))
  const present = (id: string) => useApp.getState().project.masses.some((m) => m.id === id)

  it('a court picked: Delete never removes the block; the court is the copy’s own to take, one undo step', () => {
    const s = shapedSite()
    useApp.setState({ project: s.p, derived: derive(s.p, s.optionId), history: emptyHistory(), dragStart: null, selection: NO_SELECTION, option: s.optionId, level: s.building.levels[0].id, showAll: false })
    render(<PlanSvg />)
    act(() => useApp.getState().select(s.hall.id))
    fireEvent.pointerDown(document.querySelector(`[data-block-court="${s.hall.id}/e3"]`)!, { button: 0, pointerId: 1 })
    const before = steps()
    del()
    expect(present(s.hall.id)).toBe(true)
    expect(building(s.building.id).warehouse!.overrides?.courts?.some((c) => c.edge === 'e3')).toBeFalsy()
    expect(steps()).toBe(before + 1)
  })

  it('one piece of a split court picked: Delete takes that piece only, the other stays, one undo step', () => {
    const s = shapedSite()
    useApp.setState({ project: s.p, derived: derive(s.p, s.optionId), history: emptyHistory(), dragStart: null, selection: NO_SELECTION, option: s.optionId, level: s.building.levels[0].id, showAll: false })
    render(<PlanSvg />)
    act(() => useApp.getState().select(s.hall.id))
    fireEvent.pointerDown(document.querySelector(`[data-block-court="${s.hall.id}/e1/c2"]`)!, { button: 0, pointerId: 1 })
    const before = steps()
    del()
    const own = building(s.building.id).warehouse!.overrides?.courts
    expect(own?.filter((c) => c.edge === 'e1').map((c) => c.id)).toEqual(['c1'])
    expect(own?.some((c) => c.edge === 'e3')).toBe(true)
    expect(steps()).toBe(before + 1)
    // the wall's last court: as before, the copy's own taken away
    fireEvent.pointerDown(document.querySelector(`[data-block-court="${s.hall.id}/e1"]`)!, { button: 0, pointerId: 1 })
    del()
    expect(building(s.building.id).warehouse!.overrides?.courts?.some((c) => c.edge === 'e1')).toBeFalsy()
  })

  it('a court corner picked: Delete takes the corner (or says why not), never the block', () => {
    const s = shapedSite()
    useApp.setState({ project: s.p, derived: derive(s.p, s.optionId), history: emptyHistory(), dragStart: null, selection: NO_SELECTION, option: s.optionId, level: s.building.levels[0].id, showAll: false })
    render(<PlanSvg />)
    act(() => useApp.getState().select(s.hall.id))
    act(() => useCourtPick.getState().setPick({ ref: { kind: 'block-court', id: `${s.hall.id}/e3` }, vertex: 2 }))
    del()
    expect(present(s.hall.id)).toBe(true)
  })
})

describe('the block’s own handles stay over the court’s hit paths (review B3)', () => {
  it('the court’s hit path is drawn under the block’s shape handles (its wall pill and corner dots), the court’s own handles above', () => {
    const s = load()
    render(<PlanSvg />)
    act(() => useApp.getState().select(s.hall.id))
    const hit = document.querySelector(`[data-block-court="${s.hall.id}/e1"]`)!
    const block = document.querySelector(`[data-layer="shape-handles"][data-mass="${s.hall.id}"]`)!
    const court = document.querySelector(`[data-layer="shape-handles"][data-mass="${s.hall.id}/e1"]`)
    expect(block).not.toBeNull()
    // the hit path first, the block's handles after it (drawn over it)
    expect(hit.compareDocumentPosition(block) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    if (court) expect(hit.compareDocumentPosition(court) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})
