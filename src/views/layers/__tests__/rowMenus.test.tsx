// The Layers rows' right-click (Phase AS.4 task 5, Decision "One menu"): it is the one menu of the app (`views/editing/menu/`), opened with the `Ref`s of what the row
// stands for, so a mass, a lot, a gate or an existing road gives the entries the plan gives for the same object; a building, a level and a drawing file have their kinds'
// menus, in the user's order (own verbs │ Copy · Delete │ Rename · Select all · Lock · Hide │ Properties) with every item the tree's old menus had (`treeMenus.ts`, which is
// gone); a branch row (Streets, Gates, Lots…) is not an object and has its own short menu. What a locked building cannot do is greyed, with its reason.
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../../App.tsx'
import { actions } from '../../../state/actions/index.ts'
import { addOption } from '../../../state/actions/buildings.ts'
import type { Project } from '../../../model/schema.ts'
import { menuFor } from '../../editing/menu/build.ts'
import { type Fixture, fixture, s, start } from '../../editing/__tests__/kindsFixture.ts'
import { pickedRefs } from '../../plan/mix.ts'
import { useLayerPick } from '../layerPick.ts'
import { useLayerView } from '../layerView.ts'
import { STREETS } from '../keys.ts'
import { useToast } from '../../layout/toast.ts'
import { useUi } from '../../layout/ui.ts'
import { addLevelAtEnd } from '../../../state/actions/levels.ts'

vi.mock('../../scene/Scene.tsx', () => ({ Scene: () => <div data-testid="scene" /> }))

const tree = () => screen.getByRole('tree', { name: 'Layers' })
const item = (name: string, nth = 0): HTMLElement => {
  const all = within(tree()).queryAllByRole('treeitem', { name })
  if (!all[nth]) throw new Error(`No row "${name}" (rows: ${within(tree()).queryAllByRole('treeitem').map((r) => r.getAttribute('aria-label')).join(', ')})`)
  return all[nth]
}
const unfold = (name: string) => fireEvent.click(within(item(name)).getByRole('button', { name: `Unfold ${name}` }))
const nameOf = (name: string, nth = 0) => item(name, nth).querySelector<HTMLElement>('[data-row-pick]')!
const click = (name: string, extra: object = {}, nth = 0) => fireEvent.click(nameOf(name, nth), extra)
const rightClick = (name: string, nth = 0) => fireEvent.contextMenu(item(name, nth))
// the menu is named after what it is of, not the place: one menu on screen
const menu = () => screen.getByRole('menu')
/** The menu on screen as the plan's `shape` says it: the labels, `|` for a separator. */
const domShape = (): string[] => [...menu().children].map((c) => (c.getAttribute('role') === 'separator' ? '|' : c.querySelector('span')!.textContent!))
const row = (key: string) => within(menu()).getByRole('menuitem', { name: new RegExp(`^${key}`) })
const byKey = (key: string): HTMLElement => menu().querySelector<HTMLElement>(`[data-menu-key="${key}"]`)!
const labelsOf = (entries: ReturnType<typeof menuFor>) => entries.map((e) => (e === 'separator' ? '|' : e.label))
const escape = () => fireEvent.keyDown(window, { key: 'Escape' })

let f: Fixture
let annex: string

/** The fixture with an Annex (a second building with a mass) and a second option that shows Building 1 and the Annex. */
function prepared(): Project {
  let p = f.project
  const a = actions.addBuilding(p, { optionId: 'o1', name: 'Annex' })
  annex = a.id
  p = actions.addMass(a.project, { programId: 'warehouse', footprint: { kind: 'rect', center: { x: 330, y: 215 }, width: 30, depth: 20, rotation: 0 }, levelId: a.levelId }).project
  return addOption(p, { name: 'Second', buildingIds: ['b1', a.id] }).project
}

const open = (...names: string[]) => names.forEach(unfold)

beforeEach(() => {
  f = fixture()
  start(prepared())
  useLayerView.setState({ hidden: [], onTop: [], folded: [] })
})

