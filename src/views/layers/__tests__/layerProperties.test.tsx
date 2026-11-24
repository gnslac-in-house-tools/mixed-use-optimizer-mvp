// Settings in Properties, by what is picked (Phase AS.3, task 5): each row of Layers that has settings, picked, shows them in
// Properties (the components of the old Site, Levels and Flow tabs, reused and shown open), and one field of each changes the
// project; an existing road and a gate picked on the plan have their own fields and a Delete; the commands that opened a
// settings tab (Site › Location…, Site rules…, Terrain…, Design › Levels…) pick the row and show Properties, wide and below 880 px;
// the Parking branch and the Gates row are there with nothing in them; one thing is shown at a time (a row, or a mass).
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../../App.tsx'
import { gatesOf, ownsGates } from '../../../engine/circulation/gates.ts'
import { derive } from '../../../engine/derive.ts'
import { gridOf } from '../../../engine/grid/index.ts'
import { isLayerLocked, parcelsLocked } from '../../../model/drawings.ts'
import type { Contour, Id, Project, SiteMap, Terrain } from '../../../model/schema.ts'
import { actions } from '../../../state/actions/index.ts'
import { addOption } from '../../../state/actions/buildings.ts'
import { demoProject } from '../../../state/demo.ts'
import { emptyHistory } from '../../../state/history.ts'
import { NO_SELECTION, useApp } from '../../../state/store.ts'
import { useLots } from '../../../modules/parking/views/lotState.ts'
import { useTerrainView } from '../../../modules/terrain/views/terrainView.ts'
import { runCommand } from '../../commands/index.ts'
import { useGraph } from '../../graph/graphState.ts'
import { useToast } from '../../layout/toast.ts'
import { useUi } from '../../layout/ui.ts'
import { useAccess } from '../../plan/access/accessState.ts'
import { useRoads } from '../../plan/circulation/roadState.ts'
import { useSnapSettings } from '../../plan/snap/settings.ts'
import { useDrawingPick } from '../../plan/site/drawingPick.ts'
import { useMapView } from '../../plan/site/mapView.ts'
import { useDimensions } from '../../plan/tools/toolState.ts'
import { letGo } from '../../tools/hand.ts'
import { useLayerPick, pickLayer } from '../layerPick.ts'
import { useLayerView } from '../layerView.ts'
import { showLayer } from '../show.ts'

vi.mock('../../scene/Scene.tsx', () => ({ Scene: () => <div data-testid="scene" /> }))

const s = () => useApp.getState()
const sq = (x: number, size: number): Contour => ({ vertices: [{ x, y: 0, r: 0 }, { x: x + size, y: 0, r: 0 }, { x: x + size, y: size, r: 0 }, { x, y: size, r: 0 }] })
const line = { points: [{ x: 10, y: 10 }, { x: 60, y: 10 }] }
const slope = (): Terrain => ({
  contours: Array.from({ length: 11 }, (_, k) => ({ points: [{ x: 0, y: 8 * k }, { x: 60, y: 8 * k }], z: 1200 + k })),
  points: [{ x: 30, y: 4, z: 1200.5 }],
  source: { file: 'topo.dxf', layers: ['CN', 'PUNTOS'] },
})
const fakeMap = (): SiteMap => ({ source: 'street', lat: 20.66, lon: -103.35, zoom: 18, image: 'data:image/jpeg;base64,AAAA', width: 500, height: 497, attribution: '© OpenStreetMap contributors' })

interface Fixture {
  project: Project
  road: Id
  gate: Id
  annex: Id
  annexMass: Id
  /** The Annex's second level, with a mass copied onto it. */
  upper: Id
}

