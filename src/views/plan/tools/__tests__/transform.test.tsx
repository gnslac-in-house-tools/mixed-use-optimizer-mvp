// Phase GT.4 (Decision "General tools"): Move and Copy by a base point and a target point, from the tools bar or M and
// C, over whatever is picked; GT.5: Rotate (R) by a pivot, the start of the turn and its end. Presses go to the tool's
// capture surface, as the Dimension tool's tests drive it.
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Point } from '../../../../model/schema.ts'
import { App } from '../../../../App.tsx'
import { derive } from '../../../../engine/derive.ts'
import { demoProject } from '../../../../state/demo.ts'
import { emptyHistory } from '../../../../state/history.ts'
import { actions } from '../../../../state/actions/index.ts'
import { useApp } from '../../../../state/store.ts'
import { useUi } from '../../../layout/ui.ts'
import { useToast } from '../../../layout/toast.ts'
import { fit, UNMEASURED_SIZE } from '../../camera.ts'
import { useClipboard } from '../../clipboard.ts'
import { useCommand } from '../../command/commandState.ts'
import { NOTHING_PICKED } from '../../../../model/picked.ts'
import { useRoads } from '../../circulation/roadState.ts'
import { setPicked } from '../../mix.ts'
import { useSiteTool } from '../../site/siteTools.ts'
import { DEFAULT_SNAP } from '../../snap/kinds.ts'
import { useSnapSettings } from '../../snap/settings.ts'
import { useDimensions, useRuler, useTool } from '../toolState.ts'
import { turnAngle } from '../Transform.tsx'
import { letGo, take, toggle } from '../../../tools/hand.ts'
import { closeMenus } from '../../../__tests__/pickMenu.ts'

vi.mock('../../../scene/Scene.tsx', () => ({ Scene: () => <div data-testid="scene" /> }))

// the demo's site and its 15 m south street, as the plan fits it
const v = fit({ minX: 0, minY: -15, maxX: 440, maxY: 280 }, UNMEASURED_SIZE)
const at = (q: Point, extra: object = {}) => ({
  clientX: (q.x - v.cx) * v.scale + UNMEASURED_SIZE.w / 2,
  clientY: UNMEASURED_SIZE.h / 2 - (q.y - v.cy) * v.scale,
  button: 0,
  pointerId: 1,
  ...extra,
})
const free = { shiftKey: true }
const capture = () => document.querySelector('[data-tool] > [data-capture]')!
const move = (q: Point, extra: object = {}) => fireEvent.pointerMove(capture(), at(q, extra))
const click = (q: Point, extra: object = {}) => {
  fireEvent.pointerMove(capture(), at(q, extra))
  fireEvent.pointerDown(capture(), at(q, extra))
  fireEvent.pointerUp(capture(), at(q, extra))
}
const key = (k: string, extra: object = {}) => fireEvent.keyDown(window, { key: k, ...extra })
const steps = () => useApp.getState().history.past.length
/** The office (m3): a 40 × 20 m rectangle centred at (120, 200), so its bottom-left corner is (100, 190). */
const officeRect = () => {
  const f = useApp.getState().project.masses.find((m) => m.id === 'm3')!.footprint
  if (f.kind !== 'rect') throw new Error('not a rect')
  return f
}
const office = () => officeRect().center
const transform = () => screen.getByRole('toolbar', { name: 'Tools' })
const line = () => screen.getByRole('textbox', { name: 'Command line' })
const type = (text: string) => {
  fireEvent.change(line(), { target: { value: text } })
  fireEvent.keyDown(line(), { key: 'Enter' })
}

beforeEach(() => {
  localStorage.clear()
  const p = demoProject()
  useApp.setState({ project: p, derived: derive(p), history: emptyHistory(), dragStart: null, selection: { massId: null, vertex: null, massIds: [] } })
  useUi.setState({ dialog: null, view: 'plan', rail: 'layers', panels: { left: true, right: true }, sheet: null, help: true })
  letGo()
  useDimensions.setState({ selected: null, also: [] })
  // no grid: a point off every target stays where the pointer is
  useSnapSettings.setState({ settings: { ...DEFAULT_SNAP, grid: false } })
  useClipboard.setState({ masses: [], roads: [] })
  useCommand.setState({ registration: null, angle: null, cursor: null })
  useToast.setState({ toast: null, confirmation: null })
  letGo()
  useRoads.setState({ picked: null, also: [] })
})