describe('a row that stands for an object has the plan’s menu of it', () => {
  it('a mass, a lot, a gate and an existing road: the entries the plan gives, in the same order', () => {
    render(<App />)
    open('Building 1', 'L1', 'Circulation', 'Gates', 'Existing roads', 'Parking', 'Lots')
    const lot = s().derived.circulation.lots[0].name
    const road = s().project.site.existingRoads![0]
    for (const name of ['Warehouse 1', lot, 'Gate 1', road.name ?? 'Existing road 1']) {
      rightClick(name)
      const here = domShape()
      escape()
      expect(here.length, name).toBeGreaterThan(3)
      // the row is picked by the right-click: the plan's menu of what is picked is this one
      expect(here, name).toEqual(labelsOf(menuFor(pickedRefs(), 'plan')))
    }
  })

  it('a locked mass reads Unlock in its row’s menu (the row is the way to it), and a hidden lot Show', () => {
    act(() => s().apply((p) => actions.lockMasses(p, ['m1'], true)))
    render(<App />)
    open('Building 1', 'L1')
    rightClick('Warehouse 1')
    expect(byKey('lock').querySelector('span')!.textContent).toBe('Unlock')
    escape()
    open('Parking', 'Lots')
    act(() => useLayerView.getState().setHidden([`lot:${f.lots[0]}`], true))
    rightClick(s().derived.circulation.lots[0].name)
    expect(byKey('hide').querySelector('span')!.textContent).toBe('Show')
  })

  it('a row of something with no kind (Boundary) opens no menu', () => {
    render(<App />)
    open('Site')
    rightClick('Boundary')
    expect(screen.queryByRole('menu')).toBeNull()
  })
})

describe('a building’s menu', () => {
  it('own verbs │ Delete │ Rename · Select all · Lock · Hide │ Properties, with every item the tree’s menu had', () => {
    render(<App />)
    rightClick('Annex')
    expect(domShape()).toEqual([
      'Assign selection to Annex',
      'Select its masses',
      '|',
      'Context',
      '|',
      'In another option',
      'Make unique in Option 1',
      'Remove from Option 1',
      '|',
      'Delete',
      '|',
      'Rename',
      'Select all buildings',
      'Lock',
      'Hide',
      '|',
      'Properties',
    ])
    // the right-click picked it, and only it: the menu of the one building
    expect(useLayerPick.getState().keys).toEqual([`building:${annex}`])
  })

  it('In another option ▸ has Link to and Copy to for every other option, Link to off where it is already', () => {
    let p = s().project
    for (let i = 3; i <= 11; i++) p = addOption(p, { name: `Option ${i}` }).project
    start(p)
    render(<App />)
    rightClick('Annex')
    fireEvent.click(row('In another option'))
    const subs = screen.getAllByRole('menu')
    const sub = subs[subs.length - 1]
    const labels = within(sub).getAllByRole('menuitem').map((b) => b.querySelector('span')!.textContent)
    const others = p.options.filter((o) => o.id !== 'o1').map((o) => o.name)
    expect(others).toHaveLength(10)
    for (const name of others) expect(labels, name).toEqual(expect.arrayContaining([`Link to ${name}`, `Copy to ${name}`]))
    // the Annex is in Second already
    expect(within(sub).getByRole('menuitem', { name: 'Link to Second' })).toBeDisabled()
    fireEvent.click(within(sub).getByRole('menuitem', { name: 'Copy to Option 3' }))
    expect(s().project.buildings).toHaveLength(3)
  })

  it('Rename puts the name in its field; Hide hides it; Context ticks; Properties opens its settings; Delete asks first', () => {
    render(<App />)
    rightClick('Annex')
    fireEvent.click(byKey('rename'))
    const field = screen.getByRole('textbox', { name: 'Name of Annex' })
    fireEvent.change(field, { target: { value: 'Depot' } })
    fireEvent.keyDown(field, { key: 'Enter' })
    expect(s().project.buildings.find((b) => b.id === annex)!.name).toBe('Depot')
    rightClick('Depot')
    fireEvent.click(byKey('hide'))
    expect(useLayerView.getState().hidden).toContain(`building:${annex}`)
    rightClick('Depot')
    expect(byKey('hide').querySelector('span')!.textContent).toBe('Show')
    fireEvent.click(byKey('context'))
    expect(s().project.buildings.find((b) => b.id === annex)!.context).toBe(true)
    rightClick('Depot')
    expect(byKey('context')).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(byKey('properties'))
    expect(s().level).toBe(s().project.buildings.find((b) => b.id === annex)!.levels[0].id)
    expect(useUi.getState().rail).toBe('properties')
    act(() => useUi.getState().setRail('layers'))
    rightClick('Depot')
    fireEvent.click(byKey('delete'))
    expect(s().project.buildings.some((b) => b.id === annex)).toBe(true)
    expect(useToast.getState().confirmation?.text).toMatch(/^Delete Depot and its 1 mass\?/)
  })

  it('Assign selection puts the masses selected into it; the right-click keeps them selected', () => {
    render(<App />)
    act(() => s().selectMany(['m1', 'm2']))
    rightClick('Annex')
    expect(s().selection.massIds).toEqual(['m1', 'm2'])
    expect(byKey('assign').querySelector('span')!.textContent).toBe('Assign selection to Annex')
    fireEvent.click(byKey('assign'))
    const levels = new Set(s().project.buildings.find((b) => b.id === annex)!.levels.map((l) => l.id))
    expect(s().project.masses.filter((m) => levels.has(m.levelId)).map((m) => m.id)).toEqual(expect.arrayContaining(['m1', 'm2']))
  })

  it('several picked: the labels carry the count (Hide N buildings, Remove N from the option, Delete N buildings) and the single one’s own verbs are left out', () => {
    render(<App />)
    click('Building 1')
    click('Annex', { ctrlKey: true })
    rightClick('Annex')
    const here = domShape()
    expect(here).toEqual(expect.arrayContaining(['Remove 2 from Option 1', 'Delete 2 buildings', 'Hide 2 buildings', 'Lock']))
    expect(here).not.toContain('Select its masses')
    expect(here).not.toContain('Assign selection to Annex')
    // a right-click on a row among the picked keeps them all
    expect(useLayerPick.getState().keys).toHaveLength(2)
  })

  it('a locked mass of it greys Delete with the mass’s reason; Remove from the option stays (it is in another option too)', () => {
    act(() => s().apply((p) => actions.lockMasses(p, [s().project.masses.find((m) => m.name !== 'Warehouse 1' && p.buildings.find((b) => b.id === annex)!.levels.some((l) => l.id === m.levelId))!.id], true)))
    render(<App />)
    rightClick('Annex')
    expect(byKey('delete')).toBeDisabled()
    expect(byKey('delete')).toHaveAttribute('title', 'A locked block: unlock first')
    expect(byKey('remove-from-option')).toBeEnabled()
    escape()
    rightClick('Building 1')
    expect(byKey('delete')).toBeEnabled()
  })

  it('a locked building greys Delete, Remove, Make unique, Assign and Context with the building’s reason, and its menu reads Unlock', () => {
    act(() => s().apply((p) => actions.lockBuildings(p, [annex], true)))
    render(<App />)
    act(() => s().selectMany(['m1']))
    rightClick('Annex')
    for (const key of ['delete', 'remove-from-option', 'make-unique', 'assign', 'context']) {
      expect(byKey(key), key).toBeDisabled()
      expect(byKey(key), key).toHaveAttribute('title', 'A locked building: unlock first')
    }
    expect(byKey('lock').querySelector('span')!.textContent).toBe('Unlock')
    fireEvent.click(byKey('lock'))
    expect(s().project.buildings.find((b) => b.id === annex)!.locked).toBeUndefined()
  })
})

