// The View, Site, Design and Tools commands (Project C, AS.1 task 3): each one, run through the registry, does what the
// control it stands for does today (the View menu, the drafting bar, the tools bar, the area panels' tools, the option
// switch, the Brief tiles), its tick follows the state, and it is disabled with a reason exactly where that control is.
// The App is rendered as the other view tests do (the 3D scene is mocked); `runCommand` is the one door, and the
// controls that stay (a chip, a tool button) are read beside it to see that the two agree.
// Demo masses: m1 x 40…200 y 70…150 and m2 x 250…390 y 70…150 (warehouses, they do not touch); m3 (office). The Elements
// tests use the sample project, whose first building is a placed warehouse block.
import { act, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../../App.tsx'
import { ICON_PATHS } from '../../controls/Icon.tsx'
import { derive } from '../../../engine/derive.ts'
import { actions } from '../../../state/actions/index.ts'
import { demoProject } from '../../../state/demo.ts'
import { emptyHistory } from '../../../state/history.ts'
import { sampleProject } from '../../../state/sample.ts'
import { NO_SELECTION, useApp } from '../../../state/store.ts'
import { TYPOLOGIES } from '../../../typologies/index.ts'
import { PLUGINS, usePluginModes } from '../../../plugins/index.ts'
import { useBuildingView } from '../../buildingView.ts'
import { useCompare } from '../../compare/compareView.ts'
import { DEFAULT_DETAIL, useDetail } from '../../detail.ts'
import { useGraph } from '../../graph/graphState.ts'
import { useScreen } from '../../home/screen.ts'
import { useToast } from '../../layout/toast.ts'
import { useUi } from '../../layout/ui.ts'
import { useAccess } from '../../plan/access/accessState.ts'
import { usePlanRef } from '../../plan/planRef.ts'
import { useMapView } from '../../plan/site/mapView.ts'
import { DIMENSIONS, ISSUES, LABELS, MAP as MAP_KEY, RULES } from '../../layers/keys.ts'
import { useLayerPick } from '../../layers/layerPick.ts'
import { isHidden, useLayerView } from '../../layers/layerView.ts'
import { useSiteTool } from '../../plan/site/siteTools.ts'
import { DEFAULT_SNAP } from '../../plan/snap/kinds.ts'
import { useSnapSettings } from '../../plan/snap/settings.ts'
import { useDimensions, useRuler, useTool } from '../../plan/tools/toolState.ts'
import { useSceneRef } from '../../scene/sceneRef.ts'
import { useWarningsPref } from '../../stats/warningsPref.ts'
import { useSiteBlock } from '../../../modules/warehouse/views/siteBlockState.ts'
import { useTerrainView } from '../../../modules/terrain/views/terrainView.ts'
import { registerAll } from '../index.ts'
import { commandOf, commands, menuEntries, runCommand } from '../registry.ts'
import { letGo, take } from '../../tools/hand.ts'

vi.mock('../../scene/Scene.tsx', () => ({ Scene: () => <div data-testid="scene" /> }))

const s = () => useApp.getState()
const ui = () => useUi.getState()
const run = (id: string) => act(async () => void runCommand(id))
const cmd = (id: string) => {
  const c = commandOf(id)
  if (!c) throw new Error(`no command ${id}`)
  return c
}
const reason = (id: string) => cmd(id).enabled?.() ?? true
const ticked = (id: string) => cmd(id).checked!()
const label = (id: string) => (typeof cmd(id).label === 'function' ? (cmd(id).label as () => string)() : (cmd(id).label as string))
const pick = (...ids: string[]) => act(() => (ids.length === 1 ? s().select(ids[0]) : s().selectMany(ids)))
const labels = (path: string[]) => menuEntries(path).flatMap((e) => (e === 'separator' ? [] : [e.label]))
/** A switch chip by its name: the one with a pressed state (a drop-down beside it may carry the same name). */
const chip = (name: string) => screen.getAllByRole('button', { name }).find((b) => b.hasAttribute('aria-pressed'))!
const setView = (view: 'plan' | '3d' | 'split') => act(() => ui().setView(view))
const toast = () => useToast.getState().toast?.text
const withTerrain = () =>
  act(() => {
    const p = s().project
    useApp.setState({ project: { ...p, site: { ...p.site, terrain: { contours: [], points: [] } } as typeof p.site } })
  })

const MAP = { source: 'street' as const, lat: 41.4, lon: 2.1, zoom: 17, image: '', width: 1, height: 1, attribution: '' }

function reset(p = demoProject()) {
  localStorage.clear()
  registerAll()
  useApp.setState({ project: p, derived: derive(p, 'o1'), history: emptyHistory(), dragStart: null, selection: NO_SELECTION, level: 'l1', showAll: false, option: 'o1' })
  useUi.setState({
    dialog: null,
    view: 'plan',
    rail: 'layers',
    panels: { left: true, right: true },
    sheet: null,
    help: false,
    docks: { drafting: 'bottom' },
    show: { kpis: true, drafting: true, tools: true },
    kpiSize: 'compact',
    theme: 'system',
  })
  useScreen.setState({ home: false, homeView: 'projects' })
  useToast.setState({ toast: null, confirmation: null })
  useAccess.setState({ picked: null, alsoGates: [] })
  letGo()
  useSnapSettings.setState({ settings: structuredClone(DEFAULT_SNAP) })
  useGraph.setState({ graph: false })
  useMapView.setState({ busy: false })
  useBuildingView.setState({ colorBy: 'program', planes: false })
  useDetail.setState({ detail: DEFAULT_DETAIL })
  useTerrainView.setState({ show: 'contours' })
  useDimensions.setState({ selected: null, also: [] })
  useWarningsPref.setState({ visible: true })
  usePlanRef.setState({ fit: null })
  useSceneRef.setState({ frame: null, capturePng: null })
  useCompare.getState().close()
  usePluginModes.setState({ soon: {} })
}

beforeEach(() => reset())
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  useCompare.getState().close()
})

