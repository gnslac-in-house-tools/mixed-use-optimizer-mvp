// Alt+drag copies (Decision "Alt+drag copies"; the user: "for every element that can be dragged, roads, masses, the
// tree's or the rules', drag + Alt copies it") and paste in place (Decision "Paste in place": Ctrl+V where it was
// copied from, Ctrl+Shift+V at the pointer). On the plan: a mass (with its group or the selection), a road, a gate, a
// docked wall's mark; in the panels: the Layers tree's masses and buildings, the Brief window's rows, the Rules' bubbles.
// Demo masses: m1 x 40…200 y 70…150 and m2 x 250…390 y 70…150 (warehouses); m3 x 100…140 y 190…210 (office). Its
// gate g1 stands at (225, 0) on the south side.
// jsdom has no layout: the plan uses UNMEASURED_SIZE and `at` turns world metres into screen pixels.
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Mass, Point, Project } from '../../model/schema.ts'
import { App } from '../../App.tsx'
import { buildingOf } from '../../engine/buildings.ts'
import { gatesOf } from '../../engine/circulation/gates.ts'
import { derive } from '../../engine/derive.ts'
import { addBuilding, addOption, copyBuilding, makeBuildingUnique } from '../../state/actions/buildings.ts'
import { setMassDocks } from '../../state/actions/circulation.ts'
import { groupMasses } from '../../state/actions/groups.ts'
import { copyMasses, lockMasses } from '../../state/actions/masses.ts'
import { copyProgram } from '../../state/actions/programs.ts'
import { drawStreet } from '../../state/actions/streets.ts'
import { demoProject } from '../../state/demo.ts'
import { emptyHistory } from '../../state/history.ts'
import { NO_SELECTION, useApp } from '../../state/store.ts'
import { runCommand } from '../commands/index.ts'
import { useGraph } from '../graph/graphState.ts'
import { pickMenu } from './pickMenu.ts'
import { useToast } from '../layout/toast.ts'
import { useUi } from '../layout/ui.ts'
import { useAccess } from '../plan/access/accessState.ts'
import { fit, UNMEASURED_SIZE } from '../plan/camera.ts'
import { useRoads } from '../plan/circulation/roadState.ts'
import { useClipboard } from '../plan/clipboard.ts'
import { contentBounds } from '../plan/PlanSvg.tsx'
import { DEFAULT_SNAP } from '../plan/snap/kinds.ts'
import { useSnapSettings } from '../plan/snap/settings.ts'
import { planPointer } from '../plan/tools/toolState.ts'
import { letGo } from '../tools/hand.ts'

vi.mock('../scene/Scene.tsx', () => ({ Scene: () => <div data-testid="scene" /> }))

const v = fit(contentBounds(derive(demoProject())), UNMEASURED_SIZE)
const at = (q: Point, extra: object = {}) => ({
  clientX: (q.x - v.cx) * v.scale + UNMEASURED_SIZE.w / 2,
  clientY: UNMEASURED_SIZE.h / 2 - (q.y - v.cy) * v.scale,
  button: 0,
  pointerId: 1,
  ...extra,
})
const s = () => useApp.getState()
const ALT = { altKey: true }
const mass = (id: string) => document.querySelector(`[data-mass="${id}"]`)!
const massOf = (id: string) => s().project.masses.find((m) => m.id === id)!
const centre = (m: Mass) => (m.footprint.kind === 'rect' ? m.footprint.center : null)
const selected = () => [...s().selection.massIds].sort()
/** A drag on an element of the plan, from one point to another, in two steps. */
function drag(el: Element, from: Point, to: Point, extra: object = {}) {
  fireEvent.pointerDown(el, at(from, extra))
  fireEvent.pointerMove(el, at({ x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }, extra))
  fireEvent.pointerMove(el, at(to, extra))
  fireEvent.pointerUp(el, at(to, extra))
}
const key = (k: string, extra: object = {}) => fireEvent.keyDown(window, { key: k, ...extra })

function start(p: Project = demoProject(), tab: 'massing' | 'site' | 'rules' | 'flow' = 'massing') {
  // Rules is a window over the app (Decision "Brief and Rules as windows")
  const dialog = tab === 'rules' ? 'rules' : null
  useApp.setState({ project: p, derived: derive(p, 'o1'), history: emptyHistory(), dragStart: null, selection: NO_SELECTION, level: 'l1', showAll: false, option: 'o1' })
  useUi.setState({ dialog, view: 'plan', rail: 'layers', panels: { left: true, right: true }, sheet: null, help: false })
  render(<App />)
}

