// The eyes of what was always drawn (Phase AS.3, task 2): the boundary, the buildable line, the streets, the existing
// roads, the gates, the truck courts, the lots and the street stalls each have a key in the layer store,
// and one object's own for a gate, an existing road and a lot. Hidden, a key means five things: it is not
// drawn in the plan (its layer, its handles, its pills), not drawn in the 3D (its paving, its fixtures, its outline), not
// picked (a click, the selection window), not snapped to, and still counted (the derived result, the figures, read from
// the project, never from this store). A tool that draws one shows its kind again, and what is picked and then hidden is
// let go. The tests set the keys through the store: no control for them is on screen yet (the Layers tree, task 4).
//
// The 3D is rendered in react-three-fiber's own reconciler with a stub renderer (nothing is drawn: there is no WebGL in
// jsdom), and the scene's tree is read for what it holds, as the plan's DOM is for its layers. The parking lots are not in
// the 3D today (the lot's stalls are the plan's alone), so their key has nothing to hide there.
import { act, fireEvent, render, screen } from '@testing-library/react'
import { createRoot, extend, useThree } from '@react-three/fiber'
import type { ReactNode } from 'react'
import * as THREE from 'three'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Id, Point, Project } from '../../../model/schema.ts'
import { App } from '../../../App.tsx'
import { derive } from '../../../engine/derive.ts'
import type { Derived } from '../../../engine/types.ts'
import { actions } from '../../../state/actions/index.ts'
import { addOption } from '../../../state/actions/buildings.ts'
import { demoProject } from '../../../state/demo.ts'
import { emptyHistory } from '../../../state/history.ts'
import { NO_SELECTION, useApp } from '../../../state/store.ts'
import { useLots, addLotNow } from '../../../modules/parking/views/lotState.ts'
import { useCompare } from '../../compare/compareView.ts'
import { useDetail } from '../../detail.ts'
import { useAccess } from '../../plan/access/accessState.ts'
import { placeGate } from '../../plan/access/accessCommands.ts'
import { fit, UNMEASURED_SIZE } from '../../plan/camera.ts'
import { useRoads } from '../../plan/circulation/roadState.ts'
import { addStreet } from '../../plan/circulation/roadCommands.ts'
import { pickedNow, selectBox } from '../../plan/mix.ts'
import { roadSources, sourcesFor } from '../../plan/snap/sources.ts'
import { Ground } from '../../scene/Ground.tsx'
import { Fixtures } from '../../scene/Fixtures.tsx'
import { Paving, pavingOf } from '../../scene/Paving.tsx'
import { sceneColors } from '../../scene/colors.ts'
import { useUi } from '../../layout/ui.ts'
import { letGo, take } from '../../tools/hand.ts'
import {
  BOUNDARY,
  BUILDABLE,
  COURTS,
  EXISTING_ROADS,
  existingRoad,
  gate,
  GATES,
  isObjectHidden,
  lot,
  LOTS,
  STREET_PARKING,
  STREETS,
} from '../keys.ts'
import { hiddenNow, isHidden, useLayerView } from '../layerView.ts'

vi.mock('../../scene/Scene.tsx', () => ({ Scene: () => <div data-testid="scene" /> }))

const s = () => useApp.getState()
const hide = (...keys: string[]) => act(() => useLayerView.getState().setHidden(keys, true))
const show = (...keys: string[]) => act(() => useLayerView.getState().setHidden(keys, false))
const q = (selector: string) => document.querySelectorAll(selector)
const plan = () => screen.getByRole('img', { name: 'Site plan' })

const v = fit({ minX: 0, minY: -15, maxX: 440, maxY: 280 }, UNMEASURED_SIZE)
const at = (p: Point) => ({ clientX: (p.x - v.cx) * v.scale + UNMEASURED_SIZE.w / 2, clientY: UNMEASURED_SIZE.h / 2 - (p.y - v.cy) * v.scale, button: 0, pointerId: 1 })
const WHOLE = { a: { x: -50, y: -50 }, b: { x: 500, y: 350 } }

