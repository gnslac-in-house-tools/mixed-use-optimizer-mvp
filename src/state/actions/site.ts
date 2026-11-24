// Site actions: pure, like the mass actions. Its rules; (Phase 5, Decision "Site files") its boundary, the file it
// came from, its georeference and the map under the plan; and (Phase E, Decision "Terrain") the ground.
import type { Contour, Gate, Geo, Parcel, Point, Project, SiteDrawing, SiteFrame, SiteMap, SiteRules, Terrain, TerrainSmoothing } from '../../model/schema.ts'
import { contourToPolygon, normalize } from '../../engine/geom/contour.ts'
import { anchorGeo, normalizeDegrees, placedGeo, type LatLon } from '../../engine/geo/local.ts'
import { siteCenter } from '../../engine/geo/site.ts'
import { refitGrids } from '../../engine/grid/index.ts'
import { withEdge } from '../../modules/terrain/engine/index.ts'
import { addExistingRoad } from './circulation.ts'

export function updateSiteRules(p: Project, patch: Partial<SiteRules>): Project {
  const rules = { ...p.site.rules, ...patch }
  const same = (Object.keys(rules) as (keyof SiteRules)[]).every((k) => rules[k] === p.site.rules[k])
  return same ? p : { ...p, site: { ...p.site, rules } }
}

/**
 * The site's boundary replaced (an import, a drawing; null: none), with the name of what it came from. What was
 * placed on the old one goes with it (Decision "Site step layout"): the gates on it (`t`, a position along its perimeter), the site's and each
 * option's own. The gates on a street or an existing street (`on`) stay: they stand on their street, not on the boundary, and the existing roads stay
 * where they are. The structural grid, the project's and each option's own, is fitted to a new site (Decision "Grid always": along its main axis,
 * from its buildable area's corner; its bays and modules kept); with none, it stays where it was.
 */
export function setBoundary(p: Project, boundary: Contour | null, source?: string): Project {
  const { gates, source: _s, ...site } = p.site
  const onStreets = (list: Gate[] | undefined) => (list ?? []).filter((g) => g.on)
  const next = { ...site, ...(onStreets(gates).length ? { gates: onStreets(gates) } : {}), boundary: boundary ? normalize(boundary) : null, ...(source ? { source } : {}) }
  const options = p.options.map((o) => {
    if (!o.gates) return o
    const { gates: own, ...rest } = o
    // an option's own copy that held nothing but gates on the boundary has none left: it uses the site's again, unless the site keeps some of its own
    // (those on existing streets), which the option never had: it keeps its own, empty list (review R3)
    return onStreets(own).length || onStreets(gates).length ? { ...rest, gates: onStreets(own) } : rest
  })
  const q = { ...p, site: next, options }
  return boundary ? refitGrids(q) : q
}

/**
 * A site imported from a file (Phase 5.2, *Import*): its boundary and the file's name, as one undo step, and the
 * georeference the file brings (a geolocated file, a DXF in UTM); a DXF in local coordinates brings none, and the
 * site keeps its own, if any (*Place* then sets it right).
 */
export function importSite(p: Project, boundary: Contour, source: string, geo: Geo | null): Project {
  // a geolocated file lays the plan out round its own middle: the frame of an earlier drawing no longer holds
  const b = setBoundary(p, boundary, source)
  const { frame: _f, ...site } = b.site
  const q = { ...b, site }
  return geo ? setGeo(q, geo) : q
}

/**
 * A surveyed file imported (Decision "Site file survey"), one undo step: the boundary picked, with the frame it was
 * read in and the georeference a UTM file brings, the ground it holds (its contours and points) and its roads layers'
 * centrelines, added to the site's existing roads at the standards' road width (Decision "Survey points and roads").
 * What the file does not bring stays as it was. Its Reference layers and its parcels (Decision "Drawing layers"):
 * a new boundary drops the old site's drawings and parcels (another frame); a drawing, and the parcels, of the same
 * file replace their own; the others stay.
 */
export function importSiteFile(
  p: Project,
  f: {
    name: string
    boundary?: Contour
    frame?: SiteFrame | null
    geo?: Geo | null
    terrain?: Terrain
    roads?: Point[][]
    drawing?: SiteDrawing
    parcels?: Parcel[]
  },
): Project {
  let q = p
  if (f.boundary) {
    q = setBoundary(q, f.boundary, f.name)
    const { frame: _f, drawings: _d, parcels: _p, ...site } = q.site
    q = { ...q, site: f.frame ? { ...site, frame: f.frame } : site }
    if (f.geo) q = setGeo(q, f.geo)
  }
  if (f.terrain) q = setTerrain(q, f.terrain)
  // the ground carried to the boundary where the survey stops short of it (Decision "Ground to the boundary")
  const t = q.site.terrain
  if (t && q.site.boundary && (f.terrain || f.boundary)) q = { ...q, site: { ...q.site, terrain: withEdge(t, contourToPolygon(q.site.boundary)) } }
  for (const road of f.roads ?? []) q = addExistingRoad(q, road)?.project ?? q
  if (f.drawing) q = { ...q, site: { ...q.site, drawings: [...(q.site.drawings ?? []).filter((d) => d.file !== f.drawing!.file), f.drawing] } }
  if (f.parcels) q = { ...q, site: { ...q.site, parcels: [...(q.site.parcels ?? []).filter((x) => x.file !== f.name), ...f.parcels] } }
  return q
}

