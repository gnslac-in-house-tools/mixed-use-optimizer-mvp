// What the frame shows: the view (how you look at it) and the two side panels (Layers and properties on the left, Summary on
// the right: inputs → engine → outputs). There is no workspace: a tool works whatever the left panel shows (`tools/hand.ts`),
// and the rail's item is only the panel's tab (Layers · Blocks · Properties, then a plugin's). Per-browser UI state in its own store,
// like the snap settings: never in the Project, the undo history or the store doors the state graph traces.
// Which panels and bars are shown, the left panel's tab, the Summary's tab, where each bar
// docks, where the Tools strip stands (`stripDock`, five places, above the viewport by default), the panels' widths and the theme and the KPI strip's size are remembered in localStorage (`gfit.layout`):
// hiding a panel keeps how it was; *Default layout* puts the frame back (the rail, the tabs and the theme stay). See
// Decisions "Layout", "Side panels", "UI state", "Layout by function", "Workspace layout", "Summary tabs", "Dark mode",
// "Areas rail", "Compact panel" and "Panel tabs" in docs/ARCHITECTURE.md.
import { create } from 'zustand'
import type { PluginTabKey } from '../../plugins/index.ts'
import type { IconName } from '../controls/Icon.tsx'
import { titleWith } from '../commands/shortcuts.ts'
import { isWide } from './media.ts'
import { applyTheme, isTheme, type Theme } from './theme.ts'

/** Brief, Program and Rules: windows over the app, never the viewport's (Decisions "Brief and Rules as windows",
 *  "Program rule set layout"); a plugin's window too (`plugin:<id>/<window>`, Decision "Stages layout"). */
export type Dialog = 'brief' | 'program' | 'rules' | PluginTabKey
/** The Brief window's tabs (Decision "Program rule set layout"): its programs, its circulation's standards and demand. */
export type BriefTab = 'programs' | 'circulation'
/** How the viewport looks (Sheets, off until 10.D, is not a value yet). */
export type View = 'plan' | '3d' | 'split'
/** What the left panel shows (Phase AS.3, Decision "Panel tabs"): Layers (the tree of what the option in view holds),
 *  the Blocks (the warehouse types as smart blocks, Decision "Smart blocks"), Properties (the settings of what is picked),
 *  or a plugin's left tab (`plugin:<id>/<tab>`, opened by its action: Decision "Optimizer plugin"). A layout saved with
 *  an item of before (`site`, `massing`, `flow`, `brief`) opens Layers. */
export type RailItem = 'layers' | 'blocks' | 'properties' | PluginTabKey
export type SummaryTab = 'overview' | 'brief' | 'issues' | PluginTabKey
export type Side = 'left' | 'right'
/** The bars docked to the viewport (Decision "Workspace layout"): the drafting bar. (The tools bar went with the Tools strip,
 *  AS.2; a saved `docks.tools` is ignored.) */
export type Bar = 'drafting'
export type Dock = 'top' | 'bottom'
/** Where the Tools strip stands (AS.2; spec "The Tools strip"; above the viewport by default, the user, 2026-11-15): at the window's left, before the left panel; between the left panel
 *  and the viewport; at the viewport's right, before Summary; flat above the viewport or below it. */
export type StripDock = 'left' | 'panel' | 'right' | 'top' | 'bottom'
/** What the View menu shows or hides besides the side panels: the KPI strip, the bars and the Tools strip (`tools`). */
export type Part = 'kpis' | Bar | 'tools'
/** The KPI strip's sizes, larger to smaller (Decision "Ribbon"): its bottom edge jumps between them. */
export type KpiSize = 'full' | 'medium' | 'compact'
export const KPI_SIZES: { key: KpiSize; label: string; title: string }[] = [
  { key: 'full', label: 'Full', title: 'Each figure with its name above and its limit under it' },
  { key: 'medium', label: 'Medium', title: 'Each figure with its name, smaller, without the line under it' },
  { key: 'compact', label: 'Compact', title: 'One line: each name and its figure side by side' },
]

