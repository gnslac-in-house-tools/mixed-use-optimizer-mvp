// The padlock means one thing (Phase AS.3, task 3; the user, 2026-11-13: the padlock is CAD's): a locked object is seen,
// is not picked on the plan or in the 3D, and is not changed; it is picked from its row in a tree alone, to read it or to
// take the lock off. Imported drawing layers and a file's parcels already followed this rule; a mass follows it now, and
// a dimension's lock, which fixes its length (moving one of its masses drags the other), is another thing, called so.
// Here: a locked mass is not picked by a click, Shift+click, the window, Select all, a right-click (which opens no menu) or the 3D; its row
// in the Layers tree picks it; Properties shows it read-only but for the padlock; the verbs that rename it, give it a
// program, group it or assign it to a building skip it; Edit › Lock lets go what it locks; undo and redo put a lock
// back; and a dimension with a fixed length behaves as it did and reads so.
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { createRoot, extend, useThree } from '@react-three/fiber'
import type { PointerEvent, ReactNode } from 'react'
import * as THREE from 'three'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Mass, Point, Project, SiteDrawing } from '../../../model/schema.ts'
import { App } from '../../../App.tsx'
import { derive } from '../../../engine/derive.ts'
import { centroid } from '../../../engine/geom/polygon.ts'
import { LOCKED } from '../../../model/picked.ts'
import { actions } from '../../../state/actions/index.ts'
import { demoProject } from '../../../state/demo.ts'
import { emptyHistory } from '../../../state/history.ts'
import { NO_SELECTION, useApp } from '../../../state/store.ts'
import { commandOf, runCommand } from '../../commands/index.ts'
import { useLayerView } from '../layerView.ts'
import { callTool } from '../../../api/tools/index.ts'
import { readGft, writeGft } from '../../../io/gft.ts'
import { assign, NEW_BUILDING, pickFromRow, selectBuildingMasses } from '../../panels/buildingCommands.ts'
import { assignProgramToSelection } from '../../panels/programCommands.ts'
import { useToast } from '../../layout/toast.ts'
import { useUi } from '../../layout/ui.ts'
import { fit, UNMEASURED_SIZE } from '../../plan/camera.ts'
import { startMassDrag } from '../../plan/editing.ts'
import { typeDimensionLength } from '../../plan/dimensions/typeLength.ts'
import { groupSelection, pickOnPlan, selectAllHere, ungroupSelection } from '../../plan/massCommands.ts'
import { pickedNow, selectBox } from '../../plan/mix.ts'
import { leaf, planMenu } from '../../editing/menu/__tests__/helpers.ts'
import { useDimensions } from '../../plan/tools/toolState.ts'
import { Masses } from '../../scene/Masses.tsx'
import { sceneColors } from '../../scene/colors.ts'
import { letGo } from '../../tools/hand.ts'

vi.mock('../../scene/Scene.tsx', () => ({ Scene: () => <div data-testid="scene" /> }))

const s = () => useApp.getState()
const toast = () => useToast.getState().toast?.text
const plan = () => screen.getByRole('img', { name: 'Site plan' })
const props = () => screen.getByRole('region', { name: 'Properties' })

// the demo's site and its 15 m south street, as the plan fits it
const v = fit({ minX: 0, minY: -15, maxX: 440, maxY: 280 }, UNMEASURED_SIZE)
const at = (q: Point, extra: object = {}) => ({
  clientX: (q.x - v.cx) * v.scale + UNMEASURED_SIZE.w / 2,
  clientY: UNMEASURED_SIZE.h / 2 - (q.y - v.cy) * v.scale,
  button: 0,
  pointerId: 1,
  ...extra,
})
const press = (el: Element, q: Point, extra: object = {}) => {
  fireEvent.pointerDown(el, at(q, extra))
  fireEvent.pointerUp(el, at(q, extra))
}
const massEl = (id: string) => document.querySelector(`[data-mass="${id}"]`)!
/** Where a mass is: its centroid (m1 and m2 are the demo's warehouses, m3 its office). */
const centreOf = (id: string): Point => centroid(s().derived.masses[id].polygon)
const mass = (id: string): Mass => s().project.masses.find((m) => m.id === id)!
const locked = (id: string) => mass(id).locked === true

const WINDOW = { a: { x: -50, y: -50 }, b: { x: 500, y: 350 } }
const CROSSING = { a: { x: 500, y: 350 }, b: { x: -50, y: -50 } }

