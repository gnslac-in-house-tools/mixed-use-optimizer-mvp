// A drawing layer on top of the model (Phase AS.3, task 7): a third toggle on a drawing layer's row, its file's, its parcels' and the
// Drawings row, *On top*, kept per project beside the eyes (`useLayerView.onTop`). On, in the plan the layer is drawn over the masses
// and under the dimensions (DrawingsLayer mounted a second time after the masses; the first mount skips what is on top), and in the
// 3D its lines are drawn through the model (`depthTest` off and a `renderOrder` over the masses'). Picking and snapping do not change
// (nothing of the drawings answers the pointer in the plan, and the 3D lines have no raycast). A hidden layer that is on top is still
// hidden. A file's toggle reads mixed when only some of its layers are on top, as the padlock does; Properties has it for a layer and
// for a file's parcels. The 3D is mounted in react-three-fiber's own reconciler with a stub renderer, as eyes.test.tsx does.
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { createRoot, extend, useThree } from '@react-three/fiber'
import type { ReactNode } from 'react'
import * as THREE from 'three'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../../App.tsx'
import { derive } from '../../../engine/derive.ts'
import type { Contour } from '../../../model/schema.ts'
import { actions } from '../../../state/actions/index.ts'
import { demoProject } from '../../../state/demo.ts'
import { emptyHistory } from '../../../state/history.ts'
import { NO_SELECTION, useApp } from '../../../state/store.ts'
import { useUi } from '../../layout/ui.ts'
import { useDrawingPick } from '../../plan/site/drawingPick.ts'
import { sceneColors } from '../../scene/colors.ts'
import { Ground, ON_TOP_RENDER_ORDER } from '../../scene/Ground.tsx'
import { letGo } from '../../tools/hand.ts'
import { drawingLayer, parcel } from '../keys.ts'
import { LAYERS_KEY, useLayerView } from '../layerView.ts'
import { useLayerPick, pickLayer } from '../layerPick.ts'

vi.mock('../../scene/Scene.tsx', () => ({ Scene: () => <div data-testid="scene" /> }))

const sq = (x: number, s: number): Contour => ({ vertices: [{ x, y: 0, r: 0 }, { x: x + s, y: 0, r: 0 }, { x: x + s, y: s, r: 0 }, { x, y: s, r: 0 }] })
const line = { points: [{ x: 0, y: 0 }, { x: 10, y: 0 }] }

const s = () => useApp.getState()
const WALLS = drawingLayer('a.dxf', 'WALLS')
const TREES = drawingLayer('a.dxf', 'TREES')
const P1 = parcel('P1', 'a.dxf')

/** a.dxf: two layers and a parcel; b.dxf: one layer. */
function start() {
  const d = demoProject()
  const p = {
    ...d,
    site: {
      ...d.site,
      drawings: [
        { file: 'a.dxf', layers: [{ name: 'WALLS', color: 1, lines: [line] }, { name: 'TREES', lines: [line] }] },
        { file: 'b.dxf', layers: [{ name: 'AXES', lines: [line] }] },
      ],
      parcels: [{ name: 'P1', contour: sq(0, 20), file: 'a.dxf' }],
    },
  }
  useApp.setState({ project: p, derived: derive(p, 'o1'), history: emptyHistory(), dragStart: null, selection: NO_SELECTION, level: 'l1', showAll: false, option: 'o1' })
}

const tree = () => screen.getByRole('tree', { name: 'Layers' })
const item = (name: string): HTMLElement => within(tree()).getAllByRole('treeitem', { name })[0]
const unfold = (name: string) => fireEvent.click(within(item(name)).getByRole('button', { name: `Unfold ${name}` }))
const top = (name: string) => within(item(name)).getByRole('button', { name: `On top ${name}` })
const plan = () => screen.getByRole('img', { name: 'Site plan' })

