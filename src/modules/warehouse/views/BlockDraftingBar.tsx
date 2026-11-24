// The block editor's bottom bar (Phase BE.10, spec Goal 8; BE.0 layout (d)): the main drafting bar's part that applies
// to a block alone, the project's own components (views/viewport/DraftingBar.tsx; the measures are the block editor's, MeasureTools.tsx):
//   Snap ▾  Align │ Ortho  Grid │ Dimension  Ruler │ Plan · 3D · Split │ Detail ▾
// Left out: Terrain, Map, Graph, Levels, Issues, Rules (the Overlays), the grid's look, *Snap to* drawing lines, reference lines and
// contours, and the command line. The Grid is the block's own module (blockSnap.ts `moduleNode`). A measure and a
// block tool (Select, Hole, Split, Dock…) are one at a time: a measure gives the block's tool way to Select (and lets go
// of what is picked), a block tool turns the measure off; neither outlives the block editor. The keys its titles name
// (D, T, F3, F8, F9) are the block editor's commands (`block.*`, commands.ts), answered in the Program window by the
// dispatcher; `blockBar.ts` says whether this bar is on screen.
import { useEffect } from 'react'
import { titleWith } from '../../../views/commands/shortcuts.ts'
import { useUi } from '../../../views/layout/ui.ts'
import { ViewTabs } from '../../../views/layout/ViewSwitch.tsx'
import { SnapBar } from '../../../views/plan/SnapBar.tsx'
import { useRuler, useTool } from '../../../views/plan/tools/toolState.ts'
import { inHand, letGo } from '../../../views/tools/hand.ts'
import { DetailSelect } from '../../../views/show/ShowControls.tsx'
import { MeasureTools } from './MeasureTools.tsx'
import { useLengths } from './units.ts'
import { barShown } from './blockBar.ts'
import { useWarehouse } from './warehouseState.ts'

/** The measures off: Dimension back to Select, the Ruler put away. */
function measuresOff() {
  if (inHand('dimension') || inHand('ruler')) letGo()
}

/** A measure on: the block's tool gives way to Select and what is picked is let go (Delete is not the plan's then). */
function measureOn() {
  const w = useWarehouse.getState()
  if (w.tool !== 'select') w.setTool('select')
  if (w.picked.length) w.setPicked([])
}

const Bar = () => <span aria-hidden className="h-5 w-px shrink-0 bg-separator" />

/** `module`: the block's interior module along x and y (m; its parent's, from the type's runs: no block generated for a
 *  title); null: none shown. */
export function BlockDraftingBar({ module: m }: { module: { x: number; y: number } | null }) {
  const plan = useUi((s) => s.view !== '3d')
  const { text } = useLengths()
  const module = m && (Math.abs(m.x - m.y) < 1e-6 ? text(m.x) : `${text(m.x)} × ${text(m.y)}`)
  const gridTitle = titleWith(module ? `The block’s ${module} modules: the snap to their nodes` : 'The block’s modules: the snap to their nodes', 'block.grid')

  // a block tool turns a measure off, a measure (its chip or its key) the block's tool and its pick; none is left on
  // from the main plan, or after the block editor
  useEffect(() => {
    measuresOff()
    barShown(true)
    const stop = useWarehouse.subscribe((s, before) => {
      if (s.tool !== before.tool && s.tool !== 'select') measuresOff()
    })
    const stopTool = useTool.subscribe((s, before) => {
      if (s.tool === 'dimension' && before.tool !== 'dimension') measureOn()
    })
    const stopRuler = useRuler.subscribe((s, before) => {
      if (s.active && !before.active) measureOn()
    })
    return () => {
      barShown(false)
      stop()
      stopTool()
      stopRuler()
      measuresOff()
    }
  }, [])

  return (
    <section aria-label="Block drafting" className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-t border-separator bg-panel px-panel-pad py-1.5">
      <SnapBar disabled={!plan} snapTo={false} gridTitle={gridTitle} gridMenu={false} />
      <Bar />
      <MeasureTools plan={plan} />
      <Bar />
      <ViewTabs />
      <Bar />
      <DetailSelect />
    </section>
  )
}
