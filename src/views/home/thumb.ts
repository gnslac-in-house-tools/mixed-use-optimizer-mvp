// A project's small plan for Home's cards (Decision "Home"): the site and the footprints of the option in view, as
// SVG markup drawn when the project is kept (io/library.ts stores it), so Home lists projects without reading them.
// Colours are the tokens' (styles/tokens.css), never raw values.
import type { Id, Point, Project, TerrainSite } from '../../model/schema.ts'
import { massesOfOption, optionOf } from '../../engine/buildings.ts'
import { contourToPolygon } from '../../engine/geom/contour.ts'
import { footprintPolygon } from '../../engine/geom/footprint.ts'
import { bounds } from '../../engine/geom/polygon.ts'

const SIZE = 100

/** The plan of `option` (the site, its footprints) fitted in a 100 × 100 box; undefined when there is no site yet. */
export function projectThumb(p: Project, option: Id): string | undefined {
  if (!p.site.boundary) return undefined
  const site = contourToPolygon(p.site.boundary)
  const { minX: x0, maxX: x1, minY: y0, maxY: y1 } = bounds(site)
  const scale = (SIZE * 0.9) / Math.max(x1 - x0, y1 - y0, 1)
  const dx = (SIZE - (x1 - x0) * scale) / 2
  const dy = (SIZE - (y1 - y0) * scale) / 2
  // the plan's y goes up, the SVG's down
  const path = (poly: Point[]) =>
    `M${poly.map((v) => `${((v.x - x0) * scale + dx).toFixed(1)} ${((y1 - v.y) * scale + dy).toFixed(1)}`).join('L')}Z`
  const masses = massesOfOption(p, optionOf(p, option)).map((m) => path(footprintPolygon(m.footprint)))
  return (
    `<svg viewBox="0 0 ${SIZE} ${SIZE}" xmlns="http://www.w3.org/2000/svg">` +
    `<path d="${path(site)}" style="fill:var(--panel-sunken);stroke:var(--ink-tertiary);stroke-width:0.6;stroke-dasharray:2 1.5"/>` +
    (masses.length ? `<path d="${masses.join('')}" style="fill:var(--ink-segment)"/>` : '') +
    `</svg>`
  )
}

/** A terrain's small plan for its card (Decision "Home libraries"): its boundary and contours fitted in a 100 × 100
 *  box (to the contours when it has no boundary); undefined when it has neither. */
export function terrainThumb(site: TerrainSite): string | undefined {
  const outline = site.boundary ? contourToPolygon(site.boundary) : null
  const lines = (site.terrain?.contours ?? []).map((c) => (c.closed ? [...c.points, c.points[0]] : c.points))
  const all = outline ?? lines.flat()
  if (all.length < 2) return undefined
  // in a loop: a survey's corners spread into Math.min would pass the engine's limit on arguments
  const { minX: x0, maxX: x1, minY: y0, maxY: y1 } = bounds(all)
  const scale = (SIZE * 0.9) / Math.max(x1 - x0, y1 - y0, 1)
  const dx = (SIZE - (x1 - x0) * scale) / 2
  const dy = (SIZE - (y1 - y0) * scale) / 2
  const xy = (v: Point) => `${((v.x - x0) * scale + dx).toFixed(1)} ${((y1 - v.y) * scale + dy).toFixed(1)}`
  // a survey's thousands of contours: every one, but each thinned to at most 40 corners
  const thin = (poly: Point[]) => (poly.length <= 40 ? poly : poly.filter((_, i) => i % Math.ceil(poly.length / 40) === 0 || i === poly.length - 1))
  const contours = lines.map((l) => `M${thin(l).map(xy).join('L')}`).join('')
  return (
    `<svg viewBox="0 0 ${SIZE} ${SIZE}" xmlns="http://www.w3.org/2000/svg">` +
    (outline ? `<path d="M${outline.map(xy).join('L')}Z" style="fill:var(--panel-sunken)"/>` : '') +
    (contours ? `<path d="${contours}" style="fill:none;stroke:var(--earth);stroke-width:0.35;opacity:0.7"/>` : '') +
    (outline ? `<path d="M${outline.map(xy).join('L')}Z" style="fill:none;stroke:var(--ink-tertiary);stroke-width:0.6;stroke-dasharray:2 1.5"/>` : '') +
    `</svg>`
  )
}
