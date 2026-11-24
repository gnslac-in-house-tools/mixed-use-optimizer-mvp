// What Properties shows for a row of Layers (Phase AS.3, Decision "Settings by what is picked"): the settings that are not tools,
// by what is picked in the tree. The sections are the components the old Site, Levels and Flow tabs mounted, reused here, shown open:
//   Site, Boundary, Buildable area   Location · the site's figures · Site rules      (LocationSection, SiteSections)
//   Map                              Location: the map's source, opacity, Capture, Remove
//   Terrain                          the terrain module's section (its data, ground, standards, Remove), while the module is on
//   Drawings                         + Add drawing… and a line of help, *On top* for every file      (drawingCommands.ts)
//   a drawing file                   its layers' and parcels' counts, Separate / Join layers, *On top* for all of them (on, off or mixed), Remove
//   a layer, a file's parcels        its name, colour, padlock and *On top* (drawn over the model); a parcel its area
//   Grid                             the grid's fields (the Grid menu's component), Move pivot and Restore original included
//   Reference lines                  their count, *On top* for all of them, and a line of what they are (Phase AS.5)
//   Buildings                        the buildings' count and the floor area (New building: the row's ＋, Design › New building)
//   a building, a level              BuildingProperties of that building (its settings, levels, grid, platform)
//   Circulation, Streets             the roads' totals and the link to Brief › Circulation (CirculationTab)
//   Gates                            *Own gates for <option>* / *Use the site's*, + Gate, the link to Brief › Circulation
//   Truck courts                     their count and total area
//   Parking, Street parking, Lots    *Other streets* (the side), the streets with their own, the totals (ParkingTab.tsx's parts, with the lots' help while there is none)
//   the rest (Dimensions, Labels, Issues, Rules, Program graph, Existing roads, Reference, Annotations)   one line that
//                                    says what the row is, and its count where it has one
// The rows picked are `useLayerPick.keys` and, for a drawing file, layer or parcels held by the drawing pick (a joined file is picked
// whole there, a separated one's layers there too), so both are read. Several rows of one kind show a count (buildings: and their
// floor area); mixed kinds, "N rows picked". The header is the row's name and what kind of row it is. Every section sends its verb
// through `actions`, as in the tab it came from.
import { useMemo } from 'react'
import type { Id } from '../../model/schema.ts'
import { isLayerLocked, parcelsLocked } from '../../model/drawings.ts'
import { GridMenu } from '../plan/grid/GridMenu.tsx'
import { useDrawingPick } from '../plan/site/drawingPick.ts'
import { useApp } from '../../state/store.ts'
import { CarParking, LotsHelp, ParkingTotals } from '../../modules/parking/views/ParkingTab.tsx'
import { TerrainSection } from '../../modules/terrain/views/TerrainSection.tsx'
import { Button, Total } from '../controls/fields.tsx'
import { Icon } from '../controls/Icon.tsx'
import { m2 } from '../format.ts'
import { useUi } from '../layout/ui.ts'
import { useModule } from '../modules.ts'
import { GatesSettings } from '../panels/AccessSection.tsx'
import { BuildingProperties } from '../panels/BuildingProperties.tsx'
import { BriefCirculationLink, CirculationTab } from '../panels/CirculationTab.tsx'
import { LocationSection } from '../panels/LocationSection.tsx'
import { SiteFigures, SiteRules } from '../panels/SiteSections.tsx'
import { addDrawing, removeDrawing, setLayerLocked, setParcelsOfLocked, setSplit } from './drawingCommands.ts'
import { useLayerPick, pickLayer } from './layerPick.ts'
import { useSettled } from './settled.ts'
import { toggleOnTop, useOnTopSet } from './layerView.ts'
import { flatRows, layerTree, topState, type LayerRow, type RowKind } from './tree.ts'

/** The id of the row a drawing part is (tree.ts): a file, one of its layers, or its parcels. */
const partRowId = (part: { file: string; layer?: string; parcels?: boolean }): string =>
  part.layer !== undefined ? `layer:${part.file}/${part.layer}` : part.parcels ? `parcels:${part.file}` : `file:${part.file}`

/** Is a row of Layers picked? Properties hands over to this file when it is. */
export function useLayerRowPicked(): boolean {
  const keys = useLayerPick((s) => s.keys.length > 0)
  const parts = useDrawingPick((s) => s.picked.length > 0)
  return keys || parts
}

/** The ids of the rows picked: the layer pick's, and the drawing parts picked (a drawing is picked through its own store). */
function usePickedRowIds(): string[] {
  const keys = useLayerPick((s) => s.keys)
  const parts = useDrawingPick((s) => s.picked)
  return useMemo(() => [...new Set([...keys, ...parts.map(partRowId)])], [keys, parts])
}

