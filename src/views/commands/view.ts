// The View menu's commands (Project C, AS.1): the viewport's three views and Frame, the panels and bars, the overlays
// (eyes of Layers since Phase AS.3; the bottom bar's Overlays ▾ went), Colour by, the terrain's and the detail's looks (the drafting bar's two selects), the
// snap and its kinds, Align, Ortho, Grid, the plugins' rows (as the View menu lists them), the theme, Full screen and
// Default layout. Panels holds Tools (the strip, `show.tools`), Layers and properties and Summary; Bars holds, after the bars' docks, Tools
// strip ▸ (where the strip stands: five places, ticked). Each `run` calls what the control it stands for calls (the view switch's `setView`, the viewport's
// Frame, the chips' store verbs, `toggleMap`, `togglePanel`, `pickKpiSize`…): this file is a label, a key, a tick and a
// reason, never a second body. Keys (spec "Shortcuts"): Plan, 3D and Split Alt+1, Alt+2, Alt+3; Frame Z; Snap, Ortho and
// Grid F3, F8, F9 as AutoCAD; Full screen Ctrl+Shift+F (it answers on Home too, where its button is). The graph has none.
// What the plan alone shows is disabled in the 3D view alone with "The plan is not on screen", as its chip is.
// The terrain's looks stand there only while the terrain module is on (the drafting bar's row does the same); the
// plugins' rows come from `src/plugins/index.ts`, disabled with the "coming soon" notice while held back.
import { isOn } from '../../modules/catalog.ts'
import { TERRAIN_SHOWS, useTerrainView } from '../../modules/terrain/views/terrainView.ts'
import { modeOf, PLUGINS, usePluginModes } from '../../plugins/index.ts'
import { useApp } from '../../state/store.ts'
import { COLOR_BY, useBuildingView } from '../buildingView.ts'
import { useCompare } from '../compare/compareView.ts'
import { DETAILS, useDetail } from '../detail.ts'
import { useGraph } from '../graph/graphState.ts'
import { DIMENSIONS, ISSUES, LABELS, RULES } from '../layers/keys.ts'
import { isHidden, toggleLayer } from '../layers/layerView.ts'
import { fullScreenAvailable, toggleFullScreen } from '../layout/fullScreen.ts'
import { isPhone } from '../layout/media.ts'
import { THEMES } from '../layout/theme.ts'
import { BARS, KPI_SIZES, PANEL_NAMES, panelOpen, pickKpiSize, shown, STRIP_DOCKS, togglePanel, useUi, VIEWS, type Side } from '../layout/ui.ts'
import { mapRefusal, mapShown, toggleMap } from '../plan/site/mapView.ts'
import { SNAP_KINDS, SNAP_NAMES, SNAP_TO, SNAP_TO_NAMES } from '../plan/snap/kinds.ts'
import { useSnapSettings, type SnapSwitch } from '../plan/snap/settings.ts'
import { PLAN_OFF } from '../tools/pickTool.ts'
import { useWarningsPref } from '../stats/warningsPref.ts'
import { frameModel, frameRefusal } from '../viewport/frame.ts'
import { register, registerList } from './registry.ts'
import type { Command } from './types.ts'

const ui = () => useUi.getState()
/** `true` while a plan is on screen; else why not (the 3D view alone). */
const onPlan = (): true | string => (ui().view === '3d' ? PLAN_OFF : true)
const KEYS: Record<string, string> = { plan: 'Alt+1', '3d': 'Alt+2', split: 'Alt+3' }

/** The view as it shows: a phone has no room for two views, so Split shows as Plan (the view switch does the same). */
const viewShown = (): string => (isPhone() && ui().view === 'split' ? 'plan' : ui().view)

/** Plan · 3D · Split: ticked by the view, off while Compare is open (it has its own Plan · 3D), as the view switch. A phone shows
 *  Plan only: Split is greyed there ("Not on a phone") and never ticked, and Plan is ticked in its place. */
const VIEW_COMMANDS: Command[] = shown(VIEWS).map((v) => ({
  id: `view.${v.key}`,
  label: v.label,
  menu: ['View'],
  ...(KEYS[v.key] && { key: KEYS[v.key] }),
  run: () => ui().setView(v.key),
  checked: () => viewShown() === v.key,
  enabled: () => (useCompare.getState().open ? 'Compare has its own Plan · 3D' : v.key === 'split' && isPhone() ? 'Not on a phone' : true),
}))

const panel = (side: Side): Command => ({
  id: `view.panel.${side}`,
  label: `${PANEL_NAMES[side]} panel`,
  menu: ['View', 'Panels'],
  run: () => togglePanel(side),
  checked: () => panelOpen(side),
})

/** The Tools strip's row in Panels: it shows or hides the strip (`show.tools`), in place of the tools bar's row in Bars. */
const toolsPanel: Command = { id: 'view.panel.tools', label: 'Tools', menu: ['View', 'Panels'], run: () => ui().setShow('tools', !ui().show.tools), checked: () => ui().show.tools }

