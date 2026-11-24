// The padlock of a street, a lot and a gate on the plan (Phase AS.4 task 4, Decision "Padlocks by kind"; the user: "the padlock is CAD's"), as a locked mass's: seen
// (with the lock's glyph), a click and a right-click say "Locked: unlock it in Layers" and pick nothing and open no menu, no drag of its handle, node or segment
// starts, the window and Shift+click skip it, it is let go if it becomes locked while picked, Delete is greyed with the lock's reason and `edit.delete` refuses
// with the notice, its Properties' fields are read-only and say so. A street with only some segments locked is *mixed*: it is picked, the locked segments and their
// nodes hold, the free ones move. Unlocking is Layers' (task 5): these tests lock through the verbs and the menu and unlock through the action.
// Street: the L-bend run n1 → n2 → n3 → n4 (s1, s2, s3 = `street:s1`) and n5 → n6 (s4). See kindsFixture.ts.
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../../App.tsx'
import { LOCKED } from '../../../model/picked.ts'
import { actions } from '../../../state/actions/index.ts'
import { commandOf, runCommand } from '../../commands/index.ts'
import { useAccess } from '../../plan/access/accessState.ts'
import { pickedNow, pickedRefs, pickRefs, selectBox, withoutHeld } from '../../plan/mix.ts'
import { copySelection, useClipboard } from '../../plan/clipboard.ts'
import { settle } from '../../../state/settle.ts'
import { thingsAt } from '../../plan/lockedAt.ts'
import { menuFor } from '../menu/build.ts'
import { leaf } from '../menu/__tests__/helpers.ts'
import { useToast } from '../../layout/toast.ts'
import { useUi } from '../../layout/ui.ts'
import { type Fixture, at, fixture, lockGates, lockLots, lockStreets, plan, press, roadOf, s, start, toast, WHOLE } from './kindsFixture.ts'

vi.mock('../../scene/Scene.tsx', () => ({ Scene: () => <div data-testid="scene" /> }))

let f: Fixture
const segs = () => s().project.options[0].streets!.segments
const node = (id: string) => {
  const n = s().project.options[0].streets!.nodes.find((x) => x.id === id)!
  return { x: Math.round(n.x * 100) / 100, y: Math.round(n.y * 100) / 100 }
}
const lotEl = (id: string) => document.querySelector<SVGElement>(`[data-lot="${id}"]`)!
const gateHandle = (id: string) => document.querySelector<SVGElement>(`[data-gate="${id}"] [data-handle]`)!
const gateEl = (id: string) => document.querySelector<SVGElement>(`[data-gate="${id}"]`)!
const roadEl = (id: string) => document.querySelector<SVGElement>(`[data-road="${id}"]`)!
const centre = (id: string) => {
  const l = s().derived.circulation.lots.find((x) => x.id === id)!
  const xs = l.polygon.map((q) => q.x)
  const ys = l.polygon.map((q) => q.y)
  return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 }
}
const gateAt = (id: string) => s().derived.circulation.gates.find((g) => g.id === id)!.at
const props = () => screen.getByRole('region', { name: 'Properties' })

beforeEach(() => {
  f = fixture()
  start(f.project)
})

