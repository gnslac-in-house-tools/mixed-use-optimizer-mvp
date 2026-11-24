// Phase DM.3 (Decision "Drawing pick"): an imported drawing picked on the plan by a click on its lines (the plain
// pointer, on what the design did not take), Shift+click into the mixed selection, a locked layer of a separated
// drawing refused; Move and Rotate then carry it, its own lines not attracting it; Delete and Copy leave it, saying so.
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Point, Project, SiteDrawing } from '../../../../model/schema.ts'
import { App } from '../../../../App.tsx'
import { contourFromPolygon } from '../../../../engine/geom/contour.ts'
import { derive } from '../../../../engine/derive.ts'
import { LOCKED, NOT_COPIED } from '../../../../model/picked.ts'
import { demoProject } from '../../../../state/demo.ts'
import { emptyHistory } from '../../../../state/history.ts'
import { NO_SELECTION, useApp } from '../../../../state/store.ts'
import { useUi } from '../../../layout/ui.ts'
import { useToast } from '../../../layout/toast.ts'
import { handleKey } from '../../../useShortcuts.ts'
import { useAccess } from '../../access/accessState.ts'
import { fit, UNMEASURED_SIZE } from '../../camera.ts'
import { useRoads } from '../../circulation/roadState.ts'
import { useClipboard } from '../../clipboard.ts'
import { useCommand } from '../../command/commandState.ts'
import { DRAWING_STAYS, pickOnPlan } from '../../massCommands.ts'
import { addToMix, pickedNow } from '../../mix.ts'
import { leaf, planMenu } from '../../../editing/menu/__tests__/helpers.ts'
import { DEFAULT_SNAP } from '../../snap/kinds.ts'
import { useSnapSettings } from '../../snap/settings.ts'
import { useDimensions, useTool } from '../../tools/toolState.ts'
import { targetsWithout } from '../../tools/standingPreview.ts'
import { drawingAt, keysOf, partsShown, useDrawingPick } from '../drawingPick.ts'
import { drawingLayer as layerKey, parcel as parcelKey } from '../../../layers/keys.ts'
import { letGo, take } from '../../../tools/hand.ts'

vi.mock('../../../scene/Scene.tsx', () => ({ Scene: () => <div data-testid="scene" /> }))

const FILE = 'a.dxf'
/** Walls: a line on empty ground north of the office; Edge: along Warehouse 1's north wall (y 150, x 40–200). */
const drawing = (extra: Partial<SiteDrawing> = {}, walls: object = {}): SiteDrawing => ({
  file: FILE,
  layers: [
    { name: 'Walls', lines: [{ points: [{ x: 180, y: 235 }, { x: 260, y: 235 }] }], ...walls },
    { name: 'Edge', lines: [{ points: [{ x: 40, y: 150 }, { x: 200, y: 150 }] }] },
  ],
  ...extra,
})
/** A parcel of the file (a 20 m square at x 300–320, y 200–220) and one of an older project, with no file. */
const parcels = (unlocked = false) => [
  { name: 'P1', file: FILE, contour: contourFromPolygon([{ x: 300, y: 200 }, { x: 320, y: 200 }, { x: 320, y: 220 }, { x: 300, y: 220 }]), ...(unlocked && { unlocked: true }) },
  { name: 'Old', contour: contourFromPolygon([{ x: 60, y: 200 }, { x: 80, y: 200 }, { x: 80, y: 220 }, { x: 60, y: 220 }]) },
]
const withDrawing = (d: SiteDrawing = drawing(), unlocked = false): Project => {
  const p = demoProject()
  return { ...p, site: { ...p.site, drawings: [d], parcels: parcels(unlocked) } }
}