/** The demo (its south street an existing street) with a second gate, two more existing roads and two free lots: every kind has an object and a sibling. */
function prepared(): { project: Project; ids: { gates: Id[]; existing: Id[]; lots: Id[] } } {
  let p = demoProject()
  const south = p.site.existingRoads![0].id
  p = actions.addGate(p, 'o1', 0.1).project
  const e1 = actions.addExistingRoad(p, [{ x: -60, y: 310 }, { x: 500, y: 310 }], 12)!
  const e2 = actions.addExistingRoad(e1.project, [{ x: -60, y: 340 }, { x: 500, y: 340 }], 12)!
  p = e2.project
  const l1 = actions.addLot(p, 'o1', { rect: { center: { x: 380, y: 230 }, width: 50, depth: 24, rotation: 0 } })!
  const l2 = actions.addLot(l1.project, 'o1', { rect: { center: { x: 260, y: 240 }, width: 50, depth: 24, rotation: 0 } })!
  p = l2.project
  const d = derive(p, 'o1')
  return {
    project: p,
    ids: { gates: d.circulation.gates.map((g) => g.id), existing: [south, e1.id, e2.id], lots: [l1.id, l2.id] },
  }
}

let fixture = prepared()

function start(p: Project = fixture.project) {
  useApp.setState({ project: p, derived: derive(p, 'o1'), history: emptyHistory(), dragStart: null, selection: NO_SELECTION, level: 'l1', showAll: false, option: 'o1' })
  useUi.setState({ view: 'plan', rail: 'layers', panels: { left: true, right: true }, sheet: null, help: false })
}

beforeEach(() => {
  localStorage.clear()
  fixture = prepared()
  useCompare.setState({ open: false, optionIds: [], mode: 'plan', plan: null, camera: null, framing: 0 })
  letGo()
  useRoads.setState({ picked: null, also: [], node: null })
  useLots.setState({ picked: null, also: [] })
  useAccess.setState({ picked: null, alsoGates: [] })
  start()
})

describe('the fixture', () => {
  it('has every kind, and a sibling of every kind that has an object’s key', () => {
    const c = s().derived.circulation
    expect(c.roads.filter((r) => r.kind === 'street').length).toBeGreaterThan(0)
    expect(c.docks.length).toBeGreaterThan(0)
    expect(c.stalls.length).toBeGreaterThan(0)
    expect(c.gates.length).toBeGreaterThan(1)
    expect(c.lots).toHaveLength(2)
    expect(c.roads.filter((r) => r.kind === 'existing')).toHaveLength(3)
    expect(s().derived.site.buildable.length).toBeGreaterThan(0)
  })

  it('the one rule for an object: its kind’s key hides it, its own key hides that one', () => {
    expect(isObjectHidden(new Set([GATES]), 'gate', 'g1')).toBe(true)
    expect(isObjectHidden(new Set([gate('g1')]), 'gate', 'g1')).toBe(true)
    expect(isObjectHidden(new Set([gate('g1')]), 'gate', 'g2')).toBe(false)
    expect(isObjectHidden(new Set([gate('g1')]), 'lot', 'g1')).toBe(false)
    expect(isObjectHidden(new Set([lot('a'), existingRoad('a')]), 'gate', 'a')).toBe(false)
    expect(new Set([GATES, EXISTING_ROADS, LOTS, STREETS, COURTS, STREET_PARKING, BOUNDARY, BUILDABLE, gate('a'), existingRoad('a'), lot('a')]).size).toBe(11)
  })
})

// ---- the plan ---------------------------------------------------------------------------------------------------------

/** Each kind: the key, what the plan draws of it (a selector) and how many of them there are. */
const KINDS: { name: string; key: string; selector: () => string; count: () => number }[] = [
  { name: 'the boundary', key: BOUNDARY, selector: () => '[data-layer="boundary"]', count: () => 1 },
  { name: 'the buildable line', key: BUILDABLE, selector: () => '[data-layer="buildable"]', count: () => 1 },
  { name: 'the streets', key: STREETS, selector: () => '[data-road-kind="street"]', count: () => s().derived.circulation.roads.filter((r) => r.kind === 'street').length },
  { name: 'the gates', key: GATES, selector: () => '[data-gate]', count: () => s().derived.circulation.gates.length },
  { name: 'the existing roads', key: EXISTING_ROADS, selector: () => '[data-existing-road]', count: () => 3 },
  { name: 'the truck courts', key: COURTS, selector: () => '[data-layer="courts"]', count: () => 1 },
  { name: 'the street parking', key: STREET_PARKING, selector: () => '[data-layer="stalls"]', count: () => 1 },
  { name: 'the lots', key: LOTS, selector: () => '[data-lot-shape]', count: () => 2 },
]

