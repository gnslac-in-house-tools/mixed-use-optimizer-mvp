// The review of what is hidden, kept per project (Phase AS.3, fixes after task 8), the parts that need the store alone:
//   - an object's key (a building, a gate, a lot, an existing road, a drawing's layer or parcel) is dropped from
//     hidden, on top and folded when the object is gone from the project, because ids come back (*New building* is b2 again)
//     and a new object must not be born hidden; it is kept while the object stands in any option, never dropped for another
//     project's entry, never during a drag's preview, and the entry of the project that opens is loaded before anything is
//     pruned against it
//   - the sample's entry is not dropped at load, as it is not in the library until it is edited
//   - a row picked in Layers for an object that is deleted is let go, wherever Layers is shown
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { derive } from '../../../engine/derive.ts'
import type { Project } from '../../../model/schema.ts'
import { actions } from '../../../state/actions/index.ts'
import { addBuilding, addOption } from '../../../state/actions/buildings.ts'
import { demoProject } from '../../../state/demo.ts'
import { emptyHistory } from '../../../state/history.ts'
import { SAMPLE_ID, sampleProject } from '../../../state/sample.ts'
import { NO_SELECTION, useApp } from '../../../state/store.ts'
import { BLOCK_EDITOR_ID } from '../../home/editorId.ts'
import { INDEX_KEY } from '../../../io/library.ts'
import { building, drawingLayer, existingRoad, gate, lot, MAP, parcel, STREETS } from '../keys.ts'
import { LAYERS_KEY, isHidden, useLayerView } from '../layerView.ts'
import { useLayerPick } from '../layerPick.ts'

const s = () => useApp.getState()
const hide = (...keys: string[]) => useLayerView.getState().setHidden(keys, true)
const view = () => useLayerView.getState()
const stored = () => JSON.parse(localStorage.getItem(LAYERS_KEY) ?? 'null') as Record<string, { hidden: string[]; onTop: string[]; folded: string[] }> | null

/** The demo with an Annex (b2), a second gate, a second existing road (the demo's south street is the first), a lot and a drawing with a layer and a parcel. */
function prepared(): { project: Project; ids: { gate: string; road: string; lot: string } } {
  let p = demoProject()
  p = actions.addBuilding(p, { optionId: 'o1', name: 'Annex' }).project
  const g = actions.addGate(p, 'o1', 0.1)
  const r = actions.addExistingRoad(g.project, [{ x: -60, y: 310 }, { x: 500, y: 310 }], 12)!
  const l = actions.addLot(r.project, 'o1', { rect: { center: { x: 380, y: 230 }, width: 50, depth: 24, rotation: 0 } })!
  p = {
    ...l.project,
    site: {
      ...l.project.site,
      drawings: [{ file: 'civil.dwg', layers: [{ name: 'A-SITE', color: 1, lines: [{ points: [{ x: 0, y: 0 }, { x: 10, y: 0 }] }] }] }],
      parcels: [{ name: 'P1', contour: { vertices: [{ x: 0, y: 0, r: 0 }, { x: 5, y: 0, r: 0 }, { x: 5, y: 5, r: 0 }] }, file: 'civil.dwg' }],
    },
  }
  return { project: p, ids: { gate: g.id, road: r.id, lot: l.id } }
}

function start(p: Project, id = 'a') {
  useApp.getState().open({ ...p, id })
  useApp.setState({ derived: derive(s().project, 'o1'), history: emptyHistory(), dragStart: null, selection: NO_SELECTION, level: 'l1', option: 'o1' })
}

beforeEach(() => {
  localStorage.clear()
  useLayerPick.setState({ keys: [] })
  start(demoProject(), 'zero')
  start(prepared().project)
})

