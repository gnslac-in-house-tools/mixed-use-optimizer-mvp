// The levels' buttons (Decision "Levels", 2.9c): the rail with its mini-section, the levels table (in Properties of a building since
// Phase AS.3), copy a mass up or down in Properties. (The Levels tab's list of levels, its menu and its *Building* filter went with the
// tab: the levels are rows of the Layers tree, see layers/__tests__/levelRows.test.tsx.) Some cases are ported from Plaza-Practiko
// `vistas/paneles/__tests__/nivelesTodos.test.tsx`.
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Project } from '../../model/schema.ts'
import { App } from '../../App.tsx'
import { derive } from '../../engine/derive.ts'
import { addBuilding } from '../../state/actions/buildings.ts'
import { addLevelAtEnd, updateLevel } from '../../state/actions/levels.ts'
import { addMass } from '../../state/actions/masses.ts'
import { demoProject } from '../../state/demo.ts'
import { emptyHistory } from '../../state/history.ts'
import { useApp } from '../../state/store.ts'
import { useUi } from '../layout/ui.ts'
import { useToast } from '../layout/toast.ts'
import { commitGumball } from '../scene/Gumball.tsx'
import { REFERENCE_DEFAULT, useReference } from '../plan/reference.ts'
import { useDimensions } from '../plan/tools/toolState.ts'
import { letGo } from '../tools/hand.ts'

vi.mock('../scene/Scene.tsx', () => ({ Scene: () => <div data-testid="scene" /> }))

/** Opens Massing's Properties group (Decision "Compact panel"). */
const openProperties = () => act(() => useUi.setState({ rail: 'properties' }))

/** The demo (L1) plus L2 above with m4. */
function twoLevels(): Project {
  const up = addLevelAtEnd(demoProject(), 'above')
  return addMass(up.project, { programId: 'office', footprint: { kind: 'rect', center: { x: 120, y: 110 }, width: 60, depth: 40, rotation: 0 }, levelId: up.id }).project
}

function start(p: Project, tab: 'buildings' | 'properties' = 'buildings') {
  useApp.setState({ project: p, derived: derive(p), history: emptyHistory(), dragStart: null, selection: { massId: null, vertex: null, massIds: [] }, level: 'l1', showAll: false })
  useUi.setState({ dialog: null, view: 'plan', ...(tab === 'buildings' ? { rail: 'layers' as const } : { rail: 'properties' as const }), panels: { left: true, right: true }, sheet: null })
}

beforeEach(() => {
  localStorage.clear()
  letGo()
  useDimensions.setState({ selected: null })
  useReference.setState(REFERENCE_DEFAULT)
  start(twoLevels())
})

const rail = () => screen.getByRole('tablist', { name: 'Level' })
/** The levels of the demo's one building. */
const levels = () => useApp.getState().project.buildings[0].levels
/** A tab's name (Segmented doubles its label to fix the width). */
const names = () => within(rail()).getAllByRole('tab').map((t) => t.querySelector('span > span')!.textContent)

