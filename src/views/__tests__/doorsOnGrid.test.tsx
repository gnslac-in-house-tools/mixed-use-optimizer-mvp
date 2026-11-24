// Dock doors on the grid in the views (Phase G.3b, Decision "Grid layout"): the Brief's Docks column gets each docking
// program's pattern under its doors; a mass's Docks section its program's pattern or its own (Every, From, Skip,
// Mask), what it places against the brief, and its exceptions to clear; on the plan, the picked mass's modules beside
// its docked walls, a click adds or takes away a door. The demo on a 10 × 10 m grid in 4 (2.5 m modules) from
// Warehouse 1's corner: its south wall docks, 64 modules; the brief asks 19 doors of it.
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Grid } from '../../model/schema.ts'
import { actions } from '../../state/actions/index.ts'
import { demoProject } from '../../state/demo.ts'
import { useApp } from '../../state/store.ts'
import { App } from '../../App.tsx'
import { useUi } from '../layout/ui.ts'
import { DockSection } from '../../modules/docks/views/DockSection.tsx'
import { DoorSlots } from '../../modules/docks/views/DocksLayer.tsx'

const grid: Grid = { x: 10, y: 10, modules: 4, origin: { x: 40, y: 70 }, angle: 0 }
const s = () => useApp.getState()
const m1 = () => s().project.masses.find((m) => m.id === 'm1')!
const type = (name: string | RegExp, value: string) => {
  const field = screen.getByRole('textbox', { name })
  fireEvent.change(field, { target: { value } })
  fireEvent.keyDown(field, { key: 'Enter' })
  // a table's cell commits as it loses the focus
  fireEvent.blur(field)
}

beforeEach(() => {
  useApp.getState().open(demoProject())
  act(() => s().apply((p) => actions.setGrid(p, grid)))
})

describe('the Brief’s docks (a row’s rule set)', () => {
  it('on the grid, each docking program’s pattern under its doors; typed, one undo step', () => {
    act(() => useUi.getState().openDialog('brief'))
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: "Warehouse's rule set" }))
    expect(document.querySelector('[data-pattern]')!.getAttribute('data-pattern')).toBe('a door every module, the end bays skipped')
    type('Warehouse: a door every … modules', '2')
    expect(s().project.programs.find((g) => g.id === 'warehouse')!.docks!.pattern).toEqual({ every: 2, offset: 0, skip: 'ends' })
    fireEvent.change(screen.getByRole('combobox', { name: 'Warehouse: modules skipped' }), { target: { value: 'corners' } })
    expect(s().project.programs.find((g) => g.id === 'warehouse')!.docks!.pattern!.skip).toBe('corners')
    act(() => s().undo())
    expect(s().project.programs.find((g) => g.id === 'warehouse')!.docks!.pattern!.skip).toBe('ends')
  })
})

describe('a mass’s Docks section', () => {
  it('its program’s pattern or its own, against the brief; a mask typed; short of the brief, said', () => {
    render(<DockSection id="m1" muted="" />)
    expect(document.querySelector('[data-door-target]')!.textContent).toBe('60 doors · the brief asks 19')
    expect(screen.queryByRole('textbox', { name: /^Every/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Own pattern' }))
    expect(m1().doorPattern).toEqual({ every: 1, offset: 0, skip: 'ends' })
    type(/^Every/, '4')
    expect(document.querySelector('[data-door-target]')!.textContent).toBe('15 doors · the brief asks 19')
    type('Mask', '1 1 0')
    expect(m1().doorPattern!.mask).toEqual([1, 1, 0])
    expect(document.querySelector('[data-door-pattern]')!.getAttribute('data-door-pattern')).toBe('1 1 0 repeated, the end bays skipped')
    type('Mask', '1 2')
    expect(m1().doorPattern!.mask).toEqual([1, 1, 0])
    fireEvent.click(screen.getByRole('button', { name: 'No mask' }))
    expect(m1().doorPattern).toEqual({ every: 4, offset: 0, skip: 'ends' })
    fireEvent.click(screen.getByRole('button', { name: "Warehouse's" }))
    expect(m1().doorPattern).toBeUndefined()
  })
})

describe('the plan', () => {
  it('the picked mass’s modules beside its docked walls: a click takes a door away or adds one; cleared in Properties', () => {
    act(() => s().select('m1'))
    const { rerender } = render(
      <svg>
        <DoorSlots px={0.1} />
      </svg>,
    )
    const slots = document.querySelectorAll('[data-door-slot]')
    expect(slots).toHaveLength(64)
    // module 5 (index 4): the first past Building 1's end bay
    fireEvent.click(document.querySelector('[data-door-slot="0:4"]')!)
    expect(m1().doorFlips).toHaveLength(1)
    expect(s().derived.docks.targets.find((t) => t.massId === 'm1')!.doors).toBe(59)
    expect(document.querySelector('[data-door-slot="0:4"]')!.getAttribute('aria-label')).toBe('Wall 1, module 5: no door (an exception)')
    // zoomed out, the modules too thin to click: none
    rerender(
      <svg>
        <DoorSlots px={1} />
      </svg>,
    )
    expect(document.querySelector('[data-door-slot]')).toBeNull()
    render(<DockSection id="m1" muted="" />)
    fireEvent.click(within(document.querySelector('[data-door-pattern]') as HTMLElement).getByRole('button', { name: 'Clear 1 exception' }))
    expect(m1().doorFlips).toBeUndefined()
  })
})