describe('in the plan: a hidden key is not drawn, and comes back; the totals do not change', () => {
  for (const kind of KINDS) {
    it(kind.name, () => {
      render(<App />)
      const before = s().derived
      const totals = JSON.stringify(before.circulation.totals)
      expect(q(kind.selector()).length, 'drawn').toBe(kind.count())
      hide(kind.key)
      expect(q(kind.selector()).length, 'hidden').toBe(0)
      // still counted: nothing computed reads the store of what is hidden
      expect(s().derived).toBe(before)
      expect(JSON.stringify(derive(s().project, 'o1').circulation.totals)).toBe(totals)
      show(kind.key)
      expect(q(kind.selector()).length, 'shown again').toBe(kind.count())
    })
  }

  it('the site’s paper stays under a hidden boundary, and the other layers with it', () => {
    render(<App />)
    hide(BOUNDARY, BUILDABLE)
    expect(q('[data-layer="boundary"], [data-layer="buildable"]')).toHaveLength(0)
    expect(q('[data-mass]').length).toBeGreaterThan(0)
    expect(q('[data-gate]').length).toBeGreaterThan(0)
    expect(plan().querySelector('path[fill="var(--panel)"]')).not.toBeNull()
  })

  it('their handles and pills go with them: a picked street’s nodes, a picked lot’s handles, the street parking pills, a mass’s court pills', () => {
    render(<App />)
    const street = s().derived.circulation.roads.find((r) => r.kind === 'street' && r.nodes)!
    act(() => useRoads.getState().pick(street.id))
    expect(q('[data-path-node]').length).toBeGreaterThan(0)
    expect(q('[data-parking-pill]').length).toBeGreaterThan(0)
    hide(STREET_PARKING)
    expect(q('[data-parking-pill]')).toHaveLength(0)
    expect(q('[data-path-node]').length).toBeGreaterThan(0)
    show(STREET_PARKING)
    hide(STREETS)
    expect(q('[data-path-node], [data-path-stretch], [data-path-side]')).toHaveLength(0)
    expect(useRoads.getState().picked).toBeNull()
    act(() => useLots.getState().pick(fixture.ids.lots[0]))
    expect(q('[data-lot-handle]').length).toBeGreaterThan(0)
    expect(q('[data-lot-pill]')).toHaveLength(1)
    hide(LOTS)
    expect(q('[data-lot-handle], [data-lot-pill]')).toHaveLength(0)
    show(LOTS)
    act(() => s().select('m1'))
    expect(q('[data-court-pill]').length).toBeGreaterThan(0)
    hide(COURTS)
    expect(q('[data-court-pill]')).toHaveLength(0)
  })

  it('one object’s own key hides that one and not its siblings', () => {
    render(<App />)
    const { gates, existing, lots } = fixture.ids
    hide(gate(gates[0]))
    expect(q(`[data-gate="${gates[0]}"]`)).toHaveLength(0)
    expect(q(`[data-gate="${gates[1]}"]`)).toHaveLength(1)
    hide(existingRoad(existing[0]))
    expect(q(`[data-existing-road="${existing[0]}"]`)).toHaveLength(0)
    expect(q(`[data-existing-road="${existing[1]}"]`)).toHaveLength(1)
    hide(lot(lots[0]))
    expect(q(`[data-lot-shape="${lots[0]}"]`)).toHaveLength(0)
    expect(q(`[data-lot-shape="${lots[1]}"]`)).toHaveLength(1)
    // the kinds are all still there
    expect(q('[data-gate]').length + q('[data-existing-road]').length + q('[data-lot-shape]').length).toBe(4)
    show(gate(gates[0]), existingRoad(existing[0]), lot(lots[0]))
    expect(q('[data-gate]')).toHaveLength(gates.length)
    expect(q('[data-lot-shape]')).toHaveLength(2)
  })

  it('Compare’s plan draws what the plan does: a hidden key is not in it', () => {
    const o2 = addOption(fixture.project, { buildingIds: ['b1'] })
    start(o2.project)
    useDetail.setState({ detail: 'presentation' })
    render(<App />)
    act(() => useCompare.setState({ open: true, optionIds: ['o1', o2.id], mode: 'plan', plan: null, camera: null, framing: 0 }))
    const one = () => screen.getByRole('img', { name: 'Plan of Option 1' })
    const things = '[data-gate], [data-road-kind="street"], [data-layer="courts"], [data-layer="stalls"], [data-existing-road], [data-layer="buildable"]'
    expect(one().querySelectorAll('[data-gate]').length).toBeGreaterThan(0)
    expect(one().querySelectorAll('[data-existing-road]').length).toBeGreaterThan(0)
    hide(GATES, STREETS, COURTS, STREET_PARKING, EXISTING_ROADS)
    expect(one().querySelectorAll(things)).toHaveLength(0)
    expect(one().querySelectorAll('[data-compare-mass]').length).toBeGreaterThan(0)
    show(GATES)
    expect(one().querySelectorAll('[data-gate]').length).toBeGreaterThan(0)
  })
})

