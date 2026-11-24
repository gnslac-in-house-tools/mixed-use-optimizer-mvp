// Where the frame shows plugins (Decision "Optimizer plugin"): the tabs at the end of the Summary's rail and the
// view of the one open, a tab standing wide under the viewport (Decision "Specimens tab"; folded to its first line, or
// opened there by an action: Decision "Stages layout"), a plugin's window over the app, and the actions that are tabs at the
// end of the left panel's row (Phase AS.3, Decision "Panel tabs"; they stood at the rail's end before). A plugin held back
// ("coming soon", a lock) is handed over with its reason: its action is drawn dimmed and disabled, the reason its title. The frame asks here, never a plugin by name. A tab's view is a lazy chunk: it downloads the first time the tab opens, so a plugin that is off or
// hidden costs nothing; a failed download says so, with Retry. An action opens its plugin's tabs on both sides and,
// pressed again, gives back the tabs that were open (on a narrow screen, the left one's sheet).
import { Component, lazy, Suspense, type ComponentType, type LazyExoticComponent, type ReactNode } from 'react'
import { create } from 'zustand'
import { isWide, useWide } from '../views/layout/media.ts'
import { endLook, useLook } from '../views/viewport/look.ts'
import type { RailTab } from '../views/layout/PanelRail.tsx'
import { useUi, type RailItem, type Side, type SummaryTab } from '../views/layout/ui.ts'
import { PLUGINS } from './registry.ts'
import { heldBack, modeOf, usePluginModes } from './settings.ts'
import type { PluginAction, PluginActionProps, PluginTabKey, PluginTabProps, PluginWindowKey } from './types.ts'

export const isPluginTab = (key: string): key is PluginTabKey => key.startsWith('plugin:')

const TABS = PLUGINS.flatMap((plugin) => plugin.tabs.map((tab) => ({ plugin, tab, key: `plugin:${plugin.id}/${tab.id}` as PluginTabKey })))
const views = new Map<PluginTabKey, LazyExoticComponent<ComponentType<PluginTabProps>>>(TABS.map((t) => [t.key, lazy(t.tab.load)]))

/** The plugin tabs a rail shows, at its end: their plugin on, in every step (Decision "Steps change the tools"). */
export function usePluginTabs(side: Side): RailTab<PluginTabKey>[] {
  const modes = usePluginModes((s) => s.modes)
  const locks = usePluginModes((s) => s.locks)
  const soon = usePluginModes((s) => s.soon)
  return TABS.filter((t) => t.tab.side === side && modeOf(modes, t.plugin.id) === 'on' && !heldBack({ soon, locks }, t.plugin.id)).map((t) => ({
    key: t.key,
    label: t.tab.label,
    icon: { path: t.tab.icon },
    end: true,
  }))
}

export const pluginTabLabel = (key: PluginTabKey) => TABS.find((t) => t.key === key)?.tab.label ?? ''

const keyOf = (pluginId: string, tabId: string) => `plugin:${pluginId}/${tabId}` as PluginTabKey

/**
 * Opens a plugin's tabs, by side (its action; a plugin itself through the host: a run opens Specimens): each side's
 * panel shown on its tab; on a narrow screen, the sheet of the left one (else the right one).
 */
export function openPluginTabs(pluginId: string, opens: PluginAction['opens']) {
  const ui = useUi.getState()
  if (opens.left) ui.setRail(keyOf(pluginId, opens.left))
  if (opens.right) ui.setSummaryTab(keyOf(pluginId, opens.right))
  if (!isWide()) {
    if (opens.left || opens.right) ui.setSheet(opens.left ? 'left' : 'right')
    return
  }
  for (const side of ['left', 'right'] as const) if (opens[side] && !useUi.getState().panels[side]) ui.setPanel(side, true)
  // a tab that stands under the viewport while the action is open (Decision "Stages layout"; no action uses it since
  // "Plugins' sides", ⤢ does)
  if (opens.below) useWidePane.setState({ tab: keyOf(pluginId, opens.below), folded: false })
}

/** What was open before an action opened its tabs: pressed again, it comes back. */
let before: { rail: RailItem; summaryTab: SummaryTab; panels: Record<Side, boolean>; sheet: Side | null } | null = null

/** Whether an action's tabs show: each on its side's tab, its panel shown (on a narrow screen, a sheet open). */
const actionOpen = (s: ReturnType<typeof useUi.getState>, wide: boolean, pluginId: string, opens: PluginAction['opens']) => {
  const { left, right } = opens
  const tabs = (!left || s.rail === keyOf(pluginId, left)) && (!right || s.summaryTab === keyOf(pluginId, right))
  const shown = wide ? (!left || s.panels.left) && (!right || s.panels.right) : s.sheet !== null
  return tabs && shown
}

