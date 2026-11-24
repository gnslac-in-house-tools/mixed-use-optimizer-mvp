// Draw makes a block (Phase D.2 task 7; Decision "Draw makes a block"), through the app: a drag or a polygon on the site is the outer face
// of a block of the ▾'s program, selected, one undo step; the ▾ lists the programs (▦ before one with its type), *No program* and
// *＋ New block…*; a blank project draws blocks without docks; the Hole tool cuts a placed block's own hole; the Union joins blocks of one type.
// jsdom has no layout: the plan uses UNMEASURED_SIZE and `at` turns world metres into screen pixels.
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Point, Project } from '../../../../model/schema.ts'
import { App } from '../../../../App.tsx'
import { derive } from '../../../../engine/derive.ts'
import { footprintContour } from '../../../../engine/geom/footprint.ts'
import { actions } from '../../../../state/actions/index.ts'
import { demoProject } from '../../../../state/demo.ts'
import { emptyHistory } from '../../../../state/history.ts'
import { NO_SELECTION, useApp } from '../../../../state/store.ts'
import { newProject } from '../../../../typologies/index.ts'
import { mergeRefusal } from '../../massCommands.ts'
import { useToast } from '../../../layout/toast.ts'
import { useUi } from '../../../layout/ui.ts'
import { fit, UNMEASURED_SIZE } from '../../camera.ts'
import { DEFAULT_SNAP } from '../../snap/kinds.ts'
import { useSnapSettings } from '../../snap/settings.ts'
import { useMassProgram, useTool } from '../toolState.ts'
import { letGo } from '../../../tools/hand.ts'

vi.mock('../../../scene/Scene.tsx', () => ({ Scene: () => <div data-testid="scene" /> }))

const v = fit({ minX: 0, minY: -15, maxX: 440, maxY: 280 }, UNMEASURED_SIZE)
const at = (q: Point, extra: object = {}) => ({
  clientX: (q.x - v.cx) * v.scale + UNMEASURED_SIZE.w / 2,
  clientY: UNMEASURED_SIZE.h / 2 - (q.y - v.cy) * v.scale,
  button: 0,
  pointerId: 1,
  ...extra,
})
const capture = () => document.querySelector('[data-capture]')!
const click = (q: Point) => {
  fireEvent.pointerDown(capture(), at(q))
  fireEvent.pointerUp(capture(), at(q))
}
const drag = (a: Point, b: Point) => {
  fireEvent.pointerDown(capture(), at(a))
  fireEvent.pointerMove(capture(), at({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }))
  fireEvent.pointerMove(capture(), at(b))
  fireEvent.pointerUp(capture(), at(b))
}
const key = (k: string, extra: object = {}) => fireEvent.keyDown(window, { key: k, ...extra })
const s = () => useApp.getState()
const open = (p: Project) => act(() => useApp.getState().open(p))
const hallOf = (p: Project, id: string) => p.masses.find((m) => m.id === id)!
const buildingOf = (p: Project, massId: string) => p.buildings.find((b) => b.levels.some((l) => l.id === hallOf(p, massId).levelId))!
/** The program Draw makes, in the Massing group's ▾ of the Tools strip: opened when it is not. */
const pick = () => {
  if (!screen.queryByRole('dialog', { name: 'Draw makes' })) fireEvent.click(within(screen.getByRole('toolbar', { name: 'Tools' })).getByRole('button', { name: 'Massing options' }))
  return screen.getByRole('combobox', { name: 'New block’s program' })
}

beforeEach(() => {
  localStorage.clear()
  const p = demoProject()
  useApp.setState({ project: p, derived: derive(p), history: emptyHistory(), dragStart: null, selection: NO_SELECTION, level: 'l1', showAll: false, option: 'o1' })
  useUi.setState({ dialog: null, view: 'plan', rail: 'layers', panels: { left: true, right: true }, sheet: null, help: true })
  letGo()
  useMassProgram.setState({ programId: undefined })
  useSnapSettings.setState({ settings: { ...DEFAULT_SNAP, on: false, grid: false } })
  useToast.setState({ toast: null, confirmation: null })
})

