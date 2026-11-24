// A locked mass is held everywhere (Phase AS.3 review: the padlock is CAD's, so a locked mass is not changed by a view, a
// verb, a tool of the agent's or the optimizer). What the first pass held (its shape, its name, its program) now holds all
// of it: the dock marks, door slots and court pills do not act on it; the settle step keeps every field of it but `locked`
// (docks, courts, doors, zones, part…), what an edit of the mass would change; Go to an issue and *Select the masses* do not
// pick it; a right-click on it opens no menu; the agent's tools refuse it and say it is locked; the tree's Delete is off.
import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Building, Grid, Mass, Point, Project } from '../../../model/schema.ts'
import { App } from '../../../App.tsx'
import { callTool } from '../../../api/tools/index.ts'
import { derive } from '../../../engine/derive.ts'
import type { Issue } from '../../../engine/types.ts'
import { DoorSlots } from '../../../modules/docks/views/DocksLayer.tsx'
import { LOCKED } from '../../../model/picked.ts'
import { actions } from '../../../state/actions/index.ts'
import { demoProject } from '../../../state/demo.ts'
import { emptyHistory } from '../../../state/history.ts'
import { NO_SELECTION, useApp } from '../../../state/store.ts'
import { setDoorPattern, flipDoor } from '../../../modules/docks/actions.ts'
import { blockWall, placeWarehouse, addWarehouseType, setEdgeCourt, setTypeCourt } from '../../../modules/warehouse/actions.ts'
import { menuFor } from '../../editing/menu/build.ts'
import { pickFromRow } from '../../panels/buildingCommands.ts'
import { useToast } from '../../layout/toast.ts'
import { useUi } from '../../layout/ui.ts'
import { fit, UNMEASURED_SIZE } from '../../plan/camera.ts'
import { pickForMenu, pickOnPlan } from '../../plan/massCommands.ts'
import { pickedNow, pickRefs } from '../../plan/mix.ts'
import { RelationProperties } from '../../graph/RuleProperties.tsx'
import { letGo } from '../../tools/hand.ts'
import { goToIssue } from '../../viewport/goTo.ts'
import { useLayerView } from '../layerView.ts'

vi.mock('../../scene/Scene.tsx', () => ({ Scene: () => <div data-testid="scene" /> }))

const s = () => useApp.getState()
const toast = () => useToast.getState().toast?.text
const mass = (id: string): Mass => s().project.masses.find((m) => m.id === id)!
const GRID: Grid = { x: 10, y: 10, modules: 4, origin: { x: 40, y: 70 }, angle: 0 }

const v = fit({ minX: 0, minY: -15, maxX: 440, maxY: 280 }, UNMEASURED_SIZE)
const at = (q: Point, extra: object = {}) => ({
  clientX: (q.x - v.cx) * v.scale + UNMEASURED_SIZE.w / 2,
  clientY: UNMEASURED_SIZE.h / 2 - (q.y - v.cy) * v.scale,
  button: 0,
  pointerId: 1,
  ...extra,
})

/** The demo (on a grid, so its doors have slots) with the masses `ids` locked, nothing picked. */
function start(ids: string[] = ['m1'], make: (p: Project) => Project = (p) => p) {
  const p = actions.lockMasses(make(actions.setGrid(demoProject(), GRID)), ids, true)
  useApp.setState({ project: p, derived: derive(p), history: emptyHistory(), dragStart: null, selection: NO_SELECTION, level: 'l1', showAll: false, option: 'o1', refusal: null })
  useToast.setState({ toast: null, confirmation: null })
}

beforeEach(() => {
  localStorage.clear()
  useUi.setState({ dialog: null, view: 'plan', rail: 'layers', panels: { left: true, right: true }, sheet: null })
  useLayerView.setState({ hidden: [], onTop: [], folded: [] })
  letGo()
  start()
})

