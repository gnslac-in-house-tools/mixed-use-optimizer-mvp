// Groups of any kind on the plan (Phase AS.5 task 6, Decision "Groups of any kind"): a click on a member picks the whole group, whatever its kinds; Shift adds or takes it out whole; the
// window takes whole groups; Alt+click picks one member alone; a locked and a hidden member are left out; a press and drag on any member moves them all (one undo step); the frame reads
// *Group · n* and its dot turns what Rotate turns; Ctrl+G and Ctrl+Shift+G act on everything picked; the menu of several kinds shows Group and Ungroup first. A group of masses is as ever
// (`groups.test.tsx`).
// Demo masses: m1 x 40…200 y 70…150 and m2 x 250…390 y 70…150. jsdom has no layout: the plan uses UNMEASURED_SIZE and `at` turns world metres into screen pixels.
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Point, Project } from '../../../model/schema.ts'
import { App } from '../../../App.tsx'
import { derive } from '../../../engine/derive.ts'
import { gatesOf } from '../../../engine/circulation/gates.ts'
import { addLot } from '../../../modules/parking/actions.ts'
import { useLots } from '../../../modules/parking/views/lotState.ts'
import { actions } from '../../../state/actions/index.ts'
import { demoProject } from '../../../state/demo.ts'
import { emptyHistory } from '../../../state/history.ts'
import { NO_SELECTION, useApp } from '../../../state/store.ts'
import { commandOf } from '../../commands/registry.ts'
import { menuFor } from '../../editing/menu/build.ts'
import { lot as lotKey, NOTES, note as noteKey } from '../../layers/keys.ts'
import { useLayerView } from '../../layers/layerView.ts'
import { useToast } from '../../layout/toast.ts'
import { useUi } from '../../layout/ui.ts'
import { letGo } from '../../tools/hand.ts'
import { handleKey } from '../../useShortcuts.ts'
import { useAccess } from '../access/accessState.ts'
import { useAnnotations } from '../annotations/annotationState.ts'
import { fit, UNMEASURED_SIZE, type View } from '../camera.ts'
import { useRoads } from '../circulation/roadState.ts'
import { useClipboard } from '../clipboard.ts'
import { startPickedRotateDrag, pickedHandle } from '../editing.ts'
import { pickOnPlan } from '../massCommands.ts'
import { pickedNow, pickedRefs, pickRefs, selectBox, withoutHeld } from '../mix.ts'
import { contentBounds } from '../PlanSvg.tsx'
import { DEFAULT_SNAP } from '../snap/kinds.ts'
import { useSnapSettings } from '../snap/settings.ts'
import { useDimensions } from '../tools/toolState.ts'

vi.mock('../../scene/Scene.tsx', () => ({ Scene: () => <div data-testid="scene" /> }))

const OPTION = 'o1'
let v: View
const at = (q: Point, extra: object = {}) => ({
  clientX: (q.x - v.cx) * v.scale + UNMEASURED_SIZE.w / 2,
  clientY: UNMEASURED_SIZE.h / 2 - (q.y - v.cy) * v.scale,
  button: 0,
  pointerId: 1,
  ...extra,
})
const s = () => useApp.getState()
const plan = () => screen.getByRole('img', { name: 'Site plan' })
const press = (el: Element, q: Point, extra: object = {}) => {
  fireEvent.pointerDown(el, at(q, extra))
  fireEvent.pointerUp(el, at(q, extra))
}
const drag = (el: Element, from: Point, to: Point, extra: object = {}) => {
  fireEvent.pointerDown(el, at(from, extra))
  fireEvent.pointerMove(el, at({ x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }, extra))
  fireEvent.pointerMove(el, at(to, extra))
  fireEvent.pointerUp(el, at(to, extra))
}

/** What a group of every kind is made of: ids by kind, in the project the test stands in. */
interface World {
  lot: string
  dim: string
  line: string
  note: string
  gate: string
  road: string
  roadAt: Point
}
let w: World
const refsOf = (x: World) => [
  { kind: 'mass', id: 'm1' },
  { kind: 'street', id: x.road },
  { kind: 'lot', id: x.lot },
  { kind: 'gate', id: x.gate },
  { kind: 'dimension', id: x.dim },
  { kind: 'reference-line', id: x.line },
  { kind: 'note', id: x.note },
]
const ids = (refs: { kind: string; id: string }[]) => refs.map((r) => `${r.kind}:${r.id}`).sort()
const pickedIds = () => ids(pickedRefs())

