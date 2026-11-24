// What the Brief tab's tree did for the buildings and the masses, on the Buildings branch of Layers (Phase AS.3, task 6; the cases of
// the old tests of the Brief's tree: Decisions "Buildings tree", "Tree menus and drops", "Lists select in runs", "No loose buildings"):
// a click goes to a building or picks a mass; the marks *linked* and *context*; the eye; drag a building onto another to change its
// place, masses onto a building to assign them, a building onto a mass of the plan; delete a building (its masses after asking, a
// locked mass refuses); the building's and the masses' right-click menus; several buildings picked; *Properties* in a menu; and what the
// option rows did (Design › Options, the top bar's switch: Delete, Delete with masses). Design has no *New building from selection*: the plan's right-click *To a new building* does it (plan/__tests__/groups.test.tsx).
// The demo is Building 1 (b1: m1, m2, m3 on l1) in Option 1 (o1); `project()` adds Building 2 to Option 1 (the Shed on its L1) and an
// Option 2 with a Building 3 of its own (empty).
// Not carried over, on purpose: dragging a building or an option onto another *option's* row (the rows of the options are gone: a
// building's menu has *Link to / Copy to* each other option, layersTab.test.tsx) and the option menu's *Add the selection's buildings*.
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../../App.tsx'
import { derive } from '../../../engine/derive.ts'
import type { Project } from '../../../model/schema.ts'
import { addBuilding, addOption, updateBuilding } from '../../../state/actions/buildings.ts'
import { addMass, toggleMassLock } from '../../../state/actions/masses.ts'
import { demoProject } from '../../../state/demo.ts'
import { emptyHistory } from '../../../state/history.ts'
import { NO_SELECTION, useApp } from '../../../state/store.ts'
import { useBuildingView } from '../../buildingView.ts'
import { commandOf, runCommand } from '../../commands/index.ts'
import { useToast } from '../../layout/toast.ts'
import { useUi } from '../../layout/ui.ts'
import { resetTyped } from '../../editing/dimension/typed.ts'
import { REFERENCE_DEFAULT, useReference } from '../../plan/reference.ts'
import { useDimensions } from '../../plan/tools/toolState.ts'
import { letGo } from '../../tools/hand.ts'
import { pickMenu } from '../../__tests__/pickMenu.ts'
import { deleteBuilding } from '../../panels/buildingCommands.ts'
import { building } from '../keys.ts'
import { useLayerPick } from '../layerPick.ts'
import { useLayerView } from '../layerView.ts'

vi.mock('../../scene/Scene.tsx', () => ({ Scene: () => <div data-testid="scene" /> }))

const rect = (x: number, y: number, w: number, d: number) => ({ kind: 'rect' as const, center: { x, y }, width: w, depth: d, rotation: 0 })

function project(): { p: Project; b2: string; b3: string; shed: string; o2: string } {
  const b = addBuilding(demoProject(), { optionId: 'o1' })
  const shed = addMass(b.project, { programId: 'warehouse', footprint: rect(300, 215, 40, 20), levelId: b.levelId, name: 'Shed' })
  const o2 = addOption(shed.project)
  const b3 = addBuilding(o2.project, { optionId: o2.id })
  return { p: b3.project, b2: b.id, b3: b3.id, shed: shed.id, o2: o2.id }
}

function start(p: Project, option = 'o1') {
  useApp.setState({ project: p, derived: derive(p, option), history: emptyHistory(), dragStart: null, selection: NO_SELECTION, level: 'l1', showAll: false, option })
}

beforeEach(() => {
  localStorage.clear()
  useUi.setState({ dialog: null, view: 'plan', rail: 'layers', panels: { left: true, right: true }, sheet: null, help: true })
  useLayerView.setState({ hidden: [], onTop: [], folded: [] })
  useLayerPick.setState({ keys: [] })
  letGo()
  useDimensions.setState({ selected: null })
  resetTyped()
  useReference.setState(REFERENCE_DEFAULT)
  useBuildingView.setState({ colorBy: 'program' })
  useToast.setState({ toast: null, confirmation: null })
})