describe('a level’s menu', () => {
  it('Go to │ Delete level (its masses) │ Rename · Lock │ Properties: Delete is off while the building keeps one level', () => {
    render(<App />)
    open('Annex')
    rightClick('L1')
    expect(domShape()).toEqual(['Go to L1', '|', 'Delete level', '|', 'Rename', 'Lock', '|', 'Properties'])
    expect(byKey('delete').textContent).toBe('Delete level1 mass')
    expect(byKey('delete')).toBeDisabled()
    expect(byKey('delete')).toHaveAttribute('title', 'Annex keeps one level at least')
    fireEvent.click(byKey('go-to'))
    expect(s().level).toBe(s().project.buildings.find((b) => b.id === annex)!.levels[0].id)
  })

  it('a right-click on a level picks it alone first; several levels picked: Delete N levels; a locked mass on them refuses the delete', () => {
    const up = addLevelAtEnd(s().project, 'above', 'b1')
    const p = actions.addMass(up.project, { programId: 'office', footprint: { kind: 'rect', center: { x: 120, y: 110 }, width: 20, depth: 20, rotation: 0 }, levelId: up.id }).project
    start(actions.lockMasses(p, [p.masses.at(-1)!.id], true))
    render(<App />)
    open('Building 1')
    rightClick('L2')
    expect(useLayerPick.getState().keys).toHaveLength(1)
    expect(byKey('delete')).toBeDisabled()
    expect(byKey('delete')).toHaveAttribute('title', 'A locked block: unlock first')
    escape()
    click('L2')
    click('L1', { ctrlKey: true })
    rightClick('L1')
    expect(byKey('delete').querySelector('span')!.textContent).toBe('Delete 2 levels')
    expect(domShape()).not.toContain('Go to L1')
  })

  it('Lock locks the masses of the level; Rename puts the level’s name in its field', () => {
    render(<App />)
    open('Annex')
    rightClick('L1')
    fireEvent.click(byKey('lock'))
    const levelId = s().project.buildings.find((b) => b.id === annex)!.levels[0].id
    expect(s().project.masses.filter((m) => m.levelId === levelId).every((m) => m.locked === true)).toBe(true)
    rightClick('L1')
    expect(byKey('lock').querySelector('span')!.textContent).toBe('Unlock')
    fireEvent.click(byKey('rename'))
    const field = screen.getByRole('textbox', { name: 'Name of L1' })
    expect(field).toHaveValue('L1')
  })
})

