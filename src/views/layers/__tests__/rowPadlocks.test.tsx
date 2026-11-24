// The padlocks and eyes of the Layers rows for the five kinds (Phase AS.4 task 5, Decision "Padlocks by kind"): a building's is its own flag (on; off also frees the masses
// locked one by one; *mixed* while its flag is off and some masses are locked), a gate's and a lot's row have one, the Streets row reads locked, mixed or free from its segments
// and its click locks or frees them all; a street that is locked (or mixed) or hidden shows as a child row under Streets, a dimension that is hidden as one under
// Dimensions, each with its padlock and eye, and the row goes when the exception does; a mass has an eye of its own. Properties of a locked building says so.
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../../App.tsx'
import { derive } from '../../../engine/derive.ts'
import type { Project } from '../../../model/schema.ts'
import { actions } from '../../../state/actions/index.ts'
import { type Fixture, fixture, s, start } from '../../editing/__tests__/kindsFixture.ts'
import { pickedRefs } from '../../plan/mix.ts'
import { dimension, street, STREETS } from '../keys.ts'
import { useLayerPick } from '../layerPick.ts'
import { useLayerView } from '../layerView.ts'
import { flatRows, layerTree, type LayerRow } from '../tree.ts'

vi.mock('../../scene/Scene.tsx', () => ({ Scene: () => <div data-testid="scene" /> }))

const tree = () => screen.getByRole('tree', { name: 'Layers' })
const items = (name: string) => within(tree()).queryAllByRole('treeitem', { name })
const item = (name: string, nth = 0): HTMLElement => {
  const all = items(name)
  if (!all[nth]) throw new Error(`No row "${name}" (rows: ${within(tree()).queryAllByRole('treeitem').map((r) => r.getAttribute('aria-label')).join(', ')})`)
  return all[nth]
}
const unfold = (name: string) => fireEvent.click(within(item(name)).getByRole('button', { name: `Unfold ${name}` }))
const open = (...names: string[]) => names.forEach(unfold)
const padlock = (name: string) => within(item(name)).getByRole('button', { name: `Lock ${name}` })
const eye = (name: string) => within(item(name)).getByRole('button', { name: `Show ${name}` })
const pressed = (b: HTMLElement) => b.getAttribute('aria-pressed')
const nameOf = (name: string) => item(name).querySelector<HTMLElement>('[data-row-pick]')!
const hidden = () => useLayerView.getState().hidden
const o1 = () => s().project.options[0]

let f: Fixture
let annex: string

beforeEach(() => {
  f = fixture()
  const a = actions.addBuilding(f.project, { optionId: 'o1', name: 'Annex' })
  annex = a.id
  const p = actions.addMass(a.project, { programId: 'warehouse', footprint: { kind: 'rect', center: { x: 330, y: 215 }, width: 30, depth: 20, rotation: 0 }, levelId: a.levelId }).project
  start(p)
  useLayerView.setState({ hidden: [], onTop: [], folded: [] })
})

const rowsOf = (p: Project, off: string[] = []): LayerRow[] => flatRows(layerTree(p, 'o1', derive(p, 'o1'), { terrain: false, parking: true }, new Set(off)))
const find = (rows: LayerRow[], id: string) => rows.find((r) => r.id === id)