describe('drawingAt', () => {
  it('a point 0.2 m off a line within a reach of 0.5 m picks the whole drawing; 0.8 m off, nothing', () => {
    const p = withDrawing()
    expect(drawingAt(p, { x: 200, y: 235.2 }, 0.5, [])).toEqual({ part: { file: FILE } })
    expect(drawingAt(p, { x: 200, y: 235.8 }, 0.5, [])).toBeNull()
  })

  it('on a split drawing, the layer; its layer locked, refused', () => {
    expect(drawingAt(withDrawing(drawing({ split: true })), { x: 200, y: 235.2 }, 0.5, [])).toEqual({ part: { file: FILE, layer: 'Walls' } })
    expect(drawingAt(withDrawing(drawing({ split: true }, { locked: true })), { x: 200, y: 235.2 }, 0.5, [])).toEqual({ locked: { file: FILE, layer: 'Walls' } })
    // on a whole drawing a locked layer still picks it (the move then says it stayed)
    expect(drawingAt(withDrawing(drawing({}, { locked: true })), { x: 200, y: 235.2 }, 0.5, [])).toEqual({ part: { file: FILE } })
  })

  it('a locked line and an unlocked one as near, on a separated drawing: the unlocked one is picked; a locked one nearer still refuses', () => {
    const same = [{ points: [{ x: 180, y: 235 }, { x: 260, y: 235 }] }]
    const lot = { name: 'Lot', lines: same }
    // the locked layer first, then the other way round
    const lockedFirst: SiteDrawing = { file: FILE, split: true, layers: [{ name: 'Walls', locked: true, lines: same }, lot] }
    expect(drawingAt(withDrawing(lockedFirst), { x: 200, y: 235.2 }, 0.5, [])).toEqual({ part: { file: FILE, layer: 'Lot' } })
    const lockedLast: SiteDrawing = { ...lockedFirst, layers: [lot, { name: 'Walls', locked: true, lines: same }] }
    expect(drawingAt(withDrawing(lockedLast), { x: 200, y: 235.2 }, 0.5, [])).toEqual({ part: { file: FILE, layer: 'Lot' } })
    const nearer: SiteDrawing = { ...lockedFirst, layers: [{ name: 'Walls', locked: true, lines: same }, { name: 'Lot', lines: [{ points: [{ x: 180, y: 235.3 }, { x: 260, y: 235.3 }] }] }] }
    expect(drawingAt(withDrawing(nearer), { x: 200, y: 235 }, 0.5, [])).toEqual({ locked: { file: FILE, layer: 'Walls' } })
    // a parcel's locked edge under an unlocked layer's line
    const onEdge: SiteDrawing = { file: FILE, split: true, layers: [{ name: 'Lot', lines: [{ points: [{ x: 300, y: 200 }, { x: 320, y: 200 }] }] }] }
    expect(drawingAt(withDrawing(onEdge), { x: 310, y: 200.1 }, 0.5, [])).toEqual({ part: { file: FILE, layer: 'Lot' } })
  })

  it('a hidden layer is not hit', () => {
    expect(drawingAt(withDrawing(), { x: 200, y: 235.2 }, 0.5, [layerKey(FILE, 'Walls')])).toBeNull()
  })

  it('a parcel’s edge hits its drawing whole, or its Parcels when split; a parcel with no file never', () => {
    const on = { x: 310, y: 200.1 }
    expect(drawingAt(withDrawing(), on, 0.5, [])).toEqual({ part: { file: FILE } })
    expect(drawingAt(withDrawing(drawing({ split: true }), true), on, 0.5, [])).toEqual({ part: { file: FILE, parcels: true } })
    // locked at first
    expect(drawingAt(withDrawing(drawing({ split: true })), on, 0.5, [])).toEqual({ locked: { file: FILE, parcels: true } })
    expect(drawingAt(withDrawing(), { x: 70, y: 200.1 }, 0.5, [])).toBeNull()
    expect(drawingAt(withDrawing(), on, 0.5, [parcelKey('P1', FILE)])).toBeNull()
  })
})

describe('partsShown and keysOf', () => {
  it('a whole drawing with nothing hidden stays whole; with a layer hidden, its layers shown and its parcels', () => {
    const p = withDrawing()
    expect(partsShown(p, { file: FILE }, [])).toEqual([{ file: FILE }])
    expect(partsShown(p, { file: FILE }, [layerKey(FILE, 'Edge')])).toEqual([{ file: FILE, layer: 'Walls' }, { file: FILE, parcels: true }])
    expect(partsShown(p, { file: FILE }, [layerKey(FILE, 'Edge'), parcelKey('P1', FILE)])).toEqual([{ file: FILE, layer: 'Walls' }])
    expect(partsShown(p, { file: FILE, layer: 'Edge' }, [layerKey(FILE, 'Edge')])).toEqual([])
    expect(partsShown(p, { file: FILE, layer: 'Edge' }, [])).toEqual([{ file: FILE, layer: 'Edge' }])
    expect(partsShown(p, { file: FILE, parcels: true }, [parcelKey('P1', FILE)])).toEqual([])
  })

  it('keysOf: what the parts carry, a whole drawing’s unlocked layers and its parcels while unlocked; a locked one stays out', () => {
    const p = withDrawing()
    // its parcels locked (at first): they stay
    expect(keysOf(p.site, [{ file: FILE }])).toEqual([layerKey(FILE, 'Walls'), layerKey(FILE, 'Edge')])
    expect(keysOf(p.site, [{ file: FILE, parcels: true }])).toEqual([])
    expect(keysOf(p.site, [{ file: FILE, layer: 'Edge' }])).toEqual([layerKey(FILE, 'Edge')])
    const unlocked = withDrawing(drawing({}, { locked: true }), true)
    expect(keysOf(unlocked.site, [{ file: FILE }])).toEqual([layerKey(FILE, 'Edge'), parcelKey('P1', FILE)])
    expect(keysOf(unlocked.site, [{ file: FILE, parcels: true }])).toEqual([parcelKey('P1', FILE)])
    expect(keysOf(unlocked.site, [{ file: FILE, layer: 'Walls' }])).toEqual([])
  })
})

