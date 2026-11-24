// Phase D.3 task 8: the Split tool, in the Tools strip's Massing group beside Chamfer (key S). Two clicks draw a line at any angle (the second may be typed: @0,40); the truck court
// it crosses is split through the shape engine (`editShape`, op `split`, on the `block-court`: the copy's own courts, one undo step). For now only a court: a line across nothing
// says so. A line along the wall leaves the far piece, and the toast says it went.
import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Point } from '../../../../model/schema.ts'
import { App } from '../../../../App.tsx'
import { derive } from '../../../../engine/derive.ts'
import { siteCourtRefs } from '../../../../modules/warehouse/views/BlockCourtHandles.tsx'
import { sampleProject } from '../../../../state/sample.ts'
import { shapedSite, slab } from '../../../../modules/docks/__tests__/shapedCourtFixture.ts'
import { actions } from '../../../../state/actions/index.ts'
import { emptyHistory } from '../../../../state/history.ts'
import { NO_SELECTION, useApp } from '../../../../state/store.ts'
import { resetTyped } from '../../../editing/dimension/typed.ts'
import { useCourtPick } from '../../../editing/shape/shapeState.ts'
import { commandForKey, keysOf } from '../../../commands/shortcuts.ts'
import { useLayerView } from '../../../layers/layerView.ts'
import { useToast } from '../../../layout/toast.ts'
import { useUi } from '../../../layout/ui.ts'
import { letGo } from '../../../tools/hand.ts'
import { fit, UNMEASURED_SIZE } from '../../camera.ts'
import { useCommand } from '../../command/commandState.ts'
import { contentBounds } from '../../PlanSvg.tsx'
import { DEFAULT_SNAP } from '../../snap/kinds.ts'
import { useSnapSettings } from '../../snap/settings.ts'
import { planPointer, useTool } from '../toolState.ts'

vi.mock('../../../scene/Scene.tsx', () => ({ Scene: () => <div data-testid="scene" /> }))
vi.mock('../../../../modules/warehouse/views/WarehouseScene.tsx', () => ({ WarehouseScene: () => <div data-testid="warehouse-scene" /> }))

const s = () => useApp.getState()
const key = (k: string, extra: object = {}) => fireEvent.keyDown(window, { key: k, ...extra })
const capture = () => document.querySelector('[data-capture]')!
const toast = () => useToast.getState().toast?.text

let at = (q: Point): object => ({ ...q })
function camera() {
  const v = fit(contentBounds(derive(s().project, s().option)), UNMEASURED_SIZE)
  at = (q) => ({ clientX: (q.x - v.cx) * v.scale + UNMEASURED_SIZE.w / 2, clientY: UNMEASURED_SIZE.h / 2 - (q.y - v.cy) * v.scale, button: 0, pointerId: 1 })
}
const click = (q: Point) => {
  fireEvent.pointerDown(capture(), at(q))
  fireEvent.pointerUp(capture(), at(q))
}
const typeInLine = (text: string) => {
  const line = screen.getByRole('textbox', { name: 'Command line' })
  fireEvent.change(line, { target: { value: text } })
  fireEvent.keyDown(line, { key: 'Enter' })
}

/** A block with one court across its front wall, 36 m wide and 12 m deep. */
function load() {
  const site = shapedSite([{ edge: 'e1', id: 'c1', shape: slab(0, 36, 12) }])
  useApp.setState({ project: site.p, derived: derive(site.p, site.optionId), history: emptyHistory(), dragStart: null, selection: NO_SELECTION, option: site.optionId, level: site.building.levels[0].id, showAll: false })
  return site
}
const ownCourts = (buildingId: string) => s().project.buildings.find((b) => b.id === buildingId)!.warehouse!.overrides?.courts

/** The court's box on the plan: where the lines cross it. */
function box(hall: string) {
  const read = actions.shapeOf(s().project, { kind: 'block-court', id: `${hall}/e1` })!
  const xs = read.contour.vertices.map((v) => v.x)
  const ys = read.contour.vertices.map((v) => v.y)
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) }
}

