// Phase D.3 task 7: the Corner and Chamfer tools take a truck court's corners too, on the site: the placed block picked, a click on a far corner of one of its courts picks it, the pointer
// sets the set-back or the radius, a click sets it (the shape engine's `chamfer` and `radius` ops on the `block-court`, so the copy's own courts: a variant); a corner on the wall is
// rounded or chamfered like any other (its court stays on its wall: the writer holds it). One undo step; the block's own mass is still what the tools pick on its own walls.
import { act, fireEvent, render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Point } from '../../../../model/schema.ts'
import { App } from '../../../../App.tsx'
import { derive } from '../../../../engine/derive.ts'
import { shapedSite } from '../../../../modules/docks/__tests__/shapedCourtFixture.ts'
import { actions } from '../../../../state/actions/index.ts'
import { emptyHistory } from '../../../../state/history.ts'
import { NO_SELECTION, useApp } from '../../../../state/store.ts'
import { resetTyped } from '../../../editing/dimension/typed.ts'
import { useCourtPick } from '../../../editing/shape/shapeState.ts'
import { useToast } from '../../../layout/toast.ts'
import { useUi } from '../../../layout/ui.ts'
import { letGo } from '../../../tools/hand.ts'
import { fit, UNMEASURED_SIZE } from '../../camera.ts'
import { useCommand } from '../../command/commandState.ts'
import { contentBounds } from '../../PlanSvg.tsx'
import { DEFAULT_SNAP } from '../../snap/kinds.ts'
import { useSnapSettings } from '../../snap/settings.ts'
import { planPointer } from '../toolState.ts'
import { bisector } from '../cornerRadius.ts'

vi.mock('../../../scene/Scene.tsx', () => ({ Scene: () => <div data-testid="scene" /> }))
vi.mock('../../../../modules/warehouse/views/WarehouseScene.tsx', () => ({ WarehouseScene: () => <div data-testid="warehouse-scene" /> }))

const s = () => useApp.getState()
const key = (k: string, extra: object = {}) => fireEvent.keyDown(window, { key: k, ...extra })
const capture = () => document.querySelector('[data-capture]')!

let at = (q: Point): object => ({ ...q })
function camera() {
  const v = fit(contentBounds(derive(s().project, s().option)), UNMEASURED_SIZE)
  at = (q) => ({ clientX: (q.x - v.cx) * v.scale + UNMEASURED_SIZE.w / 2, clientY: UNMEASURED_SIZE.h / 2 - (q.y - v.cy) * v.scale, button: 0, pointerId: 1 })
}
const click = (q: Point) => {
  fireEvent.pointerDown(capture(), at(q))
  fireEvent.pointerUp(capture(), at(q))
}
const move = (q: Point) => fireEvent.pointerMove(capture(), at(q))

function load() {
  const site = shapedSite([])
  useApp.setState({ project: site.p, derived: derive(site.p, site.optionId), history: emptyHistory(), dragStart: null, selection: NO_SELECTION, option: site.optionId, level: site.building.levels[0].id, showAll: false })
  return site
}

beforeEach(() => {
  localStorage.clear()
  useUi.setState({ dialog: null, view: 'plan', rail: 'layers', panels: { left: true, right: true }, sheet: null, help: true })
  letGo()
  useSnapSettings.setState({ settings: DEFAULT_SNAP })
  useCommand.setState({ registration: null, angle: null, cursor: null })
  resetTyped()
  useToast.setState({ toast: null, confirmation: null })
  useCourtPick.setState({ pick: null })
  planPointer.point = null
})

/** The far corner of the front court (the first that is not on its wall), where the pointer picks it, and the point that gives a set-back of `size` (a chamfer's middle) or a radius. */
function farCorner(hall: string) {
  const ref = { kind: 'block-court', id: `${hall}/e1` }
  const read = actions.shapeOf(s().project, ref)!
  const i = read.contour.vertices.findIndex((_, j) => !read.onLine!.corners.includes(j))
  const v = read.contour.vertices[i]
  const b = bisector(read.contour, i)!
  return { ref, i, v, u: b.u, angle: b.angle }
}

describe('the Corner and Chamfer tools on a court of the block picked', () => {
  it('Chamfer: a click on a far corner of the court, the pointer sets 6 × 6 m, a click sets it: the copy’s own courts, one undo step, the type unchanged', () => {
    const site = load()
    render(<App />)
    act(() => s().select(site.hall.id))
    camera()
    key('F', { shiftKey: true })
    const { ref, i, v, u } = farCorner(site.hall.id)
    const types = JSON.stringify(s().project.warehouseTypes)
    const before = s().history.past.length
    click(v)
    // a cut of 6 × 6 is 6 / √2 m along the bisector, into the court
    const p = { x: v.x + (u.x * 6) / Math.SQRT2, y: v.y + (u.y * 6) / Math.SQRT2 }
    move(p)
    click(p)
    const own = site.building && s().project.buildings.find((b) => b.id === site.building.id)!.warehouse!.overrides?.courts
    expect(own?.[0]?.shape?.vertices.some((q) => q.chamfer && Math.abs(q.chamfer[0] - 6) < 0.11 && Math.abs(q.chamfer[1] - 6) < 0.11)).toBe(true)
    expect(JSON.stringify(s().project.warehouseTypes)).toBe(types)
    expect(s().history.past.length).toBe(before + 1)
    // the court is the pick, with that corner; the block stays picked
    expect(useCourtPick.getState().pick).toMatchObject({ ref: { id: ref.id }, vertex: i })
    expect(s().selection.massIds).toEqual([site.hall.id])
    act(() => s().undo())
    expect(s().project.buildings.find((b) => b.id === site.building.id)!.warehouse!.overrides?.courts).toBeUndefined()
  })

  it('Corner: the same click and a pointer on the bisector give the court’s far corner a radius, one undo step', () => {
    const site = load()
    render(<App />)
    act(() => s().select(site.hall.id))
    camera()
    key('F')
    const { v, u, angle } = farCorner(site.hall.id)
    const before = s().history.past.length
    click(v)
    // the arc's centre follows the pointer on the bisector: r = distance · sin(angle / 2)
    const d = 5 / Math.sin(angle / 2)
    const p = { x: v.x + u.x * d, y: v.y + u.y * d }
    move(p)
    click(p)
    const own = s().project.buildings.find((b) => b.id === site.building.id)!.warehouse!.overrides?.courts
    expect(own?.[0]?.shape?.vertices.some((q) => Math.abs(q.r - 5) < 0.11)).toBe(true)
    expect(s().history.past.length).toBe(before + 1)
  })

  it('with no block picked a court’s corner is not there to pick: the tool picks the masses’ only', () => {
    const site = load()
    render(<App />)
    camera()
    key('F', { shiftKey: true })
    const { v } = farCorner(site.hall.id)
    const before = s().history.past.length
    click(v)
    expect(s().history.past.length).toBe(before)
    expect(document.querySelector('[data-corner-mark]')).toBeNull()
  })
})