const s = () => useApp.getState()
const tree = () => screen.getByRole('tree', { name: 'Layers' })
const items = (name: string) => within(tree()).queryAllByRole('treeitem', { name })
const item = (name: string): HTMLElement => {
  const all = items(name)
  if (!all[0]) throw new Error(`No row "${name}" (rows: ${within(tree()).queryAllByRole('treeitem').map((r) => r.getAttribute('aria-label')).join(', ')})`)
  return all[0]
}
const unfold = (name: string, nth = 0) => fireEvent.click(within(items(name)[nth]).getByRole('button', { name: `Unfold ${name}` }))
const nameOf = (name: string) => item(name).querySelector<HTMLElement>('[data-row-pick]')!
const click = (name: string, extra: object = {}) => fireEvent.click(nameOf(name), extra)
const selected = (name: string) => item(name).getAttribute('aria-selected') === 'true'
const ids = (optionId: string) => s().project.options.find((o) => o.id === optionId)!.buildingIds
const buildingOfMass = (id: string) => s().project.buildings.find((b) => b.levels.some((l) => l.id === s().project.masses.find((m) => m.id === id)!.levelId))!.id
/** Right-clicks a row and returns its menu. */
const menuOf = (name: string) => {
  fireEvent.contextMenu(item(name), { clientX: 120, clientY: 200 })
  return screen.getByRole('menu')
}
/** A menu's item by its name: a plain item or a checkbox one (Context). */
const entry = (menu: HTMLElement, name: RegExp) => within(menu).queryAllByRole('menuitem', { name })[0] ?? within(menu).getByRole('menuitemcheckbox', { name })

/** The browser's drag data, as a drag from the tree carries it to the plan. */
function transfer() {
  const data: Record<string, string> = {}
  return {
    get types() {
      return Object.keys(data)
    },
    setData: (k: string, v: string) => {
      data[k] = v
    },
    getData: (k: string) => data[k] ?? '',
    dropEffect: 'none',
    effectAllowed: 'all',
  }
}
/** A drag from one element to another, as the browser fires it. */
function dragTo(from: Element, to: Element) {
  const dataTransfer = transfer()
  fireEvent.dragStart(from, { dataTransfer })
  fireEvent.dragOver(to, { dataTransfer })
  fireEvent.drop(to, { dataTransfer })
  fireEvent.dragEnd(from, { dataTransfer })
}