/** The demo with an Annex of two levels, a second gate, a second existing road (the south street is the first), a lot, two drawings and a parcel, a map and the ground. */
function prepared(): Fixture {
  let p = demoProject()
  p = actions.addGate(p, 'o1', 0.1).project
  p = actions.addExistingRoad(p, [{ x: -60, y: 310 }, { x: 500, y: 310 }], 12)!.project
  p = actions.addLot(p, 'o1', { rect: { center: { x: 380, y: 230 }, width: 50, depth: 24, rotation: 0 } })!.project
  const annex = actions.addBuilding(p, { optionId: 'o1', name: 'Annex' })
  p = actions.addMass(annex.project, { programId: 'warehouse', footprint: { kind: 'rect', center: { x: 330, y: 215 }, width: 30, depth: 20, rotation: 0 }, levelId: annex.levelId }).project
  const annexMass = p.masses[p.masses.length - 1].id
  const up = actions.copyMassToLevel(p, annexMass, 1)!
  p = up.project
  const upper = up.levelId
  p = actions.locateSite(p, { lat: 20.66, lon: -103.35 })
  p = actions.setMap(p, fakeMap())
  p = actions.setTerrain(p, slope())
  p = {
    ...p,
    site: {
      ...p.site,
      drawings: [
        { file: 'civil.dwg', layers: [{ name: 'A-SITE', color: 1, lines: [line] }, { name: 'C-ROAD', lines: [line] }] },
        { file: 'frisa.dwg', layers: [{ name: 'ARQ-EDIF', color: 3, lines: [line] }], split: true },
      ],
      parcels: [{ name: 'P1', contour: sq(0, 20), file: 'civil.dwg' }],
    },
  }
  return { project: p, road: p.site.existingRoads!.at(-1)!.id, gate: p.site.gates![0].id, annex: annex.id, annexMass, upper }
}

let fx = prepared()

function start(p: Project = fx.project, ui: Partial<ReturnType<typeof useUi.getState>> = {}) {
  useApp.setState({ project: p, derived: derive(p, 'o1'), history: emptyHistory(), dragStart: null, selection: NO_SELECTION, level: 'l1', showAll: false, option: 'o1' })
  useUi.setState({ view: 'plan', rail: 'properties', panels: { left: true, right: true }, sheet: null, help: false, dialog: null, ...ui })
}

beforeEach(() => {
  localStorage.clear()
  fx = prepared()
  useLayerView.setState({ hidden: [], onTop: [], folded: [] })
  useLayerPick.setState({ keys: [] })
  useGraph.setState({ graph: false, rule: null, relation: null })
  useSnapSettings.setState({ settings: { ...useSnapSettings.getState().settings, grid: true } })
  useTerrainView.setState({ show: 'contours' })
  useToast.setState({ toast: null, confirmation: null })
  useAccess.setState({ picked: null, alsoGates: [] })
  useLots.setState({ picked: null, also: [] })
  useRoads.setState({ picked: null, also: [], node: null })
  useDrawingPick.setState({ picked: [] })
  useDimensions.setState({ selected: null, also: [] })
  useMapView.setState({ opacity: 0.8, busy: false, error: null })
  letGo()
  start()
})

afterEach(() => vi.unstubAllGlobals())

const panel = () => screen.getByRole('complementary', { name: 'Layers and properties' })
const props = () => within(panel()).getByRole('region', { name: 'Properties' })
/** Picks a row of Layers (the layer pick's) and returns Properties. */
const pick = (id: string) => {
  act(() => pickLayer(id))
  return props()
}
const field = (name: RegExp | string) => within(props()).getByRole('textbox', { name })
const type = (el: HTMLElement, value: string) => {
  fireEvent.change(el, { target: { value } })
  fireEvent.blur(el)
}
const button = (name: RegExp | string) => within(props()).getByRole('button', { name })
const heading = () => within(props()).getAllByRole('heading', { level: 2 })[0].textContent

describe('Site, Boundary, Buildable area', () => {
  it.each(['site', 'boundary', 'buildable'])('%s picked shows Location open, the site’s figures and the rules; a rule changes the project', (id) => {
    render(<App />)
    pick(id)
    expect(within(props()).getByRole('region', { name: 'Location' })).toBeInTheDocument()
    // shown open: no fold button, its fields are there
    expect(within(props()).queryByRole('button', { name: /Open Location|Close Location/ })).toBeNull()
    expect(within(props()).getByRole('textbox', { name: 'Google Maps link or lat, lon' })).toBeInTheDocument()
    const figures = within(props()).getByLabelText('Site figures')
    expect(within(figures).getByText('Site area')).toBeInTheDocument()
    expect(within(figures).getByText('Buildable area')).toBeInTheDocument()
    expect(within(figures).getByText('Coverage now')).toBeInTheDocument()
    expect(within(props()).getByText('Max. slope to build')).toBeInTheDocument()
    type(field(/Setback/), '7')
    expect(s().project.site.rules.setback).toBe(7)
    type(field(/Max\. coverage/), '40')
    expect(s().project.site.rules.maxCoverage).toBeCloseTo(0.4, 9)
  })

  it('its header says what it is: the row’s name, and its kind', () => {
    render(<App />)
    pick('boundary')
    expect(heading()).toBe('Boundary')
    expect(within(props()).getByText('Site boundary')).toBeInTheDocument()
    pick('site')
    expect(heading()).toBe('Site')
  })
})