/** How the viewport looks: the plan, the 3D view or both side by side. */
export const VIEWS: { key: View; label: string; phase: string | null; readonly title: string }[] = [
  { key: 'plan', label: 'Plan', phase: null, get title() { return titleWith('Plan', 'view.plan') } },
  { key: '3d', label: '3D', phase: null, get title() { return titleWith('3D view', 'view.3d') } },
  { key: 'split', label: 'Split', phase: null, get title() { return titleWith('Plan and 3D side by side', 'view.split') } },
]

/** What the frame draws of a list: an item with a `phase` is not built yet and is skipped (Decision "Only what works is shown"). */
export const shown = <T extends { phase?: string | null }>(list: readonly T[]): T[] => list.filter((x) => !x.phase)

/**
 * The Summary panel's tabs, on its own rail (Decision "Summary tabs"; the user: "these stats should be somewhere else,
 * maybe in Summary but in another tab"): the project's figures; the active option against the brief, program by
 * program (its area, Δ and masses, moved out of the Brief's table); the issues, counted on the icon. The decision
 * log's tab (who decided each change: LogTab.tsx) is not shown since Phase Q.9 (the user's mark `ui:right.log`): the log
 * is still written and leaves in Export; a saved `summaryTab: 'log'` opens Overview.
 */
export const SUMMARY_TABS: { key: Exclude<SummaryTab, PluginTabKey>; label: string; icon: IconName; phase?: string }[] = [
  { key: 'overview', label: 'Overview', icon: 'chart' },
  { key: 'brief', label: 'Against the brief', icon: 'target' },
  { key: 'issues', label: 'Issues', icon: 'warning' },
]

/** The side panels' names, for their toggles, their sheets and screen readers. */
export const PANEL_NAMES: Record<Side, string> = { left: 'Layers and properties', right: 'Summary' }

/** The bars' names, for their menus and the View menu; bars on one side stack in this order. */
export const BARS: { key: Bar; label: string }[] = [{ key: 'drafting', label: 'Drafting bar' }]

/** The five places of the Tools strip, with the names its menus use (its right-click and View › Bars › Tools strip). */
export const STRIP_DOCKS: { key: StripDock; label: string }[] = [
  { key: 'left', label: "At the window's left" },
  { key: 'panel', label: 'Beside the panel' },
  { key: 'right', label: "At the viewport's right" },
  { key: 'top', label: 'Above the viewport' },
  { key: 'bottom', label: 'Below the viewport' },
]

export const STORAGE_KEY = 'gfit.layout'

interface Saved {
  panels: Record<Side, boolean>
  /** The left panel's tab (Decision "Panel tabs"). */
  rail: RailItem
  summaryTab: SummaryTab
  /** Where each bar docks: above or below the viewport. */
  docks: Record<Bar, Dock>
  /** Where the Tools strip stands (five places); above the viewport by default. */
  stripDock: StripDock
  /** The KPI strip and the bars, shown or hidden. */
  show: Record<Part, boolean>
  /** The KPI strip's size (Decision "Ribbon"): Compact whenever the app opens (Decision "Compact by default"). */
  kpiSize: KpiSize
  /** Each side panel's width in px, dragged at its inner edge; null: the default (the `--side-panel-w` token). */
  widths: Record<Side, number | null>
  /** The Help switch (Help › Help, F1, ?; Decision "Help"): the notes where they help and the pipeline's guide. Off by default. */
  help: boolean
  /** Light, dark or the system's (Decision "Dark mode"). Not part of the frame: Default layout keeps it. */
  theme: Theme
}

const DEFAULT_LAYOUT: Saved = {
  panels: { left: true, right: true },
  rail: 'layers',
  summaryTab: 'overview',
  docks: { drafting: 'bottom' },
  stripDock: 'top',
  show: { kpis: true, drafting: true, tools: true },
  kpiSize: 'compact',
  widths: { left: null, right: null },
  help: false,
  theme: 'system',
}

/** A side panel's width, dragged: between 15 and 40 rem, and never more than 40 % of the window. */
export const MIN_PANEL_PX = 240
export const MAX_PANEL_PX = 640
export function panelWidth(px: number): number {
  const max = typeof window === 'undefined' ? MAX_PANEL_PX : Math.max(MIN_PANEL_PX, Math.min(MAX_PANEL_PX, window.innerWidth * 0.4))
  return Math.round(Math.min(max, Math.max(MIN_PANEL_PX, px)))
}
const width = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? panelWidth(v) : null)