describe('Move', () => {
  it('Move: base on a corner, target on another mass’s corner, the selection moves by that vector as one undo step', () => {
    render(<App />)
    act(() => useApp.getState().select('m3'))
    key('m')
    expect(useTool.getState().tool).toBe('move')
    expect(screen.getByRole('group', { name: 'Command' })).toHaveTextContent('Base point')
    const before = steps()
    click({ x: 100.3, y: 190.2 }) // the office's corner
    expect(screen.getByRole('group', { name: 'Command' })).toHaveTextContent('Target point')
    click({ x: 200.3, y: 150.2 }) // Warehouse 1's top-right corner
    expect(office()).toEqual({ x: 220, y: 160 })
    expect(steps()).toBe(before + 1)
    // done: back to Select, the moved office still picked
    expect(useTool.getState().tool).toBe('select')
    expect(useApp.getState().selection.massIds).toEqual(['m3'])
    act(() => useApp.getState().undo())
    expect(office()).toEqual({ x: 120, y: 200 })
  })

  it('Move: the target snaps to another mass’s corner, never to the moved mass’s own corner under the pointer', () => {
    render(<App />)
    act(() => useApp.getState().select('m3'))
    key('m')
    click({ x: 100, y: 190 })
    // the preview puts the office's corner at (60, 240): near it, nothing attracts (the office's own corner is not a target)
    move({ x: 60, y: 240 }, free)
    expect(office()).toEqual({ x: 80, y: 250 })
    move({ x: 60.4, y: 240.3 })
    expect(office().x).toBeCloseTo(80.4, 6)
    expect(office().y).toBeCloseTo(250.3, 6)
    // another mass's corner does attract
    click({ x: 200.3, y: 150.2 })
    expect(office()).toEqual({ x: 220, y: 160 })
  })

  it('Move: Escape while the preview shows leaves the project as it was and adds no step', () => {
    render(<App />)
    act(() => useApp.getState().select('m3'))
    const project = useApp.getState().project
    const before = steps()
    key('m')
    click({ x: 100, y: 190 })
    move({ x: 150, y: 250 }, free)
    expect(office()).not.toEqual({ x: 120, y: 200 })
    key('Escape')
    expect(useApp.getState().project).toBe(project)
    expect(steps()).toBe(before)
    // back at the base point; Escape again goes back to Select
    expect(useTool.getState().tool).toBe('move')
    expect(screen.getByRole('group', { name: 'Command' })).toHaveTextContent('Base point')
    key('Escape')
    expect(useTool.getState().tool).toBe('select')
    expect(useApp.getState().selection.massIds).toEqual(['m3'])
  })

  it('Move: a typed 10 goes 10 m towards the pointer from the base', () => {
    render(<App />)
    act(() => useApp.getState().select('m3'))
    key('m')
    click({ x: 100, y: 190 })
    move({ x: 100, y: 230 }, free) // straight up from the base
    type('10')
    expect(office().x).toBeCloseTo(120, 6)
    expect(office().y).toBeCloseTo(210, 6)
    expect(useTool.getState().tool).toBe('select')
  })
})