describe('the tree’s rows (pure)', () => {
  it('a building’s lock is its flag; mixed with its flag off and some of its masses locked; the Buildings row follows', () => {
    const p = s().project
    expect(find(rowsOf(p), `building:${annex}`)!.lock).toBe('unlocked')
    expect(find(rowsOf(actions.lockBuildings(p, [annex], true)), `building:${annex}`)!.lock).toBe('locked')
    expect(find(rowsOf(actions.lockBuildings(p, [annex], true)), 'buildings')!.lock).toBe('mixed')
    expect(find(rowsOf(actions.lockMasses(p, ['m1'], true)), 'building:b1')!.lock).toBe('mixed')
    // a locked building's masses and its levels read locked (it holds every mass in it)
    const locked = rowsOf(actions.lockBuildings(p, ['b1'], true))
    expect(locked.filter((r) => r.kind === 'mass' && r.ref?.building === 'b1').every((r) => r.lock === 'locked')).toBe(true)
  })

  it('a gate and a lot have a lock; the Gates and Lots rows hold theirs', () => {
    const p = actions.lockGates(actions.lockLots(s().project, [f.lots[0]], true), [f.gates[0]], true, 'o1')
    const rows = rowsOf(p)
    expect(find(rows, `gate:${f.gates[0]}`)!.lock).toBe('locked')
    expect(find(rows, `gate:${f.gates[1]}`)!.lock).toBe('unlocked')
    expect(find(rows, `lot:${f.lots[0]}`)!.lock).toBe('locked')
    expect(find(rows, `lot:${f.lots[1]}`)!.lock).toBe('unlocked')
    expect(find(rows, 'lots')!.lock).toBe('mixed')
    expect(find(rows, 'gates')!.lock).toBe('mixed')
  })

  it('the Streets row is free, mixed or locked from its segments; a street that is locked, mixed or hidden is a child row, one that is free and shown is not', () => {
    const p = s().project
    expect(find(rowsOf(p), 'streets')!.lock).toBe('unlocked')
    expect(find(rowsOf(p), 'streets')!.children).toBeUndefined()
    const some = actions.lockStreets(p, ['s1'], true, 'o1')
    expect(find(rowsOf(some), 'streets')!.lock).toBe('mixed')
    // the street s1–s3 is mixed: it has a row; the other, s4, has none
    expect(find(rowsOf(some), 'streets')!.children!.map((r) => r.id)).toEqual(['street:s1'])
    const all = actions.lockStreets(p, ['s1', 's2', 's3', 's4'], true, 'o1')
    expect(find(rowsOf(all), 'streets')!.lock).toBe('locked')
    expect(find(rowsOf(all), 'streets')!.children!.map((r) => r.label)).toEqual(['Street 1', 'Street 2'])
    const row = find(rowsOf(all), 'street:s1')!
    expect(row).toMatchObject({ kind: 'street', lock: 'locked', ref: { object: 'street:s1', segments: ['s1', 's2', 's3'] } })
    expect(row.eyes).toHaveLength(3)
    // hidden: all its segments' keys (Streets alone is the branch's, not an exception)
    const off = rowsOf(p, [street('s4')])
    expect(find(off, 'streets')!.children!.map((r) => r.id)).toEqual(['street:s4'])
    expect(rowsOf(p, [street('s1')]).find((r) => r.id === 'street:s1')).toBeUndefined()
    expect(rowsOf(p, [STREETS]).find((r) => r.kind === 'street')).toBeUndefined()
  })

  it('a hidden dimension is a child row of Dimensions; a mass has an eye of its own, which its level’s and building’s eyes hold', () => {
    const p = s().project
    expect(find(rowsOf(p), 'dimensions')!.children).toBeUndefined()
    const rows = rowsOf(p, [dimension(f.dim)])
    expect(find(rows, 'dimensions')!.children!.map((r) => r.id)).toEqual([`dimension:${f.dim}`])
    expect(find(rows, `dimension:${f.dim}`)).toMatchObject({ kind: 'dimension', label: 'Dimension 1', eyes: [{ key: dimension(f.dim) }] })
    expect(find(rowsOf(p), 'mass:m1')!.eyes).toEqual([{ key: 'mass:m1', via: 'building:b1' }])
    expect(find(rowsOf(p), 'level:l1')!.eyes.map((e) => ('key' in e ? e.key : ''))).toEqual(['mass:m1', 'mass:m2', 'mass:m3'])
    expect(find(rowsOf(p), 'building:b1')!.eyes[0]).toEqual({ key: 'building:b1' })
  })
})

describe('a building’s padlock', () => {
  it('a click locks its flag (and with it every mass in it); the next one frees it and the masses locked one by one', () => {
    render(<App />)
    fireEvent.click(padlock('Annex'))
    expect(s().project.buildings.find((b) => b.id === annex)!.locked).toBe(true)
    expect(pressed(padlock('Annex'))).toBe('true')
    fireEvent.click(padlock('Annex'))
    expect(s().project.buildings.find((b) => b.id === annex)).not.toHaveProperty('locked')
    expect(pressed(padlock('Annex'))).toBe('false')
    // one undo step each
    act(() => s().undo())
    expect(s().project.buildings.find((b) => b.id === annex)!.locked).toBe(true)
  })

  it('mixed while its flag is off and a mass is locked: a click locks the building; the next frees it and its masses', () => {
    const levelOf = (id: string) => s().project.buildings.find((b) => b.id === id)!.levels.map((l) => l.id)
    act(() => s().apply((p) => actions.lockMasses(p, ['m1'], true)))
    render(<App />)
    expect(pressed(padlock('Building 1'))).toBe('mixed')
    fireEvent.click(padlock('Building 1'))
    expect(s().project.buildings.find((b) => b.id === 'b1')!.locked).toBe(true)
    expect(pressed(padlock('Building 1'))).toBe('true')
    fireEvent.click(padlock('Building 1'))
    expect(s().project.buildings.find((b) => b.id === 'b1')!.locked).toBeUndefined()
    expect(s().project.masses.filter((m) => levelOf('b1').includes(m.levelId)).some((m) => m.locked)).toBe(false)
    expect(pressed(padlock('Building 1'))).toBe('false')
  })

  it('the Buildings row locks and frees every building', () => {
    render(<App />)
    fireEvent.click(padlock('Buildings'))
    expect(s().project.buildings.every((b) => b.locked === true)).toBe(true)
    fireEvent.click(padlock('Buildings'))
    expect(s().project.buildings.some((b) => b.locked)).toBe(false)
  })

  it('a mass or a level of a locked building cannot be freed alone: the notice says where', () => {
    act(() => s().apply((p) => actions.lockBuildings(p, ['b1'], true)))
    render(<App />)
    open('Building 1', 'L1')
    expect(pressed(padlock('Warehouse 1'))).toBe('true')
    fireEvent.click(padlock('Warehouse 1'))
    expect(pressed(padlock('Warehouse 1'))).toBe('true')
    expect(s().project.masses.find((m) => m.id === 'm1')!.locked).toBeUndefined()
    expect(document.body.textContent).toContain('locked with its building')
  })
})