/** The tree's rows by id, for the project in view (built when the project, the option or what was derived changes, never during a drag: settled.ts). */
function useRowIndex(): Map<string, LayerRow> {
  const { project, derived } = useSettled()
  const option = useApp((s) => s.option)
  const terrain = useModule('terrain').on
  const parking = useModule('parking').offered
  return useMemo(() => new Map(flatRows(layerTree(project, option, derived, { terrain, parking })).map((r) => [r.id, r])), [project, derived, option, terrain, parking])
}

/** What each kind of row is, under its name. */
const KIND_TEXT: Record<RowKind, string> = {
  branch: 'Group of layers',
  boundary: 'Site boundary',
  buildable: 'Buildable area',
  terrain: 'Terrain',
  map: 'Map under the plan',
  drawings: 'Imported drawings',
  file: 'Drawing file',
  layer: 'Drawing layer',
  parcels: 'Parcels of a drawing',
  parcel: 'Parcel',
  grid: 'Structural grid',
  'reference-lines': 'Reference lines',
  'reference-line': 'Reference line',
  buildings: 'Buildings of the option',
  building: 'Building',
  level: 'Level',
  mass: 'Block',
  streets: 'Streets',
  street: 'Street',
  'existing-roads': 'Existing roads',
  'existing-road': 'Existing road',
  gates: 'Gates',
  gate: 'Gate',
  courts: 'Truck courts',
  lots: 'Parking lots',
  lot: 'Parking lot',
  'street-parking': 'Street parking',
  dimensions: 'Dimensions',
  dimension: 'Dimension',
  labels: 'Labels',
  notes: 'Notes',
  note: 'Note',
  issues: 'Issues',
  rules: 'Rules',
  graph: 'Program graph',
}

/** What the rows with nothing to set are, in a line. */
const WHAT: Record<string, string> = {
  reference: 'What the design stands on: the structural grid and the reference lines.',
  annotations: 'What is written over the plan: dimensions, labels, notes, issues, rules and the program graph. Each has its own row.',
  dimensions: 'The dimensions drawn on the plan with the Dimension tool. Hiding them only hides them; they still hold.',
  labels: 'The masses’ names and areas written on the plan.',
  notes: 'The notes: a text placed on the plan with the Note tool, on a level. Hiding them only hides them; they still hold.',
  issues: 'The warnings beside the masses on the plan (their chips). The issues are listed in the Summary.',
  rules: 'The brief’s rules drawn as arcs between the masses on the plan.',
  graph: 'The program graph drawn over the masses (the Rules window edits it).',
  'existing-roads': 'The roads already in the parcel: the site’s, not the design’s. Pick one below to change it.',
}

