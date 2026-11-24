// Merge (Phase H.2, Decision "Holes and free geometry"; the user: "not only group: a boolean union, so it does not
// split the elements in halves"): masses that touch become one, their outlines united, a court they close a hole; the
// first keeps its name, program and height; the plan menu greys Merge out with its reason; Ctrl+J; the tool.
// Three masses between the demo's warehouses (x 200…250 is free), as in the user's screenshot: a north half, and a
// south half split in two; together a 30 × 100 m rectangle, x 210…240, y 50…150.
import { act, render } from '@testing-library/react'
import { fireEvent } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../../App.tsx'
import { callTool } from '../../../api/tools/index.ts'
import { derive } from '../../../engine/derive.ts'
import { mergeShapes, tidy } from '../../../engine/geom/merge.ts'
import { signedArea } from '../../../engine/geom/polygon.ts'
import type { Point, Project } from '../../../model/schema.ts'
import { actions } from '../../../state/actions/index.ts'
import { demoProject } from '../../../state/demo.ts'
import { emptyHistory } from '../../../state/history.ts'
import { settle } from '../../../state/settle.ts'
import { NO_SELECTION, useApp } from '../../../state/store.ts'
import { useToast } from '../../layout/toast.ts'
import { useUi } from '../../layout/ui.ts'
import { planMenu } from '../../editing/menu/__tests__/helpers.ts'

vi.mock('../../scene/Scene.tsx', () => ({ Scene: () => <div data-testid="scene" /> }))

const square = (x0: number, y0: number, x1: number, y1: number): Point[] => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
]
const rect = (cx: number, cy: number, width: number, depth: number) => ({ kind: 'rect' as const, center: { x: cx, y: cy }, width, depth, rotation: 0 })

/** The demo with the three halves: their ids, north first. */
function halves(): { p: Project; ids: string[] } {
  let p = demoProject()
  const ids: string[] = []
  for (const [footprint, name] of [
    [rect(225, 130, 30, 40), 'Bodega 2 · north half'],
    [rect(217.5, 80, 15, 60), 'Bodega 2 · south half (SW)'],
    [rect(232.5, 80, 15, 60), 'Bodega 2 · bodeguita'],
  ] as const) {
    const r = actions.addMass(p, { programId: 'warehouse', footprint, name, height: 14 })
    p = r.project
    ids.push(r.id)
  }
  return { p, ids }
}

const s = () => useApp.getState()
const item = (key: string) => planMenu().find((x) => typeof x === 'object' && x.key === key) as { disabled?: boolean; title?: string; onSelect(): void }

beforeEach(() => {
  localStorage.clear()
  const { p } = halves()
  useApp.setState({ project: p, derived: derive(p), history: emptyHistory(), dragStart: null, selection: NO_SELECTION, level: 'l1', showAll: false })
  useUi.setState({ dialog: null, view: 'plan', rail: 'layers', panels: { left: true, right: true }, sheet: null })
  useToast.setState({ toast: null, confirmation: null })
})

describe('the union (engine)', () => {
  it('drops the corners where the shapes met: three rectangles are one, four corners', () => {
    const r = mergeShapes([[square(210, 110, 240, 150)], [square(210, 50, 225, 110)], [square(225, 50, 240, 110)]])!
    expect(r.holes).toEqual([])
    expect(r.outline).toHaveLength(4)
    expect(signedArea(r.outline)).toBeCloseTo(3000, 6)
    expect(tidy([...square(0, 0, 10, 10).slice(0, 1), { x: 5, y: 0 }, ...square(0, 0, 10, 10).slice(1)])).toHaveLength(4)
  })

  it('a court they close all round is a hole; apart, they are no one shape', () => {
    const ring = [square(0, 0, 10, 30), square(20, 0, 30, 30), square(10, 0, 20, 10), square(10, 20, 20, 30)]
    const r = mergeShapes(ring.map((q) => [q]))!
    expect(r.holes).toHaveLength(1)
    expect(signedArea(r.holes[0])).toBeCloseTo(-100, 6)
    expect(mergeShapes([[square(0, 0, 10, 10)], [square(20, 0, 30, 10)]])).toBeNull()
  })
})