// ---- a click and the window -------------------------------------------------------------------------------------------

describe('not picked: a click where it was picks nothing of it, and the selection window skips it', () => {
  it('a street', () => {
    render(<App />)
    const street = () => document.querySelector<SVGElement>('[data-road-kind="street"]')!
    fireEvent.pointerDown(street(), { button: 0, pointerId: 1 })
    fireEvent.pointerUp(street(), { button: 0, pointerId: 1 })
    expect(useRoads.getState().picked).not.toBeNull()
    act(() => useRoads.getState().pick(null))
    selectBox(WHOLE, false)
    expect(pickedNow().nodes.length).toBeGreaterThan(0)
    act(() => useRoads.getState().pick(null))
    hide(STREETS)
    expect(q('[data-road-kind="street"]')).toHaveLength(0)
    // the press lands on the background, where the street was
    const where = s().derived.circulation.roads.find((r) => r.kind === 'street')!.points[0]
    fireEvent.pointerDown(plan(), at(where))
    fireEvent.pointerUp(plan(), at(where))
    expect(useRoads.getState().picked).toBeNull()
    selectBox(WHOLE, false)
    expect(pickedNow().nodes).toEqual([])
    expect(pickedNow().masses.length).toBeGreaterThan(0)
    show(STREETS)
    selectBox(WHOLE, false)
    expect(pickedNow().nodes.length).toBeGreaterThan(0)
  })

  it('a gate, and one gate by its own key', () => {
    render(<App />)
    const { gates } = fixture.ids
    const handle = (id: Id) => document.querySelector<SVGElement>(`[data-gate="${id}"] [data-handle]`)
    fireEvent.pointerDown(handle(gates[0])!, { button: 0, pointerId: 1 })
    fireEvent.pointerUp(handle(gates[0])!, { button: 0, pointerId: 1 })
    expect(useAccess.getState().picked).toEqual({ kind: 'gate', id: gates[0] })
    act(() => useAccess.getState().pick(null))
    selectBox(WHOLE, false)
    expect(pickedNow().gates.sort()).toEqual([...gates].sort())
    hide(gate(gates[0]))
    expect(handle(gates[0])).toBeNull()
    selectBox(WHOLE, false)
    expect(pickedNow().gates).toEqual(gates.slice(1))
    hide(GATES)
    expect(q('[data-gate]')).toHaveLength(0)
    selectBox(WHOLE, false)
    expect(pickedNow().gates).toEqual([])
    show(GATES, gate(gates[0]))
    selectBox(WHOLE, false)
    expect(pickedNow().gates.sort()).toEqual([...gates].sort())
  })

  it('a lot, and one lot by its own key', () => {
    render(<App />)
    const { lots } = fixture.ids
    const outline = (id: Id) => document.querySelector<SVGElement>(`[data-lot="${id}"]`)
    fireEvent.pointerDown(outline(lots[0])!, { button: 0, pointerId: 1 })
    fireEvent.pointerUp(outline(lots[0])!, { button: 0, pointerId: 1 })
    expect(useLots.getState().picked).toBe(lots[0])
    act(() => useLots.getState().pick(null))
    selectBox(WHOLE, false)
    expect(pickedNow().lots.sort()).toEqual([...lots].sort())
    hide(lot(lots[1]))
    expect(outline(lots[1])).toBeNull()
    selectBox(WHOLE, false)
    expect(pickedNow().lots).toEqual([lots[0]])
    hide(LOTS)
    expect(q('[data-lot]')).toHaveLength(0)
    fireEvent.pointerDown(plan(), at({ x: 380, y: 230 }))
    fireEvent.pointerUp(plan(), at({ x: 380, y: 230 }))
    expect(useLots.getState().picked).toBeNull()
    selectBox(WHOLE, false)
    expect(pickedNow().lots).toEqual([])
    show(LOTS, lot(lots[1]))
    selectBox(WHOLE, false)
    expect(pickedNow().lots.sort()).toEqual([...lots].sort())
  })

  it('an existing road (picked by its hit stroke in the roads layer, Phase PE.2), by kind and by its own key', () => {
    render(<App />)
    const { existing } = fixture.ids
    const hit = (id: Id) => document.querySelector<SVGElement>(`[data-existing-road="${id}"] [data-road-kind="existing"]`)!
    fireEvent.pointerDown(hit(existing[0]), at({ x: 100, y: 310 }))
    fireEvent.pointerUp(hit(existing[0]), at({ x: 100, y: 310 }))
    expect(useAccess.getState().picked).toEqual({ kind: 'existing', id: existing[0] })
    act(() => useAccess.getState().pick(null))
    hide(existingRoad(existing[0]))
    expect(q(`[data-existing-road="${existing[0]}"]`)).toHaveLength(0)
    expect(q(`[data-existing-road="${existing[1]}"]`)).toHaveLength(1)
    hide(EXISTING_ROADS)
    expect(q('[data-existing-road]')).toHaveLength(0)
    expect(useAccess.getState().picked).toBeNull()
  })

  it('what is picked and then hidden is let go: a street, a gate, a lot, an existing road (the dimensions’: hiddenReaders.test.tsx)', () => {
    render(<App />)
    const { gates, lots, existing } = fixture.ids
    const street = s().derived.circulation.roads.find((r) => r.kind === 'street')!
    act(() => useRoads.getState().pick(street.id))
    expect(useRoads.getState().picked).toBe(street.id)
    hide(BOUNDARY)
    expect(useRoads.getState().picked).toBe(street.id)
    hide(STREETS)
    expect(useRoads.getState().picked).toBeNull()
    show(STREETS)

    act(() => useAccess.getState().pick({ kind: 'gate', id: gates[0] }))
    act(() => useAccess.getState().toggleGate(gates[1]))
    hide(gate(gates[0]))
    expect(useAccess.getState().picked).toEqual({ kind: 'gate', id: gates[1] })
    expect(useAccess.getState().alsoGates).toEqual([])
    hide(GATES)
    expect(useAccess.getState().picked).toBeNull()
    show(GATES, gate(gates[0]))

    act(() => useLots.getState().pick(lots[0]))
    act(() => useLots.getState().toggle(lots[1]))
    hide(lot(lots[0]))
    expect(useLots.getState().picked).toBe(lots[1])
    hide(LOTS)
    expect(useLots.getState().picked).toBeNull()
    show(LOTS, lot(lots[0]))

    act(() => useAccess.getState().pick({ kind: 'existing', id: existing[0] }))
    hide(existingRoad(existing[1]))
    expect(useAccess.getState().picked).not.toBeNull()
    hide(EXISTING_ROADS)
    expect(useAccess.getState().picked).toBeNull()
  })

  it('a picked mass is not let go by a layer hidden (only what is picked and hidden goes)', () => {
    render(<App />)
    act(() => s().select('m1'))
    hide(STREETS, GATES, LOTS, COURTS)
    expect(s().selection.massIds).toEqual(['m1'])
  })
})