describe('the rows', () => {
  it('the option’s buildings, then their levels and masses; a click goes to a building, a level, a mass; Ctrl adds one, Shift picks the run in the tree’s order', () => {
    const { p, shed } = project()
    start(p)
    render(<App />)
    expect(selected('Building 1')).toBe(false)
    expect(item('Building 1')).toHaveAttribute('aria-current', 'true')
    unfold('Building 1')
    unfold('Building 2')
    unfold('L1', 0)
    unfold('L1', 1)
    // a building: the plan goes to its ground floor
    click('Building 2')
    expect(s().level).toBe(s().project.buildings[1].levels[0].id)
    // a mass, then Ctrl+another: both selected
    click('Warehouse 1')
    expect(s()).toMatchObject({ selection: { massIds: ['m1'] } })
    click('Shed', { ctrlKey: true })
    expect(s().selection.massIds).toEqual(['m1', shed])
    // Shift: the run from the last one among the masses of a level
    click('Warehouse 1')
    click('Warehouse 2', { shiftKey: true })
    expect(s().selection.massIds).toEqual(['m1', 'm2'])
  })

  it('Design › Options › <option> goes to an option: it becomes active and the plan leaves a building that option does not show (the options’ rows went with the Brief tab)', () => {
    const { p, o2, b3 } = project()
    start(p)
    render(<App />)
    expect(items('Building 2')).toHaveLength(1)
    act(() => void runCommand(`design.option.go.${o2}`))
    expect(s()).toMatchObject({ option: o2, level: s().project.buildings.find((b) => b.id === b3)!.levels[0].id })
    // the tree is the option in view: its own buildings
    expect(items('Building 3')).toHaveLength(1)
    expect(items('Building 2')).toHaveLength(0)
    act(() => void runCommand('design.option.go.o1'))
    expect(items('Building 2')).toHaveLength(1)
  })

  it('a shared building is linked, a context one says so; the eye hides a building (the plan stops drawing it) and the active one stays drawn', () => {
    const { p, b2, shed } = project()
    // Option 2 shows Building 2 too (linked); Building 2 is context
    const linked = addOption(p, { name: 'Linked', buildingIds: [b2] }).project
    start(updateBuilding(linked, b2, { context: true }))
    render(<App />)
    expect(within(item('Building 2')).getByText(', linked')).toBeInTheDocument()
    expect(within(item('Building 2')).getByText(', context')).toBeInTheDocument()
    expect(within(item('Building 1')).queryByText(/linked|context/)).toBeNull()
    expect(document.querySelector(`[data-other-mass="${shed}"]`)).not.toBeNull()
    act(() => s().selectMany(['m1', shed]))
    fireEvent.click(within(item('Building 2')).getByRole('button', { name: 'Show Building 2' }))
    expect(useLayerView.getState().hidden).toEqual([building(b2)])
    expect(document.querySelector(`[data-other-mass="${shed}"]`)).toBeNull()
    // the hidden Shed leaves the selection (its handles would float on the plan); the active building stays drawn
    expect(s().selection.massIds).toEqual(['m1'])
    fireEvent.click(within(item('Building 1')).getByRole('button', { name: 'Show Building 1' }))
    expect(document.querySelector('[data-mass="m1"]')).not.toBeNull()
    expect(s().selection.massIds).toEqual(['m1'])
    fireEvent.click(within(item('Building 1')).getByRole('button', { name: 'Show Building 1' }))
    // Colour by Building (View › Colour by) paints the masses by their building
    pickMenu('View', 'Colour by', 'Building')
    expect(useBuildingView.getState().colorBy).toBe('building')
    expect(document.querySelector('[data-mass="m1"]')).toHaveAttribute('fill', s().project.buildings[0].color)
  })

  it('the Buildings row’s ＋ and Design › New building make a building in the active option and go to it; Design › Options › New makes an option with its own building; one undo step each', () => {
    start(demoProject())
    render(<App />)
    fireEvent.click(within(item('Buildings')).getByRole('button', { name: 'New building' }))
    const made = s().project.buildings[1]
    expect(made.name).toBe('Building 2')
    expect(s().project.options[0].buildingIds).toEqual(['b1', made.id])
    expect(s().level).toBe(made.levels[0].id)
    act(() => void runCommand('design.option.new'))
    const o = s().project.options[1]
    expect(s().option).toBe(o.id)
    expect(o.buildingIds).toHaveLength(1)
    expect(s().project.buildings.find((b) => b.id === o.buildingIds[0])!.name).toBe('Building 3')
    act(() => s().undo())
    expect(s().project.options).toHaveLength(1)
    expect(s().option).toBe('o1')
  })

  it('Design has no New building from selection: the plan’s right-click To a new building does that, where the masses are picked', () => {
    start(demoProject())
    render(<App />)
    act(() => s().selectMany(['m1', 'm2']))
    pickMenu('Design')
    expect(screen.queryByRole('menuitem', { name: /^New building from selection/ })).toBeNull()
    expect(screen.getByRole('menuitem', { name: /^New building$/ })).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(commandOf('design.building.from-selection')).toBeUndefined()
  })
})

