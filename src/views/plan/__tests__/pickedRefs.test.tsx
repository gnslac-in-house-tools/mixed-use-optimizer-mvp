// The bridge's reference (Phase AS.4, Decision "Kinds"): what is picked, of any kind, as `Ref`s (`pickedRefs`, `usePickedRefs`), and
// `pickRefs` to pick exactly those (or add them): over the stores that stay (the masses', the streets', the lots', the access's, the
// dimensions', the drawings' and Layers' rows), so that the menu and the verbs name what is picked in one way.
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { derive } from '../../../engine/derive.ts'
import type { Project } from '../../../model/schema.ts'
import type { Ref } from '../../../kinds/types.ts'
import { addLot } from '../../../modules/parking/actions.ts'
import { useLots } from '../../../modules/parking/views/lotState.ts'
import { actions } from '../../../state/actions/index.ts'
import { demoProject } from '../../../state/demo.ts'
import { emptyHistory } from '../../../state/history.ts'
import { NO_SELECTION, useApp } from '../../../state/store.ts'
import { useLayerPick } from '../../layers/layerPick.ts'
import { useLayerView } from '../../layers/layerView.ts'
import { useAccess } from '../access/accessState.ts'
import { useRoads } from '../circulation/roadState.ts'
import { letGoAll, pickedNow, pickedRefs, pickRefs, usePickedRefs } from '../mix.ts'
import { useDrawingPick } from '../site/drawingPick.ts'
import { useDimensions } from '../tools/toolState.ts'

const sq = (x: number, s: number) => ({ vertices: [{ x, y: 0, r: 0 }, { x: x + s, y: 0, r: 0 }, { x: x + s, y: s, r: 0 }, { x, y: s, r: 0 }] })
const line = { points: [{ x: 0, y: 0 }, { x: 10, y: 0 }] }
const s = () => useApp.getState()

let lot = ''
let dim = ''
beforeEach(() => {
  localStorage.clear()
  // the demo, its south street an existing street
  const d = demoProject()
  let p: Project = { ...d, site: { ...d.site, drawings: [{ file: 'a.dxf', layers: [{ name: 'WALLS', color: 1, lines: [line] }] }], parcels: [{ name: 'P1', contour: sq(0, 20), file: 'a.dxf' }] } }
  const l = addLot(p, 'o1', { rect: { center: { x: 220, y: 200 }, width: 40, depth: 30, rotation: 0 } })!
  lot = l.id
  const m = actions.addDimension(l.project, { x: 60, y: 60 }, { x: 100, y: 60 }, 8, 'l1')!
  dim = m.id
  p = m.project
  useApp.setState({ project: p, derived: derive(p, 'o1'), history: emptyHistory(), dragStart: null, selection: NO_SELECTION, level: 'l1', showAll: false, option: 'o1' })
  useLayerView.setState({ hidden: [], onTop: [] })
  useLayerPick.setState({ keys: [] })
  letGoAll()
})

const street = () => s().derived.circulation.roads.find((r) => r.kind === 'street')!.id
const gate = () => s().derived.circulation.gates[0].id
const existing = () => s().project.site.existingRoads![0].id
const sorted = (refs: Ref[]) => [...refs].sort((a, b) => `${a.kind}/${a.id}`.localeCompare(`${b.kind}/${b.id}`))

describe('pickedRefs', () => {
  it('is empty when nothing is picked', () => {
    expect(pickedRefs()).toEqual([])
  })

  it('a mass, a street, a lot, a gate, a dimension, an existing road: each as its kind', () => {
    act(() => s().select('m1'))
    expect(pickedRefs()).toEqual([{ kind: 'mass', id: 'm1' }])
    act(() => useRoads.getState().pick(street()))
    expect(pickedRefs()).toEqual([{ kind: 'street', id: street() }])
    act(() => useLots.getState().pick(lot))
    expect(pickedRefs()).toEqual([{ kind: 'lot', id: lot }])
    act(() => useAccess.getState().pick({ kind: 'gate', id: gate() }))
    expect(pickedRefs()).toEqual([{ kind: 'gate', id: gate() }])
    act(() => useAccess.getState().pick({ kind: 'existing', id: existing() }))
    expect(pickedRefs()).toEqual([{ kind: 'existing-road', id: existing() }])
    act(() => useDimensions.getState().select(dim))
    expect(pickedRefs()).toEqual([{ kind: 'dimension', id: dim }])
  })

  it('an existing road picked in the access store is an existing-road', () => {
    const p = { ...s().project, site: { ...s().project.site, existingRoads: [{ id: 'x1', points: [{ x: 0, y: -20 }, { x: 100, y: -20 }], stretches: [{ left: 3, right: 3 }] }] } }
    act(() => useApp.setState({ project: p, derived: derive(p, 'o1') }))
    act(() => useAccess.getState().pick({ kind: 'existing', id: 'x1' }))
    expect(pickedRefs()).toEqual([{ kind: 'existing-road', id: 'x1' }])
  })

  it('the drawings’ parts carry their file: a file, a layer, the parcels', () => {
    act(() => useDrawingPick.getState().set([{ file: 'a.dxf' }, { file: 'a.dxf', layer: 'WALLS' }, { file: 'a.dxf', parcels: true }]))
    const refs = pickedRefs()
    expect(refs).toContainEqual({ kind: 'drawing', id: 'a.dxf', file: 'a.dxf' })
    expect(refs).toContainEqual({ kind: 'drawing-layer', id: 'WALLS', file: 'a.dxf' })
    expect(refs).toContainEqual({ kind: 'parcels', id: 'a.dxf', file: 'a.dxf' })
  })

  it('the rows of Layers that are not objects give theirs: a building, a level, a file, a layer, a file’s parcels', () => {
    const b = s().project.buildings[0]
    act(() => useLayerPick.getState().set([`building:${b.id}`, `level:${b.levels[0].id}`, 'file:a.dxf', 'layer:a.dxf/WALLS', 'parcels:a.dxf', 'streets']))
    expect(sorted(pickedRefs())).toEqual(
      sorted([
        { kind: 'building', id: b.id },
        { kind: 'level', id: b.levels[0].id },
        { kind: 'drawing', id: 'a.dxf', file: 'a.dxf' },
        { kind: 'drawing-layer', id: 'WALLS', file: 'a.dxf' },
        { kind: 'parcels', id: 'a.dxf', file: 'a.dxf' },
      ]),
    )
  })

  it('a mix gives every kind picked, as pickedNow has them', () => {
    act(() => pickRefs([{ kind: 'mass', id: 'm1' }, { kind: 'lot', id: lot }, { kind: 'gate', id: gate() }, { kind: 'dimension', id: dim }, { kind: 'street', id: street() }]))
    const refs = pickedRefs()
    expect(refs).toHaveLength(5)
    const now = pickedNow()
    expect(refs.filter((r) => r.kind === 'mass').map((r) => r.id)).toEqual(now.masses)
    expect(refs.filter((r) => r.kind === 'lot').map((r) => r.id)).toEqual(now.lots)
    expect(refs.filter((r) => r.kind === 'gate').map((r) => r.id)).toEqual(now.gates)
    expect(refs.filter((r) => r.kind === 'dimension').map((r) => r.id)).toEqual(now.dimensions)
  })
})

