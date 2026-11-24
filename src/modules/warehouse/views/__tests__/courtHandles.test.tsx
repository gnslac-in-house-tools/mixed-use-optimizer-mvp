// Phase D.3 task 7: a truck court's handles in the block editor, on the one set of shape handles (`views/editing/shape/`, ghost mode). The block's court pill is the
// engine's now (`value` on the far edge of a rectangle, typed); a court clicked shows its side pills and its corner dots and none on its wall side (`fixed`); a corner on the wall
// slides along it (`onLine`); Shift+F chamfers a picked far corner; a menu row brings a shaped court back to a rectangle, and the block's depth again is greyed on a shape.
import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../../../App.tsx'
import { derive } from '../../../../engine/derive.ts'
import { wallAt } from '../../../../views/plan/snap/walls.ts'
import { demoProject } from '../../../../state/demo.ts'
import { emptyHistory } from '../../../../state/history.ts'
import { useApp } from '../../../../state/store.ts'
import { actions } from '../../../../state/actions/index.ts'
import { resetTyped, useTyped } from '../../../../views/editing/dimension/typed.ts'
import { chamferShapeCorner } from '../../../../views/editing/shape/shapeState.ts'
import { useToast } from '../../../../views/layout/toast.ts'
import { useUi } from '../../../../views/layout/ui.ts'
import { STAYS_ON_WALL, wallFrame } from '../../engine/courts.ts'
import { generate } from '../../engine/generate.ts'
import { useWarehouse } from '../warehouseState.ts'
import { pxFor } from './planScreen.ts'

vi.mock('../../../../views/scene/Scene.tsx', () => ({ Scene: () => <div data-testid="scene" /> }))
vi.mock('../WarehouseScene.tsx', () => ({ WarehouseScene: () => <div data-testid="warehouse-scene" /> }))

const REF = { kind: 'court', id: 'wt1/e1' }

beforeEach(() => {
  localStorage.clear()
  const p = actions.addWarehouseType(demoProject()).project
  useApp.setState({ project: p, derived: derive(p), history: emptyHistory(), dragStart: null, selection: { massId: null, vertex: null, massIds: [] }, option: p.options[0].id })
  useUi.setState({ dialog: 'program', view: 'plan', panels: { left: true, right: true }, sheet: null })
  useWarehouse.setState({ programId: null, typeId: null, shown: null, tool: 'select', picked: [] })
  useToast.setState({ toast: null })
  resetTyped()
})

const type = () => useApp.getState().project.warehouseTypes![0]
const steps = () => useApp.getState().history.past.length
const key = (k: string, more: Record<string, boolean> = {}) => fireEvent.keyDown(window, { key: k, ...more })
const keys = (text: string) => [...text].forEach((c) => key(c))
const plan = () => document.querySelector('[data-warehouse-plan]')!
const ghost = () => plan().querySelector('[data-ghost]')
const handle = (k: string) => document.querySelector(`[data-handle="${k}"]`)!
const read = () => actions.shapeOf(useApp.getState().project, REF)!
const pickCourt = () => act(() => useWarehouse.setState({ picked: [{ kind: 'court', id: 'e1' }] }))
const field = () => document.querySelector('[data-warehouse-plan] [data-dimension-field]')

const FAR = 'court-wt1/e1-wall-0'
const press = (k: string, at = { x: 0, y: 0 }) => fireEvent.pointerDown(handle(k), { clientX: at.x, clientY: at.y, pointerId: 1, button: 0 })
const pull = (k: string, at: { x: number; y: number }) => fireEvent.pointerMove(handle(k), { clientX: at.x, clientY: at.y, pointerId: 1 })
const release = (k: string, at: { x: number; y: number }) => fireEvent.pointerUp(handle(k), { clientX: at.x, clientY: at.y, pointerId: 1 })
/** 10 m down the plan, out of the front: 40 → 50 m. */
const OUT = { x: 0, y: 0 }
const out = (m: number) => ({ x: OUT.x, y: pxFor(m) })

describe('the court pill, the shape engine’s: its far edge, a typed depth', () => {
  it('the block picked or not, a rectangle’s far edge has the pill (a value wall); a pull is a ghost, applied on release; one undo step', () => {
    render(<App />)
    expect(handle(FAR)).not.toBeNull()
    expect(handle(FAR).closest('[data-court-pill]')).not.toBeNull()
    expect(handle(FAR).textContent).toContain('40')
    const before = steps()
    press(FAR)
    pull(FAR, out(10))
    expect(ghost()).not.toBeNull()
    expect(type().courts).toBeUndefined()
    release(FAR, out(10))
    expect(ghost()).toBeNull()
    expect(type().courts).toEqual([{ edge: 'e1', depth: 50 }])
    expect(steps()).toBe(before + 1)
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(type().courts).toBeUndefined()
  })

  it('the number typed during the drag sets the depth itself (a value, not a distance), no ghost left; one undo step', () => {
    render(<App />)
    const before = steps()
    press(FAR)
    pull(FAR, out(10))
    expect(field()!.textContent).toMatch(/50\s?m/)
    keys('35')
    expect(field()!.textContent).toContain('35')
    key('Enter')
    expect(type().courts).toEqual([{ edge: 'e1', depth: 35 }])
    pull(FAR, out(30))
    release(FAR, out(30))
    expect(type().courts).toEqual([{ edge: 'e1', depth: 35 }])
    expect(steps()).toBe(before + 1)
    expect(ghost()).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(type().courts).toBeUndefined()
  })

  it('typed right after the release it corrects it; 300 is held to 200 and said; Escape during the drag applies nothing', () => {
    render(<App />)
    const before = steps()
    press(FAR)
    pull(FAR, out(10))
    release(FAR, out(10))
    keys('60')
    key('Enter')
    expect(type().courts).toEqual([{ edge: 'e1', depth: 60 }])
    expect(steps()).toBe(before + 1)
    press(FAR)
    pull(FAR, out(10))
    keys('300')
    key('Enter')
    expect(type().courts).toEqual([{ edge: 'e1', depth: 200 }])
    expect(useTyped.getState().cur?.note).toMatch(/200/)
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    press(FAR)
    pull(FAR, out(10))
    key('Escape')
    release(FAR, out(10))
    expect(type().courts).toBeUndefined()
    expect(useTyped.getState().cur).toBeNull()
    expect(field()).toBeNull()
  })
})

