// The block editor's right-click, from the kinds (Phase AS.4 task 6, Decision "One menu"): a zone, a hole, a truck court, an element and an edge of the block
// plan are kinds of the warehouse module with their own verbs only, and the one builder (`menuFor`) makes their menu, the entries the plan's old menu had
// (Decisions "Warehouse by hand", "Block shape"), in the same order; each row is the hand edit it was (a locked step opens, a toast says so).
import { act } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { derive } from '../../../../engine/derive.ts'
import { actions } from '../../../../state/actions/index.ts'
import { demoProject } from '../../../../state/demo.ts'
import { emptyHistory } from '../../../../state/history.ts'
import { NO_SELECTION, useApp } from '../../../../state/store.ts'
import { menuFor } from '../../../../views/editing/menu/build.ts'
import type { MenuEntry } from '../../../../views/controls/Menu.tsx'
import type { Ref } from '../../../../kinds/types.ts'
import type { Point } from '../../../../model/schema.ts'
import { generate } from '../../engine/generate.ts'
import { splitZone, zonesOf } from '../../engine/zones.ts'
import { setZones } from '../commands.ts'
import { splitAt } from '../handleMath.ts'
import { lengthText, useUnits } from '../units.ts'
import { useWarehouse } from '../warehouseState.ts'

const s = () => useApp.getState()
const type = () => s().project.warehouseTypes![0]
const g = () => generate(type())

const shape = (entries: MenuEntry[]): string[] => entries.map((e) => (e === 'separator' ? '|' : e.label))
const rowOf = (entries: MenuEntry[], label: string) => entries.find((e): e is Extract<MenuEntry, { onSelect(): void }> => e !== 'separator' && e.label === label && 'onSelect' in e)!
const menuOf = (ref: Ref, at: Point | null = null) => menuFor([ref], 'plan', at)

beforeEach(() => {
  localStorage.clear()
  const p = actions.addWarehouseType(demoProject()).project
  useApp.setState({ project: p, derived: derive(p), history: emptyHistory(), dragStart: null, selection: NO_SELECTION, option: p.options[0].id })
  useWarehouse.setState({ programId: null, typeId: 'wt1', shown: null, picked: [] })
  act(() => {
    for (const st of ['grid', 'hall', 'columns', 'envelope', 'morphology'] as const) s().apply((p2) => actions.lockWarehouseStep(p2, 'wt1', st))
  })
})

