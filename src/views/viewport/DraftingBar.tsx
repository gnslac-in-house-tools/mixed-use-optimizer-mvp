// The drafting bar, docked under the viewport by default (Decisions "Layout by function", "Workspace layout"; AutoCAD's
// and Rhino's status bar), in the panels' paper: what helps to draw at its left, how the viewport looks at its right
// (Decision "Bottom bar"; the user: "the presentation mode in the bottom bar … these controls hidden in a drop-down").
//   left  → the command line (what the active tool expects, or which keys start one)
//   then  → the snap: Snap, its kinds ▾, Align · Ortho, Grid
//   right → the view's look: the terrain's look (once the site has ground), the Detail (Schematic · Design · Presentation). What sits over the
//           drawing as an indicator (the graph, the map, labels, dimensions, issues, rules) is an eye of Layers and View › Overlays (Phase AS.3:
//           *Overlays ▾* went from this bar)
//   end   → Plan · 3D · Split (`ViewTabs`), after the Detail, except on a phone, where the top bar's view switch shows them
// Dimension and Ruler are the Tools strip's Annotations (tools/ToolStrip.tsx), not this bar's.
// It stays in the 3D view, with what only the plan uses disabled, so the frame does not jump when the view changes.
// Fit went to the viewport's Frame button, which frames the plan and the 3D at once (Decision "One Frame").
// Short of room (a 14" screen with both panels open; the user: "no horizontal scroll, everything visible… drop-downs or
// another strategy"), the bar goes compact (Decision "Compact drafting bar"): the command line's idle note gives way; the
// Detail, the Terrain and the view tabs stay in view.
import { useUi } from '../layout/ui.ts'
import { usePhone } from '../layout/media.ts'
import { ViewTabs } from '../layout/ViewSwitch.tsx'
import { DetailSelect } from '../show/ShowControls.tsx'
import { TerrainViewRow } from '../../modules/terrain/views/TerrainViewRow.tsx'
import { CommandLine } from '../plan/command/CommandLine.tsx'
import { SnapBar } from '../plan/SnapBar.tsx'
import { useCommand } from '../plan/command/commandState.ts'
import { DockedBar, useCompactBar } from './DockedBar.tsx'

export function DraftingBar() {
  return (
    <DockedBar bar="drafting" label="Drafting" className="py-1.5">
      <DraftingTools />
    </DockedBar>
  )
}

/** What the bar holds, full or compact (`useCompactBar`, which the DockedBar gives). */
function DraftingTools() {
  const plan = useUi((s) => s.view !== '3d')
  const compact = useCompactBar()
  // a phone's top bar has the view tabs (ViewSwitch)
  const phone = usePhone()
  // compact, the command line shows only while a tool asks for something
  const asking = useCommand((s) => s.registration !== null)
  return (
    <>
      <div className="min-w-0 flex-1 overflow-hidden">{(!compact || asking) && <CommandLine />}</div>
      <SnapBar disabled={!plan} />
      <span aria-hidden className="h-5 w-px shrink-0 bg-separator" />
      <TerrainViewRow />
      <DetailSelect />
      {!phone && (
        <>
          <span aria-hidden className="h-5 w-px shrink-0 bg-separator" />
          <ViewTabs />
        </>
      )}
    </>
  )
}
