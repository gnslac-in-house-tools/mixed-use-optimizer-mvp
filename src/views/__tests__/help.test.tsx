// The help (Decision "Help"): one ? in the top bar shows the notes where they help, the command line's keys and the
// guide; off, the panels keep only their controls, tooltips and empty states. The snap marks draw no label at all.
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../App.tsx'
import { derive } from '../../engine/derive.ts'
import { demoProject } from '../../state/demo.ts'
import { emptyHistory } from '../../state/history.ts'
import { NO_SELECTION, useApp } from '../../state/store.ts'
import { useGraph } from '../graph/graphState.ts'
import { useUi } from '../layout/ui.ts'
import { SnapMark } from '../plan/snap/SnapMark.tsx'
import { pickMenu } from './pickMenu.ts'

vi.mock('../scene/Scene.tsx', () => ({ Scene: () => <div data-testid="scene" /> }))

beforeEach(() => {
  localStorage.clear()
  const p = demoProject()
  useApp.setState({ project: p, derived: derive(p, 'o1'), history: emptyHistory(), dragStart: null, selection: NO_SELECTION, level: 'l1', showAll: false, option: 'o1' })
  useUi.setState({ dialog: null, view: 'plan', rail: 'layers', panels: { left: true, right: true }, sheet: null, help: false })
  useGraph.setState({ graph: false, rule: null, relation: null })
})

const notes = () => document.querySelectorAll('[data-note]')
const command = () => screen.getByRole('group', { name: 'Command' })

describe('the help', () => {
  it('off: no notes, the command line says only Command; on: the notes, the keys and the guide; remembered', () => {
    // Properties of a building holds a note about its levels (the Brief tab's note about programs went with it)
    useUi.setState({ rail: 'properties' })
    render(<App />)
    expect(notes()).toHaveLength(0)
    expect(command()).toHaveTextContent(/^Command$/)
    expect(screen.queryByText(/Changing a height or ×N moves the levels above it/)).toBeNull()
    expect(useUi.getState().help).toBe(false)
    pickMenu('Help', 'Help')
    expect(useUi.getState().help).toBe(true)
    expect(notes().length).toBeGreaterThan(0)
    expect(screen.getByText(/Changing a height or ×N moves the levels above it/)).toBeInTheDocument()
    expect(command()).toHaveTextContent('B draws a block')
    expect(screen.getByRole('region', { name: 'From site to massing' })).toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem('gfit.layout')!).help).toBe(true)
  })

  it('a snap mark draws its sign and guides, never a label', () => {
    const { container } = render(
      <svg>
        <SnapMark mark={{ kind: 'endpoint', at: { x: 0, y: 0 }, label: 'wall of Warehouse 1', guides: [] }} px={1} />
      </svg>,
    )
    expect(container.querySelector('[data-snap] path')).not.toBeNull()
    expect(container.querySelector('text')).toBeNull()
    expect(container).not.toHaveTextContent('wall of Warehouse 1')
  })
})
