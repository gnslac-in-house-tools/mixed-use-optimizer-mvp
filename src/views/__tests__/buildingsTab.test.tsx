// B.4 (Decisions "Buildings layout", "Buildings panel"): the active building (Properties), the option switch in the top bar, the Summary and the KPIs by building, and the store keeping the active level
// inside the active option. The demo is Building 1 (b1: m1, m2, m3 on l1) in Option 1 (o1); `project()` adds
// Building 2 to Option 1 (the Shed on its L1) and an Option 2 that shows only Building 2 (linked).
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Project } from '../../model/schema.ts'
import { App } from '../../App.tsx'
import { derive } from '../../engine/derive.ts'
import { kpiCatalog, readKpi } from '../../modules/catalog.ts'
import { addBuilding, addOption, updateBuilding } from '../../state/actions/buildings.ts'
import { addLevelAtEnd } from '../../state/actions/levels.ts'
import { addMass } from '../../state/actions/masses.ts'
import { demoProject } from '../../state/demo.ts'
import { emptyHistory } from '../../state/history.ts'
import { NO_SELECTION, useApp } from '../../state/store.ts'
import { useBuildingView } from '../buildingView.ts'
import { useToast } from '../layout/toast.ts'
import { useUi } from '../layout/ui.ts'
import { resetTyped } from '../editing/dimension/typed.ts'
import { REFERENCE_DEFAULT, useReference } from '../plan/reference.ts'
import { useDimensions } from '../plan/tools/toolState.ts'
import { letGo } from '../tools/hand.ts'

vi.mock('../scene/Scene.tsx', () => ({ Scene: () => <div data-testid="scene" /> }))

const rect = (x: number, y: number, w: number, d: number) => ({ kind: 'rect' as const, center: { x, y }, width: w, depth: d, rotation: 0 })

function project(): { p: Project; b2: string; l1: string; shed: string; o2: string } {
  const b = addBuilding(demoProject(), { optionId: 'o1' })
  const shed = addMass(b.project, { programId: 'warehouse', footprint: rect(300, 215, 40, 20), levelId: b.levelId, name: 'Shed' })
  const o2 = addOption(shed.project, { buildingIds: [b.id] })
  return { p: o2.project, b2: b.id, l1: b.levelId, shed: shed.id, o2: o2.id }
}

function start(p: Project, option = 'o1') {
  useApp.setState({ project: p, derived: derive(p, option), history: emptyHistory(), dragStart: null, selection: NO_SELECTION, level: 'l1', showAll: false, option })
}

beforeEach(() => {
  localStorage.clear()
  useUi.setState({ dialog: null, view: 'plan', rail: 'layers', panels: { left: true, right: true }, sheet: null })
  letGo()
  useDimensions.setState({ selected: null })
  resetTyped()
  useReference.setState(REFERENCE_DEFAULT)
  useBuildingView.setState({ colorBy: 'program' })
  useToast.setState({ toast: null, confirmation: null })
})

const s = () => useApp.getState()
// the active building's settings are in Properties (Decision "Workspace layout"); the tree of the options, buildings and masses that was
// the Brief tab's is Layers' Buildings branch (layers/__tests__/buildingRows.test.tsx)
const showTab = (t: 'layers' | 'properties') => act(() => useUi.setState({ rail: t }))
const active = () => {
  showTab('properties')
  return screen.getByRole('region', { name: 'Active building' })
}
const building = (id: string) => s().project.buildings.find((b) => b.id === id)!