// the demo's site and its 15 m south street, as the plan fits it
const v = fit({ minX: 0, minY: -15, maxX: 440, maxY: 280 }, UNMEASURED_SIZE)
const at = (q: Point, extra: object = {}) => ({
  clientX: (q.x - v.cx) * v.scale + UNMEASURED_SIZE.w / 2,
  clientY: UNMEASURED_SIZE.h / 2 - (q.y - v.cy) * v.scale,
  button: 0,
  pointerId: 1,
  ...extra,
})
const plan = () => screen.getByRole('img', { name: 'Site plan' })
const press = (el: Element, q: Point, extra: object = {}) => {
  fireEvent.pointerDown(el, at(q, extra))
  fireEvent.pointerUp(el, at(q, extra))
}
const capture = () => document.querySelector('[data-tool] > [data-capture]')!
const click = (q: Point, extra: object = {}) => {
  fireEvent.pointerMove(capture(), at(q, extra))
  fireEvent.pointerDown(capture(), at(q, extra))
  fireEvent.pointerUp(capture(), at(q, extra))
}
const key = (k: string, extra: object = {}) => ({ key: k, ctrlKey: false, metaKey: false, shiftKey: false, repeat: false, target: document.body, preventDefault() {}, ...extra }) as unknown as KeyboardEvent
/** The toast listeners of this test, taken away after it. */
const listening: (() => void)[] = []
afterEach(() => listening.splice(0).forEach((stop) => stop()))
/** Every notice shown from now on, in order. */
function toldFromNow(): string[] {
  const told: string[] = []
  listening.push(
    useToast.subscribe((s, before) => {
      if (s.toast && s.toast.id !== before.toast?.id) told.push(s.toast.text)
    }),
  )
  return told
}
const load = (p: Project) => useApp.setState({ project: p, derived: derive(p), history: emptyHistory(), dragStart: null, selection: NO_SELECTION, level: 'l1', showAll: false, option: 'o1' })

beforeEach(() => {
  localStorage.clear()
  load(withDrawing())
  useUi.setState({ dialog: null, view: 'plan', rail: 'layers', panels: { left: true, right: true }, sheet: null, help: true })
  letGo()
  useDimensions.setState({ selected: null, also: [] })
  useSnapSettings.setState({ settings: { ...DEFAULT_SNAP, grid: false } })
  useClipboard.setState({ masses: [], roads: [] })
  useCommand.setState({ registration: null, angle: null, cursor: null })
  useToast.setState({ toast: null, confirmation: null })
  letGo()
  useRoads.setState({ picked: null, also: [] })
  letGo()
  useAccess.setState({ picked: null, alsoGates: [] })
  useDrawingPick.setState({ picked: [] })
})

