// A corridor round a hole (Phase H.4, Decision "Holes and free geometry"; Practiko's `pasilloDeHueco`): the hole grown
// by the width, inside the mass and out of every hole; part of the mass's area, counted in the Corridors KPI; its width
// in Properties (0 = none); it stays when the hole is reshaped or moves. Demo: m1 x 40…200, y 70…150.
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Contour, Project } from '../../../model/schema.ts'
import { App } from '../../../App.tsx'
import { derive } from '../../../engine/derive.ts'
import { contourFromPolygon } from '../../../engine/geom/contour.ts'
import { readKpi } from '../../../modules/catalog.ts'
import { actions } from '../../../state/actions/index.ts'
import { demoProject } from '../../../state/demo.ts'
import { emptyHistory } from '../../../state/history.ts'
import { NO_SELECTION, useApp } from '../../../state/store.ts'
import { useUi } from '../../layout/ui.ts'
import { useHoles } from '../holeState.ts'

vi.mock('../../scene/Scene.tsx', () => ({ Scene: () => <div data-testid="scene" /> }))

const box = (x0: number, y0: number, x1: number, y1: number): Contour =>
  contourFromPolygon([
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ])
const withHole = (p: Project, c: Contour, corridor: number | null = 3) => actions.setHoleCorridor(actions.addHole(p, 'm1', c)!.project, 'm1', 0, corridor)
const s = () => useApp.getState()

describe('the corridor (engine)', () => {
  const p = demoProject()

  it('a ring the width round the hole, part of the mass; counted in Corridors', () => {
    const q = withHole(p, box(100, 100, 120, 120))
    const d = derive(q)
    expect(d.masses.m1.corridors).toEqual([expect.objectContaining({ k: 0, width: 3 })])
    expect(d.masses.m1.corridors[0].area).toBeCloseTo(26 * 26 - 20 * 20, 6)
    expect(d.masses.m1.area).toBeCloseTo(12800 - 400, 6)
    expect(d.metrics.corridorArea).toBeCloseTo(276, 6)
    expect(readKpi('corridor-area', q, d)).toMatchObject({ value: expect.closeTo(276, 6), unit: 'm2' })
  })

  it('clipped to the outline and out of the other holes', () => {
    // 2 m from the north wall (y 150): only 2 m of corridor fit there
    const near = derive(withHole(p, box(100, 128, 120, 148))).masses.m1.corridors[0].area
    expect(near).toBeCloseTo(26 * 25 - 20 * 20, 6)
    const two = actions.addHole(withHole(p, box(100, 100, 120, 120)), 'm1', box(122, 100, 142, 120))!.project
    expect(derive(two).masses.m1.corridors[0].area).toBeCloseTo(276 - 1 * 20, 6)
  })

  it('none at 0; it stays when the hole moves or is reshaped', () => {
    const q = withHole(p, box(100, 100, 120, 120))
    expect(derive(actions.setHoleCorridor(q, 'm1', 0, 0)).masses.m1.corridors).toEqual([])
    expect(actions.setHoleCorridor(q, 'm1', 0, 0).masses[0].holes![0]).not.toHaveProperty('corridor')
    expect(actions.moveHole(q, 'm1', 0, { x: 5, y: 0 }).masses[0].holes![0].corridor).toBe(3)
    expect(actions.moveHoleVertex(q, 'm1', 0, 2, { x: 125, y: 125 }).masses[0].holes![0].corridor).toBe(3)
    expect(actions.moveMass(q, 'm1', { x: 0, y: 10 }).masses[0].holes![0].corridor).toBe(3)
  })
})

describe('in Properties and on the plan', () => {
  beforeEach(() => {
    localStorage.clear()
    const p = actions.addHole(demoProject(), 'm1', box(100, 100, 120, 120))!.project
    useApp.setState({ project: p, derived: derive(p), history: emptyHistory(), dragStart: null, selection: NO_SELECTION, level: 'l1', showAll: false })
    useUi.setState({ dialog: null, view: 'plan', rail: 'properties', panels: { left: true, right: true }, sheet: null })
    useHoles.setState({ pick: null })
  })

  it('each hole with its area; its corridor typed draws on the plan; a click picks it; Delete hole', () => {
    render(<App />)
    act(() => s().select('m1'))
    const hole = within(screen.getByRole('region', { name: 'Holes' })).getByRole('group', { name: 'Hole 1' })
    expect(hole).toHaveTextContent('400 m²')
    const field = within(hole).getByRole('textbox')
    fireEvent.change(field, { target: { value: '3' } })
    fireEvent.keyDown(field, { key: 'Enter' })
    expect(s().project.masses[0].holes![0].corridor).toBe(3)
    expect(document.querySelector('[data-corridor="0"]')).not.toBeNull()
    expect(hole).toHaveTextContent('A corridor of 276 m² round it')
    fireEvent.click(within(hole).getByRole('button', { name: 'Hole 1, 400 m²' }))
    expect(useHoles.getState().pick).toEqual({ massId: 'm1', k: 0, vertex: null })
    fireEvent.click(within(hole).getByRole('button', { name: 'Delete hole' }))
    expect(s().project.masses[0]).not.toHaveProperty('holes')
  })
})
