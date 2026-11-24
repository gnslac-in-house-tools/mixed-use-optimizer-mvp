// The Location section, in Properties of the Site, Boundary, Buildable area and Map rows of Layers (Phase AS.3; it was the Site tab's
// first section: Decision "Site step layout"; Phase 5.4, port of Practiko's `PanelMapa.tsx`):
// the file the boundary came from; where the site is on the Earth (a pasted Google Maps link or "lat, lon" put at the
// site's centre, then the map is captured round it; the centre's lat / lon and north typed); and the map under the
// plan: its source (Street · Satellite: changing it captures it again), the viewer's opacity, capture again, remove.
// The map needs the internet only to be captured: the image is kept in the project. Shown open, with its title.
import { useState } from 'react'
import type { MapSource } from '../../model/schema.ts'
import { isShortLink, latLonFromLink } from '../../engine/geo/link.ts'
import { toLatLon } from '../../engine/geo/local.ts'
import { siteCenter } from '../../engine/geo/site.ts'
import { actions } from '../../state/actions/index.ts'
import { useApp } from '../../state/store.ts'
import { Button, NumberField } from '../controls/fields.tsx'
import { Segmented } from '../controls/Segmented.tsx'
import { Note } from '../layout/Note.tsx'
import { captureSiteMap, useMapView } from '../plan/site/mapView.ts'

export const NO_COORDINATES = 'No coordinates found: paste a Google Maps link with @lat,lon, or type lat, lon.'
export const SHORT_LINK = 'Short links (maps.app.goo.gl) carry no coordinates: open it in the browser and copy the long link from its address bar, or type lat, lon.'

const SOURCES: { key: MapSource; label: string; title: string }[] = [
  { key: 'street', label: 'Street', title: 'OpenStreetMap' },
  { key: 'satellite', label: 'Satellite', title: 'Esri World Imagery' },
]

export function LocationSection() {
  const project = useApp((s) => s.project)
  const apply = useApp((s) => s.apply)
  const { busy, error, opacity, setOpacity } = useMapView()
  const [text, setText] = useState('')
  const [wrong, setWrong] = useState<string | null>(null)
  const [source, setSource] = useState<MapSource>('street')
  const { geo, map } = project.site
  const center = siteCenter(project)
  const here = geo ? toLatLon(geo, center) : null

  const locate = () => {
    const ll = latLonFromLink(text)
    if (!ll) return setWrong(isShortLink(text) ? SHORT_LINK : NO_COORDINATES)
    setWrong(null)
    setText('')
    apply((p) => actions.locateSite(p, ll))
    // a new place needs its own map
    void captureSiteMap(map?.source ?? source)
  }
  const pickSource = (k: MapSource) => {
    setSource(k)
    if (map && k !== map.source) void captureSiteMap(k)
  }

  return (
    <section aria-label="Location" className="flex flex-col gap-2">
      <h2 className="min-w-0 truncate text-label text-ink-secondary">Location</h2>
      <Note>{project.site.source ? `The boundary came from ${project.site.source}.` : 'Import the boundary from a file, or draw it.'}</Note>
      <div className="flex items-center gap-1.5">
        <input
          type="text"
          aria-label="Google Maps link or lat, lon"
          placeholder="Paste a Google Maps link or lat, lon"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && text.trim()) locate()
          }}
          className="h-row min-w-0 flex-1 select-text rounded-control border border-separator bg-panel-sunken px-2 text-body text-ink outline-none placeholder:text-ink-tertiary focus:border-ink"
        />
        <Button title="Put this place at the site's centre, and capture the map round it" disabled={!text.trim() || busy} onClick={locate}>
          Locate
        </Button>
      </div>
      {wrong && (
        <p role="alert" className="select-text text-label text-ink">
          {wrong}
        </p>
      )}
      {here && geo && (
        <>
          <NumberField label="Latitude" unit="°" decimals={6} min={-90} max={90} value={here.lat} onCommit={(v) => apply((p) => actions.locateSite(p, { lat: v, lon: here.lon }))} />
          <NumberField label="Longitude" unit="°" decimals={6} min={-180} max={180} value={here.lon} onCommit={(v) => apply((p) => actions.locateSite(p, { lat: here.lat, lon: v }))} />
          {/* turned round the site's centre, so the centre stays where it is on the Earth */}
          <NumberField label="North" unit="°" decimals={1} value={geo.north} onCommit={(v) => apply((p) => actions.placeSite(p, { x: 0, y: 0 }, v - geo.north, center))} />
        </>
      )}
      <div className="flex items-center justify-between gap-3">
        <span className="text-label text-ink-secondary">Map</span>
        <Segmented kind="toggle" label="Map source" options={SOURCES} value={map?.source ?? source} onChange={pickSource} />
      </div>
      <label className="flex items-center justify-between gap-3">
        <span className="text-label text-ink-secondary">Opacity</span>
        <span className="flex items-center gap-1.5">
          <input
            type="range"
            aria-label="Map opacity"
            min={10}
            max={100}
            step={5}
            value={Math.round(opacity * 100)}
            onChange={(e) => setOpacity(Number(e.target.value) / 100)}
            className="w-[7rem] accent-[var(--ink)]"
          />
          <span className="w-[2.5rem] text-right text-caption tabular-nums text-ink-tertiary">{Math.round(opacity * 100)} %</span>
        </span>
      </label>
      <div className="flex flex-wrap gap-1.5">
        <Button title={geo ? 'Capture the map round the site' : 'Locate the site first'} disabled={!geo || busy} onClick={() => void captureSiteMap(map?.source ?? source)}>
          {busy ? 'Capturing…' : map ? 'Capture again' : 'Capture map'}
        </Button>
        {map && (
          <Button title="Take the map away from under the plan" disabled={busy} onClick={() => apply((p) => actions.setMap(p, null))}>
            Remove map
          </Button>
        )}
      </div>
      {error && (
        <p role="alert" className="select-text text-label text-ink">
          {error}
        </p>
      )}
      <Note>The map needs the internet only to be captured: the image is kept in the project.</Note>
    </section>
  )
}
