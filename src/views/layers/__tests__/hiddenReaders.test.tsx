// What the layer store hides, as the plan and the commands read it (Phase AS.3, task 1): a hidden key is not drawn, not
// picked by a click or by the window, and still counted in what the project holds. The buildings' and the drawings'
// tests (`plan/__tests__/buildings.test.tsx`, `plan/site/__tests__/drawingsLayer.test.tsx`, `drawingPick.test.tsx`,
// `plan/snap/__tests__/drawn.test.tsx`) say the same for their kinds through this store; here the keys that had no such
// test: the dimensions, the labels, the issues' chips and the rules' arcs, and the commands that toggle them.
import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Point } from '../../../model/schema.ts'
import { App } from '../../../App.tsx'
import { derive } from '../../../engine/derive.ts'
import { actions } from '../../../state/actions/index.ts'
import { demoProject } from '../../../state/demo.ts'
import { emptyHistory } from '../../../state/history.ts'
import { NO_SELECTION, useApp } from '../../../state/store.ts'
import { runCommand } from '../../commands/index.ts'
import { useUi } from '../../layout/ui.ts'
import { fit, UNMEASURED_SIZE } from '../../plan/camera.ts'
import { pickedNow, selectBox } from '../../plan/mix.ts'
import { useDimensions } from '../../plan/tools/toolState.ts'
import { letGo, take } from '../../tools/hand.ts'
import { DIMENSIONS, ISSUES, LABELS, RULES } from '../keys.ts'
import { isHidden, toggleLayer, useLayerView } from '../layerView.ts'

vi.mock('../../scene/Scene.tsx', () => ({ Scene: () => <div data-testid="scene" /> }))

const v = fit({ minX: 0, minY: 0, maxX: 440, maxY: 280 }, UNMEASURED_SIZE)
const at = (q: Point) => ({ clientX: (q.x - v.cx) * v.scale + UNMEASURED_SIZE.w / 2, clientY: UNMEASURED_SIZE.h / 2 - (q.y - v.cy) * v.scale, button: 0, pointerId: 1 })
const plan = () => screen.getByRole('img', { name: 'Site plan' })

let dim = ''
beforeEach(() => {
  const p0 = demoProject()
  const d = actions.addDimension(p0, { x: 60, y: 60 }, { x: 100, y: 60 }, 8, 'l1')!
  dim = d.id
  const p = d.project
  useApp.setState({ project: p, derived: derive(p), history: emptyHistory(), dragStart: null, selection: NO_SELECTION, level: 'l1', showAll: false, option: 'o1' })
  useUi.setState({ dialog: null, view: 'plan', rail: 'layers', panels: { left: true, right: true }, sheet: null })
  letGo()
  useDimensions.setState({ selected: null, also: [] })
})

describe('the dimensions', () => {
  it('hidden: not drawn, not picked by the window, a selected one let go, still in the project; the Dimension tool shows them', () => {
    render(<App />)
    expect(document.querySelector(`[data-dimension="${dim}"]`)).not.toBeNull()
    act(() => useDimensions.getState().select(dim))
    act(() => toggleLayer(DIMENSIONS))
    expect(document.querySelector(`[data-dimension="${dim}"]`)).toBeNull()
    expect(useDimensions.getState().selected).toBeNull()
    expect(useApp.getState().project.dimensions).toHaveLength(1)
    fireEvent.pointerDown(plan(), at({ x: -5, y: 285 }))
    fireEvent.pointerMove(plan(), at({ x: 220, y: 140 }))
    fireEvent.pointerMove(plan(), at({ x: 445, y: -5 }))
    fireEvent.pointerUp(plan(), at({ x: 445, y: -5 }))
    expect(pickedNow().dimensions).toEqual([])
    expect(pickedNow().masses.length).toBeGreaterThan(0)
    act(() => {
      take('dimension')
    })
    expect(isHidden(DIMENSIONS)).toBe(false)
    expect(document.querySelector(`[data-dimension="${dim}"]`)).not.toBeNull()
    act(() => selectBox({ a: { x: -5, y: -5 }, b: { x: 445, y: 285 } }, false))
    expect(pickedNow().dimensions).toEqual([dim])
  })
})

describe('the labels, the issues and the rules', () => {
  it('Labels hidden: no label on the plan, the masses still there', () => {
    render(<App />)
    expect(document.querySelector('[data-label]')).not.toBeNull()
    act(() => toggleLayer(LABELS))
    expect(document.querySelector('[data-label]')).toBeNull()
    expect(document.querySelector('[data-mass]')).not.toBeNull()
  })

  it('Rules hidden: no arcs; Issues hidden: no chips; both come back', () => {
    // the office outside the site: an error about it alone, and a broken rule
    useApp.setState((st) => {
      const p = actions.moveMass(st.project, 'm3', { x: 0, y: 200 })
      return { project: p, derived: derive(p, 'o1') }
    })
    render(<App />)
    expect(document.querySelector('[data-rules-layer]')).not.toBeNull()
    expect(document.querySelector('[data-issue-markers]')).not.toBeNull()
    act(() => useLayerView.getState().setHidden([RULES, ISSUES], true))
    expect(document.querySelector('[data-rules-layer]')).toBeNull()
    expect(document.querySelector('[data-issue-markers]')).toBeNull()
    act(() => useLayerView.getState().setHidden([RULES, ISSUES], false))
    expect(document.querySelector('[data-rules-layer]')).not.toBeNull()
    expect(document.querySelector('[data-issue-markers]')).not.toBeNull()
  })
})

describe('the commands', () => {
  it('View › Overlays toggle the keys, and what a project hides another does not', async () => {
    render(<App />)
    for (const [id, key] of [
      ['view.overlay.labels', LABELS],
      ['view.overlay.dims', DIMENSIONS],
      ['view.overlay.issues', ISSUES],
      ['view.overlay.rules', RULES],
    ] as const) {
      await act(async () => runCommand(id))
      expect(isHidden(key), id).toBe(true)
      await act(async () => runCommand(id))
      expect(isHidden(key), id).toBe(false)
    }
    await act(async () => runCommand('view.overlay.rules'))
    act(() => useApp.getState().open({ ...demoProject(), id: 'other' }))
    expect(isHidden(RULES)).toBe(false)
  })
})