describe('View', () => {
  it('its rows, in the spec’s order (Terrain only once the site has ground)', () => {
    expect(labels(['View'])).toEqual([
      'Plan',
      '3D',
      'Split',
      'Frame',
      'Panels',
      'Bars',
      'Overlays',
      'Colour by',
      'Detail',
      'Snap',
      'Snap kinds',
      'Snap to',
      'Align',
      'Ortho',
      'Grid',
      // each plugin’s two rows, as the View menu lists them today
      ...PLUGINS.flatMap((p) => [`${p.name} tabs`, `Turn the ${p.name.toLowerCase()} off`]),
      'Theme',
      'Full screen',
      'Default layout',
    ])
    withTerrain()
    expect(labels(['View']).slice(7, 10)).toEqual(['Colour by', 'Terrain', 'Detail'])
    expect(labels(['View', 'Panels'])).toEqual(['Tools', 'Layers and properties panel', 'Summary panel'])
    expect(labels(['View', 'Overlays'])).toEqual(['Graph', 'Map', 'Level planes', 'Labels', 'Dimensions', 'Issues', 'Rules', 'Issue count on the chip'])
    expect(labels(['View', 'Colour by'])).toEqual(['Program', 'Building'])
    expect(labels(['View', 'Detail'])).toEqual(['Schematic', 'Ghosted', 'Presentation'])
    expect(labels(['View', 'Terrain'])).toEqual(['Terrain off', 'Contours', 'Slope', 'Cut & fill'])
    expect(labels(['View', 'Theme'])).toEqual(['System', 'Light', 'Dark'])
  })

  it('Plan, 3D and Split: ticked by the view, they switch it, and the view switch agrees', async () => {
    render(<App />)
    expect(ticked('view.plan')).toBe(true)
    expect(ticked('view.3d')).toBe(false)
    await run('view.3d')
    expect(ui().view).toBe('3d')
    expect(ticked('view.3d')).toBe(true)
    expect(ticked('view.plan')).toBe(false)
    expect(screen.getByRole('tab', { name: '3D' })).toHaveAttribute('aria-selected', 'true')
    await run('view.split')
    expect(ui().view).toBe('split')
    expect(ticked('view.split')).toBe(true)
    await run('view.plan')
    expect(ui().view).toBe('plan')
    expect(screen.getByRole('tab', { name: 'Plan' })).toHaveAttribute('aria-selected', 'true')
    // the keys the views have (AS.1 task 4: P and 3 are gone)
    expect([cmd('view.plan').key, cmd('view.3d').key, cmd('view.split').key]).toEqual(['Alt+1', 'Alt+2', 'Alt+3'])
  })

  it('the three views are disabled while Compare is open, as the view switch is', () => {
    render(<App />)
    expect(reason('view.plan')).toBe(true)
    act(() => useCompare.getState().start(['o1']))
    for (const id of ['view.plan', 'view.3d', 'view.split']) expect(reason(id), id).toBe('Compare has its own Plan · 3D')
    expect(within(screen.getByRole('region', { name: 'Drafting' })).getByRole('tab', { name: '3D' })).toBeDisabled()
    expect(runCommand('view.3d')).toBe(false)
  })

  it('Frame fits the plan and frames the 3D, as the viewport’s Frame button; disabled with neither mounted', async () => {
    expect(reason('view.frame')).toBe('Nothing to frame')
    const fit = vi.fn()
    const frame = vi.fn()
    act(() => usePlanRef.setState({ fit }))
    expect(reason('view.frame')).toBe(true)
    act(() => useSceneRef.setState({ frame }))
    await run('view.frame')
    expect(fit).toHaveBeenCalledTimes(1)
    expect(frame).toHaveBeenCalledTimes(1)
  })

  it('Panels: the Tools strip and each side panel ticked by its state, and toggled', async () => {
    render(<App />)
    expect(ticked('view.panel.tools')).toBe(true)
    await run('view.panel.tools')
    expect(ui().show.tools).toBe(false)
    expect(ticked('view.panel.tools')).toBe(false)
    expect(screen.queryByRole('toolbar', { name: 'Tools' })).toBeNull()
    await run('view.panel.tools')
    expect(ui().show.tools).toBe(true)
    expect(ticked('view.panel.left')).toBe(true)
    await run('view.panel.left')
    expect(ui().panels.left).toBe(false)
    expect(ticked('view.panel.left')).toBe(false)
    await run('view.panel.right')
    expect(ui().panels.right).toBe(false)
    await run('view.panel.right')
    expect(ui().panels.right).toBe(true)
  })

  it('Bars: the drafting bar and the KPI strip (and its sizes) tick and toggle; each bar docks above or below (the strip’s own row is View › Panels › Tools; its strip’s five places are Tools strip ▸)', async () => {
    expect(labels(['View', 'Bars'])).toEqual(['Drafting bar', 'KPI strip', 'KPI strip: Full', 'KPI strip: Medium', 'KPI strip: Compact', 'Dock the drafting bar above', 'Tools strip'])
    expect(commandOf('view.bar.tools')).toBeUndefined()
    expect(ticked('view.bar.drafting')).toBe(true)
    await run('view.bar.drafting')
    expect(ui().show.drafting).toBe(false)
    expect(ticked('view.bar.drafting')).toBe(false)
    await run('view.bar.kpis')
    expect(ui().show.kpis).toBe(false)
    // a size shows the strip too
    expect(ticked('view.kpi-size.compact')).toBe(false)
    await run('view.kpi-size.full')
    expect(ui().show.kpis).toBe(true)
    expect(ui().kpiSize).toBe('full')
    expect(ticked('view.kpi-size.full')).toBe(true)
    expect(ticked('view.kpi-size.compact')).toBe(false)
    // the docks say where the bar would go
    expect(label('view.dock.drafting')).toBe('Dock the drafting bar above')
    await run('view.dock.drafting')
    expect(ui().docks.drafting).toBe('top')
    expect(label('view.dock.drafting')).toBe('Dock the drafting bar below')
    // the tools bar is gone: its dock has no row
    expect(commandOf('view.dock.tools')).toBeUndefined()
  })

  it('Overlays: Graph, Level planes, Labels, Dimensions, Issues and Rules toggle what they toggled as chips of the drafting bar (an eye of Layers now)', async () => {
    render(<App />)
    // the drafting bar has no Overlays menu any more (Phase AS.3)
    expect(screen.queryByRole('button', { name: 'Overlays' })).toBeNull()
    await run('view.overlay.graph')
    expect(useGraph.getState().graph).toBe(true)
    expect(ticked('view.overlay.graph')).toBe(true)
    await run('view.overlay.planes')
    expect(useBuildingView.getState().planes).toBe(true)
    expect(ticked('view.overlay.planes')).toBe(true)
    await run('view.overlay.labels')
    expect(isHidden(LABELS)).toBe(true)
    expect(ticked('view.overlay.labels')).toBe(false)
    await run('view.overlay.dims')
    expect(isHidden(DIMENSIONS)).toBe(true)
    expect(ticked('view.overlay.dims')).toBe(false)
    await run('view.overlay.issues')
    expect(isHidden(ISSUES)).toBe(true)
    expect(ticked('view.overlay.issues')).toBe(false)
    expect(ticked('view.overlay.rules')).toBe(true)
    await run('view.overlay.rules')
    expect(isHidden(RULES)).toBe(true)
    expect(ticked('view.overlay.rules')).toBe(false)
    // the issue count on the chip
    await run('view.overlay.issue-count')
    expect(useWarningsPref.getState().visible).toBe(false)
    expect(ticked('view.overlay.issue-count')).toBe(false)
    // the graph has no key (G is the Gate's)
    expect(cmd('view.overlay.graph').key).toBeUndefined()
  })

  it('the overlays of the plan are disabled in the 3D alone, and Labels with Schematic detail, as their chips were', () => {
    for (const id of ['view.overlay.labels', 'view.overlay.dims', 'view.overlay.issues', 'view.overlay.rules']) expect(reason(id), id).toBe(true)
    // the 3D draws the graph and the level planes
    setView('3d')
    for (const id of ['view.overlay.labels', 'view.overlay.dims', 'view.overlay.issues', 'view.overlay.rules']) expect(reason(id), id).toBe('The plan is not on screen')
    expect(reason('view.overlay.graph')).toBe(true)
    expect(reason('view.overlay.planes')).toBe(true)
    setView('plan')
    act(() => useDetail.getState().setDetail('schematic'))
    expect(reason('view.overlay.labels')).toBe('Schematic draws no labels')
    expect(ticked('view.overlay.labels')).toBe(false)
  })

  it('Map: captures it where there is none and the site is located, toggles it where there is one; disabled with neither', async () => {
    expect(reason('view.overlay.map')).toBe('The map needs the site’s location')
    expect(ticked('view.overlay.map')).toBe(false)
    act(() => s().apply((p) => ({ ...p, site: { ...p.site, geo: { lat: 41.4, lon: 2.1, north: 0 } } })))
    expect(reason('view.overlay.map')).toBe(true)
    act(() => s().apply((p) => ({ ...p, site: { ...p.site, map: MAP } })))
    expect(ticked('view.overlay.map')).toBe(true)
    await run('view.overlay.map')
    expect(isHidden(MAP_KEY)).toBe(true)
    expect(ticked('view.overlay.map')).toBe(false)
  })

  it('Colour by: Program and Building, ticked by the view state', async () => {
    expect(ticked('view.colour.program')).toBe(true)
    await run('view.colour.building')
    expect(useBuildingView.getState().colorBy).toBe('building')
    expect(ticked('view.colour.building')).toBe(true)
    expect(ticked('view.colour.program')).toBe(false)
  })

  it('Terrain ▸ lists the ground’s looks only while the terrain module is on, and the tick follows; Detail ▸ always', async () => {
    expect(commandOf('view.terrain.slope')).toBeUndefined()
    withTerrain()
    expect(ticked('view.terrain.contours')).toBe(true)
    await run('view.terrain.slope')
    expect(useTerrainView.getState().show).toBe('slope')
    expect(ticked('view.terrain.slope')).toBe(true)
    expect(ticked('view.terrain.contours')).toBe(false)
    expect(ticked(`view.detail.${DEFAULT_DETAIL}`)).toBe(true)
    await run('view.detail.schematic')
    expect(useDetail.getState().detail).toBe('schematic')
    expect(ticked('view.detail.presentation')).toBe(false)
  })

  it('Snap, Align, Ortho and Grid: ticked by the settings, toggled, and the bar’s chips agree; the plan’s three rest in the 3D', async () => {
    render(<App />)
    expect(ticked('view.snap')).toBe(DEFAULT_SNAP.on)
    await run('view.snap')
    expect(useSnapSettings.getState().settings.on).toBe(!DEFAULT_SNAP.on)
    expect(chip('Snap')).toHaveAttribute('aria-pressed', String(!DEFAULT_SNAP.on))
    await run('view.ortho')
    expect(useSnapSettings.getState().settings.ortho).toBe(!DEFAULT_SNAP.ortho)
    await run('view.grid')
    expect(useSnapSettings.getState().settings.grid).toBe(!DEFAULT_SNAP.grid)
    expect(chip('Grid')).toHaveAttribute('aria-pressed', String(!DEFAULT_SNAP.grid))
    await run('view.align')
    expect(useSnapSettings.getState().settings.align).toBe(!DEFAULT_SNAP.align)
    expect(ticked('view.align')).toBe(!DEFAULT_SNAP.align)
    expect([cmd('view.snap').key, cmd('view.ortho').key, cmd('view.grid').key]).toEqual(['F3', 'F8', 'F9'])
    setView('3d')
    for (const id of ['view.snap', 'view.align', 'view.ortho']) expect(reason(id), id).toBe('The plan is not on screen')
    expect(chip('Snap')).toBeDisabled()
    // the Grid chip stays enabled in the 3D
    expect(reason('view.grid')).toBe(true)
    expect(chip('Grid')).not.toBeDisabled()
  })

  it('the snap’s kinds and what else it snaps to are ticks of their own', async () => {
    expect(labels(['View', 'Snap kinds'])).toEqual(['Endpoint', 'Midpoint', 'Intersection', 'Perpendicular', 'Center', 'Quadrant', 'Nearest'])
    expect(labels(['View', 'Snap to'])).toEqual(['Drawing lines', 'Reference lines', 'Contours'])
    const was = useSnapSettings.getState().settings
    expect(ticked('view.snap-kind.midpoint')).toBe(was.kinds.midpoint)
    await run('view.snap-kind.midpoint')
    expect(useSnapSettings.getState().settings.kinds.midpoint).toBe(!was.kinds.midpoint)
    await run('view.snap-to.contours')
    expect(useSnapSettings.getState().settings.to.contours).toBe(!was.to.contours)
  })

  it('Theme ▸ ticks the choice and sets it', async () => {
    expect(ticked('view.theme.system')).toBe(true)
    await run('view.theme.dark')
    expect(ui().theme).toBe('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(ticked('view.theme.dark')).toBe(true)
    expect(ticked('view.theme.system')).toBe(false)
    await run('view.theme.system')
    expect(document.documentElement.dataset.theme).toBeUndefined()
  })

  it('Full screen: refused with its reason where the browser has none, else it toggles; Ctrl+Shift+F is its key', async () => {
    expect(cmd('view.fullscreen').key).toBe('Ctrl+Shift+F')
    expect(reason('view.fullscreen')).toBe('Full screen is not available here')
    expect(runCommand('view.fullscreen')).toBe(false)
    const request = vi.fn(() => Promise.resolve())
    Object.defineProperty(document, 'fullscreenEnabled', { value: true, configurable: true })
    Object.defineProperty(document.documentElement, 'requestFullscreen', { value: request, configurable: true })
    try {
      expect(reason('view.fullscreen')).toBe(true)
      await run('view.fullscreen')
      expect(request).toHaveBeenCalledTimes(1)
    } finally {
      Reflect.deleteProperty(document, 'fullscreenEnabled')
      Reflect.deleteProperty(document.documentElement, 'requestFullscreen')
    }
  })

  it('Default layout puts the panels and bars back', async () => {
    act(() => {
      ui().setPanel('left', false)
      ui().setShow('drafting', false)
      ui().setDock('drafting', 'top')
    })
    await run('view.default-layout')
    expect(ui().panels.left).toBe(true)
    expect(ui().show.drafting).toBe(true)
    expect(ui().docks.drafting).toBe('bottom')
  })

  it('a plugin held back shows its two rows disabled with the notice; a plugin that is back toggles its tabs and its power', async () => {
    const rows = () => commands().filter((c) => c.id.startsWith('view.plugin.'))
    expect(rows().length).toBeGreaterThan(0)
    expect(rows().map((c) => c.id)).toContain('view.plugin.optimizer.tabs')
    expect(reason('view.plugin.optimizer.tabs')).toBe(true)
    await run('view.plugin.optimizer.power')
    expect(usePluginModes.getState().modes.optimizer).toBe('off')
    expect(label('view.plugin.optimizer.power')).toBe('Turn the optimizer on')
    expect(reason('view.plugin.optimizer.tabs')).toBe('The optimizer is off')
    await run('view.plugin.optimizer.power')
    expect(usePluginModes.getState().modes.optimizer).toBe('on')
    act(() => usePluginModes.setState({ soon: { optimizer: 'Optimizer: in progress, available soon' } }))
    expect(reason('view.plugin.optimizer.tabs')).toBe('Optimizer: in progress, available soon')
    expect(reason('view.plugin.optimizer.power')).toBe('Optimizer: in progress, available soon')
    expect(label('view.plugin.optimizer.tabs')).toBe('Optimizer tabs: coming soon')
    expect(runCommand('view.plugin.optimizer.power')).toBe(false)
  })
})

describe('Site', () => {
  it('its commands, in the spec’s order (Terrain… only once the site has ground)', () => {
    expect(labels(['Site'])).toEqual(['Import…', 'Draw boundary', 'Place map', 'Location…', 'Site rules…', 'Move grid pivot', 'Restore the grid'])
    withTerrain()
    expect(labels(['Site'])).toEqual(['Import…', 'Draw boundary', 'Place map', 'Location…', 'Site rules…', 'Terrain…', 'Move grid pivot', 'Restore the grid'])
  })

  it('Import… opens the file picker, as the Import button does', async () => {
    const click = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {})
    await run('site.import')
    expect(click).toHaveBeenCalledTimes(1)
  })

  it('Draw boundary takes the Draw tool and leaves the panel as it was; again, it lets it go', async () => {
    render(<App />)
    expect(ui().rail).toBe('layers')
    await run('site.draw')
    expect(ui().rail).toBe('layers')
    expect(useSiteTool.getState().tool).toBe('draw')
    expect(ticked('site.draw')).toBe(true)
    // a Site tool is in no group of the strip: no button is pressed, not even Select or the mass's Draw
    expect(within(screen.getByRole('toolbar', { name: 'Tools' })).getAllByRole('button').filter((b) => b.getAttribute('aria-pressed') === 'true')).toEqual([])
    await run('site.draw')
    expect(useSiteTool.getState().tool).toBeNull()
    expect(ticked('site.draw')).toBe(false)
  })

  it('Place map needs the map under the plan, then takes the Place tool', async () => {
    expect(reason('site.place-map')).toBe('No map under the plan yet')
    act(() => s().apply((p) => ({ ...p, site: { ...p.site, map: MAP } })))
    expect(reason('site.place-map')).toBe(true)
    await run('site.place-map')
    expect(ui().rail).toBe('layers')
    expect(useSiteTool.getState().tool).toBe('place')
    expect(ticked('site.place-map')).toBe(true)
  })

  it('Location… and Site rules… pick the Site row of Layers and show Properties (the row’s settings: Phase AS.3)', async () => {
    act(() => ui().setRail('layers'))
    await run('site.location')
    expect(ui().rail).toBe('properties')
    expect(useLayerPick.getState().keys).toEqual(['site'])
    act(() => ui().setRail('layers'))
    useLayerPick.getState().clear()
    await run('site.rules')
    expect(ui().rail).toBe('properties')
    expect(useLayerPick.getState().keys).toEqual(['site'])
  })

  it('Terrain… picks the Terrain row, its Site branch unfolded', async () => {
    withTerrain()
    await run('site.terrain')
    expect(ui().rail).toBe('properties')
    expect(useLayerPick.getState().keys).toEqual(['terrain'])
    expect(useLayerView.getState().folded).toEqual(['site'])
  })

  it('a hidden left panel comes back for Location…: its tab would have been clicked', async () => {
    act(() => ui().setPanel('left', false))
    await run('site.location')
    expect(ui().panels.left).toBe(true)
  })

  it('Move grid pivot toggles the Grid tool (disabled in the 3D, as the Grid menu’s button); Restore the grid turns it back', async () => {
    await run('site.grid-pivot')
    expect(useSiteTool.getState().tool).toBe('grid')
    expect(ticked('site.grid-pivot')).toBe(true)
    await run('site.grid-pivot')
    expect(useSiteTool.getState().tool).toBeNull()
    act(() => s().apply((p) => actions.updateGrid(p, 'o1', { angle: 17 })))
    expect(s().project.grid?.angle).toBe(17)
    await run('site.restore-grid')
    expect(s().project.grid?.angle).not.toBe(17)
    setView('3d')
    expect(reason('site.grid-pivot')).toBe('The plan is not on screen')
    expect(reason('site.restore-grid')).toBe(true)
  })
})

