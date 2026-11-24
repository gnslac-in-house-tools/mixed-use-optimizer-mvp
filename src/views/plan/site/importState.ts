// An import in progress (Decisions "Site step layout" and "Site file survey"): the file *Import* read and what the
// designer chooses before it becomes the site. UI state, never in the Project or the history; importing makes one undo
// step. Escape lets it go. Its window stands beside the plan whatever panel tab is open.
//   geo      a geolocated file (KML, KMZ, GeoJSON, Shapefile): its shapes where they land, one clicked on the plan is
//            the boundary (ImportBar.tsx); a file with one shape is imported at once
//   survey   a drawing (DXF) or a table of points (CSV): the survey window beside the plan (SurveyWindow.tsx) says the
//            units, the coordinates and what each layer is (a table: which column is x, y and z); the boundary is
//            clicked on the plan among the boundary layers' shapes; its *Import* brings the boundary, its frame and
//            georeference, the contours and the points at once (`importSiteFile`)
import { create } from 'zustand'
import type { Geo, LengthUnit, Site } from '../../../model/schema.ts'
import { csvDrawing, type CsvColumns } from '../../../io/site/csv.ts'
import type { DxfDrawing } from '../../../io/site/dxf.ts'
import { candidatesBounds, placeGeoShapes, type Candidate } from '../../../io/site/place.ts'
import { readSiteFile, type SiteFile } from '../../../io/site/siteFile.ts'
import {
  guessedKinds,
  guessedUnits,
  REFERENCE_KINDS,
  placerOf,
  readChosen,
  surveyLayers,
  type Coordinates,
  type LayerKind,
  type LayerSurvey,
  type SurveyChoice,
  type Surveyed,
} from '../../../io/site/survey.ts'
import type { Bounds } from '../../../engine/geom/polygon.ts'
import { contourToPolygon } from '../../../engine/geom/contour.ts'
import { zoneOf } from '../../../engine/geo/utm.ts'
import { actions } from '../../../state/actions/index.ts'
import { useApp } from '../../../state/store.ts'
import { useToast } from '../../layout/toast.ts'
import { usePlanRef } from '../planRef.ts'
import { previewBounds, previewOf, thumbnailsOf, type PreviewLayer } from './surveyPreview.ts'
import { rememberedSetups, rememberSetup, setupChoice, siteSetup, type Setup } from './surveySetups.ts'

export interface GeoImport {
  kind: 'geo'
  file: Extract<SiteFile, { kind: 'geo' }>
  candidates: Candidate[]
  geo: Geo | null
  hover: number | null
}

export interface SurveyImport {
  kind: 'survey'
  file: Extract<SiteFile, { kind: 'drawing' | 'table' }>
  /** The drawing surveyed: the DXF's, or the table's chosen columns as one layer of points. */
  drawing: DxfDrawing
  /** A table's: which column is x, y and z. */
  columns: CsvColumns | null
  layers: LayerSurvey[]
  /** Each layer's thumbnail (surveyPreview.ts THUMB). */
  thumbs: Record<string, string>
  /** What the file says it is in, and whether its numbers look like UTM. */
  fileUnits: DxfDrawing['units']
  utmLike: boolean
  /** The units first offered (survey.ts guessedUnits): metres, when the header says otherwise but its numbers look
   *  like UTM in metres (`unitsOverridden`). */
  unitsGuess: LengthUnit
  unitsOverridden: boolean
  choice: SurveyChoice
  /** The choice read, or why it cannot be (As the site's on a site with no frame). */
  read: Surveyed | null
  error: string | null
  preview: PreviewLayer[]
  candidates: Candidate[]
  /** The boundary among the candidates (one alone is picked). */
  picked: number | null
  hover: number | null
  /** The layer whose row is under the pointer: drawn strong on the plan. */
  hoverLayer: string | null
  /** The setups to start from (the site's first, then those this browser remembers) and the one started from. */
  setups: Setup[]
  start: number | null
  remember: boolean
  /** What the file brings (Decision "Drawing layers"): the site and its ground, or only references for the site there
   *  is (offered on a site with a boundary: `canReference`); then a layer is only Reference, Parcels or Ignore. */
  brings: 'site' | 'references'
  canReference: boolean
}

export type PendingImport = GeoImport | SurveyImport