const plural = (n: number, one: string, many: string) => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`

/** What several rows of one kind are called. */
const MANY: Partial<Record<RowKind, string>> = {
  building: 'buildings',
  level: 'levels',
  layer: 'layers',
  parcel: 'parcels',
  parcels: 'groups of parcels',
  file: 'drawing files',
}

export function LayerProperties({ muted }: { muted: string }) {
  const ids = usePickedRowIds()
  const index = useRowIndex()
  const rows = ids.flatMap((id) => index.get(id) ?? [])
  if (rows.length === 0) return <p className={`select-text text-caption ${muted}`}>Nothing is picked: pick a row in Layers to see its settings here.</p>
  if (rows.length > 1) return <Several rows={rows} muted={muted} />
  return <One row={rows[0]} muted={muted} />
}

function Header({ title, kind, swatch }: { title: string; kind: string; swatch?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex min-w-0 items-center gap-2">
        {swatch !== undefined && <span aria-hidden className="h-3 w-3 shrink-0 rounded-[4px]" style={{ background: swatch }} />}
        <h2 className="truncate text-headline">{title}</h2>
      </div>
      <span className="text-caption text-ink-secondary">{kind}</span>
    </div>
  )
}

/** Several rows: a count, and what is easy to say of them; mixed kinds, how many. */
function Several({ rows, muted }: { rows: LayerRow[]; muted: string }) {
  const derived = useApp((s) => s.derived)
  const kind = rows[0].kind
  const same = rows.every((r) => r.kind === kind) && MANY[kind] !== undefined
  const title = same ? `${rows.length} ${MANY[kind]}` : `${rows.length} rows picked`
  const buildings = same && kind === 'building' ? rows.flatMap((r) => (r.ref?.building ? [r.ref.building] : [])) : []
  const gfa = buildings.reduce((sum, id) => sum + (derived.buildings[id]?.gfa ?? 0), 0)
  return (
    <section aria-label={title} className="flex flex-col gap-3">
      <Header title={title} kind={same ? KIND_TEXT[kind] : 'Several rows of Layers'} />
      {buildings.length > 0 && (
        <dl aria-label="Figures" className="flex flex-col gap-1.5">
          <Total label="Floor area" value={m2(gfa)} />
        </dl>
      )}
      <p className={`select-text text-caption ${muted}`}>Pick one row to see its settings.</p>
    </section>
  )
}

function One({ row, muted }: { row: LayerRow; muted: string }) {
  const project = useApp((s) => s.project)
  const building = row.ref?.building ? project.buildings.find((b) => b.id === row.ref!.building) : undefined
  // a level's settings are its building's: its name says which level
  const level = row.kind === 'level' && building ? building.levels.find((l) => l.id === row.ref!.level) : undefined
  const kind = row.kind === 'branch' ? (row.id === 'site' ? 'Site' : KIND_TEXT.branch) : KIND_TEXT[row.kind]
  const kindLine = level && building ? `${KIND_TEXT.level} of ${building.name}` : kind
  return (
    <section aria-label={row.label} className="flex flex-col gap-3">
      <Header title={level ? level.name : row.label} kind={kindLine} swatch={row.swatch} />
      <Body row={row} muted={muted} />
    </section>
  )
}

function Body({ row, muted }: { row: LayerRow; muted: string }) {
  switch (row.kind) {
    case 'branch':
      if (row.id === 'site') return <SiteSettings />
      if (row.id === 'circulation') return <CirculationSettings />
      if (row.id === 'parking') return <ParkingSettings muted={muted} />
      return <Line row={row} muted={muted} />
    case 'boundary':
    case 'buildable':
      return <SiteSettings />
    case 'map':
      return <LocationSection />
    case 'terrain':
      return <TerrainSettings muted={muted} />
    case 'drawings':
      return <DrawingsSettings row={row} muted={muted} />
    case 'file':
      return <FileSettings row={row} muted={muted} />
    case 'layer':
    case 'parcels':
      return <LayerSettings row={row} muted={muted} />
    case 'parcel':
      return <ParcelSettings row={row} muted={muted} />
    case 'grid':
      return <GridSettings />
    case 'reference-lines':
      return <ReferenceLinesSettings row={row} muted={muted} />
    case 'buildings':
      return <BuildingsSettings row={row} muted={muted} />
    case 'building':
    case 'level':
      return <BuildingSettings id={row.ref?.building} muted={muted} />
    case 'streets':
      return <CirculationSettings />
    case 'gates':
      return (
        <>
          <GatesSettings muted={muted} />
          <BriefCirculationLink />
        </>
      )
    case 'courts':
      return <CourtsSettings row={row} muted={muted} />
    case 'lots':
    case 'street-parking':
      return <ParkingSettings muted={muted} />
    default:
      return <Line row={row} muted={muted} />
  }
}

/** A row with nothing to set: what it is, in a line, and its count. */
function Line({ row, muted }: { row: LayerRow; muted: string }) {
  return (
    <>
      <p className={`select-text text-caption ${muted}`}>{WHAT[row.id] ?? WHAT[row.kind] ?? `${KIND_TEXT[row.kind]}: nothing to set here.`}</p>
      {row.count !== undefined && (
        <dl aria-label="Count" className="flex flex-col gap-1.5">
          <Total label="Count" value={row.count.toLocaleString('en-US')} />
        </dl>
      )}
    </>
  )
}

/** Site, Boundary, Buildable area: where it is, its figures, its rules. */
function SiteSettings() {
  return (
    <div className="flex flex-col gap-5">
      <LocationSection />
      <SiteFigures />
      <SiteRules />
    </div>
  )
}

function TerrainSettings({ muted }: { muted: string }) {
  const on = useModule('terrain').on
  if (!on) return <p className={`select-text text-caption ${muted}`}>The site has no ground yet.</p>
  return <TerrainSection />
}

function DrawingsSettings({ row, muted }: { row: LayerRow; muted: string }) {
  const boundary = useApp((s) => !!s.project.site.boundary)
  return (
    <>
      <div>
        <Button
          title={boundary ? 'Bring another drawing of the site (DXF, DWG) for its drawing lines and parcels: the boundary and the ground stay' : 'Import the site first: a drawing is brought to a site with a boundary'}
          disabled={!boundary}
          onClick={addDrawing}
        >
          Add drawing…
        </Button>
      </div>
      <OnTopToggle row={row} muted={muted} />
      <p className={`select-text text-caption ${muted}`}>The drawings of the site, kept for their drawing lines and parcels. Each file is a row below, with its layers and its parcels.</p>
    </>
  )
}

/** *On top* of what a row holds (a layer, a file's parcels, a file, Drawings): on, off or mixed; a press puts all on top, or all back. Nothing where the row holds none. */
function OnTopToggle({ row, muted }: { row: LayerRow; muted: string }) {
  const onTop = topState(row.top, useOnTopSet())
  if (onTop === null) return null
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-label text-ink-secondary">On top</span>
      <button
        type="button"
        aria-label={`On top ${row.label}`}
        aria-pressed={onTop === 'mixed' ? 'mixed' : onTop === 'on'}
        title="On top: drawn over the model"
        onClick={() => toggleOnTop(row.top ?? [])}
        className={`pressable grid h-6 w-6 place-items-center rounded-pill ${onTop === 'on' ? 'bg-fill text-ink' : `hover:bg-hover hover:text-ink ${muted}`} ${onTop === 'mixed' ? 'opacity-50' : ''}`}
      >
        <Icon name="onTop" className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

/** A drawing file: its counts, Separate / Join layers, *On top*, Remove. */
function FileSettings({ row, muted }: { row: LayerRow; muted: string }) {
  const file = row.ref?.file ?? ''
  const drawing = useApp((s) => s.project.site.drawings?.find((d) => d.file === file))
  const parcels = useApp((s) => (s.project.site.parcels ?? []).filter((x) => x.file === file).length)
  const layers = drawing?.layers.length ?? 0
  const split = drawing?.split === true
  const flip = () => {
    setSplit(file, !split)
    // the file stays picked, held by the pick its new kind has: a joined one whole, a separated one as a row
    if (split) useDrawingPick.getState().pick({ file })
    else pickLayer(`file:${file}`)
  }
  return (
    <>
      <dl aria-label="Drawing file" className="flex flex-col gap-1.5">
        <Total label="Layers" value={layers.toLocaleString('en-US')} />
        <Total label="Parcels" value={parcels.toLocaleString('en-US')} />
        <Total label="Layers are" value={split ? 'separate' : 'one piece'} />
      </dl>
      <div className="flex flex-wrap gap-2">
        {drawing && (
          <Button
            title={split ? `Join ${file}’s layers: it is picked and moved as one piece` : `Separate ${file}’s layers: each is picked, locked and moved on its own`}
            onClick={flip}
          >
            {split ? 'Join layers' : 'Separate layers'}
          </Button>
        )}
        <Button
          title={`Take ${file}’s layers out of the site, and the parcels it brought`}
          onClick={() => {
            removeDrawing(file)
            useLayerPick.getState().clear()
            useDrawingPick.getState().set([])
          }}
        >
          Remove
        </Button>
      </div>
      <OnTopToggle row={row} muted={muted} />
      <p className={`select-text text-caption ${muted}`}>{split ? 'Its layers are separate: each is a row, picked, locked and moved on its own.' : 'It is one piece: picked and moved whole.'}</p>
    </>
  )
}

/** A drawing layer, or a file's parcels: its name, its colour (a layer's) and its padlock. */
function LayerSettings({ row, muted }: { row: LayerRow; muted: string }) {
  const file = row.ref?.file
  const layer = row.ref?.layer
  const locked = useApp((s) => {
    if (file === undefined) return false
    if (layer !== undefined) {
      const l = s.project.site.drawings?.find((d) => d.file === file)?.layers.find((x) => x.name === layer)
      return l ? isLayerLocked(l) : false
    }
    return parcelsLocked(s.project.site, file)
  })
  const toggle = () => {
    if (file === undefined) return
    if (layer !== undefined) setLayerLocked(file, layer, !locked)
    else setParcelsOfLocked(file, !locked)
  }
  return (
    <>
      <dl aria-label="Layer" className="flex flex-col gap-1.5">
        <Total label="Name" value={row.label} />
        {file !== undefined && <Total label="File" value={file} />}
        {row.count !== undefined && <Total label={layer !== undefined ? 'Lines' : 'Parcels'} value={row.count.toLocaleString('en-US')} />}
        {row.swatch !== undefined && (
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-label text-ink-secondary">Colour</dt>
            <dd className="flex items-center gap-2 text-body text-ink">
              <span aria-hidden data-colour className="h-3 w-3 rounded-[4px]" style={{ background: row.swatch }} />
              {row.swatch}
            </dd>
          </div>
        )}
      </dl>
      {file !== undefined && (
        <div className="flex items-center justify-between gap-3">
          <span className="text-label text-ink-secondary">Padlock</span>
          <button
            type="button"
            aria-label={`Lock ${row.label}`}
            aria-pressed={locked}
            title={locked ? 'Locked: unlock it so it can be moved' : 'Lock it so it stays where it is: seen, not picked on the plan, not moved'}
            onClick={toggle}
            className={`pressable grid h-6 w-6 place-items-center rounded-pill ${locked ? 'bg-fill text-ink' : `hover:bg-hover hover:text-ink ${muted}`}`}
          >
            <Icon name={locked ? 'lock' : 'unlock'} className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      <OnTopToggle row={row} muted={muted} />
      <p className={`select-text text-caption ${muted}`}>A locked one is seen, not picked on the plan and not moved: it is picked from its row here, to read it or to take the lock off. One on top is drawn over the model, in the plan and in the 3D; it is picked and snapped to as before.</p>
    </>
  )
}

function ParcelSettings({ row, muted }: { row: LayerRow; muted: string }) {
  return (
    <>
      <dl aria-label="Parcel" className="flex flex-col gap-1.5">
        <Total label="Name" value={row.label} />
        {row.detail !== undefined && <Total label="Area" value={row.detail} />}
        {row.ref?.file !== undefined && <Total label="File" value={row.ref.file} />}
      </dl>
      <p className={`select-text text-caption ${muted}`}>A parcel of the survey. Its group’s padlock locks them all.</p>
    </>
  )
}

/** The Reference lines row: how many, *On top* for all of them, and what they are for. */
function ReferenceLinesSettings({ row, muted }: { row: LayerRow; muted: string }) {
  return (
    <>
      <dl aria-label="Count" className="flex flex-col gap-1.5">
        <Total label="Count" value={(row.count ?? 0).toLocaleString('en-US')} />
      </dl>
      <OnTopToggle row={row} muted={muted} />
      <p className={`select-text text-caption ${muted}`}>The guides drawn with the Reference line tool: the other tools snap to them, on every level and in every option. Pick one on the plan to see its points; a line that is locked or hidden is a row below, to unlock or show it.</p>
    </>
  )
}

function GridSettings() {
  const wide3d = useUi((s) => s.view === '3d')
  return <GridMenu inPanel disabled={wide3d} />
}

function BuildingsSettings({ row, muted }: { row: LayerRow; muted: string }) {
  const gfa = useApp((s) => s.derived.metrics.gfa)
  return (
    <>
      <dl aria-label="Buildings figures" className="flex flex-col gap-1.5">
        <Total label="Buildings" value={(row.count ?? 0).toLocaleString('en-US')} />
        <Total label="Floor area" value={m2(gfa)} />
      </dl>
      <p className={`select-text text-caption ${muted}`}>The buildings of the option in view. Pick one below for its settings, levels and grid.</p>
    </>
  )
}

/** A building's (or a level's building's) settings: of that building, whichever the plan is on. */
function BuildingSettings({ id, muted }: { id: Id | undefined; muted: string }) {
  const building = useApp((s) => s.project.buildings.find((b) => b.id === id))
  if (!building) return <p className={`select-text text-caption ${muted}`}>It is no longer in the project.</p>
  return <BuildingProperties building={building} heading="none" />
}

function CirculationSettings() {
  return (
    <>
      <CirculationTab />
      <BriefCirculationLink />
    </>
  )
}

function CourtsSettings({ row, muted }: { row: LayerRow; muted: string }) {
  const area = useApp((s) => s.derived.circulation.totals.courtArea)
  return (
    <>
      <dl aria-label="Courts figures" className="flex flex-col gap-1.5">
        <Total label="Courts" value={(row.count ?? 0).toLocaleString('en-US')} />
        <Total label="Area" value={m2(area)} />
      </dl>
      <p className={`select-text text-caption ${muted}`}>In front of the docked walls, as deep as the standards or the wall’s own ask. Set on the mass.</p>
    </>
  )
}

/** The Parking branch, Street parking and Lots: *Other streets*, the streets with their own side, the totals. */
function ParkingSettings({ muted }: { muted: string }) {
  const offered = useModule('parking').offered
  const lots = useApp((s) => s.derived.circulation.lots.length)
  if (!offered) return <p className={`select-text text-caption ${muted}`}>This typology has no parking.</p>
  return (
    <div className="flex flex-col gap-5">
      <CarParking />
      {lots === 0 ? <LotsHelp muted={muted} /> : <p className={`select-text text-caption ${muted}`}>{plural(lots, 'parking lot', 'parking lots')}: each is a row under Lots, to pick and change.</p>}
      <ParkingTotals />
    </div>
  )
}
