// The map under the plan, as the viewer sees it (Phase 5.4; port of Practiko's `vistas/mapa/opacidad.ts`
// and the capture of `PanelMapa.tsx`): how strongly it shows is the viewer's preference, not the project's, kept in
// localStorage (with try/catch: there may be no storage); whether it shows at all is the layer store's key `MAP`
// (views/layers/layerView.ts, per project); and the capture in progress, with its error. Capturing reads the site's
// georeference: round the site's centre, as far as the site reaches.
import { create } from 'zustand'
import type { MapSource } from '../../../model/schema.ts'
import { toLatLon, type LatLon } from '../../../engine/geo/local.ts'
import { siteCenter, siteReach } from '../../../engine/geo/site.ts'
import { CAPTURE_ERROR, captureMap, captureReach } from '../../../io/map/tiles.ts'
import { actions } from '../../../state/actions/index.ts'
import { useApp } from '../../../state/store.ts'
import { MAP } from '../../layers/keys.ts'
import { isHidden, toggleLayer, useLayerView } from '../../layers/layerView.ts'

export const OPACITY_KEY = 'gfit.map.opacity'
export const DEFAULT_OPACITY = 0.8
export const MIN_OPACITY = 0.1

const clamp = (v: number) => Math.min(1, Math.max(MIN_OPACITY, v))

function read<T>(key: string, parse: (v: string) => T | null, fallback: T): T {
  try {
    const v = localStorage.getItem(key)
    return v === null ? fallback : (parse(v) ?? fallback)
  } catch {
    return fallback
  }
}
function write(key: string, v: string) {
  try {
    localStorage.setItem(key, v)
  } catch {
    // it stays in memory
  }
}

interface MapView {
  opacity: number
  /** A capture in progress, and the last one's error. */
  busy: boolean
  error: string | null
  setOpacity(v: number): void
}

export const useMapView = create<MapView>()((set) => ({
  opacity: read(OPACITY_KEY, (v) => (Number.isFinite(Number(v)) ? clamp(Number(v)) : null), DEFAULT_OPACITY),
  busy: false,
  error: null,
  setOpacity(v) {
    const opacity = clamp(v)
    set({ opacity })
    write(OPACITY_KEY, String(opacity))
  },
}))

/** The site centre's latitude and longitude; null without a georeference. */
export function siteLatLon(): LatLon | null {
  const p = useApp.getState().project
  return p.site.geo ? toLatLon(p.site.geo, siteCenter(p)) : null
}

/**
 * Captures the map round the site (its georeference's), from `source` (the current map's when absent; else the
 * street map), and puts it under the plan as one undo step. A failure only shows as the error. A capture that comes
 * after another project was opened is dropped: it is not that one's.
 */
export async function captureSiteMap(source?: MapSource): Promise<void> {
  const start = useApp.getState().project
  const center = siteLatLon()
  if (!center || useMapView.getState().busy) return
  const { radius, zoom } = captureReach(siteReach(start))
  useMapView.setState({ busy: true, error: null })
  try {
    const map = await captureMap(center.lat, center.lon, source ?? start.site.map?.source ?? 'street', radius, zoom)
    if (useApp.getState().project.id !== start.id) return
    useApp.getState().apply((p) => actions.setMap(p, map))
    // a map just captured shows, even if the viewer had turned another one off
    useLayerView.getState().setHidden([MAP], false)
  } catch (e) {
    useMapView.setState({ error: e instanceof Error && e.message ? e.message : CAPTURE_ERROR })
  } finally {
    useMapView.setState({ busy: false })
  }
}

/** Why the Map overlay cannot be used now, or null: no map under the plan and no georeference to capture one round, or
 *  a capture in progress. */
export function mapRefusal(): string | null {
  const { project } = useApp.getState()
  if (project.site.map) return null
  if (!project.site.geo) return 'The map needs the site’s location'
  return useMapView.getState().busy ? 'Capturing the map…' : null
}

/** *Map*, Show's chip and the View menu's row: the map under the plan on or off (the viewer's); without one yet, it
 *  captures it round the located site. */
export function toggleMap(): void {
  if (useApp.getState().project.site.map) toggleLayer(MAP)
  else void captureSiteMap()
}

/** Is the map under the plan on now (the project has one, and the viewer has it on)? */
export const mapShown = (): boolean => !!useApp.getState().project.site.map && !isHidden(MAP)