const BAR_COMMANDS: Command[] = [
  ...BARS.map((b): Command => ({ id: `view.bar.${b.key}`, label: b.label, menu: ['View', 'Bars'], run: () => ui().setShow(b.key, !ui().show[b.key]), checked: () => ui().show[b.key] })),
  { id: 'view.bar.kpis', label: 'KPI strip', menu: ['View', 'Bars'], run: () => ui().setShow('kpis', !ui().show.kpis), checked: () => ui().show.kpis },
  ...KPI_SIZES.map(
    (k, i): Command => ({
      id: `view.kpi-size.${k.key}`,
      label: `KPI strip: ${k.label}`,
      menu: ['View', 'Bars'],
      separatorBefore: i === 0,
      run: () => pickKpiSize(k.key),
      checked: () => ui().show.kpis && ui().kpiSize === k.key,
    }),
  ),
  ...BARS.map(
    (b, i): Command => ({
      id: `view.dock.${b.key}`,
      label: () => `Dock the ${b.label.toLowerCase()} ${ui().docks[b.key] === 'bottom' ? 'above' : 'below'}`,
      menu: ['View', 'Bars'],
      separatorBefore: i === 0,
      run: () => ui().setDock(b.key, ui().docks[b.key] === 'bottom' ? 'top' : 'bottom'),
    }),
  ),
  // the Tools strip's five places, ticked: its grip and its right-click menu say the same
  ...STRIP_DOCKS.map(
    (d, i): Command => ({
      id: `view.strip.${d.key}`,
      label: d.label,
      menu: ['View', 'Bars', 'Tools strip'],
      separatorBefore: i === 0,
      // choosing a place shows the strip there, if it was hidden
      run: () => {
        ui().setShow('tools', true)
        ui().setStripDock(d.key)
      },
      checked: () => ui().stripDock === d.key,
    }),
  ),
]

const OVERLAYS = ['View', 'Overlays']
const OVERLAY_COMMANDS: Command[] = [
  { id: 'view.overlay.graph', label: 'Graph', menu: OVERLAYS, run: () => useGraph.getState().setGraph(!useGraph.getState().graph), checked: () => useGraph.getState().graph },
  { id: 'view.overlay.map', label: 'Map', menu: OVERLAYS, run: toggleMap, enabled: () => mapRefusal() ?? true, checked: mapShown },
  { id: 'view.overlay.planes', label: 'Level planes', menu: OVERLAYS, run: () => useBuildingView.getState().togglePlanes(), checked: () => useBuildingView.getState().planes },
  {
    id: 'view.overlay.labels',
    label: 'Labels',
    menu: OVERLAYS,
    run: () => toggleLayer(LABELS),
    // Schematic draws no labels, so the chip is off and its tick with it
    enabled: () => (onPlan() !== true ? onPlan() : useDetail.getState().detail === 'schematic' ? 'Schematic draws no labels' : true),
    checked: () => !isHidden(LABELS) && useDetail.getState().detail !== 'schematic',
  },
  { id: 'view.overlay.dims', label: 'Dimensions', menu: OVERLAYS, run: () => toggleLayer(DIMENSIONS), enabled: onPlan, checked: () => !isHidden(DIMENSIONS) },
  { id: 'view.overlay.issues', label: 'Issues', menu: OVERLAYS, run: () => toggleLayer(ISSUES), enabled: onPlan, checked: () => !isHidden(ISSUES) },
  {
    id: 'view.overlay.rules',
    label: 'Rules',
    menu: OVERLAYS,
    run: () => toggleLayer(RULES),
    enabled: onPlan,
    checked: () => !isHidden(RULES),
  },
  {
    id: 'view.overlay.issue-count',
    label: 'Issue count on the chip',
    menu: OVERLAYS,
    separatorBefore: true,
    run: () => useWarningsPref.getState().set(!useWarningsPref.getState().visible),
    checked: () => useWarningsPref.getState().visible,
  },
]

const COLOUR_COMMANDS: Command[] = COLOR_BY.map((c) => ({
  id: `view.colour.${c.key}`,
  label: c.label,
  menu: ['View', 'Colour by'],
  run: () => useBuildingView.getState().setColorBy(c.key),
  checked: () => useBuildingView.getState().colorBy === c.key,
}))

/** Every look of the ground (the drafting bar's Terrain select), whatever the project: the keys' registry has them all. */
const allTerrainLooks = (): Command[] =>
  TERRAIN_SHOWS.map((t) => ({
    id: `view.terrain.${t.key}`,
    label: t.label,
    menu: ['View', 'Terrain'],
    run: () => useTerrainView.getState().setShow(t.key),
    checked: () => useTerrainView.getState().show === t.key,
    enabled: () => (t.off ? 'Not available yet' : true),
  }))

/** The ground's looks: only while the terrain module is on. */
const terrainLooks = (): Command[] => (isOn(useApp.getState().project, 'terrain') ? allTerrainLooks() : [])

