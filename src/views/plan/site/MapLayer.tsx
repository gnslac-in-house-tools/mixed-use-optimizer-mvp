// The map under the plan (Phase 5.4; port of Practiko's `CapaMapa.tsx`): the captured image at its size in metres,
// where the georeference puts its centre, turned by its north, under everything else, at the viewer's opacity. Drawn
// in every step that shows the plan, as long as the viewer has it on. The world is drawn as (x, −y): a turn
// counter-clockwise on the plan is a negative SVG rotation, and the image, north up, needs no flip.
import { memo } from 'react'
import { mapOnPlan } from '../../../engine/geo/local.ts'
import { useApp } from '../../../state/store.ts'
import { MAP } from '../../layers/keys.ts'
import { useHidden } from '../../layers/layerView.ts'
import { useMapView } from './mapView.ts'

export const MapLayer = memo(function MapLayer() {
  const map = useApp((s) => s.project.site.map)
  const geo = useApp((s) => s.project.site.geo)
  const visible = !useHidden(MAP)
  const opacity = useMapView((s) => s.opacity)
  if (!map || !geo || !map.image || !visible) return null
  const { center, rotation, width, height } = mapOnPlan(geo, map)
  return (
    <g data-map-layer="" transform={`translate(${center.x} ${-center.y}) rotate(${-rotation})`} opacity={opacity} pointerEvents="none">
      <image href={map.image} x={-width / 2} y={-height / 2} width={width} height={height} preserveAspectRatio="none" />
    </g>
  )
})

/** Is the map on the plan now (for what is drawn over it)? */
export function useMapShown(): boolean {
  const has = useApp((s) => !!s.project.site.map && !!s.project.site.geo)
  const visible = !useHidden(MAP)
  return has && visible
}

/** The tiles' attribution, always shown with the map (bottom left of the plan), as OSM and Esri ask. */
export function MapAttribution() {
  const attribution = useApp((s) => s.project.site.map?.attribution)
  const shown = useMapShown()
  if (!attribution || !shown) return null
  return (
    <p data-map-attribution="" className="pointer-events-none absolute bottom-1.5 left-2 z-[1] max-w-[calc(100%-1rem)] rounded-pill bg-[var(--glass-bg-solid)] px-2 py-0.5 text-caption text-ink-secondary">
      {attribution}
    </p>
  )
}