beforeEach(() => {
  localStorage.clear()
  useGraph.setState({ tool: 'select', graph: false, rule: null, relation: null, pinned: {} })
  letGo()
  useSnapSettings.setState({ settings: { ...DEFAULT_SNAP, on: false, grid: false } })
  useClipboard.setState({ masses: [], roads: [] })
  useRoads.setState({ picked: null })
  letGo()
  useAccess.setState({ picked: null })
  useToast.setState({ toast: null, confirmation: null })
  planPointer.point = null
})

describe('the copies, as verbs', () => {
  it('copyMasses: new ids in order, the docks kept, never locked; a group’s copies a group of their own, one member alone none', () => {
    let p = demoProject()
    p = setMassDocks(p, 'm1', [0.1])
    p = groupMasses(p, ['m1', 'm2'])!.project
    p = lockMasses(p, ['m1'], true)
    const c = copyMasses(p, p.masses.filter((m) => m.id !== 'm3'), { x: 0, y: 200 })
    expect(c.ids).toEqual(['m4', 'm5'])
    const [a, b] = c.ids.map((id) => c.project.masses.find((m) => m.id === id)!)
    expect(centre(a)).toEqual({ x: 120, y: 310 })
    expect(a.docks).toEqual([0.1])
    expect(a.locked).toBeUndefined()
    expect([a.group, b.group]).toEqual(['g2', 'g2'])
    // one member alone: no group of one
    expect(copyMasses(p, [p.masses[0]], { x: 0, y: 0 }).project.masses.at(-1)!.group).toBeUndefined()
  })

  it('copyBuilding: its own levels and masses (their groups their own), "<name> copy", the next colour, where it lands; makeBuildingUnique still names it by its option', () => {
    let p = groupMasses(demoProject(), ['m1', 'm2'])!.project
    const o2 = addOption(p)
    p = o2.project
    const c = copyBuilding(p, 'b1', o2.id)!
    const b = c.project.buildings.find((x) => x.id === c.id)!
    expect(b.name).toBe('Building 1 copy')
    expect(b.color).not.toBe(p.buildings[0].color)
    expect(c.project.options.find((o) => o.id === o2.id)!.buildingIds).toEqual([c.id])
    expect(c.project.options[0].buildingIds).toEqual(['b1'])
    const copies = c.project.masses.filter((m) => buildingOf(c.project, m).id === c.id)
    expect(copies).toHaveLength(p.masses.length)
    expect(new Set(copies.flatMap((m) => (m.group ? [m.group] : [])))).toEqual(new Set(['g2']))
    expect(copyBuilding(c.project, 'b1', o2.id, 0)!.project.buildings.at(-1)!.name).toBe('Building 1 copy 2')
    // shared, then unique: the same copy, named by its option
    const shared = { ...p, options: p.options.map((o) => (o.id === o2.id ? { ...o, buildingIds: ['b1'] } : o)) }
    const u = makeBuildingUnique(shared, 'b1', o2.id)!
    expect(u.project.buildings.at(-1)!).toMatchObject({ name: 'Building 1 · Option 2', color: p.buildings[0].color })
    expect(u.project.options.find((o) => o.id === o2.id)!.buildingIds).toEqual([u.id])
  })

  it('copyProgram: "<name> copy" after it (or where asked), the same brief in a colour of its own, no masses, no rules', () => {
    const p = demoProject()
    const c = copyProgram(p, 'office')!
    const g = c.project.programs.find((x) => x.id === c.id)!
    const office = p.programs.find((x) => x.id === 'office')!
    expect(c.project.programs.map((x) => x.id).indexOf(c.id)).toBe(p.programs.findIndex((x) => x.id === 'office') + 1)
    expect(g).toMatchObject({ name: 'Office copy', target: office.target, built: office.built })
    expect(g.color).not.toBe(office.color)
    expect(c.project.rules).toEqual(p.rules)
    expect(c.project.masses).toBe(p.masses)
    expect(copyProgram(c.project, 'office', 0)!.project.programs[0].name).toBe('Office copy 2')
  })
})