beforeEach(() => {
  localStorage.clear()
  useUi.setState({ view: 'plan', rail: 'layers', panels: { left: true, right: true }, sheet: null, help: false, dialog: null })
  useLayerView.setState({ hidden: [], onTop: [], folded: [] })
  useLayerPick.setState({ keys: [] })
  useDrawingPick.setState({ picked: [] })
  letGo()
  start()
})

describe('the toggle on the rows', () => {
  it('a layer’s toggle is named, titled and pressed as the store says; it is kept per project and goes with a reload', () => {
    render(<App />)
    unfold('Site')
    unfold('Drawings')
    unfold('a.dxf')
    const walls = top('WALLS')
    expect(walls).toHaveAttribute('title', 'On top: drawn over the model')
    expect(walls).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(walls)
    expect(useLayerView.getState().onTop).toEqual([WALLS])
    expect(top('WALLS')).toHaveAttribute('aria-pressed', 'true')
    expect(top('TREES')).toHaveAttribute('aria-pressed', 'false')
    const mine = s().project
    const id = mine.id
    expect((JSON.parse(localStorage.getItem(LAYERS_KEY)!) as Record<string, { onTop: string[] }>)[id].onTop).toEqual([WALLS])
    // another project: it starts with nothing on top; coming back, the first one's stay
    act(() => s().open({ ...demoProject(), id: 'other' }))
    expect(useLayerView.getState().onTop).toEqual([])
    act(() => s().open(mine))
    expect(useLayerView.getState().onTop).toEqual([WALLS])
    fireEvent.click(top('WALLS'))
    expect(useLayerView.getState().onTop).toEqual([])
  })

  it('a file’s toggle acts on all its layers and its parcels, and reads mixed when only some are on top', () => {
    render(<App />)
    unfold('Site')
    unfold('Drawings')
    unfold('a.dxf')
    fireEvent.click(top('a.dxf'))
    expect(new Set(useLayerView.getState().onTop)).toEqual(new Set([WALLS, TREES, P1]))
    expect(top('a.dxf')).toHaveAttribute('aria-pressed', 'true')
    expect(top('WALLS')).toHaveAttribute('aria-pressed', 'true')
    expect(top('Parcels')).toHaveAttribute('aria-pressed', 'true')
    // one layer back: the file is mixed
    fireEvent.click(top('TREES'))
    expect(top('a.dxf')).toHaveAttribute('aria-pressed', 'mixed')
    expect(top('Parcels')).toHaveAttribute('aria-pressed', 'true')
    // a press on a mixed file puts all of it on top; on a file all on top, all off
    fireEvent.click(top('a.dxf'))
    expect(top('a.dxf')).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(top('a.dxf'))
    expect(useLayerView.getState().onTop).toEqual([])
    // the other file is not touched
    expect(top('b.dxf')).toHaveAttribute('aria-pressed', 'false')
  })

  it('what has no drawing to put on top has no toggle: the site’s boundary, a building, the Site branch', () => {
    render(<App />)
    unfold('Site')
    expect(within(item('Boundary')).queryByRole('button', { name: /^On top/ })).toBeNull()
    expect(within(item('Site')).queryByRole('button', { name: /^On top/ })).toBeNull()
    expect(within(item('Buildings')).queryByRole('button', { name: /^On top/ })).toBeNull()
    expect(within(item('Drawings')).getByRole('button', { name: 'On top Drawings' })).toBeInTheDocument()
  })
})

