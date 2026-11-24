// The Layers tab (Phase AS.3, task 4): the tree drawn, with its folds, eyes, padlocks, picks, drags and menus, the ＋ that
// makes a building, the plan's *Program ▸* and the rail's first item. The plan is rendered with it: an eye is checked
// through the store and through what the plan draws.
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../../App.tsx'
import { derive } from '../../../engine/derive.ts'
import type { Contour, Id, Project } from '../../../model/schema.ts'
import { actions } from '../../../state/actions/index.ts'
import { addOption } from '../../../state/actions/buildings.ts'
import { newProject } from '../../../typologies/index.ts'
import { demoProject } from '../../../state/demo.ts'
import { emptyHistory } from '../../../state/history.ts'
import { NO_SELECTION, useApp } from '../../../state/store.ts'
import { useLots } from '../../../modules/parking/views/lotState.ts'
import { useGraph } from '../../graph/graphState.ts'
import { useToast } from '../../layout/toast.ts'
import { readSaved, STORAGE_KEY, useUi } from '../../layout/ui.ts'
import { useAccess } from '../../plan/access/accessState.ts'
import { fit, UNMEASURED_SIZE } from '../../plan/camera.ts'
import { useRoads } from '../../plan/circulation/roadState.ts'
import { pickOnPlan } from '../../plan/massCommands.ts'
import { pickedNow } from '../../plan/mix.ts'
import { leaf, planMenu, rowKeyed, type Leaf } from '../../editing/menu/__tests__/helpers.ts'
import { useSnapSettings } from '../../plan/snap/settings.ts'
import { useDrawingPick } from '../../plan/site/drawingPick.ts'
import { useDimensions } from '../../plan/tools/toolState.ts'
import { letGo, take, useHand } from '../../tools/hand.ts'
import { useTerrainView } from '../../../modules/terrain/views/terrainView.ts'
import { handleKey } from '../../useShortcuts.ts'
import { building, DIMENSIONS, drawingLayer, GATES, LABELS, parcel, STREETS } from '../keys.ts'
import { LAYERS_KEY, useLayerView } from '../layerView.ts'
import { useLayerPick } from '../layerPick.ts'
import { layerTree } from '../tree.ts'
import { SWITCH_TITLES } from '../switches.ts'

vi.mock('../../scene/Scene.tsx', () => ({ Scene: () => <div data-testid="scene" /> }))
vi.mock('../tree.ts', async (orig) => {
  const m = await orig<typeof import('../tree.ts')>()
  return { ...m, layerTree: vi.fn(m.layerTree) }
})
// every render of a row is counted: the row's own function stands behind a counter, behind the same memo
const rowRenders = vi.hoisted(() => ({ n: 0 }))
vi.mock('../Row.tsx', async (orig) => {
  const m = await orig<typeof import('../Row.tsx')>()
  const { memo } = await import('react')
  const inner = (m.Row as unknown as { type: (p: never) => unknown }).type
  return { ...m, Row: memo((p: never) => (rowRenders.n++, inner(p) as never)) }
})

const s = () => useApp.getState()
const q = (selector: string) => document.querySelectorAll(selector)
const tree = () => screen.getByRole('tree', { name: 'Layers' })
const items = (name: string) => within(tree()).queryAllByRole('treeitem', { name })
const item = (name: string, nth = 0): HTMLElement => {
  const all = items(name)
  if (!all[nth]) throw new Error(`No row "${name}" (rows: ${within(tree()).queryAllByRole('treeitem').map((r) => r.getAttribute('aria-label')).join(', ')})`)
  return all[nth]
}
const unfold = (name: string, nth = 0) => fireEvent.click(within(item(name, nth)).getByRole('button', { name: `Unfold ${name}` }))
const fold = (name: string, nth = 0) => fireEvent.click(within(item(name, nth)).getByRole('button', { name: `Fold ${name}` }))
const eye = (name: string, nth = 0) => within(item(name, nth)).getByRole('button', { name: `Show ${name}` })
const padlock = (name: string, nth = 0) => within(item(name, nth)).getByRole('button', { name: `Lock ${name}` })
const nameOf = (name: string, nth = 0) => item(name, nth).querySelector<HTMLElement>('[data-row-pick]')!
const click = (name: string, extra: object = {}, nth = 0) => fireEvent.click(nameOf(name, nth), extra)
const selected = (name: string, nth = 0) => item(name, nth).getAttribute('aria-selected') === 'true'
const menuOf = (name: string, nth = 0) => {
  fireEvent.contextMenu(item(name, nth))
  return screen.getByRole('menu')
}
/** The labels of a menu's rows (a check row too), without the key at their right. */
const labelsOf = (menu: HTMLElement) => [...menu.querySelectorAll('[role^="menuitem"]')].map((r) => r.querySelector('span')!.textContent)
/** Opens the *In another option* sub-menu of a building's menu and gives it. */
const otherOptions = (menu: HTMLElement) => {
  fireEvent.click(within(menu).getByRole('menuitem', { name: 'In another option' }))
  const menus = screen.getAllByRole('menu')
  return menus[menus.length - 1]
}
const toast = () => useToast.getState().toast?.text
const hidden = () => useLayerView.getState().hidden
const open = (...names: string[]) => names.forEach((n) => unfold(n))

const sq = (x: number, size: number): Contour => ({ vertices: [{ x, y: 0, r: 0 }, { x: x + size, y: 0, r: 0 }, { x: x + size, y: size, r: 0 }, { x, y: size, r: 0 }] })
const line = { points: [{ x: 10, y: 10 }, { x: 60, y: 10 }] }

// the demo's site as the plan fits it
const v = fit({ minX: 0, minY: -15, maxX: 440, maxY: 280 }, UNMEASURED_SIZE)
const at = (p: { x: number; y: number }) => ({ clientX: (p.x - v.cx) * v.scale + UNMEASURED_SIZE.w / 2, clientY: UNMEASURED_SIZE.h / 2 - (p.y - v.cy) * v.scale, button: 0, pointerId: 1 })
const plan = () => screen.getByRole('img', { name: 'Site plan' })

interface Fixture {
  project: Project
  gate: Id
  annex: Id
  o2: Id
}

/** The demo with an Annex (a second building with a mass), two gates, a second existing road (the demo's south street is the first), two lots, two drawings, a second option. */
function prepared(): Fixture {
  let p = demoProject()
  p = actions.addGate(p, 'o1', 0.1).project
  p = actions.addExistingRoad(p, [{ x: -60, y: 310 }, { x: 500, y: 310 }], 12)!.project
  p = actions.addLot(p, 'o1', { rect: { center: { x: 380, y: 230 }, width: 50, depth: 24, rotation: 0 } })!.project
  p = actions.addLot(p, 'o1', { rect: { center: { x: 260, y: 240 }, width: 50, depth: 24, rotation: 0 } })!.project
  const annex = actions.addBuilding(p, { optionId: 'o1', name: 'Annex' })
  p = actions.addMass(annex.project, { programId: 'warehouse', footprint: { kind: 'rect', center: { x: 330, y: 215 }, width: 30, depth: 20, rotation: 0 }, levelId: annex.levelId }).project
  p = {
    ...p,
    site: {
      ...p.site,
      drawings: [
        { file: 'civil.dwg', layers: [{ name: 'A-SITE', color: 1, lines: [line] }, { name: 'C-ROAD', lines: [line], locked: true }] },
        { file: 'frisa.dwg', layers: [{ name: 'ARQ-EDIF', color: 3, lines: [line] }], split: true },
      ],
      parcels: [{ name: 'P1', contour: sq(0, 20), file: 'civil.dwg' }],
    },
  }
  const o2 = addOption(p, { name: 'Second', buildingIds: ['b1'] })
  return { project: o2.project, gate: p.site.gates![0].id, annex: annex.id, o2: o2.id }
}