describe('Alt+drag on the plan (Decision "Alt+drag copies")', () => {
  it('a mass: a copy follows the pointer and the mass stays; the copy is the selection, one undo step; the cursor says copy', () => {
    start()
    const steps = s().history.past.length
    fireEvent.pointerDown(mass('m3'), at({ x: 120, y: 200 }, ALT))
    fireEvent.pointerMove(mass('m3'), at({ x: 120, y: 220 }, ALT))
    expect(document.querySelector('.copying')).not.toBeNull()
    fireEvent.pointerMove(mass('m3'), at({ x: 120, y: 240 }, ALT))
    fireEvent.pointerUp(mass('m3'), at({ x: 120, y: 240 }, ALT))
    expect(document.querySelector('.copying')).toBeNull()
    expect(centre(massOf('m3'))).toEqual({ x: 120, y: 200 })
    const copy = s().project.masses.at(-1)!
    expect(copy).toMatchObject({ id: 'm4', name: 'Office 2', programId: 'office' })
    expect(centre(copy)!.y).toBeCloseTo(240, 6)
    expect(selected()).toEqual(['m4'])
    expect(s().history.past).toHaveLength(steps + 1)
    act(() => s().undo())
    expect(s().project.masses).toHaveLength(3)
  })

  it('a group: its copies are a group of their own; Alt+click picks one member, which then drags alone', () => {
    start(groupMasses(demoProject(), ['m1', 'm2'])!.project)
    drag(mass('m1'), { x: 120, y: 110 }, { x: 120, y: 330 }, ALT)
    expect(s().project.masses.map((m) => [m.id, m.group])).toEqual([
      ['m1', 'g1'],
      ['m2', 'g1'],
      ['m3', undefined],
      ['m4', 'g2'],
      ['m5', 'g2'],
    ])
    expect(selected()).toEqual(['m4', 'm5'])
    expect(centre(massOf('m1'))).toEqual({ x: 120, y: 110 })
    // Alt+click: Warehouse 2 alone; dragged then, it moves alone
    act(() => s().select(null))
    fireEvent.pointerDown(mass('m2'), at({ x: 320, y: 110 }, ALT))
    fireEvent.pointerUp(mass('m2'), at({ x: 320, y: 110 }, ALT))
    expect(selected()).toEqual(['m2'])
    drag(mass('m2'), { x: 320, y: 110 }, { x: 320, y: 100 })
    expect(centre(massOf('m2'))!.y).toBeCloseTo(100, 6)
    expect(centre(massOf('m1'))).toEqual({ x: 120, y: 110 })
    // a plain press on one not selected still takes the group
    act(() => s().select(null))
    fireEvent.pointerDown(mass('m1'), at({ x: 120, y: 110 }))
    fireEvent.pointerUp(mass('m1'), at({ x: 120, y: 110 }))
    expect(selected()).toEqual(['m1', 'm2'])
  })

  it('a street (in Flow): it stays, and a copy lands where it is dropped, picked', () => {
    // the demo without its streets, and one street along y 26 (where Warehouse 1's ring ran)
    const bare = demoProject({ streets: false })
    start(drawStreet(bare, 'o1', [{ x: 29, y: 26 }, { x: 211, y: 26 }])!.project, 'flow')
    const street = () => document.querySelector('[data-road="street:s1"]')!
    // the rest of the drag reaches the window (the plan redraws its streets mid-drag)
    fireEvent.pointerDown(street(), at({ x: 120, y: 26 }, ALT))
    fireEvent.pointerMove(window, at({ x: 120, y: 22 }, ALT))
    fireEvent.pointerMove(window, at({ x: 120, y: 18 }, ALT))
    fireEvent.pointerUp(window, at({ x: 120, y: 18 }, ALT))
    // the street is not touched; the copy is another
    const streets = s().project.options[0].streets!
    expect(streets.nodes.map((q) => ({ x: Math.round(q.x * 1e6) / 1e6, y: Math.round(q.y * 1e6) / 1e6 }))).toEqual([
      { x: 29, y: 26 },
      { x: 211, y: 26 },
      { x: 29, y: 18 },
      { x: 211, y: 18 },
    ])
    expect(useRoads.getState().picked).toBe(`street:${streets.segments[1].id}`)
  })

  it('a street drawn by its left edge: the copy keeps its side (Decision "Drawing side")', () => {
    const bare = demoProject({ streets: false })
    start(drawStreet(bare, 'o1', [{ x: 29, y: 26 }, { x: 120, y: 26 }, { x: 211, y: 26 }], undefined, undefined, undefined, { side: 'left' })!.project, 'flow')
    const street = () => document.querySelector('[data-road="street:s1"]')!
    fireEvent.pointerDown(street(), at({ x: 120, y: 26 }, ALT))
    fireEvent.pointerMove(window, at({ x: 120, y: 10 }, ALT))
    fireEvent.pointerMove(window, at({ x: 120, y: -2 }, ALT))
    fireEvent.pointerUp(window, at({ x: 120, y: -2 }, ALT))
    const segments = s().project.options[0].streets!.segments
    expect(segments).toHaveLength(4)
    expect(segments.map((g) => [g.left, g.right])).toEqual([[0, 8], [0, 8], [0, 8], [0, 8]])
  })

  it('a docked wall’s mark: that wall keeps its docks and the wall it is dropped on docks too', () => {
    start()
    act(() => s().select('m1'))
    // Warehouse 1 docks south (wall 0); its mark Alt+dragged to the north wall
    const mark = document.querySelector('[data-dock-mark="0"]')!
    drag(mark, { x: 120, y: 60 }, { x: 120, y: 160 }, ALT)
    expect(s().derived.circulation.docks.filter((d) => d.massId === 'm1').map((d) => d.wall)).toEqual([0, 2])
  })

  it('a gate, in the Site step: it stays, and a copy of it lands where it is dropped, picked', () => {
    start(demoProject(), 'site')
    const handle = document.querySelector('[aria-label="Gate 1: drag it along its side"]')!
    drag(handle, { x: 225, y: 0 }, { x: 300, y: 0 }, ALT)
    const gates = gatesOf(s().project, 'o1')
    expect(gates).toHaveLength(2)
    expect(gates[0].id).toBe('g1')
    expect(s().derived.circulation.gates.map((g) => Math.round(g.at.x))).toEqual([225, 300])
    expect(gates[1]).toMatchObject({ width: gates[0].width, radius: gates[0].radius, flow: gates[0].flow })
    expect(useAccess.getState().picked).toEqual({ kind: 'gate', id: gates[1].id })
  })
})