/** The demo with a free lot, a dimension, a reference line and a note on its level, and the project they stand in. */
function build(): { p: Project; w: World } {
  let p = demoProject()
  const lot = addLot(p, OPTION, { rect: { center: { x: 220, y: 200 }, width: 40, depth: 30, rotation: 0 } })!
  p = lot.project
  const dim = actions.addDimension(p, { x: 60, y: 60 }, { x: 100, y: 60 }, 8, 'l1')!
  p = dim.project
  const line = actions.addReferenceLine(p, [{ x: 0, y: 20 }, { x: 100, y: 20 }])!
  p = line.project
  const note = actions.addNote(p, { x: 300, y: 220 }, 'Hello', 'l1')!
  p = note.project
  const d = derive(p, OPTION)
  const road = d.circulation.roads.find((r) => r.kind === 'street')!
  return { p, w: { lot: lot.id, dim: dim.id, line: line.id, note: note.id, gate: gatesOf(p, OPTION)[0].id, road: road.id, roadAt: road.points[0] } }
}

/** Puts the project in the store and the plan in view; groups what `group` names (every kind when it is not given). */
function stand(group?: (x: World) => { kind: string; id: string }[]) {
  const made = build()
  w = made.w
  let p = made.p
  const g = actions.groupRefs(p, OPTION, group ? group(w) : refsOf(w))
  if (g) p = g.project
  v = fit(contentBounds(derive(p, OPTION)), UNMEASURED_SIZE)
  act(() => useApp.setState({ project: p, derived: derive(p, OPTION), history: emptyHistory(), dragStart: null, selection: NO_SELECTION, level: 'l1', showAll: false, option: OPTION }))
}

const element = {
  mass: () => document.querySelector('[data-mass="m1"]')!,
  lot: () => document.querySelector(`[data-lot="${w.lot}"]`)!,
  note: () => document.querySelector(`[data-note="${w.note}"]`)!,
  line: () => document.querySelector(`[data-reference-line="${w.line}"]`)!,
  dim: () => document.querySelector(`[data-dimension="${w.dim}"] path`)!,
  gate: () => document.querySelector(`[data-gate="${w.gate}"] circle`)!,
  road: () => document.querySelector(`[data-road="${w.road}"]`)!,
}
const where = (): Record<keyof typeof element, Point> => ({
  mass: { x: 120, y: 110 },
  lot: { x: 220, y: 200 },
  note: { x: 305, y: 222 },
  line: { x: 50, y: 20 },
  dim: { x: 80, y: 60 },
  gate: { x: 225, y: 0 },
  road: w.roadAt,
})

beforeEach(() => {
  localStorage.clear()
  useUi.setState({ dialog: null, view: 'plan', rail: 'layers', panels: { left: true, right: true }, sheet: null })
  letGo()
  useLayerView.setState({ hidden: [] })
  useDimensions.setState({ selected: null, also: [] })
  useRoads.setState({ picked: null, node: null, also: [] })
  useLots.setState({ picked: null, also: [] })
  useAccess.setState({ picked: null, alsoGates: [] })
  useAnnotations.setState({ lines: [], notes: [] })
  useSnapSettings.setState({ settings: { ...DEFAULT_SNAP, on: false, grid: false } })
  useClipboard.setState({ masses: [], roads: [] })
  useToast.setState({ toast: null, confirmation: null })
})

