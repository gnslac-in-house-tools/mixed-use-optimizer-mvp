// A parking lot turned and snapped (Decisions "Lot tool", "Rotate handle", "Snap first to what is drawn", "Lot turn
// and snap"; the user, 2026-11-05: "Parking lots cannot be rotated, nor snapped by their corners"). A free lot picked
// has the masses' rotation handle: dragged round its centre it turns by 15° steps (Shift freely), one undo step; its
// Properties has its Rotation. An anchored lot turns with its wall: no handle, its Rotation shown but not editable, its
// title says why. A free lot dragged snaps as a mass does: its corners onto the corners of what is drawn, another lot's
// included (a lot's corners attract), never onto its own.
// jsdom has no layout: the plan uses UNMEASURED_SIZE and `at` turns world metres into screen pixels.
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Lot, Point, Project } from '../../model/schema.ts'
import { App } from '../../App.tsx'
import { derive } from '../../engine/derive.ts'
import { contourFromPolygon } from '../../engine/geom/contour.ts'
import { demoProject } from '../../state/demo.ts'
import { emptyHistory } from '../../state/history.ts'
import { NO_SELECTION, useApp } from '../../state/store.ts'
import { actions } from '../../state/actions/index.ts'
import { useGraph } from '../graph/graphState.ts'
import { useUi } from '../layout/ui.ts'
import { useRoads } from '../plan/circulation/roadState.ts'
import { fit, UNMEASURED_SIZE } from '../plan/camera.ts'
import { contentBounds } from '../plan/PlanSvg.tsx'
import { ROTATE_GAP_PX, rotateHandle } from '../plan/editing.ts'
import { sourcesFor } from '../plan/snap/sources.ts'
import { useLots } from '../../modules/parking/views/lotState.ts'
import { wallNear } from '../../modules/parking/engine/lots.ts'
import { letGo } from '../tools/hand.ts'

vi.mock('../scene/Scene.tsx', () => ({ Scene: () => <div data-testid="scene" /> }))

const s = () => useApp.getState()
const lotsOf = () => s().project.options[0].lots ?? []
const rectOf = (id: string) => lotsOf().find((l) => l.id === id)!.rect!

// as the plan frames it
const v = fit(contentBounds(derive(demoProject(), 'o1')), UNMEASURED_SIZE)
const px = 1 / v.scale
const at = (q: Point, extra: object = {}) => ({ clientX: (q.x - v.cx) * v.scale + UNMEASURED_SIZE.w / 2, clientY: UNMEASURED_SIZE.h / 2 - (q.y - v.cy) * v.scale, button: 0, pointerId: 1, ...extra })

/** A corner of open ground with a box `w` × `h` clear of every mass by 35 m (off the 1 m grid, by .37 and .61). */
function openGround(p: Project, w: number, h: number): Point {
  const d = derive(p, 'o1')
  const shown = Object.values(d.masses).filter((m) => p.options[0].buildingIds.includes(m.buildingId))
  const site = d.site.polygon!
  const xs = site.map((q) => q.x)
  const ys = site.map((q) => q.y)
  for (let x = Math.min(...xs) + 20; x < Math.max(...xs) - w - 20; x += 10)
    for (let y = Math.min(...ys) + 20; y < Math.max(...ys) - h - 20; y += 10) {
      const q = { x: x + 0.37, y: y + 0.61 }
      const b = { x: q.x + w, y: q.y + h }
      const clear = [q, b, { x: q.x, y: b.y }, { x: b.x, y: q.y }].every((c) => !wallNear(shown, c)) && !shown.some((m) => m.polygon.some((c) => c.x > q.x - 35 && c.x < b.x + 35 && c.y > q.y - 35 && c.y < b.y + 35))
      if (clear) return q
    }
  throw new Error('no open ground')
}

function withLots(...lots: Omit<Lot, 'id' | 'name'>[]): string[] {
  let p = demoProject()
  const ids: string[] = []
  for (const l of lots) {
    const r = actions.addLot(p, 'o1', l)!
    p = r.project
    ids.push(r.id)
  }
  useApp.setState({ project: p, derived: derive(p, 'o1'), history: emptyHistory() })
  return ids
}

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

const rotateOf = (id: string) => document.querySelector(`[data-handle="lot-rotate-${id}"]`)
const rail = () => within(screen.getByRole('complementary', { name: 'Layers and properties' }).querySelector<HTMLElement>('[data-panel-tabs]')!)
const rotationField = () => within(screen.getByLabelText('Parking lot')).getByRole('textbox', { name: /Rotation/ }) as HTMLInputElement

