// From zero, chapters 7–8 — Earthwork and analysis, then The DXF: the block's platform (Balanced or typed; Balance with
// banks), the cut and fill on the plan, the issues, the figures, the detail and the overlays; Export's CAD plan; the
// project kept as My first project.
import { useTerrainView } from '../../../modules/terrain/views/terrainView.ts'
import { balanceWithBanks } from '../../../modules/terrain/views/platformCommands.ts'
import { useApp } from '../../../state/store.ts'
import { exportDxf } from '../../layout/exporting.ts'
import { useLayerPick } from '../../layers/layerPick.ts'
import { useUi } from '../../layout/ui.ts'
import type { TourStep } from '../tour.ts'
import { tutorialCopies, tutorialHall } from './common.ts'

const EARTH = 'Earthwork and analysis'
const DXF = 'The DXF'

const firstCopy = () => useApp.getState().project.buildings.find((b) => b.id === tutorialCopies()[0])
/** The first block's Properties open: its level the one in view, nothing picked (Properties then shows the building). */
function onProperties() {
  const ui = useUi.getState()
  ui.closeDialog()
  ui.setView('plan')
  const hall = tutorialHall()
  const level = useApp.getState().project.masses.find((m) => m.id === hall)?.levelId
  if (level && useApp.getState().level !== level) useApp.getState().setLevel(level)
  if (useApp.getState().selection.massIds.length) useApp.getState().select(null)
  // a row of Layers picked in an earlier chapter would take the building's place in Properties
  useLayerPick.getState().clear()
  ui.setRail('properties')
}
const onPlan = () => {
  const ui = useUi.getState()
  ui.closeDialog()
  ui.setView('plan')
}

export const EARTHWORK_STEPS: TourStep[] = [
  {
    id: 'zero-platform',
    chapter: EARTH,
    title: 'The block’s platform',
    body: ['The site slopes: each block stands on a platform. Its Properties show it — Balanced, its cut and fill.'],
    why: 'Balanced is the level where the platform’s cut and fill even out; type a level to set your own. Blocks can share a platform, and a block can step onto platforms of its own.',
    anchor: 'platform',
    before: onProperties,
  },
  {
    id: 'zero-balance',
    chapter: EARTH,
    title: 'Balance with banks',
    body: ['Press Balance with banks: the level at which the cut and fill even out with the slopes around the platform too.'],
    anchor: 'platform',
    before: onProperties,
    act: () => {
      const b = firstCopy()
      if (b) balanceWithBanks(b.id)
    },
    done: () => typeof firstCopy()?.platform?.level === 'number',
  },
  {
    id: 'zero-cutfill',
    chapter: EARTH,
    title: 'Cut and fill on the plan',
    body: ['In the bar under the plan, show the terrain’s Earthwork: where the ground is cut and where it is filled.'],
    why: 'Contours and Slope are the other looks: Slope colours the ground by how steep it is, so you see where a road would climb too much.',
    anchor: 'terrain-show',
    before: onPlan,
    act: () => useTerrainView.getState().setShow('earthwork'),
    done: () => useTerrainView.getState().show === 'earthwork',
  },
  {
    id: 'zero-issues',
    chapter: EARTH,
    title: 'Issues',
    body: ['Issues, on the right, lists what breaks a rule or a standard: a road too steep, a court with no way out, a program short of its target.'],
    why: 'Click an issue to see it on the plan; Solve, where an issue has one, fixes it in one undo step.',
    anchor: 'summary-issues',
    before: () => useUi.getState().setSummaryTab('issues'),
  },
  {
    id: 'zero-kpis',
    chapter: EARTH,
    title: 'The figures',
    body: ['The strip at the top keeps the option’s figures in view: built area, coverage, volumes, issues.'],
    why: 'Its ⚙ at the right end chooses which figures it shows.',
    anchor: 'kpis',
  },
  {
    id: 'zero-detail',
    chapter: EARTH,
    title: 'Detail',
    body: ['Detail sets how much the plan draws: Schematic (masses only), Design, Ghosted or Presentation.'],
    anchor: 'detail',
    before: onPlan,
  },
  {
    id: 'zero-overlays',
    chapter: EARTH,
    title: 'Overlays',
    body: ['View › Overlays adds what you want to see over it: the graph of programs, the map, the grid, labels. Each is an eye in Layers too.'],
    anchor: 'menu-view',
    before: onPlan,
  },
  {
    id: 'zero-export',
    chapter: DXF,
    title: 'Export',
    body: ['At the top, File › Export › CAD plan (.dxf).'],
    why: 'The CAD plan holds the site, the buildings cut at the floor with their walls, columns and grid, the streets as one paving, the courts and the parking, on AIA layers at 1:1. Tick 3D for heights and 3D contours.',
    anchor: 'menu-file',
    act: () => exportDxf(false),
  },
  {
    id: 'zero-end',
    chapter: DXF,
    title: 'Done',
    body: ['The CAD plan is in your downloads. My first project is kept in Your projects, on Home: open it any time to go on.'],
    why: 'Each chapter can be taken again on its own from Chapters, on this card.',
  },
]