describe('a gate’s, a lot’s and the Streets row’s padlock', () => {
  it('a gate and a lot lock and free from their rows', () => {
    render(<App />)
    open('Circulation', 'Gates', 'Parking', 'Lots')
    const lot = s().derived.circulation.lots[0].name
    fireEvent.click(padlock('Gate 1'))
    expect(s().project.options[0].gates?.[0]?.locked ?? s().project.site.gates![0].locked).toBe(true)
    expect(pressed(padlock('Gate 1'))).toBe('true')
    expect(pressed(padlock('Gates'))).toBe('mixed')
    fireEvent.click(padlock(lot))
    expect(o1().lots!.find((l) => l.id === f.lots[0])!.locked).toBe(true)
    fireEvent.click(padlock(lot))
    expect(o1().lots!.find((l) => l.id === f.lots[0])!.locked).toBeUndefined()
    fireEvent.click(padlock('Gate 1'))
    expect(pressed(padlock('Gate 1'))).toBe('false')
  })

  it('the Streets row: free; a click locks every segment; a click frees them; mixed with some locked, and a click locks all', () => {
    render(<App />)
    open('Circulation')
    expect(pressed(padlock('Streets'))).toBe('false')
    fireEvent.click(padlock('Streets'))
    expect(o1().streets!.segments.every((g) => g.locked === true)).toBe(true)
    expect(pressed(padlock('Streets'))).toBe('true')
    fireEvent.click(padlock('Streets'))
    expect(o1().streets!.segments.some((g) => g.locked)).toBe(false)
    act(() => s().apply((p) => actions.lockStreets(p, ['s4'], true, 'o1')))
    expect(pressed(padlock('Streets'))).toBe('mixed')
    fireEvent.click(padlock('Streets'))
    expect(o1().streets!.segments.every((g) => g.locked === true)).toBe(true)
  })
})