/** The demo with the masses `ids` locked, nothing picked. */
function start(ids: string[] = ['m1'], make: (p: Project) => Project = (p) => p) {
  const p = actions.lockMasses(make(demoProject()), ids, true)
  useApp.setState({ project: p, derived: derive(p), history: emptyHistory(), dragStart: null, selection: NO_SELECTION, level: 'l1', showAll: false, option: 'o1' })
  useToast.setState({ toast: null, confirmation: null })
}

beforeEach(() => {
  localStorage.clear()
  useUi.setState({ dialog: null, view: 'plan', rail: 'layers', panels: { left: true, right: true }, sheet: null })
  useLayerView.setState({ hidden: [], onTop: [], folded: [] })
  letGo()
  useDimensions.setState({ selected: null, also: [] })
  start()
})

describe('the notice', () => {
  it('names Layers, where the lock comes off', () => {
    expect(LOCKED).toBe('Locked: unlock it in Layers')
  })
})

describe('a locked mass on the plan: seen, not picked', () => {
  it('a click picks nothing and shows the notice; a mass beside it is picked as ever', () => {
    render(<App />)
    expect(massEl('m1')).not.toBeNull()
    press(massEl('m1'), centreOf('m1'))
    expect(pickedNow().masses).toEqual([])
    expect(toast()).toBe(LOCKED)
    useToast.setState({ toast: null })
    press(massEl('m2'), centreOf('m2'))
    expect(pickedNow().masses).toEqual(['m2'])
    expect(toast()).toBeUndefined()
  })

  it('a click on it keeps what was picked, as a click on a locked drawing layer does', () => {
    render(<App />)
    act(() => pickOnPlan('m2'))
    press(massEl('m1'), centreOf('m1'))
    expect(pickedNow().masses).toEqual(['m2'])
    expect(toast()).toBe(LOCKED)
  })

  it('Shift+click and Ctrl+click do not add it', () => {
    render(<App />)
    act(() => pickOnPlan('m2'))
    press(massEl('m1'), centreOf('m1'), { shiftKey: true })
    expect(pickedNow().masses).toEqual(['m2'])
    expect(toast()).toBe(LOCKED)
    press(massEl('m1'), centreOf('m1'), { ctrlKey: true })
    expect(pickedNow().masses).toEqual(['m2'])
    act(() => pickOnPlan('m1', true))
    expect(pickedNow().masses).toEqual(['m2'])
  })

  it('the selection window, crossing and window, skips it; Select all too', () => {
    render(<App />)
    act(() => selectBox(WINDOW, false))
    expect(pickedNow().masses.sort()).toEqual(['m2', 'm3'])
    act(() => letGo())
    act(() => selectBox(CROSSING, false))
    expect(pickedNow().masses.sort()).toEqual(['m2', 'm3'])
    act(() => letGo())
    act(() => selectAllHere())
    expect(pickedNow().masses.sort()).toEqual(['m2', 'm3'])
    act(() => letGo())
    act(() => void runCommand('edit.select-all'))
    expect(pickedNow().masses.sort()).toEqual(['m2', 'm3'])
  })

  it('a window drawn over it from its own body is a window, not a refusal', () => {
    render(<App />)
    // from a point of m1 to the left of m3, crossing it: m3 is picked, m1 (locked) is not
    fireEvent.pointerDown(massEl('m1'), at({ x: 130, y: 145 }))
    fireEvent.pointerMove(plan(), at({ x: 100, y: 250 }))
    fireEvent.pointerUp(plan(), at({ x: 100, y: 250 }))
    expect(pickedNow().masses).toEqual(['m3'])
    expect(toast()).toBeUndefined()
  })

  it('a right-click on it picks nothing, shows the notice and opens no menu (it would act on what else is picked)', () => {
    render(<App />)
    act(() => pickOnPlan('m2'))
    fireEvent.contextMenu(massEl('m1'), at(centreOf('m1')))
    expect(pickedNow().masses).toEqual(['m2'])
    expect(toast()).toBe(LOCKED)
    expect(screen.queryByRole('menu')).toBeNull()
    // on a mass that is not locked, the right-click picks it first
    fireEvent.contextMenu(massEl('m3'), at(centreOf('m3')))
    expect(pickedNow().masses).toEqual(['m3'])
  })

  it('a double-click on it does nothing', () => {
    render(<App />)
    const view = plan().getAttribute('viewBox')
    fireEvent.doubleClick(massEl('m1'), at(centreOf('m1')))
    expect(pickedNow().masses).toEqual([])
    expect(plan().getAttribute('viewBox')).toBe(view)
  })

  it('in All, a click on it picks nothing and shows the notice; another mass is picked', () => {
    render(<App />)
    act(() => s().setShowAll(true))
    fireEvent.click(document.querySelector('[data-all-mass="m1"]')!)
    expect(pickedNow().masses).toEqual([])
    expect(toast()).toBe(LOCKED)
    fireEvent.click(document.querySelector('[data-all-mass="m2"]')!)
    expect(pickedNow().masses).toEqual(['m2'])
  })

  it('a press on its bubble in the graph, or on it as a held mass, starts no drag and says it is locked', () => {
    expect(startMassDrag('m1', v.scale)({ shiftKey: false, altKey: false } as PointerEvent<SVGElement>, centreOf('m1'))).toBeNull()
    expect(toast()).toBe(LOCKED)
    expect(pickedNow().masses).toEqual([])
    useToast.setState({ toast: null })
    expect(startMassDrag('m1', v.scale)({ shiftKey: true, altKey: false } as PointerEvent<SVGElement>, centreOf('m1'))).toBeNull()
    expect(pickedNow().masses).toEqual([])
    expect(startMassDrag('m2', v.scale)({ shiftKey: false, altKey: false } as PointerEvent<SVGElement>, centreOf('m2'))).not.toBeNull()
  })

  it('has no handles and shows its glyph and a plain cursor', () => {
    render(<App />)
    expect(massEl('m1').getAttribute('class')).toContain('cursor-default')
    expect(document.querySelector('[data-handle^="vertex-"]')).toBeNull()
  })

  it('a locked mass in a group is skipped when its group is picked: by a click, by the window', () => {
    start(['m1'], (p) => actions.groupMasses(p, ['m1', 'm2'])!.project)
    expect(mass('m1').group).toBeDefined()
    render(<App />)
    press(massEl('m2'), centreOf('m2'))
    expect(pickedNow().masses).toEqual(['m2'])
    act(() => letGo())
    act(() => selectBox(WINDOW, false))
    expect(pickedNow().masses.sort()).toEqual(['m2', 'm3'])
  })
})

