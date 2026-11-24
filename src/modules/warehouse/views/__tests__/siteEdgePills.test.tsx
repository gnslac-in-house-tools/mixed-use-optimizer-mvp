// Count and width by pills on the site (Phase D.3 task 11, the user's Q3), and what they stand on: the docks, doors and patterns of a placed block picked with Select (a click on one,
// Shift adding), slid along their wall and counted and widened by the pills, all edits that copy's own (a variant). The block editor's side: views/editing/edge/__tests__/edgePills.test.tsx.
import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Id, Point } from '../../../../model/schema.ts'
import { derive } from '../../../../engine/derive.ts'
import { actions } from '../../../../state/actions/index.ts'
import { emptyHistory } from '../../../../state/history.ts'
import { sampleProject } from '../../../../state/sample.ts'
import { NO_SELECTION, useApp } from '../../../../state/store.ts'
import { resetTyped, useTyped } from '../../../../views/editing/dimension/typed.ts'
import { useEdgePick } from '../../../../views/editing/edge/edgePick.ts'
import { useCourtPick, useStretch } from '../../../../views/editing/shape/shapeState.ts'
import { useToast } from '../../../../views/layout/toast.ts'
import { useUi } from '../../../../views/layout/ui.ts'
import { CommandLine } from '../../../../views/plan/command/CommandLine.tsx'
import { fit, UNMEASURED_SIZE } from '../../../../views/plan/camera.ts'
import { contentBounds, PlanSvg } from '../../../../views/plan/PlanSvg.tsx'
import { letGo } from '../../../../views/tools/hand.ts'
import { useCommand } from '../../../../views/plan/command/commandState.ts'
import { take } from '../../../../views/tools/hand.ts'
import { handleKey } from '../../../../views/useShortcuts.ts'

vi.mock('../../../../views/scene/Scene.tsx', () => ({ Scene: () => <div data-testid="scene" /> }))

function sample() {
  const { project: p, option } = useApp.getState()
  const ids = p.options.find((o) => o.id === option)!.buildingIds
  const b = p.buildings.find((x) => x.warehouse && ids.includes(x.id))!
  const levels = new Set(b.levels.map((l) => l.id))
  const hall = p.masses.find((m) => m.part === 'hall' && levels.has(m.levelId))!
  return { b, hall }
}
const ref = () => ({ kind: 'mass' as const, id: sample().hall.id })
const read = () => actions.edgeOf(useApp.getState().project, ref())!
const at = (q: Point) => {
  const v = fit(contentBounds(useApp.getState().derived), UNMEASURED_SIZE)
  return { clientX: (q.x - v.cx) * v.scale + UNMEASURED_SIZE.w / 2, clientY: UNMEASURED_SIZE.h / 2 - (q.y - v.cy) * v.scale, button: 0, pointerId: 1 }
}
const svg = () => document.querySelector('svg')!
const pill = (name: string) => document.querySelector(`[data-edge-pill="${name}"]`)
const steps = () => useApp.getState().history.past.length

/** Four docks of one wall, in a row; the docks of the wall after the rest are taken: the picked, the wall's edge and the metres of a slot's middle. */
function four() {
  const r = read()
  const edge = r.edges.find((e) => r.elements.filter((x) => x.edge === e.id && x.kind === 'dock').length > 12)!
  const keep = [10, 11, 12, 13].map((i) => r.elements.filter((x) => x.edge === edge.id && x.kind === 'dock').sort((a, b) => a.slot - b.slot)[i].slot)
  const p = actions.editEdge(useApp.getState().project, ref(), { op: 'take', edge: edge.id, slots: edge.slots.map((s) => s.k).filter((k) => !keep.includes(k)), kind: 'dock' }).project
  act(() => useApp.setState({ project: p, derived: derive(p, useApp.getState().option), history: emptyHistory() }))
  const now = read()
  const ids = now.elements.filter((x) => x.edge === edge.id && x.kind === 'dock').map((x) => x.id)
  return { edge: now.edges.find((e) => e.id === edge.id)!, ids, keep }
}
const docksOn = (edge: Id) => read().elements.filter((x) => x.edge === edge && x.kind === 'dock')
const midOf = (e: ReturnType<typeof four>['edge'], k: number): Point => {
  const s = e.slots.find((x) => x.k === k)!
  const m = (s.from + s.to) / 2
  return { x: e.origin.x + e.dir.x * m, y: e.origin.y + e.dir.y * m }
}
const drag = (name: string, to: Point) => {
  fireEvent.pointerDown(pill(name)!, { clientX: 10, clientY: 10, pointerId: 1, button: 0 })
  fireEvent.pointerMove(svg(), at(to))
  fireEvent.pointerUp(svg(), at(to))
}