describe('Draw makes a block', () => {
  it('a drag is a block of the ▾’s program (its type made on the first stroke), selected, one undo step, the tool back to Select', () => {
    render(<App />)
    key('b')
    const before = s().project
    drag({ x: 270, y: 20 }, { x: 330, y: 50 })
    const after = s().project
    const hall = after.masses.find((m) => m.part === 'hall' && !before.masses.some((x) => x.id === m.id))!
    expect(hall).toBeDefined()
    // the brief's first program, its type made then; the stroke is the block's outer face
    expect(hall.programId).toBe(before.programs[0].id)
    expect(hall.footprint).toMatchObject({ kind: 'rect', center: { x: 300, y: 35 }, width: 60, depth: 30, rotation: 0 })
    expect(after.warehouseTypes!.find((t) => t.program === before.programs[0].id)).toBeDefined()
    // a building of its own, the block the type itself
    expect(buildingOf(after, hall.id).warehouse!.overrides).toBeUndefined()
    expect(after.buildings).toHaveLength(before.buildings.length + 1)
    expect(s().selection.massId).toBe(hall.id)
    expect(s().level).toBe(hall.levelId)
    expect(useTool.getState().tool).toBe('select')
    expect(s().history.past).toHaveLength(1)
    // one undo takes the building, the type and the block back
    act(() => s().undo())
    expect(s().project).toMatchObject({ masses: before.masses, buildings: before.buildings, programs: before.programs })
    expect(s().project.warehouseTypes).toBeUndefined()
  })

  it('clicks make a polygon, Enter closes it into a block with a free outline', () => {
    render(<App />)
    key('b')
    for (const q of [{ x: 280, y: 25 }, { x: 330, y: 25 }, { x: 320, y: 55 }, { x: 290, y: 55 }]) click(q)
    key('Enter')
    const hall = s().project.masses.at(-1)!
    expect(hall.part).toBe('hall')
    expect(hall.footprint.kind).toBe('contour')
    expect(footprintContour(hall.footprint).vertices).toHaveLength(4)
    expect(s().selection.massId).toBe(hall.id)
  })

  it('the second stroke of a program is a variant of its type', () => {
    render(<App />)
    key('b')
    drag({ x: 270, y: 20 }, { x: 330, y: 50 })
    act(() => void key('b'))
    drag({ x: 100, y: 200 }, { x: 140, y: 230 })
    const hall = s().project.masses.at(-1)!
    const b = buildingOf(s().project, hall.id)
    expect(b.warehouse!.overrides).toBeDefined()
    expect(s().project.warehouseTypes).toHaveLength(1)
  })

  it('a stroke too small for its walls says so and makes nothing', () => {
    render(<App />)
    key('b')
    const before = s().project
    const line = screen.getByRole('textbox', { name: 'Command line' })
    for (const typed of ['270,20', '0.5,0', '0,0.5']) {
      fireEvent.change(line, { target: { value: typed } })
      fireEvent.keyDown(line, { key: 'Enter' })
    }
    fireEvent.keyDown(line, { key: 'Enter' })
    expect(s().project).toBe(before)
    expect(useToast.getState().toast?.text).toMatch(/too small/)
  })

  it('the command line’s 60x30 makes the block too', () => {
    render(<App />)
    key('b')
    const line = screen.getByRole('textbox', { name: 'Command line' })
    fireEvent.change(line, { target: { value: '270,20' } })
    fireEvent.keyDown(line, { key: 'Enter' })
    fireEvent.change(line, { target: { value: '60x30' } })
    fireEvent.keyDown(line, { key: 'Enter' })
    expect(s().project.masses.at(-1)).toMatchObject({ part: 'hall', footprint: { kind: 'rect', width: 60, depth: 30 } })
  })
})