describe('Design', () => {
  it('its commands, in the spec’s order', () => {
    expect(labels(['Design'])).toEqual(['Options', 'Brief…', 'Rules…', 'Levels…', 'New building', 'Solve all'])
    expect(labels(['Design', 'Options'])).toEqual(['Option 1', 'New', 'Duplicate', 'Rename…', 'Delete', 'Compare…'])
  })

  it('Options ▸ lists the project’s options, the active one ticked, and follows the project', async () => {
    expect(ticked('design.option.go.o1')).toBe(true)
    await run('design.option.new')
    expect(s().project.options).toHaveLength(2)
    const second = s().project.options[1]
    expect(s().option).toBe(second.id)
    expect(commandOf(`design.option.go.${second.id}`)).toBeDefined()
    expect(ticked(`design.option.go.${second.id}`)).toBe(true)
    expect(ticked('design.option.go.o1')).toBe(false)
    expect(labels(['Design', 'Options']).slice(0, 2)).toEqual(['Option 1', second.name])
    await run('design.option.go.o1')
    expect(s().option).toBe('o1')
    expect(ticked('design.option.go.o1')).toBe(true)
  })

  it('Duplicate copies the active option, linked; Delete refuses the only one and removes another', async () => {
    expect(reason('design.option.delete')).toBe('The only option')
    expect(runCommand('design.option.delete')).toBe(false)
    await run('design.option.duplicate')
    expect(s().project.options).toHaveLength(2)
    expect(reason('design.option.delete')).toBe(true)
    const was = s().option
    await run('design.option.delete')
    expect(s().project.options.some((o) => o.id === was)).toBe(false)
  })

  it('Compare… needs two options, then opens and closes the comparison', async () => {
    expect(reason('design.option.compare')).toBe('Make a second option to compare')
    await run('design.option.new')
    expect(reason('design.option.compare')).toBe(true)
    expect(ticked('design.option.compare')).toBe(false)
    await run('design.option.compare')
    expect(useCompare.getState().open).toBe(true)
    expect(ticked('design.option.compare')).toBe(true)
    await run('design.option.compare')
    expect(useCompare.getState().open).toBe(false)
  })

  it('Rename… opens the option switch on its name field, as the switch’s own Rename… does', async () => {
    render(<App />)
    expect(screen.queryByLabelText('Option name')).toBeNull()
    await run('design.option.rename')
    const field = await screen.findByLabelText('Option name')
    expect(field).toHaveValue('Option 1')
  })

  it('Brief… and Rules… open the windows; Levels… shows the levels of the building the plan is on in Properties', async () => {
    await run('design.brief')
    expect(ui().dialog).toBe('brief')
    act(() => ui().closeDialog())
    await run('design.rules')
    expect(ui().dialog).toBe('rules')
    act(() => {
      ui().closeDialog()
      ui().setRail('layers')
    })
    await run('design.levels')
    // the Properties of the building the plan is on: its levels (Phase AS.3)
    expect(ui().rail).toBe('properties')
    expect(useLayerPick.getState().keys).toEqual(['building:b1'])
  })

  it('Solve all does what the Issues tab’s button does, Ctrl+Enter is its key, and it is greyed as the button is', async () => {
    render(<App />)
    act(() => ui().setSummaryTab('issues'))
    expect(cmd('design.solve').key).toBe('Ctrl+Enter')
    expect(reason('design.solve')).toBe(true)
    expect(screen.getByRole('button', { name: 'Solve all' })).not.toBeDisabled()
    await run('design.solve')
    expect(toast()).toMatch(/^Solved/)
    // no issue its Solve can settle: the button rests, and so does the command
    act(() => useApp.setState({ derived: { ...s().derived, issues: [] } }))
    expect(reason('design.solve')).toBe('Nothing here Solve can settle')
    expect(screen.getByRole('button', { name: 'Solve all' })).toBeDisabled()
    expect(runCommand('design.solve')).toBe(false)
  })
})