describe('dragging in the Buildings branch', () => {
  it('a building onto another one lands before it: in its own option it changes place (the first leads the plan)', () => {
    const { p, b2 } = project()
    start(p)
    render(<App />)
    expect(ids('o1')).toEqual(['b1', b2])
    dragTo(item('Building 2'), item('Building 1'))
    expect(ids('o1')).toEqual([b2, 'b1'])
    const order = within(tree())
      .getAllByRole('treeitem')
      .filter((r) => r.getAttribute('aria-level') === '2')
      .map((r) => r.getAttribute('aria-label'))
    expect(order).toEqual(['Building 2', 'Building 1'])
  })

  it('a building is not dropped onto itself', () => {
    const { p, b2 } = project()
    start(p)
    render(<App />)
    const row = item('Building 2')
    const dataTransfer = transfer()
    fireEvent.dragStart(row, { dataTransfer })
    // dragover not taken: the browser would not allow the drop
    expect(fireEvent.dragOver(row, { dataTransfer })).toBe(true)
    fireEvent.dragEnd(row, { dataTransfer })
    expect(ids('o1')).toEqual(['b1', b2])
  })

  it('a mass onto a building is assigned to it; a selected mass takes the selection with it', () => {
    const { p, b2 } = project()
    start(p)
    render(<App />)
    unfold('Building 1')
    unfold('L1')
    // Office 1 alone (nothing selected)
    dragTo(item('Office 1'), item('Building 2'))
    expect(buildingOfMass('m3')).toBe(b2)
    expect(buildingOfMass('m1')).toBe('b1')
    // m1 and m2 selected: dragging m1 takes both
    act(() => s().selectMany(['m1', 'm2']))
    dragTo(item('Warehouse 1'), item('Building 2'))
    expect(buildingOfMass('m1')).toBe(b2)
    expect(buildingOfMass('m2')).toBe(b2)
  })

  it('a building onto a mass in the plan assigns it, with the selection when the mass is in it', () => {
    const { p, b2 } = project()
    start(p)
    render(<App />)
    dragTo(item('Building 2'), document.querySelector('[data-mass="m3"]')!)
    expect(buildingOfMass('m3')).toBe(b2)
    // the plan went to Building 2: Building 1's masses are other buildings now
    act(() => s().setLevel('l1'))
    act(() => s().selectMany(['m1', 'm2']))
    dragTo(item('Building 2'), document.querySelector('[data-mass="m1"]')!)
    expect([buildingOfMass('m1'), buildingOfMass('m2')]).toEqual([b2, b2])
  })

  it('a building onto another building’s mass (lighter on the plan) lands too', () => {
    const { p, shed } = project()
    start(p)
    render(<App />)
    dragTo(item('Building 1'), document.querySelector(`[data-other-mass="${shed}"]`)!)
    expect(buildingOfMass(shed)).toBe('b1')
  })
})

describe('deleting', () => {
  it('a building with masses asks first, and its masses go with it; undo brings it back; one that is the only one of its option stays', () => {
    const { p, b2, b3, shed, o2 } = project()
    start(p)
    render(<App />)
    fireEvent.click(entry(menuOf('Building 2'), /^Delete$/))
    const ask = screen.getByRole('alertdialog', { name: 'Confirm' })
    expect(ask).toHaveTextContent('Delete Building 2 and its 1 mass?')
    fireEvent.click(within(ask).getByRole('button', { name: 'Cancel' }))
    expect(s().project.buildings.some((b) => b.id === b2)).toBe(true)
    fireEvent.click(entry(menuOf('Building 2'), /^Delete$/))
    fireEvent.click(within(screen.getByRole('alertdialog', { name: 'Confirm' })).getByRole('button', { name: 'Continue' }))
    expect(s().project.buildings.map((b) => b.id)).toEqual(['b1', b3])
    expect(s().project.masses.some((m) => m.id === shed)).toBe(false)
    act(() => s().undo())
    expect(s().project.masses.some((m) => m.id === shed)).toBe(true)
    expect(ids('o1')).toEqual(['b1', b2])
    // Building 3 is the only one of Option 2: it stays
    act(() => s().setOption(o2))
    const del = entry(menuOf('Building 3'), /^Delete$/)
    expect(del).toBeDisabled()
    expect(del).toHaveAttribute('title', 'The only building of Option 2')
  })

  it('an empty building goes at once, asking nothing; undo brings it back', () => {
    const { p } = project()
    const empty = addBuilding(p, { optionId: 'o1' })
    start(empty.project)
    render(<App />)
    expect(ids('o1')).toContain(empty.id)
    fireEvent.click(entry(menuOf('Building 4'), /^Delete$/))
    expect(screen.queryByRole('alertdialog', { name: 'Confirm' })).toBeNull()
    expect(s().project.buildings.some((b) => b.id === empty.id)).toBe(false)
    expect(ids('o1')).not.toContain(empty.id)
    act(() => s().undo())
    expect(s().project.buildings.some((b) => b.id === empty.id)).toBe(true)
  })

  it('a locked mass keeps its building: Delete is off, with the reason, and the verb itself refuses it too', () => {
    const { p, b2, shed } = project()
    start(toggleMassLock(p, shed))
    render(<App />)
    const del = entry(menuOf('Building 2'), /^Delete$/)
    expect(del).toBeDisabled()
    expect(del).toHaveAttribute('title', 'A locked block: unlock first')
    fireEvent.keyDown(window, { key: 'Escape' })
    // the verb (the agent's tools, Properties, a key) refuses it whole all the same, and says why
    act(() => deleteBuilding(s().project.buildings.find((b) => b.id === b2)!))
    act(() => useToast.getState().confirmation!.onContinue())
    expect(s().project.buildings.some((b) => b.id === b2)).toBe(true)
    expect(s().refusal?.text).toBe('Shed is locked: unlock it to delete it.')
  })

  it('an option goes from Design › Options › Delete (not the only one), and its building in no other option with it (Decision "No loose buildings")', () => {
    const { p, b3, o2 } = project()
    start(p, o2)
    render(<App />)
    act(() => void runCommand('design.option.delete'))
    expect(s().project.options.map((o) => o.id)).toEqual(['o1'])
    // Building 3 (no masses) was only Option 2's: it went too
    expect(s().project.buildings.some((b) => b.id === b3)).toBe(false)
    // the only option: nothing goes
    expect(runCommand('design.option.delete')).toBe(false)
  })

  it('an option whose own buildings have masses asks first; Continue deletes them, Ctrl+Z brings it all back', () => {
    const { p } = project()
    start(p)
    render(<App />)
    // Option 1 shows Building 1 (three masses) and Building 2 (the Shed), which Option 2 does not
    act(() => void runCommand('design.option.delete'))
    expect(screen.getByRole('alertdialog', { name: 'Confirm' })).toHaveTextContent('Delete Option 1, 2 buildings and 4 masses? No other option shows them.')
    expect(s().project.options).toHaveLength(2)
    fireEvent.click(within(screen.getByRole('alertdialog', { name: 'Confirm' })).getByRole('button', { name: 'Continue' }))
    expect(s().project.options.map((o) => o.name)).toEqual(['Option 2'])
    expect(s().project.masses).toEqual([])
    s().undo()
    expect(s().project.options).toHaveLength(2)
    expect(s().project.masses).toHaveLength(4)
  })
})