const DETAIL_COMMANDS: Command[] = DETAILS.map((d) => ({
  id: `view.detail.${d.key}`,
  label: d.label,
  menu: ['View', 'Detail'],
  run: () => useDetail.getState().setDetail(d.key),
  checked: () => useDetail.getState().detail === d.key,
}))

/** A switch of the snap settings, as its chip toggles it; the plan's three rest in the 3D alone, Grid does not. */
const snapSwitch = (k: SnapSwitch, label: string, key: string | undefined, plan: boolean): Command => ({
  id: `view.${k === 'on' ? 'snap' : k}`,
  label,
  menu: ['View'],
  ...(key && { key }),
  run: () => useSnapSettings.getState().toggle(k),
  checked: () => useSnapSettings.getState().settings[k],
  ...(plan && { enabled: onPlan }),
})

const SNAP_COMMANDS: Command[] = [
  { ...snapSwitch('on', 'Snap', 'F3', true), separatorBefore: true },
  ...SNAP_KINDS.map((k): Command => ({
    id: `view.snap-kind.${k}`,
    label: SNAP_NAMES[k],
    menu: ['View', 'Snap kinds'],
    run: () => useSnapSettings.getState().toggleKind(k),
    checked: () => useSnapSettings.getState().settings.kinds[k],
    enabled: onPlan,
  })),
  ...SNAP_TO.map((k): Command => ({
    id: `view.snap-to.${k}`,
    label: SNAP_TO_NAMES[k],
    menu: ['View', 'Snap to'],
    run: () => useSnapSettings.getState().toggleTo(k),
    checked: () => useSnapSettings.getState().settings.to[k],
    enabled: onPlan,
  })),
  snapSwitch('align', 'Align', undefined, true),
  snapSwitch('ortho', 'Ortho', 'F8', true),
  snapSwitch('grid', 'Grid', 'F9', false),
]

/** Each plugin's two rows, as the View menu lists them: its tabs shown or hidden, and turned off or on. Held back as
 *  "coming soon", both are disabled with the notice, as the plugin's own button is. */
function pluginCommands(): Command[] {
  return PLUGINS.flatMap((p): Command[] => {
    const name = p.name.toLowerCase()
    const state = () => usePluginModes.getState()
    const mode = () => modeOf(state().modes, p.id)
    const soon = () => state().soon[p.id]
    // held back as "coming soon": the notice is the reason (a plugin's lock is its own button's business, as in the View menu)
    const held = (): true | string => soon() ?? true
    return [
      {
        id: `view.plugin.${p.id}.tabs`,
        label: () => (soon() ? `${p.name} tabs: coming soon` : `${p.name} tabs`),
        menu: ['View'],
        separatorBefore: p === PLUGINS[0],
        run: () => state().setMode(p.id, mode() === 'on' ? 'hidden' : 'on'),
        enabled: () => (held() !== true ? held() : mode() === 'off' ? `The ${name} is off` : true),
        checked: () => !soon() && mode() === 'on',
      },
      {
        id: `view.plugin.${p.id}.power`,
        label: () => (soon() ? `Turn the ${name} on: coming soon` : mode() === 'off' ? `Turn the ${name} on` : `Turn the ${name} off`),
        menu: ['View'],
        run: () => state().setMode(p.id, mode() === 'off' ? 'on' : 'off'),
        enabled: held,
      },
    ]
  })
}

const THEME_COMMANDS: Command[] = THEMES.map((t, i) => ({
  id: `view.theme.${t.key}`,
  label: t.label,
  menu: ['View', 'Theme'],
  separatorBefore: i === 0,
  run: () => ui().setTheme(t.key),
  checked: () => ui().theme === t.key,
}))

/** The View menu, in the spec's order; Terrain ▸ and the plugins' rows are lists (they follow the project and the plugins). */
export function registerView(): void {
  register(VIEW_COMMANDS)
  register([{ id: 'view.frame', label: 'Frame', menu: ['View'], key: 'Z', separatorBefore: true, run: frameModel, enabled: frameRefusal }])
  register([toolsPanel, panel('left'), panel('right')])
  register(BAR_COMMANDS)
  register(OVERLAY_COMMANDS)
  register(COLOUR_COMMANDS)
  registerList(['View', 'Terrain'], terrainLooks, allTerrainLooks)
  register(DETAIL_COMMANDS)
  register(SNAP_COMMANDS)
  registerList(['View'], pluginCommands)
  register(THEME_COMMANDS)
  register([
    {
      id: 'view.fullscreen',
      label: 'Full screen',
      menu: ['View'],
      key: 'Ctrl+Shift+F',
      where: ['project', 'home'],
      run: toggleFullScreen,
      enabled: () => (fullScreenAvailable() ? true : 'Full screen is not available here'),
      checked: () => !!document.fullscreenElement,
    },
    { id: 'view.default-layout', label: 'Default layout', menu: ['View'], run: () => ui().resetLayout() },
  ])
}
