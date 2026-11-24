// Parking lots in the Flow step (Decision "Lot tool", PK.3): the Lot tool (L) next to a wall lays a lot along it to the
// setback in one click and picks it; next to a truck court's wall it makes none; on open ground a drag draws a free
// one. Properties shows the picked lot (its length, rows, sizes, entrance); Flow › Parking lists it; Delete removes it;
// Connect gives its entrance a street. Each edit one undo step.
// jsdom has no layout: the plan uses UNMEASURED_SIZE and `at` turns world metres into screen pixels.
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Point } from '../../model/schema.ts'
import { App } from '../../App.tsx'
import { showLayer } from '../layers/show.ts'
import { derive } from '../../engine/derive.ts'
import { demoProject } from '../../state/demo.ts'
import { emptyHistory } from '../../state/history.ts'
import { NO_SELECTION, useApp } from '../../state/store.ts'
import { useGraph } from '../graph/graphState.ts'
import { useUi } from '../layout/ui.ts'
import { useRoads } from '../plan/circulation/roadState.ts'
import { useTool } from '../plan/tools/toolState.ts'
import { fit, UNMEASURED_SIZE } from '../plan/camera.ts'
import { useLots } from '../../modules/parking/views/lotState.ts'
import { courtOn, wallNear, wallsOf } from '../../modules/parking/engine/lots.ts'
import { actions } from '../../state/actions/index.ts'
import { letGo, take } from '../tools/hand.ts'

vi.mock('../scene/Scene.tsx', () => ({ Scene: () => <div data-testid="scene" /> }))

const s = () => useApp.getState()

beforeEach(() => {
  localStorage.clear()
  const p = demoProject()
  useApp.setState({ project: p, derived: derive(p, 'o1'), history: emptyHistory(), dragStart: null, selection: NO_SELECTION, level: 'l1', showAll: false, option: 'o1' })
  useUi.setState({ view: 'plan', rail: 'layers', panels: { left: true, right: true }, sheet: null, help: false })
  useGraph.setState({ graph: false, rule: null, relation: null })
  letGo()
  useRoads.setState({ picked: null, also: [] })
  useLots.setState({ picked: null })
})

// the demo's site and its 15 m south street, as the plan frames it
const v = fit({ minX: 0, minY: -15, maxX: 440, maxY: 280 }, UNMEASURED_SIZE)
const at = (q: Point) => ({ clientX: (q.x - v.cx) * v.scale + UNMEASURED_SIZE.w / 2, clientY: UNMEASURED_SIZE.h / 2 - (q.y - v.cy) * v.scale, button: 0, pointerId: 1 })
const tools = () => screen.getByRole('toolbar', { name: 'Tools' })
const rail = () => within(screen.getByRole('complementary', { name: 'Layers and properties' }).querySelector<HTMLElement>('[data-panel-tabs]')!)
/** The rail's Properties, picked: the picked lot's fields (Decision "Properties on the rail"). */
const properties = () => fireEvent.click(rail().getByRole('tab', { name: 'Properties' }))
const capture = () => document.querySelector('[data-capture]')!
const press = (q: Point, to: Point = q) => {
  fireEvent.pointerMove(capture(), at(q))
  fireEvent.pointerDown(capture(), at(q))
  fireEvent.pointerMove(capture(), at(to))
  fireEvent.pointerUp(capture(), at(to))
}
const shown = () => Object.values(s().derived.masses).filter((m) => s().project.options[0].buildingIds.includes(m.buildingId))
/** The demo's first warehouse's walls, with whether a truck court stands on each. */
const walls = () => {
  const m = s().derived.masses.m1
  return wallsOf(m.polygon).map((w) => ({ w, court: courtOn(s().derived.circulation.docks, 'm1', w) }))
}
/** 10 m out of a wall's middle. */
const before = (w: ReturnType<typeof walls>[number]['w']): Point => ({ x: w.start.x + w.along.x * (w.length / 2) + w.out.x * 10, y: w.start.y + w.along.y * (w.length / 2) + w.out.y * 10 })