describe('a locked mass in the 3D: seen, not picked', () => {
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
  /** The click the scene gives a mass's mesh. */
  const click = (scene: THREE.Scene, id: string, extra: object = {}) => {
    const meshes: THREE.Object3D[] = []
    scene.traverse((o) => {
      if (o.userData?.massId === id) meshes.push(o)
    })
    expect(meshes.length, id).toBeGreaterThan(0)
    const onClick = (meshes[0] as unknown as { __r3f: { props: { onClick(e: unknown): void } } }).__r3f.props.onClick
    act(() => onClick({ delta: 0, stopPropagation() {}, nativeEvent: { shiftKey: false, altKey: false, ...extra } }))
  }

  it('a click on it picks nothing and shows the notice; a click on another picks it', async () => {
    const scene = await mount3d(<Masses colors={sceneColors()} />)
    click(scene, 'm1')
    expect(pickedNow().masses).toEqual([])
    expect(toast()).toBe(LOCKED)
    click(scene, 'm2')
    expect(pickedNow().masses).toEqual(['m2'])
  })

  it('Shift+click does not add it', async () => {
    const scene = await mount3d(<Masses colors={sceneColors()} />)
    act(() => pickOnPlan('m2'))
    click(scene, 'm1', { shiftKey: true })
    expect(pickedNow().masses).toEqual(['m2'])
    expect(toast()).toBe(LOCKED)
  })
})