describe('Tools: general', () => {
  it('its rows: the seven general tools, then the groups', () => {
    expect(labels(['Tools'])).toEqual(['Select', 'Move', 'Copy', 'Rotate', 'Mirror', 'Array', 'Align', 'Massing', 'Elements', 'Streets', 'Parking', 'Annotations'])
    expect(labels(['Tools', 'Massing'])).toEqual(['Draw', 'Hole', 'Corner', 'Chamfer', 'Split', 'Union'])
    expect(labels(['Tools', 'Elements'])).toEqual(['Dock', 'Door', 'Pattern', 'Court'])
    expect(labels(['Tools', 'Streets'])).toEqual(['Street', 'Gate', 'Existing road', 'Connect'])
    expect(labels(['Tools', 'Parking'])).toEqual(['Lot'])
    expect(labels(['Tools', 'Annotations'])).toEqual(['Dimension', 'Ruler', 'Reference line', 'Note'])
  })

  it('Select is the tool in hand at first, and the strip’s button agrees', async () => {
    render(<App />)
    expect(ticked('tool.select')).toBe(true)
    expect(chip('Select')).toHaveAttribute('aria-pressed', 'true')
    pick('m1')
    await run('tool.move')
    expect(ticked('tool.select')).toBe(false)
    expect(chip('Select')).toHaveAttribute('aria-pressed', 'false')
    await run('tool.select')
    expect(useTool.getState().tool).toBe('select')
    expect(ticked('tool.select')).toBe(true)
  })

  it('Move, Copy, Rotate, Mirror, Array and Align: “Pick something first” with nothing picked; picked, they start, and again goes back to Select', async () => {
    render(<App />)
    for (const [id, name] of [['tool.move', 'Move'], ['tool.copy', 'Copy'], ['tool.rotate', 'Rotate'], ['tool.mirror', 'Mirror'], ['tool.array', 'Array'], ['tool.align', 'Align']] as const) {
      expect(reason(id), id).toBe('Pick something first')
      expect(chip(name)).toBeDisabled()
      expect(runCommand(id)).toBe(false)
    }
    pick('m1')
    for (const [id, name, tool] of [['tool.move', 'Move', 'move'], ['tool.copy', 'Copy', 'copy'], ['tool.rotate', 'Rotate', 'rotate'], ['tool.mirror', 'Mirror', 'mirror'], ['tool.array', 'Array', 'array'], ['tool.align', 'Align', 'align']] as const) {
      expect(reason(id), id).toBe(true)
      expect(chip(name)).not.toBeDisabled()
      expect(ticked(id)).toBe(false)
      await run(id)
      expect(useTool.getState().tool).toBe(tool)
      expect(ticked(id)).toBe(true)
      expect(chip(name)).toHaveAttribute('aria-pressed', 'true')
      await run(id)
      expect(useTool.getState().tool).toBe('select')
      expect(ticked(id)).toBe(false)
    }
    expect([cmd('tool.select').key, cmd('tool.move').key, cmd('tool.copy').key, cmd('tool.rotate').key, cmd('tool.mirror').key, cmd('tool.array').key, cmd('tool.align').key]).toEqual(['V', 'M', 'C', 'R', 'I', 'A', 'Shift+A'])
  })

  it('Move, Copy, Rotate, Mirror, Array and Align rest in the 3D (“The plan is not on screen”), as the chips do', () => {
    render(<App />)
    pick('m1')
    setView('3d')
    for (const [id, name] of [['tool.move', 'Move'], ['tool.copy', 'Copy'], ['tool.rotate', 'Rotate'], ['tool.mirror', 'Mirror'], ['tool.array', 'Array'], ['tool.align', 'Align']] as const) {
      expect(reason(id), id).toBe('The plan is not on screen')
      expect(chip(name)).toBeDisabled()
    }
  })

  it('a general tool lets the others go: the ruler, an access tool and a site tool', async () => {
    pick('m1')
    take('ruler')
    await run('tool.move')
    expect(useRuler.getState().active).toBe(false)
    take('gate')
    await run('tool.move')
    expect(useAccess.getState().tool).toBeNull()
    take('draw')
    await run('tool.select')
    expect(useSiteTool.getState().tool).toBeNull()
  })
})