let fx = prepared()

function start(p: Project = fx.project, ui: Partial<ReturnType<typeof useUi.getState>> = {}) {
  useApp.setState({ project: p, derived: derive(p, 'o1'), history: emptyHistory(), dragStart: null, selection: NO_SELECTION, level: 'l1', showAll: false, option: 'o1' })
  useUi.setState({ view: 'plan', rail: 'layers', panels: { left: true, right: true }, sheet: null, help: false, dialog: null, ...ui })
}

beforeEach(() => {
  localStorage.clear()
  fx = prepared()
  useLayerView.setState({ hidden: [], onTop: [], folded: [] })
  useLayerPick.setState({ keys: [] })
  useGraph.setState({ graph: false, rule: null, relation: null })
  useSnapSettings.setState({ settings: { ...useSnapSettings.getState().settings, grid: true } })
  useTerrainView.setState({ show: 'contours' })
  useToast.setState({ toast: null, confirmation: null })
  useAccess.setState({ picked: null, alsoGates: [] })
  useLots.setState({ picked: null, also: [] })
  useRoads.setState({ picked: null, also: [], node: null })
  useDrawingPick.setState({ picked: [] })
  useDimensions.setState({ selected: null, also: [] })
  letGo()
  start()
  vi.mocked(layerTree).mockClear()
})

describe('the panel', () => {
  it('Layers is the panel’s first tab, on every width; the tree is its view; the other tabs still work', () => {
    render(<App />)
    const tabs = within(screen.getByRole('tablist', { name: 'Panel tabs' }))
    expect(tabs.getAllByRole('tab').slice(0, 3).map((b) => b.textContent)).toEqual(['Layers', 'Blocks', 'Properties'])
    expect(tabs.getByRole('tab', { name: 'Layers' })).toHaveAttribute('aria-selected', 'true')
    expect(within(screen.getByRole('complementary', { name: 'Layers and properties' })).getByRole('tabpanel', { name: 'Layers' })).toBeInTheDocument()
    expect(tabs.getByRole('tab', { name: 'Layers' })).toHaveAttribute('data-tour', 'tab-layers')
    fireEvent.click(tabs.getByRole('tab', { name: 'Properties' }))
    expect(useUi.getState().rail).toBe('properties')
    expect(screen.queryByRole('tree', { name: 'Layers' })).toBeNull()
    fireEvent.click(tabs.getByRole('tab', { name: 'Layers' }))
    expect(tree()).toBeInTheDocument()
  })

  it('a saved Layers tab is read back', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ rail: 'layers' }))
    expect(readSaved().rail).toBe('layers')
    start(fx.project, { rail: readSaved().rail })
    render(<App />)
    expect(tree()).toBeInTheDocument()
  })

  it('a blank project has no Site and no Circulation branch, whatever tab was open before: Reference, Buildings, Parking (its typology offers it) and Annotations', () => {
    start(newProject('blank'))
    render(<App />)
    const branches = () => within(tree()).getAllByRole('treeitem').filter((r) => r.getAttribute('aria-level') === '1').map((r) => r.getAttribute('aria-label'))
    expect(branches()).toEqual(['Reference', 'Buildings', 'Parking', 'Annotations'])
  })
})

describe('the keys on the tree (↑ ↓ → ← Home End, Enter)', () => {
  const key = (el: Element, k: string, extra: object = {}) => fireEvent.keyDown(el, { key: k, ...extra })
  const focused = () => document.activeElement?.closest('[data-row-id]')?.getAttribute('aria-label')

  it('↑ and ↓ move between the rows that show, Home and End to the first and the last', () => {
    render(<App />)
    const rows = () => within(tree()).getAllByRole('treeitem').map((r) => r.getAttribute('aria-label'))
    const first = nameOf(rows()[0]!)
    first.focus()
    key(first, 'ArrowDown')
    expect(focused()).toBe(rows()[1])
    key(document.activeElement!, 'ArrowDown')
    expect(focused()).toBe(rows()[2])
    key(document.activeElement!, 'ArrowUp')
    expect(focused()).toBe(rows()[1])
    key(document.activeElement!, 'End')
    expect(focused()).toBe(rows().at(-1))
    key(document.activeElement!, 'Home')
    expect(focused()).toBe(rows()[0])
    // at the ends it stays
    key(document.activeElement!, 'ArrowUp')
    expect(focused()).toBe(rows()[0])
  })

  it('→ opens a folded row; opened, it goes to its first child; ← folds an open row, folded (or a leaf) it goes to its parent', () => {
    render(<App />)
    const site = nameOf('Site')
    site.focus()
    expect(item('Site')).toHaveAttribute('aria-expanded', 'false')
    key(site, 'ArrowRight')
    expect(item('Site')).toHaveAttribute('aria-expanded', 'true')
    expect(useLayerView.getState().folded).toContain('site')
    // open: → goes to the first child
    key(site, 'ArrowRight')
    expect(focused()).toBe('Boundary')
    // a leaf: ← goes to its parent; open: ← folds it
    key(document.activeElement!, 'ArrowLeft')
    expect(focused()).toBe('Site')
    key(document.activeElement!, 'ArrowLeft')
    expect(item('Site')).toHaveAttribute('aria-expanded', 'false')
    // a branch with no parent: nothing happens
    key(document.activeElement!, 'ArrowLeft')
    expect(focused()).toBe('Site')
  })

  it('Enter picks the row focused, as a click does; a field or a modifier key leaves the keys alone', () => {
    render(<App />)
    const boundary = () => nameOf('Boundary')
    open('Site')
    boundary().focus()
    // Enter on a button is its click
    fireEvent.click(boundary())
    expect(selected('Boundary')).toBe(true)
    const before = focused()
    key(boundary(), 'ArrowDown', { shiftKey: true })
    expect(focused()).toBe(before)
    // in the name field of a building being renamed, the arrows are the field's
    fireEvent.doubleClick(nameOf('Annex'))
    const field = screen.getByRole('textbox', { name: 'Name of Annex' })
    key(field, 'ArrowDown')
    expect(document.activeElement).not.toBeNull()
    expect(screen.getByRole('textbox', { name: 'Name of Annex' })).toBeInTheDocument()
  })
})

