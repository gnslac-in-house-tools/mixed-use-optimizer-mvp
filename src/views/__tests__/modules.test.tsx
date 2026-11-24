// What is not there is not shown (Decisions "Modules", "Catalog", "What is not there is not shown"; Phase M.3): the views
// follow the catalog. What creates something of a module shows when the typology offers it; what adjusts or measures
// shows once the project has something the module acts on, with no reload when an import, an edit or an undo makes it so.
import { act, fireEvent, render, renderHook, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../App.tsx'
import { contourFromPolygon } from '../../engine/geom/contour.ts'
import type { GroundPoint, Project, Terrain } from '../../model/schema.ts'
import { actions } from '../../state/actions/index.ts'
import { demoProject } from '../../state/demo.ts'
import { useApp } from '../../state/store.ts'
import { blank } from '../../typologies/blank.ts'
import { newProject, TYPOLOGIES } from '../../typologies/index.ts'
import { useUi } from '../layout/ui.ts'
import { useGraph } from '../graph/graphState.ts'
import { showLayer } from '../layers/show.ts'
import { useAccess } from '../plan/access/accessState.ts'
import { useTerrainView } from '../../modules/terrain/views/terrainView.ts'
import { useModule } from '../modules.ts'
import { letGo } from '../tools/hand.ts'
import { placeCopy } from '../../modules/warehouse/views/commands.ts'

vi.mock('../scene/Scene.tsx', () => ({ Scene: () => <div data-testid="scene" /> }))
vi.mock('../../modules/warehouse/views/WarehouseScene.tsx', () => ({ WarehouseScene: () => <div data-testid="warehouse-scene" /> }))

/** The plane the terrain tests stand on: rising 5 % east from 100 m at x 0; points only, no contours. */
const plane = (): Terrain => {
  const points: GroundPoint[] = []
  for (let x = -100; x <= 700; x += 50) for (let y = -100; y <= 500; y += 50) points.push({ x, y, z: 100 + 0.05 * x })
  return { contours: [], points }
}
/** Three contours across the demo's site. */
const contours = (): Terrain => ({ contours: [0, 1, 2].map((k) => ({ points: [{ x: 0, y: 100 + 8 * k }, { x: 400, y: 100 + 8 * k }] })), points: [] })

const s = () => useApp.getState()
/** A square site, n m a side. */
const square = (n: number) => contourFromPolygon([{ x: 0, y: 0 }, { x: n, y: 0 }, { x: n, y: n }, { x: 0, y: n }])
const edit = (f: (p: Project) => Project) => act(() => s().apply(f))
/** A blank project with Building 1 and one mass: its ring road is the only road it has. */
const blankWithMass = (): Project =>
  actions.addMass(newProject('blank'), { programId: null, footprint: { kind: 'rect', center: { x: 0, y: 0 }, width: 30, depth: 40, rotation: 0 } }).project

function start(p: Project, ui: Partial<ReturnType<typeof useUi.getState>> = {}) {
  s().open(p)
  useUi.setState({ dialog: null, briefTab: 'programs', view: 'plan', rail: 'layers', summaryTab: 'overview', panels: { left: true, right: true }, sheet: null, help: false, kpiSize: 'full', ...ui })
  return render(<App />)
}

const left = () => screen.getByRole('complementary', { name: 'Layers and properties' })
/** The branches of the Layers tree, top to bottom (Phase AS.3: what the Flow tab's groups were are its Circulation and Parking branches). */
const branches = () =>
  within(left())
    .queryAllByRole('treeitem')
    .filter((r) => r.getAttribute('aria-level') === '1')
    .map((r) => r.getAttribute('aria-label'))
/** A row of the tree by its name, or null. */
const row = (name: string) => within(left()).queryByRole('treeitem', { name })
/** Unfolds a branch of the tree, if it is there and folded. */
const unfold = (name: string) => {
  const b = row(name)
  const button = b && within(b).queryByRole('button', { name: `Unfold ${name}` })
  if (button) fireEvent.click(button)
}
const flow = { rail: 'layers' } as const
/** The terrain's look, at the foot of the Site panel (Decision "Bottom bar"). */
const terrainView = () => within(screen.getByRole('region', { name: 'Drafting' })).queryByRole('group', { name: 'Terrain view' })
const briefCirculation = () => ({ dialog: 'brief' as const, briefTab: 'circulation' as const })

beforeEach(() => {
  localStorage.clear()
  useGraph.setState({ graph: false, rule: null, relation: null })
  letGo()
  useAccess.setState({ picked: null })
  letGo()
  useTerrainView.getState().setShow('contours')
})

describe('useModule', () => {
  it('follows the store’s project: an import, an edit or an undo turns a module on or off at once', () => {
    s().open(newProject('industrial'))
    const { result } = renderHook(() => useModule('terrain'))
    expect(result.current).toEqual({ offered: true, on: false })
    edit((p) => actions.setTerrain(p, plane()))
    expect(result.current).toEqual({ offered: true, on: true })
    act(() => s().undo())
    expect(result.current).toEqual({ offered: true, on: false })
    // another project in place of this one: a typology that does not offer it
    act(() => s().open(newProject('blank')))
    expect(renderHook(() => useModule('docks')).result.current).toEqual({ offered: false, on: false })
  })
})

describe('the Terrain row of Layers', () => {
  it('shows once a terrain is imported, with no reload; gone again when it goes (the ground’s settings are its Properties)', () => {
    start(newProject('blank'), { rail: 'layers' })
    expect(row('Terrain')).toBeNull()
    edit((p) => actions.setTerrain(p, plane()))
    unfold('Site')
    expect(row('Terrain')).not.toBeNull()
    act(() => showLayer('terrain'))
    expect(within(left()).getByLabelText('Terrain figures')).toBeInTheDocument()
    // the row goes with the ground: nothing of the ground is left to show
    act(() => s().undo())
    expect(row('Terrain')).toBeNull()
    expect(within(left()).queryByLabelText('Terrain figures')).toBeNull()
  })
})

describe('the drafting bar’s Terrain view (the Site tools’ Heights is hidden: `ui:tool.heights`, spec "The panel")', () => {
  const terrainTools = () => within(left()).queryByRole('group', { name: 'Terrain tools' })

  it('none without a terrain; with one, Terrain in the drafting bar, in every area; no Heights in Site’s tools, points or contours', () => {
    start({ ...demoProject(), site: { ...demoProject().site, terrain: undefined } }, { rail: 'layers' })
    expect(terrainTools()).toBeNull()
    expect(terrainView()).toBeNull()
    expect(screen.queryByRole('combobox', { name: 'Terrain' })).toBeNull()
    edit((p) => actions.setTerrain(p, plane()))
    expect(within(terrainView()!).getByRole('combobox', { name: 'Terrain' })).toBeEnabled()
    // the bar's: in every area (Decision "Bottom bar")
    act(() => useUi.getState().setRail('layers'))
    expect(terrainView()).not.toBeNull()
    act(() => useUi.getState().setRail('layers'))
    edit((p) => actions.setTerrain(p, contours()))
    expect(terrainTools()).toBeNull()
    expect(within(left()).queryByRole('button', { name: 'Heights' })).toBeNull()
  })

  it('the vertical exaggeration is the Terrain row’s Properties’, not the bar’s; disabled while the terrain show is off', () => {
    start(actions.setTerrain(demoProject(), plane()), { rail: 'layers' })
    expect(within(terrainView()!).queryByRole('combobox', { name: 'Vertical exaggeration' })).toBeNull()
    act(() => showLayer('terrain'))
    const k3 = () => within(within(left()).getByRole('group', { name: 'Vertical exaggeration' })).getByRole('button', { name: '×3' })
    fireEvent.click(k3())
    expect(useTerrainView.getState().exaggeration).toBe(3)
    act(() => useTerrainView.getState().setShow('off'))
    expect(k3()).toBeDisabled()
  })
})

describe('the Brief’s docks (a module the typology offers)', () => {
  const trailer = () => screen.queryByRole('columnheader', { name: /Trailer stalls/ })
  const courtDepth = () => screen.queryByRole('textbox', { name: /Truck court depth/ })

  it('an industrial project offers them before any dock exists: the trailer stalls column, the truck court depth', () => {
    const p = newProject('industrial')
    expect(p.masses).toHaveLength(0)
    start(p, briefCirculation())
    expect(trailer()).not.toBeNull()
    expect(courtDepth()).not.toBeNull()
  })

  it('a blank project shows none of them, and no Docks in a program’s rule set', () => {
    let p = newProject('blank')
    p = actions.addProgram(p, { name: 'Retail' }).project
    start(p, briefCirculation())
    expect(trailer()).toBeNull()
    expect(courtDepth()).toBeNull()
    // the cars’ are there: parking is offered to every typology
    expect(screen.getByRole('textbox', { name: /Stall width/ })).toBeInTheDocument()
    act(() => useUi.getState().openDialog('program'))
    const rules = within(screen.getByRole('group', { name: /Retail's rule set/ }))
    expect(rules.getByText('Grid')).toBeInTheDocument()
    expect(rules.queryByText('Docks')).toBeNull()
  })

  it('an industrial program’s rule set has its Docks', () => {
    start(newProject('industrial'))
    act(() => useUi.getState().openDialog('program'))
    expect(within(screen.getByRole('group', { name: /rule set/ })).getByText('Docks')).toBeInTheDocument()
  })
})

describe('a mass’s own docks in Properties', () => {
  const docksSection = () => screen.queryByRole('region', { name: 'Docks' })
  /** The demo with no dock anywhere: its programs have none and no mass has walls of its own. */
  const undocked = (): Project => ({ ...demoProject(), programs: demoProject().programs.map((g) => ({ ...g, docks: undefined })) })

  it('offered by an industrial project before any dock exists; a blank one shows none, even over a docked mass', () => {
    start(undocked(), { rail: 'properties' })
    act(() => s().select('m1'))
    expect(s().derived.circulation.docks).toHaveLength(0)
    expect(docksSection()).not.toBeNull()
    edit((p) => ({ ...p, typology: 'blank' }))
    expect(docksSection()).toBeNull()
    // the docks stay in the data: the project turns them on again with its industrial typology
    edit((p) => ({ ...p, typology: 'industrial' }))
    expect(docksSection()).not.toBeNull()
  })

  it('a blank project with a docked warehouse (its program’s) shows no Docks section either', () => {
    start({ ...demoProject(), typology: 'blank' }, { rail: 'properties' })
    act(() => s().select('m1'))
    expect(s().derived.circulation.docks.length).toBeGreaterThan(0)
    expect(docksSection()).toBeNull()
  })
})

describe('the Standards’ parking fields (offered)', () => {
  afterEach(() => {
    const k = TYPOLOGIES.findIndex((t) => t.id === 'bare')
    if (k >= 0) TYPOLOGIES.splice(k, 1)
  })

  it('shown where the typology offers parking; a typology without it shows no stall fields', () => {
    TYPOLOGIES.push({ ...blank, id: 'bare', name: 'Bare', modules: ['terrain'] })
    start({ ...newProject('blank'), typology: 'bare' }, briefCirculation())
    expect(screen.queryByRole('textbox', { name: /Stall width/ })).toBeNull()
    expect(screen.queryByRole('textbox', { name: /Stall depth/ })).toBeNull()
    expect(screen.queryByRole('combobox', { name: /Parking along the roads/ })).toBeNull()
    expect(screen.getByRole('textbox', { name: /^Gate width/ })).toBeInTheDocument()
    edit((p) => ({ ...p, typology: 'blank' }))
    expect(screen.getByRole('textbox', { name: /Stall width/ })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: /Parking along the roads/ })).toBeInTheDocument()
  })
})

describe('the Circulation and Parking branches of Layers (Decisions "What is not there is not shown", "Settings by what is picked")', () => {
  it('Parking is a branch wherever the typology offers the module, with Street parking even with no stall: Other streets is reachable; a blank typology has none', () => {
    start(newProject('industrial'), flow)
    expect(branches()).toContain('Parking')
    unfold('Parking')
    expect(row('Street parking')).not.toBeNull()
    act(() => showLayer('street-parking'))
    expect(within(left()).getByRole('combobox', { name: 'Other streets' })).toBeInTheDocument()
    act(() => useUi.getState().setRail('layers'))
    // a program that asks for stalls changes the figures, not the branch
    edit((p) => actions.setProgramDemand(p, 'office', { carStalls: 25 }))
    expect(branches()).toContain('Parking')
    // a typology that does not offer the module goes without the branch, with no reload
    const bare = { ...TYPOLOGIES[0], id: 'bare-parking-test', modules: [] as string[] }
    TYPOLOGIES.push(bare)
    try {
      edit((p) => ({ ...p, typology: 'bare-parking-test' }))
      expect(branches()).not.toContain('Parking')
    } finally {
      TYPOLOGIES.pop()
    }
  })

  it('choosing None for the option, or the standards’ None, keeps the branch: the switch that brings the stalls back is there', () => {
    start(demoProject(), flow)
    expect(branches()).toContain('Parking')
    edit((p) => actions.setParking(p, 'o1', 'none'))
    expect(branches()).toContain('Parking')
    act(() => showLayer('parking'))
    expect(within(left()).getByRole('combobox', { name: 'Other streets' })).toHaveValue('none')
    act(() => useUi.getState().setRail('layers'))
    edit((p) => actions.setParking(p, 'o1', null))
    edit((p) => actions.updateStandards(p, { parking: 'none' }))
    expect(branches()).toContain('Parking')
  })

  it('Circulation is a branch when the site has a boundary (its Gates row) or an option has a street; a mass alone has none (since ST.4)', () => {
    start(newProject('blank'), flow)
    expect(branches()).not.toContain('Circulation')
    edit((p) => actions.setBoundary(p, square(200)))
    // a mass: no ring is derived round it
    edit((p) => blankWithMass().masses.reduce((q, m) => ({ ...q, masses: [...q.masses, m] }), p))
    expect(branches()).toContain('Circulation')
    unfold('Circulation')
    expect(row('Streets')).toBeNull()
    expect(row('Gates')).not.toBeNull()
    edit((p) => actions.drawStreet(p, 'o1', [{ x: 10, y: 10 }, { x: 150, y: 10 }])?.project ?? p)
    expect(row('Streets')).not.toBeNull()
    // the boundary goes: the gates' row with it; the street stays
    edit((p) => actions.setBoundary(p, null))
    expect(row('Gates')).toBeNull()
  })

  it('a blank project with nothing in it has no Site and no Circulation (Parking stays, its typology offers it: Other streets is reachable), Buildings and Annotations', () => {
    start(newProject('blank'), flow)
    expect(branches()).not.toContain('Circulation')
    expect(branches()).not.toContain('Site')
    expect(branches()).toEqual(expect.arrayContaining(['Buildings', 'Parking', 'Annotations']))
  })
})

/** A typology that offers no warehouse (every typology that is known offers it since Phase D.2: its buildings are blocks): for what follows the offer. */
const BARE = { ...blank, id: 'bare', name: 'Bare', modules: ['terrain'] }
const withBare = () => TYPOLOGIES.push(BARE)
const withoutBare = () => {
  const k = TYPOLOGIES.findIndex((t) => t.id === 'bare')
  if (k >= 0) TYPOLOGIES.splice(k, 1)
}

describe('the warehouse', () => {
  afterEach(withoutBare)
  // the program Draw makes is in the Massing group's ▾ of the Tools strip: opened once, it stays open
  const programPick = () => {
    const arrow = within(screen.getByRole('toolbar', { name: 'Tools' })).getByRole('button', { name: 'Massing options' })
    if (arrow.getAttribute('aria-expanded') !== 'true') fireEvent.click(arrow)
    return screen.getByRole('combobox', { name: 'New block’s program' })
  }
  const optionTexts = () => within(programPick()).getAllByRole('option').map((o) => o.textContent)

  it('the Mass tool’s New block entry and the Blocks tab: every typology that offers the warehouse has them (the industrial and the blank one do)', () => {
    // the Draw tool's program in the Massing group's ▾, the smart blocks in the Blocks tab (Decision "Panel tabs")
    start(newProject('industrial'), { rail: 'layers' })
    expect(optionTexts()).toContain('＋ New block…')
    expect(within(left()).getByRole('tab', { name: 'Blocks' })).toBeInTheDocument()
    fireEvent.click(within(left()).getByRole('tab', { name: 'Blocks' }))
    expect(screen.getByRole('tabpanel', { name: 'Blocks' })).toBeInTheDocument()
    edit((p) => ({ ...p, typology: 'blank' }))
    expect(within(left()).getByRole('tab', { name: 'Blocks' })).toBeInTheDocument()
    expect(optionTexts()).toContain('＋ New block…')
  })

  it('a typology without the warehouse has neither the entry nor the Blocks tab', () => {
    withBare()
    start(newProject('industrial'), { rail: 'layers' })
    edit((p) => ({ ...p, typology: 'bare' }))
    expect(within(left()).queryByRole('tab', { name: 'Blocks' })).toBeNull()
    expect(screen.queryByRole('tabpanel', { name: 'Blocks' })).toBeNull()
    expect(optionTexts()).not.toContain('＋ New block…')
  })

  it('a copy’s section in Properties follows the warehouse being on', () => {
    withBare()
    start(actions.addWarehouseType(newProject('industrial')).project, { rail: 'blocks' })
    act(() => placeCopy('wt1'))
    act(() => useUi.setState({ rail: 'properties' }))
    expect(screen.getByText('Copy of Warehouse A')).toBeInTheDocument()
    edit((p) => ({ ...p, typology: 'bare' }))
    expect(screen.queryByText('Copy of Warehouse A')).toBeNull()
    edit((p) => ({ ...p, typology: 'industrial' }))
    expect(screen.getByText('Copy of Warehouse A')).toBeInTheDocument()
  })
})

describe('where a warehouse type is started (offered)', () => {
  afterEach(withoutBare)
  const kindOptions = (name: string) => within(screen.getByRole('combobox', { name: `Kind of ${name}` })).getAllByRole('option').map((o) => o.textContent)
  const withProgram = (typology: string, kind?: 'warehouse') => {
    const r = actions.addProgram(newProject(typology), { name: 'Retail' })
    return actions.updateProgram(r.project, r.id, { kind })
  }

  it('the Kind select offers Warehouse where the typology offers it, not in one that does not; a program that is one keeps it', () => {
    withBare()
    start(withProgram('industrial'), { dialog: 'brief' })
    expect(kindOptions('Retail')).toContain('Warehouse')
    edit((p) => ({ ...p, typology: 'bare' }))
    expect(kindOptions('Retail')).not.toContain('Warehouse')
    // a program that already is a warehouse keeps its Kind shown
    edit((p) => actions.updateProgram(p, p.programs.at(-1)!.id, { kind: 'warehouse' }))
    expect(kindOptions('Retail')).toContain('Warehouse')
    expect(screen.getByRole('combobox', { name: 'Kind of Retail' })).toHaveValue('warehouse')
  })

  it('Start its rule set is a button where the typology offers warehouses, a line where it does not', () => {
    withBare()
    start(withProgram('industrial', 'warehouse'), { dialog: 'program' })
    // the Retail program is the last: pick it
    fireEvent.change(screen.getByRole('combobox', { name: 'Program to edit' }), { target: { value: s().project.programs.at(-1)!.id } })
    expect(screen.getByRole('button', { name: 'Start its rule set' })).toBeInTheDocument()
    edit((p) => ({ ...p, typology: 'bare' }))
    expect(screen.queryByRole('button', { name: 'Start its rule set' })).toBeNull()
    expect(screen.getByText('This typology does not offer warehouse types.')).toBeInTheDocument()
    edit((p) => ({ ...p, typology: 'industrial' }))
    expect(screen.getByRole('button', { name: 'Start its rule set' })).toBeInTheDocument()
  })
})

describe('the KPI picker', () => {
  const openPicker = () => fireEvent.click(within(screen.getByRole('region', { name: 'Project figures' })).getByRole('button', { name: 'Customize KPIs' }))
  const picker = () => within(screen.getByRole('dialog', { name: 'Customize KPIs' }))

  it('lists no terrain KPI without a terrain; one appears when the ground is imported', () => {
    start(newProject('industrial'))
    openPicker()
    expect(picker().queryByRole('button', { name: 'Show Cut' })).toBeNull()
    expect(picker().getByRole('button', { name: 'Show Site area' })).toBeInTheDocument()
    edit((p) => actions.setTerrain(p, plane()))
    expect(picker().getByRole('button', { name: 'Show Cut' })).toBeInTheDocument()
  })
})

describe('the Summary’s Overview', () => {
  const docksGroup = () => screen.queryByRole('region', { name: 'Docks & trucks' })

  it('shows the Docks & trucks group only when the docks module is on', () => {
    start(demoProject(), { summaryTab: 'overview' })
    expect(docksGroup()).not.toBeNull()
    // a blank project does not offer docks: no group, whatever its masses and programs still hold
    edit((p) => ({ ...p, typology: 'blank' }))
    expect(docksGroup()).toBeNull()
    expect(screen.getByRole('region', { name: 'Site' })).toBeInTheDocument()
  })

  it('an industrial project with no docks shows no Docks & trucks group', () => {
    start({ ...demoProject(), programs: demoProject().programs.map((g) => ({ ...g, docks: undefined })), masses: demoProject().masses.map((m) => ({ ...m, docks: undefined })) })
    expect(docksGroup()).toBeNull()
  })
})
