// An existing street deleted under a gate says so (Phase PE.2 review V4, Decision "Gates on any street"): Delete and the Properties button both take its gates along, and the toast
// says "Its gates went with it", as for a street of the option.
import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../../App.tsx'
import { derive } from '../../../engine/derive.ts'
import { gatesOf } from '../../../engine/circulation/gates.ts'
import type { Project } from '../../../model/schema.ts'
import { addExistingRoad, addGateOn } from '../../../state/actions/circulation.ts'
import { demoProject } from '../../../state/demo.ts'
import { emptyHistory } from '../../../state/history.ts'
import { NO_SELECTION, useApp } from '../../../state/store.ts'
import { ExistingRoadProperties } from '../../panels/ExistingRoadProperties.tsx'
import { useLayerView } from '../../layers/layerView.ts'
import { useToast } from '../../layout/toast.ts'
import { useUi } from '../../layout/ui.ts'
import { useAccess } from '../access/accessState.ts'
import { useRoads } from '../circulation/roadState.ts'

vi.mock('../../scene/Scene.tsx', () => ({ Scene: () => <div data-testid="scene" /> }))

const s = () => useApp.getState()
let road = ''

/** The demo without its south street and gate, with an existing street along y 100 and a gate on its left side. */
function load(withGate: boolean) {
  const base = demoProject({ streets: false, southStreet: false })
  const bare: Project = { ...base, site: { ...base.site, gates: undefined } }
  const e = addExistingRoad(bare, [{ x: 20, y: 100 }, { x: 420, y: 100 }], 10)!
  road = e.id
  const p = withGate ? addGateOn(e.project, 'o1', { kind: 'existing-road', id: e.id, side: 'left', at: 100 }).project : e.project
  useApp.setState({ project: p, derived: derive(p, 'o1'), history: emptyHistory(), dragStart: null, selection: NO_SELECTION, level: 'l1', showAll: false, option: 'o1' })
}

beforeEach(() => {
  localStorage.clear()
  useUi.setState({ view: 'plan', rail: 'layers', panels: { left: true, right: true }, sheet: null, help: false })
  useLayerView.setState({ hidden: [], onTop: [], folded: [] })
  useRoads.setState({ picked: null, node: null, also: [] })
  useAccess.setState({ picked: null, alsoGates: [], tool: null })
  useToast.setState({ toast: null, confirmation: null })
})

describe('an existing street deleted under a gate', () => {
  it('Delete takes its gates along, and the toast says so', () => {
    load(true)
    expect(gatesOf(s().project, 'o1')).toHaveLength(1)
    render(<App />)
    act(() => useAccess.getState().pick({ kind: 'existing', id: road }))
    fireEvent.keyDown(window, { key: 'Delete' })
    expect(s().project.site.existingRoads ?? []).toHaveLength(0)
    expect(gatesOf(s().project, 'o1')).toHaveLength(0)
    expect(useToast.getState().toast?.text).toBe('Its gates went with it')
  })

  it('the Properties Delete button says it too', () => {
    load(true)
    render(<ExistingRoadProperties id={road} muted="" />)
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(gatesOf(s().project, 'o1')).toHaveLength(0)
    expect(useToast.getState().toast?.text).toBe('Its gates went with it')
  })

  it('a street with no gate on it deleted says nothing of gates', () => {
    load(false)
    render(<ExistingRoadProperties id={road} muted="" />)
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(s().project.site.existingRoads ?? []).toHaveLength(0)
    expect(useToast.getState().toast?.text ?? '').not.toMatch(/gates/)
  })
})