describe('the rows, as the ARIA tree', () => {
  it('a tree named Layers; each row a treeitem with its level, expanded where it has children, an anchor each', () => {
    render(<App />)
    const top = within(tree()).getAllByRole('treeitem')
    expect(top.map((r) => r.getAttribute('aria-label'))).toEqual(expect.arrayContaining(['Site', 'Buildings', 'Circulation', 'Parking', 'Annotations']))
    expect(item('Site')).toHaveAttribute('aria-level', '1')
    expect(item('Site')).toHaveAttribute('aria-expanded', 'false')
    expect(item('Buildings')).toHaveAttribute('aria-expanded', 'true')
    expect(item('Buildings')).toHaveAttribute('data-tour', 'layer-buildings')
    expect(item('Building 1')).toHaveAttribute('aria-level', '2')
    expect(item('Building 1')).toHaveAttribute('data-tour', 'layer-building:b1')
    expect(items('Boundary')).toHaveLength(0)
  })

  it('the tree takes several rows at once (Shift, Ctrl): aria-multiselectable', () => {
    render(<App />)
    expect(tree()).toHaveAttribute('aria-multiselectable', 'true')
  })

  it('the row that has focus deleted, focus goes to the next row, else the previous, else the tree; never to the page', () => {
    render(<App />)
    // Annex is the last building: its next row is the Circulation branch
    act(() => nameOf('Annex').focus())
    expect(nameOf('Annex')).toHaveFocus()
    act(() => s().apply((p) => actions.removeBuilding(p, fx.annex, true)))
    expect(items('Annex')).toHaveLength(0)
    expect(document.activeElement).not.toBe(document.body)
    expect(tree().contains(document.activeElement)).toBe(true)
    expect(document.activeElement).toBe(nameOf('Circulation'))
    // the last row of the tree goes (its branch folds): the one before it
    open('Annotations')
    act(() => nameOf('Program graph').focus())
    act(() => useLayerView.getState().setFolded('annotations', false))
    expect(items('Program graph')).toHaveLength(0)
    expect(document.activeElement).toBe(nameOf('Annotations'))
  })

  it('focus that was elsewhere stays elsewhere when a row goes', () => {
    render(<App />)
    const outside = document.createElement('button')
    document.body.appendChild(outside)
    act(() => nameOf('Annex').focus())
    act(() => outside.focus())
    act(() => s().apply((p) => actions.removeBuilding(p, fx.annex, true)))
    expect(outside).toHaveFocus()
    outside.remove()
  })

  it('folded at first but Buildings, and the buildings themselves; a fold opens its children, and is kept per project', () => {
    render(<App />)
    // Buildings is open, its buildings are one row each
    expect(item('Building 1')).toHaveAttribute('aria-expanded', 'false')
    expect(items('L1')).toHaveLength(0)
    unfold('Site')
    expect(item('Boundary')).toHaveAttribute('aria-level', '2')
    expect(item('Site')).toHaveAttribute('aria-expanded', 'true')
    fold('Buildings')
    expect(items('Building 1')).toHaveLength(0)
    expect(JSON.parse(localStorage.getItem(LAYERS_KEY)!)[s().project.id].folded.sort()).toEqual(['buildings', 'site'])
    // another project starts as every project does; this one comes back as it was left
    const mine = s().project
    act(() => s().open(demoProject()))
    expect(item('Site')).toHaveAttribute('aria-expanded', 'false')
    expect(item('Buildings')).toHaveAttribute('aria-expanded', 'true')
    act(() => s().open(mine))
    expect(item('Site')).toHaveAttribute('aria-expanded', 'true')
    expect(item('Buildings')).toHaveAttribute('aria-expanded', 'false')
    // and across a reload of the store
    expect(JSON.parse(localStorage.getItem(LAYERS_KEY)!)[mine.id].folded).toBeDefined()
  })

  it('a folded branch draws no children, and a hundred masses stay cheap', () => {
    let p = fx.project
    for (let i = 0; i < 100; i++) p = actions.addMass(p, { programId: 'warehouse', footprint: { kind: 'rect', center: { x: 10 + i, y: 10 }, width: 5, depth: 5, rotation: 0 } }).project
    start(p)
    render(<App />)
    expect(within(tree()).getAllByRole('treeitem').length).toBeLessThan(30)
    unfold('Building 1')
    unfold('L1')
    expect(within(tree()).getAllByRole('treeitem').length).toBeGreaterThan(100)
  })
})

describe('an eye', () => {
  it('a leaf hides its key and the plan follows: Streets, a gate, a drawing layer, Labels, the boundary', () => {
    render(<App />)
    open('Site', 'Circulation', 'Annotations')
    open('Drawings', 'civil.dwg')
    expect(eye('Streets')).toHaveAttribute('aria-pressed', 'true')
    const streets = q('[data-road-kind="street"]').length
    expect(streets).toBeGreaterThan(0)
    fireEvent.click(eye('Streets'))
    expect(hidden()).toEqual([STREETS])
    expect(eye('Streets')).toHaveAttribute('aria-pressed', 'false')
    expect(q('[data-road-kind="street"]')).toHaveLength(0)
    fireEvent.click(eye('Streets'))
    expect(q('[data-road-kind="street"]')).toHaveLength(streets)

    expect(q('[data-drawing-layer]').length).toBeGreaterThan(0)
    const layer = drawingLayer('civil.dwg', 'A-SITE')
    expect(q(`[data-drawing-layer="${layer}"]`)).toHaveLength(1)
    fireEvent.click(eye('A-SITE'))
    expect(hidden()).toEqual([layer])
    expect(q(`[data-drawing-layer="${layer}"]`)).toHaveLength(0)
    fireEvent.click(eye('A-SITE'))

    expect(q('[data-label="m1"]')).toHaveLength(1)
    fireEvent.click(eye('Labels'))
    expect(hidden()).toEqual([LABELS])
    expect(q('[data-label="m1"]')).toHaveLength(0)
    fireEvent.click(eye('Labels'))

    expect(q('[data-layer="boundary"]')).toHaveLength(1)
    fireEvent.click(eye('Boundary'))
    expect(q('[data-layer="boundary"]')).toHaveLength(0)
  })

  it('a gate’s eye hides that gate alone; a building’s eye hides its masses on the plan', () => {
    render(<App />)
    open('Circulation', 'Gates')
    const gates = s().derived.circulation.gates.map((g) => g.id)
    expect(gates.length).toBe(2)
    fireEvent.click(eye('Gate 2'))
    expect(q(`[data-gate="${gates[1]}"]`)).toHaveLength(0)
    expect(q(`[data-gate="${gates[0]}"]`)).toHaveLength(1)
    expect(eye('Gates')).toHaveAttribute('aria-pressed', 'mixed')
    // the Annex is context to the plan on its level: hidden, it is not drawn
    expect(q(`[data-other-mass="${s().project.masses.at(-1)!.id}"]`)).toHaveLength(1)
    fireEvent.click(eye('Annex'))
    expect(hidden()).toContain(building(fx.annex))
    expect(q(`[data-other-mass="${s().project.masses.at(-1)!.id}"]`)).toHaveLength(0)
    expect(within(item('Annex')).getByText('Annex').className).toContain('opacity-50')
    fireEvent.click(eye('Annex'))
    expect(q(`[data-other-mass="${s().project.masses.at(-1)!.id}"]`)).toHaveLength(1)
  })

  it('the building the plan is on stays drawn when its eye hides it (the rule of toggleHidden)', () => {
    render(<App />)
    fireEvent.click(eye('Building 1'))
    expect(hidden()).toContain(building('b1'))
    expect(q('[data-mass="m1"]').length).toBeGreaterThan(0)
  })

  it('a branch’s eye hides all under it, shows all, and reads mixed when only some are hidden', () => {
    render(<App />)
    open('Circulation', 'Annotations')
    const kinds = ['Streets', 'Gates']
    fireEvent.click(eye('Circulation'))
    expect(hidden()).toEqual(expect.arrayContaining([STREETS, GATES]))
    expect(eye('Circulation')).toHaveAttribute('aria-pressed', 'false')
    for (const k of kinds) expect(eye(k)).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(eye('Circulation'))
    expect(hidden()).toEqual([])
    expect(eye('Circulation')).toHaveAttribute('aria-pressed', 'true')
    // one hidden: mixed; a press hides all (not all hidden)
    fireEvent.click(eye('Streets'))
    expect(eye('Circulation')).toHaveAttribute('aria-pressed', 'mixed')
    fireEvent.click(eye('Circulation'))
    expect(eye('Circulation')).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(eye('Circulation'))
    expect(hidden()).toEqual([])
    // the Annotations' eye hides their keys too
    fireEvent.click(eye('Annotations'))
    expect(hidden()).toEqual(expect.arrayContaining([DIMENSIONS, LABELS]))
    expect(useGraph.getState().graph).toBe(false)
  })

  it('a file’s eye is its layers’ and parcels’; the Drawings eye is every file’s', () => {
    render(<App />)
    open('Site', 'Drawings', 'civil.dwg')
    fireEvent.click(eye('civil.dwg'))
    expect(hidden().sort()).toEqual([drawingLayer('civil.dwg', 'A-SITE'), drawingLayer('civil.dwg', 'C-ROAD'), parcel('P1', 'civil.dwg')].sort())
    expect(eye('Drawings')).toHaveAttribute('aria-pressed', 'mixed')
    fireEvent.click(eye('Drawings'))
    expect(hidden()).toHaveLength(4)
    fireEvent.click(eye('Drawings'))
    expect(hidden()).toEqual([])
  })

  it('the three that run a switch: the Grid is the snap’s, the Program graph a mode, the Terrain the ground’s look', () => {
    const p = fx.project
    // a ground for the terrain row: its module is on with ground
    const withGround = { ...p, site: { ...p.site, terrain: { contours: [{ points: [{ x: 0, y: 0 }, { x: 100, y: 0 }], z: 5 }, { points: [{ x: 0, y: 50 }, { x: 100, y: 50 }], z: 6 }], points: [] } } }
    start(withGround)
    render(<App />)
    open('Reference', 'Site', 'Annotations')
    expect(eye('Grid')).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(eye('Grid'))
    expect(useSnapSettings.getState().settings.grid).toBe(false)
    expect(eye('Grid')).toHaveAttribute('aria-pressed', 'false')
    expect(hidden()).toEqual([])
    fireEvent.click(eye('Grid'))
    expect(useSnapSettings.getState().settings.grid).toBe(true)

    expect(eye('Program graph')).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(eye('Program graph'))
    expect(useGraph.getState().graph).toBe(true)
    expect(eye('Program graph')).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(eye('Program graph'))
    expect(useGraph.getState().graph).toBe(false)

    // the look goes off and comes back as it was
    act(() => useTerrainView.getState().setShow('slope'))
    expect(eye('Terrain')).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(eye('Terrain'))
    expect(useTerrainView.getState().show).toBe('off')
    expect(eye('Terrain')).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(eye('Terrain'))
    expect(useTerrainView.getState().show).toBe('slope')
    expect(hidden()).toEqual([])
  })
})