describe('the Lot tool', () => {
  it('in Flow’s Parking group (L); next to a wall a click lays a lot along it, picked, and the tool gives way to Select', () => {
    render(<App />)
    fireEvent.click(within(tools()).getByRole('button', { name: 'Lot' }))
    expect(useTool.getState().tool).toBe('lot')
    // its north wall: the demo's streets hug the others, so no row fits before them there
    const free = walls().find((x) => x.w.side === 't1')!
    const steps = s().history.past.length
    press(before(free.w))
    const lots = s().project.options[0].lots!
    expect(lots).toHaveLength(1)
    expect(lots[0]).toMatchObject({ name: 'Lot 1', anchor: { massId: 'm1', side: free.w.side } })
    expect(lots[0].rows).toBeUndefined() // to the setback
    expect(s().history.past).toHaveLength(steps + 1)
    expect(useLots.getState().picked).toBe(lots[0].id)
    expect(useTool.getState().tool).toBe('select')
    // drawn: its stalls and its label
    const l = s().derived.circulation.lots[0]
    expect(l.stalls.length).toBeGreaterThan(0)
    expect(document.querySelector(`[data-lot-label="${l.id}"]`)?.textContent).toContain(`${l.stalls.length.toLocaleString('en-US')} stalls`)
    // Properties shows it; its rows set there, one undo step
    properties()
    const props = screen.getByRole('region', { name: 'Properties' })
    expect(within(props).getByLabelText('Parking lot')).toBeInTheDocument()
    fireEvent.click(within(within(props).getByRole('group', { name: 'Its rows' })).getByRole('button', { name: 'Set' }))
    expect(s().project.options[0].lots![0].rows).toBe(l.rows)
    expect(s().history.past).toHaveLength(steps + 2)
  })

  it('where a street hugs the wall no row fits before it: it makes none, and says so', () => {
    render(<App />)
    act(() => take('lot'))
    const hugged = walls().find((x) => x.w.side === 's0')!
    expect(wallNear(shown(), before(hugged.w))?.wall.side).toBe('s0')
    fireEvent.pointerMove(capture(), at(before(hugged.w)))
    expect(screen.getByText('No room before a street: drag out to set its rows')).toBeInTheDocument()
    press(before(hugged.w))
    expect(s().project.options[0].lots).toBeUndefined()
    expect(useTool.getState().tool).toBe('lot')
  })

  it('next to a truck court’s wall it makes none; on open ground a drag draws a free one; Delete removes the picked lot', () => {
    render(<App />)
    act(() => take('lot'))
    const court = walls().find((x) => x.court)
    if (court) {
      press(before(court.w))
      expect(s().project.options[0].lots).toBeUndefined()
      act(() => take('lot'))
    }
    // open ground: far from every mass
    const site = s().derived.site.polygon!
    const xs = site.map((q) => q.x)
    const ys = site.map((q) => q.y)
    let a: Point | null = null
    for (let x = Math.min(...xs) + 20; x < Math.max(...xs) - 60 && !a; x += 10)
      for (let y = Math.min(...ys) + 20; y < Math.max(...ys) - 40 && !a; y += 10) {
        const q = { x, y }
        const b = { x: x + 40, y: y + 20 }
        const clear = [q, b, { x: q.x, y: b.y }, { x: b.x, y: q.y }].every((c) => !wallNear(shown(), c)) && !shown().some((m) => m.polygon.some((c) => c.x > q.x - 35 && c.x < b.x + 35 && c.y > q.y - 35 && c.y < b.y + 35))
        if (clear) a = q
      }
    expect(a).not.toBeNull()
    press(a!, { x: a!.x + 40, y: a!.y + 20 })
    const lot = s().project.options[0].lots![0]
    expect(lot.rect!.width).toBeCloseTo(40, 0)
    expect(lot.rect!.depth).toBeCloseTo(20, 0)
    expect(lot.rect!.rotation).toBe(0)
    expect(useLots.getState().picked).toBe(lot.id)
    fireEvent.keyDown(window, { key: 'Delete' })
    expect(s().project.options[0].lots).toBeUndefined()
    expect(useLots.getState().picked).toBeNull()
  })
})

describe('Parking › Lots in Layers', () => {
  it('the option’s lots are rows of the Parking branch, with their stalls and wall; a click picks one; its stalls apart in the totals', () => {
    act(() => s().apply((p) => actions.addLot(p, 'o1', { anchor: { massId: 'm1', side: walls().find((x) => !x.court)!.w.side }, rows: 2 })!.project))
    render(<App />)
    const tree = () => screen.getByRole('tree', { name: 'Layers' })
    const unfold = (name: string) => fireEvent.click(within(within(tree()).getByRole('treeitem', { name })).getByRole('button', { name: `Unfold ${name}` }))
    unfold('Parking')
    unfold('Lots')
    const row = within(tree()).getByRole('treeitem', { name: 'Lot 1' })
    expect(row.textContent).toContain('Lot 1')
    // its stalls as the count, its wall and rows as the quiet word: what the Flow tab's list said
    const lot = s().derived.circulation.lots[0]
    expect(row.textContent).toContain(String(lot.stalls.length))
    expect(row.textContent).toContain(`${lot.anchor!.facing[0].toUpperCase()}${lot.anchor!.facing.slice(1)} wall · 2 rows`)
    fireEvent.click(row.querySelector('[data-row-pick]')!)
    expect(useLots.getState().picked).toBe(s().project.options[0].lots![0].id)
    act(() => showLayer('parking'))
    const totals = screen.getByLabelText('Parking totals')
    expect(within(totals).getByText('In the lots')).toBeInTheDocument()
  })
})

describe('its entrance', () => {
  it('on the north wall of the demo’s first warehouse no street reaches it: a warning; Connect draws one of the cars’ type, and it is reached', () => {
    act(() => s().apply((p) => actions.addLot(p, 'o1', { anchor: { massId: 'm1', side: 't1' }, rows: 2 })!.project))
    const lot = () => s().derived.circulation.lots[0]
    expect(lot().anchor!.facing).toBe('north')
    expect(lot().reached).toBe(false)
    expect(s().derived.issues.some((i) => i.code === 'lot' && i.message === 'No street reaches Lot 1’s entrance: draw one, or Connect draws it.')).toBe(true)
    const segments = s().project.options[0].streets!.segments.length
    let r: ReturnType<typeof actions.connectStreets> | null = null
    act(() => s().apply((p) => (r = actions.connectStreets(p, 'o1')).project))
    expect(r!.lots).toBe(1)
    expect(lot().reached).toBe(true)
    // of the cars' type (where it meets a street, that street splits in two: a T), and it ends at the lot: no dead end
    const made = s().project.options[0].streets!.segments.slice(segments)
    expect(made.some((g) => g.type === 'cars')).toBe(true)
    expect(s().derived.issues.some((i) => i.code === 'road' && i.message.includes('dead end'))).toBe(false)
  })
})