describe('a locked street: seen, not picked', () => {
  beforeEach(() => act(() => lockStreets(['s1', 's2', 's3'])))

  it('is still drawn, with the lock’s glyph; a free street beside it has none', () => {
    render(<App />)
    expect(roadEl('street:s1')).not.toBeNull()
    expect(document.querySelector('[data-lock="street:s1"]')).not.toBeNull()
    expect(document.querySelector('[data-lock="street:s4"]')).toBeNull()
  })

  it('a click picks nothing and shows the notice; a free street is picked as ever', () => {
    render(<App />)
    press(roadEl('street:s1'), { x: 60, y: 235 })
    expect(pickedRefs()).toEqual([])
    expect(toast()).toBe(LOCKED)
    act(() => void 0)
    press(roadEl('street:s4'), { x: 200, y: 240 })
    expect(pickedRefs()).toEqual([{ kind: 'street', id: 'street:s4' }])
  })

  it('a click on it keeps what was picked; Shift+click does not add it', () => {
    render(<App />)
    act(() => pickRefs([{ kind: 'street', id: 'street:s4' }]))
    press(roadEl('street:s1'), { x: 60, y: 235 })
    expect(pickedRefs()).toEqual([{ kind: 'street', id: 'street:s4' }])
    press(roadEl('street:s1'), { x: 60, y: 235 }, { shiftKey: true })
    expect(pickedRefs()).toEqual([{ kind: 'street', id: 'street:s4' }])
    expect(toast()).toBe(LOCKED)
  })

  it('a right-click on it shows the notice, picks nothing and opens no menu', () => {
    render(<App />)
    act(() => pickRefs([{ kind: 'street', id: 'street:s4' }]))
    fireEvent.contextMenu(roadEl('street:s1'), at({ x: 60, y: 235 }, { button: 2 }))
    expect(pickedRefs()).toEqual([{ kind: 'street', id: 'street:s4' }])
    expect(toast()).toBe(LOCKED)
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('a drag from its body moves nothing: it is a window, not a drag of the street', () => {
    render(<App />)
    const before = s().project
    fireEvent.pointerDown(roadEl('street:s1'), at({ x: 60, y: 235 }))
    fireEvent.pointerMove(plan(), at({ x: 70, y: 245 }))
    fireEvent.pointerUp(plan(), at({ x: 70, y: 245 }))
    expect(s().project).toBe(before)
  })

  it('the window pick and Select all skip it', () => {
    selectBox(WHOLE, false)
    expect(pickedNow().nodes.filter((n) => ['n1', 'n2', 'n3', 'n4'].includes(n))).toEqual([])
    expect(pickedNow().nodes).toEqual(['n5', 'n6'])
  })

  it('it is let go when it becomes locked while picked (and not before: a street picked after it is locked is not touched)', () => {
    act(() => lockStreets(['s1', 's2', 's3'], false))
    act(() => pickRefs([{ kind: 'street', id: 'street:s1' }, { kind: 'street', id: 'street:s4' }]))
    act(() => lockStreets(['s1', 's2', 's3']))
    expect(pickedRefs()).toEqual([{ kind: 'street', id: 'street:s4' }])
  })

  it('Delete is greyed with the lock’s reason when it is picked from its row, and the command refuses with it', () => {
    act(() => pickRefs([{ kind: 'street', id: 'street:s1' }]))
    expect(leaf(menuFor(pickedRefs(), 'layers', null), 'delete')).toMatchObject({ disabled: true, title: 'A locked street: unlock first' })
    const c = commandOf('edit.delete')!
    expect(c.enabled!()).toBe('A locked street: unlock first')
    act(() => void runCommand('edit.delete'))
    expect(segs()).toHaveLength(4)
  })

  it('its Properties’ fields are read-only and say so', () => {
    render(<App />)
    act(() => useUi.setState({ rail: 'properties' }))
    act(() => pickRefs([{ kind: 'street', id: 'street:s1' }]))
    const type = within(props()).getByRole('combobox', { name: /^Type/ })
    expect(type).toBeDisabled()
    expect(within(props()).getByText(LOCKED, { exact: false })).toBeTruthy()
    // its Delete button is greyed and says why, in the words of the menu’s greyed Delete
    const del = within(props()).getByRole('button', { name: 'Delete' })
    expect(del).toBeDisabled()
    expect(del.title).toBe('A locked street: unlock first')
  })

  it('Undo of the lock and Redo keep the flag', () => {
    expect(segs().every((g) => g.id === 's4' || g.locked === true)).toBe(true)
    act(() => s().undo())
    expect(segs().some((g) => g.locked)).toBe(false)
    act(() => s().redo())
    expect(segs().filter((g) => g.locked).map((g) => g.id)).toEqual(['s1', 's2', 's3'])
  })
})

describe('a street with some segments locked is mixed', () => {
  beforeEach(() => act(() => lockStreets(['s2'])))

  it('a click picks it (it is not refused), and a locked segment shows its glyph', () => {
    render(<App />)
    press(roadEl('street:s1'), { x: 60, y: 235 })
    expect(pickedRefs()).toEqual([{ kind: 'street', id: 'street:s1' }])
    expect(document.querySelector('[data-lock="s2"]')).not.toBeNull()
    expect(document.querySelector('[data-lock="s1"]')).toBeNull()
  })

  it('dragged by its body, the locked segment and its two nodes stay and the free ends move', () => {
    render(<App />)
    const steps = s().history.past.length
    const was = { n2: node('n2'), n3: node('n3') }
    fireEvent.pointerDown(roadEl('street:s1'), at({ x: 60, y: 235 }, { shiftKey: false }))
    fireEvent.pointerMove(plan(), at({ x: 66, y: 241 }))
    fireEvent.pointerMove(plan(), at({ x: 70, y: 245 }))
    fireEvent.pointerUp(plan(), at({ x: 70, y: 245 }))
    expect(node('n2')).toEqual(was.n2)
    expect(node('n3')).toEqual(was.n3)
    expect(node('n1')).not.toEqual({ x: 40, y: 235 })
    expect(node('n4')).not.toEqual({ x: 120, y: 260 })
    expect(s().history.past).toHaveLength(steps + 1)
  })

  it('the handle of the locked segment and its nodes start no drag, with the notice; the free segment’s handle drags', () => {
    render(<App />)
    press(roadEl('street:s1'), { x: 60, y: 235 })
    const before = s().project
    const seg = document.querySelector('[data-path-stretch="1"]')!
    fireEvent.pointerDown(seg, at({ x: 100, y: 235 }, { shiftKey: true }))
    fireEvent.pointerMove(seg, at({ x: 105, y: 238 }, { shiftKey: true }))
    fireEvent.pointerUp(seg, at({ x: 105, y: 238 }, { shiftKey: true }))
    expect(s().project).toBe(before)
    expect(toast()).toBe(LOCKED)
    const nodeHandle = document.querySelector('[data-path-node="n2"]')!
    fireEvent.pointerDown(nodeHandle, at({ x: 80, y: 235 }))
    fireEvent.pointerMove(nodeHandle, at({ x: 90, y: 245 }))
    fireEvent.pointerUp(nodeHandle, at({ x: 90, y: 245 }))
    expect(s().project).toBe(before)
    const free = document.querySelector('[data-path-stretch="2"]')!
    fireEvent.pointerDown(free, at({ x: 120, y: 247.5 }, { shiftKey: true }))
    fireEvent.pointerMove(free, at({ x: 125, y: 250 }, { shiftKey: true }))
    fireEvent.pointerUp(free, at({ x: 125, y: 250 }, { shiftKey: true }))
    expect(s().project).not.toBe(before)
  })

  it('its side pills on the locked segment start nothing either', () => {
    render(<App />)
    press(roadEl('street:s1'), { x: 60, y: 235 })
    const before = s().project
    const h = document.querySelector('[data-path-side="1"][data-side="left"]')!
    fireEvent.pointerDown(h, at({ x: Number(h.getAttribute('data-x')), y: Number(h.getAttribute('data-y')) }))
    fireEvent.pointerMove(h, at({ x: 100, y: 245 }))
    fireEvent.pointerUp(h, at({ x: 100, y: 245 }))
    expect(s().project).toBe(before)
  })

  it('a double click on its locked segment adds no node', () => {
    render(<App />)
    const before = s().project
    fireEvent.doubleClick(roadEl('street:s1'), at({ x: 100, y: 235 }))
    expect(s().project).toBe(before)
  })

  it('a copy of it is whole: the locked segment and the nodes it holds are copied, nothing locked changes', () => {
    act(() => pickRefs([{ kind: 'street', id: 'street:s1' }]))
    expect(pickedNow().nodes).toEqual(['n1', 'n2', 'n3', 'n4'])
    const r = actions.copyPicked(s().project, s().option, pickedNow(), { x: 0, y: 60 })
    expect(r.skipped).toEqual([])
    expect(r.project.options[0].streets!.segments).toHaveLength(segs().length + 3)
    act(() => s().apply((p) => actions.copyPicked(p, s().option, pickedNow(), { x: 0, y: 60 }).project))
    expect(segs()).toHaveLength(7)
    expect(segs().filter((g) => g.locked)).toHaveLength(1)
  })

  it('Copy (Ctrl+C) keeps the whole street, with the locked segment’s corners', () => {
    act(() => pickRefs([{ kind: 'street', id: 'street:s1' }]))
    expect(copySelection()).toBe(true)
    expect(useClipboard.getState().roads[0]?.points).toHaveLength(4)
  })

  it('moved and turned, the nodes the locked segment holds stay out of it', () => {
    act(() => pickRefs([{ kind: 'street', id: 'street:s1' }]))
    const moving = withoutHeld(pickedNow())
    expect(moving.nodes).toEqual(['n1', 'n4'])
    const moved = actions.movePicked(s().project, s().option, moving, { x: 5, y: 5 })
    expect(settle(s().project, moved.project)).not.toHaveProperty('refused')
  })

  it('a P pill of the street sets the free segments only: the edit is kept and the locked segment keeps its sides', () => {
    // a street cars use (the fixture's are trucks')
    act(() => lockStreets(['s2'], false))
    act(() => s().apply((p) => actions.setStreetSegmentType(p, 'o1', ['s1', 's2', 's3'], 'cars')))
    act(() => lockStreets(['s2']))
    act(() => pickRefs([{ kind: 'street', id: 'street:s1' }]))
    render(<App />)
    const pill = document.querySelector<SVGElement>('[data-parking-pill="street:s1:left"]')!
    const steps = s().history.past.length
    fireEvent.click(pill)
    expect(s().history.past).toHaveLength(steps + 1)
    expect(s().refusal ?? null).toBeNull()
    const parking = (id: string) => segs().find((g) => g.id === id)!.parking
    expect(parking('s2')).toBeUndefined()
    expect(parking('s1')).toBeDefined()
    expect(parking('s3')).toBeDefined()
  })

  it('Delete of the whole street is greyed (it would take the locked segment)', () => {
    act(() => pickRefs([{ kind: 'street', id: 'street:s1' }]))
    expect(leaf(menuFor(pickedRefs(), 'plan', null), 'delete')).toMatchObject({ disabled: true })
    expect(String(commandOf('edit.delete')!.enabled!())).toMatch(/locked/i)
  })

  it('the street is *mixed*: its row says Lock, and its roadSegments are all three', () => {
    act(() => pickRefs([{ kind: 'street', id: 'street:s1' }]))
    expect(leaf(menuFor(pickedRefs(), 'plan', null), 'lock')).toMatchObject({ label: 'Lock' })
    expect(roadOf('s1').segments).toEqual(['s1', 's2', 's3'])
  })
})

describe('a locked lot: seen, not picked', () => {
  beforeEach(() => act(() => lockLots([f.lots[0]])))

  it('is drawn, with the glyph; a click picks nothing and says why; the other lot is picked', () => {
    render(<App />)
    expect(lotEl(f.lots[0])).not.toBeNull()
    expect(document.querySelector(`[data-lock="${f.lots[0]}"]`)).not.toBeNull()
    press(lotEl(f.lots[0]), centre(f.lots[0]))
    expect(pickedRefs()).toEqual([])
    expect(toast()).toBe(LOCKED)
    press(lotEl(f.lots[1]), centre(f.lots[1]))
    expect(pickedRefs()).toEqual([{ kind: 'lot', id: f.lots[1] }])
  })

  it('Shift+click, the window and a right-click skip it', () => {
    render(<App />)
    act(() => pickRefs([{ kind: 'lot', id: f.lots[1] }]))
    press(lotEl(f.lots[0]), centre(f.lots[0]), { shiftKey: true })
    expect(pickedRefs()).toEqual([{ kind: 'lot', id: f.lots[1] }])
    fireEvent.contextMenu(lotEl(f.lots[0]), at(centre(f.lots[0]), { button: 2 }))
    expect(pickedRefs()).toEqual([{ kind: 'lot', id: f.lots[1] }])
    expect(screen.queryByRole('menu')).toBeNull()
    act(() => selectBox(WHOLE, false))
    expect(pickedNow().lots).toEqual([f.lots[1]])
  })

  it('a drag of it moves nothing', () => {
    render(<App />)
    const before = s().project
    fireEvent.pointerDown(lotEl(f.lots[0]), at(centre(f.lots[0])))
    fireEvent.pointerMove(plan(), at({ x: centre(f.lots[0]).x + 8, y: centre(f.lots[0]).y }))
    fireEvent.pointerUp(plan(), at({ x: centre(f.lots[0]).x + 8, y: centre(f.lots[0]).y }))
    expect(s().project).toBe(before)
  })

  it('is let go when it becomes locked while picked', () => {
    act(() => lockLots([f.lots[0]], false))
    act(() => pickRefs([{ kind: 'lot', id: f.lots[0] }, { kind: 'lot', id: f.lots[1] }]))
    act(() => lockLots([f.lots[0]]))
    expect(pickedRefs()).toEqual([{ kind: 'lot', id: f.lots[1] }])
  })

  it('Delete is greyed with the lock’s reason, and its Properties’ fields are read-only', () => {
    render(<App />)
    act(() => useUi.setState({ rail: 'properties' }))
    act(() => pickRefs([{ kind: 'lot', id: f.lots[0] }]))
    expect(leaf(menuFor(pickedRefs(), 'layers', null), 'delete')).toMatchObject({ disabled: true, title: 'A locked lot: unlock first' })
    expect(leaf(menuFor(pickedRefs(), 'layers', null), 'rename')).toMatchObject({ disabled: true, title: 'Locked: unlock it to change it' })
    expect(within(props()).getByRole('textbox', { name: 'Name' })).toBeDisabled()
    expect(within(props()).getByText(LOCKED, { exact: false })).toBeTruthy()
    const del = within(props()).getByRole('button', { name: /^Delete/ })
    expect(del).toBeDisabled()
    expect(del.title).toBe('A locked lot: unlock first')
  })
})

describe('a locked gate: seen, not picked', () => {
  beforeEach(() => act(() => lockGates([f.gates[0]])))

  it('is drawn with the glyph and without a handle that slides; a click on it picks nothing and says why', () => {
    render(<App />)
    expect(document.querySelector(`[data-gate="${f.gates[0]}"]`)).not.toBeNull()
    expect(document.querySelector(`[data-lock="${f.gates[0]}"]`)).not.toBeNull()
    expect(document.querySelector(`[data-gate="${f.gates[0]}"] [data-handle]`)).toBeNull()
    expect(gateHandle(f.gates[1])).not.toBeNull()
    press(gateEl(f.gates[0]), gateAt(f.gates[0]))
    expect(pickedRefs()).toEqual([])
    expect(toast()).toBe(LOCKED)
    press(gateHandle(f.gates[1]), gateAt(f.gates[1]))
    expect(pickedRefs()).toEqual([{ kind: 'gate', id: f.gates[1] }])
  })

  // the gate's hit area on the plan is a transparent circle round its handle (GATE_HIT_PX): a press anywhere in it would have picked a free gate, so for a locked one it says so
  it('a click inside its hit circle, off the handle, picks nothing and shows the notice; outside the circle, nothing', () => {
    render(<App />)
    const g = gateAt(f.gates[0])
    const pxPerMetre = at({ x: 1, y: 0 }).clientX - at({ x: 0, y: 0 }).clientX
    const off = (px: number) => ({ x: g.x + px / pxPerMetre, y: g.y })
    press(plan(), off(15))
    expect(pickedRefs()).toEqual([])
    expect(toast()).toBe(LOCKED)
    act(() => useToast.setState({ toast: null }))
    press(plan(), off(21))
    expect(toast()).toBe(LOCKED)
    act(() => useToast.setState({ toast: null }))
    press(plan(), off(30))
    expect(toast()).toBeUndefined()
  })

  it('a drag of it slides nothing; Shift+click, the window and a right-click skip it', () => {
    render(<App />)
    const before = s().project
    const el = gateEl(f.gates[0])
    fireEvent.pointerDown(el, at(gateAt(f.gates[0])))
    fireEvent.pointerMove(plan(), at({ x: gateAt(f.gates[0]).x + 20, y: gateAt(f.gates[0]).y }))
    fireEvent.pointerUp(plan(), at({ x: gateAt(f.gates[0]).x + 20, y: gateAt(f.gates[0]).y }))
    expect(s().project).toBe(before)
    act(() => pickRefs([{ kind: 'gate', id: f.gates[1] }]))
    press(el, gateAt(f.gates[0]), { shiftKey: true })
    fireEvent.contextMenu(el, at(gateAt(f.gates[0]), { button: 2 }))
    expect(pickedRefs()).toEqual([{ kind: 'gate', id: f.gates[1] }])
    expect(screen.queryByRole('menu')).toBeNull()
    act(() => selectBox(WHOLE, false))
    expect(pickedNow().gates).toEqual([f.gates[1]])
  })

  it('is let go when it becomes locked while picked', () => {
    act(() => lockGates([f.gates[0]], false))
    act(() => pickRefs([{ kind: 'gate', id: f.gates[0] }]))
    expect(useAccess.getState().picked).toEqual({ kind: 'gate', id: f.gates[0] })
    act(() => lockGates([f.gates[0]]))
    expect(pickedRefs()).toEqual([])
  })

  it('Delete is greyed with the lock’s reason; its Properties’ fields are read-only', () => {
    render(<App />)
    act(() => useUi.setState({ rail: 'properties' }))
    act(() => pickRefs([{ kind: 'gate', id: f.gates[0] }]))
    expect(leaf(menuFor(pickedRefs(), 'layers', null), 'delete')).toMatchObject({ disabled: true, title: 'A locked gate: unlock first' })
    expect(within(props()).getByText(LOCKED, { exact: false })).toBeTruthy()
    for (const c of within(props()).getAllByRole('combobox')) expect(c).toBeDisabled()
    const del = within(props()).getByRole('button', { name: 'Delete' })
    expect(del).toBeDisabled()
    expect(del.title).toBe('A locked gate: unlock first')
  })
})

describe('Lock from the menu and from edit.lock', () => {
  it('a lot: Lock locks it and lets it go; Edit › Lock acts the same', () => {
    act(() => pickRefs([{ kind: 'lot', id: f.lots[1] }]))
    act(() => leaf(menuFor(pickedRefs(), 'plan', null), 'lock').onSelect())
    expect(s().project.options[0].lots!.find((l) => l.id === f.lots[1])!.locked).toBe(true)
    expect(pickedRefs()).toEqual([])
    act(() => pickRefs([{ kind: 'lot', id: f.lots[0] }]))
    act(() => void runCommand('edit.lock'))
    expect(s().project.options[0].lots!.find((l) => l.id === f.lots[0])!.locked).toBe(true)
  })

  it('a gate (the site’s, as the option has none of its own) and a street; one undo step each', () => {
    const steps = s().history.past.length
    act(() => pickRefs([{ kind: 'gate', id: f.gates[0] }]))
    act(() => void runCommand('edit.lock'))
    expect(s().project.site.gates!.find((g) => g.id === f.gates[0])!.locked).toBe(true)
    act(() => pickRefs([{ kind: 'street', id: 'street:s4' }]))
    act(() => void runCommand('edit.lock'))
    expect(segs().find((g) => g.id === 's4')!.locked).toBe(true)
    expect(s().history.past).toHaveLength(steps + 2)
  })

  it('a gate in an option with its own gates is locked in that copy', () => {
    act(() => s().apply((p) => actions.ownGates(p, 'o1')))
    act(() => pickRefs([{ kind: 'gate', id: f.gates[0] }]))
    act(() => void runCommand('edit.lock'))
    expect(s().project.options[0].gates!.find((g) => g.id === f.gates[0])!.locked).toBe(true)
    expect(s().project.site.gates!.find((g) => g.id === f.gates[0])!.locked).toBeUndefined()
  })

  it('several kinds picked: Lock locks every one that has a padlock', () => {
    act(() => pickRefs([{ kind: 'lot', id: f.lots[0] }, { kind: 'gate', id: f.gates[0] }, { kind: 'street', id: 'street:s4' }]))
    act(() => leaf(menuFor(pickedRefs(), 'plan', null), 'lock').onSelect())
    expect(s().project.options[0].lots!.find((l) => l.id === f.lots[0])!.locked).toBe(true)
    expect(segs().find((g) => g.id === 's4')!.locked).toBe(true)
    expect((s().project.site.gates ?? []).concat(s().project.options[0].gates ?? []).find((g) => g.id === f.gates[0])!.locked).toBe(true)
  })

  it('a locked thing, picked, unlocks through the same row: Unlock', () => {
    act(() => lockLots([f.lots[0]]))
    act(() => pickRefs([{ kind: 'lot', id: f.lots[0] }]))
    const row = leaf(menuFor(pickedRefs(), 'layers', null), 'lock')
    expect(row.label).toBe('Unlock')
    act(() => row.onSelect())
    expect(s().project.options[0].lots!.find((l) => l.id === f.lots[0])!.locked).toBeUndefined()
  })
})

// What a press of the background finds under it is what the plan's own element would have taken (`plan/lockedAt.ts`): the street by its paving's width, the lot inside its
// outline, the gate in its hit circle (the three that can be locked: a press there is a free one's pick, and a locked one's notice).
describe('the reach of a locked thing is its drawn hit area', () => {
  it('a street: its paving’s width, not a wider reach of the pointer', () => {
    const road = roadOf('s1')
    const half = road.width / 2
    const mid = { x: (road.points[0].x + road.points[1].x) / 2, y: road.points[0].y }
    // px = 5 m per pixel: a reach of 4 px would be 20 m, far beyond the paving
    expect(thingsAt({ x: mid.x, y: mid.y + half - 0.2 }, 5)).toContainEqual({ kind: 'street', id: road.id })
    expect(thingsAt({ x: mid.x, y: mid.y + half + 0.5 }, 5).some((r) => r.kind === 'street' && r.id === road.id)).toBe(false)
  })

  it('a lot: inside its outline', () => {
    const c = centre(f.lots[0])
    expect(thingsAt(c, 1)).toContainEqual({ kind: 'lot', id: f.lots[0] })
    expect(thingsAt({ x: c.x, y: c.y + 30 }, 1).some((r) => r.kind === 'lot' && r.id === f.lots[0])).toBe(false)
  })
})