describe('the active building', () => {
  it('name, colour, Context and level height; no + Level: the levels are the ones the masses make', () => {
    start(demoProject())
    render(<App />)
    const field = within(active()).getByRole('textbox', { name: 'Name' })
    fireEvent.change(field, { target: { value: 'Main' } })
    fireEvent.blur(field)
    expect(building('b1').name).toBe('Main')
    fireEvent.click(within(active()).getByRole('radio', { name: 'Colour 3' }))
    expect(building('b1').color).toBe('#59a14f')
    fireEvent.click(within(active()).getByRole('checkbox', { name: /^Context/ }))
    expect(building('b1').context).toBe(true)
    const height = within(active()).getByRole('textbox', { name: /^Level height/ })
    fireEvent.change(height, { target: { value: '9' } })
    fireEvent.blur(height)
    expect(building('b1').levelHeight).toBe(9)
    expect(within(active()).queryByRole('button', { name: /^\+ Level/ })).toBeNull()
  })

  it('Remove from option only for a building another option shows too (Decision "No loose buildings"); Delete takes the rest', () => {
    const { p, b2, l1 } = project()
    start(p)
    render(<App />)
    // Building 1 is only Option 1's: taking it out would delete it, so only Delete is offered (it asks: three masses)
    expect(within(active()).queryByRole('button', { name: 'Remove from Option 1' })).toBeNull()
    fireEvent.click(within(active()).getByRole('button', { name: 'Delete' }))
    fireEvent.click(within(screen.getByRole('alertdialog', { name: 'Confirm' })).getByRole('button', { name: 'Continue' }))
    expect(s().project.options[0].buildingIds).toEqual([b2])
    expect(s().project.buildings.some((b) => b.id === 'b1')).toBe(false)
    expect(s().level).toBe(l1)
    expect(screen.queryByRole('group', { name: 'Not in any option' })).toBeNull()
    // Building 2 is in Option 2 too, and now the only one of Option 1: it stays, and cannot be taken out or deleted
    expect(within(active()).getByRole('button', { name: 'Remove from Option 1' })).toBeDisabled()
    expect(within(active()).getByRole('button', { name: 'Delete' })).toBeDisabled()
    // a new, empty building can go
    showTab('layers')
    fireEvent.click(within(screen.getByRole('treeitem', { name: 'Buildings' })).getByRole('button', { name: 'New building' }))
    const made = s().project.buildings.at(-1)!
    fireEvent.click(within(active()).getByRole('button', { name: 'Delete' }))
    expect(s().project.buildings.some((b) => b.id === made.id)).toBe(false)
    expect(s().level).toBe(l1)
  })

  it('Make unique: the active option gets a copy and the plan goes to it; the other option keeps the original', () => {
    const { p, b2, o2 } = project()
    start(p, o2)
    act(() => s().setLevel(building(b2).levels[0].id))
    render(<App />)
    fireEvent.click(within(active()).getByRole('button', { name: 'Make unique in Option 2' }))
    const copy = s().project.buildings.at(-1)!
    expect(copy.name).toBe('Building 2 · Option 2')
    expect(s().project.options.find((o) => o.id === o2)!.buildingIds).toEqual([copy.id])
    expect(s().project.options[0].buildingIds).toEqual(['b1', b2])
    expect(s().level).toBe(copy.levels[0].id)
    expect(within(active()).queryByRole('button', { name: /Make unique/ })).toBeNull()
  })
})