describe('the levels rail', () => {
  it('All above the levels, highest first; choosing All shows every level, choosing a level comes back (port)', () => {
    render(<App />)
    expect(names()).toEqual(['All', 'L2', 'L1'])
    expect(within(rail()).getByRole('tab', { name: 'L1' })).toHaveAttribute('aria-selected', 'true')
    fireEvent.click(within(rail()).getByRole('tab', { name: 'All' }))
    expect(useApp.getState().showAll).toBe(true)
    expect(within(rail()).getByRole('tab', { name: 'All' })).toHaveAttribute('aria-selected', 'true')
    fireEvent.click(within(rail()).getByRole('tab', { name: 'L2' }))
    expect(useApp.getState()).toMatchObject({ showAll: false, level: 'l2' })
  })

  it('with one level there is no All, no Ref. and no section (port)', () => {
    start(demoProject())
    render(<App />)
    expect(names()).toEqual(['L1'])
    expect(screen.queryByRole('button', { name: /^Ref\./ })).toBeNull()
    expect(document.querySelector('[data-level-section]')).toBeNull()
  })

  it('Ref.: a click on or off; ▾ or a right-click sets how many levels below and above; with none that way it says so (Decision "Reference reach")', () => {
    render(<App />)
    const ref = () => screen.getByRole('button', { name: /^Ref\./ })
    expect(ref()).toHaveTextContent('Ref.')
    // by default one below: nothing under L1
    fireEvent.click(ref())
    expect(useReference.getState().on).toBe(true)
    expect(ref()).toHaveTextContent('Ref. ↓1 —')
    fireEvent.contextMenu(ref())
    const menu = () => screen.getByRole('dialog', { name: 'Reference levels' })
    fireEvent.click(within(within(menu()).getByRole('group', { name: 'Levels above' })).getByRole('button', { name: 'All' }))
    expect(useReference.getState().reach).toEqual({ below: 1, above: Infinity })
    expect(ref()).toHaveTextContent('Ref. ↓1 ↑∞')
    fireEvent.click(within(within(menu()).getByRole('group', { name: 'Levels below' })).getByRole('button', { name: 'None' }))
    expect(ref()).toHaveTextContent('Ref. ↑∞')
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'Reference levels' })).toBeNull()
    fireEvent.click(ref())
    expect(ref()).toHaveTextContent(/^Ref\.$/)
    fireEvent.click(screen.getByRole('button', { name: 'Reference levels' }))
    expect(menu()).toBeInTheDocument()
  })

  it('the section: one span per level at elevation scale, the active one dark; a click goes to that level', () => {
    render(<App />)
    const span = (id: string) => document.querySelector(`[data-section-level="${id}"]`) as HTMLElement
    // L1 0–12 and L2 12–24: two halves of 24 m
    expect(span('l1').style.top).toBe('50%')
    expect(span('l2').style.top).toBe('0%')
    expect(span('l1').className.split(' ')).toContain('bg-ink')
    expect(span('l2').className.split(' ')).not.toContain('bg-ink')
    fireEvent.click(span('l2'))
    expect(useApp.getState().level).toBe('l2')
  })

  it('the section is a slider: pressed it goes to the level under the pointer, dragged it goes through each one, let go its handle settles on the level (as IZA’s)', () => {
    render(<App />)
    const slider = screen.getByRole('slider', { name: 'Level section' })
    // jsdom does not measure: the section is 240 px tall, from 24 m (top) to 0 (bottom)
    const area = slider.firstElementChild as HTMLElement
    vi.spyOn(area, 'getBoundingClientRect').mockReturnValue({ top: 0, bottom: 240, left: 0, right: 24, width: 24, height: 240, x: 0, y: 0, toJSON: () => ({}) })
    const handle = () => document.querySelector('[data-level-handle]') as HTMLElement
    expect(slider).toHaveAttribute('aria-valuetext', 'L1')
    expect(handle().style.top).toBe('75%') // L1's middle
    fireEvent.pointerDown(slider, { pointerId: 1, clientY: 200 })
    expect(useApp.getState().level).toBe('l1')
    fireEvent.pointerMove(slider, { pointerId: 1, clientY: 100 })
    expect(useApp.getState().level).toBe('l2')
    expect(handle().style.top).toBe(`${(100 / 240) * 100}%`) // on the pointer while dragged
    fireEvent.pointerMove(slider, { pointerId: 1, clientY: 130 })
    expect(useApp.getState().level).toBe('l1')
    fireEvent.pointerMove(slider, { pointerId: 1, clientY: 110 })
    fireEvent.pointerUp(slider, { pointerId: 1, clientY: 110 })
    expect(useApp.getState().level).toBe('l2')
    expect(handle().style.top).toBe('25%') // L2's middle
    // no more after letting go; the right button does nothing
    fireEvent.pointerMove(slider, { pointerId: 1, clientY: 200 })
    fireEvent.pointerDown(slider, { pointerId: 2, pointerType: 'mouse', button: 2, clientY: 200 })
    expect(useApp.getState().level).toBe('l2')
    // ↑ ↓ from the keyboard
    fireEvent.keyDown(slider, { key: 'ArrowDown' })
    expect(useApp.getState().level).toBe('l1')
    fireEvent.keyDown(slider, { key: 'ArrowDown' })
    expect(useApp.getState().level).toBe('l1')
    fireEvent.keyDown(slider, { key: 'ArrowUp' })
    expect(useApp.getState().level).toBe('l2')
  })

  it('the slider goes floor by floor: a ×4 level is four stops, its floor beside the handle while dragged (Decision "Floor by floor")', () => {
    act(() => useApp.getState().apply((p) => updateLevel(p, 'l2', { repeat: 4 })))
    render(<App />)
    const slider = screen.getByRole('slider', { name: 'Level section' })
    // L1 0–12, L2 ×4 12–60: 240 px, 4 px a metre
    vi.spyOn(slider.firstElementChild as HTMLElement, 'getBoundingClientRect').mockReturnValue({ top: 0, bottom: 240, left: 0, right: 24, width: 24, height: 240, x: 0, y: 0, toJSON: () => ({}) })
    const handle = () => document.querySelector('[data-level-handle]') as HTMLElement
    expect(slider).toHaveAttribute('aria-valuemax', '4')
    fireEvent.pointerDown(slider, { pointerId: 1, clientY: 120 }) // 30 m
    expect(useApp.getState().level).toBe('l2')
    expect(slider).toHaveAttribute('aria-valuetext', 'L2 · floor 2 of 4')
    expect(handle()).toHaveTextContent('L2 · floor 2 of 4')
    fireEvent.pointerMove(slider, { pointerId: 1, clientY: 40 }) // 50 m
    expect(slider).toHaveAttribute('aria-valuetext', 'L2 · floor 4 of 4')
    fireEvent.pointerUp(slider, { pointerId: 1, clientY: 40 })
    expect(handle().style.top).toBe('10%') // the 4th floor's middle, 54 m
    expect(handle()).toHaveTextContent('')
    fireEvent.keyDown(slider, { key: 'ArrowDown' })
    expect(slider).toHaveAttribute('aria-valuetext', 'L2 · floor 3 of 4')
    fireEvent.keyDown(slider, { key: 'ArrowDown' })
    fireEvent.keyDown(slider, { key: 'ArrowDown' })
    expect(slider).toHaveAttribute('aria-valuetext', 'L2 · floor 1 of 4')
    fireEvent.keyDown(slider, { key: 'ArrowDown' })
    expect(useApp.getState().level).toBe('l1')
    expect(slider).toHaveAttribute('aria-valuetext', 'L1')
  })

  it('a ×N level says so in the rail', () => {
    act(() => useApp.getState().apply((p) => updateLevel(p, 'l2', { repeat: 4 })))
    render(<App />)
    expect(within(rail()).getByRole('tab', { name: 'L2 ×4' })).toBeInTheDocument()
  })
})