describe('a branch’s eye keeps to the keys under it (review: it flipped the switches too)', () => {
  const withGround = () => {
    const p = fx.project
    return { ...p, site: { ...p.site, terrain: { contours: [{ points: [{ x: 0, y: 0 }, { x: 100, y: 0 }], z: 5 }, { points: [{ x: 0, y: 50 }, { x: 100, y: 50 }], z: 6 }], points: [] } } }
  }

  it('Annotations: two presses leave the program graph as it was', () => {
    render(<App />)
    open('Annotations')
    expect(useGraph.getState().graph).toBe(false)
    expect(eye('Annotations')).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(eye('Annotations'))
    expect(hidden()).toEqual(expect.arrayContaining([DIMENSIONS, LABELS]))
    expect(eye('Annotations')).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(eye('Annotations'))
    expect(hidden()).toEqual([])
    expect(useGraph.getState().graph).toBe(false)
    // the graph row keeps its own eye; the branch reads the keys alone
    fireEvent.click(eye('Program graph'))
    expect(useGraph.getState().graph).toBe(true)
    fireEvent.click(eye('Annotations'))
    fireEvent.click(eye('Annotations'))
    expect(useGraph.getState().graph).toBe(true)
  })

  it('Site: two presses leave the terrain’s look as it was', () => {
    start(withGround())
    act(() => useTerrainView.getState().setShow('off'))
    render(<App />)
    open('Site')
    fireEvent.click(eye('Site'))
    expect(hidden()).toContain('boundary')
    fireEvent.click(eye('Site'))
    expect(hidden()).toEqual([])
    expect(useTerrainView.getState().show).toBe('off')
    // on, it stays on through a hide and a show
    act(() => useTerrainView.getState().setShow('slope'))
    fireEvent.click(eye('Site'))
    fireEvent.click(eye('Site'))
    expect(useTerrainView.getState().show).toBe('slope')
  })

  it('Reference: the Grid keeps its own eye; the branch has none, and the snap’s switch is not touched', () => {
    act(() => useSnapSettings.setState({ settings: { ...useSnapSettings.getState().settings, grid: false } }))
    render(<App />)
    open('Reference')
    expect(within(item('Reference')).queryByRole('button', { name: /^(Show|Hide) Reference$/ })).toBeNull()
    expect(useSnapSettings.getState().settings.grid).toBe(false)
    fireEvent.click(eye('Grid'))
    expect(useSnapSettings.getState().settings.grid).toBe(true)
  })
})

describe('a padlock', () => {
  it('locks a mass: project data, one undo step', () => {
    render(<App />)
    open('Building 1', 'L1')
    const before = s().history
    fireEvent.click(padlock('Warehouse 1'))
    expect(s().project.masses.find((m) => m.id === 'm1')!.locked).toBe(true)
    expect(padlock('Warehouse 1')).toHaveAttribute('aria-pressed', 'true')
    expect(s().history).not.toBe(before)
    act(() => s().undo())
    expect(s().project.masses.find((m) => m.id === 'm1')!.locked).toBeUndefined()
    expect(padlock('Warehouse 1')).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(padlock('Warehouse 1'))
    fireEvent.click(padlock('Warehouse 1'))
    expect(s().project.masses.find((m) => m.id === 'm1')!.locked).toBeUndefined()
    expect(padlock('Warehouse 1')).toHaveAttribute('title', 'Lock: seen, not picked, not changed')
  })

  it('a building’s padlock is its own flag and reads mixed while it is off and a mass is locked; a level’s reads its masses’, Buildings’ its buildings’', () => {
    render(<App />)
    open('Building 1', 'L1')
    fireEvent.click(padlock('Warehouse 1'))
    expect(padlock('Building 1')).toHaveAttribute('aria-pressed', 'mixed')
    expect(padlock('L1')).toHaveAttribute('aria-pressed', 'mixed')
    expect(padlock('Buildings')).toHaveAttribute('aria-pressed', 'mixed')
    // a press on a mixed one locks the building: its flag, which holds every mass in it (the level reads locked)
    fireEvent.click(padlock('Building 1'))
    expect(s().project.buildings.find((b) => b.id === 'b1')!.locked).toBe(true)
    expect(padlock('Building 1')).toHaveAttribute('aria-pressed', 'true')
    expect(padlock('L1')).toHaveAttribute('aria-pressed', 'true')
    expect(padlock('Buildings')).toHaveAttribute('aria-pressed', 'mixed')
    // one undo step
    act(() => s().undo())
    expect(s().project.buildings.find((b) => b.id === 'b1')!.locked).toBeUndefined()
    expect(s().project.masses.filter((m) => m.locked).map((m) => m.id)).toEqual(['m1'])
    // Buildings: a press on the mixed row locks every building; the next one frees them all, and the masses locked one by one
    fireEvent.click(padlock('Buildings'))
    expect(s().project.buildings.every((b) => b.locked === true)).toBe(true)
    fireEvent.click(padlock('Buildings'))
    expect(s().project.buildings.some((b) => b.locked)).toBe(false)
    expect(s().project.masses.some((m) => m.locked)).toBe(false)
  })

  it('an existing road’s is its own flag (Phase PE.2), and the Existing roads row reads them all: one undo step', () => {
    render(<App />)
    open('Circulation', 'Existing roads')
    expect(padlock('South street')).toHaveAttribute('aria-pressed', 'false')
    expect(padlock('Existing roads')).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(padlock('South street'))
    expect(s().project.site.existingRoads![0].locked).toBe(true)
    expect(padlock('South street')).toHaveAttribute('aria-pressed', 'true')
    expect(padlock('Existing roads')).toHaveAttribute('aria-pressed', 'mixed')
    act(() => s().undo())
    expect(s().project.site.existingRoads![0].locked).toBeUndefined()
    // the branch's press locks every existing road, the next frees them
    fireEvent.click(padlock('Existing roads'))
    expect(s().project.site.existingRoads!.every((r) => r.locked === true)).toBe(true)
    expect(padlock('Existing roads')).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(padlock('Existing roads'))
    expect(s().project.site.existingRoads!.some((r) => r.locked)).toBe(false)
  })

  it('a drawing layer’s, a file’s parcels’ and a file’s together', () => {
    render(<App />)
    open('Site', 'Drawings', 'civil.dwg')
    fireEvent.click(padlock('A-SITE'))
    expect(s().project.site.drawings![0].layers[0].locked).toBe(true)
    // the layer C-ROAD was locked, the file’s parcels start locked: the file reads locked now, and a press unlocks all of it
    expect(padlock('civil.dwg')).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(padlock('civil.dwg'))
    expect(s().project.site.drawings![0].layers.every((l) => !l.locked)).toBe(true)
    expect(s().project.site.parcels![0].unlocked).toBe(true)
    // one undo step
    act(() => s().undo())
    expect(s().project.site.drawings![0].layers.every((l) => l.locked)).toBe(true)
    // the parcels' own padlock
    fireEvent.click(padlock('Parcels'))
    expect(s().project.site.parcels![0].unlocked).toBe(true)
  })

  it('a row with no padlock in the project’s data has none: a gate’s, a lot’s and the Streets row have one now (rowPadlocks.test.tsx)', () => {
    render(<App />)
    open('Site', 'Circulation')
    for (const name of ['Boundary', 'Site']) expect(within(item(name)).queryByRole('button', { name: `Lock ${name}` })).toBeNull()
    for (const name of ['Streets', 'Gates']) expect(within(item(name)).getByRole('button', { name: `Lock ${name}` })).toBeInTheDocument()
  })
})