// ---- the snap ---------------------------------------------------------------------------------------------------------

const labels = (sources: { label: string }[]) => sources.map((x) => x.label)

describe('not snapped to', () => {
  it('the boundary and the buildable line, the truck courts and the lots', () => {
    const { project } = fixture
    const d = s().derived
    const all = labels(sourcesFor(project, d))
    expect(all).toContain('site')
    expect(all).toContain('setback')
    expect(all).toContain('truck court')
    expect(all).toContain(d.circulation.lots[0].name)
    hide(BOUNDARY)
    expect(labels(sourcesFor(project, d))).not.toContain('site')
    expect(labels(sourcesFor(project, d))).toContain('setback')
    hide(BUILDABLE)
    expect(labels(sourcesFor(project, d))).not.toContain('setback')
    hide(COURTS)
    expect(labels(sourcesFor(project, d))).not.toContain('truck court')
    hide(lot(fixture.ids.lots[0]))
    expect(labels(sourcesFor(project, d))).not.toContain(d.circulation.lots[0].name)
    expect(labels(sourcesFor(project, d))).toContain(d.circulation.lots[1].name)
    hide(LOTS)
    expect(labels(sourcesFor(project, d)).filter((l) => d.circulation.lots.some((x) => x.name === l))).toEqual([])
    show(BOUNDARY, BUILDABLE, COURTS, LOTS, lot(fixture.ids.lots[0]))
    expect(labels(sourcesFor(project, d))).toEqual(all)
  })

  it('the streets, the existing roads, the gates and the lots’ entrances (the roads’ sources)', () => {
    const d = s().derived
    const all = labels(roadSources(d))
    for (const l of ['street', 'street edge', 'street node', 'existing road', 'existing road edge', 'gate']) expect(all, l).toContain(l)
    expect(all.some((l) => l.endsWith(' entrance'))).toBe(true)
    hide(STREETS)
    const noStreets = labels(roadSources(d))
    expect(noStreets).not.toContain('street')
    expect(noStreets).not.toContain('street edge')
    expect(noStreets).not.toContain('street node')
    expect(noStreets).toContain('existing road')
    show(STREETS)
    hide(existingRoad(fixture.ids.existing[0]))
    expect(labels(roadSources(d)).filter((l) => l === 'existing road')).toHaveLength(2)
    hide(EXISTING_ROADS)
    expect(labels(roadSources(d)).filter((l) => l.startsWith('existing road'))).toEqual([])
    hide(gate(fixture.ids.gates[0]))
    expect(labels(roadSources(d)).filter((l) => l === 'gate')).toHaveLength(fixture.ids.gates.length - 1)
    hide(GATES)
    expect(labels(roadSources(d))).not.toContain('gate')
    hide(lot(fixture.ids.lots[0]))
    expect(labels(roadSources(d)).filter((l) => l.endsWith(' entrance'))).toHaveLength(1)
    hide(LOTS)
    expect(labels(roadSources(d)).some((l) => l.endsWith(' entrance'))).toBe(false)
    show(STREETS, EXISTING_ROADS, GATES, LOTS, existingRoad(fixture.ids.existing[0]), gate(fixture.ids.gates[0]), lot(fixture.ids.lots[0]))
    expect(labels(roadSources(d))).toEqual(all)
  })
})

