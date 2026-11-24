// B.3 on the plan (Decisions "Buildings and options", "Buildings layout"): the active option's other buildings as
// context at the active level's height, picking one makes its building active, Shift+click and the window take them
// too, context is grey and dashed, *Color by: Building*, hiding, and another option's buildings never show.
// The demo is Building 1 (b1: m1, m2, m3 on l1). Building 2 has a mass "Shed" on its L1 and "Loft" on its L2 (12 m).
import { act, fireEvent, render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Point, Project } from '../../../model/schema.ts'
import { App } from '../../../App.tsx'
import { derive } from '../../../engine/derive.ts'
import { addBuilding, addOption, updateBuilding } from '../../../state/actions/buildings.ts'
import { addLevelAtEnd } from '../../../state/actions/levels.ts'
import { addMass } from '../../../state/actions/masses.ts'
import { demoProject } from '../../../state/demo.ts'
import { emptyHistory } from '../../../state/history.ts'
import { NO_SELECTION, useApp } from '../../../state/store.ts'
import { fillOf, levelAt, otherLevels, shownBuildings, useBuildingView } from '../../buildingView.ts'
import { building } from '../../layers/keys.ts'
import { useLayerView } from '../../layers/layerView.ts'
import { useUi } from '../../layout/ui.ts'
import { fit, UNMEASURED_SIZE } from '../camera.ts'
import { resetTyped } from '../../editing/dimension/typed.ts'
import { REFERENCE_DEFAULT, useReference } from '../reference.ts'
import { DEFAULT_SNAP } from '../snap/kinds.ts'
import { useSnapSettings } from '../snap/settings.ts'
import { useDimensions } from '../tools/toolState.ts'
import { letGo } from '../../tools/hand.ts'

vi.mock('../../scene/Scene.tsx', () => ({ Scene: () => <div data-testid="scene" /> }))

const rect = (x: number, y: number, w: number, d: number) => ({ kind: 'rect' as const, center: { x, y }, width: w, depth: d, rotation: 0 })

/** The demo plus Building 2 (in Option 1): Shed on its L1, Loft on its L2; and Option 2 with only Building 2. */
function project(): { p: Project; b2: string; l1: string; l2: string; shed: string; loft: string; o2: string } {
  const b = addBuilding(demoProject(), { optionId: 'o1' })
  const up = addLevelAtEnd(b.project, 'above', b.id)
  const shed = addMass(up.project, { programId: 'warehouse', footprint: rect(300, 215, 40, 20), levelId: b.levelId, name: 'Shed' })
  const loft = addMass(shed.project, { programId: 'office', footprint: rect(300, 215, 20, 10), levelId: up.id, name: 'Loft' })
  const o2 = addOption(loft.project, { buildingIds: [b.id] })
  return { p: o2.project, b2: b.id, l1: b.levelId, l2: up.id, shed: shed.id, loft: loft.id, o2: o2.id }
}

const v = fit({ minX: 0, minY: 0, maxX: 440, maxY: 280 }, UNMEASURED_SIZE)
const at = (q: Point, extra: object = {}) => ({
  clientX: (q.x - v.cx) * v.scale + UNMEASURED_SIZE.w / 2,
  clientY: UNMEASURED_SIZE.h / 2 - (q.y - v.cy) * v.scale,
  button: 0,
  pointerId: 1,
  ...extra,
})
const other = (id: string) => document.querySelector(`[data-other-mass="${id}"]`)
const plan = () => document.querySelector('svg[aria-label="Site plan"]')!

function start(p: Project) {
  useApp.setState({ project: p, derived: derive(p, 'o1'), history: emptyHistory(), dragStart: null, selection: NO_SELECTION, level: 'l1', showAll: false, option: 'o1' })
}

beforeEach(() => {
  localStorage.clear()
  useUi.setState({ dialog: null, view: 'plan', rail: 'layers', panels: { left: true, right: true }, sheet: null })
  letGo()
  useDimensions.setState({ selected: null })
  useSnapSettings.setState({ settings: DEFAULT_SNAP })
  resetTyped()
  useReference.setState(REFERENCE_DEFAULT)
  useBuildingView.setState({ colorBy: 'program' })
})