describe('picking', () => {
  it('a locked mass is picked from its row and unlocked there; a click on the plan still refuses it', () => {
    render(<App />)
    open('Building 1', 'L1')
    fireEvent.click(padlock('Warehouse 1'))
    act(() => void pickOnPlan('m1'))
    expect(pickedNow().masses).toEqual([])
    expect(toast()).toBe('Locked: unlock it in Layers')
    click('Warehouse 1')
    expect(pickedNow().masses).toEqual(['m1'])
    expect(selected('Warehouse 1')).toBe(true)
    // unlocked from its row: the lock comes off, the mass stays picked
    fireEvent.click(padlock('Warehouse 1'))
    expect(s().project.masses.find((m) => m.id === 'm1')!.locked).toBeUndefined()
  })

  it('a locked drawing layer is picked from its row, a hidden one too, and still does not move', () => {
    render(<App />)
    open('Site', 'Drawings', 'frisa.dwg')
    // frisa.dwg is separated: its layer picks as a part
    fireEvent.click(padlock('ARQ-EDIF'))
    click('ARQ-EDIF')
    expect(useDrawingPick.getState().picked).toEqual([{ file: 'frisa.dwg', layer: 'ARQ-EDIF' }])
    expect(selected('ARQ-EDIF')).toBe(true)
    fireEvent.click(eye('ARQ-EDIF'))
    click('ARQ-EDIF')
    expect(useDrawingPick.getState().picked).toEqual([{ file: 'frisa.dwg', layer: 'ARQ-EDIF' }])
    // locked and hidden: nothing of it would move
    expect(pickedNow().drawings).toEqual([])
    // a joined file is picked whole by its row
    unfold('civil.dwg')
    click('civil.dwg')
    expect(useDrawingPick.getState().picked).toEqual([{ file: 'civil.dwg' }])
  })

  it('a click, Shift among siblings, Ctrl one more', () => {
    render(<App />)
    // three masses on L1: Warehouse 1, Warehouse 2, Office 1
    open('Building 1', 'L1')
    click('Warehouse 1')
    expect(pickedNow().masses).toEqual(['m1'])
    click('Office 1', { shiftKey: true })
    expect(pickedNow().masses.sort()).toEqual(['m1', 'm2', 'm3'])
    click('Warehouse 2', { ctrlKey: true })
    expect(pickedNow().masses.sort()).toEqual(['m1', 'm3'])
    click('Warehouse 2', { ctrlKey: true })
    expect(pickedNow().masses.sort()).toEqual(['m1', 'm2', 'm3'])
    click('Office 1')
    expect(pickedNow().masses).toEqual(['m3'])
    expect(selected('Office 1')).toBe(true)
    expect(selected('Warehouse 1')).toBe(false)
  })

  it('gates: a click picks, Ctrl adds; an existing road picks as the Access section did; lots too', () => {
    render(<App />)
    open('Circulation', 'Gates', 'Existing roads')
    click('Gate 1')
    expect(useAccess.getState().picked).toMatchObject({ kind: 'gate' })
    click('Gate 2', { ctrlKey: true })
    expect(pickedNow().gates).toHaveLength(2)
    expect(selected('Gate 2')).toBe(true)
    click('South street')
    expect(useAccess.getState().picked).toMatchObject({ kind: 'existing' })
    expect(pickedNow().gates).toEqual([])
    click('Existing road 2')
    expect(useAccess.getState().picked).toMatchObject({ kind: 'existing' })
    open('Parking', 'Lots')
    const lots = s().derived.circulation.lots
    click(lots[0].name)
    expect(useLots.getState().picked).toBe(lots[0].id)
    click(lots[1].name, { shiftKey: true })
    expect(pickedNow().lots.sort()).toEqual(lots.map((l) => l.id).sort())
    expect(useAccess.getState().picked).toBeNull()
  })

  it('a building row becomes the active building, a level row the plan’s level', () => {
    render(<App />)
    expect(s().level).toBe('l1')
    click('Annex')
    const annex = s().project.buildings.find((b) => b.id === fx.annex)!
    expect(s().level).toBe(annex.levels[0].id)
    expect(selected('Annex')).toBe(true)
    expect(item('Annex')).toHaveAttribute('aria-current', 'true')
    click('Building 1')
    expect(s().level).toBe('l1')
    unfold('Building 1')
    click('L1')
    expect(selected('L1')).toBe(true)
  })

  it('a row that is not an object is held by the layer pick; a row and an object are never picked together', () => {
    render(<App />)
    open('Building 1', 'L1')
    click('Warehouse 1')
    expect(pickedNow().masses).toEqual(['m1'])
    // a row: the plan’s selection empties
    click('Buildings')
    expect(useLayerPick.getState().keys).toEqual(['buildings'])
    expect(pickedNow().masses).toEqual([])
    expect(selected('Buildings')).toBe(true)
    expect(selected('Warehouse 1')).toBe(false)
    // a mass picked on the plan: the row lets go, and the mass’s row is marked
    act(() => void pickOnPlan('m2'))
    expect(useLayerPick.getState().keys).toEqual([])
    expect(selected('Buildings')).toBe(false)
    expect(selected('Warehouse 2')).toBe(true)
    // a gate through the access store lets a row go too
    click('Annotations')
    expect(useLayerPick.getState().keys).toEqual(['annotations'])
    act(() => useAccess.getState().pick({ kind: 'gate', id: fx.gate }))
    expect(useLayerPick.getState().keys).toEqual([])
    // and a row lets go of the gate
    click('Circulation')
    expect(useAccess.getState().picked).toBeNull()
    // Ctrl joins rows
    click('Annotations', { ctrlKey: true })
    expect(useLayerPick.getState().keys).toEqual(['circulation', 'annotations'])
  })

  it('Escape lets a row go, as it lets an object go', () => {
    render(<App />)
    click('Annotations')
    expect(useLayerPick.getState().keys).toEqual(['annotations'])
    act(() => handleKey(new KeyboardEvent('keydown', { key: 'Escape' })))
    expect(useLayerPick.getState().keys).toEqual([])
    expect(selected('Annotations')).toBe(false)
  })

  it('a row picked and then gone is let go (another option)', () => {
    render(<App />)
    click('Annex')
    expect(useLayerPick.getState().keys).toEqual([`building:${fx.annex}`])
    act(() => s().setOption(fx.o2))
    expect(useLayerPick.getState().keys).toEqual([])
  })

  it('what is picked on the plan scrolls its row into view when its branch is open', () => {
    render(<App />)
    open('Building 1', 'L1')
    const spy = vi.fn()
    item('Office 1').scrollIntoView = spy
    act(() => void pickOnPlan('m3'))
    expect(spy).toHaveBeenCalledWith({ block: 'nearest' })
  })
})