describe('Map', () => {
  it('shows Location alone: the map’s source, opacity, Capture and Remove; North changes the project, the opacity the viewer’s', () => {
    render(<App />)
    pick('map')
    expect(within(props()).getByRole('region', { name: 'Location' })).toBeInTheDocument()
    expect(within(props()).queryByLabelText('Site figures')).toBeNull()
    expect(within(props()).queryByText('Max. slope to build')).toBeNull()
    expect(within(props()).getByRole('button', { name: 'Satellite' })).toBeInTheDocument()
    expect(button('Capture again')).toBeInTheDocument()
    type(field(/North/), '30')
    expect(s().project.site.geo!.north).toBeCloseTo(30, 9)
    const opacity = within(props()).getByRole('slider', { name: 'Map opacity' })
    fireEvent.change(opacity, { target: { value: '40' } })
    expect(useMapView.getState().opacity).toBeCloseTo(0.4, 9)
    fireEvent.click(button('Remove map'))
    expect(s().project.site.map).toBeUndefined()
  })
})

describe('Terrain', () => {
  it('shows the terrain’s data, its ground, its standards and Remove terrain; a standard changes the project', () => {
    render(<App />)
    pick('terrain')
    expect(within(props()).getByLabelText('Terrain figures')).toBeInTheDocument()
    expect(within(props()).getByText('Contours’ heights: 11 from the file.')).toBeInTheDocument()
    expect(within(props()).getByRole('button', { name: 'Smoothed' })).toBeInTheDocument()
    type(field(/Max\. step/), '3')
    expect(s().project.standards!.maxStep).toBe(3)
    fireEvent.click(button('Remove terrain'))
    expect(s().project.site.terrain).toBeUndefined()
  })

  it('is not a row when the module is off: no ground, nothing to pick', () => {
    start({ ...fx.project, site: { ...fx.project.site, terrain: undefined } })
    render(<App />)
    pick('terrain')
    expect(within(props()).queryByLabelText('Terrain figures')).toBeNull()
  })
})