describe('a drawing picked on the plan', () => {
  it('a click on empty ground over its line picks it, drawn marked; on empty ground again, let go', () => {
    render(<App />)
    press(plan(), { x: 220, y: 235 })
    expect(useDrawingPick.getState().picked).toEqual([{ file: FILE }])
    expect(pickedNow().drawings).toEqual([{ file: FILE }])
    expect(document.querySelector(`[data-drawing-layer="${layerKey(FILE, 'Walls')}"]`)).toHaveAttribute('data-picked')
    // its parcels are locked (at first): they stay, so they are not marked
    expect(document.querySelector('[data-parcel="P1"] path')).not.toHaveAttribute('data-picked')
    press(plan(), { x: 220, y: 262 })
    expect(useDrawingPick.getState().picked).toEqual([])
    expect(document.querySelector(`[data-drawing-layer="${layerKey(FILE, 'Walls')}"]`)).not.toHaveAttribute('data-picked')
  })

  it('a click on a mass whose wall lies on a drawing’s line picks the mass, not the drawing', () => {
    render(<App />)
    press(document.querySelector('[data-mass="m1"]')!, { x: 120, y: 150 })
    expect(useApp.getState().selection.massIds).toEqual(['m1'])
    expect(useDrawingPick.getState().picked).toEqual([])
  })

  it('Shift+click adds it to a picked mass; a plain click on a mass then lets it go', () => {
    render(<App />)
    act(() => pickOnPlan('m1'))
    press(plan(), { x: 220, y: 235 }, { shiftKey: true })
    expect(pickedNow()).toMatchObject({ masses: ['m1'], drawings: [{ file: FILE }] })
    // a plain click on the drawing picks it alone
    press(plan(), { x: 220, y: 235 })
    expect(pickedNow()).toMatchObject({ masses: [], drawings: [{ file: FILE }] })
    press(document.querySelector('[data-mass="m3"]')!, { x: 120, y: 200 })
    expect(pickedNow()).toMatchObject({ masses: ['m3'], drawings: [] })
  })

  it('a plain click on a held mass narrows a mass and a drawing picked together to the mass', () => {
    render(<App />)
    act(() => {
      pickOnPlan('m1')
      addToMix('drawing', { file: FILE })
    })
    expect(pickedNow()).toMatchObject({ masses: ['m1'], drawings: [{ file: FILE }] })
    press(document.querySelector('[data-mass="m1"]')!, { x: 120, y: 150 })
    expect(pickedNow()).toMatchObject({ masses: ['m1'], drawings: [] })
  })

  it('a click on a locked layer of a separated drawing picks nothing and says where to unlock it', () => {
    load(withDrawing(drawing({ split: true }, { locked: true })))
    render(<App />)
    press(plan(), { x: 220, y: 235 })
    expect(useDrawingPick.getState().picked).toEqual([])
    expect(useToast.getState().toast?.text).toBe(LOCKED)
    expect(LOCKED).toBe('Locked: unlock it in Layers')
  })

  it('with a tool on, a site tool busy or in Show all, a click on its line picks nothing', () => {
    render(<App />)
    act(() => take('dimension'))
    press(plan(), { x: 220, y: 235 })
    expect(useDrawingPick.getState().picked).toEqual([])
    act(() => letGo())
    act(() => take('draw'))
    press(plan(), { x: 220, y: 235 })
    expect(useDrawingPick.getState().picked).toEqual([])
    act(() => letGo())
    act(() => useApp.setState({ showAll: true }))
    press(plan(), { x: 220, y: 235 })
    expect(useDrawingPick.getState().picked).toEqual([])
    // the plain pointer again: it picks
    act(() => useApp.setState({ showAll: false }))
    press(plan(), { x: 220, y: 235 })
    expect(useDrawingPick.getState().picked).toEqual([{ file: FILE }])
  })

  it('Shift+click on a drawing alone turns the strip’s Move, Copy and Rotate on; taken out again, off', () => {
    render(<App />)
    const bar = screen.getByRole('toolbar', { name: 'Tools' })
    const chips = () => ['Move', 'Copy', 'Rotate'].map((name) => within(bar).getByRole('button', { name }))
    for (const c of chips()) expect(c).toBeDisabled()
    press(plan(), { x: 220, y: 235 }, { shiftKey: true })
    expect(pickedNow().drawings).toEqual([{ file: FILE }])
    for (const c of chips()) expect(c).toBeEnabled()
    press(plan(), { x: 220, y: 235 }, { shiftKey: true })
    expect(pickedNow().drawings).toEqual([])
    for (const c of chips()) expect(c).toBeDisabled()
  })

  it('a drawing gone from the project is let go, the rest of the mix still picked', () => {
    const p = withDrawing()
    load({ ...p, site: { ...p.site, drawings: [...p.site.drawings!, { file: 'b.dxf', layers: [{ name: 'Trees', lines: [{ points: [{ x: 190, y: 245 }, { x: 250, y: 245 }] }] }] }] } })
    act(() => {
      pickOnPlan('m1')
      addToMix('drawing', { file: FILE })
      addToMix('drawing', { file: 'b.dxf' })
    })
    act(() => useApp.getState().apply((q) => ({ ...q, site: { ...q.site, drawings: q.site.drawings!.filter((d) => d.file !== 'b.dxf') } })))
    expect(useDrawingPick.getState().picked).toEqual([{ file: FILE }])
    expect(useApp.getState().selection.massIds).toEqual(['m1'])
  })
})

