// From zero, chapter 2 — The site from a drawing: Import, the tutorial's site file in the survey window (units and
// coordinates; each layer's kind; the scratch layer filtered out; the neighbours kept as a reference; the boundary and
// the ground), then Import.
import { useApp } from '../../../state/store.ts'
import { useUi } from '../../layout/ui.ts'
import { useSiteImport, type SurveyImport } from '../../plan/site/importState.ts'
import type { TourStep } from '../tour.ts'
import { openTutorialSite } from './siteFile.ts'

const CHAPTER = 'The site from a drawing'

const sited = () => useApp.getState().project.site.boundary !== null
const survey = (): SurveyImport | null => {
  const p = useSiteImport.getState().pending
  return p?.kind === 'survey' ? p : null
}
/** The survey open on the tutorial's file (unless the site is in already). */
async function surveying(): Promise<SurveyImport | null> {
  if (!survey() && !sited()) await openTutorialSite()
  return survey()
}
const onSite = () => {
  useUi.getState().setView('plan')
}

export const SITE_STEPS: TourStep[] = [
  {
    id: 'zero-import',
    chapter: CHAPTER,
    title: 'Import the site',
    body: ['Open Site › Import… and choose a site file. For this tutorial, use its own file: the button below.'],
    why: 'Import reads a drawing (DXF, DWG), a table of points (CSV) or a map file (KML, GeoJSON, shapefile): the boundary, the ground and what surrounds the site.',
    anchor: 'menu-site',
    action: { label: 'Use the tutorial’s site file', run: openTutorialSite },
    before: onSite,
    act: async () => {
      await surveying()
    },
    done: () => survey() !== null || sited(),
  },
  {
    id: 'zero-units',
    chapter: CHAPTER,
    title: 'Units and coordinates',
    body: ['This drawing is in metres, in local coordinates: keep them.'],
    why: 'A file in feet or millimetres is scaled to metres here. UTM coordinates place the site on the map (its location, its north and the satellite view).',
    anchor: 'survey-units',
    act: async () => {
      if (await surveying()) useSiteImport.getState().setUnits('m')
    },
    done: () => survey()?.choice.units === 'm' || sited(),
  },
  {
    id: 'zero-layers',
    chapter: CHAPTER,
    title: 'What each layer is',
    body: ['Each layer of the drawing has a kind, guessed from its name and what it holds. Hover a row to see its layer on the plan.'],
    why: 'Boundary: the site’s outline. Parcels: lots inside it. Contours and Points: the ground’s heights. Roads: existing roads, by their centrelines. Reference: lines kept as drawn, shown but never built on.',
    anchor: 'survey-layers',
  },
  {
    id: 'zero-filter',
    chapter: CHAPTER,
    title: 'Filter out what is not needed',
    body: ['Z-SCRATCH holds stray lines left in the drawing. Click its row and press Delete.'],
    why: 'Shift picks a run of rows, Ctrl one more; Delete takes them all out of the import. What is deleted waits under the list: Restore brings it back.',
    anchor: 'survey-layers',
    act: async () => {
      if (await surveying()) useSiteImport.getState().setKind('Z-SCRATCH', 'ignore')
    },
    done: () => sited() || survey()?.choice.kinds['Z-SCRATCH'] === 'ignore',
  },
  {
    id: 'zero-reference',
    chapter: CHAPTER,
    title: 'A reference drawing',
    body: ['NEIGHBOURS is Reference: the neighbouring lots, kept as drawn so you see what is around the site.'],
    why: 'A reference never becomes a site or a building. More drawings can be added later with the + of the Drawings row, in Site in Layers (Add drawing…); each file and layer there can be hidden, locked or drawn on top.',
    anchor: 'survey-layers',
  },
  {
    id: 'zero-boundary',
    chapter: CHAPTER,
    title: 'Boundary and ground',
    body: ['One closed shape is the boundary; the contours make the ground under the whole site.'],
    why: 'When a boundary layer holds several shapes, you click the one that is the site on the plan (or Use the largest).',
    anchor: 'survey-boundary',
  },
  {
    id: 'zero-commit',
    chapter: CHAPTER,
    title: 'Import',
    body: ['Click Import.'],
    why: 'One step: undo brings the site back as it was.',
    anchor: 'survey-import',
    act: async () => {
      if (await surveying()) useSiteImport.getState().commit()
    },
    done: sited,
  },
  {
    id: 'zero-site-done',
    chapter: CHAPTER,
    title: 'The site',
    body: ['The boundary, the ground’s contours, the existing road along the south side and the neighbouring lots are on the plan.'],
    anchor: 'viewport',
    before: onSite,
  },
]