describe('a click on a member picks the whole group', () => {
  it.each(['mass', 'lot', 'note', 'line', 'dim', 'gate', 'road'] as const)('on its %s', (kind) => {
    stand()
    render(<App />)
    press(element[kind](), where()[kind])
    expect(pickedIds()).toEqual(ids(refsOf(w)))
    expect(s().selection.massIds).toEqual(['m1'])
  })

  it('Alt+click picks one member alone', () => {
    stand()
    render(<App />)
    press(element.lot(), where().lot, { altKey: true })
    expect(pickedIds()).toEqual([`lot:${w.lot}`])
    press(element.note(), where().note, { altKey: true })
    expect(pickedIds()).toEqual([`note:${w.note}`])
    press(element.dim(), where().dim, { altKey: true })
    expect(pickedIds()).toEqual([`dimension:${w.dim}`])
    press(element.gate(), where().gate, { altKey: true })
    expect(pickedIds()).toEqual([`gate:${w.gate}`])
    press(element.mass(), where().mass, { altKey: true })
    expect(pickedIds()).toEqual(['mass:m1'])
  })

  it('Shift adds the group whole to what is picked, and takes it out whole', () => {
    stand()
    render(<App />)
    act(() => s().select('m2'))
    press(element.lot(), where().lot, { shiftKey: true })
    expect(pickedIds()).toEqual(ids([...refsOf(w), { kind: 'mass', id: 'm2' }]))
    press(element.note(), where().note, { shiftKey: true })
    expect(pickedIds()).toEqual(['mass:m2'])
  })

  it('the selection window takes whole groups: the note inside it brings the rest', () => {
    stand()
    render(<App />)
    // a window over the reference line alone (it spans x 0…100 at y 20)
    fireEvent.pointerDown(plan(), at({ x: -5, y: 12 }))
    fireEvent.pointerMove(plan(), at({ x: 50, y: 18 }))
    fireEvent.pointerMove(plan(), at({ x: 105, y: 28 }))
    fireEvent.pointerUp(plan(), at({ x: 105, y: 28 }))
    expect(pickedIds()).toEqual(ids(refsOf(w)))
    // without the group, the window takes what it covers
    stand(() => [])
    act(() => selectBox({ a: { x: 290, y: 212 }, b: { x: 330, y: 240 } }, false, 1 / v.scale))
    expect(pickedIds()).toEqual([`note:${w.note}`])
  })

  it('a locked member and a hidden one are left out of the group a click picks', () => {
    stand()
    render(<App />)
    act(() => s().apply((p) => actions.lockLots(p, [w.lot], true)))
    act(() => useLayerView.getState().setHidden([NOTES], true))
    press(element.line(), where().line)
    expect(pickedIds()).toEqual(ids(refsOf(w).filter((r) => r.kind !== 'lot' && r.kind !== 'note')))
    // the window leaves them out too
    act(() => selectBox({ a: { x: -5, y: 12 }, b: { x: 105, y: 28 } }, false, 1 / v.scale))
    expect(pickedIds()).toEqual(ids(refsOf(w).filter((r) => r.kind !== 'lot' && r.kind !== 'note')))
  })

  it('a note of another level is not on the plan, so the group a click picks leaves it out', () => {
    stand(() => [])
    // a level above, with a mass (a level with none is tidied away), and a note on it, grouped with the lot and the reference line
    const roof = actions.addLevelAtEnd(s().project, 'above')
    const mass = { programId: 'warehouse', footprint: { kind: 'rect' as const, center: { x: 225, y: 130 }, width: 30, depth: 40, rotation: 0 }, name: 'Roof', height: 14, levelId: roof.id }
    const up = actions.addNote(actions.addMass(roof.project, mass).project, { x: 20, y: 20 }, 'Up there', roof.id)!
    const g = actions.groupRefs(up.project, OPTION, [{ kind: 'lot', id: w.lot }, { kind: 'reference-line', id: w.line }, { kind: 'note', id: up.id }])!
    act(() => s().apply(() => g.project))
    render(<App />)
    press(element.lot(), where().lot)
    expect(pickedIds()).toEqual([`lot:${w.lot}`, `reference-line:${w.line}`])
    // the window leaves it out too
    act(() => selectBox({ a: { x: -5, y: 12 }, b: { x: 105, y: 28 } }, false, 1 / v.scale))
    expect(pickedIds()).toEqual([`lot:${w.lot}`, `reference-line:${w.line}`])
  })

  it('a right-click on a member of a group picks the group, and the menu is of all of them', () => {
    stand()
    render(<App />)
    fireEvent.contextMenu(element.line(), { ...at(where().line), button: 2 })
    expect(pickedIds()).toEqual(ids(refsOf(w)))
    const names = within(screen.getAllByRole('menu')[0])
      .getAllByRole('menuitem')
      .map((b) => b.querySelector('span')!.textContent)
    // Group and Ungroup first, as a kind's own verbs go first; then the clipboard and the rest
    expect(names.slice(0, 2)).toEqual(['Group', 'Ungroup'])
    expect(names).toContain('Delete 7 things')
  })
})

describe('a press and drag on any member moves the whole pick', () => {
  const positions = () => {
    const p = s().project
    const m = p.masses.find((x) => x.id === 'm1')!
    return {
      mass: m.footprint.kind === 'rect' ? m.footprint.center : { x: NaN, y: NaN },
      lot: p.options[0].lots![0].rect!.center,
      line: p.referenceLines![0].points[0],
      note: p.notes![0].at,
      dim: p.dimensions![0].a,
      node: p.options[0].streets!.nodes[0],
    }
  }

  it.each(['mass', 'lot', 'note', 'line', 'road'] as const)('dragged by its %s: every one moves by the same vector, in one undo step', (kind) => {
    stand()
    render(<App />)
    const before = positions()
    const past = s().history.past.length
    const from = where()[kind]
    drag(element[kind](), from, { x: from.x + 24, y: from.y + 8 })
    const after = positions()
    const move = (a: Point, b: Point) => ({ x: Math.round((b.x - a.x) * 1000) / 1000, y: Math.round((b.y - a.y) * 1000) / 1000 })
    const by = move(before.lot, after.lot)
    expect(by.x).toBeGreaterThan(0)
    for (const k of ['mass', 'line', 'note', 'dim', 'node'] as const) expect(move(before[k], after[k]), k).toEqual(by)
    expect(s().history.past.length).toBe(past + 1)
    // still the whole group picked
    expect(pickedIds()).toEqual(ids(refsOf(w)))
    act(() => s().undo())
    expect(positions()).toEqual(before)
  })

  it('a group of two lots only moves both when one is dragged (the drag of a kind alone moves it alone)', () => {
    stand(() => [])
    const second = addLot(s().project, OPTION, { rect: { center: { x: 300, y: 200 }, width: 30, depth: 30, rotation: 0 } })!
    act(() => s().apply(() => actions.groupRefs(second.project, OPTION, [{ kind: 'lot', id: w.lot }, { kind: 'lot', id: second.id }])!.project))
    render(<App />)
    const centres = () => s().project.options[0].lots!.map((l) => l.rect!.center.x)
    const before = centres()
    drag(element.lot(), where().lot, { x: 244, y: 200 })
    expect(centres().map((x, i) => x - before[i])).toEqual([expect.any(Number), expect.any(Number)])
    expect(centres()[0] - before[0]).toBeCloseTo(centres()[1] - before[1], 6)
    expect(centres()[0] - before[0]).toBeGreaterThan(0)
  })

  it('what is picked with Shift, of two kinds, is dragged whole by either (before this a drag moved the kind pressed alone)', () => {
    stand(() => [])
    render(<App />)
    act(() => pickRefs([{ kind: 'mass', id: 'm1' }, { kind: 'lot', id: w.lot }]))
    const before = { mass: (s().project.masses.find((m) => m.id === 'm1')!.footprint as { center: Point }).center, lot: s().project.options[0].lots![0].rect!.center }
    drag(element.lot(), where().lot, { x: 244, y: 200 })
    const m = (s().project.masses.find((x) => x.id === 'm1')!.footprint as { center: Point }).center
    expect(m.x - before.mass.x).toBeCloseTo(s().project.options[0].lots![0].rect!.center.x - before.lot.x, 6)
    expect(m.x - before.mass.x).toBeGreaterThan(0)
    // released without moving, the thing pressed is the pick (as a click on a mass of a mix is)
    press(element.mass(), where().mass)
    expect(pickedIds()).toEqual(['mass:m1'])
  })
})

