// The reference lines in the 3D (Phase AS.5 task 2, Decision "Reference lines"): drawn on the ground as a drawing's lines are, dashed, in the guide's colour; the ones *On top*
// (`reference-lines` in the layer store) through the model (no depth test, a render order over the masses'); a hidden one, its own or the kind's, is not in the scene; none can be
// picked there (no raycast). Mounted in react-three-fiber's own reconciler with a stub renderer, as the *On top* tests do.
import { act } from '@testing-library/react'
import { createRoot, extend, useThree } from '@react-three/fiber'
import type { ReactNode } from 'react'
import * as THREE from 'three'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { derive } from '../../../engine/derive.ts'
import { actions } from '../../../state/actions/index.ts'
import { demoProject } from '../../../state/demo.ts'
import { emptyHistory } from '../../../state/history.ts'
import { NO_SELECTION, useApp } from '../../../state/store.ts'
import { REFERENCE_LINES, referenceLine } from '../../layers/keys.ts'
import { useLayerView } from '../../layers/layerView.ts'
import { sceneColors } from '../colors.ts'
import { Ground, ON_TOP_RENDER_ORDER } from '../Ground.tsx'

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
const positions = (l: THREE.LineSegments) => Array.from((l.geometry.getAttribute('position') as THREE.BufferAttribute).array)

beforeEach(() => {
  localStorage.clear()
  useLayerView.setState({ hidden: [], onTop: [], folded: [] })
  let p = demoProject()
  p = actions.addReferenceLine(p, [{ x: 10, y: 20 }, { x: 30, y: 20 }, { x: 30, y: 40 }])!.project
  p = actions.addReferenceLine(p, [{ x: 100, y: 100 }, { x: 140, y: 100 }])!.project
  useApp.setState({ project: p, derived: derive(p, 'o1'), history: emptyHistory(), dragStart: null, selection: NO_SELECTION, level: 'l1', showAll: false, option: 'o1' })
})

const ground = () => {
  const d = useApp.getState().derived
  return <Ground size={400} center={[220, 0, -140]} site={d.site.polygon} buildable={d.site.buildable.flat()} colors={sceneColors()} />
}

describe('the lines in the scene', () => {
  it('are on the ground, one piece per stretch (x, a hair above the ground, −y), dashed, with no raycast', async () => {
    const scene = await mount3d(ground())
    const l = lines(scene, 'reference-lines')
    expect(l).toHaveLength(1)
    expect(l[0].material).toBeInstanceOf(THREE.LineDashedMaterial)
    const a = positions(l[0])
    // 2 stretches of the first line and 1 of the second, two points each
    expect(a).toHaveLength(3 * 2 * 3)
    expect(a.slice(0, 6)).toEqual([10, expect.any(Number), -20, 30, expect.any(Number), -20])
    expect(a[1]).toBeGreaterThan(0)
    expect(a[1]).toBeLessThan(0.2)
    expect(l[0].raycast(new THREE.Raycaster(), [])).toBeNull()
    expect(material(l[0]).depthTest).toBe(true)
    expect(l[0].renderOrder).toBe(0)
  })

  it('On top is through the model: no depth test, a render order over the masses’', async () => {
    const scene = await mount3d(ground())
    await act(async () => useLayerView.getState().setOnTop([REFERENCE_LINES], true))
    const l = lines(scene, 'reference-lines')
    expect(l).toHaveLength(1)
    expect(material(l[0]).depthTest).toBe(false)
    expect(l[0].renderOrder).toBe(ON_TOP_RENDER_ORDER)
    await act(async () => useLayerView.getState().setOnTop([REFERENCE_LINES], false))
    expect(material(lines(scene, 'reference-lines')[0]).depthTest).toBe(true)
  })

  it('a line hidden on its own is not in the scene; the kind hidden, none is', async () => {
    const scene = await mount3d(ground())
    await act(async () => useLayerView.getState().setHidden([referenceLine('r1')], true))
    expect(positions(lines(scene, 'reference-lines')[0])).toHaveLength(2 * 3)
    await act(async () => useLayerView.getState().setHidden([REFERENCE_LINES], true))
    expect(lines(scene, 'reference-lines')).toHaveLength(0)
  })

  it('a project with none has nothing of them', async () => {
    const p = { ...useApp.getState().project, referenceLines: undefined }
    useApp.setState({ project: p, derived: derive(p, 'o1') })
    const scene = await mount3d(ground())
    expect(lines(scene, 'reference-lines')).toHaveLength(0)
  })
})