describe('the building’s menu', () => {
  it('Assign selection to <building> (Rhino’s Change object layer): off with nothing selected; one undo step; already there, it says so', () => {
    const { p, b2 } = project()
    start(p)
    render(<App />)
    let menu = menuOf('Building 2')
    expect(entry(menu, /^Assign selection to Building 2/)).toBeDisabled()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
    act(() => s().selectMany(['m1', 'm2']))
    menu = menuOf('Building 2')
    expect(entry(menu, /^Assign selection to Building 2/)).toHaveTextContent('2 masses')
    fireEvent.click(entry(menu, /^Assign selection to Building 2/))
    expect(screen.queryByRole('menu')).toBeNull()
    expect([buildingOfMass('m1'), buildingOfMass('m2'), buildingOfMass('m3')]).toEqual([b2, b2, 'b1'])
    expect(s().selection.massIds).toEqual(['m1', 'm2'])
    // already there: the item says so
    menu = menuOf('Building 2')
    expect(entry(menu, /^Assign selection to Building 2/)).toHaveAttribute('title', 'They are in it already')
    fireEvent.keyDown(window, { key: 'Escape' })
    act(() => s().undo())
    expect(buildingOfMass('m1')).toBe('b1')
  })

  it('Escape closes the menu and keeps the selection; ↑ ↓ move between the items that can be used', () => {
    const { p } = project()
    start(p)
    render(<App />)
    act(() => s().select('m1'))
    const menu = menuOf('Building 2')
    expect(entry(menu, /^Assign selection/)).toHaveFocus()
    fireEvent.keyDown(window, { key: 'ArrowDown' })
    expect(entry(menu, /^Select its masses/)).toHaveFocus()
    fireEvent.keyDown(window, { key: 'ArrowUp' })
    fireEvent.keyDown(window, { key: 'ArrowUp' })
    // up from the first wraps to the last: Properties, alone at the end of the menu
    expect(entry(menu, /^Properties/)).toHaveFocus()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
    expect(s().selection.massIds).toEqual(['m1'])
  })

  it('Select its masses, Rename, Hide, Context, Make unique, Remove from and Delete', () => {
    const { p, b2, shed, o2 } = project()
    start(p)
    render(<App />)
    fireEvent.click(entry(menuOf('Building 2'), /^Select its masses/))
    expect(s().selection.massIds).toEqual([shed])
    fireEvent.click(entry(menuOf('Building 2'), /^Rename/))
    const field = within(tree()).getByRole('textbox', { name: 'Name of Building 2' })
    fireEvent.change(field, { target: { value: 'Station' } })
    fireEvent.blur(field)
    expect(s().project.buildings[1].name).toBe('Station')
    fireEvent.click(entry(menuOf('Station'), /^Hide/))
    expect(useLayerView.getState().hidden).toEqual([building(b2)])
    const context = entry(menuOf('Station'), /^Context/)
    expect(context).toHaveAttribute('aria-checked', 'false')
    fireEvent.click(context)
    expect(s().project.buildings[1].context).toBe(true)
    // into Option 2 too, then unique there
    act(() => s().apply((q) => ({ ...q, options: q.options.map((o) => (o.id === o2 ? { ...o, buildingIds: [...o.buildingIds, b2] } : o)) })))
    act(() => s().setOption(o2))
    fireEvent.click(entry(menuOf('Station'), /^Make unique in Option 2/))
    expect(s().option).toBe(o2)
    expect(ids(o2)).not.toContain(b2)
    // only Option 1 shows Station now: taking it out would delete it, so the menu offers Delete alone (Decision "No loose
    // buildings"), which asks first for the Shed
    act(() => s().setOption('o1'))
    const menu = menuOf('Station')
    expect(within(menu).queryByRole('menuitem', { name: /^Remove from/ })).toBeNull()
    expect(within(menu).queryByRole('menuitem', { name: /^Make unique/ })).toBeNull()
    fireEvent.click(entry(menu, /^Delete/))
    fireEvent.click(within(screen.getByRole('alertdialog', { name: 'Confirm' })).getByRole('button', { name: 'Continue' }))
    expect(ids('o1')).toEqual(['b1'])
    expect(s().project.buildings.some((b) => b.id === b2)).toBe(false)
  })

  it('Properties opens the Properties tab on the building: active, nothing selected, on a wide screen; below 880 px the panel opens as a sheet on it', () => {
    const { p, b2 } = project()
    start(p)
    render(<App />)
    act(() => s().select('m1'))
    fireEvent.click(entry(menuOf('Building 2'), /^Properties$/))
    expect(useUi.getState().rail).toBe('properties')
    expect(s().selection.massIds).toEqual([])
    // the right-click picked the building's row (the masses stay selected for Assign: *Properties* then lets them go), so Properties shows its row
    const settings = () => screen.getByRole('region', { name: /^Building Building [0-9]$/ })
    expect(within(settings()).getByRole('textbox', { name: 'Name' })).toHaveValue('Building 2')
    expect(s().level).toBe(s().project.buildings.find((b) => b.id === b2)!.levels[0].id)
    // below 880 px: the sheet opens on Properties, on the building of the menu
    act(() => useUi.setState({ rail: 'layers', panels: { left: false, right: true } }))
    fireEvent.click(entry(menuOf('Building 1'), /^Properties$/))
    expect(useUi.getState()).toMatchObject({ rail: 'properties' })
    expect(useUi.getState().panels.left).toBe(true)
    expect(within(settings()).getByRole('textbox', { name: 'Name' })).toHaveValue('Building 1')
  })
})