describe('the frame of a group', () => {
  it('reads Group · n, round all of them, and its dot turns what Rotate turns', () => {
    stand()
    render(<App />)
    press(element.lot(), where().lot)
    const label = document.querySelector('[data-group-label]')!
    expect(label).toHaveTextContent('Group · 7')
    expect(document.querySelector('[data-group-frame]')).toBeInTheDocument()
    // the frame is round everything: the mass at the left, the note above, the reference line below
    const box = pickedHandle(s().project, OPTION, pickedNow(), 1)!.box
    expect(box.minX).toBeLessThanOrEqual(0)
    expect(box.maxY).toBeGreaterThanOrEqual(220)
    // the dot: a quarter turn about the centre of the box turns the note, the lot and the mass; the gate stays, and it says so
    const { pivot } = pickedHandle(s().project, OPTION, pickedNow(), 1)!
    const grabbed = { x: pivot.x, y: pivot.y + 100 }
    const mover = startPickedRotateDrag(1, () => {})({} as never, grabbed)!
    act(() => void mover({ x: -100, y: -100 }, { shiftKey: false }))
    expect(s().project.notes![0].angle).toBeCloseTo(90, 6)
    expect(s().project.options[0].lots![0].rect!.rotation).toBeCloseTo(90, 6)
    expect(useToast.getState().toast?.text).toBe('Gates stay on their side: Rotate leaves them')
  })

  it('a group of masses alone shows it as before, and a pick that is no group shows no label', () => {
    stand(() => [])
    render(<App />)
    act(() => pickRefs([{ kind: 'mass', id: 'm1' }, { kind: 'mass', id: 'm2' }]))
    expect(document.querySelector('[data-group-frame]')).toBeInTheDocument()
    expect(document.querySelector('[data-group-label]')).toBeNull()
    act(() => pickRefs([{ kind: 'mass', id: 'm1' }, { kind: 'lot', id: w.lot }]))
    expect(document.querySelector('[data-group-label]')).toBeNull()
  })
})