describe('Drawings, a file, a layer, parcels', () => {
  it('Drawings: + Add drawing… (the DXF and DWG file picker) and a line of help', () => {
    const click = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {})
    render(<App />)
    pick('drawings')
    expect(heading()).toBe('Drawings')
    fireEvent.click(button('Add drawing…'))
    expect(click).toHaveBeenCalledTimes(1)
    expect((click.mock.contexts[0] as HTMLInputElement).accept).toBe('.dxf,.dwg')
    expect(within(props()).getByText(/kept for their drawing lines and parcels/)).toBeInTheDocument()
    click.mockRestore()
  })

  it('a joined file (picked through the drawing pick): its counts; Separate layers keeps it picked, Join layers puts it back; Remove', () => {
    render(<App />)
    act(() => useDrawingPick.getState().pick({ file: 'civil.dwg' }))
    expect(heading()).toBe('civil.dwg')
    const counts = within(props()).getByLabelText('Drawing file')
    expect(within(counts).getByText('Layers').nextSibling!.textContent).toBe('2')
    expect(within(counts).getByText('Parcels').nextSibling!.textContent).toBe('1')
    fireEvent.click(button('Separate layers'))
    expect(s().project.site.drawings!.find((d) => d.file === 'civil.dwg')!.split).toBe(true)
    // still picked: now as a row, since a separated file is not picked on the plan
    expect(heading()).toBe('civil.dwg')
    fireEvent.click(button('Join layers'))
    expect(s().project.site.drawings!.find((d) => d.file === 'civil.dwg')!.split).toBeFalsy()
    expect(heading()).toBe('civil.dwg')
    fireEvent.click(button('Remove'))
    expect(s().project.site.drawings!.map((d) => d.file)).toEqual(['frisa.dwg'])
    expect(s().project.site.parcels ?? []).toHaveLength(0)
    expect(within(props()).queryByRole('button', { name: 'Remove' })).toBeNull()
  })

  it('a separated file (a row of the layer pick) offers Join layers', () => {
    render(<App />)
    pick('file:frisa.dwg')
    expect(heading()).toBe('frisa.dwg')
    fireEvent.click(button('Join layers'))
    expect(s().project.site.drawings!.find((d) => d.file === 'frisa.dwg')!.split).toBeFalsy()
  })

  it('a file clicked in the tree shows the same, whichever way the plan holds it', () => {
    start(fx.project, { rail: 'layers' })
    render(<App />)
    const tree = screen.getByRole('tree', { name: 'Layers' })
    fireEvent.click(within(within(tree).getByRole('treeitem', { name: 'Site' })).getByRole('button', { name: 'Unfold Site' }))
    fireEvent.click(within(within(tree).getByRole('treeitem', { name: 'Drawings' })).getByRole('button', { name: 'Unfold Drawings' }))
    fireEvent.click(within(within(tree).getByRole('treeitem', { name: 'civil.dwg' })).getByRole('button', { name: 'civil.dwg' }))
    act(() => useUi.getState().setRail('properties'))
    expect(heading()).toBe('civil.dwg')
    expect(button('Separate layers')).toBeInTheDocument()
  })

  it('a layer: its name, its colour and its padlock, the same verb as the row’s', () => {
    render(<App />)
    pick('layer:civil.dwg/A-SITE')
    expect(heading()).toBe('A-SITE')
    const layer = within(props()).getByLabelText('Layer')
    expect(within(layer).getByText('civil.dwg')).toBeInTheDocument()
    expect(layer.querySelector('[data-colour]')).not.toBeNull()
    const lock = button('Lock A-SITE')
    expect(lock).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(lock)
    expect(isLayerLocked(s().project.site.drawings![0].layers[0])).toBe(true)
    expect(button('Lock A-SITE')).toHaveAttribute('aria-pressed', 'true')
    act(() => s().undo())
    expect(isLayerLocked(s().project.site.drawings![0].layers[0])).toBe(false)
  })

  it('a separated layer picked through the drawing pick: the same fields', () => {
    render(<App />)
    act(() => useDrawingPick.getState().pick({ file: 'frisa.dwg', layer: 'ARQ-EDIF' }))
    expect(heading()).toBe('ARQ-EDIF')
    fireEvent.click(button('Lock ARQ-EDIF'))
    expect(isLayerLocked(s().project.site.drawings![1].layers[0])).toBe(true)
  })

  it('a file’s parcels: their padlock; a parcel: its name and its area', () => {
    render(<App />)
    pick('parcels:civil.dwg')
    expect(heading()).toBe('Parcels')
    // a parcel is locked until it is unlocked
    expect(button('Lock Parcels')).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(button('Lock Parcels'))
    expect(parcelsLocked(s().project.site, 'civil.dwg')).toBe(false)
    fireEvent.click(button('Lock Parcels'))
    expect(parcelsLocked(s().project.site, 'civil.dwg')).toBe(true)
    pick('parcel:civil.dwg/P1')
    expect(heading()).toBe('P1')
    const parcel = within(props()).getByLabelText('Parcel')
    expect(within(parcel).getByText('Area').nextSibling!.textContent).toBe('400 m²')
    expect(within(props()).queryByRole('button', { name: /Lock/ })).toBeNull()
  })
})

describe('Grid', () => {
  it('shows the grid’s fields, the Grid menu’s component; a bay changes the project', () => {
    render(<App />)
    pick('grid')
    expect(heading()).toBe('Grid')
    expect(button('Move pivot')).toBeInTheDocument()
    expect(button('Restore original')).toBeInTheDocument()
    expect(within(props()).getByRole('button', { name: 'Project' })).toBeInTheDocument()
    type(field(/Bay x/), '12')
    expect(gridOf(s().project, 'o1')!.x).toBe(12)
  })
})

