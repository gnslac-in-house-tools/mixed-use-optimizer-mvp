// A gate's handle is above the streets (Phase PE.2 review V1): the plan draws the roads layer (paving and the hit strokes of the streets and the existing streets, as wide as
// their paving) over the access layer, and a gate stands on its host's edge, so half its handle lay under a road: a press on its outer half dragged the street, a right-click opened
// the street's menu. The handles are drawn after the roads, in document order, and where the pointer lands on the gate's circle the gate answers.
import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../../App.tsx'
import { derive } from '../../../engine/derive.ts'
import { actions } from '../../../state/actions/index.ts'
import { demoProject } from '../../../state/demo.ts'
import { emptyHistory } from '../../../state/history.ts'
import { NO_SELECTION, useApp } from '../../../state/store.ts'
import { useLayerView } from '../../layers/layerView.ts'
import { useUi } from '../../layout/ui.ts'
import { useAccess } from '../access/accessState.ts'
import { thingsAt } from '../lockedAt.ts'
import { useRoads } from '../circulation/roadState.ts'

vi.mock('../../scene/Scene.tsx', () => ({ Scene: () => <div data-testid="scene" /> }))

beforeEach(() => {
  localStorage.clear()
  const p = demoProject()
  useApp.setState({ project: p, derived: derive(p, 'o1'), history: emptyHistory(), dragStart: null, selection: NO_SELECTION, level: 'l1', showAll: false, option: 'o1' })
  useUi.setState({ view: 'plan', rail: 'layers', panels: { left: true, right: true }, sheet: null, help: false })
  useLayerView.setState({ hidden: [], onTop: [], folded: [] })
  useRoads.setState({ picked: null, node: null, also: [] })
  useAccess.setState({ picked: null, alsoGates: [], tool: null })
})

const after = (a: Element, b: Element) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)

describe('the plan’s stacking of gates and roads', () => {
  it('every gate handle comes after every road’s hit stroke and paving in the document: the gate answers where they overlap', () => {
    render(<App />)
    const handles = [...document.querySelectorAll('[data-handle^="gate-"]')]
    expect(handles.length).toBeGreaterThan(0)
    const roads = [...document.querySelectorAll('[data-layer="roads"] [data-road], [data-layer="roads"] [data-existing-road], [data-layer="roads"] [data-paving]')]
    expect(roads.length).toBeGreaterThan(0)
    // the demo's gate stands on the south boundary, beside its existing street
    expect(document.querySelector('[data-existing-road]')).not.toBeNull()
    for (const h of handles) for (const r of roads) expect(after(r, h), `${h.getAttribute('data-handle')} after ${r.tagName}`).toBe(true)
  })

  it('the access layer, with its handles, comes after the whole roads layer', () => {
    render(<App />)
    const roadsLayer = document.querySelector('[data-layer="roads"]')!
    const access = document.querySelector('[data-layer="access"]')!
    expect(after(roadsLayer, access)).toBe(true)
    expect(access.querySelector('[data-handle^="gate-"]')).not.toBeNull()
  })
})

describe('what a right-click finds with a tool in hand (review R5)', () => {
  it('a gate on a street comes before the street under its handle, as the plan draws it on top', () => {
    const base = demoProject({ streets: false, southStreet: false })
    const street = actions.drawStreet(base, 'o1', [{ x: 100, y: 150 }, { x: 200, y: 150 }], undefined, 8)!
    const gated = actions.addGateOn(street.project, 'o1', { kind: 'street', id: street.segments[0], side: 'right', at: 30 })
    useApp.setState({ project: gated.project, derived: derive(gated.project, 'o1') })
    const gate = derive(gated.project, 'o1').circulation.gates.find((g) => g.id === gated.id)!
    const found = thingsAt(gate.at, 1)
    expect(found.some((r) => r.kind === 'street')).toBe(true)
    expect(found[0]).toEqual({ kind: 'gate', id: gated.id })
  })
})