describe('picked from its row', () => {
  it('a mass’s row in the Layers tree picks it, locked or not; Ctrl adds a second', () => {
    render(<App />)
    const tree = screen.getByRole('tree', { name: 'Layers' })
    const unfold = (name: string) => fireEvent.click(within(within(tree).getByRole('treeitem', { name })).getByRole('button', { name: `Unfold ${name}` }))
    unfold('Building 1')
    unfold('L1')
    const name = (n: string) => within(within(tree).getByRole('treeitem', { name: n })).getByText(n).closest('button')!
    fireEvent.click(name('Warehouse 1'))
    expect(s().selection.massIds).toEqual(['m1'])
    expect(toast()).toBeUndefined()
    fireEvent.click(name('Warehouse 2'), { ctrlKey: true })
    expect(s().selection.massIds.sort()).toEqual(['m1', 'm2'])
  })

  it('pickFromRow, the tree-side pick, takes a locked mass; the plan-side one does not', () => {
    pickFromRow('o1', ['m1'])
    expect(s().selection.massIds).toEqual(['m1'])
    act(() => s().select(null))
    expect(pickOnPlan('m1')).toBe(false)
    expect(s().selection.massIds).toEqual([])
    pickFromRow('o1', ['m1'])
    pickFromRow('o1', ['m2'], true)
    expect(s().selection.massIds.sort()).toEqual(['m1', 'm2'])
  })

  it('Select its masses in a building’s menu leaves out the locked ones and the ones whose eye is off', () => {
    render(<App />)
    act(() => selectBuildingMasses('o1', s().project.buildings[0]))
    expect(s().selection.massIds.sort()).toEqual(['m2', 'm3'])
    act(() => s().select(null))
    act(() => useLayerView.setState({ hidden: ['mass:m2'] }))
    act(() => selectBuildingMasses('o1', s().project.buildings[0]))
    expect(s().selection.massIds).toEqual(['m3'])
  })

  it('Select its masses with every mass locked picks nothing and shows the notice; with every eye off, it says so', () => {
    start(['m1', 'm2', 'm3'])
    render(<App />)
    act(() => selectBuildingMasses('o1', s().project.buildings[0]))
    expect(s().selection.massIds).toEqual([])
    expect(toast()).toBe(LOCKED)
    start([])
    act(() => useLayerView.setState({ hidden: ['mass:m1', 'mass:m2', 'mass:m3'] }))
    act(() => selectBuildingMasses('o1', s().project.buildings[0]))
    expect(s().selection.massIds).toEqual([])
    expect(toast()).toBeDefined()
  })
})

describe('Properties of a locked mass: read only but for the padlock', () => {
  const open = () => {
    render(<App />)
    act(() => pickFromRow('o1', ['m1']))
    act(() => useUi.setState({ rail: 'properties' }))
  }

  it('every field is disabled with the reason as its title', () => {
    open()
    const why = 'Locked: unlock it to change it'
    for (const name of [/^Name/, /^Width/, /^Depth/, /^Rotation/, /^Height/]) {
      const field = within(props()).getByRole('textbox', { name })
      expect(field, String(name)).toBeDisabled()
      expect(field, String(name)).toHaveAttribute('title', why)
    }
    const program = within(props()).getByRole('combobox', { name: /^Program/ })
    expect(program).toBeDisabled()
    expect(program).toHaveAttribute('title', why)
    for (const name of ['Rotate 90°', 'Delete']) expect(within(props()).getByRole('button', { name })).toBeDisabled()
    expect(within(props()).getByRole('button', { name: 'Rotate 90°' })).toHaveAttribute('title', expect.stringContaining(why))
    // the docks are its program’s and its own: read only as well
    const docks = within(props()).getByRole('region', { name: 'Docks' })
    for (const b of within(docks).getAllByRole('button')) expect(b).toBeDisabled()
  })

  it('the padlock reads Locked and unlocks it; its fields are then free', () => {
    open()
    const pad = within(props()).getByRole('button', { name: 'Lock mass' })
    expect(pad).toHaveAttribute('aria-pressed', 'true')
    expect(pad).not.toBeDisabled()
    fireEvent.click(pad)
    expect(locked('m1')).toBe(false)
    expect(within(props()).getByRole('textbox', { name: /^Name/ })).toBeEnabled()
    expect(within(props()).getByRole('textbox', { name: /^Width/ })).toBeEnabled()
    // unlocked and picked: it stays picked
    expect(s().selection.massIds).toEqual(['m1'])
  })

  it('several, one locked: the fields that would change it are disabled and the padlock reads Locked, and unlocks them all', () => {
    render(<App />)
    act(() => pickFromRow('o1', ['m1']))
    act(() => pickFromRow('o1', ['m2'], true))
    act(() => useUi.setState({ rail: 'properties' }))
    expect(within(props()).getByRole('combobox', { name: /^Program/ })).toBeDisabled()
    expect(within(props()).getByRole('combobox', { name: /^Program/ })).toHaveAttribute('title', 'Locked: unlock it to change it')
    expect(within(props()).getByRole('textbox', { name: /^Height/ })).toBeDisabled()
    const pad = within(props()).getByRole('button', { name: 'Lock masses' })
    expect(pad).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(pad)
    expect(locked('m1')).toBe(false)
    expect(locked('m2')).toBe(false)
  })

  it('a mass that is not locked has its fields free, and the padlock locks it and lets it go', () => {
    render(<App />)
    act(() => pickOnPlan('m2'))
    act(() => useUi.setState({ rail: 'properties' }))
    expect(within(props()).getByRole('textbox', { name: /^Name/ })).toBeEnabled()
    fireEvent.click(within(props()).getByRole('button', { name: 'Lock mass' }))
    expect(locked('m2')).toBe(true)
    expect(s().selection.massIds).toEqual([])
  })
})

