// A blank project goes through every step (stress test, 2026-10-19: Brief → Rules went black on a project without
// rules: `rules ?? []` read a new list every time, and the store re-rendered without end).
import { act, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { App } from '../../App.tsx'
import { derive } from '../../engine/derive.ts'
import { actions } from '../../state/actions/index.ts'
import { emptyHistory } from '../../state/history.ts'
import { NO_SELECTION, useApp } from '../../state/store.ts'
import { newProject } from '../../typologies/index.ts'
import { useUi } from '../layout/ui.ts'

vi.mock('../scene/Scene.tsx', () => ({ Scene: () => <div data-testid="scene" /> }))

it('Layers, Properties, the Brief and Rules windows open on a blank project with programs and no rules', () => {
  localStorage.clear()
  let p = newProject('blank', 'Blank')
  p = actions.addProgram(p, { name: 'Retail' }).project
  p = actions.addMass(p, { programId: p.programs.at(-1)!.id, footprint: { kind: 'rect', center: { x: 0, y: 0 }, width: 30, depth: 40, rotation: 0 } }).project
  expect(p.rules ?? []).toEqual([])
  useApp.setState({ project: p, derived: derive(p), history: emptyHistory(), dragStart: null, selection: NO_SELECTION, level: p.buildings[0].levels[0].id, showAll: false })
  useUi.setState({ dialog: null, view: 'plan' })
  render(<App />)
  for (const w of ['layers', 'brief', 'rules', 'properties', 'rules'] as const) {
    act(() => (w === 'brief' || w === 'rules' ? useUi.getState().openDialog(w) : (useUi.getState().closeDialog(), useUi.getState().setRail(w))))
    // a crash leaves nothing on screen
    expect(screen.getAllByRole('banner').length).toBeGreaterThan(0)
  }
})