describe('what shows', () => {
  it('shownBuildings, levelAt and otherLevels: the option’s, not hidden, at the active level’s height', () => {
    const { p, b2, l1, l2 } = project()
    expect(shownBuildings(p, 'o1', []).map((b) => b.id)).toEqual(['b1', b2])
    expect(shownBuildings(p, 'o1', [building(b2)]).map((b) => b.id)).toEqual(['b1'])
    const levels = p.buildings[1].levels
    expect(levelAt(levels, 0).id).toBe(l1)
    expect(levelAt(levels, 12).id).toBe(l2)
    expect(levelAt(levels, 99).id).toBe(l1) // nothing that high: its ground floor
    expect(otherLevels(p, 'l1', 'o1', [])).toEqual([l1])
    expect(fillOf(p, p.masses[0], 'building')).toBe('#4e79a7')
    expect(fillOf(p, p.masses[0], 'program')).toBe(p.programs.find((g) => g.id === 'warehouse')!.color)
  })

  it('the plan draws the option’s other building, lighter, at the same height; never another option’s', () => {
    const { p, shed, loft, b2 } = project()
    start(p)
    render(<App />)
    expect(other(shed)).not.toBeNull()
    expect(other(loft)).toBeNull()
    // an option with only Building 2: Building 1 is gone from the plan
    act(() => useApp.getState().setOption(useApp.getState().project.options[1].id))
    expect(useApp.getState().level).toBe(useApp.getState().project.buildings[1].levels[0].id)
    expect(document.querySelector('[data-mass="m1"]')).toBeNull()
    expect(document.querySelector('[data-other-mass="m1"]')).toBeNull()
    // hidden: not drawn
    act(() => useApp.getState().setOption('o1'))
    act(() => useLayerView.getState().setHidden([building(b2)], true))
    expect(other(shed)).toBeNull()
  })

  it('a context building is grey and dashed; Color by: Building paints the design by building', () => {
    const { p, b2, shed } = project()
    start(updateBuilding(p, b2, { context: true }))
    render(<App />)
    expect(other(shed)).toHaveAttribute('fill', 'var(--context-fill)')
    expect(other(shed)).toHaveAttribute('stroke-dasharray', '5 3')
    act(() => useBuildingView.getState().setColorBy('building'))
    expect(document.querySelector('[data-mass="m1"]')).toHaveAttribute('fill', '#4e79a7')
    expect(other(shed)).toHaveAttribute('fill', 'var(--context-fill)')
  })
})

describe('picking across buildings', () => {
  it('a click on another building’s mass selects it and makes its building active', () => {
    const { p, shed, l1 } = project()
    start(p)
    render(<App />)
    fireEvent.pointerDown(other(shed)!, at({ x: 300, y: 215 }))
    expect(useApp.getState()).toMatchObject({ level: l1, selection: { massIds: [shed] } })
    expect(document.querySelector(`[data-mass="${shed}"]`)).not.toBeNull()
    expect(document.querySelector('[data-other-mass="m1"]')).not.toBeNull()
  })

  it('Shift+click and the window take masses of the other buildings too, without leaving the level', () => {
    const { p, shed } = project()
    start(p)
    render(<App />)
    act(() => useApp.getState().select('m3'))
    fireEvent.pointerDown(other(shed)!, at({ x: 300, y: 215 }, { shiftKey: true }))
    expect(useApp.getState()).toMatchObject({ level: 'l1', selection: { massIds: ['m3', shed] } })
    // a window around m2 and the Shed
    fireEvent.pointerDown(plan(), at({ x: 240, y: 60 }))
    fireEvent.pointerMove(plan(), at({ x: 300, y: 150 }))
    fireEvent.pointerMove(plan(), at({ x: 400, y: 235 }))
    fireEvent.pointerUp(plan(), at({ x: 400, y: 235 }))
    expect(useApp.getState().selection.massIds).toEqual(['m2', shed])
  })

  it('in the store: another option’s mass cannot join; changing level keeps the other buildings’ masses', () => {
    const { p, shed } = project()
    start(p)
    const s = useApp.getState()
    s.selectMany(['m1', shed])
    expect(useApp.getState().selection.massIds).toEqual(['m1', shed])
    // Building 2 out of Option 1: the Shed no longer joins
    s.apply((q) => ({ ...q, options: q.options.map((o) => (o.id === 'o1' ? { ...o, buildingIds: ['b1'] } : o)) }))
    useApp.getState().selectMany(['m1', shed])
    expect(useApp.getState().selection.massIds).toEqual(['m1'])
  })
})
