// The review of the eyes (Phase AS.3, fixes after task 8): what a hidden building takes with it, what is dropped when its
// object is gone, and what a window or a group brings back. One test file for the findings that need the plan, the 3D or the
// store together:
//   - a hidden building hides whole: its truck courts and dock ticks on the plan, its dock doors, court paving, block fixtures
//     and graph bubbles in the 3D, its courts as snap sources; the building the plan is on stays drawn on the plan (not in
//     the 3D); the figures do not change
//   - a window or a click on a group that spans buildings leaves out the members the plan does not draw
//   - the graph's bubbles follow the masses on the plan; with the plan showing all levels, the active building stays drawn
//   - what is hidden, on top or folded for an object that is gone (the id comes back: *New building* is b2 again) is dropped,
//     where the project is, and a row picked in Layers for it is let go
// The 3D is rendered in react-three-fiber's reconciler with a stub renderer, as eyes.test.tsx does.
import { act, render } from '@testing-library/react'
import { createRoot, extend, useThree } from '@react-three/fiber'
import type { ReactNode } from 'react'
import * as THREE from 'three'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../../App.tsx'
import { derive } from '../../../engine/derive.ts'
import type { Id, Project } from '../../../model/schema.ts'
import { actions } from '../../../state/actions/index.ts'
import { demoProject } from '../../../state/demo.ts'
import { emptyHistory } from '../../../state/history.ts'
import { NO_SELECTION, useApp } from '../../../state/store.ts'
import { sampleProject } from '../../../state/sample.ts'
import { putCopyElements } from '../../../modules/warehouse/actions.ts'
import { copyGenerated, copyOnPlan } from '../../../modules/warehouse/engine/copies.ts'
import { bayModules } from '../../../modules/warehouse/engine/dockRule.ts'
import { BlockFixtures3D } from '../../../modules/warehouse/views/BlockFixtures3D.tsx'
import { useGraph } from '../../graph/graphState.ts'
import { useUi } from '../../layout/ui.ts'
import { groupSelection, pickOnPlan } from '../../plan/massCommands.ts'
import { pickedNow, selectBox } from '../../plan/mix.ts'
import { sourcesFor } from '../../plan/snap/sources.ts'
import { letGo } from '../../tools/hand.ts'
import { Fixtures } from '../../scene/Fixtures.tsx'
import { Graph3D } from '../../scene/Graph3D.tsx'
import { Paving } from '../../scene/Paving.tsx'
import { sceneColors } from '../../scene/colors.ts'
import { building, COURTS } from '../keys.ts'
import { useLayerView } from '../layerView.ts'
import { useLayerPick } from '../layerPick.ts'

vi.mock('../../scene/Scene.tsx', () => ({ Scene: () => <div data-testid="scene" /> }))

const s = () => useApp.getState()
const q = (selector: string) => document.querySelectorAll(selector)
const hide = (...keys: string[]) => act(() => useLayerView.getState().setHidden(keys, true))
const show = (...keys: string[]) => act(() => useLayerView.getState().setHidden(keys, false))

interface Fixture {
  project: Project
  annex: Id
  annexMass: Id
  annexLevel: Id
}

/** The demo (b1: m1, m2, m3 on l1, warehouse docks) with an Annex, a second building with a warehouse mass of its own. */
function prepared(): Fixture {
  const added = actions.addBuilding(demoProject(), { optionId: 'o1', name: 'Annex' })
  const p = actions.addMass(added.project, {
    programId: 'warehouse',
    footprint: { kind: 'rect', center: { x: 330, y: 215 }, width: 30, depth: 20, rotation: 0 },
    levelId: added.levelId,
  }).project
  return { project: p, annex: added.id, annexMass: p.masses.at(-1)!.id, annexLevel: added.levelId }
}

let fx = prepared()

function start(p: Project = fx.project) {
  useApp.setState({ project: p, derived: derive(p, 'o1'), history: emptyHistory(), dragStart: null, selection: NO_SELECTION, level: 'l1', showAll: false, option: 'o1' })
  useUi.setState({ view: 'plan', rail: 'layers', panels: { left: true, right: true }, sheet: null, help: false, dialog: null })
}