const dock = (v: unknown, fallback: Dock): Dock => (v === 'top' || v === 'bottom' ? v : fallback)

const stripDockOf = (v: unknown): StripDock => (STRIP_DOCKS.some((d) => d.key === v) ? (v as StripDock) : DEFAULT_LAYOUT.stripDock)

const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback)

const pluginKey = (v: unknown): v is PluginTabKey => typeof v === 'string' && /^plugin:[^/]+\/.+/.test(v)

/** What was saved, merged with the defaults: an old or broken JSON leaves no gaps. */
export function readSaved(): Saved {
  try {
    const t = localStorage.getItem(STORAGE_KEY)
    const raw = t ? (JSON.parse(t) as Partial<Saved> | null) : null
    const panels = raw?.panels ?? DEFAULT_LAYOUT.panels
    // an item that is gone (or one of before the three tabs: `site`, `massing`, `flow`, `brief`) opens Layers; the Parameters tab
    // saved before Phase Q (`paramsTab`) and the settings groups' folds (`folded`) are ignored
    const rail = raw?.rail
    const docks = raw?.docks ?? DEFAULT_LAYOUT.docks
    const show = raw?.show ?? DEFAULT_LAYOUT.show
    const widths = raw?.widths ?? DEFAULT_LAYOUT.widths
    return {
      panels: { left: bool(panels.left, true), right: bool(panels.right, true) },
      // a plugin's tab is kept as saved: a panel that does not show it (the plugin hidden or gone) opens Layers
      rail: rail === 'layers' || rail === 'properties' || rail === 'blocks' || pluginKey(rail) ? rail : DEFAULT_LAYOUT.rail,
      summaryTab: SUMMARY_TABS.find((t) => t.key === raw?.summaryTab && !t.phase)?.key ?? (pluginKey(raw?.summaryTab) ? raw!.summaryTab! : DEFAULT_LAYOUT.summaryTab),
      // a `tools` dock saved before the Tools strip is ignored
      docks: { drafting: dock(docks.drafting, 'bottom') },
      stripDock: stripDockOf(raw?.stripDock),
      // `tools` hid a small bar before the Tools strip: a layout with no `stripDock` (saved before it) shows the strip
      show: { kpis: bool(show.kpis, true), drafting: bool(show.drafting, true), tools: raw && 'stripDock' in raw ? bool(show.tools, true) : true },
      // not remembered: the strip opens compact every time; the grip or the View menu change it for the session
      kpiSize: DEFAULT_LAYOUT.kpiSize,
      widths: { left: width(widths.left), right: width(widths.right) },
      help: bool(raw?.help, false),
      theme: isTheme(raw?.theme) ? raw.theme : 'system',
    }
  } catch {
    // no localStorage, or garbage in it: the defaults
    return structuredClone(DEFAULT_LAYOUT)
  }
}

function save(s: Saved) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
  } catch {
    // full or blocked: the layout lasts as long as the tab
  }
}

interface UiState extends Saved {
  view: View
  /** Below 880 px the panels are sheets over the viewport: the one that is open (never saved). */
  sheet: Side | null
  /** Brief or Rules, open over the app (never saved); null: none. The Brief opens the Summary's Against the brief, as
   *  its step did: what the option has, beside what is asked, when the window closes. */
  dialog: Dialog | null
  /** The Brief's tab, for the session. */
  briefTab: BriefTab
  setBriefTab(t: BriefTab): void
  openDialog(d: Dialog): void
  closeDialog(): void
  setView(v: View): void
  /** Picks the rail's item: the tab the left panel shows. It changes nothing else: no tool is let go, no view changes. */
  setRail(r: RailItem): void
  setSummaryTab(t: SummaryTab): void
  /** Shows or hides a side panel (a wide screen). Hidden, it stays mounted: its tab and its drafts are kept. */
  setPanel(side: Side, shown: boolean): void
  setSheet(side: Side | null): void
  /** Docks a bar above or below the viewport. */
  setDock(bar: Bar, where: Dock): void
  /** Moves the Tools strip to one of its five places. */
  setStripDock(where: StripDock): void
  /** Shows or hides the KPI strip or a bar. */
  setShow(part: Part, shown: boolean): void
  setKpiSize(size: KpiSize): void
  /** A side panel's width (kept within its limits); null gives the default back. */
  setWidth(side: Side, px: number | null): void
  /** *Default layout*: every panel, bar and the Tools strip shown, in its place and width. The open tab stays. */
  resetLayout(): void
  /** The ? : the notes and the guide, on or off (remembered). */
  setHelp(on: boolean): void
  /** Light, dark or the system's (remembered); <html> changes first, so the 3D scene re-reads the new tokens. */
  setTheme(theme: Theme): void
}