describe('an id that comes back is not born hidden', () => {
  it('hide b2, delete b2, *New building* is b2 again: it shows, and the entry no longer holds it', () => {
    hide(building('b2'))
    view().setOnTop([building('b2')], true)
    view().setFolded(`building:b2`, true)
    expect(isHidden(building('b2'))).toBe(true)
    s().apply((p) => actions.removeBuilding(p, 'b2'))
    expect(s().project.buildings.some((b) => b.id === 'b2')).toBe(false)
    expect(view().hidden).toEqual([])
    expect(view().onTop).toEqual([])
    expect(view().folded).toEqual([])
    expect(stored()?.a).toBeUndefined()
    s().apply((p) => addBuilding(p, { optionId: 'o1', name: 'Again' }).project)
    expect(s().project.buildings.at(-1)!.id).toBe('b2')
    expect(isHidden(building('b2'))).toBe(false)
  })

  it('a gate, a lot and an existing road: their own keys go with them, the others’ stay; a frontage key an older session stored goes at once (a frontage is an existing street now)', () => {
    const { ids } = prepared()
    const d = s().derived.circulation
    const gateId = d.gates.at(-1)!.id
    const lotId = d.lots[0].id
    const road = s().project.site.existingRoads!.at(-1)!.id
    expect([gateId, lotId, road]).toEqual([ids.gate, ids.lot, ids.road])
    hide(gate(gateId), gate(d.gates[0].id), lot(lotId), existingRoad(road), building('b1'), 'frontage', 'frontage:f1')
    s().apply((p) => actions.removeGate(p, 'o1', gateId))
    expect(view().hidden).not.toContain(gate(gateId))
    expect(view().hidden).toContain(gate(d.gates[0].id))
    s().apply((p) => actions.removeLots(p, 'o1', [lotId]))
    s().apply((p) => actions.removeExistingRoad(p, road))
    expect(view().hidden).toEqual([gate(d.gates[0].id), building('b1')])
  })

  it('a drawing’s layers and parcels go with their file; a kind’s key (Streets, Map…) never goes', () => {
    hide(drawingLayer('civil.dwg', 'A-SITE'), parcel('P1', 'civil.dwg'), STREETS, MAP)
    view().setOnTop([drawingLayer('civil.dwg', 'A-SITE')], true)
    view().setFolded('file:civil.dwg', true)
    s().apply((p) => ({ ...p, site: { ...p.site, drawings: [], parcels: [] } }))
    expect(view().hidden).toEqual([STREETS, MAP])
    expect(view().onTop).toEqual([])
    expect(view().folded).toEqual([])
  })

  it('a layer or a parcel that stays keeps its key', () => {
    hide(drawingLayer('civil.dwg', 'A-SITE'), parcel('P1', 'civil.dwg'))
    s().apply((p) => ({ ...p, name: 'renamed' }))
    expect(view().hidden).toEqual([drawingLayer('civil.dwg', 'A-SITE'), parcel('P1', 'civil.dwg')])
  })

  it('a building stays hidden while any option holds it: unlinked from one, kept; gone from all, dropped', () => {
    const o2 = addOption(s().project, { name: 'Second', buildingIds: ['b2'] })
    s().apply(() => o2.project)
    hide(building('b2'))
    s().apply((p) => actions.removeBuildingFromOption(p, 'o1', 'b2'))
    expect(s().project.buildings.some((b) => b.id === 'b2')).toBe(true)
    expect(view().hidden).toEqual([building('b2')])
    s().apply((p) => actions.removeBuildingFromOption(p, o2.id, 'b2'))
    expect(view().hidden).toEqual([])
  })

  it('a drag’s preview prunes nothing; what the drag keeps is pruned when it ends', () => {
    hide(building('b2'))
    useApp.getState().preview((p) => ({ ...p, buildings: p.buildings.filter((b) => b.id !== 'b2') }))
    expect(s().dragStart).not.toBeNull()
    expect(view().hidden).toEqual([building('b2')])
    useApp.getState().cancel()
    expect(view().hidden).toEqual([building('b2')])
    useApp.getState().preview((p) => ({ ...p, buildings: p.buildings.filter((b) => b.id !== 'b2') }))
    useApp.getState().commit()
    expect(view().hidden).toEqual([])
  })

  it('it prunes the open project’s entry alone, and the storage keeps the others', () => {
    start(prepared().project, 'other')
    hide(building('b2'), building('b1'))
    start(prepared().project, 'a')
    hide(building('b2'))
    s().apply((p) => actions.removeBuilding(p, 'b2'))
    expect(stored()).toEqual({ other: { hidden: [building('b2'), building('b1')], onTop: [], folded: [] } })
  })

  it('opening a project loads its entry before anything is pruned against it: back and forth loses nothing', () => {
    // keys for objects these projects do not have: only an edit of the open project drops what is gone from it
    hide(building('b9'), drawingLayer('nowhere.dwg', 'X'))
    useApp.getState().open({ ...demoProject(), id: 'b' })
    expect(view().hidden).toEqual([])
    hide(MAP)
    useApp.getState().open({ ...prepared().project, id: 'a' })
    expect(view().hidden).toEqual([building('b9'), drawingLayer('nowhere.dwg', 'X')])
    useApp.getState().open({ ...demoProject(), id: 'b' })
    expect(view().hidden).toEqual([MAP])
    useApp.getState().open({ ...prepared().project, id: 'a' })
    expect(view().hidden).toEqual([building('b9'), drawingLayer('nowhere.dwg', 'X')])
  })

  it('the pseudo-projects write nothing', () => {
    useApp.getState().open({ ...demoProject(), id: BLOCK_EDITOR_ID })
    hide(building('b1'))
    const before = localStorage.getItem(LAYERS_KEY)
    s().apply((p) => ({ ...p, buildings: [...p.buildings] }))
    expect(localStorage.getItem(LAYERS_KEY)).toBe(before)
  })
})