describe('the levels in the Buildings tab', () => {
  it('no + and no ×: the levels are the ones the masses make; an elevation typed near another floor asks, after, whether it is that floor (Decision "Levels follow the masses")', () => {
    start(twoLevels(), 'properties')
    render(<App />)
    const tab = screen.getByRole('region', { name: 'Levels' })
    expect(within(tab).queryByRole('button', { name: /^\+ Level/ })).toBeNull()
    expect(within(tab).queryByRole('button', { name: /^Remove / })).toBeNull()
    const type = (name: string, v: string) => {
      const f = within(tab).getByRole('textbox', { name })
      fireEvent.change(f, { target: { value: v } })
      fireEvent.blur(f)
    }
    // far from any floor: nothing asked
    type('Elevation of L2', '8')
    expect(useToast.getState().toast).toBeNull()
    // 0.3 m over L1's floor: it stays there, and a quiet notice asks
    type('Elevation of L2', '0.3')
    expect(levels().map((l) => `${l.name}@${l.elevation}`)).toEqual(['L1@0', 'L2@0.3'])
    expect(screen.getByRole('status')).toHaveTextContent("L2 is 0.30 m above L1's floor. Same floor?")
    // Same floor: L2 goes onto L1's floor and the two become one (L1, the fuller, stays), m4 on it
    fireEvent.click(within(screen.getByRole('status')).getByRole('button', { name: 'Same floor' }))
    expect(levels().map((l) => l.name)).toEqual(['L1'])
    expect(useApp.getState().project.masses.find((m) => m.id === 'm4')!.levelId).toBe('l1')
    // one undo step
    act(() => useApp.getState().undo())
    expect(levels().map((l) => `${l.name}@${l.elevation}`)).toEqual(['L1@0', 'L2@0.3'])
  })

  it('a typed height or ×N moves the levels above; the GFA counts ×N', () => {
    start(twoLevels(), 'properties')
    render(<App />)
    const tab = screen.getByRole('region', { name: 'Levels' })
    const type = (name: string, v: string) => {
      const f = within(tab).getByRole('textbox', { name })
      fireEvent.change(f, { target: { value: v } })
      fireEvent.blur(f)
    }
    type('Repeats of L1', '2')
    expect(levels().find((l) => l.id === 'l2')!.elevation).toBe(24)
    type('Name of L2', 'Offices')
    expect(levels().find((l) => l.id === 'l2')!.name).toBe('Offices')
    type('Repeats of Offices', '1.5') // not a whole number: nothing changes
    expect(levels().find((l) => l.id === 'l2')!.repeat).toBe(1)
    // L1: 12,800 + 11,200 + 800, twice; L2: the office, 2,400
    expect(within(tab).getByText('Floor area (GFA)').nextSibling).toHaveTextContent('52,000')
  })
})