describe('a drawing moved by Move', () => {
  const walls = () => useApp.getState().project.site.drawings![0].layers[0].lines[0].points

  it('Move’s targets hold none of the moving drawing’s points; its locked layers and parcels and the other drawings’ still attract', () => {
    const p = withDrawing()
    load({ ...p, site: { ...p.site, drawings: [...p.site.drawings!, { file: 'b.dxf', layers: [{ name: 'Trees', lines: [{ points: [{ x: 190, y: 245 }, { x: 250, y: 245 }] }] }] }] } })
    const targets = targetsWithout({ picked: { ...pickedNow(), drawings: [{ file: FILE }] }, drawings: [{ file: FILE }], roads: [] })
    const near = (q: Point) => targets.points.some((t) => Math.hypot(t.p.x - q.x, t.p.y - q.y) < 1e-6)
    const labels = new Set(targets.points.map((t) => t.label))
    expect(near({ x: 180, y: 235 })).toBe(false)
    expect(near({ x: 260, y: 235 })).toBe(false)
    expect(labels.has('Walls') || labels.has('Edge')).toBe(false)
    // its parcels are locked (at first): they stay, and attract
    expect(labels.has('P1')).toBe(true)
    expect(near({ x: 190, y: 245 })).toBe(true)
    expect(labels.has('Trees')).toBe(true)
  })

  it('a locked layer of the moving drawing still attracts; its unlocked parcels do not', () => {
    load(withDrawing(drawing({}, { locked: true }), true))
    const targets = targetsWithout({ picked: { ...pickedNow(), drawings: [{ file: FILE }] }, drawings: [{ file: FILE }], roads: [] })
    const labels = new Set(targets.points.map((t) => t.label))
    expect(labels.has('Walls')).toBe(true)
    expect(labels.has('Edge') || labels.has('P1')).toBe(false)
  })

  it('a whole drawing with a locked layer moves the rest, says once that the layer stayed, and stays picked', () => {
    // its parcels unlocked: only Walls stays
    load(withDrawing(drawing({}, { locked: true }), true))
    render(<App />)
    const told = toldFromNow()
    press(plan(), { x: 40.2, y: 150 }) // Edge's west end, outside the warehouse
    expect(useDrawingPick.getState().picked).toEqual([{ file: FILE }])
    act(() => handleKey(key('m')))
    expect(useTool.getState().tool).toBe('move')
    click({ x: 40, y: 140 }, { shiftKey: true })
    click({ x: 50, y: 130 }, { shiftKey: true })
    const edge = useApp.getState().project.site.drawings![0].layers[1].lines[0].points
    expect(edge[0].x).toBeCloseTo(50, 6)
    expect(edge[0].y).toBeCloseTo(140, 6)
    expect(walls()).toEqual([{ x: 180, y: 235 }, { x: 260, y: 235 }])
    const p1 = useApp.getState().project.site.parcels![0].contour.vertices
    expect(Math.min(...p1.map((q) => q.x))).toBeCloseTo(310, 6)
    expect(Math.min(...p1.map((q) => q.y))).toBeCloseTo(190, 6)
    expect(told).toEqual(['1 layer stayed: locked'])
    expect(useTool.getState().tool).toBe('select')
    expect(useDrawingPick.getState().picked).toEqual([{ file: FILE }])
  })
})

describe('a drawing turned by Rotate', () => {
  it('picked on the plan, Rotate turns it by a typed angle about the pivot, one undo step', () => {
    render(<App />)
    press(plan(), { x: 220, y: 235 })
    const before = useApp.getState().history.past.length
    act(() => handleKey(key('r')))
    expect(useTool.getState().tool).toBe('rotate')
    click({ x: 180, y: 235 }, { shiftKey: true })
    click({ x: 260, y: 235 }, { shiftKey: true })
    const line = screen.getByRole('textbox', { name: 'Command line' })
    fireEvent.change(line, { target: { value: '90' } })
    fireEvent.keyDown(line, { key: 'Enter' })
    const [a, b] = useApp.getState().project.site.drawings![0].layers[0].lines[0].points
    expect(a.x).toBeCloseTo(180, 6)
    expect(a.y).toBeCloseTo(235, 6)
    expect(b.x).toBeCloseTo(180, 6)
    expect(b.y).toBeCloseTo(315, 6)
    expect(useApp.getState().history.past.length).toBe(before + 1)
    expect(useDrawingPick.getState().picked).toEqual([{ file: FILE }])
  })
})