describe('a row picked in Layers for an object that is deleted is let go', () => {
  it('the Annex’s row picked, the Annex deleted: nothing is picked, the others’ rows stay', () => {
    useLayerPick.setState({ keys: ['building:b2', 'streets', 'branch-never'] })
    s().apply((p) => actions.removeBuilding(p, 'b2'))
    expect(useLayerPick.getState().keys).toEqual(['streets', 'branch-never'])
  })

  it('a level, a gate, a lot, a file’s layer: let go with their object', () => {
    const gateId = s().derived.circulation.gates.at(-1)!.id
    const level = s().project.buildings.find((b) => b.id === 'b2')!.levels[0].id
    useLayerPick.setState({ keys: [`gate:${gateId}`, `level:${level}`, 'layer:civil.dwg/A-SITE', 'file:civil.dwg', 'parcels:civil.dwg', 'parcel:civil.dwg/P1', 'drawings', 'buildings'] })
    s().apply((p) => actions.removeGate(p, 'o1', gateId))
    expect(useLayerPick.getState().keys).not.toContain(`gate:${gateId}`)
    s().apply((p) => actions.removeBuilding(p, 'b2'))
    expect(useLayerPick.getState().keys).not.toContain(`level:${level}`)
    s().apply((p) => ({ ...p, site: { ...p.site, drawings: [], parcels: [] } }))
    expect(useLayerPick.getState().keys).toEqual(['drawings', 'buildings'])
  })

  it('a drag’s preview lets nothing go, and another project clears it as it did', () => {
    useLayerPick.setState({ keys: ['building:b2'] })
    useApp.getState().preview((p) => ({ ...p, buildings: p.buildings.filter((b) => b.id !== 'b2') }))
    expect(useLayerPick.getState().keys).toEqual(['building:b2'])
    useApp.getState().cancel()
    useApp.getState().open({ ...demoProject(), id: 'elsewhere' })
    expect(useLayerPick.getState().keys).toEqual([])
  })
})

describe('after a reload', () => {
  const entry = (hidden: string[]) => ({ hidden, onTop: [], folded: [] })

  /** A second copy of the modules, as a reload makes them: it reads what is in storage now. */
  async function reload() {
    vi.resetModules()
    const layerView = await import('../layerView.ts')
    const store = await import('../../../state/store.ts')
    const sample = await import('../../../state/sample.ts')
    return { ...layerView, useApp: store.useApp, sampleProject: sample.sampleProject }
  }

  it('the sample’s entry is kept although the sample is not in the library: hide Streets, reload, open it: still hidden', async () => {
    // the sample is open and not edited, so not kept: it is in no library; another project is the one that opens first
    localStorage.setItem(INDEX_KEY, JSON.stringify([{ id: 'kept', name: 'Kept', typology: 'industrial', savedAt: 1, options: 1 }]))
    localStorage.setItem(LAYERS_KEY, JSON.stringify({ [SAMPLE_ID]: entry([STREETS]), kept: entry([MAP]), gone: entry(['labels']) }))
    const fresh = await reload()
    expect(Object.keys(stored() ?? {}).sort()).toEqual([SAMPLE_ID, 'kept'].sort())
    // main.tsx opens it from the address, after the modules loaded
    fresh.useApp.getState().open(fresh.sampleProject())
    expect(fresh.useLayerView.getState().hidden).toEqual([STREETS])
  })

  it('the sample open at the reload keeps its entry too (it is the open project)', async () => {
    localStorage.setItem(LAYERS_KEY, JSON.stringify({ [SAMPLE_ID]: entry([STREETS]) }))
    const fresh = await reload()
    fresh.useApp.getState().open(sampleProject())
    expect(fresh.useLayerView.getState().hidden).toEqual([STREETS])
    expect(sampleProject().id).toBe(SAMPLE_ID)
  })
})