describe('in the plan', () => {
  const group = (top: boolean) => plan().querySelector(top ? '[data-on-top]' : 'g[aria-label="Drawing layers"]:not([data-on-top])')
  const before = (a: Element, b: Element) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)

  it('a layer on top leaves the first mount and stands after the masses and before the dimensions', () => {
    const p0 = demoProject()
    const d = actions.addDimension(p0, { x: 60, y: 60 }, { x: 100, y: 60 }, 8, 'l1')!
    const p = { ...d.project, site: { ...d.project.site, drawings: s().project.site.drawings, parcels: s().project.site.parcels } }
    useApp.setState({ project: p, derived: derive(p, 'o1') })
    render(<App />)
    expect(group(true)).toBeNull()
    expect(group(false)!.querySelector(`[data-drawing-layer="${WALLS}"]`)).not.toBeNull()
    act(() => useLayerView.getState().setOnTop([WALLS], true))
    expect(group(false)!.querySelector(`[data-drawing-layer="${WALLS}"]`)).toBeNull()
    expect(group(false)!.querySelector(`[data-drawing-layer="${TREES}"]`)).not.toBeNull()
    const over = group(true)!
    expect(over.querySelector(`[data-drawing-layer="${WALLS}"]`)).not.toBeNull()
    expect(over.querySelectorAll('[data-drawing-layer]')).toHaveLength(1)
    const masses = [...plan().querySelectorAll('[data-mass]')]
    expect(masses.length).toBeGreaterThan(0)
    expect(masses.every((m) => before(m, over))).toBe(true)
    expect(before(group(false)!, masses[0])).toBe(true)
    const dim = plan().querySelector('[data-dimension]')!
    expect(before(over, dim)).toBe(true)
    // a parcel on top goes with its outline and name
    act(() => useLayerView.getState().setOnTop([P1], true))
    expect(over.querySelector('[data-parcel="P1"]')).not.toBeNull()
    expect(group(false)!.querySelector('[data-parcel="P1"]')).toBeNull()
    // put back
    act(() => useLayerView.getState().setOnTop([WALLS, P1], false))
    expect(group(true)).toBeNull()
    expect(group(false)!.querySelector(`[data-drawing-layer="${WALLS}"]`)).not.toBeNull()
  })

  it('a hidden layer that is on top is still hidden', () => {
    render(<App />)
    act(() => useLayerView.getState().setOnTop([WALLS, TREES], true))
    act(() => useLayerView.getState().setHidden([WALLS], true))
    expect(plan().querySelector(`[data-drawing-layer="${WALLS}"]`)).toBeNull()
    expect(plan().querySelector(`[data-drawing-layer="${TREES}"]`)).not.toBeNull()
    act(() => useLayerView.getState().setHidden([WALLS], false))
    expect(plan().querySelector(`[data-drawing-layer="${WALLS}"]`)).not.toBeNull()
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

const lines = (scene: THREE.Scene, name: string) => {
  const out: THREE.LineSegments[] = []
  scene.traverse((o) => {
    if (o.name === name) out.push(o as THREE.LineSegments)
  })
  return out
}
const material = (l: THREE.LineSegments) => l.material as THREE.Material

describe('in the 3D', () => {
  const ground = () => {
    const d = s().derived
    return <Ground size={400} center={[220, 0, -140]} site={d.site.polygon} buildable={d.site.buildable.flat()} colors={sceneColors()} />
  }

  it('a layer on top is drawn through the model: no depth test and a render order over the masses’; the others are as they were', async () => {
    const scene = await mount3d(ground())
    expect(lines(scene, 'drawing-layer')).toHaveLength(3)
    for (const l of lines(scene, 'drawing-layer')) {
      expect(material(l).depthTest).toBe(true)
      expect(l.renderOrder).toBe(0)
    }
    await act(async () => useLayerView.getState().setOnTop([WALLS], true))
    const all = lines(scene, 'drawing-layer')
    expect(all).toHaveLength(3)
    const over = all.filter((l) => !material(l).depthTest)
    expect(over).toHaveLength(1)
    expect(over[0].renderOrder).toBe(ON_TOP_RENDER_ORDER)
    expect(ON_TOP_RENDER_ORDER).toBeGreaterThan(0)
    expect(all.filter((l) => material(l).depthTest).every((l) => l.renderOrder === 0)).toBe(true)
    // nothing can be picked through the lines
    expect(over[0].raycast).toBeDefined()
    expect(over[0].raycast(new THREE.Raycaster(), [])).toBeNull()
    await act(async () => useLayerView.getState().setOnTop([WALLS], false))
    expect(lines(scene, 'drawing-layer').every((l) => material(l).depthTest && l.renderOrder === 0)).toBe(true)
  })

  it('the parcels on top are their own outline, drawn through the model; a hidden layer on top is not in the scene', async () => {
    const scene = await mount3d(ground())
    expect(lines(scene, 'parcels')).toHaveLength(1)
    expect(lines(scene, 'parcels-on-top')).toHaveLength(0)
    await act(async () => useLayerView.getState().setOnTop([P1], true))
    expect(lines(scene, 'parcels')).toHaveLength(0)
    const over = lines(scene, 'parcels-on-top')
    expect(over).toHaveLength(1)
    expect(material(over[0]).depthTest).toBe(false)
    expect(over[0].renderOrder).toBe(ON_TOP_RENDER_ORDER)
    await act(async () => useLayerView.getState().setOnTop([TREES], true))
    await act(async () => useLayerView.getState().setHidden([TREES, P1], true))
    expect(lines(scene, 'parcels-on-top')).toHaveLength(0)
    expect(lines(scene, 'drawing-layer')).toHaveLength(2)
    expect(lines(scene, 'drawing-layer').some((l) => !material(l).depthTest)).toBe(false)
  })
})

describe('in Properties', () => {
  const properties = () => within(screen.getByRole('complementary', { name: 'Layers and properties' })).getByRole('region', { name: 'Properties' })
  it('a layer picked shows its toggle, and it is the row’s: pressing it puts the layer on top', () => {
    render(<App />)
    unfold('Site')
    unfold('Drawings')
    unfold('a.dxf')
    act(() => pickLayer('layer:a.dxf/WALLS'))
    act(() => useUi.setState({ rail: 'properties' }))
    const props = properties()
    const toggle = within(props).getByRole('button', { name: 'On top WALLS' })
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(toggle)
    expect(useLayerView.getState().onTop).toEqual([WALLS])
    expect(within(props).getByRole('button', { name: 'On top WALLS' })).toHaveAttribute('aria-pressed', 'true')
    // the same in the row, back on the Layers tab
    act(() => useUi.setState({ rail: 'layers' }))
    expect(top('WALLS')).toHaveAttribute('aria-pressed', 'true')
  })

  it('a drawing file picked shows it too: one press puts all its layers and parcels on top, as the file’s row does; mixed reads mixed', () => {
    render(<App />)
    unfold('Site')
    unfold('Drawings')
    act(() => pickLayer('file:a.dxf'))
    act(() => useUi.setState({ rail: 'properties' }))
    const props = properties()
    const toggle = () => within(props).getByRole('button', { name: 'On top a.dxf' })
    expect(toggle()).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(toggle())
    expect(useLayerView.getState().onTop.sort()).toEqual([P1, TREES, WALLS].sort())
    expect(toggle()).toHaveAttribute('aria-pressed', 'true')
    // some of them on top: mixed, and a press puts all there
    act(() => useLayerView.getState().setOnTop([TREES], false))
    expect(toggle()).toHaveAttribute('aria-pressed', 'mixed')
    fireEvent.click(toggle())
    expect(useLayerView.getState().onTop.sort()).toEqual([P1, TREES, WALLS].sort())
    // the same press takes them all back
    fireEvent.click(toggle())
    expect(useLayerView.getState().onTop).toEqual([])
    // the row on the Layers tab says the same
    act(() => useUi.setState({ rail: 'layers' }))
    expect(top('a.dxf')).toHaveAttribute('aria-pressed', 'false')
  })

  it('a file’s parcels picked show it too, for all of them', () => {
    render(<App />)
    unfold('Site')
    unfold('Drawings')
    unfold('a.dxf')
    act(() => pickLayer('parcels:a.dxf'))
    act(() => useUi.setState({ rail: 'properties' }))
    const props = properties()
    fireEvent.click(within(props).getByRole('button', { name: 'On top Parcels' }))
    expect(useLayerView.getState().onTop).toEqual([P1])
  })
})