describe('Tools: Massing, Streets, Parking, Annotations', () => {
  it('Draw, Hole and Corner take their tool with the Flow tab open and it stays, and again go back to Select; the strip’s button agrees', async () => {
    render(<App />)
    act(() => ui().setRail('layers'))
    await run('tool.mass')
    expect(ui().rail).toBe('layers')
    expect(useTool.getState().tool).toBe('mass')
    expect(ticked('tool.mass')).toBe(true)
    expect(screen.getByRole('button', { name: 'Draw' })).toHaveAttribute('aria-pressed', 'true')
    await run('tool.hole')
    expect(useTool.getState().tool).toBe('hole')
    expect(ticked('tool.mass')).toBe(false)
    await run('tool.corner')
    expect(useTool.getState().tool).toBe('corner')
    await run('tool.corner')
    expect(useTool.getState().tool).toBe('select')
    await run('tool.chamfer')
    expect(useTool.getState().tool).toBe('chamfer')
    await run('tool.chamfer')
    expect(useTool.getState().tool).toBe('select')
    expect([cmd('tool.mass').key, cmd('tool.hole').key, cmd('tool.corner').key, cmd('tool.chamfer').key]).toEqual(['B', 'H', 'F', 'Shift+F'])
  })

  it('a tool of the plan leaves the Properties rail alone', async () => {
    act(() => ui().setRail('properties'))
    await run('tool.mass')
    expect(ui().rail).toBe('properties')
    expect(useTool.getState().tool).toBe('mass')
  })

  it('the plan’s drawing tools rest in the 3D and with Compare open, as the strip’s buttons do', () => {
    render(<App />)
    act(() => ui().setRail('layers'))
    expect(reason('tool.mass')).toBe(true)
    setView('3d')
    for (const id of ['tool.mass', 'tool.hole', 'tool.corner', 'tool.chamfer', 'tool.street', 'tool.lot', 'tool.connect']) expect(reason(id), id).toBe('The plan is not on screen')
    expect(screen.getByRole('button', { name: 'Draw' })).toBeDisabled()
    expect(runCommand('tool.mass')).toBe(false)
    setView('plan')
    act(() => useCompare.getState().start(['o1']))
    expect(reason('tool.mass')).toBe('Close Compare first')
    expect(screen.getByRole('button', { name: 'Draw' })).toBeDisabled()
  })

  it('Union is Merge, moved: it merges masses that touch; it stands in the strip but is no tool in hand', async () => {
    expect(commandOf('edit.merge')).toBeUndefined()
    expect(cmd('tool.union').menu).toEqual(['Tools', 'Massing'])
    expect(cmd('tool.union').tool).toMatchObject({ group: 'massing', icon: 'union', once: true })
    expect(cmd('tool.union').checked).toBeUndefined()
    expect(reason('tool.union')).toBe('Select two or more blocks that touch to merge them')
    act(() => {
      s().apply((p) => actions.addMass(p, { programId: 'warehouse', footprint: { kind: 'rect', center: { x: 225, y: 130 }, width: 30, depth: 40, rotation: 0 }, name: 'A', height: 14 }).project)
      s().apply((p) => actions.addMass(p, { programId: 'warehouse', footprint: { kind: 'rect', center: { x: 225, y: 100 }, width: 30, depth: 20, rotation: 0 }, name: 'B', height: 14 }).project)
    })
    const [a, b] = s().project.masses.slice(-2).map((m) => m.id)
    pick(a, b)
    const n = s().project.masses.length
    await run('tool.union')
    expect(s().project.masses.length).toBe(n - 1)
    expect(toast()).toBe('2 blocks merged into one.')
    expect(cmd('tool.union').key).toBe('U')
  })

  it('Street takes the tool; Gate and Existing road need a boundary; none changes the panel', async () => {
    render(<App />)
    await run('tool.street')
    expect(ui().rail).toBe('layers')
    expect(useTool.getState().tool).toBe('street')
    expect(ticked('tool.street')).toBe(true)
    expect(cmd('tool.street').key).toBe('W')
    await run('tool.gate')
    expect(useAccess.getState().tool).toBe('gate')
    expect(useTool.getState().tool).toBe('select')
    expect(ticked('tool.gate')).toBe(true)
    expect(ticked('tool.street')).toBe(false)
    expect(within(screen.getByRole('toolbar', { name: 'Tools' })).getByRole('button', { name: 'Gate' })).toHaveAttribute('aria-pressed', 'true')
    await run('tool.gate')
    expect(useAccess.getState().tool).toBeNull()
    await run('tool.existing-road')
    expect(ui().rail).toBe('layers')
    expect(useAccess.getState().tool).toBe('existing')
    expect(ticked('tool.existing-road')).toBe(true)
    expect(ticked('tool.gate')).toBe(false)
  })

  it('without a boundary, Gate, Existing road and Connect say so', () => {
    act(() => s().apply((p) => ({ ...p, site: { ...p.site, boundary: null } })))
    expect(s().derived.site.polygon).toBeNull()
    for (const id of ['tool.gate', 'tool.existing-road', 'tool.connect']) expect(reason(id), id).toBe('The site needs a boundary first')
    expect(reason('tool.street')).toBe(true)
  })

  it('Connect does what the Connect button does: it connects the courts and says what it did', async () => {
    await run('tool.connect')
    expect(toast()).toMatch(/Connect|Every truck court/)
  })

  it('Lot (parking) takes the tool and leaves the panel as it was, while the typology offers parking', async () => {
    await run('tool.lot')
    expect(ui().rail).toBe('layers')
    expect(useTool.getState().tool).toBe('lot')
    expect(ticked('tool.lot')).toBe(true)
    expect(cmd('tool.lot').key).toBe('P')
  })

  it('Split stands after Chamfer in Massing while the typology offers the docks', () => {
    expect(commandOf('tool.split')).toBeDefined()
    const massing = labels(['Tools', 'Massing'])
    expect(massing.indexOf('Split')).toBe(massing.indexOf('Chamfer') + 1)
  })

  it('Lot and the elements are not listed where the typology does not offer their module', () => {
    const bare = { ...TYPOLOGIES[0], id: 'bare-test', modules: [] as string[] }
    TYPOLOGIES.push(bare)
    try {
      act(() => useApp.setState({ project: { ...s().project, typology: 'bare-test' } }))
      expect(commandOf('tool.lot')).toBeUndefined()
      expect(commandOf('tool.dock')).toBeUndefined()
      // Split cuts a truck court: it is the docks module's tool (review S7)
      expect(commandOf('tool.split')).toBeUndefined()
      expect(labels(['Tools'])).toEqual(['Select', 'Move', 'Copy', 'Rotate', 'Mirror', 'Array', 'Align', 'Massing', 'Streets', 'Annotations'])
    } finally {
      TYPOLOGIES.pop()
    }
  })

  it('Dimension and Ruler: the drafting bar’s chips, in every step; they rest in the 3D', async () => {
    render(<App />)
    act(() => ui().setRail('layers'))
    await run('tool.dimension')
    expect(useTool.getState().tool).toBe('dimension')
    expect(ui().rail).toBe('layers')
    expect(ticked('tool.dimension')).toBe(true)
    expect(chip('Dimension')).toHaveAttribute('aria-pressed', 'true')
    await run('tool.ruler')
    expect(useRuler.getState().active).toBe(true)
    expect(useTool.getState().tool).toBe('select')
    expect(ticked('tool.ruler')).toBe(true)
    expect(ticked('tool.dimension')).toBe(false)
    expect(chip('Ruler')).toHaveAttribute('aria-pressed', 'true')
    await run('tool.ruler')
    expect(useRuler.getState().active).toBe(false)
    expect([cmd('tool.dimension').key, cmd('tool.ruler').key]).toEqual(['D', 'T'])
    setView('3d')
    expect(reason('tool.dimension')).toBe('The plan is not on screen')
    expect(reason('tool.ruler')).toBe('The plan is not on screen')
    expect(chip('Ruler')).toBeDisabled()
  })
})