beforeEach(() => {
  localStorage.clear()
  const p = sampleProject()
  const option = p.options.find((o) => p.buildings.some((b) => o.buildingIds.includes(b.id) && b.warehouse))!
  const copy = p.buildings.find((b) => option.buildingIds.includes(b.id) && b.warehouse)!
  useApp.setState({ project: p, derived: derive(p, option.id), history: emptyHistory(), dragStart: null, selection: NO_SELECTION, option: option.id, level: copy.levels[0].id, showAll: false })
  useUi.setState({ dialog: null, view: 'plan', rail: 'blocks', panels: { left: true, right: true }, sheet: null, docks: { drafting: 'bottom' }, show: { kpis: true, drafting: true, tools: true } })
  letGo()
  useToast.setState({ toast: null, confirmation: null })
  useEdgePick.getState().clear()
  resetTyped()
})

describe('Select picks the docks, doors and patterns of a placed block', () => {
  it('a click on one picks it alone; a click on another with Shift adds it; a click on nothing of the block lets go', () => {
    render(<PlanSvg />)
    act(() => useApp.getState().select(sample().hall.id))
    const [a, b] = read().elements.map((x) => x.id)
    const click = (id: Id, shift = false) => {
      const el = document.querySelector(`[data-edge-element="${id}"]`)!
      fireEvent.pointerDown(el, { clientX: 5, clientY: 5, pointerId: 1, button: 0, shiftKey: shift })
      fireEvent.pointerUp(el, { clientX: 5, clientY: 5, pointerId: 1, button: 0, shiftKey: shift })
    }
    click(a)
    expect(useEdgePick.getState().ids).toEqual([a])
    click(b, true)
    expect(useEdgePick.getState().ids).toEqual([a, b])
    click(b, true)
    expect(useEdgePick.getState().ids).toEqual([a])
  })

  it('picking another thing on the plan lets the elements go', () => {
    render(<PlanSvg />)
    act(() => useApp.getState().select(sample().hall.id))
    act(() => useEdgePick.getState().set(sample().hall.id, [read().elements[0].id]))
    act(() => useApp.getState().select(null))
    expect(useEdgePick.getState().ids).toEqual([])
  })
})