describe('a court clicked: its handles', () => {
  it('a pill on each wall but its wall side, a dot on each corner; none a pill on the wall side', () => {
    render(<App />)
    pickCourt()
    const r = read()
    expect(r.walls!.some((w) => w.fixed)).toBe(true)
    r.walls!.forEach((w, i) => {
      if (w.fixed) {
        expect(handle(`court-wt1/e1-wall-${i}`), `wall ${i} is the wall side`).toBeNull()
        expect(handle(`court-wt1/e1-line-${i}`)).toBeNull()
      } else {
        expect(handle(`court-wt1/e1-wall-${i}`), `wall ${i}`).not.toBeNull()
        expect(handle(`court-wt1/e1-line-${i}`)).not.toBeNull()
      }
    })
    r.contour.vertices.forEach((_, i) => expect(handle(`court-wt1/e1-vertex-${i}`), `corner ${i}`).not.toBeNull())
  })

  it('a side pulled in 4 m: a shape of its own, the wall side that much shorter; one undo step; the far edge’s pill is gone with the rectangle', () => {
    render(<App />)
    pickCourt()
    const r = read()
    const i = r.walls!.findIndex((w, k) => !w.fixed && k !== 0)
    const n = wallAt(r.contour, i).n
    const before = steps()
    const to = { x: pxFor(-4 * n.x), y: pxFor(4 * n.y) }
    press(`court-wt1/e1-wall-${i}`)
    pull(`court-wt1/e1-wall-${i}`, to)
    release(`court-wt1/e1-wall-${i}`, to)
    const shape = type().courts![0].shape!
    expect(shape).toBeDefined()
    expect(type().courts![0].id).toBe('c1')
    const xs = shape.vertices.map((v) => v.x)
    const g = generate(type())
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(wallFrame(g.edges.find((e) => e.id === 'e1')!).length - 4, 3)
    expect(steps()).toBe(before + 1)
    expect(document.querySelector('[data-court-pill]')).toBeNull()
  })

  it('a corner on the wall dragged off it lands on it, sliding along it only', () => {
    render(<App />)
    pickCourt()
    const r = read()
    const k = r.onLine!.corners[0]
    const v = r.contour.vertices[k]
    const w = r.onLine!.corners.find((c) => c !== k)!
    const other = r.contour.vertices[w]
    const len = Math.hypot(other.x - v.x, other.y - v.y)
    const inward = { x: (other.x - v.x) / len, y: (other.y - v.y) / len }
    // 3 m along the wall towards the court's middle, 10 m out of the wall (the way the far edge lies)
    const dy = r.contour.vertices.find((_, j) => !r.onLine!.corners.includes(j))!.y - v.y
    const off = { x: inward.x * 3, y: inward.y * 3 + Math.sign(-dy || 1) * 10 }
    const to = { x: pxFor(off.x), y: pxFor(-off.y) }
    press(`court-wt1/e1-vertex-${k}`)
    pull(`court-wt1/e1-vertex-${k}`, to)
    release(`court-wt1/e1-vertex-${k}`, to)
    const shape = type().courts![0].shape!
    // two corners stay on the wall (y 0 in its frame); the one dragged moved 3 m along it
    const onWall = shape.vertices.filter((q) => Math.abs(q.y) < 1e-6).map((q) => q.x).sort((a, b) => a - b)
    const full = wallFrame(generate(type()).edges.find((e) => e.id === 'e1')!).length
    expect(onWall).toHaveLength(2)
    expect(onWall[1] - onWall[0]).toBeCloseTo(full - 3, 3)
    // the far corners stay where they were: the court is a trapezoid now, its wall side shorter than its far edge
    expect(shape.vertices.filter((q) => q.y > 1)).toHaveLength(2)
  })

  it('a refusal that is a sentence without a full stop keeps all its letters in the toast (review S4)', () => {
    const spy = vi.spyOn(actions, 'editShape').mockImplementation((p) => ({ project: p, reason: STAYS_ON_WALL }))
    try {
      chamferShapeCorner(REF, 0)
    } finally {
      spy.mockRestore()
    }
    expect(useToast.getState().toast?.text).toBe(`${STAYS_ON_WALL}.`)
  })

  it('a far corner picked by a click and Shift+F: chamfered, 3 × 3 m, one undo step; Corner is the shape engine’s radius too', () => {
    render(<App />)
    pickCourt()
    const r = read()
    const far = r.contour.vertices.findIndex((_, j) => !r.onLine!.corners.includes(j))
    const before = steps()
    fireEvent.click(handle(`court-wt1/e1-vertex-${far}`))
    key('F', { shiftKey: true })
    const shape = type().courts![0].shape!
    expect(shape.vertices.some((q) => q.chamfer && q.chamfer[0] === 3 && q.chamfer[1] === 3)).toBe(true)
    expect(steps()).toBe(before + 1)
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(type().courts).toBeUndefined()
  })
})