describe('1. the docks, the courts and the doors of a locked mass are drawn, not edited', () => {
  it('no dock mark and no court pill on a locked mass picked from its row; the docks and courts stay drawn; unlocked, they come back', () => {
    render(<App />)
    act(() => pickFromRow('o1', ['m1']))
    expect(s().selection.massIds).toEqual(['m1'])
    expect(document.querySelector('[data-dock="m1:0"]')).not.toBeNull()
    expect(document.querySelector('[data-court="m1:0"]')).not.toBeNull()
    expect(document.querySelectorAll('[data-dock-mark]')).toHaveLength(0)
    expect(document.querySelector('[data-court-pill]')).toBeNull()
    act(() => s().apply((p) => actions.lockMasses(p, ['m1'], false)))
    expect(document.querySelectorAll('[data-dock-mark]')).toHaveLength(4)
    expect(document.querySelector('[data-court-pill]')).not.toBeNull()
  })

  it('no door slot on a locked mass picked from its row', () => {
    act(() => pickFromRow('o1', ['m1']))
    const { unmount } = render(
      <svg>
        <DoorSlots px={0.1} />
      </svg>,
    )
    expect(document.querySelectorAll('[data-door-slot]')).toHaveLength(0)
    unmount()
    act(() => s().apply((p) => actions.lockMasses(p, ['m1'], false)))
    render(
      <svg>
        <DoorSlots px={0.1} />
      </svg>,
    )
    expect(document.querySelectorAll('[data-door-slot]')).toHaveLength(64)
  })
})

