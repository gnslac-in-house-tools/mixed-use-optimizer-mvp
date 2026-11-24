// Summary panel (right), the dashboard (Practiko's Resumen tab, `vistas/paneles/pestanas/Resumen.tsx`), in tabs on a
// rail down its right edge (Decision "Summary tabs"):
//   Overview           the option's figures in groups that fold, the footprint by program, the figures by building;
//                      a program or a building isolated (stats/Overview.tsx, Decision "Isolate in the Overview")
//   Against the brief  the active option against the brief, program by program: its area, Δ and masses (BriefRows)
//   Issues             the one place that says what is wrong and how to settle it (IssuesTab.tsx, Decision "Issues,
//                      one list"): ▶ Solve all, and each issue with its own Solve, Update brief or Edit the rule;
//                      their count on the icon, red when one is an error
// All of the active option (Decision "Buildings and options"). Read-only: it formats `derived` through views/format.ts
// and computes nothing. (The KPI strip on top shows the chosen headline figures.) The Brief workspace opens it on
// *Against the brief*, the Site step on Overview. The plugins' output tabs (Decision "Optimizer plugin") are not on the
// rail (Decision "One rail"): their action, a tab at the end of the left panel's row, opens them, and the panel shows them while open; a saved one that
// does not show opens Overview. In the Warehouse step (Decision "Warehouse layout") it is the type's figures, no rail.
import { isPluginTab, PluginTabPanel, usePluginTabs } from '../../plugins/index.ts'
import { useApp } from '../../state/store.ts'
import { PanelRail, type RailTab } from '../layout/PanelRail.tsx'
import { SUMMARY_TABS, useUi, type SummaryTab } from '../layout/ui.ts'
import { BriefRows } from '../stats/BriefRows.tsx'
import { Overview } from '../stats/Overview.tsx'
import { IssuesTab } from './IssuesTab.tsx'
import { Calificacion } from '../../modules/residential/views/calificacion/Calificacion.tsx' // mixed-use-mvp

/** The tabs the rail shows (the core's), what the panel may show (those, and a plugin's while it is open), and the one open. */
function useTabs(): { rail: RailTab<SummaryTab>[]; tabs: RailTab<SummaryTab>[]; tab: SummaryTab } {
  const saved = useUi((s) => s.summaryTab)
  const tabs: RailTab<SummaryTab>[] = [...SUMMARY_TABS, ...usePluginTabs('right')]
  return { rail: SUMMARY_TABS, tabs, tab: tabs.some((t) => t.key === saved) ? saved : 'overview' }
}

/** The open tab's name, for the panel's header. */
export function useSummaryTitle(): string {
  const { tabs, tab } = useTabs()
  return tabs.find((t) => t.key === tab)!.label
}

export function SummaryRail() {
  const { rail, tab } = useTabs()
  const setTab = useUi((s) => s.setSummaryTab)
  const issues = useApp((s) => s.derived.issues)
  const errors = issues.some((i) => i.severity === 'error')
  const withBadge = rail.map((t) =>
    t.key === 'issues' ? { ...t, badge: { count: issues.length, words: issues.length === 1 ? '1 issue' : `${issues.length} issues`, alert: errors } } : t,
  )
  return <PanelRail label="Summary" side="right" tabs={withBadge} active={tab} onPick={setTab} />
}

export function SummaryPanel() {
  const { tabs, tab } = useTabs()
  return (
    // key: each tab opens from the top, without the previous one's scroll
    <div
      key={tab}
      role="tabpanel"
      aria-label={tabs.find((t) => t.key === tab)!.label}
      className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto overscroll-contain px-panel-pad pb-panel-pad pt-3"
    >
      {tab === 'overview' && <Overview />}
      {tab === 'brief' && <BriefRows />}
      {tab === 'issues' && <IssuesTab />}
      {/* mixed-use-mvp */}
      {tab === 'calificacion' && <Calificacion />}
      {isPluginTab(tab) && <PluginTabPanel tab={tab} />}
    </div>
  )
}