describe('the ▾: Draw makes', () => {
  it('lists the programs (▦ before one with its type), No program and ＋ New block…', () => {
    const made = actions.addWarehouseType(demoProject(), { program: 'office', keepKind: true })
    open(made.project)
    render(<App />)
    expect(within(pick()).getAllByRole('option').map((o) => o.textContent)).toEqual(['No program', 'Warehouse', '▦ Office', 'Guard house', 'Outdoor storage', '＋ New block…'])
  })

  it('a program picked takes Draw; its stroke is a block of it; No program makes the shared Block', () => {
    render(<App />)
    fireEvent.change(pick(), { target: { value: 'office' } })
    expect(useTool.getState().tool).toBe('mass')
    drag({ x: 270, y: 20 }, { x: 330, y: 50 })
    expect(s().project.masses.at(-1)).toMatchObject({ programId: 'office', part: 'hall' })
    fireEvent.change(pick(), { target: { value: '' } })
    drag({ x: 100, y: 200 }, { x: 140, y: 230 })
    expect(s().project.masses.at(-1)).toMatchObject({ programId: null, part: 'hall' })
    expect(s().project.warehouseTypes!.map((t) => t.name)).toEqual(['Office', 'Block'])
  })

  it('a program with its type is drawn free: the stroke is the block’s outline, no drag in whole modules', () => {
    const made = actions.addWarehouseType(demoProject(), { program: 'warehouse' })
    open(made.project)
    render(<App />)
    fireEvent.change(pick(), { target: { value: 'warehouse' } })
    expect(document.querySelector('[data-tool="warehouse"]')).toBeNull()
    expect(document.querySelector('[data-tool="mass"]')).not.toBeNull()
    drag({ x: 270, y: 20 }, { x: 333.7, y: 51.3 })
    const hall = s().project.masses.at(-1)!
    // 63.7 × 31.3 m, as drawn
    expect(hall.footprint).toMatchObject({ kind: 'rect', width: 63.7, depth: 31.3 })
    expect(buildingOf(s().project, hall.id).warehouse).toMatchObject({ type: made.id, overrides: { elements: [] } })
  })

  it('＋ New block… begins a type in the Program window', () => {
    render(<App />)
    fireEvent.change(pick(), { target: { value: 'new-program' } })
    expect(useUi.getState().dialog).toBe('program')
  })
})

describe('a blank project', () => {
  it('offers the warehouse module: it draws blocks, without docks', () => {
    open(newProject('blank'))
    render(<App />)
    key('b')
    drag({ x: 100, y: 100 }, { x: 160, y: 130 })
    const p = s().project
    const hall = p.masses.at(-1)!
    expect(hall).toMatchObject({ part: 'hall', programId: null })
    // Building 1 was taken over, not left empty
    expect(p.buildings).toHaveLength(1)
    expect(p.warehouseTypes!.map((t) => t.elements)).toEqual([[]])
    // the ▾ offers a new block; the docks stay off where the typology has none
    expect(within(pick()).getByRole('option', { name: '＋ New block…' })).toBeInTheDocument()
  })
})

