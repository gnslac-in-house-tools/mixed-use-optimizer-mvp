// Detail (Phase S.2, Decision "Stress test views"; Practiko's *Nivel de detalle*; Decision "Ghosted detail"):
// Schematic · Ghosted · Presentation in the drafting bar, one for the app, Presentation whenever it opens. The plan draws the masses
// and the roads in Schematic; everything in Presentation; in Ghosted the same, the masses see-through. The figures do
// not change.
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { App } from '../../App.tsx'
import { derive } from '../../engine/derive.ts'
import { demoProject } from '../../state/demo.ts'
import { emptyHistory } from '../../state/history.ts'
import { NO_SELECTION, useApp } from '../../state/store.ts'
import { DEFAULT_DETAIL, useDetail } from '../detail.ts'
import { useUi } from '../layout/ui.ts'

vi.mock('../scene/Scene.tsx', () => ({ Scene: () => <div data-testid="scene" /> }))

beforeEach(() => {
  localStorage.clear()
  const p = demoProject()
  useApp.setState({ project: p, derived: derive(p), history: emptyHistory(), dragStart: null, selection: NO_SELECTION, level: 'l1', showAll: false })
  useUi.setState({ dialog: null, view: 'plan', panels: { left: true, right: true }, sheet: null })
  useDetail.setState({ detail: 'presentation' })
})

const s = () => useApp.getState()
const plan = () => screen.getByRole('img', { name: 'Site plan' })
const has = (selector: string) => plan().querySelector(selector) !== null
/** The drafting bar, under the viewport. */
const bar = () => screen.getByRole('region', { name: 'Drafting' })
// Detail is a menu in the drafting bar (Decision "Bottom bar")
const pick = (name: string) => fireEvent.change(within(bar()).getByRole('combobox', { name: 'Detail' }), { target: { value: name.toLowerCase() } })

it('opens on Presentation, not remembered; Schematic: masses and roads; Ghosted: all of Presentation, the masses see-through; the figures stay', () => {
  render(<App />)
  const kpis = s().derived.metrics
  const fill = () => Number(plan().querySelector('[data-mass="m1"]')!.getAttribute('fill-opacity'))
  expect(DEFAULT_DETAIL).toBe('presentation')
  const all = () => [has('[data-layer="courts"]'), has('[data-layer="docks"]'), has('[data-label]'), has('[data-hatch]')]
  expect(all()).toEqual([true, true, true, true])
  const solid = fill()
  pick('Schematic')
  expect(useDetail.getState().detail).toBe('schematic')
  expect(localStorage.getItem('gfit.detail')).toBeNull()
  expect(has('[data-mass="m1"]')).toBe(true)
  expect(all()).toEqual([false, false, false, false])
  // the roads in every step (Decision "Steps change the tools")
  expect(has('[data-layer="roads"]')).toBe(true)
  pick('Ghosted')
  expect(all()).toEqual([true, true, true, true])
  expect(fill()).toBeLessThan(solid)
  act(() => useDetail.getState().setDetail('presentation'))
  expect(fill()).toBe(solid)
  expect(s().derived.metrics).toEqual(kpis)
})