describe('several buildings picked (Decision "Lists select in runs")', () => {
  it('Shift picks the run; the menu hides, removes or deletes them all, one undo step; an option keeps one building', () => {
    const { p, b2 } = project()
    // a third building in Option 1, so two can go
    const b4 = addBuilding(p, { optionId: 'o1' })
    start(b4.project)
    render(<App />)
    const name = (id: string) => s().project.buildings.find((b) => b.id === id)!.name
    click(name(b2))
    click(name(b4.id), { shiftKey: true })
    expect(selected(name(b2))).toBe(true)
    expect(selected(name(b4.id))).toBe(true)
    const menu = menuOf(name(b2))
    expect(entry(menu, /^Hide 2 buildings/)).toBeInTheDocument()
    fireEvent.click(entry(menu, /^Delete 2 buildings/))
    // Shed is in Building 2: it asks first
    act(() => useToast.getState().confirmation!.onContinue())
    expect(ids('o1')).toEqual([s().project.buildings[0].id])
    act(() => s().undo())
    expect(ids('o1')).toHaveLength(3)
    // all of Option 1's buildings: Delete is off
    click(name(s().project.buildings[0].id))
    click(name(b4.id), { shiftKey: true })
    expect(entry(menuOf(name(b4.id)), /^Delete 3 buildings/)).toBeDisabled()
  })
})