describe('2. settle keeps every field of a locked mass but its lock', () => {
  const refused = (f: (p: Project) => Project) => {
    const was = s().project
    s().apply(f)
    expect(s().project).toBe(was)
    expect(s().refusal?.text).toMatch(/Warehouse 1 is locked/)
  }

  it('docks, courts, a door pattern, door exceptions, zones, a part, doors and block courts', () => {
    refused((p) => actions.setMassDocks(p, 'm1', []))
    refused((p) => actions.setCourtDepth(p, 'm1', 80 / 480, 45))
    refused((p) => setDoorPattern(p, 'm1', { every: 4, offset: 0, skip: 'ends' }))
    refused((p) => flipDoor(p, 'm1', 80 / 480, 4))
    refused((p) => actions.updateMass(p, 'm1', { zones: [{ programId: null, area: 10 }] }))
    refused((p) => actions.updateMass(p, 'm1', { part: 'hall' }))
    refused((p) => actions.updateMass(p, 'm1', { doorsAt: [{ t: 0.1, at: [1], kind: 'dock' }] }))
    refused((p) => actions.updateMass(p, 'm1', { blockCourts: [{ t: 0.1, depth: 30 }] }))
  })

  it('the agent’s tools are refused, and say the mass is locked', () => {
    const p = s().project
    for (const [name, input] of [
      ['setMassDocks', { mass: 'm1', walls: [] }],
      ['setMassDocks', { mass: 'm1', walls: null }],
      ['setCourtDepth', { mass: 'm1', wall: 0, depth: 45 }],
    ] as const) {
      const r = callTool(p, name, input)
      expect(r, name).toMatchObject({ ok: false, error: expect.stringMatching(/Warehouse 1 is locked/) })
    }
    // the same tools on a mass that is not locked work
    expect(callTool(p, 'setMassDocks', { mass: 'm2', walls: [] })).toMatchObject({ ok: true, changed: true })
  })

  it('what the app rewrites on its own is let through: the lock itself, a group that goes with its partner', () => {
    start(['m1'], (p) => actions.groupMasses(p, ['m1', 'm2'])!.project)
    expect(mass('m1').group).toBeDefined()
    s().apply((p) => actions.removeMasses(p, ['m2']))
    expect(s().refusal).toBeNull()
    expect(s().project.masses.some((m) => m.id === 'm2')).toBe(false)
    expect(mass('m1').group).toBeUndefined()
    expect(mass('m1').locked).toBe(true)
    s().apply((p) => actions.lockMasses(p, ['m1'], false))
    expect(mass('m1').locked).toBeUndefined()
  })

  it('a block’s type edit that would change a locked copy’s hall is refused, and the copy stays locked', () => {
    const base = demoProject()
    const { project, id } = addWarehouseType(base)
    const placed = placeWarehouse(project, id, { x: 200, y: 150 }, 0, 'o1')!
    const building = placed.project.buildings.find((b) => b.id === placed.id) as Building
    const levels = new Set(building.levels.map((l) => l.id))
    const hall = placed.project.masses.find((m) => levels.has(m.levelId) && m.part === 'hall')!
    // an edge of the block the type's docks serve: its court depth given, the copy's block courts follow
    let edge: string | null = null
    for (let i = 0; i < 12 && !edge; i++) {
      const w = blockWall(placed.project, hall.id, i)
      if (!w) break
      const q = setEdgeCourt(placed.project, id, w.edge, { depth: 33 })
      const after = q.masses.find((m) => m.id === hall.id)
      if (JSON.stringify(after?.blockCourts) !== JSON.stringify(hall.blockCourts)) edge = w.edge
    }
    expect(edge, 'a docked edge of the block').not.toBeNull()
    const free = placed.project
    expect(free.masses.find((m) => m.id === hall.id)?.locked).toBeUndefined()
    const locked = actions.lockMasses(free, [hall.id], true)
    useApp.setState({ project: locked, derived: derive(locked), history: emptyHistory(), selection: NO_SELECTION, refusal: null })
    s().apply((p) => setEdgeCourt(p, id, edge!, { depth: 33 }))
    expect(s().project).toBe(locked)
    expect(s().refusal?.text).toMatch(/is locked/)
    expect(s().project.masses.find((m) => m.id === hall.id)).toMatchObject({ locked: true, part: 'hall' })
  })

  it('a type edit that leaves a locked copy’s hall as it is passes, and the hall is still locked (the copy is made again, not unlocked)', () => {
    const { project, id } = addWarehouseType(demoProject())
    const placed = placeWarehouse(project, id, { x: 200, y: 150 }, 0, 'o1')!
    const hall = placed.project.masses.find((m) => m.part === 'hall')!
    const locked = actions.lockMasses(placed.project, [hall.id], true)
    useApp.setState({ project: locked, derived: derive(locked), history: emptyHistory(), selection: NO_SELECTION, refusal: null })
    // the type is edited where the hall is the same: its court range (the hall's walls have no court of their own)
    s().apply((p) => setTypeCourt(p, id, { depth: 60, range: [30, 90] }))
    const after = s().project.masses.find((m) => m.id === hall.id)!
    expect(s().project.warehouseTypes![0].court).toEqual({ depth: 60, range: [30, 90] })
    expect(after.locked).toBe(true)
    expect({ ...after, locked: undefined }).toEqual({ ...hall, locked: undefined })
  })
  it('a type edit remakes a copy of a locked building with the doors it has of its own, as a mass locked by itself keeps them', () => {
    const { project, id } = addWarehouseType(demoProject())
    const placed = placeWarehouse(project, id, { x: 200, y: 150 }, 0, 'o1')!
    const hall = placed.project.masses.find((m) => m.part === 'hall')!
    const pattern = { every: 2, offset: 1, skip: 'ends' as const }
    const withDoors = setDoorPattern(placed.project, hall.id, pattern)
    const building = withDoors.buildings.find((b) => b.levels.some((l) => l.id === hall.levelId))!
    const locked = actions.lockBuildings(withDoors, [building.id], true)
    expect(locked.masses.find((m) => m.id === hall.id)!.doorPattern).toEqual(pattern)
    useApp.setState({ project: locked, derived: derive(locked), history: emptyHistory(), selection: NO_SELECTION, refusal: null })
    s().apply((p) => setTypeCourt(p, id, { depth: 60, range: [30, 90] }))
    expect(s().refusal).toBeNull()
    expect(s().project.warehouseTypes![0].court).toEqual({ depth: 60, range: [30, 90] })
    expect(s().project.masses.find((m) => m.id === hall.id)!.doorPattern).toEqual(pattern)
  })
})