const built = <K extends string>(list: { key: K; phase: string | null }[], k: K) => list.some((x) => x.key === k && x.phase === null)

export const useUi = create<UiState>()((set, get) => {
  const keep = (changes: Partial<Saved>) => {
    set(changes)
    const { panels, rail, summaryTab, docks, stripDock, show, kpiSize, widths, help, theme } = get()
    save({ panels, rail, summaryTab, docks, stripDock, show, kpiSize, widths, help, theme })
  }
  const saved = readSaved()
  applyTheme(saved.theme)
  return {
    ...saved,
    view: 'plan',
    sheet: null,
    dialog: null,
    briefTab: 'programs',
    setBriefTab: (briefTab) => set({ briefTab }),
    openDialog: (dialog) => {
      set({ dialog })
      if (dialog === 'brief') keep({ summaryTab: 'brief' })
    },
    closeDialog: () => set({ dialog: null }),
    setView: (v) => {
      if (built(VIEWS, v)) set({ view: v })
    },
    setRail: (r) => keep({ rail: r }),
    setSummaryTab: (t) => keep({ summaryTab: t }),
    setHelp: (help) => keep({ help }),
    setTheme: (theme) => {
      applyTheme(theme)
      keep({ theme })
    },
    setPanel: (side, shown) => keep({ panels: { ...get().panels, [side]: shown } }),
    setSheet: (side) => set({ sheet: side }),
    setDock: (bar, where) => keep({ docks: { ...get().docks, [bar]: where } }),
    setStripDock: (stripDock) => {
      if (get().stripDock !== stripDock) keep({ stripDock })
    },
    setShow: (part, shown) => keep({ show: { ...get().show, [part]: shown } }),
    setKpiSize: (kpiSize) => keep({ kpiSize }),
    setWidth: (side, px) => keep({ widths: { ...get().widths, [side]: px === null ? null : panelWidth(px) } }),
    resetLayout: () => {
      const { panels, docks, stripDock, show, kpiSize, widths } = structuredClone(DEFAULT_LAYOUT)
      set({ sheet: null })
      keep({ panels, docks, stripDock, show, kpiSize, widths })
    },
  }
})

/** Whether a side panel is open: a column on a wide screen, the sheet below 880 px. */
export function panelOpen(side: Side, wide: boolean = isWide()): boolean {
  const u = useUi.getState()
  return wide ? u.panels[side] : u.sheet === side
}

/** The side panel's toggle (the View menu's, the commands'): its column shown or hidden, or its sheet. */
export function togglePanel(side: Side, wide: boolean = isWide()): void {
  const u = useUi.getState()
  if (wide) u.setPanel(side, !u.panels[side])
  else u.setSheet(u.sheet === side ? null : side)
}

/** A side panel opened (what a rail item's command needs, so the item it picks is on screen). */
export function showPanel(side: Side, wide: boolean = isWide()): void {
  const u = useUi.getState()
  if (wide) u.setPanel(side, true)
  else u.setSheet(side)
}

/** The KPI strip at a size: it shows, if it was hidden (the View menu's rows and the commands'). */
export function pickKpiSize(size: KpiSize): void {
  const u = useUi.getState()
  u.setShow('kpis', true)
  u.setKpiSize(size)
}

/** The Help switch (the notes where they help, the guide): Help › Help, F1 and the ? key; the Program window's Help button. */
export function toggleHelp(): void {
  useUi.getState().setHelp(!useUi.getState().help)
}