describe('what the Brief’s tree did, on the Buildings branch', () => {
  it('double-click renames a building: Enter keeps, Escape leaves', () => {
    render(<App />)
    fireEvent.doubleClick(nameOf('Annex'))
    const field = screen.getByRole('textbox', { name: 'Name of Annex' })
    fireEvent.change(field, { target: { value: 'North annex' } })
    fireEvent.keyDown(field, { key: 'Enter' })
    expect(s().project.buildings.find((b) => b.id === fx.annex)!.name).toBe('North annex')
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(item('North annex')).toBeInTheDocument()
    fireEvent.doubleClick(nameOf('North annex'))
    const again = screen.getByRole('textbox', { name: 'Name of North annex' })
    fireEvent.change(again, { target: { value: 'Nope' } })
    fireEvent.keyDown(again, { key: 'Escape' })
    expect(s().project.buildings.find((b) => b.id === fx.annex)!.name).toBe('North annex')
  })

  it('a building dragged onto another changes its place in the option; Alt copies it', () => {
    render(<App />)
    expect(s().project.options[0].buildingIds).toEqual(['b1', fx.annex])
    const data = new Map<string, string>()
    const dataTransfer = { setData: (k: string, val: string) => data.set(k, val), getData: (k: string) => data.get(k) ?? '', types: [] as string[], dropEffect: 'move' }
    fireEvent.dragStart(item('Annex'), { dataTransfer })
    fireEvent.dragOver(item('Building 1'), { dataTransfer })
    fireEvent.drop(item('Building 1'), { dataTransfer })
    expect(s().project.options[0].buildingIds).toEqual([fx.annex, 'b1'])
    // a copy of its own, with Alt
    fireEvent.dragStart(item('Annex'), { dataTransfer })
    // jsdom has no DragEvent: a mouse event of that type, Alt held
    fireEvent(item('Building 1'), new MouseEvent('drop', { bubbles: true, cancelable: true, altKey: true }))
    expect(s().project.buildings).toHaveLength(3)
    expect(s().project.options[0].buildingIds).toHaveLength(3)
  })

  it('masses dragged onto a building are assigned to it; Ctrl copies them', () => {
    render(<App />)
    open('Building 1', 'L1')
    const dataTransfer = { setData: () => {}, getData: () => '', types: [] as string[], dropEffect: 'move' }
    fireEvent.dragStart(item('Office 1'), { dataTransfer })
    fireEvent.dragOver(item('Annex'), { dataTransfer })
    fireEvent.drop(item('Annex'), { dataTransfer })
    const annex = s().project.buildings.find((b) => b.id === fx.annex)!
    expect(annex.levels.some((l) => s().project.masses.find((m) => m.id === 'm3')!.levelId === l.id)).toBe(true)
  })

  it('a building dragged out carries its data for a mass on the plan or the 3D', () => {
    render(<App />)
    const data = new Map<string, string>()
    fireEvent.dragStart(item('Annex'), { dataTransfer: { setData: (k: string, val: string) => data.set(k, val), getData: () => '', types: [] } })
    expect(JSON.parse(data.get('application/x-gfit-tree')!)).toEqual({ kind: 'building', id: fx.annex, optionId: 'o1' })
  })
})

describe('the right-click menus', () => {
  it('a building: today’s rows, and Link to / Copy to each other option (in *In another option ▸*)', () => {
    render(<App />)
    const menu = menuOf('Annex')
    expect(labelsOf(menu)).toEqual(expect.arrayContaining(['Select its masses', 'Properties', 'Rename', 'Hide', 'Delete', 'In another option']))
    const sub = otherOptions(menu)
    expect(labelsOf(sub)).toEqual(['Link to Second', 'Copy to Second'])
    fireEvent.click(within(sub).getByRole('menuitem', { name: 'Link to Second' }))
    expect(s().project.options.find((o) => o.id === fx.o2)!.buildingIds).toContain(fx.annex)
    expect(s().project.buildings).toHaveLength(2)
    // a notice says it, and it is one undo step
    expect(toast()).toBe('Annex is in Second too: the same building, linked.')
    act(() => s().undo())
    expect(s().project.options.find((o) => o.id === fx.o2)!.buildingIds).not.toContain(fx.annex)
    act(() => s().redo())
    expect(s().project.options.find((o) => o.id === fx.o2)!.buildingIds).toContain(fx.annex)
    // a copy of its own
    fireEvent.click(within(otherOptions(menuOf('Annex'))).getByRole('menuitem', { name: 'Copy to Second' }))
    expect(s().project.buildings).toHaveLength(3)
    expect(s().project.options.find((o) => o.id === fx.o2)!.buildingIds).toHaveLength(3)
    // linked already: the row says so
    expect(within(otherOptions(menuOf('Annex'))).getByRole('menuitem', { name: 'Link to Second' })).toBeDisabled()
  })

  it('a right-click on a level or a file that is not picked picks it alone first; on a building it picks the building but leaves the masses selected, for Assign; several buildings picked have their own menu', () => {
    render(<App />)
    click('Building 1')
    click('Annex', { ctrlKey: true })
    expect(selected('Annex')).toBe(true)
    expect(selected('Building 1')).toBe(true)
    const menu = menuOf('Annex')
    expect(labelsOf(menu)).toEqual(expect.arrayContaining(['Hide 2 buildings', 'Delete 2 buildings']))
    // a right-click on a row among the picked keeps them all
    expect(selected('Annex')).toBe(true)
    expect(selected('Building 1')).toBe(true)
    fireEvent.keyDown(window, { key: 'Escape' })
    // another one, not picked: its own menu, picked alone, and the masses selected stay selected
    act(() => useLayerPick.getState().clear())
    act(() => s().selectMany(['m1', 'm2']))
    const solo = menuOf('Building 1')
    expect(labelsOf(solo)).toEqual(expect.arrayContaining(['Rename']))
    expect(selected('Building 1')).toBe(true)
    expect(s().selection.massIds).toEqual(['m1', 'm2'])
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(s().selection.massIds).toEqual(['m1', 'm2'])
    // a level, not picked: picked alone first
    open('Building 1')
    menuOf('L1')
    expect(selected('L1')).toBe(true)
  })

  it('a mass: the plan’s menu of it (Delete, Lock, Hide, Properties…); several masses: Group too, and Delete says how many', () => {
    render(<App />)
    open('Building 1', 'L1')
    const menu = menuOf('Warehouse 2')
    expect(labelsOf(menu)).toEqual(expect.arrayContaining(['Delete', 'Lock', 'Hide', 'Properties']))
    // Group needs two: greyed with one, as the plan's menu has it
    expect(within(menu).getByRole('menuitem', { name: /^Group/ })).toBeDisabled()
    expect(pickedNow().masses).toEqual(['m2'])
    fireEvent.keyDown(window, { key: 'Escape' })
    click('Office 1', { ctrlKey: true })
    const two = menuOf('Office 1')
    expect(within(two).getByRole('menuitem', { name: /^Group/ })).toBeEnabled()
    expect(within(two).getByRole('menuitem', { name: /^Delete 2 blocks/ })).toHaveAttribute('title', 'Delete 2 blocks')
  })

  it('a level: Go to · Delete level', () => {
    render(<App />)
    open('Annex')
    const menu = menuOf('L1')
    expect(labelsOf(menu)).toEqual(['Go to L1', 'Delete level', 'Rename', 'Lock', 'Properties'])
    expect(within(menu).getByRole('menuitem', { name: /^Delete level/ })).toHaveTextContent('1 mass')
    // the building keeps one level at least
    expect(within(menu).getByRole('menuitem', { name: /^Delete level/ })).toBeDisabled()
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Go to L1' }))
    expect(s().level).toBe(s().project.buildings.find((b) => b.id === fx.annex)!.levels[0].id)
  })

  it('a drawing file: Separate layers or Join layers · Remove', () => {
    render(<App />)
    open('Site', 'Drawings')
    expect(labelsOf(menuOf('civil.dwg'))).toEqual(['Separate layers', 'On top', 'Remove', 'Lock', 'Hide', 'Properties'])
    fireEvent.click(screen.getByRole('menuitem', { name: 'Separate layers' }))
    expect(s().project.site.drawings![0].split).toBe(true)
    expect(labelsOf(menuOf('civil.dwg'))).toEqual(['Join layers', 'On top', 'Remove', 'Lock', 'Hide', 'Properties'])
    fireEvent.click(screen.getByRole('menuitem', { name: 'Remove' }))
    expect(s().project.site.drawings!.map((d) => d.file)).toEqual(['frisa.dwg'])
    expect(s().project.site.parcels ?? []).toEqual([])
  })
})