describe('mergeMasses (the verb)', () => {
  it('the first keeps its id, name, program and height, with the outline of all; the others go', () => {
    const { p, ids } = halves()
    const r = actions.mergeMasses(p, ids)!
    expect(r.id).toBe(ids[0])
    expect(r.project.masses.filter((m) => ids.includes(m.id))).toEqual([
      expect.objectContaining({ id: ids[0], name: 'Bodega 2 · north half', programId: 'warehouse', height: 14, footprint: rect(225, 100, 30, 100) }),
    ])
    expect(derive(r.project).masses[ids[0]].area).toBeCloseTo(3000, 6)
  })

  it('a court becomes a hole of the merged mass', () => {
    let p = demoProject()
    const ids: string[] = []
    for (const f of [rect(215, 80, 10, 60), rect(235, 80, 10, 60), rect(225, 55, 10, 10), rect(225, 105, 10, 10)]) {
      const r = actions.addMass(p, { programId: 'warehouse', footprint: f })
      p = r.project
      ids.push(r.id)
    }
    const r = actions.mergeMasses(p, ids)!
    const merged = r.project.masses.find((m) => m.id === ids[0])!
    expect(merged.holes).toHaveLength(1)
    expect(derive(r.project).masses[ids[0]].area).toBeCloseTo(30 * 60 - 10 * 40, 6)
  })

  it('refuses masses that do not touch or stand on two levels; a locked one keeps its shape', () => {
    const { p, ids } = halves()
    expect(actions.mergeMasses(p, ['m1', 'm2'])).toBeNull()
    expect(actions.mergeMasses(p, [ids[0]])).toBeNull()
    const up = actions.addLevelAtEnd(p, 'above')
    expect(actions.mergeMasses(actions.updateMass(up.project, ids[1], { levelId: up.id }), ids)).toBeNull()
    const locked = actions.lockMasses(p, [ids[1]], true)
    expect(settle(locked, actions.mergeMasses(locked, ids)!.project)).toEqual({ refused: expect.stringMatching(/is locked/) })
  })
})

describe('in the plan', () => {
  it('the menu greys Merge out with why; with three that touch, it merges them, one undo step, the merged one picked', () => {
    act(() => s().selectMany(['m1', 'm2']))
    expect(item('union')).toMatchObject({ disabled: true, title: 'They do not all touch: merge masses that share a wall or overlap' })
    const ids = s().project.masses.slice(-3).map((m) => m.id)
    act(() => s().selectMany(ids))
    expect(item('union').disabled).toBe(false)
    const before = s().project
    act(() => item('union').onSelect())
    expect(s().project.masses).toHaveLength(before.masses.length - 2)
    expect(s().selection.massIds).toEqual([ids[0]])
    expect(useToast.getState().toast).toMatchObject({ text: '3 blocks merged into one.' })
    act(() => s().undo())
    // the decision log keeps the merge and its undo (Decision "Decision log")
    expect(s().project.masses).toEqual(before.masses)
    expect(s().project.log?.map((e) => e.verb)).toEqual(['mergeMasses', 'undo'])
  })

  it('U merges the selection (Union; Ctrl+J has no key now)', () => {
    render(<App />)
    const ids = s().project.masses.slice(-3).map((m) => m.id)
    act(() => s().selectMany(ids))
    fireEvent.keyDown(window, { key: 'j', ctrlKey: true })
    expect(s().project.masses.filter((m) => ids.includes(m.id))).toHaveLength(3)
    fireEvent.keyDown(window, { key: 'u' })
    expect(s().project.masses.filter((m) => ids.includes(m.id)).map((m) => m.id)).toEqual([ids[0]])
  })
})

describe('the tool (MCP and the Agent tab)', () => {
  it('mergeMasses merges, or says why not', () => {
    const { p, ids } = halves()
    const r = callTool(p, 'mergeMasses', { masses: ids })
    expect(r.ok && r.output).toEqual({ done: true, id: ids[0] })
    const apart = callTool(p, 'mergeMasses', { masses: ['m1', 'm2'] })
    expect(apart).toEqual({ ok: false, error: 'They do not all touch: merge masses that share a wall or overlap.' })
  })
})