describe('the block editor’s menu, from the kinds', () => {
  it('a zone: its program │ Split here · Merge with each neighbour │ Level ± ; the program checked is the zone’s', () => {
    const built = s().project.programs.filter((x) => x.built).map((x) => x.name)
    const u = useUnits.getState().unit
    const level = lengthText(0.5, u)
    const whole = menuOf({ kind: 'zone', id: '1' }, { x: 100, y: 48 })
    expect(shape(whole)).toEqual(['The block’s program', 'No program', ...built, '|', 'Split here', '|', `Level +${level}`, `Level −${level}`])
    expect(rowOf(whole, 'The block’s program')).toMatchObject({ checked: true })
    expect(rowOf(whole, 'Split here')).toMatchObject({ disabled: false })

    // split in two: the second zone has a neighbour to merge with
    const sp = splitAt(zonesOf(type(), g().runs), g().runs, { x: 100, y: 48 })!
    act(() => setZones('wt1', splitZone(zonesOf(type(), g().runs), sp.zone, sp.axis, sp.k)))
    const zones = zonesOf(type(), g().runs)
    expect(zones).toHaveLength(2)
    const second = menuOf({ kind: 'zone', id: zones[1].id }, { x: 120, y: 48 })
    expect(shape(second)).toEqual(['The block’s program', 'No program', ...built, '|', 'Split here', 'Merge with Zone 1', '|', `Level +${level}`, `Level −${level}`])
    // a program given by its row is the zone's
    act(() => void rowOf(second, 'No program').onSelect())
    expect(type().morphology.zones!.find((z) => z.id === zones[1].id)!.program).toBeNull()
  })

  it('an edge: Pull out and Push in this bay │ Remove the corner at its start · at its end', () => {
    const front = g().edges.find((e) => e.id === 'e1')!
    const entries = menuOf({ kind: 'edge', id: front.id }, { x: 50, y: -0.5 })
    expect(shape(entries)).toEqual(['Pull out this bay', 'Push in this bay', '|', 'Remove the corner at its start', 'Remove the corner at its end'])
    expect(rowOf(entries, 'Pull out this bay')).toMatchObject({ disabled: false })
    // off the wall's bays there is no bay to pull: greyed, with the reason
    const off = menuOf({ kind: 'edge', id: front.id }, null)
    expect(rowOf(off, 'Pull out this bay')).toMatchObject({ disabled: true })
  })

  it('an element: Remove this dock (a door: this level door; a pattern by its name)', () => {
    const dock = type().elements.find((e) => e.kind === 'dock')!
    const entries = menuOf({ kind: 'element', id: dock.id })
    expect(shape(entries)).toEqual(['Remove this dock'])
    const n = type().elements.length
    act(() => void rowOf(entries, 'Remove this dock').onSelect())
    expect(type().elements).toHaveLength(n - 1)
    expect(type().elements.some((e) => e.id === dock.id)).toBe(false)
    // one that is gone has no menu
    expect(menuOf({ kind: 'element', id: dock.id })).toEqual([])
  })

  it('a truck court: a docked wall’s says The block’s depth again (greyed with no depth of its own); a wall without docks, Remove this truck court', () => {
    const docked = g().doors.find((d) => d.kind === 'dock')!.edge
    expect(shape(menuOf({ kind: 'court', id: docked }))).toEqual(['The block’s depth again'])
    expect(rowOf(menuOf({ kind: 'court', id: docked }), 'The block’s depth again')).toMatchObject({ disabled: true })
    const bare = g().edges.find((e) => !g().doors.some((d) => d.kind === 'dock' && d.edge === e.id))!
    expect(shape(menuOf({ kind: 'court', id: bare.id }))).toEqual(['Remove this truck court'])
  })

  it('a truck court with a shape of its own (Phase D.3 task 7): Back to a rectangle, and The block’s depth again greyed with its reason; the row brings back the rectangle at the deepest point', () => {
    const docked = g().doors.find((d) => d.kind === 'dock')!.edge
    const wedge = { vertices: [{ x: 0, y: 0, r: 0 }, { x: 180, y: 0, r: 0 }, { x: 180, y: 30, r: 0 }, { x: 20, y: 24, r: 0 }] }
    act(() => s().apply((p) => ({ ...p, warehouseTypes: p.warehouseTypes!.map((t) => ({ ...t, courts: [{ edge: docked, id: 'c1', shape: wedge }] })) })))
    const entries = menuOf({ kind: 'court', id: docked })
    expect(shape(entries)).toEqual(['Back to a rectangle', 'The block’s depth again'])
    const again = rowOf(entries, 'The block’s depth again')
    expect(again).toMatchObject({ disabled: true })
    expect(again.title).toMatch(/shape/i)
    const steps = s().history.past.length
    act(() => void rowOf(entries, 'Back to a rectangle').onSelect())
    expect(type().courts).toEqual([{ edge: docked, depth: 30 }])
    expect(s().history.past.length).toBe(steps + 1)
    // a rectangle again: the row is gone, the depth's row is the block's own greyed one
    expect(shape(menuOf({ kind: 'court', id: docked }))).toEqual(['The block’s depth again'])
    // the court's own ref (the shape engine's, `<typeId>/<edgeId>`) is read as its wall
    expect(shape(menuOf({ kind: 'court', id: `wt1/${docked}` }))).toEqual(['The block’s depth again'])
  })

  it('a hole: Remove the hole; and none of them has Copy, Delete, Lock or Properties (their base verbs come with the engines)', () => {
    expect(shape(menuOf({ kind: 'hole', id: 'h1' }))).toEqual(['Remove the hole'])
  })
})
