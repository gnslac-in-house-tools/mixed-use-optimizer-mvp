// What a site file holds (Decision "Site files"), by its extension: a drawing (DXF, or a DWG read as one: dwg.ts; in
// its units), a table of points
// of the ground (CSV, or a surveyor's .txt; Decision "Site file survey") or a geolocated file's shapes (lat / lon: KML,
// KMZ, GeoJSON, a zipped Shapefile). The Site step's *Import* reads one; a drawing and a table are surveyed
// (io/site/survey.ts), a geolocated file's shapes placed (io/site/place.ts).
import { readCsv, type CsvTable } from './csv.ts'
import { readDwg } from './dwg.ts'
import { readDxf, type DxfDrawing } from './dxf.ts'
import { readGeoJson, readShapefile } from './geojson.ts'
import { readKml, readKmz } from './kml.ts'
import type { GeoShape } from './place.ts'

export type SiteFile =
  | { kind: 'drawing'; name: string; drawing: DxfDrawing }
  | { kind: 'table'; name: string; table: CsvTable }
  | { kind: 'geo'; name: string; shapes: GeoShape[]; warnings: string[] }

/** The extensions *Import* takes, for the file picker. */
export const SITE_FILE_ACCEPT = '.dxf,.dwg,.csv,.txt,.kml,.kmz,.geojson,.json,.zip'

const extension = (name: string) => name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? ''

/** Is it a file *Import* reads (a drop on the app sends it there)? */
export const isSiteFile = (name: string) => SITE_FILE_ACCEPT.split(',').includes(`.${extension(name)}`)

/** A file's contents as *Import* reads them; throws with words a designer can read. */
export async function readSiteFile(name: string, bytes: ArrayBuffer): Promise<SiteFile> {
  const ext = extension(name)
  if (ext === 'dxf') return { kind: 'drawing', name, drawing: readDxf(new TextDecoder().decode(bytes)) }
  if (ext === 'dwg') return { kind: 'drawing', name, drawing: await readDwg(bytes) }
  if (ext === 'csv' || ext === 'txt') return { kind: 'table', name, table: readCsv(new TextDecoder().decode(bytes)) }
  if (ext === 'kml') return { kind: 'geo', name, ...readKml(new TextDecoder().decode(bytes)) }
  if (ext === 'kmz') return { kind: 'geo', name, ...readKmz(new Uint8Array(bytes)) }
  if (ext === 'geojson' || ext === 'json') return { kind: 'geo', name, ...readGeoJson(new TextDecoder().decode(bytes)) }
  if (ext === 'zip') return { kind: 'geo', name, ...(await readShapefile(new Uint8Array(bytes))) }
  throw new Error(`GFit does not read .${ext || '?'} files for a site (it reads ${SITE_FILE_ACCEPT.split(',').join(', ')})`)
}