describe('Tools: Elements (the warehouse module’s)', () => {
  beforeEach(() => {
    const p = sampleProject()
    const option = p.options.find((o) => p.buildings.some((b) => o.buildingIds.includes(b.id) && b.warehouse))!
    const copy = p.buildings.find((b) => option.buildingIds.includes(b.id) && b.warehouse)!
    useApp.setState({ project: p, derived: derive(p, option.id), history: emptyHistory(), selection: NO_SELECTION, option: option.id, level: copy.levels[0].id })
  })

  const hallOfFirstBlock = () => {
    const { project: p, option } = s()
    const ids = p.options.find((o) => o.id === option)!.buildingIds
    const b = p.buildings.find((x) => x.warehouse && ids.includes(x.id))!
    const levels = new Set(b.levels.map((l) => l.id))
    return p.masses.find((m) => m.part === 'hall' && levels.has(m.levelId))!.id
  }

  it('need a placed block picked (“Pick a placed block first”), and rest in the 3D; the strip’s buttons agree', async () => {
    render(<App />)
    const ids = ['tool.dock', 'tool.door', 'tool.pattern', 'tool.court']
    for (const id of ids) {
      expect(reason(id), id).toBe('Pick a placed block first')
      expect(runCommand(id)).toBe(false)
    }
    pick(hallOfFirstBlock())
    for (const [id, name] of [['tool.dock', 'Dock'], ['tool.door', 'Door'], ['tool.pattern', 'Pattern'], ['tool.court', 'Court']] as const) {
      expect(reason(id), id).toBe(true)
      expect(chip(name)).not.toBeDisabled()
      expect(ticked(id)).toBe(false)
    }
    await run('tool.dock')
    expect(useSiteBlock.getState().tool).toBe('dock')
    expect(ticked('tool.dock')).toBe(true)
    expect(chip('Dock')).toHaveAttribute('aria-pressed', 'true')
    await run('tool.court')
    expect(useSiteBlock.getState().tool).toBe('court')
    expect(ticked('tool.dock')).toBe(false)
    await run('tool.court')
    expect(useSiteBlock.getState().tool).toBeNull()
    setView('3d')
    for (const id of ids) expect(reason(id), id).toBe('The plan is not on screen')
  })

  it('their owner is the warehouse module: they carry the strip’s group, the icons their buttons use and the sentence of each', () => {
    expect(['tool.dock', 'tool.door', 'tool.pattern', 'tool.court'].map((id) => cmd(id).tool)).toEqual([
      { group: 'elements', icon: 'dock', hint: expect.stringMatching(/^Docks, one a module/) },
      { group: 'elements', icon: 'door', hint: expect.stringMatching(/^Level doors, one a module/) },
      { group: 'elements', icon: 'pattern', hint: expect.stringMatching(/^A mark of your own/) },
      { group: 'elements', icon: 'truck', hint: expect.stringMatching(/^A truck court in front of a wall/) },
    ])
    expect(cmd('tool.lot').tool).toEqual({ group: 'parking', icon: 'parking', hint: expect.stringMatching(/^A parking lot/) })
  })
})