describe('3. Go to an issue and Select the masses do not pick a locked mass', () => {
  const issue = (massIds: string[]): Issue => ({ code: 'overlap', severity: 'error', massIds, message: 'x' }) as Issue

  it('goToIssue picks the unlocked ones of the issue and still goes there', () => {
    expect(goToIssue(issue(['m1', 'm2']))).toBe(true)
    expect(s().selection.massIds).toEqual(['m2'])
  })

  it('all locked: nothing is picked and the notice shows', () => {
    start(['m1', 'm2'])
    expect(goToIssue(issue(['m1', 'm2']))).toBe(true)
    expect(s().selection.massIds).toEqual([])
    expect(toast()).toBe(LOCKED)
  })

  it('a relation’s Select the masses skips the locked one', () => {
    const relation = { id: 'rel', rule: 'r', kind: 'near', a: 'm1', b: 'm2', met: true, gap: 0, value: 10 }
    useApp.setState({ derived: { ...s().derived, relations: [relation] } as never })
    render(<RelationProperties id="rel" muted="" />)
    fireEvent.click(screen.getByRole('button', { name: 'Select the masses' }))
    expect(s().selection.massIds).toEqual(['m2'])
    // both locked: nothing, with the notice
    start(['m1', 'm2'])
    useApp.setState({ derived: { ...s().derived, relations: [relation] } as never })
    fireEvent.click(screen.getByRole('button', { name: 'Select the masses' }))
    expect(s().selection.massIds).toEqual([])
    expect(toast()).toBe(LOCKED)
  })
})

describe('3b. Go to an issue and Select the masses do not pick a hidden mass either', () => {
  const issue = (massIds: string[]): Issue => ({ code: 'overlap', severity: 'error', massIds, message: 'x' }) as Issue
  const relation = { id: 'rel', rule: 'r', kind: 'near', a: 'm2', b: 'm3', met: true, gap: 0, value: 10 }

  it('goToIssue leaves out a mass whose eye is off', () => {
    useLayerView.setState({ hidden: ['mass:m2'] })
    expect(goToIssue(issue(['m2', 'm3']))).toBe(true)
    expect(s().selection.massIds).toEqual(['m3'])
    start([])
    useLayerView.setState({ hidden: ['mass:m2', 'mass:m3'] })
    expect(goToIssue(issue(['m2', 'm3']))).toBe(true)
    expect(s().selection.massIds).toEqual([])
  })

  it('a relation’s Select the masses leaves out a mass whose eye is off', () => {
    useApp.setState({ derived: { ...s().derived, relations: [relation] } as never })
    useLayerView.setState({ hidden: ['mass:m2'] })
    render(<RelationProperties id="rel" muted="" />)
    fireEvent.click(screen.getByRole('button', { name: 'Select the masses' }))
    expect(s().selection.massIds).toEqual(['m3'])
  })
})

describe('4. a right-click on a locked mass opens no menu', () => {
  const massEl = (id: string) => document.querySelector(`[data-mass="${id}"]`)!

  it('on the plan, another mass picked: the notice alone, the selection kept, no menu', () => {
    render(<App />)
    act(() => void pickOnPlan('m2'))
    fireEvent.contextMenu(massEl('m1'), at({ x: 120, y: 110 }))
    expect(pickedNow().masses).toEqual(['m2'])
    expect(toast()).toBe(LOCKED)
    expect(screen.queryByRole('menu')).toBeNull()
    // an unlocked one picks itself first and opens it
    fireEvent.contextMenu(massEl('m3'), at({ x: 100, y: 245 }))
    expect(pickedNow().masses).toEqual(['m3'])
    expect(screen.getByRole('menu')).toBeInTheDocument()
  })

  it('the choice the plan and the 3D share: pickForMenu is false for a locked mass not picked, true when it is picked from its row', () => {
    act(() => void pickOnPlan('m2'))
    expect(pickForMenu('m1', false)).toBe(false)
    expect(toast()).toBe(LOCKED)
    expect(pickedNow().masses).toEqual(['m2'])
    expect(pickForMenu('m2', false)).toBe(true)
    act(() => pickFromRow('o1', ['m1']))
    expect(pickForMenu('m1', false)).toBe(true)
    letGo()
    expect(pickForMenu('m3', false)).toBe(true)
    expect(pickedNow().masses).toEqual(['m3'])
  })
})

