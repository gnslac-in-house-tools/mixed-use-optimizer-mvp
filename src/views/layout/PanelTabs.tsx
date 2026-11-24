// The left panel's tabs and the view of the one open (Phase AS.3, Decision "Panel tabs"; spec "The frame"): a row of tabs at the
// top of the panel, **Layers · Blocks · Properties**, then the plugins' tabs at the row's end. It replaces the rail of icons
// (Decision "Areas rail") and the Site, Levels, Flow and Brief tabs that stood beside it: the settings are Properties' now, by
// what is picked in Layers (layers/LayerProperties.tsx), so the panel is three tabs and no more.
//   Layers      the tree of what the option in view holds (layers/LayersTab.tsx)
//   Blocks      the warehouse types as smart blocks to drag onto the site, where the typology offers a warehouse
//   Properties  the fields of what is selected or picked in Layers (a selection never opens it; *Properties* in a menu does)
//   plugins     an action of a plugin (Optimize, Agent) is its tab here, pressed while its tabs show; it opens what it opened
//               (its tab here, its tabs on the right or below); again, back to what was shown (Decision "Plugins open panels").
//               A plugin held back ("coming soon", Decisions "Coming soon", "Plugin lock") shows its tab dimmed and disabled, with the
//               notice as its title. On a phone the row has no plugins' tabs, as the ribbon had none there (spec "Phone").
// The row fits the panel's width, with no scrollbar: the three built-in tabs keep their icon and name but may shrink (the name
// truncates), and a plugin's tab is an icon alone, a square (its name is its tooltip and its accessible name), because the five tabs
// with their names needed more than the panel's room (the Agent's went out of view). On a phone the row is at the top of the sheet,
// where each tab is touch-sized and the row scrolls sideways when short of room; it has no plugins' tabs there. A tab of before
// (`site`, `massing`, `flow`, `brief`) in a saved layout opens Layers (ui.ts), and so does a plugin's tab that cannot be shown (a
// plugin that is gone, held back, or any on a phone).
// As ARIA tabs: each tab has an id and `aria-controls` its tabpanel (a plugin's tabs, the one panel its plugin opened), and each built-in
// tabpanel is `aria-labelledby` its tab. ← and → move the focus between the tabs that can be used (wrapping), Home and End to the first
// and the last; they do not open anything (Enter or Space on the tab does), and only the tab open is in the page's tab order.
import { useRef, type KeyboardEvent, type ReactNode } from 'react'
import { isPluginTab, PluginCategories, PluginTabPanel, pluginTabLabel, usePluginTabs, type RibbonParts } from '../../plugins/index.ts'
import { Icon, type IconName } from '../controls/Icon.tsx'
import { LayersTab } from '../layers/LayersTab.tsx'
import { useModule } from '../modules.ts'
import { Properties } from '../panels/Properties.tsx'
import { BlocksPanel } from '../../modules/warehouse/views/BlocksPanel.tsx'
import { usePhone } from './media.ts'
import { useUi, type RailItem } from './ui.ts'
import { t as tr } from '../../i18n/idioma.ts' // mixed-use-mvp

/** What the panel shows: its tab as picked; a plugin's tab while its plugin shows it. A tab that cannot be shown (a plugin's that is gone
 *  or that a phone does not draw, the Blocks without the warehouse module, a tab of before) shows Layers. */
export function useRailItem(): RailItem {
  const rail = useUi((s) => s.rail)
  const plugins = usePluginTabs('left')
  // the row draws no plugins' tabs on a phone: a plugin's tab saved there would leave a body with no tab selected
  const phone = usePhone()
  // the Blocks are the warehouse types: there where the typology offers a warehouse
  const blocks = useModule('warehouse').offered
  if (rail === 'properties') return 'properties'
  if (rail === 'blocks' && blocks) return 'blocks'
  if (isPluginTab(rail) && !phone && plugins.some((t) => t.key === rail)) return rail
  return 'layers'
}

/** The ids that tie a tab to its panel: the tab's, the panel's. A plugin's tabs share the panel their plugin opened. */
const tabId = (name: string) => `panel-tab-${name.toLowerCase()}`
const panelId = (name: string) => `panel-body-${name.toLowerCase()}`
const PLUGIN_PANEL = 'panel-body-plugin'

/** The open tab's name, for the tab panel's label. */
const nameOf = (item: RailItem): string => (isPluginTab(item) ? pluginTabLabel(item) : item === 'layers' ? 'Layers' : item === 'blocks' ? 'Blocks' : 'Properties')

