import { useUi } from './views/layout/ui.ts'
import { useWide } from './views/layout/media.ts'
import { PanelColumn } from './views/layout/PanelColumn.tsx'
import { Dialogs } from './views/layout/Dialogs.tsx'
import { FileDrop } from './views/layout/FileDrop.tsx'
import { useAutosave } from './views/layout/SaveStatus.tsx'
import { Toast } from './views/layout/Toast.tsx'
import { TopBar } from './views/layout/TopBar.tsx'
import { PanelBody, PanelTabs } from './views/layout/PanelTabs.tsx'
import { SummaryPanel, SummaryRail, useSummaryTitle } from './views/panels/SummaryPanel.tsx'
import { KpiStrip } from './views/stats/KpiStrip.tsx'
import { useShortcutsStore } from './views/commands/shortcuts.ts'
import { MenuHost } from './views/editing/menu/open.tsx'
import { ToolStrip, useStripDrag } from './views/tools/ToolStrip.tsx'
import { useShortcuts } from './views/useShortcuts.ts'
import { DockArea } from './views/viewport/DockArea.tsx'
import { Home } from './views/home/Home.tsx'
import { useScreen } from './views/home/screen.ts'
import { TerrainEditorBar } from './views/home/TerrainEditorBar.tsx'
import { TourCard } from './views/tour/TourCard.tsx'
import { TourOffer } from './views/tour/TourOffer.tsx'

/**
 * The frame (Decisions "Layout", "Side panels" and "Layout by function"; Plaza-Practiko's `App.tsx` with IZA's grid,
 * plus a left panel):
 *   top bar      → GFit, the menus (File · Edit · View · Site · Design · Tools · Help: every command of the app), undo / redo,
 *                  the project and its option (the ribbon that stood under it went with Phase Q.8)
 *   KPI strip    → the project's chosen figures, reconfigurable, in three sizes
 *   the Tools strip → every tool, by group, as icons (views/tools/ToolStrip.tsx), in one of five places (`stripDock`, above the viewport by default, moved by its grip,
 *                  its right-click or View › Bars › Tools strip): a column at the window's left (here, the first grid column),
 *                  beside the left panel, at the viewport's right, or flat above or below the viewport (those three in DockArea);
 *                  below 880 px flat under the viewport whatever the dock; View › Panels › Tools shows or hides it
 *   the left panel: a row of tabs (Layers · Blocks · Properties, then the plugins' Optimize and Agent at its end), the tree of
 *   what the option in view holds and the settings of what is picked, no tools (inputs; Decisions "Panel tabs", "Layers", "No areas") ·
 *   the viewport with its bars docked above or below (DockArea) ·
 *   Summary, its figures, the brief and the issues in tabs (outputs)
 * The layout mirrors the data flow: inputs → engine → outputs. The viewport never gives up its space: a hidden panel
 * leaves the grid, and below 880 px the panels become sheets over it. The View menu (Decision "Workspace layout")
 * shows or hides the panels, the KPI strip and the bars; each panel's width is dragged at its inner edge.
 * Home (Decision "Home") covers it all while it shows: the projects, the sample and its tour; the tour's card and its
 * offer (Decision "Tour") stand over the frame.
 */
export function App() {
  useShortcuts()
  // a key the user gives is on every title and menu at once: the frame renders again with it (titles read `keysOf` as they render)
  useShortcutsStore((s) => s.user)
  useAutosave()
  const wide = useWide()
  const panels = useUi((s) => s.panels)
  const widths = useUi((s) => s.widths)
  const kpis = useUi((s) => s.show.kpis)
  const tools = useUi((s) => s.show.tools)
  const summaryTitle = useSummaryTitle()
  // by default the left panel is its width; the right's is its width plus its rail; a dragged width is the whole column's
  const left = widths.left === null ? 'var(--side-panel-w)' : `${widths.left}px`
  const right = widths.right === null ? 'calc(var(--side-panel-w) + var(--side-rail-w))' : `${widths.right}px`
  // the Tools strip's column is as wide as the strip is (one column of icons, or two): `auto`, only while it shows and stands at
  // the window's left; at its other docks it is in DockArea
  const stripDock = useUi((s) => s.stripDock)
  const dropAtLeft = useStripDrag((s) => s.to === 'left')
  const stripAtLeft = wide && tools && stripDock === 'left'
  const columns = wide ? [stripAtLeft && 'auto', panels.left && left, 'minmax(0, 1fr)', panels.right && right].filter(Boolean).join(' ') : 'minmax(0, 1fr)'
  const home = useScreen((s) => s.home)

  if (home)
    return (
      <>
        <Home />
        <Toast />
        {/* From zero starts on Home (its Create new) */}
        <TourCard />
      </>
    )

  return (
    <div className={`grid h-app grid-cols-1 bg-canvas font-sans text-ink ${kpis ? 'grid-rows-[auto_auto_1fr]' : 'grid-rows-[auto_1fr]'}`}>
      <TopBar />
      {kpis && <KpiStrip />}
      <main className="relative grid min-h-0 gap-gutter px-gutter pb-gutter" style={{ gridTemplateColumns: columns }}>
        {stripAtLeft && <ToolStrip flat={false} />}
        {/* where a strip dragged to the window's left would stand (a line over the grid: it takes no column) */}
        {wide && dropAtLeft && <div data-strip-drop="left" aria-hidden className="absolute inset-y-0 left-0 w-1 rounded-pill bg-ink" />}
        <PanelColumn side="left" tabs={<PanelTabs />}>
          <PanelBody />
        </PanelColumn>
        <DockArea />
        <PanelColumn side="right" title={summaryTitle} rail={<SummaryRail />}>
          <SummaryPanel />
        </PanelColumn>
      </main>
      <Dialogs />
      <Toast />
      {/* the one right-click menu of the plan and the 3D (Decision "One menu"): mounted once */}
      <MenuHost />
      <FileDrop />
      <TourOffer />
      <TourCard />
      <TerrainEditorBar />
    </div>
  )
}