describe('5. the agent’s tools say a locked mass is locked', () => {
  it('moveMassToLevel, groupMasses and ungroupMasses', () => {
    const p = s().project
    for (const [name, input] of [
      ['moveMassToLevel', { mass: 'm1', direction: 1 }],
      ['groupMasses', { masses: ['m1', 'm2'] }],
      ['ungroupMasses', { masses: ['m1'] }],
    ] as const) {
      expect(callTool(p, name, input), name).toMatchObject({ ok: false, error: expect.stringMatching(/Warehouse 1 is locked/) })
    }
    expect(callTool(p, 'groupMasses', { masses: ['m2', 'm3'] })).toMatchObject({ ok: true, changed: true })
  })

  it('every tool that edits a mass refuses a locked one with a reason that says so', () => {
    const p = s().project
    const calls: [string, object][] = [
      ['updateMass', { mass: 'm1', name: 'Nope' }],
      ['updateMass', { mass: 'm1', height: 20 }],
      ['moveMass', { mass: 'm1', dx: 5, dy: 0 }],
      ['moveMasses', { masses: ['m1'], dx: 5, dy: 0 }],
      ['rotateMass', { mass: 'm1', degrees: 10 }],
      ['rotateMasses', { masses: ['m1'], degrees: 10 }],
      ['moveWall', { mass: 'm1', wall: 0, d: 2 }],
      ['removeMasses', { masses: ['m1'] }],
      ['setMassOutline', { mass: 'm1', points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }] }],
      ['moveVertex', { mass: 'm1', corner: 0, x: 30, y: 60 }],
      ['setMassDocks', { mass: 'm1', walls: [] }],
      ['setCourtDepth', { mass: 'm1', wall: 0, depth: 45 }],
      ['moveMassToLevel', { mass: 'm1', direction: 1 }],
      ['groupMasses', { masses: ['m1', 'm2'] }],
    ]
    for (const [name, input] of calls) {
      const r = callTool(p, name, input)
      expect(r, name).toMatchObject({ ok: false })
      expect((r as { error: string }).error, name).toMatch(/locked/)
    }
  })
})

describe('6. the tree’s Delete is off for what holds a locked mass, and says why', () => {
  // the Layers rows' menus are the one menu's, opened for what the right-click picked: what it says of Delete for these refs
  const del = (...refs: { kind: string; id: string }[]) => (pickRefs(refs), menuFor(refs, 'layers')).find((x) => typeof x === 'object' && x.key === 'delete') as { disabled?: boolean; title?: string }
  const m = (id: string) => ({ kind: 'mass', id })

  it('a locked mass’s menu, several masses, a level', () => {
    const one = del(m('m1'))
    expect(one.disabled).toBe(true)
    expect(one.title).toMatch(/locked/i)
    expect(del(m('m2')).disabled).toBeFalsy()
    expect(del(m('m1'), m('m2')).title).toMatch(/locked/i)
    expect(del(m('m2'), m('m3')).disabled).toBeFalsy()
    // a building of two levels, the first holding the locked masses (the second is empty)
    const two = actions.addLevel(s().project, { name: 'L2', elevation: 20, height: 4, repeat: 1 }, 'b1')!
    useApp.setState({ project: two.project, derived: derive(two.project) })
    const level = del({ kind: 'level', id: 'l1' })
    expect(level.disabled).toBe(true)
    expect(level.title).toMatch(/locked/i)
    expect(del({ kind: 'level', id: two.id }).disabled).toBeFalsy()
  })
})