interface ImportState {
  pending: PendingImport | null
  /** Bumped when what is imported moves, so the plan frames it. */
  framed: number
  /** `references`: opened from the tree's *+ Add drawing…*, already bringing references alone. */
  begin(file: SiteFile, references?: boolean): void
  setBrings(brings: SurveyImport['brings']): void
  hover(i: number | null): void
  /** A candidate clicked: a geolocated file's is imported; a survey's is the boundary picked. */
  pick(i: number): void
  setUnits(units: SurveyChoice['units']): void
  setCoordinates(c: Coordinates): void
  setKind(layer: string, kind: LayerKind): void
  /** Several layers' kinds at once (the survey window's Delete, Restore, a kind given to the picked rows). */
  setKinds(kinds: Record<string, LayerKind>): void
  setColumns(c: CsvColumns): void
  hoverLayer(name: string | null): void
  startFrom(i: number | null): void
  setRemember(on: boolean): void
  /** The survey's *Import*. */
  commit(): void
  cancel(): void
}

/** The UTM zone to offer first: the site's frame's, else the site's georeference's. */
export function zoneGuess(site: Site): { zone: number; south: boolean } {
  if (site.frame?.utm) return site.frame.utm
  return { zone: site.geo ? zoneOf(site.geo.lon) : 14, south: site.geo ? site.geo.lat < 0 : false }
}

/** How a file is first read: its units, its layers' guesses, and its coordinates. */
function guessedChoice(units: LengthUnit, layers: LayerSurvey[], kinds: Record<string, LayerKind>, utmLike: boolean, site: Site): SurveyChoice {
  const boundary = layers.some((l) => kinds[l.name] === 'boundary')
  // As the site's when the site's file was in the same kind of coordinates: UTM both, or local ground alone
  const f = site.frame
  const asSite = f && (f.utm ? utmLike : !utmLike && !boundary)
  const coordinates: Coordinates = asSite ? { kind: 'site' } : utmLike ? { kind: 'utm', ...zoneGuess(site) } : { kind: 'local' }
  return { units, coordinates, kinds }
}

/**
 * A drawing read for its references alone: a layer guessed Reference or Parcels stays, every other one is Ignore; it
 * lands As the site's (UTM through the site's georeference; Local if the site has neither).
 */
function referencesChoice(s: SurveyImport, site: Site): SurveyChoice {
  const kinds = Object.fromEntries(s.layers.map((l) => [l.name, REFERENCE_KINDS.includes(l.guess) ? l.guess : ('ignore' as LayerKind)]))
  const coordinates: Coordinates = site.frame ? { kind: 'site' } : site.geo && s.utmLike ? { kind: 'utm', ...zoneGuess(site) } : { kind: 'local' }
  return { units: s.unitsGuess, coordinates, kinds }
}

const placement = (s: Pick<SurveyImport, 'choice' | 'read'>) => JSON.stringify([s.choice.units, s.choice.coordinates, s.read?.frame?.origin])

/** The choice read again: where it lands, its candidates, what the plan draws; the pick kept if `keep`. */
function reread(s: SurveyImport, keep: boolean): SurveyImport {
  const site = useApp.getState().project.site
  let read: Surveyed | null = null
  let error: string | null = null
  let preview: PreviewLayer[] = []
  try {
    read = readChosen(s.drawing, s.choice, site)
    preview = previewOf(s.drawing, s.choice.kinds, placerOf(s.drawing, s.choice, site).place)
  } catch (e) {
    error = e instanceof Error ? e.message : String(e)
  }
  const candidates = read?.candidates ?? []
  const picked = candidates.length === 1 ? 0 : keep && s.picked !== null && s.picked < candidates.length ? s.picked : null
  return { ...s, read, error, preview, candidates, picked, hover: null }
}

function surveyOf(file: SurveyImport['file'], columns: CsvColumns | null): SurveyImport {
  const site = useApp.getState().project.site
  const drawing = file.kind === 'drawing' ? file.drawing : csvDrawing(file.table, columns!, file.name)
  const layers = surveyLayers(drawing)
  const kinds = file.kind === 'drawing' ? guessedKinds(layers) : { [file.name]: 'points' as const }
  const guess = guessedUnits(drawing, kinds)
  const utmLike = guess.utm
  const own = siteSetup(site)
  const setups = file.kind === 'drawing' ? [...(own ? [own] : []), ...rememberedSetups()] : []
  const base: SurveyImport = {
    kind: 'survey',
    file,
    drawing,
    columns,
    layers,
    thumbs: thumbnailsOf(drawing),
    fileUnits: file.kind === 'drawing' ? drawing.units : null,
    utmLike,
    unitsGuess: guess.units,
    unitsOverridden: guess.overridden,
    choice: guessedChoice(guess.units, layers, kinds, utmLike, site),
    read: null,
    error: null,
    preview: [],
    candidates: [],
    picked: null,
    hover: null,
    hoverLayer: null,
    setups,
    start: null,
    remember: false,
    brings: 'site',
    canReference: file.kind === 'drawing' && site.boundary !== null,
  }
  return reread(base, false)
}

