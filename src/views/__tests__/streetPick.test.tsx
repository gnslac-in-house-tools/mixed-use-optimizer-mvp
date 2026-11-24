// A click picks the street between crossings (Phase PE.1 task 7): a street whose middle stretch is wider is several runs
// on the plan, one street to the person: one pick, one Properties, one ref `street:<earliest segment>`; its Delete, Lock
// and Hide take every one of its segments.
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../App.tsx'
import { derive } from '../../engine/derive.ts'
import { roadSegments } from '../../kinds/locked.ts'
import { actions } from '../../state/actions/index.ts'
import { demoProject } from '../../state/demo.ts'
import { emptyHistory } from '../../state/history.ts'
import { NO_SELECTION, useApp } from '../../state/store.ts'
import { at } from '../editing/__tests__/kindsFixture.ts'
import { thingsAt } from '../plan/lockedAt.ts'
import { useGraph } from '../graph/graphState.ts'
import { useUi } from '../layout/ui.ts'
import { useRoads } from '../plan/circulation/roadState.ts'
import { pickedRefs } from '../plan/mix.ts'
import { letGo } from '../tools/hand.ts'

vi.mock('../scene/Scene.tsx', () => ({ Scene: () => <div data-testid="scene" /> }))

const s = () => useApp.getState()
const click = (el: Element, extra: object = {}) => {
  fireEvent.pointerDown(el, { button: 0, pointerId: 1, ...extra })
  fireEvent.pointerUp(el, { button: 0, pointerId: 1, ...extra })
}
const run = (id: string) => document.querySelector(`[data-road="${id}"]`)!

beforeEach(() => {
  localStorage.clear()
  const p = demoProject()
  const nodes = [
    { id: 'n1', x: 60, y: 161 },
    { id: 'n2', x: 60, y: 185 },
    { id: 'n3', x: 60, y: 205 },
    { id: 'n4', x: 60, y: 230 },
    { id: 'n5', x: 120, y: 161 },
    { id: 'n6', x: 120, y: 230 },
  ]
  const g = (id: string, a: string, b: string, left = 4, right = 4) => ({ id, a, b, type: 'trucks', left, right })
  const streets = { nodes, segments: [g('s1', 'n1', 'n2'), g('s2', 'n2', 'n3', 4, 8), g('s3', 'n3', 'n4'), g('s4', 'n5', 'n6')] }
  useApp.setState({ project: { ...p, options: [{ ...p.options[0], streets }] }, history: emptyHistory(), dragStart: null, selection: NO_SELECTION, level: 'l1', showAll: false, option: 'o1' })
  useApp.setState({ derived: derive(s().project, 'o1') })
  useUi.setState({ view: 'plan', rail: 'layers', panels: { left: true, right: true }, sheet: null, help: false })
  useGraph.setState({ graph: false, rule: null, relation: null })
  letGo()
  useRoads.setState({ picked: null, also: [] })
})

describe('a click picks the street between crossings', () => {
  it('a click on any stretch picks the whole street: one pick, one ref, one Properties', () => {
    render(<App />)
    expect(document.querySelectorAll('[data-road-kind="street"]')).toHaveLength(4) // three runs and the other street
    click(run('street:s3'))
    expect(useRoads.getState().picked).toBe('street:s1')
    expect(pickedRefs().filter((r) => r.kind === 'street')).toEqual([{ kind: 'street', id: 'street:s1' }])
    fireEvent.click(screen.getByRole('tab', { name: 'Properties' }))
    expect(screen.getAllByRole('region', { name: 'Road' })).toHaveLength(1)
  })

  it('Shift+click adds another street', () => {
    render(<App />)
    click(run('street:s2'))
    click(run('street:s4'), { shiftKey: true })
    expect(pickedRefs().filter((r) => r.kind === 'street').map((r) => r.id)).toEqual(['street:s1', 'street:s4'])
  })

  it('Delete removes the whole street, and only it', () => {
    render(<App />)
    click(run('street:s2'))
    fireEvent.keyDown(window, { key: 'Delete' })
    expect(s().project.options[0].streets!.segments.map((g) => g.id)).toEqual(['s4'])
  })

  it('the menu’s Lock and Hide take all its segments', () => {
    expect(roadSegments(s().project, 'o1', 'street:s1')).toEqual(['s1', 's2', 's3'])
  })

  it('a right-click on any run picks the whole street and opens its menu', () => {
    render(<App />)
    fireEvent.contextMenu(run('street:s3'), at({ x: 60, y: 217 }, { button: 2 }))
    expect(pickedRefs().filter((r) => r.kind === 'street')).toEqual([{ kind: 'street', id: 'street:s1' }])
    expect(screen.getByRole('menu')).toBeTruthy()
    expect([...screen.getByRole('menu').querySelectorAll('[role^="menuitem"]')].map((b) => b.querySelector('span')!.textContent)).toContain('Delete')
  })

  it('a right-click on a run whose neighbour is locked is not "locked": the street is mixed', () => {
    useApp.setState({ project: actions.lockStreets(s().project, ['s1'], true, 'o1') })
    render(<App />)
    fireEvent.contextMenu(run('street:s3'), at({ x: 60, y: 217 }, { button: 2 }))
    expect(pickedRefs().filter((r) => r.kind === 'street')).toEqual([{ kind: 'street', id: 'street:s1' }])
  })

  it('what is under a point is the street, by its id, once', () => {
    expect(thingsAt({ x: 60, y: 195 }, 1).filter((r) => r.kind === 'street')).toEqual([{ kind: 'street', id: 'street:s1' }])
    expect(thingsAt({ x: 60, y: 217 }, 1).filter((r) => r.kind === 'street')).toEqual([{ kind: 'street', id: 'street:s1' }])
  })

  it('a T-joined branch is a street of its own', () => {
    const p = s().project
    const o = p.options[0]
    const streets = { nodes: [...o.streets!.nodes, { id: 'n7', x: 90, y: 185 }], segments: [...o.streets!.segments, { id: 's5', a: 'n2', b: 'n7', type: 'trucks', left: 4, right: 4 }] }
    useApp.setState({ project: { ...p, options: [{ ...o, streets }] } })
    useApp.setState({ derived: derive(s().project, 'o1') })
    render(<App />)
    click(run('street:s5'))
    expect(useRoads.getState().picked).toBe('street:s5')
  })
})