describe('Copy', () => {
  it('Copy: two targets make two copies, one undo step each, and the originals stay picked', () => {
    render(<App />)
    act(() => useApp.getState().select('m3'))
    const count = () => useApp.getState().project.masses.length
    const n = count()
    const before = steps()
    key('c')
    expect(useTool.getState().tool).toBe('copy')
    click({ x: 100, y: 190 }, free)
    click({ x: 100, y: 230 }, free)
    expect(count()).toBe(n + 1)
    // still on, from the same base
    expect(useTool.getState().tool).toBe('copy')
    expect(screen.getByRole('group', { name: 'Command' })).toHaveTextContent('Target point')
    click({ x: 300, y: 230 }, free)
    expect(count()).toBe(n + 2)
    expect(steps()).toBe(before + 2)
    expect(office()).toEqual({ x: 120, y: 200 })
    const centres = useApp
      .getState()
      .project.masses.slice(n)
      .map((m) => (m.footprint.kind === 'rect' ? m.footprint.center : null))
    expect(centres).toEqual([
      { x: 120, y: 240 },
      { x: 320, y: 240 },
    ])
    expect(useApp.getState().selection.massIds).toEqual(['m3'])
    // Escape leaves the target step; at the base, Enter ends the tool
    key('Escape')
    key('Enter')
    expect(useTool.getState().tool).toBe('select')
    expect(useApp.getState().selection.massIds).toEqual(['m3'])
    act(() => useApp.getState().undo())
    expect(count()).toBe(n + 1)
  })
})

describe('a standing preview (it stays between two clicks)', () => {
  const prompt = () => screen.getByRole('group', { name: 'Command' })
  /** The office picked, Move on, its base at its corner and the pointer previewing a move of (50, 60). */
  const previewing = () => {
    act(() => useApp.getState().select('m3'))
    key('m')
    click({ x: 100, y: 190 })
    move({ x: 150, y: 250 }, free)
    expect(office()).toEqual({ x: 170, y: 260 })
  }

  it('Shift+R (Rotate 90°) during the target step does nothing: Escape leaves the project and the history as before the tool', () => {
    render(<App />)
    const project = useApp.getState().project
    const history = useApp.getState().history
    previewing()
    key('R', { shiftKey: true })
    key('d', { ctrlKey: true })
    key('Escape')
    expect(useApp.getState().project).toBe(project)
    expect(useApp.getState().history).toBe(history)
    expect(useApp.getState().dragStart).toBeNull()
  })

  it('Ctrl+Y during the target step does nothing; a redo from elsewhere drops the preview first, and the history stays true', () => {
    render(<App />)
    // a step to redo: the warehouse 2 renamed, then undone
    act(() => useApp.getState().apply((p) => actions.updateMass(p, 'm2', { name: 'Renamed' })))
    act(() => useApp.getState().undo())
    const project = useApp.getState().project
    previewing()
    key('y', { ctrlKey: true })
    key('z', { ctrlKey: true, shiftKey: true })
    expect(useApp.getState().history.future).toHaveLength(1)
    expect(office()).toEqual({ x: 170, y: 260 })
    // the toolbar's Redo, say: the preview goes first, then the redo; the tool is back at its base step
    act(() => useApp.getState().redo())
    expect(useApp.getState().dragStart).toBeNull()
    expect(office()).toEqual({ x: 120, y: 200 })
    expect(useApp.getState().project.masses.find((m) => m.id === 'm2')!.name).toBe('Renamed')
    expect(useApp.getState().history.past.at(-1)).toBe(project)
    expect(prompt()).toHaveTextContent('Base point')
    // the next pointer move does not preview from a base that is gone
    move({ x: 200, y: 260 }, free)
    expect(office()).toEqual({ x: 120, y: 200 })
    // undo goes back to the project before the redo (with the log's entry for the undo), never to the preview
    act(() => useApp.getState().undo())
    expect(useApp.getState().project.masses).toBe(project.masses)
    const redone = useApp.getState().history.future.at(-1)!
    expect(redone.masses.find((m) => m.id === 'm3')!.footprint).toEqual(project.masses.find((m) => m.id === 'm3')!.footprint)
    expect(redone.masses.find((m) => m.id === 'm2')!.name).toBe('Renamed')
  })

  it('an edit from elsewhere that commits the preview sends the tool back to its base: no move by d + d′', () => {
    render(<App />)
    previewing()
    act(() => useApp.getState().apply((p) => actions.updateMass(p, 'm2', { name: 'Renamed' })))
    expect(office()).toEqual({ x: 170, y: 260 })
    expect(prompt()).toHaveTextContent('Base point')
    move({ x: 200, y: 300 }, free)
    expect(office()).toEqual({ x: 170, y: 260 })
  })

  it('the pointer leaving the plan drops the preview; back on it, it previews again from the same base', () => {
    render(<App />)
    const project = useApp.getState().project
    previewing()
    fireEvent.pointerLeave(capture())
    expect(useApp.getState().project).toBe(project)
    expect(useApp.getState().dragStart).toBeNull()
    move({ x: 110, y: 200 }, free)
    expect(office()).toEqual({ x: 130, y: 210 })
  })

  // a right-click lets the tool go and opens the menu of what is picked: the preview is dropped first, so the menu is of what exists
  // (a Copy preview's copy is not in the project: its id would vanish under the menu)
  it.each([
    ['move', 'm', () => click({ x: 100, y: 190 }), () => move({ x: 150, y: 250 }, free)],
    ['copy', 'c', () => click({ x: 100, y: 190 }), () => move({ x: 150, y: 250 }, free)],
    [
      'rotate',
      'r',
      () => {
        click({ x: 100, y: 190 })
        click({ x: 140, y: 190 })
      },
      () => move({ x: 100, y: 230 }, free),
    ],
  ])('%s: a right-click with the preview standing drops it, and the menu is of what is picked and exists', (tool, k, start, show) => {
    render(<App />)
    act(() => useApp.getState().select('m3'))
    const project = useApp.getState().project
    const n = project.masses.length
    key(k)
    start()
    show()
    if (tool === 'copy') expect(useApp.getState().project.masses).toHaveLength(n + 1)
    fireEvent.contextMenu(capture(), at({ x: 150, y: 250 }))
    expect(useApp.getState().project).toBe(project)
    expect(useApp.getState().project.masses).toHaveLength(n)
    expect(useApp.getState().dragStart).toBeNull()
    expect(useTool.getState().tool).toBe('select')
    expect(screen.getByRole('menu')).toBeInTheDocument()
    const { massIds } = useApp.getState().selection
    expect(massIds).toEqual(['m3'])
    expect(massIds.every((id) => useApp.getState().project.masses.some((m) => m.id === id))).toBe(true)
    closeMenus()
  })
})

