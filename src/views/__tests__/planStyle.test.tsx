// The plan's look (Decision "Plan style"; Practiko's): the masses in their colour at 85 %, an ink outline, their
// program's hatch (default by built: diagonal or paving; none without a program: the grey unassigned one), a halo
// under the selected one, labels that leave a mass too small; the Brief's swatch picks a program's colour and hatch.
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../App.tsx'
import { derive } from '../../engine/derive.ts'
import { demoProject } from '../../state/demo.ts'
import { emptyHistory } from '../../state/history.ts'
import { NO_SELECTION, useApp } from '../../state/store.ts'
import { useGraph } from '../graph/graphState.ts'
import { useUi } from '../layout/ui.ts'
import { useDetail } from '../detail.ts'
import { defaultHatch, hatchOf } from '../plan/hatches.tsx'
import { labelFits } from '../plan/planStyle.ts'

vi.mock('../scene/Scene.tsx', () => ({ Scene: () => <div data-testid="scene" /> }))

beforeEach(() => {
  localStorage.clear()
  const p = demoProject()
  useApp.setState({ project: p, derived: derive(p, 'o1'), history: emptyHistory(), dragStart: null, selection: NO_SELECTION, level: 'l1', showAll: false, option: 'o1' })
  useUi.setState({ dialog: null, view: 'plan', rail: 'layers', panels: { left: true, right: true }, sheet: null, help: false })
  useGraph.setState({ graph: false, rule: null, relation: null })
})

const s = () => useApp.getState()
const mass = (id: string) => document.querySelector(`[data-mass="${id}"]`)!
const hatchAfter = (id: string) => mass(id).nextElementSibling?.getAttribute('data-hatch') ?? null

describe('hatches and labels, pure', () => {
  it('a program’s hatch: its own, else built → diagonal, open → paving; no program → unassigned', () => {
    expect(defaultHatch({ built: true })).toBe('diagonal')
    expect(defaultHatch({ built: false })).toBe('paving')
    expect(hatchOf({ built: true, hatch: 'dots' })).toBe('dots')
    expect(hatchOf({ built: false })).toBe('paving')
    expect(hatchOf(null)).toBe('unassigned')
  })

  it('a label fits when the mass’s bounds hold its longest line and both lines, in screen px', () => {
    expect(labelFits(160, 80, 1, ['Warehouse 1', '12,800 m²'])).toBe(true)
    expect(labelFits(6, 4, 1, ['Guard house 1', '24 m²'])).toBe(false) // 6 px wide at 1 m per px
    expect(labelFits(6, 4, 0.05, ['Guard house 1', '24 m²'])).toBe(true) // zoomed in: 120 px
  })
})

describe('the plan', () => {
  it('the masses at 85 % with an ink outline and their hatch; a mass without a program grey and hatched', () => {
    act(() => s().apply((p) => ({ ...p, masses: p.masses.map((m) => (m.id === 'm3' ? { ...m, programId: null } : m)) })))
    act(() => useDetail.getState().setDetail('presentation')) // mixed-use-mvp: the app opens on Ghosted
    render(<App />)
    expect(mass('m1')).toHaveAttribute('fill-opacity', '0.85')
    expect(mass('m1')).toHaveAttribute('stroke', 'var(--ink)')
    expect(hatchAfter('m1')).toBe('diagonal')
    expect(hatchAfter('m3')).toBe('unassigned')
    expect(mass('m3')).toHaveAttribute('fill', 'var(--fill)')
    expect(document.querySelectorAll('pattern').length).toBeGreaterThan(0)
  })

  it('a selected mass has a paper halo under its outline', () => {
    render(<App />)
    act(() => s().select('m1'))
    const halo = mass('m1').previousElementSibling!
    expect(halo).toHaveAttribute('stroke', 'var(--panel)')
    expect(mass('m1')).toHaveAttribute('stroke-width', '2.5')
  })

  it('labels: the name in bold over the area, on a halo', () => {
    render(<App />)
    const label = document.querySelector('[data-label="m1"]')!
    expect(label).toHaveAttribute('paint-order', 'stroke')
    expect(label.querySelector('tspan')).toHaveAttribute('font-weight', '600')
    expect(label).toHaveTextContent('Warehouse 1')
  })
})

describe('the Brief’s style picker', () => {
  it('the swatch opens colours and hatches; a pick is one undo step and shows on the plan; Default goes back', () => {
    useUi.setState({ dialog: 'brief' })
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Colour and hatch of Warehouse' }))
    const box = screen.getByRole('dialog', { name: 'Warehouse on the plan' })
    const hatches = within(within(box).getByRole('group', { name: 'Hatch' })).getAllByRole('button')
    expect(hatches.map((b) => b.textContent)).toEqual(['None', 'Diagonal', 'Cross', 'Dots', 'Paving', 'Asphalt'])
    expect(within(box).getByRole('button', { name: 'Diagonal' })).toHaveAttribute('aria-pressed', 'true') // the default
    const steps = s().history.past.length
    fireEvent.click(within(box).getByRole('button', { name: 'Cross' }))
    expect(s().project.programs.find((g) => g.id === 'warehouse')!.hatch).toBe('cross')
    expect(s().history.past).toHaveLength(steps + 1)
    fireEvent.click(within(box).getByRole('button', { name: 'Colour #c27c6b' }))
    expect(s().project.programs.find((g) => g.id === 'warehouse')!.color).toBe('#c27c6b')
    fireEvent.click(within(box).getByRole('button', { name: 'Default' }))
    expect(s().project.programs.find((g) => g.id === 'warehouse')!.hatch).toBeUndefined()
    act(() => useUi.getState().setRail('layers'))
    expect(hatchAfter('m1')).toBe('diagonal')
    expect(mass('m1')).toHaveAttribute('fill', '#c27c6b')
  })
})
