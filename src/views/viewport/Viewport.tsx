// The viewport (Decisions "Layout", "Layout by function" and "Workspace layout"; port of Plaza-Practiko
// `vistas/Viewport.tsx`): the plan, the 3D view or both side by side, and the little that floats over them on glass:
//   top right → the levels rail       bottom right → warnings chip, then Frame (the plan's and the 3D's at once)
//   top left → a file's survey window while it is imported (Decision "Site file survey"), else the guide
//   bottom left → the slope's legend while Show's Terrain is Slope (Decision "Terrain layout")
//   below 880 px, the selected mass's Properties as a card (on a wide screen they are in the Parameters panel)
// The tools are in the Tools strip (tools/ToolStrip.tsx), the drafting aids and Plan · 3D · Split in the drafting bar docked to the
// viewport (DraftingBar.tsx), and the programs in the Program tab, so the plan stays clear.
// Each view keeps its place in the tree: from 3D to Split the WebGL canvas is not created again, nor the plan from
// Plan to Split. The floating rows are pointer-events-none: the empty space between controls stays the views'.
// While Compare is open (Decision "Compare options"), it takes the viewport's place; in the Warehouse step, the type
// alone does (Decision "Warehouse layout"). While it shows a look (Decision
// "Specimen preview"), its bar stands top centre and the warnings chip goes: the strip says how the look stands.
import { useRef, useState } from 'react'
import { Compare } from '../compare/Compare.tsx'
import { useCompare } from '../compare/compareView.ts'
import { Divider } from '../controls/Divider.tsx'
import { usePhone, useWide } from '../layout/media.ts'
import { useUi } from '../layout/ui.ts'
import { LevelRail } from './LevelRail.tsx'
import { useLooking } from './look.ts'
import { LookBar } from './LookBar.tsx'
import { HeightsBar } from '../../modules/terrain/views/HeightsLayer.tsx'
import { BarraPisos } from '../../modules/residential/views/BarraPisos.tsx'
import { PushPullLabel } from './PushPullLabel.tsx' // mixed-use-mvp
import { ImportBar } from '../plan/site/ImportBar.tsx'
import { useSiteImport } from '../plan/site/importState.ts'
import { SurveyWindow } from '../plan/site/SurveyWindow.tsx'
import { MapAttribution } from '../plan/site/MapLayer.tsx'
import { CutFillLegend, SlopeLegend } from '../../modules/terrain/views/TerrainLayer.tsx'
import { Properties } from '../panels/Properties.tsx'
import { Guide } from '../graph/Guide.tsx'
import { useGraph } from '../graph/graphState.ts'
import { PlanSvg } from '../plan/PlanSvg.tsx'
import { LazyScene } from '../scene/LazyScene.tsx'
import { WarningsChip } from '../stats/WarningsChip.tsx'
import { Icon } from '../controls/Icon.tsx'
import { usePlanRef } from '../plan/planRef.ts'
import { useSceneRef } from '../scene/sceneRef.ts'
import { frameModel } from './frame.ts'
import { t as tr } from '../../i18n/idioma.ts' // mixed-use-mvp

/** Frame (Decision "One Frame"): the plan fits the site, the 3D frames the model; in Split both at once. */
function FrameButton() {
  const fit = usePlanRef((s) => s.fit)
  const frame = useSceneRef((s) => s.frame)
  return (
    <button
      type="button"
      className="glass pressable pointer-events-auto grid h-[2rem] w-[2rem] place-items-center text-ink shadow-control hover:bg-hover disabled:opacity-40"
      aria-label="Frame the model"
      title={tr("Frame the model (in the plan, or double-click on empty space)")}
      disabled={!fit && !frame}
      onClick={frameModel}
    >
      <Icon name="reset" />
    </button>
  )
}

export function Viewport() {
  const chosen = useUi((s) => s.view)
  // the 3D draws the graph over ghosted masses with Show's Graph on, in every step (the Rules window draws the diagram)
  const graph = useGraph((s) => s.graph)
  const guided = useUi((s) => s.help)
  const phone = usePhone()
  const wide = useWide()
  // a phone has no room for two views: Split shows as Plan
  const view = phone && chosen === 'split' ? 'plan' : chosen
  const split = view === 'split'
  const [fraction, setFraction] = useState(0.5)
  const rowRef = useRef<HTMLDivElement>(null)
  const comparing = useCompare((s) => s.open)
  const looking = useLooking()
  // a file's survey window stands where the guide does (top left)
  const surveying = useSiteImport((s) => s.pending?.kind === 'survey')

  if (comparing)
    return (
      <section className="panel relative h-full min-h-0 overflow-hidden bg-panel-sunken" aria-label="Viewport" data-tour="viewport">
        <Compare />
      </section>
    )

  return (
    <section className="panel relative h-full min-h-0 overflow-hidden bg-panel-sunken" aria-label="Viewport" data-tour="viewport">
      <div ref={rowRef} className="relative isolate flex h-full min-h-0">
        {view !== '3d' && (
          <div className={split ? 'relative min-w-0 shrink-0 overflow-hidden' : 'relative min-w-0 flex-1 overflow-hidden'} style={split ? { width: `${fraction * 100}%` } : undefined}>
            <PlanSvg />
            <MapAttribution />
          </div>
        )}
        {split && (
          <Divider
            between="columns"
            label="Divider between plan and 3D"
            title={tr("Drag to change the width; double-click shares it in half")}
            container={rowRef}
            fraction={fraction}
            reset={0.5}
            onChange={setFraction}
          />
        )}
        {view !== 'plan' && (
          <div className="relative isolate min-w-0 flex-1">
            <LazyScene className="h-full w-full" graph={graph} />
          </div>
        )}
      </div>

      {/* the bottom right corner: the issues, then Frame, on one line (the user: "so it does not float") */}
      <div className="pointer-events-none absolute bottom-4 right-4 flex items-center gap-2 phone:bottom-16 phone:right-3">
        {!looking && <WarningsChip />}
        <FrameButton />
      </div>
      <SlopeLegend />
      <CutFillLegend />
      <LookBar />
      <ImportBar />
      <HeightsBar />
      {/* mixed-use-mvp: la barra de pisos de uso mixto (abajo a la izquierda; nada fuera de Uso mixto) */}
      {!looking && <BarraPisos />}
      <PushPullLabel />
      <SurveyWindow />

      {/* top right: the levels rail; below 880 px the selection's card stands to its left (on a phone, at the bottom) */}
      <div className="pointer-events-none absolute right-4 top-4 flex max-h-[calc(100%-2rem)] items-start gap-2 phone:right-3 phone:top-3">
        {!wide && !phone && <Properties surface="glass" />}
        <LevelRail />
      </div>
      {/* the pipeline's card, top left (the levels rail is top right) */}
      {guided && !surveying && <Guide />}
      {phone && (
        <div className="pointer-events-none absolute inset-x-3 bottom-3">
          <Properties surface="glass" />
        </div>
      )}
    </section>
  )
}