describe('paste (Decision "Paste in place")', () => {
  it('Ctrl+V in place; Ctrl+Shift+V centred on the pointer; the menu’s Paste here where it was opened', () => {
    start()
    act(() => s().select('m3'))
    key('c', { ctrlKey: true })
    expect(useToast.getState().toast?.text).toBe('Copied “Office 1”. Ctrl+V pastes it in place, Ctrl+Shift+V at the pointer.')
    key('v', { ctrlKey: true })
    expect(centre(s().project.masses.at(-1)!)).toEqual({ x: 120, y: 200 })
    expect(selected()).toEqual(['m4'])
    planPointer.point = { x: 300.4, y: 220.6 }
    key('V', { ctrlKey: true, shiftKey: true })
    expect(centre(s().project.masses.at(-1)!)).toEqual({ x: 300, y: 221 })
    // the menu: Paste in place, Paste here where the right-click was
    fireEvent.contextMenu(screen.getByRole('img', { name: 'Site plan' }), { ...at({ x: 420, y: 250 }), button: 2 })
    const menu = screen.getByRole('menu')
    expect(within(menu).getByRole('menuitem', { name: /^Paste here/ })).toHaveAttribute('title', '1 block, centred where you right-clicked')
    fireEvent.click(within(menu).getByRole('menuitem', { name: /^Paste here/ }))
    expect(centre(s().project.masses.at(-1)!)).toEqual({ x: 420, y: 250 })
    expect(s().project.masses).toHaveLength(6)
  })

  it('a street picked: Ctrl+C keeps it; Ctrl+V in place finds it there already; Ctrl+Shift+V centred on the pointer, picked', () => {
    const p = demoProject()
    const streets = { nodes: [{ id: 'n1', x: 60, y: 161 }, { id: 'n2', x: 60, y: 231 }], segments: [{ id: 's1', a: 'n1', b: 'n2', type: 'cars', left: 3, right: 3 }] }
    start({ ...p, options: [{ ...p.options[0], streets }] })
    act(() => useRoads.getState().pick('street:s1'))
    key('c', { ctrlKey: true })
    expect(useClipboard.getState()).toMatchObject({ masses: [], roads: [{ width: 6, vehicles: 'cars', type: 'cars' }] })
    key('v', { ctrlKey: true })
    expect(s().project.options[0].streets!.segments).toHaveLength(1)
    expect(useToast.getState().toast?.text).toMatch(/there already/)
    planPointer.point = { x: 300, y: 250 }
    key('V', { ctrlKey: true, shiftKey: true })
    const after = s().project.options[0].streets!
    expect(after.nodes.slice(2).map((n) => ({ x: n.x, y: n.y }))).toEqual([{ x: 300, y: 215 }, { x: 300, y: 285 }])
    expect(after.segments.at(-1)).toMatchObject({ type: 'cars' })
    expect(useRoads.getState().picked).toBe(`street:${after.segments.at(-1)!.id}`)
  })
})