describe('review: the building’s right-click and its menu', () => {
  /** The fixture with a third building of the option, the Depot. */
  const withDepot = () => {
    const p = actions.addBuilding(fx.project, { optionId: 'o1', name: 'Depot' }).project
    start(p)
  }

  it('Building 1 and Annex picked, a right-click on Depot picks Depot alone: its own menu, not the several buildings’; the masses selected stay', () => {
    withDepot()
    render(<App />)
    click('Building 1')
    click('Annex', { ctrlKey: true })
    expect(selected('Annex')).toBe(true)
    const menu = menuOf('Depot')
    expect(menu).toHaveAccessibleName('Depot')
    expect(labelsOf(menu)).toEqual(expect.arrayContaining(['Assign selection to Depot', 'Rename', 'Delete']))
    expect(labelsOf(menu).join()).not.toMatch(/2 buildings/)
    expect(selected('Depot')).toBe(true)
    expect(selected('Building 1')).toBe(false)
    expect(selected('Annex')).toBe(false)
    expect(useLayerPick.getState().keys).toEqual(['building:' + s().project.buildings.find((b) => b.name === 'Depot')!.id])
  })

  it('the masses selected stay selected under that right-click, so Assign selection to Depot still works', () => {
    withDepot()
    render(<App />)
    act(() => s().selectMany(['m1', 'm2']))
    const menu = menuOf('Depot')
    expect(s().selection.massIds).toEqual(['m1', 'm2'])
    expect(selected('Depot')).toBe(true)
    fireEvent.click(within(menu).getByRole('menuitem', { name: /^Assign selection to Depot/ }))
    const depot = s().project.buildings.find((b) => b.name === 'Depot')!
    const levels = new Set(depot.levels.map((l) => l.id))
    expect(s().project.masses.filter((m) => levels.has(m.levelId)).map((m) => m.id).sort()).toEqual(['m1', 'm2'])
  })

  it('a right-click on a row among the picked keeps them and opens the several-buildings menu', () => {
    withDepot()
    render(<App />)
    click('Building 1')
    click('Depot', { ctrlKey: true })
    const menu = menuOf('Depot')
    expect(labelsOf(menu)).toEqual(expect.arrayContaining(['Hide 2 buildings', 'Delete 2 buildings']))
    expect(selected('Building 1')).toBe(true)
    expect(selected('Depot')).toBe(true)
  })

  it('In another option: Link to and Copy to for every other option, not the first six', () => {
    let p = fx.project
    for (let i = 3; i <= 11; i++) p = addOption(p, { name: `Option ${i}` }).project
    start(p)
    render(<App />)
    const rows = labelsOf(otherOptions(menuOf('Annex')))
    const others = p.options.filter((o) => o.id !== 'o1').map((o) => o.name)
    expect(others).toHaveLength(10)
    for (const name of others) expect(rows, name).toEqual(expect.arrayContaining([`Link to ${name}`, `Copy to ${name}`]))
    expect(rows.filter((r) => r?.startsWith('Link to '))).toHaveLength(10)
  })

  it('Delete is off, with the reason, while a mass of the building is locked (the verb refuses it whole); Remove from the option is not refused', () => {
    // Annex is in Second too: the menu has Remove from Option 1
    let p = fx.project
    const shown = p.options.find((o) => o.id === fx.o2)!
    p = { ...p, options: p.options.map((o) => (o.id === shown.id ? { ...o, buildingIds: [...o.buildingIds, fx.annex] } : o)) }
    const annexMass = p.masses.find((m) => p.buildings.find((b) => b.id === fx.annex)!.levels.some((l) => l.id === m.levelId))!
    start(actions.toggleMassLock(p, annexMass.id))
    render(<App />)
    const menu = menuOf('Annex')
    const del = within(menu).getByRole('menuitem', { name: 'Delete' })
    expect(del).toBeDisabled()
    expect(del).toHaveAttribute('title', 'A locked block: unlock first')
    // the other options keep it, so taking it out of this one changes no mass: not refused
    expect(within(menu).getByRole('menuitem', { name: /^Remove from/ })).toBeEnabled()
    fireEvent.keyDown(window, { key: 'Escape' })
    // a building with nothing locked is deleted as before
    expect(within(menuOf('Building 1')).getByRole('menuitem', { name: 'Delete' })).toBeEnabled()
  })

  it('several buildings: Delete N and Remove N are off while a mass that would go is locked', () => {
    const p0 = actions.addBuilding(fx.project, { optionId: 'o1', name: 'Depot' }).project
    const annexMass = p0.masses.find((m) => p0.buildings.find((b) => b.id === fx.annex)!.levels.some((l) => l.id === m.levelId))!
    start(actions.toggleMassLock(p0, annexMass.id))
    render(<App />)
    click('Annex')
    click('Depot', { ctrlKey: true })
    const menu = menuOf('Depot')
    const del = within(menu).getByRole('menuitem', { name: /^Delete 2 buildings/ })
    expect(del).toBeDisabled()
    expect(del).toHaveAttribute('title', 'A locked block: unlock first')
    expect(within(menu).getByRole('menuitem', { name: /^Remove 2 from/ })).toBeDisabled()
  })
})

