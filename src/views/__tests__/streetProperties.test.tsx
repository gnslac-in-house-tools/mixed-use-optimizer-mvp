// A picked street's width in Properties (Phase PE.1 task 11): a read-out, no field (the pills set it); Set type keeps the sides; its ends connected to a lot (Phase SE.6).
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Project } from '../../model/schema.ts'
import { App } from '../../App.tsx'
import { derive } from '../../engine/derive.ts'
import { demoProject } from '../../state/demo.ts'
import { emptyHistory } from '../../state/history.ts'
import { NO_SELECTION, useApp } from '../../state/store.ts'
import { useGraph } from '../graph/graphState.ts'
import { useUi } from '../layout/ui.ts'
import { useRoads } from '../plan/circulation/roadState.ts'
import { useAccess } from '../plan/access/accessState.ts'
import { letGo } from '../tools/hand.ts'

vi.mock('../scene/Scene.tsx', () => ({ Scene: () => <div data-testid="scene" /> }))

const s = () => useApp.getState()
const segments = () => s().project.options[0].streets!.segments
const road = () => s().derived.circulation.roads.find((r) => r.id === useRoads.getState().picked)!

// the demo without its streets and one street along y 230: s1 n1 → n2, s2 stored the other way (n3 → n2); `linked`,
// its end n1 connected to a lot (Decision "Streets follow their lots")
function start(linked = false) {
  const p = demoProject({ streets: false })
  const n1 = { id: 'n1', x: 60, y: 230, ...(linked && { lot: 'lot1' }) }
  const streets = {
    nodes: [n1, { id: 'n2', x: 160, y: 230 }, { id: 'n3', x: 260, y: 230 }],
    segments: [{ id: 's1', a: 'n1', b: 'n2', type: 'trucks', left: 4, right: 4 }, { id: 's2', a: 'n3', b: 'n2', type: 'trucks', left: 4, right: 4 }],
  }
  const lots = linked ? [{ id: 'lot1', name: 'Visitors', rect: { center: { x: 40, y: 230 }, width: 30, depth: 20, rotation: 0 }, entry: 'end' as const }] : []
  const project: Project = { ...p, options: [{ ...p.options[0], streets, ...(linked && { lots }) }, ...p.options.slice(1)] }
  useApp.setState({ project, derived: derive(project, 'o1'), history: emptyHistory(), dragStart: null, selection: NO_SELECTION, level: 'l1', showAll: false, option: 'o1' })
  useUi.setState({ view: 'plan', rail: 'layers', panels: { left: true, right: true }, sheet: null, help: false })
  render(<App />)
  act(() => useRoads.getState().pick('street:s1'))
  const rail = within(screen.getByRole('complementary', { name: 'Layers and properties' }).querySelector<HTMLElement>('[data-panel-tabs]')!)
  fireEvent.click(rail.getByRole('tab', { name: 'Properties' }))
  return within(screen.getByRole('region', { name: 'Road' }))
}

beforeEach(() => {
  localStorage.clear()
  useGraph.setState({ graph: false, rule: null, relation: null })
  letGo()
  useRoads.setState({ picked: null, also: [] })
})