describe('a drawing file’s menu', () => {
  const withDrawings = () => {
    const p = s().project
    start({ ...p, site: { ...p.site, drawings: [{ file: 'civil.dwg', layers: [{ name: 'A-SITE', lines: [{ points: [{ x: 1, y: 1 }, { x: 5, y: 1 }] }] }] }] } })
  }

  it('Separate / Join layers, On top │ Remove │ Lock · Hide │ Properties: the old menu’s two items, kept', () => {
    withDrawings()
    render(<App />)
    open('Site', 'Drawings')
    rightClick('civil.dwg')
    expect(domShape()).toEqual(['Separate layers', 'On top', '|', 'Remove', '|', 'Lock', 'Hide', '|', 'Properties'])
    fireEvent.click(byKey('split-layers'))
    expect(s().project.site.drawings![0].split).toBe(true)
    rightClick('civil.dwg')
    expect(byKey('split-layers').querySelector('span')!.textContent).toBe('Join layers')
    fireEvent.click(byKey('delete'))
    expect(s().project.site.drawings ?? []).toEqual([])
  })
})

describe('a branch row’s menu', () => {
  it('Streets: Select all streets · Hide · Properties; Unlock all appears when some are locked', () => {
    render(<App />)
    open('Circulation')
    rightClick('Streets')
    expect(domShape()).toEqual(['Select all streets', 'Hide', '|', 'Properties'])
    escape()
    act(() => s().apply((p) => actions.lockStreets(p, ['s1'], true, 'o1')))
    rightClick('Streets')
    expect(domShape()).toEqual(['Select all streets', 'Hide', 'Unlock all', '|', 'Properties'])
  })

  it('Select all picks every one of the kind that is neither locked nor hidden; Hide hides the branch and reads Show; Unlock all frees them; Properties shows the row', () => {
    render(<App />)
    open('Circulation')
    rightClick('Streets')
    fireEvent.click(byKey('select-all'))
    expect(pickedRefs().filter((r) => r.kind === 'street')).toHaveLength(2)
    rightClick('Streets')
    fireEvent.click(byKey('hide'))
    expect(useLayerView.getState().hidden).toContain(STREETS)
    rightClick('Streets')
    expect(byKey('hide').querySelector('span')!.textContent).toBe('Show')
    fireEvent.click(byKey('hide'))
    expect(useLayerView.getState().hidden).not.toContain(STREETS)
    act(() => s().apply((p) => actions.lockStreets(p, ['s1', 's2', 's3', 's4'], true, 'o1')))
    rightClick('Streets')
    fireEvent.click(byKey('unlock-all'))
    expect(s().project.options[0].streets!.segments.some((g) => g.locked)).toBe(false)
    rightClick('Streets')
    fireEvent.click(byKey('properties'))
    expect(useLayerPick.getState().keys).toEqual(['streets'])
  })

  it('Existing roads: Unlock all appears when some are locked and frees them (review V5)', () => {
    render(<App />)
    open('Circulation')
    act(() => s().apply((p) => actions.lockExistingRoads(p, [f.existing[0]], true)))
    rightClick('Existing roads')
    expect(domShape()).toEqual(['Select all existing roads', 'Hide', 'Unlock all', '|', 'Properties'])
    fireEvent.click(byKey('unlock-all'))
    expect((s().project.site.existingRoads ?? []).some((r) => r.locked === true)).toBe(false)
  })

  it('Gates, Lots, Existing roads, Dimensions and Buildings have it too', () => {
    render(<App />)
    open('Circulation', 'Parking', 'Annotations')
    for (const [name, plural] of [['Gates', 'gates'], ['Lots', 'lots'], ['Existing roads', 'existing roads'], ['Dimensions', 'dimensions'], ['Buildings', 'buildings']]) {
      rightClick(name)
      expect(domShape(), name).toEqual([`Select all ${plural}`, 'Hide', '|', 'Properties'])
      escape()
    }
  })
})