describe('the pills on the site', () => {
  it('four docks picked: the end pills drag 3 modules on (3 docks more, that copy’s own, one undo step), and 8 typed makes 8', () => {
    render(<PlanSvg />)
    act(() => useApp.getState().select(sample().hall.id))
    const { edge, ids, keep } = four()
    act(() => useEdgePick.getState().set(sample().hall.id, ids))
    expect(pill('count-start')).not.toBeNull()
    const types = JSON.stringify(useApp.getState().project.warehouseTypes)
    const before = steps()
    drag('count-end', midOf(edge, keep[3] + 3))
    expect(docksOn(edge.id).length).toBe(7)
    expect(steps()).toBe(before + 1)
    expect(JSON.stringify(useApp.getState().project.warehouseTypes)).toBe(types)
    act(() => {
      fireEvent.keyDown(window, { key: '8' })
      fireEvent.keyDown(window, { key: 'Enter' })
    })
    expect(docksOn(edge.id).length).toBe(8)
    expect(steps()).toBe(before + 1)
  })

  it('the end pill dragged back takes the docks away', () => {
    render(<PlanSvg />)
    act(() => useApp.getState().select(sample().hall.id))
    const { edge, ids, keep } = four()
    act(() => useEdgePick.getState().set(sample().hall.id, ids))
    drag('count-end', midOf(edge, keep[1]))
    expect(docksOn(edge.id).length).toBe(2)
  })

  it('the width pill dragged to 4.2 m makes every dock picked 4.2 m; 3.5 typed makes it 3.5 m', () => {
    render(<PlanSvg />)
    act(() => useApp.getState().select(sample().hall.id))
    const { edge, ids, keep } = four()
    act(() => useEdgePick.getState().set(sample().hall.id, ids))
    const c = (edge.slots.find((s) => s.k === keep[0])!.from + edge.slots.find((s) => s.k === keep[0])!.to) / 2
    const to = { x: edge.origin.x + edge.dir.x * (c + 2.1), y: edge.origin.y + edge.dir.y * (c + 2.1) }
    const before = steps()
    drag('width', to)
    expect(docksOn(edge.id).filter((d) => ids.includes(d.id)).map((d) => d.width)).toEqual([4.2, 4.2, 4.2, 4.2])
    act(() => {
      for (const ch of '3.5') fireEvent.keyDown(window, { key: ch })
      fireEvent.keyDown(window, { key: 'Enter' })
    })
    expect(docksOn(edge.id).filter((d) => ids.includes(d.id)).map((d) => d.width)).toEqual([3.5, 3.5, 3.5, 3.5])
    expect(steps()).toBe(before + 1)
  })

  it('the docks picked slide along their wall by a drag on one of them', () => {
    render(<PlanSvg />)
    act(() => useApp.getState().select(sample().hall.id))
    const { edge, ids, keep } = four()
    act(() => useEdgePick.getState().set(sample().hall.id, ids))
    const el = document.querySelector(`[data-edge-element="${ids[0]}"]`)!
    const before = steps()
    fireEvent.pointerDown(el, { ...at(midOf(edge, keep[0])), button: 0 })
    fireEvent.pointerMove(svg(), at(midOf(edge, keep[0] + 2)))
    fireEvent.pointerUp(svg(), at(midOf(edge, keep[0] + 2)))
    expect(docksOn(edge.id).map((d) => d.slot).sort((a, b) => a - b)).toEqual(keep.map((k) => k + 2))
    expect(steps()).toBe(before + 1)
  })
})

describe('Delete with docks of the picked block picked (review B1)', () => {
  it('takes the docks picked, that copy’s own, and never the block; one undo step', () => {
    render(<PlanSvg />)
    act(() => useApp.getState().select(sample().hall.id))
    const { edge, ids } = four()
    act(() => useEdgePick.getState().set(sample().hall.id, ids))
    const before = steps()
    act(() => void handleKey(new KeyboardEvent('keydown', { key: 'Delete', cancelable: true })))
    expect(useApp.getState().project.masses.some((m) => m.id === sample().hall.id)).toBe(true)
    expect(docksOn(edge.id)).toHaveLength(0)
    expect(steps()).toBe(before + 1)
    expect(useEdgePick.getState().ids).toEqual([])
  })
})