describe('Group and Ungroup on everything picked', () => {
  const key = (k: string, extra: object = {}) => act(() => handleKey(new KeyboardEvent('keydown', { key: k, ctrlKey: true, ...extra })))

  it('Ctrl+G groups things of several kinds; Ctrl+Shift+G takes the group apart', () => {
    stand(() => [])
    render(<App />)
    act(() => pickRefs([{ kind: 'lot', id: w.lot }, { kind: 'note', id: w.note }, { kind: 'reference-line', id: w.line }]))
    key('g')
    const p = s().project
    expect(p.options[0].lots![0].group).toBe('g1')
    expect(p.notes![0].group).toBe('g1')
    expect(p.referenceLines![0].group).toBe('g1')
    expect(pickedIds()).toHaveLength(3)
    expect(useToast.getState().toast?.text).toBe('3 things grouped: a click picks them all, Alt+click one alone.')
    key('G', { shiftKey: true })
    expect(s().project.notes![0].group).toBeUndefined()
    expect(s().project.options[0].lots![0].group).toBeUndefined()
    expect(useToast.getState().toast?.text).toBe('Ungrouped: each one on its own.')
  })

  it('the reasons: masses alone keep their words; for things there are three more, one naming what cannot be grouped', () => {
    stand(() => [])
    const reason = (id: string) => {
      const r = commandOf(id)!.enabled!()
      return r === true ? null : r
    }
    // masses alone, as ever
    act(() => s().select('m1'))
    expect(reason('edit.group')).toBe('Select two or more masses to group them')
    expect(reason('edit.ungroup')).toBe('None of them is in a group')
    // one thing that is not a mass
    act(() => pickRefs([{ kind: 'lot', id: w.lot }]))
    expect(reason('edit.group')).toBe('Select two or more things to group them')
    expect(reason('edit.ungroup')).toBe('None of them is in a group')
    // an existing road can (Phase PE.2 task 11); an imported drawing cannot
    const road = s().project.site.existingRoads![0].id
    act(() => pickRefs([{ kind: 'lot', id: w.lot }, { kind: 'note', id: w.note }, { kind: 'existing-road', id: road }]))
    expect(reason('edit.group')).toBeNull()
    act(() => s().apply((p) => ({ ...p, site: { ...p.site, drawings: [{ file: 'a.dxf', layers: [{ name: 'WALLS', color: 1, lines: [{ points: [{ x: 0, y: 0 }, { x: 10, y: 0 }] }] }] }] } })))
    act(() => pickRefs([{ kind: 'lot', id: w.lot }, { kind: 'note', id: w.note }, { kind: 'drawing', id: 'a.dxf', file: 'a.dxf' }]))
    expect(reason('edit.group')).toBe('A drawing file cannot be in a group')
    // grouped already, and then a locked one
    act(() => pickRefs([{ kind: 'lot', id: w.lot }, { kind: 'note', id: w.note }]))
    expect(reason('edit.group')).toBeNull()
    key('g')
    expect(reason('edit.group')).toBe('They are one group already')
    expect(reason('edit.ungroup')).toBeNull()
    act(() => s().apply((p) => actions.lockNotes(p, [w.note], true)))
    act(() => pickRefs([{ kind: 'lot', id: w.lot }, { kind: 'note', id: w.note }]))
    expect(reason('edit.group')).toBe('A locked thing keeps its group: unlock it first')
    expect(reason('edit.ungroup')).toBe('A locked thing keeps its group: unlock it first')
  })

  it('the menu of several kinds shows Group and Ungroup first, as a kind’s own verbs go; one kind alone has them too', () => {
    stand(() => [])
    const names = (refs: { kind: string; id: string }[]) => menuFor(refs, 'plan').flatMap((e) => (e === 'separator' ? [] : [e.label]))
    const mixed = names([{ kind: 'lot', id: w.lot }, { kind: 'note', id: w.note }])
    expect(mixed.slice(0, 2)).toEqual(['Group', 'Ungroup'])
    expect(mixed).toContain('Delete 2 things')
    // a lot alone
    expect(names([{ kind: 'lot', id: w.lot }]).slice(0, 2)).toEqual(['Group', 'Ungroup'])
    // an existing street takes Group like the rest (Phase PE.2 task 11)
    const road = s().project.site.existingRoads![0].id
    expect(names([{ kind: 'lot', id: w.lot }, { kind: 'existing-road', id: road }]).slice(0, 2)).toEqual(['Group', 'Ungroup'])
    // a kind that cannot be grouped in the pick: no Group row at all (what is not there is not shown)
    act(() => s().apply((p) => ({ ...p, site: { ...p.site, drawings: [{ file: 'a.dxf', layers: [{ name: 'WALLS', color: 1, lines: [{ points: [{ x: 0, y: 0 }, { x: 10, y: 0 }] }] }] }] } })))
    const sheet = { kind: 'drawing', id: 'a.dxf', file: 'a.dxf' }
    expect(names([{ kind: 'lot', id: w.lot }, sheet])).not.toContain('Group')
    // a mass's menu is as it was
    expect(names([{ kind: 'mass', id: 'm1' }]).slice(0, 3)).toEqual(['Group', 'Ungroup', 'Union'])
  })
})

// The review of Phase AS.5 (second batch): a group is picked as the plan shows it, its commands act on the whole group, a letting go keeps the mix, the frame counts what is picked.
const otherMass = (levelId: string, x = 100) => ({ programId: 'warehouse', footprint: { kind: 'rect' as const, center: { x, y: 280 }, width: 30, depth: 20, rotation: 0 }, name: 'Other', height: 14, levelId })