describe('Delete and Copy with a drawing picked on the plan', () => {
  it('Delete leaves it and says where to remove it, once while the key is held', () => {
    render(<App />)
    press(plan(), { x: 220, y: 235 })
    const before = useApp.getState().project
    const told = toldFromNow()
    act(() => {
      handleKey(key('Delete'))
      handleKey(key('Delete', { repeat: true }))
      handleKey(key('Delete', { repeat: true }))
    })
    expect(useApp.getState().project).toBe(before)
    expect(told).toEqual([DRAWING_STAYS])
    expect(useDrawingPick.getState().picked).toEqual([{ file: FILE }])
  })

  it('the plan menu: Remove stands in Delete’s place, Copy and Duplicate are not in it (a drawing is not copied); the Delete key, Ctrl+C and Ctrl+D say so', () => {
    act(() => useDrawingPick.getState().pick({ file: FILE }))
    // a drawing file is a kind of its own: its *Remove* is the Delete row (it takes the file out of the site), Copy and Duplicate are not in its menu (a drawing is not copied)
    const items = planMenu()
    const item = (k: string) => leaf(items, k)
    expect(item('delete').disabled).toBeFalsy()
    expect(item('delete').label).toBe('Remove')
    expect(item('delete').title).toMatch(/layers out of the site/)
    expect(items.some((x) => x !== 'separator' && (x.key === 'copy' || x.key === 'duplicate'))).toBe(false)
    // the Delete key leaves the drawing where it is and says where it is removed
    const told = toldFromNow()
    const before = useApp.getState().project
    act(() => handleKey(key('Delete')))
    expect(useApp.getState().project).toBe(before)
    expect(told).toEqual([DRAWING_STAYS])
    useToast.setState({ toast: null })
    act(() => handleKey(key('c', { ctrlKey: true })))
    expect(useToast.getState().toast?.text).toBe(NOT_COPIED)
    useToast.setState({ toast: null })
    act(() => handleKey(key('d', { ctrlKey: true })))
    expect(useToast.getState().toast?.text).toBe(NOT_COPIED)
    expect(useApp.getState().project.masses).toHaveLength(before.masses.length)
    expect(useClipboard.getState().masses).toEqual([])
    expect(NOT_COPIED).toBe('Drawings are not copied')
  })

  it('Ctrl+C and Ctrl+D with masses and a drawing picked copy the masses as ever and say the drawing is not copied', () => {
    act(() => {
      pickOnPlan('m1')
      addToMix('drawing', { file: FILE })
    })
    const picked = useApp.getState().selection.massIds
    act(() => handleKey(key('c', { ctrlKey: true })))
    expect(useClipboard.getState().masses.map((m) => m.id)).toEqual(picked)
    expect(useToast.getState().toast?.text).toMatch(/^Copied .*Drawings are not copied\.$/)
    useToast.setState({ toast: null })
    const n = useApp.getState().project.masses.length
    const told = toldFromNow()
    act(() => handleKey(key('d', { ctrlKey: true })))
    expect(useApp.getState().project.masses).toHaveLength(n + picked.length)
    expect(told).toEqual([NOT_COPIED])
  })

  it('Delete with a street, or a gate, and a drawing picked removes them and says the drawing stays', () => {
    act(() => {
      useDrawingPick.getState().pick({ file: FILE })
      addToMix('road', 'street:s1')
    })
    let before = useApp.getState().project
    const told = toldFromNow()
    act(() => handleKey(key('Delete')))
    expect(useApp.getState().project).not.toBe(before)
    expect(useApp.getState().project.site.drawings).toBe(before.site.drawings)
    expect(told).toEqual([DRAWING_STAYS])
    useToast.setState({ toast: null })
    act(() => {
      useDrawingPick.getState().pick({ file: FILE })
      addToMix('gate', 'g1')
    })
    before = useApp.getState().project
    act(() => handleKey(key('Delete')))
    expect(useApp.getState().derived.circulation.gates.some((g) => g.id === 'g1')).toBe(false)
    expect(useApp.getState().project.site.drawings).toEqual(before.site.drawings)
    expect(told).toEqual([DRAWING_STAYS, DRAWING_STAYS])
  })
})