describe('Tools: every tool command can be in hand', () => {
  const GROUP_MENU = { general: ['Tools'], massing: ['Tools', 'Massing'], elements: ['Tools', 'Elements'], streets: ['Tools', 'Streets'], parking: ['Tools', 'Parking'], annotations: ['Tools', 'Annotations'] }

  it('a command with a `tool` has a hint and a known icon; one that is not `once` has a tick and stands in its group’s sub-menu', () => {
    const tools = commands().filter((c) => c.tool)
    expect(tools.length).toBeGreaterThanOrEqual(18)
    for (const c of tools) {
      expect(c.tool!.hint, `${c.id} needs a hint`).toBeTruthy()
      expect(ICON_PATHS[c.tool!.icon], `${c.id}: ${c.tool!.icon}`).toBeTruthy()
      if (c.tool!.once) {
        expect(c.checked, `${c.id} is never in hand`).toBeUndefined()
        continue
      }
      expect(c.checked, `${c.id} needs checked()`).toBeTypeOf('function')
      expect(c.menu, c.id).toEqual(GROUP_MENU[c.tool!.group])
      expect(c.id.startsWith('tool.'), c.id).toBe(true)
    }
  })

  it('a `once` command stands in the strip but keeps its menu: Union and Connect in Tools, Group (the one outside Tools) in Edit', () => {
    const once = commands().filter((c) => c.tool?.once)
    expect(once.map((c) => c.id).sort()).toEqual(['edit.group', 'tool.connect', 'tool.union'])
    expect(cmd('edit.group').menu).toEqual(['Edit'])
    expect(cmd('edit.group').tool).toMatchObject({ group: 'general', icon: 'group' })
    expect(cmd('tool.connect').tool).toMatchObject({ group: 'streets', icon: 'link' })
    expect(commands().filter((c) => c.tool && c.menu[0] !== 'Tools').map((c) => c.id)).toEqual(['edit.group'])
  })

  it('no two tools are in hand at once: whichever is taken last is the only tick', async () => {
    pick('m1')
    const ids = ['tool.select', 'tool.move', 'tool.mass', 'tool.street', 'tool.gate', 'tool.existing-road', 'tool.lot', 'tool.dimension', 'tool.ruler']
    for (const id of ids) {
      await run(id)
      const on = commands().filter((c) => c.tool && !c.tool.once && c.checked!())
      expect(on.map((c) => c.id), id).toEqual([id])
    }
  })
})
