// The Brief's Circulation tab (Phase K.4, Decision "Program rule set layout"): Programs | Circulation; the standards
// with the road widths' ranges the optimizer searches, and the parking's Demand, program by program, with what it
// asks in the active option and how the stalls along its roads stand against it.
import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../App.tsx'
import { pickMenu } from './pickMenu.ts'
import { derive } from '../../engine/derive.ts'
import { actions } from '../../state/actions/index.ts'
import { demoProject } from '../../state/demo.ts'
import { emptyHistory } from '../../state/history.ts'
import { NO_SELECTION, useApp } from '../../state/store.ts'
import { useUi } from '../layout/ui.ts'

vi.mock('../scene/Scene.tsx', () => ({ Scene: () => <div data-testid="scene" /> }))

beforeEach(() => {
  localStorage.clear()
  const p = demoProject()
  useApp.setState({ project: p, derived: derive(p, 'o1'), history: emptyHistory(), dragStart: null, selection: NO_SELECTION, level: 'l1', showAll: false, option: 'o1' })
  useUi.setState({ dialog: null, briefTab: 'programs', view: 'plan', rail: 'layers', summaryTab: 'overview', panels: { left: true, right: true }, sheet: null, help: false })
})

const s = () => useApp.getState()
const type = (field: HTMLElement, v: string) => {
  fireEvent.change(field, { target: { value: v } })
  fireEvent.blur(field)
}

