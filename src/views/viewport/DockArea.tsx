// The viewport's column and the bars docked to it (Decision "Workspace layout"): the drafting bar, below the viewport by
// default, above it if moved; bars on one side stack in `BARS`' order. The whole is a row: the column (`data-dock-area`, what a
// bar's drag measures) between the Tools strip's two upright places, `panel` (before the column, after the left panel) and `right`
// (after it, before Summary). The strip's flat places, `top` and `bottom`, are in the column, nearer the viewport than the bars.
// The strip's other dock, `left`, is App.tsx's column; below 880 px it lies flat at the column's foot, under the bars, whatever
// the dock (tools/ToolStrip.tsx). A line shows where a strip being dragged would land (`useStripDrag`). A bar moves by
//   its grip (⋮⋮)      → drag it past the viewport's middle (a line shows where it lands); ↑ ↓ on the focused grip
//   its right-click    → Dock above / below the viewport
//   the View menu      → the same, in the top bar
// Where each bar docks, and whether it shows (the View menu, or *Hide* in its menu), is per-browser UI state (`useUi`,
// saved in `gfit.layout`). A hidden drafting bar comes back while a drawing tool asks for typed values: its command
// line is where they go. (A selection's typed move does not bring it back, or it would show at every pick.) The bars and the viewport are keyed
// children of one column, so moving a bar moves its element: the command line's field and the 3D view are not made
// again (nor when the strip moves: its slots in the row and the column are fixed). A plugin's tab put wide (⤢, Decision "Specimens tab") stands under the viewport, a divider between them
// sharing the height; the viewport keeps its place in the tree. Brief and Rules are windows over the app now, never the
// viewport's place (Decision "Brief and Rules as windows", layout/Dialogs.tsx).
import { useRef } from 'react'
import { PluginWidePane, pluginTabLabel, useWidePane, useWideTab, WIDE_SHARE } from '../../plugins/index.ts'
import { Divider } from '../controls/Divider.tsx'
import { BARS, useUi, type Bar, type Dock, type StripDock } from '../layout/ui.ts'
import { useWide } from '../layout/media.ts'
import { useCommand } from '../plan/command/commandState.ts'
import { useTool } from '../plan/tools/toolState.ts'
import { ToolStrip, useStripDrag } from '../tools/ToolStrip.tsx'
import { useDockDrag } from './DockedBar.tsx'
import { DraftingBar } from './DraftingBar.tsx'
import { Viewport } from './Viewport.tsx'

const BAR_VIEW: Record<Bar, () => React.JSX.Element> = { drafting: DraftingBar }

export function DockArea() {
  const wideTab = useWideTab()
  const wideShare = useWidePane((s) => s.share)
  const setWideShare = useWidePane((s) => s.setShare)
  const folded = useWidePane((s) => s.folded)
  const column = useRef<HTMLDivElement>(null)
  const docks = useUi((s) => s.docks)
  const show = useUi((s) => s.show)
  const wide = useWide()
  const drawing = useTool((s) => s.tool !== 'select')
  const typing = useCommand((s) => s.registration !== null) && drawing
  const to = useDockDrag((s) => s.to)
  const stripDock = useUi((s) => s.stripDock)
  const stripTo = useStripDrag((s) => s.to)
  // the drafting bar in every step: the viewport and what helps to look at it are the same in all (Decision "Site with the viewport")
  const shown = (bar: Bar) => show[bar] || (bar === 'drafting' && typing)
  const on = (where: Dock) =>
    BARS.filter((b) => docks[b.key] === where && shown(b.key)).map((b) => {
      const View = BAR_VIEW[b.key]
      return <View key={b.key} />
    })
  const line = (where: Dock) => to === where && <div key={`drop-${where}`} data-drop={where} aria-hidden className="h-1 shrink-0 rounded-pill bg-ink" />
  // the Tools strip, wide: upright beside the column (`panel`, `right`), flat in it (`top`, `bottom`); a line where a drag would land it
  const stripAt = (where: StripDock) => wide && show.tools && stripDock === where
  const upright = (where: 'panel' | 'right') => (
    <>
      {stripAt(where) && <ToolStrip flat={false} />}
      {wide && stripTo === where && <div data-strip-drop={where} aria-hidden className="w-1 shrink-0 rounded-pill bg-ink" />}
    </>
  )
  const stripLine = (where: Dock) => wide && stripTo === where && <div key={`strip-drop-${where}`} data-strip-drop={where} aria-hidden className="h-1 shrink-0 rounded-pill bg-ink" />
  const flatStrip = (where: Dock) => stripAt(where) && <ToolStrip key="tool-strip" flat />
  // under the viewport: a plugin's wide tab; folded, its first line only, the viewport taking the rest
  const below = wideTab ? { view: <PluginWidePane tab={wideTab} />, share: wideShare, reset: WIDE_SHARE, onChange: setWideShare, name: pluginTabLabel(wideTab) } : null
  const shared = below && !folded

  return (
    <div className="flex min-h-0 min-w-0 gap-gutter">
      {upright('panel')}
      <div data-dock-area className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
        {[
          line('top'),
          stripLine('top'),
          ...on('top'),
          flatStrip('top'),
          <div key="viewport" ref={column} className="flex min-h-0 flex-1 flex-col">
            <div className={shared ? 'min-h-0 shrink-0' : 'min-h-0 flex-1'} style={shared ? { height: `${below.share * 100}%` } : undefined}>
              <Viewport />
            </div>
            {below && folded && <div className="mt-2 shrink-0">{below.view}</div>}
            {shared && (
              <Divider
                between="rows"
                label={`Divider between the viewport and the ${below.name}`}
                title="Drag to share the height; double-click puts it back"
                container={column}
                fraction={below.share}
                reset={below.reset}
                onChange={below.onChange}
              />
            )}
            {shared && <div className="min-h-0 flex-1">{below.view}</div>}
          </div>,
          flatStrip('bottom'),
          ...on('bottom'),
          // below 880 px the Tools strip lies flat under the viewport, under the drafting bar, whatever its dock
          !wide && show.tools && <ToolStrip key="tool-strip" flat />,
          line('bottom'),
          stripLine('bottom'),
        ]}
      </div>
      {upright('right')}
    </div>
  )
}