function useAction(pluginId: string, action: PluginAction): PluginActionProps {
  const wide = useWide()
  const open = useUi((s) => actionOpen(s, wide, pluginId, action.opens))
  const toggle = () => {
    const ui = useUi.getState()
    if (!open) {
      before = { rail: ui.rail, summaryTab: ui.summaryTab, panels: ui.panels, sheet: ui.sheet }
      openPluginTabs(pluginId, action.opens)
      return
    }
    // back to what was open (the tab it had); opened some other way, to Layers and Overview
    const back = before ?? { rail: 'layers', summaryTab: 'overview', panels: ui.panels, sheet: null }
    before = null
    if (action.opens.left) ui.setRail(back.rail)
    if (action.opens.right) ui.setSummaryTab(back.summaryTab)
    // a tab of its own standing wide under the viewport (⤢, or opened there) goes back too
    const wideTab = useWidePane.getState().tab
    if (wideTab && Object.values(action.opens).some((t) => t && wideTab === keyOf(pluginId, t))) useWidePane.setState({ tab: null })
    if (wide) for (const side of ['left', 'right'] as const) ui.setPanel(side, back.panels[side])
    else ui.setSheet(back.sheet)
  }
  return { label: action.label, open, toggle }
}

const ACTIONS = PLUGINS.flatMap((plugin) =>
  (plugin.actions ?? []).map((action) => ({ plugin, action, key: `${plugin.id}/${action.id}`, badge: action.badge ? lazy(action.badge) : null })),
)

/**
 * How the frame draws a plugin's action (the name is the ribbon's, where they stood until Phase Q.8): the frame's own
 * parts, given by the left panel's row of tabs, so a plugin's look is the tabs' (the plugins draw only their badge).
 */
export interface RibbonParts {
  Category: ComponentType<{ label: string; title: string; icon: string; pressed: boolean; disabled?: boolean; onClick(): void; badge: ReactNode }>
  Separator: ComponentType
}

/**
 * The plugins' actions at the end of the left panel's row of tabs (Decision "Panel tabs"): their plugin on. Picked, one opens
 * its tabs in the side panels; picked again, it gives back the tabs that were open. One of the groups (Decision "Ribbon
 * groups"): the design's (Optimize, Agent) or the documentation's (none since the Revit bridge went: Decision "No Revit
 * bridge"). `bare`: drawn inside the row, with no line before it and no group of its own.
 */
export function PluginCategories({ parts, section = 'design', bare = false }: { parts: RibbonParts; section?: 'design' | 'documentation'; bare?: boolean }) {
  const shown = useSectionActions(section)
  if (shown.length === 0) return null
  return (
    <>
      {!bare && <parts.Separator />}
      <div
        {...(bare ? { role: 'presentation' } : { role: 'group', 'aria-label': section === 'design' ? 'Plugins' : 'Documentation plugins' })}
        className="flex shrink-0 items-center gap-0.5"
      >
        {shown.map((a) => (
          <CategorySlot key={a.key} entry={a} parts={parts} />
        ))}
      </div>
    </>
  )
}

/** The actions of a section whose plugin is on. */
function useSectionActions(section: 'design' | 'documentation') {
  const modes = usePluginModes((s) => s.modes)
  return ACTIONS.filter((a) => modeOf(modes, a.plugin.id) === 'on' && (a.action.section ?? 'design') === section)
}

/** Whether a section has an action to show. */
export const useHasPluginActions = (section: 'design' | 'documentation') => useSectionActions(section).length > 0

function CategorySlot({ entry, parts }: { entry: (typeof ACTIONS)[number]; parts: RibbonParts }) {
  const props = useAction(entry.plugin.id, entry.action)
  const locked = usePluginModes((s) => heldBack(s, entry.plugin.id))
  const Badge = entry.badge
  const badge = Badge && (
    <LoadBoundary retry={() => undefined} failed={null}>
      <Suspense fallback={null}>
        <Badge {...props} />
      </Suspense>
    </LoadBoundary>
  )
  return (
    <parts.Category
      label={entry.action.label}
      title={locked ?? entry.action.title}
      icon={entry.action.icon}
      pressed={!locked && props.open}
      disabled={locked !== null}
      badge={locked ? null : badge}
      onClick={props.toggle}
    />
  )
}

/** The default share of the column's height a wide tab leaves the viewport (as the Rules list, Decision "Rules under
 *  the graph"), and after a double-click on the divider. */
export const WIDE_SHARE = 0.55

/** The plugin tab standing wide under the viewport, the viewport's share of the height over it, and whether it is
 *  folded to its first line (this session). */
export const useWidePane = create<{ tab: PluginTabKey | null; share: number; folded: boolean; setShare(f: number): void }>()((set) => ({
  tab: null,
  share: WIDE_SHARE,
  folded: false,
  setShare: (share) => set({ share }),
}))

const setWide = (tab: PluginTabKey, on: boolean) => useWidePane.setState({ tab: on ? tab : null, folded: false })
const setFolded = (folded: boolean) => useWidePane.setState({ folded })

const WINDOWS = PLUGINS.flatMap((plugin) => (plugin.windows ?? []).map((w) => ({ plugin, window: w, key: `plugin:${plugin.id}/${w.id}` as PluginWindowKey })))
const windowViews = new Map<PluginWindowKey, LazyExoticComponent<ComponentType>>(WINDOWS.map((w) => [w.key, lazy(w.window.load)]))