describe('Escape during a pill drag or a slide (review B2)', () => {
  const esc = () => act(() => void handleKey(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true })))
  const typeIt = (t: string) =>
    act(() => {
      for (const ch of t) fireEvent.keyDown(window, { key: ch })
      fireEvent.keyDown(window, { key: 'Enter' })
    })

  it('a width pill dragged, then Escape: nothing typed is left, and a later number and Enter edit nothing', () => {
    render(<PlanSvg />)
    act(() => useApp.getState().select(sample().hall.id))
    const { ids } = four()
    act(() => useEdgePick.getState().set(sample().hall.id, ids))
    fireEvent.pointerDown(pill('width')!, { clientX: 10, clientY: 10, pointerId: 1, button: 0 })
    expect(useTyped.getState().cur).not.toBeNull()
    esc()
    expect(useTyped.getState().cur).toBeNull()
    const now = useApp.getState().project
    typeIt('3')
    expect(useApp.getState().project).toBe(now)
  })

  it('a slide of the docks picked, then Escape: the same', () => {
    render(<PlanSvg />)
    act(() => useApp.getState().select(sample().hall.id))
    const { edge, ids, keep } = four()
    act(() => useEdgePick.getState().set(sample().hall.id, ids))
    fireEvent.pointerDown(document.querySelector(`[data-edge-element="${ids[0]}"]`)!, { ...at(midOf(edge, keep[0])), button: 0 })
    expect(useTyped.getState().cur).not.toBeNull()
    esc()
    expect(useTyped.getState().cur).toBeNull()
    const now = useApp.getState().project
    typeIt('3')
    expect(useApp.getState().project).toBe(now)
  })
})