beforeEach(() => {
  localStorage.clear()
  fx = prepared()
  useLayerView.setState({ hidden: [], onTop: [], folded: [] })
  useLayerPick.setState({ keys: [] })
  useGraph.setState({ graph: false, rule: null, relation: null })
  letGo()
  start()
})

const docksOf = (mass: Id) => s().derived.circulation.docks.filter((d) => d.massId === mass)

describe('the fixture', () => {
  it('has docks and courts on both buildings, so a hidden one can be told from the other', () => {
    expect(docksOf('m1').length).toBeGreaterThan(0)
    expect(docksOf(fx.annexMass).length).toBeGreaterThan(0)
  })
})

// ---- the plan ---------------------------------------------------------------------------------------------------------

describe('on the plan: a hidden building hides its truck courts and its dock ticks', () => {
  it('the Annex hidden: its court and its docks are not drawn, the active building’s are; shown again, they come back', () => {
    render(<App />)
    const a = docksOf(fx.annexMass)[0]
    expect(q(`[data-court="${a.massId}:${a.wall}"]`)).toHaveLength(1)
    expect(q(`[data-dock="${a.massId}:${a.wall}"]`)).toHaveLength(1)
    const mine = docksOf('m1')[0]
    hide(building(fx.annex))
    expect(q(`[data-court="${a.massId}:${a.wall}"]`)).toHaveLength(0)
    expect(q(`[data-dock="${a.massId}:${a.wall}"]`)).toHaveLength(0)
    expect(q(`[data-court="${mine.massId}:${mine.wall}"]`)).toHaveLength(1)
    expect(q(`[data-dock="${mine.massId}:${mine.wall}"]`)).toHaveLength(1)
    // what the project holds is the same
    expect(docksOf(fx.annexMass).length).toBeGreaterThan(0)
    show(building(fx.annex))
    expect(q(`[data-court="${a.massId}:${a.wall}"]`)).toHaveLength(1)
  })

  it('the building the plan is on stays drawn on the plan, courts and docks too, when its eye is off', () => {
    render(<App />)
    const mine = docksOf('m1')[0]
    hide(building('b1'))
    expect(q('[data-mass="m1"]').length).toBeGreaterThan(0)
    expect(q(`[data-court="${mine.massId}:${mine.wall}"]`)).toHaveLength(1)
    expect(q(`[data-dock="${mine.massId}:${mine.wall}"]`)).toHaveLength(1)
  })
})