describe('Buildings, a building, a level', () => {
  it('Buildings: their count and the floor area, and no New building button (the row’s ＋ and Design › New building make one)', () => {
    render(<App />)
    pick('buildings')
    expect(heading()).toBe('Buildings')
    const figures = within(props()).getByLabelText('Buildings figures')
    expect(within(figures).getByText('Floor area').nextSibling!.textContent).toMatch(/m²$/)
    expect(within(figures).getByText('Buildings').nextSibling!.textContent).toBe(String(s().project.buildings.length))
    expect(within(props()).queryByRole('button', { name: 'New building' })).toBeNull()
  })

  it('a building: its settings, its levels and its platform, of THAT building, not the one the plan is on', () => {
    render(<App />)
    expect(s().level).toBe('l1')
    pick(`building:${fx.annex}`)
    expect(heading()).toBe('Annex')
    expect(props().querySelector('section[aria-label="Building Annex"]')).not.toBeNull()
    expect(field('Name')).toHaveValue('Annex')
    expect(within(props()).getByRole('table')).toBeInTheDocument()
    // the plan stays where it is: Properties reads the row, not the active building
    expect(s().level).toBe('l1')
    type(field('Name'), 'Annex 2')
    expect(s().project.buildings.find((b) => b.id === fx.annex)!.name).toBe('Annex 2')
    expect(s().project.buildings.find((b) => b.id === 'b1')!.name).not.toBe('Annex 2')
    type(within(props()).getByRole('textbox', { name: `Height of ${s().project.buildings.find((b) => b.id === fx.annex)!.levels[0].name}` }), '4.5')
    expect(s().project.buildings.find((b) => b.id === fx.annex)!.levels[0].height).toBe(4.5)
  })

  it('a building’s levels table has a bin per level: Delete level, with its masses after asking; a building keeps one level', () => {
    render(<App />)
    pick(`building:${fx.annex}`)
    const levels = () => s().project.buildings.find((b) => b.id === fx.annex)!.levels
    expect(levels()).toHaveLength(2)
    const upper = levels().find((l) => l.id === fx.upper)!
    fireEvent.click(button(`Delete ${upper.name}`))
    // the level holds a mass: it asks first
    expect(levels()).toHaveLength(2)
    expect(useToast.getState().confirmation?.text).toMatch(/Delete this level and its mass\?/)
    act(() => useToast.getState().confirmation!.onContinue())
    expect(levels()).toHaveLength(1)
    expect(s().project.masses.some((m) => m.levelId === fx.upper)).toBe(false)
    // the last one is refused: the bin is greyed, with the reason
    const last = levels()[0]
    expect(button(`Delete ${last.name}`)).toBeDisabled()
    expect(button(`Delete ${last.name}`)).toHaveAttribute('title', 'Annex keeps one level at least')
  })

  it('a level: its building’s settings, the header naming the level', () => {
    render(<App />)
    pick(`level:${fx.upper}`)
    const upper = s().project.buildings.find((b) => b.id === fx.annex)!.levels.find((l) => l.id === fx.upper)!
    expect(heading()).toBe(upper.name)
    expect(within(props()).getByText(`Level of Annex`)).toBeInTheDocument()
    expect(field('Name')).toHaveValue('Annex')
  })

  it('several buildings: a count and their floor area; mixed kinds: how many rows', () => {
    render(<App />)
    act(() => useLayerPick.getState().set([`building:b1`, `building:${fx.annex}`]))
    expect(heading()).toBe('2 buildings')
    expect(within(props()).getByText('Floor area')).toBeInTheDocument()
    act(() => useLayerPick.getState().set([`building:b1`, 'map']))
    expect(heading()).toBe('2 rows picked')
  })
})