describe('a group picked as the plan shows it: the level in view, the buildings it shows', () => {
  it('a click on a note whose group has a mass of another building of the option leaves the plan on its level, and picks both', () => {
    stand(() => [])
    const b = actions.addBuilding(s().project, { optionId: OPTION })
    const m = actions.addMass(b.project, otherMass(b.levelId))
    const g = actions.groupRefs(m.project, OPTION, [{ kind: 'note', id: w.note }, { kind: 'mass', id: m.id }])!
    act(() => s().apply(() => g.project))
    render(<App />)
    press(element.note(), where().note)
    expect(s().level).toBe('l1')
    expect(pickedIds()).toEqual([`mass:${m.id}`, `note:${w.note}`])
  })

  it('a click on that mass is the one that goes to its level, with the things of the group that are not a level’s', () => {
    stand(() => [])
    const b = actions.addBuilding(s().project, { optionId: OPTION })
    const m = actions.addMass(b.project, otherMass(b.levelId))
    const g = actions.groupRefs(m.project, OPTION, [{ kind: 'lot', id: w.lot }, { kind: 'mass', id: m.id }, { kind: 'note', id: w.note }])!
    act(() => s().apply(() => g.project))
    act(() => void pickOnPlan(m.id))
    // the note is on L1: the plan is on the other building's level now, which does not show it
    expect(s().level).toBe(b.levelId)
    expect(pickedIds()).toEqual([`lot:${w.lot}`, `mass:${m.id}`])
  })

  it('a reference line grouped with a mass that a building made unique took out of the option: a click on the line picks it alone, on the same level', () => {
    stand(() => [])
    const d = actions.duplicateOption(s().project, OPTION)!
    const g = actions.groupRefs(d.project, OPTION, [{ kind: 'mass', id: 'm1' }, { kind: 'reference-line', id: w.line }])!
    const u = actions.makeBuildingUnique(g.project, 'b1', OPTION)!
    act(() => s().apply(() => u.project))
    const level = u.project.buildings.find((b) => b.id === u.id)!.levels[0].id
    act(() => s().setLevel(level))
    render(<App />)
    press(element.line(), where().line)
    expect(s().level).toBe(level)
    expect(pickedIds()).toEqual([`reference-line:${w.line}`])
    expect(s().selection.massIds).toEqual([])
  })

  it('a mass of a building the option does not show is left out of the group a click picks', () => {
    stand(() => [])
    const d = actions.duplicateOption(s().project, OPTION)!
    const b = actions.addBuilding(d.project, { optionId: d.id })
    const m = actions.addMass(b.project, otherMass(b.levelId))
    const g = actions.groupRefs(m.project, OPTION, [{ kind: 'lot', id: w.lot }, { kind: 'note', id: w.note }, { kind: 'mass', id: m.id }])!
    act(() => s().apply(() => g.project))
    render(<App />)
    press(element.lot(), where().lot)
    expect(s().level).toBe('l1')
    expect(pickedIds()).toEqual([`lot:${w.lot}`, `note:${w.note}`])
    // the window leaves it out too
    act(() => selectBox({ a: { x: 195, y: 180 }, b: { x: 245, y: 220 } }, false, 1 / v.scale))
    expect(pickedIds()).toEqual([`lot:${w.lot}`, `note:${w.note}`])
  })
})

// A street the group holds, drawn in three segments n1 → n2 → n3 → n4 away from the demo's buildings.
const STREET_NODES = [
  { id: 'n1', x: 40, y: 235 },
  { id: 'n2', x: 80, y: 235 },
  { id: 'n3', x: 120, y: 235 },
  { id: 'n4', x: 120, y: 260 },
]
const STREET_SEGMENTS = [
  { id: 's1', a: 'n1', b: 'n2', type: 'trucks', left: 4, right: 4 },
  { id: 's2', a: 'n2', b: 'n3', type: 'trucks', left: 4, right: 4 },
  { id: 's3', a: 'n3', b: 'n4', type: 'trucks', left: 4, right: 4 },
]
/** The demo with that street, a free lot and a note, the group `group` names, and `lock` of the street's segments locked after it is made. */
function standStreet(group: (x: { lot: string; note: string; road: string }) => { kind: string; id: string }[], lock: string[] = []) {
  let p = demoProject({ streets: false })
  p = { ...p, options: [{ ...p.options[0], streets: { nodes: STREET_NODES, segments: STREET_SEGMENTS } }, ...p.options.slice(1)] }
  const lot = addLot(p, OPTION, { rect: { center: { x: 220, y: 200 }, width: 40, depth: 30, rotation: 0 } })!
  const note = actions.addNote(lot.project, { x: 300, y: 220 }, 'Hello', 'l1')!
  p = note.project
  const x = { lot: lot.id, note: note.id, road: 'street:s1' }
  const g = actions.groupRefs(p, OPTION, group(x))
  if (g) p = g.project
  if (lock.length > 0) p = actions.lockStreets(p, lock, true, OPTION)
  w = { lot: x.lot, note: x.note, line: '', dim: '', gate: '', road: x.road, roadAt: { x: 60, y: 235 } }
  v = fit(contentBounds(derive(p, OPTION)), UNMEASURED_SIZE)
  act(() => useApp.setState({ project: p, derived: derive(p, OPTION), history: emptyHistory(), dragStart: null, selection: NO_SELECTION, level: 'l1', showAll: false, option: OPTION }))
  return x
}