describe('what a locked mass keeps: its name and its program, by the verbs', () => {
  it('updateMass and updateMasses skip it: the same project when nothing else changes', () => {
    const p = s().project
    expect(actions.updateMass(p, 'm1', { name: 'Renamed' })).toBe(p)
    expect(actions.updateMass(p, 'm1', { programId: 'office' })).toBe(p)
    const q = actions.updateMasses(p, ['m1', 'm2'], { programId: 'office', name: 'Same' })
    expect(q.masses.find((m) => m.id === 'm1')).toMatchObject({ programId: 'warehouse', name: p.masses[0].name })
    expect(q.masses.find((m) => m.id === 'm2')).toMatchObject({ programId: 'office', name: 'Same' })
    // its shape and height are the store's (settle.ts): refused with the reason
    s().apply((x) => actions.updateMass(x, 'm1', { height: 30 }))
    expect(mass('m1').height).toBe(p.masses[0].height)
    expect(s().refusal?.text).toMatch(/Warehouse 1 is locked/)
  })

  it('a program given by the plan’s menu (Program ▸): the locked ones keep theirs, with the reason; among several, the others change', () => {
    act(() => pickFromRow('o1', ['m1']))
    act(() => pickFromRow('o1', ['m2'], true))
    useToast.setState({ toast: null })
    assignProgramToSelection('office')
    expect(mass('m1').programId).toBe('warehouse')
    expect(mass('m2').programId).toBe('office')
    expect(toast()).toMatch(/1 locked block kept its program/)
    // only locked ones: nothing changes, and the notice says why
    act(() => s().select('m1'))
    const before = s().project
    assignProgramToSelection('guardhouse')
    expect(s().project).toBe(before)
    expect(toast()).toMatch(/locked/)
  })

  it('the agent’s tool is held by the same rule: it says the mass is locked', () => {
    const r = callTool(s().project, 'updateMass', { mass: 'm1', name: 'Nope' })
    expect(r).toMatchObject({ ok: false, error: expect.stringMatching(/Warehouse 1 is locked/) })
    expect(callTool(s().project, 'updateMass', { mass: 'm2', name: 'Fine' })).toMatchObject({ ok: true, changed: true })
  })
})

describe('what a locked mass keeps: its group and its building', () => {
  it('assigning it to a building skips it, and says so; the others go', () => {
    start(['m1'])
    const before = s().project
    assign(['m1', 'm2'], 'o1', NEW_BUILDING)
    const m = (id: string) => s().project.masses.find((x) => x.id === id)!
    expect(m('m1').levelId).toBe(before.masses[0].levelId)
    expect(m('m2').levelId).not.toBe(before.masses[1].levelId)
    expect(toast()).toMatch(/1 locked block kept its building/)
  })

  it('assigning only a locked mass changes nothing and says why', () => {
    const was = s().project
    assign(['m1'], 'o1', NEW_BUILDING)
    expect(s().project).toBe(was)
    expect(toast()).toMatch(/Warehouse 1 is locked/)
  })

  it('Group and Ungroup refuse it, with the reason; the verbs leave its group alone', () => {
    act(() => pickFromRow('o1', ['m1']))
    act(() => pickFromRow('o1', ['m2'], true))
    expect(commandOf('edit.group')!.enabled!()).toMatch(/locked/)
    expect(groupSelection()).toBe(false)
    expect(mass('m1').group).toBeUndefined()
    const grouped = actions.lockMasses(actions.groupMasses(demoProject(), ['m1', 'm2'])!.project, ['m1'], true)
    useApp.setState({ project: grouped, derived: derive(grouped), history: emptyHistory() })
    act(() => pickFromRow('o1', ['m1']))
    expect(commandOf('edit.ungroup')!.enabled!()).toMatch(/locked/)
    expect(ungroupSelection()).toBe(false)
    expect(mass('m1').group).toBeDefined()
    expect(mass('m2').group).toBe(mass('m1').group)
  })
})