describe('Circulation, Streets, Gates, courts', () => {
  it('Circulation and Streets: the roads’ totals and the link to Brief › Circulation', () => {
    render(<App />)
    for (const id of ['circulation', 'streets']) {
      pick(id)
      expect(within(props()).getByLabelText('Circulation totals')).toBeInTheDocument()
      expect(within(props()).getByText('Roads')).toBeInTheDocument()
    }
    fireEvent.click(button('Brief › Circulation'))
    expect(useUi.getState().dialog).toBe('brief')
    expect(useUi.getState().briefTab).toBe('circulation')
  })

  it('Gates: Own gates for the option / Use the site’s, + Gate, the link; the option’s own gates change', () => {
    render(<App />)
    pick('gates')
    expect(heading()).toBe('Gates')
    expect(ownsGates(s().project, 'o1')).toBe(false)
    expect(within(props()).getByRole('heading', { name: 'Gates of the site' })).toBeInTheDocument()
    fireEvent.click(button(/Own gates for/))
    expect(ownsGates(s().project, 'o1')).toBe(true)
    expect(within(props()).getByRole('heading', { name: /^Gates of / })).toBeInTheDocument()
    expect(button('Brief › Circulation')).toBeInTheDocument()
    fireEvent.click(button("Use the site's"))
    expect(ownsGates(s().project, 'o1')).toBe(false)
    fireEvent.click(button(/Own gates for/))
    const before = gatesOf(s().project, 'o1').length
    fireEvent.click(button('+ Gate'))
    expect(gatesOf(s().project, 'o1')).toHaveLength(before + 1)
  })

  it('Gates with no gate: the row is there, + Gate is on (the site has a boundary), Own gates still works', () => {
    const base = fx.project
    start({ ...base, site: { boundary: base.site.boundary, rules: base.site.rules } })
    render(<App />)
    expect(gatesOf(s().project, 'o1')).toHaveLength(0)
    pick('gates')
    expect(within(props()).getByText(/None yet/)).toBeInTheDocument()
    expect(button('+ Gate')).toBeEnabled()
    fireEvent.click(button(/Own gates for/))
    expect(ownsGates(s().project, 'o1')).toBe(true)
  })

  it('Truck courts: their count and their total area', () => {
    render(<App />)
    pick('courts')
    const courts = within(props()).getByLabelText('Courts figures')
    expect(within(courts).getByText('Courts').nextSibling!.textContent).toBe(String(derive(s().project, 'o1').circulation.docks.filter((d) => d.court.length >= 3).length))
    expect(within(courts).getByText('Area').nextSibling!.textContent).toMatch(/m²$/)
  })

  it('Existing roads: a line and the count; there is no Frontage row', () => {
    render(<App />)
    pick('existing-roads')
    expect(within(props()).getByText(/already in the parcel/)).toBeInTheDocument()
    expect(within(props()).getByLabelText('Count')).toHaveTextContent(String(s().project.site.existingRoads!.length))
    expect(screen.queryByText('Frontage')).toBeNull()
  })
})

describe('Parking', () => {
  it.each(['parking', 'street-parking', 'lots'])('%s: Other streets (the side), the totals; the side changes the option', (id) => {
    render(<App />)
    pick(id)
    expect(within(props()).getByRole('combobox', { name: /Other streets/ })).toBeInTheDocument()
    expect(within(props()).getByLabelText('Parking totals')).toBeInTheDocument()
    expect(within(props()).getByText(/1 parking lot:/)).toBeInTheDocument()
    fireEvent.change(within(props()).getByRole('combobox', { name: /Other streets/ }), { target: { value: 'single' } })
    expect(s().project.options.find((o) => o.id === 'o1')!.parking).toBe('single')
  })

  it('the branch and Street parking are there with no stall and no lot, so Other streets is reachable', () => {
    const base = fx.project
    const none = { ...base, standards: { ...base.standards, parking: 'none' as const }, site: { ...base.site, gates: [] } }
    start({ ...none, options: none.options.map((o) => ({ ...o, parking: 'none' as const })) })
    render(<App />)
    expect(s().derived.circulation.stalls).toHaveLength(0)
    pick('street-parking')
    expect(within(props()).getByRole('combobox', { name: /Other streets/ })).toBeInTheDocument()
    fireEvent.change(within(props()).getByRole('combobox', { name: /Other streets/ }), { target: { value: 'double' } })
    expect(s().project.options.find((o) => o.id === 'o1')!.parking).toBe('double')
  })

  it('with no lots, Parking and Street parking show the help the Flow tab’s empty list showed: how a lot is made; with lots, the count', () => {
    const { project } = fx
    start({ ...project, options: project.options.map((o) => ({ ...o, lots: undefined })) })
    render(<App />)
    expect(s().derived.circulation.lots).toHaveLength(0)
    for (const id of ['parking', 'street-parking']) {
      pick(id)
      expect(within(props()).getByText(/No parking lots yet\. With Lot/)).toBeInTheDocument()
      expect(within(props()).getByText(/next to a wall a click lays one along it/)).toBeInTheDocument()
      expect(within(props()).queryByText(/1 parking lot:/)).toBeNull()
    }
    // the Lot tool's key is in the help, as the Flow tab said it (Decision "Lot tool")
    expect(within(props()).getByText(/With Lot \(P\)/)).toBeInTheDocument()
  })
})