describe('the block’s own handles stay over the dock bands (review B3)', () => {
  it('a dock’s hit band is drawn under the block’s shape handles', () => {
    render(<PlanSvg />)
    act(() => useApp.getState().select(sample().hall.id))
    const band = document.querySelector('[data-edge-element]')!
    const block = document.querySelector(`[data-layer="shape-handles"][data-mass="${sample().hall.id}"]`)!
    expect(block).not.toBeNull()
    expect(band.compareDocumentPosition(block) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})

describe('the dock hit bands have a size of their own on screen', () => {
  it('each band takes the press over a stroke of at least 10 screen px (it does not scale with the zoom), and the picked mark stays 2 px and takes no press', () => {
    render(<PlanSvg />)
    act(() => useApp.getState().select(sample().hall.id))
    const bands = [...document.querySelectorAll<SVGElement>('[data-edge-element]')]
    expect(bands.length).toBeGreaterThan(0)
    for (const b of bands) {
      expect(Number(b.getAttribute('stroke-width'))).toBeGreaterThanOrEqual(10)
      expect(b.getAttribute('vector-effect')).toBe('non-scaling-stroke')
      expect(b.getAttribute('pointer-events')).toBe('all')
    }
    const id = read().elements[0].id
    act(() => useEdgePick.getState().set(sample().hall.id, [id]))
    const mark = document.querySelector<SVGElement>(`[data-edge-picked="${id}"]`)!
    expect(mark.getAttribute('stroke')).toBe('var(--ink)')
    expect(mark.getAttribute('pointer-events')).toBe('none')
  })
})

describe('a court and docks are not picked together (review N6)', () => {
  it('a dock picked lets the court go, and a court picked lets the docks go', () => {
    render(<PlanSvg />)
    act(() => useApp.getState().select(sample().hall.id))
    const ref = { kind: 'block-court', id: `${sample().hall.id}/e1` }
    act(() => useCourtPick.getState().setPick({ ref, vertex: null }))
    act(() => useEdgePick.getState().set(sample().hall.id, [read().elements[0].id]))
    expect(useCourtPick.getState().pick).toBeNull()
    act(() => useCourtPick.getState().setPick({ ref, vertex: null }))
    expect(useEdgePick.getState().ids).toEqual([])
  })
})

describe('a dock under the block\'s own bay line (the bay line is drawn over the hit band)', () => {
  const bayLine = () => document.querySelector('path[data-bay-line]')!
  const dockPoint = () => {
    const r = read()
    const el = r.elements[0]
    const e = r.edges.find((x) => x.id === el.edge)!
    return { el, q: midOf(e as never, el.slot) }
  }
  it('a press on the bay line over a dock picks it; Shift adds another and takes one off', () => {
    render(<PlanSvg />)
    act(() => useApp.getState().select(sample().hall.id))
    const r = read()
    const a = r.elements[0]
    const b = r.elements.find((x) => x.edge === a.edge && x.slot === a.slot + 8) ?? r.elements.find((x) => x.edge !== a.edge)!
    const press = (el: typeof a, shift = false) => {
      const e = r.edges.find((x) => x.id === el.edge)!
      fireEvent.pointerDown(bayLine(), { ...at(midOf(e as never, el.slot)), shiftKey: shift })
    }
    press(a)
    expect(useEdgePick.getState().ids).toEqual([a.id])
    press(b, true)
    expect(useEdgePick.getState().ids).toEqual([a.id, b.id])
    press(b, true)
    expect(useEdgePick.getState().ids).toEqual([a.id])
  })
  it('a press on the bay line away from any dock picks nothing, and a double click still picks the bay', () => {
    render(<PlanSvg />)
    act(() => useApp.getState().select(sample().hall.id))
    fireEvent.pointerDown(bayLine(), { clientX: 3, clientY: 3, pointerId: 1, button: 0 })
    expect(useEdgePick.getState().ids).toEqual([])
    const { q } = dockPoint()
    fireEvent.doubleClick(bayLine(), at(q))
    expect(useStretch.getState().stretch).not.toBeNull()
  })
  it('a drag from the bay line over a picked dock slides it (one step)', () => {
    render(<PlanSvg />)
    act(() => useApp.getState().select(sample().hall.id))
    const { el, q } = dockPoint()
    act(() => useEdgePick.getState().set(sample().hall.id, [el.id]))
    const e = read().edges.find((x) => x.id === el.edge)!
    const to = { x: q.x + e.dir.x * 5, y: q.y + e.dir.y * 5 }
    const before = steps()
    fireEvent.pointerDown(bayLine(), at(q))
    fireEvent.pointerMove(svg(), at(to))
    fireEvent.pointerUp(svg(), at(to))
    expect(steps()).toBe(before + 1)
  })
})

describe('a number typed with a dock picked on the site', () => {
  const setup = () => {
    render(
      <>
        <PlanSvg />
        <CommandLine />
      </>,
    )
    act(() => useApp.getState().select(sample().hall.id))
    const { edge, ids } = four()
    const click = (id: Id) => {
      const el = document.querySelector(`[data-edge-element="${id}"]`)!
      fireEvent.pointerDown(el, { clientX: 5, clientY: 5, pointerId: 1, button: 0 })
      fireEvent.pointerUp(el, { clientX: 5, clientY: 5, pointerId: 1, button: 0 })
    }
    // the first click picks it, the second presses a picked one and lets go without a drag
    click(ids[0])
    click(ids[0])
    expect(useEdgePick.getState().ids).toEqual([ids[0]])
    return { edge, ids }
  }
  const type = (text: string) => {
    const line = screen.getByRole('textbox', { name: 'Command line' })
    fireEvent.change(line, { target: { value: text } })
    fireEvent.keyDown(line, { key: 'Enter' })
  }
  const slotOf = (id: Id) => read().elements.find((x) => x.id === id)!.slot
  const hallCentre = () => JSON.stringify(useApp.getState().project.masses.find((m) => m.id === sample().hall.id)!.footprint)

  it('slides the dock that many modules along its wall, not the block; one undo restores it', () => {
    const { ids } = setup()
    const slot = slotOf(ids[0])
    const block = hallCentre()
    const before = steps()
    type('-1')
    expect(slotOf(ids[0])).toBe(slot - 1)
    expect(hallCentre()).toBe(block)
    expect(steps()).toBe(before + 1)
    act(() => useApp.getState().undo())
    expect(slotOf(ids[0])).toBe(slot)
  })

  it('a slide the engine refuses says why, and nothing moves, the block either', () => {
    const { ids } = setup()
    const slot = slotOf(ids[0])
    const block = hallCentre()
    const before = steps()
    type('500')
    expect(useToast.getState().toast?.text).toBeTruthy()
    expect(slotOf(ids[0])).toBe(slot)
    expect(hallCentre()).toBe(block)
    expect(steps()).toBe(before)
  })

  it('a decimal is refused with the toast and leaves the field empty, so the next typing does not append to it', () => {
    const { ids } = setup()
    const slot = slotOf(ids[0])
    const before = steps()
    type('1.5')
    expect(useToast.getState().toast?.text).toMatch(/whole modules/i)
    expect((screen.getByRole('textbox', { name: 'Command line' }) as HTMLInputElement).value).toBe('')
    expect(slotOf(ids[0])).toBe(slot)
    expect(steps()).toBe(before)
  })

  it('the Slide is built from the picks that still exist: one taken off the block gives the Move back', () => {
    const { ids } = setup()
    const el = read().elements.find((x) => x.id === ids[0])!
    expect(useCommand.getState().registration?.tool).toBe('Slide')
    act(() => useApp.getState().apply((p) => actions.editEdge(p, ref(), { op: 'take', edge: el.edge, slots: [el.slot], kind: 'dock' }).project))
    expect(useCommand.getState().registration?.tool).toBe('Move')
    const block = hallCentre()
    type('3')
    expect(hallCentre()).not.toBe(block)
  })

  it('the prompt names the live count and the unit', () => {
    setup()
    expect(useCommand.getState().registration?.prompt).toBe('1 dock · modules')
  })

  it('with another tool in hand the picks are not the line’s: a typed number moves the block', () => {
    const { ids } = setup()
    act(() => {
      take('dock')
      useEdgePick.getState().set(sample().hall.id, [ids[0]])
    })
    expect(useCommand.getState().registration?.tool).toBe('Move')
  })

  it('a selected corner of the block does not take the Slide away', () => {
    const { ids } = setup()
    // a block's outline stays on its module lines: its corner refuses a typed move
    const shape = actions.shapeOf(useApp.getState().project, ref())
    vi.spyOn(actions, 'shapeOf').mockReturnValue({ ...shape!, without: ['vertex'] })
    act(() => {
      useApp.setState({ selection: { massId: sample().hall.id, vertex: 0, massIds: [sample().hall.id] } })
      useEdgePick.getState().set(sample().hall.id, [ids[0]])
    })
    expect(useCommand.getState().registration?.tool).toBe('Slide')
    vi.restoreAllMocks()
  })

  it('a second typed number replaces the first: one undo step', () => {
    const { ids } = setup()
    const slot = slotOf(ids[0])
    const before = steps()
    type('-1')
    type('-2')
    expect(slotOf(ids[0])).toBe(slot - 2)
    expect(steps()).toBe(before + 1)
    act(() => useApp.getState().undo())
    expect(slotOf(ids[0])).toBe(slot)
  })

  it.each(['1.5', '2m', '#3', '@3', '3<30', '0', '1,1'])('"%s" is refused: slides go by whole modules, nothing moves', (text) => {
    const { ids } = setup()
    const slot = slotOf(ids[0])
    const before = steps()
    type(text)
    expect(useToast.getState().toast?.text).toMatch(/whole modules/i)
    expect(slotOf(ids[0])).toBe(slot)
    expect(steps()).toBe(before)
  })

  it('the fixed angle of the command line does not bend a slide', () => {
    const { ids } = setup()
    const slot = slotOf(ids[0])
    act(() => useCommand.getState().fixAngle(30))
    type('-1')
    expect(slotOf(ids[0])).toBe(slot - 1)
  })

  it('with the block itself picked, a typed number still moves it', () => {
    render(
      <>
        <PlanSvg />
        <CommandLine />
      </>,
    )
    act(() => useApp.getState().select(sample().hall.id))
    const block = hallCentre()
    type('3')
    expect(hallCentre()).not.toBe(block)
  })
})