describe('a row for the exceptions', () => {
  it('a locked street appears under Streets with its padlock and eye; picking it shows its Properties, locked; freeing it takes the row away', () => {
    render(<App />)
    open('Circulation')
    expect(items('Street 1')).toHaveLength(0)
    act(() => s().apply((p) => actions.lockStreets(p, ['s1', 's2', 's3'], true, 'o1')))
    expect(item('Street 1').getAttribute('aria-level')).toBe('3')
    expect(items('Street 2')).toHaveLength(0)
    expect(pressed(padlock('Street 1'))).toBe('true')
    expect(pressed(eye('Street 1'))).toBe('true')
    // picked from its row, locked as it is: the plan does not pick it
    fireEvent.click(nameOf('Street 1'))
    expect(pickedRefs()).toEqual([{ kind: 'street', id: 'street:s1' }])
    expect(item('Street 1').getAttribute('aria-selected')).toBe('true')
    expect(useLayerPick.getState().keys).toEqual([])
    fireEvent.click(screen.getByRole('tab', { name: 'Properties' }))
    expect(screen.getByRole('region', { name: 'Properties' })).toHaveTextContent('Locked')
    fireEvent.click(screen.getByRole('tab', { name: 'Layers' }))
    // the padlock frees it, and the row goes
    fireEvent.click(padlock('Street 1'))
    expect(o1().streets!.segments.some((g) => g.locked)).toBe(false)
    expect(items('Street 1')).toHaveLength(0)
  })

  it('a hidden street appears with its eye closed; its eye shows it and the row goes', () => {
    render(<App />)
    open('Circulation')
    act(() => useLayerView.getState().setHidden(['s4'].map(street), true))
    expect(pressed(eye('Street 2'))).toBe('false')
    // Streets itself reads mixed: a street under it is hidden
    expect(pressed(eye('Streets'))).toBe('mixed')
    fireEvent.click(eye('Street 2'))
    expect(hidden()).not.toContain(street('s4'))
    expect(items('Street 2')).toHaveLength(0)
  })

  it('a street with only some segments locked is mixed: it has a row, and its padlock locks all, then frees all', () => {
    render(<App />)
    open('Circulation')
    act(() => s().apply((p) => actions.lockStreets(p, ['s2'], true, 'o1')))
    expect(pressed(padlock('Street 1'))).toBe('mixed')
    fireEvent.click(padlock('Street 1'))
    expect(o1().streets!.segments.filter((g) => g.locked).map((g) => g.id)).toEqual(['s1', 's2', 's3'])
    fireEvent.click(padlock('Street 1'))
    expect(items('Street 1')).toHaveLength(0)
  })

  it('a hidden dimension appears under Dimensions; its eye shows it and the row goes; picking it shows the dimension', () => {
    render(<App />)
    open('Annotations')
    expect(items('Dimension 1')).toHaveLength(0)
    act(() => useLayerView.getState().setHidden([dimension(f.dim)], true))
    expect(pressed(eye('Dimension 1'))).toBe('false')
    fireEvent.click(nameOf('Dimension 1'))
    expect(pickedRefs()).toEqual([{ kind: 'dimension', id: f.dim }])
    fireEvent.click(eye('Dimension 1'))
    expect(hidden()).not.toContain(dimension(f.dim))
    expect(items('Dimension 1')).toHaveLength(0)
  })

  it('the arrow keys reach the new row: ↓ from Streets goes to its child, → on the folded Circulation opens it', () => {
    render(<App />)
    open('Circulation')
    act(() => s().apply((p) => actions.lockStreets(p, ['s1', 's2', 's3'], true, 'o1')))
    nameOf('Streets').focus()
    fireEvent.keyDown(nameOf('Streets'), { key: 'ArrowDown' })
    expect(document.activeElement?.closest('[data-row-id]')?.getAttribute('aria-label')).toBe('Street 1')
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowLeft' })
    expect(document.activeElement?.closest('[data-row-id]')?.getAttribute('aria-label')).toBe('Streets')
  })

  it('when the row that had the focus goes (the street freed), the focus moves on, never to the page', () => {
    render(<App />)
    open('Circulation')
    act(() => s().apply((p) => actions.lockStreets(p, ['s1', 's2', 's3'], true, 'o1')))
    nameOf('Street 1').focus()
    act(() => s().apply((p) => actions.lockStreets(p, ['s1', 's2', 's3'], false, 'o1')))
    expect(items('Street 1')).toHaveLength(0)
    expect(document.activeElement).not.toBe(document.body)
    expect(tree().contains(document.activeElement)).toBe(true)
  })
})

describe('the eye of a mass', () => {
  it('a mass row has an eye of its own: it hides that mass alone, and the row reads dimmed', () => {
    render(<App />)
    open('Building 1', 'L1')
    expect(pressed(eye('Warehouse 1'))).toBe('true')
    fireEvent.click(eye('Warehouse 1'))
    expect(hidden()).toEqual(['mass:m1'])
    expect(pressed(eye('Warehouse 1'))).toBe('false')
    expect(document.querySelector('[data-mass="m1"]')).toBeNull()
    expect(document.querySelector('[data-mass="m2"]')).not.toBeNull()
    // the building's eye reads mixed while a mass of it is hidden; its press still hides the whole building
    expect(pressed(eye('Building 1'))).toBe('mixed')
    fireEvent.click(eye('Warehouse 1'))
    expect(hidden()).toEqual([])
  })
})

describe('Properties of what is locked says so', () => {
  it('a locked building: its settings are read-only and say where it comes off', () => {
    act(() => s().apply((p) => actions.lockBuildings(p, [annex], true)))
    render(<App />)
    fireEvent.click(nameOf('Annex'))
    fireEvent.click(screen.getByRole('tab', { name: 'Properties' }))
    const region = screen.getByRole('region', { name: 'Properties' })
    expect(region).toHaveTextContent(/Locked: unlock it in Layers/)
    expect(within(region).getByRole('textbox', { name: 'Name' })).toBeDisabled()
  })
})