/** The row of tabs: Layers, Blocks (where offered), Properties, and at the end the plugins'. */
export function PanelTabs() {
  const item = useRailItem()
  const setRail = useUi((s) => s.setRail)
  const phone = usePhone()
  const blocks = useModule('warehouse').offered
  const row = useRef<HTMLDivElement>(null)
  // ← → Home End: the focus moves among the tabs that can be used; Enter or Space (the button's own click) opens one
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft' && e.key !== 'Home' && e.key !== 'End') return
    const tabs = Array.from(row.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]:not(:disabled)') ?? [])
    if (tabs.length === 0) return
    const at = tabs.indexOf(document.activeElement as HTMLButtonElement)
    const to = e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : (at + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length
    e.preventDefault()
    tabs[to].focus()
  }
  return (
    <div
      ref={row}
      data-panel-tabs
      role="tablist"
      aria-label="Panel tabs"
      aria-orientation="horizontal"
      onKeyDown={onKeyDown}
      className="flex shrink-0 items-center gap-1 px-panel-pad pb-1 pt-2 phone:overflow-x-auto phone:pb-2 phone:pt-1"
    >
      <Tab
        icon="layers"
        label="Layers"
        controls={panelId('Layers')}
        title={tr("Layers: what the option in view holds, seen, hidden, locked and picked from one tree")}
        on={item === 'layers'}
        onClick={() => setRail('layers')}
      />
      {blocks && (
        <Tab
          icon="blocks"
          label="Blocks"
          controls={panelId('Blocks')}
          title={tr("Blocks: the smart blocks (warehouse types) to drag onto the site; new ones, and editing their rules")}
          on={item === 'blocks'}
          onClick={() => setRail('blocks')}
        />
      )}
      <Tab
        icon="properties"
        label="Properties"
        controls={panelId('Properties')}
        title={tr("Properties: the fields of what is selected or picked in Layers (with nothing picked, the active building’s)")}
        on={item === 'properties'}
        onClick={() => setRail('properties')}
      />
      {!phone && (
        <>
          {/* the design's actions: Optimize, Agent, each a tab at the row's end; the documentation's, when a plugin offers any */}
          <span className="ml-auto flex shrink-0 items-center gap-1">
            <PluginCategories parts={PARTS} bare />
            <PluginCategories parts={PARTS} section="documentation" bare />
          </span>
        </>
      )}
    </div>
  )
}

/** A tab of the row: its icon, its name. `iconOnly` (a plugin's): the icon alone, narrower than it is tall, its name the accessible
 *  name; the tab keeps its size while the built-in ones shrink. The widths are measured: at the panel's default width the three names
 *  show whole, the open one in semibold too. `disabled`: a plugin held back (its title says why). */
function Tab(props: {
  icon: IconName | { path: string }
  label: string
  title: string
  on: boolean
  controls: string
  iconOnly?: boolean
  disabled?: boolean
  badge?: ReactNode
  onClick(): void
}) {
  const { on } = props
  return (
    <button
      type="button"
      role="tab"
      id={tabId(props.label)}
      aria-controls={props.controls}
      tabIndex={on ? 0 : -1}
      data-tour={`tab-${props.label.toLowerCase()}`}
      aria-selected={on}
      aria-label={props.iconOnly ? props.label : undefined}
      title={props.title === undefined ? undefined : tr(props.title)}
      disabled={props.disabled}
      onClick={props.onClick}
      className={`pressable relative flex h-7 items-center rounded-control text-label leading-none phone:h-11 ${
        props.iconOnly ? 'w-6 shrink-0 justify-center' : 'min-w-0 gap-1 px-0.5 phone:shrink-0 phone:gap-1.5 phone:px-3'
      } ${
        on ? 'bg-fill font-semibold text-ink shadow-control' : 'text-ink-segment hover:bg-hover hover:text-ink'
      } disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-ink-segment`}
    >
      <Icon {...(typeof props.icon === 'string' ? { name: props.icon } : props.icon)} className="h-4 w-4 shrink-0" />
      {!props.iconOnly && <span className="truncate">{tr(props.label)}</span>}
      {props.badge}
    </button>
  )
}

/** A plugin's tab shows no name, so its tooltip must say which plugin it is: a title that does not hold the name gets it in front. */
const namedTitle = (label: string, title: string) => (title.toLowerCase().includes(label.toLowerCase()) ? title : `${label}: ${title}`)

/** The tabs' parts, for the plugins' actions (plugins/slots.tsx): each is a tab at the row's end. */
const PARTS: RibbonParts = {
  Category: ({ icon, label, title, pressed, disabled, onClick, badge }) => (
    <Tab
      icon={{ path: icon }}
      label={label}
      title={namedTitle(label, title)}
      on={pressed}
      controls={PLUGIN_PANEL}
      iconOnly
      disabled={disabled}
      badge={badge ?? null}
      onClick={onClick}
    />
  ),
  Separator: () => null,
}

const scrolls = 'min-h-0 flex-1 overflow-y-auto overscroll-contain px-panel-pad pb-panel-pad pt-3'

/** The view of the open tab, the whole height of the panel under the row. */
export function PanelBody() {
  const item = useRailItem()
  return item === 'layers' ? (
    <div role="tabpanel" id={panelId('Layers')} aria-labelledby={tabId('Layers')} className={scrolls}>
      <LayersTab />
    </div>
  ) : item === 'properties' ? (
    <div role="tabpanel" id={panelId('Properties')} aria-labelledby={tabId('Properties')} className={scrolls}>
      <Properties surface="panel" />
    </div>
  ) : item === 'blocks' ? (
    <div role="tabpanel" id={panelId('Blocks')} aria-labelledby={tabId('Blocks')} className={scrolls}>
      <BlocksPanel />
    </div>
  ) : (
    // key: each tab opens from the top, without the previous one's scroll
    <div key={item} role="tabpanel" id={PLUGIN_PANEL} aria-label={nameOf(item)} className={scrolls}>
      <PluginTabPanel tab={item} />
    </div>
  )
}