describe('what a locked mass keeps: its place', () => {
  it('Move, Rotate, Rotate 90°, a typed measure and Delete leave it, and say why', () => {
    start(['m1', 'm2'])
    act(() => pickFromRow('o1', ['m1']))
    const was = s().project
    s().apply((p) => actions.moveMasses(p, ['m1'], { x: 5, y: 0 }))
    expect(s().project).toBe(was)
    expect(s().refusal?.text).toMatch(/Warehouse 1 is locked/)
    s().apply((p) => actions.rotateMasses(p, ['m1'], 15))
    expect(s().project).toBe(was)
    expect(commandOf('edit.rotate90')!.enabled!()).toBe('A locked mass: unlock first')
    expect(commandOf('edit.delete')!.enabled!()).toBe('A locked mass: unlock first')
    act(() => void runCommand('edit.rotate90'))
    act(() => void runCommand('edit.delete'))
    expect(s().project).toBe(was)
    // a typed length: the dimension at its end cannot move it
    s().apply((p) => actions.addDimension(p, { x: 200, y: 70 }, { x: 250, y: 70 }, -6, 'l1')!.project)
    const withDim = s().project
    typeDimensionLength('d1', 60)
    expect(s().project).toBe(withDim)
  })

  it('moving a locked mass to another level or elevation is skipped too', () => {
    const p = s().project
    expect(actions.moveMassToLevel(p, 'm1', 1)).toBeNull()
    expect(actions.moveMassesToElevation(p, ['m1'], 20, true)).toBe(p)
  })
})

describe('Edit › Lock', () => {
  it('on picked masses locks them and lets them go; the label says Unlock when what is picked from a tree is all locked', () => {
    render(<App />)
    act(() => pickOnPlan('m2'))
    const label = () => (typeof commandOf('edit.lock')!.label === 'function' ? (commandOf('edit.lock')!.label as () => string)() : '')
    expect(label()).toBe('Lock')
    act(() => void runCommand('edit.lock'))
    expect(locked('m2')).toBe(true)
    expect(s().selection.massIds).toEqual([])
    act(() => pickFromRow('o1', ['m1']))
    act(() => pickFromRow('o1', ['m2'], true))
    expect(label()).toBe('Unlock')
    act(() => void runCommand('edit.lock'))
    expect(locked('m1')).toBe(false)
    expect(locked('m2')).toBe(false)
    // unlocked from the tree, they stay picked
    expect(s().selection.massIds.sort()).toEqual(['m1', 'm2'])
  })

  it('the plan menu’s Lock row is that command: it locks and lets go', () => {
    render(<App />)
    act(() => pickOnPlan('m3'))
    const row = leaf(planMenu(), 'lock')
    expect(row.label).toBe('Lock')
    act(() => row.onSelect())
    expect(locked('m3')).toBe(true)
    expect(s().selection.massIds).toEqual([])
  })

  it('undo takes the lock off and redo puts it back, letting go a mass picked on the plan', () => {
    render(<App />)
    act(() => pickOnPlan('m2'))
    act(() => s().apply((p) => actions.lockMasses(p, ['m2'], true)))
    expect(locked('m2')).toBe(true)
    expect(s().selection.massIds).toEqual([])
    act(() => s().undo())
    expect(locked('m2')).toBe(false)
    act(() => pickOnPlan('m2'))
    act(() => s().redo())
    expect(locked('m2')).toBe(true)
    expect(s().selection.massIds).toEqual([])
    // one picked from the tree stays when something else is locked
    act(() => pickFromRow('o1', ['m1']))
    act(() => s().apply((p) => actions.lockMasses(p, ['m3'], true)))
    expect(s().selection.massIds).toEqual(['m1'])
  })

  it('a lock is project data: it is in the .gft', () => {
    const back = readGft(writeGft(s().project))
    expect('project' in back && back.project.masses.find((m) => m.id === 'm1')?.locked).toBe(true)
  })
})