describe('the Hole tool on a placed block', () => {
  it('cuts the block’s own hole: a variant, its type as it was', () => {
    render(<App />)
    key('b')
    drag({ x: 270, y: 20 }, { x: 330, y: 50 })
    const type = s().project.warehouseTypes![0]
    const hall = s().project.masses.at(-1)!
    key('h')
    drag({ x: 290, y: 30 }, { x: 310, y: 40 })
    const now = hallOf(s().project, hall.id)
    expect(now.holes).toHaveLength(1)
    expect(buildingOf(s().project, hall.id).warehouse!.overrides!.morphology!.holes).toHaveLength(1)
    expect(s().project.warehouseTypes![0]).toEqual(type)
  })

  it('the stroke is the cut as it is seen, the court’s face: its box is the stroke’s (the wall grows out from the reference line)', () => {
    render(<App />)
    key('b')
    drag({ x: 270, y: 20 }, { x: 330, y: 50 })
    const hall = s().project.masses.at(-1)!
    key('h')
    drag({ x: 290, y: 30 }, { x: 310, y: 40 })
    const hole = hallOf(s().project, hall.id).holes![0]
    const xs = hole.vertices.map((q) => q.x)
    const ys = hole.vertices.map((q) => q.y)
    expect([Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)].map((n) => Math.round(n * 100) / 100)).toEqual([290, 30, 310, 40])
  })

  it('what the stroke shows is what it cuts, the snap on or off: the preview’s rectangle is the written cut’s box (Phase D.3, task 1: the “5 px larger” of Chrome)', () => {
    const box = (pts: Point[]) => [Math.min(...pts.map((q) => q.x)), Math.min(...pts.map((q) => q.y)), Math.max(...pts.map((q) => q.x)), Math.max(...pts.map((q) => q.y))].map((n) => Math.round(n * 1000) / 1000)
    for (const on of [false, true]) {
      useSnapSettings.setState({ settings: { ...DEFAULT_SNAP, on, grid: false } })
      const p = demoProject()
      act(() => useApp.getState().open(p))
      const { unmount } = render(<App />)
      key('b')
      drag({ x: 270, y: 20 }, { x: 330, y: 50 })
      const hall = s().project.masses.at(-1)!
      key('h')
      fireEvent.pointerDown(capture(), at({ x: 291.37, y: 30.61 }))
      fireEvent.pointerMove(capture(), at({ x: 300, y: 35 }))
      fireEvent.pointerMove(capture(), at({ x: 308.93, y: 40.29 }))
      const shown = document.querySelector('[data-tool="hole"] polygon')!.getAttribute('points')!.split(' ').map((t) => {
        const [x, y] = t.split(',').map(Number)
        return { x, y: -y }
      })
      fireEvent.pointerUp(capture(), at({ x: 308.93, y: 40.29 }))
      const hole = hallOf(s().project, hall.id).holes![0]
      expect(box(hole.vertices), `snap ${on}`).toEqual(box(shown))
      unmount()
    }
  })

  it('a stroke that crosses the block’s wall cuts nothing and says why', () => {
    render(<App />)
    key('b')
    drag({ x: 270, y: 20 }, { x: 330, y: 50 })
    const hall = s().project.masses.at(-1)!
    const before = s().project
    key('h')
    act(() => s().select(hall.id))
    useToast.setState({ toast: null })
    drag({ x: 320, y: 30 }, { x: 345, y: 40 })
    expect(s().project).toBe(before)
    expect(useToast.getState().toast?.text).toBe('A hole must stay inside its block, apart from the other holes')
  })
})

describe('the Union of blocks', () => {
  it('two blocks of one type join; of two types the menu says why not', () => {
    const one = actions.drawBlock(demoProject(), { programId: 'office', footprint: { kind: 'rect', center: { x: 300, y: 200 }, width: 40, depth: 20, rotation: 0 }, optionId: 'o1' })!
    const two = actions.drawBlock(one.project, { programId: 'office', footprint: { kind: 'rect', center: { x: 340, y: 200 }, width: 40, depth: 20, rotation: 0 }, optionId: 'o1' })!
    open(two.project)
    render(<App />)
    act(() => s().selectMany([one.id, two.id]))
    expect(mergeRefusal()).toBeNull()
    key('u')
    const merged = hallOf(s().project, one.id)
    expect(s().project.masses.some((m) => m.id === two.id)).toBe(false)
    expect(merged.footprint).toMatchObject({ kind: 'rect', width: 80, depth: 20 })
    expect(s().selection.massId).toBe(one.id)

    const other = actions.drawBlock(one.project, { programId: 'warehouse', footprint: { kind: 'rect', center: { x: 340, y: 200 }, width: 40, depth: 20, rotation: 0 }, optionId: 'o1' })!
    open(other.project)
    act(() => s().selectMany([one.id, other.id]))
    expect(mergeRefusal()).toBe('Blocks of different types do not join: give them one type first')
  })
})