// ---- the 3D -----------------------------------------------------------------------------------------------------------

extend(THREE as never)
const mounted: { unmount(): void }[] = []
let sceneOf: THREE.Scene | null = null
function Grab() {
  sceneOf = useThree((st) => st.scene)
  return null
}

/** Mounts a piece of the scene in react-three-fiber's reconciler (a stub renderer: nothing is drawn), as the Canvas does. */
async function mount3d(ui: ReactNode): Promise<THREE.Scene> {
  const canvas = document.createElement('canvas')
  const root = createRoot(canvas)
  const gl = {
    render() {},
    setPixelRatio() {},
    setSize() {},
    shadowMap: {},
    xr: { enabled: false, addEventListener() {}, removeEventListener() {} },
    dispose() {},
    domElement: canvas,
    capabilities: {},
    info: {},
    setClearColor() {},
    getPixelRatio: () => 1,
    getSize: () => ({ x: 1, y: 1 }),
    forceContextLoss() {},
    setAnimationLoop() {},
    getContext: () => ({}),
  }
  await act(async () => {
    await root.configure({ gl: gl as never, frameloop: 'never', size: { width: 100, height: 100, top: 0, left: 0 } } as never)
  })
  await act(async () => {
    root.render(
      <>
        <Grab />
        {ui}
      </>,
    )
  })
  mounted.push({ unmount: () => root.unmount() })
  return sceneOf!
}