describe('a street’s width in Properties: a read-out (Phase PE.1 task 11, Decision "Width by hand")', () => {
  const widthRow = (props: ReturnType<typeof start>) => props.getByText('Width').parentElement!.textContent
  const set = (a: { left: number; right: number }, b: { left: number; right: number }) =>
    act(() => {
      const p = s().project
      const o = p.options[0]
      const next = { ...p, options: [{ ...o, streets: { ...o.streets!, segments: o.streets!.segments.map((g) => ({ ...g, ...(g.id === 's1' ? a : b) })) } }, ...p.options.slice(1)] }
      useApp.setState({ project: next, derived: derive(next, 'o1') })
    })

  it('reads 8 m on equal sides; 2 + 6 m on unequal ones, along the street; Varies where its stretches differ', () => {
    const props = start()
    expect(widthRow(props)).toBe('Width8 m')
    // s2 is stored the other way: its own sides, turned along the street, are the same 2 + 6
    set({ left: 2, right: 6 }, { left: 6, right: 2 })
    expect(widthRow(props)).toBe('Width2 + 6 m')
    set({ left: 2, right: 6 }, { left: 4, right: 4 })
    expect(widthRow(props)).toBe('WidthVaries')
  })

  it('a uniform street whose runs are stored the other way still reads as one width: s2 (another type, so its own run) is n3 → n2 with the sides turned', () => {
    const props = start()
    act(() => {
      const p = s().project
      const o = p.options[0]
      const next = { ...p, options: [{ ...o, streets: { ...o.streets!, segments: o.streets!.segments.map((g) => (g.id === 's1' ? { ...g, left: 2, right: 6 } : { ...g, type: 'cars', left: 6, right: 2 })) } }, ...p.options.slice(1)] }
      useApp.setState({ project: next, derived: derive(next, 'o1') })
    })
    expect(s().derived.circulation.roads.filter((r) => r.street === 'street:s1')).toHaveLength(2)
    expect(widthRow(props)).toBe('Width2 + 6 m')
  })

  it('grading reads every run of the street: the steepest grade, the cut and the fill added', () => {
    const props = start()
    act(() => {
      const p = s().project
      const o = p.options[0]
      const next = { ...p, options: [{ ...o, streets: { ...o.streets!, segments: o.streets!.segments.map((g) => (g.id === 's1' ? g : { ...g, type: 'cars' })) } }, ...p.options.slice(1)] }
      const derived = derive(next, 'o1')
      const [a, b] = derived.circulation.roads.filter((r) => r.street === 'street:s1')
      const prof = (roadId: string, grade: number, cut: number, fill: number) => ({ roadId, width: 8, stations: [], cut, fill, grade, at: { x: 0, y: 0 } })
      useApp.setState({ project: next, derived: { ...derived, roadGrading: { roads: [prof(a.id, 0.03, 100, 20), prof(b.id, 0.07, 50, 400)], cut: 150, fill: 420 } } })
    })
    const grading = within(props.getByLabelText('Road grading'))
    expect(grading.getByText(/7 %/)).toBeTruthy()
    expect(grading.getByText(/150 · 420 m³/)).toBeTruthy()
  })

  it('has no Width or Side field', () => {
    const props = start()
    expect(props.queryByRole('textbox', { name: /Width/ })).toBeNull()
    expect(props.queryByRole('combobox', { name: /Side/ })).toBeNull()
  })

  it('Set type changes the vehicles and the radius, not the width (the street keeps its sides)', () => {
    const props = start()
    set({ left: 2, right: 6 }, { left: 6, right: 2 })
    fireEvent.change(props.getByRole('combobox', { name: /Type/ }), { target: { value: 'cars' } })
    expect(segments().map((g) => [g.type, g.left, g.right])).toEqual([['cars', 2, 6], ['cars', 6, 2]])
    expect(road().vehicles).toBe('cars')
    expect(widthRow(props)).toBe('Width2 + 6 m')
  })

  it('an existing street: the same read-out and no Width field', () => {
    start()
    const p = s().project
    const q = { ...p, site: { ...p.site, existingRoads: [{ id: 'er1', points: [{ x: 300, y: 60 }, { x: 340, y: 60 }, { x: 380, y: 60 }], stretches: [{ left: 2, right: 6 }, { left: 4, right: 4 }] }] } }
    act(() => {
      useApp.setState({ project: q, derived: derive(q, 'o1') })
      useAccess.getState().pick({ kind: 'existing', id: 'er1' })
    })
    const props = within(screen.getByRole('region', { name: 'Existing road 1' }))
    expect(props.getByText('Width').parentElement!.textContent).toBe('WidthVaries')
    expect(props.queryByRole('textbox', { name: /Width/ })).toBeNull()
    const r = { ...q, site: { ...q.site, existingRoads: [{ ...q.site.existingRoads[0], stretches: [{ left: 2, right: 6 }, { left: 2, right: 6 }] }] } }
    act(() => useApp.setState({ project: r, derived: derive(r, 'o1') }))
    expect(props.getByText('Width').parentElement!.textContent).toBe('Width2 + 6 m')
  })
})