beforeEach(() => {
  localStorage.clear()
  useUi.setState({ dialog: null, view: 'plan', rail: 'layers', panels: { left: true, right: true }, sheet: null, help: true })
  letGo()
  useSnapSettings.setState({ settings: { ...DEFAULT_SNAP, on: false } })
  useCommand.setState({ registration: null, angle: null, cursor: null })
  resetTyped()
  useToast.setState({ toast: null, confirmation: null })
  useCourtPick.setState({ pick: null })
  planPointer.point = null
})

describe('the Split tool on the site', () => {
  it('S takes it, in the Massing group beside Chamfer; the Rules window’s Solve keeps its S', () => {
    load()
    render(<App />)
    key('S')
    expect(useTool.getState().tool).toBe('split')
    expect(keysOf('tool.split')).toEqual(['S'])
    expect(commandForKey('S', 'rules')?.id).toBe('rules.solve')
    expect(commandForKey('S', 'project')?.id).toBe('tool.split')
    const strip = screen.getByRole('button', { name: /^Split/ })
    expect(strip.compareDocumentPosition(screen.getByRole('button', { name: /^Chamfer/ })) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy()
    expect(strip).toHaveAttribute('aria-pressed', 'true')
  })

  it('two clicks across a court make two courts: the copy’s own, one undo step, the type unchanged', () => {
    const site = load()
    render(<App />)
    camera()
    key('S')
    const b = box(site.hall.id)
    const cx = (b.x0 + b.x1) / 2
    const types = JSON.stringify(s().project.warehouseTypes)
    const before = s().history.past.length
    click({ x: cx, y: b.y0 - 4 })
    expect(s().history.past.length).toBe(before)
    click({ x: cx, y: b.y1 + 4 })
    expect(ownCourts(site.building.id)).toHaveLength(2)
    expect(s().history.past.length).toBe(before + 1)
    expect(JSON.stringify(s().project.warehouseTypes)).toBe(types)
    expect(useTool.getState().tool).toBe('split')
    act(() => s().undo())
    expect(ownCourts(site.building.id)?.length ?? 0).toBe(0)
  })

  it('the second point can be typed: @0,40 from the first', () => {
    const site = load()
    render(<App />)
    camera()
    key('S')
    const b = box(site.hall.id)
    const cx = (b.x0 + b.x1) / 2
    click({ x: cx, y: b.y0 - 4 })
    typeInLine(`@0,${b.y1 - b.y0 + 8}`)
    expect(ownCourts(site.building.id)).toHaveLength(2)
  })

  it('after a typed point the empty command line lets Ctrl+Z and Ctrl+Y through: undo and redo', () => {
    const site = load()
    render(<App />)
    camera()
    key('S')
    const b = box(site.hall.id)
    click({ x: (b.x0 + b.x1) / 2, y: b.y0 - 4 })
    typeInLine(`@0,${b.y1 - b.y0 + 8}`)
    expect(ownCourts(site.building.id)).toHaveLength(2)
    const line = screen.getByRole('textbox', { name: 'Command line' })
    line.focus()
    fireEvent.keyDown(line, { key: 'z', ctrlKey: true })
    expect(ownCourts(site.building.id)?.length ?? 0).toBe(0)
    fireEvent.keyDown(line, { key: 'y', ctrlKey: true })
    expect(ownCourts(site.building.id)).toHaveLength(2)
    // typed text in the field keeps the field's own Ctrl+Z
    fireEvent.change(line, { target: { value: '12' } })
    fireEvent.keyDown(line, { key: 'z', ctrlKey: true })
    expect(ownCourts(site.building.id)).toHaveLength(2)
  })

  it('a line across nothing says that Split takes a truck court for now, and writes nothing', () => {
    const site = load()
    render(<App />)
    camera()
    key('S')
    const before = s().history.past.length
    click({ x: 5, y: 5 })
    click({ x: 25, y: 5 })
    expect(toast()).toBe('Split takes a truck court for now')
    expect(s().history.past.length).toBe(before)
    expect(ownCourts(site.building.id)).toBeUndefined()
  })

  it('a line across the block itself says the same', () => {
    const site = load()
    render(<App />)
    camera()
    key('S')
    click({ x: 330 - 10, y: 225 + 2 })
    click({ x: 330 + 10, y: 225 + 2 })
    expect(toast()).toBe('Split takes a truck court for now')
    expect(site.hall.id).toBeTruthy()
  })

  it('a line along the wall leaves the near piece; the toast says the far one went', () => {
    const site = load()
    render(<App />)
    camera()
    key('S')
    const b = box(site.hall.id)
    const mid = (b.y0 + b.y1) / 2
    click({ x: b.x0 - 3, y: mid })
    click({ x: b.x1 + 3, y: mid })
    const own = ownCourts(site.building.id)
    expect(own).toHaveLength(1)
    expect(toast()).toMatch(/off the wall went/)
  })

  it('Escape at the first point lets the tool go; a second point on the first is ignored', () => {
    load()
    render(<App />)
    camera()
    key('S')
    click({ x: 5, y: 5 })
    click({ x: 5, y: 5 })
    expect(useTool.getState().tool).toBe('split')
    key('Escape')
    key('Escape')
    expect(useTool.getState().tool).toBe('select')
  })
})

describe('the Split tool leaves a hidden building alone (review N2)', () => {
  it('a block whose eye is off is not cut by a line across its court', () => {
    const site = load()
    render(<App />)
    camera()
    act(() => useLayerView.getState().setHidden([`mass:${site.hall.id}`], true))
    key('S')
    const b = box(site.hall.id)
    const cx = (b.x0 + b.x1) / 2
    const before = s().history.past.length
    click({ x: cx, y: b.y0 - 4 })
    click({ x: cx, y: b.y1 + 4 })
    expect(ownCourts(site.building.id)).toBeUndefined()
    expect(s().history.past.length).toBe(before)
    act(() => useLayerView.getState().setHidden([`mass:${site.hall.id}`], false))
  })
})

describe('the Split tool on the sample, two copies of one type', () => {
  it('a line across Cross-dock 2’s court splits that copy’s only: Cross-dock 1 and the type are as they were, and 2 shows its own courts', () => {
    const p = sampleProject()
    useApp.setState({ project: p, derived: derive(p, 'o1'), history: emptyHistory(), dragStart: null, selection: NO_SELECTION, option: 'o1', level: p.buildings.find((b) => b.id === 'b3')!.levels[0].id, showAll: false })
    render(<App />)
    camera()
    key('S')
    const hall = siteCourtRefs(p, 'b3')!.hall
    const one = JSON.stringify(siteCourtRefs(p, 'b2')!.refs.map((r) => actions.shapeOf(p, r)))
    const types = JSON.stringify(p.warehouseTypes)
    const d = s().derived.circulation.docks.find((x) => x.massId === hall.id)!
    const m = { x: (d.a.x + d.b.x) / 2, y: (d.a.y + d.b.y) / 2 }
    click({ x: m.x - d.out.x, y: m.y - d.out.y })
    click({ x: m.x + d.out.x * (d.depth + 5), y: m.y + d.out.y * (d.depth + 5) })
    expect(ownCourts('b3')).toBeDefined()
    expect(ownCourts('b2')).toBeUndefined()
    expect(JSON.stringify(s().project.warehouseTypes)).toBe(types)
    expect(JSON.stringify(siteCourtRefs(s().project, 'b2')!.refs.map((r) => actions.shapeOf(s().project, r)))).toBe(one)
    expect(s().project.buildings.find((b) => b.id === 'b3')!.warehouse!.overrides?.courts?.length).toBeGreaterThan(1)
  })
})