describe('as a snap source: a hidden building’s courts do not attract', () => {
  const courts = (p: Project, d: ReturnType<typeof derive>) => sourcesFor(p, d, null, { level: 'l1', reference: [] }).filter((x) => x.label === 'truck court').length

  it('the Annex hidden: its courts leave the sources; the active building’s stay; the project’s courts do not change', () => {
    const d = s().derived
    const all = courts(fx.project, d)
    const annexCourts = d.circulation.docks.filter((k) => k.massId === fx.annexMass && k.court.length >= 3).length
    expect(annexCourts).toBeGreaterThan(0)
    hide(building(fx.annex))
    expect(courts(fx.project, d)).toBe(all - annexCourts)
    expect(d.circulation.docks.filter((k) => k.massId === fx.annexMass)).toHaveLength(docksOf(fx.annexMass).length)
    show(building(fx.annex))
    expect(courts(fx.project, d)).toBe(all)
  })

  it('the building the plan is on keeps its courts as sources when its eye is off', () => {
    const d = s().derived
    const all = courts(fx.project, d)
    hide(building('b1'))
    // the plan is on b1: its courts stay (the Annex's would go, and it is shown)
    expect(courts(fx.project, d)).toBe(all)
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
const instances = (scene: THREE.Scene, name: string) => named(scene, name).reduce((n, o) => n + ((o as THREE.InstancedMesh).count ?? 0), 0)

describe('in the 3D: a hidden building hides its dock doors, its court paving, its block fixtures and its graph bubbles', () => {
  it('the dock doors: the Annex’s leave with its eye, and come back', async () => {
    const d = s().derived
    const scene = await mount3d(<Fixtures circulation={d.circulation} masses={d.masses} colors={sceneColors()} />)
    const doors = instances(scene, 'dock-doors')
    const annexDoors = docksOf(fx.annexMass).reduce((n, k) => n + k.doors.length, 0)
    expect(annexDoors).toBeGreaterThan(0)
    expect(doors).toBeGreaterThan(annexDoors)
    await act(async () => hide(building(fx.annex)))
    expect(instances(scene, 'dock-doors')).toBe(doors - annexDoors)
    // the 3D has no exception: the building the plan is on is hidden there too
    await act(async () => hide(building('b1')))
    expect(named(scene, 'dock-doors')).toHaveLength(0)
    await act(async () => show(building(fx.annex), building('b1')))
    expect(instances(scene, 'dock-doors')).toBe(doors)
  })

  it('the court paving: the Annex’s court leaves with its eye; Truck courts hides them all', async () => {
    const d = s().derived
    const scene = await mount3d(<Paving circulation={d.circulation} masses={d.masses} colors={sceneColors()} />)
    const courts = vertices(scene, 'courts')
    expect(courts).toBeGreaterThan(0)
    await act(async () => hide(building(fx.annex)))
    expect(vertices(scene, 'courts')).toBeLessThan(courts)
    expect(vertices(scene, 'courts')).toBeGreaterThan(0)
    const noAnnex = vertices(scene, 'courts')
    await act(async () => hide(building('b1')))
    expect(vertices(scene, 'courts')).toBeLessThan(noAnnex)
    await act(async () => show(building(fx.annex), building('b1')))
    expect(vertices(scene, 'courts')).toBe(courts)
    await act(async () => hide(COURTS))
    expect(named(scene, 'courts')).toHaveLength(0)
  })

  it('a placed block’s doors and patterns follow its building’s eye', async () => {
    let p = sampleProject()
    const option = p.options.find((o) => p.buildings.some((b) => o.buildingIds.includes(b.id) && b.warehouse))!
    const b = p.buildings.find((x) => option.buildingIds.includes(x.id) && x.warehouse)!
    const t = p.warehouseTypes!.find((x) => x.id === b.warehouse!.type)!
    const levels = new Set(b.levels.map((l) => l.id))
    const hall = p.masses.find((m) => m.part === 'hall' && levels.has(m.levelId))!
    const g = copyGenerated(t, copyOnPlan(t, b.warehouse!, hall.footprint))
    const e = g.edges.find((x) => !g.doors.some((dd) => dd.edge === x.id) && bayModules(g.runs, x, 0).length > 1)!
    const [k0, k1] = bayModules(g.runs, e, 0)
    p = putCopyElements(p, b.id, 'door', e.id, [k0], true)
    p = putCopyElements(p, b.id, 'pattern', e.id, [k1], true)
    useApp.setState({ project: p, derived: derive(p, option.id), history: emptyHistory(), selection: NO_SELECTION, option: option.id, level: b.levels[0].id })
    const d = s().derived
    const scene = await mount3d(<BlockFixtures3D masses={d.masses} colors={sceneColors()} />)
    expect(named(scene, 'level-door').length).toBeGreaterThan(0)
    expect(named(scene, 'pattern-post').length).toBeGreaterThan(0)
    await act(async () => hide(building(b.id)))
    expect(named(scene, 'level-door')).toHaveLength(0)
    expect(named(scene, 'pattern-post')).toHaveLength(0)
    await act(async () => show(building(b.id)))
    expect(named(scene, 'level-door').length).toBeGreaterThan(0)
  })

  it('the graph’s bubbles: a hidden building’s masses have none', async () => {
    const scene = await mount3d(<Graph3D colors={sceneColors()} />)
    const bubbles = () => named(scene, '').filter((o) => (o.userData as { massId?: string }).massId !== undefined).map((o) => (o.userData as { massId: string }).massId)
    expect(bubbles()).toContain(fx.annexMass)
    await act(async () => hide(building(fx.annex)))
    expect(bubbles()).not.toContain(fx.annexMass)
    expect(bubbles()).toContain('m1')
    await act(async () => show(building(fx.annex)))
    expect(bubbles()).toContain(fx.annexMass)
  })
})

// ---- the pick ---------------------------------------------------------------------------------------------------------

describe('a group that spans buildings: its hidden members are left out', () => {
  const grouped = () => {
    const g = actions.groupMasses(fx.project, ['m1', fx.annexMass])!
    start(g.project)
  }
  const m1Box = { a: { x: 30, y: 60 }, b: { x: 210, y: 160 } }

  it('a window round m1 alone does not bring the hidden Annex’s mass back through the group', () => {
    grouped()
    const d = s().derived.masses
    expect(d.m1.polygon.length).toBeGreaterThan(2)
    // the window round the Annex's mass alone is not the case: the box takes m1 only
    const inBox = (id: Id) => d[id].polygon.every((v) => v.x >= m1Box.a.x && v.x <= m1Box.b.x && v.y >= m1Box.a.y && v.y <= m1Box.b.y)
    expect(inBox('m1')).toBe(true)
    expect(inBox(fx.annexMass)).toBe(false)
    hide(building(fx.annex))
    act(() => selectBox(m1Box, false))
    expect(s().selection.massIds).not.toContain(fx.annexMass)
    expect(s().selection.massIds).toContain('m1')
    expect(pickedNow().masses).not.toContain(fx.annexMass)
    // shown, the group comes whole, as it did
    show(building(fx.annex))
    act(() => selectBox(m1Box, false))
    expect(s().selection.massIds).toEqual(expect.arrayContaining(['m1', fx.annexMass]))
  })

  it('a click on m1 picks it without the hidden member', () => {
    grouped()
    hide(building(fx.annex))
    act(() => {
      pickOnPlan('m1')
    })
    expect(s().selection.massIds).toEqual(['m1'])
    show(building(fx.annex))
    act(() => {
      pickOnPlan('m1')
    })
    expect(s().selection.massIds).toEqual(expect.arrayContaining(['m1', fx.annexMass]))
  })

  it('Shift+click on m1 does not add the hidden member either', () => {
    grouped()
    hide(building(fx.annex))
    act(() => {
      pickOnPlan('m1', true)
    })
    expect(s().selection.massIds).toEqual(['m1'])
  })

  it('Group (Ctrl+G): the groups the picked masses were in join, all of them stay picked but the member the plan does not draw', () => {
    // m2 is in a group with the Annex's mass; m1 and m2 are grouped now: the Annex's mass joins the group too
    const earlier = actions.groupMasses(fx.project, ['m2', fx.annexMass])!
    start(earlier.project)
    hide(building(fx.annex))
    act(() => s().selectMany(['m1', 'm2']))
    act(() => void groupSelection())
    const group = s().project.masses.find((m) => m.id === 'm1')!.group
    expect(group).toBeDefined()
    expect(s().project.masses.filter((m) => m.group === group).map((m) => m.id).sort()).toEqual(['m1', 'm2', fx.annexMass].sort())
    // the hidden member is in the group, and is not picked
    expect(s().selection.massIds.sort()).toEqual(['m1', 'm2'])
    expect(s().selection.massIds).not.toContain(fx.annexMass)
  })

  it('Group with every building shown picks the whole group', () => {
    const earlier = actions.groupMasses(fx.project, ['m2', fx.annexMass])!
    start(earlier.project)
    act(() => s().selectMany(['m1', 'm2']))
    act(() => void groupSelection())
    expect(s().selection.massIds.sort()).toEqual(['m1', 'm2', fx.annexMass].sort())
  })
})

// ---- the graph and the levels -----------------------------------------------------------------------------------------

describe('what the plan draws of the building it is on', () => {
  it('the graph’s bubbles follow the masses: hiding the active building leaves its bubbles, as its masses', () => {
    useGraph.setState({ graph: true })
    render(<App />)
    expect(q('[data-graph-bubble="m1"]')).toHaveLength(1)
    hide(building('b1'))
    expect(q('[data-mass="m1"]').length).toBeGreaterThan(0)
    expect(q('[data-graph-bubble="m1"]')).toHaveLength(1)
  })

  it('with all levels shown, the active building stays drawn when its eye is off; the Annex’s goes', () => {
    act(() => useApp.getState().setShowAll(true))
    render(<App />)
    expect(q('[data-all-mass="m1"]')).toHaveLength(1)
    expect(q(`[data-all-mass="${fx.annexMass}"]`)).toHaveLength(1)
    hide(building('b1'), building(fx.annex))
    expect(q('[data-all-mass="m1"]')).toHaveLength(1)
    expect(q(`[data-all-mass="${fx.annexMass}"]`)).toHaveLength(0)
  })
})