describe('a street’s lanes in Properties: a read-out (Phase PE.2 task 4)', () => {
  const lanesRow = (props: ReturnType<typeof start>) => props.getByText('Lanes').parentElement!.textContent
  const setSegments = (a: object, b: object) =>
    act(() => {
      const p = s().project
      const o = p.options[0]
      const next = { ...p, options: [{ ...o, streets: { ...o.streets!, segments: o.streets!.segments.map((g) => ({ ...g, ...(g.id === 's1' ? a : b) })) } }, ...p.options.slice(1)] }
      useApp.setState({ project: next, derived: derive(next, 'o1') })
    })
  const THREE = { left: 0, right: 10.5, lanes: [3.5, 3.5, 3.5] }

  it('an 8 m street with no stored lanes shows its two equal lanes', () => {
    expect(lanesRow(start())).toBe('Lanes2 lanes · 4 + 4 m')
  })

  it('3 lanes · 3.5 + 3.5 + 3.5 m; 1 lane · 4 m; Varies where its stretches differ', () => {
    const props = start()
    setSegments(THREE, THREE)
    expect(lanesRow(props)).toBe('Lanes3 lanes · 3.5 + 3.5 + 3.5 m')
    setSegments({ left: 0, right: 4 }, { left: 0, right: 4 })
    expect(lanesRow(props)).toBe('Lanes1 lane · 4 m')
    setSegments(THREE, { left: 0, right: 4 })
    expect(lanesRow(props)).toBe('LanesVaries')
  })

  it('a segment stored the other way reads along the street: s2 is n3 → n2, its lanes [2, 6] read 6 + 2', () => {
    const props = start()
    setSegments({ left: 0, right: 8, lanes: [6, 2] }, { left: 8, right: 0, lanes: [2, 6] })
    expect(lanesRow(props)).toBe('Lanes2 lanes · 6 + 2 m')
  })

  it('an existing street: the same read-out', () => {
    start()
    const p = s().project
    const q = { ...p, site: { ...p.site, existingRoads: [{ id: 'er1', points: [{ x: 300, y: 60 }, { x: 340, y: 60 }, { x: 380, y: 60 }], stretches: [{ left: 5.75, right: 5.75, lanes: [4, 4, 3.5] }, { left: 4, right: 4 }] }] } }
    act(() => {
      useApp.setState({ project: q, derived: derive(q, 'o1') })
      useAccess.getState().pick({ kind: 'existing', id: 'er1' })
    })
    const props = within(screen.getByRole('region', { name: 'Existing road 1' }))
    expect(props.getByText('Lanes').parentElement!.textContent).toBe('LanesVaries')
    const r = { ...q, site: { ...q.site, existingRoads: [{ ...q.site.existingRoads[0], stretches: [{ left: 5.75, right: 5.75, lanes: [4, 4, 3.5] }, { left: 5.75, right: 5.75, lanes: [4, 4, 3.5] }] }] } }
    act(() => useApp.setState({ project: r, derived: derive(r, 'o1') }))
    expect(props.getByText('Lanes').parentElement!.textContent).toBe('Lanes3 lanes · 4 + 4 + 3.5 m')
  })
})

describe('a street end connected to a lot in Properties (Phase SE.6, Decision "Streets follow their lots")', () => {
  it('none connected: nothing said', () => {
    expect(start().queryByText(/Connected to/)).toBeNull()
  })

  it('Disconnect calls the verb: the node keeps its place and no lot', () => {
    const props = start(true)
    expect(props.getByText('Connected to Visitors')).toBeTruthy()
    fireEvent.click(props.getByRole('button', { name: 'Disconnect' }))
    const n1 = s().project.options[0].streets!.nodes.find((n) => n.id === 'n1')!
    expect(n1).toEqual({ id: 'n1', x: 60, y: 230 })
    expect(props.queryByText(/Connected to/)).toBeNull()
  })
})