describe('a dimension’s lock is not the padlock: it fixes its length', () => {
  const lockDimension = () => {
    s().apply((p) => actions.addDimension(p, { x: 200, y: 70 }, { x: 250, y: 70 }, -6, 'l1')!.project)
    s().apply((p) => actions.toggleDimensionLock(p, 'd1'))
    useDimensions.getState().select('d1')
  }
  const centreX = (id: string) => {
    const f = mass(id).footprint
    return f.kind === 'rect' ? f.center.x : NaN
  }

  it('Properties reads Fixed length, with its titles; the length is read only; undo and redo are the dimension’s', () => {
    start([])
    render(<App />)
    act(lockDimension)
    act(() => useUi.setState({ rail: 'properties' }))
    const pad = within(props()).getByRole('button', { name: 'Fixed length' })
    expect(pad).toHaveAttribute('aria-pressed', 'true')
    expect(pad).toHaveAttribute('title', expect.stringContaining('Its length is kept: moving one of its masses drags the other'))
    expect(within(props()).queryByRole('button', { name: /Lock dimension/ })).toBeNull()
    expect(within(props()).getByRole('textbox', { name: /^Length/ })).toBeDisabled()
    expect(props().textContent).not.toMatch(/Locked/)
    fireEvent.click(pad)
    expect(s().project.dimensions![0].locked).toBeUndefined()
    expect(within(props()).getByRole('button', { name: 'Fixed length' })).toHaveAttribute('aria-pressed', 'false')
    expect(within(props()).getByRole('textbox', { name: /^Length/ })).toBeEnabled()
    fireEvent.click(within(props()).getByRole('button', { name: 'Fixed length' }))
    expect(s().project.dimensions![0].locked).toBe(true)
  })

  it('the glyph on the plan reads it too', () => {
    start([])
    const { container } = render(<App />)
    act(lockDimension)
    const glyph = container.querySelector('[data-dimension-lock]')!
    expect(glyph).toHaveAttribute('aria-label', 'Fixed length')
    expect(glyph.querySelector('title')!.textContent).toContain('Its length is kept')
    expect(glyph.querySelector('title')!.textContent).toContain('Free its length')
  })

  it('behaves as before: moving one mass drags the other; a typed length is refused, in words of its own', () => {
    start([])
    render(<App />)
    act(lockDimension)
    const m1 = centreX('m1')
    act(() => s().apply((p) => actions.moveMasses(p, ['m2'], { x: 12, y: 0 })))
    expect(centreX('m2')).toBeCloseTo(332)
    expect(centreX('m1')).toBeCloseTo(m1 + 12)
    const was = s().project
    typeDimensionLength('d1', 60)
    expect(s().project).toBe(was)
    expect(toast()).toMatch(/dimension with a fixed length/)
    expect(toast()).not.toMatch(/locked/i)
    // an edit that would change its length (a stretch of the mass at its end): refused, in the same words
    const n = s().refusal?.n ?? 0
    const now = s().project
    s().apply((p) => actions.updateMass(p, 'm2', { footprint: { kind: 'rect', center: { x: 332, y: 110 }, width: 100, depth: 80, rotation: 180 } }))
    expect(s().project).toBe(now)
    expect(s().refusal!.n).toBeGreaterThan(n)
    expect(s().refusal?.text).toMatch(/dimension with a fixed length/)
  })

  it('a mass’s lock is the other thing: its padlock reads Lock mass, never Fixed length', () => {
    render(<App />)
    act(() => pickFromRow('o1', ['m1']))
    act(() => useUi.setState({ rail: 'properties' }))
    expect(within(props()).getByRole('button', { name: 'Lock mass' })).toBeInTheDocument()
    expect(within(props()).queryByRole('button', { name: 'Fixed length' })).toBeNull()
  })
})

describe('a locked drawing layer, as before, with the notice’s new words', () => {
  it('a click on it picks nothing and says where to unlock it', () => {
    start([])
    const drawing: SiteDrawing = {
      file: 'a.dxf',
      split: true,
      layers: [{ name: 'Walls', locked: true, lines: [{ points: [{ x: 180, y: 235 }, { x: 260, y: 235 }] }] }],
    }
    const p = { ...s().project, site: { ...s().project.site, drawings: [drawing] } }
    useApp.setState({ project: p, derived: derive(p) })
    render(<App />)
    press(plan(), { x: 220, y: 235 })
    expect(pickedNow().drawings).toEqual([])
    expect(toast()).toBe('Locked: unlock it in Layers')
  })
})