describe('a parking lot turned', () => {
  it('a free lot picked has the rotation handle; a quarter round its centre turns it 90°, one undo step', () => {
    const a = openGround(demoProject(), 80, 60)
    const center = { x: a.x + 20, y: a.y + 10 }
    const [id] = withLots({ rect: { center, width: 40, depth: 20, rotation: 0 } })
    render(<App />)
    act(() => useLots.getState().pick(id))
    const h = rotateOf(id)
    expect(h).not.toBeNull()
    // the handle stands where a 40 × 20 rect's would: beyond its up side
    const r = 10 + ROTATE_GAP_PX * px
    const round = (deg: number) => ({ x: center.x + r * Math.cos((deg * Math.PI) / 180), y: center.y + r * Math.sin((deg * Math.PI) / 180) })
    expect(rotateHandle({ kind: 'rect', ...rectOf(id) }, px).at.y).toBeCloseTo(round(90).y)
    fireEvent.pointerDown(h!, at(round(90)))
    fireEvent.pointerMove(h!, at(round(140)))
    fireEvent.pointerMove(h!, at(round(181)))
    fireEvent.pointerUp(h!, at(round(181)))
    expect(rectOf(id).rotation).toBe(90)
    expect(rectOf(id).center.x).toBeCloseTo(center.x)
    expect(s().history.past).toHaveLength(1)
    // laid out turned: its rows run north–south now
    const laid = s().derived.circulation.lots.find((l) => l.id === id)!
    expect(laid.frame.along.x).toBeCloseTo(0)
    expect(laid.frame.along.y).toBeCloseTo(1)
    // Shift: freely, to a tenth of a degree
    fireEvent.pointerDown(rotateOf(id)!, at(round(180), { shiftKey: true }))
    fireEvent.pointerMove(rotateOf(id)!, at(round(187.3), { shiftKey: true }))
    fireEvent.pointerUp(rotateOf(id)!, at(round(187.3), { shiftKey: true }))
    expect(rectOf(id).rotation).toBeCloseTo(97.3, 1)
  })

  it('its Properties has its Rotation, one verb through actions', () => {
    const a = openGround(demoProject(), 80, 60)
    const [id] = withLots({ rect: { center: { x: a.x + 20, y: a.y + 10 }, width: 40, depth: 20, rotation: 0 } })
    render(<App />)
    act(() => useLots.getState().pick(id))
    fireEvent.click(rail().getByRole('tab', { name: 'Properties' }))
    const f = rotationField()
    expect(f).not.toBeDisabled()
    fireEvent.change(f, { target: { value: '30' } })
    fireEvent.blur(f)
    expect(rectOf(id).rotation).toBe(30)
    expect(s().history.past).toHaveLength(1)
    // as a mass's, in [0, 360)
    fireEvent.change(rotationField(), { target: { value: '-30' } })
    fireEvent.blur(rotationField())
    expect(rectOf(id).rotation).toBe(330)
  })

  it('an anchored lot turns with its wall: no handle, its Rotation not editable and its title says why', () => {
    const [id] = withLots({ anchor: { massId: 'm1', side: 't1' } })
    render(<App />)
    act(() => useLots.getState().pick(id))
    expect(document.querySelector('[data-lot-handle="rows"]')).not.toBeNull()
    expect(rotateOf(id)).toBeNull()
    fireEvent.click(rail().getByRole('tab', { name: 'Properties' }))
    const f = rotationField()
    expect(f).toBeDisabled()
    expect(f.title).toMatch(/turns with its wall.*Free it from the wall/i)
  })
})

describe('a parking lot snapped', () => {
  it('a lot’s corners attract, but a lot dragged is not attracted by itself', () => {
    const a = openGround(demoProject(), 80, 60)
    const [id] = withLots({ rect: { center: { x: a.x + 20, y: a.y + 10 }, width: 40, depth: 20, rotation: 0 } })
    const laid = s().derived.circulation.lots[0]
    const has = (exclude: string[]) => sourcesFor(s().project, s().derived, exclude).some((src) => JSON.stringify(src.contour) === JSON.stringify(contourFromPolygon(laid.polygon)))
    expect(has([])).toBe(true)
    expect(has([id])).toBe(false)
  })

  it('a free lot dragged puts its corner onto another lot’s corner, as a mass’s corners snap', () => {
    const a = openGround(demoProject(), 80, 60)
    // A: 40 × 20 from `a`; B: 30 × 16, a little off A's north-east corner, diagonally
    const ne = { x: a.x + 40, y: a.y + 20 }
    const [, b] = withLots(
      { rect: { center: { x: a.x + 20, y: a.y + 10 }, width: 40, depth: 20, rotation: 0 } },
      { rect: { center: { x: ne.x + 15 + 6, y: ne.y + 8 + 5 }, width: 30, depth: 16, rotation: 0 } },
    )
    render(<App />)
    const body = document.querySelector(`[data-lot="${b}"]`)!
    const grab = { x: ne.x + 15 + 6, y: ne.y + 8 + 5 }
    // moved by (-5.6, -4.7): its south-west corner 0.4, 0.3 m off A's north-east one
    const to = { x: grab.x - 5.6, y: grab.y - 4.7 }
    fireEvent.pointerDown(body, at(grab))
    fireEvent.pointerMove(body, at({ x: grab.x - 3, y: grab.y - 2 }))
    fireEvent.pointerMove(body, at(to))
    fireEvent.pointerUp(body, at(to))
    const c = rectOf(b).center
    expect(c.x).toBeCloseTo(ne.x + 15, 6)
    expect(c.y).toBeCloseTo(ne.y + 8, 6)
    expect(s().history.past).toHaveLength(1)
  })
})