describe('the tools strip and the keys', () => {
  it('the strip’s Move and Copy are disabled with nothing picked and in 3D', () => {
    render(<App />)
    const chip = (name: string) => within(transform()).getByRole('button', { name }) as HTMLButtonElement
    expect(chip('Move').disabled).toBe(true)
    expect(chip('Copy').disabled).toBe(true)
    expect(chip('Move')).toHaveAttribute('title', 'Pick something first')
    act(() => useApp.getState().select('m3'))
    expect(chip('Move').disabled).toBe(false)
    expect(chip('Move')).toHaveAttribute('title', 'Move what is picked: a base point, then where it goes (M)')
    expect(chip('Copy')).toHaveAttribute('title', 'Copy what is picked: a base point, then where each copy goes; Enter ends (C)')
    fireEvent.click(chip('Copy'))
    expect(useTool.getState().tool).toBe('copy')
    expect(chip('Copy')).toHaveAttribute('aria-pressed', 'true')
    act(() => useUi.getState().setView('3d'))
    expect(chip('Move').disabled).toBe(true)
    expect(chip('Move').title).toBe('The plan is not on screen')
  })

  it('M and C start Move and Copy when something is picked; Ctrl+C still copies to the clipboard', () => {
    render(<App />)
    key('m')
    expect(useTool.getState().tool).toBe('select')
    key('c')
    expect(useTool.getState().tool).toBe('select')
    act(() => useApp.getState().select('m3'))
    key('m')
    expect(useTool.getState().tool).toBe('move')
    key('Escape')
    expect(useTool.getState().tool).toBe('select')
    key('c')
    expect(useTool.getState().tool).toBe('copy')
    key('Escape')
    key('c', { ctrlKey: true })
    expect(useTool.getState().tool).toBe('select')
    expect(useClipboard.getState().masses.map((m) => m.id)).toEqual(['m3'])
  })

  it('a Move started with nothing picked goes straight back to Select', () => {
    render(<App />)
    act(() => take('move'))
    expect(useTool.getState().tool).toBe('select')
  })
})