describe('Annotations, Reference: a line and a count', () => {
  it.each([
    ['dimensions', /dimensions drawn on the plan/, true],
    ['labels', /names and areas written on the plan/, false],
    ['issues', /warnings beside the masses/, true],
    ['rules', /brief’s rules drawn as arcs/, false],
    ['graph', /program graph drawn over the masses/, false],
    ['reference', /structural grid/, false],
    ['annotations', /written over the plan/, false],
  ] as const)('%s', (id, text, count) => {
    render(<App />)
    pick(id)
    expect(within(props()).getByText(text)).toBeInTheDocument()
    expect(within(props()).queryByLabelText('Count') !== null).toBe(count)
  })

  it('Issues: the count is the derived result’s', () => {
    render(<App />)
    pick('issues')
    expect(within(props()).getByLabelText('Count')).toHaveTextContent(String(s().derived.issues.length))
  })
})

describe('An existing road and a gate, picked', () => {
  it('an existing road: its fields and Delete', () => {
    render(<App />)
    act(() => useAccess.getState().pick({ kind: 'existing', id: fx.road }))
    type(field('Name'), 'Camino viejo')
    expect(s().project.site.existingRoads!.find((r) => r.id === fx.road)!.name).toBe('Camino viejo')
    // its width is a read-out now, the pills set it (Phase PE.1 task 11)
    expect(screen.queryByRole('textbox', { name: /Width/ })).toBeNull()
    expect(screen.getByText('Width').parentElement!.textContent).toBe('Width12 m')
    fireEvent.click(button('Delete'))
    expect(s().project.site.existingRoads!.some((r) => r.id === fx.road)).toBe(false)
  })

  it('a gate: its fields and Delete', () => {
    render(<App />)
    act(() => useAccess.getState().pick({ kind: 'gate', id: fx.gate }))
    type(field(/Width/), '9')
    expect(gatesOf(s().project, 'o1').find((g) => g.id === fx.gate)!.width).toBe(9)
    fireEvent.click(button('Delete'))
    expect(gatesOf(s().project, 'o1').some((g) => g.id === fx.gate)).toBe(false)
  })

  it('a lot picked keeps its own Properties', () => {
    render(<App />)
    const lot = s().derived.circulation.lots[0].id
    act(() => useLots.getState().pick(lot))
    expect(within(props()).getByLabelText('Parking lot')).toBeInTheDocument()
  })
})

describe('one thing at a time', () => {
  it('a row, then a mass picked on the plan: Properties shows the mass; back to the row: the row’s settings', () => {
    render(<App />)
    pick(`building:${fx.annex}`)
    expect(heading()).toBe('Annex')
    act(() => s().select(fx.annexMass))
    expect(useLayerPick.getState().keys).toEqual([])
    expect(within(props()).getByRole('button', { name: 'Lock mass' })).toBeInTheDocument()
    expect(within(props()).queryByRole('table')).toBeNull()
    pick('boundary')
    expect(s().selection.massIds).toEqual([])
    expect(heading()).toBe('Boundary')
    expect(within(props()).queryByRole('button', { name: 'Lock mass' })).toBeNull()
  })

  it('nothing picked: the building the plan is on, as before', () => {
    render(<App />)
    expect(within(props()).getByRole('region', { name: 'Active building' })).toBeInTheDocument()
  })

  it('Escape lets the row go and Properties goes back to the active building', () => {
    render(<App />)
    pick('boundary')
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(useLayerPick.getState().keys).toEqual([])
    expect(within(props()).getByRole('region', { name: 'Active building' })).toBeInTheDocument()
  })
})