/** Opens a plugin's window over the app (the frame's Dialogs draws it); another window open closes. */
export const openPluginWindow = (pluginId: string, windowId: string) => useUi.getState().openDialog(`plugin:${pluginId}/${windowId}`)
/** Closes the window open, if it is the plugin's. */
export function closePluginWindow(pluginId: string) {
  const d = useUi.getState().dialog
  if (d?.startsWith(`plugin:${pluginId}/`)) useUi.getState().closeDialog()
}

/** A plugin's window, by the frame's open window (null: not a plugin's). */
export function pluginWindowOf(key: string): { key: PluginWindowKey; label: string } | null {
  const w = WINDOWS.find((x) => x.key === key)
  return w ? { key: w.key, label: w.window.label } : null
}

/** A plugin window's view, inside the frame's window. */
export function PluginWindowView({ windowKey }: { windowKey: PluginWindowKey }) {
  const View = windowViews.get(windowKey)
  const entry = WINDOWS.find((w) => w.key === windowKey)
  if (!View || !entry) return null
  return (
    <LoadBoundary key={windowKey} retry={() => windowViews.set(windowKey, lazy(entry.window.load))}>
      <Suspense fallback={<p className="p-panel-pad text-caption text-ink-secondary">Loading…</p>}>
        <View />
      </Suspense>
    </LoadBoundary>
  )
}

// a plugin hidden or turned off takes its look in the viewport and its window with it (Decision "Specimen preview")
// (and one held back: Decisions "Plugin lock", "Coming soon")
usePluginModes.subscribe((s) => {
  const away = (id: string) => modeOf(s.modes, id) !== 'on' || heldBack(s, id) !== null
  const look = useLook.getState().look
  if (look && away(look.owner)) endLook()
  const open = WINDOWS.find((w) => w.key === useUi.getState().dialog)
  if (open && away(open.plugin.id)) useUi.getState().closeDialog()
})

/** The tab standing wide under the viewport, if it shows: a wide screen and its plugin on and not held back. */
export function useWideTab(): PluginTabKey | null {
  const tab = useWidePane((s) => s.tab)
  const modes = usePluginModes((s) => s.modes)
  const wide = useWide()
  const entry = TABS.find((t) => t.key === tab)
  const held = usePluginModes((s) => (entry ? heldBack(s, entry.plugin.id) : null))
  return entry && wide && modeOf(modes, entry.plugin.id) === 'on' && !held ? entry.key : null
}

/** The open plugin tab's view, in its panel. */
export function PluginTabPanel({ tab }: { tab: PluginTabKey }) {
  const entry = TABS.find((t) => t.key === tab)
  const away = useWideTab() === tab
  const wide = useWide()
  if (!entry) return null
  const props: PluginTabProps = { wide: false, away, setWide: entry.tab.wide && wide ? (on) => setWide(tab, on) : undefined }
  return <TabView tab={tab} props={props} retry={() => views.set(tab, lazy(entry.tab.load))} />
}

/** A plugin tab standing wide under the viewport (the frame's DockArea draws it there); Escape sends it back (a look
 *  in the viewport first: that Escape is the look's). */
export function PluginWidePane({ tab }: { tab: PluginTabKey }) {
  const entry = TABS.find((t) => t.key === tab)
  const folded = useWidePane((s) => s.folded)
  if (!entry) return null
  const props: PluginTabProps = { wide: true, away: false, setWide: (on) => setWide(tab, on), folded, setFolded }
  return (
    <section
      aria-label={`${entry.tab.label}, wide`}
      tabIndex={-1}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && !useLook.getState().look) setWide(tab, false)
      }}
      className="panel flex h-full min-h-0 flex-col overflow-hidden p-panel-pad outline-none"
    >
      <TabView tab={tab} props={props} retry={() => views.set(tab, lazy(entry.tab.load))} />
    </section>
  )
}

function TabView({ tab, props, retry }: { tab: PluginTabKey; props: PluginTabProps; retry(): void }) {
  return (
    <LoadBoundary key={tab} retry={retry}>
      <Suspense fallback={<p className="text-caption text-ink-secondary">Loading…</p>}>
        <LoadedTab tab={tab} props={props} />
      </Suspense>
    </LoadBoundary>
  )
}

function LoadedTab({ tab, props }: { tab: PluginTabKey; props: PluginTabProps }) {
  const View = views.get(tab)!
  return <View {...props} />
}

/** A tab whose chunk failed to download (offline, a new build): it says so in place, with Retry. */
class LoadBoundary extends Component<{ retry(): void; children: ReactNode; failed?: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    if (!this.state.failed) return this.props.children
    if (this.props.failed !== undefined) return this.props.failed
    return (
      <div className="flex flex-col items-start gap-2">
        <p className="text-caption text-status-over">This tab could not load.</p>
        <button
          type="button"
          className="pressable rounded-control bg-fill px-2.5 py-1 text-label text-ink shadow-control hover:bg-hover"
          onClick={() => {
            this.props.retry()
            this.setState({ failed: false })
          }}
        >
          Retry
        </button>
      </div>
    )
  }
}