describe('Properties', () => {
  it('shows the mass’s level; Copy up puts a copy on the level above and goes there (port of duplicarMasa)', () => {
    render(<App />)
    openProperties()
    act(() => useApp.getState().select('m2'))
    const props = screen.getByRole('region', { name: 'Properties' })
    expect(within(props).getByText('L1')).toBeInTheDocument()
    fireEvent.click(within(props).getByRole('button', { name: 'Copy up' }))
    const copy = useApp.getState().project.masses.at(-1)!
    expect(copy.levelId).toBe('l2') // nothing over m2 on L2
    expect(useApp.getState()).toMatchObject({ level: 'l2', selection: { massId: copy.id } })
    fireEvent.click(within(screen.getByRole('region', { name: 'Properties' })).getByRole('button', { name: 'Copy up' }))
    expect(levels().map((l) => l.name)).toEqual(['L1', 'L2', 'L3'])
  })
})

describe('the gumball up and down (Decision "Levels follow the masses")', () => {
  it('a level’s only mass taken to a new height takes its level along, asking nothing; near another floor, Same floor puts it there', () => {
    render(<App />)
    // m4 is all of L2 (at 12): down to 0.3, L2 goes with it
    act(() => commitGumball(['m4'], { x: 0, y: 0, z: -11.7 }))
    expect(useToast.getState().confirmation).toBeNull()
    expect(levels().map((l) => `${l.name}@${l.elevation}`)).toEqual(['L1@0', 'L2@0.3'])
    expect(useToast.getState().toast?.text).toBe("L2 is 0.30 m above L1's floor. Same floor?")
    act(() => useToast.getState().toast!.action!.run())
    expect(levels().map((l) => l.name)).toEqual(['L1'])
    act(() => useToast.getState().close())
    // one of the demo's masses up to 20: a level of its own there; L1 keeps the others
    act(() => commitGumball(['m1'], { x: 0, y: 0, z: 20 }))
    expect(levels().map((l) => l.elevation)).toEqual([0, 20])
    expect(useToast.getState().toast?.action).toBeUndefined()
  })
})

describe('the levels rail’s building (the user: "only one level appears")', () => {
  const picker = () => screen.queryByRole('combobox', { name: 'Building shown' })

  it('one building, no picker; two in the option, the rail picks which one it shows, at its lowest level', () => {
    render(<App />)
    expect(picker()).toBeNull()
    const b = addBuilding(useApp.getState().project, { name: 'Guard house', optionId: 'o1' })
    act(() => useApp.getState().apply(() => b.project))
    expect(picker()).toHaveValue('b1')
    fireEvent.change(picker()!, { target: { value: b.project.buildings.at(-1)!.id } })
    expect(useApp.getState().level).toBe(b.levelId)
    expect(picker()).toHaveValue(b.project.buildings.at(-1)!.id)
    expect(names()).toEqual(['L1'])
  })
})