afterEach(() => {
  for (const m of mounted.splice(0)) m.unmount()
})

const named = (scene: THREE.Scene, name: string) => {
  const out: THREE.Object3D[] = []
  scene.traverse((o) => {
    if (o.name === name) out.push(o)
  })
  return out
}
const vertices = (scene: THREE.Scene, name: string) => named(scene, name).reduce((n, o) => n + ((o as THREE.Mesh).geometry?.getAttribute('position')?.count ?? 0), 0)

/** What the paving holds, by layer, in vertices: a hidden kind leaves its own out. */
const paving = (d: Derived) => <Paving circulation={d.circulation} masses={d.masses} colors={sceneColors()} />

describe('in the 3D: a hidden key is not in the scene', () => {
  it('the boundary and the buildable line', async () => {
    const d = s().derived
    const ground = () => <Ground size={400} center={[220, 0, -140]} site={d.site.polygon} buildable={d.site.buildable.flat()} colors={sceneColors()} />
    const scene = await mount3d(ground())
    expect(named(scene, 'boundary')).toHaveLength(1)
    expect(named(scene, 'buildable')).toHaveLength(1)
    await act(async () => hide(BOUNDARY))
    expect(named(scene, 'boundary')).toHaveLength(0)
    expect(named(scene, 'buildable')).toHaveLength(1)
    await act(async () => hide(BUILDABLE))
    expect(named(scene, 'buildable')).toHaveLength(0)
    await act(async () => show(BOUNDARY, BUILDABLE))
    expect(named(scene, 'boundary')).toHaveLength(1)
    expect(named(scene, 'buildable')).toHaveLength(1)
  })

  it('the paving: the streets, the existing roads, the courts and the stalls, each apart', async () => {
    const d = s().derived
    const scene = await mount3d(paving(d))
    const roads = vertices(scene, 'roads')
    const courts = vertices(scene, 'courts')
    const stalls = vertices(scene, 'stalls')
    expect(roads).toBeGreaterThan(0)
    expect(courts).toBeGreaterThan(0)
    expect(stalls).toBeGreaterThan(0)
    const roadsWithout = async (...keys: string[]) => {
      await act(async () => hide(...keys))
      const n = vertices(scene, 'roads')
      await act(async () => show(...keys))
      expect(vertices(scene, 'roads')).toBe(roads)
      return n
    }
    const noStreets = await roadsWithout(STREETS)
    const noExisting = await roadsWithout(EXISTING_ROADS)
    expect(noStreets).toBeLessThan(roads)
    expect(noExisting).toBeLessThan(roads)
    // one existing road's own key takes less than the kind's
    expect(await roadsWithout(existingRoad(fixture.ids.existing[0]))).toBeLessThan(roads)
    expect(await roadsWithout(existingRoad(fixture.ids.existing[0]))).toBeGreaterThan(noExisting)
    // everything that paves is hidden at once: the layer is gone
    await act(async () => hide(STREETS, EXISTING_ROADS))
    expect(named(scene, 'roads')).toHaveLength(0)
    await act(async () => show(STREETS, EXISTING_ROADS))
    expect(vertices(scene, 'roads')).toBe(roads)
    await act(async () => hide(COURTS))
    expect(named(scene, 'courts')).toHaveLength(0)
    expect(vertices(scene, 'roads')).toBe(roads)
    expect(vertices(scene, 'stalls')).toBe(stalls)
    await act(async () => show(COURTS))
    expect(vertices(scene, 'courts')).toBe(courts)
    await act(async () => hide(STREET_PARKING))
    expect(named(scene, 'stalls')).toHaveLength(0)
    expect(vertices(scene, 'courts')).toBe(courts)
    await act(async () => show(STREET_PARKING))
    expect(vertices(scene, 'stalls')).toBe(stalls)
  })

  it('the paving as a pure function: the same cut, and nothing hidden leaves it as it was', () => {
    const c = s().derived.circulation
    expect(pavingOf(c, new Set())).toEqual(pavingOf(c))
    expect(pavingOf(c, new Set([COURTS])).courts).toEqual([])
    expect(pavingOf(c, new Set([STREET_PARKING])).stalls).toEqual([])
    expect(pavingOf(c, new Set([STREETS, EXISTING_ROADS])).byHand).toEqual([])
    expect(hiddenNow().size).toBe(0)
  })

  it('the gates: all of them, and one by its own key', async () => {
    const d = s().derived
    const scene = await mount3d(<Fixtures circulation={d.circulation} masses={d.masses} colors={sceneColors()} />)
    const { gates } = fixture.ids
    expect(named(scene, 'gates')[0].children).toHaveLength(gates.length)
    await act(async () => hide(gate(gates[0])))
    expect(named(scene, `gate:${gates[0]}`)).toHaveLength(0)
    expect(named(scene, 'gates')[0].children).toHaveLength(gates.length - 1)
    await act(async () => hide(GATES))
    expect(named(scene, 'gates')[0].children).toHaveLength(0)
    // the dock doors are not the gates'
    expect(named(scene, 'dock-doors').length).toBeGreaterThan(0)
    await act(async () => show(GATES, gate(gates[0])))
    expect(named(scene, 'gates')[0].children).toHaveLength(gates.length)
  })
})

