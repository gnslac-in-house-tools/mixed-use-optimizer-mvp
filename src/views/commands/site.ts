// The Site menu's commands (Project C, AS.1): Import…, Draw boundary, Place map, Location…, Site rules…, Terrain…, Move
// grid pivot, Restore the grid. They set the site up once; they are not drawing tools of the strip (spec "The Tools
// strip"), so they carry no `tool`, only a tick where the control has one. Each `run` calls what the control it stands for
// calls: Import (`pickSiteFile`), Draw and Place (the hand's `toggle`: a tool works whatever panel tab is open, so it opens
// none), the Grid menu's Move pivot and Restore original. Location… and Site rules… pick the Site row of Layers and Terrain… its
// Terrain row, which shows Properties with the left panel open (`layers/show.ts`, Phase AS.3). Terrain… is listed only while the
// terrain module is on, as the Terrain row is.
import { SITE_FILE_ACCEPT } from '../../io/site/siteFile.ts'
import { isOn } from '../../modules/catalog.ts'
import { useApp } from '../../state/store.ts'
import { restoreGrid } from '../plan/grid/GridToolLayer.tsx'
import { pickSiteFile } from '../plan/site/importState.ts'
import { showLayer } from '../layers/show.ts'
import { inHand, toggle } from '../tools/hand.ts'
import { PLAN_OFF } from '../tools/pickTool.ts'
import { useUi } from '../layout/ui.ts'
import { register, registerList } from './registry.ts'
import type { Command } from './types.ts'

const SITE = ['Site']

export const SITE_COMMANDS: Command[] = [
  { id: 'site.import', label: 'Import…', menu: SITE, run: () => pickSiteFile(SITE_FILE_ACCEPT) },
  {
    id: 'site.draw',
    label: 'Draw boundary',
    menu: SITE,
    run: () => toggle('draw'),
    checked: () => inHand('draw'),
  },
  {
    id: 'site.place-map',
    label: 'Place map',
    menu: SITE,
    run: () => toggle('place'),
    enabled: () => (useApp.getState().project.site.map ? true : 'No map under the plan yet'),
    checked: () => inHand('place'),
  },
  { id: 'site.location', label: 'Location…', menu: SITE, run: () => showLayer('site') },
  { id: 'site.rules', label: 'Site rules…', menu: SITE, run: () => showLayer('site') },
]

/** Terrain…: the Terrain row's Properties, there once the site has ground. */
const TERRAIN: Command = { id: 'site.terrain', label: 'Terrain…', menu: SITE, run: () => showLayer('terrain') }
const terrain = (): Command[] => (isOn(useApp.getState().project, 'terrain') ? [TERRAIN] : [])

const GRID_COMMANDS: Command[] = [
  // the Grid menu's Move pivot: the handles are on the plan, so the 3D alone has nothing to hold
  { id: 'site.grid-pivot', label: 'Move grid pivot', menu: SITE, run: () => toggle('grid'), enabled: () => (useUi.getState().view === '3d' ? PLAN_OFF : true), checked: () => inHand('grid') },
  { id: 'site.restore-grid', label: 'Restore the grid', menu: SITE, run: restoreGrid },
]

export function registerSite(): void {
  register(SITE_COMMANDS)
  registerList(SITE, terrain, () => [TERRAIN])
  register(GRID_COMMANDS)
}