/** The box to frame while importing; null: nothing to frame. */
export function importBounds(p: PendingImport): Bounds | null {
  if (p.kind === 'geo') return p.candidates.length ? candidatesBounds(p.candidates) : null
  return previewBounds(
    p.preview,
    p.candidates.flatMap((c) => contourToPolygon(c.contour)),
  )
}

const plural = (n: number, one: string) => `${n.toLocaleString('en-US')} ${one}${n === 1 ? '' : 's'}`

export const useSiteImport = create<ImportState>()((set, get) => {
  /** A survey changed: read again, and frame it if it moved. */
  const update = (f: (s: SurveyImport) => SurveyImport, keep: boolean) => {
    const s = get().pending
    if (s?.kind !== 'survey') return
    const next = reread(f(s), keep)
    set((st) => ({ pending: next, framed: placement(next) !== placement(s) ? st.framed + 1 : st.framed }))
  }
  return {
    pending: null,
    framed: 0,
    begin(file, references = false) {
      if (file.kind === 'geo') {
        const placed = placeGeoShapes(file.shapes)
        if (placed.candidates.length === 0) {
          useToast.getState().show('error', `${file.name} has no closed shape to be the site's boundary${file.warnings.length ? ` (${file.warnings[0]})` : ''}.`)
          return
        }
        set({ pending: { kind: 'geo', file, candidates: placed.candidates, geo: placed.geo, hover: null } })
        if (placed.candidates.length === 1) get().pick(0)
        else set((s) => ({ framed: s.framed + 1 }))
        return
      }
      let columns: CsvColumns | null = null
      if (file.kind === 'table') {
        const width = file.table.columns.length
        if (width < 3 || !file.table.rows.length) {
          useToast.getState().show('error', `${file.name} has no points: GFit reads a table of x, y and z.`)
          return
        }
        columns = file.table.guess ?? { x: 0, y: 1, z: 2 }
      }
      const s = surveyOf(file, columns)
      if (!s.layers.length) {
        useToast.getState().show('error', `${file.name} has nothing GFit can read for a site${file.kind === 'drawing' && file.drawing.warnings.length ? ` (${file.drawing.warnings[0]})` : ''}.`)
        return
      }
      const site = useApp.getState().project.site
      const first = references && s.canReference ? reread({ ...s, brings: 'references', choice: referencesChoice(s, site) }, false) : s
      set((st) => ({ pending: first, framed: st.framed + 1 }))
    },
    setBrings(brings) {
      const site = useApp.getState().project.site
      update((s) => {
        if (s.brings === brings || (brings === 'references' && !s.canReference)) return s
        const choice = brings === 'references' ? referencesChoice(s, site) : guessedChoice(s.unitsGuess, s.layers, guessedKinds(s.layers), s.utmLike, site)
        return { ...s, brings, start: null, choice }
      }, false)
    },
    hover(i) {
      const p = get().pending
      if (p && p.hover !== i) set({ pending: { ...p, hover: i } })
    },
    pick(i) {
      const p = get().pending
      const c = p?.candidates[i]
      if (!p || !c) return
      if (p.kind === 'survey') {
        set({ pending: { ...p, picked: i } })
        return
      }
      useApp.getState().apply((q) => actions.importSite(q, c.contour, p.file.name, p.geo))
      set({ pending: null })
      const w = p.file.warnings
      useToast.getState().show('info', `Imported the site from ${p.file.name}${w.length ? `: ${plural(w.length, 'note')} (${w[0]})` : '.'}`)
      // frame the new site once the plan has it
      queueMicrotask(() => usePlanRef.getState().fit?.())
    },
    setUnits: (units) => update((s) => ({ ...s, choice: { ...s.choice, units } }), true),
    setCoordinates: (coordinates) => update((s) => ({ ...s, choice: { ...s.choice, coordinates } }), true),
    setKind: (layer, kind) => update((s) => ({ ...s, choice: { ...s.choice, kinds: { ...s.choice.kinds, [layer]: kind } } }), false),
    setKinds: (kinds) => update((s) => ({ ...s, choice: { ...s.choice, kinds: { ...s.choice.kinds, ...kinds } } }), false),
    setColumns(columns) {
      const s = get().pending
      if (s?.kind !== 'survey' || s.file.kind !== 'table') return
      const next = surveyOf(s.file, columns)
      // the units and coordinates chosen stay
      update(() => ({ ...next, choice: { ...next.choice, units: s.choice.units, coordinates: s.choice.coordinates } }), false)
    },
    hoverLayer(name) {
      const p = get().pending
      if (p?.kind === 'survey' && p.hoverLayer !== name) set({ pending: { ...p, hoverLayer: name } })
    },
    startFrom(i) {
      const site = useApp.getState().project.site
      update((s) => {
        const guessed = guessedChoice(s.unitsGuess, s.layers, guessedKinds(s.layers), s.utmLike, site)
        const setup = i === null ? null : s.setups[i]
        // a setup is a site's: it brings the site and its ground
        return { ...s, brings: 'site', start: setup ? i : null, choice: setup ? setupChoice(setup, s.layers, guessed, !!site.frame) : guessed }
      }, false)
    },
    setRemember(remember) {
      const p = get().pending
      if (p?.kind === 'survey') set({ pending: { ...p, remember } })
    },
    commit() {
      const s = get().pending
      if (s?.kind !== 'survey' || !s.read || !importable(s)) return
      const r = s.read
      const boundary = s.picked !== null ? s.candidates[s.picked].contour : undefined
      const ground = r.contours.length + r.points.length > 0
      const roads = r.roads.length > 0 ? r.roads : undefined
      const chosen = Object.fromEntries(Object.entries(s.choice.kinds).filter((e): e is [string, Exclude<LayerKind, 'ignore'>] => e[1] !== 'ignore'))
      const frame = boundary && r.frame ? { ...r.frame, layers: chosen } : r.frame
      const name = s.file.name
      useApp.getState().apply((q) =>
        actions.importSiteFile(q, {
          name,
          boundary,
          frame,
          geo: r.geo,
          terrain: ground ? { contours: r.contours, points: r.points, source: { file: name, layers: r.layers } } : undefined,
          roads,
          drawing: r.references.length ? { file: name, layers: r.references } : undefined,
          parcels: r.parcels.length ? r.parcels.map((p) => ({ name: p.name, contour: p.contour, file: name })) : undefined,
        }),
      )
      if (s.remember && s.brings === 'site') rememberSetup({ file: name, at: new Date().toISOString(), ...s.choice })
      set({ pending: null })
      const what = [
        boundary ? 'the boundary' : '',
        r.parcels.length ? plural(r.parcels.length, 'parcel') : '',
        r.contours.length ? plural(r.contours.length, 'contour') : '',
        r.points.length ? plural(r.points.length, 'point') : '',
        r.roads.length ? plural(r.roads.length, 'existing road') : '',
        r.references.length ? plural(r.references.length, 'reference layer') : '',
      ].filter(Boolean)
      const said = what.length > 1 ? `${what.slice(0, -1).join(', ')} and ${what.at(-1)}` : what[0]
      useToast.getState().show('info', `Imported ${said} from ${name}${r.warnings.length ? `: ${plural(r.warnings.length, 'note')} (${r.warnings[0]})` : '.'}`)
      queueMicrotask(() => usePlanRef.getState().fit?.())
    },
    cancel: () => set({ pending: null }),
  }
})

/** Can the survey be imported: something chosen, and the boundary picked when there are several? */
export function importable(s: SurveyImport): boolean {
  if (!s.read) return false
  if (s.candidates.length > 1 && s.picked === null) return false
  const r = s.read
  return s.candidates.length > 0 || r.contours.length + r.points.length + r.roads.length + r.references.length + r.parcels.length > 0
}

/** *Import*: read the file, then survey it or pick its boundary. A failure only shows in the notice. `references`:
 *  the tree's *+ Add drawing…* (Decision "Drawing layers"), the survey opened bringing references alone. */
export async function importSiteFile(f: File, references = false): Promise<void> {
  try {
    useSiteImport.getState().begin(await readSiteFile(f.name, await f.arrayBuffer()), references)
  } catch (e) {
    useToast.getState().show('error', `Could not import ${f.name}: ${e instanceof Error ? e.message : String(e)}`)
  }
}

/** The file picker for *Import* (`references`: for *+ Add drawing…*). */
export function pickSiteFile(accept: string, references = false): void {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = accept
  input.onchange = () => {
    const f = input.files?.[0]
    if (f) void importSiteFile(f, references)
  }
  input.click()
}
// a file being imported stays whatever panel tab is open: its window is the viewport's