// ---- a tool that draws one shows its kind -----------------------------------------------------------------------------

describe('a tool that draws one shows its kind again', () => {
  it('taking the tool shows what it draws: Street, Gate, Existing road, Lot', () => {
    for (const [tool, key] of [
      ['street', STREETS],
      ['gate', GATES],
      ['existing', EXISTING_ROADS],
      ['lot', LOTS],
    ] as const) {
      hide(key, BOUNDARY)
      take(tool)
      expect(isHidden(key), tool).toBe(false)
      // only the kind it draws
      expect(isHidden(BOUNDARY), tool).toBe(true)
      letGo()
      show(BOUNDARY)
    }
  })

  it('a street finished while Streets is hidden shows the streets, picked', () => {
    render(<App />)
    take('street')
    hide(STREETS)
    const count = q('[data-road-kind="street"]').length
    expect(count).toBe(0)
    let made = false
    act(() => {
      made = addStreet([{ x: 20, y: 40 }, { x: 80, y: 40 }], 10)
    })
    expect(made).toBe(true)
    expect(isHidden(STREETS)).toBe(false)
    expect(q('[data-road-kind="street"]').length).toBeGreaterThan(0)
    expect(useRoads.getState().picked).not.toBeNull()
  })

  it('a gate placed while Gates is hidden shows the gates', () => {
    render(<App />)
    hide(GATES)
    expect(q('[data-gate]')).toHaveLength(0)
    let id = ''
    act(() => {
      id = placeGate(0.2)
    })
    expect(isHidden(GATES)).toBe(false)
    expect(q(`[data-gate="${id}"]`)).toHaveLength(1)
  })

  it('a lot drawn while Lots is hidden shows the lots', () => {
    render(<App />)
    hide(LOTS)
    expect(q('[data-lot-shape]')).toHaveLength(0)
    let made = false
    act(() => {
      made = addLotNow({ rect: { center: { x: 60, y: 255 }, width: 40, depth: 20, rotation: 0 } })
    })
    expect(made).toBe(true)
    expect(isHidden(LOTS)).toBe(false)
    expect(q('[data-lot-shape]')).toHaveLength(3)
  })
})