describe('the option switch', () => {
  const menu = () => screen.getByRole('menu', { name: 'Design options' })
  const openMenu = () => fireEvent.click(screen.getByRole('button', { name: /^Design option:/ }))

  it('lists the options; New option, Duplicate (linked), Rename and Delete', () => {
    start(demoProject())
    render(<App />)
    expect(screen.getByRole('button', { name: 'Design option: Option 1' })).toBeInTheDocument()
    openMenu()
    expect(within(menu()).getByRole('menuitemradio', { name: /Option 1/ })).toHaveAttribute('aria-checked', 'true')
    expect(within(menu()).getByRole('menuitem', { name: 'Delete Option 1' })).toBeDisabled()
    expect(within(menu()).getByRole('menuitem', { name: /Compare/ })).toBeDisabled()
    fireEvent.click(within(menu()).getByRole('menuitem', { name: 'Duplicate (linked)' }))
    const two = s().project.options[1]
    expect(two.buildingIds).toEqual(['b1'])
    expect(s().option).toBe(two.id)
    expect(screen.getByRole('button', { name: 'Design option: Option 2' })).toBeInTheDocument()
    // rename
    openMenu()
    fireEvent.click(within(menu()).getByRole('menuitem', { name: 'Rename…' }))
    const field = within(menu()).getByRole('textbox', { name: 'Option name' })
    fireEvent.change(field, { target: { value: 'Scheme B' } })
    fireEvent.keyDown(field, { key: 'Enter' })
    expect(s().project.options[1].name).toBe('Scheme B')
    // back to Option 1, then delete Scheme B from it
    openMenu()
    fireEvent.click(within(menu()).getByRole('menuitemradio', { name: /Option 1/ }))
    expect(s().option).toBe('o1')
    openMenu()
    fireEvent.click(within(menu()).getByRole('menuitem', { name: 'New option' }))
    expect(s().project.options).toHaveLength(3)
    expect(s().option).toBe(s().project.options[2].id)
    openMenu()
    fireEvent.click(within(menu()).getByRole('menuitem', { name: 'Delete Option 2' }))
    expect(s().project.options.map((o) => o.name)).toEqual(['Option 1', 'Scheme B'])
    expect(s().option).toBe('o1')
  })
})

describe('the Summary and the KPIs by building', () => {
  it('the Summary lists the option’s buildings with their figures; context last, not counted', () => {
    const { p, b2 } = project()
    start(updateBuilding(p, b2, { context: true }))
    render(<App />)
    const rows = within(screen.getByRole('region', { name: 'By building' })).getAllByRole('row').slice(1)
    expect(rows.map((r) => r.getAttribute('data-building-row'))).toEqual(['b1', b2])
    expect(rows[0]).toHaveTextContent('Building 1')
    expect(rows[0]).toHaveTextContent('24,800 m²') // 12,800 + 11,200 + 800
    expect(rows[1]).toHaveTextContent('context, not counted')
    expect(rows[1]).toHaveTextContent('800 m²')
  })

  it('one KPI per design building, its GFA; — while the option does not show it', () => {
    const { p, b2, o2 } = project()
    const ids = kpiCatalog(p).map((k) => k.id)
    expect(ids).toContain('building:b1')
    expect(ids).toContain(`building:${b2}`)
    expect(readKpi('building:b1', p, derive(p, 'o1'))).toMatchObject({ label: 'Building 1 GFA', value: 24800 })
    expect(readKpi('building:b1', p, derive(p, o2))!.value).toBeNull()
    const q = updateBuilding(p, b2, { context: true })
    expect(kpiCatalog(q).map((k) => k.id)).not.toContain(`building:${b2}`)
  })
})

describe('the store keeps the plan in the active option', () => {
  it('a building taken out of the option sends the plan to the option’s first; its masses leave the selection', () => {
    const { p, b2, l1, shed } = project()
    start(p)
    s().selectMany(['m1', shed])
    s().apply((q) => ({ ...q, options: q.options.map((o) => (o.id === 'o1' ? { ...o, buildingIds: [b2] } : o)) }))
    expect(s()).toMatchObject({ level: l1, selection: { massIds: [shed] } })
    // undo brings Building 1 back, and the level stays where it is
    s().undo()
    expect(s().level).toBe(l1)
  })

  it('addLevelAtEnd with a height: the new level takes it, above and below', () => {
    const up = addLevelAtEnd(demoProject(), 'above', 'b1', 6)
    expect(up.project.buildings[0].levels.at(-1)).toMatchObject({ elevation: 12, height: 6 })
    const down = addLevelAtEnd(demoProject(), 'below', 'b1', 4)
    expect(down.project.buildings[0].levels[0]).toMatchObject({ name: 'B1', elevation: -4, height: 4 })
  })
})