describe('the new verbs', () => {
  it('the Buildings row’s ＋ makes a building in the option in view, as Design › New building', () => {
    render(<App />)
    const n = s().project.buildings.length
    fireEvent.click(within(item('Buildings')).getByRole('button', { name: 'New building' }))
    expect(s().project.buildings).toHaveLength(n + 1)
    const made = s().project.buildings.at(-1)!
    expect(s().project.options[0].buildingIds).toContain(made.id)
    expect(item(made.name)).toBeInTheDocument()
    act(() => s().undo())
    expect(s().project.buildings).toHaveLength(n)
  })

  it('the Drawings row has a ＋ for a site with a boundary, and none without', () => {
    render(<App />)
    open('Site')
    expect(within(item('Drawings')).getByRole('button', { name: 'Add drawing…' })).toBeInTheDocument()
  })

  it('the plan’s menu of a mass: Program, a tick on its own, No program', () => {
    render(<App />)
    act(() => void pickOnPlan('m1'))
    // the *Program ▸* sub-menu: each program, then No program
    const rows = (): Leaf[] => ((rowKeyed(planMenu(), 'program') as { items: Leaf[] }).items)
    expect(rows().map((r) => r.label)).toEqual(['Warehouse', 'Office', 'Guard house', 'Outdoor storage', 'No program'])
    const ticked = () => rows().filter((r) => r.checked).map((r) => r.label)
    expect(ticked()).toEqual(['Warehouse'])
    act(() => rows().find((r) => r.label === 'Office')!.onSelect())
    expect(s().project.masses.find((m) => m.id === 'm1')!.programId).toBe('office')
    expect(ticked()).toEqual(['Office'])
    act(() => rows().find((r) => r.label === 'No program')!.onSelect())
    expect(s().project.masses.find((m) => m.id === 'm1')!.programId).toBeNull()
    expect(ticked()).toEqual(['No program'])
    // one undo step each
    act(() => s().undo())
    expect(s().project.masses.find((m) => m.id === 'm1')!.programId).toBe('office')
  })

  it('every program of the brief has its row, not the first eight', () => {
    let p = fx.project
    for (let i = 0; i < 12; i++) p = actions.addProgram(p, { name: `Extra ${i + 1}` }).project
    start(p)
    render(<App />)
    act(() => void pickOnPlan('m1'))
    const labels = (rowKeyed(planMenu(), 'program') as { items: Leaf[] }).items.map((r) => r.label).filter((l) => l !== 'No program')
    expect(labels).toEqual(p.programs.map((g) => g.name))
    expect(labels).toHaveLength(p.programs.length)
    expect(p.programs.length).toBeGreaterThan(8)
  })

  it('with nothing picked the menu has no Program: the verbs of a kind are not offered to nothing', () => {
    render(<App />)
    expect(rowKeyed(planMenu(), 'program')).toBeUndefined()
    expect(leaf(planMenu(), 'paste')).toBeDefined()
  })

  it('Design › New building is in the menu once', async () => {
    const { commandOf } = await import('../../commands/index.ts')
    expect(commandOf('design.building.new')).toMatchObject({ label: 'New building', menu: ['Design'] })
  })
})

describe('the tree is not rebuilt on a pointer move', () => {
  it('the plan’s hover draws the tree no more', () => {
    render(<App />)
    const built = vi.mocked(layerTree).mock.calls.length
    expect(built).toBeGreaterThan(0)
    for (const p of [{ x: 100, y: 100 }, { x: 140, y: 120 }, { x: 320, y: 110 }]) fireEvent.pointerMove(plan(), at(p))
    expect(vi.mocked(layerTree).mock.calls.length).toBe(built)
    // a change that matters rebuilds it
    act(() => s().apply((p) => actions.updateMass(p, 'm3', { name: 'Front office' })))
    expect(vi.mocked(layerTree).mock.calls.length).toBeGreaterThan(built)
  })
})

describe('the tree is not rebuilt while a drag is in progress', () => {
  /** A drag's preview: the mass is renamed on every pointer move (a tree rebuilt from it would show the new name). */
  const move = (i: number) => act(() => s().preview((p) => actions.updateMass(p, 'm3', { name: `Dragged ${i}` })))

  it('N previews draw no tree and no row; the drop shows the result, once', () => {
    render(<App />)
    open('Building 1', 'L1')
    expect(item('Office 1')).toBeInTheDocument()
    const built = vi.mocked(layerTree).mock.calls.length
    const rendered = rowRenders.n
    for (let i = 1; i <= 5; i++) move(i)
    expect(s().dragStart).not.toBeNull()
    expect(vi.mocked(layerTree).mock.calls.length).toBe(built)
    expect(rowRenders.n).toBe(rendered)
    // it shows the tree of before the drag
    expect(items('Office 1')).toHaveLength(1)
    expect(items('Dragged 5')).toHaveLength(0)
    act(() => s().commit())
    expect(vi.mocked(layerTree).mock.calls.length).toBe(built + 1)
    expect(items('Dragged 5')).toHaveLength(1)
    expect(items('Office 1')).toHaveLength(0)
  })

  it('a cancelled drag leaves the tree as it was: at most one rebuild (the result is derived again), the same rows', () => {
    render(<App />)
    open('Building 1', 'L1')
    const built = vi.mocked(layerTree).mock.calls.length
    for (let i = 1; i <= 3; i++) move(i)
    expect(vi.mocked(layerTree).mock.calls.length).toBe(built)
    act(() => s().cancel())
    expect(vi.mocked(layerTree).mock.calls.length).toBeLessThanOrEqual(built + 1)
    expect(items('Office 1')).toHaveLength(1)
    expect(items('Dragged 3')).toHaveLength(0)
  })

  it('Properties does not build it either (the row picked stays as it was)', () => {
    start(fx.project, { rail: 'properties' })
    act(() => useLayerPick.getState().set(['boundary']))
    render(<App />)
    const built = vi.mocked(layerTree).mock.calls.length
    expect(built).toBeGreaterThan(0)
    for (let i = 1; i <= 5; i++) move(i)
    expect(vi.mocked(layerTree).mock.calls.length).toBe(built)
    act(() => s().commit())
    expect(vi.mocked(layerTree).mock.calls.length).toBeGreaterThan(built)
  })
})

describe('review: a lot, a gate, an existing road picked from its row puts the tool down', () => {
  it('a lot', () => {
    render(<App />)
    open('Parking', 'Lots')
    act(() => void take('lot'))
    expect(useHand.getState().tool).toBe('lot')
    click('Lot 1')
    expect(useHand.getState().tool).toBe('select')
    expect(useLots.getState().picked).not.toBeNull()
  })

  it('a gate, and an existing road', () => {
    render(<App />)
    open('Circulation', 'Gates', 'Existing roads')
    act(() => void take('gate'))
    click('Gate 1')
    expect(useHand.getState().tool).toBe('select')
    expect(useAccess.getState().picked).toEqual({ kind: 'gate', id: fx.gate })
    act(() => void take('lot'))
    click('Existing road 2')
    expect(useHand.getState().tool).toBe('select')
  })

  it('the select tool stays as it is', () => {
    render(<App />)
    open('Circulation', 'Gates')
    click('Gate 1')
    expect(useHand.getState().tool).toBe('select')
  })
})

describe('review: the three switch eyes are named by what they run', () => {
  it('Grid, Terrain and Program graph carry their switch’s title; a key’s eye keeps Show / Hide', () => {
    const p = fx.project
    start({ ...p, site: { ...p.site, terrain: { contours: [{ points: [{ x: 0, y: 0 }, { x: 100, y: 0 }], z: 5 }, { points: [{ x: 0, y: 50 }, { x: 100, y: 50 }], z: 6 }], points: [] } } })
    render(<App />)
    open('Reference', 'Site', 'Annotations')
    expect(eye('Grid')).toHaveAttribute('title', SWITCH_TITLES.grid)
    expect(eye('Terrain')).toHaveAttribute('title', SWITCH_TITLES.terrain)
    expect(eye('Program graph')).toHaveAttribute('title', SWITCH_TITLES.graph)
    expect(SWITCH_TITLES.grid).toBe('The grid snap (F9)')
    expect(eye('Boundary')).toHaveAttribute('title', 'Hide Boundary')
    expect(eye('Labels')).toHaveAttribute('title', 'Hide Labels')
    // a branch's eye is not a switch's
    expect(eye('Annotations')).toHaveAttribute('title', 'Hide Annotations')
  })
})

describe('a project with no site, with no buildings and a typology without parking', () => {
  it('draws what there is and nothing else', () => {
    const p = demoProject()
    const bare = { ...p, site: { ...p.site, boundary: null, existingRoads: undefined, gates: undefined }, options: p.options.map((o) => ({ ...o, gates: undefined })), typology: p.typology }
    start(bare)
    render(<App />)
    expect(items('Site')).toHaveLength(0)
    open('Circulation')
    for (const gone of ['Gates', 'Existing roads']) expect(items(gone)).toHaveLength(0)
    expect(item('Buildings')).toBeInTheDocument()
    expect(item('Annotations')).toBeInTheDocument()
  })
})