describe('what the padlock leaves out of a group a click picks', () => {
  it('a locked street is left out; one with only some segments locked is picked, its free segments with it', () => {
    standStreet((x) => [{ kind: 'lot', id: x.lot }, { kind: 'note', id: x.note }, { kind: 'street', id: x.road }], ['s1', 's2', 's3'])
    render(<App />)
    press(element.lot(), where().lot)
    expect(pickedIds()).toEqual([`lot:${w.lot}`, `note:${w.note}`])
    act(() => letGo())
    act(() => s().apply((p) => actions.lockStreets(p, ['s1', 's2'], false, OPTION)))
    press(element.lot(), where().lot)
    expect(pickedIds()).toEqual(ids([{ kind: 'lot', id: w.lot }, { kind: 'note', id: w.note }, { kind: 'street', id: w.road }]))
    // Move takes the free segments' nodes alone
    expect(withoutHeld(pickedNow()).nodes).toEqual(['n1', 'n2'])
  })
})

describe('Group and Ungroup with masses whose group holds other kinds', () => {
  const key = (k: string, extra: object = {}) => act(() => handleKey(new KeyboardEvent('keydown', { key: k, ctrlKey: true, ...extra })))

  it('Ctrl+Shift+G with one mass picked out of a group frees the whole group', () => {
    stand((x) => [{ kind: 'mass', id: 'm1' }, { kind: 'lot', id: x.lot }, { kind: 'note', id: x.note }])
    render(<App />)
    act(() => pickRefs([{ kind: 'mass', id: 'm1' }]))
    expect(commandOf('edit.ungroup')!.enabled!()).toBe(true)
    key('G', { shiftKey: true })
    const p = s().project
    expect(p.masses.find((m) => m.id === 'm1')!.group).toBeUndefined()
    expect(p.options[0].lots![0].group).toBeUndefined()
    expect(p.notes![0].group).toBeUndefined()
    expect(useToast.getState().toast?.text).toBe('Ungrouped: each one on its own.')
  })

  it('Ctrl+G with two masses picked, one in a group of other kinds: that group joins whole', () => {
    stand((x) => [{ kind: 'mass', id: 'm1' }, { kind: 'lot', id: x.lot }, { kind: 'note', id: x.note }])
    render(<App />)
    act(() => pickRefs([{ kind: 'mass', id: 'm1' }, { kind: 'mass', id: 'm2' }]))
    expect(commandOf('edit.group')!.enabled!()).toBe(true)
    key('g')
    const p = s().project
    const group = p.masses.find((m) => m.id === 'm1')!.group
    expect(group).toBeDefined()
    expect(p.masses.find((m) => m.id === 'm2')!.group).toBe(group)
    expect(p.options[0].lots![0].group).toBe(group)
    expect(p.notes![0].group).toBe(group)
    // all of it stays picked
    expect(pickedIds()).toEqual(ids([{ kind: 'mass', id: 'm1' }, { kind: 'mass', id: 'm2' }, { kind: 'lot', id: w.lot }, { kind: 'note', id: w.note }]))
  })

  it('masses whose group holds masses alone keep their words (groups.test.tsx)', () => {
    stand(() => [])
    render(<App />)
    act(() => pickRefs([{ kind: 'mass', id: 'm1' }, { kind: 'mass', id: 'm2' }]))
    key('g')
    expect(useToast.getState().toast?.text).toBe('2 masses grouped: a click picks them all, Alt+click one alone.')
    key('G', { shiftKey: true })
    expect(useToast.getState().toast?.text).toBe('Ungrouped: each mass on its own.')
  })
})