/** A reference drawing taken out of the site (Layers: the file's menu or Properties), with the parcels it brought. */
export function removeSiteDrawing(p: Project, file: string): Project {
  const drawings = (p.site.drawings ?? []).filter((d) => d.file !== file)
  const parcels = (p.site.parcels ?? []).filter((x) => x.file !== file)
  if (drawings.length === (p.site.drawings ?? []).length && parcels.length === (p.site.parcels ?? []).length) return p
  const { drawings: _d, parcels: _p, ...site } = p.site
  return { ...p, site: { ...site, ...(drawings.length ? { drawings } : {}), ...(parcels.length ? { parcels } : {}) } }
}

/** The georeference set, or removed (null), and the map with it: it cannot sit anywhere without one. */
export function setGeo(p: Project, geo: Geo | null): Project {
  const { geo: _g, map: _m, ...site } = p.site
  if (!geo) return p.site.geo || p.site.map ? { ...p, site } : p
  return { ...p, site: { ...p.site, geo: { ...geo, north: normalizeDegrees(geo.north) } } }
}

/** Lat, lon or north changed by hand; nothing without a georeference. */
export function updateGeo(p: Project, patch: Partial<Geo>): Project {
  if (!p.site.geo) return p
  const geo = { ...p.site.geo, ...patch }
  if (geo.lat === p.site.geo.lat && geo.lon === p.site.geo.lon && geo.north === p.site.geo.north) return p
  return setGeo(p, geo)
}

/** A place on the Earth (a pasted link, lat / lon) put at the site's centre; north stays (0 when there was none). */
export function locateSite(p: Project, ll: LatLon): Project {
  return setGeo(p, anchorGeo(ll, siteCenter(p), p.site.geo?.north ?? 0))
}

/** *Place*: the Earth under the plan moved by `d` (m) and turned by `degrees` round `about`; the plan stays. */
export function placeSite(p: Project, d: Point, degrees: number, about: Point): Project {
  if (!p.site.geo) return p
  return setGeo(p, placedGeo(p.site.geo, d, degrees, about))
}

/** The map under the plan, captured (it needs the georeference), or removed (null). */
export function setMap(p: Project, map: SiteMap | null): Project {
  if (!map) {
    if (!p.site.map) return p
    const { map: _m, ...site } = p.site
    return { ...p, site }
  }
  return p.site.geo ? { ...p, site: { ...p.site, map } } : p
}

/** The ground (Phase E, Decision "Terrain"): imported, in place of what there was, or removed (null). */
export function setTerrain(p: Project, terrain: Terrain | null): Project {
  if (!terrain) {
    if (!p.site.terrain) return p
    const { terrain: _t, ...site } = p.site
    return { ...p, site }
  }
  return { ...p, site: { ...p.site, terrain } }
}

/**
 * The Heights tool (Decision "Terrain layout"): a contour's height given, over its file's, or taken back (null); the
 * contours drawn flat are counted again from the heights given (modules/terrain/engine/heights.ts).
 */
export function setContourHeight(p: Project, contour: number, z: number | null): Project {
  const t = p.site.terrain
  if (!t || contour < 0 || contour >= t.contours.length) return p
  const before = t.given ?? []
  const old = before.find((g) => g.contour === contour)
  if (z === null ? !old : old?.z === z) return p
  const others = before.filter((g) => g.contour !== contour)
  const given = z === null ? others : [...others, { contour, z }]
  const { given: _g, ...rest } = t
  return setTerrain(p, given.length ? { ...rest, given } : rest)
}

/** How the ground is smoothed (Decision "Terrain smoothing"): `surface`, the default, is kept as absent. */
export function setTerrainSmoothing(p: Project, smoothing: TerrainSmoothing): Project {
  const t = p.site.terrain
  if (!t || (t.smoothing ?? 'surface') === smoothing) return p
  const { smoothing: _s, ...rest } = t
  return setTerrain(p, smoothing === 'surface' ? rest : { ...rest, smoothing })
}
