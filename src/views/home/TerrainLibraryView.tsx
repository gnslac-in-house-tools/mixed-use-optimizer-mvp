// Home's Terrain (Decision "Home libraries"): the terrain library in place of the projects' table, as cards — each
// terrain's plan (its boundary and contours), its name, its size and ground, whose it is (GFit's, or Mine: this
// browser's). Search narrows it. *Upload…* takes a terrain's file (.gfs) at once, and a drawing or a geolocated file
// (DXF, DWG, CSV, KML, GeoJSON, Shapefile) through the site import in the terrain editor (terrainEditor.ts). A
// card's *New project here* opens Create new on a project on it; *.gfs* and *DXF* download it; *Remove* forgets one of
// this browser's (asked first). One put in `src/state/terrains/` and merged to main is GFit's, for everyone.
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { contourToPolygon } from '../../engine/geom/contour.ts'
import { area } from '../../engine/geom/polygon.ts'
import { SITE_FILE_ACCEPT } from '../../io/site/siteFile.ts'
import { readTerrainFile, TERRAIN_EXTENSION, terrainDxf, terrainFileName, writeTerrainFile } from '../../io/terrains.ts'
import type { LibraryTerrain } from '../../model/schema.ts'
import { Icon } from '../controls/Icon.tsx'
import { download, readText } from '../layout/browserIo.ts'
import { useToast } from '../layout/toast.ts'
import { openCreateNew } from './CreateNew.tsx'
import { HOME_ICONS } from './icons.ts'
import { openTerrainEditor } from './terrainEditor.ts'
import { libraryTerrain, libraryTerrains, loadGfitTerrains, removeTerrain, saveTerrain, useTerrainLibrary, type LibraryTerrainEntry } from './terrainLibrary.ts'
import { terrainThumb } from './thumb.ts'
import { t as tr } from '../../i18n/idioma.ts' // mixed-use-mvp

const SHELF = { gfit: 'GFit', browser: 'Mine' } as const

/** What a terrain holds, in a few words: its area, its contours, its points. */
export function terrainFacts(t: LibraryTerrain): string {
  const s = t.site
  const facts = [
    s.boundary && `${(area(contourToPolygon(s.boundary)) / 10_000).toFixed(1)} ha`,
    s.terrain?.contours.length && `${s.terrain.contours.length} contours`,
    s.terrain?.points.length && `${s.terrain.points.length} points`,
  ].filter(Boolean)
  return facts.length ? facts.join(' · ') : 'Nothing drawn yet'
}

/** A terrain's file (.gfs) brought into this browser's shelf, unless the library has it at that version or later. */
export async function importTerrain(f: File): Promise<void> {
  const { show } = useToast.getState()
  const r = readTerrainFile(await readText(f))
  if (!r.ok) return show('error', `Could not upload ${f.name}: ${r.error}.`)
  const t = r.terrain
  const there = libraryTerrain(t.id)
  if (there && there.terrain.version >= t.version) return show('info', `“${t.name}” is in the library already (version ${there.terrain.version}).`)
  if (!saveTerrain(t)) return show('error', 'This browser’s storage is full or blocked: the terrain was not uploaded.')
  show('info', `Uploaded “${t.name}” into this browser’s terrains.`)
}

/** Upload…: a .gfs at once, any other site file in the terrain editor. */
export function uploadTerrain(f: File): void {
  if (f.name.toLowerCase().endsWith(`.${TERRAIN_EXTENSION}`)) void importTerrain(f)
  else openTerrainEditor(f)
}