/** A drag in a panel, as the browser fires it, Alt held over the target (jsdom has no DragEvent: a mouse event of that type). */
function altDragTo(from: Element, to: Element) {
  fireEvent.dragStart(from)
  fireEvent(to, new MouseEvent('dragover', { bubbles: true, cancelable: true, altKey: true }))
  fireEvent(to, new MouseEvent('drop', { bubbles: true, cancelable: true, altKey: true }))
  fireEvent.dragEnd(from)
}

describe('Alt+drag in the panels (Decision "Alt+drag copies")', () => {
  function project() {
    const b = addBuilding(demoProject(), { optionId: 'o1' })
    const o2 = addOption(b.project)
    return { p: o2.project, b2: b.id, o2: o2.id }
  }
  const tree = () => screen.getByRole('tree', { name: 'Layers' })
  const row = (name: string) => within(tree()).getAllByRole('treeitem', { name })[0]
  const unfold = (name: string, nth = 0) => fireEvent.click(within(within(tree()).getAllByRole('treeitem', { name })[nth]).getByRole('button', { name: `Unfold ${name}` }))

  it('the Layers tree: a mass onto a building, a copy in it in place; a building onto a building, a copy of its own (the options’ rows went: Link to / Copy to are the building’s menu)', () => {
    const { p, b2 } = project()
    start(p)
    unfold('Building 1')
    unfold('L1')
    altDragTo(row('Office 1'), row('Building 2'))
    const copy = s().project.masses.at(-1)!
    expect(copy).toMatchObject({ id: 'm4', programId: 'office', footprint: massOf('m3').footprint })
    expect(buildingOf(s().project, copy).id).toBe(b2)
    expect(buildingOf(s().project, massOf('m3')).id).toBe('b1')
    expect(selected()).toEqual(['m4'])
    expect(useToast.getState().toast?.text).toBe('A copy of Office 1 in Building 2: in place.')
    // Building 1 onto Building 2: a copy of its own, not linked, in the same option
    altDragTo(row('Building 1'), row('Building 2'))
    const made = s().project.buildings.at(-1)!
    expect(made.name).toBe('Building 1 copy')
    expect(s().project.options[0].buildingIds).toContain(made.id)
    expect(s().project.options[0].buildingIds).toContain('b1')
    // Design › Options › Duplicate: the option linked, and it is the active one (the option's own Alt+drag went with its row)
    act(() => void runCommand('design.option.duplicate'))
    expect(s().project.options).toHaveLength(3)
    expect(s().project.options.find((o) => o.id === s().option)!.buildingIds).toEqual(s().project.options[0].buildingIds)
  })

  it('the Brief window: a row Alt+dragged lands a copy of its program there, the row stays; one undo step', () => {
    start()
    pickMenu('Design', 'Brief…')
    const row = (id: string) => document.querySelector<HTMLElement>(`[data-program-row="${id}"]`)!
    const grip = within(row('guardhouse')).getByRole('button', { name: 'Move Guard house' })
    const steps = s().history.past.length
    altDragTo(grip, row('warehouse'))
    // dragged up onto Warehouse: the copy lands above it
    expect(s().project.programs.map((g) => g.name)).toEqual(['Guard house copy', 'Warehouse', 'Office', 'Guard house', 'Outdoor storage'])
    expect(s().history.past).toHaveLength(steps + 1)
    expect(useToast.getState().toast?.text).toBe('Guard house copy: the same brief, without masses or rules yet.')
  })

  it('the Rules diagram: a bubble Alt+dragged stays; a copy of its program lands where it is dropped, pinned there', () => {
    start(demoProject(), 'rules')
    const bubble = document.querySelector('[data-bubble="office"]')!
    fireEvent.pointerDown(bubble, { button: 0, clientX: 100, clientY: 100, pointerId: 1, altKey: true })
    fireEvent.pointerMove(bubble, { clientX: 160, clientY: 100, pointerId: 1 })
    expect(document.querySelector('[data-ghost="office"]')).not.toBeNull()
    fireEvent.pointerUp(bubble, { pointerId: 1 })
    expect(document.querySelector('[data-ghost]')).toBeNull()
    const g = s().project.programs.find((x) => x.name === 'Office copy')!
    expect(g).toBeDefined()
    expect(useGraph.getState().pinned.office).toBeUndefined()
    expect(useGraph.getState().pinned[g.id]).toBeDefined()
    expect(document.querySelector(`[data-bubble="${g.id}"]`)).not.toBeNull()
  })
})