describe('the commands that opened a settings tab', () => {
  const run = (id: string) => act(async () => void runCommand(id))
  const keys = () => useLayerPick.getState().keys

  it('Site › Location… and Site rules… pick the Site row and show Properties, the panel open', async () => {
    start(fx.project, { rail: 'layers', panels: { left: false, right: true } })
    render(<App />)
    await run('site.location')
    expect(useUi.getState().rail).toBe('properties')
    expect(useUi.getState().panels.left).toBe(true)
    expect(keys()).toEqual(['site'])
    expect(within(props()).getByRole('region', { name: 'Location' })).toBeInTheDocument()
    act(() => useLayerPick.getState().clear())
    act(() => useUi.getState().setRail('layers'))
    await run('site.rules')
    expect(useUi.getState().rail).toBe('properties')
    expect(keys()).toEqual(['site'])
    expect(within(props()).getByText('Max. slope to build')).toBeInTheDocument()
  })

  it('Site › Terrain… picks the Terrain row, and unfolds the Site branch that holds it', async () => {
    render(<App />)
    expect(useLayerView.getState().folded).toEqual([])
    await run('site.terrain')
    expect(keys()).toEqual(['terrain'])
    expect(useLayerView.getState().folded).toEqual(['site'])
    expect(within(props()).getByLabelText('Terrain figures')).toBeInTheDocument()
    // the tree shows the row, its branch open
    act(() => useUi.getState().setRail('layers'))
    expect(within(screen.getByRole('tree', { name: 'Layers' })).getByRole('treeitem', { name: 'Terrain', selected: true })).toBeInTheDocument()
  })

  it('Design › Levels… picks the row of the building the plan is on: its levels', async () => {
    start(fx.project, { rail: 'layers' })
    render(<App />)
    await run('design.levels')
    expect(useUi.getState().rail).toBe('properties')
    expect(keys()).toEqual(['building:b1'])
    expect(within(props()).getByRole('table')).toBeInTheDocument()
    act(() => s().setLevel(fx.upper))
    await run('design.levels')
    expect(keys()).toEqual([`building:${fx.annex}`])
    expect(heading()).toBe('Annex')
  })

  it('below 880 px: Properties is an item of the rail, the sheet opens on it, and the row’s settings are in it', async () => {
    vi.stubGlobal('matchMedia', vi.fn((media: string) => ({ media, matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })))
    start(fx.project, { rail: 'layers', sheet: null })
    render(<App />)
    await run('site.location')
    expect(useUi.getState().sheet).toBe('left')
    expect(useUi.getState().rail).toBe('properties')
    expect(within(props()).getByRole('region', { name: 'Location' })).toBeInTheDocument()
    // the card over the viewport shows nothing for a row
    const viewport = screen.getByRole('region', { name: 'Viewport' })
    expect(within(viewport).queryByRole('region', { name: 'Properties' })).toBeNull()
    expect(within(panel().querySelector<HTMLElement>('[data-panel-tabs]')!).getByRole('tab', { name: 'Properties' })).toHaveAttribute('aria-selected', 'true')
    await run('design.levels')
    expect(keys()).toEqual(['building:b1'])
  })

  it('showLayer on a row the tree has not (a site with nothing in it) picks nothing, and still shows Properties', () => {
    const base = fx.project
    start({ ...base, site: { boundary: null, rules: base.site.rules } }, { rail: 'layers', panels: { left: false, right: true } })
    render(<App />)
    act(() => showLayer('terrain'))
    expect(useLayerPick.getState().keys).toEqual([])
    expect(useUi.getState().rail).toBe('properties')
    expect(useUi.getState().panels.left).toBe(true)
  })
})

describe('an option other than the first', () => {
  it('Gates and Parking read the option in view', () => {
    const two = addOption(fx.project, { name: 'Second', buildingIds: ['b1'] })
    start(two.project)
    useApp.setState({ option: two.id, derived: derive(two.project, two.id) })
    render(<App />)
    pick('gates')
    fireEvent.click(button(/Own gates for Second/))
    expect(ownsGates(s().project, two.id)).toBe(true)
    expect(ownsGates(s().project, 'o1')).toBe(false)
  })
})