export function TerrainLibraryView({ onBack }: { onBack: () => void }) {
  const count = useTerrainLibrary((s) => s.count)
  const gfit = useTerrainLibrary((s) => s.gfit)
  const all = useMemo(() => libraryTerrains(), [count, gfit])
  const [query, setQuery] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)
  useEffect(() => void loadGfitTerrains(), [])
  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (f) uploadTerrain(f)
  }
  const q = query.trim().toLowerCase()
  const shown = all.filter((e) => !q || e.terrain.name.toLowerCase().includes(q))

  return (
    <section aria-label="Terrain library" className="flex min-h-0 flex-1 flex-col gap-3 rounded-[0.875rem] bg-panel p-4 shadow-[inset_0_0_0_1px_var(--separator)]">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={onBack} title="Back to your projects" className="pressable flex h-[2.125rem] items-center gap-1 rounded-[0.625rem] px-2 text-label text-ink-segment hover:bg-hover hover:text-ink">
          <Icon path={HOME_ICONS.back} className="h-4 w-4" />
          {tr("Projects")}
        </button>
        <h2 className="mr-auto text-headline text-ink">{tr("Terrain")}</h2>
        <label className="flex h-[2.125rem] items-center gap-2 rounded-[0.625rem] bg-fill px-2.5 text-label text-ink-secondary">
          <Icon path={HOME_ICONS.search} className="h-4 w-4 shrink-0" />
          <input aria-label="Search terrains" placeholder={tr('Search')} value={query} onChange={(e) => setQuery(e.target.value)} className="w-32 select-text bg-transparent text-ink outline-none placeholder:text-ink-tertiary" />
        </label>
        <button
          type="button"
          title="A terrain's file (.gfs), or a survey or parcel (DXF, DWG, CSV, KML, GeoJSON, Shapefile) imported as Site › Import does"
          onClick={() => fileInput.current?.click()}
          className="pressable flex h-[2.125rem] items-center gap-2 whitespace-nowrap rounded-[0.625rem] bg-ink px-3 text-label font-semibold text-on-ink hover:opacity-90"
        >
          <Icon name="import" className="h-4 w-4" />
          {tr("Upload…")}
        </button>
        <input ref={fileInput} type="file" accept={`.${TERRAIN_EXTENSION},${SITE_FILE_ACCEPT}`} aria-label="Upload terrain" className="hidden" onChange={onFile} />
      </div>
      <p className="text-caption text-ink-tertiary">
        GFit’s terrains come with the app, for the whole team; Mine are saved in this browser. A terrain is a site without its rules: its boundary, access, ground and where it
        is. New project here starts a project on one.
      </p>
      {gfit === null && !all.length ? (
        <p className="text-body text-ink-secondary">{tr("Reading GFit’s terrains…")}</p>
      ) : shown.length ? (
        <ul aria-label="Terrains" className="grid min-h-0 grid-cols-[repeat(auto-fill,minmax(12rem,1fr))] content-start gap-3 overflow-y-auto">
          {shown.map((e) => (
            <TerrainTile key={e.terrain.id} entry={e} />
          ))}
        </ul>
      ) : (
        <p className="text-body text-ink-secondary">{all.length ? 'No terrain matches: try another search.' : 'No terrain yet: Upload… brings one.'}</p>
      )}
    </section>
  )
}

function TerrainTile({ entry: e }: { entry: LibraryTerrainEntry }) {
  const t = e.terrain
  const svg = useMemo(() => terrainThumb(t.site), [t])
  const small = 'pressable flex h-7 items-center rounded-control px-2 text-label text-ink-secondary hover:bg-hover hover:text-ink'
  return (
    <li data-library-terrain={t.id} className="flex flex-col gap-2 rounded-[0.75rem] border border-separator p-2.5">
      <div aria-hidden className="h-28 rounded-[0.5rem] bg-canvas p-1.5 [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={svg ? { __html: svg } : undefined} />
      <div className="flex min-w-0 flex-col">
        <span className="truncate text-label font-semibold text-ink">{t.name}</span>
        <span className="truncate text-caption text-ink-tertiary">
          {terrainFacts(t)} · {SHELF[e.shelf]}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <button
          type="button"
          aria-label={`New project on ${t.name}`}
          title="A new project on this terrain: its type next"
          onClick={() => openCreateNew('project', t.id)}
          className="pressable flex h-7 items-center rounded-control bg-fill px-2.5 text-label text-ink hover:bg-hover"
        >
          {tr("New project here")}
        </button>
        <button
          type="button"
          aria-label={`Download ${t.name} as .gfs`}
          title="Its file (.gfs): all of it, to share it or upload it again"
          onClick={() => download(new Blob([writeTerrainFile(t)], { type: 'application/json' }), terrainFileName(t))}
          className={small}
        >
          .gfs
        </button>
        <button
          type="button"
          aria-label={`Download ${t.name} as DXF`}
          title="For CAD: the boundary, the contours at their heights and the points, on GFIT- layers"
          onClick={() => download(new Blob([terrainDxf(t)], { type: 'application/dxf' }), terrainFileName(t, 'dxf'))}
          className={small}
        >
          DXF
        </button>
        {e.shelf === 'browser' && (
          <button
            type="button"
            aria-label={`Remove ${t.name}`}
            title="Forget this terrain in this browser (projects on it keep their site)"
            onClick={() => useToast.getState().confirm(`Remove “${t.name}” from this browser’s terrains? Projects on it keep their site.`, () => removeTerrain(t.id))}
            className={small}
          >
            {tr("Remove")}
          </button>
        )}
      </div>
    </li>
  )
}