describe('the Brief’s Circulation tab', () => {
  it('Programs first; Circulation: the standards and the demand, the programs’ table gone', () => {
    render(<App />)
    pickMenu('Design', 'Brief…')
    const brief = within(screen.getByRole('region', { name: 'Brief' }))
    const tabs = within(brief.getByRole('tablist', { name: 'Brief parts' }))
    expect(tabs.getAllByRole('tab')).toHaveLength(2)
    expect(tabs.getByRole('tab', { name: 'Programs' })).toHaveAttribute('aria-selected', 'true')
    expect(brief.getByRole('table', { name: 'Programs in the brief' })).toBeInTheDocument()
    fireEvent.click(tabs.getByRole('tab', { name: 'Circulation' }))
    expect(brief.queryByRole('table', { name: 'Programs in the brief' })).toBeNull()
    expect(brief.getByRole('region', { name: 'Circulation standards' })).toBeInTheDocument()
    expect(brief.getByRole('region', { name: 'Demand' })).toBeInTheDocument()
    // its foot stays: on to Program
    expect(brief.getByRole('button', { name: /Edit programs → Program/ })).toBeInTheDocument()
  })

  it('a road width’s range to search, from and to, one undo step each; emptied, none', () => {
    useUi.setState({ dialog: 'brief', briefTab: 'circulation' })
    render(<App />)
    const section = within(screen.getByRole('region', { name: 'Circulation standards' }))
    const steps = s().history.past.length
    type(section.getByRole('textbox', { name: 'Road width search from' }), '7')
    expect(s().project.standards!.search).toEqual({ roadWidth: [7, 7] })
    type(section.getByRole('textbox', { name: 'Road width search to' }), '10')
    expect(s().project.standards!.search).toEqual({ roadWidth: [7, 10] })
    expect(s().history.past).toHaveLength(steps + 2)
    type(section.getByRole('textbox', { name: 'Road width search from' }), '')
    expect(s().project.standards!.search).toBeUndefined()
  })

  it('Lane width (PE.2): a field of the Standards, 3.5 m until set; it writes standards.laneWidth, one undo step, and a new lane takes it', () => {
    useUi.setState({ dialog: 'brief', briefTab: 'circulation' })
    const p = demoProject()
    const streets = { nodes: [{ id: 'n1', x: 0, y: -40 }, { id: 'n2', x: 50, y: -40 }], segments: [{ id: 's1', a: 'n1', b: 'n2', type: 'trucks', left: 0, right: 7 }] }
    useApp.setState({ project: { ...p, options: [{ ...p.options[0], streets }] } })
    render(<App />)
    const section = within(screen.getByRole('region', { name: 'Circulation standards' }))
    const field = section.getByRole('textbox', { name: /^Lane width/ })
    expect(field).toHaveValue('3.5')
    const steps = s().history.past.length
    type(field, '3')
    expect(s().project.standards!.laneWidth).toBe(3)
    expect(s().history.past).toHaveLength(steps + 1)
    // under 2 m is no lane: refused, the standard stays
    type(field, '1.5')
    expect(s().project.standards!.laneWidth).toBe(3)
    const r = actions.editPath(s().project, { kind: 'street', id: 'street:s1' }, { op: 'lanes', k: 0, by: 1 }, 'o1')
    expect(r.project.options[0].streets!.segments[0]).toMatchObject({ right: 10, lanes: [3.5, 3.5, 3] })
  })

  it('the street types (ST.3): the defaults until edited; a width, *+ Type*, one in use or the last cannot go', () => {
    useUi.setState({ dialog: 'brief', briefTab: 'circulation' })
    const p = demoProject()
    const streets = { nodes: [{ id: 'n1', x: 0, y: -40 }, { id: 'n2', x: 50, y: -40 }], segments: [{ id: 's1', a: 'n1', b: 'n2', type: 'cars', left: 3, right: 3 }] }
    useApp.setState({ project: { ...p, options: [{ ...p.options[0], streets }] } })
    render(<App />)
    const section = within(screen.getByRole('region', { name: 'Street types' }))
    const table = within(section.getByRole('table', { name: 'Street types' }))
    expect(table.getAllByRole('row')).toHaveLength(1 + 2)
    // a type’s width is what a new street takes (PE.1 task 11): the column says so
    expect(table.getByRole('columnheader', { name: /New street width/ })).toBeInTheDocument()
    expect(s().project.standards!.streetTypes).toBeUndefined()
    const steps = s().history.past.length
    type(table.getByRole('textbox', { name: 'Trucks width' }), '12')
    expect(s().project.standards!.streetTypes!.map((t) => [t.id, t.width])).toEqual([['trucks', 12], ['cars', 6]])
    expect(s().history.past).toHaveLength(steps + 1)
    fireEvent.click(section.getByRole('button', { name: '＋ Type' }))
    expect(s().project.standards!.streetTypes).toHaveLength(3)
    // cars: a street takes it
    expect(table.getByRole('button', { name: 'Remove Cars' })).toBeDisabled()
    fireEvent.click(table.getByRole('button', { name: 'Remove Type 3' }))
    expect(s().project.standards!.streetTypes!.map((t) => t.id)).toEqual(['trucks', 'cars'])
  })

  it('the demand: a car stall per m², trailer stalls per door; what each asks, the total, the stalls against it', () => {
    useUi.setState({ dialog: 'brief', briefTab: 'circulation' })
    render(<App />)
    const demand = within(screen.getByRole('region', { name: 'Demand' }))
    const table = within(demand.getByRole('table', { name: 'Parking demand' }))
    expect(table.getAllByRole('row')).toHaveLength(s().project.programs.length + 2)
    type(table.getByRole('textbox', { name: 'Office car stall per m²' }), '25')
    expect(s().project.programs.find((g) => g.id === 'office')!.demand).toEqual({ carStalls: 25 })
    const asked = Math.ceil(s().derived.metrics.areaByProgram.office / 25)
    const office = table.getByRole('textbox', { name: 'Office car stall per m²' }).closest('tr')!
    expect(within(office).getByText(String(asked))).toBeInTheDocument()
    // the stalls along the roads meet it
    expect(demand.getByRole('definition').textContent).toContain('the demand met')
    // a demand the roads do not give: short, an Issue in Flow
    type(table.getByRole('textbox', { name: 'Warehouse car stall per m²' }), '1')
    expect(demand.getAllByRole('definition')[0].textContent).toMatch(/\d+ short/)
    expect(s().derived.issues.some((i) => i.code === 'parking')).toBe(true)
    // the trailers: asked only
    type(table.getByRole('textbox', { name: 'Warehouse trailer stalls per door' }), '1')
    expect(demand.getByText(/where they stand \(a trailer yard\) comes later/)).toBeInTheDocument()
  })
})