describe('pickRefs', () => {
  it('picks exactly those and pickedRefs gives them back', () => {
    const refs: Ref[] = [{ kind: 'mass', id: 'm1' }, { kind: 'mass', id: 'm2' }, { kind: 'lot', id: lot }, { kind: 'dimension', id: dim }, { kind: 'drawing-layer', id: 'WALLS', file: 'a.dxf' }]
    act(() => pickRefs(refs))
    expect(sorted(pickedRefs())).toEqual(sorted(refs))
    expect(s().selection.massIds).toEqual(['m1', 'm2'])
  })

  it('a street, a gate and an existing road round-trip', () => {
    act(() => pickRefs([{ kind: 'street', id: street() }, { kind: 'gate', id: gate() }]))
    expect(sorted(pickedRefs())).toEqual(sorted([{ kind: 'street', id: street() }, { kind: 'gate', id: gate() }]))
    act(() => pickRefs([{ kind: 'existing-road', id: existing() }]))
    expect(pickedRefs()).toEqual([{ kind: 'existing-road', id: existing() }])
  })

  it('an existing street beside a gate, a street and a mass (Phase PE.2): all of them picked, and the same again with add', () => {
    const refs: Ref[] = [{ kind: 'mass', id: 'm1' }, { kind: 'street', id: street() }, { kind: 'existing-road', id: existing() }, { kind: 'gate', id: gate() }]
    act(() => pickRefs(refs))
    expect(sorted(pickedRefs())).toEqual(sorted(refs))
    act(() => pickRefs([{ kind: 'existing-road', id: existing() }, { kind: 'mass', id: 'm2' }], true))
    expect(sorted(pickedRefs())).toEqual(sorted([...refs, { kind: 'mass', id: 'm2' }]))
  })

  it('lets go of what was picked before; an empty list lets everything go', () => {
    act(() => pickRefs([{ kind: 'mass', id: 'm1' }, { kind: 'lot', id: lot }]))
    act(() => pickRefs([{ kind: 'dimension', id: dim }]))
    expect(pickedRefs()).toEqual([{ kind: 'dimension', id: dim }])
    act(() => pickRefs([]))
    expect(pickedRefs()).toEqual([])
  })

  it('add keeps what is picked, without twice the same', () => {
    act(() => pickRefs([{ kind: 'mass', id: 'm1' }]))
    act(() => pickRefs([{ kind: 'mass', id: 'm1' }, { kind: 'lot', id: lot }], true))
    expect(sorted(pickedRefs())).toEqual(sorted([{ kind: 'mass', id: 'm1' }, { kind: 'lot', id: lot }]))
  })

  it('a building and a level are picked as rows of Layers', () => {
    const b = s().project.buildings[0]
    act(() => pickRefs([{ kind: 'building', id: b.id }]))
    expect(pickedRefs()).toEqual([{ kind: 'building', id: b.id }])
    expect(useLayerPick.getState().keys).toEqual([`building:${b.id}`])
    act(() => pickRefs([{ kind: 'level', id: b.levels[0].id }]))
    expect(pickedRefs()).toEqual([{ kind: 'level', id: b.levels[0].id }])
  })

  it('a kind it does not know picks nothing and is not given back', () => {
    act(() => pickRefs([{ kind: 'nope', id: 'x' }]))
    expect(pickedRefs()).toEqual([])
  })
})

describe('usePickedRefs', () => {
  it('follows the stores', () => {
    const { result } = renderHook(() => usePickedRefs())
    expect(result.current).toEqual([])
    act(() => s().select('m2'))
    expect(result.current).toEqual([{ kind: 'mass', id: 'm2' }])
    act(() => useLots.getState().pick(lot))
    expect(result.current).toEqual([{ kind: 'lot', id: lot }])
    act(() => pickRefs([]))
    expect(result.current).toEqual([])
  })
})