describe('hiding or locking one of several picked things lets go of that one only', () => {
  it('one of two notes hidden, or locked: the other and the mass stay picked', () => {
    stand(() => [])
    const second = actions.addNote(s().project, { x: 320, y: 200 }, 'Second', 'l1')!
    act(() => s().apply(() => second.project))
    const all = [{ kind: 'mass', id: 'm1' }, { kind: 'note', id: w.note }, { kind: 'note', id: second.id }]
    act(() => pickRefs(all))
    act(() => useLayerView.getState().setHidden([noteKey(w.note)], true))
    expect(pickedIds()).toEqual(ids([all[0], all[2]]))
    act(() => useLayerView.getState().setHidden([noteKey(w.note)], false))
    act(() => pickRefs(all))
    act(() => s().apply((p) => actions.lockNotes(p, [second.id], true)))
    expect(pickedIds()).toEqual(ids([all[0], all[1]]))
  })

  it('one of two reference lines hidden, or locked: the other and the mass stay picked', () => {
    stand(() => [])
    const second = actions.addReferenceLine(s().project, [{ x: 0, y: 40 }, { x: 100, y: 40 }])!
    act(() => s().apply(() => second.project))
    const all = [{ kind: 'mass', id: 'm1' }, { kind: 'reference-line', id: w.line }, { kind: 'reference-line', id: second.id }]
    act(() => pickRefs(all))
    act(() => useLayerView.getState().setHidden([`reference-line:${w.line}`], true))
    expect(pickedIds()).toEqual(ids([all[0], all[2]]))
    act(() => useLayerView.getState().setHidden([`reference-line:${w.line}`], false))
    act(() => pickRefs(all))
    act(() => s().apply((p) => actions.lockReferenceLines(p, [second.id], true)))
    expect(pickedIds()).toEqual(ids([all[0], all[1]]))
  })

  it('one of two lots hidden, or locked: the other, the note and the mass stay picked', () => {
    stand(() => [])
    const second = addLot(s().project, OPTION, { rect: { center: { x: 300, y: 160 }, width: 30, depth: 30, rotation: 0 } })!
    act(() => s().apply(() => second.project))
    const all = [{ kind: 'mass', id: 'm1' }, { kind: 'note', id: w.note }, { kind: 'lot', id: w.lot }, { kind: 'lot', id: second.id }]
    act(() => pickRefs(all))
    act(() => useLayerView.getState().setHidden([lotKey(w.lot)], true))
    expect(pickedIds()).toEqual(ids([all[0], all[1], all[3]]))
    act(() => useLayerView.getState().setHidden([lotKey(w.lot)], false))
    act(() => pickRefs(all))
    act(() => s().apply((p) => actions.lockLots(p, [second.id], true)))
    expect(pickedIds()).toEqual(ids([all[0], all[1], all[2]]))
  })
})

describe('the frame of a group counts and turns what the plan can pick of it', () => {
  it('a group with a locked member shows Group · n, n the picked ones, and its dot', () => {
    stand((x) => [{ kind: 'mass', id: 'm1' }, { kind: 'lot', id: x.lot }, { kind: 'note', id: x.note }])
    act(() => s().apply((p) => actions.lockLots(p, [w.lot], true)))
    render(<App />)
    press(element.mass(), where().mass)
    expect(pickedIds()).toEqual(ids([{ kind: 'mass', id: 'm1' }, { kind: 'note', id: w.note }]))
    expect(document.querySelector('[data-group-label]')).toHaveTextContent('Group · 2')
    expect(document.querySelector('[data-group-frame]')).toBeInTheDocument()
    expect(document.querySelector('[data-rotate]')).toBeInTheDocument()
  })

  it('the pivot is the centre of the frame, with a street some of whose segments are locked', () => {
    standStreet((x) => [{ kind: 'mass', id: 'm1' }, { kind: 'street', id: x.road }, { kind: 'note', id: x.note }], ['s3'])
    render(<App />)
    press(element.note(), where().note)
    expect(pickedIds()).toEqual(ids([{ kind: 'mass', id: 'm1' }, { kind: 'street', id: w.road }, { kind: 'note', id: w.note }]))
    const frame = document.querySelector('[data-group-frame]')!
    const num = (a: string) => Number(frame.getAttribute(a))
    const centre = { x: num('x') + num('width') / 2, y: num('y') + num('height') / 2 }
    const before = (s().project.masses.find((m) => m.id === 'm1')!.footprint as { center: Point }).center
    // a half turn about the pivot sends a point to its mirror in it: the mass lands where the frame's centre says
    const mover = startPickedRotateDrag(1, () => {})({} as never, { x: centre.x, y: centre.y + 100 })!
    act(() => void mover({ x: 0, y: -200 }, { shiftKey: false }))
    const after = (s().project.masses.find((m) => m.id === 'm1')!.footprint as { center: Point }).center
    expect(after.x).toBeCloseTo(2 * centre.x - before.x, 6)
    expect(after.y).toBeCloseTo(2 * centre.y - before.y, 6)
  })
})

describe('a reference line’s points show when that line is all that is picked', () => {
  it('not inside a group, nor beside another kind', () => {
    stand((x) => [{ kind: 'mass', id: 'm1' }, { kind: 'reference-line', id: x.line }])
    render(<App />)
    press(element.mass(), where().mass)
    expect(pickedIds()).toEqual(ids([{ kind: 'mass', id: 'm1' }, { kind: 'reference-line', id: w.line }]))
    expect(document.querySelectorAll('[data-reference-line-point]')).toHaveLength(0)
    // alone (Alt+click) its two points show
    act(() => pickRefs([]))
    press(element.line(), where().line, { altKey: true })
    expect(pickedIds()).toEqual([`reference-line:${w.line}`])
    expect(document.querySelectorAll('[data-reference-line-point]')).toHaveLength(2)
    // beside a note, not
    act(() => pickRefs([{ kind: 'reference-line', id: w.line }, { kind: 'note', id: w.note }]))
    expect(document.querySelectorAll('[data-reference-line-point]')).toHaveLength(0)
  })
})