describe('Rotate', () => {
  const prompt = () => screen.getByRole('group', { name: 'Command' })
  /** q turned by `degrees` about `pivot` (counter-clockwise). */
  const turned = (q: Point, pivot: Point, degrees: number): Point => {
    const a = (degrees * Math.PI) / 180
    const dx = q.x - pivot.x
    const dy = q.y - pivot.y
    return { x: pivot.x + dx * Math.cos(a) - dy * Math.sin(a), y: pivot.y + dx * Math.sin(a) + dy * Math.cos(a) }
  }

  it('turnAngle is the signed angle from the start to the pointer about the pivot, by 15° with Ortho', () => {
    expect(turnAngle({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, false)).toBeCloseTo(90, 9)
    expect(turnAngle({ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 0 }, false)).toBeCloseTo(-90, 9)
    expect(turnAngle({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: -1, y: 0 }, false)).toBeCloseTo(180, 9)
    const at37 = { x: Math.cos((37 * Math.PI) / 180), y: Math.sin((37 * Math.PI) / 180) }
    expect(turnAngle({ x: 0, y: 0 }, { x: 1, y: 0 }, at37, true)).toBe(30)
    expect(turnAngle({ x: 0, y: 0 }, { x: 1, y: 0 }, at37, false)).toBeCloseTo(37, 9)
  })

  it('Rotate: pivot on a corner, start on the next corner, end on a street’s edge: the mass turns to point at it', () => {
    render(<App />)
    act(() => useApp.getState().select('m3'))
    const before = steps()
    key('r')
    expect(useTool.getState().tool).toBe('rotate')
    expect(prompt()).toHaveTextContent('Pivot')
    click({ x: 100.3, y: 190.2 }) // the office's bottom-left corner
    expect(prompt()).toHaveTextContent('Start of the turn')
    click({ x: 140.3, y: 190.2 }) // its bottom-right corner: the start points along +x
    expect(prompt()).toHaveTextContent('End of the turn')
    expect(prompt()).toHaveTextContent('click, or type the angle · 30 · -45')
    // the top of the street round the office, along y = 221: its inner edge
    const street = useApp.getState().derived.circulation.roads.find((r) => r.id === 'street:s1')!
    const edge = 221 - street.width / 2
    click({ x: 120.3, y: edge + 0.3 })
    const end = useCommand.getState().cursor!
    expect(end.y).toBeCloseTo(edge, 6) // the end snapped onto the edge
    const angle = (Math.atan2(end.y - 190, end.x - 100) * 180) / Math.PI
    expect(officeRect().rotation).toBeCloseTo(angle, 6)
    const c = turned({ x: 120, y: 200 }, { x: 100, y: 190 }, angle)
    expect(office().x).toBeCloseTo(c.x, 6)
    expect(office().y).toBeCloseTo(c.y, 6)
    expect(steps()).toBe(before + 1)
    // done: back to Select, the turned office still picked; one undo puts it back
    expect(useTool.getState().tool).toBe('select')
    expect(useApp.getState().selection.massIds).toEqual(['m3'])
    act(() => useApp.getState().undo())
    expect(office()).toEqual({ x: 120, y: 200 })
    expect(officeRect().rotation).toBe(0)
  })

  it('Rotate: a typed 30 turns by 30°', () => {
    render(<App />)
    act(() => useApp.getState().select('m3'))
    const before = steps()
    key('r')
    click({ x: 100, y: 190 })
    click({ x: 140, y: 190 })
    move({ x: 100, y: 240 }, free) // a 90° preview
    type('30')
    expect(officeRect().rotation).toBeCloseTo(30, 9)
    const c = turned({ x: 120, y: 200 }, { x: 100, y: 190 }, 30)
    expect(office().x).toBeCloseTo(c.x, 6)
    expect(office().y).toBeCloseTo(c.y, 6)
    expect(steps()).toBe(before + 1)
    expect(useTool.getState().tool).toBe('select')
  })

  it('Rotate: Escape steps back end → start → pivot → Select and leaves no step', () => {
    render(<App />)
    act(() => useApp.getState().select('m3'))
    const project = useApp.getState().project
    const history = useApp.getState().history
    key('r')
    click({ x: 100, y: 190 })
    click({ x: 100, y: 190 }) // a start at the pivot is refused
    expect(prompt()).toHaveTextContent('Start of the turn')
    click({ x: 140, y: 190 })
    move({ x: 100, y: 240 }, free)
    expect(officeRect().rotation).toBeCloseTo(90, 9)
    // the app's keys that edit the project are the tool's while the end previews
    key('R', { shiftKey: true })
    key('Escape')
    expect(useApp.getState().project).toBe(project)
    expect(useApp.getState().dragStart).toBeNull()
    expect(prompt()).toHaveTextContent('Start of the turn')
    key('Escape')
    expect(prompt()).toHaveTextContent('Pivot')
    key('Escape')
    expect(useTool.getState().tool).toBe('select')
    expect(useApp.getState().project).toBe(project)
    expect(useApp.getState().history).toBe(history)
    expect(useApp.getState().selection.massIds).toEqual(['m3'])
  })

  it('Rotate: Ortho turns by 15° steps; Shift is free', () => {
    render(<App />)
    act(() => useApp.getState().select('m3'))
    act(() => useSnapSettings.setState({ settings: { ...useSnapSettings.getState().settings, ortho: true } }))
    key('r')
    click({ x: 100, y: 190 })
    click({ x: 140, y: 190 })
    const at37 = { x: 100 + 30 * Math.cos((37 * Math.PI) / 180), y: 190 + 30 * Math.sin((37 * Math.PI) / 180) }
    move(at37)
    expect(officeRect().rotation).toBeCloseTo(30, 9)
    move(at37, free)
    expect(officeRect().rotation).toBeCloseTo(37, 6)
  })
})

describe('one start for the bar and the keys', () => {
  it('a site tool on, something picked, O: the site tool is off and Rotate is on', () => {
    render(<App />)
    act(() => useApp.getState().select('m3'))
    act(() => take('place'))
    act(() => toggle('ruler'))
    key('r')
    expect(useSiteTool.getState().tool).toBeNull()
    expect(useRuler.getState().active).toBe(false)
    expect(useTool.getState().tool).toBe('rotate')
    key('r') // again: back to Select
    expect(useTool.getState().tool).toBe('select')
  })

  it('the strip’s Rotate is disabled with nothing picked, as Move is', () => {
    render(<App />)
    const chip = () => within(transform()).getByRole('button', { name: 'Rotate' }) as HTMLButtonElement
    expect(chip().disabled).toBe(true)
    expect(chip()).toHaveAttribute('title', 'Pick something first')
    act(() => useApp.getState().select('m3'))
    expect(chip().disabled).toBe(false)
    expect(chip()).toHaveAttribute('title', 'Rotate what is picked: the pivot, the start of the turn, then its end; Ortho turns by 15° (R)')
    act(() => take('place'))
    fireEvent.click(chip())
    expect(useSiteTool.getState().tool).toBeNull()
    expect(useTool.getState().tool).toBe('rotate')
  })

  it('a picked road that is not a street does not move, so it still attracts the target', () => {
    render(<App />)
    // an existing road above the office, along y = 260
    act(() => useApp.getState().apply((p) => actions.addExistingRoad(p, [{ x: 60, y: 260 }, { x: 180, y: 260 }], 10)!.project))
    const road = useApp.getState().derived.circulation.roads.find((r) => r.kind === 'existing')!
    act(() => setPicked([road.id], { ...NOTHING_PICKED, masses: ['m3'] }))
    key('m')
    click({ x: 100, y: 190 })
    click({ x: 130.3, y: 260.4 }) // on the road's centreline
    expect(office().y).toBeCloseTo(270, 6)
  })
})
